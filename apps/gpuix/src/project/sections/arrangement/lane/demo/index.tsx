import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import { render, useGpuix } from "@gpuix/react"
import {
  AnimationFrameProvider,
  createAnimationFrameSource,
  useAnimationFrame,
} from "@/platform/frame"
import { WindowKeyboardProvider } from "@/platform/keyboard"
import { createWindowPlatform } from "@/platform/window"
import {
  getEffectiveDocument,
  projectActions,
  readProjectPeaks,
  readTransportBar,
  useProjectState,
} from "@/project/adapters"
import { CONTROLS_WIDTH, TRACK_TITLE_HEIGHT } from "@/project/layout"
import { resolveContentColor } from "@/shared/theme/content-color"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Button, ScrollArea } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { LaneRow } from "../LaneRow"
import { LaneOverlay } from "../LaneOverlay"
import { visibleRows, visibleClipCards } from "../render-projection"
import type { ArrangementScene } from "../../core/scene"
import { createVerificationMedia } from "./media"
import { seedLaneProject } from "./project"
import { createLaneDemoRuntime } from "./runtime"
import type { LaneDemoRuntime } from "./runtime"
import { labelsByLocale } from "./labels"

const stress = process.env.LANE_STRESS === "1"
const locale = process.env.LANE_LOCALE === "zh" ? "zh" : "en"
const appearance = process.env.LANE_THEME === "light" ? "light" : "dark"
const media = createVerificationMedia()
seedLaneProject(media.uri, stress)
const runtime = createLaneDemoRuntime()

function NativeFrames({ runtime, children }: { runtime: LaneDemoRuntime; children: ReactNode }) {
  const { renderer } = useGpuix()
  const source = useMemo(() => {
    if (!renderer) throw new Error("Native renderer is unavailable")
    return createAnimationFrameSource(renderer)
  }, [renderer])
  useLayoutEffect(() => {
    if (!renderer) return
    const platform = createWindowPlatform(renderer)
    platform.activate()
    return platform.subscribeApplicationActive(active => {
      if (!active) runtime.interrupt()
    })
  }, [renderer, runtime])
  return <AnimationFrameProvider source={source}>{children}</AnimationFrameProvider>
}

function TransportOverlay({
  runtime,
  scene,
}: {
  runtime: LaneDemoRuntime
  scene: ArrangementScene
}) {
  const playing = useProjectState(state => state.session.playing)
  const interaction = useSyncExternalStore(runtime.lane.subscribe, runtime.lane.getSnapshot)
  useAnimationFrame(timestampMs => {
    runtime.frame(timestampMs)
  }, playing || interaction.dragActive)
  return <LaneOverlay scene={scene} viewport={scene.viewport} transportBar={readTransportBar} />
}

