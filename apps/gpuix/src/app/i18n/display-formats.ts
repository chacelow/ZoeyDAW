import { displayConfigByLocale } from "../locales/display"
import type { DisplayConfig, NumericKind } from "../locales/display"
import type { SupportedLocale } from "@/platform/i18n/core"
import type { DisplayFormats, PanFormatVariant } from "@/project/model/display-formats"
import { formatAudioMusicalValue } from "@/project/model/audio-editor/musical-value"

export type { DisplayConfig, NumericKind } from "../locales/display"

export function createDisplayFormats(
  locale: SupportedLocale,
  config = displayConfigByLocale[locale]
): DisplayFormats {
  const formatters = new Map<string, Intl.NumberFormat>()
  function fixed(value: number, digits: number, trim = false) {
    const key = `${digits}/${trim}`
    let formatter = formatters.get(key)
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale, {
        useGrouping: false,
        minimumFractionDigits: trim ? 0 : digits,
        maximumFractionDigits: digits,
      })
      formatters.set(key, formatter)
    }
    return formatter.format(value)
  }
  function number(value: number, kind: NumericKind) {
    return fixed(value, config.precision[kind], config.trimZeros.includes(kind))
  }
  function parseNumber(text: string) {
    const decimal =
      new Intl.NumberFormat(locale).formatToParts(1.5).find(part => part.type === "decimal")
        ?.value ?? "."
    const normalized = text.trim().replaceAll("−", "-").replaceAll(decimal, ".")
    if (!normalized) return Number.NaN
    return Number(normalized)
  }
  function db(value: number, options?: Parameters<DisplayFormats["db"]>[1]) {
    const formatted = value <= config.dbFloor ? config.negativeInfinity : number(value, "db")
    return options?.unit ? `${formatted} ${config.units.db}` : formatted
  }
  function parseDb(text: string) {
    const input = text.trim()
    const unit = config.units.db.trim()
    const raw =
      unit && input.toLocaleLowerCase(locale).endsWith(unit.toLocaleLowerCase(locale))
        ? input.slice(0, -unit.length).trim()
        : input
    if (
      [config.negativeInfinity, ...config.infinityAliases].some(
        alias => alias.toLocaleLowerCase(locale) === raw.toLocaleLowerCase(locale)
      )
    )
      return config.dbFloor
    return parseNumber(raw)
  }
  function pan(value: number, variant: PanFormatVariant) {
    const policy = config.pan.variants[variant]
    return value === 0 || Math.abs(value) < policy.centerThreshold
      ? config.pan.center
      : `${value < 0 ? config.pan.left : config.pan.right}${policy.separator}${number(Math.abs(value) * 100, "integer")}`
  }
  function parsePan(text: string) {
    const raw = text.trim().toLocaleUpperCase(locale)
    if ([config.pan.center, "C"].some(label => raw === label.toLocaleUpperCase(locale))) return 0
    for (const [labels, sign] of [
      [[config.pan.left, "L"], -1],
      [[config.pan.right, "R"], 1],
    ] satisfies [string[], number][]) {
      for (const label of labels) {
        if (raw.startsWith(label.toLocaleUpperCase(locale))) {
          const magnitude = raw.slice(label.length).trim()
          let separator = ""
          for (const policy of Object.values(config.pan.variants)) {
            const candidate = policy.separator.trim().toLocaleUpperCase(locale)
            if (candidate.length > separator.length && magnitude.startsWith(candidate)) {
              separator = candidate
            }
          }
          const value = magnitude.slice(separator.length).trim()
          // ASCII '%' remains an input alias independently of the configured separator.
          const numeric = value.endsWith("%") ? value.slice(0, -1).trim() : value
          return (sign * parseNumber(numeric)) / 100
        }
      }
    }
    return parseNumber(raw)
  }
  function duration(seconds: number, variant: "ruler" | "transport" = "transport") {
    const digits =
      variant === "transport" ? config.duration.transportDigits : config.duration.rulerDigits
    const scale = 10 ** digits
    const ticks = (variant === "ruler" ? Math.round : Math.floor)(Math.max(0, seconds) * scale)
    const whole = Math.floor(ticks / scale)
    // Seconds per minute/hour are fixed unit conversions, independent of display policy.
    const hours = Math.floor(whole / 3600)
    const minutes = Math.floor(whole / 60)
    const remaining = whole % 60
    const includeHours = config.duration.includeHours[variant]
    const pieces = includeHours
      ? [String(hours), String(minutes % 60).padStart(2, "0"), String(remaining).padStart(2, "0")]
      : [String(minutes), String(remaining).padStart(2, "0")]
    const showFraction =
      digits > 0 &&
      !(variant === "ruler" && config.duration.rulerOmitZeroFraction && ticks % scale === 0)
    return (
      pieces.join(config.duration.separator) +
      (showFraction
        ? config.duration.fractionSeparator + String(ticks % scale).padStart(digits, "0")
        : "")
    )
  }
  return {
    number,
    parseNumber,
    parseParameter: (text, { percentage = false } = {}) => {
      const value = parseNumber(text)
      return percentage ? value / 100 : value
    },
    parameter(
      value: number,
      { percentage = false, step = 1 }: { percentage?: boolean; step?: number } = {}
    ) {
      return percentage
        ? number(value * 100, "integer")
        : fixed(
            value,
            step < 1 ? config.parameter.fractionalDigits : config.parameter.integerDigits,
            true
          )
    },
    percent: (valueFraction: number) =>
      `${number(valueFraction * 100, "integer")}${config.units.percent}`,
    db,
    parseDb,
    pan,
    parsePan,
    meter: (leftDb: number, rightDb: number) =>
      config.meter
        .replaceAll("{{leftLabel}}", () => config.pan.left)
        .replaceAll("{{rightLabel}}", () => config.pan.right)
        .replaceAll("{{left}}", () => number(leftDb, "db"))
        .replaceAll("{{right}}", () => number(rightDb, "db")),
    sampleRate: (hz: number) =>
      `${fixed(hz / 1000, config.precision.viewport, true)} ${config.units.sampleRate}`,
    latency: (ms: number) => `${number(ms, "latency")} ${config.units.latency}`,
    zoom: (value: number) => `${number(value, "zoom")}${config.units.zoom}`,
    duration,
    dateTime: (timestamp: number) =>
      new Intl.DateTimeFormat(locale, config.dateTime).format(timestamp),
    accessiblePixels: (px: number) => `${number(px, "integer")} ${config.units.pixels}`,
    normalizeSearch: (text: string) => text.trim().toLocaleLowerCase(locale),
    musicalPosition: formatAudioMusicalValue,
    musicalWidthSamples: (numerator, denominator, kind) =>
      config.musicalWidthSamples.map(value =>
        formatAudioMusicalValue(value, numerator, denominator, kind)
      ),
    pitchName: (pitch: number, octaveLabelOffset: number) =>
      `${config.pitchClasses[pitch % config.pitchClasses.length]}${Math.floor(pitch / config.pitchClasses.length) + octaveLabelOffset}`,
    audioGain: (value: number) => `${number(value, "db")} ${config.units.db}`,
    get widthSamples(): DisplayConfig["widthSamples"] {
      return config.widthSamples
    },
  }
}
