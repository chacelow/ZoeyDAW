import { afterEach, beforeEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync, useWindowSize } from "@gpuix/react"
import { ThemeProvider } from "../../../../../shared/theme/ThemeProvider"
import { readOuterBounds } from "../../../../../ui/controls/useMeasuredTextWidth"
import {
  hydrateProject,
  projectActions,
  useProjectState,
  readProjectTelemetry,
} from "../../../../adapters"
import { createMockDocument, createMockWorkspace } from "../../../../adapters/fixtures"
import { COLLAPSED_TRACK_HEIGHT, TRACK_RESIZE_STEP, TRACK_LAYOUT } from "../../../../layout"
import { createSceneStore } from "../../core/scene"
import { TrackRows } from "../TrackRows"
import { trackResources } from "../locales"
import type { TestRoot } from "@gpuix/react/testing"
import type { ArrangementViewport } from "../../core/scene"

const roots: TestRoot[] = []
const viewport: ArrangementViewport = {
  width: 1000,
  height: 1200,
  pxPerBar: 32,
  scrollX: 0,
  scrollY: 0,
  dpr: 1,
}

function current(id: string) {
  const track = useProjectState.getState().document.tracks.find(item => item.id === id)
  if (!track) throw new Error(`Missing track ${id}`)
  return track
}

function mount(view = viewport, focusedTrackId: string | null = null) {
  const root = createTestRoot({ width: view.width, height: view.height })
  roots.push(root)
  function Surface() {
    const size = useWindowSize()
    const acceptedViewport = { ...view, ...size }
    const document = useProjectState(state => state.document)
    const scene = {
      ...createSceneStore().get(),
      tracks: document.tracks,
      viewport: acceptedViewport,
    }
    return (
      <ThemeProvider>
        <TrackRows
          scene={scene}
          viewport={acceptedViewport}
          focusedTrackId={focusedTrackId}
          telemetry={readProjectTelemetry}
          labels={trackResources["en-US"].arrangement}
          onFocusTrack={id => {
            if (!useProjectState.getState().session.selectedTrackIds.includes(id))
              projectActions.selectTracks([id], "header")
          }}
          renderLane={row => <text testId={`lane-content-${row.track.id}`}>{row.track.name}</text>}
        />
      </ThemeProvider>
    )
  }
  root.render(<Surface />)
  root.renderer.flush()
  return root
}

function element(root: TestRoot, id: string) {
  const found = root.renderer.findByTestId(id)
  if (!found) throw new Error(`Missing ${id}`)
  return found
}

function bounds(root: TestRoot, id: string) {
  const found = readOuterBounds(root.renderer, element(root, id))
  if (!found) throw new Error(`Unpainted ${id}`)
  return found
}

function click(root: TestRoot, id: string) {
  const rect = bounds(root, id)
  root.renderer.nativeSimulateClick(rect.x + rect.width / 2, rect.y + rect.height / 2)
}

beforeEach(() => {
  const document = createMockDocument()
  for (const track of document.tracks) {
    track.collapsed = false
    track.heightPx = 70
  }
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
})
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

test("composite rows fill the viewport and give the lane remaining width", () => {
  const root = mount()
  const row = bounds(root, "track-row-3-audio")
  const lane = bounds(root, "track-lane-3-audio")
  const identity = bounds(root, "track-identity-3-audio")
  const routing = bounds(root, "track-routing-3-audio")
  const mixer = bounds(root, "track-mixer-3-audio")
  expect(row.width).toBe(viewport.width)
  expect(lane.width + identity.width + routing.width + mixer.width).toBe(row.width)
  expect(identity.x).toBe(lane.x + lane.width)
  expect(mixer.x + mixer.width).toBe(row.x + row.width)
})

for (const id of ["a-apply", "main"]) {
  test(`bottom-anchored ${id} shrinks downward and expands upward`, () => {
    const root = mount()
    root.renderer.nativeSimulateKeystrokes(element(root, `track-resize-${id}`).id, "down")
    expect(current(id).heightPx).toBe(53)
    root.renderer.simulateKeystrokes("down down")
    expect(current(id).collapsed).toBe(true)
    root.renderer.simulateKeystrokes("up")
    expect(current(id).collapsed).toBe(false)
  })
}

