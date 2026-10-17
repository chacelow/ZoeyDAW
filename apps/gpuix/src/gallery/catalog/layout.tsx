import { useMemo, useRef, useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { consumeKey } from "@/shared/keyboard"
import { createCommandRegistry, DEFAULT_KEYMAP } from "@/platform/keyboard"
import { PREFERENCE_DEFAULTS } from "@/project/defaults/preferences"
import { Button, ControlEnvironmentProvider } from "@/ui/controls"
import {
  DockLayout,
  Group,
  DividerLayer,
  Panel,
  PanelDivider,
  PanelShell,
  CollapseDivider,
  addPanel,
} from "@/ui/panels"
import type {
  DockCommand,
  DockLayoutHandle,
  DockLayoutJSON,
  DockPanelRegistry,
  PanelImperativeHandle,
} from "@/ui/panels"
import { GallerySection, GalleryVariant } from "./GallerySection"
import type { GallerySectionProps } from "./GallerySection"

export function createGalleryDockLayout(): DockLayoutJSON {
  return {
    version: 2,
    borders: {},
    hidden: [],
    activeGroup: "main",
    maximizedGroup: null,
    root: {
      kind: "split",
      id: "workspace",
      orientation: "horizontal",
      sizes: [1, 3],
      children: [
        { kind: "group", id: "browser", tabs: ["Browser"], active: "Browser" },
        {
          kind: "split",
          id: "editors",
          orientation: "vertical",
          sizes: [2, 1],
          children: [
            { kind: "group", id: "main", tabs: ["Arrangement", "Clip"], active: "Arrangement" },
            { kind: "group", id: "bottom", tabs: ["Devices", "Mixer"], active: "Devices" },
          ],
        },
      ],
    },
  }
}
export function LayoutSection({ t }: GallerySectionProps) {
  const theme = useTheme()
  const [layout, setLayout] = useState(createGalleryDockLayout)
  const ref = useRef<DockLayoutHandle>(null)
  const execute = (command: DockCommand) =>
    ref.current?.executeCommand(command) ? "handled" : "pass"
  const commands = createCommandRegistry({
    "dock.moveLeft": () => execute("moveLeft"),
    "dock.moveRight": () => execute("moveRight"),
    "dock.moveUp": () => execute("moveUp"),
    "dock.moveDown": () => execute("moveDown"),
    "dock.toggleMaximize": () => execute("toggleMaximize"),
    "dock.close": () => execute("close"),
    "dock.hide": () => execute("hide"),
    "project.save": () => "pass",
    "project.saveAs": () => "pass",
    "project.open": () => "pass",
    "transport.togglePlay": () => "pass",
    "edit.undo": () => "pass",
    "edit.redo": () => "pass",
    "grid.narrow": () => "pass",
    "grid.widen": () => "pass",
    "grid.toggleSnap": () => "pass",
    "edit.split": () => "pass",
    "edit.cancel": () => "pass",
    "transport.rewind": () => "pass",
    "computerKeyboard.toggle": () => "pass",
    "computerKeyboard.octaveDown": () => "pass",
    "computerKeyboard.octaveUp": () => "pass",
    "computerKeyboard.velocityDown": () => "pass",
    "computerKeyboard.velocityUp": () => "pass",
    "computerKeyboard.note": () => "pass",
    "arrangement.toggleAutomation": () => "pass",
    "arrangement.draw": () => "pass",
    "transport.seekLeft": () => "pass",
    "transport.seekRight": () => "pass",
    "browser.focusSearch": () => "pass",
  })
  const registry = useMemo<DockPanelRegistry>(
    () => ({
      Browser: {
        title: t("Browser", "浏览器"),
        icon: "Folder",
        minimumSize: theme.design.dock.minimumSize,
        render: () => <DemoContent title={t("Browser", "浏览器")} />,
      },
      Arrangement: {
        title: t("Arrangement", "编排"),
        icon: "LayoutList",
        minimumSize: theme.design.dock.minimumSize,
        render: () => <DemoContent title={t("Arrangement", "编排")} />,
      },
      Clip: {
        title: t("Clip", "片段"),
        icon: "Music",
        minimumSize: theme.design.dock.minimumSize,
        render: () => <DemoContent title={t("Clip", "片段")} />,
      },
      Devices: {
        title: t("Devices", "设备"),
        icon: "SlidersHorizontal",
        minimumSize: theme.design.dock.minimumSize,
        render: () => <DemoContent title={t("Devices", "设备")} />,
      },
      Mixer: {
        title: t("Mixer", "混音台"),
        icon: "AudioLines",
        minimumSize: theme.design.dock.minimumSize,
        render: () => <DemoContent title={t("Mixer", "混音台")} />,
      },
    }),
    [t, theme.design.dock.minimumSize]
  )
  return (
    <ControlEnvironmentProvider
      value={{
        inputPolicy: { ...PREFERENCE_DEFAULTS.numericInput, ...PREFERENCE_DEFAULTS.pointer },
      }}
    >
      <GallerySection id="layout" title={t("Layouts", "布局")}>
        <GalleryVariant
          label={t("Dockable workspace", "可停靠工作区")}
          testId="gallery-layouts-dock"
          block
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: theme.design.spacing.stackGap,
              flexGrow: 1,
              minWidth: 0,
            }}
          >
            <Button
              testId="gallery-dock-reset"
              onClick={() => setLayout(createGalleryDockLayout())}
            >
              {t("Reset layout", "重置布局")}
            </Button>
            <text>
              {t(
                "Drag a tab or grip to dock. Right-click tabs for actions. Panel counters survive moving.",
                "拖动标签或握柄停靠。右键标签打开操作。移动后面板计数保持。"
              )}
            </text>
            <div style={{ height: theme.design.dock.demoHeight }}>
              <DockLayout
                ref={ref}
                layout={layout}
                registry={registry}
                onLayoutChange={setLayout}
                onKeyDown={event => {
                  const command = DEFAULT_KEYMAP.resolve(event, {
                    focus: "dock",
                    computerKeyboard: false,
                    browserSearch: false,
                  })
                  if (command && commands.execute(command, event) === "handled")
                    consumeKey(event, "handled")
                }}
                testId="gallery-dock"
                labels={{
                  close: t("Close", "关闭"),
                  view: t("View", "视图"),
                  closeOthers: t("Close others", "关闭其他"),
                  splitRight: t("Split right", "向右拆分"),
                  splitDown: t("Split down", "向下拆分"),
                  maximize: t("Maximize group", "最大化面板组"),
                  restore: t("Restore group", "还原面板组"),
                  hide: t("Hide", "隐藏"),
                  more: t("Group actions", "面板组操作"),
                  showPanels: t("Show panels", "显示面板"),
                  pin: t("Pin border panel", "固定边栏面板"),
                  unpin: t("Auto-hide border panel", "自动隐藏边栏面板"),
                  dragGroup: t("Drag group", "拖动面板组"),
                  left: t("Toggle primary sidebar", "切换主侧栏"), right: t("Toggle secondary sidebar", "切换副侧栏"), bottom: t("Toggle panel", "切换面板"),
                  railOptions: t("Sidebar options", "侧栏选项"), overlayMode: t("Drawer mode", "抽屉模式"), hoverReveal: t("Hover reveal", "悬停展开"),
                }}
              />
            </div>
            {layout.hidden.map(id => (
              <Button
                key={id}
                onClick={() => setLayout(addPanel(layout, id))}
              >{`${t("Show", "显示")} ${registry[id]?.title ?? id}`}</Button>
            ))}
          </div>
        </GalleryVariant>
        <GalleryVariant
          label={t("Nested resizable panels", "嵌套可调面板")}
          testId="gallery-layouts-splits"
          block
        >
          <div
            testId="gallery-layouts-splits-host"
            style={{
              height: theme.design.dock.demoHeight + theme.design.dock.minimumSize * 2,
              flexGrow: 1,
              minWidth: 0,
            }}
          >
            <Group orientation="horizontal">
              <Panel defaultSize="30%" minSize={theme.design.dock.minimumSize}>
                <DemoContent title={t("Browser", "浏览器")} />
              </Panel>
              <PanelDivider orientation="vertical" />
              <Panel>
                <Group orientation="vertical">
                  <Panel defaultSize="65%" minSize={theme.design.dock.minimumSize}>
                    <DemoContent title={t("Arrangement", "编排")} />
                  </Panel>
                  <PanelDivider orientation="horizontal" />
                  <Panel
                    minSize={theme.design.dock.minimumSize}
                    testId="gallery-layouts-mixer-panel"
                  >
                    <DemoContent title={t("Mixer", "混音台")} />
                  </Panel>
                </Group>
              </Panel>
            </Group>
          </div>
        </GalleryVariant>
        <GalleryVariant label={t("Panel shells and collapse", "面板外框与折叠")} block>
          <CollapseExample t={t} />
        </GalleryVariant>
      </GallerySection>
    </ControlEnvironmentProvider>
  )
}
function DemoContent({ title }: { title: string }) {
  const theme = useTheme()
  const [count, setCount] = useState(0)
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: theme.design.spacing.stackGap,
        padding: theme.design.cards.controls.inset,
        flexGrow: 1,
        backgroundColor: theme.colors.background,
        color: theme.colors.foreground,
      }}
    >
      <text>{title}</text>
      <Button
        testId={`gallery-dock-counter-${title}`}
        onClick={() => setCount(value => value + 1)}
      >{`${title}: ${count}`}</Button>
    </div>
  )
}

