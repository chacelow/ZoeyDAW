import { expect, test } from "bun:test"
import { createDisplayFormats } from "./display-formats"
import { getCreationNames } from "./creation-names"
import { creationNamesByLocale } from "../locales/creation-names"
import { displayConfigByLocale } from "../locales/display"
import type { SupportedLocale } from "@/platform/i18n/core"

const locales: SupportedLocale[] = ["en-US", "zh-CN"]

for (const locale of locales) {
  test(`${locale} numeric precision and MIDI trailing zeros preserve editable values`, () => {
    const formats = createDisplayFormats(locale)
    expect(formats.number(120, "bpm")).toBe("120.00")
    expect(formats.number(0.125, "fade")).toBe("0.125")
    expect(formats.number(0.125, "sourceMarker")).toBe("0.1250")
    expect(formats.number(10, "midi")).toBe("10")
    expect(formats.number(10.125, "midi")).toBe("10.125")
    expect(formats.number(10.0001, "midi")).toBe("10.0001")
    expect(formats.number(1.23456, "viewport")).toBe("1.235")
    expect(formats.parameter(0.125, { percentage: true, step: 0.01 })).toBe("13")
    expect(formats.parameter(10.125, { step: 0.01 })).toBe("10.1")
    expect(formats.percent(0.5)).toBe("50%")
    expect(formats.sampleRate(44100)).toBe("44.1 kHz")
    expect(formats.latency(5)).toBe("5.00 ms")
    expect(formats.zoom(1.25)).toBe("1.3×")
    expect(formats.widthSamples.bpm).toEqual(["999.99"])
    expect(formats.widthSamples.midi).toEqual(["1024.9375"])
    expect(
      formats.parseParameter(formats.parameter(0.25, { percentage: true }), { percentage: true })
    ).toBe(0.25)
    expect(formats.parseParameter(formats.parameter(10.1, { step: 0.1 }), { step: 0.1 })).toBe(10.1)
    expect(formats.parseNumber(" −12.5 ")).toBe(-12.5)
    expect(Number.isNaN(formats.parseNumber(""))).toBe(true)
    expect(formats.audioGain(-60)).toBe("-60.0 dB")
    expect(formats.pitchName(60, -2)).toBe("C3")
    expect(formats.pitchName(61, -1)).toBe("C#4")
    expect(formats.musicalPosition(0.5, 4, 4, "position")).toBe("1.3.1")
    expect(formats.musicalPosition(0.5, 4, 4, "duration")).toBe("0.2.0")
    expect(formats.widthSamples.audioGain).toEqual(["-60.0 dB"])
    expect(formats.musicalWidthSamples(4, 4, "position")).toEqual(["1000.4.4"])
    expect(formats.musicalWidthSamples(4, 4, "duration")).toEqual(["999.3.3"])
    expect(formats.musicalWidthSamples(3, 8, "position")).toEqual([
      formats.musicalPosition(999.9375, 3, 8, "position"),
    ])
  })

  test(`${locale} dB and pan labels round trip and accept ASCII input aliases`, () => {
    const formats = createDisplayFormats(locale)
    expect(formats.db(-Infinity)).toBe("−∞")
    expect(formats.db(-60)).toBe("−∞")
    expect(formats.db(-59.9)).toBe("-59.9")
    for (const alias of ["−∞", "-∞", "-inf", "-Infinity", "-inf dB"])
      expect(formats.parseDb(alias)).toBe(-60)
    expect(formats.parseDb(formats.db(-12.5))).toBe(-12.5)
    expect(Number.isNaN(formats.parseDb("not a value"))).toBe(true)
    expect(formats.parsePan(" C ")).toBe(0)
    expect(formats.parsePan("l100")).toBe(-1)
    expect(formats.parsePan("R 25")).toBe(0.25)
    for (const pan of [-1, -0.25, 0, 0.25, 1])
      expect(formats.parsePan(formats.pan(pan, "control"))).toBe(pan)
    expect(Number.isNaN(formats.parsePan("Lbad"))).toBe(true)
  })

  test(`${locale} duration retains hour boundaries and date policy follows Intl`, () => {
    const formats = createDisplayFormats(locale)
    expect(formats.duration(2, "transport")).toBe("0:00:02.000")
    expect(formats.duration(3661.125, "transport")).toBe("1:01:01.125")
    expect(formats.duration(61, "ruler")).toBe("1:01")
    expect(formats.duration(61.125, "ruler")).toBe("1:01.125")
    expect(formats.duration(-1, "transport")).toBe("0:00:00.000")
    const timestamp = Date.UTC(2026, 9, 16, 12, 30)
    expect(formats.dateTime(timestamp)).toBe(
      new Intl.DateTimeFormat(locale, displayConfigByLocale[locale].dateTime).format(timestamp)
    )
  })
}

