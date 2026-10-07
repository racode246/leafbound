import { useT } from '../i18n'
import { HIGHLIGHT_COLORS, type HighlightColor } from '../types'

interface Props {
  x: number
  y: number
  onHighlight: (color: HighlightColor) => void
  onNote: () => void
}

const ORDER: HighlightColor[] = ['yellow', 'green', 'blue', 'pink']

/** Floating bubble shown above a text selection in the book. */
export default function SelectionMenu({ x, y, onHighlight, onNote }: Props) {
  const t = useT()
  const width = 220
  const left = Math.max(8, Math.min(x - width / 2, window.innerWidth - width - 8))
  const top = Math.max(48, y - 48)
  return (
    <div className="selection-menu" style={{ left, top, width }} role="toolbar" onMouseDown={(e) => e.stopPropagation()}>
      {ORDER.map((c) => (
        <button
          type="button"
          key={c}
          className="color-dot"
          style={{ background: HIGHLIGHT_COLORS[c] }}
          title={t(`hl.color.${c}`)}
          aria-label={t(`hl.color.${c}`)}
          onClick={() => onHighlight(c)}
        />
      ))}
      <button type="button" className="selection-note" onClick={onNote}>
        {t('hl.addNote')}
      </button>
    </div>
  )
}
