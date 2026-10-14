"use client"

import { ArrowDown, ArrowUp, ArrowUpDown, Filter, X } from "lucide-react"
import * as React from "react"
import { useTranslation } from "@zoeymind/i18n"

import { Badge } from "#components/badge"
import { Button } from "#components/button"
import { Popover, PopoverContent, PopoverTrigger } from "#components/popover"
import { Separator } from "#components/separator"
import { cn } from "#lib/utils"
import { DataTableColumnFilterContent, countActiveFilter } from "./data-table-header-filter"
import type { Column } from "@tanstack/react-table"

interface DataTableColumnHeaderProperties<TData, TValue> extends React.ComponentProps<"div"> {
  readonly column: Column<TData, TValue>
  /**
  列名 (显示在表头 + Popover aria-label)。
  */
  readonly label: string
}

/**
 * 通用列表头 (ADR 0002)。点表头标题即弹出 Popover, 内含:
 * - 排序段: 升序 / 降序 / 重置排序 (若列 `getCanSort()`)
 * - 分隔线
 * - 过滤段: 按 `meta.variant` / `meta.filterRender` 分发的过滤 UI (若列可过滤)
 *
 * 若列既不可排序也不可过滤, 表头退化为纯文本 (无 Popover, 无 hover 反馈)。
 * 列隐藏 (`getCanHide`) 收敛到右上角"视图"按钮 (`DataTableViewOptions`), 不再进表头 Popover。
 *
 * 激活过滤时表头文字后挂 count badge; 激活排序时表头文字后挂 asc/desc 箭头。
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  label,
  className,
  ...properties
}: DataTableColumnHeaderProperties<TData, TValue>) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const { meta } = column.columnDef
  const canSort = column.getCanSort()
  const canFilter = column.getCanFilter() && Boolean(meta?.variant || meta?.filterRender)
  const sortState = column.getIsSorted()
  const filterCount = React.useMemo(
    () => countActiveFilter(column.getFilterValue()),
    // 过滤值变化时重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [column.getFilterValue()]
  )

  // 完全无交互列: 直接输出 label。
  if (!canSort && !canFilter) {
    return (
      <div className={cn(className)} {...properties}>
        {label}
      </div>
    )
  }

  return (
    <div className={cn("inline-flex items-center gap-0.5", className)} {...properties}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          nativeButton
          render={
            <button
              type="button"
              aria-label={
                canFilter ? t("common.table.filter.filterColumn", { column: label }) : label
              }
              aria-expanded={open}
              className={cn(
                "-ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium",
                "hover:bg-accent focus-visible:ring-ring focus:outline-none focus-visible:ring-1",
                "data-[state=open]:bg-accent",
                (filterCount > 0 || sortState) && "text-primary"
              )}
              data-state={open ? "open" : "closed"}
            >
              <span className="truncate">{label}</span>
              {sortState === "asc" ? (
                <ArrowUp className="size-3.5 shrink-0" />
              ) : sortState === "desc" ? (
                <ArrowDown className="size-3.5 shrink-0" />
              ) : canSort ? (
                <ArrowUpDown className="text-muted-foreground/50 size-3.5 shrink-0" />
              ) : null}
              {filterCount > 1 && (
                <Badge
                  variant="secondary"
                  className="bg-primary text-primary-foreground h-4 min-w-4 rounded-full px-1 text-[10px] leading-none font-medium tabular-nums"
                >
                  {filterCount}
                </Badge>
              )}
              {filterCount === 1 && <span className="bg-primary size-1.5 shrink-0 rounded-full" />}
              {canFilter && filterCount === 0 ? (
                <Filter className="text-muted-foreground/50 size-3 shrink-0" />
              ) : null}
            </button>
          }
        />
        {canFilter && filterCount > 0 ? (
          <button
            type="button"
            aria-label={t("common.dateSelector.clear")}
            onClick={event => {
              event.stopPropagation()
              column.setFilterValue(undefined)
            }}
            className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex size-5 shrink-0 items-center justify-center rounded-sm focus:outline-none focus-visible:ring-1"
          >
            <X className="size-3" />
          </button>
        ) : null}
        <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
          <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
            <span className="truncate">{label}</span>
            {canFilter && filterCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-6 gap-1 px-1.5 text-xs"
                onClick={() => column.setFilterValue(undefined)}
              >
                <X className="size-3" />
                {t("common.dateSelector.clear")}
              </Button>
            ) : null}
          </div>
          {canSort ? (
            <div className="flex flex-col p-1">
              <SortButton
                active={sortState === "asc"}
                icon={ArrowUp}
                label={t("common.table.sortAsc")}
                onClick={() => column.toggleSorting(false)}
              />
              <SortButton
                active={sortState === "desc"}
                icon={ArrowDown}
                label={t("common.table.sortDesc")}
                onClick={() => column.toggleSorting(true)}
              />
              {sortState ? (
                <SortButton
                  active={false}
                  icon={X}
                  label={t("common.table.resetSort")}
                  onClick={() => column.clearSorting()}
                />
              ) : null}
            </div>
          ) : null}
          {canSort && canFilter ? <Separator /> : null}
          {canFilter ? (
            <DataTableColumnFilterContent
              column={column}
              columnLabel={label}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function SortButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  readonly active: boolean
  readonly icon: React.ComponentType<React.ComponentProps<"svg">>
  readonly label: string
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
        "hover:bg-accent focus-visible:bg-accent focus:outline-none",
        active && "text-primary font-medium"
      )}
    >
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <span>{label}</span>
    </button>
  )
}
