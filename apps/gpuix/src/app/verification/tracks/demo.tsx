import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { useEffect, useMemo, useState } from "react"
import { render, useGpuix, useWindowSize } from "@gpuix/react"
import { nativeCursorLock } from "@/platform/cursor"
import { fileURLToPath } from "node:url"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { Button, ControlEnvironmentProvider } from "@/ui/controls"
import { PanelEnvironmentProvider } from "@/ui/panels"
import { createWindowPlatform, LAUNCH_FOCUS } from "@/platform/window"
import { AnimationFrameProvider, createAnimationFrameSource } from "@/platform/frame"
import {
  hydrateProject,
  configureProjectCreation,
  projectActions,
  readProjectTelemetry,
  startProjectRuntime,
  useProjectState,
} from "@/project/adapters"
import { createTrack } from "@/project/model/reducers"
import {
  createTestDocument,
  createTestWorkspace,
  TEST_CREATION_NAMES,
  TEST_PROJECT_CREATION,
  TEST_TRACK_APPEARANCE,
} from "@/project/adapters/fixtures"
import { timelineBars } from "@/project/model/selectors"
import { clipRect } from "@/project/sections/arrangement/core/layout"
import { createSceneStore } from "@/project/sections/arrangement/core/scene"
import { TrackRows } from "@/project/sections/arrangement/tracks/TrackRows"
import { TrackResizeOverlay } from "@/project/sections/arrangement/tracks/TrackResizeOverlay"
import { trackResources } from "@/project/sections/arrangement/tracks/locales"
import { contentFill } from "@/shared/theme/content-color"
import type { Appearance } from "@/shared/theme/ThemeProvider"
import { trackLabelsByLocale } from "@/app/locales/sections/tracks"

configureProjectCreation(TEST_PROJECT_CREATION)
const document = createTestDocument()
const workspace = createTestWorkspace()
const main = document.tracks.find(track => track.kind === "main")
if (!main) throw new Error("Missing Main output")
main.heightPx =
  DEFAULT_LAYOUT_TOKENS.track.collapsedHeight + DEFAULT_LAYOUT_TOKENS.track.resizeStep * 4
main.volumeDb = -36
const creation = {
  names: TEST_CREATION_NAMES,
  appearance: { ...TEST_TRACK_APPEARANCE, heightPx: main.heightPx },
}
const group = createTrack("group", document.tracks, undefined, creation)
group.name = "Group"
document.tracks.unshift(group)
const audio = createTrack("audio", document.tracks, group.id, creation)
audio.name = "Audio 音频轨道"
audio.volumeDb = -12
audio.clips = [
  {
    id: "track-demo-audio",
    kind: "audio",
    startBar: 1,
    lengthBars: 2,
    samplePath: fileURLToPath(
      new URL("../../../../../../crates/engine/spikes/assets/probe.wav", import.meta.url)
    ),
    gainDb: 0,
  },
]
group.childTrackIds = [audio.id]
document.tracks.splice(1, 0, audio)
const midi = createTrack("midi", document.tracks, undefined, creation)
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
const folded = createTrack("audio", document.tracks, undefined, creation)
folded.name = "Folded Audio"
folded.collapsed = true
document.tracks.splice(3, 0, folded)
for (let index = 0; index < 5; index++) {
  const destination = createTrack("return", document.tracks, undefined, creation)
  destination.name = `${String.fromCharCode(65 + index)} Return`
  destination.collapsed = index > 0
  document.tracks.splice(document.tracks.length - 1, 0, destination)
  audio.sends = { ...audio.sends, [destination.id]: index === 0 ? -12 : -60 }
}
workspace.pxPerBar = 48
document.transport.loop = { enabled: true, startBar: 1, endBar: 2 }
hydrateProject(JSON.stringify({ version: 2, document, workspace }))

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
  const labels = trackLabelsByLocale[language]
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
      width: Math.max(0, size.width - theme.layout.track.controlsWidth),
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
      theme.layout.track.controlsWidth,
      workspace.pxPerBar,
      workspace.scrollX,
      workspace.scrollY,
    ]
  )
  const scene = useMemo(() => {
    const store = createSceneStore(DEFAULT_LAYOUT_TOKENS)
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
          label={playing ? gallery.playing : gallery.stopped}
          active={playing}
          onClick={() => projectActions.togglePlay()}
          testId="demo-play"
        >
          {playing ? gallery.playing : gallery.stopped}
        </Button>
        <Button
          label={gallery.automationMode}
          active={workspace.automationMode}
          onClick={() => projectActions.setMode("automationMode", !workspace.automationMode)}
        >
          {gallery.automationMode}
        </Button>
        <Button
          label={labels.expand}
          onClick={() => {
            const edit = projectActions.beginEdit("gallery-expand")
            for (const track of document.tracks)
              projectActions.updateTrack(track.id, {
                collapsed: false,
                heightPx:
                  DEFAULT_LAYOUT_TOKENS.track.collapsedHeight +
                  DEFAULT_LAYOUT_TOKENS.track.resizeStep * 4,
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
          label={appearance === "dark" ? gallery.light : gallery.dark}
          onClick={() => onAppearance(appearance === "dark" ? "light" : "dark")}
        >
          {appearance === "dark" ? gallery.light : gallery.dark}
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
      <div
        style={{
          position: "relative",
          width: viewport.width + theme.layout.track.controlsWidth,
          height: viewport.height,
        }}
      >
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
                      backgroundColor: contentFill(
                        clip.color ?? row.track.color,
                        theme.colors,
                        theme.design.colorRecipes.contentPaperTint
                      ),
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
        <TrackResizeOverlay scene={scene} viewport={viewport} labels={labels} />
      </div>
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
        {gallery.backend} {phase}; {playing ? gallery.playing : gallery.stopped}; {stats}
      </text>
    </div>
  )
}

function Demo() {
  const { renderer } = useGpuix()
  const ports = useMemo(() => {
    if (!renderer) throw new Error("Track demo requires a native renderer")
    const window = createWindowPlatform(renderer)
    return {
      frames: createAnimationFrameSource(renderer),
      panels: { subscribeWindowActive: window.subscribeApplicationActive },
    }
  }, [renderer])
  const [appearance, setAppearance] = useState<Appearance>(
    process.env.TRACK_THEME === "light" ? "light" : "dark"
  )
  const [language, setLanguage] = useState<"zh-CN" | "en-US">(
    process.env.TRACK_LANGUAGE === "zh-CN" ? "zh-CN" : "en-US"
  )
  useEffect(() => startProjectRuntime(), [])
  return (
    <AnimationFrameProvider source={ports.frames}>
      <ThemeProvider key={appearance} defaultAppearance={appearance}>
        <ControlEnvironmentProvider value={{ cursorLock: nativeCursorLock }}>
          <PanelEnvironmentProvider environment={ports.panels}>
            <TrackSurface
              appearance={appearance}
              onAppearance={setAppearance}
              language={language}
              onLanguage={setLanguage}
            />
          </PanelEnvironmentProvider>
        </ControlEnvironmentProvider>
      </ThemeProvider>
    </AnimationFrameProvider>
  )
}

render(<Demo />, {
  title: "zoeydaw B2 native tracks",
  width: 1120,
  height: 780,
  ...LAUNCH_FOCUS,
  onKeyDown: event => {
    if (event.key === "space" && !event.isHeld) projectActions.togglePlay()
  },
})
process.stdout.write("B2 tracks ready\n")
