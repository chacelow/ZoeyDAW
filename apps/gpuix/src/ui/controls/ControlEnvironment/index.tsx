import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import type { PublicInstance } from "@gpuix/react"
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
}
interface InfoScope extends ControlEnvironment {
  readonly register?: (id: number, onFocusChange: (focused: boolean) => void) => () => void
}
const EnvironmentContext = createContext<InfoScope>({})

export function ControlEnvironmentProvider({
  value,
  children,
}: {
  readonly value: ControlEnvironment
  readonly children: ReactNode
}) {
  const { renderer } = useGpuix()
  const controls = useRef(new Map<number, (focused: boolean) => void>())
  const [hasSubscribers, setHasSubscribers] = useState(false)
  const register = useCallback((id: number, onFocusChange: (focused: boolean) => void) => {
    controls.current.set(id, onFocusChange)
    setHasSubscribers(true)
    return () => {
      if (controls.current.get(id) === onFocusChange) controls.current.delete(id)
      if (controls.current.size === 0) setHasSubscribers(false)
    }
  }, [])
  useEffect(() => {
    if (!hasSubscribers || !renderer?.getFocusedElementId) return
    let previous: number | null | undefined
    // gpuix 0.10 changes native focus without dispatching its declared onFocus/onBlur events.
    const timer = setInterval(() => {
      const focused = renderer.getFocusedElementId?.()
      if (focused === previous) return
      if (previous != null) controls.current.get(previous)?.(false)
      previous = focused
      if (focused != null) controls.current.get(focused)?.(true)
    }, 32)
    return () => clearInterval(timer)
  }, [hasSubscribers, renderer])
  return (
    <EnvironmentContext.Provider
      value={{ ...value, register: value.setInfo ? register : undefined }}
    >
      {children}
    </EnvironmentContext.Provider>
  )
}

export function useControlEnvironment(): ControlEnvironment {
  return useContext(EnvironmentContext)
}

export interface UseInfoBindingOptions {
  readonly type: ControlInfo
  readonly description?: string
  readonly dragging?: boolean
}

export function useInfoBinding({ type, description, dragging = false }: UseInfoBindingOptions) {
  const { setInfo, register } = useContext(EnvironmentContext)
  const hovered = useRef(false)
  const focused = useRef(false)
  const release = useRef<(() => void) | null>(null)
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
  const ref = useCallback(
    (node: PublicInstance | null) => {
      release.current?.()
      release.current = node ? (register?.(node.id, focusChanged) ?? null) : null
    },
    [register, focusChanged]
  )
  useEffect(
    () => () => {
      release.current?.()
    },
    []
  )
  useEffect(() => {
    if (dragging) publish()
    else clear()
  }, [dragging, publish, clear])
  return {
    ref,
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
