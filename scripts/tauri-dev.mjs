import { existsSync } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const env = { ...process.env }

if (process.platform === "win32") {
  const vsRoot = env.ZOEYDAW_VS_ROOT ?? "D:\\vs-buildtools"
  const cmakeBin = path.join(
    vsRoot,
    "Common7",
    "IDE",
    "CommonExtensions",
    "Microsoft",
    "CMake",
    "CMake",
    "bin"
  )
  const msvcBin = path.join(vsRoot, "VC", "Tools", "MSVC", "14.44.35207", "bin", "Hostx64", "x64")
  const cmake = path.join(cmakeBin, "cmake.exe")
  const msbuildBin = env.ZOEYDAW_MSBUILD_ROOT ?? "D:\\vs\\MSBuild\\Current\\Bin"
  if (!existsSync(cmake)) {
    throw new Error(
      `CMake was not found at ${cmake}. Set ZOEYDAW_VS_ROOT to the Visual Studio Build Tools root.`
    )
  }
  env.PATH = [cmakeBin, msvcBin, msbuildBin, env.PATH].filter(Boolean).join(";")
  env.CMAKE = cmake
  env.CMAKE_GENERATOR = env.ZOEYDAW_CMAKE_GENERATOR ?? "Visual Studio 17 2022"
}
const pnpm =
  process.platform === "win32" ? path.join(env.LOCALAPPDATA ?? "", "pnpm", "pnpm.cmd") : "pnpm"
const command = process.platform === "win32" && existsSync(pnpm) ? pnpm : "pnpm"
const child = spawn(command, ["exec", "tauri", "dev", ...process.argv.slice(2)], {
  cwd: root,
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
