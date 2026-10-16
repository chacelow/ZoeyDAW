import { useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import type { PublicInstance } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import {
  Button,
  ControlGroup,
  RadioGroup,
  RadioGroupItem,
  ToggleGroup,
  ToggleGroupItem,
  MotionTabs,
  ListRow,
  ScrollArea,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Loading,
  LoadErrorScreen,
  Progress,
  DragPreviewArea,
  toast,
  toastLoading,
} from "@/ui/controls"
import { PanelShell } from "@/ui/panels"
import { Icon } from "@/ui/controls/Icon"

export function GalleryForms({
  locale,
  onSettings,
}: {
  readonly locale: "en" | "zh"
  readonly onSettings: () => void
}) {
  const theme = useTheme()
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en)
  const [radio, setRadio] = useState("a")
  const [tool, setTool] = useState("")
  return (
    <>
      <RadioGroup
        value={radio}
        onValueChange={setRadio}
        orientation="horizontal"
        aria-label={t("Radio choices", "单选项")}
      >
        <RadioGroupItem value="a">{t("First", "第一")}</RadioGroupItem>
        <RadioGroupItem value="b">{t("Second", "第二")}</RadioGroupItem>
        <RadioGroupItem value="off" disabled>
          {t("Unavailable", "不可用")}
        </RadioGroupItem>
      </RadioGroup>
      <ToggleGroup
        type="single"
        value={tool}
        onValueChange={setTool}
        aria-label={t("Tools", "工具")}
      >
        <ToggleGroupItem value="draw">{t("Draw", "绘制")}</ToggleGroupItem>
        <ToggleGroupItem value="snap">{t("Snap", "吸附")}</ToggleGroupItem>
        <ToggleGroupItem value="off" disabled>
          {t("Unavailable", "不可用")}
        </ToggleGroupItem>
      </ToggleGroup>
      <MotionTabs
        reducedMotion
        tabWidth={theme.project.identityWidth}
        options={[
          {
            key: "clips",
            label: t("Clips", "片段"),
            content: <text>{t("Clip content", "片段内容")}</text>,
          },
          {
            key: "devices",
            label: t("Devices", "设备"),
            content: <text>{t("Device content", "设备内容")}</text>,
          },
          { key: "off", label: t("Unavailable", "不可用"), disabled: true },
        ]}
      />
      <Button testId="gallery-open-settings" onClick={onSettings}>
        {t("Open settings", "打开设置")}
      </Button>
    </>
  )
}

export function GalleryLists({ locale }: { readonly locale: "en" | "zh" }) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en)
  const [selected, setSelected] = useState(0)
  const rows = useRef(new Map<number, PublicInstance>()).current
  return (
    <>
      <div role="listbox" aria-label={t("List row choices", "列表行选项")}>
        {[
          t("First resource", "第一项资源"),
          t("Second resource", "第二项资源"),
          t("Unavailable resource", "不可用资源"),
        ].map((label, index) => (
          <ListRow
            key={index}
            testId={`gallery-list-row-${index}`}
            ref={node => {
              if (node) rows.set(index, node)
              else rows.delete(index)
            }}
            label={label}
            selected={selected === index}
            disabled={index === 2}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={event => {
              if (event.key !== "up" && event.key !== "down") return
              event.preventDefault()
              event.stopPropagation()
              const next = index === 0 ? 1 : 0
              setSelected(next)
              const row = rows.get(next)
              if (row) renderer?.focusElement?.(row.id)
            }}
          />
        ))}
      </div>
      <ScrollArea
        testId="gallery-scroll"
        aria-label={t("Native scroll region", "原生滚动区域")}
        height={theme.control["--spacing-control-track"] * 6}
      >
        <div>
          {Array.from({ length: 14 }, (_, index) => (
            <text key={index}>{`${t("Scrollable row", "可滚动行")} ${index + 1}`}</text>
          ))}
        </div>
      </ScrollArea>
    </>
  )
}

