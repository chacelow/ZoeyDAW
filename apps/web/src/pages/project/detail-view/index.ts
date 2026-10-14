export type DetailSection = "clip" | "devices"
export type DetailVisibility = "none" | DetailSection | "both"
export interface DetailViewState {
  visible: DetailVisibility
  restore: Exclude<DetailVisibility, "none">
}

export const DEVICE_VIEW_HEIGHT = 184
export const CLIP_VIEW_HEIGHT = 260
export const CLIP_VIEW_MIN_HEIGHT = 160

export function isDetailVisible(visibility: DetailVisibility, section: DetailSection): boolean {
  return visibility === "both" || visibility === section
}

export function setDetailVisible(
  state: DetailViewState,
  section: DetailSection,
  visible: boolean
): DetailViewState {
  const clip = section === "clip" ? visible : isDetailVisible(state.visible, "clip")
  const devices = section === "devices" ? visible : isDetailVisible(state.visible, "devices")
  const next: DetailVisibility = clip ? (devices ? "both" : "clip") : devices ? "devices" : "none"
  if (next === state.visible) return state
  return {
    visible: next,
    restore: next === "none" ? state.restore : next,
  }
}

export function collapseDetailViews(state: DetailViewState): DetailViewState {
  return state.visible === "none" ? state : { visible: "none", restore: state.visible }
}
