"use client"

import * as React from "react"

import { cn } from "#lib/utils"
import { DataTableViewOptions } from "./data-table-view-options"
import type { Table } from "@tanstack/react-table"

interface DataTableToolbarProperties<TData> extends React.ComponentProps<"div"> {
  readonly table: Table<TData>
  /**
  隐藏右上角 "视图" (列显隐) 按钮。默认 false。
  */
  readonly hideViewOptions?: boolean
}

/**
 * 表格顶部工具栏 (slot 容器)。列过滤已改由表头 Popover 承担 (ADR 0002),
 * 这里不再渲染 filter chip / 重置按钮。业务侧把 title、新建、批量操作等
 * 挂在 `children` 里, 右上角固定渲染视图按钮 (可 `hideViewOptions` 关闭)。
 *
 * 需要全局 "清空过滤" 入口时, 挂 `<DataTableResetFilters table={table} />`
 * 到 children 中即可 —— 只在有过滤时才显示。
 */
export function DataTableToolbar<TData>({
  table,
  children,
  className,
  hideViewOptions = false,
  ...properties
}: DataTableToolbarProperties<TData>) {
  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      className={cn("flex w-full items-center justify-between gap-2 p-1", className)}
      {...properties}
    >
      <div className="flex flex-1 items-center gap-2">{children}</div>
      {!hideViewOptions && <DataTableViewOptions table={table} align="end" />}
    </div>
  )
}
