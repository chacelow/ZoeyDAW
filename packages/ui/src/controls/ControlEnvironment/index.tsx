import { Context } from "./useControlEnvironment"
import type { ControlEnvironment } from "./useControlEnvironment"
import type { ReactNode } from "react"

export type { ControlEnvironment, ControlInfo } from "./useControlEnvironment"

export function ControlEnvironmentProvider({
  value,
  children,
}: {
  readonly value: ControlEnvironment
  readonly children: ReactNode
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}
