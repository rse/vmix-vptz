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
            <div class="overlay-container">
                <div class="overlay-grid">
                    <div class="overlay-box overlay-cam1">
                        <div class="title">CAM1</div>
                        <app-overlay
                            ref="overlay-cam1"
                            v-bind:options="{ cam: '1' }"
                        ></app-overlay>
                    </div>
                    <div class="overlay-box overlay-cam2">
                        <div class="title">CAM2</div>
                        <app-overlay
                            ref="overlay-cam2"
                            v-bind:options="{ cam: '2' }"
                        ></app-overlay>
                    </div>
                    <div class="overlay-box overlay-cam3">
                        <div class="title">CAM3</div>
                        <app-overlay
                            ref="overlay-cam3"
                            v-bind:options="{ cam: '3' }"
                        ></app-overlay>
                    </div>
                    <div class="overlay-box overlay-cam4">
                        <div class="title">CAM4</div>
                        <app-overlay
                            ref="overlay-cam4"
                            v-bind:options="{ cam: '4' }"
                        ></app-overlay>
                    </div>
                    <div class="overlay-box overlay-cam5">
                        <div class="title">CAM5</div>
                        <app-overlay
                            ref="overlay-cam5"
                            v-bind:options="{ cam: '5' }"
                        ></app-overlay>
                    </div>
                </div>
            </div>
        </div>

        <!--  FOOTER  -->
        <div class="foot">
            <div class="status">
                {{ `${pkg.name} ${pkg.version} (${pkg["x-date"]})` }}
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
    justify-content: center
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
        padding: 10px 10px 20px 10px
        width:  calc(100% - 2 * 10px)
        height: calc(100% - 10px - 20px)
        overflow: hidden
        display: flex
        flex-direction: row
        justify-content: center
        align-items: center
        .overlay-container
            flex-grow: 1
            display: flex
            flex-direction: column
            justify-content: center
            align-items: center
            max-width: 100%
            max-height: 100%
            aspect-ratio: 16 / 9
            .overlay-grid
                flex-grow: 1
                max-width: 100%
                max-height: 100%
                box-sizing: border-box
                aspect-ratio: 16 / 9
                display: grid
                grid-template-columns: 1fr 1fr 1fr
                grid-template-rows:    1fr 1fr 1fr
                grid-template-areas:   ".    cam5 .   " "cam1 cam2 cam4" ".    cam3 .   "
                gap: 10px
                .overlay-box
                    position: relative
                    max-width: 100%
                    max-height: 100%
                    aspect-ratio: 16 / 9
                    background-color: var(--color-std-bg-3)
                    box-sizing: border-box
                    .title
                        position: absolute
                        top: 0
                        left: 0
                        border-bottom-right-radius: 0.3rem
                        padding: 0.1rem 0.4rem
                        background-color: var(--color-std-bg-4)
                        color: var(--color-std-fg-5)
                        font-size: 1.3rem
                        font-weight: bold
                    .app-overlay
                        position: absolute
                        top: 0
                        left: 0
                        width: 100%
                        height: 100%
                .overlay-cam1
                    grid-area: cam1
                .overlay-cam2
                    grid-area: cam2
                .overlay-cam3
                    grid-area: cam3
                .overlay-cam4
                    grid-area: cam4
                .overlay-cam5
                    grid-area: cam5
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
        justify-content: center
        align-items: center
        .status
            flex-grow: 1
</style>

<script setup lang="ts">
// @ts-ignore
import pkg                 from "../../package.json"
import { defineComponent } from "vue"
import axios               from "axios"
import AppOverlay          from "./app-overlay.vue"
import { StateType, StateSchema, StateDefault } from "../common/app-state"
</script>

<script lang="ts">
export default defineComponent({
    name: "app-control",
    components: {
        "app-overlay": AppOverlay
    },
    props: {
        options: { type: Object, default: new Map<string, string | boolean>() },
        svUrl:   { type: String, default: "" }
    },
    data: () => ({
        state: StateDefault as StateType,
        pkg
    }),
    async created () {
    },
    methods: {
        setState (state: StateType) {
            this.state = state
        },
        log (level: string, msg: string) {
            this.$emit("log", level, msg)
        },
        async sendOperation (op: string) {
            await axios({
                method: "GET",
                url:    `${this.svUrl}${op}`
            }).then((response) => response.data).catch(() => null)
        }
    }
})
</script>

