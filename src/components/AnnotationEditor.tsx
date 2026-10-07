import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { HIGHLIGHT_COLORS, type Annotation, type HighlightColor } from '../types'

interface Props {
  annotation: Annotation
  x: number
  y: number
  onColor: (color: HighlightColor) => void
  onNote: (note: string) => void
  onDelete: () => void
  onClose: () => void
}

const ORDER: HighlightColor[] = ['yellow', 'green', 'blue', 'pink']

/** Popover for editing one highlight: colour, note, delete. */
export default function AnnotationEditor({ annotation, x, y, onColor, onNote, onDelete, onClose }: Props) {
  const t = useT()
  const [note, setNote] = useState(annotation.note)
  useEffect(() => setNote(annotation.note), [annotation.id, annotation.note])

  const width = 300
  const left = Math.max(8, Math.min(x - width / 2, window.innerWidth - width - 8))
  const top = Math.max(48, Math.min(y + 12, window.innerHeight - 260))

  return (
    <div
      className="annotation-editor"
      style={{ left, top, width }}
      role="dialog"
      aria-label={t('hl.edit')}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="annotation-editor-head">
        <div className="color-row">
          {ORDER.map((c) => (
            <button
              type="button"
              key={c}
              className={`color-dot ${annotation.color === c ? 'active' : ''}`}
              style={{ background: HIGHLIGHT_COLORS[c] }}
              title={t(`hl.color.${c}`)}
              aria-label={t(`hl.color.${c}`)}
              onClick={() => onColor(c)}
            />
          ))}
        </div>
        <button type="button" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>
      <blockquote className="annotation-quote">{annotation.text}</blockquote>
      <textarea
        value={note}
        placeholder={t('hl.notePlaceholder')}
        rows={3}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onNote(note)
        }}
      />
      <div className="annotation-editor-foot">
        <button type="button" className="danger" onClick={onDelete}>
          {t('hl.delete')}
        </button>
        <button type="button" className="primary" onClick={() => onNote(note)} disabled={note === annotation.note}>
          {t('hl.save')}
        </button>
      </div>
    </div>
  )
}
