/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import path  from  "node:path"

import Argv  from "./app-argv"
import Log   from "./app-log"
import Cfg   from "./app-cfg"
import DB    from "./app-db"

export interface PTZ {  /* physical PTZ selection     */
    cam:   string,      /* camera        (e.g. "1")   */
    ptz:   string       /* physical PTZ  (e.g. "A")   */
}

export interface VPTZ { /* virtual PTZ configuration  */
    cam:   string,      /* camera        (e.g. "1")   */
    ptz:   string,      /* physical PTZ  (e.g. "A")   */
    vptz:  string,      /* virtual PTZ   (e.g. "W-C") */
    x:     number,      /* x position    (e.g. 0)     */
    y:     number,      /* y position    (e.g. 0)     */
    zoom:  number       /* zoom level    (e.g. 1.0)   */
}

declare module "knex/types/tables" {
    interface Tables {
        ptz:  PTZ
        vptz: VPTZ
    }
}

export type XYZ = {
    x:     number,
    y:     number,
    zoom:  number
}

export default class State extends DB {
    constructor (
        private argv: Argv,
        private log:  Log,
        private cfg:  Cfg
    ) {
        super()
    }

    async init () {
        this.configure(`better-sqlite3:${path.join(this.argv.stateDir, "state.db")}`, {
            debug: this.argv.logLevel >= 3
        })
        this.on("log", (level, msg) => {
            this.log.log(level, `DB: ${msg}`)
        })
        await this.connect()
    }

    async shutdown () {
        await this.disconnect()
    }

    /*  open database connection  */
    async connect () {
        await super.connect()

        /*  ad-hoc create database schema  */
        await this.transaction(async (knex) => {
            const exists = await knex.schema.hasTable("ptz")
            if (!exists) {
                await knex.schema.createTable("ptz", (table) => {
                    table.string("cam").notNullable()
                    table.string("ptz").notNullable()
                    table.index([ "cam" ], "ptz_index")
                })
                await knex.schema.createTable("vptz", (table) => {
                    table.string("cam").notNullable()
                    table.string("ptz").notNullable()
                    table.string("vptz").notNullable()
                    table.float("x").notNullable()
                    table.float("y").notNullable()
                    table.float("zoom").notNullable()
                    table.index([ "cam", "ptz", "vptz" ], "vptz_index")
                })

                /*  ad-hoc create initial database content  */
                for (const cam of this.cfg.idCAMs) {
                    const ptz = this.cfg.idPTZs[0]
                    await knex("ptz").insert({ cam, ptz })
                    for (const ptz of this.cfg.idPTZs)
                        for (const vptz of this.cfg.idVPTZs)
                            await knex("vptz").insert({ cam, ptz, vptz, x: 0, y: 0, zoom: 1.0 })
                }
            }
        })
    }

    /*  data access object (DAO) methods for "PTZ"  */
    async getPTZ (cam: string) {
        if (this.knex === null)
            throw new Error("database not opened")
        return this.atomic(async (knex) => {
            const rec = await knex("ptz").select("ptz").where({ cam }).limit(1)
            return (rec.length === 1 ? rec[0].ptz : this.cfg.idPTZs[0])
        })
    }
    async setPTZ (cam: string, ptz: string) {
        if (this.knex === null)
            throw new Error("database not opened")
        await this.transaction(async (knex) => {
            const rec = await knex("ptz").select("ptz").where({ cam })
            if ((rec?.length ?? 0) > 0)
                await knex("ptz").update({ ptz }).where({ cam })
            else
                await knex("ptz").insert({ ptz, cam })
        })
    }
    async delPTZ (cam: string) {
        if (this.knex === null)
            throw new Error("database not opened")
        await this.atomic(async (knex) => {
            await knex("ptz").delete().where({ cam })
        })
    }

    /*  data access object (DAO) methods for "VPTZ"  */
    async getVPTZ (cam: string, ptz: string, vptz: string) {
        if (this.knex === null)
            throw new Error("database not opened")
        return this.atomic(async (knex) => {
            const rec = await knex("vptz").select("*").where({ cam, ptz, vptz })
            return (
                rec.length === 1 ?
                { x: rec[0].x, y: rec[0].y, zoom: rec[0].zoom } as XYZ :
                { x: 0, y: 0, zoom: 1.0 } as XYZ
            )
        })
    }
    async setVPTZ (cam: string, ptz: string, vptz: string, xyz: XYZ) {
        if (this.knex === null)
            throw new Error("database not opened")
        await this.transaction(async (knex) => {
            const rec = await knex("vptz").select().where({ cam, ptz, vptz })
            if ((rec?.length ?? 0) > 0)
                await knex("vptz").update({ x: xyz.x, y: xyz.y, zoom: xyz.zoom }).where({ cam, ptz, vptz })
            else
                await knex("vptz").insert({ cam, ptz, vptz, x: xyz.x, y: xyz.y, zoom: xyz.zoom })
        })
    }
    async delVPTZ (cam: string, ptz: string, vptz: string) {
        if (this.knex === null)
            throw new Error("database not opened")
        await this.atomic(async (knex) => {
            await knex("vptz").delete().where({ cam, ptz, vptz })
        })
    }
}
