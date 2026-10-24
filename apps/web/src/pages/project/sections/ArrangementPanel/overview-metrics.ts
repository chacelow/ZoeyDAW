/**
Overview panel bounds, shared by the timeline layout and the overview itself so neither has
to import the other. The minimum is one fifth of the maximum, and the divider is hidden at
the minimum so the collapsed strip reads as a single band.
*/
export const OVERVIEW_MAX_HEIGHT = 90
export const OVERVIEW_MIN_HEIGHT = OVERVIEW_MAX_HEIGHT / 5
export const OVERVIEW_DEFAULT_HEIGHT = OVERVIEW_MAX_HEIGHT / 3
