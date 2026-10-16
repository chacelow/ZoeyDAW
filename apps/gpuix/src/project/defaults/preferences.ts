import defaults from "@/project/defaults/preferences.json"
import type { Preferences } from "@zoeydaw/native"

function preferenceChoice<T extends string>(value: string, choices: readonly T[], key: string): T {
  const selected = choices.find(choice => choice === value)
  if (selected === undefined) throw new TypeError(`Unsupported preference default ${key}: ${value}`)
  return selected
}

export const PREFERENCE_DEFAULTS: Preferences = {
  ...defaults,
  workspace: {
    ...defaults.workspace,
    gridMode: preferenceChoice<Preferences["workspace"]["gridMode"]>(
      defaults.workspace.gridMode,
      ["adaptive", "fixed"],
      "workspace.gridMode"
    ),
    gridDensity: preferenceChoice<Preferences["workspace"]["gridDensity"]>(
      defaults.workspace.gridDensity,
      ["widest", "wide", "medium", "narrow", "narrowest"],
      "workspace.gridDensity"
    ),
  },
  audio: {
    ...defaults.audio,
    warpMode: preferenceChoice<Preferences["audio"]["warpMode"]>(
      defaults.audio.warpMode,
      ["beats", "tones", "texture", "repitch", "complex", "complex-pro"],
      "audio.warpMode"
    ),
  },
  browser: {
    ...defaults.browser,
    kind: preferenceChoice<Preferences["browser"]["kind"]>(
      defaults.browser.kind,
      ["all", "device", "preset", "sample", "midi", "clip", "groove", "tuning", "template"],
      "browser.kind"
    ),
  },
} satisfies Preferences
