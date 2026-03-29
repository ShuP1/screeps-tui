import { ROOM_SIZE, RoomXY, type Coords, type RoomName, type ShardName } from "@/game/base"
import type { ScreepsAPI } from "screeps-api"
import MapView from "./MapView"
import { createMemo, createSignal, onCleanup } from "solid-js"
import type { OnRoomMapUpdate, OnRoomUpdate } from "@/game/ObjectProvider"
import TerrainProvider from "@/game/TerrainProvider"
import ObjectProvider from "@/game/ObjectProvider"
import type { BoxRenderable, KeyEvent } from "@opentui/core"
import { createStore } from "solid-js/store"
import { ObjectStorage } from "@/game/ObjectStorage"
import { useKeyboard } from "@opentui/solid"

const moveSpeed = 2
const fastMoveSpeed = 10

type MapProps = {
  api: ScreepsAPI
  shard?: ShardName
  room: RoomName
  setRoom: (room: RoomName) => void
}
function MapState(props: MapProps) {
  const { api, shard } = props
  const [ref, setRef] = createSignal<BoxRenderable>()
  const [position, setPosition] = createSignal({ x: ROOM_SIZE / 2, y: ROOM_SIZE / 2 } as Coords)
  const [objectChange, setObjectChange] = createSignal<RoomName>()
  const [status, setStatus] = createStore({
    tick: undefined as number | undefined,
    liveTick: undefined as number | undefined,
    replayRate: 5,
    state: "live" as "live" | "paused" | "history",
  })
  let replayTimer: NodeJS.Timeout | undefined

  const objects = new ObjectStorage(api, shard)

  // Every where
  useKeyboard((e) => {
    if (e.name === "escape") ref()?.focus()
  })
  // Only when map is focused
  const onKeyDown = (e: KeyEvent) => {
    switch (e.name) {
      case "up":
      case "k":
        movePostion({ x: 0, y: -1 }, e.shift)
        break
      case "down":
      case "j":
        movePostion({ x: 0, y: 1 }, e.shift)
        break
      case "left":
      case "h":
        movePostion({ x: -1, y: 0 }, e.shift)
        break
      case "right":
      case "l":
        movePostion({ x: 1, y: 0 }, e.shift)
        break

      case "space":
        switch (status.state) {
          case "live":
            setStatus("state", "paused")
            break
          case "paused":
            setStatus("state", "history")
            replayTimer ??= startReplay()
            break
          case "history":
            if (replayTimer) {
              clearInterval(replayTimer)
              replayTimer = undefined
            }
            setStatus("state", "paused")
            break
        }
        break
      case "pageup": {
        // go back in time
        const t = status.tick
        if (t === undefined) return
        const step = e.shift ? 100 : 1
        setStatus("tick", Math.max(t! - step, 0))
        if (status.state !== "paused") {
          setStatus("state", "history")
          replayTimer ??= startReplay()
        }
        renderHistory()
        break
      }
      case "pagedown": {
        // go forward in time
        const t = status.tick
        const lt = status.liveTick
        if (t === undefined || lt === undefined) return
        const step = e.shift ? 100 : 1
        if (t + step >= lt) {
          // back to live
          setStatus("tick", lt)
          if (status.state !== "paused") setStatus("state", "live")
        } else {
          setStatus("tick", t + step)
          if (status.state !== "paused") {
            setStatus("state", "history")
            replayTimer ??= startReplay()
          }
        }
        renderHistory()
        break
      }
      case "+":
      case "kpplus":
        setStatus("replayRate", status.replayRate * 2)
        if (replayTimer) {
          clearInterval(replayTimer)
          replayTimer = startReplay()
        }
        break
      case "-":
      case "kpminus":
        setStatus("replayRate", Math.max(status.replayRate / 2, 0.25))
        if (replayTimer) {
          clearInterval(replayTimer)
          replayTimer = startReplay()
        }
        break
    }
  }

  const movePostion = (offset: Coords, fast: boolean) => {
    offset.x *= fast ? fastMoveSpeed : moveSpeed
    offset.y *= fast ? fastMoveSpeed : moveSpeed
    if (offset.x !== 0 || offset.y !== 0) {
      setPosition((prev) => {
        const x = prev.x + offset.x
        const y = prev.y + offset.y
        if (x < 0 || x >= ROOM_SIZE || y < 0 || y >= ROOM_SIZE) {
          const rOffsetX = Math.floor(x / ROOM_SIZE)
          const rOffsetY = Math.floor(y / ROOM_SIZE)

          const r = RoomXY.fromName(props.room)
          r.x += rOffsetX
          r.y += rOffsetY

          props.setRoom(r.toName())
          return { x: x - rOffsetX * ROOM_SIZE, y: y - rOffsetY * ROOM_SIZE }
        }
        return { x, y }
      })
    }
  }

  const startReplay = () =>
    setInterval(() => {
      if (status.tick === undefined) return

      setStatus("tick", status.tick + 1)
      renderHistory()
      if (status.liveTick !== undefined && status.tick >= status.liveTick) {
        clearInterval(replayTimer!)
        replayTimer = undefined
        setStatus("state", "live")
      }
    }, 1000 / status.replayRate)
  const renderHistory = () => {
    if (status.tick === undefined) return

    triggerObjectsDraw()
    objects
      .fetchHistories(status.tick, status.liveTick)
      ?.then(triggerObjectsDraw)
      .catch(console.error)
  }

  const onViewChange = async (rooms: RoomName[]) => {
    objects.setViewport(rooms)

    const room = props.room

    if (terrainProvider.cache.size) triggerFullDraw()
    liveObjects.setFocusedRoom(room).catch(console.error)
    liveObjects.setViewport(rooms).catch(console.error)

    if (terrainProvider.areAllCached(rooms)) return
    // already cached, no need to load

    await terrainProvider.load(rooms)
    if (props.room !== room) return console.warn("room changed during async load, skipping draw")
    if (objects.rooms.size !== rooms.length || rooms.some((r) => !objects.rooms.has(r)))
      return console.warn("visible rooms changed during async load, skipping draw")

    triggerFullDraw()
  }
  const triggerFullDraw = () => {
    setPosition({ ...position() })
  }
  const triggerObjectsDraw = () => {
    for (const room of objects.rooms.keys()) {
      setObjectChange(room)
    }
  }

  const onMapUpdate: OnRoomMapUpdate = (room, data) => {
    //NOTE: room event is called after map events. So state.liveTick is off by one
    objects.push(room, data, status.liveTick !== undefined ? status.liveTick + 1 : undefined)
  }
  const onRoomUpdate: OnRoomUpdate = (room, data) => {
    //NOTE: room event is called after map events

    if (status.liveTick === undefined) {
      if (data.gameTime !== undefined) {
        // second live tick, first tick with time info
        objects.patchUnknownTicks(data.gameTime)
      } // else first tick, still no time info, keep unknown
    }
    // else if (data.gameTime === undefined)
    // room change during live, we don't know if it's same tick or next...

    setStatus("liveTick", data.gameTime)
    if (status.tick === undefined || status.state === "live") setStatus("tick", data.gameTime)

    if (status.state === "live") triggerObjectsDraw()
  }

  const terrainProvider = new TerrainProvider(api, shard)
  const liveObjects = new ObjectProvider(api, shard, onMapUpdate, onRoomUpdate)
  onCleanup(() => {
    clearInterval(replayTimer)
    liveObjects.unsubscribe().catch(console.error)
  })

  return (
    <box
      ref={setRef}
      flexGrow={1}
      minWidth="50%"
      minHeight="50%"
      onKeyDown={onKeyDown}
      focusable
      focused
    >
      <MapView
        room={props.room}
        position={position()}
        objectChangeIn={objectChange()}
        terrains={(r) => terrainProvider.cache.get(r) || undefined}
        objects={(r) => objects.get(r, status.tick)}
        onViewChange={onViewChange}
      />
      <box backgroundColor="#333" flexDirection="row" minHeight={1} justifyContent="space-between">
        <text>
          Tick #{status.tick || "?"}
          {status.state !== "live" ? ` (live: ${status.liveTick})` : ""}
        </text>
        <text>
          Speed:{" "}
          {status.state === "live"
            ? "live"
            : status.state === "paused"
              ? "paused"
              : `${status.replayRate} tick/s`}
        </text>
        <box></box>
      </box>
    </box>
  )
}

export default function Map_(props: MapProps) {
  return createMemo(() => {
    const { api, shard } = props
    return <MapState {...props} api={api} shard={shard} />
  })
}
