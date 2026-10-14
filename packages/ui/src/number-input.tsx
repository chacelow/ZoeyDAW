"use client"

import * as React from "react"
import { Minus, Plus } from "lucide-react"
import { Button } from "./button"
import { Input } from "./input"
import { cn } from "./cn"

export interface NumberInputProps {
  readonly value: number | undefined | ""
  readonly onChange: (value: number | undefined) => void
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly className?: string
  /**
  输入框的高度类名，默认 h-9
  */
  readonly inputClassName?: string
  /**
  是否显示增减按钮，默认 true
  */
  readonly showControls?: boolean
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      step = 1,
      placeholder = "0",
      disabled = false,
      className,
      inputClassName,
      showControls = true,
    },
    reference
  ) => {
    const handleIncrement = () => {
      const currentValue = typeof value === "number" ? value : 0
      const newValue = currentValue + step
      if (max !== undefined && newValue > max) {
        return
      }
      onChange(newValue)
    }

    const handleDecrement = () => {
      const currentValue = typeof value === "number" ? value : 0
      const newValue = currentValue - step
      if (min !== undefined && newValue < min) {
        return
      }
      onChange(newValue)
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value
      if (inputValue === "") {
        onChange(undefined)
        return
      }
      const numberValue = Number(inputValue)
      if (isNaN(numberValue)) {
        return
      }
      // 不在输入时限制范围，让用户可以自由输入
      onChange(numberValue)
    }

    const handleBlur = () => {
      // 在失焦时限制范围
      if (typeof value !== "number") {
        return
      }
      let clampedValue = value
      if (min !== undefined && value < min) {
        clampedValue = min
      }
      if (max !== undefined && value > max) {
        clampedValue = max
      }
      if (clampedValue !== value) {
        onChange(clampedValue)
      }
    }

    if (!showControls) {
      return (
        <Input
          ref={reference}
          type="number"
          value={value ?? ""}
          onChange={handleInputChange}
          onBlur={handleBlur}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("text-center", inputClassName, className)}
        />
      )
    }

    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleDecrement}
          disabled={
            disabled || (min !== undefined && (typeof value === "number" ? value : 0) <= min)
          }
          className="size-7 flex-shrink-0"
        >
          <Minus className="size-3" />
        </Button>
        <Input
          ref={reference}
          type="number"
          value={value ?? ""}
          onChange={handleInputChange}
          onBlur={handleBlur}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "h-7 [appearance:textfield] text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            inputClassName
          )}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleIncrement}
          disabled={
            disabled || (max !== undefined && (typeof value === "number" ? value : 0) >= max)
          }
          className="size-7 flex-shrink-0"
        >
          <Plus className="size-3" />
        </Button>
      </div>
    )
  }
)

NumberInput.displayName = "NumberInput"

export { NumberInput }
