/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

/*  external dependencies  */
import objectPath from "object-path"
import minimatch  from "minimatch"

/*  complete state type (all fields required)  */
export type StateType = {
    [ cam: string ]: {
        ptz: string,
        vptz: {
            [ vptz: string ]: {
                program:    boolean,
                preview:    boolean,
                x:          number,
                y:          number,
                zoom:       number
            }
        }
    }
}

/*  partial state type (all fields optional)  */
export type StateTypePartial = Partial<StateType>

/*  complete state schema (all fields required)  */
export const StateSchema = `{
    @: {
        ptz: string,
        vptz: {
            @: {
                program:    boolean,
                preview:    boolean,
                x:          number,
                y:          number,
                zoom:       number
            }
        }
    }
}`

/*  partial state schema (all fields optional)  */
export const StateSchemaPartial = StateSchema.replace(/:/g, "?:")

/*  complete state default (all fields with default values)  */
export const StateDefault = {} as StateType
for (const cam of [ "1", "2", "3", "4", "5" ]) {
    StateDefault[cam] = { ptz: "", vptz: {} }
    for (const vptz of [ "C-L", "C-C", "C-R", "F-L", "F-C", "F-R", "W-C" ]) {
        StateDefault[cam].vptz[vptz] = {
            program:    false,
            preview:    false,
            x:          0,
            y:          0,
            zoom:       1.0
        }
    }
}

/*  complete paths of all state fields  */
export const StatePaths = [] as string[]
const _walk = (name: string, obj: any) => {
    if (typeof obj === "object")
        for (const key of Object.keys(obj))
            _walk(`${name !== "" ? name + "." : ""}${key}`, obj[key])
    else
        StatePaths.push(name)
}
_walk("", StateDefault)

/*  state manipulation utilities  */
export class StateUtil {
    static changed (stateOld: Readonly<StateType>, stateNew: Readonly<StateType>): string[] {
        const changed = [] as string[]
        for (const path of StatePaths) {
            const valOld = objectPath.get(stateOld, path)
            const valNew = objectPath.get(stateNew, path)
            if (valOld !== valNew)
                changed.push(path)
        }
        return changed
    }
    static diff (stateOld: Readonly<StateType>, stateNew: Readonly<StateType>): StateTypePartial {
        const stateDiff = {} as StateTypePartial
        for (const path of StatePaths) {
            const valOld = objectPath.get(stateOld, path)
            const valNew = objectPath.get(stateNew, path)
            if (valOld !== valNew)
                objectPath.set(stateDiff, path, valNew)
        }
        return stateDiff
    }
    static reduce (stateBase: Readonly<StateTypePartial>, stateDiff: Readonly<StateTypePartial>): StateTypePartial {
        const stateReduced = {} as StateTypePartial
        for (const path of StatePaths) {
            if (objectPath.has(stateDiff, path)) {
                const valBase = objectPath.get(stateBase, path)
                const valDiff = objectPath.get(stateDiff, path)
                if (valBase !== valDiff)
                    objectPath.set(stateReduced, path, valDiff)
            }
        }
        return stateReduced
    }
    static copy (dst: StateTypePartial, src: Readonly<StateTypePartial>, patterns: Readonly<string[]> = [ "**" ]): boolean {
        let changed = false
        for (const pattern of patterns) {
            const paths = minimatch.match(StatePaths, pattern)
            for (const path of paths) {
                if (objectPath.has(src, path)) {
                    const valDst = objectPath.get(dst, path)
                    const valSrc = objectPath.get(src, path)
                    if (valDst !== valSrc) {
                        objectPath.set(dst, path, valSrc)
                        changed = true
                    }
                }
            }
        }
        return changed
    }
}

