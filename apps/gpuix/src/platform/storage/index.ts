import {
  projectFileExists,
  projectFilePath as nativeProjectFilePath,
  readBytes,
  readProjectFile,
  userDirectories,
  writeProjectFile,
} from "@zoeydaw/native"
import type { RecentProject } from "@zoeydaw/native"
import { createSettingStorage, getPreference } from "../settings"

export type { RecentProject }
export function readTextFile(path: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(readBytes(path))
}


export interface ProjectFileStorage {
  read(path: string): string | null
  write(path: string, json: string): void
}

export interface RecentProjectStorage {
  get(): readonly RecentProject[] | null
  set(list: readonly RecentProject[]): void
}

const pad = (value: number) => String(value).padStart(2, "0")

export function createProjectFileStorage(): ProjectFileStorage {
  return {
    read: readProjectFile,
    write(path, json) {
      const date = new Date()
      const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
      writeProjectFile(path, json, {
        stamp: `${day} ${time}`,
        limit: getPreference("projectBackupCount"),
      })
    },
  }
}

export function createRecentProjectStorage(
  options: { configDir?: string } = {}
): RecentProjectStorage {
  const setting = createSettingStorage("recentProjects", options)
  return { get: setting.get, set: list => setting.set([...list]) }
}

export interface ProjectLocations {
  readonly defaultDirectory: string
  filePath(directory: string, name: string): string | null
  exists(path: string): boolean
}

export function createProjectLocations(): ProjectLocations {
  return {
    defaultDirectory: userDirectories().projectsDir,
    filePath(directory, name) {
      try {
        return nativeProjectFilePath(directory, name)
      } catch {
        return null
      }
    },
    exists: projectFileExists,
  }
}
