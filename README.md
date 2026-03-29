# Screeps TUI

Play Screeps in your terminal!

[![asciicast](https://asciinema.org/a/865038.svg)](https://asciinema.org/a/865038)

- Copy and edit `.screeps.example.yml` to `.config/screeps/config.yaml`
  - See [Unified Credentials File format](https://github.com/screepers/screepers-standards/blob/master/SS3-Unified_Credentials_File.md)
- Run `npx screeps-tui`
  - Optionally: install it globally with `npm install -g screeps-tui`

## Features

- View a whole sector of the map
- Pause and replay history seamlessly
- Switch between servers, shards and rooms
- Interact with console

## Keys

- `ctrl+c`: quit
- `ctrl+o`: change server
- `return`: focus console
- `escape`: focus map

### Room navigation

- `arrows`: move around the map
- `shift+arrows`: move the map faster
- `tab`: move to next owned room
- `shift+tab`: move to previous owned room

### Time control

- `space`: toggle pause/replay
- `pageup`: go back to previous tick
- `shift+pageup`: go back in time
- `pagedown`: go forward to next tick
- `shift+pagedown`: go forward in time
- `plus`: increase replay speed
- `minus`: decrease replay speed

## Development

- Install [Bun](https://bun.sh/)
  - Required by [opentui](https://opentui.com)
  - Published package is in fact multi-platform Bun binaries
- Clone the repo
- Run `bun install`
- Run `bun run dev` to start local version
- Before committing, run `bun run test`
