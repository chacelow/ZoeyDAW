/**
 * 滚到底部自动加载下一页。
 *
 * 用 IntersectionObserver 而非 scroll + getBoundingClientRect 轮询：后者每帧都要 强制 layout，行数一多就掉帧；前者由浏览器判定，天然节流。
 *
 * 提前 200px 触发，让下一页在用户真正见底前就位 —— 续接因此是顺滑的，不会出现 「滚到底 → 停顿 → 内容跳出来」。
 *
 * 用法：
 *   const { rootRef, sentinelRef } = useInfiniteScrollSentinel({
 *     onReachEnd: pages.loadMore
 *   })
 *   <div ref={rootRef}>…<div ref={sentinelRef} /></div>
 *
 * root 由 hook 自己持有而不是从外部接一个 `containerRef.current`：那是渲染期
 * 的快照，首帧恒为 null，observer 会退化成监听浏览器视口 —— 而表格是在内部
 * 容器里滚的，视口从不滚动，哨兵永远不触发。回调 ref 在元素挂载时才给值，
 * 拿到后重建 observer 才能盯对容器。
 */
import * as React from "react"

export interface UseInfiniteScrollSentinelProps {
  /**
  底部哨兵进入视口 —— 该加载下一页了。
  */
  onReachEnd: () => void
}

export interface UseInfiniteScrollSentinelReturn {
  /**
  挂在滚动容器上。不挂则以浏览器视口为准。
  */
  rootRef: (element: HTMLElement | null) => void
  /**
  挂在表体末尾的哨兵元素。
  */
  sentinelRef: (element: HTMLElement | null) => void
}

export function useInfiniteScrollSentinel({
  onReachEnd,
}: UseInfiniteScrollSentinelProps): UseInfiniteScrollSentinelReturn {
  // 回调放 ref：观察者只随 root 和 sentinel 生命周期重建。
  const reachEndCallback = React.useRef(onReachEnd)
  React.useLayoutEffect(() => {
    reachEndCallback.current = onReachEnd
  }, [onReachEnd])

  const [root, setRoot] = React.useState<HTMLElement | null>(null)
  const [sentinel, setSentinel] = React.useState<HTMLElement | null>(null)

  React.useLayoutEffect(() => {
    if (!sentinel) {
      return
    }

    let active = true
    const observer = new IntersectionObserver(
      entries => {
        if (active && entries.some(entry => entry.target === sentinel && entry.isIntersecting)) {
          reachEndCallback.current()
        }
      },
      { root, rootMargin: "0px 0px 200px 0px", threshold: 0 }
    )
    observer.observe(sentinel)

    return () => {
      active = false
      observer.disconnect()
    }
  }, [root, sentinel])

  const rootReference = React.useCallback((element: HTMLElement | null) => {
    setRoot(element)
  }, [])

  const sentinelReference = React.useCallback((element: HTMLElement | null) => {
    setSentinel(element)
  }, [])

  return { rootRef: rootReference, sentinelRef: sentinelReference }
}
