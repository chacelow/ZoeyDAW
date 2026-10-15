import { readFileSync } from "node:fs"

const output = process.env.F4C_CONSUMER_OUTPUT
if (!output) throw new Error("F4C_CONSUMER_OUTPUT requires an external evidence directory")
function replaceOnce(source, before, after) {
  if (!source.includes(before))
    throw new Error(`Consumer instrumentation anchor missing: ${before}`)
  return source.replace(before, () => after)
}
globalThis.Bun.plugin({
  name: "f4c-readonly-consumer-geometry",
  setup(builder) {
    builder.onLoad({ filter: /\/clip-edit\/midi\/note-paint\.ts$/ }, args => {
      let contents = readFileSync(args.path, "utf8")
      contents = replaceOnce(
        contents,
        "const background: Groups = new Map()",
        "globalThis.__f4cGeometry = { roll, notes: [], colors };\n  const background: Groups = new Map()"
      )
      contents = replaceOnce(
        contents,
        "const fillKey =",
        "globalThis.__f4cGeometry.notes.push({ x, y, width, height, fill, border, plane });\n    const fillKey ="
      )
      return { contents, loader: "ts" }
    })
    builder.onLoad({ filter: /\/clip-edit\/verification\/consumer-probe\.tsx$/ }, args => {
      let contents = readFileSync(args.path, "utf8")
      contents = replaceOnce(
        contents,
        `const output = path.join(import.meta.dir, "../evidence", \`f4-\${label}-\${workload}\`)`,
        `const output = ${JSON.stringify(output)}`
      )
      contents = replaceOnce(
        contents,
        "root.renderer.captureScreenshot(filename)",
        `root.renderer.captureScreenshot(filename)\n  if (name === "midi-initial") {\n    const host = root.renderer.findByTestId("midi-grid");\n    writeFileSync(path.join(output, "geometry.json"), JSON.stringify({ ...globalThis.__f4cGeometry, viewport: root.renderer.getElementBounds(host.id), size, workload }));\n  }`
      )
      contents = replaceOnce(
        contents,
        `const initialImage = screenshot(\`\${kind}-initial\`)`,
        `const initialImage = screenshot(\`\${kind}-initial\`); break`
      )
      return { contents, loader: "tsx" }
    })
  },
})
