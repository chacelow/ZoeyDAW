import { useRef, useState } from "react"
import { useAnimationFrame } from "@/platform/frame"
import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import {
  advanceMeterPeak,
  createMeterPeak,
  meterDb,
} from "@/project/sections/arrangement/core/meters/meter-peak"
import {
  advanceMeterRms,
  createMeterRms,
} from "@/project/sections/arrangement/core/meters/meter-rms"
import { useTheme } from "@/shared/theme/ThemeProvider"
import {
  Button,
  DropdownButton,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  LevelMeter,
  LoadErrorScreen,
  Loading,
  Progress,
  Switch,
  toast,
  toastLoading,
} from "@/ui/controls"
import type { LevelMeterChannel, LevelMeterProps } from "@/ui/controls"
import { snapControlWidth } from "@/ui/controls/grid"
import { useMeasuredTextWidth } from "@/ui/controls/useMeasuredTextWidth"
import { GallerySection, GalleryState, GalleryVariant } from "./GallerySection"
import type { GallerySectionProps } from "./GallerySection"
import { Group, Panel, PanelDivider } from "@/ui/panels"
import { useElementSize } from "@/ui/panels/useElementSize"


const METER = ARRANGEMENT_DEFAULTS.meter

function steady(left: number, right: number): readonly [LevelMeterChannel, LevelMeterChannel] {
  return [
    { rmsDb: left, peakDb: left, holdDb: left },
    { rmsDb: right, peakDb: right, holdDb: right },
  ]
}

interface MeterSize {
  readonly width: number
  readonly height: number
  readonly variant: NonNullable<LevelMeterProps["variant"]>
  readonly main?: boolean
}

function GalleryMeter({
  dropdownLabel,
  ...props
}: LevelMeterProps & { readonly dropdownLabel: string }) {
  const [output, setOutput] = useState("main")
  const meter = <LevelMeter {...props} />
  return props.variant === "inline" ? (
    <DropdownButton
      label={props["aria-label"] ?? dropdownLabel}
      value={output}
      onChange={setOutput}
      items={[{ id: "main", label: dropdownLabel }]}
      icon={meter}
    />
  ) : (
    meter
  )
}

function MeterDropdownOptions({ t, height }: Pick<GallerySectionProps, "t"> & { readonly height: number }) {
  const [selected, setSelected] = useState("1-2")
  const channels = steady(-18, -24)
  const items = [
    { id: "1-2", label: "1 / 2" },
    { id: "3-4", label: "3 / 4" },
    { id: "1", label: "1" },
    { id: "2", label: "2" },
  ]
  return (
    <DropdownButton
      label={t("Input Channel", "输入通道")}
      value={selected}
      onChange={setSelected}
      items={items.map(item => ({
        ...item,
        leading: <LevelMeter
          variant="inline"
          minDb={METER.minDb}
          maxDb={METER.maxDb}
          height={height}
          channels={channels}
        />,
      }))}
      icon={<LevelMeter
        variant="inline"
        minDb={METER.minDb}
        maxDb={METER.maxDb}
        height={height}
        channels={channels}
      />}
    />
  )
}

function LiveMeter({
  size,
  label,
  testId,
  dropdownLabel,
}: {
  readonly size: MeterSize
  readonly label: string
  readonly testId: string
  readonly dropdownLabel: string
}) {
  const peaks = useRef([createMeterPeak(METER), createMeterPeak(METER)] as const)
  const rms = useRef([createMeterRms(METER), createMeterRms(METER)] as const)
  const [channels, setChannels] = useState(steady(METER.minDb, METER.minDb))
  useAnimationFrame(now => {
    const seconds = now / 1000
    const [left, right] = peaks.current
    const advance = (peak: typeof left, index: 0 | 1): LevelMeterChannel => {
      const swing = Math.sin(seconds * (2.1 + index * 0.7)) * 0.5 + 0.5
      const db = meterDb(-30 + swing * 36 + Math.sin(seconds * 17 + index) * 3, METER)
      advanceMeterPeak(peak, db, now, METER)
      advanceMeterRms(rms.current[index], db - 6, now, METER)
      return { rmsDb: rms.current[index].db, peakDb: db, holdDb: peak.db }
    }
    setChannels([advance(left, 0), advance(right, 1)])
  }, true)
  return (
    <GalleryMeter
      dropdownLabel={dropdownLabel}
      variant={size.variant}
      main={size.main}
      testId={part => `${testId}-${part}`}
      aria-label={label}
      minDb={METER.minDb}
      maxDb={METER.maxDb}
      width={size.width}
      height={size.height}
      channels={channels}
    />
  )
}

