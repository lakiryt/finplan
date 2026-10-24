import type { CategorySummary } from '../domain/aggregate'
import type { Group } from '../domain/types'
import { yen } from './format'

interface Props {
  summaries: CategorySummary[]
  groups: Group[]
}

export function CategoryTable({ summaries, groups }: Props) {
  const label = (id: string | null) => groups.find((g) => g.id === id)?.label ?? ''
  return (
    <table>
      <thead>
        <tr>
          <th>カテゴリー</th>
          <th>グループ</th>
          <th className="num">件数</th>
          <th className="num">期間合計</th>
          <th className="num">月平均</th>
        </tr>
      </thead>
      <tbody>
        {summaries.map((s) => (
          <tr key={s.category}>
            <td>{s.category}</td>
            <td>{label(s.groupId)}</td>
            <td className="num">{s.count}</td>
            <td className="num">{yen(s.total)}</td>
            <td className="num">{yen(s.monthlyMean)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
