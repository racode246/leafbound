import { useState } from 'react'
import { useT } from '../i18n'
import { ALL_BOOKS, UNCATEGORIZED, type LanguageSetting } from '../types'
import LanguageSelect from './LanguageSelect'

interface Props {
  categories: string[]
  counts: Map<string, number>
  total: number
  uncategorized: number
  selected: string
  language: LanguageSetting
  onSelect: (key: string) => void
  onAdd: (name: string) => Promise<string[]>
  onRename: (from: string, to: string) => Promise<void>
  onRemove: (name: string) => Promise<void>
  onLanguage: (value: LanguageSetting) => void
}

export default function Sidebar({
  categories,
  counts,
  total,
  uncategorized,
  selected,
  language,
  onSelect,
  onAdd,
  onRename,
  onRemove,
  onLanguage
}: Props) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ name: string; value: string } | null>(null)

  const submitNew = async () => {
    const name = draft.trim()
    if (!name) return
    await onAdd(name)
    setDraft('')
  }

  const submitRename = async () => {
    if (!editing) return
    const to = editing.value.trim()
    if (to && to !== editing.name) await onRename(editing.name, to)
    setEditing(null)
  }

  const item = (key: string, label: string, count: number) => (
    <li key={key}>
      <button
        type="button"
        className={`nav-item ${selected === key ? 'active' : ''}`}
        onClick={() => onSelect(key)}
      >
        <span className="nav-label">{label}</span>
        <span className="nav-count">{count}</span>
      </button>
    </li>
  )

  return (
    <aside className="sidebar">
      <ul className="nav">
        {item(ALL_BOOKS, t('lib.all'), total)}
        {item(UNCATEGORIZED, t('lib.uncategorized'), uncategorized)}
      </ul>

      <h2 className="sidebar-heading">{t('lib.categories')}</h2>
      <ul className="nav">
        {categories.map((c) =>
          editing?.name === c ? (
            <li key={c} className="nav-edit">
              <input
                autoFocus
                value={editing.value}
                onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitRename()
                  if (e.key === 'Escape') setEditing(null)
                }}
                onBlur={() => void submitRename()}
              />
            </li>
          ) : (
            <li key={c} className="nav-row">
              <button
                type="button"
                className={`nav-item ${selected === c ? 'active' : ''}`}
                onClick={() => onSelect(c)}
                onDoubleClick={() => setEditing({ name: c, value: c })}
                title={t('lib.renameHint')}
              >
                <span className="nav-label">{c}</span>
                <span className="nav-count">{counts.get(c) ?? 0}</span>
              </button>
              <button
                type="button"
                className="nav-remove"
                title={t('lib.removeCategory')}
                aria-label={t('lib.removeCategoryAria', { name: c })}
                onClick={() => void onRemove(c)}
              >
                ×
              </button>
            </li>
          )
        )}
      </ul>

      <form
        className="nav-add"
        onSubmit={(e) => {
          e.preventDefault()
          void submitNew()
        }}
      >
        <input
          value={draft}
          placeholder={t('lib.newCategory')}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={t('lib.newCategoryAria')}
        />
        <button type="submit" disabled={!draft.trim()}>
          {t('lib.add')}
        </button>
      </form>

      <div className="sidebar-foot">
        <LanguageSelect value={language} onChange={onLanguage} className="wide" />
      </div>
    </aside>
  )
}
