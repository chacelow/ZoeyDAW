/**
 * DateSelector — 仓库统一的日期/区间/月/季/半年/年选择器.
 *
 * 来源: reui @reui/date-selector (registry). 二次改造:
 *   1. 删除 `IconPlaceholder` (reui 特有), 图标改用 `lucide-react` (仓库红线 #3).
 *   2. 删除 hardcoded `DEFAULT_DATE_SELECTOR_I18N` 英文默认常量; 所有 label / 月份
 *      / 星期 / 季度 / 半年名 走 `@zoeymind/i18n` 的 `common.dateSelector.*` 键,
 *      内部通过 `useTranslation()` 拉, 消费方无需再传 i18n prop (仓库红线 #5).
 *   3. `i18n` prop 保留成"局部覆盖", 只覆盖具体字段 (`{ selectDate: '...' }`),
 *      未提供的字段回退到当前语言的默认值.
 *   4. 依赖已在 packages/ui 装齐 (date-fns/react-day-picker/tabs/scroll-area/input),
 *      无需 shadcn CLI 拉附加原语.
 *
 * 消费入口 (从 @zoeymind/ui 直接 import):
 *   - `DateSelector` — 大而全的选择面板 (放在 Popover / Dialog 内).
 *   - `DateSelectorPopover` — trigger + Popover 一体的常用形态.
 *   - `useDateSelector` — 底层状态 hook, 高级消费方自造 UI 时用.
 *
 * 类型: `DateSelectorValue` / `DateSelectorPeriodType` / `DateSelectorFilterType`.
 */
"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import {
  addMonths,
  endOfMonth,
  endOfYear,
  format,
  isBefore,
  isSameMonth,
  parse,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns"
import {
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  CornerUpRight,
  X as XIcon,
  Calendar as CalendarIcon,
} from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { Button } from "#components/button"
import { Calendar, CalendarDayButton } from "#components/calendar"
import { Input } from "#components/input"
import { ScrollArea } from "#components/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "#components/tabs"
import { useIsMobile } from "#hooks/use-mobile"
import { cn } from "#lib/cn"

// ────────────────────────────────────────────────────────────────────────────
// Public: DatePicker (single day, Popover trigger)
// ────────────────────────────────────────────────────────────────────────────
//
// 常用形态: 表单里替代 `<input type="date">`. `value/onChange` 是 Date | undefined,
// 想跟后端 ISO 字符串对接由 caller 自己做 `new Date(iso)` / `d.toISOString()`.
// Dialog / Sheet 内使用时传 `modal` (Radix Popover 需要接管滚动锁).

import { Popover, PopoverContent, PopoverTrigger } from "#components/popover"
import type { ChangeEvent, ComponentProps } from "react"
import type { DayButton, DateRange } from "react-day-picker"

// ──────────────────────────────────────────────────────────────────────────── Types & i18n ────────────────────────────────────────────────────────────────────────────

export type DateSelectorPeriodType = "day" | "month" | "quarter" | "half-year" | "year"
export type DateSelectorFilterType = "is" | "before" | "after" | "between"

export interface DateSelectorValue {
  period: DateSelectorPeriodType
  operator: DateSelectorFilterType
  startDate?: Date
  endDate?: Date
  year?: number
  month?: number
  quarter?: number
  halfYear?: number
  rangeStart?: { year: number; value: number }
  rangeEnd?: { year: number; value: number }
}

export interface DateSelectorI18nConfig {
  selectDate: string
  apply: string
  cancel: string
  clear: string
  today: string
  filterTypes: {
    is: string
    before: string
    after: string
    between: string
  }
  periodTypes: {
    day: string
    month: string
    quarter: string
    halfYear: string
    year: string
  }
  months: string[]
  monthsShort: string[]
  quarters: string[]
  halfYears: string[]
  weekdays: string[]
  weekdaysShort: string[]
  placeholder: string
  rangePlaceholder: string
  presets: {
    today: string
    yesterday: string
    last7Days: string
    last30Days: string
    monthToDate: string
    lastMonth: string
    yearToDate: string
    lastYear: string
  }
}

/**
 * 从 i18n resources 拉当前语言的 dateSelector 词典. 需在 React 树内部调用.
 * 允许 `override` 对具体字段做局部替换 (业务场景想改"确定" → "保存"这种).
 */
function useDateSelectorI18n(override?: Partial<DateSelectorI18nConfig>): DateSelectorI18nConfig {
  const { t } = useTranslation()
  return useMemo(() => {
    const base: DateSelectorI18nConfig = {
      selectDate: t("common.dateSelector.selectDate"),
      apply: t("common.dateSelector.apply"),
      cancel: t("common.cancel"),
      clear: t("common.dateSelector.clear"),
      today: t("common.dateSelector.today"),
      placeholder: t("common.dateSelector.placeholder"),
      rangePlaceholder: t("common.dateSelector.rangePlaceholder"),
      filterTypes: {
        is: t("common.dateSelector.filterTypes.is"),
        before: t("common.dateSelector.filterTypes.before"),
        after: t("common.dateSelector.filterTypes.after"),
        between: t("common.dateSelector.filterTypes.between"),
      },
      periodTypes: {
        day: t("common.dateSelector.periodTypes.day"),
        month: t("common.dateSelector.periodTypes.month"),
        quarter: t("common.dateSelector.periodTypes.quarter"),
        halfYear: t("common.dateSelector.periodTypes.halfYear"),
        year: t("common.dateSelector.periodTypes.year"),
      },
      months: t("common.dateSelector.months", { returnObjects: true }) as string[],
      monthsShort: t("common.dateSelector.monthsShort", { returnObjects: true }) as string[],
      quarters: t("common.dateSelector.quarters", { returnObjects: true }) as string[],
      halfYears: t("common.dateSelector.halfYears", { returnObjects: true }) as string[],
      weekdays: t("common.dateSelector.weekdays", { returnObjects: true }) as string[],
      weekdaysShort: t("common.dateSelector.weekdaysShort", { returnObjects: true }) as string[],
      presets: {
        today: t("common.dateSelector.today"),
        yesterday: t("common.dateSelector.presets.yesterday"),
        last7Days: t("common.dateSelector.presets.last7Days"),
        last30Days: t("common.dateSelector.presets.last30Days"),
        monthToDate: t("common.dateSelector.presets.monthToDate"),
        lastMonth: t("common.dateSelector.presets.lastMonth"),
        yearToDate: t("common.dateSelector.presets.yearToDate"),
        lastYear: t("common.dateSelector.presets.lastYear"),
      },
    }
    if (!override) {
      return base
    }
    return {
      ...base,
      ...override,
      filterTypes: { ...base.filterTypes, ...override.filterTypes },
      periodTypes: { ...base.periodTypes, ...override.periodTypes },
      presets: { ...base.presets, ...override.presets },
    }
  }, [t, override])
}

