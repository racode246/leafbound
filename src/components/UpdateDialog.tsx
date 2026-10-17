import { useEffect, useRef } from 'react'
import { useT } from '../i18n'
import { downloadPercent, plainReleaseNotes } from '../lib/releaseNotes'
import type { Updates } from '../lib/useUpdates'

/**
 * "Update available": the new version and its notes, then "Install and restart" with the
 * download progress. Installing ends the app (the installer restarts it), so the dialog
 * cannot be closed once it has started; a failure (e.g. a signature that does not match)
 * is shown here and the user can try again or close it.
 */
export default function UpdateDialog({ updates }: { updates: Updates }) {
  const t = useT()
  const { state } = updates
  const installRef = useRef<HTMLButtonElement>(null)
  const open = state.kind === 'available' || state.kind === 'installing'

  useEffect(() => {
    if (open) installRef.current?.focus()
  }, [open])

  if (!open) return null
  const { info } = state
  const busy = state.kind === 'installing'
  const notes = info.notes ? plainReleaseNotes(info.notes) : ''

  let progress: { value: number | null; label: string } | null = null
  if (state.kind === 'installing') {
    const percent = downloadPercent(state.downloaded, state.total)
    progress = state.installing
      ? { value: null, label: t('update.installing') }
      : percent === null
        ? {
            value: null,
            label: t('update.downloadingSize', {
              mb: (state.downloaded / 1_048_576).toFixed(1)
            })
          }
        : { value: percent, label: t('update.downloading', { percent }) }
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal update-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) updates.dismiss()
        }}
      >
        <h2 id="update-title">{t('update.title')}</h2>
        <p>{t('update.available', { version: info.version, current: info.currentVersion })}</p>
        {notes && (
          <section className="update-notes" aria-label={t('update.notes')}>
            <h3>{t('update.notes')}</h3>
            <div className="update-notes-text">{notes}</div>
          </section>
        )}
        {progress && (
          <div className="update-progress" role="status">
            {progress.value === null ? (
              <progress aria-label={progress.label} />
            ) : (
              <progress max={100} value={progress.value} aria-label={progress.label} />
            )}
            <span>{progress.label}</span>
          </div>
        )}
        {state.kind === 'available' && state.error && (
          <div className="update-error" role="alert">
            <p className="error">{t('update.installFailed')}</p>
            <p className="muted small">{state.error}</p>
          </div>
        )}
        <div className="modal-foot">
          <button type="button" onClick={updates.dismiss} disabled={busy}>
            {t('update.later')}
          </button>
          <button
            type="button"
            className="primary"
            ref={installRef}
            onClick={() => void updates.install()}
            disabled={busy}
          >
            {t('update.install')}
          </button>
        </div>
      </div>
    </div>
  )
}
