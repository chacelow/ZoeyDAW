import { clipVisualGeometry } from "../core/clip-geometry"
import type { ClipRect, TrackRow } from "../core/layout"
import type { ArrangementScene } from "../core/scene"
import { projectLocalFadeGeometry, projectVisibleClipCards } from "./render-projection"
import type { ClipCard } from "./render-projection"
import { gridLines, patternRegions } from "../core/rulers/grid-lines"
import type { GridLine, PatternRegion } from "../core/rulers/grid-lines"

export interface RenderClipCard extends ClipCard {
  grid: readonly GridLine[]
}

interface CachedCard {
  card: RenderClipCard
  rect: ClipRect
  collapsed: boolean
  fadesVisible: boolean
  gridRevision: number
}

function sameGridViewport(previous: ArrangementScene | undefined, next: ArrangementScene): boolean {
  return (
    !!previous &&
    previous.bars === next.bars &&
    previous.gridPlan.cellBars === next.gridPlan.cellBars &&
    previous.viewport.width === next.viewport.width &&
    previous.viewport.scrollX === next.viewport.scrollX &&
    previous.viewport.pxPerBar === next.viewport.pxPerBar
  )
}

export function createClipCardProjection() {
  const caches: [Map<string, CachedCard>, Map<string, CachedCard>] = [new Map(), new Map()]
  let previousGrid: ArrangementScene | undefined
  let gridRevision = 0
  return (scene: ArrangementScene, row: TrackRow, automationMode: boolean) => {
    if (!sameGridViewport(previousGrid, scene)) gridRevision++
    previousGrid = scene
    const cards = projectVisibleClipCards(
      scene,
      row,
      automationMode,
      (rect, ghost, selected, hovered, fadesVisible) => {
        const retained = caches[ghost ? 1 : 0]
        const key = rect.clip.id
        const previous = retained.get(key)
        const collapsed = !!rect.track.collapsed
        const sameLocalGeometry =
          previous &&
          previous.card.clip === rect.clip &&
          previous.collapsed === collapsed &&
          previous.fadesVisible === fadesVisible &&
          previous.rect.top === rect.top &&
          previous.rect.width === rect.width &&
          previous.rect.height === rect.height
        const sameGeometry = sameLocalGeometry && previous.rect.left === rect.left
        const sameGrid =
          previous &&
          previous.gridRevision === gridRevision &&
          previous.rect.left === rect.left &&
          previous.rect.width === rect.width
        if (
          sameGeometry &&
          sameGrid &&
          previous.card.ghost === ghost &&
          previous.card.selected === selected &&
          previous.card.hovered === hovered
        )
          return previous.card
        const geometry = sameGeometry
          ? previous.card.geometry
          : clipVisualGeometry(rect, rect.clip, rect.track, fadesVisible)
        const card: RenderClipCard = {
          clip: rect.clip,
          fadeGeometry: sameLocalGeometry
            ? previous.card.fadeGeometry
            : projectLocalFadeGeometry(rect, ghost, fadesVisible),
          geometry,
          grid: sameGrid
            ? previous.card.grid
            : gridLines(
                scene,
                Math.max(0, geometry.left - 1),
                Math.min(scene.viewport.width, geometry.left + geometry.width)
              ),
          ghost,
          selected,
          hovered,
        }
        retained.set(key, { card, rect, collapsed, fadesVisible, gridRevision })
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
  let projection: { lines: GridLine[]; regions: PatternRegion[] } | undefined
  return (scene: ArrangementScene) => {
    if (projection && sameGridViewport(previous, scene)) return projection
    previous = scene
    projection = { lines: gridLines(scene), regions: patternRegions(scene) }
    return projection
  }
}
