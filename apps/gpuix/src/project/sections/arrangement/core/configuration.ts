import type { ArrangementPolicy } from "@/project/defaults/arrangement"
import type { PREFERENCE_DEFAULTS } from "@/project/defaults/preferences"

export function resolveArrangementPolicy(
  source: ArrangementPolicy,
  overrides: (typeof PREFERENCE_DEFAULTS)["arrangement"],
  pointer: ArrangementPolicy["pointer"]
): ArrangementPolicy {
  const { zoom, follow, autoScroll, automation, meter, keyboard } = overrides ?? {}
  return {
    zoom: zoom
      ? {
          unmeasuredMinPxPerBar: zoom.unmeasuredMinPxPerBar ?? source.zoom.unmeasuredMinPxPerBar,
          minZoomTimelineRatio: zoom.minZoomTimelineRatio ?? source.zoom.minZoomTimelineRatio,
          stepInFactor: zoom.stepInFactor ?? source.zoom.stepInFactor,
          stepOutFactor: zoom.stepOutFactor ?? source.zoom.stepOutFactor,
          stepAnchorRatio: zoom.stepAnchorRatio ?? source.zoom.stepAnchorRatio,
          wheelPixelsPerExponent: zoom.wheelPixelsPerExponent ?? source.zoom.wheelPixelsPerExponent,
          minimapPixelsPerExponent:
            zoom.minimapPixelsPerExponent ?? source.zoom.minimapPixelsPerExponent,
          minimapPanScale: zoom.minimapPanScale ?? source.zoom.minimapPanScale,
          minimapEdgeHitPixels: zoom.minimapEdgeHitPixels ?? source.zoom.minimapEdgeHitPixels,
        }
      : source.zoom,
    follow: follow
      ? {
          manualPanPauseMs: follow.manualPanPauseMs ?? source.follow.manualPanPauseMs,
          triggerRatio: follow.triggerRatio ?? source.follow.triggerRatio,
          anchorRatio: follow.anchorRatio ?? source.follow.anchorRatio,
        }
      : source.follow,
    autoScroll: autoScroll
      ? {
          maxElapsedMs: autoScroll.maxElapsedMs ?? source.autoScroll.maxElapsedMs,
          horizontalPixelsPerMs:
            autoScroll.horizontalPixelsPerMs ?? source.autoScroll.horizontalPixelsPerMs,
          verticalPixelsPerMs:
            autoScroll.verticalPixelsPerMs ?? source.autoScroll.verticalPixelsPerMs,
        }
      : source.autoScroll,
    automation: automation
      ? {
          freehandSamplePixels:
            automation.freehandSamplePixels ?? source.automation.freehandSamplePixels,
        }
      : source.automation,
    meter: meter
      ? {
          minDb: meter.minDb ?? source.meter.minDb,
          maxDb: meter.maxDb ?? source.meter.maxDb,
          holdMs: meter.holdMs ?? source.meter.holdMs,
          fallDbPerSecond: meter.fallDbPerSecond ?? source.meter.fallDbPerSecond,
        }
      : source.meter,
    keyboard: keyboard
      ? {
          markerNudgeBars: keyboard.markerNudgeBars ?? source.keyboard.markerNudgeBars,
          velocityStep: keyboard.velocityStep ?? source.keyboard.velocityStep,
        }
      : source.keyboard,
    pointer,
  }
}
