import type { SupportedLocale } from "@/platform/i18n/core"

import type { NumericKind, PanFormatVariant } from "@/project/model/display-formats"

export type { NumericKind } from "@/project/model/display-formats"

export interface DisplayConfig {
  precision: Record<NumericKind, number>
  trimZeros: NumericKind[]
  negativeInfinity: string
  infinityAliases: string[]
  dbFloor: number
  pan: {
    center: string
    left: string
    right: string
    variants: Record<PanFormatVariant, { centerThreshold: number; separator: string }>
  }
  units: {
    db: string
    sampleRate: string
    latency: string
    pixels: string
    percent: string
    zoom: string
  }
  meter: string
  dateTime: Intl.DateTimeFormatOptions
  pitchClasses: string[]
  duration: {
    separator: string
    fractionSeparator: string
    transportDigits: number
    rulerDigits: number
    rulerOmitZeroFraction: boolean
    includeHours: Record<"ruler" | "transport", boolean>
  }
  parameter: { fractionalDigits: number; integerDigits: number }
  musicalWidthSamples: number[]
  widthSamples: Record<NumericKind | "pan" | "panAutomation" | "parameter" | "audioGain", string[]>
}

function config(
  pan: Pick<DisplayConfig["pan"], "center" | "left" | "right">,
  pixels: string
): DisplayConfig {
  const variants: DisplayConfig["pan"]["variants"] = {
    control: { centerThreshold: 0, separator: "" },
    automation: { centerThreshold: 0.005, separator: " " },
  }
  return {
    precision: {
      bpm: 2,
      latency: 2,
      db: 1,
      integer: 0,
      fade: 3,
      sourceMarker: 4,
      midi: 4,
      ruler: 2,
      zoom: 1,
      viewport: 3,
    },
    trimZeros: ["midi"],
    negativeInfinity: "−∞",
    infinityAliases: ["−∞", "-∞", "-inf", "-infinity"],
    dbFloor: -60,
    pan: { ...pan, variants },
    units: { db: "dB", sampleRate: "kHz", latency: "ms", pixels, percent: "%", zoom: "×" },
    meter: "{{leftLabel}} {{left}} dB, {{rightLabel}} {{right}} dB",
    dateTime: { dateStyle: "short", timeStyle: "short" },
    duration: {
      separator: ":",
      fractionSeparator: ".",
      transportDigits: 3,
      rulerDigits: 3,
      rulerOmitZeroFraction: true,
      includeHours: { ruler: false, transport: true },
    },
    parameter: { fractionalDigits: 1, integerDigits: 0 },
    pitchClasses: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
    musicalWidthSamples: [999.9375],
    widthSamples: {
      bpm: ["999.99"],
      latency: ["999.99 ms"],
      db: ["−59.9", "6.0", "−∞"],
      integer: ["999"],
      audioGain: ["-60.0 dB"],
      fade: ["1024.000"],
      sourceMarker: ["1024.9375"],
      midi: ["1024.9375"],
      ruler: ["1024.00"],
      zoom: ["16.0×"],
      viewport: ["16.000"],
      pan: [
        pan.center,
        `${pan.left}${variants.control.separator}100`,
        `${pan.right}${variants.control.separator}100`,
      ],
      panAutomation: [
        pan.center,
        `${pan.left}${variants.automation.separator}100`,
        `${pan.right}${variants.automation.separator}100`,
      ],
      parameter: ["100", "100.0"],
    },
  }
}

export const displayConfigByLocale: Record<SupportedLocale, DisplayConfig> = {
  "en-US": config({ center: "C", left: "L", right: "R" }, "px"),
  "zh-CN": config({ center: "中", left: "左", right: "右" }, "像素"),
}
