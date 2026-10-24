import { useLayoutEffect, useRef } from "react"
import { growTimelineBars } from "@zoeydaw/project-core/selectors"

export function useSongExtent(
  epoch: string,
  baseBars: number,
  throughBar: number,
  quarterNotesPerBar: number
): number {
  const committed = useRef({ epoch, beats: baseBars * quarterNotesPerBar })
  const previousBeats =
    committed.current.epoch === epoch ? committed.current.beats : baseBars * quarterNotesPerBar
  const bars = growTimelineBars(
    previousBeats / quarterNotesPerBar,
    Math.max(throughBar, baseBars + 1 - 32 / quarterNotesPerBar),
    quarterNotesPerBar
  )
  useLayoutEffect(() => {
    committed.current = { epoch, beats: bars * quarterNotesPerBar }
  }, [epoch, bars, quarterNotesPerBar])
  return bars
}
