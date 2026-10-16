import type * as TimelineApi from "./index"

type Assert<Condition extends true> = Condition

type RuntimeTimelineApi = typeof TimelineApi

export type TimelineViewHasNoRuntimeExport = Assert<
  "TimelineView" extends keyof RuntimeTimelineApi ? false : true
>

export type KeyboardHasNoIndependentPublicFactory = Assert<
  "createTimelineKeyboard" extends keyof RuntimeTimelineApi ? false : true
>
