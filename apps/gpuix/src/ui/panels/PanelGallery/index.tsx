import { useRef, useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { CollapseDivider } from "../CollapseDivider"
import { Group } from "../Group"
import { Panel } from "../Panel"
import type { PanelImperativeHandle } from "../Panel"
import { PanelDivider } from "../PanelDivider"
import { PanelShell } from "../PanelShell"

type Section = "browser" | "arrangement" | "clip" | "devices"
export const GALLERY_DEVICE_HEIGHT = 160

export function PanelGallery() {
  const theme = useTheme()
  const [active, setActive] = useState<Section>("arrangement")
  const [browserWidth, setBrowserWidth] = useState(0)
  const [clipHeight, setClipHeight] = useState(0)
  const [devices, setDevices] = useState(true)
  const browser = useRef<PanelImperativeHandle | null>(null)
  const clip = useRef<PanelImperativeHandle | null>(null)
  const textStyle = { color: theme.colors.foreground, fontSize: 13 }
  const actions = [
    {
      label: "Toggle Browser",
      click: () =>
        browser.current?.isCollapsed() ? browser.current.expand() : browser.current?.collapse(),
    },
    {
      label: "Toggle Clip",
      click: () =>
        clip.current?.isCollapsed() ? clip.current.resize(160) : clip.current?.collapse(),
    },
    { label: "Toggle Device", click: () => setDevices(value => !value) },
  ]
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: theme.project.panelGap,
        backgroundColor: theme.colors.card,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: theme.project.panelGap,
          paddingBottom: theme.project.panelGap,
          flexShrink: 0,
        }}
      >
        {actions.map(action => (
          <div
            key={action.label}
            role="button"
            aria-label={action.label}
            tabIndex={0}
            onClick={action.click}
            onKeyDown={event => {
              if (event.key === "enter" || event.key === "space") action.click()
            }}
            style={{
              padding: theme.project.panelGap,
              backgroundColor: theme.colors.muted,
              borderRadius: theme.project.panelGap,
              cursor: "pointer",
            }}
          >
            <text style={textStyle}>{action.label}</text>
          </div>
        ))}
      </div>
      <Group orientation="vertical" style={{ height: 0, flexGrow: 1 }} testId="main-group">
        <Panel minSize={180} testId="main-panel">
          <Group orientation="horizontal" testId="top-group">
            <Panel
              defaultSize="25"
              minSize={190}
              maxSize="50"
              collapsible
              collapsedSize={0}
              panelRef={browser}
              onResize={size => setBrowserWidth(size.inPixels)}
              testId="browser-panel"
            >
              <PanelShell
                id="browser"
                active={active}
                onActivate={setActive}
                testId="browser-shell"
              >
                <div style={{ padding: theme.project.panelGap, flexShrink: 0 }}>
                  <text style={textStyle}>Browser</text>
                </div>
                <Group orientation="horizontal" testId="browser-columns">
                  <Panel defaultSize="32" minSize={36} testId="navigation-panel">
                    <div style={{ minWidth: 80, padding: theme.project.panelGap }}>
                      <text style={textStyle}>Places</text>
                      <text style={textStyle}>Library</text>
                      <text style={textStyle}>Samples</text>
                    </div>
                  </Panel>
                  <PanelDivider orientation="vertical" aria-label="Resize browser columns" />
                  <Panel defaultSize="68" minSize={140} testId="results-panel">
                    <div
                      style={{ width: 220, flexShrink: 0, padding: theme.project.panelGap }}
                      testId="fixed-results"
                    >
                      <text style={textStyle}>Collection / steady-width rows</text>
                      <text style={textStyle}>Drums 808</text>
                      <text style={textStyle}>Bass analogue</text>
                      <text style={textStyle}>Strings slow attack</text>
                    </div>
                  </Panel>
                </Group>
              </PanelShell>
            </Panel>
            <PanelDivider
              orientation="vertical"
              aria-label="Resize browser"
              testId="browser-divider"
            />
            <Panel defaultSize="75" minSize="30" testId="arrangement-panel">
              <PanelShell
                id="arrangement"
                active={active}
                onActivate={setActive}
                testId="arrangement-shell"
              >
                <div style={{ padding: theme.project.panelGap }}>
                  <text style={textStyle}>Arrangement — native resizable panels</text>
                </div>
                {["Drums", "Bass", "Synth", "Audio"].map((name, i) => (
                  <div
                    key={name}
                    style={{
                      height: theme.project.defaultTrackHeight,
                      flexShrink: 0,
                      borderTopWidth: theme.project.trackBorder,
                      borderColor: theme.colors.border,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: theme.project.identityWidth,
                        padding: theme.project.panelGap,
                      }}
                    >
                      <text style={textStyle}>{name}</text>
                    </div>
                    <div
                      style={{
                        height: theme.project.defaultTrackHeight / 2,
                        width: 180 + i * 30,
                        marginLeft: i * 20,
                        backgroundColor: theme.colors.editorShell,
                        borderRadius: theme.project.panelGap,
                      }}
                    />
                  </div>
                ))}
              </PanelShell>
            </Panel>
          </Group>
        </Panel>
        <PanelDivider
          orientation="horizontal"
          aria-label="Resize clip"
          testId="clip-divider"
          disabled={clipHeight === 0}
          hidden={clipHeight === 0}
        />
        <Panel
          defaultSize={0}
          minSize={120}
          maxSize="70"
          collapsible
          panelRef={clip}
          onResize={size => setClipHeight(size.inPixels)}
          testId="clip-panel"
        >
          <PanelShell id="clip" active={active} onActivate={setActive}>
            <div style={{ padding: theme.project.panelGap }}>
              <text style={textStyle}>Clip — continuous height, Device stays fixed</text>
            </div>
          </PanelShell>
        </Panel>
      </Group>
      <CollapseDivider
        expanded={devices}
        expandedSize={GALLERY_DEVICE_HEIGHT}
        onExpandedChange={setDevices}
        aria-label="Toggle device by dragging"
        testId="device-divider"
      />
      <div
        style={{
          height: devices ? GALLERY_DEVICE_HEIGHT : 0,
          width: "100%",
          flexShrink: 0,
          overflow: "hidden",
        }}
        testId="device-panel"
      >
        <PanelShell id="devices" active={active} onActivate={setActive}>
          {devices && (
            <div style={{ padding: theme.project.panelGap }}>
              <text
                style={textStyle}
              >{`Device / Affect Chain — fixed ${GALLERY_DEVICE_HEIGHT}px; drag past ${GALLERY_DEVICE_HEIGHT / 2}px to toggle`}</text>
            </div>
          )}
        </PanelShell>
      </div>
      <div style={{ paddingTop: theme.project.panelGap, flexShrink: 0 }}>
        <text
          style={textStyle}
        >{`Browser ${Math.round(browserWidth)}px · Clip ${Math.round(clipHeight)}px · Device ${devices ? GALLERY_DEVICE_HEIGHT : 0}px · Active ${active}`}</text>
      </div>
    </div>
  )
}
