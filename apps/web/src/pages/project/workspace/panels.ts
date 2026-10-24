import type { SectionId } from "../types"

export type WorkspaceRegion = "left" | "bottom" | "right"
export type WorkspaceDestination = WorkspaceRegion | "center"

export const workspacePanels = [
  { id: "browser", title: "Browser", region: "left" },
  { id: "arrangement", title: "Arrangement", region: "center" },
  { id: "clip", title: "Clip", region: "bottom" },
  { id: "devices", title: "Devices", region: "bottom" },
] satisfies { id: SectionId; title: string; region: WorkspaceDestination }[]

export const workspaceRegions: WorkspaceRegion[] = ["left", "bottom", "right"]
