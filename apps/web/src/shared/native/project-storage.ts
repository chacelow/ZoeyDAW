import { invoke, isTauri } from "@tauri-apps/api/core"
import { open, save } from "@tauri-apps/plugin-dialog"

const projectFilter = [{ name: "ZoeyDAW", extensions: ["zdaw"] }]
const audioFilter = [{ name: "Audio", extensions: ["wav", "aiff", "aif", "flac", "mp3"] }]

export const nativeProjectStorage = {
  available: isTauri,
  pickProject: () => open({ directory: false, multiple: false, filters: projectFilter }),
  pickSavePath: (defaultPath: string) => save({ defaultPath, filters: projectFilter }),
  pickAudio: () => open({ directory: false, multiple: false, filters: audioFilter }),
  inspectMedia: (path: string): Promise<unknown> => invoke("inspect_project_media", { path }),
  openProject: (path: string): Promise<unknown> => invoke("open_project_file", { path }),
  saveProject: (request: {
    path: string
    manifest: unknown
    collect: boolean
    expectedCommitId: string | null
    operationId: string
  }): Promise<unknown> => invoke("save_project_file", request),
  cancel: (operationId: string): Promise<void> => invoke("cancel_project_file", { operationId }),
  relinkMedia: (source: unknown, path: string): Promise<unknown> =>
    invoke("relink_project_media", { source, path }),
}
