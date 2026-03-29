import { RGBA } from "@opentui/core"
import { createEffect, createMemo, createSignal } from "solid-js"
import pixel_buffer, { PixelBufferRenderable } from "./ui/pixel_buffer"
import { isWall, Terrain, TerrainType } from "../game/TerrainProvider"
import { isExit, ROOM_SIZE, RoomXY, type Coords, type RoomName } from "@/game/base"
import type { RoomObjects } from "@/game/ObjectProvider"
pixel_buffer()

const defaultTheme = {
  wall: RGBA.fromHex("#0d0d0d"),
  plain: RGBA.fromHex("#2b2b2b"),
  swamp: RGBA.fromHex("#232513"),
  exit: RGBA.fromHex("#323232"),
  constructedWall: RGBA.fromHex("#1a1a1a"),
  road: RGBA.fromHex("#676767"),
  powerBank: RGBA.fromHex("#c80205"),
  portal: RGBA.fromHex("#2bf3ff"),
  source: RGBA.fromHex("#fff246"),
  controller: RGBA.fromHex("#505050"),
  mineral: RGBA.fromHex("#aaaaaa"),
  keeperLair: RGBA.fromHex("#640000"),
  keeper: RGBA.fromHex("#ffbb13"),
  container: RGBA.fromHex("#888888"),
  energy: RGBA.fromHex("#ffff00"),
  terminal: RGBA.fromHex("#aaaaaa"),
  deposit: RGBA.fromHex("#aaaaaa"),
  extractor: RGBA.fromHex("#aaaaaa"),
  my: RGBA.fromHex("#00ff00"),
  error: RGBA.fromHex("#ff00ff"),
}

const terrainColors: Record<string, RGBA> = {
  [TerrainType.Plain]: defaultTheme.plain,
  [TerrainType.Wall]: defaultTheme.wall,
  [TerrainType.Swamp]: defaultTheme.swamp,
  [TerrainType.AlsoWall]: defaultTheme.wall,
}
const getTerrainColor = (terrain: Terrain, x: number, y: number) => {
  const value = terrain.get(x, y)
  return !isWall(value) && isExit(x, y) ? defaultTheme.exit : terrainColors[value]
}

const playerColors: Partial<Record<string, RGBA>> = {
  "2": defaultTheme.keeper,
  "3": defaultTheme.keeper,
}
const getPlayerColor = (userId: string, age: number) => {
  const special = playerColors[userId]
  if (special) return special

  const hue = parseInt(userId.slice(0, 6), 16) % 360
  return rbgaFromHSL(hue, 90, 60 - Math.min(age, 15) * 2)
}
const rbgaFromHSL = (h: number, s: number, l: number) => {
  l /= 100
  const a = (s * Math.min(l, 1 - l)) / 100
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return RGBA.fromValues(f(0), f(8), f(4))
}

const pixelSize = (buffer: PixelBufferRenderable) => ({
  x: buffer.width,
  y: buffer.height * 2,
})
const roundToRoom = ({ x, y }: Coords) => {
  const oddRoundUp = (n: number) => n + (n % 2) + 1
  return {
    x: oddRoundUp(Math.ceil(x / ROOM_SIZE)),
    y: oddRoundUp(Math.ceil(y / ROOM_SIZE)),
  }
}
const halveSize = ({ x, y }: Coords) => ({
  x: Math.floor(x / 2),
  y: Math.floor(y / 2),
})
const getVisibleRooms = (center: RoomName, buffer: PixelBufferRenderable) => {
  const size = pixelSize(buffer)
  const centerRoom = RoomXY.fromName(center)
  const roomSize = roundToRoom(size)
  const roomHalf = halveSize(roomSize)

  const rooms: RoomName[] = []
  for (let ry = 0; ry < roomSize.y; ry++) {
    for (let rx = 0; rx < roomSize.x; rx++) {
      rooms.push(
        new RoomXY(centerRoom.x + rx - roomHalf.x, centerRoom.y + ry - roomHalf.y).toName(),
      )
    }
  }
  return rooms
}

