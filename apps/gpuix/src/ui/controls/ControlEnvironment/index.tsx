import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react"
import type { ReactNode } from "react"
import type { CursorLockPort } from "../DragPad/cursor-port"

export type ControlInfo =
  | "number"
  | "bar"
  | "bipolar"
  | "toggle"
  | "switch"
  | "knob"
  | "dropdown"
  | "popup"
  | "button"
  | "search"
  | "categories"
  | "resources"
  | "filters"

export interface ControlInputPolicy {
  readonly dragPixelsPerStep: number
  readonly wheelPixelsPerStep: number
  readonly wheelLinePixels: number
  readonly dragThresholdPixels: number
}

export interface ControlEnvironment {
  readonly inputPolicy?: ControlInputPolicy
  readonly setInfo?: (info: ControlInfo | null) => void
  readonly mappingActive?: boolean
  readonly cursorLock?: CursorLockPort
  readonly textFocus?: { enter(): () => void }
  readonly subscribeWindowActive?: (listener: (active: boolean) => void) => () => void
}
const EnvironmentContext = createContext<ControlEnvironment>({})

/**
 * Holds the hovered/focused control's info outside React state. Hover fires on every
 * pointer crossing; keeping it in a root `useState` re-rendered the whole window, so only
 * the status text subscribes via `useControlInfoStore`.
 */
export interface ControlInfoStore {
  readonly set: (info: ControlInfo | null) => void
  readonly get: () => ControlInfo | null
  readonly subscribe: (listener: () => void) => () => void
}

export function createControlInfoStore(): ControlInfoStore {
  let current: ControlInfo | null = null
  const listeners = new Set<() => void>()
  return {
    set(info) {
      if (info === current) return
      current = info
      for (const listener of listeners) listener()
    },
    get: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export function useControlInfoStore(store: ControlInfoStore): ControlInfo | null {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

export function ControlEnvironmentProvider({
  value,
  children,
}: {
  readonly value: ControlEnvironment
  readonly children: ReactNode
}) {
  const inherited = useContext(EnvironmentContext).inputPolicy
  const environment = useMemo(
    () => ({ ...value, inputPolicy: value.inputPolicy ?? inherited }),
    [value, inherited]
  )
  return <EnvironmentContext.Provider value={environment}>{children}</EnvironmentContext.Provider>
}

export function useControlEnvironment(): ControlEnvironment {
  return useContext(EnvironmentContext)
}

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
