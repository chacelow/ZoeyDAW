/**
Manual verification window for the Clip editor: `bun --hot src/app/verification/clip-edit/demo/index.tsx`
from apps/gpuix. CLIP_EDIT_THEME=light, CLIP_EDIT_LOCALE=zh. It acquires a real project runtime, so
the waveform comes from the native engine's peak reader for a generated WAV file.
*/
import { useEffect, useMemo, useRef, useState } from "react"
import { initializeVerificationProject } from "../../project-creation"
import { render, useGpuix } from "@gpuix/react"
import { createNativeClipboard } from "@/platform/clipboard"
import { nativeCursorLock } from "@/platform/cursor"
import { AnimationFrameProvider, createAnimationFrameSource } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { createWindowPlatform, LAUNCH_FOCUS } from "@/platform/window"
import {
  projectActions,
  readProjectPeaks,
  startProjectRuntime,
  useProjectState,
} from "@/project/adapters"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Button, ControlEnvironmentProvider } from "@/ui/controls"
import { ClipEditor } from "@/project/sections/clip-edit"
import { createVerificationMedia } from "./media"
import { clipEditorLabels as demoLabels } from "@/app/locales/sections/clip-edit"
import { seedClipEditProject } from "./project"
import type { ClipEditorEnvironment } from "@/project/sections/clip-edit/environment"

const locale = process.env.CLIP_EDIT_LOCALE === "zh" ? "zh" : "en"
const appearance = process.env.CLIP_EDIT_THEME === "light" ? "light" : "dark"
const releaseCreation = initializeVerificationProject(
  "clip-editor-demo",
  locale === "zh" ? "zh-CN" : "en-US"
)
const media = createVerificationMedia()
const seeded = seedClipEditProject(
  media.uri,
  process.env.CLIP_EDIT_STRESS === "1" ? "dense" : "normal"
)
const release = startProjectRuntime()
const keyboard = createWindowKeyboard()
const clipboard = createNativeClipboard()

/**
Stands in for the app composition root: the timeline keyboard owns Space and B, and classifies a
keystroke that bubbled through the editor by its id.
*/
function useDemoKeyboard() {
  const regionKey = useRef<number | undefined>(undefined)
  const held = useRef<{ original: boolean; used: boolean } | null>(null)
  useEffect(() => {
    const down = keyboard.subscribe("keyDown", event => {
      const fromEditor = event.keystrokeId !== undefined && event.keystrokeId === regionKey.current
      if (event.key === "space" && !event.isHeld) {
        event.preventDefault()
        projectActions.togglePlay()
        return
      }
      if (
        event.key === "b" &&
        !event.modifiers?.cmd &&
        !event.modifiers?.ctrl &&
        !event.isHeld &&
        !held.current
      ) {
        const original = useProjectState.getState().workspace.drawMode
        held.current = { original, used: false }
        projectActions.setDrawModeOverride(!original)
        return
      }
      if (!fromEditor && event.key === "z" && (event.modifiers?.cmd || event.modifiers?.ctrl))
        (event.modifiers.shift ? projectActions.redo : projectActions.undo)()
    })
    const up = keyboard.subscribe("keyUp", event => {
      if (event.key !== "b" || !held.current) return
      const previous = held.current
      held.current = null
      if (!previous.used) projectActions.setMode("drawMode", !previous.original)
      projectActions.setDrawModeOverride(null)
    })
    return () => {
      down()
      up()
    }
  }, [])
  return useMemo(
    () => ({
      onRegionKey: (id: number | undefined) => {
        regionKey.current = id
      },
      drawMode: {
        markGesture: () => {
          if (held.current) held.current.used = true
        },
        latch: (enabled: boolean) => {
          held.current = null
          projectActions.setDrawModeOverride(null)
          projectActions.setMode("drawMode", enabled)
        },
      },
    }),
    []
  )
}

function Demo() {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const keys = useDemoKeyboard()
  const subscribeWindowActive = useMemo(() => {
    if (!renderer) throw new Error("Native renderer is unavailable")
    return createWindowPlatform(renderer).subscribeApplicationActive
  }, [renderer])
  const environment = useMemo<ClipEditorEnvironment>(
    () => ({ clipboard, subscribeWindowActive, ...keys }),
    [subscribeWindowActive, keys]
  )
  const [clipId, setClipId] = useState(seeded.midi)
  const tracks = useProjectState(state => state.document.tracks)
  const playing = useProjectState(state => state.session.playing)
  const drawMode = useProjectState(
    state => state.session.drawModeOverride ?? state.workspace.drawMode
  )
  const canUndo = useProjectState(state => state.session.canUndo)
  const backend = useProjectState(state => state.session.backend)
  const track = tracks.find(item => item.clips.some(clip => clip.id === clipId))
  const clip = track?.clips.find(item => item.id === clipId)
  const fontSize = theme.control["--text-control-track"]
  const gap = theme.control["--spacing-control-gap"]
  return (
    <div
      style={sx({
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: theme.colors.background,
      })}
    >
      <div
        style={sx({
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap,
          padding: theme.control["--spacing-control-track-gap"],
        })}
      >
        {(["midi", "audio", "pattern"] as const).map(kind => (
          <Button
            key={kind}
            label={`Show ${kind}`}
            active={clipId === seeded[kind]}
            onActiveChange={() => setClipId(seeded[kind])}
          >
            {demoLabels[locale].kind[kind]}
          </Button>
        ))}
        <Button
          label="Frame statistics"
          onClick={() => {
            console.log("CLIP_EDIT_FRAMES", JSON.stringify(renderer?.getDebugFrameOverlayStats?.()))
          }}
        >
          Stats
        </Button>
        <Button
          label="Reset frame statistics"
          onClick={() => renderer?.resetDebugFrameOverlayStats?.()}
        >
          Reset
        </Button>
        <text
          testId="demo-status"
          role="status"
          style={{ color: theme.colors.mutedForeground, fontSize }}
        >
          {`playing=${playing} draw=${drawMode} undo=${canUndo} engine=${backend.phase}${backend.error ? ` ${backend.error}` : ""}`}
        </text>
      </div>
      <div style={sx({ flexGrow: 1, minHeight: 0, display: "flex" })}>
        {clip && track ? (
          <ClipEditor
            clipId={clip.id}
            trackId={track.id}
            close={() => setClipId(seeded.midi)}
            labels={demoLabels[locale]}
            readPeaks={readProjectPeaks}
            environment={environment}
          />
        ) : null}
      </div>
    </div>
  )
}

function NativeRoot() {
  const { renderer } = useGpuix()
  const source = useMemo(() => {
    if (!renderer) throw new Error("Native renderer is unavailable")
    return createAnimationFrameSource(renderer)
  }, [renderer])
  return (
    <AnimationFrameProvider source={source}>
      <ControlEnvironmentProvider value={{ cursorLock: nativeCursorLock }}>
        <Demo />
      </ControlEnvironmentProvider>
    </AnimationFrameProvider>
  )
}

const root = render(
  <WindowKeyboardProvider value={keyboard}>
    <ThemeProvider defaultAppearance={appearance}>
      <NativeRoot />
    </ThemeProvider>
  </WindowKeyboardProvider>,
  {
    title: `zoeydaw clip editor ${appearance} ${locale}`,
    width: 1100,
    height: 420,
    ...keyboard.rootHandlers,
    ...LAUNCH_FOCUS,
  }
)
const lifecycle = { disposed: false }
function dispose() {
  if (lifecycle.disposed) return
  lifecycle.disposed = true
  root.unmount()
  release()
  media.dispose()
  releaseCreation()
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
