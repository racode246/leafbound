import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import type { Palette } from '../lib/readerTheme'

interface Props {
  paragraphs: string[]
  /** Horizontal centre of the reference, and its top and bottom edges, in window coordinates. */
  x: number
  top: number
  bottom: number
  palette: Palette
  onGoTo: () => void
}

const WIDTH = 380
const GAP = 8

/** The text of a footnote or an endnote, floating next to its reference in the book. */
export default function NotePopup({ paragraphs, x, top, bottom, palette, onGoTo }: Props) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [popupTop, setPopupTop] = useState(bottom + GAP)
  const width = Math.min(WIDTH, window.innerWidth - GAP * 2)
  const left = Math.max(GAP, Math.min(x - width / 2, window.innerWidth - width - GAP))

  // Below the reference when it fits, otherwise above it.
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0
    const fits = bottom + GAP + height <= window.innerHeight - GAP
    setPopupTop(fits ? bottom + GAP : Math.max(GAP, top - GAP - height))
  }, [top, bottom])

  return (
    <div
      ref={ref}
      className="note-popup"
      style={
        {
          left,
          top: popupTop,
          width,
          background: palette.bg,
          color: palette.fg,
          borderColor: palette.border,
          '--note-link': palette.link
        } as CSSProperties
      }
      role="dialog"
      aria-label={t('note.title')}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="note-popup-text">
        {paragraphs.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the list never changes while it is shown
          <p key={i}>{p}</p>
        ))}
      </div>
      <button type="button" className="note-popup-go" onClick={onGoTo}>
        {t('note.goTo')}
      </button>
    </div>
  )
}
