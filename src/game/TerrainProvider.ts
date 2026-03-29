import type { ScreepsAPI } from "screeps-api"
import { ROOM_SIZE, type RoomName } from "./base"

class AsyncBatchCache<K, V> {
  private _cache = new Map<K, V>()
  private pending = new Map<K, Promise<void>>()

  constructor(private loader: (keys: K[]) => Promise<Map<K, V>>) {}

  get cache(): ReadonlyMap<K, V> {
    return this._cache
  }
  set(key: K, value: V) {
    this._cache.set(key, value)
  }

  areAllCached(keys: K[]) {
    return keys.every((key) => this._cache.has(key))
  }
  async load(keys: K[]) {
    const uncached = keys.filter((key) => !this._cache.has(key))
    const pending = uncached.map((key) => this.pending.get(key)).filter((v) => v !== undefined)
    const others = uncached.filter((key) => !this.pending.has(key))
    if (others.length) {
      const promise = this.loader(others).then((results) => {
        results.forEach((value, key) => this._cache.set(key, value))
        others.forEach((key) => this.pending.delete(key))
      })
      others.forEach((key) => this.pending.set(key, promise))
      pending.push(promise)
    }
    await Promise.all(pending)
    return this.cache
  }
}

export default class TerrainProvider extends AsyncBatchCache<RoomName, Terrain | false> {
  constructor(
    readonly api: ScreepsAPI,
    readonly shard?: string,
  ) {
    super(async (roomNames: RoomName[]) => {
      const { rooms } = await api.raw.game.rooms(roomNames, shard)
      //MAYBE: cache to disk?
      const map = new Map<RoomName, Terrain | false>()
      for (const name of roomNames) map.set(name, false)
      for (const room of rooms) map.set(room.room as RoomName, new Terrain(room.terrain))
      return map
    })
  }
}

export class Terrain {
  constructor(readonly data: string) {}

  get(x: number, y: number) {
    return this.data[y * ROOM_SIZE + x] as TerrainType
  }
}

export enum TerrainType {
  Plain = "0",
  Wall = "1",
  Swamp = "2",
  AlsoWall = "3",
}
export function isWall(type: TerrainType) {
  return type === TerrainType.Wall || type === TerrainType.AlsoWall
}
