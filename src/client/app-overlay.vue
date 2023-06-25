<!--
**
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
**
-->

<template>
    <div class="app-overlay" ref="root" v-bind:style="{ opacity: options.opacity ?? 1.0 }">
        <div v-if="options.cam" ref="canvas" class="canvas">
            {{  options.cam  }}
            <div class="ptz">
                {{ state[options.cam]?.ptz ?? "?" }}
            </div>
            <div
                v-for="vptz in [ 'W-C', 'F-L', 'F-C', 'F-R', 'C-L', 'C-C', 'C-R' ]"
                v-bind:key="vptz"
                class="vptz"
                v-bind:class="{
                    program: state[options.cam].vptz[vptz].program,
                    preview: state[options.cam].vptz[vptz].preview
                }"
                v-bind:style="{
                    left:   (canvas.w * ((state[options.cam].vptz[vptz].x    * camera.w) / camera.w)) + 'px',
                    top:    (canvas.h * ((state[options.cam].vptz[vptz].y    * camera.h) / camera.h)) + 'px',
                    width:  (canvas.w * ((state[options.cam].vptz[vptz].zoom * camera.w) / camera.w)) + 'px',
                    height: (canvas.h * ((state[options.cam].vptz[vptz].zoom * camera.h) / camera.h)) + 'px'
                }">
                <div class="title">{{ vptz }}</div>
            </div>
        </div>
    </div>
</template>

<style lang="stylus" scoped>
.app-overlay
    width: 100%
    height: auto
    aspect-ratio: 16 / 9
    background-color: transparent
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
            top: 0.5vw
            right: 0.5vw
            border-radius: 0.5vw
            padding: 0 1vw 0 1vw
            background-color: var(--color-std-bg-4)
            color: var(--color-std-fg-4)
            font-size: 2vw
            font-weight: bold
        .vptz
            position: absolute
            top: 0
            left: 0
            box-sizing: border-box
            border: 0.25vw solid var(--color-reg-bg-tr)
            border-radius: 0.5vw
            box-shadow: 0 0 0.8vw var(--color-std-bg-1)
            .title
                position: absolute
                top: 0
                left: 0
                padding: 0.1vw 0.5vw 0.1vw 0.1vw
                border: 0
                border-bottom-right-radius: 0.5vw
                background-color: var(--color-reg-bg-tr)
                color: var(--color-reg-fg)
                font-size: 1vw
                line-height: 1vw
                font-weight: bold
            &.preview
                border: 0.25vw solid var(--color-prv-bg-tr)
                z-index: 100
                .title
                    background-color: var(--color-prv-bg-tr)
                    color: var(--color-prv-fg)
            &.program
                border: 0.25vw solid var(--color-prg-bg-tr)
                z-index: 110
                .title
                    background-color: var(--color-prg-bg-tr)
                    color: var(--color-prg-fg)
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
        options: { type: Object, default: {} as { [ key: string ]: string | boolean } }
    },
    data: () => ({
        state: StateDefault as StateType,
        canvas: { w: 0, h: 0 },
        camera: { w: 3840, h: 2160 }
    }),
    async created () {
        if (this.options.cam === undefined)
            throw new Error("missing mandatory option \"cam\"")
    },
    async mounted () {
        const updateCanvasSize = () => {
            const root = this.$refs.root as HTMLElement
            this.canvas.w = root.clientWidth
            this.canvas.h = root.clientHeight
            console.log(this.canvas)
        }
        window.addEventListener("resize", () => {
            updateCanvasSize()
        })
        updateCanvasSize()
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

