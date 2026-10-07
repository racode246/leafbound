import type { NavItem } from 'epubjs'
import { useT } from '../i18n'

interface Props {
  toc: NavItem[]
  onNavigate: (href: string) => void
  onClose: () => void
}

function Items({ items, depth, onNavigate }: { items: NavItem[]; depth: number; onNavigate: (href: string) => void }) {
  return (
    <ul className="toc-list">
      {items.map((item) => (
        <li key={`${item.id}-${item.href}`}>
          <button
            type="button"
            className="toc-item"
            style={{ paddingLeft: `${12 + depth * 14}px` }}
            onClick={() => onNavigate(item.href)}
          >
            {item.label.trim()}
          </button>
          {item.subitems && item.subitems.length > 0 && (
            <Items items={item.subitems} depth={depth + 1} onNavigate={onNavigate} />
          )}
        </li>
      ))}
    </ul>
  )
}

export default function TocPanel({ toc, onNavigate, onClose }: Props) {
  const t = useT()
  return (
    <aside className="panel toc-panel" aria-label={t('toc.title')}>
      <div className="panel-head">
        <span>{t('toc.title')}</span>
        <button type="button" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>
      {toc.length === 0 ? (
        <p className="muted small">{t('toc.empty')}</p>
      ) : (
        <Items items={toc} depth={0} onNavigate={onNavigate} />
      )}
    </aside>
  )
}
