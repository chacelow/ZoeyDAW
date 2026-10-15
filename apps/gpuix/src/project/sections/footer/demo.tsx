import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { PublicInstance } from "@gpuix/react"
import { render, useGpuix } from "@gpuix/react"
import { nativeCursorLock } from "@/platform/cursor"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { Button, ControlEnvironmentProvider } from "@/ui/controls"
import { Group, Panel, PanelDivider, PanelEnvironmentProvider } from "@/ui/panels"
import { createWindowPlatform } from "@/platform/window"
import { AnimationFrameProvider, createAnimationFrameSource } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { createVerificationKeyboard } from "./verification/keyboard"
import type { VerificationKeyboardOwner } from "./verification/keyboard"
import { projectActions, startProjectRuntime, useProjectState } from "../../adapters"
import { createDevice, DEVICE_KINDS } from "../../model/devices"
import { BrowserPanel } from "../browser"
import { englishBrowserLabels, chineseBrowserLabels } from "../browser/demo-labels"
import { TransportBar } from "../transport"
import { englishTransportLabels, chineseTransportLabels } from "../transport/demo-labels"
import { StatusStrip } from "../status"
import { englishStatusLabels, chineseStatusLabels } from "../status/demo-labels"
import { FooterPanel } from "."
import { englishFooterLabels, chineseFooterLabels } from "./demo-labels"
import type { ControlInfo } from "@/ui/controls"
import type { FooterView } from "."
import type { PanelImperativeHandle } from "@/ui/panels"

const chinese = process.env.B2_LANGUAGE === "zh"
const appearance = process.env.B2_APPEARANCE === "light" ? "light" : "dark"
const searchCommand: { current: (() => boolean) | null } = { current: null }
const windowKeyboard = createWindowKeyboard()
windowKeyboard.subscribe("keyDown", event => {
  if (
    (event.modifiers?.cmd || event.modifiers?.ctrl) &&
    event.key === "f" &&
    searchCommand.current?.()
  )
    event.preventDefault()
})

function NativeDiagnostics() {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const session = useProjectState(state => state.session)
  const name = useProjectState(state => state.document.name)
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: theme.control["--spacing-control-track-gap"],
        padding: theme.control["--spacing-control-track-gap"],
        minHeight: 0,
        flexGrow: 1,
      }}
    >
      <text>{name}</text>
      <text
        role="status"
        aria-label="Native backend state"
      >{`Backend ${session.backend.phase} · ${session.playing ? "playing" : "stopped"} · ${session.position.bar}.${session.position.beat}.${Math.floor(session.position.sixteenth)}`}</text>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: theme.control["--spacing-control-track-gap"],
        }}
      >
        <Button label="Undo" onClick={projectActions.undo} disabled={!session.canUndo}>
          Undo
        </Button>
        <Button label="Redo" onClick={projectActions.redo} disabled={!session.canRedo}>
          Redo
        </Button>
        <Button
          label="Capture frame statistics"
          onClick={() =>
            process.stdout.write(
              `B2_FRAME_STATS ${JSON.stringify(renderer?.getDebugFrameOverlayStats?.())}\n`
            )
          }
        >
          Frame stats
        </Button>
      </div>
      <text style={{ color: theme.colors.mutedForeground }}>
        Native backend; no device DSP or metronome audio
      </text>
    </div>
  )
}

