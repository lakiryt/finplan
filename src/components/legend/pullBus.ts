/** ドラッグ中のポインター（y は表の上端から）。null で離した */
export type Pull = { groupId: string; y: number } | null

/** 表の側からポインターの位置を伝える仕組み（表全体を描き直さずに、滴だけ動かすため） */
export interface PullBus {
  emit: (pull: Pull) => void
  subscribe: (listener: (pull: Pull) => void) => () => void
}

export function createPullBus(): PullBus {
  let listener: ((pull: Pull) => void) | null = null
  return {
    emit: (pull) => listener?.(pull),
    subscribe: (fn) => {
      listener = fn
      return () => {
        if (listener === fn) listener = null
      }
    },
  }
}
