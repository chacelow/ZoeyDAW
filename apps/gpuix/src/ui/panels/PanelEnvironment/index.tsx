import { createContext } from "react"
import type { ReactNode } from "react"
import type { PointerPosition } from "@/shared/pointer"

export interface PanelEnvironment {
  subscribeWindowActive?: (listener: (active: boolean) => void) => () => void
  scheduleFrame?: (callback: () => void) => () => void
  subscribePointer?: (listener: (position: PointerPosition) => void) => () => void
}

export const PanelEnvironmentContext = createContext<PanelEnvironment>({})

export function PanelEnvironmentProvider({
  environment,
  children,
}: {
  environment: PanelEnvironment
  children: ReactNode
}) {
  return (
    <PanelEnvironmentContext.Provider value={environment}>
      {children}
    </PanelEnvironmentContext.Provider>
  )
}
