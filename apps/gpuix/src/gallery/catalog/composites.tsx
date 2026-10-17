import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import {
  Button,
  DropdownButton,
  ToggleGroup,
  ToggleGroupItem,
  Knob,
  Fader,
  DeviceHeader,
  DragPadNumber,
  Switch,
} from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { GallerySection, GalleryVariant } from "./GallerySection"
import { ProjectComposites } from "./ProjectComposites"
import type { GallerySectionProps } from "./GallerySection"

export function CompositesSection(props: GallerySectionProps) {
  const { t, formats } = props
  const theme = useTheme()
  const [input, setInput] = useState("external")
  const [output, setOutput] = useState("main")
  const [monitor, setMonitor] = useState("Auto")
  const [sendA, setSendA] = useState(-12)
  const [sendB, setSendB] = useState(-24)
  const [volume, setVolume] = useState(0)
  const [pan, setPan] = useState(0)
  const [activator, setActivator] = useState(true)
  const [solo, setSolo] = useState(false)
  const [arm, setArm] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [frequency, setFrequency] = useState(1200)
  const [resonance, setResonance] = useState(35)
  const [mode, setMode] = useState("LP")
  const [sync, setSync] = useState(false)
  const column = {
    display: "flex",
    flexDirection: "column",
    gap: theme.control["--spacing-control-track"],
  } as const
  const row = {
    display: "flex",
    alignItems: "center",
    gap: theme.control["--spacing-control-track"],
  } as const
  const knob = { min: -60, max: 6, step: 0.1, defaultValue: -60, format: formats.db }
  return (
    <GallerySection id="composites" title={t("Composites", "组合")}>
      <GalleryVariant label={t("Mixer strip", "调音台通道条")}>
        <div
          style={{
            ...column,
            width: theme.design.grid.mixerWidthUnits * theme.control["--spacing-control-track"],
            backgroundColor: theme.colors.arrangementSurfaceAlt,
            padding: theme.control["--spacing-control-track"],
          }}
        >
          <text
            style={{
              backgroundColor: theme.colors.chart1,
              color: theme.colors.primaryForeground,
              padding: theme.control["--spacing-control-track-pad"],
            }}
          >
            {t("1 Audio", "1 音频")}
          </text>
          <DropdownButton
            label={t("Audio from", "音频输入")}
            value={input}
            onChange={setInput}
            fill
            items={[
              { id: "external", label: t("Ext. In", "外部输入") },
              { id: "resampling", label: t("Resampling", "重采样") },
            ]}
          />
          <DropdownButton
            label={t("Input channel", "输入通道")}
            value="stereo"
            onChange={() => setInput("external")}
            fill
            items={[{ id: "stereo", label: t("1/2", "1/2") }]}
          />
          <ToggleGroup type="single" variant="segmented" value={monitor} onValueChange={setMonitor}>
            {["In", "Auto", "Off"].map(value => (
              <ToggleGroupItem key={value} value={value}>
                {t(value, value === "In" ? "输入" : value === "Auto" ? "自动" : "关闭")}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <DropdownButton
            label={t("Audio to", "音频输出")}
            value={output}
            onChange={setOutput}
            fill
            items={[
              { id: "main", label: t("Main", "主通道") },
              { id: "sends", label: t("Sends only", "仅发送") },
            ]}
          />
          <div style={row}>
            <Knob
              {...knob}
              label={t("A", "A")}
              description={t("Reverb send", "混响发送")}
              value={sendA}
              onChange={setSendA}
            />
            <Knob
              {...knob}
              label={t("B", "B")}
              description={t("Delay send", "延迟发送")}
              value={sendB}
              onChange={setSendB}
            />
          </div>
          <Knob
            label={t("Pan", "声像")}
            bipolar
            value={pan}
            onChange={setPan}
            min={-1}
            max={1}
            step={0.01}
            defaultValue={0}
            format={value => formats.pan(value, "control")}
          />
          <Fader
            {...knob}
            defaultValue={0}
            label={t("Volume", "音量")}
            value={volume}
            onChange={setVolume}
            ticks={[-60, -30, -12, 0, 6].map(value => ({ value, label: String(value) }))}
            meter={{
              "aria-label": t("Output level", "输出电平"),
              minDb: -60,
              maxDb: 6,
              channels: [
                { db: -18, peakDb: -6 },
                { db: -15, peakDb: -3 },
              ],
            }}
          />
          <text>{formats.db(volume)}</text>
          <div style={row}>
            <Button
              tone="activator"
              iconOnly
              active={activator}
              onActiveChange={setActivator}
              label={t("Track activator", "轨道开关")}
            >
              1
            </Button>
            <Button
              tone="solo"
              iconOnly
              active={solo}
              onActiveChange={setSolo}
              label={t("Solo", "独奏")}
            >
              {t("S", "S")}
            </Button>
            <Button
              tone="arm"
              iconOnly
              active={arm}
              onActiveChange={setArm}
              label={t("Arm", "预备录音")}
              icon={
                <Icon
                  name="Circle"
                  filled
                  color={arm ? theme.colors.primaryForeground : theme.colors.mutedForeground}
                />
              }
            />
          </div>
        </div>
      </GalleryVariant>
      <GalleryVariant label={t("Filter device", "滤波设备")}>
        <div
          style={{
            ...column,
            width: theme.design.grid.deviceWidthUnits * theme.control["--spacing-control-track"],
            borderWidth: theme.design.shape.cardBorderWidth,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.muted,
          }}
        >
          <DeviceHeader
            title={t("Auto Filter", "自动滤波")}
            enabled={enabled}
            onEnabledChange={setEnabled}
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
            labels={{
              activator: t("Filter activator", "滤波开关"),
              collapse: t("Fold filter", "折叠滤波"),
            }}
            actions={
              <Button
                label={t("Reset device", "重置设备")}
                iconOnly
                icon={<Icon name="RotateCcw" />}
                onClick={() => {
                  setFrequency(1200)
                  setResonance(35)
                }}
              />
            }
          />
          {!collapsed ? (
            <div
              style={{
                ...column,
                padding: theme.control["--spacing-control-track-pad"],
                opacity: enabled ? 1 : theme.design.states.disabledOpacity,
              }}
            >
              <ToggleGroup type="single" variant="segmented" value={mode} onValueChange={setMode}>
                {["LP", "LP2", "HP", "BP", "NT"].map(value => (
                  <ToggleGroupItem key={value} value={value}>
                    {value}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div style={row}>
                <Knob
                  label={t("Frequency", "频率")}
                  value={frequency}
                  onChange={setFrequency}
                  min={20}
                  max={20000}
                  step={1}
                  dragStep={100}
                  defaultValue={1200}
                  format={value => value.toFixed(0) + t(" Hz", " 赫兹")}
                />
                <Knob
                  label={t("Resonance", "共振")}
                  value={resonance}
                  onChange={setResonance}
                  min={0}
                  max={100}
                  step={0.1}
                  defaultValue={35}
                  format={value => value.toFixed(1) + "%"}
                />
              </div>
              <DragPadNumber
                label={t("Frequency", "频率")}
                value={frequency}
                onChange={setFrequency}
                min={20}
                max={20000}
                step={1}
                defaultValue={1200}
                widthSamples={["20000"]}
              />
              <DragPadNumber
                label={t("Resonance", "共振")}
                value={resonance}
                onChange={setResonance}
                min={0}
                max={100}
                step={0.1}
                defaultValue={35}
                widthSamples={["100.0"]}
              />
              <div style={row}>
                <Switch
                  label={t("Tempo sync", "节拍同步")}
                  checked={sync}
                  onCheckedChange={setSync}
                />
                <text>{t("Tempo sync", "节拍同步")}</text>
              </div>
            </div>
          ) : null}
        </div>
      </GalleryVariant>
      <ProjectComposites {...props} />
    </GallerySection>
  )
}