test("existing formatter and creation-name instances follow injected mutable display sources", () => {
  const config = structuredClone(displayConfigByLocale["en-US"])
  const formats = createDisplayFormats("en-US", config)
  config.precision.bpm = 3
  config.widthSamples.bpm = ["999.999"]
  config.pan.center = "Center"
  config.dateTime = { year: "numeric" }
  config.musicalWidthSamples = [0.5]
  expect(formats.number(120, "bpm")).toBe("120.000")
  expect(formats.widthSamples.bpm).toEqual(["999.999"])
  expect(formats.pan(0, "control")).toBe("Center")
  expect(formats.parsePan("Center")).toBe(0)
  expect(formats.dateTime(Date.UTC(2026, 0, 1))).toBe("2026")
  expect(formats.musicalWidthSamples(4, 4, "position")).toEqual(["1.3.1"])
  const source = structuredClone(creationNamesByLocale["en-US"])
  const names = getCreationNames("en-US", source)
  source.project = "Fresh session"
  source.track.audio = "Audio {{count}}"
  source.copy = "Copy of {{name}}"
  expect(names.project).toBe("Fresh session")
  expect(names.track("audio", 4)).toBe("Audio 4")
  expect(names.copy("voice.wav")).toBe("Copy of voice.wav")
  for (const original of ["voice $&.wav", "voice $$ $` $'"]) {
    expect(names.copy(original)).toBe(`Copy of ${original}`)
  }
})

test("duration hour segments follow each variant's source", () => {
  const base = displayConfigByLocale["en-US"]
  const config = {
    ...base,
    duration: { ...base.duration, includeHours: { ruler: false, transport: true } },
  }
  const formats = createDisplayFormats("en-US", config)
  expect(formats.duration(3661.125, "ruler")).toBe("61:01.125")
  expect(formats.duration(3661.125, "transport")).toBe("1:01:01.125")
  config.duration.includeHours = { ruler: true, transport: false }
  expect(formats.duration(3661.125, "ruler")).toBe("1:01:01.125")
  expect(formats.duration(3661.125, "transport")).toBe("61:01.125")
})

test("gain unit parsing treats configured labels as literal text", () => {
  const config = structuredClone(displayConfigByLocale["en-US"])
  config.units.db = "dB(A)"
  const formats = createDisplayFormats("en-US", config)
  expect(formats.parseDb(formats.audioGain(-12.5))).toBe(-12.5)
  expect(Number.isNaN(formats.parseDb("not a level dB(A)"))).toBe(true)
})

test.each(["control", "automation"] as const)(
  "%s pan presentation keeps its own threshold and spacing source",
  variant => {
    const base = structuredClone(displayConfigByLocale["en-US"])
    const config = {
      ...base,
      pan: {
        ...base.pan,
        center: "center",
        left: "left",
        right: "right",
        variants: {
          control: { centerThreshold: 0, separator: "" },
          automation: { centerThreshold: 0.005, separator: " " },
        },
      },
    }
    const formats = createDisplayFormats("en-US", config)
    expect(formats.pan(0, variant)).toBe("center")
    expect(formats.pan(0.004, variant)).toBe(variant === "control" ? "right0" : "center")
    expect(formats.pan(-0.25, variant)).toBe(variant === "control" ? "left25" : "left 25")
    config.pan.variants[variant].centerThreshold = 0.02
    expect(formats.pan(0.01, variant)).toBe("center")
    config.pan.variants[variant].separator = "/"
    expect(formats.pan(0.25, variant)).toBe("right/25")
  }
)

test("pan parsing retains directly entered normalized numbers", () => {
  const formats = createDisplayFormats("en-US")
  expect(formats.parsePan("0.25")).toBe(0.25)
  expect(formats.parsePan("-0.5")).toBe(-0.5)
})