/** Drag the divider to watch ticks, numbers and the readout follow the meter height. */
function ResizableMeters({ t, live }: Pick<GallerySectionProps, "t"> & { readonly live: boolean }) {
  const theme = useTheme()
  const unit = theme.control["--spacing-control-track"]
  const meter = theme.design.editor.meter
  const size = useElementSize()
  const gap = theme.control["--spacing-control-track"]
  const height = Math.max(0, size.height - theme.design.cards.controls.inset * 2)
  const clipping: readonly [LevelMeterChannel, LevelMeterChannel] = [
    { rmsDb: -6, peakDb: METER.maxDb, holdDb: METER.maxDb },
    { rmsDb: -9, peakDb: -3, holdDb: -2 },
  ]
  const variants = [
    { id: "track", variant: "track", width: meter.trackWidthUnits * unit },
    { id: "collapsed", variant: "collapsed", width: meter.collapsedWidthUnits * unit },
    { id: "mixer", variant: "mixer", width: meter.mixerWidthUnits * unit },
  ] as const
  return (
    <div
      style={{
        height: theme.design.dock.demoHeight + theme.design.dock.minimumSize * 2,
        width: theme.layout.gallery.cardWidth,
        flexShrink: 0,
      }}
    >
      <Group orientation="vertical">
        <Panel defaultSize="70%" minSize={unit}>
          <div
            onLayout={size.onLayout}
            style={{
              display: "flex",
              gap,
              width: "100%",
              height: "100%",
              padding: theme.design.cards.controls.inset,
              overflow: "hidden",
            }}
          >
            {variants.map(entry =>
              live ? (
                <LiveMeter
                  key={entry.id}
                  size={{ variant: entry.variant, width: entry.width, height }}
                  dropdownLabel={t("Main Out", "主输出")}
                  label={entry.id}
                  testId={`gallery-resizable-meter-${entry.id}`}
                />
              ) : (
                <LevelMeter
                  key={entry.id}
                  variant={entry.variant}
                  aria-label={entry.id}
                  minDb={METER.minDb}
                  maxDb={METER.maxDb}
                  width={entry.width}
                  height={height}
                  channels={clipping}
                />
              )
            )}
          </div>
        </Panel>
        <PanelDivider orientation="horizontal" />
        <Panel minSize={unit} />
      </Group>
    </div>
  )
}