test("ordinary tracks resize in control-row steps and keep undo atomic", () => {
  const root = mount()
  root.renderer.nativeSimulateKeystrokes(element(root, "track-resize-trager").id, "up")
  expect(current("trager").heightPx).toBe(53)
  root.renderer.simulateKeystrokes("down")
  expect(current("trager").heightPx).toBe(70)
  const rect = bounds(root, "track-resize-trager")
  root.renderer.nativeSimulateMouseDown(rect.x + rect.width / 2, rect.y + rect.height / 2)
  root.renderer.nativeSimulateMouseMove(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2 + TRACK_RESIZE_STEP * 2,
    0
  )
  expect(current("trager").heightPx).toBe(104)
  root.renderer.nativeSimulateMouseUp(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2 + TRACK_RESIZE_STEP * 2
  )
  projectActions.undo()
  expect(current("trager").heightPx).toBe(70)
})

test("Escape rolls back a height preview instead of consuming the previous undo entry", () => {
  const root = mount()
  const rect = bounds(root, "track-resize-trager")
  const x = rect.x + rect.width / 2
  const y = rect.y + rect.height / 2
  root.renderer.nativeSimulateMouseDown(x, y)
  root.renderer.nativeSimulateMouseMove(x, y + TRACK_RESIZE_STEP * 2, 0)
  expect(current("trager").heightPx).toBe(104)
  root.renderer.nativeSimulateKeystrokes(element(root, "track-resize-trager").id, "escape")
  expect(current("trager").heightPx).toBe(70)
  root.renderer.nativeSimulateMouseUp(x, y + TRACK_RESIZE_STEP * 2)
  expect(current("trager").heightPx).toBe(70)
})

for (const id of ["3-audio", "trager", "drums-group", "a-apply", "main"]) {
  test(`folded ${id} retains only supported first-row controls`, () => {
    const root = mount()
    expect(root.renderer.findByTestId(`track-volume-${id}`)).toBeDefined()
    expect(root.renderer.findByTestId(`track-pan-${id}`)).toBeDefined()
    click(root, `track-fold-${id}`)
    expect(current(id).collapsed).toBe(true)
    const kind = current(id).kind
    if (kind === "main") {
      expect(root.renderer.findByTestId(`track-cue-volume-${id}`)).toBeDefined()
      expect(root.renderer.findByTestId(`track-output-${id}`)).toBeDefined()
      expect(root.renderer.findByTestId(`track-solo-${id}`)).toBeUndefined()
    } else {
      expect(root.renderer.findByTestId(`track-enabled-${id}`)).toBeDefined()
      expect(root.renderer.findByTestId(`track-solo-${id}`)).toBeDefined()
      expect(root.renderer.findByTestId(`track-volume-${id}`)).toBeUndefined()
      expect(root.renderer.findByTestId(`track-output-${id}`)).toBeUndefined()
      expect(Boolean(root.renderer.findByTestId(`track-arm-${id}`))).toBe(
        kind === "audio" || kind === "midi"
      )
      if (kind === "group")
        expect(root.renderer.findByTestId(`track-arm-space-${id}`)).toBeDefined()
      if (kind === "return") expect(root.renderer.findByTestId(`track-post-${id}`)).toBeDefined()
    }
    expect(bounds(root, `track-row-${id}`).height).toBe(COLLAPSED_TRACK_HEIGHT)
    click(root, `track-fold-${id}`)
    expect(current(id).collapsed).toBe(false)
    expect(root.renderer.findByTestId(`track-volume-${id}`)).toBeDefined()
    expect(root.renderer.findByTestId(`track-pan-${id}`)).toBeDefined()
  })
}

test("routing restores input only when four complete uniform rows fit", () => {
  const requiredHeight = COLLAPSED_TRACK_HEIGHT + 3 * TRACK_RESIZE_STEP
  projectActions.updateTrack("3-audio", { heightPx: requiredHeight - 1 })
  const root = mount()
  expect(root.renderer.findByTestId("track-input-3-audio")).toBeUndefined()
  expect(root.renderer.findByTestId("track-output-3-audio")).toBeDefined()
  flushSync(() => projectActions.updateTrack("3-audio", { heightPx: requiredHeight }))
  root.renderer.flush()
  expect(root.renderer.findByTestId("track-input-3-audio")).toBeDefined()
  expect(root.renderer.findByTestId("track-input-channel-3-audio")).toBeDefined()
  flushSync(() => projectActions.updateTrack("3-audio", { heightPx: requiredHeight - 1 }))
  root.renderer.flush()
  expect(root.renderer.findByTestId("track-input-3-audio")).toBeUndefined()
})

