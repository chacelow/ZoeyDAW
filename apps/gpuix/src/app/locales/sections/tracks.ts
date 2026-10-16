import { trackResources } from "@/project/sections/arrangement/tracks/locales"
import type { TrackLabels } from "@/project/sections/arrangement/tracks"
import type { SupportedLocale } from "@/platform/i18n/core"
import { createDisplayFormats } from "../../i18n/display-formats"
import enUS from "../en-US"
import zhCN from "../zh-CN"

export const trackLabelsByLocale: Record<SupportedLocale, TrackLabels> = {
  "en-US": {
    ...trackResources["en-US"].arrangement,
    formats: createDisplayFormats("en-US"),
    monitorModes: enUS.track.monitorModes,
    monitorShortNames: enUS.track.monitorModes,
  },
  "zh-CN": {
    ...trackResources["zh-CN"].arrangement,
    formats: createDisplayFormats("zh-CN"),
    monitorModes: zhCN.track.monitorModes,
    // Compact In/Auto/Off captions retain Live's convention; descriptions use the current locale.
    monitorShortNames: enUS.track.monitorModes,
  },
}
