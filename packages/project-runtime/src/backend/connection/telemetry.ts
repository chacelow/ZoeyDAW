import type { BackendState, BackendTelemetry } from "@zoeydaw/project-core/backend"

export function interpolate(
  frame: BackendTelemetry,
  receivedAt: number,
  state: BackendState,
  now: number,
  correction = 0
): BackendTelemetry {
  if (!frame.playing || !state.control.playing) {
    return frame
  }
  const elapsed = Math.max(0, Math.min(250, now - receivedAt)) / 1000
  let bar = frame.clock.bar + elapsed * frame.clock.barsPerSecond
  bar += Math.max(0, correction - elapsed * frame.clock.barsPerSecond * 0.5)
  const { loop } = state.project
  if (loop.enabled && loop.endBar > loop.startBar && bar >= loop.endBar) {
    bar = loop.startBar + ((bar - loop.startBar) % (loop.endBar - loop.startBar))
  }
  const clock =
    frame.clock.kind === "sample"
      ? {
          ...frame.clock,
          bar,
          frame: frame.clock.frame + Math.floor(elapsed * frame.clock.sampleRate),
        }
      : { ...frame.clock, bar }
  return { ...frame, clock }
}
