
/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import { AsyncLocalStorage }   from "node:async_hooks"
import EventEmitter            from "eventemitter2"
import promiseRetry            from "promise-retry"
import Knex                    from "knex"
import type { Knex as KnexNS } from "knex"
import URI                     from "urijs"

enum DB_LogLevels {
    ERROR,
    WARNING,
    INFO,
    DEBUG
}

type DB_Options = {
    debug?: boolean
}

export default class DB extends EventEmitter {
    /*  public properties  */
    public loglevel = DB_LogLevels
    public knex: ReturnType<typeof Knex> | null = null

    /*  private properties  */
    private url = "memory:"
    private options = { debug: false } as DB_Options
    private tls: AsyncLocalStorage<KnexNS.Transaction>

    /*  object constructor  */
    constructor () {
        super()
        this.tls = new AsyncLocalStorage()
    }

    /*  configure the object  */
    configure (url: string, _options = {} as DB_Options) {
        this.url = url
        this.options = { ...this.options, ..._options }
    }

    /*  open database connection  */
    async connect () {
        this.emit("log", this.loglevel.INFO, "opening database connection")

        /*  determine database type and credentials  */
        const url = new URI(this.url)
        const options = {
            client: url.protocol(),
            connection: {} as any
        }
        if (url.username()) options.connection.user     = url.username()
        if (url.password()) options.connection.password = url.password()
        if (url.hostname()) options.connection.host     = url.hostname()
        if (url.port())     options.connection.port     = url.port()
        const path = url.pathname()
        if (options.connection.host)
            options.connection.database = path
        else
            options.connection.filename = path
        this.emit("log", this.loglevel.DEBUG, `using Knex configuration: ${JSON.stringify(options)}`)

        /*  establish Knex instance  */
        this.knex = Knex({
            ...options,
            debug:              this.options.debug,
            asyncStackTraces:   this.options.debug,
            compileSqlOnError: !this.options.debug,
            useNullAsDefault:   true,
            log: {
                error:     (message) => { this.emit("log", this.loglevel.ERROR,   `knex: ${message}`) },
                warn:      (message) => { this.emit("log", this.loglevel.WARNING, `knex: ${message}`) },
                deprecate: (message) => { this.emit("log", this.loglevel.WARNING, `knex: [DEPRECATE]: ${message}`) },
                debug:     ()        => {}
            }
        })

        /*  trace SQL execution  */
        this.knex.on("query", (info: any) => {
            if (!this.options.debug)
                return
            if (!(typeof info === "object" && info instanceof Array))
                info = [ info ]
            info.forEach((info: any) => {
                let txid = "none"
                let sql  = "none"
                if (typeof info.__knexTxId === "string")
                    txid = info.__knexTxId
                if (typeof info.sql === "string")
                    sql = JSON.stringify(info.sql)
                let msg = `execute: [${txid}]: sql: ${sql}`
                if (typeof info.bindings === "object" && info.bindings instanceof Array && info.bindings.length > 0)
                    msg += `, bindings: [ ${info.bindings.map((x: any) => JSON.stringify(x)).join(", ")} ]`
                this.emit("log", this.loglevel.DEBUG, msg)
            })
        })
        this.knex.on("query-error", (error, info) => {
            const msg = typeof error !== "string" ? error.toString() : error
            this.emit("log", this.loglevel.ERROR, `execute: ERROR: ${msg}`)
        })

        /*  use WAL mode for SQLite  */
        if (options.client.match(/^(?:better-)?sqlite3$/))
            await this.knex.raw("PRAGMA journal_mode = WAL")
    }

    /*  perform a database transaction  */
    async transaction<T> (callback: (trx: KnexNS.Transaction) => Promise<T>) {
        return promiseRetry<T>(async (retry: (error: any) => never, attempt: number) => {
            if (this.knex === null)
                return Promise.reject(new Error("database (still) not opened"))
            const trx = this.tls.getStore()
            const promise = trx ?
                new Promise<T>((resolve, reject) => {
                    try { resolve(callback(trx)) }
                    catch (ex) { reject(ex) }
                }) :
                this.knex.transaction<T>((trx) => {
                    return this.tls.run(trx, () => {
                        return callback(trx)
                    })
                })
            return promise.then((result: T) => {
                return result
            }).catch((err) => {
                const errMsg = (typeof err !== "string" ? err.toString() : err)
                if (errMsg.match(/(could not serialize access|SQLITE_BUSY|Timeout acquiring a connection)/)) {
                    /*  retry RDBMS busy situation  */
                    this.emit("log", this.loglevel.WARNING, `database busy -- retrying transaction (attempt ${attempt})`)
                    retry(err)
                }
                else
                    throw err
            })
        }, {
            /*  Transaction Retry Configuration. The underlying timeout formula is:
                timeout = Math.min(random * minTimeout * Math.pow(factor, attempt), maxTimeout)  */
            retries:    10,    /*  maximum of 10 retry attempts  */
            factor:     1.5,   /*  exponential back-off factor  */
            minTimeout: 100,   /*  minimum time between retries  */
            maxTimeout: 2000,  /*  maximum time between retries  */
            randomize:  true   /*  multiply with a random factor between 1 and 2  */
        }) as Promise<T>
    }

    /*  close database connection  */
    async disconnect () {
        if (this.knex !== null) {
            this.emit("log", this.loglevel.INFO, "closing database connection")
            await this.knex.destroy()
            this.knex = null
        }
    }
}
