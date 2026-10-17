export type ProjectFileErrorCode = "read" | "invalid" | "write" | "missing"

export const PROJECT_FILE_EXTENSION = ".zdaw"

export function isProjectFile(path: string): boolean {
  return path.toLowerCase().endsWith(PROJECT_FILE_EXTENSION)
}

export function projectFileName(path: string): string {
  const base = path.split(/[\\/]/u).at(-1) ?? path
  return isProjectFile(base) ? base.slice(0, -PROJECT_FILE_EXTENSION.length) : base
}
