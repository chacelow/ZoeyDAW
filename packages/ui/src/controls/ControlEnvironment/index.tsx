import type { ReactNode } from "react";
import { Context, type ControlEnvironment } from "./useControlEnvironment";

export type { ControlEnvironment, ControlInfo } from "./useControlEnvironment";

export function ControlEnvironmentProvider({
  value,
  children,
}: {
  value: ControlEnvironment;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