function LaneDemo({ runtime }: { runtime: LaneDemoRuntime }) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const scene = useSyncExternalStore(runtime.scene.subscribe, runtime.scene.get)
  const backend = useProjectState(state => state.session.backend)
  const playing = useProjectState(state => state.session.playing)
  const automation = useProjectState(state => state.workspace.automationMode)
  const follow = useProjectState(state => state.workspace.follow)
  const selected = useProjectState(state => state.session.selectedClipIds)
  const editorRequest = useProjectState(state => state.session.clipEditorRequest)
  const announced = useRef(false)
  const rows = useMemo(() => visibleRows(scene), [scene])
  const effective = getEffectiveDocument()
  const clips = effective.tracks.reduce((count, track) => count + track.clips.length, 0)
  const mounted = rows.reduce(
    (count, row) => count + visibleClipCards(scene, row, automation).length,
    0
  )
  const chosenId = scene.clipDrag?.ids.values().next().value ?? selected[0]
  const chosenTrack = scene.tracks.find(track => track.clips.some(clip => clip.id === chosenId))
  const chosen = chosenTrack?.clips.find(clip => clip.id === chosenId)
  const ui =
    locale === "zh"
      ? {
          play: "播放",
          stop: "停止",
          undo: "撤销",
          redo: "重做",
          zoomIn: "放大",
          zoomOut: "缩小",
          auto: "自动化",
          follow: "跟随",
          draw: "绘制",
          stats: "记录帧统计",
          reset: "重置帧统计",
          collapse: "折叠",
          expand: "展开",
          grid: "网格",
        }
      : {
          play: "Play",
          stop: "Stop",
          undo: "Undo",
          redo: "Redo",
          zoomIn: "Zoom in",
          zoomOut: "Zoom out",
          auto: "Automation",
          follow: "Follow",
          draw: "Draw",
          stats: "Capture frame stats",
          reset: "Reset frame stats",
          collapse: "Collapse",
          expand: "Expand",
          grid: "Grid",
        }

  const capture = useCallback(() => {
    if (!renderer?.getDebugFrameOverlayStats) throw new Error("Frame statistics are unavailable")
    const state = useProjectState.getState()
    process.stdout.write(
      `${JSON.stringify({ event: "lane-frame-stats", stress, locale, appearance, editableTracks: state.document.tracks.filter(track => track.kind === "audio" || track.kind === "midi").length, totalClips: state.document.tracks.reduce((sum, track) => sum + track.clips.length, 0), projectedMountedCards: mounted, viewport: scene.viewport, native: renderer.getDebugFrameOverlayStats() })}\n`
    )
  }, [renderer, mounted, scene.viewport])
  useLayoutEffect(() => {
    if (!renderer?.setDebugFrameOverlay) throw new Error("Native frame overlay is unavailable")
    renderer.setDebugFrameOverlay("full")
  }, [renderer])
  useLayoutEffect(() => {
    if (announced.current || backend.phase !== "ready" || scene.viewport.width <= 0) return
    const clip = useProjectState
      .getState()
      .document.tracks.flatMap(track => track.clips)
      .find(clip => clip.kind === "audio")
    if (!clip || clip.kind !== "audio") throw new Error("Verification source is missing")
    const peaks = readProjectPeaks(clip.samplePath, 1, 1.25, 32, clip.sourceOffsetBars ?? 0)
    let magnitude = 0
    for (const peak of peaks) magnitude = Math.max(magnitude, Math.abs(peak))
    if (!(magnitude > 0)) throw new Error("Native waveform reader returned no source signal")
    announced.current = true
    process.stdout.write(
      `${JSON.stringify({ event: "lane-ready", stress, locale, appearance, totalClips: clips, nativePeakSamples: peaks.length, nativePeakMagnitude: magnitude, backend: backend.phase })}\n`
    )
  }, [backend.phase, clips, scene.viewport.width])

  return (
    <div
      style={sx({
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        backgroundColor: theme.colors.arrangementSurfaceAlt,
        color: theme.colors.foreground,
      })}
    >
      <ScrollArea
        orientation="horizontal"
        fill
        height={TRACK_TITLE_HEIGHT}
        role="toolbar"
        aria-label="Lane verification controls"
      >
        <div
          style={sx({
            display: "flex",
            gap: theme.control["--spacing-control-gap"],
            alignItems: "center",
            height: TRACK_TITLE_HEIGHT,
            paddingLeft: theme.control["--spacing-control-gap"],
            paddingRight: theme.control["--spacing-control-gap"],
          })}
        >
          <Button
            iconOnly
            aria-label={ui.play}
            active={playing}
            onClick={() => projectActions.togglePlay()}
          >
            <Icon name="Play" filled />
          </Button>
          <Button iconOnly aria-label={ui.stop} onClick={() => projectActions.stop()}>
            <Icon name="Square" filled />
          </Button>
          <Button iconOnly aria-label={ui.undo} onClick={() => projectActions.undo()}>
            <Icon name="Undo2" />
          </Button>
          <Button iconOnly aria-label={ui.redo} onClick={() => projectActions.redo()}>
            <Icon name="Redo2" />
          </Button>
          <Button iconOnly aria-label={ui.zoomOut} onClick={() => runtime.zoom(-1)}>
            <Icon name="ZoomOut" />
          </Button>
          <Button iconOnly aria-label={ui.zoomIn} onClick={() => runtime.zoom(1)}>
            <Icon name="ZoomIn" />
          </Button>
          <Button
            active={automation}
            onClick={() => projectActions.setMode("automationMode", !automation)}
          >
            {ui.auto}
          </Button>
          <Button active={follow} onClick={() => projectActions.setFollow(!follow)}>
            {ui.follow}
          </Button>
          <Button
            onClick={() =>
              projectActions.setMode("drawMode", !useProjectState.getState().workspace.drawMode)
            }
          >
            {ui.draw}
          </Button>
          <Button onClick={capture}>{ui.stats}</Button>
          <Button onClick={() => renderer?.resetDebugFrameOverlayStats?.()}>{ui.reset}</Button>
          <text
            style={sx({
              fontSize: theme.control["--text-control-track"],
              color: theme.colors.mutedForeground,
            })}
          >{`${clips} clips · ${backend.phase} · ${ui.grid} ${scene.gridPlan.label}`}</text>
        </div>
      </ScrollArea>
      <div
        role="application"
        aria-label={labelsByLocale[locale]["arrangement.timelineEditor"]}
        onLayout={event => {
          if (event.width !== undefined && event.height !== undefined)
            runtime.measure(event.width, event.height, event.x ?? 0)
        }}
        onScroll={runtime.wheel}
        style={sx({
          position: "relative",
          flexGrow: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
          backgroundColor: theme.colors.arrangementSurface,
        })}
      >
        {rows.map(row => (
          <div
            key={row.track.id}
            style={sx({
              position: "absolute",
              left: 0,
              top: row.clipTop,
              width: scene.viewport.width + CONTROLS_WIDTH,
              height: row.clipBottom - row.clipTop,
              overflow: "hidden",
              borderBottomWidth: 1,
              borderColor: theme.colors.arrangementLine,
            })}
          >
            <div
              style={sx({
                position: "absolute",
                left: 0,
                top: row.top - row.clipTop,
                width: scene.viewport.width,
                height: row.height,
              })}
            >
              <LaneRow
                row={row}
                scene={scene}
                viewport={scene.viewport}
                controller={runtime.lane}
                readPeaks={readProjectPeaks}
                labels={labelsByLocale[locale]}
              />
            </div>
            <div
              style={sx({
                position: "absolute",
                left: scene.viewport.width,
                top: 0,
                width: CONTROLS_WIDTH,
                height: row.clipBottom - row.clipTop,
                backgroundColor: theme.colors.arrangementSurfaceAlt,
                paddingLeft: theme.control["--spacing-control-gap"],
                display: "flex",
                alignItems: "start",
                gap: theme.control["--spacing-control-gap"],
              })}
            >
              <Button
                iconOnly
                aria-label={`${row.track.collapsed ? ui.expand : ui.collapse} ${row.track.name}`}
                onClick={() =>
                  projectActions.updateTrack(row.track.id, { collapsed: !row.track.collapsed })
                }
              >
                <Icon name={row.track.collapsed ? "ChevronRight" : "ChevronDown"} />
              </Button>
              <Button
                style={sx({
                  width: theme.project.identityWidth,
                  backgroundColor: resolveContentColor(row.track.color, theme.colors),
                })}
                onClick={() => projectActions.selectTracks([row.track.id], "header")}
              >
                {row.track.name}
              </Button>
              <text
                style={sx({
                  fontSize: theme.control["--text-control-track"],
                  color: theme.colors.mutedForeground,
                })}
              >{`${row.track.kind} · ${row.track.clips.length}`}</text>
            </div>
          </div>
        ))}
        <TransportOverlay runtime={runtime} scene={scene} />
      </div>
      <text
        testId="lane-status"
        role="status"
        style={sx({
          height: TRACK_TITLE_HEIGHT,
          fontSize: theme.control["--text-control-track"],
          color: theme.colors.mutedForeground,
          whiteSpace: "nowrap",
          overflow: "hidden",
        })}
      >{`${mounted}/${clips} projected cards · ${chosen ? `${chosen.label ?? chosen.kind} start=${chosen.startBar.toFixed(4)} length=${chosen.lengthBars.toFixed(4)}` : "No Clip selected"} · editorRequest=${editorRequest} · ${backend.error ?? "ready"}`}</text>
    </div>
  )
}

const root = render(
  <WindowKeyboardProvider value={runtime.keyboard}>
    <NativeFrames runtime={runtime}>
      <ThemeProvider defaultAppearance={appearance}>
        <LaneDemo runtime={runtime} />
      </ThemeProvider>
    </NativeFrames>
  </WindowKeyboardProvider>,
  {
    title: `zoeydaw lane ${stress ? "200x50" : "verification"} ${appearance} ${locale}`,
    width: 1280,
    height: 800,
    ...runtime.keyboard.rootHandlers,
  }
)
const lifecycle = { disposed: false }
function dispose() {
  if (lifecycle.disposed) return
  lifecycle.disposed = true
  root.unmount()
  runtime.dispose()
  media.dispose()
}
import.meta.hot?.dispose(dispose)
process.once("SIGTERM", () => {
  dispose()
  process.exit(0)
})
process.once("SIGINT", () => {
  dispose()
  process.exit(0)
})
