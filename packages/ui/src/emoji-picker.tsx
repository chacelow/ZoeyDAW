"use client"

import { EmojiPicker as EmojiPickerPrimitive } from "frimousse"
import { LoaderIcon, SearchIcon } from "lucide-react"
import { cn } from "#lib/utils"
import type {
  EmojiPickerListCategoryHeaderProps,
  EmojiPickerListEmojiProps,
  EmojiPickerListRowProps,
} from "frimousse"
import type * as React from "react"

/**
 * Styled emoji picker (Frimousse + 主题 token)。
 * 典型用法：套在 Popover 里，Root 的 onEmojiSelect={({emoji}) => ...} 拿到选中表情。
 *   <EmojiPicker onEmojiSelect={...}><EmojiPickerSearch /><EmojiPickerContent /></EmojiPicker>
 */
function EmojiPicker({
  className,
  ...properties
}: React.ComponentProps<typeof EmojiPickerPrimitive.Root>) {
  return (
    <EmojiPickerPrimitive.Root
      className={cn(
        "bg-popover text-popover-foreground isolate flex h-full w-fit flex-col overflow-hidden rounded-md",
        className
      )}
      data-slot="emoji-picker"
      {...properties}
    />
  )
}

function EmojiPickerSearch({
  className,
  ...properties
}: React.ComponentProps<typeof EmojiPickerPrimitive.Search>) {
  return (
    <div
      className={cn("flex h-9 items-center gap-2 border-b px-3", className)}
      data-slot="emoji-picker-search-wrapper"
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <EmojiPickerPrimitive.Search
        className="placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
        data-slot="emoji-picker-search"
        {...properties}
      />
    </div>
  )
}

function EmojiPickerRow({ children, ...properties }: EmojiPickerListRowProps) {
  return (
    <div {...properties} className="scroll-my-1 px-1" data-slot="emoji-picker-row">
      {children}
    </div>
  )
}

function EmojiPickerEmoji({ emoji, className, ...properties }: EmojiPickerListEmojiProps) {
  return (
    <button
      type="button"
      {...properties}
      className={cn(
        "data-[active]:bg-accent flex size-7 items-center justify-center rounded-sm text-base",
        className
      )}
      data-slot="emoji-picker-emoji"
    >
      {emoji.emoji}
    </button>
  )
}

function EmojiPickerCategoryHeader({
  category,
  ...properties
}: EmojiPickerListCategoryHeaderProps) {
  return (
    <div
      {...properties}
      className="bg-popover text-muted-foreground px-3 pt-3.5 pb-2 text-xs leading-none"
      data-slot="emoji-picker-category-header"
    >
      {category.label}
    </div>
  )
}

function EmojiPickerContent({
  className,
  ...properties
}: React.ComponentProps<typeof EmojiPickerPrimitive.Viewport>) {
  return (
    <EmojiPickerPrimitive.Viewport
      className={cn("relative flex-1 outline-hidden", className)}
      data-slot="emoji-picker-viewport"
      {...properties}
    >
      <EmojiPickerPrimitive.Loading
        className="text-muted-foreground absolute inset-0 flex items-center justify-center"
        data-slot="emoji-picker-loading"
      >
        <LoaderIcon className="size-4 animate-spin" />
      </EmojiPickerPrimitive.Loading>
      <EmojiPickerPrimitive.Empty
        className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm"
        data-slot="emoji-picker-empty"
      >
        没有找到表情
      </EmojiPickerPrimitive.Empty>
      <EmojiPickerPrimitive.List
        className="pb-1 select-none"
        components={{
          Row: EmojiPickerRow,
          Emoji: EmojiPickerEmoji,
          CategoryHeader: EmojiPickerCategoryHeader,
        }}
        data-slot="emoji-picker-list"
      />
    </EmojiPickerPrimitive.Viewport>
  )
}

function EmojiPickerFooter({ className, ...properties }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex w-full max-w-(--frimousse-viewport-width) min-w-0 items-center gap-1 border-t p-2",
        className
      )}
      data-slot="emoji-picker-footer"
      {...properties}
    >
      <EmojiPickerPrimitive.ActiveEmoji>
        {({ emoji }) =>
          emoji ? (
            <>
              <div className="flex size-7 flex-none items-center justify-center text-lg">
                {emoji.emoji}
              </div>
              <span className="text-secondary-foreground truncate text-xs">{emoji.label}</span>
            </>
          ) : (
            <span className="text-muted-foreground ml-1.5 flex h-7 items-center truncate text-xs">
              选择一个表情…
            </span>
          )
        }
      </EmojiPickerPrimitive.ActiveEmoji>
    </div>
  )
}

export { EmojiPicker, EmojiPickerSearch, EmojiPickerContent, EmojiPickerFooter }
