import { createContext } from "react"
import type { ReactNode } from "react"

export interface PanelEnvironment {
  subscribeWindowActive?: (listener: (active: boolean) => void) => () => void
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
