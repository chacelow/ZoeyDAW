import { snapshotGet, snapshotSet, userDirectories } from "@zoeydaw/native"

export interface SnapshotStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}

export function createSnapshotStorage(options: { dataDir?: string } = {}): SnapshotStorage {
  const dataDir = options.dataDir ?? userDirectories().dataDir
  return {
    get: key => snapshotGet(dataDir, key),
    set: (key, value) => snapshotSet(dataDir, key, value),
  }
}
