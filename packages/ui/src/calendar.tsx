"use client"

import * as React from "react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"
import { enUS, zhCN } from "date-fns/locale"

import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from "lucide-react"
import { cn } from "#lib/utils"
import { buttonVariants } from "#components/button"
import { useTranslation } from "@zoeymind/i18n"
import type { Button } from "#components/button"
import type { DayButton, Locale } from "react-day-picker"

const LOCALE_MAP: Record<string, Locale> = {
  "zh-CN": zhCN,
  "en-US": enUS,
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  locale: localeProperty,
  formatters,
  components,
  ...properties
}: React.ComponentProps<typeof DayPicker> & {
  readonly buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()
  const { i18n } = useTranslation()
  const locale = localeProperty ?? LOCALE_MAP[i18n.language] ?? enUS

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar bg-background p-2 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(7)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: date => date.toLocaleString(locale?.code, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("relative flex flex-col gap-4 md:flex-row", defaultClassNames.months),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn("relative rounded-(--cell-radius)", defaultClassNames.dropdown_root),
        dropdown: cn("bg-popover absolute inset-0 opacity-0", defaultClassNames.dropdown),
        caption_label: cn(
          "font-medium select-none",
          captionLayout === "label"
            ? "text-sm"
            : "[&>svg]:text-muted-foreground flex items-center gap-1 rounded-(--cell-radius) text-sm [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal select-none",
          defaultClassNames.weekday
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        week_number_header: cn("w-(--cell-size) select-none", defaultClassNames.week_number_header),
        week_number: cn(
          "text-muted-foreground text-[0.8rem] select-none",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
          // Lift 焦点/选中格到高层, 让 ring / box-shadow 不被后一个 cell 遮挡
          "has-[[data-range-end=true]]:z-20 has-[[data-range-start=true]]:z-20 has-[[data-selected-single=true]]:z-20 data-[focused=true]:z-20 data-[selected=true]:z-10",
          properties.showWeekNumber
            ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)"
            : "[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)",
          defaultClassNames.day
        ),
        range_start: cn(
          "bg-muted after:bg-muted relative isolate z-0 rounded-l-(--cell-radius) after:absolute after:inset-y-0 after:right-0 after:w-4",
          defaultClassNames.range_start
        ),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn(
          "bg-muted after:bg-muted relative isolate z-0 rounded-r-(--cell-radius) after:absolute after:inset-y-0 after:left-0 after:w-4",
          defaultClassNames.range_end
        ),
        today: cn(
          "bg-muted text-foreground rounded-(--cell-radius) data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn("text-muted-foreground opacity-50", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...properties }) => (
          <div data-slot="calendar" ref={rootRef} className={cn(className)} {...properties} />
        ),
        Chevron: ({ className, orientation, ...properties }) => {
          if (orientation === "left") {
            return <ChevronLeftIcon className={cn("size-4", className)} {...properties} />
          }

          return orientation === "right" ? (
            <ChevronRightIcon className={cn("size-4", className)} {...properties} />
          ) : (
            <ChevronDownIcon className={cn("size-4", className)} {...properties} />
          )
        },
        DayButton: ({ ...properties }) => <CalendarDayButton locale={locale} {...properties} />,
        WeekNumber: ({ children, ...properties }) => (
          <td {...properties}>
            <div className="flex size-(--cell-size) items-center justify-center text-center">
              {children}
            </div>
          </td>
        ),
        ...components,
      }}
      {...properties}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...properties
}: React.ComponentProps<typeof DayButton> & { readonly locale?: Partial<Locale> }) {
  const defaultClassNames = getDefaultClassNames()

  const reference = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) {
      reference.current?.focus()
    }
  }, [modifiers.focused])

  return (
    <button
      type="button"
      ref={reference}
      data-slot="button"
      data-variant="ghost"
      data-size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected && !modifiers.range_start && !modifiers.range_end
          ? !modifiers.range_middle
          : null
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        // Calendar day 特殊状态样式与 Button ghost + icon 的 base 样式合并 (不走 Button
        // 组件因为 react-day-picker 的 DayButton 类型包含 base-ui Button 不接受的
        // form 相关 props; skill 明确 calendar 是非 radix 库不迁, 这里用 native button
        // + Button 视觉 class 保持一致.)
        "group/button hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:hover:bg-muted/50 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50",
        "group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:bg-muted data-[range-middle=true]:text-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground group-data-[focused=true]/day:aria-selected:bg-primary group-data-[focused=true]/day:aria-selected:text-primary-foreground relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 border-0 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:rounded-r-(--cell-radius) data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:rounded-l-(--cell-radius) [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className
      )}
      {...properties}
    />
  )
}

export { Calendar, CalendarDayButton }
