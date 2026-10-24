import { CONTROL_METRICS } from "@zoeymind/ui"
import { CLIP_VIEW_HEIGHT, CLIP_VIEW_MIN_HEIGHT, DEVICE_VIEW_HEIGHT } from "../detail-view"
import type { SectionId } from "../types"
import {
  activateTab,
  addPanel,
  borderGroupId,
  borderTabs,
  closeTab,
  findBorder,
  findGroup,
  getGroups,
  hideTab,
  moveGroupOrPanel,
  moveToBorder,
  selectBorderTab,
  toggleBorderVisible,
  type DockLayoutJSON,
} from "./dock/model"
import { workspacePanels, type WorkspaceDestination, type WorkspaceRegion } from "./panels"

type Placement =
  | { readonly kind: "edge"; readonly side: WorkspaceRegion }
  | { readonly kind: "center"; readonly groupId: string }
const dockStrip = CONTROL_METRICS.default["--spacing-control-track"] * 2
const defaultBorderSize = CONTROL_METRICS.default["--spacing-control-track"] * 20

const defaultLayout = (): DockLayoutJSON => ({
  version: 2,
  root: { kind: "group", id: "workspace-center", tabs: ["arrangement"], active: "arrangement" },
  hidden: [],
  activeGroup: "workspace-center",
  maximizedGroup: null,
  borders: {
    left: {
      type: "split",
      visible: true,
      tabs: ["browser"],
      end: [],
      selected: "browser",
      size: defaultBorderSize,
    },
    right: {
      type: "split",
      visible: true,
      tabs: [],
      end: [],
      selected: null,
      size: defaultBorderSize,
    },
    bottom: {
      type: "split",
      visible: true,
      tabs: ["clip", "devices"],
      end: [],
      selected: "clip",
      size: CLIP_VIEW_HEIGHT + dockStrip,
    },
  },
})

