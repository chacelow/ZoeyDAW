import * as React from "react"
import { cn } from "./cn"
import { Button } from "./button"
import type { ButtonProps as ButtonProperties } from "./button"

/**
 * FloatingToolbar 现在是"Header 内联工具栏"的极薄包装 —— 保留 API 表面
 * (旧代码继续能用), 内部一律走通用 `Button` (`variant="ghost"`, 默认 `size="icon-sm"`).
 * 之前的黑底白字 pill 样式退役.
 */

interface FloatingToolbarProperties extends React.HTMLAttributes<HTMLDivElement> {
  readonly position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom"
}

interface FloatingToolbarGroupProperties extends React.HTMLAttributes<HTMLDivElement> {
  readonly orientation?: "horizontal" | "vertical"
}

interface FloatingToolbarSeparatorProperties extends React.HTMLAttributes<HTMLDivElement> {
  readonly orientation?: "horizontal" | "vertical"
}

interface FloatingToolbarButtonProperties extends Omit<ButtonProperties, "variant" | "size"> {
  readonly active?: boolean
  /**
  兼容旧 API: 'default' | 'outline' | 'ghost'; 内部映射到通用 Button variant.
  */
  readonly variant?: "default" | "outline" | "ghost"
  /**
  兼容旧 API: 'sm' | 'md' | 'lg'; 内部映射到通用 Button size.
  */
  readonly size?: "sm" | "md" | "lg"
}

interface FloatingToolbarContentProperties extends React.HTMLAttributes<HTMLDivElement> {
  readonly isActive?: boolean
}

const positionClasses = {
  "top-left": "",
  "top-right": "",
  "bottom-left": "fixed bottom-4 left-4",
  "bottom-right": "fixed bottom-4 right-4",
  custom: "",
} as const

const FloatingToolbar = React.forwardRef<HTMLDivElement, FloatingToolbarProperties>(
  ({ position = "top-left", children, className, ...properties }, reference) => (
    <div
      ref={reference}
      className={cn(
        "z-10 flex items-center gap-0.5",
        position === "custom" ? "" : positionClasses[position],
        className
      )}
      {...properties}
    >
      {children}
    </div>
  )
)
FloatingToolbar.displayName = "FloatingToolbar"

const FloatingToolbarGroup = React.forwardRef<HTMLDivElement, FloatingToolbarGroupProperties>(
  ({ children, className, orientation = "horizontal", ...properties }, reference) => (
    <div
      ref={reference}
      className={cn(
        "text-foreground flex items-center gap-0.5",
        orientation === "vertical" && "flex-col",
        className
      )}
      {...properties}
    >
      {children}
    </div>
  )
)
FloatingToolbarGroup.displayName = "FloatingToolbarGroup"

const FloatingToolbarSeparator = React.forwardRef<
  HTMLDivElement,
  FloatingToolbarSeparatorProperties
>(({ orientation = "vertical", className, ...properties }, reference) => {
  return (
    <div
      ref={reference}
      className={cn(
        orientation === "vertical" ? "bg-border mx-1 h-4 w-px" : "bg-border my-1 h-px w-4",
        className
      )}
      {...properties}
    />
  )
})
FloatingToolbarSeparator.displayName = "FloatingToolbarSeparator"

// 旧 sm/md/lg 语义 → 通用 Button 尺寸
const SIZE_MAP: Record<
  NonNullable<FloatingToolbarButtonProperties["size"]>,
  ButtonProperties["size"]
> = {
  sm: "icon-xs",
  md: "icon-sm",
  lg: "icon",
}

const FloatingToolbarButton = React.forwardRef<HTMLButtonElement, FloatingToolbarButtonProperties>(
  ({ active = false, variant = "default", size = "md", className, ...properties }, reference) => {
    return (
      <Button
        ref={reference}
        variant={variant === "outline" ? "outline" : "ghost"}
        size={SIZE_MAP[size]}
        data-active={active || undefined}
        className={cn("[&_svg]:size-4", active && "bg-accent text-accent-foreground", className)}
        {...properties}
      />
    )
  }
)
FloatingToolbarButton.displayName = "FloatingToolbarButton"

const FloatingToolbarContent = React.forwardRef<HTMLDivElement, FloatingToolbarContentProperties>(
  ({ children, className, isActive = false, ...properties }, reference) => {
    if (!isActive) {
      return null
    }
    return (
      <div
        ref={reference}
        className={cn(
          "bg-card text-card-foreground overflow-hidden rounded-lg shadow-lg",
          "animate-in fade-in-0 zoom-in-95 duration-200",
          className
        )}
        {...properties}
      >
        {children}
      </div>
    )
  }
)
FloatingToolbarContent.displayName = "FloatingToolbarContent"

export {
  FloatingToolbar,
  FloatingToolbarGroup,
  FloatingToolbarSeparator,
  FloatingToolbarButton,
  FloatingToolbarContent,
}
