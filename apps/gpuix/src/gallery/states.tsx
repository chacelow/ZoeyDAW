import { useRef, useState } from "react"
import type { PublicInstance } from "@gpuix/react"
import type { ReactNode } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import {
  Button,
  ControlEnvironmentProvider,
  ControlGroup,
  DragPadNumber,
  DragPadBar,
  DragPadBipolar,
  DragPadToggle,
  PanControl,
  Label,
  Input,
  ScrollArea,
  SettingsShell,
  Toaster,
} from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import type { ControlInfo, CursorLockPort } from "@/ui/controls"
import { GalleryCard } from "./GalleryCard"
import { GalleryMenus } from "./GalleryMenus"
import {
  GalleryForms,
  GalleryLists,
  GalleryPanels,
  GalleryFeedback,
  GalleryProjectCards,
} from "./GalleryExamples"

export function StateGallery({
  cursorLock,
  locale,
  toolbar,
}: {
  readonly cursorLock?: CursorLockPort
  readonly locale: "en" | "zh"
  readonly toolbar: ReactNode
}) {
  const theme = useTheme()
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en)
  const [number, setNumber] = useState(120)
  const [level, setLevel] = useState(50)
  const [pan, setPan] = useState(0)
  const [active, setActive] = useState(false)
  const [input, setInput] = useState(t("Native input", "原生输入"))
  const [info, setInfo] = useState<ControlInfo | null>(null)
  const [status, setStatus] = useState(t("Ready · UI examples only", "就绪 · 仅 UI 示例"))
  const [settings, setSettings] = useState(false)
  const [pane, setPane] = useState("general")
  const inputRef = useRef<PublicInstance | null>(null)
  const row = {
    display: "flex",
    flexDirection: "row",
    alignItems: "start",
    gap: theme.design.spacing.cardGroupGap,
  }
  return (
    <ControlEnvironmentProvider value={{ cursorLock, setInfo }}>
      <div
        testId="gallery-root"
        role="application"
        aria-label={t("Native composition gallery", "原生组合画廊")}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: theme.design.spacing.rootInset,
          gap: theme.design.spacing.stackGap,
          backgroundColor: theme.colors.background,
          color: theme.colors.foreground,
          fontSize: theme.control["--text-control-track"],
        }}
      >
        <text
          role="heading"
          aria-level={1}
          style={{ fontSize: theme.transportControl["--text-control-track"] }}
        >
          {t("Shared design · composition Gallery", "共享设计 · 组合画廊")}
        </text>
        {toolbar}
        <div style={row}>
          <div
            style={{ display: "flex", flexDirection: "column", gap: theme.design.spacing.stackGap }}
          >
            <text>{`${t("Default toolbar", "默认工具栏")} · ${theme.control["--spacing-control-track"]}`}</text>
            <ControlGroup
              testId="gallery-default-toolbar"
              label={t("Default toolbar", "默认工具栏")}
              variant="toolbar"
            >
              <Button
                testId="gallery-button"
                label={t("Activate example", "激活示例")}
                active={active}
                onActiveChange={setActive}
              >
                {t("Activate", "激活")}
              </Button>
              <Button
                testId="gallery-icon"
                iconOnly
                label={t("Default play", "默认播放按钮")}
                active={active}
                onActiveChange={setActive}
                icon={<Icon name="Play" size={theme.control["--spacing-control-icon"]} />}
              />
              <Button
                variant="outline"
                onClick={() => setStatus(t("Outline action", "轮廓按钮操作"))}
              >
                {t("Outline", "轮廓")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setStatus(t("Secondary action", "次要按钮操作"))}
              >
                {t("Secondary", "次要")}
              </Button>
              <Button variant="ghost" onClick={() => setStatus(t("Ghost action", "透明按钮操作"))}>
                {t("Ghost", "透明")}
              </Button>
              <Button variant="destructive" active={active} onActiveChange={setActive}>
                {t("Delete", "删除")}
              </Button>
              <Button variant="link" onClick={() => setStatus(t("Link action", "链接按钮操作"))}>
                {t("Link", "链接")}
              </Button>
              <Button
                highlight={false}
                onClick={() => setStatus(t("No-highlight action", "无高亮按钮操作"))}
              >
                {t("No highlight", "无高亮")}
              </Button>
              <Button disabled>{t("Unavailable", "不可用")}</Button>
            </ControlGroup>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: theme.design.spacing.stackGap }}
          >
            <text>{`${t("Transport toolbar", "走带工具栏")} · ${theme.transportControl["--spacing-control-track"]}`}</text>
            <ControlGroup
              testId="gallery-transport-toolbar"
              label={t("Transport toolbar", "走带工具栏")}
              variant="toolbar"
              size="transport"
            >
              <DragPadNumber
                testId="gallery-transport-number"
                label={t("Transport tempo", "走带速度")}
                value={number}
                onChange={setNumber}
                min={20}
                max={300}
                step={1}
                defaultValue={120}
                size="transport"
              />
              <Button
                testId="gallery-transport-icon"
                iconOnly
                size="transport"
                label={t("Transport play example", "走带播放示例")}
                active={active}
                onActiveChange={setActive}
                icon={<Icon name="Play" size={theme.transportControl["--spacing-control-icon"]} />}
              />
              <Button
                iconOnly
                size="transport"
                label={t("Transport stop example", "走带停止示例")}
                onClick={() => setActive(false)}
                icon={
                  <Icon name="Square" size={theme.transportControl["--spacing-control-icon"]} />
                }
              />
            </ControlGroup>
          </div>
        </div>
        <ScrollArea
          testId="gallery-body-scroll"
          aria-label={t("Gallery sections", "画廊分区")}
          style={{ flexGrow: 1, minHeight: 0 }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: theme.design.spacing.cardGroupGap,
            }}
          >
            <div style={row}>
              <GalleryCard
                title={t("Numeric and input", "数值与输入")}
                toggleLabel={t("Toggle numeric section", "展开或收起数值区")}
                testId="gallery-numeric-card"
              >
                <ControlGroup
                  variant="toolbar"
                  label={t("Compact numeric controls", "紧凑数值控件")}
                >
                  <DragPadNumber
                    testId="gallery-number"
                    label={t("Tempo", "速度")}
                    value={number}
                    onChange={setNumber}
                    min={20}
                    max={300}
                    step={1}
                    defaultValue={120}
                  />
                  <DragPadBar
                    testId="gallery-bar"
                    label={t("Level", "电平")}
                    value={level}
                    onChange={setLevel}
                    min={0}
                    max={100}
                    step={1}
                    defaultValue={50}
                  />
                  <DragPadBipolar
                    testId="gallery-bipolar"
                    label={t("Bipolar", "双极数值")}
                    value={pan}
                    onChange={setPan}
                    min={-1}
                    max={1}
                    step={0.01}
                    defaultValue={0}
                  />
                  <PanControl
                    testId="gallery-pan"
                    label={t("Pan", "声像")}
                    value={pan}
                    onChange={setPan}
                  />
                  <DragPadToggle
                    label={t("Mute example", "静音示例")}
                    value={active}
                    onChange={setActive}
                  />
                </ControlGroup>
                <ControlGroup variant="toolbar">
                  <DragPadNumber
                    testId="gallery-icon-free"
                    label={t("Icon-free tempo", "无图标速度")}
                    value={number}
                    onChange={setNumber}
                    min={20}
                    max={300}
                    step={1}
                    defaultValue={120}
                    hideIcon
                  />
                  <text>
                    {t("Same parameter; stable edit shells.", "同一参数，编辑外壳宽度稳定。")}
                  </text>
                </ControlGroup>
                <Label controlRef={inputRef}>{t("Input label", "输入标签")}</Label>
                <div testId="gallery-input-shell">
                  <Input
                    ref={inputRef}
                    testId="gallery-input"
                    aria-label={t("Native input", "原生输入")}
                    value={input}
                    onValueChange={setInput}
                    style={{ width: "100%" }}
                  />
                </div>
                <Input
                  aria-label={t("Invalid input example", "无效输入示例")}
                  invalid
                  value={input}
                  onValueChange={setInput}
                  style={{ width: "100%" }}
                />
                <Input
                  aria-label={t("Unavailable input", "不可用输入")}
                  disabled
                  value={t("Unavailable", "不可用")}
                  style={{ width: "100%" }}
                />
              </GalleryCard>
              <GalleryCard
                title={t("Menus and popups", "菜单与弹层")}
                toggleLabel={t("Toggle menus section", "展开或收起菜单区")}
                testId="gallery-menu-card"
              >
                <GalleryMenus
                  locale={locale}
                  value={number}
                  onChange={setNumber}
                  onAction={setStatus}
                />
              </GalleryCard>
              <GalleryCard
                title={t("Forms and navigation", "表单与导航")}
                toggleLabel={t("Toggle forms section", "展开或收起表单区")}
                testId="gallery-forms-card"
              >
                <GalleryForms locale={locale} onSettings={() => setSettings(true)} />
              </GalleryCard>
            </div>
            <div style={row}>
              <GalleryCard
                title={t("List rows and scroll area", "列表行与滚动区域")}
                toggleLabel={t("Toggle lists section", "展开或收起列表区")}
                testId="gallery-list-card"
              >
                <GalleryLists locale={locale} />
              </GalleryCard>
              <GalleryCard
                title={t("Shared panel shells", "共享面板外壳")}
                toggleLabel={t("Toggle panel section", "展开或收起面板区")}
                testId="gallery-panel-card"
              >
                <GalleryPanels locale={locale} />
              </GalleryCard>
              <GalleryCard
                title={t("Feedback · initially collapsed", "反馈 · 初始收起")}
                toggleLabel={t("Toggle feedback section", "展开或收起反馈区")}
                testId="gallery-feedback-card"
                defaultExpanded={false}
              >
                <GalleryFeedback locale={locale} level={level} onAction={setStatus} />
              </GalleryCard>
            </div>
            <GalleryProjectCards locale={locale} onAction={setStatus} />
            <SettingsShell
              open={settings}
              onOpenChange={setSettings}
              title={t("Settings composition", "设置组合")}
              description={t("UI navigation example", "UI 导航示例")}
              activeId={pane}
              onActiveChange={setPane}
              closeLabel={t("Close settings", "关闭设置")}
              navigationLabel={t("Settings sections", "设置分类")}
              items={[
                {
                  id: "general",
                  label: t("General", "通用"),
                  content: <text>{t("General settings", "通用设置")}</text>,
                },
                {
                  id: "audio",
                  label: t("Audio", "音频"),
                  content: <text>{t("Audio settings", "音频设置")}</text>,
                },
              ]}
              style={{
                width: theme.project.controlsWidth * 2,
                height: theme.project.defaultTrackHeight * 3,
              }}
            />
          </div>
        </ScrollArea>
        <text
          role="status"
          aria-label={t("Gallery status", "画廊状态")}
        >{`${t("Info", "提示")}: ${info ?? "—"} · ${status}`}</text>
        <Toaster
          dismissLabel={t("Dismiss notification", "关闭通知")}
          loadingLabel={t("Loading", "加载中")}
        />
      </div>
    </ControlEnvironmentProvider>
  )
}
