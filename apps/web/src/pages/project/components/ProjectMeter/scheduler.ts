import { readProjectMeters, subscribeProjectMeters } from "@/pages/project/adapters/realtime"
import { arrangementScheduler } from "@/pages/project/sections/ArrangementPanel/canvas/scheduler"

export function attachProjectMeterScheduler() {
  const id = "project-meter-session"
  let watchdog: number | undefined
  const tick = () => {
    window.clearTimeout(watchdog)
    watchdog = undefined
    const session = readProjectMeters()
    if (!session) return
    const interest = session.store.readMetadata()
    if (!interest.transport && interest.endpointIds.length === 0) return
    session.tick(performance.now())
    const state = session.readStatus().state
    if (state !== "hidden" && state !== "error" && state !== "disposed") {
      arrangementScheduler.invalidate(id)
      if (watchdog === undefined) watchdog = window.setTimeout(tick, 100)
    }
  }
  const detach = arrangementScheduler.register(id, tick, "clock")
  let detachStatus = () => {}
  let detachMetadata = () => {}
  const wake = () => {
    arrangementScheduler.invalidate(id)
    const session = readProjectMeters()
    const interest = session?.store.readMetadata()
    if (
      watchdog === undefined &&
      interest &&
      (interest.transport || interest.endpointIds.length > 0)
    )
      watchdog = window.setTimeout(tick, 100)
  }
  const bind = () => {
    detachStatus()
    detachMetadata()
    detachMetadata = readProjectMeters()?.store.subscribeMetadata(wake) ?? (() => {})
    detachStatus = readProjectMeters()?.subscribeStatus(wake) ?? (() => {})
    wake()
  }
  const unsubscribe = subscribeProjectMeters(bind)
  bind()
  return () => {
    unsubscribe()
    window.clearTimeout(watchdog)
    watchdog = undefined
    detachStatus()
    detachMetadata()
    detach()
  }
}
