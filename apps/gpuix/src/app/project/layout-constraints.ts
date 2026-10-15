/**
 * Project panel constraints. Percent strings are relative sizes (ui/panels units).
 *
 * Sources: apps/web/src/pages/project/ProjectLayout.tsx (Browser 25% default, 50% max; Clip
 * 70% max), the footer section's host contract (Clip Edit 40% default, 20% min).
 */
export const PROJECT_LAYOUT = {
  browserDefaultSize: "25%",
  browserMaxSize: "50%",
  arrangementMinWidth: "30%",
  clipDefaultSize: "40%",
  clipMinSize: "20%",
  clipMaxSize: "70%",
} as const
