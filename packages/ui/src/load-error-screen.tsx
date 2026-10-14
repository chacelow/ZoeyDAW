/**
 * LoadErrorScreen —— 加载失败的全屏页, 视觉上和 Loading 是同一系.
 *
 * 用于文件损坏 / 无法读取 / 磁盘缺失等场景, 取代之前的小 Card overlay.
 * 布局: 品牌 logo + AlertTriangle + 错误 title + 详细说明 + 主/次操作按钮.
 * 只覆盖 titlebar 下方 (top-10 inset-x-0 bottom-0), 与 Loading 一致.
 */
import { AlertTriangle } from "lucide-react"
import { AnimatedGridPattern } from "./animated-grid-pattern"
import { Button } from "./button"
import { useTheme } from "./hooks/useTheme"
import type { FC, ReactNode } from "react"

export interface LoadErrorScreenProps {
  readonly title: string
  readonly description?: string
  /**
  主按钮 (primary): 建议用户点的动作, 通常"重试"/"使用默认模板"
  */
  readonly primaryLabel: string
  readonly onPrimary: () => void
  /**
  次按钮 (outline): 备选动作, 通常"从快照恢复"/"返回列表"
  */
  readonly secondaryLabel?: string
  readonly onSecondary?: () => void
  readonly className?: string
  readonly children?: ReactNode
}

export const LoadErrorScreen: FC<LoadErrorScreenProps> = ({
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  className = "",
  children,
}) => {
  const { resolvedTheme } = useTheme()

  return (
    <div
      className={`bg-background fixed inset-x-0 top-10 bottom-0 z-30 flex flex-col items-center justify-center ${className} `}
      style={{ isolation: "isolate" }}
    >
      <AnimatedGridPattern
        className="opacity-30"
        width={40}
        height={40}
        numSquares={30}
        maxOpacity={0.2}
        duration={3}
      />
      <div className="relative z-10 flex max-w-md flex-col items-center px-6">
        <div className="mb-6">
          <img
            src={`/brand/logo-color-${resolvedTheme}.svg`}
            alt="ZoeyMind"
            className="h-12 w-auto opacity-60"
            loading="eager"
            decoding="sync"
          />
        </div>

        <div className="bg-destructive/10 mb-4 flex size-12 items-center justify-center rounded-full">
          <AlertTriangle className="text-destructive size-6" />
        </div>

        <h2 className="text-foreground mb-2 text-lg font-semibold select-text">{title}</h2>
        {description ? (
          <p className="text-muted-foreground mb-6 text-center text-sm break-words select-text">
            {description}
          </p>
        ) : null}

        {children}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {secondaryLabel && onSecondary ? (
            <Button variant="outline" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          ) : null}
          <Button onClick={onPrimary}>{primaryLabel}</Button>
        </div>
      </div>
    </div>
  )
}
