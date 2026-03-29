import { useKeyboard } from "@opentui/solid"

export default function SplashError(props: {
  error: unknown
  onRetry?: () => void
  onReload?: () => void
}) {
  useKeyboard(({ name }) => {
    if ((name === "r" || name === "return") && props.onRetry) {
      props.onRetry()
    } else if ((name === "b" || name === "escape") && props.onReload) {
      props.onReload()
    }
  })

  return (
    <box flexDirection="column" justifyContent="center" alignItems="center" height="100%">
      <box flexShrink={0} alignItems="center">
        <text fg="red">
          <b>Woops, something went wrong!</b>
        </text>
        <text fg="red">
          <i>
            If this problem persists, please file an issue on GitHub with the error message and
            stack trace below.
          </i>
        </text>
      </box>
      <scrollbox margin={1} maxWidth={120} maxHeight={20}>
        <text fg="red">
          {props.error instanceof Error
            ? String(props.error.stack)
            : `Error: ${String(props.error)}`}
        </text>
      </scrollbox>
      <box flexShrink={0} flexDirection="row">
        {props.onRetry && (
          <text bg="#333" marginX={2} onMouseDown={props.onRetry}>
            Retry (r)
          </text>
        )}
        {props.onReload && (
          <text bg="#333" onMouseDown={props.onReload}>
            Back to server list (b)
          </text>
        )}
      </box>
    </box>
  )
}
