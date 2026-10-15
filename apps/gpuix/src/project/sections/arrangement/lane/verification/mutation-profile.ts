import { isDeepStrictEqual } from "node:util"

interface NodeState {
  type: string
  parent: number | null
  style: Record<string, unknown>
  testId: string | null
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function freshCounts() {
  return {
    operations: 0,
    creates: 0,
    destroyRequests: 0,
    destroyed: 0,
    initialAttachments: 0,
    reorders: 0,
    reparents: 0,
    initialStyles: 0,
    positionOnly: 0,
    sizeOrLayoutOnly: 0,
    paintOnly: 0,
    mixedStyles: 0,
    unchangedStyles: 0,
    textUpdates: 0,
    propUpdates: 0,
    initialTextOrProps: 0,
    events: 0,
    other: 0,
    clipCreates: 0,
    clipDestroys: 0,
  }
}

const positionKeys = new Set(["left", "top", "right", "bottom", "translateX", "translateY"])
const layoutKeys = new Set([
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "display",
  "overflow",
  "flex",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "position",
  "padding",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "paddingBottom",
  "gap",
])
const paintKeys = new Set(["color", "backgroundColor", "opacity", "borderColor", "cursor"])
const isClip = (testId: string | null) =>
  !!testId && (testId.startsWith("clip-source-") || testId.startsWith("clip-ghost-"))

export class MutationProfile {
  private readonly nodes = new Map<number, NodeState>()
  private counts = freshCounts()
  private createdTypes = new Map<string, number>()
  private readonly enteredClips = new Set<string>()
  private readonly exitedClips = new Set<string>()

  beginFrame(): void {
    this.counts = freshCounts()
    this.createdTypes.clear()
    this.enteredClips.clear()
    this.exitedClips.clear()
  }

  observe(payload: string, destroyed: readonly number[]): void {
    const operations: unknown = JSON.parse(payload)
    if (!Array.isArray(operations)) throw new Error("Host mutations must be a tuple array")
    const created = new Set<number>()
    for (const operation of operations) {
      if (!Array.isArray(operation) || typeof operation[0] !== "string")
        throw new Error("Invalid host mutation tuple")
      const kind = operation[0]
      const id: unknown = operation[1]
      this.counts.operations++
      if (kind === "setKeyboardFocusDim") {
        this.counts.other++
        continue
      }
      if (typeof id !== "number") throw new Error(`Invalid host mutation id for ${kind}`)
      if (kind === "createElement") {
        const type: unknown = operation[2]
        if (typeof type !== "string") throw new Error("Invalid created element type")
        this.nodes.set(id, { type, parent: null, style: {}, testId: null })
        created.add(id)
        this.counts.creates++
        this.createdTypes.set(type, (this.createdTypes.get(type) ?? 0) + 1)
      } else if (kind === "destroyElement") {
        this.counts.destroyRequests++
      } else if (kind === "appendChild" || kind === "insertBefore") {
        const child: unknown = operation[2]
        if (typeof child !== "number") throw new Error("Invalid mutation child id")
        const node = this.nodes.get(child)
        if (!node) throw new Error(`Unknown mutation child ${child}`)
        if (created.has(child) || node.parent === null) this.counts.initialAttachments++
        else if (node.parent === id) this.counts.reorders++
        else this.counts.reparents++
        node.parent = id
      } else if (kind === "setStyle") {
        const style: unknown = operation[2]
        if (!object(style)) throw new Error("Invalid complete replacement style")
        const node = this.nodes.get(id)
        if (!node) throw new Error(`Unknown styled element ${id}`)
        if (created.has(id)) this.counts.initialStyles++
        else {
          const keys = new Set([...Object.keys(node.style), ...Object.keys(style)])
          const changed = [...keys].filter(key => !isDeepStrictEqual(node.style[key], style[key]))
          if (changed.length === 0) this.counts.unchangedStyles++
          else if (changed.every(key => positionKeys.has(key))) this.counts.positionOnly++
          else if (changed.every(key => layoutKeys.has(key))) this.counts.sizeOrLayoutOnly++
          else if (changed.every(key => paintKeys.has(key))) this.counts.paintOnly++
          else this.counts.mixedStyles++
        }
        node.style = style
      } else if (kind === "setText" || kind === "setCustomProp") {
        if (created.has(id)) this.counts.initialTextOrProps++
        else if (kind === "setText") this.counts.textUpdates++
        else this.counts.propUpdates++
        if (kind === "setCustomProp" && operation[2] === "testId") {
          const testId: unknown = operation[3]
          if (typeof testId !== "string") throw new Error("Invalid native testId mutation")
          const node = this.nodes.get(id)
          if (!node) throw new Error(`Unknown testId element ${id}`)
          node.testId = testId
          if (created.has(id) && isClip(testId)) {
            this.counts.clipCreates++
            this.enteredClips.add(testId)
          }
        }
      } else if (kind === "setEventListener") this.counts.events++
      else if (kind === "setRoot") this.counts.other++
      else throw new Error(`Unclassified host mutation ${kind}`)
    }
    for (const id of destroyed) {
      const node = this.nodes.get(id)
      if (!node) continue
      this.counts.destroyed++
      if (isClip(node.testId)) {
        this.counts.clipDestroys++
        if (node.testId) this.exitedClips.add(node.testId)
      }
      this.nodes.delete(id)
    }
  }

  snapshot() {
    return {
      ...this.counts,
      createdTypes: Object.fromEntries(this.createdTypes),
      enteredClips: [...this.enteredClips],
      exitedClips: [...this.exitedClips],
    }
  }
}
