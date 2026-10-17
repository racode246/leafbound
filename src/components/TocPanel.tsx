import type { NavItem } from 'epubjs'
import { type RefObject, useLayoutEffect, useRef } from 'react'
import { useT } from '../i18n'
import { tocKey } from '../lib/tocCurrent'

interface Props {
  toc: NavItem[]
  /** Key (TocEntry.key) of the entry for the reading position. */
  current: string | null
  onNavigate: (href: string) => void
  onClose: () => void
}

function Items({
  items,
  path,
  current,
  onNavigate
}: {
  items: NavItem[]
  path: number[]
  current: string | null
  onNavigate: (href: string) => void
}) {
  return (
    <ul className="toc-list">
      {items.map((item, i) => {
        const at = [...path, i]
        const isCurrent = tocKey(at) === current
        return (
          <li key={`${item.id}-${item.href}`}>
            <button
              type="button"
              className="toc-item"
              style={{ paddingLeft: `${12 + path.length * 14}px` }}
              aria-current={isCurrent ? 'location' : undefined}
              onClick={() => onNavigate(item.href)}
            >
              {item.label.trim()}
            </button>
            {item.subitems && item.subitems.length > 0 && (
              <Items items={item.subitems} path={at} current={current} onNavigate={onNavigate} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Scrolls the panel itself so the current entry is in view, centred when it was out of view
 * (always when the panel opens). Not scrollIntoView: that also scrolls the page sideways (#9).
 */
function useKeepCurrentInView(panelRef: RefObject<HTMLElement | null>, current: string | null) {
  const opened = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the current entry changes
  useLayoutEffect(() => {
    const panel = panelRef.current
    const item = panel?.querySelector<HTMLElement>('.toc-item[aria-current="location"]')
    if (!panel || !item) return
    const box = panel.getBoundingClientRect()
    const head = panel.querySelector('.panel-head')?.getBoundingClientRect()
    // The sticky header covers the top of the list.
    const top = head ? head.bottom - box.top : 0
    const rect = item.getBoundingClientRect()
    const itemTop = rect.top - box.top
    const inView = itemTop >= top && itemTop + rect.height <= panel.clientHeight
    if (opened.current && inView) return
    opened.current = true
    panel.scrollTop += itemTop - top - (panel.clientHeight - top - rect.height) / 2
  }, [current])
}

export default function TocPanel({ toc, current, onNavigate, onClose }: Props) {
  const t = useT()
  const panelRef = useRef<HTMLElement>(null)
  useKeepCurrentInView(panelRef, current)
  return (
    <aside ref={panelRef} className="panel toc-panel" aria-label={t('toc.title')}>
      <div className="panel-head">
        <span>{t('toc.title')}</span>
        <button type="button" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>
      {toc.length === 0 ? (
        <p className="muted small">{t('toc.empty')}</p>
      ) : (
        <Items items={toc} path={[]} current={current} onNavigate={onNavigate} />
      )}
    </aside>
  )
}
