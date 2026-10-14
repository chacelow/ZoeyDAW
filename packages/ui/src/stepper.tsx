import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { cn } from "#lib/utils"
import type { HTMLAttributes, ReactElement } from "react"

// Types
type StepperOrientation = "horizontal" | "vertical"
type StepState = "active" | "completed" | "inactive" | "loading"
interface StepIndicators {
  active?: React.ReactNode
  completed?: React.ReactNode
  inactive?: React.ReactNode
  loading?: React.ReactNode
}

interface StepperContextValue {
  activeStep: number
  setActiveStep: (step: number) => void
  stepsCount: number
  orientation: StepperOrientation
  registerTrigger: (node: HTMLButtonElement, registered: boolean) => void
  triggerNodes: HTMLButtonElement[]
  focusNext: (currentIndex: number) => void
  focusPrev: (currentIndex: number) => void
  focusFirst: () => void
  focusLast: () => void
  indicators: StepIndicators
}

interface StepItemContextValue {
  step: number
  state: StepState
  isDisabled: boolean
  isLoading: boolean
}

const StepperContext = createContext<StepperContextValue | undefined>(undefined)
const StepItemContext = createContext<StepItemContextValue | undefined>(undefined)

function useStepper() {
  const context = useContext(StepperContext)
  if (!context) {
    throw new Error("useStepper must be used within a Stepper")
  }
  return context
}

function useStepItem() {
  const context = useContext(StepItemContext)
  if (!context) {
    throw new Error("useStepItem must be used within a StepperItem")
  }
  return context
}

interface StepperProperties extends HTMLAttributes<HTMLDivElement> {
  readonly defaultValue?: number
  readonly value?: number
  readonly onValueChange?: (value: number) => void
  readonly orientation?: StepperOrientation
  readonly indicators?: StepIndicators
}

function Stepper({
  defaultValue = 1,
  value,
  onValueChange,
  orientation = "horizontal",
  className,
  children,
  indicators = {},
  ...properties
}: StepperProperties) {
  const [activeStep, setActiveStep] = useState(defaultValue)
  const [triggerNodes, setTriggerNodes] = useState<HTMLButtonElement[]>([])

  // Register/unregister triggers
  const registerTrigger = useCallback((node: HTMLButtonElement, registered: boolean) => {
    setTriggerNodes(previous =>
      registered
        ? previous.includes(node)
          ? previous
          : [...previous, node]
        : previous.filter(trigger => trigger !== node)
    )
  }, [])

  const handleSetActiveStep = useCallback(
    (step: number) => {
      if (value === undefined) {
        setActiveStep(step)
      }
      onValueChange?.(step)
    },
    [value, onValueChange]
  )

  const currentStep = value ?? activeStep

  // Context value
  const contextValue = useMemo<StepperContextValue>(() => {
    // Keyboard navigation logic
    const focusTrigger = (index: number) => {
      triggerNodes.at(index)?.focus()
    }
    const focusNext = (currentIndex: number) =>
      focusTrigger((currentIndex + 1) % triggerNodes.length)
    const focusPrevious = (currentIndex: number) =>
      focusTrigger((currentIndex - 1 + triggerNodes.length) % triggerNodes.length)
    const focusFirst = () => focusTrigger(0)
    const focusLast = () => focusTrigger(triggerNodes.length - 1)
    return {
      activeStep: currentStep,
      setActiveStep: handleSetActiveStep,
      stepsCount: Children.toArray(children).filter(
        (child): child is ReactElement =>
          isValidElement(child) &&
          (child.type as { displayName?: string }).displayName === "StepperItem"
      ).length,
      orientation,
      registerTrigger,
      focusNext,
      focusPrev: focusPrevious,
      focusFirst,
      focusLast,
      triggerNodes,
      indicators,
    }
  }, [
    currentStep,
    handleSetActiveStep,
    children,
    orientation,
    registerTrigger,
    triggerNodes,
    indicators,
  ])

  return (
    <StepperContext.Provider value={contextValue}>
      <div
        role="tablist"
        aria-orientation={orientation}
        data-slot="stepper"
        className={cn("w-full", className)}
        data-orientation={orientation}
        {...properties}
      >
        {children}
      </div>
    </StepperContext.Provider>
  )
}

