import { useEffect, useMemo, useSyncExternalStore } from "react"
import { useProjectState } from "@/pages/project/stores/useProjectState"
import { createPluginEditor } from "./controller"

export function usePluginEditor(trackId: string, deviceId: string) {
  const epoch = useProjectState(state => state.session.editEpoch)
  const editor = useMemo(
    () => createPluginEditor(trackId, deviceId, epoch),
    [trackId, deviceId, epoch]
  )
  const view = useSyncExternalStore(editor.subscribe, editor.getSnapshot)
  useEffect(() => editor.attach(), [editor])
  return { ...view, open: editor.open, close: editor.close }
}