// ──────────────────────────────────────────────────────────────────────────── Formatting ────────────────────────────────────────────────────────────────────────────

export function formatDateSelectorValue(
  value: DateSelectorValue,
  i18n: DateSelectorI18nConfig,
  dayDateFormat = "yyyy-MM-dd"
): string {
  const { period, startDate, endDate, year, month, quarter, halfYear, rangeStart, rangeEnd } = value

  if (period === "day") {
    if (startDate && endDate) {
      return `${format(startDate, dayDateFormat)} - ${format(endDate, dayDateFormat)}`
    }
    return startDate ? format(startDate, dayDateFormat) : ""
  }
  if (period === "month") {
    if (rangeStart && rangeEnd) {
      return `${i18n.monthsShort[rangeStart.value]} ${rangeStart.year} - ${i18n.monthsShort[rangeEnd.value]} ${rangeEnd.year}`
    }
    return year !== undefined && month !== undefined ? `${i18n.monthsShort[month]} ${year}` : ""
  }
  if (period === "quarter") {
    if (rangeStart && rangeEnd) {
      return `${i18n.quarters[rangeStart.value]} ${rangeStart.year} - ${i18n.quarters[rangeEnd.value]} ${rangeEnd.year}`
    }
    return year !== undefined && quarter !== undefined ? `${i18n.quarters[quarter]} ${year}` : ""
  }
  if (period === "half-year") {
    if (rangeStart && rangeEnd) {
      return `${i18n.halfYears[rangeStart.value]} ${rangeStart.year} - ${i18n.halfYears[rangeEnd.value]} ${rangeEnd.year}`
    }
    return year !== undefined && halfYear !== undefined ? `${i18n.halfYears[halfYear]} ${year}` : ""
  }
  if (period === "year") {
    if (rangeStart && rangeEnd) {
      return `${rangeStart.year} - ${rangeEnd.year}`
    }
    return year === undefined ? "" : `${year}`
  }
  return ""
}

// ────────────────────────────────────────────────────────────────────────────
// Context (i18n + variant)
// ────────────────────────────────────────────────────────────────────────────

interface DateSelectorContext_ {
  i18n: DateSelectorI18nConfig
}
const DateSelectorContext = createContext<DateSelectorContext_ | null>(null)
function useDateSelectorContext(): DateSelectorContext_ {
  const context = useContext(DateSelectorContext)
  if (!context) {
    throw new Error("DateSelector children must be rendered inside <DateSelector>.")
  }
  return context
}

// ──────────────────────────────────────────────────────────────────────────── State hook ────────────────────────────────────────────────────────────────────────────

interface UseDateSelectorOptions {
  value?: DateSelectorValue
  onChange?: (value: DateSelectorValue) => void
  defaultPeriodType?: DateSelectorPeriodType
  defaultFilterType?: DateSelectorFilterType
  presetMode?: DateSelectorFilterType
  allowRange?: boolean
  yearRange?: number
  baseYear?: number
  minYear?: number
  maxYear?: number
  periodTypes?: DateSelectorPeriodType[]
}

