export type AudioPhase =
  "render" | "commit" | "passive" | "hostCommit" | "applyBatch" | "getBounds" | "logging"
export const AUDIO_PHASES: readonly AudioPhase[] = [
  "render",
  "commit",
  "passive",
  "hostCommit",
  "applyBatch",
  "getBounds",
  "logging",
]

class AudioTiming {
  readonly totals: Record<AudioPhase, number> = {
    render: 0,
    commit: 0,
    passive: 0,
    hostCommit: 0,
    applyBatch: 0,
    getBounds: 0,
    logging: 0,
  }
  readonly components = new Map<string, { calls: number; milliseconds: number }>()
  private readonly depths: Record<string, number> = {}

  reset() {
    for (const phase of AUDIO_PHASES) this.totals[phase] = 0
  }
  component<T>(name: string, operation: () => T): T {
    const start = performance.now()
    try {
      return operation()
    } finally {
      const previous = this.components.get(name) ?? { calls: 0, milliseconds: 0 }
      previous.calls++
      const elapsed = performance.now() - start
      previous.milliseconds += elapsed
      this.totals.logging += elapsed
      this.components.set(name, previous)
    }
  }
  add(name: AudioPhase, milliseconds: number) {
    this.totals[name] += milliseconds
  }
  time<T>(name: AudioPhase, operation: () => T): T {
    const depth = this.depths[name] ?? 0
    this.depths[name] = depth + 1
    const start = performance.now()
    try {
      return operation()
    } finally {
      this.depths[name] = depth
      if (depth === 0) this.add(name, performance.now() - start)
    }
  }
}

export const audioTiming = new AudioTiming()