export function GalleryPanels({ locale }: { readonly locale: "en" | "zh" }) {
  const theme = useTheme()
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en)
  const [active, setActive] = useState("panel-a")
  return (
    <>
      {[
        ["panel-a", t("Panel A", "面板 A")],
        ["panel-b", t("Panel B", "面板 B")],
      ].map(([id, title]) => (
        <div key={id} style={{ height: theme.project.defaultTrackHeight }}>
          <PanelShell
            id={id}
            active={active}
            onActivate={setActive}
            testId={`gallery-${id}`}
            aria-label={title}
            activeDescription={t("Active panel", "当前活动面板")}
          >
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ControlGroup variant="toolbar">
                <Button onClick={() => setActive(id === "panel-a" ? "panel-b" : "panel-a")}>
                  {t("Activate peer", "激活另一个面板")}
                </Button>
                <Button
                  iconOnly
                  label={t("Activate this panel", "激活当前面板")}
                  active={active === id}
                  onClick={() => setActive(id)}
                  icon={<Icon name="Check" size={theme.control["--spacing-control-icon"]} />}
                />
              </ControlGroup>
              <text>
                {t(
                  "Shared shell; active changes border color only.",
                  "共享外壳，激活只改变边框颜色。"
                )}
              </text>
            </CardContent>
          </PanelShell>
        </div>
      ))}
    </>
  )
}

export function GalleryProjectCards({
  locale,
  onAction,
}: {
  readonly locale: "en" | "zh"
  readonly onAction: (action: string) => void
}) {
  const theme = useTheme()
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en)
  return (
    <div
      testId="gallery-project-section"
      role="group"
      aria-label={t("Project cards: separate content hierarchy", "工程卡片：独立内容层级")}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: theme.design.spacing.stackGap,
        width: theme.layout.gallery.cardWidth,
      }}
    >
      <CardTitle>
        {t("Project cards · separate content hierarchy", "工程卡片 · 独立内容层级")}
      </CardTitle>
      <Card
        size="project"
        testId="gallery-project-card"
        aria-label={t("Project card variant", "工程卡片变体")}
        onClick={() => onAction(t("Project card UI action", "工程卡片 UI 操作"))}
      >
        <text>{t("Project card variant", "工程卡片变体")}</text>
        <CardDescription>
          {t(
            "Shared project-card inset and hover; not a compact panel row.",
            "共享工程卡片内边距与悬停外观，不属于紧凑面板行。"
          )}
        </CardDescription>
      </Card>
    </div>
  )
}

export function GalleryFeedback({
  locale,
  level,
  onAction,
}: {
  readonly locale: "en" | "zh"
  readonly level: number
  readonly onAction: (action: string) => void
}) {
  const theme = useTheme()
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en)
  return (
    <>
      <Progress
        value={level}
        aria-label={t("Progress", "进度")}
        aria-valuetext={`${Math.round(Math.max(0, Math.min(100, level)))}%`}
      />
      <ControlGroup variant="toolbar">
        <Button onClick={() => toast.success(t("Operation completed", "操作完成"))}>
          {t("Success", "成功")}
        </Button>
        <Button onClick={() => toastLoading(t("Loading…", "加载中…"), "composition-job")}>
          {t("Loading", "加载")}
        </Button>
        <Button
          onClick={() => toast.error(t("Load failed", "加载失败"), { id: "composition-job" })}
        >
          {t("Error", "错误")}
        </Button>
      </ControlGroup>
      <Loading
        label={t("Loading native resources", "正在加载原生资源")}
        style={{ position: "relative", height: theme.transportControl["--spacing-control-track"] }}
      />
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t("No clips selected", "未选择片段")}</EmptyTitle>
          <EmptyDescription>
            {t("Select a clip to inspect it.", "选择片段查看详情。")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
      <div style={{ position: "relative", height: theme.project.defaultTrackHeight * 2 }}>
        <LoadErrorScreen
          title={t("Example load error", "加载错误示例")}
          message={t("The resource cannot be opened.", "无法打开资源。")}
          retryLabel={t("Retry", "重试")}
          onRetry={() => onAction(t("Retry requested", "已请求重试"))}
        />
      </div>
      <DragPreviewArea
        testId="gallery-drag-preview"
        data={t("Native sample", "原生示例")}
        disabledDropLabel={t("Drop unavailable", "无法放置")}
        renderPreview={data => <text>{data}</text>}
        onDragEnd={(_, result) =>
          onAction(
            result.cancelled
              ? t("Preview cancelled", "预览已取消")
              : t("Preview released", "预览已释放")
          )
        }
      >
        <text>{t("Drag to preview", "拖动预览")}</text>
      </DragPreviewArea>
    </>
  )
}
