import { ScreepsAPI } from 'screeps-api'
import blessed from 'blessed'

if (process.argv.length != 3) {
    console.error('Usage:', process.argv[0], process.argv[1], '<server>')
    process.exit(1)
}

const HIST_MIN = 50
const HIST_MAX = 5e5
const HIST_MOD_OFFI = 100
const HIST_MOD_PRIV = 20
const ROOM_SIZE = 50

interface RoomObject {
    _id: string
    type: string
    name: string
    x: number
    y: number
    body: object[]
    user: string
    structureType: string
    mineralType: string
}

interface RoomName {
    readonly shard: string
    readonly name: string
}
const roomKey = ({ shard, name }: RoomName) => `${shard}:${name}`
const ROOM_REGEX = /^([WE])([0-9]+)([NS])([0-9]+)$/;
function roomMove({ shard, name }: RoomName, dx: number, dy: number): RoomName {
    const [_, h, wx, v, wy] = name.match(ROOM_REGEX)!;
    let x = parseInt(wx);
    let y = parseInt(wy);
    if (h == "W") x = ~x;
    if (v == "N") y = ~y;
    x += dx
    y += dy
    let result = "";
    result += x < 0 ? "W" + String(~x) : "E" + String(x);
    result += y < 0 ? "N" + String(~y) : "S" + String(y);
    return { shard, name: result }
}

class Terrain {
    private constructor(private readonly encoded: string) { }

    private static cache = new Map<string, Terrain>()
    static async get(api: ScreepsAPI, r: RoomName) {
        const key = roomKey(r)
        if (!this.cache.has(key)) {
            const res = await api.raw.game.roomTerrain(r.name, 1, r.shard) as { terrain: { terrain: string }[] }
            this.cache.set(key, new Terrain(res.terrain[0].terrain))
        }
        return this.cache.get(key)
    }

    at(x: number, y: number): TerrainCell {
        if (x < 0 || y < 0 || x >= ROOM_SIZE || y >= ROOM_SIZE) return 1;
        return Number(this.encoded[y * ROOM_SIZE + x])
    }
}
enum TerrainCell { plain, wall, swamp, also_wall }

interface RoomTick {
    gameTime: number,
    objects?: Record<string, Partial<RoomObject>>,
}
abstract class ARoomState {
    constructor(readonly r: RoomName) { }

    private _at = new Map<number, Set<string>>()
    private _objects = new Map<string, Partial<RoomObject>>()
    at(x: number, y: number): Partial<RoomObject>[] {
        const set = this._at.get(y * ROOM_SIZE + x)
        return Array.from(set ?? []).map(id => this._objects.get(id)).filter(v => v)
    }

    private _tick = 0
    get tick() { return this._tick }

    abstract _pull(): Promise<RoomTick>
    async next() {
        const value = await this._pull()
        this._tick = value.gameTime
        if (!value.objects) return false;

        for (const id in value.objects) {
            const up = value.objects[id]
            const prev = this._objects.get(id) || {}

            if (up) {
                if (up.x !== undefined && up.y !== undefined) {
                    for (const cell of this._at.values()) {
                        cell.delete(id)
                    }
                    const p = up.y * ROOM_SIZE + up.x
                    this._at.set(p, (this._at.get(p) ?? new Set()).add(id))
                }
                this._objects.set(id, Object.assign(this._objects.get(id) ?? {}, up))
            } else {
                for (const cell of this._at.values()) {
                    cell.delete(id)
                }
                this._objects.delete(id)
            }
        }
        return true
    }

    abstract close(): Promise<void>
}

