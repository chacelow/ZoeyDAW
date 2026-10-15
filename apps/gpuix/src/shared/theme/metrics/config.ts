import values from "./control-metrics.json"

export type ControlProfile = "default" | "transport"
export type ControlMetrics = { readonly [Key in keyof typeof values.default]: number }
export type ProjectMetrics = { readonly [Key in keyof typeof values.project]: number }

/** Canonical pixel measurements from the single JSON source. */
export const CONTROL_METRICS: Readonly<Record<ControlProfile, ControlMetrics>> = {
  default: values.default,
  transport: values.transport,
}
export const PROJECT_METRICS: ProjectMetrics = values.project
