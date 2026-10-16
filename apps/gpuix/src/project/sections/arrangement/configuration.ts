import { useMemo } from "react"
import { usePreference } from "@/platform/settings"
import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { resolveArrangementPolicy } from "./core/configuration"

export function useArrangementPolicy() {
  const overrides = usePreference("arrangement")
  const pointer = usePreference("pointer")
  return useMemo(
    () => resolveArrangementPolicy(ARRANGEMENT_DEFAULTS, overrides, pointer),
    [overrides, pointer]
  )
}
