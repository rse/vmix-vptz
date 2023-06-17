/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

type CFG = {
    [ name: string ]: {
        ptz:  Array<string>,
        vptz: Array<string>
    }
}

export default class Config {
    private inputs: CFG

    /*  creation  */
    constructor () {
        this.inputs = {
            "CAM1": {
                ptz: [
                    "PTZ - CAM1-W-V-A",
                    "PTZ - CAM1-W-V-B",
                    "PTZ - CAM1-W-V-C",
                    "PTZ - CAM1-W-V-D",
                    "PTZ - CAM1-W-V-E",
                    "PTZ - CAM1-W-V-F",
                    "PTZ - CAM1-W-V-G",
                    "PTZ - CAM1-W-V-H"
                ],
                vptz: [
                    "VPTZ - CAM1-C-L",
                    "VPTZ - CAM1-C-C",
                    "VPTZ - CAM1-C-R",
                    "VPTZ - CAM1-F-L",
                    "VPTZ - CAM1-F-C",
                    "VPTZ - CAM1-F-R"
                ]
            },
            "CAM2": {
                ptz: [
                    "PTZ - CAM2-W-V-A",
                    "PTZ - CAM2-W-V-B",
                    "PTZ - CAM2-W-V-C",
                    "PTZ - CAM2-W-V-D",
                    "PTZ - CAM2-W-V-E",
                    "PTZ - CAM2-W-V-F",
                    "PTZ - CAM2-W-V-G",
                    "PTZ - CAM2-W-V-H"
                ],
                vptz: [
                    "VPTZ - CAM2-C-L",
                    "VPTZ - CAM2-C-C",
                    "VPTZ - CAM2-C-R",
                    "VPTZ - CAM2-F-L",
                    "VPTZ - CAM2-F-C",
                    "VPTZ - CAM2-F-R"
                ]
            },
            "CAM3": {
                ptz: [
                    "PTZ - CAM3-W-V-A",
                    "PTZ - CAM3-W-V-B",
                    "PTZ - CAM3-W-V-C",
                    "PTZ - CAM3-W-V-D",
                    "PTZ - CAM3-W-V-E",
                    "PTZ - CAM3-W-V-F",
                    "PTZ - CAM3-W-V-G",
                    "PTZ - CAM3-W-V-H"
                ],
                vptz: [
                    "VPTZ - CAM3-C-L",
                    "VPTZ - CAM3-C-C",
                    "VPTZ - CAM3-C-R",
                    "VPTZ - CAM3-F-L",
                    "VPTZ - CAM3-F-C",
                    "VPTZ - CAM3-F-R"
                ]
            },
            "CAM4": {
                ptz: [
                    "PTZ - CAM4-W-V-A",
                    "PTZ - CAM4-W-V-B",
                    "PTZ - CAM4-W-V-C",
                    "PTZ - CAM4-W-V-D",
                    "PTZ - CAM4-W-V-E",
                    "PTZ - CAM4-W-V-F",
                    "PTZ - CAM4-W-V-G",
                    "PTZ - CAM4-W-V-H"
                ],
                vptz: [
                    "VPTZ - CAM4-C-L",
                    "VPTZ - CAM4-C-C",
                    "VPTZ - CAM4-C-R",
                    "VPTZ - CAM4-F-L",
                    "VPTZ - CAM4-F-C",
                    "VPTZ - CAM4-F-R"
                ]
            },
            "CAM5": {
                ptz: [
                    "PTZ - CAM5-W-V-A",
                    "PTZ - CAM5-W-V-B",
                    "PTZ - CAM5-W-V-C",
                    "PTZ - CAM5-W-V-D",
                    "PTZ - CAM5-W-V-E",
                    "PTZ - CAM5-W-V-F",
                    "PTZ - CAM5-W-V-G",
                    "PTZ - CAM5-W-V-H"
                ],
                vptz: [
                    "VPTZ - CAM5-C-L",
                    "VPTZ - CAM5-C-C",
                    "VPTZ - CAM5-C-R",
                    "VPTZ - CAM5-F-L",
                    "VPTZ - CAM5-F-C",
                    "VPTZ - CAM5-F-R"
                ]
            }
        } as CFG
    }

    /*  initialization  */
    async init () {}

    /*  shutdown  */
    async shutdown () {}
}

