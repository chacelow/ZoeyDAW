// Multi-session cases include real WASAPI startup/teardown, each measured near one second.
export const NATIVE_MULTI_SESSION_TEST_TIMEOUT = process.platform === "win32" ? 15_000 : undefined