function NativePanels() {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const { windowPlatform, frameSource } = useMemo(() => {
    if (!renderer) throw new Error("Native verification requires its renderer")
    return {
      windowPlatform: createWindowPlatform(renderer),
      frameSource: createAnimationFrameSource(renderer),
    }
  }, [renderer])
  const [view, setView] = useState<FooterView>("devices")
  const [collapsed, setCollapsed] = useState(false)
  const [info, setInfo] = useState<ControlInfo | null>(null)
  const browserHandle = useRef<PanelImperativeHandle | null>(null)
  const keyboardOwner = useRef<VerificationKeyboardOwner | null>(null)
  const focusSurface = useRef<PublicInstance | null>(null)
  const clipHandle = useRef<PanelImperativeHandle | null>(null)
  useLayoutEffect(() => {
    const owner = createVerificationKeyboard({
      windowKeyboard,
      metrics: theme.project,
      size: { containerWidth: 1280, bodyHeight: 760, timelineLeft: 0 },
      subscribeWindowActive: windowPlatform.subscribeApplicationActive,
      blurControl: () => {
        if (focusSurface.current) renderer?.focusElement?.(focusSurface.current.id)
      },
    })
    keyboardOwner.current = owner
    return () => {
      keyboardOwner.current = null
      owner.dispose()
    }
  }, [renderer, theme.project, windowPlatform])
  useEffect(() => {
    projectActions.setProject({ name: chinese ? "未命名项目" : "Untitled project" })
    if (process.env.B2_BPM) projectActions.setBpm(Number(process.env.B2_BPM))
    projectActions.addTrack("audio")
    const track = useProjectState.getState().document.tracks.find(item => item.kind === "audio")
    if (track) {
      projectActions.updateTrack(track.id, {
        name: chinese ? "原生音频轨道" : "Native audio track",
        devices: DEVICE_KINDS.map(createDevice),
      })
      projectActions.selectTracks([track.id], "header")
    }
    return startProjectRuntime()
  }, [])
  function changeView(next: FooterView) {
    if (next === "clip" && view === "clip") clipHandle.current?.expand()
    setView(next)
    setCollapsed(false)
  }
  function changeCollapsed(next: boolean) {
    if (view === "clip") {
      if (next) clipHandle.current?.collapse()
      else clipHandle.current?.expand()
    }
    setCollapsed(next)
  }
  const footerLabels = chinese ? chineseFooterLabels : englishFooterLabels
  const footer = (
    <FooterPanel
      labels={footerLabels}
      view={view}
      collapsed={collapsed}
      onViewChange={changeView}
      onCollapsedChange={changeCollapsed}
      subscribeWindowActive={windowPlatform.subscribeApplicationActive}
      reducedMotion={false}
      renderClipEditor={() => {
        throw new Error(
          "Standalone verification contains no selected Clip; the application supplies the real editor"
        )
      }}
    />
  )
  return (
    <WindowKeyboardProvider value={windowKeyboard}>
      <AnimationFrameProvider source={frameSource}>
        <ControlEnvironmentProvider value={{ setInfo, cursorLock: nativeCursorLock }}>
          <PanelEnvironmentProvider
            environment={{ subscribeWindowActive: windowPlatform.subscribeApplicationActive }}
          >
            <div
              ref={focusSurface}
              tabIndex={-1}
              role="group"
              aria-label="Native verification workspace"
              style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                height: "100%",
                minHeight: 0,
                backgroundColor: theme.colors.muted,
                color: theme.colors.foreground,
                fontSize: theme.control["--text-control-track"],
              }}
            >
              <TransportBar
                labels={chinese ? chineseTransportLabels : englishTransportLabels}
                reducedMotion={false}
                onBack={() => projectActions.stop()}
                onDrawModeChange={enabled => {
                  if (!keyboardOwner.current) throw new Error("Timeline keyboard is not mounted")
                  keyboardOwner.current.timeline.keyboard.latchDraw(enabled)
                }}
                onToggleBrowser={() => {
                  const handle = browserHandle.current
                  if (handle?.isCollapsed()) handle.expand()
                  else handle?.collapse()
                }}
              />
              <Group orientation="horizontal" style={{ flexGrow: 1, minHeight: 0 }}>
                <Panel
                  panelRef={browserHandle}
                  defaultSize="25%"
                  minSize={
                    theme.project.browserNavigationWidth +
                    theme.project.browserResultsWidth +
                    theme.project.panelGap
                  }
                  collapsible
                  collapsedSize={0}
                >
                  <BrowserPanel
                    browserRef={node => {
                      searchCommand.current = node
                        ? () => {
                            if (browserHandle.current?.isCollapsed()) return false
                            node.focusSearch()
                            return true
                          }
                        : null
                    }}
                    labels={chinese ? chineseBrowserLabels : englishBrowserLabels}
                  />
                </Panel>
                <PanelDivider orientation="vertical" />
                <Panel>
                  {view === "clip" ? (
                    <Group orientation="vertical" style={{ height: "100%", width: "100%" }}>
                      <Panel defaultSize="60%" minSize="20%">
                        <NativeDiagnostics />
                      </Panel>
                      <PanelDivider
                        orientation="horizontal"
                        aria-label="Resize Clip Edit"
                        style={{
                          backgroundColor: theme.colors.muted,
                          borderTopWidth: 1,
                          borderColor: theme.colors.border,
                        }}
                      />
                      <Panel
                        panelRef={clipHandle}
                        defaultSize={collapsed ? 0 : "40%"}
                        minSize="20%"
                        collapsible
                        collapsedSize={0}
                        onResize={size => setCollapsed(size.inPixels === 0)}
                      >
                        {footer}
                      </Panel>
                    </Group>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        height: "100%",
                        minHeight: 0,
                      }}
                    >
                      <NativeDiagnostics />
                      {footer}
                    </div>
                  )}
                </Panel>
              </Group>
              <StatusStrip
                labels={chinese ? chineseStatusLabels : englishStatusLabels}
                footerCollapsed={collapsed}
                view={view}
                onToggleFooter={() => changeCollapsed(!collapsed)}
                onViewChange={changeView}
                info={info}
                warnings={[]}
              />
            </div>
          </PanelEnvironmentProvider>
        </ControlEnvironmentProvider>
      </AnimationFrameProvider>
    </WindowKeyboardProvider>
  )
}

render(
  <ThemeProvider defaultAppearance={appearance}>
    <NativePanels />
  </ThemeProvider>,
  {
    title: `zoeydaw B2 panels ${appearance} ${chinese ? "zh" : "en"}`,
    width: 1280,
    height: 760,
    ...windowKeyboard.rootHandlers,
  }
)
process.stdout.write("B2 panels mounted\n")
