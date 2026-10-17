import { Fragment } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Button } from "../Button"
import { Icon } from "../Icon"
import { IconSlot } from "../IconSlot"
import type { Props } from "@gpuix/react"

export interface BreadcrumbProps extends Omit<Props, "children"> {
  readonly label: string
  readonly segments: readonly {
    readonly id: string
    readonly label: string
    readonly onSelect: () => void
    readonly disabled?: boolean
  }[]
}

export function Breadcrumb({ label, segments, ...props }: BreadcrumbProps) {
  const theme = useTheme()
  return (
    <div
      {...props}
      role="navigation"
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: theme.control["--spacing-control-track-gap"],
        ...props.style,
      }}
    >
      {segments.map((segment, index) => (
        <Fragment key={segment.id}>
          {index > 0 ? (
            <IconSlot>
              <Icon name="ChevronRight" color={theme.colors.mutedForeground} />
            </IconSlot>
          ) : null}
          <Button
            variant="ghost"
            label={segment.label}
            aria-current={index === segments.length - 1 ? "page" : undefined}
            disabled={segment.disabled}
            onClick={segment.onSelect}
          >
            {segment.label}
          </Button>
        </Fragment>
      ))}
    </div>
  )
}
