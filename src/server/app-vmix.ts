/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

/*  external requirements  */
import path         from "node:path"
import fs           from "node:fs"
import * as vMixAPI from "node-vmix"
import vMixUtils    from "vmix-js-utils"
import EventEmitter from "eventemitter2"
import jsYAML       from "js-yaml"

/*  internal requirements  */
import Argv         from "./app-argv"
import Log          from "./app-log"
import DB           from "./app-db"
import RESTWS       from "./app-rest-ws"

/*  define our vMix input type  */
type vMixInput = {
    num:   number,
    name:  string,
    type:  string,
    x?:    number,
    y?:    number,
    zoom?: number
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

export default class VMix extends EventEmitter {
    /*  internals  */
    private vmix1: vMixAPI.ConnectionTCP | null = null
    private vmix2: vMixAPI.ConnectionTCP | null = null
    private inputs = new Map<string, vMixInput>()
    private tally = {
        preview: [] as Array<string>,
        program: [] as Array<string>
    }
    private ptz = 1
    private vptzSaveTimer: ReturnType<typeof setTimeout> | null = null

    /*  foreigns (injected)  */
    constructor (
        private argv:   Argv,
        private log:    Log,
        private db:     DB,
        private restWS: RESTWS
    ) {
        super()
        this.loadPTZ()
        this.loadVPTZ()
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
            this.log.log(2, `vMix: connection error on vMix #1: ${error.toString()}`)
        })
        this.vmix2?.on("error", (error: Error) => {
            this.log.log(2, `vMix: connection error on vMix #2: ${error.toString()}`)
        })

        /*  react on standard socket connect events  */
        let connected = 0
        const onConnect = () => {
            connected++
            if ((!this.vmix2 && connected === 1) || (this.vmix2 && connected === 2)) {
                connected = 0
                this.restoreVPTZ()
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
            this.tally.preview = tally.preview.map((n) => `${instance}${n}`)
            this.tally.program = tally.program.map((n) => `${instance}${n}`)
            this.emit("tally", this.tally)
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
                    type: input.type
                } as vMixInput
                if (input.type === "VirtualSet") {
                    item.x    = ((input as any).currentPosition?.panX  ?? 0.0) / 2
                    item.y    = ((input as any).currentPosition?.panY  ?? 0.0) / 2
                    item.zoom = ((input as any).currentPosition?.zoomX ?? 1.0)
                }
                this.inputs.set(`${instance}${item.num}`, item)
            }
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

    /*  select (physical) PTZ  */
    setPTZ (slot: number) {
        this.ptz = slot
        this.savePTZ()
        this.loadVPTZ()
    }

    async loadPTZ () {
        const stateFile = path.join(this.argv.stateDir, "state.yaml")
        if (await (fs.promises.stat(stateFile).then(() => true).catch(() => false))) {
            const txt = await this.db.readFile(stateFile)
            const obj = jsYAML.load(txt) as { ptz: number }
            this.ptz = obj.ptz
        }
    }
    async savePTZ () {
        const stateFile = path.join(this.argv.stateDir, "state.yaml")
        const obj = { ptz: this.ptz }
        const txt = jsYAML.dump(obj, { indent: 4, quotingType: "\"" })
        await this.db.writeFile(stateFile, txt)
    }

    async loadVPTZ () {
        const stateFile = path.join(this.argv.stateDir, `state-ptz-${this.ptz}.yaml`)
        if (await (fs.promises.stat(stateFile).then(() => true).catch(() => false))) {
            const txt = await this.db.readFile(stateFile)
            const obj = jsYAML.load(txt) as { ptz: number }
            this.ptz = obj.ptz
            /*  FIXME  */
        }
    }
    async saveVPTZ () {
        if (this.vptzSaveTimer === null) {
            this.vptzSaveTimer = setTimeout(async () => {
                this.vptzSaveTimer = null
                const stateFile = path.join(this.argv.stateDir, `state-ptz-${this.ptz}.yaml`)
                const obj = { ptz: this.ptz }
                /*  FIXME  */
                const txt = jsYAML.dump(obj, { indent: 4, quotingType: "\"" })
                await this.db.writeFile(stateFile, txt)
            }, 10 * 1000)
        }
    }

    /*  restore VPTZ onto vMix  */
    async restoreVPTZ () {
        /*  FIXME  */
    }

    /*  change virtual PTZ  */
    changeVPTZ (input: string, op: string, arg: string) {
        if (op !== "pan" && op !== "zoom")
            throw new Error("invalid operation")
        const fps        = 30
        const duration   = 500
        const deltaPan   = 0.10
        const deltaZoom  = 0.10
        let   func1      = ""
        let   func2      = ""
        let   value1     = ""
        let   value2     = ""
        let   delta      = 0
        if (op === "pan") {
            delta = deltaPan
            if (arg === "up-left") {
                func1  = "SetPanY"
                func2  = "SetPanX"
                value1 = "-="
                value2 = "+="
            }
            else if (arg === "up") {
                func1  = "SetPanY"
                value1 = "-="
            }
            else if (arg === "up-right") {
                func1  = "SetPanY"
                func2  = "SetPanX"
                value1 = "-="
                value2 = "-="
            }
            else if (arg === "left") {
                func1  = "SetPanX"
                value1 = "+="
            }
            else if (arg === "reset") {
                func1  = "SetPanY"
                func2  = "SetPanX"
            }
            else if (arg === "right") {
                func1  = "SetPanX"
                value1 = "-="
            }
            else if (arg === "down-left") {
                func1  = "SetPanY"
                func2  = "SetPanX"
                value1 = "+="
                value2 = "+="
            }
            else if (arg === "down") {
                func1  = "SetPanY"
                value1 = "+="
            }
            else if (arg === "down-right") {
                func1  = "SetPanY"
                func2  = "SetPanX"
                value1 = "+="
                value2 = "-="
            }
            else
                throw new Error("invalid argument")
        }
        else if (op === "zoom") {
            delta = deltaZoom
            func1 = "SetZoom"
            if (arg === "reset") {
                /*  no-op  */
            }
            else if (arg === "decrease")
                value1 = "-="
            else if (arg === "increase")
                value1 = "+="
            else
                throw new Error("invalid argument")
        }
        const steps = duration / (1000 / fps)
        const deltaStep = delta / steps
        if (value1 !== "")
            value1 = `${value1}${deltaStep}`
        else
            value1 = "0"
        if (func2 !== "") {
            if (value2 !== "")
                value2 = `${value2}${deltaStep}`
            else
                value2 = "0"
        }
        const funcs = [] as Array<{Function: string, Input: string, Value: string }>
        funcs.push({ Function: func1, Input: input, Value: value1 })
        if (func2 !== "")
            funcs.push({ Function: func2, Input: input, Value: value2 })
        return AsyncLoop(() => {
            this.vmix1?.send(funcs)
        }, (cancelled) => {
            this.saveVPTZ()
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

