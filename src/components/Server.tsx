import { ScreepsAPI } from "screeps-api"
import {
  onCleanup,
  createResource,
  Show,
  createSignal,
  createEffect,
  createMemo,
  batch,
} from "solid-js"
import Console from "./Console"
import Map from "./Map"
import SplashLoader from "./splash/SplashLoader"
import Header from "./Header"
import { options } from "../globals"
import type { RoomName, ShardName } from "@/game/base"
import type { BoxRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"

export default function Server({ name }: { name: string }) {
  const [shard, setShard] = createSignal<ShardName>()
  const [room, setRoom] = createSignal<RoomName>()
  let ownedRooms: { room: RoomName; shard?: ShardName }[] = []
  let ownedRoomIndex = 0

  const [api] = createResource(
    async () => {
      const api = await ScreepsAPI.fromConfig(name, "tui", { name, experimentalRetry429: true })
      // Test the connection before returning the API instance
      const me = await api.me()

      console.log("Connected to server", name)

      let room: string | undefined
      let shard = options.shard
      if ("cpuShard" in me && me.cpuShard) {
        if (shard && !(shard in me.cpuShard)) {
          console.error(
            `Specified shard ${shard} is not available for server ${api.opts.url} (available shards: ${Object.keys(me.cpuShard).join(", ")})`,
          )
          shard = undefined
        }
      } else {
        console.warn(`Server ${api.opts.url} do not support shards, ignoring shard option`)
        shard = undefined
      }

      const rooms: { rooms: RoomName[] } | { shards: { [shard: string]: RoomName[] } } =
        await api.raw.user.rooms(me._id)
      ownedRooms =
        "shards" in rooms
          ? Object.entries(rooms.shards).flatMap(([shardName, rooms]) =>
              rooms.map((room) => ({ room, shard: shardName as ShardName })),
            )
          : rooms.rooms.map((room) => ({ room }))

      if (shard) {
        ownedRoomIndex = ownedRooms.findIndex((r) => r.shard === shard)
        if (ownedRoomIndex >= 0) {
          room = ownedRooms[ownedRoomIndex].room
        } else {
          console.warn(`No owned room found in shard ${shard}`)
        }
      } else if (ownedRooms.length) {
        shard = ownedRooms[0].shard
        room = ownedRooms[0].room
      }
      if (!room) {
        const start = await api.raw.user.worldStartRoom(shard)
        room = start.room[0]
        if (room.includes("/")) {
          const parts = room.split("/", 2)
          shard = parts[0]
          room = parts[1]
        }
      }
      setShard(shard as ShardName | undefined)
      setRoom(room as RoomName)

      return api
    },
    { name: "api" },
  )
  onCleanup(() => api.state === "ready" && api.latest.socket.disconnect())

  createEffect(() => {
    if (api.state == "ready") api.latest.appConfig.shard = shard()
  })

  useKeyboard((e) => {
    if (e.name === "tab") {
      if (e.repeated || e.meta || e.ctrl) return
      if (ownedRooms.length <= 1) return

      if (e.shift) {
        ownedRoomIndex -= 1
        if (ownedRoomIndex < 0) ownedRoomIndex = ownedRooms.length - 1
      } else {
        ownedRoomIndex = (ownedRoomIndex + 1) % ownedRooms.length
      }
      const next = ownedRooms[ownedRoomIndex]
      batch(() => {
        if (next.shard !== shard()) setShard(next.shard)
        setRoom(next.room)
      })
      e.preventDefault()
    }
  })

  const [size, setSize] = createSignal({ width: 0, height: 0 })
  function onSizeChange(this: BoxRenderable) {
    setSize({ width: this.width, height: this.height })
  }
  const wide = createMemo(() => size().width >= size().height * 2)

  return (
    <Show when={api()} fallback={<SplashLoader>Connecting to {name}</SplashLoader>}>
      <box flexDirection="column">
        <Header api={api()!} shard={shard()} room={room()} />
        <box flexGrow={1} onSizeChange={onSizeChange} flexDirection={wide() ? "row" : "column"}>
          <Map api={api()!} shard={shard()} room={room()!} setRoom={setRoom} />
          <Console api={api()!} wide={wide()} />
        </box>
      </box>
    </Show>
  )
}
