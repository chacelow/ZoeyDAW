import { useLayoutEffect, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Input, InlineEdit, Label } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { useMeasuredTextWidth } from "@/ui/controls/useMeasuredTextWidth"
import { snapControlWidth } from "@/ui/controls/grid"
import { GallerySection, GalleryState, GalleryVariant } from "./GallerySection"
import type { PublicInstance } from "@gpuix/react"
import type { InputSize, InputVariant } from "@/ui/controls"
import type { GallerySectionProps } from "./GallerySection"

const VARIANTS: readonly InputVariant[] = ["outline", "filled", "ghost", "underline"]
const SIZES: readonly InputSize[] = ["default", "transport", "small"]

export function InputsSection({ t }: GallerySectionProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const inputRef = useRef<PublicInstance | null>(null)
  const focusRef = useRef<PublicInstance | null>(null)
  const [text, setText] = useState(t("Native input", "原生输入"))
  const [search, setSearch] = useState(t("Drums", "鼓组"))
  const [name, setName] = useState(t("Track name", "轨道名称"))
  const columns = [t("Default", "默认"), t("Focused", "聚焦"), t("Invalid", "无效"), t("Disabled", "禁用"), t("Read-only", "只读")] satisfies [string, string, string, string, string]
  const measurement = useMeasuredTextWidth([...columns, text], { fontSize: theme.control["--text-control-track"] })
  const width = snapControlWidth(
    measurement.width + theme.design.input.paddingInline * 2 + theme.control["--spacing-control-icon-slot"] * 2,
    theme.control["--spacing-control-track"]
  )
  useLayoutEffect(() => {
    if (focusRef.current) renderer?.focusElement?.(focusRef.current.id)
  }, [renderer])
  return (
    <GallerySection
      id="inputs"
      title={t("Inputs", "输入")}
      columns={{ label: t("Variant", "变体"), states: columns, width }}
      description={t("One live focus cell; click or Tab to focus any variant. Inline edit: click, Enter or F2; Enter commits, Escape cancels.", "一个原生焦点单元格；点击或 Tab 可聚焦任一变体。行内编辑：点击、Enter 或 F2 开始；Enter 提交，Escape 取消。")}
    >
      {measurement.sampleNodes}
      {VARIANTS.map(variant => (
        <GalleryVariant key={variant} label={variant}>
          <GalleryState label={columns[0]}>
            <Input
              ref={variant === "outline" ? inputRef : undefined}
              testId={variant === "outline" ? "gallery-input" : `gallery-input-${variant}`}
              aria-label={t("Native input", "原生输入")}
              variant={variant}
              value={text}
              style={{ width }}
              onValueChange={setText}
            />
          </GalleryState>
          <GalleryState label={columns[1]}>
            <Input ref={variant === "outline" ? focusRef : undefined} testId={`gallery-input-${variant}-focus`} aria-label={t("Focus example", "焦点示例")} variant={variant} value={text} style={{ width }} onValueChange={setText} />
          </GalleryState>
          <GalleryState label={columns[2]}>
            <Input aria-label={t("Invalid input example", "无效输入示例")} variant={variant} invalid value={text} style={{ width }} onValueChange={setText} />
          </GalleryState>
          <GalleryState label={columns[3]}>
            <Input aria-label={t("Unavailable input", "不可用输入")} variant={variant} disabled value={text} style={{ width }} />
          </GalleryState>
          <GalleryState label={columns[4]}>
            <Input aria-label={t("Read-only input", "只读输入")} variant={variant} readOnly value={text} style={{ width }} />
          </GalleryState>
        </GalleryVariant>
      ))}
      <GalleryVariant label={t("Search + clear", "搜索 + 清除")}>
        {VARIANTS.map(variant => (
          <GalleryState key={variant} label={variant}>
            <Input testId={`gallery-search-${variant}`} aria-label={t("Search", "搜索")} variant={variant} leading={<Icon name="Search" />} clearable clearLabel={t("Clear search", "清除搜索")} value={search} onValueChange={setSearch} style={{ width }} />
          </GalleryState>
        ))}
      </GalleryVariant>
      <GalleryVariant label={t("Trailing slot", "尾部插槽")}>
        <GalleryState label={t("Keyboard hint", "键盘提示")}>
          <Input aria-label={t("Search with hint", "带提示搜索")} leading={<Icon name="Search" />} trailing={<Icon name="Command" />} value={search} onValueChange={setSearch} style={{ width }} />
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("Sizes", "尺寸")}>
        {SIZES.map(size => (
          <GalleryState key={size} label={size}>
            <Input testId={`gallery-input-size-${size}`} aria-label={size} size={size} value={text} onValueChange={setText} style={{ width }} />
          </GalleryState>
        ))}
      </GalleryVariant>
      <GalleryVariant label={t("Inline edit", "行内编辑")}>
        <GalleryState label={t("Click / Enter / F2", "点击 / Enter / F2")}>
          <InlineEdit testId="gallery-inline-edit" aria-label={t("Track name", "轨道名称")} value={name} onCommit={setName} style={{ width }} />
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label="Label">
        <GalleryState label={t("Bound to input", "绑定输入")}>
          <Label controlRef={inputRef}>{t("Input label", "输入标签")}</Label>
        </GalleryState>
      </GalleryVariant>
    </GallerySection>
  )
}
