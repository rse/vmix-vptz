/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

/*  external requirements  */
import * as vMixAPI from "node-vmix"
import vMixUtils    from "vmix-js-utils"
import * as XPath   from "xpath-ts2"
import EventEmitter from "eventemitter2"
import clone        from "clone"

/*  internal requirements  */
import Argv         from "./app-argv"
import Log          from "./app-log"
import Cfg          from "./app-cfg"
import State        from "./app-state"
import type { PTZ, VPTZ, XYZ } from "./app-state"
import { StateDefault } from "../common/app-state"

/*  define our vMix input type  */
type vMixInput = {
    num:   number,
    name:  string,
    type:  string,
    xyz:   XYZ
}

/*  define our vMix command type  */
type vMixCommand = {
    Function: string,
    Input?:   string,
    Value?:   string
}

/*  define vMix command and XYZ modification operation  */
type CMD = { f: string, v?: string }
type MOD = (xyz: XYZ) => void

/*  asynchronous delay  */
const AsyncDelay = (ms: number) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => { resolve(true) }, ms)
    })
}

/*  asynchronous loop utility  */
const AsyncLoop = (step: () => void, finish: (cancelled: boolean) => void, _options = {}) => {
    const options = { duration: 1000, fps: 60, ..._options }
    const timeSlice = 1000 / options.fps
    let   timeSteps = options.duration / timeSlice
    let cancelled = false
    const cancel = () => { cancelled = true }
    const promise = new Promise((resolve, reject) => {
        (async () => {
            /* eslint no-unmodified-loop-condition: off */
            while (timeSteps > 0 && !cancelled) {
                timeSteps = timeSteps - 1
                await step()
                await AsyncDelay(timeSlice)
            }
            resolve(!cancelled)
        })()
    })
    promise.finally(() => {
        finish(cancelled)
    })
    return { promise, cancel }
}

/*  the vMix management class  */
export default class VMix extends EventEmitter {
    /*  internals  */
    private vmix1: vMixAPI.ConnectionTCP | null = null
    private vmix2: vMixAPI.ConnectionTCP | null = null
    private inputs = new Map<string, vMixInput>()
    private tally = {
        preview: [] as Array<string>,
        program: [] as Array<string>
    }
    private active = {
        preview: { "A": "", "B": "" },
        program: { "A": "", "B": "" }
    }
    private cam2ptz  = new Map<string, string>()
    private vptz2xyz = new Map<string, XYZ>()

    /*  foreigns (injected)  */
    constructor (
        private argv:   Argv,
        private log:    Log,
        private cfg:    Cfg,
        private state:  State
    ) {
        super()
    }

