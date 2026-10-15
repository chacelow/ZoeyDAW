import { createContext, useContext } from "react"
import type { NativeClipboard } from "@/platform/clipboard"

/**
Capabilities only the composition root can own. One window has one activation observer and one
draw-mode (B key) owner, so the editor receives them instead of creating its own.
*/
export interface ClipEditorEnvironment {
  readonly clipboard: NativeClipboard
  readonly subscribeWindowActive: (listener: (active: boolean) => void) => () => void
  /** Timeline keyboard owner: `markGesture` keeps a held B temporary, `latch` stores the mode. */
  readonly drawMode: { markGesture(): void; latch(enabled: boolean): void }
  /**
  Called from the editor root for every keystroke that reaches it unhandled, before the window
  handler of the same keystroke; the root compares ids to classify that keystroke as Clip editor focus.
  */
  readonly onRegionKey: (keystrokeId: number | undefined) => void
}

const EnvironmentContext = createContext<ClipEditorEnvironment | null>(null)
export const ClipEditorEnvironmentProvider = EnvironmentContext.Provider

export function useClipEditorEnvironment(): ClipEditorEnvironment {
  const environment = useContext(EnvironmentContext)
  if (!environment) throw new Error("ClipEditor must render inside its environment provider")
  return environment
}
