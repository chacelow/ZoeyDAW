import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@zoeymind/ui"
import {
  addPanel,
  closeOtherTabs,
  closeTab,
  findGroup,
  getBorderTabs,
  getGroups,
  hideTab,
  moveGroupOrPanel,
  type DockLayoutJSON,
} from "./model"
import { iconStyle, type DockUpdate } from "./dock-presentation"
import type { DockLabels, DockRegistry } from "./DockLayout"

interface Props {
  id: string
  groupId: string
  layout: DockLayoutJSON
  registry: DockRegistry
  labels: DockLabels
  update: DockUpdate
}

export function DockTabMenu({ id, groupId, layout, registry, labels, update }: Props) {
  const available = new Set([
    ...getGroups(layout.root).flatMap(group => group.tabs),
    ...getBorderTabs(layout),
  ])
  const hidden = Object.entries(registry).filter(([key]) => !available.has(key))
  const cannotSplit = (findGroup(layout, groupId)?.tabs.length ?? 0) < 2
  return (
    <>
      <DropdownMenuItem
        data-testid={`dock-menu-close-${id}`}
        onClick={() => update(current => closeTab(current, id))}
      >
        {labels.close}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => update(current => closeOtherTabs(current, id))}>
        {labels.closeOthers}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={cannotSplit}
        onClick={() =>
          update(current => moveGroupOrPanel(current, { groupId, tabId: id }, groupId, "right"))
        }
      >
        {labels.splitRight}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={cannotSplit}
        onClick={() =>
          update(current => moveGroupOrPanel(current, { groupId, tabId: id }, groupId, "bottom"))
        }
      >
        {labels.splitDown}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => update(current => hideTab(current, id))}>
        {labels.hide}
      </DropdownMenuItem>
      {hidden.length > 0 && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{labels.showPanels}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="project-workspace-menu" style={iconStyle}>
            {hidden.map(([key, registration]) => (
              <DropdownMenuItem
                key={key}
                data-testid={`dock-show-${key}`}
                onClick={() => update(current => addPanel(current, key, groupId))}
              >
                {registration.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
    </>
  )
}
