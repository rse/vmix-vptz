/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023-2024 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import path           from "node:path"
import http           from "node:http"
import * as HAPI      from "@hapi/hapi"
import Boom           from "@hapi/boom"
import { Server }     from "@hapi/hapi"
import Inert          from "@hapi/inert"
import HAPIWebSocket  from "hapi-plugin-websocket"
import HAPIHeader     from "hapi-plugin-header"
import HAPITraffic    from "hapi-plugin-traffic"
import HAPIDucky      from "hapi-plugin-ducky"
import ducky          from "ducky"
import WebSocket      from "ws"

import Pkg            from "./app-pkg"
import Argv           from "./app-argv"
import Log            from "./app-log"
import Cfg            from "./app-cfg"
import VMix           from "./app-vmix"

import { StateType }  from "../common/app-state"

export default class REST {
    public server: Server | null = null

    constructor (
        private pkg:    Pkg,
        private argv:   Argv,
        private log:    Log,
        private cfg:    Cfg,
        private vmix:   VMix
    ) {}

    async init () {
        /*  establish network service  */
        this.server = new Server({
            address: this.argv.httpAddr,
            port:    this.argv.httpPort
        })
        await this.server.register({ plugin: Inert })
        await this.server.register({
            plugin: HAPIHeader,
            options: {
                Server: `${this.pkg.name}/${this.pkg.version}`
            }
        })
        await this.server.register({ plugin: HAPITraffic })
        await this.server.register({ plugin: HAPIWebSocket })
        await this.server.register({ plugin: HAPIDucky })

        /*  hook into network service logging  */
        this.server.events.on("response", (request: HAPI.Request) => {
            const traffic = request.traffic()
            let protocol = `HTTP/${request.raw.req.httpVersion}`
            const ws = request.websocket()
            if (ws.mode === "websocket") {
                const wsVersion = (ws.ws as any).protocolVersion ??
                    request.headers["sec-websocket-version"] ?? "13?"
                protocol = `WebSocket/${wsVersion}+${protocol}`
            }
            const msg =
                "remote="   + request.info.remoteAddress + ", " +
                "method="   + request.method.toUpperCase() + ", " +
                "url="      + request.url.pathname + ", " +
                "protocol=" + protocol + ", " +
                "response=" + ("statusCode" in request.response ? request.response.statusCode : "<unknown>") + ", " +
                "recv="     + traffic.recvPayload + "/" + traffic.recvRaw + ", " +
                "sent="     + traffic.sentPayload + "/" + traffic.sentRaw + ", " +
                "duration=" + traffic.timeDuration
            this.log.log(2, `HAPI: request: ${msg}`)
        })
        this.server.events.on({ name: "request", channels: [ "error" ] }, (request: HAPI.Request, event: HAPI.RequestEvent, tags: { [key: string]: true }) => {
            if (event.error instanceof Error)
                this.log.log(0, `HAPI: request-error: ${event.error.message}`)
            else
                this.log.log(0, `HAPI: request-error: ${event.error}`)
        })
        this.server.events.on("log", (event: HAPI.LogEvent, tags: { [key: string]: true }) => {
            if (tags.error) {
                const err = event.error
                if (err instanceof Error)
                    this.log.log(2, `HAPI: log: ${err.message}`)
                else
                    this.log.log(2, `HAPI: log: ${err}`)
            }
        })

        /*  ==== Endpoint: User Interface (Files) ====  */

        /*  serve static client files  */
        this.server.route({
            method: "GET",
            path: "/{param*}",
            handler: {
                directory: {
                    path: path.join(__dirname, "../../dst/client"),
                    redirectToSlash: true,
                    index: true
                }
            }
        })

        /*  ==== Endpoint: User Interface (State) ====  */

        /*  load current state  */
        this.server.route({
            method: "GET",
            path: "/state",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                const state = await this.vmix.getState()
                return h.response(state).code(200)
            }
        })

