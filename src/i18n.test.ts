import { describe, expect, it } from 'vitest'
import { DICTS, type Key } from './i18n'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('i18n dictionaries', () => {
  const keys = Object.keys(DICTS.ja) as Key[]

  it('have no empty strings', () => {
    for (const lang of ['ja', 'en'] as const) {
      for (const key of keys) expect(DICTS[lang][key].trim(), `${lang} ${key}`).not.toBe('')
    }
  })

  it('use the same placeholders in both languages', () => {
    for (const key of keys) expect(placeholders(DICTS.en[key]), key).toEqual(placeholders(DICTS.ja[key]))
  })
})
