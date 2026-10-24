import type { Track } from "@zoeydaw/project-core/types"

export function clampBar(bar: number, endBar: number): number {
  return Math.min(endBar, Math.max(1, bar))
}

export function snapBar(
  bar: number,
  enabled: boolean,
  cellBars: number,
  endBar: number,
  bypass = false
): number {
  const bounded = clampBar(bar, endBar)
  return enabled && !bypass
    ? clampBar(1 + Math.round((bounded - 1) / cellBars) * cellBars, endBar)
    : bounded
}

export function barAtClientX(
  clientX: number,
  element: HTMLElement,
  pxPerBar: number,
  endBar: number
): number {
  return clampBar(1 + (clientX - element.getBoundingClientRect().left) / pxPerBar, endBar)
}
export function trackIdsUnderPointer(
  tracks: Track[],
  originId: string,
  clientX: number,
  clientY: number
): string[] {
  const target = document
    .elementsFromPoint(clientX, clientY)
    .find(element => element instanceof HTMLElement && element.dataset.trackId)
  const targetId = target instanceof HTMLElement ? target.dataset.trackId : originId
  const first = tracks.findIndex(track => track.id === originId)
  const last = tracks.findIndex(track => track.id === targetId)
  return first === -1 || last === -1
    ? [originId]
    : tracks.slice(Math.min(first, last), Math.max(first, last) + 1).map(track => track.id)
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
  )
}

export function isCopyGesture(event: { altKey: boolean; ctrlKey: boolean }): boolean {
  return event.altKey || (!/Mac|iPhone|iPad/.test(navigator.platform) && event.ctrlKey)
}
