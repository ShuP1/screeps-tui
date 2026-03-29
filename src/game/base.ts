declare namespace Tag {
  const OpaqueTagSymbol: unique symbol

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  class OpaqueTag<T> {
    private [OpaqueTagSymbol]: T
  }
}

export type ShardName = string & Tag.OpaqueTag<"ShardName">
export type RoomName = string & Tag.OpaqueTag<"RoomName">

export interface Coords {
  x: number
  y: number
}

export const ROOM_SIZE = 50

export const isExit = (x: number, y: number) =>
  x === 0 || y === 0 || x === ROOM_SIZE - 1 || y === ROOM_SIZE - 1

const ROOM_REGEX = /^([WE])([0-9]+)([NS])([0-9]+)$/
export class RoomXY implements Coords {
  constructor(
    public x: number,
    public y: number,
  ) {}

  static fromName(roomName: RoomName) {
    const [, h, sx, v, sy] = roomName.match(ROOM_REGEX) as string[]
    let x = Number(sx)
    let y = Number(sy)
    if (h == "W") x = ~x
    if (v == "N") y = ~y
    return new RoomXY(x, y)
  }
  toName() {
    return `${this.x < 0 ? "W" : "E"}${this.x < 0 ? ~this.x : this.x}${this.y < 0 ? "N" : "S"}${this.y < 0 ? ~this.y : this.y}` as RoomName
  }
}
