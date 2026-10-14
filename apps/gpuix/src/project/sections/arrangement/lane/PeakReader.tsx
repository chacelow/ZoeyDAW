export type PeakReader = (
  sourceId: string,
  startBar: number,
  endBar: number,
  pixels: number,
  contentOffsetBars: number
) => Float32Array
