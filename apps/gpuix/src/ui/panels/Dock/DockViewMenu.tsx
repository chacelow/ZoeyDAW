import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/ui/controls"
import { TitleBarMenuButton } from "../TitleBar"
import { addPanel, dockBorderSides, getBorderTabs, getGroups, hideTab, toggleBorderVisible } from "./model"
import type { DockLayoutProps } from "./index"

export function DockViewMenu({
  layout,
  registry,
  onLayoutChange,
  labels,
  testId = "dock-view",
}: Pick<DockLayoutProps, "layout" | "registry" | "onLayoutChange" | "labels" | "testId">) {
  const visible = new Set([
    ...getGroups(layout.root).flatMap(group => group.tabs),
    ...getBorderTabs(layout),
  ])
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TitleBarMenuButton testId={testId} label={labels.view} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {dockBorderSides.map(side => {
          const border = layout.borders[side]
          return <DropdownMenuCheckboxItem
            key={side} testId={`${testId}-toggle-${side}`} disabled={!border}
            checked={Boolean(border && border.visible !== false)}
            onCheckedChange={() => onLayoutChange(toggleBorderVisible(layout, side))}
          >{labels[side]}</DropdownMenuCheckboxItem>
        })}
        {Object.entries(registry).map(([id, panel]) => (
          <DropdownMenuCheckboxItem
            key={id}
            testId={`${testId}-${id}`}
            checked={visible.has(id)}
            onCheckedChange={checked =>
              onLayoutChange(
                checked
                  ? addPanel(layout, id, layout.activeGroup ?? undefined)
                  : hideTab(layout, id)
              )
            }
          >
            {panel.title}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
