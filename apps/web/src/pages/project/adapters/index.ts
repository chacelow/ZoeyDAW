import { useProjectState } from "../stores/useProjectState"
import { beginEdit, endEdit, cancelEdit, undo, redo } from "./context"
import { transportActions } from "./transport"
import { gridActions } from "./grid"
import { trackActions } from "./tracks"
import { clipActions } from "./clips"
import { clipboardActions } from "./clipboard"
import { automationActions } from "./automation"
import { markerActions } from "./markers"
import { snapshotActions } from "./snapshots"
import { midiActions } from "./midi"

export { useProjectState }
export { readSimulatedBar, startProjectSimulation } from "./simulation"
export { setProjectStorageId, serializeProject, hydrateProject } from "./snapshots"

/** Mock adapter command surface; UI never imports internal stores or domain reducers. */
export const projectActions = {
  beginEdit,
  endEdit,
  cancelEdit,
  undo,
  redo,
  ...transportActions,
  ...gridActions,
  ...trackActions,
  ...clipActions,
  ...clipboardActions,
  ...automationActions,
  ...markerActions,
  ...midiActions,
  ...snapshotActions,
}
