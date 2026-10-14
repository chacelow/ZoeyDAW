export interface Point {
  x: number
  y: number
}

export interface Pointer extends Point {
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  button: number
}