interface StepperItemProperties extends React.HTMLAttributes<HTMLDivElement> {
  readonly step: number
  readonly completed?: boolean
  readonly disabled?: boolean
  readonly loading?: boolean
}

function StepperItem({
  step,
  completed = false,
  disabled = false,
  loading = false,
  className,
  children,
  ...properties
}: StepperItemProperties) {
  const { activeStep } = useStepper()

  const state: StepState =
    completed || step < activeStep ? "completed" : activeStep === step ? "active" : "inactive"

  const isLoading = loading && step === activeStep

  return (
    <StepItemContext.Provider value={{ step, state, isDisabled: disabled, isLoading }}>
      <div
        data-slot="stepper-item"
        className={cn(
          "group/step flex items-center justify-center not-last:flex-1 group-data-[orientation=horizontal]/stepper-nav:flex-row group-data-[orientation=vertical]/stepper-nav:flex-col",
          className
        )}
        data-state={state}
        {...(isLoading ? { "data-loading": true } : {})}
        {...properties}
      >
        {children}
      </div>
    </StepItemContext.Provider>
  )
}

interface StepperTriggerProperties extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly asChild?: boolean
}

function StepperTrigger({
  asChild = false,
  className,
  children,
  tabIndex,
  ...properties
}: StepperTriggerProperties) {
  const { state, isLoading } = useStepItem()
  const {
    setActiveStep,
    activeStep,
    registerTrigger,
    triggerNodes,
    focusNext,
    focusPrev,
    focusFirst,
    focusLast,
  } = useStepper()
  const { step, isDisabled } = useStepItem()
  const isSelected = activeStep === step
  const id = `stepper-tab-${step}`
  const panelId = `stepper-panel-${step}`

  // Register this trigger for keyboard navigation
  const buttonReference = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const node = buttonReference.current
    if (!node) return
    registerTrigger(node, true)
    return () => registerTrigger(node, false)
  }, [registerTrigger])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const myIndex = triggerNodes.indexOf(e.currentTarget)
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown": {
        e.preventDefault()
        if (myIndex !== -1 && focusNext) {
          focusNext(myIndex)
        }
        break
      }
      case "ArrowLeft":
      case "ArrowUp": {
        e.preventDefault()
        if (myIndex !== -1 && focusPrev) {
          focusPrev(myIndex)
        }
        break
      }
      case "Home": {
        e.preventDefault()
        if (focusFirst) {
          focusFirst()
        }
        break
      }
      case "End": {
        e.preventDefault()
        if (focusLast) {
          focusLast()
        }
        break
      }
      case "Enter":
      case " ": {
        e.preventDefault()
        setActiveStep(step)
        break
      }
    }
  }

  if (asChild) {
    return (
      <span data-slot="stepper-trigger" data-state={state} className={className}>
        {children}
      </span>
    )
  }

  return (
    <button
      type="button"
      ref={buttonReference}
      role="tab"
      id={id}
      aria-selected={isSelected}
      aria-controls={panelId}
      tabIndex={typeof tabIndex === "number" ? tabIndex : isSelected ? 0 : -1}
      data-slot="stepper-trigger"
      data-state={state}
      data-loading={isLoading}
      className={cn(
        "focus-visible:border-ring focus-visible:ring-ring/50 inline-flex cursor-pointer items-center outline-none focus-visible:z-10 focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-60",
        "gap-2.5 rounded-full",
        className
      )}
      onClick={() => setActiveStep(step)}
      onKeyDown={handleKeyDown}
      disabled={isDisabled}
      {...properties}
    >
      {children}
    </button>
  )
}

