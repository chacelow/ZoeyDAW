import { useCallback, useMemo, useRef, useState } from "react"
import { useWindowSize, type EventPayload } from "@gpuix/react"
import { useTheme } from "../../../shared/theme/ThemeProvider"
import { sx } from "../../../shared/theme/style"
import type { Clip } from "../../../shared/model/types"
import { createDemoTracks } from "../model/demo-data"
import { clamp, isClipVisible, MIN_CLIP_LENGTH_BARS, PX_PER_BAR, TOTAL_BARS } from "../model/layout"
import { TrackRow } from "./TrackRow"
import type { ClipDragKind, ClipGesture } from "./ClipBlock"

interface Drag {
  kind: ClipDragKind
  clip: Clip
  originX: number
}

export function ClipTimeline() {
  const theme = useTheme()
  const { width } = useWindowSize()
  const [tracks, setTracks] = useState(createDemoTracks)
  const [scrollLeftPx, setScrollLeftPx] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const drag = useRef<Drag | null>(null)
  const gap = theme.project.panelGap
  const laneWidth = Math.max(
    1,
    width - gap * 4 - theme.project.identityWidth - theme.project.trackBorder * 2
  )
  const range = {
    startBar: scrollLeftPx / PX_PER_BAR,
    endBar: (scrollLeftPx + laneWidth) / PX_PER_BAR,
  }

  const begin = useCallback((kind: ClipDragKind, clip: Clip, event: EventPayload) => {
    if ((event.button !== undefined && event.button !== 0) || event.x === undefined) return
    drag.current = { kind, clip, originX: event.x }
    setSelectedId(clip.id)
  }, [])

  const move = useCallback((event: EventPayload) => {
    const current = drag.current
    if (!current || event.x === undefined) return
    if (event.eventType === "mouseMove" && event.pressedButton !== 0) {
      drag.current = null
      return
    }
    const delta = (event.x - current.originX) / PX_PER_BAR
    const source = current.clip
    let startBar = source.startBar
    let lengthBars = source.lengthBars
    if (current.kind === "move") {
      startBar = clamp(source.startBar + delta, 0, TOTAL_BARS - source.lengthBars)
    } else if (current.kind === "resize-left") {
      const end = source.startBar + source.lengthBars
      startBar = clamp(source.startBar + delta, 0, end - MIN_CLIP_LENGTH_BARS)
      lengthBars = end - startBar
    } else {
      lengthBars = clamp(
        source.lengthBars + delta,
        MIN_CLIP_LENGTH_BARS,
        TOTAL_BARS - source.startBar
      )
    }
    setTracks(old =>
      old.map(track =>
        track.clips.some(clip => clip.id === source.id)
          ? {
              ...track,
              clips: track.clips.map(clip =>
                clip.id === source.id ? { ...clip, startBar, lengthBars } : clip
              ),
            }
          : track
      )
    )
  }, [])

  const end = useCallback(
    (event: EventPayload) => {
      move(event)
      drag.current = null
    },
    [move]
  )
  const gesture = useMemo<ClipGesture>(() => ({ begin, move, end }), [begin, move, end])
  const allClips = tracks.flatMap(track => track.clips)
  const mountedCount = allClips.filter(clip => isClipVisible(clip, range)).length
  const selected = allClips.find(clip => clip.id === selectedId)
  const firstBar = Math.floor(range.startBar)
  const lastBar = Math.ceil(range.endBar)

  return (
    <div
      style={sx({
        width: "100%",
        height: "100%",
        padding: gap * 2,
        display: "flex",
        flexDirection: "column",
        gap,
        backgroundColor: theme.colors.background,
        color: theme.colors.foreground,
        userSelect: "none",
      })}
    >
      <text
        style={sx({
          fontSize: theme.transportControl["--text-control-track"] * 1.5,
          color: theme.colors.foreground,
        })}
      >
        Clip rendering · native elements
      </text>
      <text
        style={sx({
          fontSize: theme.transportControl["--text-control-track"],
          color: theme.colors.mutedForeground,
        })}
      >
        {`Drag body to move · drag edges to resize · wheel to pan · ${mountedCount}/${allClips.length} clips mounted`}
      </text>
      <div
        onScroll={event => {
          if (drag.current) return
          const delta = event.deltaX || event.deltaY || 0
          setScrollLeftPx(current =>
            clamp(
              current - delta * (event.precise ? 1 : 24),
              0,
              Math.max(0, TOTAL_BARS * PX_PER_BAR - laneWidth)
            )
          )
        }}
        style={sx({
          display: "flex",
          flexDirection: "column",
          borderWidth: theme.project.trackBorder,
          borderColor: theme.colors.border,
          overflow: "hidden",
        })}
      >
        <div
          style={sx({
            height: theme.transportControl["--spacing-control-track"] * 1.5,
            marginLeft: theme.project.identityWidth,
            position: "relative",
            overflow: "hidden",
            backgroundColor: theme.colors.editorShell,
          })}
        >
          {Array.from({ length: lastBar - firstBar + 1 }, (_, index) => firstBar + index).map(
            bar => (
              <div
                key={bar}
                style={sx({
                  position: "absolute",
                  left: bar * PX_PER_BAR - scrollLeftPx,
                  top: 0,
                  height: "100%",
                  width: PX_PER_BAR,
                  borderLeftWidth: theme.control["--spacing-control-track-pad"],
                  borderColor: theme.colors.border,
                  pointerEvents: "none",
                })}
              >
                <text
                  style={sx({
                    color: theme.colors.mutedForeground,
                    fontSize: theme.control["--text-control-track"],
                    paddingLeft: theme.control["--spacing-control-gap"],
                  })}
                >
                  {bar + 1}
                </text>
              </div>
            )
          )}
        </div>
        {tracks.map(track => (
          <TrackRow
            key={track.id}
            track={track}
            rowHeight={theme.project.defaultTrackHeight}
            scrollLeftPx={scrollLeftPx}
            visibleRange={range}
            theme={theme}
            gesture={gesture}
          />
        ))}
      </div>
      <text
        testId="clip-readout"
        style={sx({
          fontSize: theme.transportControl["--text-control-track"],
          color: theme.colors.foreground,
        })}
      >
        {selected
          ? `${selected.label || selected.kind} · start ${selected.startBar.toFixed(2)} bars · length ${selected.lengthBars.toFixed(2)} bars`
          : "Select a Clip to inspect its live bar position and length"}
      </text>
      <text
        style={sx({
          fontSize: theme.control["--text-control-track"],
          color: theme.colors.mutedForeground,
        })}
      >{`Visible bars ${range.startBar.toFixed(1)}–${range.endBar.toFixed(1)} / ${TOTAL_BARS} · 4 beats/bar · fixture data, no audio engine`}</text>
    </div>
  )
}
