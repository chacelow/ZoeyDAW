import type { AudioRingBuffer } from "./ring-buffer"
import { readSimulatedBar, useProjectState } from "@/pages/project/adapters"

interface MockConfig {
  intervalMs?: number
}

export function startMockAudioEngine(ring: AudioRingBuffer, config: MockConfig = {}): () => void {
  const intervalMs = config.intervalMs ?? 1000 / 60
  const timer = window.setInterval(() => {
    const state = useProjectState.getState()
    const playing = state.session.playing
    const recording = state.session.recording
    const bar = readSimulatedBar()
    ring.writePlayhead({ bar, playing, recording })
    for (const track of state.document.tracks) {
      const level = state.session.levels[track.id]
      ring.writeMeter(track.id, { left: level?.[0] ?? -Infinity, right: level?.[1] ?? -Infinity })
    }
  }, intervalMs)
  return () => window.clearInterval(timer)
}
