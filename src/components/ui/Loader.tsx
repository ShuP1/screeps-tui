import { createSignal, onCleanup, onMount, type ParentProps } from "solid-js"

const FRAMES = [
  "▱▱▱▱▱▱▱",
  "▱▱▱▱▱▱▱",
  "▱▱▱▱▱▱▱",
  "▱▱▱▱▱▱▱",
  "▰▱▱▱▱▱▱",
  "▰▰▱▱▱▱▱",
  "▰▰▰▱▱▱▱",
  "▱▰▰▰▱▱▱",
  "▱▱▰▰▰▱▱",
  "▱▱▱▰▰▰▱",
  "▱▱▱▱▰▰▰",
  "▱▱▱▱▱▰▰",
  "▱▱▱▱▱▱▰",
  "▱▱▱▱▱▱▱",
  "▱▱▱▱▱▱▱",
  "▱▱▱▱▱▱▱",
  "▱▱▱▱▱▱▱",
]

export default function Loader(props: ParentProps & { color?: string }) {
  const [frame, setFrame] = createSignal(0)

  onMount(() => {
    const timer = setInterval(() => {
      setFrame((frame() + 1) % FRAMES.length)
    }, 77)

    onCleanup(() => {
      clearInterval(timer)
    })
  })

  return (
    <text fg={props.color}>
      {props.children} {FRAMES[frame()]}
    </text>
  )
}
