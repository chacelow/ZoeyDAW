import { reduceDocument, uniqueId } from "../model/reducers"
import { document, get } from "./context"
import type { DocumentState } from "../model/types"

export const markerActions = {
  addMarker(bar: number): string | undefined {
    if (!Number.isFinite(bar) || bar < 1) {
      return
    }
    const id = uniqueId("marker")
    document(
      reduceDocument(get().document, {
        type: "markers",
        markers: [...get().document.markers, { id, bar, label: "Marker" }],
      })
    )
    return id
  },
  updateMarker(id: string, patch: Partial<DocumentState["markers"][number]>) {
    const { bar, label, color } = patch
    if (
      (bar !== undefined && (!Number.isFinite(bar) || bar < 1)) ||
      (label !== undefined && typeof label !== "string") ||
      (color !== undefined && typeof color !== "string")
    ) {
      return
    }
    const source = get().document.markers
    const marker = source.find(item => item.id === id)
    if (!marker) {
      return
    }
    const next = {
      ...marker,
      ...(bar !== undefined && { bar }),
      ...(label !== undefined && { label }),
      ...(color !== undefined && { color }),
    }
    if (next.bar === marker.bar && next.label === marker.label && next.color === marker.color) {
      return
    }
    document(
      reduceDocument(get().document, {
        type: "markers",
        markers: source.map(item => (item.id === id ? next : item)),
      })
    )
  },
  deleteMarker(id: string) {
    const source = get().document.markers
    if (source.some(marker => marker.id === id)) {
      document(
        reduceDocument(get().document, {
          type: "markers",
          markers: source.filter(marker => marker.id !== id),
        })
      )
    }
  },
}
