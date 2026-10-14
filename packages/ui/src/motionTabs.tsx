import { useState, useLayoutEffect, useRef } from "react"
import { motion } from "motion/react"
import { cn } from "./cn"

export interface TabOption {
  key: string
  label: string
  icon?: React.ReactNode
  content?: React.ReactNode
}

interface MotionTabsProperties {
  readonly options: TabOption[]
  readonly defaultTab?: string
  readonly onChange?: (tabKey: string) => void
  readonly className?: string
  readonly containerClassName?: string
  readonly tabClassName?: string
  readonly activeTabClassName?: string
  readonly inactiveTabClassName?: string
  readonly indicatorClassName?: string
  readonly hoverIndicatorClassName?: string
  readonly showContent?: boolean
}

export function MotionTabs({
  options,
  defaultTab,
  onChange,
  className,
  containerClassName,
  tabClassName,
  activeTabClassName,
  inactiveTabClassName,
  indicatorClassName,
  hoverIndicatorClassName,
  showContent = true,
}: MotionTabsProperties) {
  const [selection, setSelection] = useState(() => ({
    defaultTab,
    key: defaultTab || options[0]?.key || "",
  }))
  if (selection.defaultTab !== defaultTab) {
    setSelection({ defaultTab, key: defaultTab || selection.key })
  }
  const activeTab = selection.key
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)
  const tabReferences = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [dimensions, setDimensions] = useState({
    active: { width: 0, x: 0 },
    hovered: { width: 0, x: 0 },
  })

  const handleTabChange = (tabKey: string) => {
    setSelection({ defaultTab, key: tabKey })
    onChange?.(tabKey)
  }

  useLayoutEffect(() => {
    const elements = tabReferences.current
    const measure = () => {
      const getDimensions = (key: string | null) => {
        const element = key ? elements.get(key) : undefined
        return { width: element?.offsetWidth ?? 0, x: element?.offsetLeft ?? 0 }
      }
      const active = getDimensions(activeTab)
      const hovered = getDimensions(hoveredTab)
      setDimensions(previous =>
        previous.active.width === active.width &&
        previous.active.x === active.x &&
        previous.hovered.width === hovered.width &&
        previous.hovered.x === hovered.x
          ? previous
          : { active, hovered }
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const element of elements.values()) {
      observer.observe(element)
    }
    return () => observer.disconnect()
  }, [options, activeTab, hoveredTab])

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn("relative flex items-center rounded-lg bg-black/5 p-4", containerClassName)}
      >
        {options.map(option => {
          const isActive = activeTab === option.key

          return (
            <button
              type="button"
              key={option.key}
              ref={element => {
                if (element) {
                  tabReferences.current.set(option.key, element)
                } else {
                  tabReferences.current.delete(option.key)
                }
              }}
              className={cn(
                "relative z-10 flex items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-all",
                "hover:text-foreground focus-visible:outline-none",
                isActive
                  ? cn("text-foreground font-semibold", activeTabClassName)
                  : cn("text-muted-foreground", inactiveTabClassName),
                tabClassName
              )}
              onClick={() => handleTabChange(option.key)}
              onMouseEnter={() => setHoveredTab(option.key)}
              onMouseLeave={() => setHoveredTab(null)}
            >
              {option.icon}
              {option.label}
            </button>
          )
        })}

        {/* 活动指示器 */}
        {activeTab ? (
          <motion.div
            className={cn(
              "absolute inset-0 z-4 my-2 rounded-md bg-white shadow-[0_2px_8px_hsla(var(--foreground)_/_0.06)]",
              indicatorClassName
            )}
            initial={false}
            animate={dimensions.active}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 30,
            }}
          />
        ) : null}

        {/* 悬停指示器 */}
        {hoveredTab && hoveredTab !== activeTab ? (
          <motion.div
            className={cn(
              "absolute inset-0 z-0 my-2 rounded-md bg-white/60",
              hoverIndicatorClassName
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, ...dimensions.hovered }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 30,
            }}
          />
        ) : null}
      </div>

      {/* 内容区域 */}
      {showContent ? (
        <div className="mt-4">{options.find(option => option.key === activeTab)?.content}</div>
      ) : null}
    </div>
  )
}
