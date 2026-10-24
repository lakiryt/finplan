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

/** 四角い色見本。押すと色の選択（ColorPanel）が開く */
export function ColorPicker({ value, onChange, inUse, title, allowNone = true, noneColor }: Props) {
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
      {(close) => <ColorPanel value={value} onChange={onChange} inUse={inUse} allowNone={allowNone} onPicked={close} />}
    </Popover>
  )
}

interface PanelProps {
  value?: string
  onChange: (color: string | undefined) => void
  inUse: string[]
  allowNone?: boolean
  /** 見本から選んだ後に呼ばれる（窓を閉じるなど） */
  onPicked?: () => void
}

/** 色の選択の中身。「無色・基本の色・使用中の色・その他の色」。窓の中にもそのまま置ける */
export function ColorPanel({ value, onChange, inUse, allowNone = true, onPicked }: PanelProps) {
  // 基本の色と同じでも、使っている色はすべて「使用中の色」に出す
  const used = inUse
  const pick = (color: string | undefined) => {
    onChange(color)
    onPicked?.()
  }
  const swatch = (hex: string, name: string) => (
    <button
      key={hex}
      className={`picker-swatch ${same(hex, value) ? 'selected' : ''}`}
      style={{ background: hex }}
      title={name}
      aria-label={name}
      onClick={() => pick(hex)}
    />
  )

  return (
    <div className="picker">
      {allowNone && (
        <button className={`picker-none ${value ? '' : 'selected'}`} onClick={() => pick(undefined)}>
          <span className="swatch-button none" /> 無色
        </button>
      )}
      <div className="picker-label">基本の色</div>
      <div className="picker-grid">{BASIC_COLORS.map((c) => swatch(c.hex, c.name))}</div>
      {used.length > 0 && (
        <>
          <div className="picker-label">使用中の色</div>
          <div className="picker-grid">{used.map((c) => swatch(c, c))}</div>
        </>
      )}
      <label className="picker-custom">
        その他の色
        <CustomColor value={value} onCommit={onChange} />
      </label>
    </div>
  )
}

/**
 * ブラウザの色選択。選んでいる最中に毎回反映するとグラフの描き直しで重いので、
 * 選び終わったとき（change）か、窓が閉じて入力欄が消えるときに、最後に選んだ色を1回だけ反映する。
 * 見本から色を選んだら入力欄もその色にし、そこから微調整できるようにする
 */
function CustomColor({ value, onCommit }: { value?: string; onCommit: (color: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const commit = useRef(onCommit)
  const pending = useRef<string | null>(null)
  useEffect(() => {
    commit.current = onCommit
  })
  useEffect(() => {
    if (ref.current && pending.current === null) ref.current.value = value ?? '#888888'
  }, [value])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onInput = () => (pending.current = el.value)
    const onChange = () => {
      pending.current = null
      commit.current(el.value)
    }
    el.addEventListener('input', onInput)
    el.addEventListener('change', onChange)
    return () => {
      el.removeEventListener('input', onInput)
      el.removeEventListener('change', onChange)
      if (pending.current) commit.current(pending.current)
    }
  }, [])
  return <input ref={ref} type="color" defaultValue={value ?? '#888888'} />
}
