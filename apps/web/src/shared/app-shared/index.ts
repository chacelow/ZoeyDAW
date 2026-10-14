/**
 * app-shared — 桌面壳里跨页面复用的客户端运行时拼装。
 *
 * DAW prototype 阶段只保留与 UI 外壳直接相关的部分：
 *   - UUID / cn 工具重导出
 *   - toast / toastLoading / dismissToast 适配到 @zoeymind/ui
 *   - 主题预设 Provider + Switcher
 *   - 语言切换器
 *   - 全局 Loading Provider
 *   - 版本展示 + 更新检查 store
 *   - feature flags (localStorage 空实现)
 *
 * 已删除：云端用户 / 组织 / tRPC / mentions / code-block / analytics / settings-dialog-store。
 */

import { v4 as uuidV4 } from "uuid"
import { toast as uiToast, toastLoading as uiToastLoading } from "@zoeymind/ui"
import type { ToastOptions, ToastVariant } from "@zoeymind/ui"
import type { ReactNode } from "react"

export { cn, dismissToast } from "@zoeymind/ui"
export const createUUID: () => string = uuidV4
export const generateUUID: () => string = uuidV4

type ToastInput = string | number | ToastOptions
type ToastMethod = (
  message: string | number,
  options?: Omit<ToastOptions, "description" | "variant">
) => string
type ToastApi = ((input: ToastInput) => string) & {
  info: ToastMethod
  success: ToastMethod
  warning: ToastMethod
  error: ToastMethod
  loading: (message: string, id?: string) => string
}

function createVariantToast(variant: ToastVariant): ToastMethod {
  return (message, options) => uiToast({ ...options, description: String(message), variant })
}

export const toast = Object.assign(
  (input: ToastInput) =>
    uiToast(typeof input === "object" && input !== null ? input : String(input)),
  {
    info: createVariantToast("info"),
    success: createVariantToast("success"),
    warning: createVariantToast("warning"),
    error: createVariantToast("destructive"),
    loading: (message: string, id = `loading-${Date.now()}`) => uiToastLoading(message, id),
  }
) as ToastApi

export const toastLoading = (message: string, id = `loading-${Date.now()}`): string =>
  uiToastLoading(message, id)

export function useToast(): { toast: ToastApi } {
  return { toast }
}

export { ThemePresetProvider } from "./ThemePresetProvider"
export { useThemePreset } from "./theme-preset-context"
export { ThemeMenu } from "./ThemeMenu"
export { LanguageSwitcher } from "./LanguageSwitcher"

export { LoadingProvider } from "./loading"
export { useLoading, useLoadingStore } from "./loading-state"
export { useSettingsDialog, type SettingsSectionId } from "./settings-dialog-store"
export { useFeature, useFlags } from "./flags"

export interface AppSharedProviderProps {
  children: ReactNode
}
