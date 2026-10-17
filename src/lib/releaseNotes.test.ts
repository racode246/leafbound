import { describe, expect, it } from 'vitest'
import { downloadPercent, plainReleaseNotes } from './releaseNotes'

describe('plainReleaseNotes', () => {
  it('turns release-please Markdown into plain text', () => {
    const md = [
      '## [0.3.0](https://github.com/racode246/leafbound/compare/v0.2.0...v0.3.0) (2026-10-20)',
      '',
      '',
      '### Features',
      '',
      '* **reader:** jump to a page ([#12](https://github.com/racode246/leafbound/issues/12)) ([abc1234](https://github.com/racode246/leafbound/commit/abc1234def))',
      '* check for updates in the app (`latest.json`)',
      '',
      '### Bug Fixes',
      '',
      '- keep the position ([0123456789abcdef0123456789abcdef01234567](https://github.com/x/y/commit/0123456789abcdef0123456789abcdef01234567))'
    ].join('\r\n')
    expect(plainReleaseNotes(md)).toBe(
      [
        '0.3.0 (2026-10-20)',
        '',
        'Features',
        '',
        '• reader: jump to a page (#12)',
        '• check for updates in the app (latest.json)',
        '',
        'Bug Fixes',
        '',
        '• keep the position'
      ].join('\n')
    )
  })

  it('leaves plain text alone', () => {
    expect(plainReleaseNotes('  Bug fixes and improvements.  ')).toBe('Bug fixes and improvements.')
  })
})

describe('downloadPercent', () => {
  it('is a whole percentage, or null without a size', () => {
    expect(downloadPercent(0, 200)).toBe(0)
    expect(downloadPercent(199, 200)).toBe(99)
    expect(downloadPercent(200, 200)).toBe(100)
    expect(downloadPercent(300, 200)).toBe(100)
    expect(downloadPercent(10, null)).toBeNull()
    expect(downloadPercent(10, 0)).toBeNull()
  })
})
