import { createContext, useContext, useSyncExternalStore } from "react"
import { HOME_ROUTE, parseRoute, routePath } from "./route"
import type { Route } from "./route"

type LeaveGuard = (next: Route, proceed: () => void) => boolean

export interface Router {
  getRoute(): Route
  navigate(to: string | Route, options?: { readonly replace?: boolean }): void
  back(): boolean
  subscribe(listener: () => void): () => void
  registerLeaveGuard(guard: LeaveGuard): () => void
}

export function createRouter(initial: string | Route = HOME_ROUTE): Router {
  const entries: Route[] = [typeof initial === "string" ? parseRoute(initial) : initial]
  const listeners = new Set<() => void>()
  let leaveGuard: LeaveGuard | null = null
  const emit = () => {
    for (const listener of listeners) listener()
  }
  const transition = (route: Route, commit: () => void): boolean => {
    if (routePath(route) === routePath(entries.at(-1) ?? HOME_ROUTE)) return false
    if (leaveGuard && !leaveGuard(route, commit)) return false
    commit()
    return true
  }
  return {
    getRoute: () => entries.at(-1) ?? HOME_ROUTE,
    navigate(to, options) {
      const route = typeof to === "string" ? parseRoute(to) : to
      transition(route, () => {
        const current = entries.at(-1)
        if (current?.kind === "project" && current.openMode === "new") {
          entries[entries.length - 1] = { kind: "project", projectId: current.projectId }
        }
        if (options?.replace) entries[entries.length - 1] = route
        else entries.push(route)
        emit()
      })
    },
    back() {
      if (entries.length < 2) return false
      return transition(entries[entries.length - 2] ?? HOME_ROUTE, () => {
        entries.pop()
        emit()
      })
    },
    registerLeaveGuard(guard) {
      leaveGuard = guard
      return () => {
        if (leaveGuard === guard) leaveGuard = null
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const RouterContext = createContext<Router | null>(null)
export const RouterProvider = RouterContext.Provider

export function useRouter(): Router {
  const router = useContext(RouterContext)
  if (!router) throw new Error("useRouter() called outside <RouterProvider>")
  return router
}

export function useRoute(): Route {
  const router = useRouter()
  return useSyncExternalStore(router.subscribe, router.getRoute)
}
