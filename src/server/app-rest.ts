/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
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
import VMix           from "./app-vmix"

import { StateType }  from "../common/app-state"

export default class REST {
    public server: Server | null = null
    constructor (
        private pkg:    Pkg,
        private argv:   Argv,
        private log:    Log,
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
                const state  = this.vmix.getState
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
            peer: string
        }
        const wsPeers = new Map<string, wsPeerInfo>()
        const stats = {
            peers: {} as { [ peer: string ]: number }
        }
        this.server.route({
            method: "POST",
            path:   "/ws/{peer}",
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
                            const m = req.url!.match(/^\/ws\/(control|overlay)$/)
                            const peer = m !== null ? m[1] : "unknown"
                            const id = `${req.socket.remoteAddress}:${req.socket.remotePort}`
                            ctx.id = id
                            wsPeers.set(id, { ctx, ws, req, peer })
                            if (stats.peers[peer] === undefined)
                                stats.peers[peer] = 0
                            stats.peers[peer]++
                            this.log.log(2, `WebSocket: connect: remote=${id}`)
                        },

                        /*  on WebSocket connection close  */
                        disconnect: (args: any) => {
                            const ctx: wsPeerCtx = args.ctx
                            const id = ctx.id
                            const peer = wsPeers.get(id)!.peer
                            if (stats.peers[peer] !== undefined)
                                stats.peers[peer]--
                            wsPeers.delete(id)
                            this.log.log(2, `WebSocket: disconnect: remote=${id}`)
                        }
                    }
                }
            },
            handler: (request: HAPI.Request, h: HAPI.ResponseToolkit) => {
                /*  on WebSocket message transfer  */
                const { ctx, ws } = request.websocket()
                if (typeof request.payload !== "object" || request.payload === null)
                    return Boom.badRequest("invalid request")
                if (!ducky.validate(request.payload, "{ cmd: string, arg?: string }"))
                    return Boom.badRequest("invalid request")
                const { cmd, arg } = request.payload as any satisfies { cmd: string, arg: any }
                return Boom.badRequest("not implemented") // FIXME
                return h.response().code(204)
            }
        })

        /*  notify clients about state  */
        const notifyState = (state: StateType) => {
            const msg = JSON.stringify({ cmd: "STATE", arg: { state } })
            for (const info of wsPeers.values())
                info.ws.send(msg)
        }

        /*  ==== Endpoint: State Backup/Restore ====  */

        /*  manually backup the state of vMix  */
        this.server.route({
            method: "GET",
            path: "/state/backup",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                queue = queue.then(() => {
                    return this.vmix.backupState()
                })
                return h.response().code(204)
            }
        })

        /*  manually restore the state of vMix  */
        this.server.route({
            method: "GET",
            path: "/state/restore",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                queue = queue.then(() => {
                    return this.vmix.restoreState()
                })
                return h.response().code(204)
            }
        })

        /*  ==== Endpoint: PTZ Switching ====  */

        let queue = Promise.resolve()

        /*  select PTZ of all cameras  */
        this.server.route({
            method: "GET",
            path: "/ptz/{ptz}",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                const ptz = req.params.ptz
                queue = queue.then(() => {
                    return this.vmix.setPTZAll(ptz)
                })
                return h.response().code(204)
            }
        })

        /*  select PTZ of single camera  */
        this.server.route({
            method: "GET",
            path: "/ptz/{ptz}/{cam}",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                const ptz = req.params.ptz
                const cam = req.params.cam
                queue = queue.then(() => {
                    return this.vmix.setPTZCam(ptz, cam)
                })
                return h.response().code(204)
            }
        })

        /*  ==== Endpoint: VPTZ Adjustment ====  */

        /*  change VPTZ  */
        this.server.route({
            method: "GET",
            path: "/vptz/{cam}/{vptz}/{op}/{arg}",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                const cam   = req.params.cam
                const vptz  = req.params.vptz
                const op    = req.params.op
                const arg   = req.params.arg
                queue = queue.then(() => {
                    this.vmix.changeVPTZ(cam, vptz, op, arg)
                })
                return h.response().code(204)
            }
        })

        /*  cut preview into program  */
        this.server.route({
            method: "GET",
            path: "/cut/{mode}",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                const mode = req.params.mode
                queue = queue.then(() => {
                    this.vmix.cutPreview(mode)
                })
                return h.response().code(204)
            }
        })
    }
    async start () {
        /*  start service  */
        await this.server!.start()
        this.log.log(2, `started HTTP  network service: http://${this.argv.httpAddr}:${this.argv.httpPort}`)
    }
    async shutdown () {
        if (this.server !== null) {
            this.log.log(2, "stopping HTTP network service")
            await this.server.stop()
        }
    }
}
