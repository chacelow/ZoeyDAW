import { create } from "zustand"
import { readNativeWaveform, nativeAudio } from "@/shared/native/audio"
import { resolveBackendSources } from "./source-locations"
import type { BackendSource } from "@zoeydaw/project-core/backend"

type PeakState =
  | { kind: "loading" }
  | { kind: "ready"; peaks: readonly number[]; durationSeconds: number }
  | { kind: "error"; message: string }
interface Waveforms {
  entries: Readonly<Record<string, PeakState>>
}
export const useNativeWaveforms = create<Waveforms>(() => ({ entries: {} }))
const queue: { requested: readonly BackendSource[]; running: Promise<void> | null } = {
  requested: [],
  running: null,
}
const waveformKey = (source: BackendSource) => `${source.id}/${source.sha256}/${source.uri}`

export function prepareNativeWaveforms(sources: readonly BackendSource[]): Promise<void> {
  if (!nativeAudio.available()) return Promise.resolve()
  queue.requested = resolveBackendSources(sources).filter(
    source => !source.uri.startsWith("mock://")
  )
  const keys = new Set(queue.requested.map(waveformKey))
  useNativeWaveforms.setState(state => ({
    entries: Object.fromEntries(Object.entries(state.entries).filter(([key]) => keys.has(key))),
  }))
  if (queue.running) return queue.running
  queue.running = drainWaveforms().finally(() => {
    queue.running = null
  })
  return queue.running
}

async function drainWaveforms(): Promise<void> {
  const source = queue.requested.find(
    item => useNativeWaveforms.getState().entries[waveformKey(item)] === undefined
  )
  if (!source) return
  const key = waveformKey(source)
  useNativeWaveforms.setState(state => ({
    entries: { ...state.entries, [key]: { kind: "loading" } },
  }))
  let entry: PeakState
  try {
    entry = { kind: "ready", ...(await readNativeWaveform(source.uri, 4096)) }
  } catch (error) {
    entry = { kind: "error", message: error instanceof Error ? error.message : String(error) }
  }
  if (queue.requested.some(item => waveformKey(item) === key)) {
    useNativeWaveforms.setState(state => ({ entries: { ...state.entries, [key]: entry } }))
  }
  return drainWaveforms()
}

export function nativeWaveform(
  source: BackendSource,
  entries = useNativeWaveforms.getState().entries
): Extract<PeakState, { kind: "ready" }> | null {
  const [resolved] = resolveBackendSources([source])
  if (!resolved) return null
  const state = entries[`${source.id}/${source.sha256}/${resolved.uri}`]
  return state?.kind === "ready" ? state : null
}
