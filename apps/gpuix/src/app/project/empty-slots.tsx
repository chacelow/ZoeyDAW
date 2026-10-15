import type { ProjectLayoutSlots } from "./ProjectLayout"

/**
 * Phase 1 fills no section: TransportBar, BrowserPanel, ArrangementPanel, FooterPanel and
 * StatusStrip are mounted by phase 2's composition root. Empty slots keep the panel frames
 * visible without placeholder UI pretending to be a section.
 */
export function emptyProjectSlots(): ProjectLayoutSlots {
  return { transport: null, browser: null, arrangement: null, footer: null, status: null }
}
