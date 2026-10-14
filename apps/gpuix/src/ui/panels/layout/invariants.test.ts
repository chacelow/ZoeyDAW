import { describe, expect, test } from "bun:test"
import { computeLayout } from "./computeLayout"
import { initialLayout, resolveConstraints } from "./sizes"

// 随机约束下的不变量(性质测试)。固定种子的线性同余发生器,失败可复现。
function rng(seed: number) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
}

const EPS = 1e-6

describe("computeLayout 不变量(随机约束,3000 组 × 6 次拖动)", () => {
  test("总尺寸守恒、每个面板在 [min,max] 或恰为折叠值、方向正确", () => {
    const failures: string[] = []
    let checked = 0
    let relaxed = 0
    for (let seed = 1; seed <= 3000; seed++) {
      const r = rng(seed)
      const n = 2 + Math.floor(r() * 4)
      const total = 300 + Math.floor(r() * 1500)
      const panels = Array.from({ length: n }, () => {
        const collapsible = r() < 0.4
        const min = Math.floor(r() * 120)
        return {
          minSize: min,
          maxSize: min + 40 + Math.floor(r() * 600),
          collapsible,
          collapsedSize: collapsible ? 0 : undefined,
        }
      })
      const constraints = resolveConstraints(panels, total)
      const sizes = initialLayout(
        panels.map(() => undefined),
        constraints,
        total
      )
      const before = sizes.reduce((a, b) => a + b, 0)
      // 视口放不下所有最小值时,文档约定放宽最小值(见 fitLayout 注释),此时不断言下界。
      const minimaFit = constraints.reduce((a, c) => a + c.min, 0) <= total + EPS
      if (!minimaFit) relaxed++
      for (let k = 0; k < 6; k++) {
        const separator = Math.floor(r() * (n - 1))
        const delta = (r() - 0.5) * 2 * total
        const out = computeLayout(sizes, constraints, { separator, delta })
        checked++
        if (Math.abs(out.reduce((a, b) => a + b, 0) - before) > EPS)
          failures.push(`seed ${seed}: 总尺寸不守恒`)
        if (minimaFit) {
          out.forEach((v, i) => {
            const c = constraints[i]
            const inRange = v >= c.min - EPS && v <= c.max + EPS
            const isCollapsed = c.collapsible && Math.abs(v - c.collapsed) < EPS
            if (!inRange && !isCollapsed)
              failures.push(`seed ${seed}: 面板 ${i} 尺寸 ${v} 越界 [${c.min},${c.max}]`)
          })
        }
        const leftBefore = sizes.slice(0, separator + 1).reduce((a, b) => a + b, 0)
        const leftChange = out.slice(0, separator + 1).reduce((a, b) => a + b, 0) - leftBefore
        if (delta > 0 && leftChange < -EPS) failures.push(`seed ${seed}: 正向 delta 却缩小了左侧`)
        if (delta < 0 && leftChange > EPS) failures.push(`seed ${seed}: 负向 delta 却增大了左侧`)
      }
    }
    expect(checked).toBe(18000)
    expect(relaxed).toBeGreaterThan(0) // 确认随机集里确实覆盖了"最小值放不下"的分支
    expect(failures).toEqual([])
  })

  test("实际位移可超过请求位移,但只发生在折叠/展开吸附时(吸附发生在折叠区中点之后)", () => {
    const c = resolveConstraints(
      [
        { minSize: 100, maxSize: 600, collapsible: true, collapsedSize: 0 },
        { minSize: 100, maxSize: 700 },
      ],
      700
    )
    // 向折叠方向拖:面板 A 的值要么 >= min,要么恰为 0,绝不出现 (0,min) 之间的中间值
    for (let d = 0; d >= -300; d -= 10) {
      const a = computeLayout([300, 400], c, { separator: 0, delta: d })[0]
      expect(a === 0 || a >= 100 - EPS).toBe(true)
    }
    // 折叠区 100→0 的中点在 delta=-250:-250 之前不折叠,-260 已折叠
    expect(computeLayout([300, 400], c, { separator: 0, delta: -240 })[0]).toBeGreaterThanOrEqual(
      100 - EPS
    )
    expect(computeLayout([300, 400], c, { separator: 0, delta: -260 })[0]).toBe(0)
    // 从折叠态展开:越过中点才弹出到 min
    expect(computeLayout([0, 700], c, { separator: 0, delta: 40 })[0]).toBe(0)
    expect(computeLayout([0, 700], c, { separator: 0, delta: 60 })[0]).toBe(100)
  })

  test("吸附不会撑爆相邻面板", () => {
    const c = resolveConstraints(
      [
        { minSize: 100, maxSize: 600, collapsible: true, collapsedSize: 0 },
        { minSize: 100, maxSize: 700 },
      ],
      700
    )
    for (let d = -400; d <= 400; d += 7) {
      for (const start of [
        [0, 700],
        [100, 600],
        [300, 400],
        [600, 100],
      ]) {
        const out = computeLayout(start, c, { separator: 0, delta: d })
        expect(Math.abs(out[0] + out[1] - 700)).toBeLessThan(EPS)
        expect(out[1]).toBeLessThanOrEqual(700 + EPS)
        expect(out[1]).toBeGreaterThanOrEqual(100 - EPS)
      }
    }
  })
})
