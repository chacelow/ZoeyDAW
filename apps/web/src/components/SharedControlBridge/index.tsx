import { useMemo } from "react"
import { hasNativeCursor, moveWindowCursor } from "@/shared/native/cursor"
import { ControlEnvironmentProvider } from "@zoeymind/ui"
import {
  ControlInteractionsProvider,
  useControlInteractions,
} from "@/shared/control-interactions/index"
import type { ControlEnvironment } from "@zoeymind/ui"
import type { ReactNode } from "react"

export function SharedControlBridgeProvider({ children }: { readonly children: ReactNode }) {
  return (
    <ControlInteractionsProvider>
      <ControlEnvironmentBridge>{children}</ControlEnvironmentBridge>
    </ControlInteractionsProvider>
  )
}

export function ControlEnvironmentBridge({ children }: { readonly children: ReactNode }) {
  const setInfo = useControlInteractions(state => state.setInfo)
  const mappingActive = useControlInteractions(state => state.mappingActive)
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
