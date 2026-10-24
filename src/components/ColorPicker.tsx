import { useEffect, useRef } from 'react'
import { BASIC_COLORS } from '../domain/colors'
import { Popover } from './Popover'

interface Props {
  /** 未設定なら無色 */
  value?: string
  onChange: (color: string | undefined) => void
  /** 今どこかで使っている色 */
  inUse: string[]
  title?: string
  /** 無色を選べるか */
  allowNone?: boolean
  /** 無色のときに見本に表示する色（未指定なら空の四角） */
  noneColor?: string
}

const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase())

/** 四角い色見本。押すと「無色・基本の色・使用中の色・その他の色」から選べる */
export function ColorPicker({ value, onChange, inUse, title, allowNone = true, noneColor }: Props) {
  const used = inUse.filter((c) => !BASIC_COLORS.some((b) => same(b.hex, c)))
  const swatch = (hex: string, name: string, close: () => void) => (
    <button
      key={hex}
      className={`picker-swatch ${same(hex, value) ? 'selected' : ''}`}
      style={{ background: hex }}
      title={name}
      aria-label={name}
      onClick={() => {
        onChange(hex)
        close()
      }}
    />
  )

  return (
    <Popover
      className="color-picker"
      trigger={(toggle) => (
        <button
          className={`swatch-button ${value ? '' : 'none'}`}
          style={value || noneColor ? { background: value ?? noneColor } : undefined}
          title={title ?? '色を変える'}
          onClick={toggle}
        />
      )}
    >
      {(close) => (
        <div className="picker">
          {allowNone && (
            <button
              className={`picker-none ${value ? '' : 'selected'}`}
              onClick={() => {
                onChange(undefined)
                close()
              }}
            >
              <span className="swatch-button none" /> 無色
            </button>
          )}
          <div className="picker-label">基本の色</div>
          <div className="picker-grid">{BASIC_COLORS.map((c) => swatch(c.hex, c.name, close))}</div>
          {used.length > 0 && (
            <>
              <div className="picker-label">使用中の色</div>
              <div className="picker-grid">{used.map((c) => swatch(c, c, close))}</div>
            </>
          )}
          <label className="picker-custom">
            その他の色
            <CustomColor value={value} onCommit={onChange} />
          </label>
        </div>
      )}
    </Popover>
  )
}

/**
 * ブラウザの色選択。選んでいる最中に毎回反映するとグラフの描き直しで重いので、
 * 選び終わったとき（change）か、窓が閉じて入力欄が消えるときに、最後に選んだ色を1回だけ反映する
 */
function CustomColor({ value, onCommit }: { value?: string; onCommit: (color: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let pending: string | null = null
    const onInput = () => (pending = el.value)
    const onChange = () => {
      pending = null
      commit.current(el.value)
    }
    el.addEventListener('input', onInput)
    el.addEventListener('change', onChange)
    return () => {
      el.removeEventListener('input', onInput)
      el.removeEventListener('change', onChange)
      if (pending) commit.current(pending)
    }
  }, [])
  return <input ref={ref} type="color" defaultValue={value ?? '#888888'} />
}
