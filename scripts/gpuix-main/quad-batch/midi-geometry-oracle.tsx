import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { useLayoutEffect } from "react"
import { QuadBatch } from "@/shared/quads/QuadBatch"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"
import type { QuadBatchController } from "@/shared/quads/useQuadBatch"

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected geometry object")
  return value as Record<string, unknown>
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Expected finite geometry number")
  return value
}
function color(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected geometry color")
  return value
}
function parseNote(value: unknown) {
  const note = object(value)
  return {
    x: number(note.x),
    y: number(note.y),
    width: number(note.width),
    height: number(note.height),
    fill: color(note.fill),
    border: color(note.border),
    plane: number(note.plane),
  }
}
const [geometryPath, directory] = process.argv.slice(2)
if (!geometryPath || !directory)
  throw new Error("Usage: bun midi-geometry-oracle.tsx <geometry.json> <evidence-directory>")
const source = object(JSON.parse(readFileSync(geometryPath, "utf8")))
if (!Array.isArray(source.notes)) throw new Error("Missing consumer notes")
const notes = source.notes.map(parseNote)
if (notes.length !== 10000)
  throw new Error(`Dense consumer fixture has ${notes.length} notes, expected 10000`)
const rawViewport = object(source.viewport)
const viewport = {
  x: number(rawViewport.x),
  y: number(rawViewport.y),
  width: number(rawViewport.width),
  height: number(rawViewport.height),
}
const rawSize = object(source.size)
const size = { width: number(rawSize.width), height: number(rawSize.height) }
const background = color(object(source.colors).arrangementSurface)
const grouped = new Map<
  string,
  { fill: string; border: string; plane: number; rectangles: number[] }
>()
for (const note of notes) {
  const key = `${note.plane}:${note.fill}:${note.border}`
  let group = grouped.get(key)
  if (!group) {
    group = { fill: note.fill, border: note.border, plane: note.plane, rectangles: [] }
    grouped.set(key, group)
  }
  group.rectangles.push(note.x, note.y, note.width, note.height)
}
const materials = [...grouped.values()]
  .sort((a, b) => a.plane - b.plane)
  .map(group => ({ ...group, buffer: new Float32Array(group.rectangles) }))
const controllers = new Map<number, QuadBatchController>()
type Mode = "div" | "fill" | "stroke"
function Batch({ index, mode }: { index: number; mode: Mode }) {
  const material = materials[index]
  if (!material) throw new Error("Missing material")
  const batch = useQuadBatch()
  useLayoutEffect(() => {
    controllers.set(index, batch)
    batch.setQuads(material.buffer)
    return () => {
      controllers.delete(index)
    }
  }, [batch, index, material])
  return (
    <QuadBatch
      ref={batch.ref}
      strokeWidth={mode === "stroke" ? 1 : 0}
      strokeColor={material.border}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: viewport.width,
        height: viewport.height,
        color: material.fill,
      }}
    />
  )
}
function Fixture({ mode }: { mode: Mode }) {
  return (
    <div style={{ position: "relative", ...size, backgroundColor: background }}>
      <div
        style={{
          position: "absolute",
          left: viewport.x,
          top: viewport.y,
          width: viewport.width,
          height: viewport.height,
          overflow: "hidden",
        }}
      >
        {mode === "div"
          ? notes.map((note, index) => (
              <div
                key={index}
                style={{
                  position: "absolute",
                  left: note.x,
                  top: note.y,
                  width: note.width,
                  height: note.height,
                  backgroundColor: note.fill,
                  borderWidth: 1,
                  borderColor: note.border,
                  pointerEvents: "none",
                }}
              />
            ))
          : materials.map((_, index) => <Batch key={index} index={index} mode={mode} />)}
      </div>
    </div>
  )
}
mkdirSync(directory, { recursive: true })
const results = []
for (const mode of ["div", "fill", "stroke"] satisfies Mode[]) {
  const root = createTestRoot(size)
  try {
    const before = performance.now()
    root.render(<Fixture mode={mode} />)
    const mountMs = performance.now() - before
    const retained = root.renderer.getRetainedElementCount()
    root.renderer.captureScreenshot(path.resolve(directory, `midi-${mode}.png`))
    const samples = []
    const iterations = mode === "div" ? 0 : 20
    for (let iteration = 0; iteration < iterations; iteration++) {
      const buffers = materials.map(material => Float32Array.from(material.buffer))
      root.renderer.resetDebugFrameOverlayStats()
      const start = performance.now()
      for (let index = 0; index < buffers.length; index++) {
        const batch = controllers.get(index)
        const buffer = buffers[index]
        if (!batch || !buffer) throw new Error("Missing mounted batch")
        batch.setQuads(buffer)
      }
      const uploadMs = performance.now() - start
      root.renderer.flush()
      samples.push({
        uploadMs,
        uploadAndFlushMs: performance.now() - start,
        native: root.renderer.getDebugFrameOverlayStats(),
      })
    }
    results.push({
      mode,
      mountMs,
      retained,
      noteRecords: notes.length,
      batches: materials.length,
      geometryFloats: materials.reduce((count, material) => count + material.buffer.length, 0),
      nativePaintCalls: notes.length * (mode === "fill" ? 1 : 2),
      samples,
    })
  } finally {
    root.unmount()
  }
  if (root.renderer.getRetainedElementCount() !== 0)
    throw new Error("MIDI geometry oracle leaked native nodes")
}
const result = {
  event: "midi-geometry-oracle",
  reactMode: process.env.NODE_ENV ?? "development",
  geometryPath,
  viewport,
  size,
  results,
}
writeFileSync(path.join(directory, "result.json"), `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(
  `${JSON.stringify({
    ...result,
    results: results.map(({ samples, ...rest }) => ({
      ...rest,
      uploadMeanMs: samples.length
        ? samples.reduce((sum, sample) => sum + sample.uploadMs, 0) / samples.length
        : null,
      uploadAndFlushMeanMs: samples.length
        ? samples.reduce((sum, sample) => sum + sample.uploadAndFlushMs, 0) / samples.length
        : null,
    })),
  })}\n`
)
