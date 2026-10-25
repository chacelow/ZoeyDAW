import { readProjectTelemetry, readTransportBar, useProjectState } from "@/pages/project/adapters"
import { arrangementScheduler } from "../scheduler"
import type { Scheduler } from "../scheduler"
import type { PlayheadProjection } from "./playhead-projection"

const TELEMETRY_ID = "project-telemetry"
const PLAYHEAD_ID = "arrangement-playhead"

export function attachProjectTelemetry(
  ring: PlayheadProjection,
  frameScheduler: Scheduler = arrangementScheduler
): () => void {
  let epoch = ""
  const paint = () => {
    const state = useProjectState.getState()
    const nextEpoch = state.session.backend.sessionId
    const isReset = nextEpoch !== epoch
    if (isReset) {
      epoch = nextEpoch
      ring.dispose()
    }
    const frame = readProjectTelemetry()
    const revision = ring.readRevision()
    ring.writePlayhead({
      bar: frame?.clock.bar ?? readTransportBar(),
      playing: state.session.playing && (frame?.playing ?? false),
      recording: state.session.recording && (frame?.recording ?? false),
    })
    if (isReset || revision !== ring.readRevision()) {
      frameScheduler.invalidate(PLAYHEAD_ID)
    }
    if (frame?.playing) {
      frameScheduler.invalidate(TELEMETRY_ID)
    }
  }
  const detach = frameScheduler.register(TELEMETRY_ID, paint, "clock")
  const unsubscribe = useProjectState.subscribe((state, previous) => {
    if (
      state.document !== previous.document ||
      state.session.position !== previous.session.position ||
      state.session.playing !== previous.session.playing ||
      state.session.recording !== previous.session.recording ||
      state.session.backend !== previous.session.backend
    ) {
      frameScheduler.invalidate(TELEMETRY_ID)
    }
  })
  return () => {
    unsubscribe()
    detach()
  }
}
