import { describe, expect, it } from 'vitest'
import { parseCsv } from './importers'
import { defaultProcessing } from './processing'
import { parseSettingsFile, viewForExport } from './settings'
import { csv } from './testData'
import { defaultView } from './view'

const txs = parseCsv(csv).transactions

describe('settings file', () => {
  it('reads a file with both settings, or either one alone', () => {
    expect(parseSettingsFile({ view: defaultView, processing: defaultProcessing })).toEqual({ view: defaultView, processing: defaultProcessing })
    expect(parseSettingsFile({ processing: defaultProcessing })).toEqual({ processing: defaultProcessing })
    expect(parseSettingsFile(defaultView)).toEqual({ view: defaultView })
    expect(parseSettingsFile(defaultProcessing)).toEqual({ processing: defaultProcessing })
  })

  it('rejects files that are neither', () => {
    expect(() => parseSettingsFile({ version: 1 })).toThrow()
    expect(() => parseSettingsFile({ view: { version: 1 } })).toThrow()
  })

  it('exports the view with every category in the data, on both sides', () => {
    const view = viewForExport(defaultView, txs)
    expect(view.groups.flatMap((g) => g.members).sort()).toEqual(['家賃', '貯蓄', '食費'].sort())
    expect(view.incomeGroups.flatMap((g) => g.members).sort()).toEqual(['回収', '給与'].sort())
    expect(viewForExport(defaultView, [])).toBe(defaultView)
  })
})
