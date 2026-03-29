import type { ScreepsAPI, SocketEventTypes } from "screeps-api"
import type { RoomName, ShardName } from "./base"

type Message = SocketEventTypes[keyof SocketEventTypes][0]
export default class ObjectProvider {
  private rooms = new Map<RoomName, RoomObjects | null>()
  private focusedRoom: RoomName | null = null

  constructor(
    readonly api: ScreepsAPI,
    readonly shard: ShardName | undefined,
    private readonly onRoomMapUpdate: OnRoomMapUpdate,
    private readonly onRoomUpdate: OnRoomUpdate,
  ) {}

  private onRoomMapMessage = (msg: Message) => {
    const room = msg.channel as RoomName
    if (msg.type !== "roomMap2" || msg.id !== this.shard || !this.rooms.has(room)) return

    const prev = this.rooms.get(room)
    const data: RoomMapData = msg.data

    const next: RoomObject[] = []
    for (const key in data) {
      const points = data[key] || []
      const type = roomMapKeyTypes[key]
      for (const [x, y] of points) {
        const old = prev?.find(
          (o) => o.x === x && o.y === y && (type ? o.type === type : o.owner === key),
        )
        next.push(
          old && old.age >= MAX_OBJECT_AGE
            ? old
            : {
                x,
                y,
                type,
                age: old ? old.age + 1 : prev ? 0 : MAX_OBJECT_AGE,
                id: old?.id,
                owner: type ? old?.owner : key,
              },
        )
      }
    }

    this.rooms.set(room, next)
    this.onRoomMapUpdate(room, next)
  }
  private onRoomMessage = (msg: Message) => {
    const room = msg.channel as RoomName
    if (msg.type !== "room" || msg.id !== this.shard || this.focusedRoom !== room) return

    const data: RoomData = msg.data
    this.onRoomUpdate(room, data)
  }

  setViewport(rooms: RoomName[]) {
    const promises: Promise<void>[] = []
    for (const name of this.rooms.keys()) {
      if (!rooms.includes(name)) {
        const key = this.getEventKey("roomMap2", name)
        promises.push(this.api.socket.unsubscribe(key))
        this.api.socket.off(key, this.onRoomMapMessage)
        this.rooms.delete(name)
      }
    }
    for (const name of rooms) {
      if (!this.rooms.has(name)) {
        this.rooms.set(name, null)
        const key = this.getEventKey("roomMap2", name)
        this.api.socket.on(key, this.onRoomMapMessage)
        promises.push(this.api.socket.subscribe(key))
      }
    }
    return Promise.all(promises).then(() => {})
  }
  async setFocusedRoom(room: RoomName | null) {
    if (this.focusedRoom === room) return
    if (this.focusedRoom) {
      const key = this.getEventKey("room", this.focusedRoom)
      await this.api.socket.unsubscribe(key)
      this.api.socket.off(key, this.onRoomMessage)
    }
    this.focusedRoom = room
    if (room) {
      const key = this.getEventKey("room", room)
      this.api.socket.on(key, this.onRoomMessage)
      await this.api.socket.subscribe(key)
    }
  }

  unsubscribe() {
    return Promise.all([this.setViewport([]), this.setFocusedRoom(null)]).then(() => {})
  }

  get(room: RoomName) {
    return this.rooms.get(room)
  }

  private getEventKey(channel: string, name: RoomName) {
    return `${channel}:${[this.shard, name].filter((v) => v).join("/")}`
  }
}

export type OnRoomMapUpdate = (room: RoomName, objects: RoomObjects) => void
export type OnRoomUpdate = (room: RoomName, data: RoomData) => void

type ObjectType = string
export interface RoomObject {
  x: number
  y: number
  age: number
  type?: ObjectType
  id?: string
  owner?: string
}
export type RoomObjects = ReadonlyArray<RoomObject>
export const MAX_OBJECT_AGE = 15

const roomMapKeyTypes: Partial<Record<string, ObjectType>> = {
  w: "constructedWall",
  r: "road",
  pb: "powerBank",
  p: "portal",
  s: "source",
  c: "controller",
  m: "mineral",
  k: "keeperLair",
}

type Points = ReadonlyArray<Readonly<[x: number, y: number]>>
type RoomMapData = Partial<{ [user_id: string]: Points }> & {
  w: Points
  r: Points
  pb: Points
  p: Points
  s: Points
  c: Points
  m: Points
  k: Points
}

interface RoomData {
  objects?: { [id: string]: {} }
  users?: { [id: string]: {} }
  flags?: unknown
  decorations?: unknown[]
  visual?: string
  gameTime?: number
}
