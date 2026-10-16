import path from "node:path"
import { realpathSync } from "node:fs"
import { repository } from "./metadata.mjs"

/** Resolve fixed-platform addons at build time, never through NAPI-RS's dynamic loader. */
export async function compileApplication({
  entrypoint,
  outfile,
  tsconfig = path.join(repository, "apps/gpuix/tsconfig.json"),
}) {
  const addons = {
    "@gpuix/native": path.join(
      repository,
      ".gpuix-main/packages/native/gpuix-native.darwin-arm64.node"
    ),
    "@zoeydaw/native": path.join(repository, "crates/native/zoeydaw-native.darwin-arm64.node"),
  }
  const nativeLoaders = new Map(
    Object.entries(addons).map(([name, binary]) => [
      realpathSync(path.join(path.dirname(binary), "index.js")),
      name,
    ])
  )
  const bindingModule = name => ({
    contents: `module.exports = require(${JSON.stringify(addons[name])}); module.exports.__napiBindingTarget = "native";`,
    loader: "js",
    resolveDir: repository,
  })
  const result = await globalThis.Bun.build({
    entrypoints: [entrypoint],
    tsconfig,
    compile: {
      target: "bun-darwin-arm64",
      outfile,
      autoloadDotenv: false,
      autoloadBunfig: false,
    },
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [
      {
        name: "embedded-native-bindings",
        setup(build) {
          build.onResolve({ filter: /^@(gpuix|zoeydaw)\/native$/ }, args => ({
            path: args.path,
            namespace: "release-binding",
          }))
          build.onLoad({ filter: /.*/, namespace: "release-binding" }, args =>
            bindingModule(args.path)
          )
          build.onLoad({ filter: /\/native\/index\.js$/ }, args => {
            const name = nativeLoaders.get(args.path)
            return name ? bindingModule(name) : undefined
          })
        },
      },
    ],
  })
  if (!result.success) throw new AggregateError(result.logs, "Executable compilation failed")
}