class NoRoomState extends ARoomState {
    async _pull() { return { gameTime: 0 } }
    async close() { }
}
class CurrentRoomState extends ARoomState {
    private _q: RoomTick[] = []
    private ready = false
    private closed = false
    private readonly path: string 
    constructor(private api: ScreepsAPI, r: RoomName) {
        super(r)
        this.path = `room:${api.isOfficialServer() ? r.shard + '/' : ''}${r.name}`
    }
    async _pull() {
        if (!this.ready) {
            if (!this.api.socket.connected) {
                await this.api.socket.connect()
            }
            this.ready = true
            const q = this._q
            await this.api.socket.subscribe(this.path, ev => q.push(ev.data))
        }
        while (!this._q.length && !this.closed) {
            await this.api.socket.sleep(100)
        }
        return this._q.shift() ?? { gameTime: 0 }
    }
    async close() {
        this.closed = true
        if (this.ready) {
            await this.api.socket.unsubscribe(this.path)
        }
    }
}

interface HistoryRes { timestamp: number, base: number, ticks: Record<string, Record<string, Partial<RoomObject>>> }
class PastRoomState extends ARoomState {
    private readonly histMod: number
    private h: HistoryRes = { timestamp: 0, base: Number.NEGATIVE_INFINITY, ticks: {} }

    constructor(private api: ScreepsAPI, r: RoomName, private h_tick: number) {
        super(r)
        this.histMod = api.isOfficialServer() ? HIST_MOD_OFFI : HIST_MOD_PRIV
    }

    async _pull() {
        this.h_tick++
        if (this.h_tick >= this.h.base + this.histMod) {
            const h = await this.api.history(this.r.name, this.tick, this.r.shard).catch(() => null)
            if (h) {
                this.h = h
                const objects = {}
                for (let i = h.base; i <= this.h_tick; i++) {
                    const v = this.h.ticks[i] || {}
                    for (const key in v) {
                        objects[key] = v[key] ? Object.assign(objects[key] || {}, v[key]) : null
                    }
                }
                return { gameTime: this.h_tick, objects }
            } else {
                return { gameTime: this.h_tick };
            }
        }
        return { gameTime: this.h_tick, objects: this.h.ticks[this.h_tick] || {} }
    }
    async close() { }
}

