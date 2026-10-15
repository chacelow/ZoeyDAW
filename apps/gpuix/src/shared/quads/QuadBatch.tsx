import type { QuadBatchProps } from "@gpuix/react"

/** Visual-only host. Pass useQuadBatch().ref, then upload local x/y/width/height
 * rectangles through setQuads outside React props. One node per color batch.
 */
export function QuadBatch(props: QuadBatchProps) {
  return <quad-batch {...props} />
}
