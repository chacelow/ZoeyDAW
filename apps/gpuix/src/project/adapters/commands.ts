import {
  beginEdit,
  endEdit,
  cancelEdit,
  undo,
  redo,
  beginPreview,
  previewTracks,
  previewMarkers,
  previewLoop,
  commitPreview,
  cancelPreview,
  get,
} from "./context"
import { transportActions } from "./transport"
import { gridActions } from "./grid"
import { trackActions } from "./tracks"
import { clipActions } from "./clips"
import { clipboardActions } from "./clipboard"
import { automationActions } from "./automation"
import { markerActions } from "./markers"
import { projectFileActions } from "./project-file"
import { midiActions } from "./midi"
import { reduceWorkspace } from "../model/reducers"
import { useProjectState } from "../stores/useProjectState"

export const projectActions = {
  beginEdit,
  endEdit,
  cancelEdit,
  undo,
  redo,
  setDockLayout(dockLayout: string) {
    if (get().workspace.dockLayout === dockLayout) return
    useProjectState.setState({ workspace: reduceWorkspace(get().workspace, { dockLayout }) })
  },
  ...transportActions,
  beginPreview,
  previewTracks,
  previewMarkers,
  previewLoop,
  commitPreview,
  cancelPreview,
  ...gridActions,
  ...trackActions,
  ...clipActions,
  ...clipboardActions,
  ...automationActions,
  ...markerActions,
  ...midiActions,
  ...projectFileActions,
}