    /*  initialize instance  */
    async init () {
        /*  initialize internal state  */
        for (const cam of this.cfg.idCAMs) {
            const ptz = await this.state.getPTZ(cam)
            this.cam2ptz.set(cam, ptz)
        }

        /*  establish connection to vMix instance(s)  */
        const [ hostA, portA ] = this.argv.vmix1Addr.split(":")
        const [ hostB, portB ] = this.argv.vmix2Addr.split(":")
        this.log.log(2, `vMix: establish connection to vMix #1 at "${this.argv.vmix1Addr}"`)
        this.vmix1 = new vMixAPI.ConnectionTCP(hostA,
            { port: parseInt(portA), debug: false, autoReconnect: true })
        if (hostA !== hostB || portA !== portB) {
            this.log.log(2, `vMix: establish connection to vMix #2 at "${this.argv.vmix2Addr}"`)
            this.vmix2 = new vMixAPI.ConnectionTCP(hostB,
                { port: parseInt(portB), debug: false, autoReconnect: true })
        }

        /*  react on standard socket error events  */
        this.vmix1.on("error", (error: Error) => {
            this.log.log(1, `vMix: connection error on vMix #1: ${error.toString()}`)
        })
        if (this.vmix2 !== null) {
            this.vmix2.on("error", (error: Error) => {
                this.log.log(1, `vMix: connection error on vMix #2: ${error.toString()}`)
            })
        }

        /*  react on standard socket connect events  */
        let initialized = 0
        const onConnect = () => {
            initialized++
            if ((!this.vmix2 && initialized === 1) || (this.vmix2 && initialized === 2)) {
                initialized = 0
                this.restoreState()
            }
        }
        this.vmix1.on("connect", async () => {
            this.log.log(2, "vMix: connection established to vMix #1")
            await AsyncDelay(100)
            this.vmixCommand(this.vmix1, "XML")
            this.vmixCommand(this.vmix1, "SUBSCRIBE TALLY")
            onConnect()
        })
        if (this.vmix2 !== null) {
            this.vmix2.on("connect", async () => {
                this.log.log(2, "vMix: connection established to vMix #2")
                await AsyncDelay(100)
                this.vmixCommand(this.vmix2, "XML")
                this.vmixCommand(this.vmix2, "SUBSCRIBE TALLY")
                onConnect()
            })
        }

        /*  react on custom TALLY events  */
        const onTallyStatus = (instance: "A" | "B", data: string) => {
            const tally = vMixUtils.TcpTally.extractSummary(data)
            this.tally.preview = tally.preview.map((n) => `${instance}:${n}`)
            this.tally.program = tally.program.map((n) => `${instance}:${n}`)
            this.emit("tally", this.tally)
            this.vmixCommand(this.vmix1, "XML")
            if (this.vmix2 !== null)
                this.vmixCommand(this.vmix2, "XML")
        }
        this.vmix1.on("tally", (data: string) => {
            this.log.log(2, "vMix: received TALLY status on vMix #1")
            onTallyStatus("A", data)
        })
        if (this.vmix2 !== null) {
            this.vmix2.on("tally", (data: string) => {
                this.log.log(2, "vMix: received TALLY status on vMix #2")
                onTallyStatus("B", data)
            })
        }

        /*  react on custom XML events  */
        const onXmlStatus = (instance: "A" | "B", xml: string) => {
            /*  parse XML and extract inputs  */
            const doc      = vMixUtils.XmlApi.DataParser.parse(xml)
            const inputsEl = vMixUtils.XmlApi.Inputs.extractInputsFromXML(doc)
            const inputs   = vMixUtils.XmlApi.Inputs.map(inputsEl)

            /*  remove previous inputs of instance  */
            const remove = [] as Array<string>
            for (const key of this.inputs.keys())
                if (key.substring(0, 1) === instance)
                    remove.push(key)
            for (const key of remove)
                this.inputs.delete(key)

            /*  store current inputs of instance  */
            for (const input of inputs) {
                const item = {
                    num:  input.number,
                    name: input.title,
                    type: input.type,
                    xyz:  { x: 0, y: 0, zoom: 1.0 }
                } as vMixInput
                if (input.type === "VirtualSet") {
                    item.xyz.x    = ((input as any).currentPosition?.panX  ?? 0.0) / 2
                    item.xyz.y    = ((input as any).currentPosition?.panY  ?? 0.0) / 2
                    item.xyz.zoom = ((input as any).currentPosition?.zoomX ?? 1.0)
                }
                this.inputs.set(`${instance}:${item.num}`, item)
            }

            /*  determine inputs currently in program and preview  */
            let n = XPath.select1("/vmix/active/text()", doc).toString()
            this.active.program[instance] = this.inputs.get(`${instance}:${n}`)?.name ?? ""
            n = XPath.select1("/vmix/preview/text()", doc).toString()
            this.active.preview[instance] = this.inputs.get(`${instance}:${n}`)?.name ?? ""

            this.notifyState()
        }
        this.vmix1.on("xml", (xml: string) => {
            this.log.log(2, "vMix: received XML status on vMix #1")
            onXmlStatus("A", xml)
        })
        if (this.vmix2 !== null) {
            this.vmix2.on("xml", (xml: string) => {
                this.log.log(2, "vMix: received XML status on vMix #2")
                onXmlStatus("B", xml)
            })
        }

        /*  react on standard socket close events  */
        this.vmix1.on("close", () => {
            this.log.log(2, "vMix: connection closed to vMix #1")
        })
        if (this.vmix2 !== null) {
            this.vmix2.on("close", () => {
                this.log.log(2, "vMix: connection closed to vMix #2")
            })
        }
    }

    async shutdown () {
        if (this.vmix1 !== null) {
            this.log.log(2, "vMix: shutdown connection to vMix #1")
            await this.vmix1.shutdown()
        }
        if (this.vmix2 !== null) {
            this.log.log(2, "vMix: shutdown connection to vMix #2")
            await this.vmix2.shutdown()
        }
    }

