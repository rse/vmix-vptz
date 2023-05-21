<!--
**
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
**
-->

<template>
    <div class="app-preview" ref="root">
        <div ref="canvas" class="canvas">
            <div ref="preview" class="preview"
                v-bind:style="{
                    left:   (canvas.w * (state.preview.x / camera.w)) + 'px',
                    top:    (canvas.h * (state.preview.y / camera.h)) + 'px',
                    width:  (canvas.w * (state.preview.w / camera.w)) + 'px',
                    height: (canvas.h * (state.preview.h / camera.h)) + 'px'
                }"
            >
                <div class="title">
                    <span class="type">PREVIEW:</span>
                    <span class="name">{{ state.preview.n }}</span>
                </div>
            </div>
            <div ref="program" class="program"
                v-bind:style="{
                    left:   (canvas.w * (state.program.x / camera.w)) + 'px',
                    top:    (canvas.h * (state.program.y / camera.h)) + 'px',
                    width:  (canvas.w * (state.program.w / camera.w)) + 'px',
                    height: (canvas.h * (state.program.h / camera.h)) + 'px'
                }"
            >
                <div class="title">
                     <span class="type">PROGRAM:</span>
                     <span class="name">{{ state.program.n }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="stylus">
.app-preview
    width: 100%
    height: auto
    aspect-ratio: 16 / 9
    border: 1px solid red
    .canvas
        position: relative
        width: 100%
        height: auto
        aspect-ratio: 16 / 9
        touch-action: none
        border: 0
        outline: none
        background-color: transparent
        .preview
            position: absolute
            top: 0
            left: 0
            box-sizing: border-box
            border: 4px solid #009900
            background-color: #00990020
            .title
                background-color: #009900
        .program
            position: absolute
            top: 0
            left: 0
            box-sizing: border-box
            border: 4px solid #cc0000
            background-color: #cc000020
            .title
                background-color: #cc0000
        .title
            position: absolute
            bottom: -4px
            left: -4px
            border-top-right-radius: 8px
            padding: 0 8px 0 8px
            color: #ffffff
            font-size: 1.3vw
            .type
                font-weight: 200
            .name
                font-weight: bold
</style>

<script setup lang="ts">
import { defineComponent }        from "vue"
import RecWebSocket               from "reconnecting-websocket"
import Ducky                      from "ducky"
import moment                     from "moment"
import axios                      from "axios"
import { StateType, StateSchema, StateDefault } from "../common/app-state"
import { number } from "joi"
</script>

<script lang="ts">
export default defineComponent({
    name: "app-preview",
    components: {},
    props: {
        options: { type: Object, default: new Map<string, string | boolean>() },
        svUrl:   { type: String, default: "" },
        wsUrl:   { type: String, default: "" }
    },
    data: () => ({
        state: StateDefault as StateType,
        canvas: { w: 0, h: 0 },
        camera: { w: 3840, h: 2160 }
    }),
    async mounted () {
        /*  connect to server for PTZ and state updates  */
        this.log("INFO", "establish WebSocket server connection")
        const ws = new RecWebSocket(this.wsUrl + "/preview", [], {
            reconnectionDelayGrowFactor: 1.3,
            maxReconnectionDelay:        4000,
            minReconnectionDelay:        1000,
            connectionTimeout:           4000,
            minUptime:                   5000
        })
        let opened = 0
        ws.addEventListener("open", (ev) => {
            if (opened++ > 0)
                this.log("INFO", "re-established WebSocket server connection")
        })
        ws.addEventListener("error", (ev) => {
            this.log("WARNING", "WebSocket server connection error")
        })
        ws.addEventListener("message", (ev: MessageEvent): void => {
            if (typeof ev.data !== "string") {
                this.log("WARNING", "invalid WebSocket server message received")
                return
            }
            const data: any = JSON.parse(ev.data)
            if (!(typeof data === "object" && typeof data.cmd === "string" && data.arg !== undefined)) {
                this.log("WARNING", "invalid WebSocket server message received")
                return
            }
            if (data.cmd === "STATE") {
                const state = data.arg.state as StateType
                const errors = [] as Array<string>
                if (!Ducky.validate(state, StateSchema, errors)) {
                    this.log("WARNING", `invalid schema of loaded state: ${errors.join(", ")}`)
                    return
                }
                this.state = state
            }
        })

        /*  load scene state once  */
        this.log("INFO", "initially configuring scene")
        const state = await axios({
            method: "GET",
            url:    `${this.svUrl}state`
        }).then((response) => response.data).catch(() => null)
        if (state === null)
            throw new Error("failed to load state")
        const errors = [] as Array<string>
        if (!Ducky.validate(state, StateSchema, errors))
            throw new Error(`invalid schema of loaded state: ${errors.join(", ")}`)
        // this.state = state as StateType

        const fetchCanvasSize = () => {
            const root = this.$refs.root as HTMLElement
            this.canvas.w = root.clientWidth
            this.canvas.h = root.clientHeight
        }
        window.addEventListener("resize", () => {
            fetchCanvasSize()
        })
        fetchCanvasSize()
    },
    methods: {
        log (level: string, msg: string) {
            const timestamp = moment().format("YYYY-MM-DD hh:mm:ss.SSS")
            console.log(`${timestamp} [${level}]: ${msg}`)
        }
    }
})
</script>

