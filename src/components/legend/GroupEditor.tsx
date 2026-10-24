import type { CategoryGroup } from '../../domain/groups'
import { ColorPanel } from '../ColorPicker'

interface Props {
  group: CategoryGroup
  onLabelChange: (label: string) => void
  onColorChange: (color: string | undefined) => void
  /** 中身のカテゴリーに似た色（1件だけなら同じ色）を割り当てる */
  onRecolorMembers: () => void
  onUngroup: () => void
  colorsInUse: string[]
  close: () => void
}

/** スーパーカテゴリーのバーを押したときの窓の中身。名前・色・中身の確認・まとめの解除 */
export function GroupEditor({ group: g, onLabelChange, onColorChange, onRecolorMembers, onUngroup, colorsInUse, close }: Props) {
  const multiple = g.members.length > 1
  return (
    <div className="group-editor">
      <label>
        名前
        <input
          autoFocus
          value={g.label ?? ''}
          placeholder={g.members.join('・')}
          onChange={(e) => onLabelChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && close()}
        />
      </label>
      {/* カテゴリーの色の窓と同じ中身を、ここでは窓を重ねずにそのまま出す */}
      <div className="editor-color">
        <ColorPanel value={g.color} onChange={onColorChange} inUse={colorsInUse} />
      </div>
      {g.color && (
        <div className="editor-row">
          <button
            onClick={onRecolorMembers}
            title={multiple ? '中身のカテゴリーに、この色と似た色を割り当て直す' : 'カテゴリーの色をこの色にする'}
          >
            {multiple ? '中身に似た色を割り当てる' : 'カテゴリーにも同じ色を設定'}
          </button>
        </div>
      )}
      <div className="muted small">中身: {g.members.join('、')}</div>
      {multiple && (
        <button
          onClick={() => {
            onUngroup()
            close()
          }}
        >
          まとめを解除
        </button>
      )}
    </div>
  )
}
