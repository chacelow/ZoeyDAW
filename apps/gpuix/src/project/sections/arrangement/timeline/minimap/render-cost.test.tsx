import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { afterEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { createMockDocument } from "@/project/adapters/fixtures"
import { useProjectState } from "@/project/stores/useProjectState"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { resolveContentColor } from "@/shared/theme/content-color"
import { MiniMap } from "."
import type { TestRoot } from "@gpuix/react/testing"
import type { Appearance } from "@/shared/theme/ThemeProvider"
import type { Clip } from "@/project/model/types"

const roots: TestRoot[] = []
const original = useProjectState.getState()
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
  useProjectState.setState(original, true)
})

function fixture(clipCount: number) {
  const document = createMockDocument()
  const template = document.tracks.find(track => track.clips.length > 0)
  const source = template?.clips[0]
  if (!template || !source) throw new Error("Missing overview fixture clip")
  let geometryReads = 0
  const clips: Clip[] = Array.from({ length: clipCount }, (_, index) => {
    const clip: Clip = { ...source, id: `cost-${index}`, startBar: 3, lengthBars: 4 }
    Object.defineProperties(clip, {
      startBar: {
        enumerable: true,
        get() {
          geometryReads++
          return 3
        },
      },
      lengthBars: {
        enumerable: true,
        get() {
          geometryReads++
          return 4
        },
      },
    })
    return clip
  })
  useProjectState.setState(state => ({
    document: {
      ...document,
      tracks: [{ ...template, id: "cost-track", clips }],
      markers: [{ id: "cost-marker", label: "Marker", bar: 9 }],
    },
    session: { ...state.session, position: { bar: 1, beat: 1, sixteenth: 1 } },
  }))
  const root = createTestRoot({ width: 640, height: 80 })
  roots.push(root)
  let foreground = ""
  let mutedForeground = ""
  let clipColor = ""
  function Fixture({
    width,
    height,
    bars,
    scrollX,
  }: {
    width: number
    height: number
    bars: number
    scrollX: number
  }) {
    const theme = useTheme()
    foreground = theme.colors.primary
    mutedForeground = theme.colors.mutedForeground
    const track = useProjectState.getState().document.tracks[0]
    if (!track) throw new Error("Missing fixture track")
    clipColor = resolveContentColor(track.clips[0]?.color ?? track.color, theme.colors)
    return (
      <MiniMap
        width={width}
        height={height}
        label="Overview"
        geometry={{
          policy: ARRANGEMENT_DEFAULTS,
          bars,
          viewportWidth: 80,
          pxPerBar: 10,
          scrollX,
          minPxPerBar: 1,
          maxPxPerBar: 100,
        }}
        cursor={{ begin() {}, end() {} }}
        onNavigate={() => {}}
        onViewport={() => {}}
        onFit={() => {}}
      />
    )
  }
  function render(
    width = 320,
    height = 40,
    bars = 32,
    appearance: Appearance = "dark",
    scrollX = 0
  ) {
    root.render(
      <ThemeProvider appearance={appearance}>
        <Fixture width={width} height={height} bars={bars} scrollX={scrollX} />
      </ThemeProvider>
    )
  }
  function line(color: string) {
    const overview = root.renderer.findByTestId("timeline-minimap")
    const element = overview?.children
      .map(id => root.renderer.getElement(id))
      .find(child => child?.style.backgroundColor === color && child.style.width === 1)
    if (!element) throw new Error("Missing native overview line")
    return element
  }
  function clipBounds() {
    const clip = root.renderer.findByTestId("minimap-clip-cost-0")
    if (!clip) throw new Error("Missing native overview clip")
    return root.renderer.getElementBounds(clip.id)
  }
  return {
    root,
    render,
    clipBounds,
    playheadBounds: () => root.renderer.getElementBounds(line(foreground).id),
    markerBounds: () => root.renderer.getElementBounds(line(mutedForeground).id),
    clipColor: () => clipColor,
    reads: () => geometryReads,
    resetReads: () => {
      geometryReads = 0
    },
  }
}

for (const clipCount of [16, 1024]) {
  test(`playback moves the native overview playhead without reading ${clipCount} unchanged clips`, () => {
    const overview = fixture(clipCount)
    overview.render()
    expect(overview.reads()).toBeGreaterThanOrEqual(clipCount * 2)
    const before = overview.clipBounds()
    expect(before).toMatchObject({ x: 20, y: 0, width: 40, height: 39 })
    expect(overview.markerBounds()).toMatchObject({ x: 80, height: 40 })
    expect(overview.playheadBounds()).toMatchObject({ x: 0 })
    overview.resetReads()
    flushSync(() => {
      useProjectState.setState(state => ({
        session: { ...state.session, position: { bar: 5, beat: 1, sixteenth: 1 } },
      }))
    })
    expect(overview.playheadBounds()).toMatchObject({ x: 40 })
    expect(overview.clipBounds()).toEqual(before)
    expect(overview.reads()).toBe(0)
    overview.root.renderer.nativeSimulateMouseMove(60, 20, 0)
    overview.render(320, 40, 32, "dark", 80)
    const frame = overview.root.renderer.findByTestId("minimap-frame")
    if (!frame) throw new Error("Missing native overview viewport")
    expect(overview.root.renderer.getElementBounds(frame.id)).toMatchObject({ x: 80, width: 80 })
    expect(overview.reads()).toBe(0)
  })
}

test("overview refreshes native clip and marker geometry for track, marker, theme and size changes", () => {
  const overview = fixture(16)
  overview.render()
  flushSync(() => {
    useProjectState.setState(state => ({
      document: {
        ...state.document,
        tracks: state.document.tracks.map(track => ({
          ...track,
          clips: track.clips.map(clip => ({ ...clip, startBar: 5, lengthBars: 6 })),
        })),
        markers: [{ id: "cost-marker", label: "Moved", bar: 13 }],
      },
    }))
  })
  expect(overview.clipBounds()).toMatchObject({ x: 40, width: 60, height: 39 })
  expect(overview.markerBounds()).toMatchObject({ x: 120, height: 40 })
  overview.render(640, 60, 64, "light")
  expect(overview.clipBounds()).toMatchObject({ x: 40, width: 60, height: 59 })
  expect(overview.markerBounds()).toMatchObject({ x: 120, height: 60 })
  expect(overview.root.renderer.findByTestId("minimap-clip-cost-0")?.style.backgroundColor).toBe(
    overview.clipColor()
  )
  overview.render(640, 60, 32, "dark")
  expect(overview.clipBounds()).toMatchObject({ x: 80, width: 120, height: 59 })
  expect(overview.markerBounds()).toMatchObject({ x: 240, height: 60 })
})