    async getState (cached = false) {
        /*  determine program and preview inputs  */
        const program = this.active.program.B !== "" ? this.active.program.B : this.active.program.A
        const preview = this.active.preview.B !== "" ? this.active.preview.B : this.active.preview.A

        /*  determine camera and VPTZ of program and preview inputs  */
        const programCam  = this.cfg.camOfInputName(program)
        const previewCam  = this.cfg.camOfInputName(preview)
        const programVPTZ = this.cfg.vptzOfInputName(program)
        const previewVPTZ = this.cfg.vptzOfInputName(preview)

        /*  generate state record  */
        const state = StateDefault
        for (const cam of this.cfg.idCAMs) {
            const ptz = this.cam2ptz.get(cam)!
            state[cam].ptz = ptz
            if (cached) {
                for (const vptz of this.cfg.idVPTZs) {
                    const xyz = this.vptz2xyz.get(`${cam}:${vptz}`)
                    state[cam].vptz[vptz].program = (programCam === cam && programVPTZ === vptz)
                    state[cam].vptz[vptz].preview = (previewCam === cam && previewVPTZ === vptz)
                    state[cam].vptz[vptz].x       = xyz?.x    ?? 0
                    state[cam].vptz[vptz].y       = xyz?.y    ?? 0
                    state[cam].vptz[vptz].zoom    = xyz?.zoom ?? 1.0
                }
            }
            else {
                const recs = await this.state.getVPTZAll(cam, ptz)
                for (const rec of recs) {
                    state[cam].vptz[rec.vptz].program = (programCam === cam && programVPTZ === rec.vptz)
                    state[cam].vptz[rec.vptz].preview = (previewCam === cam && previewVPTZ === rec.vptz)
                    state[cam].vptz[rec.vptz].x       = rec.xyz.x
                    state[cam].vptz[rec.vptz].y       = rec.xyz.y
                    state[cam].vptz[rec.vptz].zoom    = rec.xyz.zoom
                }
            }
        }
        /*
        state["2"].vptz["C-C"].preview = true // FIXME: Temporary Hack
        state["3"].vptz["W-C"].program = true // FIXME: Temporary Hack
        */
        return state
    }

    notifyState (cached = false) {
        this.emit("state-change", cached)
    }

    /*  backup state from vMix  */
    async backupState () {
        /*  index all inputs by name  */
        const index = new Map<string, vMixInput>()
        for (const input of this.inputs.values())
            if (input.type === "VirtualSet")
                index.set(input.name, input)

        /*  use a transaction to...  */
        this.state.transaction(async () => {
            /*  ...iterate over all cameras and their current physical PTZ...  */
            for (const cam of this.cfg.idCAMs) {
                const ptz = this.cam2ptz.get(cam)
                if (ptz === undefined)
                    continue
                this.log.log(2, `vMix: backup/receive vMix state of camera "${cam}" and physical PTZ "${ptz}"`)

                /*  iterate over all corresponding virtual PTZ...  */
                for (const vptz of this.cfg.idVPTZs) {
                    const name = this.cfg.inputNameVPTZ(cam, vptz)
                    const input = index.get(name)
                    if (input === undefined)
                        continue

                    /*  ...and persist the current XYZ information  */
                    await this.state.setVPTZ(cam, ptz, vptz, input.xyz)
                }
            }
        })

        this.notifyState()
    }

    /*  restore persisted state to vMix  */
    async restoreState () {
        /*  use a transaction to...  */
        this.state.transaction(async () => {
            /*  ...iterate over all cameras and their current physical PTZ...  */
            for (const cam of this.cfg.idCAMs) {
                const ptz = this.cam2ptz.get(cam)
                if (ptz === undefined)
                    continue
                this.log.log(2, `vMix: restore/send vMix state of camera "${cam}" and physical PTZ "${ptz}"`)

                /*  iterate over all corresponding virtual PTZ...  */
                const cmds = [] as Array<vMixCommand>
                for (const vptz of this.cfg.idVPTZs) {
                    this.log.log(2, `vMix: restore virtual PTZ "${vptz}" of camera "${cam}"`)
                    const xyz = await this.state.getVPTZ(cam, ptz, vptz)
                    this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
                    const input = this.cfg.inputNameVPTZ(cam, vptz)
                    cmds.push({ Function: "SetPanX", Input: input, Value: (xyz.x * 2).toString() })
                    cmds.push({ Function: "SetPanY", Input: input, Value: (xyz.y * 2).toString() })
                    cmds.push({ Function: "SetZoom", Input: input, Value: (xyz.zoom ).toString() })
                }
                this.vmixCommand(this.vmix1, cmds)
            }
        })

        this.notifyState()
    }

    /*  activate all physical PTZ of a camera  */
    async setPTZAll (ptz: string) {
        this.log.log(2, `vMix: activating physical PTZ "${ptz}" of all cameras`)
        for (const cam of this.cfg.idCAMs)
            this.setPTZCam(ptz, cam)
    }

