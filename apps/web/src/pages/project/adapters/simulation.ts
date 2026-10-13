import { mockMeterLevels } from "./mockMeters"
import { positionToBar } from "../model/types"
import { get, session } from "./context"
import { publishSimulatedBar } from "./transport"

let simulationTimer: number | null = null
let simulationUsers = 0
let continuousBar = 1
let lastRenderedBar = 1
let publishedAt = 0

export function readSimulatedBar(now = performance.now()): number {
  const state = get()
  const { bpm, numerator, denominator, loop } = state.document.transport
  const rendered = positionToBar(state.session.position, numerator)
  if (!state.session.playing || simulationTimer === null) return rendered
  if (Math.abs(rendered - lastRenderedBar) > 1e-12) return rendered
  const origin = continuousBar
  const elapsed = Math.max(0, Math.min((now - publishedAt) / 1000, 0.25))
  const bar = origin + (elapsed * bpm * denominator) / (240 * numerator)
  return loop.enabled && bar >= loop.endBar
    ? loop.startBar + ((bar - loop.startBar) % (loop.endBar - loop.startBar))
    : bar
}

/** Ref-counted visual transport/meters only; no audio engine or sample output. */
export function startProjectSimulation(): () => void {
  simulationUsers++
  if (simulationTimer !== null)
    return () => {
      simulationUsers--
      if (simulationUsers === 0 && simulationTimer !== null) {
        window.clearInterval(simulationTimer)
        simulationTimer = null
        session({ playing: false, recording: false, levels: {}, activeMidiNotes: [] })
      }
    }
  let last = performance.now()
  continuousBar = positionToBar(get().session.position, get().document.transport.numerator)
  lastRenderedBar = continuousBar
  publishedAt = last
  simulationTimer = window.setInterval(() => {
    const now = performance.now()
    const elapsed = Math.min((now - last) / 1000, 0.25)
    last = now
    publishedAt = now
    const state = get()
    if (!state.session.playing && !state.session.activeMidiNotes.length) {
      if (Object.keys(state.session.levels).length) session({ levels: {} })
      return
    }
    const { bpm, numerator, denominator, loop } = state.document.transport
    const renderedBar = positionToBar(state.session.position, numerator)
    if (Math.abs(renderedBar - lastRenderedBar) > 1e-12) continuousBar = renderedBar
    if (state.session.playing) continuousBar += (elapsed * bpm * denominator) / (240 * numerator)
    if (loop.enabled && continuousBar >= loop.endBar)
      continuousBar =
        loop.startBar + ((continuousBar - loop.startBar) % (loop.endBar - loop.startBar))
    const bar = continuousBar
    if (state.session.playing) publishSimulatedBar(bar)
    lastRenderedBar = positionToBar(get().session.position, numerator)
    session({ levels: mockMeterLevels(state, bar, now) })
  }, 50)
  return () => {
    simulationUsers--
    if (simulationUsers === 0 && simulationTimer !== null) {
      window.clearInterval(simulationTimer)
      simulationTimer = null
      session({ playing: false, recording: false, levels: {}, activeMidiNotes: [] })
    }
  }
}