        /*  serve WebSocket connections  */
        type wsPeerCtx = {
            id:   string
        }
        type wsPeerInfo = {
            ctx:  wsPeerCtx
            ws:   WebSocket
            req:  http.IncomingMessage
            peer: string,
            cam:  string
        }
        const wsPeers = new Map<string, wsPeerInfo>()
        const stats = {
            peers: {} as { [ peer: string ]: number }
        }
        this.server.route({
            method: "POST",
            path:   "/ws/{peer}/{cam}",
            options: {
                plugins: {
                    websocket: {
                        only: true,
                        autoping: 30 * 1000,

                        /*  on WebSocket connection open  */
                        connect: (args: any) => {
                            const ctx: wsPeerCtx            = args.ctx
                            const ws:  WebSocket            = args.ws
                            const req: http.IncomingMessage = args.req
                            const m = req.url?.match(/^\/ws\/(control|overlay)\/(.+)$/) ?? null
                            const peer = m !== null ? m[1] : "unknown"
                            const cam  = m !== null ? m[2] : "all"
                            const id = `${req.socket.remoteAddress}:${req.socket.remotePort}`
                            ctx.id = id
                            wsPeers.set(id, { ctx, ws, req, peer, cam })
                            if (stats.peers[peer] === undefined)
                                stats.peers[peer] = 0
                            stats.peers[peer]++
                            this.log.log(2, `WebSocket: connect: remote=${id} peer=${peer} cam=${cam}`)
                        },

                        /*  on WebSocket connection close  */
                        disconnect: (args: any) => {
                            const ctx: wsPeerCtx = args.ctx
                            const id = ctx.id
                            const peer = wsPeers.get(id)?.peer ?? "unknown"
                            const cam  = wsPeers.get(id)?.cam  ?? "all"
                            if (stats.peers[peer] !== undefined)
                                stats.peers[peer]--
                            wsPeers.delete(id)
                            this.log.log(2, `WebSocket: disconnect: remote=${id} peer=${peer} cam=${cam}`)
                        }
                    }
                }
            },
            handler: async (request: HAPI.Request, h: HAPI.ResponseToolkit) => {
                /*  on WebSocket message transfer  */
                if (typeof request.payload !== "object" || request.payload === null)
                    return Boom.badRequest("invalid request")
                if (!ducky.validate(request.payload, "{ cmd: string, arg?: string }"))
                    return Boom.badRequest("invalid request")
                const { cmd } = request.payload as any satisfies { cmd: string, arg: any }
                if (cmd === "STATE") {
                    const data = await this.vmix.getState(false)
                    const json = JSON.stringify({ cmd: "STATE", arg: { state: data } })
                    return h.response(json).code(200)
                }
                else
                    return Boom.badRequest("not implemented")
            }
        })

        /*  notify clients about state  */
        const notifyState = (state: StateType, cams: Map<string, boolean>) => {
            const msg = JSON.stringify({ cmd: "STATE", arg: { state } })
            for (const info of wsPeers.values()) {
                if (info.cam === "all" || cams.get(info.cam) === true) {
                    this.log.log(3, `WebSocket: notify: peer=${info.peer} cam=${info.cam}`)
                    if (info.ws.readyState === WebSocket.OPEN)
                        info.ws.send(msg)
                }
            }
        }

        /*  notify clients about internal events  */
        const notifyClient = (message: string, data: any = {}) => {
            const msg = JSON.stringify({ cmd: "NOTIFY", arg: { message, data } })
            for (const info of wsPeers.values()) {
                this.log.log(3, `WebSocket: notify: message=${message}`)
                if (info.ws.readyState === WebSocket.OPEN)
                    info.ws.send(msg)
            }
        }

        /*  forward state changes to clients  */
        let notifyTimer: ReturnType<typeof setTimeout> | null = null
        let notifyData:  StateType | null = null
        let notifyCams = new Map<string, boolean>()
        this.vmix.on("state-change", async ({ cached = false, cams = "*" }) => {
            for (const cam of cams.split(",")) {
                if (cam === "*") {
                    for (const c of this.cfg.idCAMs)
                        notifyCams.set(c, true)
                }
                else
                    notifyCams.set(cam, true)
            }
            notifyData = await this.vmix.getState(cached)
            if (notifyTimer === null) {
                notifyTimer = setTimeout(() => {
                    notifyTimer = null
                    if (notifyData !== null) {
                        const data = notifyData
                        const cams = notifyCams
                        notifyData = null
                        notifyCams = new Map<string, boolean>()
                        notifyState(data, cams)
                    }
                }, 33 * 2)
            }
        })

        /*  ==== Endpoint: State Backup/Restore ====  */

