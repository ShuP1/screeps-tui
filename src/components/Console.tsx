import { onSocket } from "@/components/utils"
import type { InputRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import type { ScreepsAPI } from "screeps-api"
import { createSignal, For } from "solid-js"

const MAX_LOGS = 1000

interface Log {
  content: string
  color: string
  shard?: string
}

export default function Console(props: { api: ScreepsAPI; wide: boolean }) {
  const { api } = props
  const [ref, setRef] = createSignal<InputRenderable>()
  const [logs, setLogs] = createSignal<Log[]>([])
  const [input, setInput] = createSignal("")

  useKeyboard((e) => {
    if (e.name === "return") {
      const input = ref()
      if (!input || input.focused) return
      input.focus()
      e.preventDefault()
    }
  })

  onSocket(api, "console", ({ data }) => {
    //TODO: format html
    if ("error" in data) {
      setLogs((logs) =>
        [...logs, { content: data.error, color: "red", shard: data.shard }].slice(-MAX_LOGS),
      )
    } else {
      setLogs((logs) =>
        [
          ...logs,
          ...data.messages.log.map((msg) => ({ content: msg, color: "#DDD", shard: data.shard })),
          ...data.messages.results.map((msg) => ({
            content: msg,
            color: "white",
            shard: data.shard,
          })),
        ].slice(-MAX_LOGS),
      )
    }
  })

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      maxHeight={props.wide ? undefined : 40}
      maxWidth={props.wide ? 80 : undefined}
    >
      <scrollbox
        scrollY={true}
        stickyScroll={true}
        stickyStart="bottom"
        flexGrow={1}
        flexShrink={1}
      >
        <For each={logs()}>
          {(log) => (
            <text fg={log.color}>
              {log.shard ? `[${log.shard}] ` : ""}
              {log.content}
            </text>
          )}
        </For>
      </scrollbox>
      <box backgroundColor={"#333"} flexDirection="row" flexGrow={1} flexShrink={0}>
        <text>{"> "}</text>
        <input
          ref={setRef}
          flexGrow={1}
          onSubmit={(value) => {
            setInput("...")
            setLogs((logs) => [
              ...logs,
              {
                content: `> ${typeof value === "string" ? value : ""}`,
                color: "#8fdaff",
                shard: api.appConfig.shard,
              },
            ])
            api.console(value, api.appConfig.shard).catch(console.error)
            setInput("")
          }}
          value={input()}
          placeholder="command"
        />
      </box>
    </box>
  )
}
