export type AuditValue = string | number | boolean | null

export interface Expectation {
  readonly expression: string
  readonly value: AuditValue
}

export interface BaselineMetrics {
  readonly control: {
    readonly track: number
    readonly trackGap: number
    readonly gap: number
    readonly icon: number
  }
  readonly project: {
    readonly controlsWidth: number
    readonly identityWidth: number
    readonly defaultTrackHeight: number
    readonly trackBorder: number
  }
}
