import { useState } from "react"
import {
  Button,
  ControlGroup,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
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
  ListRow,
} from "@/ui/controls"

export function GalleryMenus({
  locale,
  value,
  onChange,
  onAction,
}: {
  readonly locale: "en" | "zh"
  readonly value: number
  readonly onChange: (value: number) => void
  readonly onAction: (action: string) => void
}) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en)
  const [mode, setMode] = useState("beats")
  const [follow, setFollow] = useState(false)
  const [language, setLanguage] = useState("en")
  return (
    <>
      <ControlGroup variant="toolbar" label={t("Selectors", "选择器")}>
        <DropdownButton
          testId="gallery-dropdown"
          label={t("Warp mode", "变速模式")}
          value={mode}
          onChange={setMode}
          items={[
            { id: "beats", label: t("Beats", "节拍") },
            { id: "tones", label: t("Tones\nPreserves pitch", "音调\n保留音高") },
            { id: "off", label: t("Unavailable", "不可用"), disabled: true },
          ]}
        />
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
        <Popover>
          <PopoverTrigger asChild>
            <Button testId="gallery-popover">{t("Popover", "浮层")}</Button>
          </PopoverTrigger>
          <PopoverContent side="right" align="start">
            <PopoverHeader>
              <PopoverTitle>{t("Native popover", "原生浮层")}</PopoverTitle>
            </PopoverHeader>
            <text>{t("Line one\nLine two", "第一行\n第二行")}</text>
            <Button onClick={() => onAction(t("Popover action", "浮层操作"))}>
              {t("Internal action", "内部操作")}
            </Button>
          </PopoverContent>
        </Popover>
      </ControlGroup>
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
                <DropdownMenuItem disabled>{t("MIDI unavailable", "MIDI 不可用")}</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <ListRow
            testId="gallery-context-row"
            label={t("Right-click context actions", "右键打开上下文菜单")}
          />
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuLabel>{t("Context actions", "上下文操作")}</ContextMenuLabel>
          <ContextMenuItem onSelect={() => onAction(t("Rename selected", "已选择重命名"))}>
            {t("Rename", "重命名")}
          </ContextMenuItem>
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
        </ContextMenuContent>
      </ContextMenu>
    </>
  )
}
