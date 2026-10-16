import { PREFERENCE_DEFAULTS } from "@/project/defaults/preferences"
import type { ControlInputPolicy } from "@/ui/controls"

export function createControlInputPolicy(
  numericInput: typeof PREFERENCE_DEFAULTS.numericInput,
  pointer: typeof PREFERENCE_DEFAULTS.pointer
): ControlInputPolicy {
  return { ...numericInput, dragThresholdPixels: pointer.dragThresholdPixels }
}

export const VERIFICATION_CONTROL_INPUT_POLICY = createControlInputPolicy(
  PREFERENCE_DEFAULTS.numericInput,
  PREFERENCE_DEFAULTS.pointer
)
