import { fileURLToPath } from "node:url"
import { runMutations } from "./mutation-runner.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const preload = fileURLToPath(new URL("./mutation-preload.ts", import.meta.url))
const mutations = [
  [
    "automation-db-unit-omitted",
    "../lane/interactions/automation/ValueEditor/index.tsx",
    "formats.db(source, { unit: true })",
    "formats.db(source)",
    "automation",
  ],
  [
    "automation-pan-wrong-variant",
    "../lane/interactions/automation/ValueEditor/index.tsx",
    'formats.pan(source, "automation")',
    'formats.pan(source, "control")',
    "automation",
  ],
  [
    "automation-pan-local-parser",
    "../lane/interactions/automation/ValueEditor/index.tsx",
    "formats.parsePan(trimmed)",
    "Number(trimmed)",
    "automation",
  ],
  [
    "automation-db-local-parser",
    "../lane/interactions/automation/ValueEditor/index.tsx",
    "formats.parseDb(trimmed)",
    "Number(trimmed)",
    "automation",
  ],
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
    'format={value => formats.pan(value, "control")}',
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
  [
    "monitor-local-aria",
    "../tracks/TrackRouting/index.tsx",
    "monitorModes[mode]",
    "mode",
    "tracks",
  ],
  [
    "monitor-local-on-caption",
    "../tracks/TrackRouting/index.tsx",
    "labelOn={monitorShortNames[mode]}",
    "labelOn={mode}",
    "tracks",
  ],
  [
    "monitor-local-off-caption",
    "../tracks/TrackRouting/index.tsx",
    "labelOff={monitorShortNames[mode]}",
    "labelOff={mode}",
    "tracks",
  ],
].map(([name, file, from, to, suite]) => ({ name, file, from, to, suite }))

runMutations({
  root,
  preload,
  suites: {
    automation: {
      files: ["../lane/interactions/controller.test.tsx"],
      pattern: "injected display and parsing sources",
    },
    tracks: {
      files: ["../tracks/formatting.test.tsx", "../tracks/meter/TrackMeter.test.tsx"],
      pattern: "injected sources|injected numeric display policy",
    },
  },
  mutations,
})
