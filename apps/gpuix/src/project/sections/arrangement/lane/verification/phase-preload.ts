import "./react-profile-preload"
import {
  markCommitComplete,
  markPrepareForCommit,
  markResetEnd,
  markResetStart,
} from "./frame-phases"

process.env.LANE_PHASE_PROFILE = "1"
const previousHook: unknown = Reflect.get(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__")
const hook =
  previousHook && typeof previousHook === "object"
    ? previousHook
    : {
        supportsFiber: true,
        inject: () => 1,
      }
const previousCommit: unknown = Reflect.get(hook, "onCommitFiberRoot")
Reflect.set(hook, "onCommitFiberRoot", function (...args: unknown[]) {
  markCommitComplete()
  if (typeof previousCommit === "function") return Reflect.apply(previousCommit, hook, args)
})
Reflect.set(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__", hook)

const testingEntry = import.meta.resolve("@gpuix/react/testing")
const hostUrl = new URL("./reconciler/host-config.js", testingEntry)
// Runtime-selected internal host module must be wrapped before reconciler initialization.
const hostModule: unknown = await import(hostUrl.href)
if (!hostModule || typeof hostModule !== "object" || !("hostConfig" in hostModule))
  throw new Error("Production hostConfig instrumentation entry is unavailable")
const config = hostModule.hostConfig
if (!config || typeof config !== "object") throw new Error("Invalid production hostConfig")
const prepare: unknown = Reflect.get(config, "prepareForCommit")
const reset: unknown = Reflect.get(config, "resetAfterCommit")
if (typeof prepare !== "function" || typeof reset !== "function")
  throw new Error("Production host commit boundaries are unavailable")
Reflect.set(config, "prepareForCommit", function (this: unknown, ...args: unknown[]) {
  markPrepareForCommit()
  return Reflect.apply(prepare, this, args)
})
Reflect.set(config, "resetAfterCommit", function (this: unknown, ...args: unknown[]) {
  markResetStart()
  try {
    return Reflect.apply(reset, this, args)
  } finally {
    markResetEnd()
  }
})
