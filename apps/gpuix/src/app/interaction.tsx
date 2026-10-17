import { createContext, useContext, useMemo } from "react"
import { ControlEnvironmentProvider, createControlInfoStore } from "@/ui/controls"
import { useControlEnvironment } from "@/ui/controls/ControlEnvironment"
import { usePreference } from "@/platform/settings"
import { createControlInputPolicy } from "./control-input"
import type { ReactNode } from "react"
import type { ControlInfoStore } from "@/ui/controls"

export interface AppInteraction {
  readonly textFocus: { enter(): () => void }
  isTextFocused(): boolean
  enterModal(): () => void
  isModalOpen(): boolean
}

export function createAppInteraction(): AppInteraction {
  const text = new Set<symbol>()
  const modals = new Set<symbol>()
  function enter(leases: Set<symbol>) {
    const token = Symbol()
    leases.add(token)
    return () => {
      leases.delete(token)
    }
  }
  return {
    textFocus: { enter: () => enter(text) },
    isTextFocused: () => text.size > 0,
    enterModal: () => enter(modals),
    isModalOpen: () => modals.size > 0,
  }
}

const InteractionContext = createContext<AppInteraction | null>(null)
const InfoContext = createContext<ControlInfoStore | null>(null)

export function AppInteractionProvider({ children }: { readonly children: ReactNode }) {
  const inherited = useControlEnvironment()
  const numericInput = usePreference("numericInput")
  const pointer = usePreference("pointer")
  const inputPolicy = useMemo(
    () => createControlInputPolicy(numericInput, pointer),
    [numericInput, pointer]
  )
  const interaction = useMemo(createAppInteraction, [])
  const info = useMemo(createControlInfoStore, [])
  const controls = useMemo(
    () => ({ ...inherited, textFocus: interaction.textFocus, setInfo: info.set, inputPolicy }),
    [inherited, interaction, info, inputPolicy]
  )
  return (
    <InteractionContext.Provider value={interaction}>
      <ControlEnvironmentProvider value={controls}>
        <InfoContext.Provider value={info}>{children}</InfoContext.Provider>
      </ControlEnvironmentProvider>
    </InteractionContext.Provider>
  )
}

export function useAppInteraction() {
  const interaction = useContext(InteractionContext)
  if (!interaction) throw new Error("AppInteractionProvider is missing")
  return interaction
}

export function useControlInfoSource() {
  const store = useContext(InfoContext)
  if (!store) throw new Error("AppInteractionProvider is missing")
  return store
}
