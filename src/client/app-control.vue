<!--
**
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023-2024 Dr. Ralf S. Engelschall <rse@engelschall.com>
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
                    <div class="control-box control-box-sync">
                        <div class="title">STATE</div>
                        <div class="control-grid control-grid-sync">
                            <div class="button ga-01 destructive" v-on:click="(ev) => vmixState(ev, 'restore')"><span class="icon"><i class="fa-solid fa-upload"></i></span> SYNC</div>
                        </div>
                    </div>
                    <div class="control-box control-box-global">
                        <div class="title">MIXER</div>
                        <div class="control-grid control-grid-global">
                            <div class="button ga-01" v-on:click="mixer('cut')"><span class="icon"><i class="fa-solid fa-cut"></i></span> CUT</div>
                            <div class="button ga-02" v-on:click="mixer('drive', 'fast')" v-bind:class="{ disabled: programCam !== previewCam }"><span class="icon"><i class="fa-solid fa-route"></i></span> DRIVE <span class="hint">(FAST)</span></div>
                            <div class="button ga-03" v-on:click="mixer('drive', 'med')" v-bind:class="{ disabled: programCam !== previewCam }"><span class="icon"><i class="fa-solid fa-route"></i></span> DRIVE <span class="hint">(MED)</span></div>
                            <div class="button ga-04" v-on:click="mixer('drive', 'slow')" v-bind:class="{ disabled: programCam !== previewCam }"><span class="icon"><i class="fa-solid fa-route"></i></span> DRIVE <span class="hint">(SLOW)</span></div>
                        </div>
                    </div>
                    <div class="control-box control-box-ptz">
                        <div v-if="ptzMode === 'load'" class="title">
                            CAM+PTZ ACTIVATE
                        </div>
                        <div v-if="ptzMode === 'save'" class="title">
                            CAM+PTZ STORE/UPDATE
                        </div>
                        <div v-if="ptzMode === 'reset'" class="title">
                            CAM+VPTZ RESET (STD)
                        </div>
                        <div v-if="ptzMode === 'clear'" class="title">
                            CAM+VPTZ RESET (MAX)
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
                                <span class="icon"><i class="fa-solid fa-floppy-disk"></i></span>
                            </div>
                            <div class="button ga-03 destructive"
                                v-bind:class="{ active: ptzMode === 'reset' }"
                                v-on:click="ptzMode = 'reset'">
                                <span class="icon"><i class="fa-solid fa-table-cells-large"></i></span>
                            </div>
                            <div class="button ga-04 destructive"
                                v-bind:class="{ active: ptzMode === 'clear' }"
                                v-on:click="ptzMode = 'clear'">
                                <span class="icon"><i class="fa-regular fa-square"></i></span>
                            </div>
                            <div class="button ga-05 destructive-smart" v-bind:class="{ active: state['1'].ptz === 'A', preview: state['1'].ptz === 'A' && previewCam === '1', program: state['1'].ptz === 'A' && programCam === '1', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'A', '1')">1A</div>
                            <div class="button ga-06 destructive-smart" v-bind:class="{ active: state['2'].ptz === 'A', preview: state['2'].ptz === 'A' && previewCam === '2', program: state['2'].ptz === 'A' && programCam === '2', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'A', '2')">2A</div>
                            <div class="button ga-07 destructive-smart" v-bind:class="{ active: state['3'].ptz === 'A', preview: state['3'].ptz === 'A' && previewCam === '3', program: state['3'].ptz === 'A' && programCam === '3', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'A', '3')">3A</div>
                            <div class="button ga-08 destructive-smart" v-bind:class="{ active: state['4'].ptz === 'A', preview: state['4'].ptz === 'A' && previewCam === '4', program: state['4'].ptz === 'A' && programCam === '4', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'A', '4')">4A</div>
                            <div class="button ga-10 destructive-smart" v-bind:class="{ destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'A')">A</div>
                            <div class="button ga-11 destructive-smart" v-bind:class="{ active: state['1'].ptz === 'B', preview: state['1'].ptz === 'B' && previewCam === '1', program: state['1'].ptz === 'B' && programCam === '1', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'B', '1')">1B</div>
                            <div class="button ga-12 destructive-smart" v-bind:class="{ active: state['2'].ptz === 'B', preview: state['2'].ptz === 'B' && previewCam === '2', program: state['2'].ptz === 'B' && programCam === '2', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'B', '2')">2B</div>
                            <div class="button ga-13 destructive-smart" v-bind:class="{ active: state['3'].ptz === 'B', preview: state['3'].ptz === 'B' && previewCam === '3', program: state['3'].ptz === 'B' && programCam === '3', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'B', '3')">3B</div>
                            <div class="button ga-14 destructive-smart" v-bind:class="{ active: state['4'].ptz === 'B', preview: state['4'].ptz === 'B' && previewCam === '4', program: state['4'].ptz === 'B' && programCam === '4', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'B', '4')">4B</div>
                            <div class="button ga-16 destructive-smart" v-bind:class="{ destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'B')">B</div>
                            <div class="button ga-17 destructive-smart" v-bind:class="{ active: state['1'].ptz === 'C', preview: state['1'].ptz === 'C' && previewCam === '1', program: state['1'].ptz === 'C' && programCam === '1', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'C', '1')">1C</div>
                            <div class="button ga-18 destructive-smart" v-bind:class="{ active: state['2'].ptz === 'C', preview: state['2'].ptz === 'C' && previewCam === '2', program: state['2'].ptz === 'C' && programCam === '2', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'C', '2')">2C</div>
                            <div class="button ga-19 destructive-smart" v-bind:class="{ active: state['3'].ptz === 'C', preview: state['3'].ptz === 'C' && previewCam === '3', program: state['3'].ptz === 'C' && programCam === '3', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'C', '3')">3C</div>
                            <div class="button ga-20 destructive-smart" v-bind:class="{ active: state['4'].ptz === 'C', preview: state['4'].ptz === 'C' && previewCam === '4', program: state['4'].ptz === 'C' && programCam === '4', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'C', '4')">4C</div>
                            <div class="button ga-22 destructive-smart" v-bind:class="{ destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'C')">C</div>
                            <div class="button ga-23 destructive-smart" v-bind:class="{ active: state['1'].ptz === 'D', preview: state['1'].ptz === 'D' && previewCam === '1', program: state['1'].ptz === 'D' && programCam === '1', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'D', '1')">1D</div>
                            <div class="button ga-24 destructive-smart" v-bind:class="{ active: state['2'].ptz === 'D', preview: state['2'].ptz === 'D' && previewCam === '2', program: state['2'].ptz === 'D' && programCam === '2', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'D', '2')">2D</div>
                            <div class="button ga-25 destructive-smart" v-bind:class="{ active: state['3'].ptz === 'D', preview: state['3'].ptz === 'D' && previewCam === '3', program: state['3'].ptz === 'D' && programCam === '3', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'D', '3')">3D</div>
                            <div class="button ga-26 destructive-smart" v-bind:class="{ active: state['4'].ptz === 'D', preview: state['4'].ptz === 'D' && previewCam === '4', program: state['4'].ptz === 'D' && programCam === '4', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'D', '4')">4D</div>
                            <div class="button ga-28 destructive-smart" v-bind:class="{ destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'D')">D</div>
                            <div class="button ga-29 destructive-smart" v-bind:class="{ active: state['1'].ptz === 'E', preview: state['1'].ptz === 'E' && previewCam === '1', program: state['1'].ptz === 'E' && programCam === '1', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'E', '1')">1E</div>
                            <div class="button ga-30 destructive-smart" v-bind:class="{ active: state['2'].ptz === 'E', preview: state['2'].ptz === 'E' && previewCam === '2', program: state['2'].ptz === 'E' && programCam === '2', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'E', '2')">2E</div>
                            <div class="button ga-31 destructive-smart" v-bind:class="{ active: state['3'].ptz === 'E', preview: state['3'].ptz === 'E' && previewCam === '3', program: state['3'].ptz === 'E' && programCam === '3', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'E', '3')">3E</div>
                            <div class="button ga-32 destructive-smart" v-bind:class="{ active: state['4'].ptz === 'E', preview: state['4'].ptz === 'E' && previewCam === '4', program: state['4'].ptz === 'E' && programCam === '4', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'E', '4')">4E</div>
                            <div class="button ga-34 destructive-smart" v-bind:class="{ destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'E')">E</div>
                            <div class="button ga-35 destructive-smart" v-bind:class="{ active: state['1'].ptz === 'F', preview: state['1'].ptz === 'F' && previewCam === '1', program: state['1'].ptz === 'F' && programCam === '1', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'F', '1')">1F</div>
                            <div class="button ga-36 destructive-smart" v-bind:class="{ active: state['2'].ptz === 'F', preview: state['2'].ptz === 'F' && previewCam === '2', program: state['2'].ptz === 'F' && programCam === '2', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'F', '2')">2F</div>
                            <div class="button ga-37 destructive-smart" v-bind:class="{ active: state['3'].ptz === 'F', preview: state['3'].ptz === 'F' && previewCam === '3', program: state['3'].ptz === 'F' && programCam === '3', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'F', '3')">3F</div>
                            <div class="button ga-38 destructive-smart" v-bind:class="{ active: state['4'].ptz === 'F', preview: state['4'].ptz === 'F' && previewCam === '4', program: state['4'].ptz === 'F' && programCam === '4', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'F', '4')">4F</div>
                            <div class="button ga-40 destructive-smart" v-bind:class="{ destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'F')">F</div>
                            <div class="button ga-41 destructive-smart" v-bind:class="{ active: state['1'].ptz === 'G', preview: state['1'].ptz === 'G' && previewCam === '1', program: state['1'].ptz === 'G' && programCam === '1', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'G', '1')">1G</div>
                            <div class="button ga-42 destructive-smart" v-bind:class="{ active: state['2'].ptz === 'G', preview: state['2'].ptz === 'G' && previewCam === '2', program: state['2'].ptz === 'G' && programCam === '2', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'G', '2')">2G</div>
                            <div class="button ga-43 destructive-smart" v-bind:class="{ active: state['3'].ptz === 'G', preview: state['3'].ptz === 'G' && previewCam === '3', program: state['3'].ptz === 'G' && programCam === '3', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'G', '3')">3G</div>
                            <div class="button ga-44 destructive-smart" v-bind:class="{ active: state['4'].ptz === 'G', preview: state['4'].ptz === 'G' && previewCam === '4', program: state['4'].ptz === 'G' && programCam === '4', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'G', '4')">4G</div>
                            <div class="button ga-46 destructive-smart" v-bind:class="{ destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'G')">G</div>
                            <div class="button ga-47 destructive-smart" v-bind:class="{ active: state['1'].ptz === 'H', preview: state['1'].ptz === 'H' && previewCam === '1', program: state['1'].ptz === 'H' && programCam === '1', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'H', '1')">1H</div>
                            <div class="button ga-48 destructive-smart" v-bind:class="{ active: state['2'].ptz === 'H', preview: state['2'].ptz === 'H' && previewCam === '2', program: state['2'].ptz === 'H' && programCam === '2', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'H', '2')">2H</div>
                            <div class="button ga-49 destructive-smart" v-bind:class="{ active: state['3'].ptz === 'H', preview: state['3'].ptz === 'H' && previewCam === '3', program: state['3'].ptz === 'H' && programCam === '3', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'H', '3')">3H</div>
                            <div class="button ga-50 destructive-smart" v-bind:class="{ active: state['4'].ptz === 'H', preview: state['4'].ptz === 'H' && previewCam === '4', program: state['4'].ptz === 'H' && programCam === '4', destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'H', '4')">4H</div>
                            <div class="button ga-52 destructive-smart" v-bind:class="{ destructive: ptzMode !== 'load' }" v-on:click="(ev) => ptz(ev, 'H')">H</div>
                        </div>
                    </div>
                    <div class="control-box control-box-vptz">
                        <div class="title">CAM+VPTZ ACTIVATE</div>
                        <div class="control-grid control-grid-vptz">
                            <div class="button ga-01" v-bind:class="{ active: vptzCam === '1', preview: previewCam === '1', program: programCam === '1' }" v-on:click="vptzCam = '1'">CAM1</div>
                            <div class="button ga-02" v-bind:class="{ active: vptzCam === '2', preview: previewCam === '2', program: programCam === '2' }" v-on:click="vptzCam = '2'">CAM2</div>
                            <div class="button ga-03" v-bind:class="{ active: vptzCam === '3', preview: previewCam === '3', program: programCam === '3' }" v-on:click="vptzCam = '3'">CAM3</div>
                            <div class="button ga-04" v-bind:class="{ active: vptzCam === '4', preview: previewCam === '4', program: programCam === '4' }" v-on:click="vptzCam = '4'">CAM4</div>
                            <div class="button ga-06" v-bind:class="{ preview: previewView === 'C-L', program: programView === 'C-L', disabled: vptzCam === '' }" v-on:click="vptz('C-L')">C-L</div>
                            <div class="button ga-07" v-bind:class="{ preview: previewView === 'C-C', program: programView === 'C-C', disabled: vptzCam === '' }" v-on:click="vptz('C-C')">C-C</div>
                            <div class="button ga-08" v-bind:class="{ preview: previewView === 'C-R', program: programView === 'C-R', disabled: vptzCam === '' }" v-on:click="vptz('C-R')">C-R</div>
                            <div class="button ga-09" v-bind:class="{ preview: previewView === 'F-L', program: programView === 'F-L', disabled: vptzCam === '' }" v-on:click="vptz('F-L')">F-L</div>
                            <div class="button ga-10" v-bind:class="{ preview: previewView === 'F-C', program: programView === 'F-C', disabled: vptzCam === '' }" v-on:click="vptz('F-C')">F-C</div>
                            <div class="button ga-11" v-bind:class="{ preview: previewView === 'F-R', program: programView === 'F-R', disabled: vptzCam === '' }" v-on:click="vptz('F-R')">F-R</div>
                            <div class="button ga-12" v-bind:class="{ preview: previewView === 'W-C', program: programView === 'W-C', disabled: vptzCam === '' }" v-on:click="vptz('W-C')">W-C</div>
                        </div>
                    </div>
                    <div class="control-box control-box-joystick">
                        <div v-if="adjustMode === 'ptz'" class="title">
                            PTZ ADJUST: <span class="context">CAM{{ previewCam }} / {{ previewCam != '' ? previewCam + state[previewCam].ptz : '' }}</span>
                        </div>
                        <div v-if="adjustMode === 'vptz'" class="title">
                            VPTZ ADJUST: <span class="context">CAM{{ previewCam }} / {{ previewCam != '' ? previewCam + state[previewCam].ptz : '' }} / {{ previewView }}</span>
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
                            <div class="button ga-15 destructive" ref="savePTZ"
                                v-bind:class="{ disabled: adjustMode !== 'ptz' }"
                                v-on:click="(ev) => ptzUpdateLocal(ev)">
                                SAVE
                            </div>
                            <div class="button ga-16"
                                v-bind:class="{ active: adjustSpeed === 'fast' }"
                                v-on:click="adjustSpeed = 'fast'">
                                FAST
                            </div>
                            <div class="button ga-17"
                                v-bind:class="{ active: adjustSpeed === 'med' }"
                                v-on:click="adjustSpeed = 'med'">
                                MED
                            </div>
                            <div class="button ga-18"
                                v-bind:class="{ active: adjustSpeed === 'slow' }"
                                v-on:click="adjustSpeed = 'slow'">
                                SLOW
                            </div>
                        </div>
                    </div>
                    <div class="overlay-box overlay-cam1">
                        <div class="title">CAM1</div>
                        <app-overlay
                            ref="overlay-cam1"
                            v-bind:options="{ cam: '1', scale: 1.0, opacity: 1.00 }"
                            v-on:xyz="(data) => xyz('1', data)"
                        ></app-overlay>
                    </div>
                    <div class="overlay-box overlay-cam2">
                        <div class="title">CAM2</div>
                        <app-overlay
                            ref="overlay-cam2"
                            v-bind:options="{ cam: '2', scale: 1.0, opacity: 1.00 }"
                            v-on:xyz="(data) => xyz('2', data)"
                        ></app-overlay>
                    </div>
                    <div class="overlay-box overlay-cam3">
                        <div class="title">CAM3</div>
                        <app-overlay
                            ref="overlay-cam3"
                            v-bind:options="{ cam: '3', scale: 1.0, opacity: 1.00 }"
                            v-on:xyz="(data) => xyz('3', data)"
                        ></app-overlay>
                    </div>
                    <div class="overlay-box overlay-cam4">
                        <div class="title">CAM4</div>
                        <app-overlay
                            ref="overlay-cam4"
                            v-bind:options="{ cam: '4', scale: 1.0, opacity: 1.00 }"
                            v-on:xyz="(data) => xyz('4', data)"
                        ></app-overlay>
                    </div>
                </div>
            </div>
            <div v-show="banner !== ''" class="banner">
                {{ banner }}
            </div>
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
        padding: 10px 10px 10px 10px
        width:  calc(100% - 2 * 10px)
        height: calc(100% - 10px - 10px)
        overflow: hidden
        display: flex
        flex-direction: row
        justify-content: center
        align-items: center
        position: relative
        .banner
            position: absolute
            top: calc(50% - 10vw)
            left: 0
            width: 100vw
            height: 20vw
            background-color: var(--color-sig-bg-3)
            color: var(--color-sig-fg-3)
            font-size: 6.0vw
            font-weight: bold
            line-height: 20vw
            text-align: center
            z-index: 200
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
                grid-template-areas:   "ctrl0 cam2 ctrl2" "cam1 cam3 cam4" "ctrl1 ctrl3 ctrl4"
                gap: 0.3vw
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
                        margin-bottom: 0.6vw
                    .control-grid
                        display: grid
                        gap: 0.2vw
                        .button
                            background: var(--color-std-bg-4)
                            color: var(--color-std-fg-4)
                            padding: 0.3vw 0.8vw 0.3vw 0.8vw
                            font-size: 1vw
                            border-radius: 0.4vw
                            text-align: center
                            cursor: pointer
                            border: 1px solid transparent
                            &.disabled
                                background: var(--color-std-bg-3)
                                color: var(--color-std-fg-1)
                                cursor: not-allowed
                            &.disabled:hover
                                background: var(--color-std-bg-3)
                                color: var(--color-std-fg-1)
                            &.active
                                background: var(--color-acc-bg-2)
                                color: var(--color-acc-fg-2)
                            &.destructive.active:not(.destructive-smart)
                                background: var(--color-sig-bg-2)
                                color: var(--color-sig-fg-2)
                            &:hover:not(.disabled):not(.animate)
                                background: var(--color-acc-bg-5) !important
                                color: var(--color-acc-fg-5) !important
                            &.destructive:hover:not(.disabled):not(.animate)
                                background: var(--color-sig-bg-5) !important
                                color: var(--color-sig-fg-5) !important
                            .icon
                                padding-right: 0.5vw
                            &.animate
                                animation: 1s linear flash
                                background: var(--color-acc-bg-3)
                                color: var(--color-acc-fg-5)
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
                    .control-grid .ga-13
                        grid-area: ga-13
                    .control-grid .ga-14
                        grid-area: ga-14
                    .control-grid .ga-15
                        grid-area: ga-15
                    .control-grid .ga-16
                        grid-area: ga-16
                    .control-grid .ga-17
                        grid-area: ga-17
                    .control-grid .ga-18
                        grid-area: ga-18
                    .control-grid-sync
                        width: 90%
                        height: 90%
                        grid-template-columns: 1fr
                        grid-template-rows:    1fr
                        grid-template-areas:   "ga-01"
                        .button
                            font-size: 1.5vw
                            text-align: left
                            &.ga-01
                                font-size: 2vw
                                width: 9vw
                                height: 9vw
                                display: flex
                                flex-direction: row
                                justify-content: center
                                align-items: center
                    .control-grid-global
                        grid-template-columns: calc(1fr + 2vw)
                        grid-template-rows:    1fr 1fr 1fr 1fr
                        grid-template-areas:   "ga-01" "ga-02" "ga-03" "ga-04"
                        .button
                            font-size: 1.5vw
                            text-align: left
                            &.ga-01,
                            &.ga-02,
                            &.ga-03,
                            &.ga-04
                                margin-right: 2vw
                                .hint
                                    font-weight: 200
                                    font-size: 1.0vw
                    .control-grid-ptz
                        grid-template-columns: calc(5fr + 0.5vw) 5fr 5fr 5fr 5fr 5fr
                        grid-template-rows:    8fr 8fr 8fr 8fr 8fr 8fr 8fr 8fr 8fr
                        grid-template-areas: \
                            "ga-01 ga-05 ga-06 ga-07 ga-08 ga-10" \
                            "ga-01 ga-11 ga-12 ga-13 ga-14 ga-16" \
                            "ga-02 ga-17 ga-18 ga-19 ga-20 ga-22" \
                            "ga-02 ga-23 ga-24 ga-25 ga-26 ga-28" \
                            "ga-03 ga-29 ga-30 ga-31 ga-32 ga-34" \
                            "ga-03 ga-35 ga-36 ga-37 ga-38 ga-40" \
                            "ga-04 ga-41 ga-42 ga-43 ga-44 ga-46" \
                            "ga-04 ga-47 ga-48 ga-49 ga-50 ga-52"
                        .button
                            font-size: 1.1vw
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
                            &.active:not(.ga-01)
                                background: var(--color-std-fg-3)
                                color: var(--color-std-bg-3)
                            &.program
                                background: var(--color-prg-bg)
                                color: var(--color-prg-fg)
                            &.preview
                                background: var(--color-prv-bg)
                                color: var(--color-prv-fg)
                            &.program.preview
                                background: var(--color-cb1-bg)
                                color: var(--color-cb1-fg)
                            &.active.preview
                                background: var(--color-cb5-bg)
                                color: var(--color-cb5-fg)
                            &.active.program
                                background: var(--color-cb6-bg)
                                color: var(--color-cb6-fg)
                            &.active.preview.program
                                background: var(--color-cb7-bg)
                                color: var(--color-cb7-fg)
                    .control-grid-vptz
                        grid-template-columns: 5fr 5fr 5fr 5fr 5fr
                        grid-template-rows:    calc(4fr + 0.5vw) 4fr 4fr 4fr
                        grid-template-areas:   "ga-01 ga-02 . ga-03 ga-04" \
                            ". ga-06 ga-07 ga-08 ." \
                            ". ga-09 ga-10 ga-11 ." \
                            ". . ga-12 . ."
                        .button
                            font-size: 1.3vw
                            &.ga-01,
                            &.ga-02,
                            &.ga-03,
                            &.ga-04
                                margin-bottom: 0.8vw
                            &.preview
                                background: var(--color-prv-bg)
                                color: var(--color-prv-fg)
                            &.program
                                background: var(--color-prg-bg)
                                color: var(--color-prg-fg)
                            &.program.preview
                                background: var(--color-cb1-bg)
                                color: var(--color-cb1-fg)
                            &.active.preview
                                background: var(--color-cb2-bg)
                                color: var(--color-cb2-fg)
                            &.active.program
                                background: var(--color-cb3-bg)
                                color: var(--color-cb3-fg)
                            &.active.preview.program
                                background: var(--color-cb4-bg)
                                color: var(--color-cb4-fg)
                    .control-grid-joystick
                        grid-template-columns: 4fr 4fr 4fr 4fr 4fr
                        grid-template-rows:    4fr 4fr 4fr 4fr
                        grid-template-areas:   "ga-01 ga-03 ga-04 ga-05 ga-15" \
                            "ga-01 ga-06 ga-07 ga-08 ga-16" \
                            "ga-02 ga-09 ga-10 ga-11 ga-17" \
                            "ga-02 ga-12 ga-13 ga-14 ga-18"
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
                                font-size: 1.5vw
                                .icon
                                    padding-right: 0
                            &.ga-15,
                            &.ga-16,
                            &.ga-17,
                            &.ga-18
                                font-size: 1.2vw
                                margin-left: 0.5vw
                .control-box-sync
                    grid-area: ctrl0
                    width: 100%
                    display: flex
                    flex-direction: column
                    justify-content: center
                    align-items: center
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
        &.info
            font-weight: normal
            background-color: var(--color-acc-bg-3)
            color: var(--color-acc-fg-5)
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

