import { useRef, useState } from "react"
import { useAnimationFrame } from "@/platform/frame"
import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import {
  advanceMeterPeak,
  createMeterPeak,
  meterDb,
} from "@/project/sections/arrangement/core/meters/meter-peak"
import { useTheme } from "@/shared/theme/ThemeProvider"
import {
  Button,
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
import type { LevelMeterChannel } from "@/ui/controls"
import { GallerySection, GalleryState, GalleryVariant } from "./GallerySection"
import type { GallerySectionProps } from "./GallerySection"

const METER = ARRANGEMENT_DEFAULTS.meter

function steady(left: number, right: number): readonly [LevelMeterChannel, LevelMeterChannel] {
  return [
    { db: left, peakDb: left },
    { db: right, peakDb: right },
  ]
}

function LiveMeter({ height, label }: { readonly height: number; readonly label: string }) {
  const peaks = useRef([createMeterPeak(METER), createMeterPeak(METER)] as const)
  const [channels, setChannels] = useState(steady(METER.minDb, METER.minDb))
  useAnimationFrame(now => {
    const seconds = now / 1000
    const [left, right] = peaks.current
    const advance = (peak: typeof left, index: number): LevelMeterChannel => {
      const swing = Math.sin(seconds * (2.1 + index * 0.7)) * 0.5 + 0.5
      const db = meterDb(-36 + swing * 40 + Math.sin(seconds * 17 + index) * 3, METER)
      advanceMeterPeak(peak, db, now, METER)
      return { db, peakDb: peak.db }
    }
    setChannels([advance(left, 0), advance(right, 1)])
  }, true)
  return (
    <LevelMeter
      testId={part => `gallery-live-meter-${part}`}
      aria-label={label}
      minDb={METER.minDb}
      maxDb={METER.maxDb}
      height={height}
      channels={channels}
    />
  )
}

export function MetersSection({ t }: GallerySectionProps) {
  const theme = useTheme()
  const [live, setLive] = useState(false)
  const [progress, setProgress] = useState(40)
  const height = theme.layout.track.controlHeight * 6
  const meter = (channels: readonly [LevelMeterChannel, LevelMeterChannel], label: string) => (
    <LevelMeter
      aria-label={label}
      minDb={METER.minDb}
      maxDb={METER.maxDb}
      height={height}
      channels={channels}
    />
  )
  return (
    <GallerySection id="meters" title={t("Meters and feedback", "电平与反馈")}>
      <GalleryVariant label="LevelMeter">
        <GalleryState label={t("Silent", "静音")}>
          {meter(steady(METER.minDb, METER.minDb), t("Silent meter", "静音电平"))}
        </GalleryState>
        <GalleryState label={t("Nominal", "正常")}>
          {meter(steady(-18, -12), t("Nominal level", "正常电平"))}
        </GalleryState>
        <GalleryState label={t("Peak hold", "峰值保持")}>
          {meter(
            [
              { db: -24, peakDb: -4 },
              { db: -20, peakDb: -8 },
            ],
            t("Peak hold level", "峰值保持电平")
          )}
        </GalleryState>
        <GalleryState label={t("Clipping", "削波")}>
          {meter(steady(METER.maxDb, -3), t("Clipping level", "削波电平"))}
        </GalleryState>
        <GalleryState label={t("Live · native frames", "实时 · 原生帧")}>
          {live ? (
            <LiveMeter height={height} label={t("Live level meter", "实时电平表")} />
          ) : (
            meter(steady(METER.minDb, METER.minDb), t("Live level meter", "实时电平表"))
          )}
          <Switch
            testId="gallery-live-meter-switch"
            label={t("Live signal", "实时信号")}
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
