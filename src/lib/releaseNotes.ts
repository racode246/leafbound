/**
 * Release notes for the update dialog. The notes in latest.json are the Markdown that
 * release-please writes (headings, bullet lists, links to issues and commits); the dialog
 * shows them as plain text, so the markup is reduced to what reads well without it.
 */
export function plainReleaseNotes(markdown: string): string {
  return (
    markdown
      .replace(/\r\n?/g, '\n')
      // Commit links ("([abc1234](…/commit/abc1234))") mean nothing to a reader.
      .replace(/\s*\(\[[0-9a-f]{7,40}\]\([^)]*\)\)/g, '')
      // Other links keep their text: "[#12](…)" → "#12", "[0.3.0](…compare…)" → "0.3.0".
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .split('\n')
      .map((line) =>
        line
          .replace(/^#{1,6}\s+/, '')
          .replace(/^(\s*)[*-]\s+/, '$1• ')
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/`([^`]+)`/g, '$1')
          .trimEnd()
      )
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** Download progress as a whole percentage, or null when the size is unknown. */
export function downloadPercent(downloaded: number, total: number | null): number | null {
  if (!total || total <= 0) return null
  return Math.min(100, Math.floor((downloaded / total) * 100))
}
