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
                    <div class="control-box control-box-global">
                        <div class="title">MIXER &amp; STATE</div>
                        <div class="control-grid control-grid-global">
                            <div class="button ga-01" v-on:click="mixer('cut')"><span class="icon"><i class="fa-solid fa-cut"></i></span> CUT</div>
                            <div class="button ga-02" v-on:click="mixer('drive')" v-bind:class="{ disabled: programCam !== previewCam }"><span class="icon"><i class="fa-solid fa-route"></i></span> CUT+DRIVE</div>
                            <div class="button ga-03" v-on:click="mixer('apply')" v-bind:class="{ disabled: programCam !== previewCam }"><span class="icon"><i class="fa-solid fa-route"></i></span> DRIVE</div>
                            <div class="button ga-04 destructive"><span class="icon"><i class="fa-solid fa-download"></i></span> RECV</div>
                            <div class="button ga-05 destructive"><span class="icon"><i class="fa-solid fa-upload"></i></span> SENT</div>
                        </div>
                    </div>
                    <div class="control-box control-box-ptz">
                        <div v-if="ptzMode === 'load'" class="title">
                            CAM+PTZ ACTIVATE
                        </div>
                        <div v-if="ptzMode === 'save'" class="title">
                            CAM+PTZ STORE
                        </div>
                        <div v-if="ptzMode === 'reset'" class="title">
                            CAM+PTZ RESET
                        </div>
                        <div v-if="ptzMode === 'clear'" class="title">
                            CAM+PTZ CLEAR
                        </div>
                        <div class="control-grid control-grid-ptz">
                            <div class="button ga-01"
                                v-bind:class="{ active: ptzMode === 'load' }"
                                v-on:click="ptzMode = 'load'">
                                <span class="icon"><i class="fa-solid fa-hand-pointer"></i></span>
                            </div>
                            <div class="button ga-02 destructive"
                                v-bind:class="{ active: ptzMode === 'save' }"
                                v-on:click="ptzMode = 'save'">
                                <span class="icon"><i class="fa-solid fa-gear"></i></span>
                            </div>
                            <div class="button ga-03 destructive"
                                v-bind:class="{ active: ptzMode === 'reset' }"
                                v-on:click="ptzMode = 'reset'">
                                <span class="icon"><i class="fa-solid fa-palette"></i></span>
                            </div>
                            <div class="button ga-04 destructive"
                                v-bind:class="{ active: ptzMode === 'clear' }"
                                v-on:click="ptzMode = 'clear'">
                                <span class="icon"><i class="fa-solid fa-maximize"></i></span>
                            </div>
                            <div class="button ga-05" v-bind:class="{ active: state['1'].ptz === 'A', preview: state['1'].ptz === 'A' && previewCam === '1', destructive: ptzMode !== 'load' }" v-on:click="ptz('A', '1')">A1</div>
                            <div class="button ga-06" v-bind:class="{ active: state['2'].ptz === 'A', preview: state['2'].ptz === 'A' && previewCam === '2', destructive: ptzMode !== 'load' }" v-on:click="ptz('A', '2')">A2</div>
                            <div class="button ga-07" v-bind:class="{ active: state['3'].ptz === 'A', preview: state['3'].ptz === 'A' && previewCam === '3', destructive: ptzMode !== 'load' }" v-on:click="ptz('A', '3')">A3</div>
                            <div class="button ga-08" v-bind:class="{ active: state['4'].ptz === 'A', preview: state['4'].ptz === 'A' && previewCam === '4', destructive: ptzMode !== 'load' }" v-on:click="ptz('A', '4')">A4</div>
                            <div class="button ga-09" v-bind:class="{ active: state['5'].ptz === 'A', preview: state['5'].ptz === 'A' && previewCam === '5', destructive: ptzMode !== 'load' }" v-on:click="ptz('A', '5')">A5</div>
                            <div class="button ga-10" v-bind:class="{ active: state['1'].ptz === 'A' && state['2'].ptz === 'A' && state['3'].ptz === 'A' && state['4'].ptz === 'A' && state['5'].ptz === 'A', destructive: ptzMode !== 'load' }" v-on:click="ptz('A')">A</div>
                            <div class="button ga-11" v-bind:class="{ active: state['1'].ptz === 'B', preview: state['1'].ptz === 'B' && previewCam === '1', destructive: ptzMode !== 'load' }" v-on:click="ptz('B', '1')">B1</div>
                            <div class="button ga-12" v-bind:class="{ active: state['2'].ptz === 'B', preview: state['2'].ptz === 'B' && previewCam === '2', destructive: ptzMode !== 'load' }" v-on:click="ptz('B', '2')">B2</div>
                            <div class="button ga-13" v-bind:class="{ active: state['3'].ptz === 'B', preview: state['3'].ptz === 'B' && previewCam === '3', destructive: ptzMode !== 'load' }" v-on:click="ptz('B', '3')">B3</div>
                            <div class="button ga-14" v-bind:class="{ active: state['4'].ptz === 'B', preview: state['4'].ptz === 'B' && previewCam === '4', destructive: ptzMode !== 'load' }" v-on:click="ptz('B', '4')">B4</div>
                            <div class="button ga-15" v-bind:class="{ active: state['5'].ptz === 'B', preview: state['5'].ptz === 'B' && previewCam === '5', destructive: ptzMode !== 'load' }" v-on:click="ptz('B', '5')">B5</div>
                            <div class="button ga-16" v-bind:class="{ active: state['1'].ptz === 'B' && state['2'].ptz === 'B' && state['3'].ptz === 'B' && state['4'].ptz === 'B' && state['5'].ptz === 'B', destructive: ptzMode !== 'load' }" v-on:click="ptz('B')">B</div>
                            <div class="button ga-17" v-bind:class="{ active: state['1'].ptz === 'C', preview: state['1'].ptz === 'C' && previewCam === '1', destructive: ptzMode !== 'load' }" v-on:click="ptz('C', '1')">C1</div>
                            <div class="button ga-18" v-bind:class="{ active: state['2'].ptz === 'C', preview: state['2'].ptz === 'C' && previewCam === '2', destructive: ptzMode !== 'load' }" v-on:click="ptz('C', '2')">C2</div>
                            <div class="button ga-19" v-bind:class="{ active: state['3'].ptz === 'C', preview: state['3'].ptz === 'C' && previewCam === '3', destructive: ptzMode !== 'load' }" v-on:click="ptz('C', '3')">C3</div>
                            <div class="button ga-20" v-bind:class="{ active: state['4'].ptz === 'C', preview: state['4'].ptz === 'C' && previewCam === '4', destructive: ptzMode !== 'load' }" v-on:click="ptz('C', '4')">C4</div>
                            <div class="button ga-21" v-bind:class="{ active: state['5'].ptz === 'C', preview: state['5'].ptz === 'C' && previewCam === '5', destructive: ptzMode !== 'load' }" v-on:click="ptz('C', '5')">C5</div>
                            <div class="button ga-22" v-bind:class="{ active: state['1'].ptz === 'C' && state['2'].ptz === 'C' && state['3'].ptz === 'C' && state['4'].ptz === 'C' && state['5'].ptz === 'C', destructive: ptzMode !== 'load' }" v-on:click="ptz('C')">C</div>
                            <div class="button ga-23" v-bind:class="{ active: state['1'].ptz === 'D', preview: state['1'].ptz === 'D' && previewCam === '1', destructive: ptzMode !== 'load' }" v-on:click="ptz('D', '1')">D1</div>
                            <div class="button ga-24" v-bind:class="{ active: state['2'].ptz === 'D', preview: state['2'].ptz === 'D' && previewCam === '2', destructive: ptzMode !== 'load' }" v-on:click="ptz('D', '2')">D2</div>
                            <div class="button ga-25" v-bind:class="{ active: state['3'].ptz === 'D', preview: state['3'].ptz === 'D' && previewCam === '3', destructive: ptzMode !== 'load' }" v-on:click="ptz('D', '3')">D3</div>
                            <div class="button ga-26" v-bind:class="{ active: state['4'].ptz === 'D', preview: state['4'].ptz === 'D' && previewCam === '4', destructive: ptzMode !== 'load' }" v-on:click="ptz('D', '4')">D4</div>
                            <div class="button ga-27" v-bind:class="{ active: state['5'].ptz === 'D', preview: state['5'].ptz === 'D' && previewCam === '5', destructive: ptzMode !== 'load' }" v-on:click="ptz('D', '5')">D5</div>
                            <div class="button ga-28" v-bind:class="{ active: state['1'].ptz === 'D' && state['2'].ptz === 'D' && state['3'].ptz === 'D' && state['4'].ptz === 'D' && state['5'].ptz === 'D', destructive: ptzMode !== 'load' }" v-on:click="ptz('D')">D</div>
                            <div class="button ga-29" v-bind:class="{ active: state['1'].ptz === 'E', preview: state['1'].ptz === 'E' && previewCam === '1', destructive: ptzMode !== 'load' }" v-on:click="ptz('E', '1')">E1</div>
                            <div class="button ga-30" v-bind:class="{ active: state['2'].ptz === 'E', preview: state['2'].ptz === 'E' && previewCam === '2', destructive: ptzMode !== 'load' }" v-on:click="ptz('E', '2')">E2</div>
                            <div class="button ga-31" v-bind:class="{ active: state['3'].ptz === 'E', preview: state['3'].ptz === 'E' && previewCam === '3', destructive: ptzMode !== 'load' }" v-on:click="ptz('E', '3')">E3</div>
                            <div class="button ga-32" v-bind:class="{ active: state['4'].ptz === 'E', preview: state['4'].ptz === 'E' && previewCam === '4', destructive: ptzMode !== 'load' }" v-on:click="ptz('E', '4')">E4</div>
                            <div class="button ga-33" v-bind:class="{ active: state['5'].ptz === 'E', preview: state['5'].ptz === 'E' && previewCam === '5', destructive: ptzMode !== 'load' }" v-on:click="ptz('E', '5')">E5</div>
                            <div class="button ga-34" v-bind:class="{ active: state['1'].ptz === 'E' && state['2'].ptz === 'E' && state['3'].ptz === 'E' && state['4'].ptz === 'E' && state['5'].ptz === 'E', destructive: ptzMode !== 'load' }" v-on:click="ptz('E')">E</div>
                            <div class="button ga-35" v-bind:class="{ active: state['1'].ptz === 'F', preview: state['1'].ptz === 'F' && previewCam === '1', destructive: ptzMode !== 'load' }" v-on:click="ptz('F', '1')">F1</div>
                            <div class="button ga-36" v-bind:class="{ active: state['2'].ptz === 'F', preview: state['2'].ptz === 'F' && previewCam === '2', destructive: ptzMode !== 'load' }" v-on:click="ptz('F', '2')">F2</div>
                            <div class="button ga-37" v-bind:class="{ active: state['3'].ptz === 'F', preview: state['3'].ptz === 'F' && previewCam === '3', destructive: ptzMode !== 'load' }" v-on:click="ptz('F', '3')">F3</div>
                            <div class="button ga-38" v-bind:class="{ active: state['4'].ptz === 'F', preview: state['4'].ptz === 'F' && previewCam === '4', destructive: ptzMode !== 'load' }" v-on:click="ptz('F', '4')">F4</div>
                            <div class="button ga-39" v-bind:class="{ active: state['5'].ptz === 'F', preview: state['5'].ptz === 'F' && previewCam === '5', destructive: ptzMode !== 'load' }" v-on:click="ptz('F', '5')">F5</div>
                            <div class="button ga-40" v-bind:class="{ active: state['1'].ptz === 'F' && state['2'].ptz === 'F' && state['3'].ptz === 'F' && state['4'].ptz === 'F' && state['5'].ptz === 'F', destructive: ptzMode !== 'load' }" v-on:click="ptz('F')">F</div>
                            <div class="button ga-41" v-bind:class="{ active: state['1'].ptz === 'G', preview: state['1'].ptz === 'G' && previewCam === '1', destructive: ptzMode !== 'load' }" v-on:click="ptz('G', '1')">G1</div>
                            <div class="button ga-42" v-bind:class="{ active: state['2'].ptz === 'G', preview: state['2'].ptz === 'G' && previewCam === '2', destructive: ptzMode !== 'load' }" v-on:click="ptz('G', '2')">G2</div>
                            <div class="button ga-43" v-bind:class="{ active: state['3'].ptz === 'G', preview: state['3'].ptz === 'G' && previewCam === '3', destructive: ptzMode !== 'load' }" v-on:click="ptz('G', '3')">G3</div>
                            <div class="button ga-44" v-bind:class="{ active: state['4'].ptz === 'G', preview: state['4'].ptz === 'G' && previewCam === '4', destructive: ptzMode !== 'load' }" v-on:click="ptz('G', '4')">G4</div>
                            <div class="button ga-45" v-bind:class="{ active: state['5'].ptz === 'G', preview: state['5'].ptz === 'G' && previewCam === '5', destructive: ptzMode !== 'load' }" v-on:click="ptz('G', '5')">G5</div>
                            <div class="button ga-46" v-bind:class="{ active: state['1'].ptz === 'G' && state['2'].ptz === 'G' && state['3'].ptz === 'G' && state['4'].ptz === 'G' && state['5'].ptz === 'G', destructive: ptzMode !== 'load' }" v-on:click="ptz('G')">G</div>
                            <div class="button ga-47" v-bind:class="{ active: state['1'].ptz === 'H', preview: state['1'].ptz === 'H' && previewCam === '1', destructive: ptzMode !== 'load' }" v-on:click="ptz('H', '1')">H1</div>
                            <div class="button ga-48" v-bind:class="{ active: state['2'].ptz === 'H', preview: state['2'].ptz === 'H' && previewCam === '2', destructive: ptzMode !== 'load' }" v-on:click="ptz('H', '2')">H2</div>
                            <div class="button ga-49" v-bind:class="{ active: state['3'].ptz === 'H', preview: state['3'].ptz === 'H' && previewCam === '3', destructive: ptzMode !== 'load' }" v-on:click="ptz('H', '3')">H3</div>
                            <div class="button ga-50" v-bind:class="{ active: state['4'].ptz === 'H', preview: state['4'].ptz === 'H' && previewCam === '4', destructive: ptzMode !== 'load' }" v-on:click="ptz('H', '4')">H4</div>
                            <div class="button ga-51" v-bind:class="{ active: state['5'].ptz === 'H', preview: state['5'].ptz === 'H' && previewCam === '5', destructive: ptzMode !== 'load' }" v-on:click="ptz('H', '5')">H5</div>
                            <div class="button ga-52" v-bind:class="{ active: state['1'].ptz === 'H' && state['2'].ptz === 'H' && state['3'].ptz === 'H' && state['4'].ptz === 'H' && state['5'].ptz === 'H', destructive: ptzMode !== 'load' }" v-on:click="ptz('H')">H</div>
                        </div>
                    </div>
                    <div class="control-box control-box-vptz">
                        <div class="title">CAM+VPTZ ACTIVATE</div>
                        <div class="control-grid control-grid-vptz">
                            <div class="button ga-01" v-bind:class="{ active: vptzCam === '1', preview: previewCam === '1' }" v-on:click="vptzCam = '1'">CAM1</div>
                            <div class="button ga-02" v-bind:class="{ active: vptzCam === '2', preview: previewCam === '2' }" v-on:click="vptzCam = '2'">CAM2</div>
                            <div class="button ga-03" v-bind:class="{ active: vptzCam === '5', preview: previewCam === '5' }" v-on:click="vptzCam = '5'">CAM5</div>
                            <div class="button ga-04" v-bind:class="{ active: vptzCam === '3', preview: previewCam === '3' }" v-on:click="vptzCam = '3'">CAM3</div>
                            <div class="button ga-05" v-bind:class="{ active: vptzCam === '4', preview: previewCam === '4' }" v-on:click="vptzCam = '4'">CAM4</div>
                            <div class="button ga-06" v-bind:class="{ preview: previewView === 'C-L' }" v-on:click="vptz('C-L')">C-L</div>
                            <div class="button ga-07" v-bind:class="{ preview: previewView === 'C-C' }" v-on:click="vptz('C-C')">C-C</div>
                            <div class="button ga-08" v-bind:class="{ preview: previewView === 'C-R' }" v-on:click="vptz('C-R')">C-R</div>
                            <div class="button ga-09" v-bind:class="{ preview: previewView === 'F-L' }" v-on:click="vptz('F-L')">F-L</div>
                            <div class="button ga-10" v-bind:class="{ preview: previewView === 'F-C' }" v-on:click="vptz('F-C')">F-C</div>
                            <div class="button ga-11" v-bind:class="{ preview: previewView === 'F-R' }" v-on:click="vptz('F-R')">F-R</div>
                            <div class="button ga-12" v-bind:class="{ preview: previewView === 'W-C' }" v-on:click="vptz('W-C')">W-C</div>
                        </div>
                    </div>
                    <div class="control-box control-box-joystick">
                        <div v-if="adjustMode === 'ptz'" class="title">
                            PTZ ADJUST: <span class="context">CAM{{ previewCam }} / {{ previewCam != '' ? state[previewCam].ptz + previewCam : '' }}</span>
                        </div>
                        <div v-if="adjustMode === 'vptz'" class="title">
                            VPTZ ADJUST: <span class="context">CAM{{ previewCam }} / {{ previewCam != '' ? state[previewCam].ptz + previewCam : '' }} / {{ previewView }}</span>
                        </div>
                        <div class="control-grid control-grid-joystick">
                            <div class="button ga-01"
                                v-bind:class="{ active: adjustMode === 'ptz' }"
                                v-on:click="adjustMode = 'ptz'">
                                PTZ
                            </div>
                            <div class="button ga-02"
                                v-bind:class="{ active: adjustMode === 'vptz' }"
                                v-on:click="adjustMode = 'vptz'">
                                VPTZ
                            </div>
                            <div class="button ga-03"
                                v-on:click="joystick('pan', 'up-left')">
                                <span class="icon"><i class="fa-solid fa-circle-left fa-rotate-by" style="--fa-rotate-angle: 45deg;"></i></span>
                            </div>
                            <div class="button ga-04"
                                v-on:click="joystick('pan', 'up')">
                                <span class="icon"><i class="fa-solid fa-circle-up"></i></span>
                            </div>
                            <div class="button ga-05"
                                v-on:click="joystick('pan', 'up-right')">
                                <span class="icon"><i class="fa-solid fa-circle-right fa-rotate-by" style="--fa-rotate-angle: -45deg;"></i></span>
                            </div>
                            <div class="button ga-06"
                                v-on:click="joystick('pan', 'left')">
                                <span class="icon"><i class="fa-solid fa-circle-left"></i></span>
                            </div>
                            <div class="button ga-07 destructive"
                                v-on:click="joystick('pan', 'reset')">
                                <span class="icon"><i class="fa-solid fa-circle-xmark"></i></span>
                            </div>
                            <div class="button ga-08"
                                v-on:click="joystick('pan', 'right')">
                                <span class="icon"><i class="fa-solid fa-circle-right"></i></span>
                            </div>
                            <div class="button ga-09"
                                v-on:click="joystick('pan', 'down-left')">
                                <span class="icon"><i class="fa-solid fa-circle-left fa-rotate-by" style="--fa-rotate-angle: -45deg;"></i></span>
                            </div>
                            <div class="button ga-10"
                                v-on:click="joystick('pan', 'down')">
                                <span class="icon"><i class="fa-solid fa-circle-down"></i></span>
                            </div>
                            <div class="button ga-11"
                                v-on:click="joystick('pan', 'down-right')">
                                <span class="icon"><i class="fa-solid fa-circle-right fa-rotate-by" style="--fa-rotate-angle: 45deg;"></i></span>
                            </div>
                            <div class="button ga-12"
                                v-on:click="joystick('zoom', 'decrease')">
                                <span class="icon"><i class="fa-solid fa-circle-minus"></i></span>
                            </div>
                            <div class="button ga-13 destructive"
                                v-on:click="joystick('zoom', 'reset')">
                                <span class="icon"><i class="fa-solid fa-circle-xmark"></i></span>
                            </div>
                            <div class="button ga-14"
                                v-on:click="joystick('zoom', 'increase')">
                                <span class="icon"><i class="fa-solid fa-circle-plus"></i></span>
                            </div>
                        </div>
                    </div>
                    <div class="overlay-box overlay-cam1">
                        <div class="title">CAM1</div>
                        <app-overlay
                            ref="overlay-cam1"
                            v-bind:options="{ cam: '1', opacity: 1.00 }"
                        ></app-overlay>
                    </div>
                    <div class="overlay-box overlay-cam2">
                        <div class="title">CAM2</div>
                        <app-overlay
                            ref="overlay-cam2"
                            v-bind:options="{ cam: '2', opacity: 1.00 }"
                        ></app-overlay>
                    </div>
                    <div class="overlay-box overlay-cam3">
                        <div class="title">CAM3</div>
                        <app-overlay
                            ref="overlay-cam3"
                            v-bind:options="{ cam: '3', opacity: 1.00 }"
                        ></app-overlay>
                    </div>
                    <div class="overlay-box overlay-cam4">
                        <div class="title">CAM4</div>
                        <app-overlay
                            ref="overlay-cam4"
                            v-bind:options="{ cam: '4', opacity: 1.00 }"
                        ></app-overlay>
                    </div>
                    <div class="overlay-box overlay-cam5">
                        <div class="title">CAM5</div>
                        <app-overlay
                            ref="overlay-cam5"
                            v-bind:options="{ cam: '5', opacity: 1.00 }"
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

