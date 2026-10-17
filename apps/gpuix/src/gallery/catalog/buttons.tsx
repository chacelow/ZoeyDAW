import { useLayoutEffect, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Button } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { useMeasuredTextWidth } from "@/ui/controls/useMeasuredTextWidth"
import { snapControlWidth } from "@/ui/controls/grid"
import { GallerySection, GalleryVariant, GalleryState } from "./GallerySection"
import type { PublicInstance } from "@gpuix/react"
import type { ButtonProps } from "@/ui/controls"
import type { GallerySectionProps } from "./GallerySection"

const VARIANTS = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const
const TONES = ["neutral", "solo", "arm", "activator"] as const

function ButtonStates({
  t,
  testId,
  columnWidth,
  ...props
}: Pick<GallerySectionProps, "t"> & ButtonProps & { readonly columnWidth: number }) {
  const [active, setActive] = useState(false)
  const style = props.iconOnly ? props.style : { ...props.style, width: columnWidth }
  return (
    <>
      <GalleryState
        label={t("Default · interactive", "默认 · 可交互")}
        width={props.iconOnly ? columnWidth : undefined}
      >
        <Button {...props} style={style} testId={testId} active={active} onActiveChange={setActive}>
          {props.iconOnly ? null : t("Button", "按钮")}
        </Button>
      </GalleryState>
      <GalleryState label={t("Active", "激活")} width={props.iconOnly ? columnWidth : undefined}>
        <Button {...props} style={style} active>
          {props.iconOnly ? null : t("Button", "按钮")}
        </Button>
      </GalleryState>
      <GalleryState label={t("Disabled", "禁用")} width={props.iconOnly ? columnWidth : undefined}>
        <Button {...props} style={style} disabled>
          {props.iconOnly ? null : t("Button", "按钮")}
        </Button>
      </GalleryState>
      <GalleryState
        label={t("No highlight", "无高亮")}
        width={props.iconOnly ? columnWidth : undefined}
      >
        <Button {...props} style={style} highlight={false}>
          {props.iconOnly ? null : t("Button", "按钮")}
        </Button>
      </GalleryState>
    </>
  )
}

export function ButtonsSection({ t }: GallerySectionProps) {
  const { renderer } = useGpuix()
  const theme = useTheme()
  const focus = useRef<PublicInstance | null>(null)
  const columnLabels = [
    t("Default", "默认"),
    t("Active", "激活"),
    t("Disabled", "禁用"),
    t("No highlight", "无高亮"),
  ]
  const measurement = useMeasuredTextWidth(columnLabels, {
    fontSize: theme.control["--text-control-track"],
  })
  const columnWidth = snapControlWidth(measurement.width, theme.control["--spacing-control-track"])
  useLayoutEffect(() => {
    if (focus.current) renderer?.focusElement?.(focus.current.id)
  }, [renderer])
  return (
    <GallerySection
      id="buttons"
      title={t("Buttons", "按钮")}
      columns={{
        label: t("Variant", "变体"),
        states: columnLabels,
        width: columnWidth,
      }}
      description={t(
        "Hover / pressed: interactive only. Focus a control with Tab.",
        "悬停 / 按下：仅交互展示。使用 Tab 聚焦控件。"
      )}
    >
      {measurement.sampleNodes}
      {VARIANTS.map(variant => (
        <GalleryVariant key={variant} label={variant}>
          <ButtonStates
            t={t}
            columnWidth={columnWidth}
            variant={variant}
            testId={variant === "default" ? "gallery-button" : undefined}
          />
        </GalleryVariant>
      ))}
      {TONES.map(tone => (
        <GalleryVariant key={tone} label={t("Tone", "色调") + ": " + tone}>
          <ButtonStates t={t} tone={tone} columnWidth={columnWidth} />
        </GalleryVariant>
      ))}
      <GalleryVariant label={t("Transport size", "走带尺寸")}>
        <ButtonStates t={t} size="transport" columnWidth={columnWidth} />
      </GalleryVariant>
      <GalleryVariant label={t("Icon only", "纯图标")}>
        <ButtonStates
          columnWidth={columnWidth}
          t={t}
          testId="gallery-icon"
          iconOnly
          label={t("Play", "播放")}
          icon={<Icon name="Play" />}
        />
      </GalleryVariant>
      <GalleryVariant label={t("Transport icon", "走带图标")}>
        <ButtonStates
          columnWidth={columnWidth}
          t={t}
          testId="gallery-transport-icon"
          size="transport"
          iconOnly
          label={t("Play", "播放")}
          icon={<Icon name="Play" />}
        />
      </GalleryVariant>
      <GalleryVariant label={t("Native focus", "原生焦点")}>
        <GalleryState label={t("Focused on mount", "挂载时聚焦")}>
          <Button ref={focus} testId="gallery-focus-cell">
            {t("Focus", "焦点")}
          </Button>
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("Grid alignment", "网格对齐")}>
        {theme.design.grid.previewUnits.map(units => (
          <Button
            key={units}
            testId={`gallery-grid-${units}`}
            label={`${units}u`}
            style={{ width: units * theme.control["--spacing-control-track"] }}
          >
            {units === 1 ? "1" : `${units}u`}
          </Button>
        ))}
      </GalleryVariant>
    </GallerySection>
  )
}
