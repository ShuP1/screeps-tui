import type { ScreepsAPI, SocketEventTypes } from "screeps-api"
import { onCleanup, onMount } from "solid-js"

export function onSocket<T extends string>(
  api: ScreepsAPI,
  channel: T,
  callback: (...args: SocketEventTypes[T]) => void,
) {
  const socket = api.socket
  onMount(async () => {
    socket.on(channel, callback)
    socket.subscribe(channel).catch(console.error)
    if (!socket.ws) await socket.connect()
  })
  onCleanup(() => {
    socket.unsubscribe(channel).catch(console.error)
    socket.off(channel, callback)
  })
}
