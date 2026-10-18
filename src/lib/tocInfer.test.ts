import { describe, expect, it } from 'vitest'
import { inferTocNesting } from './tocInfer'

interface Item {
  id: string
  label: string
  href: string
  subitems?: Item[]
}

const flat = (...labels: string[]): Item[] =>
  labels.map((label, i) => ({ id: `n${i}`, label, href: `t${i}.xhtml#p${i}`, subitems: [] }))

/** Label and depth of every entry in reading order (each entry before its subitems). */
function outline(toc: readonly Item[], depth = 0): string[] {
  return toc.flatMap((item) => [
    `${'  '.repeat(depth)}${item.label}`,
    ...outline(item.subitems ?? [], depth + 1)
  ])
}

function entries(toc: readonly Item[]): Item[] {
  return toc.flatMap((item) => [item, ...entries(item.subitems ?? [])])
}

describe('inferTocNesting', () => {
  it('nests a flat, numbered TOC by part, chapter and dotted numbers', () => {
    const toc = flat(
      '表紙',
      'はじめに',
      '第1部 主題',
      '1章 ソフトウェアエンジニアリングとは何か',
      '1.1 時間と変化',
      '1.1.1 ハイラムの法則',
      '1.1.2 例：ハッシュ順序',
      '1.2 規模と効率',
      '第2部 文化',
      '14章 大規模テスト',
      '14.2 大規模テストの構造',
      '14.2.1 テスト対象システム',
      '15章 廃止',
      'あとがき'
    )
    expect(outline(inferTocNesting(toc))).toEqual([
      '表紙',
      'はじめに',
      '第1部 主題',
      '  1章 ソフトウェアエンジニアリングとは何か',
      '    1.1 時間と変化',
      '      1.1.1 ハイラムの法則',
      '      1.1.2 例：ハッシュ順序',
      '    1.2 規模と効率',
      '第2部 文化',
      '  14章 大規模テスト',
      '    14.2 大規模テストの構造',
      '      14.2.1 テスト対象システム',
      '  15章 廃止',
      'あとがき'
    ])
  })

  it('keeps every entry, its href and the reading order', () => {
    const toc = flat(
      'はじめに',
      '第1部 A',
      '1章 B',
      '1.1 C',
      '1.1.1 D',
      '2章 E',
      '2.1 F',
      'あとがき'
    )
    const nested = inferTocNesting(toc)
    expect(entries(nested).map(({ id, label, href }) => ({ id, label, href }))).toEqual(
      toc.map(({ id, label, href }) => ({ id, label, href }))
    )
  })

  it('makes chapters the top level when there are no parts', () => {
    const toc = flat('Preface', 'Chapter 1 Basics', '1.1 Setup', '1.2 Usage', 'Chapter 2 More')
    expect(outline(inferTocNesting(toc))).toEqual([
      'Preface',
      'Chapter 1 Basics',
      '  1.1 Setup',
      '  1.2 Usage',
      'Chapter 2 More'
    ])
  })

  it('recognises 第N章 and Part N', () => {
    const toc = flat('Part 1 Start', '第1章 始まり', '1.1 一節', 'Part 2 End', '第2章 終わり')
    expect(outline(inferTocNesting(toc))).toEqual([
      'Part 1 Start',
      '  第1章 始まり',
      '    1.1 一節',
      'Part 2 End',
      '  第2章 終わり'
    ])
  })

  it('nests dotted numbers by component count when there are no chapters', () => {
    const toc = flat('1.1 A', '1.1.1 B', '1.1.2 C', '1.2 D', '1.2.1 E')
    expect(outline(inferTocNesting(toc))).toEqual([
      '1.1 A',
      '  1.1.1 B',
      '  1.1.2 C',
      '1.2 D',
      '  1.2.1 E'
    ])
  })

  it('accepts full-width digits and periods', () => {
    const toc = flat('第１部 主題', '１４章 大規模テスト', '１４．２ 構造', '14.2.1 対象')
    expect(outline(inferTocNesting(toc))).toEqual([
      '第１部 主題',
      '  １４章 大規模テスト',
      '    １４．２ 構造',
      '      14.2.1 対象'
    ])
  })

  it('puts an orphan where its missing parent would be, not under an unrelated entry', () => {
    const toc = flat('第1部 A', '2章 B', '2.1 C', '3.2 D', '3.2.1 E', '2.2 F')
    expect(outline(inferTocNesting(toc))).toEqual([
      '第1部 A',
      '  2章 B',
      '    2.1 C',
      '  3.2 D',
      '    3.2.1 E',
      // 2章 is closed by the orphan, so 2.2 is an orphan too.
      '  2.2 F'
    ])
  })

  it('nests under the closest numbered prefix when a level in between is missing', () => {
    const toc = flat('14章 A', '14.2.1 B', '14.3 C')
    expect(outline(inferTocNesting(toc))).toEqual(['14章 A', '  14.2.1 B', '  14.3 C'])
  })

  it('leaves orphans at the top level when no part is open', () => {
    const toc = flat('1章 A', '1.1 B', '3.2 C', '3.2.1 D')
    expect(outline(inferTocNesting(toc))).toEqual(['1章 A', '  1.1 B', '3.2 C', '  3.2.1 D'])
  })

  it('closes the open branch at an unnumbered entry', () => {
    const toc = flat('1章 A', '1.1 B', 'コラム', '1.2 C')
    expect(outline(inferTocNesting(toc))).toEqual(['1章 A', '  1.1 B', 'コラム', '1.2 C'])
  })

  it('returns a TOC that already has subitems unchanged', () => {
    const toc: Item[] = [
      { id: 'a', label: '1章 A', href: 'a.xhtml', subitems: [] },
      {
        id: 'b',
        label: '2章 B',
        href: 'b.xhtml',
        subitems: [{ id: 'c', label: '2.1 C', href: 'b.xhtml#c', subitems: [] }]
      },
      { id: 'd', label: '2.2 D', href: 'b.xhtml#d', subitems: [] }
    ]
    expect(inferTocNesting(toc)).toBe(toc)
  })

  it('returns a flat TOC without numbering unchanged', () => {
    const toc = flat('Cover', 'Preface', 'The Beginning', 'The End', '第一章 猫のミケ')
    expect(inferTocNesting(toc)).toBe(toc)
  })

  it('returns a TOC unchanged when the numbers give only one level', () => {
    const toc = flat('Chapter 01', 'Chapter 02', 'Chapter 03')
    expect(inferTocNesting(toc)).toBe(toc)
  })

  it('does not read a number inside a word as a chapter', () => {
    const toc = flat('Chapter 1 A', '1.1 B', 'Chapters 2', '1.10x faster')
    expect(outline(inferTocNesting(toc))).toEqual([
      'Chapter 1 A',
      '  1.1 B',
      'Chapters 2',
      '1.10x faster'
    ])
  })
})
