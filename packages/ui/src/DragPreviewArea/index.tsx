import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  type HTMLMotionProps,
} from "motion/react";
import { Ban } from "lucide-react";
import { cn } from "#lib/utils";

export interface DragPreviewAreaProps extends Omit<
  HTMLMotionProps<"div">,
  | "ref"
  | "drag"
  | "onPan"
  | "onPanStart"
  | "onPanEnd"
  | "onPointerDownCapture"
  | "onClickCapture"
> {
  ref?: Ref<HTMLDivElement>;
  sourceSelector?: string;
  renderPreview: (source: HTMLElement) => ReactNode;
  disabledDropLabel: string;
}

interface DragPreview {
  source: HTMLElement;
  content: ReactNode;
  origin: { x: number; y: number };
}

export function DragPreviewArea({
  ref,
  sourceSelector = "[data-drag-source]",
  renderPreview,
  disabledDropLabel,
  className,
  children,
  ...props
}: DragPreviewAreaProps) {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const pressedSource = useRef<HTMLElement | null>(null);
  const dragging = useRef(false);
  const suppressClick = useRef(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const reducedMotion = useReducedMotion();

  const cancel = useCallback(() => {
    dragging.current = false;
    setPreview(null);
  }, []);

  useEffect(() => {
    if (!preview) return;
    const { source } = preview;
    source.setAttribute("data-drag-preview-source-active", "");
    document.body.classList.add("drag-preview-active");
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("pointercancel", cancel);
    return () => {
      source.removeAttribute("data-drag-preview-source-active");
      document.body.classList.remove("drag-preview-active");
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [preview, cancel]);

  return (
    <>
      <motion.div
        {...props}
        ref={ref}
        className={cn(
          "touch-none [&_[data-drag-preview-source-active]]:opacity-40",
          className,
        )}
        onPointerDownCapture={(event) => {
          suppressClick.current = false;
          pressedSource.current = null;
          if (event.button !== 0 || !(event.target instanceof Element)) return;
          const source = event.target.closest(sourceSelector);
          if (
            !(source instanceof HTMLElement) ||
            !event.currentTarget.contains(source)
          )
            return;
          const control = event.target.closest(
            "button, a, input, textarea, select, [data-no-drag]",
          );
          if (control && control !== source && source.contains(control)) return;
          pressedSource.current = source;
        }}
        onPanStart={(event) => {
          const source = pressedSource.current;
          if (!source) return;
          const content = renderPreview(source);
          if (content === null || content === undefined) return;
          const rect = source.getBoundingClientRect();
          dragging.current = true;
          suppressClick.current = true;
          x.stop();
          y.stop();
          x.set(event.clientX + 12);
          y.set(event.clientY + 12);
          setPreview({
            source,
            content,
            origin: { x: rect.left, y: rect.top },
          });
        }}
        onPan={(event) => {
          if (!dragging.current) return;
          x.set(event.clientX + 12);
          y.set(event.clientY + 12);
        }}
        onPanEnd={cancel}
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }}
      >
        {children}
      </motion.div>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence initial={false}>
            {preview && (
              <motion.div
                key="drag-preview"
                data-slot="drag-preview"
                aria-hidden
                className="pointer-events-none fixed top-0 left-0 z-[1000] flex min-w-32 max-w-xs items-center gap-2 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
                style={{ x, y }}
                initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.96 }}
                animate={{ opacity: 0.85, scale: 1 }}
                exit={{
                  x: reducedMotion ? x.get() : preview.origin.x,
                  y: reducedMotion ? y.get() : preview.origin.y,
                  opacity: 0,
                  scale: reducedMotion ? 1 : 0.96,
                  transition: {
                    duration: reducedMotion ? 0 : 0.25,
                    ease: [0.22, 1, 0.36, 1],
                  },
                }}
                transition={{
                  duration: reducedMotion ? 0 : 0.15,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {preview.content}
                <span
                  title={disabledDropLabel}
                  className="ml-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-popover text-destructive"
                >
                  <Ban className="size-5" />
                </span>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
