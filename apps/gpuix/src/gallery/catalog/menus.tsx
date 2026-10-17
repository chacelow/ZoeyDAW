import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import type { FloatingAlign, FloatingSide } from "@gpuix/react/floating"
import { Icon } from "@/ui/controls/Icon"
import { GallerySection, GalleryState, GalleryVariant } from "./GallerySection"
import type { GallerySectionProps } from "./GallerySection"
import type { DropdownButtonItem } from "@/ui/controls"
import {
  Button,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuOptionGrid,
  ContextMenuOptionGridItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownButton,
  PopupButton,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  DragPadNumber,
  ToggleGroup,
  ToggleGroupItem,
} from "@/ui/controls"

export function MenusSection({ t }: GallerySectionProps) {
  const [value, onChange] = useState(120)
  const [action, onAction] = useState("")
  const [mode, setMode] = useState("beats")
  const [follow, setFollow] = useState(false)
  const [language, setLanguage] = useState("en")
  const theme = useTheme()
  const [adaptiveGrid, setAdaptiveGrid] = useState("medium")
  const [fixedGrid, setFixedGrid] = useState("1/16")
  const [clipColor, setClipColor] = useState("primary")
  const [side, setSide] = useState<FloatingSide>("right")
  const [align, setAlign] = useState<FloatingAlign>("start")
  const items = [
    { type: "heading", id: "modes", label: t("Warp mode", "变速模式") },
    { id: "beats", label: t("Beats", "节拍"), shortcut: "Ctrl+1" },
    { id: "tones", label: t("Tones\nPreserves pitch", "音调\n保留音高") },
    { type: "separator", id: "separator" },
    { id: "off", label: t("Unavailable", "不可用"), disabled: true },
  ] satisfies readonly DropdownButtonItem[]
  const sides: readonly { side: FloatingSide; label: string }[] = [
    { side: "top", label: t("Top", "上方") },
    { side: "right", label: t("Right", "右侧") },
    { side: "bottom", label: t("Bottom", "下方") },
    { side: "left", label: t("Left", "左侧") },
  ]
  const alignments: readonly { align: FloatingAlign; label: string }[] = [
    { align: "start", label: t("Start", "起始对齐") },
    { align: "center", label: t("Center", "居中对齐") },
    { align: "end", label: t("End", "末端对齐") },
  ]
  return (
    <GallerySection
      id="menus"
      title={t("Menus and popovers", "菜单与弹层")}
      description={t(
        "Compact command rows, selectable grids and anchored surfaces.",
        "紧凑命令行、可选网格与锚定浮层。"
      )}
    >
      <GalleryVariant label={t("DropdownButton · default", "下拉按钮 · 默认尺寸")}>
        <GalleryState label={t("Default", "默认")}>
          <DropdownButton
            testId="gallery-dropdown"
            label={t("Warp mode", "变速模式")}
            value={mode}
            onChange={setMode}
            items={items}
          />
        </GalleryState>
        <GalleryState label={t("Disabled", "禁用")}>
          <DropdownButton
            label={t("Warp mode", "变速模式")}
            value={mode}
            onChange={setMode}
            items={items}
            disabled
          />
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("DropdownButton · transport", "下拉按钮 · 走带尺寸")}>
        <GalleryState label={t("Default", "默认")}>
          <DropdownButton
            size="transport"
            label={t("Warp mode", "变速模式")}
            value={mode}
            onChange={setMode}
            items={items}
          />
        </GalleryState>
        <GalleryState label={t("Disabled", "禁用")}>
          <DropdownButton
            size="transport"
            label={t("Warp mode", "变速模式")}
            value={mode}
            onChange={setMode}
            items={items}
            disabled
          />
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("DropdownButton · icon", "下拉按钮 · 图标")}>
        <GalleryState label={t("Content width", "内容宽度")}>
          <DropdownButton
            icon={<Icon name="Music" />}
            matchTriggerWidth={false}
            label={t("Warp mode", "变速模式")}
            value={mode}
            onChange={setMode}
            items={items}
          />
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("DropdownButton · fill", "下拉按钮 · 填满")}>
        <div style={{ width: theme.design.menu.maxWidth }}>
          <DropdownButton
            fill
            label={t("Warp mode", "变速模式")}
            value={mode}
            onChange={setMode}
            items={items}
          />
        </div>
      </GalleryVariant>
      <GalleryVariant label={t("PopupButton · default", "弹层按钮 · 默认尺寸")}>
        <GalleryState label={t("Default", "默认")}>
          <PopupButton
            testId="gallery-popup"
            label={t("Adjust popup", "调整弹层")}
            trigger={t("Adjust", "调整")}
          >
            <PopoverHeader>
              <PopoverTitle>{t("Continuous adjustment", "连续调整")}</PopoverTitle>
            </PopoverHeader>
            <DragPadNumber
              testId="gallery-popup-number"
              label={t("Popup value", "弹层数值")}
              value={value}
              onChange={onChange}
              min={20}
              max={300}
              step={1}
            />
            <text>{t("Drag or wheel; popup stays open.", "拖动或滚轮调整，弹层保持打开。")}</text>
          </PopupButton>
        </GalleryState>
        <GalleryState label={t("Disabled", "禁用")}>
          <PopupButton disabled label={t("Adjust popup", "调整弹层")} trigger={t("Adjust", "调整")}>
            <text>{t("Unavailable", "不可用")}</text>
          </PopupButton>
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("PopupButton · transport", "弹层按钮 · 走带尺寸")}>
        <GalleryState label={t("Default", "默认")}>
          <PopupButton
            size="transport"
            label={t("Adjust popup", "调整弹层")}
            trigger={t("Adjust", "调整")}
          >
            <text>
              {t("Popup stays open while using its controls.", "操作内部控件时保持打开。")}
            </text>
            <Button onClick={() => onAction(t("Popup action", "弹层操作"))}>
              {t("Internal action", "内部操作")}
            </Button>
          </PopupButton>
        </GalleryState>
        <GalleryState label={t("Disabled", "禁用")}>
          <PopupButton
            size="transport"
            disabled
            label={t("Adjust popup", "调整弹层")}
            trigger={t("Adjust", "调整")}
          >
            <text>{t("Unavailable", "不可用")}</text>
          </PopupButton>
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("DropdownMenu · commands", "下拉菜单 · 命令")}>
        <GalleryState label={t("Default", "默认")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button testId="gallery-menu">{t("Commands", "命令")}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent aria-label={t("Commands menu", "命令菜单")}>
                <DropdownMenuItem onSelect={() => onAction(t("Duplicate selected", "已选择复制"))}>
                  {t("Duplicate", "复制")}
                </DropdownMenuItem>
                <DropdownMenuCheckboxItem checked={follow} onCheckedChange={setFollow}>
                  {t("Follow playback", "跟随播放")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>{t("Export", "导出")}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onSelect={() => onAction(t("Audio selected", "已选择音频"))}>
                      {t("Audio", "音频")}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled>
                      {t("MIDI unavailable", "MIDI 不可用")}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        </GalleryState>
        <GalleryState label={t("Disabled", "禁用")}>
          <DropdownMenu disabled>
            <DropdownMenuTrigger asChild>
              <Button disabled>{t("Commands", "命令")}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>{t("Unavailable", "不可用")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("ContextMenu · Live / OptionGrid", "上下文菜单 · Live / 选项网格")}>
        <GalleryState label={t("Default", "默认")}>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <Button testId="gallery-context-row">
                {t("Right-click context actions", "右键打开上下文菜单")}
              </Button>
            </ContextMenuTrigger>
            <ContextMenuContent style={{ width: theme.design.menu.maxWidth }}>
              <ContextMenuLabel>{t("Context actions", "上下文操作")}</ContextMenuLabel>
              <ContextMenuItem
                shortcut="Ctrl+R"
                onSelect={() => onAction(t("Rename selected", "已选择重命名"))}
              >
                {t("Rename", "重命名")}
              </ContextMenuItem>
              <ContextMenuItem
                shortcut="Ctrl+D"
                onSelect={() => onAction(t("Duplicate selected", "已选择复制"))}
              >
                {t("Duplicate", "复制")}
              </ContextMenuItem>
              <ContextMenuItem disabled shortcut="Ctrl+E">
                {t("Split unavailable", "拆分不可用")}
              </ContextMenuItem>
              <ContextMenuCheckboxItem
                checked={follow}
                onCheckedChange={setFollow}
                shortcut="Ctrl+F"
              >
                {t("Follow playback", "跟随播放")}
              </ContextMenuCheckboxItem>
              <ContextMenuSeparator />
              <ContextMenuRadioGroup value={language} onValueChange={setLanguage}>
                <ContextMenuRadioItem value="en">English</ContextMenuRadioItem>
                <ContextMenuRadioItem value="zh">中文</ContextMenuRadioItem>
              </ContextMenuRadioGroup>
              <ContextMenuSub>
                <ContextMenuSubTrigger>{t("More", "更多")}</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem
                    onSelect={() => onAction(t("Nested command selected", "已选择嵌套命令"))}
                  >
                    {t("Nested command", "嵌套命令")}
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
              <ContextMenuLabel>{t("Adaptive Grid:", "自适应网格：")}</ContextMenuLabel>
              <ContextMenuOptionGrid
                testId="gallery-adaptive-grid"
                columns={3}
                value={adaptiveGrid}
                onValueChange={setAdaptiveGrid}
              >
                <ContextMenuOptionGridItem value="narrow">
                  {t("Narrow", "窄")}
                </ContextMenuOptionGridItem>
                <ContextMenuOptionGridItem value="medium">
                  {t("Medium", "中")}
                </ContextMenuOptionGridItem>
                <ContextMenuOptionGridItem value="wide">
                  {t("Wide", "宽")}
                </ContextMenuOptionGridItem>
              </ContextMenuOptionGrid>
              <ContextMenuLabel>{t("Fixed Grid:", "固定网格：")}</ContextMenuLabel>
              <ContextMenuOptionGrid
                testId="gallery-fixed-grid"
                columns={5}
                value={fixedGrid}
                onValueChange={setFixedGrid}
                options={[
                  { id: "8", label: t("8 Bars", "8 小节") },
                  { id: "4", label: t("4 Bars", "4 小节") },
                  { id: "2", label: t("2 Bars", "2 小节") },
                  { id: "1", label: t("1 Bar", "1 小节") },
                  { id: "1/2", label: "1/2" },
                  { id: "1/4", label: "1/4" },
                  { id: "1/8", label: "1/8" },
                  { id: "1/16", label: "1/16" },
                  { id: "1/32", label: "1/32" },
                ]}
              />
              <ContextMenuSeparator />
              <ContextMenuLabel>{t("Clip Colour:", "片段颜色：")}</ContextMenuLabel>
              <ContextMenuOptionGrid
                testId="gallery-color-grid"
                columns={5}
                value={clipColor}
                onValueChange={setClipColor}
                options={[
                  { id: "primary", label: t("Primary", "主色"), color: theme.colors.primary },
                  { id: "success", label: t("Success", "成功色"), color: theme.colors.success },
                  { id: "accent", label: t("Accent", "强调色"), color: theme.colors.accent },
                  {
                    id: "destructive",
                    label: t("Destructive", "危险色"),
                    color: theme.colors.destructive,
                  },
                  { id: "muted", label: t("Muted", "柔和色"), color: theme.colors.muted },
                ]}
              />
            </ContextMenuContent>
          </ContextMenu>
        </GalleryState>
        <GalleryState label={t("Disabled", "禁用")}>
          <ContextMenu disabled>
            <ContextMenuTrigger asChild>
              <Button disabled>{t("Context actions", "上下文操作")}</Button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>{t("Unavailable", "不可用")}</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("Popover", "浮层")}>
        <div
          style={{ display: "flex", flexDirection: "column", gap: theme.design.spacing.stackGap }}
        >
          <ToggleGroup
            type="single"
            value={side}
            aria-label={t("Popover side", "浮层方向")}
            onValueChange={next => {
              const selected = sides.find(item => item.side === next)
              if (selected) setSide(selected.side)
            }}
          >
            {sides.map(item => (
              <ToggleGroupItem
                key={item.side}
                value={item.side}
                testId={`gallery-popover-side-${item.side}`}
              >
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            type="single"
            value={align}
            aria-label={t("Popover alignment", "浮层对齐")}
            onValueChange={next => {
              const selected = alignments.find(item => item.align === next)
              if (selected) setAlign(selected.align)
            }}
          >
            {alignments.map(item => (
              <ToggleGroupItem
                key={item.align}
                value={item.align}
                testId={`gallery-popover-align-${item.align}`}
              >
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div style={{ display: "flex", gap: theme.control["--spacing-control-track-gap"] }}>
            <GalleryState label={t("Default", "默认")}>
              <Popover>
                <PopoverTrigger asChild>
                  <Button testId="gallery-popover">{t("Popover", "浮层")}</Button>
                </PopoverTrigger>
                <PopoverContent side={side} align={align} testId="gallery-popover-content">
                  <PopoverHeader>
                    <PopoverTitle>{t("Native popover", "原生浮层")}</PopoverTitle>
                  </PopoverHeader>
                  <text>{t("Line one\nLine two", "第一行\n第二行")}</text>
                  <Button onClick={() => onAction(t("Popover action", "浮层操作"))}>
                    {t("Internal action", "内部操作")}
                  </Button>
                </PopoverContent>
              </Popover>
            </GalleryState>
            <GalleryState label={t("Disabled", "禁用")}>
              <Popover disabled>
                <PopoverTrigger asChild>
                  <Button disabled>{t("Popover", "浮层")}</Button>
                </PopoverTrigger>
                <PopoverContent side={side} align={align}>
                  <text>{t("Unavailable", "不可用")}</text>
                </PopoverContent>
              </Popover>
            </GalleryState>
          </div>
        </div>
      </GalleryVariant>
      <text aria-live="polite" style={{ color: theme.colors.mutedForeground }}>
        {action}
      </text>
    </GallerySection>
  )
}
