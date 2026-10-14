import { readProjectTelemetry, useProjectState } from "@/pages/project/adapters"
import { arrangementScheduler } from "../scheduler"
import type { Scheduler } from "../scheduler"
import type { AudioRingBuffer } from "./ring-buffer"

const TELEMETRY_ID = "project-telemetry"
const PLAYHEAD_ID = "arrangement-playhead"

export function attachProjectTelemetry(
  ring: AudioRingBuffer,
  frameScheduler: Scheduler = arrangementScheduler
): () => void {
  let epoch = ""
  const slots = new Set<string>()
  const meterValues = new Map<string, readonly [number, number]>()
  const paint = () => {
    const state = useProjectState.getState()
    const nextEpoch = state.session.backend.sessionId
    const isReset = nextEpoch !== epoch
    if (isReset) {
      epoch = nextEpoch
      ring.dispose()
      slots.clear()
      meterValues.clear()
    }
    const ids = new Set(state.document.tracks.map(track => track.id))
    for (const id of slots) {
      if (ids.has(id)) {
        continue
      }
      ring.freeMeter(id)
      slots.delete(id)
      meterValues.delete(id)
    }
    const frame = readProjectTelemetry()
    const revision = ring.readRevision()
    ring.writePlayhead({
      bar: frame?.clock.bar ?? 1,
      playing: frame?.playing ?? false,
      recording: frame?.recording ?? false,
    })
    if (isReset || revision !== ring.readRevision()) {
      frameScheduler.invalidate(PLAYHEAD_ID)
    }
    for (const id of ids) {
      slots.add(id)
      const next = frame?.levels[id] ?? [-Infinity, -Infinity]
      const previous = meterValues.get(id)
      if (!isReset && previous?.[0] === next[0] && previous[1] === next[1]) {
        continue
      }
      ring.writeMeter(id, { left: next[0], right: next[1] })
      meterValues.set(id, [next[0], next[1]])
      frameScheduler.invalidate(`track-meter:${id}`)
    }
    if (frame?.playing) {
      frameScheduler.invalidate(TELEMETRY_ID)
    }
  }
  const detach = frameScheduler.register(TELEMETRY_ID, paint)
  const unsubscribe = useProjectState.subscribe((state, previous) => {
    if (
      state.document !== previous.document ||
      state.session.position !== previous.session.position ||
      state.session.levels !== previous.session.levels ||
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
    for (const id of slots) {
      ring.freeMeter(id)
    }
  }
}
