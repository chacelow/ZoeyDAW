import { createContext, useContext, useState } from "react"
import { useStore } from "zustand"
import { createStore } from "zustand/vanilla"
import type { ReactNode } from "react"
import type { StoreApi } from "zustand/vanilla"
import type { ControlInfo } from "@zoeymind/ui"

export type WarningSeverity = "info" | "warning" | "error"

export interface InfoWarning {
  id: string
  message: string
  severity?: WarningSeverity
}

export type MappingKind = "automation" | "midi" | "key" | "any"

interface ControlInteractionsState {
  info: ControlInfo | null
  setInfo: (info: ControlInfo | null) => void
  warnings: InfoWarning[]
  pushWarning: (warning: InfoWarning) => void
  dismissWarning: (id: string) => void
  clearWarnings: () => void
  infoOpen: boolean
  setInfoOpen: (open: boolean) => void
  toggleInfo: () => void
  mappingActive: boolean
  mappingKind: MappingKind
  setMappingActive: (active: boolean) => void
  setMappingKind: (kind: MappingKind) => void
  toggleMapping: () => void
}

function createControlInteractionsStore() {
  return createStore<ControlInteractionsState>(set => ({
    info: null,
    setInfo: info => set(state => (state.info === info ? state : { info })),
    warnings: [],
    pushWarning: warning =>
      set(state => ({
        warnings: [...state.warnings.filter(current => current.id !== warning.id), warning],
      })),
    dismissWarning: id =>
      set(state => ({ warnings: state.warnings.filter(warning => warning.id !== id) })),
    clearWarnings: () => set({ warnings: [] }),
    infoOpen: true,
    setInfoOpen: open => set({ infoOpen: open }),
    toggleInfo: () => set(state => ({ infoOpen: !state.infoOpen })),
    mappingActive: false,
    mappingKind: "any",
    setMappingActive: active => set({ mappingActive: active }),
    setMappingKind: kind => set({ mappingKind: kind }),
    toggleMapping: () => set(state => ({ mappingActive: !state.mappingActive })),
  }))
}

const ControlInteractionsContext = createContext<StoreApi<ControlInteractionsState> | null>(null)

export function ControlInteractionsProvider({ children }: { readonly children: ReactNode }) {
  const [store] = useState(createControlInteractionsStore)
  return (
    <ControlInteractionsContext.Provider value={store}>
      {children}
    </ControlInteractionsContext.Provider>
  )
}

export function useControlInteractions<T>(selector: (state: ControlInteractionsState) => T): T {
  const store = useContext(ControlInteractionsContext)
  if (!store) {
    throw new Error("ControlInteractionsProvider is required")
  }
  return useStore(store, selector)
}