    /*  activate single physical PTZ of a camera  */
    async setPTZCam (ptz: string, cam: string) {
        /*  sanity check arguments  */
        if (!this.cfg.idPTZs.find((id) => id === ptz))
            throw new Error(`invalid PTZ id "${ptz}"`)
        if (!this.cfg.idCAMs.find((id) => id === cam))
            throw new Error(`invalid CAM id "${cam}"`)

        /*  set PTZ setting and update vMix PTZ inputs  */
        this.log.log(2, `vMix: activating physical PTZ "${ptz}" of camera "${cam}"`)
        await this.state.setPTZ(cam, ptz)
        this.cam2ptz.set(cam, ptz)
        const input1 = this.cfg.inputNamePTZ(cam, ptz)
        const input2 = this.cfg.inputNameCAM(cam)
        this.vmixCommand(this.vmix1, [
            { Function: "PTZMoveToVirtualInputPosition", Input: input1 },
            { Function: "PTZUpdateVirtualInput",         Input: input2 }
        ])

        /*  load corresponding VPTZ settings and update vMix VirtualSet inputs  */
        this.state.transaction(async () => {
            const cmds = [] as Array<vMixCommand>
            for (const vptz of this.cfg.idVPTZs) {
                this.log.log(2, `vMix: activating virtual PTZ "${vptz}" of camera "${cam}"`)
                const xyz = await this.state.getVPTZ(cam, ptz, vptz)
                this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
                const input = this.cfg.inputNameVPTZ(cam, vptz)
                cmds.push({ Function: "SetPanX", Input: input, Value: (xyz.x * 2).toString() })
                cmds.push({ Function: "SetPanY", Input: input, Value: (xyz.y * 2).toString() })
                cmds.push({ Function: "SetZoom", Input: input, Value: (xyz.zoom ).toString() })
            }
            this.vmixCommand(this.vmix1, cmds)
        })

        this.notifyState()
    }

    /*  store all physical PTZ of a camera  */
    async storePTZAll (ptz: string) {
        this.log.log(2, `vMix: storing physical PTZ "${ptz}" of all cameras`)
        for (const cam of this.cfg.idCAMs)
            this.storePTZCam(ptz, cam)
    }

    /*  store single physical PTZ of a camera  */
    async storePTZCam (ptz: string, cam: string) {
        /*  sanity check arguments  */
        if (!this.cfg.idPTZs.find((id) => id === ptz))
            throw new Error(`invalid PTZ id "${ptz}"`)
        if (!this.cfg.idCAMs.find((id) => id === cam))
            throw new Error(`invalid CAM id "${cam}"`)

        /*  set PTZ setting and update vMix PTZ inputs  */
        this.log.log(2, `vMix: storing physical PTZ "${ptz}" of camera "${cam}"`)
        const input = this.cfg.inputNamePTZ(cam, ptz)
        this.vmixCommand(this.vmix1, [
            { Function: "PTZUpdateVirtualInput", Input: input }
        ])
    }

    /*  reset all physical PTZ of a camera  */
    async resetPTZAll (ptz: string) {
        this.log.log(2, `vMix: resetting physical PTZ "${ptz}" of all cameras`)
        for (const cam of this.cfg.idCAMs)
            this.resetPTZCam(ptz, cam)
    }

    /*  reset single physical PTZ of a camera  */
    async resetPTZCam (ptz: string, cam: string) {
        /*  sanity check arguments  */
        if (!this.cfg.idPTZs.find((id) => id === ptz))
            throw new Error(`invalid PTZ id "${ptz}"`)
        if (!this.cfg.idCAMs.find((id) => id === cam))
            throw new Error(`invalid CAM id "${cam}"`)

        /*  reset VPTZ settings  */
        await this.state.transaction(async () => {
            for (const vptz of this.cfg.idVPTZs) {
                this.log.log(2, `vMix: resetting virtual PTZ "${vptz}" of camera "${cam}"`)
                let xyz = { x: 0.0, y: 0.0, zoom: 1.0 } as XYZ
                if      (vptz === "C-L") xyz = { x: -0.25 + 0.070, y:  0.150, zoom: 0.35 }
                else if (vptz === "C-C") xyz = { x: -0.500, y: 0.500, zoom: 2.00 }
                else if (vptz === "C-R") xyz = { x: -0.25 + 0.580, y:  0.150, zoom: 0.35 }
                else if (vptz === "F-L") xyz = { x: -0.25 + 0.000, y:  0.150, zoom: 0.50 }
                else if (vptz === "F-C") xyz = { x: 0.500, y: -0.500, zoom: 2.00 }
                else if (vptz === "F-R") xyz = { x: 0.000, y: 0.200, zoom: 0.50 }
                else if (vptz === "W-C") xyz = { x: 0.000, y: 0.000, zoom: 1.00 }
                await this.state.setVPTZ(cam, ptz, vptz, xyz)
                this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
            }
        })
        this.notifyState()
    }