for (const id of ["3-audio", "trager"]) {
  test(`short ${id} prioritizes output and preserves MIDI volume/pan`, () => {
    projectActions.updateTrack(id, { heightPx: 35 })
    const root = mount()
    expect(root.renderer.findByTestId(`track-input-${id}`)).toBeUndefined()
    expect(root.renderer.findByTestId(`track-input-channel-${id}`)).toBeUndefined()
    expect(root.renderer.findByTestId(`track-output-${id}`)).toBeDefined()
    expect(root.renderer.findByTestId(`track-volume-${id}`)).toBeDefined()
    expect(root.renderer.findByTestId(`track-pan-${id}`)).toBeDefined()
    expect(Boolean(root.renderer.findByTestId(`track-monitor-${id}`))).toBe(id === "trager")
    expect(Boolean(root.renderer.findByTestId(`track-output-channel-${id}`))).toBe(id === "3-audio")
  })
}

test("send rows fill horizontally in equal thirds before adding a second row", () => {
  const document = structuredClone(useProjectState.getState().document)
  for (let index = 0; index < 4; index++)
    document.tracks.push({ ...current("a-apply"), id: `return-${index}`, name: `Return ${index}` })
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
  const root = mount({ ...viewport, height: 1600 })
  const first = bounds(root, "track-send-a-apply-3-audio")
  const second = bounds(root, "track-send-return-0-3-audio")
  const third = bounds(root, "track-send-return-1-3-audio")
  const containerWidth = bounds(root, "track-sends-3-audio").width
  const idealWidth = (containerWidth - TRACK_LAYOUT.spacing * 2) / 3
  for (const column of [first, second, third])
    expect(Math.abs(column.width - idealWidth)).toBeLessThanOrEqual(1)
  expect(first.width + second.width + third.width + TRACK_LAYOUT.spacing * 2).toBe(containerWidth)
  expect(first.y).toBe(second.y)
  expect(second.y).toBe(third.y)
  expect(first.x).toBeLessThan(second.x)
  expect(second.x).toBeLessThan(third.x)
  expect(root.renderer.findByTestId("track-send-return-2-3-audio")).toBeUndefined()
  root.renderer.nativeSimulateKeystrokes(element(root, "track-resize-3-audio").id, "down")
  expect(bounds(root, "track-send-return-2-3-audio").y).toBe(first.y + TRACK_RESIZE_STEP)
  root.renderer.simulateKeystrokes("up up")
  expect(root.renderer.findByTestId("track-send-a-apply-3-audio")).toBeUndefined()
})

test("lane and identity selection are independent without moving the insertion point", () => {
  const root = mount()
  const insertion = { trackId: "3-audio", bar: 4.25 }
  projectActions.setInsertionPoint(insertion)
  const normalMixer = element(root, "track-mixer-4-midi").style.backgroundColor
  const normalIdentity = element(root, "track-identity-4-midi").style.backgroundColor
  click(root, "track-label-4-midi")
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(["4-midi"])
  expect(useProjectState.getState().session.trackSelectionSurface).toBe("header")
  expect(element(root, "track-identity-4-midi").style.backgroundColor).not.toBe(normalIdentity)
  expect(element(root, "track-mixer-4-midi").style.backgroundColor).toBe(normalMixer)
  click(root, "track-lane-4-midi")
  expect(useProjectState.getState().session.trackSelectionSurface).toBe("arrangement")
  expect(element(root, "track-identity-4-midi").style.backgroundColor).toBe(normalIdentity)
  expect(element(root, "track-mixer-4-midi").style.backgroundColor).toBe(normalMixer)
  expect(useProjectState.getState().session.insertionPoint).toEqual(insertion)
  click(root, "track-solo-4-midi")
  expect(current("4-midi").solo).toBe(true)
  expect(useProjectState.getState().session.trackSelectionSurface).toBe("arrangement")
})

test("folding Group unmounts children and shows only the folded descendant overview", () => {
  const root = mount()
  const children = current("drums-group").childTrackIds ?? []
  expect(children.length).toBeGreaterThan(0)
  expect(root.renderer.findByTestId("track-group-overview-drums-group")).toBeUndefined()
  for (const child of children)
    expect(root.renderer.findByTestId(`track-row-${child}`)).toBeDefined()
  expect(bounds(root, "track-group-frame-drums-group").height).toBeGreaterThan(
    bounds(root, "track-row-drums-group").height
  )
  click(root, "track-fold-drums-group")
  for (const child of children)
    expect(root.renderer.findByTestId(`track-row-${child}`)).toBeUndefined()
  expect(root.renderer.findByTestId("track-group-overview-drums-group")).toBeDefined()
  expect(bounds(root, "track-group-frame-drums-group").height).toBe(COLLAPSED_TRACK_HEIGHT)
  click(root, "track-fold-drums-group")
  expect(root.renderer.findByTestId("track-group-overview-drums-group")).toBeUndefined()
  for (const child of children)
    expect(root.renderer.findByTestId(`track-row-${child}`)).toBeDefined()
})

