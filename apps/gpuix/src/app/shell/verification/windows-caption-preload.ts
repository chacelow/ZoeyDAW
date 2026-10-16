import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { GpuixRenderer } from "@gpuix/native"

const output = process.argv[2]
if (process.platform !== "win32" || !output)
  throw new Error("Windows and an evidence-directory argument are required")
if (process.env.GPUI_DISABLE_DIRECT_COMPOSITION)
  throw new Error("The production caption probe must use DirectComposition")
mkdirSync(output, { recursive: true })
const observed: { renderer: GpuixRenderer | undefined; systemActions: number } = {
  renderer: undefined,
  systemActions: 0,
}
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
process.stdin.on("data", chunk => {
  if (String(chunk).trim() !== "snapshot") return
  const { renderer, systemActions } = observed
  if (!renderer) throw new Error("The real main renderer has not initialized")
  const snapshot = {
    pid: process.pid,
    systemActions,
    directCompositionDisabled: false,
    tree: renderer.getAutomationTree(),
    stats: renderer.getDebugFrameOverlayStats(),
  }
  writeFileSync(path.join(output, "live-main.json"), JSON.stringify(snapshot, null, 2))
  console.log("T2_SNAPSHOT_READY")
})
