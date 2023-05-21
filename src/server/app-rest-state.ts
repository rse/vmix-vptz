/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import path                from "node:path"
import fs                  from "node:fs"
import jsYAML              from "js-yaml"
import ducky               from "ducky"
import * as HAPI           from "@hapi/hapi"

import Argv                from "./app-argv"
import DB, { Transaction } from "./app-db"
import REST                from "./app-rest"
import RESTWS              from "./app-rest-ws"
import VMix                from "./app-vmix"
import {
    StateType, StateTypePartial,
    StateSchema, StateSchemaPartial,
    StateDefault,
    StateUtil
} from "../common/app-state"

export default class RESTState {
    public stateFile = ""
    constructor (
        private argv:   Argv,
        private db:     DB,
        private rest:   REST,
        private restWS: RESTWS,
        private vMix:   VMix
    ) {}
    async init () {
        /*  determine state file  */
        this.stateFile = path.join(this.argv.stateDir, "state.yaml")

        /*  load current state  */
        this.rest.server!.route({
            method: "GET",
            path: "/state",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                return this.db.transaction(Transaction.READ, 4000, async () => {
                    const state = StateDefault
                    if (await (fs.promises.stat(this.stateFile).then(() => true).catch(() => false))) {
                        const txt = await fs.promises.readFile(this.stateFile, { encoding: "utf8" })
                        const obj = jsYAML.load(txt) as StateType
                        if (ducky.validate(obj, StateSchema))
                            StateUtil.copy(state, obj)
                    }
                    return h.response(state).code(200)
                })
            }
        })

        /*  change current state  */
        this.rest.server!.route({
            method: "GET",
            path: "/state/{input}/{op}/{arg}",
            handler: async (req: HAPI.Request, h: HAPI.ResponseToolkit) => {
                return this.db.transaction(Transaction.WRITE, 4000, async () => {
                    const input = req.params.input
                    const op    = req.params.op
                    const arg   = req.params.arg
                    this.vMix.operation(input, op, arg)
                    return h.response().code(204)
                })
            }
        })
    }
}

