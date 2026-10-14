import { Skeleton } from "#components/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#components/table"
import { cn } from "#lib/utils"

interface DataTableSkeletonProperties extends React.ComponentProps<"div"> {
  readonly columnCount: number
  readonly rowCount?: number
  readonly filterCount?: number
  readonly cellWidths?: string[]
  readonly withViewOptions?: boolean
  readonly withPagination?: boolean
  readonly shrinkZero?: boolean
}

export function DataTableSkeleton({
  columnCount,
  rowCount = 10,
  filterCount = 0,
  cellWidths = ["auto"],
  withViewOptions = true,
  withPagination = true,
  shrinkZero = false,
  className,
  ...properties
}: DataTableSkeletonProperties) {
  const cozyCellWidths = Array.from(
    { length: columnCount },
    (_, index) => cellWidths[index % cellWidths.length] ?? "auto"
  )

  return (
    <div className={cn("flex w-full flex-col gap-2.5 overflow-auto", className)} {...properties}>
      <div className="flex w-full items-center justify-between gap-2 overflow-auto p-1">
        <div className="flex flex-1 items-center gap-2">
          {filterCount > 0
            ? Array.from({ length: filterCount }).map((_, index) => {
                return <Skeleton key={index} className="h-7 w-18 border-dashed" />
              })
            : null}
        </div>
        {withViewOptions ? <Skeleton className="ml-auto hidden h-7 w-18 lg:flex" /> : null}
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {Array.from({ length: 1 }).map((_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                {Array.from({ length: columnCount }).map((_, index) => (
                  <TableHead
                    key={index}
                    style={{
                      width: cozyCellWidths[index],
                      minWidth: shrinkZero ? cozyCellWidths[index] : "auto",
                    }}
                  >
                    <Skeleton className="h-6 w-full" />
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {Array.from({ length: rowCount }).map((_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                {Array.from({ length: columnCount }).map((_, index) => (
                  <TableCell
                    key={index}
                    style={{
                      width: cozyCellWidths[index],
                      minWidth: shrinkZero ? cozyCellWidths[index] : "auto",
                    }}
                  >
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {withPagination ? (
        <div className="flex w-full items-center justify-between gap-4 overflow-auto p-1 sm:gap-8">
          <Skeleton className="h-7 w-40 shrink-0" />
          <div className="flex items-center gap-4 sm:gap-6 lg:gap-8">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-7 w-18" />
            </div>
            <div className="flex items-center justify-center text-sm font-medium">
              <Skeleton className="h-7 w-20" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="hidden size-7 lg:block" />
              <Skeleton className="size-7" />
              <Skeleton className="size-7" />
              <Skeleton className="hidden size-7 lg:block" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
