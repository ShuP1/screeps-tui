import type { ParentProps } from "solid-js"
import Loader from "../ui/Loader"

export default function SplashLoader(props: ParentProps) {
  return (
    <box justifyContent="center" alignItems="center" height="100%">
      <text>
        <em>Screepts TUI</em>
      </text>
      <Loader children={props.children} />
    </box>
  )
}
