import { createSignal, onMount } from "solid-js"
import { RGBA } from "@opentui/core"
import { ConfigManager, ScreepsAPI } from "screeps-api"

const stateColors = new Map<boolean | undefined, [RGBA, RGBA | undefined]>([
  [true, [RGBA.fromHex("#0ae04e"), RGBA.fromHex("#0e4d21")]],
  [false, [RGBA.fromHex("#ff4c4c"), RGBA.fromHex("#531212")]],
  [undefined, [RGBA.fromHex("#146fa3"), undefined]],
])

export default function ServerPicker(props: { onSelect: (server: string) => void }) {
  const [config, setConfig] = createSignal([
    { name: "loading 🔄", description: "", value: "", valid: undefined as boolean | undefined },
  ])
  const [focus, setFocus] = createSignal(0)

  onMount(async () => {
    const data = await new ConfigManager().getConfig()
    if (!data) throw new Error(".screeps.yml config file not found or invalid")

    const config = Object.entries(data.servers).map(([name, args]) => ({
      name: name + " 🔄",
      description: `connecting to ${args?.hostname || args?.host + (args?.port ? `:${args.port}` : "")} ...`,
      value: name,
      valid: undefined as boolean | undefined,
    }))
    setConfig(config)

    await Promise.all(
      Object.keys(data.servers).map(async (name, i) => {
        const entry = config[i]
        try {
          const api = await ScreepsAPI.fromConfig(name, "tui")
          const me = await api.me()
          if (!me.ok) throw new Error("Invalid response")
          entry.name = name + " ✅"
          entry.description = `${api.opts.url} - ${me.username}`
          entry.valid = true
        } catch (error) {
          entry.name = name + " ❌"
          entry.description = String(error)
          entry.valid = false
        }
        setConfig([...config])
      }),
    )
  })

  return (
    <box>
      <text>Select a server:</text>
      <select
        focused
        onSelect={(i, option) =>
          option && config()[i]?.valid !== false && props.onSelect(option.value)
        }
        onChange={setFocus}
        options={config()}
        height={"100%"}
        marginTop={1}
        itemSpacing={1}
        showScrollIndicator
        wrapSelection
        selectedTextColor={stateColors.get(config()[focus()]?.valid)?.[0]}
        selectedBackgroundColor={stateColors.get(config()[focus()]?.valid)?.[1]}
      />
    </box>
  )
}
