import type * as TimelineApi from "./index"

type Assert<Condition extends true> = Condition

type RuntimeTimelineApi = typeof TimelineApi

/** App composition creates the controller, never an independent view implementation. */
export type TimelineViewHasNoRuntimeExport = Assert<
  "TimelineView" extends keyof RuntimeTimelineApi ? false : true
>
