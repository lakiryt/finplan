import { seededRandom } from './colors'
import type { Transaction } from './types'

/*
 * 「サンプルのデータで試す」の架空の家計簿（2025年の1年分）。
 * 加工を試せるように、積立（除外）・割り勘の回収（相殺）・貯金の引き出し（除外）や、一度だけの大きな支出を混ぜる。
 * 毎回同じデータになるよう、決まった種の乱数で作る
 */

const YEAR = 2025

export function sampleTransactions(): Transaction[] {
  const random = seededRandom(20250101)
  const between = (min: number, max: number) => Math.round((min + random() * (max - min)) / 10) * 10
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)]
  const out: Omit<Transaction, 'id'>[] = []
  const add = (month: number, day: number, amount: number, category: string, memo: string) =>
    out.push({ date: `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, amount, category, memo })
  const days = (month: number) => new Date(YEAR, month, 0).getDate()

  for (let m = 1; m <= 12; m++) {
    const last = days(m)
    // 収入
    add(m, 25, 235_000, '給与', '給与')
    if (m === 6 || m === 12) add(m, 10, 200_000, '給与', '賞与')
    // 決まった支出
    add(m, 27, -72_000, '家賃', '家賃')
    add(m, 26, -4_800, '通信費', '携帯料金')
    add(m, 5, -980, '趣味・娯楽', '動画配信')
    add(m, 26, -30_000, '積立', '積立投資')
    const winter = m <= 2 || m === 12
    add(m, 20, -between(winter ? 9_000 : 5_000, winter ? 13_000 : 8_000), '水道光熱費', '電気・ガス')
    // 日々の支出
    for (let i = 0; i < 11; i++) add(m, 1 + Math.floor(random() * last), -between(400, 4_200), '食料品', pick(['スーパー', 'コンビニ', 'パン屋', '八百屋']))
    for (let i = 0; i < 3; i++) add(m, 1 + Math.floor(random() * last), -between(900, 3_500), '外食', pick(['ランチ', 'カフェ', '定食']))
    for (let i = 0; i < 2; i++) add(m, 1 + Math.floor(random() * last), -between(300, 2_500), '日用品', pick(['ドラッグストア', '100円ショップ', 'ホームセンター']))
    add(m, 1 + Math.floor(random() * last), -between(1_000, 4_000), '交通費', pick(['交通系IC チャージ', '電車']))
    if (random() < 0.5) add(m, 1 + Math.floor(random() * last), -between(1_500, 6_000), '趣味・娯楽', pick(['本', '映画', 'ライブ']))
    if (random() < 0.3) add(m, 1 + Math.floor(random() * last), -between(1_500, 4_000), '医療', '通院')
    // 立て替えて、あとで割り勘の分を受け取る（相殺の例）
    if (m % 2 === 0) {
      const paid = between(8_000, 14_000)
      add(m, 12, -paid, '外食', '飲み会（立て替え）')
      add(m, 14, Math.round(paid / 2 / 10) * 10, '回収', '割り勘の受け取り')
    }
  }
  // 一度だけの大きな支出と、それに合わせた貯金の引き出し（除外の例）
  add(3, 21, -48_000, '日用品', '洗濯機の買い替え')
  add(8, 9, -86_000, '旅行', '旅行（宿・交通）')
  add(8, 8, 60_000, '出金', '貯金の引き出し')

  return out.sort((a, b) => a.date.localeCompare(b.date)).map((t, i) => ({ id: String(i), ...t }))
}
