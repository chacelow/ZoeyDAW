import {
  setAutomationRecordMode,
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
} from "./context"
import { transportActions } from "./transport"
import { gridActions } from "./grid"
import { trackActions } from "./tracks"
import { clipActions } from "./clips"
import { clipboardActions } from "./clipboard"
import { automationActions } from "./automation"
import { markerActions } from "./markers"
import { midiActions } from "./midi"
import { launcherActions } from "./launcher"

export const projectActions = {
  setAutomationRecordMode,
  beginEdit,
  endEdit,
  cancelEdit,
  undo,
  redo,
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
  ...launcherActions,
}