export class WorkspaceController {
  private current = defaultLayout()
  private revision = 0
  private readonly listeners = new Set<() => void>()
  private readonly placements = new Map<SectionId, Placement>()
  private clipHeight = CLIP_VIEW_HEIGHT + dockStrip

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  readonly getSnapshot = () => this.revision
  get layout(): DockLayoutJSON {
    return this.current
  }
  private publish() {
    this.revision++
    for (const listener of this.listeners) listener()
  }
  readonly setLayout = (next: DockLayoutJSON) => {
    if (next === this.current) return
    for (const panel of workspacePanels) {
      if (
        !findBorder(next, panel.id) &&
        !getGroups(next.root).some(group => group.tabs.includes(panel.id))
      ) {
        const placement = this.placementOf(panel.id)
        if (placement) this.placements.set(panel.id, placement)
      }
    }
    const previousBottom = this.current.borders.bottom
    if (
      previousBottom?.selected === "clip" &&
      previousBottom.size >= CLIP_VIEW_MIN_HEIGHT + dockStrip
    )
      this.clipHeight = previousBottom.size
    const nextBottom = next.borders.bottom
    if (nextBottom?.selected === "devices" && previousBottom?.selected !== "devices")
      next = {
        ...next,
        borders: {
          ...next.borders,
          bottom: { ...nextBottom, size: DEVICE_VIEW_HEIGHT + dockStrip },
        },
      }
    else if (nextBottom?.selected === "clip" && previousBottom?.selected !== "clip")
      next = {
        ...next,
        borders: { ...next.borders, bottom: { ...nextBottom, size: this.clipHeight } },
      }
    this.current = next
    this.publish()
  }
  private placementOf(id: SectionId): Placement | null {
    const side = findBorder(this.current, id)
    if (side) return { kind: "edge", side }
    const group = getGroups(this.current.root).find(item => item.tabs.includes(id))
    return group ? { kind: "center", groupId: group.id } : null
  }
  hasPanel(id: SectionId) {
    return this.placementOf(id) !== null
  }
  regionPanels(side: WorkspaceRegion): SectionId[] {
    return borderTabs(this.current.borders[side]).filter((id): id is SectionId =>
      workspacePanels.some(panel => panel.id === id)
    )
  }
  isRegionVisible(side: WorkspaceRegion) {
    return this.current.borders[side]?.visible !== false
  }
  isRegionExpanded(side: WorkspaceRegion) {
    const border = this.current.borders[side]
    return Boolean(border?.selected && border.visible !== false)
  }
  toggleRegion = (side: WorkspaceRegion) => this.setLayout(toggleBorderVisible(this.current, side))
  show = (id: SectionId, destination?: WorkspaceDestination) => {
    const existing = this.placementOf(id)
    if (
      existing &&
      destination &&
      (destination === "center"
        ? existing.kind !== "center"
        : existing.kind !== "edge" || existing.side !== destination)
    ) {
      this.move(id, destination)
      return
    }
    if (existing?.kind === "edge") {
      const next = selectBorderTab(this.current, existing.side, id)
      const border = next.borders[existing.side]
      this.setLayout(border?.visible === false ? toggleBorderVisible(next, existing.side) : next)
      return
    }
    if (existing) {
      this.setLayout(activateTab(this.current, id))
      return
    }
    const placement = this.placements.get(id)
    const target =
      destination ??
      (placement?.kind === "edge"
        ? placement.side
        : placement
          ? "center"
          : (workspacePanels.find(panel => panel.id === id)?.region ?? "center"))
    const groupId =
      target === "center"
        ? placement?.kind === "center" && findGroup(this.current, placement.groupId)
          ? placement.groupId
          : (this.current.activeGroup ?? undefined)
        : borderGroupId(target)
    let next = addPanel(this.current, id, groupId)
    if (target !== "center" && next.borders[target]?.visible === false)
      next = toggleBorderVisible(next, target)
    this.setLayout(next)
  }
  close = (id: SectionId) => {
    const placement = this.placementOf(id)
    if (!placement) return
    this.placements.set(id, placement)
    this.setLayout(closeTab(this.current, id))
  }
  hide = (id: SectionId) => {
    const placement = this.placementOf(id)
    if (!placement) return
    this.placements.set(id, placement)
    this.setLayout(hideTab(this.current, id))
  }
  togglePanel = (id: SectionId) => (this.hasPanel(id) ? this.hide(id) : this.show(id))
  toggleBrowser = () => {
    const placement = this.placementOf("browser")
    if (!placement) {
      this.show("browser")
      return
    }
    if (placement.kind === "edge") {
      const border = this.current.borders[placement.side]
      if (!border) return
      if (border.visible === false) {
        this.setLayout(toggleBorderVisible(this.current, placement.side))
        return
      }
      this.setLayout(
        selectBorderTab(
          this.current,
          placement.side,
          border.selected === "browser" ? null : "browser"
        )
      )
      return
    }
    this.setLayout(activateTab(this.current, "browser"))
  }
  move = (id: SectionId, destination: WorkspaceDestination) => {
    const placement = this.placementOf(id)
    if (!placement) {
      this.show(id, destination)
      return
    }
    if (destination === "center") {
      const target = this.current.activeGroup && findGroup(this.current, this.current.activeGroup)
      const first = target ?? getGroups(this.current.root)[0]
      const next = first
        ? moveGroupOrPanel(
            this.current,
            {
              groupId:
                placement.kind === "edge" ? borderGroupId(placement.side) : placement.groupId,
              tabId: id,
            },
            first.id,
            "center"
          )
        : moveGroupOrPanel(
            this.current,
            {
              groupId: borderGroupId(placement.kind === "edge" ? placement.side : "left"),
              tabId: id,
            },
            "dock-empty",
            "center"
          )
      this.setLayout(next)
      return
    }
    this.setLayout(
      moveToBorder(
        this.current,
        {
          groupId: placement.kind === "edge" ? borderGroupId(placement.side) : placement.groupId,
          tabId: id,
        },
        destination,
        this.current.borders[destination]?.size ?? defaultBorderSize
      )
    )
  }
  reset = () => {
    this.placements.clear()
    this.clipHeight = CLIP_VIEW_HEIGHT + dockStrip
    this.setLayout(defaultLayout())
  }
}
