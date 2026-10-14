"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "#lib/utils"

/**
 * Progress —— base-ui progress 三段结构 (Root/Track/Indicator).
 *
 * 我们保留原有 `<Progress value className />` 消费形态: Root 是一个 flex 容器,
 * 内嵌 Track (background 条) 和 Indicator (前景). 消费方外层 className 走到 Track
 * 上以保持"高度/圆角"的自定义能落到实际视觉条上.
 */
function Progress({ className, value, ...properties }: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root data-slot="progress" value={value} {...properties}>
      <ProgressPrimitive.Track
        data-slot="progress-track"
        className={cn(
          "bg-muted relative flex h-1 w-full items-center overflow-x-hidden rounded-full",
          className
        )}
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="bg-primary size-full flex-1 transition-all"
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...properties }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        "bg-muted relative flex h-1 w-full items-center overflow-x-hidden rounded-full",
        className
      )}
      data-slot="progress-track"
      {...properties}
    />
  )
}

function ProgressIndicator({ className, ...properties }: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn("bg-primary h-full transition-all", className)}
      {...properties}
    />
  )
}

function ProgressLabel({ className, ...properties }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      className={cn("text-sm font-medium", className)}
      data-slot="progress-label"
      {...properties}
    />
  )
}

function ProgressValue({ className, ...properties }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn("text-muted-foreground ml-auto text-sm tabular-nums", className)}
      data-slot="progress-value"
      {...properties}
    />
  )
}

export { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue }
