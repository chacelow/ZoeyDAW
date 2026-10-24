import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
const { resolve } = path
import { performance } from "node:perf_hooks"

const [corpusArgument, signalsmithBinary, outputArgument] = process.argv.slice(2)
if (!corpusArgument || !signalsmithBinary || !outputArgument)
  throw new Error("Usage: node benchmark-stretch.mjs corpus signalsmithBinary outputDirectory")
const corpus = resolve(corpusArgument)
const output = resolve(outputArgument)
await mkdir(output, { recursive: true })
const contract = JSON.parse(
  await readFile(
    new URL("../../docs/research/audio-acceptance-contract.json", import.meta.url),
    "utf8"
  )
)
const variants = [
  {
    name: "rubberband-r3-offline",
    binary: "rubberband",
    arguments: (input, path, ratio) => [
      "-3",
      "--quiet",
      "--centre-focus",
      "--time",
      String(ratio),
      input,
      path,
    ],
  },
  {
    name: "signalsmith-default-offline",
    binary: resolve(signalsmithBinary),
    arguments: (input, path, ratio) => [input, path, `--time=${ratio}`],
  },
]
const results = []
for (const name of ["tone-440-mono", "stereo-identical", "stereo-antiphase"]) {
  for (const tempoRatio of contract.workload.tempoRatios) {
    const ratio = 1 / tempoRatio
    for (const variant of variants) {
      const input = resolve(corpus, `${name}.wav`)
      const path = resolve(output, `${variant.name}-${name}-${tempoRatio}.wav`)
      const timings = []
      for (let repeat = 0; repeat <= contract.workload.minimumPerformanceRepetitions; repeat++) {
        const start = performance.now()
        const processResult = spawnSync(variant.binary, variant.arguments(input, path, ratio), {
          encoding: "utf8",
        })
        if (processResult.status !== 0)
          throw new Error(`${variant.name}: ${processResult.stderr || processResult.stdout}`)
        if (repeat) timings.push(performance.now() - start)
      }
      timings.sort((a, b) => a - b)
      const resultFile = path.replace(/\.wav$/, ".json")
      const measurement = spawnSync(
        process.execPath,
        [
          new URL("./measure-stretch.mjs", import.meta.url).pathname,
          input,
          path,
          String(ratio),
          resultFile,
        ],
        { encoding: "utf8" }
      )
      if (![0, 1].includes(measurement.status)) throw new Error(measurement.stderr)
      const signal = JSON.parse(readFileSync(resultFile, "utf8"))
      const row = {
        candidate: variant.name,
        fixture: name,
        tempoRatio,
        outputDurationRatio: ratio,
        warmProcessWallMsMedian: timings[Math.floor(timings.length / 2)],
        warmProcessWallMsMax: timings.at(-1),
        includesProcessStartupAndFileIO: true,
        repetitions: timings.length,
        signal,
      }
      results.push(row)
      console.log(
        JSON.stringify({
          candidate: variant.name,
          fixture: name,
          tempoRatio,
          verdict: signal.verdict,
          medianMs: row.warmProcessWallMsMedian,
        })
      )
    }
  }
}
await writeFile(
  resolve(output, "results.json"),
  `${JSON.stringify({ contractVersion: contract.version, mode: "offline-cli-synthetic", results, finalSelectionAllowed: false, limitations: ["No musical corpus listening", "No realtime callback timing", "No Windows run", "No Live output comparison"] }, null, 2)}\n`
)
