import { useGpuix, useWindowSize } from "@gpuix/react"
import type { PublicInstance } from "@gpuix/react"
import { useLayoutEffect, useRef, useState } from "react"

/** gpuix 0.10 has no onLayout. Keep last-painted bounds behind this seam so a
 * host upgrade can replace sampling without changing the layout or gesture owners. */
export function useElementSize() {
  const ref = useRef<PublicInstance | null>(null)
  const { renderer } = useGpuix()
  const windowSize = useWindowSize()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const sample = () => {
    const bounds = ref.current && renderer?.getElementBounds?.(ref.current.id)
    if (!bounds) return
    setSize(previous =>
      previous.width === bounds.width && previous.height === bounds.height
        ? previous
        : { width: bounds.width, height: bounds.height }
    )
  }
  useLayoutEffect(sample)
  useLayoutEffect(() => {
    sample()
    const timer = setInterval(sample, 32)
    return () => clearInterval(timer)
  }, [renderer, windowSize.width, windowSize.height])
  return { ref, ...size }
}
