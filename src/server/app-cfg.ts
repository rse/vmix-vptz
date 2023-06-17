/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

export default class Config {
    public idCAMs  = [ "1", "2", "3", "4", "5" ]
    public idPTZs  = [ "A", "B", "C", "D", "E", "F", "G", "H" ]
    public idVPTZs = [ "C-L", "C-C", "C-R", "F-L", "F-C", "F-R", "W-C" ]

    /*  creation  */
    constructor () {}

    /*  initialization  */
    async init () {}

    /*  shutdown  */
    async shutdown () {}

    /*  vMix input name generation  */
    inputNameCAM (cam: string) {
        return `PTZ - CAM${cam}-W-V`
    }
    inputNamePTZ (cam: string, ptz: string) {
        return `PTZ - CAM${cam}-W-V-${ptz}`
    }
    inputNameVPTZ (cam: string, vptz: string) {
        return `VPTZ - CAM${cam}-${vptz}`
    }
}

