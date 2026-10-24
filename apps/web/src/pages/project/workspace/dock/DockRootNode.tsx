import type { ReactNode } from "react"
import { splitBounds } from "./geometry"
import { boxStyle, gap, nodeMinimum } from "./dock-presentation"
import type { DockBounds, DockGroup, DockNode } from "./model"
import type { DockRegistry } from "./DockLayout"
import type { DockResize } from "./useDockResize"

interface Props {
  node: DockNode
  box: DockBounds
  registry: DockRegistry
  resize: DockResize
  renderGroup: (group: DockGroup, box: DockBounds) => ReactNode
}

export function DockRootNode({ node, box, registry, resize, renderGroup }: Props) {
  if (node.kind === "group") return renderGroup(node, box)
  const parts = splitBounds(node, box, gap)
  return (
    <div
      className="dock-split"
      data-testid={`dock-split-${node.id}`}
      style={{ position: "absolute", inset: 0 }}
    >
      {node.children.map((child, index) => (
        <div key={child.id} style={boxStyle(parts[index], box)}>
          <DockRootNode
            node={child}
            box={parts[index]}
            registry={registry}
            resize={resize}
            renderGroup={renderGroup}
          />
          {index < node.children.length - 1 && (
            <div
              role="separator"
              aria-orientation={node.orientation === "horizontal" ? "vertical" : "horizontal"}
              data-testid={`dock-divider-${node.id}-${index + 1}`}
              className={`dock-split-divider ${node.orientation}`}
              onPointerDown={event => {
                const axis = node.orientation === "horizontal" ? "x" : "y"
                resize.start(
                  {
                    kind: "split",
                    id: node.id,
                    index,
                    axis,
                    start: axis === "x" ? event.clientX : event.clientY,
                    sizes: parts.map(part => (axis === "x" ? part.width : part.height)),
                    minima: node.children.map(item => nodeMinimum(item, axis === "x", registry)),
                    pointer: event.pointerId,
                  },
                  event
                )
              }}
              onPointerMove={resize.move}
              onPointerUp={resize.release}
              onPointerCancel={resize.cancel}
            />
          )}
        </div>
      ))}
    </div>
  )
}
