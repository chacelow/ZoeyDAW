import { cva } from "class-variance-authority"
import type { FocusEventHandler, ReactNode } from "react"

export const audioControlVariants = cva("gap-control-gap flex min-w-0 flex-col", {
  variants: {
    variant: {
      field: "",
      toggle: "",
      select: "",
      display: "",
    },
  },
  defaultVariants: {
    variant: "field",
  },
})

export function AudioControl({
  label,
  variant = "field",
  children,
  onFocusCapture,
}: {
  readonly label: string
  readonly variant?: "field" | "toggle" | "select" | "display"
  readonly children: ReactNode
  readonly onFocusCapture?: FocusEventHandler<HTMLDivElement>
}) {
  return (
    <div
      className={audioControlVariants({ variant })}
      data-audio-control={variant}
      onFocusCapture={onFocusCapture}
    >
      <span className="text-muted-foreground min-w-0 truncate">{label}</span>
      <div className="flex min-w-0 [&>button]:w-full">{children}</div>
    </div>
  )
}
