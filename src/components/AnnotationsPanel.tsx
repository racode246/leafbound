import { useT } from '../i18n'
import { HIGHLIGHT_COLORS, type Annotation } from '../types'

interface Props {
  annotations: Annotation[]
  onSelect: (annotation: Annotation) => void
  onEdit: (annotation: Annotation, anchor: HTMLElement) => void
  onDelete: (annotation: Annotation) => void
  onClose: () => void
}

export default function AnnotationsPanel({ annotations, onSelect, onEdit, onDelete, onClose }: Props) {
  const t = useT()
  return (
    <aside className="panel annotations-panel" aria-label={t('hl.title')}>
      <div className="panel-head">
        <span>{t('hl.title')}</span>
        <button type="button" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>
      {annotations.length === 0 ? (
        <p className="muted small">{t('hl.none')}</p>
      ) : (
        <ul className="hl-list">
          {annotations.map((a) => (
            <li key={a.id} className="hl-item" style={{ borderLeftColor: HIGHLIGHT_COLORS[a.color] }}>
              <button type="button" className="hl-text" onClick={() => onSelect(a)}>
                {a.text}
              </button>
              {a.note && <div className="hl-note">{a.note}</div>}
              <div className="hl-actions">
                <button type="button" onClick={(e) => onEdit(a, e.currentTarget)}>
                  {t('hl.edit')}
                </button>
                <button type="button" onClick={() => onDelete(a)}>
                  {t('hl.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
