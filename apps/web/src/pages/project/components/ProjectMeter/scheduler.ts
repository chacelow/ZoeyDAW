import { readProjectMeters, subscribeProjectMeters } from "@/pages/project/adapters/realtime"
import { arrangementScheduler } from "@/pages/project/sections/ArrangementPanel/canvas/scheduler"

export function attachProjectMeterScheduler() {
  const id = "project-meter-session"
  const tick = () => {
    const session = readProjectMeters()
    if (!session || session.store.readMetadata().endpointIds.length === 0) return
    session.tick(performance.now())
    const state = session.readStatus().state
    if (state !== "hidden" && state !== "error" && state !== "disposed")
      arrangementScheduler.invalidate(id)
  }
  const detach = arrangementScheduler.register(id, tick, "clock")
  let detachStatus = () => {}
  let detachMetadata = () => {}
  const bind = () => {
    detachStatus()
    detachMetadata()
    detachMetadata =
      readProjectMeters()?.store.subscribeMetadata(() => arrangementScheduler.invalidate(id)) ??
      (() => {})
    detachStatus =
      readProjectMeters()?.subscribeStatus(() => arrangementScheduler.invalidate(id)) ?? (() => {})
    arrangementScheduler.invalidate(id)
  }
  const unsubscribe = subscribeProjectMeters(bind)
  bind()
  return () => {
    unsubscribe()
    detachStatus()
    detachMetadata()
    detach()
  }
}
