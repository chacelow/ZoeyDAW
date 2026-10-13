/**
 * useInfoHover — StatusStrip 底部"信息频道"的统一数据源。
 *
 * 两个通道：
 *   - `info`：hover 一个控件时推进来，离开清掉（DragPad / DropdownButton / 任意
 *     自己接 `useInfoBinding` 的组件自动管理）
 *   - `warnings`：持久化的警告 / 提示 / 系统消息。任何地方可以 pushWarning。
 *
 * StatusStrip 的 `<InfoChannel />` 显示优先级：
 *   hover info → 没有则显示最新的 warning → 都没有则显示空
 *
 * 用法示例：
 *   useInfoHover.getState().pushWarning({
 *     id: "no-audio-device",
 *     message: "未检测到音频输出设备",
 *     severity: "warning",
 *   })
 */
import { create } from "zustand"
import type { ControlInfo } from "@zoeymind/ui"

export type WarningSeverity = "info" | "warning" | "error"

export interface InfoWarning {
  id: string
  message: string
  severity?: WarningSeverity
}

interface InfoHoverState {
  info: ControlInfo | null
  setInfo: (info: ControlInfo | null) => void

  warnings: InfoWarning[]
  pushWarning: (warning: InfoWarning) => void
  dismissWarning: (id: string) => void
  clearWarnings: () => void

  infoOpen: boolean
  setInfoOpen: (open: boolean) => void
  toggleInfo: () => void
}

export const useInfoHover = create<InfoHoverState>(set => ({
  info: null,
  setInfo: info => set(state => (state.info === info ? state : { info })),

  warnings: [],
  pushWarning: warning =>
    set(state => {
      const filtered = state.warnings.filter(w => w.id !== warning.id)
      return { warnings: [...filtered, warning] }
    }),
  dismissWarning: id => set(state => ({ warnings: state.warnings.filter(w => w.id !== id) })),
  clearWarnings: () => set({ warnings: [] }),

  infoOpen: true,
  setInfoOpen: open => set({ infoOpen: open }),
  toggleInfo: () => set(state => ({ infoOpen: !state.infoOpen })),
}))
