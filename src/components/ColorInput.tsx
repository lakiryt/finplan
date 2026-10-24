export const PALETTE_LIST_ID = 'chart-palette'

/** 色見本の形をした色の選択欄。候補として PaletteList の色が出る */
export function ColorInput({ value, onChange, title }: { value: string; onChange: (color: string) => void; title?: string }) {
  return (
    <input
      type="color"
      className="swatch-input"
      list={PALETTE_LIST_ID}
      value={value}
      title={title ?? '色を変える'}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function PaletteList({ colors }: { colors: string[] }) {
  return (
    <datalist id={PALETTE_LIST_ID}>
      {colors.map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  )
}