    /*  clear all physical PTZ of a camera  */
    async clearPTZAll (ptz: string) {
        this.log.log(2, `vMix: clearing all physical PTZ "${ptz}" of all cameras`)
        for (const cam of this.cfg.idCAMs)
            await this.clearPTZCam(ptz, cam)
    }

    /*  clear single physical PTZ of a camera  */
    async clearPTZCam (ptz: string, cam: string) {
        /*  sanity check arguments  */
        if (!this.cfg.idPTZs.find((id) => id === ptz))
            throw new Error(`invalid PTZ id "${ptz}"`)
        if (!this.cfg.idCAMs.find((id) => id === cam))
            throw new Error(`invalid CAM id "${cam}"`)

        /*  reset VPTZ settings  */
        this.state.transaction(async () => {
            for (const vptz of this.cfg.idVPTZs) {
                this.log.log(2, `vMix: clearing virtual PTZ "${vptz}" of camera "${cam}"`)
                const xyz = { x: 0.0, y: 0.0, zoom: 1.0 } as XYZ
                await this.state.setVPTZ(cam, ptz, vptz, xyz)
                this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
            }
        })
        this.notifyState()
    }

    /*  send command to vMix  */
    async vmixCommand (vmix: vMixAPI.ConnectionTCP | null, cmds: string | Array<string> | vMixCommand | Array<vMixCommand>) {
        if (vmix !== null && vmix.connected())
            await vmix.send(clone(cmds))
        else {
            const remote = (vmix?.socket().remoteAddress ?? "unknown") + ":" + (vmix?.socket().remotePort ?? "unknown")
            this.log.log(1, `vMix: failed to send command(s) to ${remote} -- (still) not connected`)
        }
    }

    /*  change physical PTZ  */
    async changePTZ (cam: string, ptz: string, op: string, arg: string) {
        /*  sanity check arguments  */
        if (!this.cfg.idCAMs.find((id) => id === cam))
            throw new Error(`invalid CAM id "${cam}"`)
        if (!this.cfg.idPTZs.find((id) => id === ptz))
            throw new Error(`invalid PTZ id "${ptz}"`)
        if (op !== "pan" && op !== "zoom")
            throw new Error("invalid operation")

        /*  constants  */
        const moveSpeed  = 0.5
        const moveTime   = 0.5
        const zoomSpeed  = 0.5
        const zoomTime   = 0.5

        /*  variables  */
        let cmd1: CMD | null = null
        let cmd2: CMD | null = null
        let time = 0

        /*  dispatch according to operation  */
        if (op === "pan") {
            if (arg === "reset")
                cmd1 = { f: "PTZHome" }
            else if (arg === "up-left") {
                cmd1 = { f: "PTZMoveUpLeft", v: moveSpeed.toString() }
                cmd2 = { f: "PTZMoveStop" }
                time = moveTime
            }
            else if (arg === "up") {
                cmd1 = { f: "PTZMoveUp", v: moveSpeed.toString() }
                cmd2 = { f: "PTZMoveStop" }
                time = moveTime
            }
            else if (arg === "up-right") {
                cmd1 = { f: "PTZMoveUpRight", v: moveSpeed.toString() }
                cmd2 = { f: "PTZMoveStop" }
                time = moveTime
            }
            else if (arg === "left") {
                cmd1 = { f: "PTZMoveLeft", v: moveSpeed.toString() }
                cmd2 = { f: "PTZMoveStop" }
                time = moveTime
            }
            else if (arg === "right") {
                cmd1 = { f: "PTZMoveRight", v: moveSpeed.toString() }
                cmd2 = { f: "PTZMoveStop" }
                time = moveTime
            }
            else if (arg === "down-left") {
                cmd1 = { f: "PTZMoveDownLeft", v: moveSpeed.toString() }
                cmd2 = { f: "PTZMoveStop" }
                time = moveTime
            }
            else if (arg === "down") {
                cmd1 = { f: "PTZMoveDown", v: moveSpeed.toString() }
                cmd2 = { f: "PTZMoveStop" }
                time = moveTime
            }
            else if (arg === "down-right") {
                cmd1 = { f: "PTZMoveDownRight", v: moveSpeed.toString() }
                cmd2 = { f: "PTZMoveStop" }
                time = moveTime
            }
            else
                throw new Error("invalid argument")
        }
        else if (op === "zoom") {
            if (arg === "reset") {
                cmd1 = { f: "PTZZoomOut", v: "1.0" }
                cmd2 = { f: "PTZZoomStop" }
                time = 2.0
            }
            else if (arg === "decrease") {
                cmd1 = { f: "PTZZoomOut", v: zoomSpeed.toString() }
                cmd2 = { f: "PTZZoomStop" }
                time = zoomTime
            }
            else if (arg === "increase") {
                cmd1 = { f: "PTZZoomIn", v: zoomSpeed.toString() }
                cmd2 = { f: "PTZZoomStop" }
                time = zoomTime
            }
            else
                throw new Error("invalid argument")
        }

        /*  determine and execute first vMix command  */
        const input = this.cfg.inputNamePTZ(cam, ptz)
        const vmixCmd1 = { Function: cmd1!.f, Input: input } as vMixCommand
        if (cmd1!.v !== undefined && cmd1!.v !== "")
            vmixCmd1.Value = cmd1!.v
        await this.vmixCommand(this.vmix1, vmixCmd1)

        /*  determine and execute optional delay  */
        if (time > 0)
            await AsyncDelay(time)

        /*  determine and execute optional second vMix command  */
        if (cmd2 !== null) {
            const vmixCmd2 = { Function: cmd2!.f, Input: input } as vMixCommand
            if (cmd2!.v !== undefined && cmd2!.v !== "")
                vmixCmd2.Value = cmd2!.v
            await this.vmixCommand(this.vmix1, vmixCmd2)
        }
    }

