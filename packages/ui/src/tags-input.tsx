"use client"

import * as React from "react"
import { X } from "lucide-react"

import { cn } from "#lib/utils"
import { Badge } from "#components/badge"

export interface TagsInputProps {
  /**
  当前标签列表
  */
  readonly value: string[]
  /**
  标签变化回调
  */
  readonly onChange: (tags: string[]) => void
  readonly placeholder?: string
  readonly disabled?: boolean
  /**
  提交前校验单个标签，返回 false 则拒绝加入
  */
  readonly validate?: (tag: string) => boolean
  /**
  触发"提交为标签"的按键，默认回车与逗号
  */
  readonly addKeys?: string[]
  readonly className?: string
  readonly inputClassName?: string
  readonly "aria-label"?: string
}

/**
 * TagsInput — 标签输入框（自由输入 + 回车成 chip）。
 *
 * shadcn/ui (React) 官方无此组件，按设计系统用 Badge + input 组合实现，
 * 复用 token 与聚焦态，行为对齐 shadcn 输入控件。
 */
function TagsInput({
  value,
  onChange,
  placeholder,
  disabled,
  validate,
  addKeys = ["Enter", ","],
  className,
  inputClassName,
  "aria-label": ariaLabel,
}: TagsInputProps) {
  const [input, setInput] = React.useState("")
  const inputReference = React.useRef<HTMLInputElement>(null)

  const addTag = (raw: string): void => {
    const tag = raw.trim().replace(/,+$/, "").trim()
    if (!tag) {
      return
    }
    if (validate && !validate(tag)) {
      return
    }
    if (value.includes(tag)) {
      setInput("")
      return
    }
    onChange([...value, tag])
    setInput("")
  }

  const removeTag = (tag: string): void => onChange(value.filter(t => t !== tag))

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (addKeys.includes(e.key)) {
      e.preventDefault()
      addTag(input)
    } else if (e.key === "Backspace" && input.length === 0) {
      const lastTag = value.at(-1)
      if (lastTag !== undefined) removeTag(lastTag)
    }
  }

  return (
    <div
      data-slot="tags-input"
      data-disabled={disabled || undefined}
      onPointerDown={event => {
        if (event.target instanceof Element && event.target.closest("button")) return
        inputReference.current?.focus()
      }}
      className={cn(
        "border-input focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2.5 py-1.5 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-within:ring-[3px] data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
    >
      {value.map(tag => (
        <Badge key={tag} variant="secondary" className="max-w-full gap-1 pr-1 font-normal">
          <span className="truncate">{tag}</span>
          {!disabled && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Remove ${tag}`}
              onClick={e => {
                e.stopPropagation()
                removeTag(tag)
              }}
              className="text-muted-foreground rounded-sm opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          )}
        </Badge>
      ))}
      <input
        ref={inputReference}
        value={input}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(input)}
        placeholder={value.length === 0 ? placeholder : undefined}
        className={cn(
          "placeholder:text-muted-foreground min-w-[80px] flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed",
          inputClassName
        )}
      />
    </div>
  )
}

export { TagsInput }