export default function MapView(props: {
  room: RoomName
  position: Coords
  objectChangeIn?: RoomName
  terrains: (r: RoomName) => Terrain | undefined
  objects: (r: RoomName) => RoomObjects
  onViewChange?: (visibleRooms: RoomName[]) => void
}) {
  const [ref, setRef] = createSignal<PixelBufferRenderable>()

  createMemo((prev) => {
    if (prev === props.room) return prev
    const buffer = ref()
    if (buffer) props.onViewChange?.(getVisibleRooms(props.room, buffer))
    return props.room
  })
  createEffect(() => {
    let _ = [props.room, props.position]
    refresh()
  })
  createEffect(() => {
    const room = props.objectChangeIn
    const buffer = ref()
    if (room && buffer) drawObjects(buffer, room, props.objects(room))
  })

  const refresh = () => {
    const buffer = ref()
    if (!buffer) return

    draw(buffer, getVisibleRooms(props.room, buffer))
  }

  const dirtyPoints = new Map<RoomName, { x: number; y: number }[]>() // y * ROOM_SIZE + x
  const draw = (buffer: PixelBufferRenderable, rooms: RoomName[]) => {
    const pos = props.position
    const size = pixelSize(buffer)
    const halfSize = halveSize(size)
    const roomSize = roundToRoom(size)
    const roomHalf = halveSize(roomSize)
    dirtyPoints.clear()
    buffer.setBatch((set) => {
      let i = 0
      for (let ry = 0; ry < roomSize.y; ry++) {
        for (let rx = 0; rx < roomSize.x; rx++) {
          //MAYBE: use room id (ry * mapsize + rx) instead of string search, but it requires mapsize
          const room = rooms[i++]
          const terrain = props.terrains(room)
          if (!terrain) continue

          const offsetX = (rx - roomHalf.x) * ROOM_SIZE + halfSize.x - pos.x
          const offsetY = (ry - roomHalf.y) * ROOM_SIZE + halfSize.y - pos.y

          //MAYBE: convert terrain string to [Float32Array, Float32Array] and blit it
          for (let y = 0; y < ROOM_SIZE; y++) {
            for (let x = 0; x < ROOM_SIZE; x++) {
              set(offsetX + x, offsetY + y, getTerrainColor(terrain, x, y))
            }
          }

          drawObjectsWith(set, terrain, room, { x: offsetX, y: offsetY }, props.objects(room))
        }
      }
    }, true)
  }
  const drawObjects = (buffer: PixelBufferRenderable, room: RoomName, objects: RoomObjects) => {
    const terrain = props.terrains(room)
    if (!terrain) return

    const pos = props.position
    const size = pixelSize(buffer)
    const halfSize = halveSize(size)

    const centerCoords = RoomXY.fromName(props.room)
    const roomCoords = RoomXY.fromName(room)

    const x = (roomCoords.x - centerCoords.x) * ROOM_SIZE + halfSize.x - pos.x
    const y = (roomCoords.y - centerCoords.y) * ROOM_SIZE + halfSize.y - pos.y

    buffer.setBatch((set) => drawObjectsWith(set, terrain, room, { x, y }, objects))
  }
  const drawObjectsWith = (
    set: (x: number, y: number, color: RGBA) => void,
    terrain: Terrain,
    room: RoomName,
    offset: Coords,
    cur: RoomObjects,
  ) => {
    const next: { x: number; y: number }[] = []
    for (const { x, y, age, type, owner } of cur) {
      const color = owner
        ? getPlayerColor(owner, age)
        : defaultTheme[type as keyof typeof defaultTheme] || defaultTheme.error
      next.push({ x, y })
      set(offset.x + x, offset.y + y, color)
    }
    for (const { x, y } of dirtyPoints.get(room) || []) {
      if (!next.some(({ x: nx, y: ny }) => nx === x && ny === y))
        set(offset.x + x, offset.y + y, getTerrainColor(terrain, x, y))
    }
    dirtyPoints.set(room, next)
  }

  return (
    <pixel_buffer
      height="100%"
      width="100%"
      ref={setRef}
      onSizeChange={function () {
        console.log("resize")
        props.onViewChange?.(getVisibleRooms(props.room, this))
      }}
    />
  )
}
