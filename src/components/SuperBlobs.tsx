import { useEffect, useState } from 'react'
import type { CategoryGroup } from '../domain/view'
import type { PullBus } from './pullBus'

/*
 * スーパーカテゴリーのバーを、窓についた水滴をつなげたような形で描く。
 * 各行に丸い滴を置き、まとめた範囲は細い首でつなぐ。全体に gooey フィルター（ぼかしてから輪郭を立て直す）を
 * かけると、滴と首の境目がなめらかにくびれた形になる。
 * 見た目はここの数値だけで調整する。
 */
/** 滴の直径（px） */
const DOT = 16
/** 首の太さ（px）。滴より細いほど、つないだ部分がくびれて見える */
const NECK = 6
/** フィルターのぼかしの強さ。大きいほど丸く溶け合う */
const BLUR = 3
/** 輪郭の立て直しの強さと位置（アルファ × CONTRAST + OFFSET） */
const CONTRAST = 18
const OFFSET = -7
/** 首が伸び縮みするときの動き。少し行き過ぎて戻る */
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'
const NECK_MS = 420
/** 行の移動に合わせて滴が動くときの動き（表の行のアニメーションと揃える） */
export const ROW_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
export const ROW_MS = 380
/** ドラッグ中に引っ張られる滴。ポインターとの距離の何割まで、最大何 px 引っ張るか */
const PULL_RATIO = 0.4
const PULL_MAX = 14
const PULL_DOT = 11

export interface BlobLayout {
  /** 滴の中心の x（表の左上から） */
  x: number
  rows: { category: string; y: number; opacity: number }[]
}

interface Props {
  layout: BlobLayout | null
  groups: CategoryGroup[]
  colorOf: (g: CategoryGroup) => string
  pullBus: PullBus
}

const FILTER_ID = 'finplan-goo'

export function SuperBlobs({ layout, groups, colorOf, pullBus }: Props) {
  const [pull, setPull] = useState<{ groupId: string; y: number; active: boolean } | null>(null)

  useEffect(() => {
    let timer: number | undefined
    const unsubscribe = pullBus.subscribe((p) => {
      window.clearTimeout(timer)
      if (p) return setPull({ ...p, active: true })
      // 離したら元の位置へ跳ね返し、動き終わったら消す
      setPull((cur) => (cur ? { ...cur, active: false } : null))
      timer = window.setTimeout(() => setPull(null), NECK_MS + 100)
    })
    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [pullBus])

  if (!layout) return null
  const yOf = new Map(layout.rows.map((r) => [r.category, r]))

  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id={FILTER_ID} colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation={BLUR} />
          <feColorMatrix mode="matrix" values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${CONTRAST} ${OFFSET}`} />
        </filter>
      </svg>
      <div className="blob-layer" style={{ filter: `url(#${FILTER_ID})` }} aria-hidden>
        {groups.map((g) => {
          const ys = g.members.map((m) => yOf.get(m)).filter((r) => r !== undefined)
          if (!ys.length) return null
          const color = colorOf(g)
          const top = ys[0].y
          const bottom = ys[ys.length - 1].y
          let pullEl = null
          if (pull?.groupId === g.id) {
            const edge = pull.y > bottom ? bottom : pull.y < top ? top : null
            if (edge !== null) {
              const offset = pull.active ? Math.max(-PULL_MAX, Math.min(PULL_MAX, (pull.y - edge) * PULL_RATIO)) : 0
              pullEl = (
                <>
                  <div className="blob-neck" style={{ left: layout.x - NECK / 2, top: Math.min(edge, edge + offset), height: Math.abs(offset), width: NECK, background: color, transition: `top ${NECK_MS}ms ${SPRING}, height ${NECK_MS}ms ${SPRING}` }} />
                  <div className="blob-dot" style={{ left: layout.x - PULL_DOT / 2, top: edge + offset - PULL_DOT / 2, width: PULL_DOT, height: PULL_DOT, background: color, transition: pull.active ? 'none' : `top ${NECK_MS}ms ${SPRING}` }} />
                </>
              )
            }
          }
          return (
            <div key={g.id}>
              {/* 1件だけでも首を高さ 0 で置いておき、まとめたときに伸びるアニメーションにする */}
              <div
                className="blob-neck"
                style={{
                  left: layout.x - NECK / 2,
                  top,
                  height: bottom - top,
                  width: NECK,
                  background: color,
                  opacity: Math.min(...ys.map((r) => r.opacity)),
                  transition: `top ${NECK_MS}ms ${SPRING}, height ${NECK_MS}ms ${SPRING}, background-color 220ms`,
                }}
              />
              {pullEl}
            </div>
          )
        })}
        {/* 滴は行（カテゴリー）ごとに置き、行が動いたら一緒に滑らせる */}
        {groups.flatMap((g) =>
          g.members.map((m) => {
            const r = yOf.get(m)
            if (!r) return null
            return (
              <div
                key={m}
                className="blob-dot"
                style={{
                  left: layout.x - DOT / 2,
                  top: r.y - DOT / 2,
                  width: DOT,
                  height: DOT,
                  background: colorOf(g),
                  opacity: r.opacity,
                  transition: `top ${ROW_MS}ms ${ROW_EASING}, background-color 220ms`,
                }}
              />
            )
          }),
        )}
      </div>
    </>
  )
}
