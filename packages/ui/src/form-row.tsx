import { cn } from "#lib/utils"

/**
 \* FormRowGroup + FormRow — 左右排布的表单行（label 左、控件右）。
 *
 * 左标签列宽度 = 所有行里最宽的标签，但封顶不超过 `maxLabel`（默认 200px）；
 * 用 CSS Subgrid 让每行共享同一套列，标签列自动对齐。行间可选虚线分隔。
 *
 * 用法： <FormRowGroup> <FormRow label="标题" hint="一句话描述" required><Input/></FormRow> <FormRow label="严重度"><Select/></FormRow> </FormRowGroup>
 */

function FormRowGroup({
  className,
  maxLabel = "200px",
  divided = true,
  style,
  ...properties
}: React.ComponentProps<"div"> & {
  /**
  标签列宽度上限；列宽在 max-content 与此值之间自适应。
  */
  readonly maxLabel?: string
  /**
  行间虚线分隔，默认开。
  */
  readonly divided?: boolean
}) {
  return (
    <div
      data-slot="form-row-group"
      className={cn("group/form grid", className)}
      data-divided={divided || undefined}
      style={{ gridTemplateColumns: `fit-content(${maxLabel}) 1fr`, ...style }}
      {...properties}
    />
  )
}

function FormRow({
  label,
  hint,
  required,
  className,
  children,
  ...properties
}: Omit<React.ComponentProps<"div">, "children"> & {
  readonly label: React.ReactNode
  readonly hint?: React.ReactNode
  readonly required?: boolean
  readonly children: React.ReactNode
}) {
  return (
    <div
      data-slot="form-row"
      className={cn(
        "col-span-full grid grid-cols-subgrid items-start gap-x-6 py-2",
        "group-data-[divided]/form:border-border group-data-[divided]/form:border-b group-data-[divided]/form:border-dashed group-data-[divided]/form:last:border-b-0",
        className
      )}
      {...properties}
    >
      <div className="pt-2">
        <div className="flex items-center gap-0.5 text-sm leading-snug font-medium">
          {label}
          {required ? <span className="text-destructive">*</span> : null}
        </div>
        {hint ? (
          <p className="text-muted-foreground mt-0.5 text-xs leading-normal text-balance">{hint}</p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export { FormRowGroup, FormRow }
