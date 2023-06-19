<!--
**
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
**
-->

<template>
    <div class="app-overlay" ref="root">
        <div ref="canvas" class="canvas">
            <div class="ptz">
                {{ state[options.cam].ptz }}
            </div>
            <div
                v-for="vptz in [ 'C-L', 'C-C', 'C-R', 'F-L', 'F-C', 'F-R', 'W-C' ]"
                v-bind:key="vptz"
                class="vptz"
                v-bind:class="{
                    program: state[options.cam].vptz[vptz].program,
                    preview: state[options.cam].vptz[vptz].preview
                }"
                v-bind:style="{
                    left:   (canvas.w * ( state[options.cam].vptz[vptz].x                / camera.w)) + 'px',
                    top:    (canvas.h * ( state[options.cam].vptz[vptz].y                / camera.h)) + 'px',
                    width:  (canvas.w * ((state[options.cam].vptz[vptz].zoom * canvas.w) / camera.w)) + 'px',
                    height: (canvas.h * ((state[options.cam].vptz[vptz].zoom * canvas.h) / camera.h)) + 'px'
                }">
                <div class="title">{{ vptz }}</div>
            </div>
        </div>
    </div>
</template>

<style lang="stylus">
.app-overlay
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
        .ptz
            position: absolute
            top: 0
            right: 0
            border-bottom-left-radius: 8px
            padding: 0 8px 0 8px
            color: #ffffff
            font-size: 1.3vw
            font-weight: bold
        .vptz
            position: absolute
            top: 0
            left: 0
            box-sizing: border-box
            .title
                position: absolute
                bottom: -4px
                left: -4px
                border-top-right-radius: 8px
                padding: 0 8px 0 8px
                color: #ffffff
                font-size: 1.3vw
                font-weight: bold
            &.preview
                border: 4px solid #009900
                background-color: #00990020
                .title
                    background-color: #009900
            &.program
                border: 4px solid #cc0000
                background-color: #cc000020
                .title
                    background-color: #cc0000
</style>

<script setup lang="ts">
import { defineComponent }         from "vue"
import { StateType, StateDefault } from "../common/app-state"
</script>

<script lang="ts">
export default defineComponent({
    name: "app-overlay",
    components: {},
    props: {
        options: { type: Object, default: new Map<string, string | boolean>() }
    },
    data: () => ({
        state: StateDefault as StateType,
        canvas: { w: 0, h: 0 },
        camera: { w: 3840, h: 2160 }
    }),
    async mounted () {
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
        setState (state: StateType) {
            this.state = state
        },
        log (level: string, msg: string) {
            this.$emit("log", level, msg)
        }
    }
})
</script>

