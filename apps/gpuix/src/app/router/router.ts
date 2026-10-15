import { createContext, useContext, useSyncExternalStore } from "react"
import { HOME_ROUTE, parseRoute } from "./route"
import type { Route } from "./route"

/**
 * In-memory history for the single native window. gpuix has no DOM history, and
 * @gpuix/react ships no router, so this is the only navigation owner.
 */
export interface Router {
  getRoute(): Route
  /** Pushes a route; `replace` swaps the current entry instead. */
  navigate(to: string | Route, options?: { readonly replace?: boolean }): void
  /** Pops one entry; at the first entry it stays put and returns false. */
  back(): boolean
  subscribe(listener: () => void): () => void
}

export function createRouter(initial: string | Route = HOME_ROUTE): Router {
  const entries: Route[] = [typeof initial === "string" ? parseRoute(initial) : initial]
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const listener of listeners) listener()
  }
  return {
    getRoute: () => entries.at(-1) ?? HOME_ROUTE,
    navigate(to, options) {
      const route = typeof to === "string" ? parseRoute(to) : to
      if (options?.replace) entries[entries.length - 1] = route
      else entries.push(route)
      emit()
    },
    back() {
      if (entries.length < 2) return false
      entries.pop()
      emit()
      return true
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
