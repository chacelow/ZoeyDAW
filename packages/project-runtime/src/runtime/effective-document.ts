import type { DocumentState, ProjectState } from "@zoeydaw/project-core/types"

export function getEffectiveDocument(state: {
  document: DocumentState
  session: Pick<ProjectState["session"], "preview">
}): DocumentState {
  const { preview } = state.session
  if (!preview) {
    return state.document
  }
  switch (preview.kind) {
    case "tracks": {
      return { ...state.document, tracks: preview.tracks }
    }
    case "markers": {
      return { ...state.document, markers: preview.markers }
    }
    case "loop": {
      return { ...state.document, transport: { ...state.document.transport, loop: preview.loop } }
    }
  }
}
