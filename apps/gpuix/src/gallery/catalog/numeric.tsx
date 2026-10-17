import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { DragPadNumber, DragPadBar, DragPadBipolar, PanControl, Knob, Fader } from "@/ui/controls"
import { GallerySection, GalleryVariant, GalleryState } from "./GallerySection"
import type { GallerySectionProps } from "./GallerySection"

export function NumericSection({ t, formats }: GallerySectionProps) {
  const theme = useTheme()
  const [value, setValue] = useState(0)
  const [pan, setPan] = useState(0)
  const [bipolar, setBipolar] = useState(0.75)
  const common = {
    label: t("Volume", "音量"),
    value,
    onChange: setValue,
    min: -60,
    max: 6,
    step: 0.1,
    defaultValue: 0,
    format: formats.db,
  }
  const bipolarOptions = {
    ...common,
    label: t("Bipolar value", "双极值"),
    value: bipolar,
    onChange: setBipolar,
    min: -1,
    max: 1,
    step: 0.01,
    format: (value: number) => value.toFixed(2),
  }
  const pads = [
    { name: "DragPadNumber", id: "number", Control: DragPadNumber, options: common },
    { name: "DragPadBar", id: "bar", Control: DragPadBar, options: common },
    { name: "DragPadBipolar", id: "bipolar", Control: DragPadBipolar, options: bipolarOptions },
  ]
  return (
    <GallerySection
      id="numeric"
      title={t("Numeric controls", "数值控件")}
      description={t(
        "Drag vertically, wheel, arrows; double-click resets. Hover / pressed: interactive only.",
        "垂直拖动、滚轮、方向键调整；双击重置。悬停 / 按下：仅交互展示。"
      )}
    >
      {pads.flatMap(({ name, id, Control, options }) =>
        (["default", "transport"] as const).map(size => (
          <GalleryVariant key={name + size} label={name + " · " + size}>
            <GalleryState label={t("Default", "默认")}>
              <Control
                {...options}
                testId={size === "default" ? `gallery-${id}` : `gallery-transport-${id}`}
                size={size}
                parse={formats.parseDb}
                widthSamples={formats.widthSamples.db}
              />
            </GalleryState>
            <GalleryState label={t("Disabled", "禁用")}>
              <Control {...options} size={size} disabled widthSamples={formats.widthSamples.db} />
            </GalleryState>
          </GalleryVariant>
        ))
      )}
      <GalleryVariant label={t("PanControl", "声像")}>
        <GalleryState label={t("Default", "默认")}>
          <PanControl
            testId="gallery-pan"
            label={t("Pan", "声像")}
            value={pan}
            onChange={setPan}
            format={value => formats.pan(value, "control")}
            parse={formats.parsePan}
            widthSamples={formats.widthSamples.pan}
          />
        </GalleryState>
        <GalleryState label={t("Disabled", "禁用")}>
          <PanControl
            label={t("Pan", "声像")}
            value={pan}
            onChange={setPan}
            format={value => formats.pan(value, "control")}
            parse={formats.parsePan}
            disabled
            widthSamples={formats.widthSamples.pan}
          />
        </GalleryState>
      </GalleryVariant>
      {(["default", "transport"] as const).map(size => (
        <GalleryVariant key={size} label={t("Knob unipolar", "单极旋钮") + " · " + size}>
          <GalleryState label={t("Default", "默认")}>
            <Knob {...common} size={size} />
          </GalleryState>
          <GalleryState label={t("Disabled", "禁用")}>
            <Knob {...common} size={size} disabled />
          </GalleryState>
        </GalleryVariant>
      ))}
      <GalleryVariant label={t("Knob bipolar", "双极旋钮")}>
        <Knob
          label={t("Pan", "声像")}
          value={pan}
          onChange={setPan}
          min={-1}
          max={1}
          step={0.01}
          defaultValue={0}
          bipolar
          format={value => formats.pan(value, "control")}
        />
      </GalleryVariant>
      <GalleryVariant label={t("Knob coloured", "着色旋钮")}>
        <Knob {...common} color={theme.colors.activatorActive} />
      </GalleryVariant>
      <GalleryVariant label={t("Fader · Live meter handle", "推子 · 电平侧边手柄")}>
        <GalleryState label={t("Default with dB scale", "默认分贝刻度")}>
          <Fader
            {...common}
            ticks={[-60, -30, -12, 0, 6].map(value => ({ value, label: String(value) }))}
          />
        </GalleryState>
        <GalleryState label={t("Disabled", "禁用")}>
          <Fader {...common} disabled />
        </GalleryState>
        <GalleryState label={t("Invalid", "无效")}>
          <Fader {...common} invalid />
        </GalleryState>
      </GalleryVariant>
    </GallerySection>
  )
}
