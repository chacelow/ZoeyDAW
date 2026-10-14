import values from "./control-metrics.json"

export type ControlProfile = "default" | "transport"
export type ControlMetrics = { readonly [Key in keyof typeof values.default]: number }
export type ProjectMetrics = { readonly [Key in keyof typeof values.project]: number }

/**
Canonical pixel measurements; the CSS counterpart is generated from the same JSON.
*/
export const CONTROL_METRICS: Readonly<Record<ControlProfile, ControlMetrics>> = {
  default: values.default,
  transport: values.transport,
}
export const PROJECT_METRICS: ProjectMetrics = values.project

/**
Maps a profile or future setting-provided measurements to the same CSS variables.
*/
export function controlMetricStyle(
  config: ControlProfile | ControlMetrics
): Record<keyof ControlMetrics, string> {
  const metrics = typeof config === "string" ? CONTROL_METRICS[config] : config
  return {
    "--spacing-control-track": `${metrics["--spacing-control-track"]}px`,
    "--spacing-control-track-gap": `${metrics["--spacing-control-track-gap"]}px`,
    "--spacing-control-track-pad": `${metrics["--spacing-control-track-pad"]}px`,
    "--spacing-control-gap": `${metrics["--spacing-control-gap"]}px`,
    "--spacing-control-icon-slot": `${metrics["--spacing-control-icon-slot"]}px`,
    "--spacing-control-icon": `${metrics["--spacing-control-icon"]}px`,
    "--text-control-track": `${metrics["--text-control-track"]}px`,
  }
}
