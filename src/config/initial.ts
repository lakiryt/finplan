import { defaultProcessing, parseProcessingConfig } from '../domain/processing'
import { defaultView, parseViewConfig } from '../domain/view'

/**
 * 画面で使う初期設定。src/config/local/ に同じ名前のJSONがあればそれを、無ければ一般的な初期設定を使う。
 * local/ は Git の管理対象外なので、個人のカテゴリー名やルールはそこに置く。
 * 公開用のビルドに個人の設定が入らないよう、読み込むのは開発サーバー（npm run dev）のときだけ。
 */
const local: Record<string, unknown> = import.meta.env.DEV
  ? import.meta.glob<unknown>('./local/*.json', { eager: true, import: 'default' })
  : {}

/** local/ に name のファイルがあればそれを、無ければ一般的な初期設定を使う */
function pick<T>(name: string, parse: (raw: unknown) => T, fallback: T): T {
  const raw = local[`./local/${name}`]
  return raw ? parse(raw) : fallback
}

export const initialView = pick('default-view.json', parseViewConfig, defaultView)
export const initialProcessing = pick('default-processing.json', parseProcessingConfig, defaultProcessing)
