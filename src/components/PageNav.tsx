import { useRef, useState, type CSSProperties, type RefObject } from 'react'
import { useT } from '../i18n'

interface Props {
  percent: number
  /** 1-based current page; meaningless while totalPages is 0. */
  page: number
  /** 0 while epub.js is still generating locations. */
  totalPages: number
  chapterAt: (page: number) => string | null
  onJump: (page: number) => void
  inputRef: RefObject<HTMLInputElement | null>
}

/** Accepts full-width digits too, since the IME is often on while reading Japanese. */
function parsePage(text: string): number | null {
  const ascii = text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, '')
  const n = parseInt(ascii, 10)
  return Number.isFinite(n) ? n : null
}

export default function PageNav({ percent, page, totalPages, chapterAt, onJump, inputRef }: Props) {
  const t = useT()
  const [drag, setDrag] = useState<number | null>(null)
  // pointerup, then blur(), then onBlur runs before re-render; the ref keeps that from jumping twice.
  const dragRef = useRef<number | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const ready = totalPages > 0
  const shown = drag ?? page
  const fill = ready ? (totalPages > 1 ? (shown - 1) / (totalPages - 1) : 0) : percent

  const jump = (value: number) => {
    const target = Math.min(totalPages, Math.max(1, value))
    if (target !== page) onJump(target)
  }

  const commitDrag = (el: HTMLInputElement) => {
    if (dragRef.current === null) return
    dragRef.current = null
    setDrag(null)
    jump(Number(el.value))
  }

  const tipChapter = drag !== null ? chapterAt(drag) : null

  return (
    <>
      <div
        className={`seek ${drag !== null ? 'dragging' : ''}`}
        style={{ '--fill': fill } as CSSProperties}
      >
        <input
          type="range"
          min={1}
          max={Math.max(1, totalPages)}
          step={1}
          value={ready ? shown : 1}
          disabled={!ready}
          aria-label={t('reader.seek')}
          title={ready ? undefined : t('reader.pagesPending')}
          onChange={(e) => {
            dragRef.current = Number(e.target.value)
            setDrag(dragRef.current)
          }}
          onPointerUp={(e) => {
            commitDrag(e.currentTarget)
            // Keep arrow keys turning pages instead of nudging the slider.
            e.currentTarget.blur()
          }}
          onKeyUp={(e) => commitDrag(e.currentTarget)}
          onBlur={(e) => commitDrag(e.currentTarget)}
        />
        {drag !== null && (
          <div className="seek-tip">
            {t('reader.pageOf', { page: drag, total: totalPages })}
            {tipChapter && <span className="seek-tip-chapter">{tipChapter}</span>}
          </div>
        )}
      </div>
      <form
        className="page-jump"
        onSubmit={(e) => {
          e.preventDefault()
          const n = draft === null ? null : parsePage(draft)
          if (n !== null) jump(n)
          setDraft(null)
          inputRef.current?.blur()
        }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draft ?? (ready ? String(page) : '')}
          placeholder={ready ? undefined : '…'}
          disabled={!ready}
          title={ready ? t('reader.pageJumpTitle') : t('reader.pagesPending')}
          aria-label={t('reader.pageJumpTitle')}
          style={{ '--digits': String(Math.max(2, String(totalPages).length)) } as CSSProperties}
          onFocus={(e) => {
            setDraft(String(page))
            e.currentTarget.select()
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setDraft(null)}
        />
        <span>/ {ready ? totalPages : '…'}</span>
      </form>
    </>
  )
}
