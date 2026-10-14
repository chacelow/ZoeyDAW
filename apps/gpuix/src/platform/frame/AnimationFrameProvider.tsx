import { createContext, useContext, useLayoutEffect, useRef } from "react"
import type { ReactNode } from "react"
import type { AnimationFrameCallback, AnimationFrameSource } from "./animation-frame-source"

const AnimationFrameContext = createContext<AnimationFrameSource | null>(null)

export interface AnimationFrameProviderProps {
  readonly source: AnimationFrameSource
  readonly children?: ReactNode
}

export function AnimationFrameProvider({ source, children }: AnimationFrameProviderProps) {
  return <AnimationFrameContext.Provider value={source}>{children}</AnimationFrameContext.Provider>
}

export function useAnimationFrame(callback: AnimationFrameCallback, active: boolean): void {
  const source = useContext(AnimationFrameContext)
  if (source === null) {
    throw new Error("useAnimationFrame must be used within an AnimationFrameProvider")
  }

  const committedCallback = useRef(callback)
  useLayoutEffect(() => {
    committedCallback.current = callback
  }, [callback])

  useLayoutEffect(() => {
    if (!active) return
    let subscribed = true
    const unsubscribe = source.subscribe(timestampMs => {
      if (subscribed) committedCallback.current(timestampMs)
    })
    return () => {
      subscribed = false
      unsubscribe()
    }
  }, [source, active])
}
