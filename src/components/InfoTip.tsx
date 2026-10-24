import type { ReactNode } from 'react'
import { Popover } from './Popover'

/** 「ⓘ」を押すと説明が開く。本文はやさしい言葉で短くし、理屈や背景はこちらに書く */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover
      className="info-tip"
      trigger={(toggle) => (
        <button
          className="info-button"
          aria-label={`${label}の説明`}
          title={`${label}の説明`}
          onClick={toggle}
        >
          ⓘ
        </button>
      )}
    >
      {() => <div className="info-body">{children}</div>}
    </Popover>
  )
}
