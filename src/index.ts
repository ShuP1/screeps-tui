#!/usr/bin/env bun

import { cac } from "cac"
import { name, version } from "../package.json" with { type: "json" }
import { render } from "@opentui/solid"
import * as globals from "./globals"
import App from "./App"
import { ConsolePosition } from "@opentui/core"

const cli = cac(name).version(version).help()

cli
  .command("[server]", "Run Screeps TUI")
  .option("--server <server>", "Server config to use")
  .option("-s, --shard <shard>", "MMO server shard to show by default")

const { args, options } = cli.parse()
if (options.help) process.exit()

globals.options.server = options.server || args[0]
globals.options.shard = options.shard

render(App, {
  gatherStats: false,
  exitOnCtrlC: true,
  consoleOptions: {
    backgroundColor: "#222",
    position: ConsolePosition.RIGHT,
    keyBindings: [
      { name: "o", ctrl: true },
      { name: "c", ctrl: true, shift: true },
    ] as any,
    title: "Debug log",
    maxStoredLogs: 1000,
  },
}).catch(console.error)
