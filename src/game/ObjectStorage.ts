import type { ScreepsAPI } from "screeps-api"
import type { RoomName } from "./base"
import { MAX_OBJECT_AGE, type RoomObject, type RoomObjects } from "./ObjectProvider"

const unknownTick = -1

export class ObjectStorage {
  rooms = new Map<RoomName, { firstTick: number; data: RoomObjects[] }[]>()

  private readonly historyInterval: number
  private pendingHistory = new Map<RoomName, Promise<void>>()

  constructor(
    private readonly api: ScreepsAPI,
    private readonly shard?: string,
  ) {
    this.historyInterval = api.isOfficialServer() ? 100 : 20
  }

  setViewport(rooms: RoomName[]) {
    for (const r of this.rooms.keys()) {
      if (!rooms.includes(r)) this.rooms.delete(r)
    }
    for (const r of rooms) {
      if (!this.rooms.has(r)) this.rooms.set(r, [])
    }
  }

  get(room: RoomName, tick: number | undefined) {
    const chunks = this.rooms.get(room)
    if (!chunks || !chunks.length) return []

    if (tick === undefined) {
      // tick not known yet, return the latest chunk
      const { data } = chunks[chunks.length - 1]
      return data[data.length - 1]
    }

    const chunk = chunks.find((c) => c.firstTick <= tick && c.firstTick + c.data.length > tick)
    if (!chunk) return []

    return chunk.data[tick - chunk.firstTick]
  }

  push(room: RoomName, objects: RoomObjects, tick: number | undefined) {
    const chunks = this.rooms.get(room)
    if (!chunks) return

    const chunk =
      tick !== undefined
        ? chunks.find((c) => c.firstTick + c.data.length == tick)
        : chunks.length && chunks[chunks.length - 1].firstTick === unknownTick
          ? chunks[chunks.length - 1]
          : undefined
    if (chunk) {
      chunk.data.push(objects)
    } else {
      chunks.push({ firstTick: tick ?? unknownTick, data: [objects] })
      if (tick !== undefined)
        console.warn(
          "no chunk",
          tick,
          "in room",
          room,
          chunks.map((c) => c.firstTick),
        )
    }
  }
  patchUnknownTicks(tick: number) {
    for (const chunks of this.rooms.values()) {
      for (const chunk of chunks) {
        if (chunk.firstTick === unknownTick) chunk.firstTick = tick - chunk.data.length + 1
      }
    }
  }

  fetchHistories(tick: number, liveTick: number | undefined) {
    if (liveTick === undefined) return null

    const baseTick = tick - (tick % this.historyInterval)
    const endTick = baseTick + this.historyInterval
    // add some buffer to avoid requesting just before the next chunk is published
    if (liveTick < endTick + this.historyInterval / 5) return null

    const promises: Promise<void>[] = []
    for (const [room, chunks] of this.rooms) {
      if (this.pendingHistory.has(room)) continue

      // already have data for this chunk
      if (chunks.some((c) => c.firstTick <= baseTick && c.firstTick + c.data.length > baseTick))
        continue

      const promise = this.fetchHistory(room, baseTick)
        .catch((err) => {
          if (!(err instanceof Error) || err.message !== "Not Found")
            console.warn("failed to load history for", room, "tick", baseTick, err)

          // assume unrecoverable error
          chunks.push({ firstTick: baseTick, data: Array(this.historyInterval).fill([]) })
        })
        .finally(() => {
          this.pendingHistory.delete(room)
        })
      promises.push(promise)
      this.pendingHistory.set(room, promise)
    }
    return promises.length ? Promise.all(promises) : null
  }
  private async fetchHistory(room: RoomName, tick: number) {
    const { base, ticks } = await this.api.raw.history(room, tick, this.shard)

    const chunks = this.rooms.get(room)
    if (!chunks) return // room no longer visible

    const current = new Map<string, RoomObject>()
    //MAYBE: insert get(room, tick-1) to avoid age blink on base ticks

    const data: RoomObjects[] = []
    for (let t = base; t <= base + this.historyInterval; t++) {
      for (const old of current.values()) {
        if (old.age >= MAX_OBJECT_AGE) continue
        const copy = { ...old }
        copy.age += 1
        current.set(old.id!, copy)
      }

      const tickData = ticks[t]
      for (const id in tickData) {
        const patch: HistoryData | undefined | null = tickData[id]
        if (!patch) {
          current.delete(id)
          continue
        }
        const { x, y, type, user } = patch
        const old = current.get(id)
        if (old) {
          if (
            patch.x === old.x &&
            patch.y === old.y &&
            patch.type === old.type &&
            patch.user === old.owner
          )
            continue
          if (x === null || y === null || type === null) {
            console.warn(
              "invalid history patch for",
              id,
              "in room",
              room,
              "tick",
              t,
              old,
              "=>",
              patch,
            )
            continue
          }

          const copy = { ...old }
          copy.age = 0
          if (x !== undefined) copy.x = x
          if (y !== undefined) copy.y = y
          if (type !== undefined) copy.type = type
          if (user !== undefined) copy.owner = user || undefined
          current.set(id, copy)
          continue
        }
        if (
          x === undefined ||
          y === undefined ||
          type === undefined ||
          x === null ||
          y === null ||
          type === null
        ) {
          console.warn("incomplete history object for", id, "in room", room, "tick", t, patch)
          continue
        }
        current.set(id, {
          x,
          y,
          type,
          age: t === base ? MAX_OBJECT_AGE : 0,
          id,
          owner: user || undefined,
        })
      }

      data.push(Array.from(current.values()))
    }

    chunks.unshift({ firstTick: base, data })
  }
}

type HistoryData = Partial<{
  x: number | null
  y: number | null
  type: string | null
  user: string | null
}>
