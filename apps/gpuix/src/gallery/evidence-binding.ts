import { createHash } from "node:crypto"
import { readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function verifyEvidenceBinding() {
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
  const binary = realpathSync(
    path.resolve(
      repository,
      `.gpuix-main/packages/native/gpuix-native.${process.platform}-${process.arch}.node`
    )
  )
  const direct: unknown = require(binary)
  const loadedNative: unknown = require("@gpuix/native")
  if (
    typeof direct !== "object" ||
    direct === null ||
    !("TestGpuixRenderer" in direct) ||
    typeof loadedNative !== "object" ||
    loadedNative === null ||
    !("TestGpuixRenderer" in loadedNative) ||
    direct.TestGpuixRenderer !== loadedNative.TestGpuixRenderer
  ) {
    throw new Error(
      `Actual native binding differs from ${binary}; set NAPI_RS_NATIVE_LIBRARY_PATH to that exact file before launching evidence`
    )
  }
  return {
    path: binary,
    sha256: createHash("sha256").update(readFileSync(binary)).digest("hex"),
    proof:
      "TestRenderer imports @gpuix/native.TestGpuixRenderer; its constructor is identical to the constructor directly loaded from this realpath",
    constructorIdentityMatched: true,
  }
}
