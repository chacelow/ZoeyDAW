"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "#lib/utils"

/**
 * Select — 在 Base UI `Select.Root` 之上补一层 `items` 自动推导。
 *
 * Base UI 规定：不传 `items` 时，trigger 上的 `<SelectValue>` 只显示**原始 value**，
 * 与 `<SelectItem>` 渲染了什么文案无关。于是每个调用点都得手写一份 value→label
 * 映射，漏写就把 `ADMIN` / `NOT_EXECUTED` / 一串 cuid 直接甩给用户看。
 *
 * 这里改为从 children 里的 `<SelectItem>` 自动收集 `{ value, label }`：调用点照常
 * 只写 JSX，trigger 自然显示选中项的文案。显式传 `items` 时以传入的为准。
 */
function Select<Value>({ items, children, ...properties }: SelectPrimitive.Root.Props<Value>) {
  const derived = React.useMemo(() => items ?? collectSelectItems(children), [items, children])

  return (
    <SelectPrimitive.Root items={derived} {...properties}>
      {children}
    </SelectPrimitive.Root>
  )
}

/**
 * 深度遍历 children，把每个 `<SelectItem value=… >label</SelectItem>` 收成映射表。
 *
 * 递归是必要的：item 通常裹在 `<SelectContent>`（有时再套 `<SelectGroup>`）里。
 * 遇到函数组件不展开 —— 未渲染的元素树取不到其输出，此时调用点仍需显式传 `items`。
 */
function collectSelectItems(
  children: React.ReactNode
): { label: React.ReactNode; value: unknown }[] {
  const out: { label: React.ReactNode; value: unknown }[] = []

  const walk = (node: React.ReactNode): void => {
    React.Children.forEach(node, child => {
      if (!React.isValidElement(child)) {
        return
      }
      const properties = child.props as {
        value?: unknown
        children?: React.ReactNode
      }

      if (child.type === SelectItem && properties.value !== undefined) {
        out.push({ value: properties.value, label: properties.children })
        return
      }
      if (properties.children !== undefined) {
        walk(properties.children)
      }
    })
  }

  walk(children)
  return out
}

function SelectGroup({ className, ...properties }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...properties}
    />
  )
}

function SelectValue({ className, ...properties }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...properties}
    />
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...properties
}: SelectPrimitive.Trigger.Props & {
  readonly size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "border-input hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex w-fit cursor-pointer items-center justify-between gap-1.5 rounded-lg border bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent aria-invalid:ring-3 data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...properties}
    >
      {children}
      <SelectPrimitive.Icon
        render={<ChevronDownIcon className="text-muted-foreground pointer-events-none size-4" />}
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...properties
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          data-portal-layer=""
          className={cn(
            "cn-menu-target cn-menu-translucent bg-popover text-popover-foreground ring-foreground/10 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg shadow-md ring-1 duration-100 data-[align-trigger=true]:animate-none",
            className
          )}
          {...properties}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...properties }: SelectPrimitive.GroupLabel.Props) {
  // base-ui Select.GroupLabel 必须包在 Select.Group 里. 内建一层 Group 兼容 Radix 原 API.
  return (
    <SelectPrimitive.Group>
      <SelectPrimitive.GroupLabel
        data-slot="select-label"
        className={cn("text-muted-foreground px-1.5 py-1 text-xs", className)}
        {...properties}
      />
    </SelectPrimitive.Group>
  )
}

function SelectItem({ className, children, ...properties }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "hover:bg-accent hover:text-accent-foreground hover:**:text-accent-foreground focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground relative flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...properties}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({ className, ...properties }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...properties}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...properties
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "bg-popover top-0 z-10 flex w-full cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...properties}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...properties
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bg-popover bottom-0 z-10 flex w-full cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...properties}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
