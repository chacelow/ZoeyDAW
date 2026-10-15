import type { QuadBatchProps } from "@gpuix/react"

/** Local x/y/width/height rectangles. Memoize the Float32Array: unchanged references
 * are not uploaded; replace the array to publish edits. One node per color batch.
 * This visual leaf has no pointer, keyboard, or accessibility participation.
 */
export function QuadBatch(props: QuadBatchProps) {
  return <quad-batch {...props} />
}
