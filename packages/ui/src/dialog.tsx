"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"

import { cn } from "#lib/utils"
import { Button } from "#components/button"

function Dialog({ ...properties }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...properties} />
}

function DialogTrigger({ ...properties }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...properties} />
}

function DialogPortal({ ...properties }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...properties} />
}

function DialogClose({ ...properties }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...properties} />
}

function DialogOverlay({ className, ...properties }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...properties}
    />
  )
}

/**
 * DialogContent 宽度分级（仅对 variant=center 生效）。 用 sm: 前缀覆盖 base-ui/基础的窄宽，业务侧传 size 而非手写 sm:max-w-*（易漏前缀）。 sm  重命名/单字段小表单 · md 默认 · lg 中表单 · xl 复杂多字段表单（提 bug 等） · 2xl 超大
 */
const DIALOG_SIZE_MAX_WIDTH: Record<"sm" | "md" | "lg" | "xl" | "2xl", string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  "2xl": "sm:max-w-6xl",
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  variant = "center",
  size = "sm",
  ...properties
}: DialogPrimitive.Popup.Props & {
  readonly showCloseButton?: boolean
  /**
  center: 居中对话框（默认）。fullscreen: 顶铺全屏覆盖层（OpenAI 风格套餐页）。
  */
  readonly variant?: "center" | "fullscreen"
  /**
   * 宽度分级（仅 center 生效）。默认 sm（兼容历史窄弹框）。 复杂表单用 lg/xl；一句话确认保持 sm。fullscreen 忽略此项。
   */
  readonly size?: "sm" | "md" | "lg" | "xl" | "2xl"
}) {
  const positionClass =
    variant === "fullscreen"
      ? "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-popover text-sm text-popover-foreground outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-2 data-closed:animate-out data-closed:fade-out-0"
      : cn(
          "bg-popover text-popover-foreground ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl p-4 text-sm ring-1 duration-100 outline-none",
          DIALOG_SIZE_MAX_WIDTH[size]
        )
  return (
    <DialogPortal>
      {variant === "center" && <DialogOverlay />}
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(positionClass, className)}
        {...properties}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button variant="ghost" className="absolute top-2 right-2 z-10" size="icon-sm">
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            }
          />
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...properties }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...properties}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...properties
}: React.ComponentProps<"div"> & {
  readonly showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "bg-muted/50 -mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...properties}
    >
      {children}
      {showCloseButton ? (
        <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>
      ) : null}
    </div>
  )
}

function DialogTitle({ className, ...properties }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("cn-font-heading text-base leading-none font-medium", className)}
      {...properties}
    />
  )
}

function DialogDescription({ className, ...properties }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3",
        className
      )}
      {...properties}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
