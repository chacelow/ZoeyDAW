import { createContext, useContext } from "react"
import type { NativeClipboard } from "@/platform/clipboard"

export interface ClipEditorEnvironment {
  readonly clipboard: NativeClipboard
  readonly subscribeWindowActive: (listener: (active: boolean) => void) => () => void
  readonly drawMode: { markGesture(): void; latch(enabled: boolean): void }
  readonly onRegionKey: (keystrokeId: number | undefined) => void
}

const EnvironmentContext = createContext<ClipEditorEnvironment | null>(null)
export const ClipEditorEnvironmentProvider = EnvironmentContext.Provider

export function useClipEditorEnvironment(): ClipEditorEnvironment {
  const environment = useContext(EnvironmentContext)
  if (!environment) throw new Error("ClipEditor must render inside its environment provider")
  return environment
}
