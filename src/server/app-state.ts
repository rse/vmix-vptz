/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import path  from  "node:path"

import Argv  from "./app-argv"
import Log   from "./app-log"
import DB    from "./app-db"

export interface PTZ {
    ptz:   number   /* active PTZ */
}

export interface VPTZ {
    ptz:   number,  /* assigned PTZ */
    name:  string,  /* input name   */
    x:     number,  /* x position   */
    y:     number,  /* y position   */
    zoom:  number   /* zoom level   */
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
        private log:  Log
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
                    table.string("ptz").notNullable()
                })
                await knex.schema.createTable("vptz", (table) => {
                    table.string("ptz").notNullable()
                    table.string("name").notNullable()
                    table.float("x").notNullable()
                    table.float("y").notNullable()
                    table.float("zoom").notNullable()
                    table.index([ "ptz", "name" ], "vptz_index")
                })
            }
        })
    }

    /*  data access object (DAO) methods for "PTZ"  */
    async getPTZ () {
        if (this.knex === null)
            throw new Error("database not opened")
        const rec = await this.knex("ptz").select("*").limit(1)
        return (rec.length === 1 ? rec[0].ptz : 0)
    }
    async setPTZ (ptz: number) {
        if (this.knex === null)
            throw new Error("database not opened")
        await this.transaction(async (knex) => {
            const rec = await knex("ptz").select()
            if ((rec?.length ?? 0) > 0)
                await knex("ptz").update({ ptz })
            else
                await knex("ptz").insert({ ptz })
        })
    }
    async delPTZ () {
        if (this.knex === null)
            throw new Error("database not opened")
        await this.knex!("ptz").delete()
    }

    /*  data access object (DAO) methods for "VPTZ"  */
    async getVPTZ (ptz: number, name: string) {
        if (this.knex === null)
            throw new Error("database not opened")
        const rec = await this.knex!("vptz").select("*").where({ ptz, name })
        return (
            rec.length === 1 ?
            { x: rec[0].x, y: rec[0].y, zoom: rec[0].zoom } as XYZ :
            { x: 0, y: 0, zoom: 1.0 } as XYZ
        )
    }
    async setVPTZ (ptz: number, name: string, xyz: XYZ) {
        if (this.knex === null)
            throw new Error("database not opened")
        await this.transaction(async (knex) => {
            const rec = await knex("vptz").select().where({ ptz, name })
            if ((rec?.length ?? 0) > 0)
                await knex("vptz").update({ x: xyz.x, y: xyz.y, zoom: xyz.zoom }).where({ ptz, name })
            else
                await knex("vptz").insert({ ptz, name, x: xyz.x, y: xyz.y, zoom: xyz.zoom })
        })
    }
    async delVPTZ (ptz: number, name: string) {
        if (this.knex === null)
            throw new Error("database not opened")
        await this.knex!("vptz").delete().where({ ptz, name })
    }
}
