import { createContext, useContext } from "react";

export type ControlInfo =
  | "number"
  | "bar"
  | "bipolar"
  | "toggle"
  | "dropdown"
  | "popup"
  | "button"
  | "search"
  | "categories"
  | "resources"
  | "filters";

export interface ControlEnvironment {
  setInfo?: (info: ControlInfo | null) => void;
  mappingActive?: boolean;
  restoreCursor?: (clientX: number, clientY: number) => void | Promise<void>;
  recenterCursor?: (clientX: number, clientY: number) => void | Promise<void>;
}

export const Context = createContext<ControlEnvironment>({});

export function useControlEnvironment() {
  return useContext(Context);
}
