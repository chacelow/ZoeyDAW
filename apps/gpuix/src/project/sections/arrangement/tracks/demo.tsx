import { useEffect, useMemo, useState } from "react"
import { render, useGpuix, useWindowSize } from "@gpuix/react"
import { cursorHide, cursorPosition, cursorRestore } from "@zoeydaw/native"
import { fileURLToPath } from "node:url"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { Button, ControlEnvironmentProvider } from "@/ui/controls"
import { PanelEnvironmentProvider } from "@/ui/panels"
import { subscribeApplicationActive } from "@/platform/window"
import {
  hydrateProject,
  projectActions,
  readProjectTelemetry,
  startProjectRuntime,
  useProjectState,
} from "@/project/adapters"
import { createTrack } from "@/project/model/reducers"
import { timelineBars } from "@/project/model/selectors"
import { COLLAPSED_TRACK_HEIGHT, TRACK_RESIZE_STEP } from "@/project/layout"
import { clipRect } from "../core/layout"
import { createSceneStore } from "../core/scene"
import { TrackRows } from "./TrackRows"
import { trackResources } from "./locales"
import { contentFill } from "@/shared/theme/content-color"
import type { Appearance } from "@/shared/theme/ThemeProvider"
import type { CursorLockPort } from "@/ui/controls"

const document = structuredClone(useProjectState.getState().document)
const workspace = structuredClone(useProjectState.getState().workspace)
const main = document.tracks.find(track => track.kind === "main")
if (!main) throw new Error("Missing Main output")
main.heightPx = COLLAPSED_TRACK_HEIGHT + TRACK_RESIZE_STEP * 4
main.volumeDb = -36
const group = createTrack("group", document.tracks, undefined, main.heightPx)
group.name = "Group"
document.tracks.unshift(group)
const audio = createTrack("audio", document.tracks, group.id, main.heightPx)
audio.name = "Audio 音频轨道"
audio.volumeDb = -12
audio.clips = [
  {
    id: "track-demo-audio",
    kind: "audio",
    startBar: 1,
    lengthBars: 2,
    samplePath: fileURLToPath(
      new URL("../../../../../../../crates/engine/spikes/assets/probe.wav", import.meta.url)
    ),
    gainDb: 0,
  },
]
group.childTrackIds = [audio.id]
document.tracks.splice(1, 0, audio)
const midi = createTrack("midi", document.tracks, undefined, main.heightPx)
midi.name = "MIDI"
midi.volumeDb = -12
midi.pan = -0.25
midi.clips = [
  {
    id: "track-demo-midi",
    kind: "midi",
    startBar: 2,
    lengthBars: 2,
    notes: [{ pitch: 60, startBeat: 0, lengthBeats: 1, velocity: 89 }],
  },
]
document.tracks.splice(2, 0, midi)
const folded = createTrack("audio", document.tracks, undefined, main.heightPx)
folded.name = "Folded Audio"
folded.collapsed = true
document.tracks.splice(3, 0, folded)
for (let index = 0; index < 5; index++) {
  const destination = createTrack("return", document.tracks, undefined, main.heightPx)
  destination.name = `${String.fromCharCode(65 + index)} Return`
  destination.collapsed = index > 0
  document.tracks.splice(document.tracks.length - 1, 0, destination)
  audio.sends = { ...audio.sends, [destination.id]: index === 0 ? -12 : -60 }
}
workspace.pxPerBar = 48
document.transport.loop = { enabled: true, startBar: 1, endBar: 2 }
hydrateProject(JSON.stringify({ version: 2, document, workspace }))

const cursorLock: CursorLockPort = {
  capture: cursorPosition,
  hide: () => {
    cursorHide()
  },
  restore: point => {
    cursorRestore(point)
  },
}
const panelEnvironment = { subscribeWindowActive: subscribeApplicationActive }

