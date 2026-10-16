import { fileURLToPath } from "node:url"
import { runMutations } from "./mutation-runner.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const preload = fileURLToPath(new URL("./mutation-preload.ts", import.meta.url))
const mutations = [
  [
    "mixer-db-local-precision",
    "../tracks/TrackMixer/index.tsx",
    "format={formats.db}",
    'format={value => value <= -60 ? "−∞" : value.toFixed(1)}',
    "tracks",
  ],
  [
    "mixer-pan-local-display",
    "../tracks/TrackMixer/index.tsx",
    "format={formats.pan}",
    'format={value => value === 0 ? "C" : (value < 0 ? "L" : "R") + Math.round(Math.abs(value) * 100)}',
    "tracks",
  ],
  [
    "mixer-pan-local-parser",
    "../tracks/TrackMixer/index.tsx",
    "parse={formats.parsePan}",
    'parse={raw => { const text = raw.trim().toUpperCase(); if (text === "C") return 0; if (text.startsWith("L")) return -Number(text.slice(1)) / 100; return text.startsWith("R") ? Number(text.slice(1)) / 100 : Number(text) }}',
    "tracks",
  ],
  [
    "meter-local-readout",
    "../tracks/meter/TrackMeter.tsx",
    "formats.meter(display.left, display.right)",
    '"L " + display.left.toFixed(1) + " dB, R " + display.right.toFixed(1) + " dB"',
    "tracks",
  ],
  ["monitor-local-aria", "../tracks/TrackRouting/index.tsx", `\${modeLabel}`, `\${mode}`, "tracks"],
  [
    "monitor-local-on-caption",
    "../tracks/TrackRouting/index.tsx",
    "labelOn={modeLabel}",
    "labelOn={mode}",
    "tracks",
  ],
  [
    "monitor-local-off-caption",
    "../tracks/TrackRouting/index.tsx",
    "labelOff={modeLabel}",
    "labelOff={mode}",
    "tracks",
  ],
  [
    "toolbar-local-rounding",
    "../timeline/toolbar/index.tsx",
    'labels.formats.number(pxPerBar, "integer")',
    "pxPerBar.toFixed(0)",
    "timeline",
  ],
  [
    "time-ruler-wrong-variant",
    "../timeline/rulers/index.tsx",
    'formats.duration(tick.value, "ruler")',
    'formats.duration(tick.value, "transport")',
    "timeline",
  ],
].map(([name, file, from, to, suite]) => ({ name, file, from, to, suite }))

runMutations({
  root,
  preload,
  suites: {
    tracks: {
      files: ["../tracks/formatting.test.tsx", "../tracks/meter/TrackMeter.test.tsx"],
      pattern: "injected sources|injected numeric display policy",
    },
    timeline: {
      files: ["../timeline/style-layout.test.tsx"],
      pattern: "injected display precision",
    },
  },
  mutations,
})
