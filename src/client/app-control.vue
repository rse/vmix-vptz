<!--
**
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
**
-->

<template>
    <div class="app-control">
        <!--  HEADER  -->
        <div class="head">
            <img class="logo" src="./app-icon.svg" alt="" />
            VMIX VPTZ CONTROL
        </div>

        <!--  BODY  -->
        <div class="body">
            <app-overlay
                ref="overlay"
                v-bind:options="{}"
                v-bind:ws-url="wsUrl"
                v-bind:sv-url="svUrl"
            ></app-overlay>
        </div>

        <!--  FOOTER  -->
        <div class="foot" v-bind:class="{
            error:   status.kind === 'error',
            warning: status.kind === 'warning',
            info:    status.kind === 'info'
        }">
            <!--  Application Status Information  -->
            <div class="status">
                {{ status.kind === '' ? `${pkg.name} ${pkg.version} (${pkg["x-date"]})` : status.msg }}
            </div>

            <!--  Server Connection Information  -->
            <div class="connection">
                <!--  Online  -->
                <div class="online yes" v-show="connection.online">
                    <i class="fa-solid fa-plug-circle-check"></i>
                </div>
                <div class="online no" v-show="!connection.online">
                    <i class="fa-solid fa-plug-circle-xmark"></i>
                </div>

                <!--  Traffic Send  -->
                <div class="traffic send" v-bind:class="{ active: connection.send }">
                    <i class="fa-solid fa-circle"></i>
                </div>

                <!--  Traffic Recv  -->
                <div class="traffic recv" v-bind:class="{ active: connection.recv }">
                    <i class="fa-solid fa-circle"></i>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="stylus">
.app-control
    width:  100vw
    height: 100vh
    min-width: 900px
    min-height: 600px
    background-color: var(--color-std-bg-1)
    overflow: hidden
    margin: 0
    padding: 0
    display: flex
    flex-direction: column
    justify-items: center
    align-items: center
    .head
        background-color: var(--color-std-bg-3)
        color: var(--color-std-fg-1)
        padding: 10px 40px
        width:  calc(100% - 2 * 40px)
        height: 20px
        font-weight: 200
        font-size: 20px
        line-height: 20px
        position: relative
        .logo
            position: relative
            top: 2px
            height: 20px
            margin-right: 10px
    .body
        flex-grow: 1
        background-color: var(--color-std-bg-2)
        color: var(--color-std-fg-5)
        padding: 10px 10px
        width:  calc(100% - 2 * 10px)
        height: calc(100% - 2 * 10px)
        overflow: hidden
        .app-overlay
            width: 400px
            height: auto
            aspect-ratio: 16 / 9
            border: 1px solid white
            background-color: #444444
    .foot
        background-color: var(--color-std-bg-3)
        color: var(--color-std-fg-1)
        padding: 13px 40px
        width:  calc(100% - 2 * 40px)
        height: 14px
        font-weight: 200
        font-size: 14px
        line-height: 14px
        display: flex
        flex-direction: row
        justify-items: center
        align-items: center
        &.info
            font-weight: normal
            background-color: var(--color-std-bg-5)
            color: var(--color-std-fg-5)
        &.warning
            font-weight: bold
            background-color: var(--color-acc-bg-3)
            color: var(--color-acc-fg-5)
        &.error
            font-weight: bold
            background-color: var(--color-sig-bg-3)
            color: var(--color-sig-fg-5)
        .status
            flex-grow: 1
        .connection
            background-color: var(--color-std-bg-3)
            border: 1px solid var(--color-std-bg-2)
            border-radius: 4px
            padding: 4px 8px 4px 8px
            display: flex
            flex-direction: row
            justify-items: center
            align-items: center
            .online
                margin-right: 8px
                &.yes
                    color: var(--color-std-fg-1)
                &.no
                    color: var(--color-sig-fg-1)
            .traffic
                &.send
                    margin-right: 4px
                    color: var(--color-std-fg-1)
                    &.active
                        color: var(--color-sig-fg-1)
                &.recv
                    color: var(--color-std-fg-1)
                    &.active
                        color: var(--color-acc-fg-1)
</style>

<script setup lang="ts">
// @ts-ignore
import pkg                 from "../../package.json"
import { defineComponent } from "vue"
import RecWebSocket        from "reconnecting-websocket"
import Ducky               from "ducky"
import axios               from "axios"
import AppOverlay          from "./app-overlay.vue"
import { StateType, StateSchema, StateDefault } from "../common/app-state"
</script>

<script lang="ts">
let statusTimer: ReturnType<typeof setTimeout> | null = null
export default defineComponent({
    name: "app-control",
    components: {
        "app-overlay": AppOverlay
    },
    props: {
        svUrl: { type: String, default: "" },
        wsUrl: { type: String, default: "" }
    },
    data: () => ({
        state: StateDefault as StateType,
        status: {
            kind: "",
            msg:  ""
        },
        connection: {
            online: false,
            send:   false,
            recv:   false
        },
        pkg
    }),
    async created () {
    },
    async mounted () {
        /*  establish server connection  */
        const ws = new RecWebSocket(this.wsUrl + "/control", [], {
            reconnectionDelayGrowFactor: 1.3,
            maxReconnectionDelay:        4000,
            minReconnectionDelay:        1000,
            connectionTimeout:           4000,
            minUptime:                   5000
        })
        ws.addEventListener("open", (ev) => {
            this.connection.online = true
        })
        ws.addEventListener("close", (ev) => {
            this.connection.online = false
            this.raiseStatus("error", "WebSocket connection failed/closed", 2000)
        })

        /*  receive server messages  */
        ws.addEventListener("message", (ev: MessageEvent) => {
            this.connection.recv = true
            setTimeout(() => {
                this.connection.recv = false
            }, 250)
            if (typeof ev.data !== "string") {
                this.raiseStatus("warning", "invalid WebSocket message received", 1000)
                return
            }
            const data: any = JSON.parse(ev.data)
            if (!(typeof data === "object" && typeof data.cmd === "string" && data.arg !== undefined)) {
                this.raiseStatus("warning", "invalid WebSocket message received", 1000)
                return
            }
            if (data.cmd === "STATE") {
                const state = data.arg.state as StateType
                const errors = [] as Array<string>
                if (!Ducky.validate(state, StateSchema, errors))
                    throw new Error(`invalid schema of loaded state: ${errors.join(", ")}`)
                this.state = state
            }
        })
    },
    methods: {
        /*  raise a temporaily visible status message in the footer  */
        raiseStatus (kind: string, msg: string, duration = 4000) {
            this.status.kind = kind
            this.status.msg  = msg
            if (statusTimer !== null)
                clearTimeout(statusTimer)
            statusTimer = setTimeout(() => {
                this.status.kind = ""
                this.status.msg  = ""
                statusTimer = null
            }, duration)
        },

        async sendOperation (op: string, arg: string) {
            this.connection.send = true
            await axios({
                method: "GET",
                url:    `${this.svUrl}${op}/${arg}`
            }).then((response) => response.data).catch(() => null).finally(() => {
                this.connection.send = false
            })
        }
    }
})
</script>