function TrackSurface({
  appearance,
  onAppearance,
  language,
  onLanguage,
}: {
  readonly appearance: Appearance
  readonly onAppearance: (value: Appearance) => void
  readonly language: "zh-CN" | "en-US"
  readonly onLanguage: (value: "zh-CN" | "en-US") => void
}) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const size = useWindowSize()
  const document = useProjectState(state => state.document)
  const workspace = useProjectState(state => state.workspace)
  const playing = useProjectState(state => state.session.playing)
  const phase = useProjectState(state => state.session.backend.phase)
  const insertionPoint = useProjectState(state => state.session.insertionPoint)
  const selectedTrackIds = useProjectState(state => state.session.selectedTrackIds)
  const labels = trackResources[language].arrangement
  const gallery = trackResources[language].gallery
  const overloaded = document.tracks.some(track =>
    track.clips.some(
      clip => clip.id === "track-demo-audio" && clip.kind === "audio" && clip.gainDb > 0
    )
  )
  const gap = theme.control["--spacing-control-track-gap"]
  const toolbarHeight = theme.control["--spacing-control-track"] + gap * 2
  const viewport = useMemo(
    () => ({
      width: size.width,
      height: Math.max(0, size.height - toolbarHeight * 2),
      pxPerBar: workspace.pxPerBar,
      scrollX: workspace.scrollX,
      scrollY: workspace.scrollY,
      dpr: 1,
    }),
    [
      size.width,
      size.height,
      toolbarHeight,
      workspace.pxPerBar,
      workspace.scrollX,
      workspace.scrollY,
    ]
  )
  const scene = useMemo(() => {
    const store = createSceneStore()
    store.setMusic({
      bars: timelineBars(document),
      tracks: document.tracks,
      markers: document.markers,
      grid: workspace.grid,
      transport: document.transport,
      loop: document.transport.loop,
    })
    store.setViewport(viewport)
    store.setPlayback({ playing, insertionPoint })
    return store.get()
  }, [document, workspace.grid, viewport, playing, insertionPoint])
  const [stats, setStats] = useState("")
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: theme.colors.arrangementSurfaceAlt,
        color: theme.colors.foreground,
      }}
    >
      <div
        role="toolbar"
        aria-label={gallery.title}
        style={{ display: "flex", gap, padding: gap, height: toolbarHeight }}
      >
        <Button
          label={playing ? labels.playing : labels.stopped}
          active={playing}
          onClick={() => projectActions.togglePlay()}
          testId="demo-play"
        >
          {playing ? labels.playing : labels.stopped}
        </Button>
        <Button
          label={labels.automationMode}
          active={workspace.automationMode}
          onClick={() => projectActions.setMode("automationMode", !workspace.automationMode)}
        >
          {labels.automationMode}
        </Button>
        <Button
          label={labels.expand}
          onClick={() => {
            const edit = projectActions.beginEdit("gallery-expand")
            for (const track of document.tracks)
              projectActions.updateTrack(track.id, {
                collapsed: false,
                heightPx: COLLAPSED_TRACK_HEIGHT + TRACK_RESIZE_STEP * 4,
              })
            projectActions.endEdit(edit)
          }}
        >
          {labels.expand}
        </Button>
        <Button
          label={labels.collapse}
          onClick={() => {
            const edit = projectActions.beginEdit("gallery-fold")
            for (const track of document.tracks)
              projectActions.updateTrack(track.id, { collapsed: true })
            projectActions.endEdit(edit)
          }}
        >
          {labels.collapse}
        </Button>
        <Button
          label={gallery.meterOverload}
          active={overloaded}
          onClick={() => {
            projectActions.updateClip("track-demo-audio", { gainDb: overloaded ? 0 : 24 })
          }}
        >
          {gallery.meterOverload}
        </Button>
        <Button
          label={appearance === "dark" ? labels.light : labels.dark}
          onClick={() => onAppearance(appearance === "dark" ? "light" : "dark")}
        >
          {appearance === "dark" ? labels.light : labels.dark}
        </Button>
        <Button
          label={language === "en-US" ? "中文" : "English"}
          onClick={() => onLanguage(language === "en-US" ? "zh-CN" : "en-US")}
        >
          {language === "en-US" ? "中文" : "English"}
        </Button>
        <Button
          label={gallery.frameStats}
          onClick={() => {
            const frame = renderer?.getDebugFrameOverlayStats?.()
            setStats(
              frame
                ? `${frame.frames ?? 0} ${gallery.frames}; p90 ${frame.p90Ms ?? 0} ms`
                : gallery.unavailable
            )
          }}
        >
          {gallery.frameStats}
        </Button>
      </div>
      <TrackRows
        scene={scene}
        viewport={viewport}
        focusedTrackId={selectedTrackIds[0] ?? null}
        onFocusTrack={id => {
          if (!useProjectState.getState().session.selectedTrackIds.includes(id))
            projectActions.selectTracks([id], "header")
        }}
        telemetry={readProjectTelemetry}
        labels={labels}
        renderLane={row => (
          <>
            {row.track.clips.map(clip => {
              const rect = clipRect(clip, { ...row, top: 0 }, viewport.pxPerBar, viewport.scrollX)
              return (
                <div
                  key={clip.id}
                  role="img"
                  aria-label={clip.label ?? row.track.name}
                  style={{
                    position: "absolute",
                    left: rect.left,
                    top: gap,
                    width: rect.width,
                    height: Math.max(0, row.height - gap * 2),
                    backgroundColor: contentFill(clip.color ?? row.track.color, theme.colors),
                    overflow: "hidden",
                    padding: gap,
                    pointerEvents: "none",
                  }}
                >
                  <text
                    style={{
                      fontSize: theme.control["--text-control-track"],
                      color: theme.colors.arrangementClipInk,
                    }}
                  >
                    {clip.label ?? row.track.name}
                  </text>
                </div>
              )
            })}
          </>
        )}
      />
      <text
        role="status"
        aria-label="Track verification"
        style={{
          fontSize: theme.control["--text-control-track"],
          color: theme.colors.mutedForeground,
          height: toolbarHeight,
          padding: gap,
        }}
      >
        {gallery.backend} {phase}; {playing ? labels.playing : labels.stopped}; {stats}
      </text>
    </div>
  )
}

function Demo() {
  const [appearance, setAppearance] = useState<Appearance>(
    process.env.TRACK_THEME === "light" ? "light" : "dark"
  )
  const [language, setLanguage] = useState<"zh-CN" | "en-US">(
    process.env.TRACK_LANGUAGE === "zh-CN" ? "zh-CN" : "en-US"
  )
  useEffect(() => startProjectRuntime(), [])
  return (
    <ThemeProvider key={appearance} defaultAppearance={appearance}>
      <ControlEnvironmentProvider value={{ cursorLock }}>
        <PanelEnvironmentProvider environment={panelEnvironment}>
          <TrackSurface
            appearance={appearance}
            onAppearance={setAppearance}
            language={language}
            onLanguage={setLanguage}
          />
        </PanelEnvironmentProvider>
      </ControlEnvironmentProvider>
    </ThemeProvider>
  )
}

render(<Demo />, {
  title: "zoeydaw B2 native tracks",
  width: 1120,
  height: 780,
  focus: false,
  onKeyDown: event => {
    if (event.key === "space" && !event.isHeld) projectActions.togglePlay()
  },
})
process.stdout.write("B2 tracks ready\n")
