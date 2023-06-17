/*
**  vMix-VPTZ - vMix Virtual PTZ Control
**  Copyright (c) 2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

/*  load external requirements  */
import chalk          from "chalk"
import * as awilix    from "awilix"

/*  load internal requirements  */
import Pkg            from "./app-pkg"
import Cfg            from "./app-cfg"
import Argv           from "./app-argv"
import Log            from "./app-log"
import REST           from "./app-rest"
import VMix           from "./app-vmix"
import State          from "./app-state"

/*  establish environment  */
class Main {
    private container: awilix.AwilixContainer | null = null

    /*  startup procedure  */
    async startup () {
        (async () => {
            /*  create dependency injection (DI) container  */
            this.container = awilix.createContainer({
                injectionMode: awilix.InjectionMode.CLASSIC
            })

            /*  register classes  */
            const ctx = {}
            this.container.register({
                ctx:        awilix.asValue(ctx),
                pkg:        awilix.asClass(Pkg        ).setLifetime(awilix.Lifetime.SINGLETON),
                cfg:        awilix.asClass(Cfg        ).setLifetime(awilix.Lifetime.SINGLETON),
                argv:       awilix.asClass(Argv       ).setLifetime(awilix.Lifetime.SINGLETON),
                log:        awilix.asClass(Log        ).setLifetime(awilix.Lifetime.SINGLETON),
                state:      awilix.asClass(State      ).setLifetime(awilix.Lifetime.SINGLETON),
                rest:       awilix.asClass(REST       ).setLifetime(awilix.Lifetime.SINGLETON),
                vmix:       awilix.asClass(VMix       ).setLifetime(awilix.Lifetime.SINGLETON)
            })

            /*  initialize classes  */
            await this.container.cradle.pkg.init()
            await this.container.cradle.cfg.init()
            await this.container.cradle.argv.init()
            await this.container.cradle.log.init()
            await this.container.cradle.state.init()
            await this.container.cradle.rest.init()
            await this.container.cradle.vmix.init()

            /*  start classes  */
            await this.container.cradle.rest.start()

            /*  graceful shutdown  */
            process.on("SIGINT",  () => {
                process.stderr.write(chalk.red.bold("app: process interrupted -- shutting down\n"))
                this.shutdown(0)
            })
            process.on("SIGTERM", () => {
                process.stderr.write(chalk.red.bold("app: process terminated -- shutting down\n"))
                this.shutdown(1)
            })
        })().catch((err) => {
            process.stderr.write(chalk.red(`app: ERROR: ${err} ${err.stack}\n`))
            process.stderr.write(chalk.red.bold("app: process crashed -- shutting down\n"))
            this.shutdown(1)
        })
    }

    /*  shutdown procedure  */
    async shutdown (returnCode = 0) {
        /*  shutdown classes  */
        if (this.container !== null) {
            await this.container.cradle.vmix.shutdown()
            await this.container.cradle.rest.shutdown()
            await this.container.cradle.state.shutdown()
            await this.container.cradle.log.shutdown()
            await this.container.cradle.argv.shutdown()
            await this.container.cradle.cfg.shutdown()
            await this.container.cradle.pkg.shutdown()
        }

        /*  terminate process  */
        process.exit(returnCode)
    }
}

/*  application main entry  */
(new Main()).startup()
