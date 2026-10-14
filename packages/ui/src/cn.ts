import { clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import type { ClassValue } from "clsx"

const mergeClasses = extendTailwindMerge({
  extend: {
    theme: {
      text: ["control", "control-compact", "control-track"],
      spacing: [
        "control-h",
        "control-compact",
        "control-track",
        "control-track-gap",
        "control-track-pad",
        "control-pad-x",
        "control-gap",
        "control-icon-slot",
        "control-icon",
        "control-icon-compact",
        "transport-icon",
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return mergeClasses(clsx(inputs))
}
