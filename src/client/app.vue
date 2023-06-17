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
            v-bind:ws-url="wsURL"
            v-bind:sv-url="svURL"
        ></app-control>

        <!--  Overlay UI  -->
        <app-preview
            ref="overlay"
            v-if="mode === 'overlay'"
            v-bind:options="options"
            v-bind:ws-url="wsURL"
            v-bind:sv-url="svURL"
        ></app-preview>
    </div>
</template>

<script setup lang="ts">
import { defineComponent } from "vue"
import URI                 from "urijs"
import AppControl          from "./app-control.vue"
import AppOverlay          from "./app-overlay.vue"
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
        options:    new Map<string, string | boolean>(),
        svURL:      "",
        wsURL:      ""
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
                        this.options.set(m2[1], m2[2])
                    else
                        this.options.set(opt, true)
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
    }
})
</script>