test("offscreen rows unmount while an edited header retains focus without mounting its lane", () => {
  const root = mount({ ...viewport, height: 360, scrollY: 700 }, "3-audio")
  expect(root.renderer.findByTestId("track-row-drums-group")).toBeUndefined()
  expect(root.renderer.findByTestId("track-row-3-audio")).toBeDefined()
  expect(root.renderer.findByTestId("lane-content-3-audio")).toBeUndefined()
  expect(root.renderer.findByTestId("track-row-main")).toBeDefined()
})

test("F2 name editing commits Enter, preserves spaces and cancels Escape", () => {
  const root = mount()
  root.renderer.nativeSimulateKeystrokes(element(root, "track-label-3-audio").id, "f2")
  const input = element(root, "track-name-3-audio")
  root.renderer.nativeSimulateKeystrokes(input.id, "cmd-a N a m e space 2 enter")
  expect(current("3-audio").name).toBe("Name 2")
  root.renderer.nativeSimulateKeystrokes(element(root, "track-label-3-audio").id, "f2")
  root.renderer.nativeSimulateKeystrokes(
    element(root, "track-name-3-audio").id,
    "cmd-a B a d escape"
  )
  expect(current("3-audio").name).toBe("Name 2")
})

test("Cmd selection removes a selected track and Shift extends the visible range", () => {
  const root = mount()
  click(root, "track-label-3-audio")
  const target = bounds(root, "track-label-4-midi")
  const x = target.x + target.width / 2
  const y = target.y + target.height / 2
  root.renderer.nativeSimulateClick(x, y, 0, "cmd")
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(["3-audio", "4-midi"])
  root.renderer.nativeSimulateClick(x, y, 0, "cmd")
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(["3-audio"])
  root.renderer.nativeSimulateClick(x, y, 0, "shift")
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(["3-audio", "4-midi"])
})

function dragTrack(root: TestRoot, source: string, target: string, cancel = false) {
  const from = bounds(root, `track-label-${source}`)
  const to = bounds(root, `track-label-${target}`)
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
  root.renderer.nativeSimulateMouseDown(start.x, start.y)
  root.renderer.nativeSimulateMouseMove(end.x, end.y, 0)
  if (cancel)
    root.renderer.nativeSimulateKeystrokes(element(root, `track-label-${source}`).id, "escape")
  root.renderer.nativeSimulateMouseUp(end.x, end.y)
}

test("captured name dragging reorders on release and undo restores document order", () => {
  const root = mount()
  const original = useProjectState.getState().document.tracks.map(track => track.id)
  dragTrack(root, "4-midi", "3-audio")
  expect(useProjectState.getState().document.tracks.map(track => track.id)).toEqual([
    "drums-group",
    "trager",
    "sidechain",
    "4-midi",
    "3-audio",
    "a-apply",
    "main",
  ])
  projectActions.undo()
  expect(useProjectState.getState().document.tracks.map(track => track.id)).toEqual(original)
})

test("Escape cancels track reordering without creating a history entry", () => {
  const root = mount()
  const original = useProjectState.getState().document.tracks.map(track => track.id)
  dragTrack(root, "4-midi", "3-audio", true)
  expect(useProjectState.getState().document.tracks.map(track => track.id)).toEqual(original)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

test("dragging a Group moves its descendants as one branch without changing routing", () => {
  const root = mount()
  dragTrack(root, "drums-group", "4-midi")
  expect(useProjectState.getState().document.tracks.map(track => track.id)).toEqual([
    "3-audio",
    "drums-group",
    "trager",
    "sidechain",
    "4-midi",
    "a-apply",
    "main",
  ])
  expect(current("drums-group").childTrackIds).toEqual(["trager", "sidechain"])
  expect(current("trager").output).toBe("drums-group")
  expect(current("sidechain").output).toBe("drums-group")
})

test("oversubscribed pinned rows preserve the top gap and unmount offscreen headers", () => {
  const root = mount({ ...viewport, height: 120 })
  expect(root.renderer.findByTestId("track-row-a-apply")).toBeUndefined()
  expect(root.renderer.findByTestId("track-row-main")).toBeDefined()
  const surface = bounds(root, "track-rows")
  const pinned = bounds(root, "track-pinned-viewport")
  expect(pinned.y).toBeGreaterThan(surface.y)
  expect(pinned.y + pinned.height).toBeLessThanOrEqual(surface.y + surface.height)
})
