import { clipVisualGeometry } from "../core/clip-geometry"
import type { ClipRect, TrackRow } from "../core/layout"
import type { ArrangementScene } from "../core/scene"
import { projectVisibleClipCards } from "./render-projection"
import type { ClipCard } from "./render-projection"
import { gridLines } from "../core/rulers/grid-lines"

interface CachedCard {
  card: ClipCard
  rect: ClipRect
  collapsed: boolean
  fadesVisible: boolean
}

export function createClipCardProjection() {
  const caches: [Map<string, CachedCard>, Map<string, CachedCard>] = [new Map(), new Map()]
  return (scene: ArrangementScene, row: TrackRow, automationMode: boolean) => {
    const cards = projectVisibleClipCards(
      scene,
      row,
      automationMode,
      (rect, ghost, selected, hovered, fadesVisible) => {
        const retained = caches[ghost ? 1 : 0]
        const key = rect.clip.id
        const previous = retained.get(key)
        const collapsed = !!rect.track.collapsed
        const sameGeometry =
          previous &&
          previous.card.clip === rect.clip &&
          previous.collapsed === collapsed &&
          previous.fadesVisible === fadesVisible &&
          previous.rect.left === rect.left &&
          previous.rect.top === rect.top &&
          previous.rect.width === rect.width &&
          previous.rect.height === rect.height
        if (
          sameGeometry &&
          previous.card.ghost === ghost &&
          previous.card.selected === selected &&
          previous.card.hovered === hovered
        )
          return previous.card
        const card = {
          clip: rect.clip,
          geometry: sameGeometry
            ? previous.card.geometry
            : clipVisualGeometry(rect, rect.clip, rect.track, fadesVisible),
          ghost,
          selected,
          hovered,
        }
        retained.set(key, { card, rect, collapsed, fadesVisible })
        return card
      }
    )
    const visible = new Set(cards)
    for (const retained of caches)
      for (const [key, entry] of retained) if (!visible.has(entry.card)) retained.delete(key)
    return cards
  }
}

export function createGridProjection() {
  let previous: ArrangementScene | undefined
  let lines: ReturnType<typeof gridLines> = []
  return (scene: ArrangementScene) => {
    const current = scene.viewport
    if (
      previous &&
      previous.bars === scene.bars &&
      previous.gridPlan.cellBars === scene.gridPlan.cellBars &&
      previous.viewport.width === current.width &&
      previous.viewport.scrollX === current.scrollX &&
      previous.viewport.pxPerBar === current.pxPerBar
    )
      return lines
    previous = scene
    lines = gridLines(scene)
    return lines
  }
}
