import path from "node:path"
import { readFileSync, realpathSync } from "node:fs"
import { releaseMetadata, releasePlatform, repository } from "./metadata.mjs"

export async function compileApplication({
  entrypoint,
  outfile,
  tsconfig = path.join(repository, "apps/gpuix/tsconfig.json"),
}) {
  const platform = releasePlatform()
  const product = JSON.parse(readFileSync(path.join(repository, "package.json"), "utf8"))
  const { version, productName } = releaseMetadata(product.version)
  const addons = {
    "@gpuix/native": path.join(
      repository,
      `.gpuix-main/packages/native/gpuix-native.${platform.bindingSuffix}.node`
    ),
    "@zoeydaw/native": path.join(
      repository,
      `crates/native/zoeydaw-native.${platform.bindingSuffix}.node`
    ),
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
      target: platform.bunTarget,
      outfile,
      autoloadDotenv: false,
      autoloadBunfig: false,
      ...(platform.id === "windows-x64"
        ? {
            windows: {
              hideConsole: true,
              title: productName,
              publisher: productName,
              version: `${version.split("-")[0]}.0`,
              description: "Native digital audio workstation",
            },
          }
        : {}),
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
          build.onLoad({ filter: /[\\/]native[\\/]index\.js$/ }, args => {
            const name = nativeLoaders.get(realpathSync(args.path))
            return name ? bindingModule(name) : undefined
          })
        },
      },
    ],
  })
  if (!result.success) throw new AggregateError(result.logs, "Executable compilation failed")
}
