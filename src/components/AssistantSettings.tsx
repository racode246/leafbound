import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { api } from '../lib/api'
import {
  DEFAULT_BASE_URLS,
  DEFAULT_MODELS,
  type ApiKeyStatus,
  type AssistantSettings,
  type LlmProvider
} from '../types'

interface Props {
  bookId: string
  settings: AssistantSettings
  keys: ApiKeyStatus
  onSettings: (settings: AssistantSettings) => void
  onKeys: (keys: ApiKeyStatus) => void
  onHistoryCleared: () => void
  onDone: () => void
}

const PROVIDERS: { value: LlmProvider; key: 'ai.provider.anthropic' | 'ai.provider.openai' }[] = [
  { value: 'anthropic', key: 'ai.provider.anthropic' },
  { value: 'openai', key: 'ai.provider.openai' }
]

export default function AssistantSettingsView({
  bookId,
  settings,
  keys,
  onSettings,
  onKeys,
  onHistoryCleared,
  onDone
}: Props) {
  const t = useT()
  const [model, setModel] = useState(settings.model)
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [keyDraft, setKeyDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const provider = settings.provider
  const hasKey = keys[provider]

  useEffect(() => {
    setModel(settings.model)
    setBaseUrl(settings.baseUrl)
  }, [settings.model, settings.baseUrl])

  useEffect(() => {
    setKeyDraft('')
    setMessage(null)
  }, [provider])

  const commit = () => {
    const next = { ...settings, model: model.trim(), baseUrl: baseUrl.trim() }
    if (next.model !== settings.model || next.baseUrl !== settings.baseUrl) onSettings(next)
  }

  const run = async (action: () => Promise<ApiKeyStatus>, done: string) => {
    setBusy(true)
    setMessage(null)
    try {
      onKeys(await action())
      setKeyDraft('')
      setMessage(done)
    } catch (err) {
      setMessage(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="assistant-scroll assistant-settings">
      <section>
        <h3>{t('ai.settings.provider')}</h3>
        <fieldset className="segmented wide">
          {PROVIDERS.map((p) => (
            <button
              type="button"
              key={p.value}
              className={provider === p.value ? 'active' : ''}
              onClick={() => {
                if (p.value !== provider)
                  onSettings({ provider: p.value, model: DEFAULT_MODELS[p.value], baseUrl: '' })
              }}
            >
              {t(p.key)}
            </button>
          ))}
        </fieldset>
        {provider === 'openai' && <p className="muted small">{t('ai.settings.openaiHint')}</p>}
      </section>

      <section>
        <h3>{t('ai.settings.model')}</h3>
        <input
          className="wide"
          value={model}
          placeholder={
            provider === 'anthropic' ? DEFAULT_MODELS.anthropic : t('ai.settings.modelPlaceholder')
          }
          onChange={(e) => setModel(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          spellCheck={false}
        />
      </section>

      <section>
        <h3>{t('ai.settings.baseUrl')}</h3>
        <input
          className="wide"
          value={baseUrl}
          placeholder={DEFAULT_BASE_URLS[provider]}
          onChange={(e) => setBaseUrl(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          spellCheck={false}
        />
        <p className="muted small">{t('ai.settings.baseUrlHint')}</p>
      </section>

      <section>
        <h3>
          {t('ai.settings.apiKey')}{' '}
          <span className="value">
            {hasKey ? t('ai.settings.keySaved') : t('ai.settings.keyMissing')}
          </span>
        </h3>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (keyDraft.trim())
              void run(() => api.setApiKey(provider, keyDraft), t('ai.settings.keyStored'))
          }}
        >
          <input
            type="password"
            value={keyDraft}
            autoComplete="off"
            placeholder={hasKey ? t('ai.settings.keyReplace') : t('ai.settings.keyPlaceholder')}
            onChange={(e) => setKeyDraft(e.target.value)}
            aria-label={t('ai.settings.apiKey')}
          />
          <button type="submit" disabled={busy || !keyDraft.trim()}>
            {t('hl.save')}
          </button>
        </form>
        {hasKey && (
          <button
            type="button"
            className="danger small-button"
            disabled={busy}
            onClick={() => void run(() => api.deleteApiKey(provider), t('ai.settings.keyDeleted'))}
          >
            {t('ai.settings.keyDelete')}
          </button>
        )}
        <p className="muted small">{t('ai.settings.keyHint')}</p>
        {message && <p className="small">{message}</p>}
      </section>

      <section>
        <h3>{t('ai.settings.privacy')}</h3>
        <p className="muted small">{t('ai.settings.privacyText')}</p>
      </section>

      <section>
        <h3>{t('ai.settings.history')}</h3>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (!window.confirm(t('ai.settings.clearConfirm'))) return
            void api
              .clearAssistantHistory(bookId)
              .then(onHistoryCleared)
              .catch((err) => setMessage(String(err)))
          }}
        >
          {t('ai.settings.clearHistory')}
        </button>
      </section>

      <section>
        <button type="button" className="primary" onClick={onDone}>
          {t('ai.settings.done')}
        </button>
      </section>
    </div>
  )
}
