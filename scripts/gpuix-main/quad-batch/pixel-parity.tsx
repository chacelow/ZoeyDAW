import { mkdirSync } from "node:fs"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { useLayoutEffect } from "react"
import { QuadBatch } from "@/shared/quads/QuadBatch"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"

const directory = process.argv[2]
if (!directory) throw new Error("Usage: bun pixel-parity.tsx <evidence-directory>")
mkdirSync(directory, { recursive: true })

const cases = [
  {
    name: "stereo-inset-clamp",
    top: 10,
    width: 2,
    height: 40,
    rectangles: [
      [0, 1, 1, 18],
      [1, 5.5, 1, 4.5],
      [0, 30, 1, 4.5],
      [1, 21, 1, 18],
    ],
  },
  {
    name: "fractional-position-size",
    top: 10,
    width: 40,
    height: 40,
    rectangles: [
      [3.5, 4.75, 10.5, 12.75],
      [-0.5, -1.75, 4.5, 5.25],
    ],
  },
]

function Fixture({ item, reference }: { item: (typeof cases)[number]; reference: boolean }) {
  const batch = useQuadBatch()
  useLayoutEffect(() => {
    batch.setQuads(new Float32Array(item.rectangles.flat()))
  }, [batch, item])
  return (
    <div style={{ position: "relative", width: 100, height: 100, backgroundColor: "#0a0a0a" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: item.top,
          width: item.width,
          height: item.height,
          overflow: "hidden",
        }}
      >
        {reference ? (
          item.rectangles.map(([x, y, width, height], index) => (
            <div
              key={index}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width,
                height,
                backgroundColor: "#fafafa",
                opacity: 0.6,
                pointerEvents: "none",
              }}
            />
          ))
        ) : (
          <QuadBatch
            ref={batch.ref}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: item.width,
              height: item.height,
              color: "#fafafa",
              opacity: 0.6,
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
  process.stdout.write(`${JSON.stringify({ event: "native-quad-pixel-parity", results })}\n`)
} finally {
  root.unmount()
}
if (root.renderer.getRetainedElementCount() !== 0)
  throw new Error("Pixel fixture leaked native nodes")
