/**
 * 路由：单项目架构。
 *
 *   /              → HomePage       (项目列表 + 新建 / 打开)
 *   /project/:id   → ProjectPage    (左右布局：Browser Sidebar + 主编辑区)
 *   *              → NotFoundPage
 *
 * 不再支持 /editor/:id 这种"编辑器 tab" 风格；一个窗口同时只持有一个项目视图。
 */
import { createBrowserRouter } from "react-router-dom"
import { MainLayout } from "@/components/layouts/main-layout"
import { HomePage } from "@/pages/home"
import { ProjectPage } from "@/pages/project"
import { ComponentLibraryPage } from "@/pages/library"
import { NotFoundPage } from "@/pages/not-found"
import { GalleryProjectPreview } from "@/pages/project/gallery"
import { RouteErrorFallback } from "./route-error-fallback"
import { ShellTitleBar } from "./ShellTitleBar"
import { RealtimeProbePage } from "@/pages/library/realtime-probe"

export const router = createBrowserRouter([
  {
    path: "/library/preview/:kind",
    element: <GalleryProjectPreview />,
    errorElement: <RouteErrorFallback />,
  },
  {
    path: "/",
    element: <MainLayout titleBar={<ShellTitleBar />} />,
    errorElement: <RouteErrorFallback />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "project/:id", element: <ProjectPage /> },
      { path: "library", element: <ComponentLibraryPage /> },
      ...(import.meta.env.DEV
        ? [{ path: "library/realtime-probe", element: <RealtimeProbePage /> }]
        : []),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
])
