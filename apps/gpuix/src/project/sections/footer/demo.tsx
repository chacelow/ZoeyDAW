import { useEffect, useRef, useState } from "react"
import { render } from "@gpuix/react"
import { cursorHide, cursorPosition, cursorRestore } from "@zoeydaw/native"
import { ThemeProvider, useTheme } from "../../../shared/theme/ThemeProvider"
import { Button, ControlEnvironmentProvider } from "../../../ui/controls"
import { Group, Panel, PanelDivider, PanelEnvironmentProvider } from "../../../ui/panels"
import { subscribeApplicationActive } from "../../../platform/window"
import { projectActions, startProjectRuntime, useProjectState } from "../../adapters"
import { createDevice, DEVICE_KINDS } from "../../model/devices"
import { BrowserPanel } from "../browser"
import { englishBrowserLabels, chineseBrowserLabels } from "../browser/demo-labels"
import { TransportBar, handleTransportKeyDown } from "../transport"
import { englishTransportLabels, chineseTransportLabels } from "../transport/demo-labels"
import { StatusStrip } from "../status"
import { englishStatusLabels, chineseStatusLabels } from "../status/demo-labels"
import { FooterPanel } from "."
import { englishFooterLabels, chineseFooterLabels } from "./demo-labels"
import type { BrowserPanelHandle } from "../browser"
import type { ControlInfo, CursorLockPort } from "../../../ui/controls"
import type { FooterView } from "."
import type { PanelImperativeHandle } from "../../../ui/panels"

const cursorLock: CursorLockPort = {
  capture: cursorPosition,
  hide: () => {
    cursorHide()
  },
  restore: point => {
    cursorRestore(point)
  },
}
const chinese = process.env.B2_LANGUAGE === "zh"
const appearance = process.env.B2_APPEARANCE === "light" ? "light" : "dark"
const searchHandle: { current: BrowserPanelHandle | null } = { current: null }

function NativePanels() {
  const theme = useTheme()
  const [view, setView] = useState<FooterView>("devices")
  const [collapsed, setCollapsed] = useState(false)
  const [info, setInfo] = useState<ControlInfo | null>(null)
  const browserHandle = useRef<PanelImperativeHandle | null>(null)
  const browserRef = useRef<BrowserPanelHandle | null>(null)
  searchHandle.current = browserRef.current
  const session = useProjectState(state => state.session)
  const document_ = useProjectState(state => state.document)
  useEffect(() => {
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
    setView(next)
    setCollapsed(false)
  }
  const footerLabels = chinese ? chineseFooterLabels : englishFooterLabels
  return (
    <ControlEnvironmentProvider value={{ setInfo, cursorLock }}>
      <PanelEnvironmentProvider environment={{ subscribeWindowActive: subscribeApplicationActive }}>
        <div
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
            onBack={() => projectActions.stop()}
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
                  browserRef.current = node
                  searchHandle.current = node
                }}
                labels={chinese ? chineseBrowserLabels : englishBrowserLabels}
              />
            </Panel>
            <PanelDivider orientation="vertical" />
            <Panel>
              <div
                style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
              >
                <div
                  style={{
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: theme.control["--spacing-control-track-gap"],
                    padding: theme.control["--spacing-control-track-gap"],
                  }}
                >
                  <text>{document_.name}</text>
                  <text
                    role="status"
                    aria-label="Native backend state"
                  >{`Backend ${session.backend.phase} · ${session.playing ? "playing" : "stopped"} · ${session.position.bar}.${session.position.beat}.${Math.floor(session.position.sixteenth)}`}</text>
                  <Button label="Undo" onClick={projectActions.undo} disabled={!session.canUndo}>
                    Undo
                  </Button>
                  <Button label="Redo" onClick={projectActions.redo} disabled={!session.canRedo}>
                    Redo
                  </Button>
                  <Button label="Native warning" onClick={() => setInfo(null)}>
                    Native backend, no device DSP or metronome audio
                  </Button>
                </div>
                <FooterPanel
                  labels={footerLabels}
                  view={view}
                  collapsed={collapsed}
                  onViewChange={changeView}
                  onCollapsedChange={setCollapsed}
                  subscribeWindowActive={subscribeApplicationActive}
                  renderClipEditor={({ close }) => (
                    <Button label={footerLabels.toggle} onClick={close}>
                      {footerLabels.toggle}
                    </Button>
                  )}
                />
              </div>
            </Panel>
          </Group>
          <StatusStrip
            labels={chinese ? chineseStatusLabels : englishStatusLabels}
            footerCollapsed={collapsed}
            view={view}
            onToggleFooter={() => setCollapsed(value => !value)}
            onViewChange={changeView}
            info={info}
            warnings={[]}
          />
        </div>
      </PanelEnvironmentProvider>
    </ControlEnvironmentProvider>
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
    onKeyDown: event => {
      if ((event.modifiers?.cmd || event.modifiers?.ctrl) && event.key === "f") {
        event.preventDefault()
        searchHandle.current?.focusSearch()
        return
      }
      handleTransportKeyDown(event)
    },
  }
)
process.stdout.write("B2 panels mounted\n")
