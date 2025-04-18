/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023-2024 Dr. Ralf S. Engelschall <rse@engelschall.com>
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
import type { XYZ } from "./app-state"
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

/*  asynchronous callback utility  */
const AsyncCallback = (doAction: (...args: any[]) => Promise<void>, onError: (err: Error) => void) => {
    return async (...args: any[]) => {
        doAction(...args).catch((err: Error) => {
            onError(err)
        })
    }
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
    private changePTZTimer: ReturnType<typeof setTimeout> | null = null

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
            for (const vptz of this.cfg.idVPTZs) {
                const xyz = await this.state.getVPTZ(cam, ptz, vptz)
                this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
            }
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
                /* this.restoreState() */
            }
        }
        this.vmix1.on("connect", AsyncCallback(async () => {
            this.log.log(2, "vMix: connection established to vMix #1")
            await AsyncDelay(100)
            this.vmixCommand(this.vmix1, "XML")
            this.vmixCommand(this.vmix1, "SUBSCRIBE TALLY")
            onConnect()
        }, (err: Error) => {
            this.log.log(0, `vMix: on connect to vMix #1: ${err.toString()}`)
        }))
        if (this.vmix2 !== null) {
            this.vmix2.on("connect", AsyncCallback(async () => {
                this.log.log(2, "vMix: connection established to vMix #2")
                await AsyncDelay(100)
                this.vmixCommand(this.vmix2, "XML")
                this.vmixCommand(this.vmix2, "SUBSCRIBE TALLY")
                onConnect()
            }, (err: Error) => {
                this.log.log(0, `vMix: on connect to vMix #2: ${err.toString()}`)
            }))
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
        this.vmix1.on("tally", AsyncCallback(async (data: string) => {
            this.log.log(3, "vMix: received TALLY status on vMix #1")
            onTallyStatus("A", data)
        }, (err: Error) => {
            this.log.log(0, `vMix: on tally status of vMix #1: ${err.toString()}`)
        }))
        if (this.vmix2 !== null) {
            this.vmix2.on("tally", AsyncCallback(async (data: string) => {
                this.log.log(3, "vMix: received TALLY status on vMix #2")
                onTallyStatus("B", data)
            }, (err: Error) => {
                this.log.log(0, `vMix: on tally status of vMix #2: ${err.toString()}`)
            }))
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

            this.notifyState(false, "all")
        }
        this.vmix1.on("xml", AsyncCallback(async (xml: string) => {
            this.log.log(3, "vMix: received XML status on vMix #1")
            onXmlStatus("A", xml)
        }, (err: Error) => {
            this.log.log(0, `vMix: on XML status of vMix #1: ${err.toString()}`)
        }))
        if (this.vmix2 !== null) {
            this.vmix2.on("xml", AsyncCallback(async (xml: string) => {
                this.log.log(3, "vMix: received XML status on vMix #2")
                onXmlStatus("B", xml)
            }, (err: Error) => {
                this.log.log(0, `vMix: on XML status of vMix #2: ${err.toString()}`)
            }))
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
        return state
    }

    notifyState (cached = false, cams = "all") {
        this.emit("state-change", { cached, cams })
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
                this.log.log(2, `vMix: restore vMix state of camera "${cam}" and physical PTZ "${ptz}"`)

                /*  iterate over all corresponding virtual PTZ...  */
                const cmds = [] as Array<vMixCommand>
                for (const vptz of this.cfg.idVPTZs) {
                    this.log.log(2, `vMix: restore virtual PTZ "${vptz}" of camera "${cam}"`)
                    const xyz = await this.state.getVPTZ(cam, ptz, vptz)
                    this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
                    const input = this.cfg.inputNameVPTZ(cam, vptz)
                    cmds.push({ Function: "SetPanX", Input: input, Value: xyz.x.toString() })
                    cmds.push({ Function: "SetPanY", Input: input, Value: xyz.y.toString() })
                    cmds.push({ Function: "SetZoom", Input: input, Value: xyz.zoom.toString() })
                }
                this.vmixCommand(this.vmix1, cmds)
            }
        })

        this.notifyState()
    }

    /*  activate all physical PTZ of a camera  */
    async setPTZAll (ptz: string) {
        this.log.log(2, `vMix: activating physical PTZ "${ptz}" of all cameras`)
        const promises = []
        for (const cam of this.cfg.idCAMs)
            promises.push(this.setPTZCam(ptz, cam))
        return Promise.all(promises)
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
            { Function: "PTZMoveToVirtualInputPosition", Input: input1 }
        ])
        await AsyncDelay(6 * 1000)
        this.vmixCommand(this.vmix1, [
            { Function: "PTZUpdateVirtualInput", Input: input2 }
        ])

        /*  load corresponding VPTZ settings and update vMix VirtualSet inputs  */
        this.state.transaction(async () => {
            const cmds = [] as Array<vMixCommand>
            for (const vptz of this.cfg.idVPTZs) {
                this.log.log(2, `vMix: activating virtual PTZ "${vptz}" of camera "${cam}"`)
                const xyz = await this.state.getVPTZ(cam, ptz, vptz)
                this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
                const input = this.cfg.inputNameVPTZ(cam, vptz)
                cmds.push({ Function: "SetPanX", Input: input, Value: xyz.x.toString() })
                cmds.push({ Function: "SetPanY", Input: input, Value: xyz.y.toString() })
                cmds.push({ Function: "SetZoom", Input: input, Value: xyz.zoom.toString() })
            }
            this.vmixCommand(this.vmix1, cmds)
        })

        this.notifyState(false, cam)
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
        const inputCAM = this.cfg.inputNameCAM(cam)
        const inputPTZ = this.cfg.inputNamePTZ(cam, ptz)
        this.vmixCommand(this.vmix1, [
            { Function: "PTZUpdateVirtualInput", Input: inputCAM },
            { Function: "PTZUpdateVirtualInput", Input: inputPTZ }
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
            const cmds = [] as Array<vMixCommand>
            for (const vptz of this.cfg.idVPTZs) {
                this.log.log(2, `vMix: resetting virtual PTZ "${vptz}" of camera "${cam}"`)
                let xyz = { x: 0.0, y: 0.0, zoom: 1.0 } as XYZ
                if      (vptz === "C-L") xyz = { x:  2.000, y: -1.200, zoom: 3.00 }
                else if (vptz === "C-C") xyz = { x:  0.000, y: -1.200, zoom: 3.00 }
                else if (vptz === "C-R") xyz = { x: -2.000, y: -1.200, zoom: 3.00 }
                else if (vptz === "F-L") xyz = { x:  1.000, y: -0.450, zoom: 2.00 }
                else if (vptz === "F-C") xyz = { x:  0.000, y: -0.450, zoom: 2.00 }
                else if (vptz === "F-R") xyz = { x: -1.000, y: -0.450, zoom: 2.00 }
                else if (vptz === "W-C") xyz = { x:  0.000, y:  0.000, zoom: 1.00 }
                await this.state.setVPTZ(cam, ptz, vptz, xyz)
                this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
                const input = this.cfg.inputNameVPTZ(cam, vptz)
                cmds.push({ Function: "SetPanX", Input: input, Value: xyz.x.toString() })
                cmds.push({ Function: "SetPanY", Input: input, Value: xyz.y.toString() })
                cmds.push({ Function: "SetZoom", Input: input, Value: xyz.zoom.toString() })
            }
            this.vmixCommand(this.vmix1, cmds)
        })
        this.notifyState(false, cam)
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
            const cmds = [] as Array<vMixCommand>
            for (const vptz of this.cfg.idVPTZs) {
                this.log.log(2, `vMix: clearing virtual PTZ "${vptz}" of camera "${cam}"`)
                const xyz = { x: 0.0, y: 0.0, zoom: 1.0 } as XYZ
                await this.state.setVPTZ(cam, ptz, vptz, xyz)
                this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
                const input = this.cfg.inputNameVPTZ(cam, vptz)
                cmds.push({ Function: "SetPanX", Input: input, Value: xyz.x.toString() })
                cmds.push({ Function: "SetPanY", Input: input, Value: xyz.y.toString() })
                cmds.push({ Function: "SetZoom", Input: input, Value: xyz.zoom.toString() })
            }
            this.vmixCommand(this.vmix1, cmds)
        })
        this.notifyState(false, cam)
    }

    /*  send command to vMix  */
    async vmixCommand (vmix: vMixAPI.ConnectionTCP | null, cmds: string | Array<string> | vMixCommand | Array<vMixCommand>) {
        if (vmix !== null && vmix.connected()) {
            if (typeof cmds === "string")
                this.log.log(3, `vMix: sending command: "${cmds}"`)
            else if (typeof cmds === "object" && !(cmds instanceof Array))
                this.log.log(3, `vMix: sending command: "${JSON.stringify(cmds)}"`)
            else if (typeof cmds === "object" && cmds instanceof Array) {
                for (const cmd of cmds) {
                    if (typeof cmd === "string")
                        this.log.log(3, `vMix: sending command: "${cmd}"`)
                    else if (typeof cmd === "object" && !(cmd instanceof Array))
                        this.log.log(3, `vMix: sending command: "${JSON.stringify(cmd)}"`)
                }
            }
            await vmix.send(clone(cmds))
        }
        else {
            const remote = (vmix?.socket().remoteAddress ?? "unknown") + ":" + (vmix?.socket().remotePort ?? "unknown")
            this.log.log(1, `vMix: failed to send command(s) to ${remote} -- (still) not connected`)
        }
    }

    /*  change physical PTZ  */
    async changePTZ (cam: string, op: string, arg: string, speed: string) {
        /*  sanity check arguments  */
        if (!this.cfg.idCAMs.find((id) => id === cam))
            throw new Error(`invalid CAM id "${cam}"`)
        if (op !== "pan" && op !== "zoom")
            throw new Error("invalid operation")

        /*  constants  */
        const moveSpeed  = (speed === "fast" ? 0.5 : (speed === "med" ? 0.25 : 0.10))
        const moveTime   = 100
        const zoomSpeed  = (speed === "fast" ? 1.0 : (speed === "med" ? 0.5 : 0.15))
        const zoomTime   = 100

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
                time = 2 * 1000
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
        else
            throw new Error("invalid operation")

        /*  determine physical PTZ of camera  */
        const ptz = this.cam2ptz.get(cam) ?? this.cfg.idPTZs[0]

        /*  determine and execute first vMix command  */
        const inputCAM = this.cfg.inputNameCAM(cam)
        const inputPTZ = this.cfg.inputNamePTZ(cam, ptz)
        const vmixCmd1 = { Function: cmd1.f, Input: inputCAM } as vMixCommand
        if (cmd1.v !== undefined && cmd1.v !== "")
            vmixCmd1.Value = cmd1.v
        await this.vmixCommand(this.vmix1, vmixCmd1)

        /*  determine and execute optional delay  */
        if (time > 0)
            await AsyncDelay(time)

        /*  determine and execute optional second vMix command  */
        if (cmd2 !== null) {
            const vmixCmd2 = { Function: cmd2.f, Input: inputCAM } as vMixCommand
            if (cmd2.v !== undefined && cmd2.v !== "")
                vmixCmd2.Value = cmd2.v
            await this.vmixCommand(this.vmix1, vmixCmd2)
        }

        /*  finally persist PTZ information in vMix
            on both CAMx-W-V (for instant use) and CAMx-W-V-y (for later reuse)  */
        if (this.changePTZTimer !== null)
            clearTimeout(this.changePTZTimer)
        this.changePTZTimer = setTimeout(() => {
            this.changePTZTimer = null
            this.vmixCommand(this.vmix1, { Function: "PTZUpdateVirtualInput", Input: inputCAM })
            this.vmixCommand(this.vmix1, { Function: "PTZUpdateVirtualInput", Input: inputPTZ })
        }, 2000)
    }

    /*  change virtual PTZ  */
    async changeVPTZ (cam: string, vptz: string, op: string, arg: string, speed: string) {
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
        const deltaPan   = (speed === "fast" ? 0.300 : (speed === "med" ? 0.150 : 0.050))
        const deltaZoom  = (speed === "fast" ? 0.300 : (speed === "med" ? 0.150 : 0.050))

        /*  variables  */
        let cmd1: CMD | null = null
        let cmd2: CMD | null = null
        let cmd3: CMD | null = null
        let mod1: MOD | null = null
        let mod2: MOD | null = null
        let mod3: MOD | null = null

        /*  determine XYZ object  */
        let xyz = this.vptz2xyz.get(`${cam}:${vptz}`)
        if (xyz === undefined) {
            xyz = { x: 0, y: 0, zoom: 1.0 }
            this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
        }

        /*  calculate potentially change deltas  */
        const deltaXY = deltaPan  / steps

        /*  calculate effectively possible change deltas  */
        const deltaUp    = xyz.y - deltaPan >  (1 - xyz.zoom) ? -deltaXY : (((1 - xyz.zoom) - xyz.y) / steps)
        const deltaRight = xyz.x - deltaPan >  (1 - xyz.zoom) ? -deltaXY : (((1 - xyz.zoom) - xyz.x) / steps)
        const deltaDown  = xyz.y + deltaPan < -(1 - xyz.zoom) ?  deltaXY : (((xyz.zoom - 1) - xyz.y) / steps)
        const deltaLeft  = xyz.x + deltaPan < -(1 - xyz.zoom) ?  deltaXY : (((xyz.zoom - 1) - xyz.x) / steps)

        /*  dispatch according to operation  */
        if (op === "pan") {
            if (arg === "reset") {
                cmd1 = { f: "SetPanY", v: "0" }
                cmd2 = { f: "SetPanX", v: "0" }
                mod1 = (xyz: XYZ) => { xyz.y = 0 }
                mod2 = (xyz: XYZ) => { xyz.x = 0 }
            }
            else if (arg === "up-left") {
                cmd1 = { f: "SetPanY", v: `+=${deltaUp}` }
                cmd2 = { f: "SetPanX", v: `+=${deltaLeft}` }
                mod1 = (xyz: XYZ) => { xyz.y += deltaUp }
                mod2 = (xyz: XYZ) => { xyz.x += deltaLeft }
            }
            else if (arg === "up") {
                cmd1 = { f: "SetPanY", v: `+=${deltaUp}` }
                mod1 = (xyz: XYZ) => { xyz.y += deltaUp }
            }
            else if (arg === "up-right") {
                cmd1 = { f: "SetPanY", v: `+=${deltaUp}` }
                cmd2 = { f: "SetPanX", v: `+=${deltaRight}` }
                mod1 = (xyz: XYZ) => { xyz.y += deltaUp }
                mod2 = (xyz: XYZ) => { xyz.x += deltaRight }
            }
            else if (arg === "left") {
                cmd1 = { f: "SetPanX", v: `+=${deltaLeft}` }
                mod1 = (xyz: XYZ) => { xyz.x += deltaLeft }
            }
            else if (arg === "right") {
                cmd1 = { f: "SetPanX", v: `+=${deltaRight}` }
                mod1 = (xyz: XYZ) => { xyz.x += deltaRight }
            }
            else if (arg === "down-left") {
                cmd1 = { f: "SetPanY", v: `+=${deltaDown}` }
                cmd2 = { f: "SetPanX", v: `+=${deltaLeft}` }
                mod1 = (xyz: XYZ) => { xyz.y += deltaDown }
                mod2 = (xyz: XYZ) => { xyz.x += deltaLeft }
            }
            else if (arg === "down") {
                cmd1 = { f: "SetPanY", v: `+=${deltaDown}` }
                mod1 = (xyz: XYZ) => { xyz.y += deltaDown }
            }
            else if (arg === "down-right") {
                cmd1 = { f: "SetPanY", v: `+=${deltaDown}` }
                cmd2 = { f: "SetPanX", v: `+=${deltaRight}` }
                mod1 = (xyz: XYZ) => { xyz.y += deltaDown }
                mod2 = (xyz: XYZ) => { xyz.x += deltaRight }
            }
            else
                throw new Error("invalid argument")
        }
        else if (op === "zoom") {
            if (arg === "reset") {
                cmd1 = { f: "SetZoom", v: "1.0" }
                mod1 = (xyz: XYZ) => { xyz.zoom = 1.0 }
                cmd2 = { f: "SetPanX", v: "0" }
                mod2 = (xyz: XYZ) => { xyz.x = 0 }
                cmd3 = { f: "SetPanY", v: "0" }
                mod3 = (xyz: XYZ) => { xyz.y = 0 }
            }
            else if (arg === "decrease") {
                const zoomAdjusted = Math.max(xyz.zoom - deltaZoom, 1.0)
                const deltaZAdjusted = (xyz.zoom - zoomAdjusted) / steps
                const absX = Math.abs(xyz.x)
                if (zoomAdjusted - absX < 1) {
                    const panX = (absX - (-1 + zoomAdjusted)) / steps
                    cmd2 = { f: "SetPanX", v: `${xyz.x < 0 ? "+=" : "-="}${panX}` }
                    mod2 = (xyz: XYZ) => { xyz.x += xyz.x < 0 ? panX : -panX }
                }
                const absY = Math.abs(xyz.y)
                if (zoomAdjusted - absY < 1) {
                    const panY = (absY - (-1 + zoomAdjusted)) / steps
                    cmd3 = { f: "SetPanY", v: `${xyz.y < 0 ? "+=" : "-="}${panY}` }
                    mod3 = (xyz: XYZ) => { xyz.y += xyz.y < 0 ? panY : -panY }
                }
                cmd1 = { f: "SetZoom", v: `-=${deltaZAdjusted}` }
                mod1 = (xyz: XYZ) => { xyz.zoom -= deltaZAdjusted }
            }
            else if (arg === "increase") {
                const zoomAdjusted = Math.min(xyz.zoom + deltaZoom, 2.0)
                const deltaZAdjusted = (zoomAdjusted - xyz.zoom) / steps
                cmd1 = { f: "SetZoom", v: `+=${deltaZAdjusted}` }
                mod1 = (xyz: XYZ) => { xyz.zoom += deltaZAdjusted }
            }
            else
                throw new Error("invalid argument")
        }
        else
            throw new Error("invalid operation")

        /*  determine vMix commands  */
        const input = this.cfg.inputNameVPTZ(cam, vptz)
        const cmds = [] as Array<vMixCommand>
        cmds.push({ Function: cmd1.f, Input: input, Value: cmd1.v })
        if (cmd2 !== null)
            cmds.push({ Function: cmd2.f, Input: input, Value: cmd2.v })
        if (cmd3 !== null)
            cmds.push({ Function: cmd3.f, Input: input, Value: cmd3.v })

        /*  determine physical PTZ of camera  */
        const ptz = this.cam2ptz.get(cam) ?? this.cfg.idPTZs[0]

        /*  finally perform VPTZ adjustment operation  */
        await AsyncLoop(async () => {
            this.vmixCommand(this.vmix1, cmds)
            if (mod1 !== null && xyz !== undefined)
                mod1(xyz)
            if (mod2 !== null && xyz !== undefined)
                mod2(xyz)
            if (mod3 !== null && xyz !== undefined)
                mod3(xyz)
            this.notifyState(true, cam)
        }, (cancelled) => {
            if (xyz !== undefined)
                this.state.setVPTZ(cam, ptz, vptz, xyz)
            this.notifyState(false, cam)
        }, { duration, fps })
    }

    /*  change virtual PTZ x/y/zoom  */
    async xyzVPTZ (cam: string, vptz: string, x: number, y: number, zoom: number) {
        /*  sanity check arguments  */
        if (!this.cfg.idCAMs.find((id) => id === cam))
            throw new Error(`invalid CAM id "${cam}"`)
        if (!this.cfg.idVPTZs.find((id) => id === vptz))
            throw new Error(`invalid VPTZ id "${vptz}"`)

        /*  determine physical PTZ of camera  */
        const ptz = this.cam2ptz.get(cam) ?? this.cfg.idPTZs[0]

        /*  determine XYZ object  */
        let xyz = this.vptz2xyz.get(`${cam}:${vptz}`)
        if (xyz === undefined) {
            xyz = { x: 0, y: 0, zoom: 1.0 }
            this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
        }

        /*  update XYZ object  */
        xyz.x    = x
        xyz.y    = y
        xyz.zoom = zoom

        /*  persist new information  */
        this.state.setVPTZ(cam, ptz, vptz, xyz)

        /*  update vMix  */
        const input = this.cfg.inputNameVPTZ(cam, vptz)
        const cmds = [] as Array<vMixCommand>
        cmds.push({ Function: "SetPanX", Input: input, Value: xyz.x.toString() })
        cmds.push({ Function: "SetPanY", Input: input, Value: xyz.y.toString() })
        cmds.push({ Function: "SetZoom", Input: input, Value: xyz.zoom.toString() })
        this.vmixCommand(this.vmix1, cmds)

        /*  notify clients  */
        this.notifyState(false, cam)
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
        const vmix = this.vmix2 !== null ? this.vmix2 : this.vmix1
        await this.vmixCommand(vmix, { Function: "PreviewInput", Input: input })
    }

    /*  cut preview into program  */
    async cut () {
        const vmix = this.vmix2 !== null ? this.vmix2 : this.vmix1
        await this.vmixCommand(vmix, { Function: "Cut" })
    }

    /*  drive preview into program  */
    async drive (speed: string) {
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
            return this.cut()
        if (programVPTZ === "" || previewVPTZ === "")
            return this.cut()

        /*  helper function: clone a XYZ object  */
        const cloneXYZ = (xyz: XYZ) => ({ ...xyz } as XYZ)

        /*  helper functions: easings  */
        const easeInSine     = (x: number) => 1 - Math.cos((x * Math.PI) / 2)
        const easeOutSine    = (x: number) => Math.sin((x * Math.PI) / 2)
        const easeInCubic    = (x: number) => Math.pow(x, 3)
        const easeOutCubic   = (x: number) => 1 - Math.pow(1 - x, 3)

        /*  helper function: determine path of max zoom levels corresponding a path of x/y coordinates.
            Notice: vMix operates on a canvas with x/y in the range [-2...+2], the visible canvas is
            always the range [-1...+1], the zoom is in the range [0...5], as a result, x/y + 1 ensures
            the object is still fully within the visible canvas.  */
        const maxZoom = (path: XYZ[]) => {
            const mzoom = [] as Array<number>
            for (const state of path) {
                /*  calculate maximum x/y zoom levels  */
                let mxz = Math.abs(state.x) + 1.0
                let myz = Math.abs(state.y) + 1.0

                /*  round maximum x/y zoom levels  */
                mxz = Math.round(mxz * 10000000) / 10000000
                myz = Math.round(myz * 10000000) / 10000000

                /*  worst zoom wins  */
                mzoom.push(Math.max(mxz, myz))
            }
            return mzoom
        }

        /*  helper function: limit zoom levels on a path to the maximum  */
        const limitZoomsOfPath = (path: XYZ[]) => {
            /*  calculate maximum zoom possible  */
            const mz: number[] = maxZoom(path)
            for (let i = 0; i < path.length; i++) {
                if (path[i].zoom < mz[i])
                    path[i].zoom = mz[i]
            }
            return path
        }

        /*  helper function: calculate path from source to destination XYZ
            (with maximum optical and minimum vMix zoom level under the constraint
            that we are, at each point on the path, optically within the visible canvas)  */
        const pathCalc = (src: XYZ, dst: XYZ, fps: number, duration: number) => {
            /*  initialize loop  */
            const path1 = [] as Array<XYZ>
            const path2 = [] as Array<XYZ>
            const state = cloneXYZ(src)
            const steps = Math.round(duration / (1000 / fps))
            const k = Math.round(steps / 2)

            /*  calculate mid state  */
            const mid = {
                x:    src.x    + ((dst.x    - src.x   ) * k / steps),
                y:    src.y    + ((dst.y    - src.y   ) * k / steps),
                zoom: src.zoom + ((dst.zoom - src.zoom) * k / steps)
            }

            /*  ease in to mid state  */
            let i = 0
            while (i < k) {
                state.x    = src.x    + ((mid.x    - src.x)    * easeInCubic(i / k))
                state.y    = src.y    + ((mid.y    - src.y)    * easeInCubic(i / k))
                state.zoom = src.zoom + ((mid.zoom - src.zoom) * easeInSine(i / k))
                state.x    = Math.round(state.x    * 10000000) / 10000000
                state.y    = Math.round(state.y    * 10000000) / 10000000
                state.zoom = Math.round(state.zoom * 10000000) / 10000000
                path1.push(cloneXYZ(state))
                i++
            }

            /*  ease out from mid state  */
            while (i < steps) {
                state.x    = mid.x    + ((dst.x    - mid.x)    * easeOutCubic((i - k) / k))
                state.y    = mid.y    + ((dst.y    - mid.y)    * easeOutCubic((i - k) / k))
                state.zoom = mid.zoom + ((dst.zoom - mid.zoom) * easeOutSine((i - k) / k))
                state.x    = Math.round(state.x    * 10000000) / 10000000
                state.y    = Math.round(state.y    * 10000000) / 10000000
                state.zoom = Math.round(state.zoom * 10000000) / 10000000
                path2.push(cloneXYZ(state))
                i++
            }

            return limitZoomsOfPath(path1).concat(limitZoomsOfPath(path2))
        }

        /*  driving configuration  */
        const fps      = 120
        const duration = (speed === "fast" ? 1500 : (speed === "med" ? 2500 : 3500))

        /*  driving parameters  */
        let cam   = ""
        let vptz  = ""
        let input = ""
        let path  = [] as Array<XYZ>

        /*  determine XYZ of preview and program inputs  */
        const ptz = this.cam2ptz.get(programCam)!
        const previewXYZ = await this.state.getVPTZ(previewCam, ptz, previewVPTZ)
        const programXYZ = await this.state.getVPTZ(programCam, ptz, programVPTZ)

        /*  remember original VPTZ of preview  */
        const tempXYZ = cloneXYZ(previewXYZ)

        /*  apply VPTZ of program to preview  */
        previewXYZ.x    = programXYZ.x
        previewXYZ.y    = programXYZ.y
        previewXYZ.zoom = programXYZ.zoom
        const cmds = [] as Array<vMixCommand>
        cmds.push({ Function: "SetPanX", Input: preview, Value: previewXYZ.x.toString() })
        cmds.push({ Function: "SetPanY", Input: preview, Value: previewXYZ.y.toString() })
        cmds.push({ Function: "SetZoom", Input: preview, Value: previewXYZ.zoom.toString() })
        this.vmixCommand(this.vmix1, cmds)
        await AsyncDelay(200)

        /*  cut preview into program  */
        const vmix = this.vmix2 !== null ? this.vmix2 : this.vmix1
        this.vmixCommand(vmix, { Function: "Cut" })
        await AsyncDelay(50)

        /*  determine drive path from program (which was the preview) to original preview  */
        path = pathCalc(previewXYZ, tempXYZ, fps, duration)
        const xyzLast = path[path.length - 1]

        /*  apply drive path to program (which was the preview)  */
        input = preview
        cam   = previewCam
        vptz  = previewVPTZ

        /*  perform drive operation  */
        await AsyncLoop(() => {
            if (path.length > 0) {
                const xyz = path.shift()!

                /*  change locally  */
                const cam  = this.cfg.camOfInputName(input)
                const vptz = this.cfg.vptzOfInputName(input)
                this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
                this.notifyState(true, cam)

                /*  change vMix  */
                const cmds = [] as Array<vMixCommand>
                cmds.push({ Function: "SetPanX", Input: input, Value: xyz.x.toString() })
                cmds.push({ Function: "SetPanY", Input: input, Value: xyz.y.toString() })
                cmds.push({ Function: "SetZoom", Input: input, Value: xyz.zoom.toString() })
                this.vmixCommand(this.vmix1, cmds)
            }
        }, (cancelled) => {
            this.state.setVPTZ(cam, ptz, vptz, xyzLast)
            this.notifyState(false, cam)
        }, { duration, fps })
    }
}

