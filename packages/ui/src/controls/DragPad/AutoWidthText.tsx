/**
 * AutoWidthText — 用"ghost sizer"模式让浏览器精确测量字体宽度。
 *
 * 同一 grid cell 叠放声明的 invisible 样本；只有它们参与布局宽度。 可见值绝对定位于样本槽内，不能因当前值改变控件宽度。调用方的 widthSamples 可补充端点之外的特殊格式。 字体、字号、字距、locale 均由浏览器 text layout 测量。
 *
 * 用法:
 *   <AutoWidthText samples={[format(min), format(max)]}>{currentDisplay}</AutoWidthText>
 */
import { cn } from "#lib/utils"
import type { ReactNode } from "react"

export interface AutoWidthTextProps {
  /**
  用于测量宽度的最宽样本集(通常是 format(min) 和 format(max));会全部作为 invisible 节点并排堆叠。
  */
  readonly samples: string[]
  readonly children: ReactNode
  readonly className?: string
}

export function AutoWidthText({ samples, children, className }: AutoWidthTextProps) {
  return (
    <span
      className={cn(
        "relative inline-grid min-w-0 grid-cols-[minmax(0,1fr)] items-center justify-center",
        className
      )}
    >
      {samples.map((s, index) => (
        <span
          key={index}
          aria-hidden
          className="invisible col-start-1 row-start-1 min-w-0 overflow-hidden whitespace-pre tabular-nums"
        >
          {s}
        </span>
      ))}
      <span className="absolute inset-0 flex items-center justify-center text-center tabular-nums">
        <span className="relative max-w-full min-w-0">
          <span className="block truncate">{children}</span>
        </span>
      </span>
    </span>
  )
}