export function useDateSelector({
  value,
  onChange,
  defaultPeriodType = "day",
  defaultFilterType = "is",
  presetMode,
  allowRange = true,
  yearRange = 11,
  baseYear,
  minYear,
  maxYear,
  periodTypes,
}: UseDateSelectorOptions) {
  const currentYear = baseYear ?? new Date().getFullYear()
  const validDefaultPeriodType = useMemo(() => {
    if (!periodTypes || periodTypes.length === 0) {
      return defaultPeriodType
    }
    return periodTypes.includes(defaultPeriodType) ? defaultPeriodType : periodTypes[0]
  }, [periodTypes, defaultPeriodType])

  const effectiveFilterType = presetMode ?? value?.operator ?? defaultFilterType
  const [periodType, setPeriodType] = useState<DateSelectorPeriodType>(
    value?.period || validDefaultPeriodType
  )
  const [filterType, setFilterType] = useState<DateSelectorFilterType>(effectiveFilterType)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(value?.startDate)
  const [selectedEndDate, setSelectedEndDate] = useState<Date | undefined>(value?.endDate)
  const [calendarMonth, setCalendarMonth] = useState(value?.startDate || new Date())
  const [selectedYear, setSelectedYear] = useState<number | undefined>(value?.year)
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(value?.month)
  const [selectedQuarter, setSelectedQuarter] = useState<number | undefined>(value?.quarter)
  const [selectedHalfYear, setSelectedHalfYear] = useState<number | undefined>(value?.halfYear)
  const [rangeStart, setRangeStart] = useState<{ year: number; value: number } | undefined>(
    value?.rangeStart
  )
  const [rangeEnd, setRangeEnd] = useState<{ year: number; value: number } | undefined>(
    value?.rangeEnd
  )
  const [hoverDate, setHoverDate] = useState<Date | undefined>()

  const years = useMemo(
    () =>
      minYear !== undefined && maxYear !== undefined
        ? Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index)
        : Array.from(
            { length: yearRange },
            (_, index) => currentYear - Math.floor(yearRange / 2) + index
          ),
    [currentYear, yearRange, minYear, maxYear]
  )

  const currentValue = useMemo<DateSelectorValue>(() => {
    return {
      period: periodType,
      operator: presetMode ?? filterType,
      startDate: selectedDate,
      endDate: selectedEndDate,
      year: selectedYear,
      month: selectedMonth,
      quarter: selectedQuarter,
      halfYear: selectedHalfYear,
      rangeStart,
      rangeEnd,
    }
  }, [
    periodType,
    presetMode,
    filterType,
    selectedDate,
    selectedEndDate,
    selectedYear,
    selectedMonth,
    selectedQuarter,
    selectedHalfYear,
    rangeStart,
    rangeEnd,
  ])

  const clearSelection = useCallback(() => {
    setSelectedDate(undefined)
    setSelectedEndDate(undefined)
    setSelectedYear(undefined)
    setSelectedMonth(undefined)
    setSelectedQuarter(undefined)
    setSelectedHalfYear(undefined)
    setRangeStart(undefined)
    setRangeEnd(undefined)
  }, [])

  const handleDayClick = useCallback(
    (day: Date) => {
      if (filterType === "between" && allowRange) {
        if (!selectedDate || (selectedDate && selectedEndDate)) {
          setSelectedDate(day)
          setSelectedEndDate(undefined)
        } else if (isBefore(day, selectedDate)) {
          setSelectedEndDate(selectedDate)
          setSelectedDate(day)
        } else {
          setSelectedEndDate(day)
        }
      } else {
        setSelectedDate(day)
        setSelectedEndDate(undefined)
      }
    },
    [filterType, allowRange, selectedDate, selectedEndDate]
  )

  const handlePeriodSelect = useCallback(
    (year: number, value: number) => {
      if (filterType === "between" && allowRange) {
        if (!rangeStart || (rangeStart && rangeEnd)) {
          setRangeStart({ year, value })
          setRangeEnd(undefined)
          setSelectedYear(year)
          if (periodType === "month") {
            setSelectedMonth(value)
          }
          if (periodType === "quarter") {
            setSelectedQuarter(value)
          }
          if (periodType === "half-year") {
            setSelectedHalfYear(value)
          }
        } else {
          const startKey = rangeStart.year * 100 + rangeStart.value
          const endKey = year * 100 + value
          if (endKey < startKey) {
            setRangeEnd(rangeStart)
            setRangeStart({ year, value })
          } else {
            setRangeEnd({ year, value })
          }
        }
      } else {
        setSelectedYear(year)
        if (periodType === "month") {
          setSelectedMonth(value)
        }
        if (periodType === "quarter") {
          setSelectedQuarter(value)
        }
        if (periodType === "half-year") {
          setSelectedHalfYear(value)
        }
        setRangeStart(undefined)
        setRangeEnd(undefined)
      }
    },
    [filterType, allowRange, rangeStart, rangeEnd, periodType]
  )

  const handleYearSelect = useCallback(
    (year: number) => {
      if (filterType === "between" && allowRange) {
        if (!rangeStart || (rangeStart && rangeEnd)) {
          setRangeStart({ year, value: 0 })
          setRangeEnd(undefined)
          setSelectedYear(year)
        } else if (year < rangeStart.year) {
          setRangeEnd(rangeStart)
          setRangeStart({ year, value: 0 })
        } else {
          setRangeEnd({ year, value: 0 })
        }
      } else {
        setSelectedYear(year)
        setRangeStart(undefined)
        setRangeEnd(undefined)
      }
    },
    [filterType, allowRange, rangeStart, rangeEnd]
  )

  const handlePeriodTypeChange = useCallback(
    (type: DateSelectorPeriodType) => {
      setPeriodType(type)
      clearSelection()
    },
    [clearSelection]
  )

  const handleFilterTypeChange = useCallback(
    (type: DateSelectorFilterType) => {
      if (presetMode !== undefined) {
        return
      }
      setFilterType(type)
      clearSelection()
    },
    [clearSelection, presetMode]
  )

  const isInRange = useCallback(
    (year: number, value: number) => {
      if (!rangeStart || !rangeEnd) {
        return false
      }
      const key = year * 100 + value
      const startKey = rangeStart.year * 100 + rangeStart.value
      const endKey = rangeEnd.year * 100 + rangeEnd.value
      return key >= startKey && key <= endKey
    },
    [rangeStart, rangeEnd]
  )

  const isYearInRange = useCallback(
    (year: number) =>
      !rangeStart || !rangeEnd ? false : year >= rangeStart.year && year <= rangeEnd.year,
    [rangeStart, rangeEnd]
  )

  useEffect(() => {
    if (!value) {
      return
    }

    setPeriodType(value.period || validDefaultPeriodType)
    const newFilterType = presetMode ?? value.operator ?? defaultFilterType
    setFilterType(newFilterType)
    setSelectedDate(value.startDate)
    setSelectedEndDate(value.endDate)
    setSelectedYear(value.year)
    setSelectedMonth(value.month)
    setSelectedQuarter(value.quarter)
    setSelectedHalfYear(value.halfYear)
    setRangeStart(value.rangeStart)
    setRangeEnd(value.rangeEnd)
  }, [value, validDefaultPeriodType, defaultFilterType, presetMode])

  useEffect(() => {
    if (presetMode !== undefined) {
      setFilterType(presetMode)
    }
  }, [presetMode])

  useEffect(() => {
    onChange?.(currentValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValue])

  return {
    periodType,
    filterType,
    selectedDate,
    selectedEndDate,
    calendarMonth,
    selectedYear,
    selectedMonth,
    selectedQuarter,
    selectedHalfYear,
    rangeStart,
    rangeEnd,
    hoverDate,
    years,
    currentValue,
    allowRange,
    setPeriodType: handlePeriodTypeChange,
    setFilterType: handleFilterTypeChange,
    setSelectedDate,
    setSelectedEndDate,
    setCalendarMonth,
    setHoverDate,
    clearSelection,
    handleDayClick,
    handlePeriodSelect,
    handleYearSelect,
    isInRange,
    isYearInRange,
  }
}

