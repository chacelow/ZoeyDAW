import { nativeProjectStorage } from "@/shared/native/project-storage"
import { nativeAudio } from "@/shared/native/audio"
import { nativePlugins } from "@/shared/native/plugins"
import { getAudioImportPreferences } from "@/shared/app-shared/audio-import-preferences"
import * as runtime from "../context"
import { adoptProjectStorageId } from "../snapshots"
import { createProjectFileController } from "./controller"
import {
  configureBackendSourceLocations,
  configureBackendPluginLocations,
} from "../backend/source-locations"

function createBoundController() {
  const result = createProjectFileController(
    runtime,
    nativeProjectStorage,
    adoptProjectStorageId,
    nativeAudio.analyzeTempo,
    getAudioImportPreferences,
    nativePlugins.snapshot
  )
  configureBackendSourceLocations(result.files.resolveSourceLocation)
  configureBackendPluginLocations(result.files.resolvePluginState)
  return result
}
const controller = createBoundController()
export const projectFiles = controller.files
export const useProjectFilesState = controller.useState