        /*  manually restore/send the state to vMix  */
        this.server.route({
            method: "GET",
            path: "/state/restore",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                queue = queue.then(() => {
                    return this.vmix.restoreState()
                }).catch((err) => {
                    this.log.log(0, `HAPI: error: ${err.toString()}`)
                })
                return h.response().code(204)
            }
        })

        /*  ==== Endpoint: PTZ Switching ====  */

        let queue = Promise.resolve()

        /*  PTZ action on all cameras  */
        this.server.route({
            method: "GET",
            path: "/ptz/{ptz}/{mode}",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                const ptz  = req.params.ptz
                const mode = req.params.mode
                queue = queue.then(() => {
                    if (mode === "load")
                        return this.vmix.setPTZAll(ptz)
                    else if (mode === "save")
                        return this.vmix.storePTZAll(ptz)
                    else if (mode === "reset")
                        return this.vmix.resetPTZAll(ptz)
                    else if (mode === "clear")
                        return this.vmix.clearPTZAll(ptz)
                }).catch((err) => {
                    this.log.log(0, `HAPI: error: ${err.toString()}`)
                })
                return h.response().code(204)
            }
        })

        /*  PTZ action on single camera  */
        this.server.route({
            method: "GET",
            path: "/ptz/{ptz}/{cam}/{mode}",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                const ptz  = req.params.ptz
                const cam  = req.params.cam
                const mode = req.params.mode
                queue = queue.then(() => {
                    if (mode === "load")
                        return this.vmix.setPTZCam(ptz, cam)
                    else if (mode === "save")
                        return this.vmix.storePTZCam(ptz, cam)
                    else if (mode === "reset")
                        return this.vmix.resetPTZCam(ptz, cam)
                    else if (mode === "clear")
                        return this.vmix.clearPTZCam(ptz, cam)
                }).catch((err) => {
                    this.log.log(0, `HAPI: error: ${err.toString()}`)
                })
                return h.response().code(204)
            }
        })

        /*  PTZ action on single camera (which the UI currently has selected)  */
        this.server.route({
            method: "GET",
            path: "/ptz/save",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                notifyClient("saveCurrentPTZ")
                return h.response().code(204)
            }
        })

        /*  PTZ action on single camera (known by controller)  */
        this.server.route({
            method: "GET",
            path: "/ptz/save/{cam}",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                const cam  = req.params.cam
                notifyClient("saveCurrentPTZ", { cam })
                return h.response().code(204)
            }
        })

        /*  change PTZ/VPTZ (joystick)  */
        this.server.route({
            method: "GET",
            path: "/joystick/{mode}/{cam}/{vptz}/{op}/{arg}/{speed}",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                const mode  = req.params.mode
                const cam   = req.params.cam
                const vptz  = req.params.vptz
                const op    = req.params.op
                const arg   = req.params.arg
                const speed = req.params.speed
                queue = queue.then(() => {
                    if (mode === "ptz")
                        return this.vmix.changePTZ(cam, op, arg, speed)
                    else if (mode === "vptz")
                        return this.vmix.changeVPTZ(cam, vptz, op, arg, speed)
                    else
                        throw new Error("invalid mode")
                }).catch((err) => {
                    this.log.log(0, `HAPI: error: ${err.toString()}`)
                })
                return h.response().code(204)
            }
        })

        /*  ==== Endpoint: VPTZ Adjustment ====  */

        /*  set VPTZ x/y/zoom  */
        this.server.route({
            method: "GET",
            path: "/vptz/{cam}/{vptz}/xyz/{x}/{y}/{zoom}",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                const cam   = req.params.cam
                const vptz  = req.params.vptz
                const x     = parseFloat(req.params.x)
                const y     = parseFloat(req.params.y)
                const zoom  = parseFloat(req.params.zoom)
                queue = queue.then(() => {
                    return this.vmix.xyzVPTZ(cam, vptz, x, y, zoom)
                }).catch((err) => {
                    this.log.log(0, `HAPI: error: ${err.toString()}`)
                })
                return h.response().code(204)
            }
        })

        /*  select VPTZ into preview  */
        this.server.route({
            method: "GET",
            path: "/vptz/{cam}/{vptz}/select",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                const cam   = req.params.cam
                const vptz  = req.params.vptz
                queue = queue.then(() => {
                    return this.vmix.selectVPTZ(cam, vptz)
                }).catch((err) => {
                    this.log.log(0, `HAPI: error: ${err.toString()}`)
                })
                return h.response().code(204)
            }
        })

        /*  drive preview into program  */
        this.server.route({
            method: "GET",
            path: "/mixer/{op}/{speed}",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                const op    = req.params.op
                const speed = req.params.speed
                if (op === "cut") {
                    queue = queue.then(() => {
                        return this.vmix.cut()
                    }).catch((err) => {
                        this.log.log(0, `HAPI: error: ${err.toString()}`)
                    })
                }
                else if (op === "drive") {
                    queue = queue.then(() => {
                        return this.vmix.drive(speed)
                    }).catch((err) => {
                        this.log.log(0, `HAPI: error: ${err.toString()}`)
                    })
                }
                else
                    return Boom.badRequest("invalid mixer operation")
                return h.response().code(204)
            }
        })
    }

    async start () {
        /*  start service  */
        if (this.server !== null) {
            await this.server.start()
            this.log.log(2, `started HTTP network service: http://${this.argv.httpAddr}:${this.argv.httpPort}`)
        }
    }

    async shutdown () {
        /*  stop service  */
        if (this.server !== null) {
            this.log.log(2, "stopping HTTP network service")
            await this.server.stop()
        }
    }
}
