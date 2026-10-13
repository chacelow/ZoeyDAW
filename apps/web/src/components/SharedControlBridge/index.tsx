import { useMemo, type ReactNode } from "react"
import { hasNativeCursor, moveWindowCursor } from "@/shared/native/cursor"
import { ControlEnvironmentProvider, type ControlEnvironment } from "@zoeymind/ui"
import { useInfoHover } from "@/pages/project/stores/useInfoHover"
import { useMappingMode } from "@/pages/project/stores/useMappingMode"

export function SharedControlBridgeProvider({ children }: { children: ReactNode }) {
  const setInfo = useInfoHover(state => state.setInfo)
  const mappingActive = useMappingMode(state => state.active)
  const value = useMemo<ControlEnvironment>(
    () => ({
      setInfo,
      mappingActive,
      restoreCursor: moveWindowCursor,
      ...(hasNativeCursor() ? { recenterCursor: moveWindowCursor } : {}),
    }),
    [setInfo, mappingActive]
  )

  return <ControlEnvironmentProvider value={value}>{children}</ControlEnvironmentProvider>
}
