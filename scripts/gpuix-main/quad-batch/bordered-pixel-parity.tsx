import { mkdirSync } from "node:fs"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { useLayoutEffect } from "react"
import { QuadBatch } from "@/shared/quads/QuadBatch"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"

const directory = process.argv[2]
if (!directory) throw new Error("Usage: bun bordered-pixel-parity.tsx <evidence-directory>")
mkdirSync(directory, { recursive: true })

const rectangles = [
  [3.5, 4.75, 30.5, 22.75],
  [20.25, 14.5, 25.75, 28.25],
  [-0.5, -1.75, 12.5, 8.25],
]
const cases = [
  { name: "opaque", fill: "#a4b5c6", stroke: "#324567", opacity: 1, width: 1 },
  {
    name: "alpha",
    fill: "rgba(164, 181, 198, 0.63)",
    stroke: "rgba(50, 69, 103, 0.47)",
    opacity: 1,
    width: 1,
  },
  { name: "opacity", fill: "#a4b5c6", stroke: "#324567", opacity: 0.6, width: 1.25 },
  { name: "zero-stroke", fill: "#a4b5c6", stroke: "#324567", opacity: 1, width: 0 },
]

function Fixture({ item, reference }: { item: (typeof cases)[number]; reference: boolean }) {
  const batch = useQuadBatch()
  useLayoutEffect(() => batch.setQuads(new Float32Array(rectangles.flat())), [batch])
  return (
    <div style={{ position: "relative", width: 100, height: 100, backgroundColor: "#171c23" }}>
      <div
        style={{
          position: "absolute",
          left: 20.5,
          top: 10.75,
          width: 50,
          height: 50,
          overflow: "hidden",
        }}
      >
        {reference ? (
          rectangles.map(([left, top, width, height], index) => (
            <div
              key={index}
              style={{
                position: "absolute",
                left,
                top,
                width,
                height,
                backgroundColor: item.fill,
                borderWidth: item.width,
                borderColor: item.stroke,
                opacity: item.opacity,
                pointerEvents: "none",
              }}
            />
          ))
        ) : (
          <QuadBatch
            ref={batch.ref}
            strokeWidth={item.width}
            strokeColor={item.stroke}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 50,
              height: 50,
              color: item.fill,
              opacity: item.opacity,
            }}
          />
        )}
      </div>
    </div>
  )
}

const root = createTestRoot({ width: 100, height: 100 })
const results = []
try {
  for (const item of cases) {
    const actualPath = path.resolve(directory, `${item.name}-quad.png`)
    const referencePath = path.resolve(directory, `${item.name}-div.png`)
    root.render(<Fixture item={item} reference={false} />)
    root.renderer.captureScreenshot(actualPath)
    root.render(<Fixture item={item} reference />)
    root.renderer.captureScreenshot(referencePath)
    results.push({ name: item.name, actualPath, referencePath })
  }
  process.stdout.write(`${JSON.stringify({ event: "bordered-quad-pixel-parity", results })}\n`)
} finally {
  root.unmount()
}
if (root.renderer.getRetainedElementCount() !== 0)
  throw new Error("Bordered pixel fixture leaked nodes")
