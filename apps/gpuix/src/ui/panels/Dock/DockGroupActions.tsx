import { useState } from "react"
import type { ReactNode } from "react"
import type { KeyEvent, Props } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { ToolbarIconButton, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, IconSlot } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import type { DockLabels } from "./index"
import type { DockDragController } from "./useDockDrag"

export function DockGroupActions({ groupId, visible, compact = false, draggable = true, maximized, labels, drag, onMaximize, onFocus, onKeyDown, children, testId }: {
  groupId: string
  visible: boolean
  compact?: boolean
  draggable?: boolean
  maximized: boolean
  labels: DockLabels
  drag: DockDragController
  onMaximize: () => void
  onFocus?: Props["onFocus"]
  onKeyDown?: (event: KeyEvent) => void
  children?: ReactNode
  testId: string
}) {
  const theme = useTheme()
  const maximizeLabel = maximized ? labels.restore : labels.maximize
  const [menuOpen, setMenuOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const shown = visible || menuOpen || focused
  const claimFocus: Props["onFocus"] = event => { setFocused(true); onFocus?.(event) }
  return (
    <div testId={`${testId}-actions-${groupId}`} style={{ display: "flex", flexDirection: "row", alignItems: "center", flexShrink: 0, gap: theme.control["--spacing-control-gap"], opacity: shown ? 1 : 0 }}>
      {!compact ? <>
        {draggable ? <ToolbarIconButton label={labels.dragGroup} testId={`${testId}-drag-group-${groupId}`}
          onMouseDown={event => drag.start({ groupId }, event)} onMouseMove={drag.move} onMouseUp={drag.release}
          onBlur={() => { drag.cancel(); setFocused(false) }} onFocus={claimFocus} onKeyDown={onKeyDown}>
          <IconSlot><Icon name="GripVertical" /></IconSlot>
        </ToolbarIconButton> : null}
        <ToolbarIconButton label={maximizeLabel} testId={`${testId}-maximize-${groupId}`} onClick={onMaximize} onFocus={claimFocus} onBlur={() => setFocused(false)} onKeyDown={onKeyDown}>
          <IconSlot><Icon name={maximized ? "Minimize2" : "Maximize2"} /></IconSlot>
        </ToolbarIconButton>
      </> : null}
      <DropdownMenu onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <ToolbarIconButton label={labels.more} testId={`${testId}-more-${groupId}`} onFocus={claimFocus} onBlur={() => setFocused(false)} onKeyDown={onKeyDown}>
            <IconSlot><Icon name="Ellipsis" /></IconSlot>
          </ToolbarIconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {children}
          <DropdownMenuItem testId={`${testId}-maximize-menu-${groupId}`} onSelect={onMaximize}>{maximizeLabel}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
