export type Route =
  | { readonly kind: "home" }
  | { readonly kind: "project"; readonly projectId: string; readonly openMode?: "new" }
  | { readonly kind: "gallery" }
  | { readonly kind: "not-found"; readonly path: string }

export const HOME_ROUTE: Route = { kind: "home" }

const PROJECT_PATH = /^\/project\/([^/]+)\/?$/u

export function parseRoute(path: string): Route {
  if (path === "/" || path === "") return HOME_ROUTE
  if (path === "/gallery" || path === "/gallery/") return { kind: "gallery" }
  const project = PROJECT_PATH.exec(path)
  if (project?.[1]) return { kind: "project", projectId: decodeURIComponent(project[1]) }
  return { kind: "not-found", path }
}

export function routePath(route: Route): string {
  switch (route.kind) {
    case "home":
      return "/"
    case "gallery":
      return "/gallery"
    case "project":
      return `/project/${encodeURIComponent(route.projectId)}`
    case "not-found":
      return route.path
  }
}