// ──────────────────────────────────────────────────────────────────────────── Internal pieces ────────────────────────────────────────────────────────────────────────────

interface FilterToggleProperties {
  readonly value: DateSelectorFilterType
  readonly onChange: (value: DateSelectorFilterType) => void
  readonly showBetween?: boolean
  readonly showIs?: boolean
  readonly presetMode?: DateSelectorFilterType
  readonly className?: string
}

function FilterToggle({
  value,
  onChange,
  showBetween = true,
  showIs = true,
  presetMode,
  className,
}: FilterToggleProperties) {
  const { i18n } = useDateSelectorContext()
  const isDisabled = presetMode !== undefined
  return (
    <Tabs
      value={value}
      onValueChange={v => {
        if (!isDisabled && v) {
          onChange(v as DateSelectorFilterType)
        }
      }}
      className={className}
    >
      <TabsList
        className={cn("bg-muted/80", isDisabled && "pointer-events-none opacity-50", className)}
      >
        {showIs ? (
          <TabsTrigger value="is" className="py-1 font-normal">
            {i18n.filterTypes.is}
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="before" className="py-1 font-normal">
          {i18n.filterTypes.before}
        </TabsTrigger>
        <TabsTrigger value="after" className="py-1 font-normal">
          {i18n.filterTypes.after}
        </TabsTrigger>
        {showBetween ? (
          <TabsTrigger value="between" className="py-1 font-normal">
            {i18n.filterTypes.between}
          </TabsTrigger>
        ) : null}
      </TabsList>
    </Tabs>
  )
}

interface PeriodTabsProperties {
  readonly value: DateSelectorPeriodType
  readonly onChange: (value: DateSelectorPeriodType) => void
  readonly periodTypes?: DateSelectorPeriodType[]
  readonly calendarMonth?: Date
  readonly onMonthChange?: (date: Date) => void
  readonly showNavigationButtons?: boolean
}

function PeriodTabs({
  value,
  onChange,
  periodTypes,
  calendarMonth,
  onMonthChange,
  showNavigationButtons = false,
}: PeriodTabsProperties) {
  const { i18n } = useDateSelectorContext()
  const tabs: { value: DateSelectorPeriodType; label: string }[] = [
    { value: "day", label: i18n.periodTypes.day },
    { value: "month", label: i18n.periodTypes.month },
    { value: "quarter", label: i18n.periodTypes.quarter },
    { value: "half-year", label: i18n.periodTypes.halfYear },
    { value: "year", label: i18n.periodTypes.year },
  ]
  const filteredTabs = periodTypes ? tabs.filter(tab => periodTypes.includes(tab.value)) : tabs

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs value={value} onValueChange={v => v && onChange(v as DateSelectorPeriodType)}>
        <TabsList>
          {filteredTabs.map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="px-1 py-1 font-normal sm:px-2.5"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {showNavigationButtons && value === "day" && calendarMonth && onMonthChange ? (
        <div className="flex items-center">
          {(() => {
            const today = new Date()
            const isCurrentMonth = isSameMonth(calendarMonth, today)
            if (isCurrentMonth) {
              return null
            }
            const isFuture = calendarMonth > today
            return (
              <Button
                variant="ghost"
                className="size-8"
                onClick={() => onMonthChange(new Date())}
                title={i18n.today}
              >
                {isFuture ? (
                  <CornerUpLeft className="size-4" />
                ) : (
                  <CornerUpRight className="size-4" />
                )}
              </Button>
            )
          })()}
          <Button
            variant="ghost"
            className="size-8"
            onClick={() => onMonthChange(subMonths(calendarMonth, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            className="size-8"
            onClick={() => onMonthChange(addMonths(calendarMonth, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}

interface DayPickerProperties {
  readonly currentMonth: Date
  readonly selectedDate?: Date
  readonly selectedEndDate?: Date
  readonly onDayClick: (day: Date) => void
  readonly isRange: boolean
  readonly onDayHover?: (day: Date | undefined) => void
  readonly hoverDate?: Date
  readonly showTwoMonths?: boolean
  readonly weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
  readonly className?: string
}

function DayPickerInner({
  currentMonth,
  selectedDate,
  selectedEndDate,
  onDayClick,
  isRange,
  onDayHover,
  hoverDate,
  showTwoMonths = true,
  weekStartsOn,
  className,
}: DayPickerProperties) {
  const { i18n } = useDateSelectorContext()
  const isMobile = useIsMobile()

  const selected: Date | DateRange | undefined = isRange
    ? selectedDate && selectedEndDate
      ? { from: selectedDate, to: selectedEndDate }
      : selectedDate
        ? { from: selectedDate, to: hoverDate || selectedDate }
        : undefined
    : selectedDate

  const handleSelect = (date: Date | DateRange | undefined) => {
    if (!date) {
      return
    }
    if (isRange && "from" in date) {
      if (date.from && !date.to) {
        onDayClick(date.from)
      } else if (date.from && date.to) {
        onDayClick(date.to)
      }
    } else if (!isRange && date instanceof Date) {
      onDayClick(date)
    }
  }

  // 只在 mouseenter 更新 hoverDate; mouseleave 全放到容器上 (下方 <div>),
  // 避免鼠标在两个 day cell 之间的 gap 空隙上 leave → hoverDate 短暂变 undefined
  // → range 预览瞬间坍缩成单点 → 闪烁.
  const CustomDayButton = useCallback(
    (properties: ComponentProps<typeof DayButton>) => (
      <CalendarDayButton
        {...properties}
        onMouseEnter={() => {
          if (isRange && onDayHover && properties.day) onDayHover(properties.day.date)
        }}
      />
    ),
    [isRange, onDayHover]
  )

  const formatters = useMemo(() => {
    return {
      formatWeekdayName: (date: Date) => {
        const idx = date.getDay()
        return i18n.weekdaysShort[idx] || i18n.weekdays[idx]
      },
      formatMonthCaption: (date: Date) => `${i18n.months[date.getMonth()]} ${date.getFullYear()}`,
    }
  }, [i18n])

  const sharedClassNames = useMemo(() => {
    return {
      months: "flex flex-wrap items-start justify-between gap-5 w-full",
      month: "flex flex-col items-center min-w-0 flex-1",
      nav: "hidden",
    }
  }, [])

  const calendarComponents = useMemo(() => ({ DayButton: CustomDayButton }), [CustomDayButton])

  return (
    <div
      role="presentation"
      className={cn("flex w-full items-center justify-between", className)}
      onMouseLeave={isRange && onDayHover ? () => onDayHover(undefined) : undefined}
    >
      {isRange ? (
        <Calendar
          month={currentMonth}
          mode="range"
          selected={selected as DateRange | undefined}
          onSelect={handleSelect as (range: DateRange | undefined) => void}
          numberOfMonths={isMobile ? 1 : showTwoMonths ? 2 : 1}
          showOutsideDays
          weekStartsOn={weekStartsOn}
          formatters={formatters}
          className="w-full shrink-0 p-0"
          classNames={sharedClassNames}
          components={calendarComponents}
        />
      ) : (
        <Calendar
          month={currentMonth}
          mode="single"
          selected={selected as Date | undefined}
          onSelect={handleSelect as (date: Date | undefined) => void}
          numberOfMonths={isMobile ? 1 : showTwoMonths ? 2 : 1}
          showOutsideDays
          weekStartsOn={weekStartsOn}
          formatters={formatters}
          className="w-full shrink-0 p-0"
          classNames={sharedClassNames}
          components={calendarComponents}
        />
      )}
    </div>
  )
}

interface PeriodGridProperties {
  readonly years: number[]
  readonly items: string[]
  readonly selectedYear?: number
  readonly selectedValue?: number
  readonly rangeStart?: { year: number; value: number }
  readonly rangeEnd?: { year: number; value: number }
  readonly isInRange: (year: number, value: number) => boolean
  readonly onSelect: (year: number, value: number) => void
  readonly columns: number
}

function PeriodGrid({
  years,
  items,
  selectedYear,
  selectedValue,
  rangeStart,
  rangeEnd,
  isInRange,
  onSelect,
  columns,
}: PeriodGridProperties) {
  return (
    <div className="w-full space-y-6">
      {years.map(year => (
        <div key={year}>
          <div className="text-muted-foreground mb-3 text-sm font-medium">{year}</div>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {items.map((item, index) => {
              const isSelected = selectedYear === year && selectedValue === index
              const isRangeStart = rangeStart?.year === year && rangeStart?.value === index
              const isRangeEnd = rangeEnd?.year === year && rangeEnd?.value === index
              const inRange = isInRange(year, index)
              return (
                <Button
                  key={item}
                  size="sm"
                  variant={isSelected || isRangeStart || isRangeEnd ? "default" : "outline"}
                  className={cn(
                    inRange &&
                      !isSelected &&
                      !isRangeStart &&
                      !isRangeEnd &&
                      "bg-accent dark:bg-accent/60"
                  )}
                  onClick={() => onSelect(year, index)}
                >
                  {item}
                </Button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

interface YearListProperties {
  readonly years: number[]
  readonly selectedYear?: number
  readonly rangeStart?: { year: number; value: number }
  readonly rangeEnd?: { year: number; value: number }
  readonly isYearInRange: (year: number) => boolean
  readonly onSelect: (year: number) => void
}

function YearList({
  years,
  selectedYear,
  rangeStart,
  rangeEnd,
  isYearInRange,
  onSelect,
}: YearListProperties) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {years.map(year => {
        const isSelected = selectedYear === year && !rangeStart && !rangeEnd
        const isRangeStart = rangeStart?.year === year
        const isRangeEnd = rangeEnd?.year === year
        const inRange = isYearInRange(year)
        return (
          <Button
            key={year}
            size="sm"
            variant={isSelected || isRangeStart || isRangeEnd ? "default" : "outline"}
            className={cn(
              inRange &&
                !isSelected &&
                !isRangeStart &&
                !isRangeEnd &&
                "bg-accent dark:bg-accent/60"
            )}
            onClick={() => onSelect(year)}
          >
            {year}
          </Button>
        )
      })}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────── Public: DateSelector panel ────────────────────────────────────────────────────────────────────────────

export interface DateSelectorProps {
  readonly value?: DateSelectorValue
  readonly onChange?: (value: DateSelectorValue) => void
  readonly allowRange?: boolean
  readonly periodTypes?: DateSelectorPeriodType[]
  readonly defaultPeriodType?: DateSelectorPeriodType
  readonly defaultFilterType?: DateSelectorFilterType
  readonly presetMode?: DateSelectorFilterType
  readonly showInput?: boolean
  readonly showTwoMonths?: boolean
  readonly label?: string
  readonly className?: string
  readonly yearRange?: number
  readonly baseYear?: number
  readonly minYear?: number
  readonly maxYear?: number
  /**
  局部覆盖 i18n 词典 (未传的字段用当前语言默认).
  */
  readonly i18nOverride?: Partial<DateSelectorI18nConfig>
  readonly inputHint?: string
  readonly dayDateFormat?: string
  readonly dayDateFormats?: string[]
  readonly weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
}

export function DateSelector({
  value,
  onChange,
  allowRange = true,
  periodTypes,
  defaultPeriodType = "day",
  defaultFilterType = "is",
  presetMode,
  showInput = true,
  showTwoMonths = true,
  label,
  className,
  yearRange = 10,
  baseYear,
  minYear,
  maxYear,
  i18nOverride,
  inputHint,
  dayDateFormat = "yyyy-MM-dd",
  dayDateFormats,
  weekStartsOn,
}: DateSelectorProps) {
  const i18n = useDateSelectorI18n(i18nOverride)

  const {
    periodType,
    filterType,
    selectedDate,
    selectedEndDate,
    calendarMonth,
    selectedYear,
    selectedMonth,
    selectedQuarter,
    selectedHalfYear,
    rangeStart,
    rangeEnd,
    hoverDate,
    years,
    currentValue,
    setPeriodType,
    setFilterType,
    setCalendarMonth,
    setHoverDate,
    clearSelection,
    handleDayClick,
    handlePeriodSelect,
    handleYearSelect,
    isInRange,
    isYearInRange,
  } = useDateSelector({
    value,
    onChange,
    defaultPeriodType,
    defaultFilterType,
    presetMode,
    allowRange,
    yearRange,
    baseYear,
    minYear,
    maxYear,
    periodTypes,
  })

  const displayValue = formatDateSelectorValue(currentValue, i18n, dayDateFormat)
  const [inputValue, setInputValue] = useState(displayValue)
  const [isInputFocused, setIsInputFocused] = useState(false)

  const dateFormats = useMemo(() => {
    if (dayDateFormats && dayDateFormats.length > 0) {
      const formats = [...dayDateFormats]
      if (!formats.includes(dayDateFormat)) {
        formats.unshift(dayDateFormat)
      }
      return formats
    }
    return [
      ...new Set([
        dayDateFormat,
        "yyyy-MM-dd",
        "MM/dd/yyyy",
        "dd/MM/yyyy",
        "MM-dd-yyyy",
        "dd-MM-yyyy",
      ]),
    ]
  }, [dayDateFormat, dayDateFormats])

  const parseInputValue = useCallback(
    (text: string): DateSelectorValue | null => {
      if (!text.trim()) {
        return null
      }
      const trimmed = text.trim()
      const yearMatch = trimmed.match(/^\d{4}$/)
      if (yearMatch) {
        const year = parseInt(yearMatch[0])
        if (year >= 1900 && year <= 2100) {
          return { period: "year", operator: presetMode ?? filterType, year }
        }
      }
      const quarterMatch = trimmed.match(/^Q([1-4])(?:\s+(\d{4}))?$/i)
      if (quarterMatch) {
        const quarter = parseInt(quarterMatch[1]) - 1
        const year = quarterMatch[2] ? parseInt(quarterMatch[2]) : new Date().getFullYear()
        if (year >= 1900 && year <= 2100) {
          return { period: "quarter", operator: presetMode ?? filterType, year, quarter }
        }
      }
      for (const dateFormat of dateFormats) {
        try {
          const parsed = parse(trimmed, dateFormat, new Date())
          if (!isNaN(parsed.getTime())) {
            return { period: "day", operator: presetMode ?? filterType, startDate: parsed }
          }
        } catch {
          // continue
        }
      }
      return null
    },
    [filterType, presetMode, dateFormats]
  )

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      setInputValue(v)
      const parsed = parseInputValue(v)
      if (parsed) {
        onChange?.(parsed)
      }
    },
    [onChange, parseInputValue]
  )

  const handleInputBlur = useCallback(() => {
    setIsInputFocused(false)
    if (!parseInputValue(inputValue)) {
      setInputValue(displayValue)
    }
  }, [inputValue, displayValue, parseInputValue])

  return (
    <DateSelectorContext.Provider value={{ i18n }}>
      <div className={cn("w-full space-y-4 sm:w-[470px]", className)}>
        <div className="flex flex-wrap items-center gap-3">
          {label ? (
            <h3 className="text-sm font-medium" data-slot="date-selector-label">
              {label}
            </h3>
          ) : null}
          <FilterToggle
            value={filterType}
            onChange={setFilterType}
            showBetween={allowRange}
            presetMode={presetMode}
          />
        </div>
        {showInput ? (
          <div className="relative">
            <Input
              type="text"
              value={inputHint ? (isInputFocused ? inputValue : displayValue) : displayValue}
              readOnly={!inputHint}
              placeholder={isInputFocused && inputHint ? inputHint : i18n.placeholder}
              onFocus={() => {
                setInputValue(displayValue)
                setIsInputFocused(true)
              }}
              onBlur={handleInputBlur}
              onChange={handleInputChange}
            />
            {(inputHint ? inputValue : displayValue) ? (
              <button
                type="button"
                onClick={clearSelection}
                className={cn(
                  "absolute end-2.5 top-1/2 size-4 -translate-y-1/2 cursor-pointer rounded-xs",
                  "opacity-70 transition-opacity hover:opacity-100",
                  "ring-offset-background focus:ring-ring focus:ring-2 focus:ring-offset-2 focus:outline-none"
                )}
                aria-label={i18n.clear}
              >
                <XIcon className="size-4" />
              </button>
            ) : null}
          </div>
        ) : null}
        <PeriodTabs
          value={periodType}
          onChange={setPeriodType}
          periodTypes={periodTypes}
          calendarMonth={calendarMonth}
          onMonthChange={setCalendarMonth}
          showNavigationButtons={periodType === "day"}
        />

        {periodType === "day" ? (
          <div className="w-full pb-1">
            <DayPickerInner
              currentMonth={calendarMonth}
              selectedDate={selectedDate}
              selectedEndDate={selectedEndDate}
              onDayClick={handleDayClick}
              isRange={filterType === "between" && allowRange}
              onDayHover={setHoverDate}
              hoverDate={hoverDate}
              showTwoMonths={showTwoMonths}
              weekStartsOn={weekStartsOn}
            />
          </div>
        ) : (
          <div className="-mr-3 w-full">
            <ScrollArea key={periodType} className="h-[200px] w-full pe-3">
              {periodType === "month" && (
                <PeriodGrid
                  years={years}
                  items={i18n.monthsShort}
                  selectedYear={selectedYear}
                  selectedValue={selectedMonth}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  isInRange={isInRange}
                  onSelect={handlePeriodSelect}
                  columns={3}
                />
              )}
              {periodType === "quarter" && (
                <PeriodGrid
                  years={years}
                  items={i18n.quarters}
                  selectedYear={selectedYear}
                  selectedValue={selectedQuarter}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  isInRange={isInRange}
                  onSelect={handlePeriodSelect}
                  columns={4}
                />
              )}
              {periodType === "half-year" && (
                <PeriodGrid
                  years={years}
                  items={i18n.halfYears}
                  selectedYear={selectedYear}
                  selectedValue={selectedHalfYear}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  isInRange={isInRange}
                  onSelect={handlePeriodSelect}
                  columns={2}
                />
              )}
              {periodType === "year" && (
                <YearList
                  years={years}
                  selectedYear={selectedYear}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  isYearInRange={isYearInRange}
                  onSelect={handleYearSelect}
                />
              )}
            </ScrollArea>
          </div>
        )}
      </div>
    </DateSelectorContext.Provider>
  )
}

export interface DatePickerProps {
  readonly value?: Date
  readonly onChange: (date: Date | undefined) => void
  /**
  trigger 按钮占位文案. 默认 common.dateSelector.selectDate.
  */
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly className?: string
  /**
  trigger 视觉形态; 'ghost' 用于表格 cell / inline 编辑.
  */
  readonly variant?: "outline" | "ghost"
  /**
  展示字符串格式; 默认 yyyy-MM-dd.
  */
  readonly dateFormat?: string
  /**
  是否显示"清空"按钮. 默认 true.
  */
  readonly clearable?: boolean
  /**
  Dialog / Sheet 内传 true, 让 Popover 接管滚动锁.
  */
  readonly modal?: boolean
  /**
  局部覆盖 i18n 词典.
  */
  readonly i18nOverride?: Partial<DateSelectorI18nConfig>
  /**
  允许选择的最小/最大日期 (react-day-picker matcher).
  */
  readonly fromDate?: Date
  readonly toDate?: Date
  /**
  按钮 id, 关联 label htmlFor.
  */
  readonly id?: string
  /**
  aria-label; 未传时用 placeholder 兜底.
  */
  readonly ariaLabel?: string
  /**
  触发按钮宽度类; 默认 w-full.
  */
  readonly triggerClassName?: string
  /**
  Popover content 附加类.
  */
  readonly contentClassName?: string
  /**
  Popover 对齐; 默认 start.
  */
  readonly align?: "start" | "center" | "end"
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  variant = "outline",
  dateFormat = "yyyy-MM-dd",
  clearable = true,
  modal,
  i18nOverride,
  fromDate,
  toDate,
  id,
  ariaLabel,
  triggerClassName,
  contentClassName,
  align = "start",
}: DatePickerProps) {
  const i18n = useDateSelectorI18n(i18nOverride)
  const [open, setOpen] = useState(false)
  const placeholderText = placeholder ?? i18n.selectDate
  const displayText = value ? format(value, dateFormat) : placeholderText

  const disabledMatcher =
    fromDate || toDate
      ? (date: Date) => {
          if (fromDate && date < fromDate) {
            return true
          }
          if (toDate && date > toDate) {
            return true
          }
          return false
        }
      : undefined

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverTrigger
        nativeButton
        render={
          <Button
            id={id}
            type="button"
            variant={variant}
            role="combobox"
            aria-label={ariaLabel ?? placeholderText}
            disabled={disabled}
            className={cn(
              "h-9 justify-between gap-2 font-normal tabular-nums",
              !value && "text-muted-foreground",
              triggerClassName ?? "w-full",
              className
            )}
          >
            <span className="truncate">{displayText}</span>
            <CalendarIcon className="text-muted-foreground size-3.5 shrink-0" />
          </Button>
        }
      />
      <PopoverContent align={align} className={cn("w-auto overflow-hidden p-0", contentClassName)}>
        <Calendar
          mode="single"
          selected={value}
          onSelect={d => {
            onChange(d)
            setOpen(false)
          }}
          defaultMonth={value}
          disabled={disabledMatcher}
          captionLayout="dropdown"
          autoFocus
        />
        {clearable && value ? (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-center"
              onClick={() => {
                onChange(undefined)
                setOpen(false)
              }}
            >
              {i18n.clear}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Public: DateRangePicker (range, Popover trigger)
// ────────────────────────────────────────────────────────────────────────────

export interface DateRangePickerProps {
  readonly value?: DateRange
  readonly onChange: (range: DateRange | undefined) => void
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly className?: string
  readonly variant?: "outline" | "ghost"
  readonly dateFormat?: string
  readonly clearable?: boolean
  readonly modal?: boolean
  readonly i18nOverride?: Partial<DateSelectorI18nConfig>
  readonly fromDate?: Date
  readonly toDate?: Date
  readonly id?: string
  readonly ariaLabel?: string
  readonly triggerClassName?: string
  readonly contentClassName?: string
  readonly align?: "start" | "center" | "end"
  /**
  一次显示 1 / 2 个月. 默认 2 (桌面), mobile 自动降到 1.
  */
  readonly numberOfMonths?: number
}

export function DateRangePicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  variant = "outline",
  dateFormat = "yyyy-MM-dd",
  clearable = true,
  modal,
  i18nOverride,
  fromDate,
  toDate,
  id,
  ariaLabel,
  triggerClassName,
  contentClassName,
  align = "start",
  numberOfMonths = 2,
}: DateRangePickerProps) {
  const i18n = useDateSelectorI18n(i18nOverride)
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState<Date>(value?.from ?? new Date())
  const placeholderText = placeholder ?? i18n.rangePlaceholder

  // 来源: reui `c-calendar-29` (`pnpm dlx shadcn@latest add @reui/c-calendar-29`).
  // 布局: Popover 里左侧竖排预设 (Today/Yesterday/Last 7 days ...) + 右侧
  // <Calendar mode='range' /> 双月. 两击行为交给 react-day-picker 内建 useRange,
  // 不做自造状态机 / hoverDate 预览, 无闪烁.
  // 二次改造:
  //   - IconPlaceholder(reui 特有) → CalendarIcon(lucide-react, 仓库红线 #3)
  //   - 所有预设 label → i18n.presets.* (走 common.dateSelector.presets 命名空间)
  //   - i18n.clear (清除按钮), i18n.rangePlaceholder (触发按钮占位)
  //   - 移除硬编码 "Pick a date range" 兜底
  const today = new Date()
  const presets: { key: keyof DateSelectorI18nConfig["presets"]; range: DateRange }[] = [
    { key: "today", range: { from: today, to: today } },
    { key: "yesterday", range: { from: subDays(today, 1), to: subDays(today, 1) } },
    { key: "last7Days", range: { from: subDays(today, 6), to: today } },
    { key: "last30Days", range: { from: subDays(today, 29), to: today } },
    { key: "monthToDate", range: { from: startOfMonth(today), to: today } },
    {
      key: "lastMonth",
      range: { from: startOfMonth(subMonths(today, 1)), to: endOfMonth(subMonths(today, 1)) },
    },
    { key: "yearToDate", range: { from: startOfYear(today), to: today } },
    {
      key: "lastYear",
      range: { from: startOfYear(subYears(today, 1)), to: endOfYear(subYears(today, 1)) },
    },
  ]

  const displayText = value?.from
    ? value.to
      ? `${format(value.from, dateFormat)} - ${format(value.to, dateFormat)}`
      : format(value.from, dateFormat)
    : placeholderText

  const disabledMatcher =
    fromDate || toDate
      ? (date: Date) => {
          if (fromDate && date < fromDate) {
            return true
          }
          if (toDate && date > toDate) {
            return true
          }
          return false
        }
      : undefined

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverTrigger
        nativeButton
        render={
          <Button
            id={id}
            type="button"
            variant={variant}
            role="combobox"
            aria-label={ariaLabel ?? placeholderText}
            disabled={disabled}
            className={cn(
              "h-9 justify-between gap-2 font-normal tabular-nums",
              !value?.from && "text-muted-foreground",
              triggerClassName ?? "w-full",
              className
            )}
          >
            <span className="truncate">{displayText}</span>
            <CalendarIcon className="text-muted-foreground size-3.5 shrink-0" />
          </Button>
        }
      />
      <PopoverContent align={align} className={cn("w-auto overflow-hidden p-0", contentClassName)}>
        <div className="flex max-sm:flex-col">
          <div className="relative py-3 max-sm:order-1 max-sm:border-t sm:w-32">
            <div className="flex h-full flex-col gap-0.5 px-2 sm:border-e">
              {presets.map(preset => (
                <Button
                  key={preset.key}
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    onChange(preset.range)
                    if (preset.range.to) {
                      setMonth(preset.range.to)
                    }
                  }}
                >
                  {i18n.presets[preset.key]}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <Calendar
              mode="range"
              selected={value}
              onSelect={onChange}
              month={month}
              onMonthChange={setMonth}
              numberOfMonths={isMobile ? 1 : numberOfMonths}
              disabled={disabledMatcher}
              captionLayout="dropdown"
              autoFocus
            />
            {clearable && value?.from ? (
              <div className="border-t p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full justify-center"
                  onClick={() => {
                    onChange(undefined)
                    setOpen(false)
                  }}
                >
                  {i18n.clear}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
