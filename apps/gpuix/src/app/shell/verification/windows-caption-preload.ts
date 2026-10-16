import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { plugin } from "bun"
import { GpuixRenderer } from "@gpuix/native"
import type { EventPayload } from "@gpuix/native"

const output = process.argv[2]
if (process.platform !== "win32" || !output)
  throw new Error("Windows and an evidence-directory argument are required")
if (process.env.GPUI_DISABLE_DIRECT_COMPOSITION)
  throw new Error("The production caption probe must use DirectComposition")
mkdirSync(output, { recursive: true })
const observed: {
  renderer: GpuixRenderer | undefined
  titlebarId: number | undefined
  systemActions: number
  nativeClickCounts: number[]
} = { renderer: undefined, titlebarId: undefined, systemActions: 0, nativeClickCounts: [] }
GpuixRenderer.prototype.init = new Proxy(GpuixRenderer.prototype.init, {
  apply(initialize, receiver, args) {
    if (!(receiver instanceof GpuixRenderer)) throw new Error("Unexpected native receiver")
    Reflect.apply(initialize, receiver, args)
    observed.renderer = receiver
  },
})
GpuixRenderer.prototype.titlebarDoubleClick = new Proxy(
  GpuixRenderer.prototype.titlebarDoubleClick,
  {
    apply(systemAction, receiver, args) {
      observed.systemActions += 1
      return Reflect.apply(systemAction, receiver, args)
    },
  }
)
function recordNativeEvent(event: EventPayload) {
  if (event.eventType !== "mouseDown" || event.elementId !== observed.titlebarId) return
  const count = event.clickCount
  if (typeof count !== "number") throw new Error("Native mouse event has no click count")
  queueMicrotask(() => {
    observed.nativeClickCounts.push(count)
    console.log("T2_NATIVE_EVENT_COMPLETED")
  })
}
Object.defineProperty(globalThis, "__T2WrapMouseDown", {
  value: (handler: ((event: EventPayload) => void) | undefined) => (event: EventPayload) => {
    handler?.(event)
    recordNativeEvent(event)
  },
})

function titlebarId(node: unknown): number | undefined {
  if (typeof node !== "object" || node === null) return undefined
  if ("testId" in node && node.testId === "titlebar" && "id" in node && typeof node.id === "number")
    return node.id
  if ("children" in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      const id = titlebarId(child)
      if (id !== undefined) return id
    }
  }
  return undefined
}

const barFile = fileURLToPath(new URL("../TitleBar.tsx", import.meta.url))
const rootFile = fileURLToPath(new URL("../../NativeRoot.tsx", import.meta.url))
plugin({
  name: "caption-native-observer",
  setup(build) {
    const filter = new RegExp(
      `^(?:${[barFile, rootFile].map(file => file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`
    )
    build.onLoad({ filter }, async args => {
      let contents = await Bun.file(args.path).text()
      if (args.path === barFile) {
        const open = "onMouseDown={"
        const close = ": undefined\n      }"
        if (contents.split(open).length !== 2 || contents.split(close).length !== 2)
          throw new Error("Stale titlebar observer anchor")
        contents = contents
          .replace(open, 'onMouseDown={Reflect.get(globalThis, "__T2WrapMouseDown")(')
          .replace(close, ": undefined\n      )}")
      } else if (process.env.T2_MUTATE_WINDOWS_CALLBACK === "1") {
        const anchor =
          'process.platform === "win32" ? undefined : native.window.titlebarDoubleClick'
        if (contents.split(anchor).length !== 2) throw new Error("Stale callback mutation anchor")
        contents = contents.replace(anchor, "native.window.titlebarDoubleClick")
      }
      return { contents, loader: "tsx" }
    })
  },
})

process.stdin.on("data", chunk => {
  const command = String(chunk).trim()
  if (command !== "snapshot" && command !== "arm") return
  const { renderer, systemActions } = observed
  if (!renderer) throw new Error("The real main renderer has not initialized")
  if (command === "arm") {
    observed.titlebarId = titlebarId(JSON.parse(renderer.getAutomationTree()))
    if (observed.titlebarId === undefined) throw new Error("No native titlebar to observe")
  }
  const snapshot = {
    pid: process.pid,
    systemActions,
    nativeClickCounts: observed.nativeClickCounts,
    directCompositionDisabled: false,
    tree: renderer.getAutomationTree(),
    stats: renderer.getDebugFrameOverlayStats(),
  }
  writeFileSync(path.join(output, "live-main.json"), JSON.stringify(snapshot, null, 2))
  console.log("T2_SNAPSHOT_READY")
})
