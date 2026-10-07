import { useState } from 'react'
import { ALL_BOOKS, UNCATEGORIZED } from '../types'

interface Props {
  categories: string[]
  counts: Map<string, number>
  total: number
  uncategorized: number
  selected: string
  onSelect: (key: string) => void
  onAdd: (name: string) => Promise<string[]>
  onRename: (from: string, to: string) => Promise<void>
  onRemove: (name: string) => Promise<void>
}

export default function Sidebar({
  categories,
  counts,
  total,
  uncategorized,
  selected,
  onSelect,
  onAdd,
  onRename,
  onRemove
}: Props) {
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
        {item(ALL_BOOKS, 'すべての本', total)}
        {item(UNCATEGORIZED, '未分類', uncategorized)}
      </ul>

      <h2 className="sidebar-heading">カテゴリ</h2>
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
                title="ダブルクリックで名前を変更"
              >
                <span className="nav-label">{c}</span>
                <span className="nav-count">{counts.get(c) ?? 0}</span>
              </button>
              <button
                type="button"
                className="nav-remove"
                title="カテゴリを削除"
                aria-label={`${c} を削除`}
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
          placeholder="新しいカテゴリ"
          onChange={(e) => setDraft(e.target.value)}
          aria-label="新しいカテゴリ名"
        />
        <button type="submit" disabled={!draft.trim()}>
          追加
        </button>
      </form>
    </aside>
  )
}
