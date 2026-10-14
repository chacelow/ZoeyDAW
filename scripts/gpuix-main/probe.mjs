import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const app = createRequire(new URL("../../apps/gpuix/package.json", import.meta.url))
const { createElement, useEffect, useRef, useState } = await import(app.resolve("react"))
const { render, useGpuix } = await import(app.resolve("@gpuix/react"))
const { createWindowKeyboard, WindowKeyboardProvider, useWindowKeyboard } = await import(
  fileURLToPath(new URL("../../apps/gpuix/src/platform/keyboard/index.ts", import.meta.url))
)
const { ThemeProvider, useTheme } = await import(
  fileURLToPath(new URL("../../apps/gpuix/src/shared/theme/ThemeProvider.tsx", import.meta.url))
)
const keyboard = createWindowKeyboard()
const closeProbe = process.argv.includes("--close")
if (closeProbe && process.platform !== "darwin") {
  throw new Error("The close-guard PoC is macOS embedded-loop only")
}

function Probe() {
  const theme = useTheme()
  const keys = useWindowKeyboard()
  const { renderer } = useGpuix()
  const allowClose = useRef(false)
  const [received, setReceived] = useState("Waiting for Space")
  useEffect(
    () =>
      keys.subscribe("keyDown", event => {
        process.stdout.write(`${JSON.stringify({ kind: "windowKeyDown", key: event.key })}\n`)
        setReceived(`Window key: ${event.key}`)
      }),
    [keys]
  )
  useEffect(
    () =>
      keys.subscribe("keyUp", event => {
        process.stdout.write(`${JSON.stringify({ kind: "windowKeyUp", key: event.key })}\n`)
      }),
    [keys]
  )
  useEffect(() => {
    if (!closeProbe || !renderer) return
    renderer.setWindowShouldClose(() => {
      process.stdout.write(
        `${JSON.stringify({ kind: "closeRequest", allow: allowClose.current })}\n`
      )
      return allowClose.current
    })
    renderer.focusNext()
  }, [renderer])
  return createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: 24,
        gap: 12,
        backgroundColor: theme.colors.background,
      },
    },
    createElement(
      "text",
      {
        onLayout: event =>
          process.stdout.write(
            `${JSON.stringify({ kind: "textLayout", width: event.width, height: event.height })}\n`
          ),
        style: { color: theme.colors.foreground, fontSize: 18 },
      },
      "D1 renderer capability probe"
    ),
    createElement("text", { style: { color: theme.colors.foreground } }, received),
    closeProbe &&
      createElement(
        "div",
        {
          role: "button",
          tabIndex: 0,
          onClick: () => {
            allowClose.current = true
            setReceived("Close allowed")
          },
          style: { backgroundColor: theme.colors.editorShell, padding: 8 },
        },
        createElement("text", { style: { color: theme.colors.foreground } }, "Allow next close")
      )
  )
}

render(
  createElement(
    WindowKeyboardProvider,
    { value: keyboard },
    createElement(ThemeProvider, null, createElement(Probe))
  ),
  { title: "gpuix D1 capability probe", width: 520, height: 180, ...keyboard.rootHandlers }
)
