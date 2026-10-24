import { useLayoutEffect, useRef, useState, type RefObject } from "react"

export interface WaveformDimensions {
  readonly surface: RefObject<HTMLDivElement | null>
  readonly waveArea: RefObject<HTMLDivElement | null>
  readonly overviewArea: RefObject<HTMLDivElement | null>
  readonly width: number
  readonly waveHeight: number
  readonly overviewHeight: number
}

export function useWaveformDimensions() {
  const surface = useRef<HTMLDivElement>(null)
  const waveArea = useRef<HTMLDivElement>(null)
  const overviewArea = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [waveHeight, setWaveHeight] = useState(100)
  const [overviewHeight, setOverviewHeight] = useState(16)

  useLayoutEffect(() => {
    const node = surface.current
    if (!node) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const area = waveArea.current
    const overview = overviewArea.current
    if (!area || !overview) return
    const measure = () => {
      const height = area.getBoundingClientRect().height
      const overviewHeight = overview.getBoundingClientRect().height
      if (height > 0) setWaveHeight(height)
      if (overviewHeight > 0) setOverviewHeight(overviewHeight)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    observer.observe(overview)
    return () => observer.disconnect()
  }, [])

  return { surface, waveArea, overviewArea, width, waveHeight, overviewHeight }
}
