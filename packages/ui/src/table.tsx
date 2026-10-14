import * as React from "react"

import { cn } from "#lib/utils"

function Table({
  className,
  containerClassName,
  ...properties
}: React.ComponentProps<"table"> & {
  /** 覆盖外层滚动容器 className。默认 `overflow-x-auto`。
   *  DataTable fillHeight 场景传空串，把滚动交给外层 ScrollArea 承担。 */
  readonly containerClassName?: string
}) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full", containerClassName ?? "overflow-x-auto")}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...properties}
      />
    </div>
  )
}

function TableHeader({ className, ...properties }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-muted [&_tr]:border-b", className)}
      {...properties}
    />
  )
}

function TableBody({ className, ...properties }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...properties}
    />
  )
}

function TableFooter({ className, ...properties }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("bg-muted/50 border-t font-medium [&>tr]:last:border-b-0", className)}
      {...properties}
    />
  )
}

function TableRow({ className, ...properties }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className
      )}
      {...properties}
    />
  )
}

function TableHead({ className, ...properties }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...properties}
    />
  )
}

function TableCell({ className, ...properties }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "max-w-0 overflow-hidden p-2 align-middle [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...properties}
    />
  )
}

function TableCaption({ className, ...properties }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...properties}
    />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