export function MetersSection({ t }: GallerySectionProps) {
  const theme = useTheme()
  const [live, setLive] = useState(false)
  const [progress, setProgress] = useState(40)
  const unit = theme.control["--spacing-control-track"]
  const trackInset = theme.layout.track.border + theme.design.cards.controls.inset * 2
  const variants: readonly {
    readonly id: string
    readonly label: string
    readonly size: MeterSize
  }[] = [
    {
      id: "track",
      label: t("Track", "轨道"),
      size: {
        variant: "track",
        width: theme.design.editor.meter.trackWidthUnits * unit,
        height: theme.layout.track.defaultHeight - trackInset,
      },
    },
    {
      id: "collapsed",
      label: t("Track · collapsed", "轨道 · 收起"),
      size: {
        variant: "collapsed",
        width: theme.design.editor.meter.collapsedWidthUnits * unit,
        height: theme.layout.track.collapsedHeight - trackInset,
      },
    },
    {
      id: "mixer-tall",
      label: t("Mixer · tall", "调音台 · 高"),
      size: {
        variant: "mixer",
        width: theme.design.editor.meter.mixerWidthUnits * unit,
        height: theme.design.editor.meter.mixerHeightUnits * unit,
      },
    },
    {
      id: "mixer-short",
      label: t("Mixer · short", "调音台 · 矮"),
      size: {
        variant: "mixer",
        width: theme.design.editor.meter.mixerWidthUnits * unit,
        height: theme.design.editor.meter.shortMixerHeightUnits * unit,
      },
    },
    {
      id: "inline",
      label: t("Inline · dropdown", "内联 · 下拉框"),
      size: {
        variant: "inline",
        width: theme.design.editor.meter.inlineWidthUnits * unit,
        height: theme.design.editor.meter.inlineHeightUnits * unit,
      },
    },
    {
      id: "main",
      label: t("Main · overload turns all red", "Main · 过载整条红"),
      size: {
        variant: "track",
        main: true,
        width: theme.design.editor.meter.trackWidthUnits * unit,
        height: theme.layout.track.defaultHeight - trackInset,
      },
    },
  ]
  const states: readonly {
    readonly label: string
    readonly channels: readonly [LevelMeterChannel, LevelMeterChannel]
  }[] = [
    { label: t("Silent", "静音"), channels: steady(METER.minDb, METER.minDb) },
    { label: t("Nominal", "正常"), channels: steady(-18, -12) },
    {
      label: t("Peak hold", "峰值保持"),
      channels: [
        { rmsDb: -30, peakDb: -24, holdDb: -4 },
        { rmsDb: -26, peakDb: -20, holdDb: -8 },
      ],
    },
    { label: t("Clipping", "削波"), channels: steady(METER.maxDb, -3) },
  ]
  const liveLabel = t("Live", "实时")
  const columnLabels = [...states.map(state => state.label), liveLabel]
  const measurement = useMeasuredTextWidth(columnLabels, {
    fontSize: theme.control["--text-control-track"],
  })
  const columnWidth = snapControlWidth(measurement.width, unit)
  return (
    <GallerySection
      id="meters"
      title={t("Meters and feedback", "电平与反馈")}
      columns={{ label: t("LevelMeter", "电平表"), states: columnLabels, width: columnWidth }}
    >
      {measurement.sampleNodes}
      {variants.map(variant => (
        <GalleryVariant
          key={variant.id}
          label={variant.label}
          testId={`gallery-meter-${variant.id}`}
        >
          {states.map(state => (
            <GalleryState key={state.label} label={state.label} width={columnWidth}>
              <GalleryMeter
                dropdownLabel={t("Main Out", "主输出")}
                variant={variant.size.variant}
                main={variant.size.main}
                aria-label={`${variant.label} · ${state.label}`}
                minDb={METER.minDb}
                maxDb={METER.maxDb}
                width={variant.size.width}
                height={variant.size.height}
                channels={state.channels}
              />
            </GalleryState>
          ))}
          <GalleryState label={liveLabel} width={columnWidth}>
            {live ? (
              <LiveMeter
                size={variant.size}
                dropdownLabel={t("Main Out", "主输出")}
                label={`${variant.label} · ${liveLabel}`}
                testId={`gallery-live-meter-${variant.id}`}
              />
            ) : (
              <GalleryMeter
                dropdownLabel={t("Main Out", "主输出")}
                variant={variant.size.variant}
                main={variant.size.main}
                aria-label={`${variant.label} · ${liveLabel}`}
                minDb={METER.minDb}
                maxDb={METER.maxDb}
                width={variant.size.width}
                height={variant.size.height}
                channels={steady(METER.minDb, METER.minDb)}
              />
            )}
          </GalleryState>
        </GalleryVariant>
      ))}
      <GalleryVariant
        label={t("Resize · drag the divider", "调整高度 · 拖动分隔条")}
        testId="gallery-meter-resizable"
        block
      >
        <ResizableMeters t={t} live={live} />
      </GalleryVariant>
      <GalleryVariant label={t("Input channel dropdown", "输入通道下拉菜单")} testId="gallery-meter-input-channel-dropdown">
        <GalleryState label={t("Input channels", "输入通道")}>
          <MeterDropdownOptions t={t} height={theme.design.editor.meter.inlineHeightUnits * unit} />
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("Live signal", "实时信号")}>
        <GalleryState label={t("Live signal", "实时信号")}>
          <Switch
            testId="gallery-live-meter-switch"
            label={t("Animate the Live column", "驱动实时列")}
            checked={live}
            onCheckedChange={setLive}
          />
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label="Progress">
        <GalleryState label={t("Determinate", "确定进度")}>
          <Progress
            value={progress}
            aria-label={t("Progress", "进度")}
            aria-valuetext={`${progress}%`}
            style={{ width: theme.project.identityWidth }}
          />
          <Button onClick={() => setProgress(value => (value >= 100 ? 0 : value + 20))}>
            {t("Advance", "前进")}
          </Button>
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label="Loading">
        <GalleryState label={t("Inline", "内联")}>
          <Loading
            label={t("Loading native resources", "正在加载原生资源")}
            style={{
              position: "relative",
              width: theme.project.identityWidth,
              height: theme.transportControl["--spacing-control-track"],
            }}
          />
        </GalleryState>
        <GalleryState label={t("Compact inline", "紧凑内联")}>
          <Loading inline label={t("Loading…", "加载中…")} />
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label="Toast">
        <GalleryState label={t("Success", "成功")}>
          <Button onClick={() => toast.success(t("Operation completed", "操作完成"))}>
            {t("Success", "成功")}
          </Button>
        </GalleryState>
        <GalleryState label={t("Loading → error", "加载 → 错误")}>
          <Button onClick={() => toastLoading(t("Loading…", "加载中…"), "composition-job")}>
            {t("Loading", "加载")}
          </Button>
          <Button
            onClick={() => toast.error(t("Load failed", "加载失败"), { id: "composition-job" })}
          >
            {t("Error", "错误")}
          </Button>
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label="Empty">
        <GalleryState label={t("No selection", "无选择")}>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("No clips selected", "未选择片段")}</EmptyTitle>
              <EmptyDescription>
                {t("Select a clip to inspect it.", "选择片段查看详情。")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label="LoadErrorScreen">
        <GalleryState label={t("Retry", "重试")}>
          <div
            style={{
              position: "relative",
              width: theme.layout.gallery.cardWidth,
              height: theme.project.defaultTrackHeight * 2,
            }}
          >
            <LoadErrorScreen
              title={t("Example load error", "加载错误示例")}
              message={t("The resource cannot be opened.", "无法打开资源。")}
              retryLabel={t("Retry", "重试")}
              onRetry={() => toast.success(t("Retry requested", "已请求重试"))}
            />
          </div>
        </GalleryState>
      </GalleryVariant>
    </GallerySection>
  )
}