    /*  change virtual PTZ  */
    async changeVPTZ (cam: string, vptz: string, op: string, arg: string) {
        /*  sanity check arguments  */
        if (!this.cfg.idCAMs.find((id) => id === cam))
            throw new Error(`invalid CAM id "${cam}"`)
        if (!this.cfg.idVPTZs.find((id) => id === vptz))
            throw new Error(`invalid VPTZ id "${vptz}"`)
        if (op !== "pan" && op !== "zoom")
            throw new Error("invalid operation")

        /*  constants  */
        const fps        = 30
        const duration   = 500
        const steps      = duration / (1000 / fps)
        const deltaPan   = 0.05
        const deltaZoom  = 0.05

        /*  variables  */
        let cmd1: CMD | null = null
        let cmd2: CMD | null = null
        let mod1: MOD | null = null
        let mod2: MOD | null = null

        /*  dispatch according to operation  */
        if (op === "pan") {
            const delta = deltaPan / steps
            if (arg === "reset") {
                cmd1 = { f: "SetPanY", v: "0" }
                cmd2 = { f: "SetPanX", v: "0" }
                mod1 = (xyz: XYZ) => { xyz.y = 0 }
                mod2 = (xyz: XYZ) => { xyz.x = 0 }
            }
            else if (arg === "up-left") {
                cmd1 = { f: "SetPanY", v: `-=${delta}` }
                cmd2 = { f: "SetPanX", v: `+=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.y -= (delta / 2) }
                mod2 = (xyz: XYZ) => { xyz.x += (delta / 2) }
            }
            else if (arg === "up") {
                cmd1 = { f: "SetPanY", v: `-=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.y -= (delta / 2) }
            }
            else if (arg === "up-right") {
                cmd1 = { f: "SetPanY", v: `-=${delta}` }
                cmd2 = { f: "SetPanX", v: `-=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.y -= (delta / 2) }
                mod2 = (xyz: XYZ) => { xyz.x -= (delta / 2) }
            }
            else if (arg === "left") {
                cmd1 = { f: "SetPanX", v: `+=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.x += (delta / 2) }
            }
            else if (arg === "right") {
                cmd1 = { f: "SetPanX", v: `-=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.x -= (delta / 2) }
            }
            else if (arg === "down-left") {
                cmd1 = { f: "SetPanY", v: `+=${delta}` }
                cmd2 = { f: "SetPanX", v: `+=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.y += (delta / 2) }
                mod2 = (xyz: XYZ) => { xyz.x += (delta / 2) }
            }
            else if (arg === "down") {
                cmd1 = { f: "SetPanY", v: `+=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.y += (delta / 2) }
            }
            else if (arg === "down-right") {
                cmd1 = { f: "SetPanY", v: `+=${delta}` }
                cmd2 = { f: "SetPanX", v: `-=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.y += (delta / 2) }
                mod2 = (xyz: XYZ) => { xyz.x -= (delta / 2) }
            }
            else
                throw new Error("invalid argument")
        }
        else if (op === "zoom") {
            const delta = deltaZoom / steps
            if (arg === "reset") {
                cmd1 = { f: "SetZoom", v: "1.0" }
                mod1 = (xyz: XYZ) => { xyz.zoom = 1.0 }
            }
            else if (arg === "decrease") {
                cmd1 = { f: "SetZoom", v: `-=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.zoom -= delta }
            }
            else if (arg === "increase") {
                cmd1 = { f: "SetZoom", v: `+=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.zoom += delta }
            }
            else
                throw new Error("invalid argument")
        }

        /*  determine vMix commands  */
        const input = this.cfg.inputNameVPTZ(cam, vptz)
        const cmds = [] as Array<vMixCommand>
        cmds.push({ Function: cmd1!.f, Input: input, Value: cmd1!.v })
        if (cmd2 !== null)
            cmds.push({ Function: cmd2.f, Input: input, Value: cmd2.v })

        /*  determine XYZ object  */
        let xyz = this.vptz2xyz.get(`${cam}:${vptz}`)
        if (xyz === undefined) {
            xyz = { x: 0, y: 0, zoom: 1.0 }
            this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
        }

        /*  determine physical PTZ of camera  */
        const ptz = this.cam2ptz.get(cam) ?? this.cfg.idPTZs[0]

        /*  finally perform VPTZ adjustment operation  */
        await AsyncLoop(async () => {
            this.vmixCommand(this.vmix1, cmds)
            mod1!(xyz!)
            if (mod2 !== null)
                mod2!(xyz!)
            this.notifyState(true)
        }, (cancelled) => {
            this.state.setVPTZ(cam, ptz, vptz, xyz!)
            this.notifyState(false)
        }, { duration, fps })
    }

