export { WaveformView } from "./WaveformView"
export type { WaveformViewProps } from "./WaveformView"
export { AutomationCurveView } from "./AutomationCurveView"
export type { AutomationCurveViewProps } from "./AutomationCurveView"
export { synthesizeWaveformPeaks } from "./model/waveform"
export type { WaveformSynthesisOptions } from "./model/waveform"
export {
  automationValueAtBar,
  buildAutomationCurveGeometry,
  clampAutomationValue,
  interpolateAutomationValue,
} from "./model/automation-curve"
export type {
  AutomationCurveGeometry,
  AutomationCurveLayoutOptions,
} from "./model/automation-curve"
