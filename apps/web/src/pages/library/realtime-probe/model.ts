export type ProbeMode = "pull" | "channel" | "credit"
export type ProbeScenario = "idle" | "block"
export type ProbeCase = {
  readonly mode: ProbeMode
  readonly bytes: number
  readonly scenario: ProbeScenario
  readonly durationSeconds: number
}

export const PROBE_PAYLOADS = [33792, 32960] satisfies readonly number[]
export const PROBE_MODES: readonly ProbeMode[] = ["pull", "channel", "credit"]
export const PROBE_SCENARIOS: readonly ProbeScenario[] = ["idle", "block"]
export const MAX_RAW_SAMPLES = 8192

export type ClockProbe = {
  readonly sentMs: number
  readonly receivedMs: number
  readonly nativeNs: string
  readonly roundTripMs: number
  readonly offsetMs: number
}
export type ClockMapping = {
  readonly probes: readonly ClockProbe[]
  readonly offsetMs: number
  readonly uncertaintyMs: number
}
export type Distribution = {
  readonly count: number
  readonly p50: number | null
  readonly p95: number | null
  readonly p99: number | null
  readonly max: number | null
}
export type FrameSample = {
  readonly seq: string
  readonly producedMonotonicNs: string
  readonly receivedMs: number
  readonly paintedMs: number
  readonly ageEstimateMs: number
  readonly ageUpperMs: number
  readonly deliveryToPaintMs: number
  readonly bytes: number
}
export type RequestSample = {
  readonly sentMs: number
  readonly completedMs: number
  readonly bytes: number
  readonly discarded: boolean
}
export type PaintProof = {
  readonly caseKey: string
  readonly seq: string
  readonly paintCount: number
  readonly paintedMs: number
  readonly sampledPayload: string
  readonly markerPixelRgba: readonly number[]
}
export type ProbeProgress = {
  readonly caseKey: string
  readonly elapsedMs: number
  readonly painted: number
  readonly received: number
  readonly state: "running" | "stale" | "stalled"
}
export type NativeClose = {
  readonly published: number
  readonly sent: number
  readonly retainedBytes: number
}
export type CloseOutcome =
  | { readonly kind: "closed"; readonly counters: NativeClose }
  | { readonly kind: "pending" }
  | { readonly kind: "error"; readonly error: string }
  | { readonly kind: "not-opened" }

export type ProbeCaseReport = {
  readonly caseKey: string
  readonly config: ProbeCase
  readonly startedAt: string
  readonly status: "completed" | "cancelled" | "error"
  readonly error: string | null
  readonly durationMs: number
  readonly clock: ClockMapping | null
  readonly nativeClose: CloseOutcome
  readonly counters: {
    readonly receivedFrames: number
    readonly paintedFrames: number
    readonly receivedBytes: number
    readonly emptyPulls: number
    readonly overwrittenFrames: number
    readonly oldFrames: number
    readonly invalidFrames: number
    readonly sequenceGaps: string
    readonly recoveryGaps: number
    readonly stalledPulls: number
    readonly maxPullInFlight: number
    readonly maxPendingBuffers: number
    readonly truncatedRawSamples: number
  }
  readonly throughputBytesPerSecond: number | null
  readonly ageUpperMs: Distribution
  readonly deliveryToPaintMs: Distribution
  readonly rafIntervalMs: Distribution
  readonly pullRoundTripMs: Distribution
  readonly observedRafHz: number | null
  readonly intentionalBlockMs: number | null
  readonly lastPaint: PaintProof | null
  readonly raw: {
    readonly frames: readonly FrameSample[]
    readonly rafIntervalsMs: readonly number[]
    readonly pulls: readonly RequestSample[]
    readonly receiptRoundTripsMs: readonly number[]
    readonly errors: readonly string[]
  }
}

export type ProbeRunReport = {
  readonly schemaVersion: 1
  readonly scope: "synthetic IPC payload; not audio latency or production meter performance"
  readonly createdAt: string
  readonly environment: {
    readonly userAgent: string
    readonly nativeWindow: boolean
    readonly visibility: DocumentVisibilityState
    readonly devicePixelRatio: number
  }
  readonly limits: {
    readonly durationSeconds: number
    readonly nativeFramesPerCase: 1200
    readonly rawSamplesPerSeries: number
    readonly consumerRateCapHz: 60
  }
  readonly verification: {
    readonly dualWindow: "NOT VERIFIED"
    readonly webView2: "NOT VERIFIED"
    readonly webKitGtk: "NOT VERIFIED"
    readonly display120Hz: "NOT VERIFIED"
    readonly displayRefreshNote: "rAF cadence is observed, not a physical display refresh measurement"
    readonly nativeAllocationsAndCopies: "NOT INSTRUMENTED"
    readonly webArrayBufferCopies: "no explicit payload copies; IPC internal copies not instrumented"
    readonly clockNote: "min-RTT midpoint mapping; upper age includes RTT/2, not an independent clock calibration"
    readonly paintNote: "Canvas draw + one-pixel readback; compositor presentation not measured"
  }
  readonly cases: readonly ProbeCaseReport[]
}

export function caseKey(config: ProbeCase): string {
  return `${config.mode}-${config.bytes}-${config.scenario}`
}

export function distribution(values: readonly number[]): Distribution {
  const sorted = [...values].sort((left, right) => left - right)
  const percentile = (fraction: number) =>
    sorted.length === 0
      ? null
      : (sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null)
  return {
    count: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1) ?? null,
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return String(error)
}

export function buildCases(options: {
  readonly mode: ProbeMode | "all"
  readonly bytes: number | "all"
  readonly scenario: ProbeScenario | "all"
  readonly durationSeconds: number
}): ProbeCase[] {
  const cases: ProbeCase[] = []
  for (const mode of options.mode === "all" ? PROBE_MODES : [options.mode]) {
    for (const bytes of options.bytes === "all" ? PROBE_PAYLOADS : [options.bytes]) {
      for (const scenario of options.scenario === "all" ? PROBE_SCENARIOS : [options.scenario]) {
        cases.push({ mode, bytes, scenario, durationSeconds: options.durationSeconds })
      }
    }
  }
  return cases
}
