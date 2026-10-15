/**
 * Single-window, single-project routes. The web app's paths remain the identity so
 * `parseRoute`/`routePath` round-trip anything a future deep link or menu supplies.
 */
export type Route =
  | { readonly kind: "home" }
  | { readonly kind: "project"; readonly projectId: string }
  | { readonly kind: "not-found"; readonly path: string }

export const HOME_ROUTE: Route = { kind: "home" }

const PROJECT_PATH = /^\/project\/([^/]+)\/?$/u

export function parseRoute(path: string): Route {
  if (path === "/" || path === "") return HOME_ROUTE
  const project = PROJECT_PATH.exec(path)
  if (project?.[1]) return { kind: "project", projectId: decodeURIComponent(project[1]) }
  return { kind: "not-found", path }
}

export function routePath(route: Route): string {
  switch (route.kind) {
    case "home":
      return "/"
    case "project":
      return `/project/${encodeURIComponent(route.projectId)}`
    case "not-found":
      return route.path
  }
}
