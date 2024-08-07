/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023-2024 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

export default class Config {
    /*  identifiers of the setup  */
    public idCAMs  = [ "1", "2", "3", "4" ] as const
    public idPTZs  = [ "A", "B", "C", "D", "E", "F", "G", "H" ] as const
    public idVPTZs = [ "C-L", "C-C", "C-R", "F-L", "F-C", "F-R", "W-C" ] as const

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

    /*  vMix input name parsing  */
    camOfInputName (inputName: string) {
        let m: RegExpMatchArray | null
        if ((m = inputName.match(/^V?PTZ - CAM(\d+)-.+$/)) !== null)
            return m[1]
        return ""
    }
    vptzOfInputName (inputName: string) {
        let m: RegExpMatchArray | null
        if ((m = inputName.match(/^VPTZ - CAM\d+-(C-L|C-C|C-R|F-L|F-C|F-R|W-C)$/)) !== null)
            return m[1]
        return ""
    }
}