function StepperIndicator({ children, className }: React.ComponentProps<"div">) {
  const { state, isLoading } = useStepItem()
  const { indicators } = useStepper()

  return (
    <div
      data-slot="stepper-indicator"
      data-state={state}
      className={cn(
        "border-background bg-accent text-accent-foreground data-[state=completed]:bg-primary data-[state=completed]:text-primary-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground relative flex size-6 shrink-0 items-center justify-center overflow-hidden",
        "rounded-full text-xs",
        className
      )}
    >
      <div className="absolute">
        {indicators &&
        ((isLoading && indicators.loading) ||
          (state === "completed" && indicators.completed) ||
          (state === "active" && indicators.active) ||
          (state === "inactive" && indicators.inactive))
          ? (isLoading && indicators.loading) ||
            (state === "completed" && indicators.completed) ||
            (state === "active" && indicators.active) ||
            (state === "inactive" && indicators.inactive)
          : children}
      </div>
    </div>
  )
}

function StepperSeparator({ className }: React.ComponentProps<"div">) {
  const { state } = useStepItem()

  return (
    <div
      data-slot="stepper-separator"
      data-state={state}
      className={cn(
        "bg-muted m-0.5 rounded-sm group-data-[orientation=horizontal]/stepper-nav:h-0.5 group-data-[orientation=horizontal]/stepper-nav:flex-1 group-data-[orientation=vertical]/stepper-nav:h-12 group-data-[orientation=vertical]/stepper-nav:w-0.5",
        className
      )}
    />
  )
}

function StepperTitle({ children, className }: React.ComponentProps<"h3">) {
  const { state } = useStepItem()

  return (
    <h3
      data-slot="stepper-title"
      data-state={state}
      className={cn("text-sm leading-none font-medium", className)}
    >
      {children}
    </h3>
  )
}

function StepperDescription({ children, className }: React.ComponentProps<"div">) {
  const { state } = useStepItem()

  return (
    <div
      data-slot="stepper-description"
      data-state={state}
      className={cn("text-muted-foreground text-sm", className)}
    >
      {children}
    </div>
  )
}

function StepperNav({ children, className }: React.ComponentProps<"nav">) {
  const { activeStep, orientation } = useStepper()

  return (
    <nav
      data-slot="stepper-nav"
      data-state={activeStep}
      data-orientation={orientation}
      className={cn(
        "group/stepper-nav inline-flex data-[orientation=horizontal]:w-full data-[orientation=horizontal]:flex-row data-[orientation=vertical]:flex-col",
        className
      )}
    >
      {children}
    </nav>
  )
}

function StepperPanel({ children, className }: React.ComponentProps<"div">) {
  const { activeStep } = useStepper()

  return (
    <div data-slot="stepper-panel" data-state={activeStep} className={cn("w-full", className)}>
      {children}
    </div>
  )
}

interface StepperContentProperties extends React.ComponentProps<"div"> {
  readonly value: number
  readonly forceMount?: boolean
}

function StepperContent({ value, forceMount, children, className }: StepperContentProperties) {
  const { activeStep } = useStepper()
  const isActive = value === activeStep

  if (!forceMount && !isActive) {
    return null
  }

  return (
    <div
      data-slot="stepper-content"
      data-state={activeStep}
      className={cn("w-full", className, !isActive && forceMount && "hidden")}
      hidden={!isActive && forceMount}
    >
      {children}
    </div>
  )
}

export {
  useStepper,
  useStepItem,
  Stepper,
  StepperItem,
  StepperTrigger,
  StepperIndicator,
  StepperSeparator,
  StepperTitle,
  StepperDescription,
  StepperPanel,
  StepperContent,
  StepperNav,
  type StepperProperties as StepperProps,
  type StepperItemProperties as StepperItemProps,
  type StepperTriggerProperties as StepperTriggerProps,
  type StepperContentProperties as StepperContentProps,
}
