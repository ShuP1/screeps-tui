import { onSocket } from "@/components/utils"
import type { Me, ScreepsAPI } from "screeps-api"
import { createMemo, createSignal } from "solid-js"

export default function Header(props: { api: ScreepsAPI; shard?: string; room?: string }) {
  const { api } = props
  const { _user } = api as unknown as { _user: Me }

  const [cpu, setCpu] = createSignal({ cpu: 0, memory: 0 })
  onSocket(api, "cpu", (msg) => {
    const { cpu, memory } = msg.data
    setCpu({ cpu, memory: Math.round(memory / 1024) })
  })

  const trimEnd = (str: string, suffix: string) =>
    str.endsWith(suffix) ? str.slice(0, -suffix.length) : str
  const stateText = createMemo(() =>
    [api.opts.hostname, trimEnd(api.opts.pathname || "", "/"), props.shard, props.room]
      .filter((v) => v)
      .join(" > "),
  )
  const stateUrl = createMemo(
    () =>
      trimEnd(api.opts.url, "/") +
      "/a/#!/" +
      [props.room ? "room" : "map", props.shard, props.room].filter((v) => v).join("/"),
  )

  return (
    <box backgroundColor="#333" flexDirection="row" flexGrow={1} flexShrink={0}>
      <text>
        <a href={stateUrl()}>{stateText()}</a>
      </text>
      <box flexGrow={1} alignItems="center">
        {_user.resources ? (
          <text>
            {_user.money.toLocaleString()}${" "}
            {Object.entries(_user.resources)
              .map(([key, value]) => `${value}${key[0]}`)
              .join(" ")}
          </text>
        ) : (
          <></>
        )}
      </box>
      <text>
        <b>{cpu().cpu || "?"}</b>/{_user.cpu}
        <i>CPU</i> <b>{cpu().memory || "?"}</b>/2048<i>KB</i> {_user.username}
      </text>
    </box>
  )
}