<style lang="stylus" scoped>
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
                grid-template-areas:   "ctrl1 cam5 ctrl2" "cam1 cam2 cam4" "ctrl3 cam3 ctrl4"
                gap: 10px
                .overlay-box
                    position: relative
                    max-width: 100%
                    max-height: 100%
                    aspect-ratio: 16 / 9
                    background-color: var(--color-std-bg-3)
                    box-sizing: border-box
                    overflow: hidden
                    .title
                        position: absolute
                        top: calc(50% - 3vw)
                        left: calc(50% - 5vw)
                        height: 3vw
                        width: 10vw
                        padding: 0.1vw 0.6vw
                        color: var(--color-std-fg-1)
                        font-size: 2.5vw
                        line-height: 3vw
                        font-weight: bold
                        text-align: center
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
                .control-box
                    display: flex
                    flex-direction: column
                    justify-content: center
                    align-items: center
                    width:  100%
                    height: 100%
                    .title
                        color: var(--color-std-fg-1)
                        font-size: 1.2vw
                        font-weight: 200
                        margin-bottom: 1vw
                    .control-grid
                        display: grid
                        gap: 0.3vw
                        .button
                            background-color: var(--color-std-bg-4)
                            color: var(--color-std-fg-4)
                            padding: 0.5vw 1vw 0.5vw 1vw
                            font-size: 1vw
                            border-radius: 0.4vw
                            text-align: center
                            cursor: pointer
                            &.active
                                background-color: var(--color-acc-bg-2)
                                color: var(--color-acc-fg-2)
                            &.destructive.active
                                background-color: var(--color-sig-bg-2)
                                color: var(--color-sig-fg-2)
                            &:hover
                                background-color: var(--color-acc-bg-5)
                                color: var(--color-acc-fg-5)
                            &.destructive:hover
                                background-color: var(--color-sig-bg-5)
                                color: var(--color-sig-fg-5)
                            &.disabled
                                background-color: var(--color-std-bg-3)
                                color: var(--color-std-fg-1)
                            &.disabled:hover
                                background-color: var(--color-std-bg-3)
                                color: var(--color-std-fg-1)
                            .icon
                                padding-right: 0.5vw
                    .control-grid .ga-01
                        grid-area: ga-01
                    .control-grid .ga-02
                        grid-area: ga-02
                    .control-grid .ga-03
                        grid-area: ga-03
                    .control-grid .ga-04
                        grid-area: ga-04
                    .control-grid .ga-05
                        grid-area: ga-05
                    .control-grid .ga-06
                        grid-area: ga-06
                    .control-grid .ga-07
                        grid-area: ga-07
                    .control-grid .ga-08
                        grid-area: ga-08
                    .control-grid .ga-09
                        grid-area: ga-09
                    .control-grid .ga-10
                        grid-area: ga-10
                    .control-grid .ga-11
                        grid-area: ga-11
                    .control-grid .ga-12
                        grid-area: ga-12
                    .control-grid-global
                        grid-template-columns: calc(1fr + 2vw) 1fr
                        grid-template-rows:    1fr 1fr 1fr
                        grid-template-areas:   "ga-01 ga-04" "ga-02 ga-05" "ga-03 ."
                        .button
                            font-size: 1.5vw
                            text-align: left
                            &.ga-01,
                            &.ga-02,
                            &.ga-03
                                margin-right: 2vw
                    .control-grid-ptz
                        grid-template-columns: calc(6fr + 0.5vw) 6fr 6fr 6fr 6fr 6fr 6fr
                        grid-template-rows:    8fr 8fr 8fr 8fr 8fr 8fr 8fr 8fr 8fr
                        grid-template-areas: \
                            "ga-01 ga-05 ga-06 ga-07 ga-08 ga-09 ga-10" \
                            "ga-01 ga-11 ga-12 ga-13 ga-14 ga-15 ga-16" \
                            "ga-02 ga-17 ga-18 ga-19 ga-20 ga-21 ga-22" \
                            "ga-02 ga-23 ga-24 ga-25 ga-26 ga-27 ga-28" \
                            "ga-03 ga-29 ga-30 ga-31 ga-32 ga-33 ga-34" \
                            "ga-03 ga-35 ga-36 ga-37 ga-38 ga-39 ga-40" \
                            "ga-04 ga-41 ga-42 ga-43 ga-44 ga-45 ga-46" \
                            "ga-04 ga-47 ga-48 ga-49 ga-50 ga-51 ga-52"
                        .button
                            font-size: 1vw
                            line-height: 1vw
                            padding: 0.2vw 1vw 0.2vw 1vw
                            &.ga-01,
                            &.ga-02,
                            &.ga-03,
                            &.ga-04
                                display: flex
                                flex-direction: column
                                justify-content: center
                                align-items: center
                                margin-right: 0.5vw
                                .icon
                                    padding-right: 0
                            &.program
                                background-color: var(--color-prg-bg)
                                color: var(--color-prg-fg)
                            &.preview
                                background-color: var(--color-prv-bg)
                                color: var(--color-prv-fg)
                    .control-grid-vptz
                        grid-template-columns: 5fr 5fr 5fr 5fr 5fr
                        grid-template-rows:    calc(4fr + 0.5vw) 4fr 4fr 4fr
                        grid-template-areas:   "ga-01 ga-02 ga-03 ga-04 ga-05" \
                            ". ga-06 ga-07 ga-08 ." \
                            ". ga-09 ga-10 ga-11 ." \
                            ". . ga-12 . ."
                        .button
                            font-size: 1.3vw
                            &.ga-01,
                            &.ga-02,
                            &.ga-03,
                            &.ga-04,
                            &.ga-05
                                margin-bottom: 0.5vw
                            &.program
                                background-color: var(--color-prg-bg)
                                color: var(--color-prg-fg)
                            &.preview
                                background-color: var(--color-prv-bg)
                                color: var(--color-prv-fg)
                    .control-grid-joystick
                        grid-template-columns: 4fr 4fr 4fr 4fr
                        grid-template-rows:    4fr 4fr 4fr 4fr
                        grid-template-areas:   "ga-01 ga-03 ga-04 ga-05" \
                            "ga-01 ga-06 ga-07 ga-08" \
                            "ga-02 ga-09 ga-10 ga-11" \
                            "ga-02 ga-12 ga-13 ga-14"
                        .button
                            font-size: 1.5vw
                            .icon
                                padding-right: 0
                            &.ga-01,
                            &.ga-02
                                display: flex
                                flex-direction: column
                                justify-content: center
                                align-items: center
                                margin-right: 0.5vw
                                .icon
                                    padding-right: 0
                .control-box-ptz
                    grid-area: ctrl1
                .control-box-global
                    grid-area: ctrl2
                .control-box-vptz
                    grid-area: ctrl3
                .control-box-joystick
                    grid-area: ctrl4
                    .title
                        .context
                            font-weight: bold
                            color: var(--color-prv-bg)
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
        pkg,
        ptzMode:     "load",
        vptzCam:     "",
        programCam:  "",
        programView: "",
        previewCam:  "",
        previewView: "",
        adjustMode:  "ptz"
    }),
    async created () {
    },
    methods: {
        setState (state: StateType) {
            for (const cam of Object.keys(this.state))
                if (this.$refs[`overlay-cam${cam}`])
                    (this.$refs[`overlay-cam${cam}`] as typeof AppOverlay).setState(state)
            this.state = state
            this.programCam  = ""
            this.programView = ""
            this.previewCam  = ""
            this.previewView = ""
            for (const cam of Object.keys(this.state)) {
                for (const view of Object.keys(this.state[cam].vptz)) {
                    if (this.state[cam].vptz[view].program) {
                        this.programCam  = cam
                        this.programView = view
                    }
                    if (this.state[cam].vptz[view].preview) {
                        this.previewCam  = cam
                        this.previewView = view
                    }
                }
            }
        },
        log (level: string, msg: string) {
            this.$emit("log", level, msg)
        },
        async api (path: string, method = "GET") {
            await axios({ method, url: `${this.svUrl}${path}` })
                .then((response) => response.data).catch(() => null)
        },
        async ptz (ptz: string, cam = "") {
            if (cam !== "")
                await this.api(`/ptz/${ptz}/${cam}/${this.ptzMode}`)
            else
                await this.api(`/ptz/${ptz}/${this.ptzMode}`)
        },
        async vptz (vptz: string) {
            const cam = this.vptzCam
            await this.api(`/vptz/${cam}/${vptz}/select`)
        },
        async joystick (op: string, arg: string) {
            const cam  = this.previewCam
            const ptz  = this.state[cam].ptz
            const vptz = this.previewView
            if (this.adjustMode === "ptz")
                await this.api(`/ptz/${ptz}/${cam}/${op}/${arg}`)
            else if (this.adjustMode === "vptz")
                await this.api(`/vptz/${cam}/${vptz}/${op}/${arg}`)
        },
        async mixer (op: string) {
            await this.api(`/mixer/${op}`)
        }
    }
})
</script>

