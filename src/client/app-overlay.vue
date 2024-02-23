<!--
**
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023-2024 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
**
-->

<template>
    <div class="app-overlay" ref="root" v-bind:style="style">
        <div v-if="options.cam" ref="canvas" class="canvas"
            v-on:dragenter="(ev) => { ev.preventDefault(); return false }"
            v-on:dragover="(ev) => { ev.preventDefault(); return false }">
            <div class="ptz">
                {{ state[options.cam]?.ptz ?? "?" }}
            </div>
            <div
                v-for="vptz in [ 'W-C', 'F-L', 'F-C', 'F-R', 'C-L', 'C-C', 'C-R' ]"
                v-bind:key="vptz"
                draggable="true"
                v-on:dragstart="(ev) => drag(vptz, 'start', ev)"
                v-on:dragend="(ev) => drag(vptz, 'end', ev)"
                v-on:wheel="(ev) => resize(vptz, ev)"
                class="vptz"
                v-bind:class="{
                    program: state[options.cam].vptz[vptz].program,
                    preview: state[options.cam].vptz[vptz].preview,
                    dragging: state[options.cam].vptz[vptz].preview && dragging
                }"
                v-bind:style="{
                    left:   vptzCoordX(vptz) + 'px',
                    top:    vptzCoordY(vptz) + 'px',
                    width:  vptzCoordW(vptz) + 'px',
                    height: vptzCoordH(vptz) + 'px'
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
    opacity: var(--opacity)
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
            top: calc(0.5vw * var(--scale))
            right: calc(0.5vw * var(--scale))
            border-radius: calc(0.5vw * var(--scale))
            padding: 0 calc(1vw * var(--scale)) 0 calc(1vw * var(--scale))
            background-color: var(--color-reg-bg-tr)
            color: var(--color-reg-fg)
            font-size: calc(1.5vw * var(--scale))
            font-weight: bold
        .vptz
            position: absolute
            top: 0
            left: 0
            box-sizing: border-box
            border: calc(0.2vw * var(--scale)) solid var(--color-reg-bg-tr)
            border-radius: calc(0.4vw * var(--scale))
            box-shadow: 0 0 calc(0.8vw * var(--scale)) var(--color-std-bg-1)
            .title
                position: absolute
                top: 0
                left: 0
                padding: calc(0.1vw * var(--scale)) calc(0.5vw * var(--scale)) calc(0.1vw * var(--scale)) calc(0.1vw * var(--scale))
                border: 0
                border-bottom-right-radius: calc(0.5vw * var(--scale))
                background-color: var(--color-reg-bg-tr)
                color: var(--color-reg-fg)
                font-size: calc(1vw * var(--scale))
                line-height: calc(1vw * var(--scale))
                font-weight: bold
            &.preview
                border: calc(0.4vw * var(--scale)) solid var(--color-prv-bg-tr)
                z-index: 110
                .title
                    background-color: var(--color-prv-bg-tr)
                    color: var(--color-prv-fg)
                &:hover
                    border: calc(0.4vw * var(--scale)) solid var(--color-hov-bg-tr)
                    .title
                        background-color: var(--color-hov-bg-tr)
                        color: var(--color-hov-fg)
                &.dragging
                    border: calc(0.4vw * var(--scale)) solid var(--color-drg-bg-tr)
                    .title
                        background-color: var(--color-drg-bg-tr)
                        color: var(--color-drg-fg)
            &.program
                border: calc(0.4vw * var(--scale)) solid var(--color-prg-bg-tr)
                z-index: 100
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
        camera: { w: 3840, h: 2160 },
        dragging: false,
        draggedX: 0,
        draggedY: 0
    }),
    computed: {
        style: function () {
            const css = {} as { [ key: string ]: string }
            for (const key of Object.keys((this as any).options))
                css[`--${key}`] = (this as any).options[key]
            return css
        }
    },
    async created () {
        if (this.options.cam === undefined)
            throw new Error("missing mandatory option \"cam\"")
    },
    async mounted () {
        const updateCanvasSize = () => {
            const root = this.$refs.root as HTMLElement
            this.canvas.w = root.clientWidth
            this.canvas.h = root.clientHeight
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
        },
        vptzCoordX (vptz: string) {
            const x    = this.state[this.options.cam].vptz[vptz].x
            const zoom = this.state[this.options.cam].vptz[vptz].zoom
            return ((this.canvas.w / 2) +
                (this.canvas.w * (1 / zoom) * (-x / 2)) -
                ((this.canvas.w * (1 / zoom)) / 2))
        },
        vptzCoordY (vptz: string) {
            const y    = this.state[this.options.cam].vptz[vptz].y
            const zoom = this.state[this.options.cam].vptz[vptz].zoom
            return ((this.canvas.h / 2) -
                (this.canvas.h * (1 / zoom) * (-y / 2)) -
                ((this.canvas.h * (1 / zoom)) / 2))
        },
        vptzCoordW (vptz: string) {
            const zoom = this.state[this.options.cam].vptz[vptz].zoom
            return (this.canvas.w * (1 / zoom))
        },
        vptzCoordH (vptz: string) {
            const zoom = this.state[this.options.cam].vptz[vptz].zoom
            return (this.canvas.h * (1 / zoom))
        },
        vptzCoordXInv (vptz: string, x: number) {
            const zoom = this.state[this.options.cam].vptz[vptz].zoom
            return (2 * -(
                (x - (this.canvas.w / 2) + ((this.canvas.w * (1 / zoom)) / 2)) /
                (this.canvas.w * (1 / zoom))))
        },
        vptzCoordYInv (vptz: string, y: number) {
            const zoom = this.state[this.options.cam].vptz[vptz].zoom
            return (2 * (
                (y - (this.canvas.h / 2) + ((this.canvas.h * (1 / zoom)) / 2)) /
                (this.canvas.h * (1 / zoom))))
        },
        drag (vptz: string, state: string, ev: DragEvent) {
            /*  ignore drag attempts on non-preview element  */
            if (!this.state[this.options.cam].vptz[vptz].preview) {
                ev.preventDefault()
                return
            }

            /*  dispatch according to drag state...  */
            if (state === "start" && !this.dragging) {
                /*  start dragging operation and remember position  */
                this.dragging = true
                this.draggedX = ev.clientX
                this.draggedY = ev.clientY
            }
            else if (state === "end" && this.dragging) {
                /*  stop dragging operation and determine position delta  */
                this.dragging = false
                this.draggedX = ev.clientX - this.draggedX
                this.draggedY = ev.clientY - this.draggedY

                /*  support cancelling dragging operation (pressing escape)  */
                if (ev.dataTransfer?.dropEffect === "none") {
                    ev.preventDefault()
                    return
                }

                /*  recalculate the start position/size  */
                const zoom   = this.state[this.options.cam].vptz[vptz].zoom
                const left   = this.vptzCoordX(vptz)
                const top    = this.vptzCoordY(vptz)
                const width  = this.vptzCoordW(vptz)
                const height = this.vptzCoordH(vptz)

                /*  determine new/end position  */
                let leftN = left + this.draggedX
                let topN  = top  + this.draggedY

                /*  ensure that the new/end position keeps the area without the canvas  */
                if (leftN < 0)                     leftN = 0
                if (leftN > this.canvas.w - width) leftN = this.canvas.w - width
                if (topN < 0)                      topN = 0
                if (topN > this.canvas.h - height) topN = this.canvas.h - height

                /*  invert calculate the original x/y coordinates  */
                const x = this.vptzCoordXInv(vptz, leftN)
                const y = this.vptzCoordYInv(vptz, topN)

                /*  emit new XYZ information  */
                const xyz = { vptz, x, y, zoom }
                this.$emit("xyz", xyz)
            }
        },
        resize (vptz: string, ev: WheelEvent) {
            /*  ignore resize attempts on non-preview element  */
            if (!this.state[this.options.cam].vptz[vptz].preview) {
                ev.preventDefault()
                return
            }

            /*  determine XYZ information  */
            const x  = this.state[this.options.cam].vptz[vptz].x
            const y  = this.state[this.options.cam].vptz[vptz].y
            let zoom = this.state[this.options.cam].vptz[vptz].zoom

            /*  adjust zoom with wheel delta  */
            const delta = ev.deltaY * 0.01 /* usually -1/+1  */
            zoom += delta * 0.05

            /*  emit new XYZ information  */
            const xyz = { vptz, x, y, zoom }
            this.$emit("xyz", xyz)
        }
    }
})
</script>

