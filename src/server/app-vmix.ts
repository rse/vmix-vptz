/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

/*  external requirements  */
import * as vMixAPI from "node-vmix"
import vMixUtils    from "vmix-js-utils"
import XPath        from "xpath-ts2"
import EventEmitter from "eventemitter2"

/*  internal requirements  */
import Argv         from "./app-argv"
import Log          from "./app-log"
import Cfg          from "./app-cfg"
import State        from "./app-state"
import type { PTZ, VPTZ, XYZ } from "./app-state"

/*  define our vMix input type  */
type vMixInput = {
    num:   number,
    name:  string,
    type:  string,
    xyz:   XYZ
}

/*  define vMix command and XYZ modification operation  */
type CMD = { f: string, v: string }
type MOD = (xyz: XYZ) => void

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
                step()
                await new Promise((resolve, reject) => {
                    setTimeout(() => resolve(true), timeSlice)
                })
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
    private vptzSaveTimer: ReturnType<typeof setTimeout> | null = null // FIXME: unused

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
        /*  establish connection to vMix instance(s)  */
        const [ hostA, portA ] = this.argv.vmix1Addr.split(":")
        const [ hostB, portB ] = this.argv.vmix1Addr.split(":")
        this.log.log(2, `vMix: establish connection to vMix #1 at "${this.argv.vmix1Addr}"`)
        this.vmix1 = new vMixAPI.ConnectionTCP(hostA,
            { port: parseInt(portA), debug: false, autoReconnect: true })
        if (hostA !== hostB || portA !== portB) {
            this.log.log(2, `vMix: establish connection to vMix #2 at "${this.argv.vmix1Addr}"`)
            this.vmix2 = new vMixAPI.ConnectionTCP(hostB,
                { port: parseInt(portB), debug: false, autoReconnect: true })
        }

        /*  react on standard socket error events  */
        this.vmix1.on("error", (error: Error) => {
            this.log.log(1, `vMix: connection error on vMix #1: ${error.toString()}`)
        })
        this.vmix2?.on("error", (error: Error) => {
            this.log.log(1, `vMix: connection error on vMix #2: ${error.toString()}`)
        })

        /*  react on standard socket connect events  */
        let initialized = 0
        const onConnect = () => {
            initialized++
            if ((!this.vmix2 && initialized === 1) || (this.vmix2 && initialized === 2)) {
                initialized = 0
                this.restoreState()
            }
        }
        this.vmix1.on("connect", () => {
            this.log.log(2, "vMix: connection established to vMix #1")
            this.vmix1!.send("XML")
            if (!this.vmix2)
                this.vmix1!.send("SUBSCRIBE TALLY")
            onConnect()
        })
        this.vmix2?.on("connect", () => {
            this.log.log(2, "vMix: connection established to vMix #2")
            this.vmix2!.send("XML")
            this.vmix2!.send("SUBSCRIBE TALLY")
            onConnect()
        })

        /*  react on custom TALLY events  */
        const onTallyStatus = (instance: "A" | "B", data: string) => {
            const tally = vMixUtils.TcpTally.extractSummary(data)
            this.tally.preview = tally.preview.map((n) => `${instance}:${n}`)
            this.tally.program = tally.program.map((n) => `${instance}:${n}`)
            this.emit("tally", this.tally)
            this.vmix1!.send("XML")
            this.vmix2?.send("XML")
        }
        this.vmix1.on("tally", (data: string) => {
            this.log.log(2, "vMix: received TALLY status on vMix #1")
            onTallyStatus("A", data)
        })
        this.vmix2?.on("tally", (data: string) => {
            this.log.log(2, "vMix: received TALLY status on vMix #2")
            onTallyStatus("B", data)
        })

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
            let n = XPath.select1("/vmix/active", doc).toString()
            this.active.program[instance] = this.inputs.get(`${instance}:${n}`)?.name ?? ""
            n = XPath.select1("/vmix/preview", doc).toString()
            this.active.preview[instance] = this.inputs.get(`${instance}:${n}`)?.name ?? ""
        }
        this.vmix1.on("xml", (xml: string) => {
            this.log.log(2, "vMix: received XML status on vMix #1")
            onXmlStatus("A", xml)
        })
        this.vmix2?.on("tally", (xml: string) => {
            this.log.log(2, "vMix: received XML status on vMix #2")
            onXmlStatus("B", xml)
        })

        /*  react on standard socket close events  */
        this.vmix1.on("close", () => {
            this.log.log(2, "vMix: connection closed to vMix #1")
        })
        this.vmix2?.on("close", () => {
            this.log.log(2, "vMix: connection closed to vMix #2")
        })
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

    getState () {
        return {} // FIXME: TODO
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
                this.log.log(2, `vMix: backup vMix state of camera "${cam}" and physical PTZ "${ptz}"`)

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
                const cmds = [] as Array<{ Function: string, Input: string, Value?: string }>
                for (const vptz of this.cfg.idVPTZs) {
                    this.log.log(2, `vMix: restore virtual PTZ "${vptz}" of camera "${cam}"`)
                    const xyz = await this.state.getVPTZ(cam, ptz, vptz)
                    this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
                    const input = this.cfg.inputNameVPTZ(cam, vptz)
                    cmds.push({ Function: "SetPanX", Input: input, Value: (xyz.x * 2).toString() })
                    cmds.push({ Function: "SetPanY", Input: input, Value: (xyz.y * 2).toString() })
                    cmds.push({ Function: "SetZoom", Input: input, Value: (xyz.zoom ).toString() })
                }
                this.vmix1?.send(cmds)
            }
        })
    }

    /*  activate all physical PTZ of a camera  */
    async setPTZAll (ptz: string) {
        this.log.log(2, `vMix: activating physical PTZ "${ptz}" of all cameras`)
        for (const cam of this.cfg.idCAMs)
            this.setPTZCam(cam, ptz)
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
        this.vmix1?.send([
            { Function: "PTZMoveToVirtualInputPosition", Input: input1 },
            { Function: "PTZUpdateVirtualInput",         Input: input2 }
        ])

        /*  load corresponding VPTZ settings and update vMix VirtualSet inputs  */
        this.state.transaction(async () => {
            const cmds = [] as Array<{ Function: string, Input: string, Value?: string }>
            for (const vptz of this.cfg.idVPTZs) {
                this.log.log(2, `vMix: activating virtual PTZ "${vptz}" of camera "${cam}"`)
                const xyz = await this.state.getVPTZ(cam, ptz, vptz)
                this.vptz2xyz.set(`${cam}:${vptz}`, xyz)
                const input = this.cfg.inputNameVPTZ(cam, vptz)
                cmds.push({ Function: "SetPanX", Input: input, Value: (xyz.x * 2).toString() })
                cmds.push({ Function: "SetPanY", Input: input, Value: (xyz.y * 2).toString() })
                cmds.push({ Function: "SetZoom", Input: input, Value: (xyz.zoom ).toString() })
            }
            this.vmix1?.send(cmds)
        })
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
        const deltaPan   = 0.10
        const deltaZoom  = 0.10

        /*  variables  */
        let   cmd1: CMD | null = null
        let   cmd2: CMD | null = null
        let   mod1: MOD | null = null
        let   mod2: MOD | null = null

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
                mod1 = (xyz: XYZ) => { xyz.y -= delta }
                mod2 = (xyz: XYZ) => { xyz.x += delta }
            }
            else if (arg === "up") {
                cmd1 = { f: "SetPanY", v: `-=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.y -= delta }
            }
            else if (arg === "up-right") {
                cmd1 = { f: "SetPanY", v: `-=${delta}` }
                cmd2 = { f: "SetPanX", v: `-=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.y -= delta }
                mod2 = (xyz: XYZ) => { xyz.x -= delta }
            }
            else if (arg === "left") {
                cmd1 = { f: "SetPanX", v: `+=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.x += delta }
            }
            else if (arg === "right") {
                cmd1 = { f: "SetPanX", v: `-=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.x -= delta }
            }
            else if (arg === "down-left") {
                cmd1 = { f: "SetPanY", v: `+=${delta}` }
                cmd2 = { f: "SetPanX", v: `+=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.y += delta }
                mod2 = (xyz: XYZ) => { xyz.x += delta }
            }
            else if (arg === "down") {
                cmd1 = { f: "SetPanY", v: `+=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.y += delta }
            }
            else if (arg === "down-right") {
                cmd1 = { f: "SetPanY", v: `+=${delta}` }
                cmd2 = { f: "SetPanX", v: `-=${delta}` }
                mod1 = (xyz: XYZ) => { xyz.y += delta }
                mod2 = (xyz: XYZ) => { xyz.x -= delta }
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
        const cmds = [] as Array<{Function: string, Input: string, Value?: string }>
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
        await AsyncLoop(() => {
            this.vmix1?.send(cmds)
            mod1!(xyz!)
            if (mod2 !== null)
                mod2!(xyz!)
        }, (cancelled) => {
            this.state.setVPTZ(cam, ptz, vptz, xyz!)
        }, { duration, fps })
    }

    /*  cut preview into program  */
    cutPreview (mode: "apply" | "cut" = "cut") {
        const areOnSameCamera = true
        if (areOnSameCamera) {
            if (mode === "apply") {
                /*  mode 1: apply VPTZ of preview directly onto program  */
            }
            else {
                /*  mode 2: temporarily apply VPTZ of program to preview,
                    cut preview into program and apply previous VPTZ again  */
            }
        }
        else {
            /*  mode 3: not on same camera, so just cut preview to program  */
            this.vmix1?.send({ Function: "Cut" })
        }
    }
}