function CollapseExample({ t }: Pick<GallerySectionProps, "t">) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(true)
  const [active, setActive] = useState("arrangement")
  const browser = useRef<PanelImperativeHandle>(null)
  return (
    <DividerLayer
      style={{
        height: theme.design.dock.demoHeight + theme.design.dock.minimumSize * 2,
        flexGrow: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Button
        onClick={() => {
          if (browser.current?.isCollapsed()) browser.current.expand()
          else browser.current?.collapse()
        }}
      >
        {t("Toggle Browser", "切换浏览器")}
      </Button>
      <div style={{ flexGrow: 1, height: 0, minHeight: 0 }}>
        <Group orientation="horizontal">
          <Panel
            panelRef={browser}
            defaultSize="25%"
            minSize={theme.design.dock.minimumSize}
            collapsible
            collapsedSize={0}
          >
            <PanelShell
              id="browser"
              active={active}
              onActivate={setActive}
              aria-label={t("Browser", "浏览器")}
              activeDescription={t("Active panel", "活动面板")}
            >
              <DemoContent title={t("Browser", "浏览器")} />
            </PanelShell>
          </Panel>
          <PanelDivider orientation="vertical" />
          <Panel>
            <PanelShell
              id="arrangement"
              active={active}
              onActivate={setActive}
              aria-label={t("Arrangement", "编排")}
              activeDescription={t("Active panel", "活动面板")}
            >
              <DemoContent title={t("Arrangement", "编排")} />
            </PanelShell>
          </Panel>
        </Group>
      </div>
      <CollapseDivider
        expanded={expanded}
        expandedSize={theme.design.dock.minimumSize}
        onExpandedChange={setExpanded}
        aria-label={t("Device panel height", "设备面板高度")}
        formatAccessiblePixels={value => `${value} ${t("pixels", "像素")}`}
      />
      {expanded ? (
        <div style={{ height: theme.design.dock.minimumSize, flexShrink: 0 }}>
          <PanelShell
            id="devices"
            active={active}
            onActivate={setActive}
            aria-label={t("Devices", "设备")}
            activeDescription={t("Active panel", "活动面板")}
          >
            <DemoContent title={t("Devices", "设备")} />
          </PanelShell>
        </div>
      ) : null}
    </DividerLayer>
  )
}