@keyframes flash
    0%
        border: 1px solid var(--color-std-fg-5)
    33%
        border: 1px solid transparent
    66%
        border: 1px solid var(--color-std-fg-5)
    100%
        border: 1px solid transparent
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
let statusTimer: ReturnType<typeof setTimeout> | null = null
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
        vptzCam:     "1",
        programCam:  "",
        programView: "",
        previewCam:  "",
        previewView: "",
        adjustMode:  "ptz",
        adjustSpeed: "med",
        banner:      "",
        status:      { kind: "", msg: "" }
    }),
    async created () {
    },
    async mounted () {
        /*  remove "animate" CSS class at end of animations  */
        this.$el.addEventListener("animationend", (ev: AnimationEvent) => {
            const el = (ev.target) as HTMLDivElement
            el.classList.remove("animate")
        })
    },
    methods: {
        animate (el: HTMLElement) {
            if (el.classList.contains("animate"))
                el.classList.remove("animate")
            el.classList.add("animate")
        },
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
        raiseStatus (kind: string, msg: string, duration = 4000) {
            /*  raise a temporarily visible status message in the footer  */
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
        async api (path: string, method = "GET") {
            await axios({ method, url: `${this.svUrl}${path}` })
                .then((response) => response.data).catch(() => null)
        },
        async ptz (el: MouseEvent, ptz: string, cam = "") {
            if (cam !== "")
                await this.api(`/ptz/${ptz}/${cam}/${this.ptzMode}`)
            else
                await this.api(`/ptz/${ptz}/${this.ptzMode}`)
            if (this.ptzMode !== "load") {
                const div = (el.target) as HTMLDivElement
                this.animate(div)
            }
            else if (this.ptzMode === "load") {
                this.banner = "LOADING NEW PTZ..."
                setTimeout(() => {
                    this.banner = ""
                }, 6 * 1000)
            }
        },
        async vptz (vptz: string) {
            const cam = this.vptzCam
            await this.api(`/vptz/${cam}/${vptz}/select`)
        },
        async joystick (op: string, arg: string) {
            const cam   = this.previewCam
            const vptz  = this.adjustMode === "vptz" ? this.previewView : "-"
            const speed = this.adjustSpeed
            await this.api(`/joystick/${this.adjustMode}/${cam}/${vptz}/${op}/${arg}/${speed}`)
        },
        async mixer (op: string, speed = "med") {
            await this.api(`/mixer/${op}/${speed}`)
        },
        async vmixState (ev: MouseEvent, op: string) {
            const div = (ev.target) as HTMLDivElement
            this.animate(div)
            await this.api(`/state/${op}`)
        },
        async xyz (cam: string, data: { vptz: string, x: number, y: number, zoom: number }) {
            await this.api(`/vptz/${cam}/${data.vptz}/xyz/${data.x}/${data.y}/${data.zoom}`)
        },
        async ptzUpdateLocal (ev: MouseEvent) {
            if (this.adjustMode !== "ptz")
                return
            const div = (ev.target) as HTMLDivElement
            this.ptzUpdate(div)
        },
        async ptzUpdateRemote () {
            if (this.adjustMode !== "ptz")
                return
            this.ptzUpdate(this.$refs.savePTZ as HTMLElement)
        },
        async ptzUpdate (div: HTMLElement) {
            this.animate(div)
            this.raiseStatus("info", "Saving PTZ state", 1000)
            const cam = this.previewCam
            const ptz = this.state[cam].ptz
            await this.api(`/ptz/${ptz}/${cam}/save`)
        }
    }
})
</script>

