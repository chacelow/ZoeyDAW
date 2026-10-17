import { consumeKey } from "@/shared/keyboard"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { ListRow } from "../ListRow"
import { Icon } from "../Icon"
import { IconSlot } from "../IconSlot"
import { useInfoBinding } from "../ControlEnvironment"
import type { ListRowProps } from "../ListRow"
import type { IconName } from "../Icon"

export interface TreeRowProps extends Omit<ListRowProps, "leading"> {
  readonly depth?: number
  readonly expanded: boolean
  readonly onExpandedChange: (expanded: boolean) => void
  readonly icon?: IconName
}

export function TreeRow({
  depth = 0,
  expanded,
  onExpandedChange,
  icon = "Folder",
  disabled = false,
  style,
  onKeyDown,
  onClick,
  ...props
}: TreeRowProps) {
  const theme = useTheme()
  const info = useInfoBinding({ type: "button" })
  return (
    <ListRow
      {...info}
      {...props}
      disabled={disabled}
      role="treeitem"
      aria-expanded={expanded}
      aria-level={depth + 1}
      leading={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: theme.control["--spacing-control-track-gap"],
          }}
        >
          <IconSlot>
            <Icon name={expanded ? "ChevronDown" : "ChevronRight"} />
          </IconSlot>
          <IconSlot>
            <Icon name={icon} />
          </IconSlot>
        </div>
      }
      style={sx(
        {
          paddingLeft:
            theme.control["--spacing-control-track-pad"] +
            Math.max(0, depth) * theme.design.treeRow.indent,
        },
        style
      )}
      onClick={event => {
        onExpandedChange(!expanded)
        onClick?.(event)
      }}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (!event.defaultPrevented && (event.key === "left" || event.key === "right")) {
          const next = event.key === "right"
          if (expanded !== next) onExpandedChange(next)
          consumeKey(event, "handled")
        }
      }}
    />
  )
}