    /*  select virtual PTZ for preview  */
    async selectVPTZ (cam: string, vptz: string) {
        /*  sanity check arguments  */
        if (!this.cfg.idCAMs.find((id) => id === cam))
            throw new Error(`invalid CAM id "${cam}"`)
        if (!this.cfg.idVPTZs.find((id) => id === vptz))
            throw new Error(`invalid VPTZ id "${vptz}"`)

        /*  send input to preview  */
        const input = this.cfg.inputNameVPTZ(cam, vptz)
        await this.vmixCommand(this.vmix2, { Function: "PreviewInput", Input: input })
    }

    /*  cut preview into program  */
    async cut () {
        await this.vmixCommand(this.vmix2, { Function: "Cut" })
    }

    /*  drive preview into program  */
    async drive (mode: "apply" | "cut" = "cut") {
        /*  determine program and preview inputs  */
        const program = this.active.program.B !== "" ? this.active.program.B : this.active.program.A
        const preview = this.active.preview.B !== "" ? this.active.preview.B : this.active.preview.A

        /*  determine camera and VPTZ of program and preview inputs  */
        const programCam  = this.cfg.camOfInputName(program)
        const previewCam  = this.cfg.camOfInputName(preview)
        const programVPTZ = this.cfg.vptzOfInputName(program)
        const previewVPTZ = this.cfg.vptzOfInputName(preview)

        /*  sanity check situation  */
        if (programCam !== previewCam)
            throw new Error("program and preview inputs are not on same camera")
        if (programVPTZ === "" || previewVPTZ === "")
            throw new Error("program or preview inputs are not VPTZ inputs")

        /*  helper function: clone a XYZ object  */
        const cloneXYZ = (xyz: XYZ) => ({ ...xyz } as XYZ)

        /*  helper function: calculate path from source to destination XYZ  */
        const pathCalc = (src: XYZ, dst: XYZ, fps: number, duration: number, W = 3840, H = 2160, factor = 1.5) => {
            /*  calculate mid state  */
            const mid = {
                x:    src.x    + Math.round((dst.x    - src.x   ) / 2),
                y:    src.y    + Math.round((dst.y    - src.y   ) / 2),
                zoom: src.zoom + Math.round((dst.zoom - src.zoom) / 2)
            }

            /*  calculate mid state resize factor  */
            while (factor >= 1.0) {
                const x = mid.x - Math.round(((mid.zoom * W * factor) - mid.zoom * W) / 2)
                const y = mid.y - Math.round(((mid.zoom * H * factor) - mid.zoom * H) / 2)
                const w = mid.zoom * W * factor
                const h = mid.zoom * H * factor
                if (x >= 0 && (x + w) <= W && y >= 0 && (y + h) <= H)
                    break
                factor -= 0.01
            }

            /*  resize mid state  */
            mid.x = mid.x - Math.round(((mid.zoom * W * factor) - mid.zoom * W) / 2)
            mid.y = mid.y - Math.round(((mid.zoom * H * factor) - mid.zoom * H) / 2)
            mid.zoom = Math.round(mid.zoom * factor)

            /*  initialize loop  */
            const path = [] as Array<XYZ>
            const state = cloneXYZ(src)
            const steps = Math.round(duration / (1000 / fps))
            const k = Math.round(steps / 2)
            let i = 0

            /*  ease in to mid state  */
            while (i < k) {
                state.x    = src.x    + Math.round( (mid.x    - src.x)    * Math.pow(i / k, 3) )
                state.y    = src.y    + Math.round( (mid.y    - src.y)    * Math.pow(i / k, 3) )
                state.zoom = src.zoom + Math.round( (mid.zoom - src.zoom) * Math.pow(i / k, 3) )
                path.push(cloneXYZ(state))
                i++
            }

            /*  ease out from mid state  */
            while (i < steps) {
                state.x    = mid.x    + Math.round( (dst.x    - mid.x)    * (1 - Math.pow(1 - ((i - k) / k), 3)) )
                state.y    = mid.y    + Math.round( (dst.y    - mid.y)    * (1 - Math.pow(1 - ((i - k) / k), 3)) )
                state.zoom = mid.zoom + Math.round( (dst.zoom - mid.zoom) * (1 - Math.pow(1 - ((i - k) / k), 3)) )
                path.push(cloneXYZ(state))
                i++
            }

            return path
        }

        /*  driving configuration  */
        const fps      = 30
        const duration = 1000

        /*  driving parameters  */
        let cam   = ""
        let vptz  = ""
        let input = ""
        let path  = [] as Array<XYZ>

        /*  determine XYZ of preview and program inputs  */
        const ptz = this.cam2ptz.get(programCam)!
        const previewXYZ = await this.state.getVPTZ(previewCam, ptz, previewVPTZ)
        const programXYZ = await this.state.getVPTZ(programCam, ptz, programVPTZ)

        /*  perform drive operation (individual phase 1/2)  */
        if (mode === "apply") {
            /*  mode 1: apply VPTZ of preview directly onto program  */

            /*  determine drive path from program to preview  */
            path = pathCalc(programXYZ, previewXYZ, fps, duration)

            /*  apply drive path to program  */
            input = program
            cam   = programCam
            vptz  = programVPTZ
        }
        else if (mode === "cut") {
            /*  mode 2: temporarily apply VPTZ of program to preview,
                cut preview into program and apply previous VPTZ again  */

            /*  remember original VPTZ of preview  */
            const tempXYZ = cloneXYZ(previewXYZ)

            /*  apply VPTZ of program to preview  */
            previewXYZ.x    = programXYZ.x
            previewXYZ.y    = programXYZ.y
            previewXYZ.zoom = programXYZ.zoom
            const cmds = [] as Array<vMixCommand>
            cmds.push({ Function: "SetPanX", Input: preview, Value: (previewXYZ.x * 2).toString() })
            cmds.push({ Function: "SetPanY", Input: preview, Value: (previewXYZ.y * 2).toString() })
            cmds.push({ Function: "SetZoom", Input: preview, Value: (previewXYZ.zoom ).toString() })
            this.vmixCommand(this.vmix1, cmds)
            await AsyncDelay(100)

            /*  cut preview into program  */
            this.vmixCommand(this.vmix2, { Function: "Cut" })
            await AsyncDelay(50)

            /*  determine drive path from program (which was the preview) to original preview  */
            path = pathCalc(previewXYZ, tempXYZ, fps, duration)

            /*  apply drive path to program (which was the preview)  */
            input = preview
            cam   = previewCam
            vptz  = previewVPTZ
        }
        else
            throw new Error("invalid drive mode")

        /*  perform drive operation (common phase 2/2)  */
        await AsyncLoop(() => {
            if (path.length > 0) {
                const xyz = path.shift()!

                /*  change locally  */
                const cam  = this.cfg.camOfInputName(input)
                const vptz = this.cfg.vptzOfInputName(input)
                this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
                this.notifyState(true)

                /*  change vMix  */
                const cmds = [] as Array<vMixCommand>
                cmds.push({ Function: "SetPanX", Input: input, Value: (xyz.x * 2).toString() })
                cmds.push({ Function: "SetPanY", Input: input, Value: (xyz.y * 2).toString() })
                cmds.push({ Function: "SetZoom", Input: input, Value: (xyz.zoom ).toString() })
                this.vmixCommand(this.vmix1, cmds)
            }
        }, (cancelled) => {
            this.state.setVPTZ(cam, ptz, vptz, path[path.length - 1])
            this.notifyState(false)
        }, { duration, fps })
    }
}

