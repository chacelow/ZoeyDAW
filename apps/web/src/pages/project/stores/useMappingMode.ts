/**
 * useMappingMode — "新手引导 / Automation 映射 / MIDI 学习"模式。
 *
 * 开启后，所有声明 `mappable` 的控件会脉冲高亮，提示用户"可以把 automation
 * 或 MIDI 绑到我这里来"。Ableton 的 MIDI Map / Key Map / Automation Arm 都
 * 是这种交互模式。
 *
 * `kind` 可选，用来区分不同类型的映射目标（automation / midi / key）；
 * 调用方可用 `kind` 对 mappable 做二次过滤（本轮先不做，默认 "any"）。
 */
import { create } from "zustand"

export type MappingKind = "automation" | "midi" | "key" | "any"

interface MappingModeState {
  active: boolean
  kind: MappingKind
  setActive: (active: boolean) => void
  setKind: (kind: MappingKind) => void
  toggle: () => void
}

export const useMappingMode = create<MappingModeState>(set => ({
  active: false,
  kind: "any",
  setActive: active => set({ active }),
  setKind: kind => set({ kind }),
  toggle: () => set(state => ({ active: !state.active })),
}))
