import { createContext, useContext } from "react"

export interface AppNativeEnvironment {
  readonly subscribeWindowActive: (listener: (active: boolean) => void) => () => void
}
const NativeEnvironmentContext = createContext<AppNativeEnvironment | null>(null)
export const AppNativeEnvironmentProvider = NativeEnvironmentContext.Provider

export function useAppNativeEnvironment() {
  const environment = useContext(NativeEnvironmentContext)
  if (!environment) throw new Error("AppNativeEnvironmentProvider is missing")
  return environment
}
