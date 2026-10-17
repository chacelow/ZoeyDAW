import path from "node:path"

export function gitExecutable() {
  const override = process.env.GPUIX_GIT_EXECUTABLE
  if (override) {
    if (!path.isAbsolute(override)) throw new Error("GPUIX_GIT_EXECUTABLE must be an absolute path")
    return override
  }
  if (process.platform !== "win32") return "/usr/bin/git"
  if (!process.env.ProgramFiles)
    throw new Error("ProgramFiles is required to locate Git for Windows")
  return path.join(process.env.ProgramFiles, "Git", "cmd", "git.exe")
}

export function isWithinBuildPath(value, root) {
  const relative = path.relative(root, value)
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  )
}
