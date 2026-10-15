import { readFileSync } from "node:fs"
import path from "node:path"

const timingImport = `import { audioTiming } from ${JSON.stringify(path.join(import.meta.dir, "audio-timing.ts"))};\n`
Bun.plugin({
  name: "clip-audio-phase-profile",
  setup(build) {
    build.onLoad({ filter: /\/react-reconciler\/index\.js$/ }, () => ({
      contents: `import factory from "./cjs/react-reconciler.${process.env.NODE_ENV === "production" ? "production" : "development"}.js"; export default factory.default ?? factory;`,
      loader: "js",
    }))
    build.onLoad(
      { filter: /\/react-reconciler\/cjs\/react-reconciler\.(development|production)\.js$/ },
      args => {
        let source = readFileSync(args.path, "utf8")
        for (const [name, category] of [
          ["renderRootSync", "render"],
          ["commitRoot", "commit"],
          ["flushPassiveEffects", "passive"],
        ]) {
          const marker = `function ${name}(`
          if (!source.includes(marker))
            throw new Error(`Reconciler profiling anchor changed: ${name}`)
          const replacement = `function ${name}(...args) { return audioTiming.time("${category}", () => clipOriginal${name}(...args)); }\nfunction clipOriginal${name}(`
          source = source.replace(marker, () => replacement)
        }
        if (process.env.NODE_ENV !== "production") {
          const marker = "function logComponentRender("
          if (!source.includes(marker)) throw new Error("Component logging anchor changed")
          source = source.replace(
            marker,
            () =>
              'function logComponentRender(...args) { return audioTiming.component(getComponentNameFromFiber(args[0]) ?? "unknown", () => clipOriginalLogComponentRender(...args)); }\nfunction clipOriginalLogComponentRender('
          )
        }
        return {
          contents:
            timingImport +
            "const module = { exports: {} };\n" +
            source +
            "\nexport default module.exports;",
          loader: "js",
        }
      }
    )
    build.onLoad({ filter: /\/react\/dist\/reconciler\/host-config\.js$/ }, args => {
      let source = readFileSync(args.path, "utf8")
      const prepare = "prepareForCommit(_containerInfo) {"
      const reset = "containerInfo.renderer.flushMutations();"
      if (!source.includes(prepare) || !source.includes(reset))
        throw new Error("Host commit instrumentation anchor changed")
      source =
        timingImport +
        "let clipAudioCommitStart = 0;\n" +
        source.replace(prepare, () => prepare + "\nclipAudioCommitStart = performance.now();")
      source = source.replace(
        reset,
        () => reset + '\naudioTiming.add("hostCommit", performance.now() - clipAudioCommitStart);'
      )
      return { contents: source, loader: "js" }
    })
  },
})
