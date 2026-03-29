import { useKeyboard, useRenderer } from "@opentui/solid"
import { createSignal, ErrorBoundary, Show } from "solid-js"
import { options } from "./globals"
import ServerPicker from "./components/ServerPicker"
import Server from "./components/Server"
import SplashError from "./components/splash/SplashError"

export default function App() {
  const renderer = useRenderer()
  renderer.useMouse = true

  useKeyboard((key) => {
    if (key.ctrl) {
      switch (key.name) {
        case "o":
          setServer(undefined)
          renderer.console.blur()
          break
        case "f4":
          renderer.toggleDebugOverlay()
          break
      }
    } else {
      switch (key.name) {
        case "f4":
          renderer.console.toggle()
          break
      }
    }
  })

  const [server, setServer] = createSignal(options.server)

  return (
    <Show when={server()} keyed fallback={<ServerPicker onSelect={setServer} />}>
      {(name) => (
        <ErrorBoundary
          fallback={(err, reset) => (
            <SplashError error={err} onRetry={reset} onReload={() => setServer(undefined)} />
          )}
        >
          <Server name={name} />
        </ErrorBoundary>
      )}
    </Show>
  )
}
