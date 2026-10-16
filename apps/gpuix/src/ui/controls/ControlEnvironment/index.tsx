import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef } from "react"
import type { ReactNode } from "react"
import type { CursorLockPort } from "../DragPad/cursor-port"

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
  | "filters"

export interface ControlEnvironment {
  readonly setInfo?: (info: ControlInfo | null) => void
  readonly mappingActive?: boolean
  readonly cursorLock?: CursorLockPort
  readonly textFocus?: { enter(): () => void }
  readonly subscribeWindowActive?: (listener: (active: boolean) => void) => () => void
}
const EnvironmentContext = createContext<ControlEnvironment>({})

export function ControlEnvironmentProvider({
  value,
  children,
}: {
  readonly value: ControlEnvironment
  readonly children: ReactNode
}) {
  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>
}

export function useControlEnvironment(): ControlEnvironment {
  return useContext(EnvironmentContext)
}

/** Native editor focus owns a lease; blur and unmount release it idempotently. */
export function useTextFocusBinding(active = true) {
  const { textFocus } = useControlEnvironment()
  const release = useRef<(() => void) | null>(null)
  const onBlur = useCallback(() => {
    release.current?.()
    release.current = null
  }, [])
  const onFocus = useCallback(() => {
    if (active && !release.current) release.current = textFocus?.enter() ?? null
  }, [active, textFocus])
  useLayoutEffect(() => {
    if (!active) onBlur()
  }, [active, onBlur])
  useLayoutEffect(() => onBlur, [onBlur, textFocus])
  return { onFocus, onBlur }
}

export interface UseInfoBindingOptions {
  readonly type: ControlInfo
  readonly description?: string
  readonly dragging?: boolean
}

export function useInfoBinding({ type, description, dragging = false }: UseInfoBindingOptions) {
  const { setInfo } = useContext(EnvironmentContext)
  const hovered = useRef(false)
  const focused = useRef(false)
  const publish = useCallback(() => setInfo?.(type), [setInfo, type])
  const clear = useCallback(() => {
    if (!hovered.current && !focused.current && !dragging) setInfo?.(null)
  }, [setInfo, dragging])
  const focusChanged = useCallback(
    (next: boolean) => {
      focused.current = next
      if (next) publish()
      else clear()
    },
    [publish, clear]
  )
  useEffect(() => {
    if (dragging) publish()
    else clear()
  }, [dragging, publish, clear])
  return {
    "aria-description": description,
    onMouseEnter: () => {
      hovered.current = true
      publish()
    },
    onMouseLeave: () => {
      hovered.current = false
      clear()
    },
    onFocus: () => focusChanged(true),
    onBlur: () => focusChanged(false),
  }
}