(async () => {
    const program = blessed.program()
    process.title = 'Screeps TUI'

    program.alternateBuffer()
    program.enableMouse()
    program.hideCursor()
    program.clear()
    process.on('exit', () => {
        program.clear()
        program.disableMouse()
        program.showCursor()
        program.normalBuffer()
    })

    program.write('Connecting...')

    const api = await ScreepsAPI.fromConfig(process.argv[2], 'tui' as any)
    const config = Object.assign({

    }, (api as { appConfig?: object }).appConfig || {})

    const _id = await api.userID()
    const shards: { [shard: string]: string[] } = (await api.raw.user.rooms(_id)).shards
    const rooms = Object.entries(shards).flatMap(([shard, rooms]) => rooms.map(name => ({ shard, name } as RoomName)))

    //TODO: if no room
    let myRoomIndex = 0
    loop.room = new CurrentRoomState(api, rooms[myRoomIndex]) as ARoomState
    function changeRoom(r: RoomName) {
        const old_r = loop.room
        old_r.close()
        loop.room = new CurrentRoomState(api, r)
    }

    await api.socket.connect()

    function drawRoomNames() {
        const lr = roomKey(loop.room.r)
        for (const r of [].concat(rooms.map(roomKey), lr === roomKey(rooms[myRoomIndex]) ? [] : [lr])) {
            if (lr === r) {
                program.fg('black')
                program.bg('white')
            }
            program.write(r)
            if (lr === r) {
                program.fg('!black')
                program.bg('!white')
            }
            program.write(' ')
        }
        program.cursorDown()
        program.return()
    }
    function drawRoom(t: Terrain, s: ARoomState) {
        for (let y = 0; y < ROOM_SIZE; y++) {
            for (let x = 0; x < ROOM_SIZE; x++) {
                switch (t.at(x, y)) {
                    case TerrainCell.plain:
                        program.bg('grey')
                        break
                    case TerrainCell.swamp:
                        program.bg('green')
                        break
                    default:
                        program.bg('black')
                        break
                }
                const objs = s.at(x, y)
                if (objs.length) {
                    const top = objs.reduce((top, cur) => {
                        if (!top || top.type === 'road') return cur;
                        if (cur.type === 'creep') return cur
                        return top
                    }, null)
                    switch (top.type) {
                        case "road":
                            let nbs = ''
                            let i = 0
                            for (let dy = -1; dy <= 1; dy++) {
                                for (let dx = -1; dx <= 1; dx++) {
                                    if ((dy || dx) && s.at(x + dx, y + dy).some(o => o.type === 'road')) {
                                        nbs += i
                                    }
                                    i++
                                }
                            }
                            const ROAD_MAP = {
                                '1': '╵',
                                '3': '╴',
                                '5': '╶',
                                '7': '╷',
                                '0': '╲',
                                '8': '╲',
                                '2': '╱',
                                '6': '╱',
                                '08': '╲',
                                '13': '┘',
                                '15': '└',
                                '17': '│',
                                '26': '╱',
                                '35': '─',
                                '37': '┐',
                                '57': '┌',
                                '135': '┴',
                                '137': '┤',
                                '157': '├',
                                '357': '┬',
                                '1357': '┼',
                            }
                            program.write(ROAD_MAP[nbs] || '╳')
                            break;
                        case "container":
                            program.write('⊔')
                            break;
                        case "creep":
                            program.write('o')
                            break;
                        case "spawn":
                            program.write('0')
                            break;
                        case "extension":
                            program.write('O')
                            break;
                        case "source":
                            program.fg('yellow')
                            program.write('◼')
                            program.fg("!yellow")
                            break;
                        case "mineral":
                            program.write(top.mineralType[0])
                            break;
                        default:
                            program.write(top.type ? top.type[0] : '?')
                            break;
                    }
                } else {
                    program.write(' ')
                }
                //Resource: ·
            }
            program.cursorDown()
            program.return()
        }
    }
    async function loop() {
        let prevR = null
        while (true) {
            if (loop.room.r !== prevR) {
                prevR = loop.room.r
                program.clear()
                drawRoomNames()
                program.write('Loading...')
            }
            const [t, ok] = await Promise.all([Terrain.get(api, loop.room.r), loop.room.next()])
    
            program.cursorPos(1, 0)
            const margin = program.rows - ROOM_SIZE - 2
            if (margin >= 0) {
                drawRoom(t, loop.room)
            } else {
                program.write(`Terminal too small of ${-margin} rows`)
                program.cursorDown()
                program.return()
            }
            program.write(`Tick: ${loop.room.tick || '???'} ${!ok ? ' - No history' : '                    '}`)

            await api.socket.sleep(100)
        }
    }
    loop()
    
    program.on('keypress', (ch, key) => {
        switch (key.full) {
            case "q":
            case "C-c":
                process.exit()
                break;
            case "tab":
                myRoomIndex = (myRoomIndex + 1) % rooms.length
                changeRoom(rooms[myRoomIndex])
                break;
            case "S-tab":
                myRoomIndex = (myRoomIndex - 1) % rooms.length
                changeRoom(rooms[myRoomIndex])
                break;
            case "up":
                changeRoom(roomMove(loop.room.r, 0, -1))
                break;
            case "down":
                changeRoom(roomMove(loop.room.r, 0, 1))
                break;
            case "right":
                changeRoom(roomMove(loop.room.r, 1, 0))
                break;
            case "left":
                changeRoom(roomMove(loop.room.r, -1, 0))
                break;
            case "pageup":
                const old_u = loop.room
                loop.room = new PastRoomState(api, loop.room.r, loop.room.tick - HIST_MOD_OFFI*10)
                old_u.close()
                break
            case "pagedown":
                const old_d = loop.room
                loop.room = new CurrentRoomState(api, loop.room.r)
                old_d.close()
                break
            default:
                //console.log(JSON.stringify(key))
                break
        }
    });
    program.feed();
})()
