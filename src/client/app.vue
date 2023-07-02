<!--
**
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
**
-->

<template>
    <div class="app">
        <!--  Control UI  -->
        <app-control
            ref="control"
            v-if="mode === 'control'"
            v-bind:options="options"
            v-on:log="onLog"
        ></app-control>

        <!--  Overlay UI  -->
        <app-overlay
            ref="overlay"
            v-if="mode === 'overlay'"
            v-bind:options="options"
            v-on:log="onLog"
        ></app-overlay>
    </div>
</template>

<script setup lang="ts">
import { defineComponent, toHandlerKey, toHandlers } from "vue"
import URI                 from "urijs"
import RecWebSocket        from "reconnecting-websocket"
import Ducky               from "ducky"
import moment              from "moment"
import axios               from "axios"

import AppControl          from "./app-control.vue"
import AppOverlay          from "./app-overlay.vue"
import {
    StateType,
    StateSchema,
    StateDefault
}                          from "../common/app-state"
</script>

<script lang="ts">
export default defineComponent({
    name: "app",
    components: {
        "app-control": AppControl,
        "app-overlay": AppOverlay
    },
    data: () => ({
        mode:       "control",
        options:    {} as { [ key: string ]: string | boolean },
        svURL:      "",
        wsURL:      "",
        state:      StateDefault as StateType,
        online:     false
    }),
    created () {
        /*  determine mode  */
        let url = new URI(window.location.href)
        const hash = url.hash()
        let m
        if ((m = hash.match(/^#\/(.+?)(?:\?(.+))?$/)) !== null) {
            this.mode = m[1]
            if (m[2]) {
                const opts = m[2].split("&")
                for (const opt of opts) {
                    let m2
                    if ((m2 = opt.match(/^(.+)=(.+)$/)) !== null)
                        this.options[m2[1]] = m2[2]
                    else
                        this.options[opt] = true
                }
            }
        }
        else
            window.location.href = "#/control"

        /*  determine URL for WebSocket connections  */
        url = new URI(window.location.href)
        url.protocol(`ws${url.protocol() === "https" ? "s" : ""}`)
        url.pathname("/ws")
        url.search("")
        url.hash("")
        this.wsURL = url.toString()

        /*  determine URL for REST connections  */
        url = new URI(window.location.href)
        url.pathname("")
        url.search("")
        url.hash("")
        this.svURL = url.toString()
    },
    async mounted () {
        /*  load state once  */
        this.log("INFO", "initially loading state")
        const state = await axios({
            method: "GET",
            url:    `${this.svURL}state`
        }).then((response) => response.data).catch(() => null)
        if (state !== null) {
            const errors = [] as Array<string>
            if (Ducky.validate(state, StateSchema, errors))
                this.setState(state as StateType)
            else
                this.log("ERROR", `invalid schema of received state: ${errors.join(", ")}`)
        }
        else
            this.log("ERROR", "failed to state")

        /*  establish server connection  */
        const ws = new RecWebSocket(this.wsURL + `/${this.mode}/${this.options.cam ?? "all"}`, [], {
            reconnectionDelayGrowFactor: 1.3,
            maxReconnectionDelay:        4000,
            minReconnectionDelay:        1000,
            connectionTimeout:           4000,
            minUptime:                   5000
        })
        ws.addEventListener("open", (ev) => {
            this.online = true
        })
        ws.addEventListener("close", (ev) => {
            this.online = false
            this.log("ERROR", "WebSocket connection failed/closed")
        })

        /*  receive server messages  */
        ws.addEventListener("message", (ev: MessageEvent) => {
            if (typeof ev.data !== "string") {
                this.log("WARNING", "invalid WebSocket message received")
                return
            }
            const data: any = JSON.parse(ev.data)
            if (!(typeof data === "object" && typeof data.cmd === "string" && data.arg !== undefined)) {
                this.log("WARNING", "invalid WebSocket message received")
                return
            }
            if (data.cmd === "STATE") {
                const state = data.arg.state as StateType
                const errors = [] as Array<string>
                if (Ducky.validate(state, StateSchema, errors))
                    this.setState(state)
                else
                    this.log("WARNING", `invalid schema of received state: ${errors.join(", ")}`)
            }
        })
    },
    methods: {
        log (level: string, msg: string) {
            const timestamp = moment().format("YYYY-MM-DD hh:mm:ss.SSS")
            console.log(`${timestamp} [${level}]: ${msg}`)
        },
        onLog (level: string, msg: string) {
            this.log(level, msg)
        },
        setState (state: StateType) {
            this.state = state
            if (this.mode === "control" && this.$refs.control)
                (this.$refs.control as typeof AppControl).setState(this.state)
            if (this.mode === "overlay" && this.$refs.overlay)
                (this.$refs.overlay as typeof AppOverlay).setState(this.state)
        }
    }
})
</script>

