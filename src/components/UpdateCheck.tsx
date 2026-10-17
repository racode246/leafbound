import { RefreshCw } from 'lucide-react'
import { useT } from '../i18n'
import type { Updates } from '../lib/useUpdates'
import Icon from './Icon'

/** Version and "Check for updates" at the foot of the library sidebar. */
export default function UpdateCheck({ updates }: { updates: Updates }) {
  const t = useT()
  const { state, version } = updates
  const checking = state.kind === 'checking'

  return (
    <div className="update-check">
      <div className="update-check-row">
        <span className="muted small">{version ? t('update.version', { version }) : ''}</span>
        <button
          type="button"
          className="update-check-button"
          onClick={() => void updates.check()}
          disabled={checking || state.kind === 'installing'}
        >
          <Icon icon={RefreshCw} />
          {checking ? t('update.checking') : t('update.check')}
        </button>
      </div>
      <p className="update-check-status small" role="status">
        {state.kind === 'upToDate' && t('update.upToDate')}
        {state.kind === 'checkFailed' && (
          <span className="error" title={state.error}>
            {t('update.checkFailed')}
          </span>
        )}
      </p>
    </div>
  )
}
