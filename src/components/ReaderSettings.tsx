import { useState } from 'react'
import { useT } from '../i18n'
import {
  FONT_PRESETS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  type Settings,
  type Spread,
  type ThemeName
} from '../types'
import LanguageSelect from './LanguageSelect'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
}

const THEMES: { value: ThemeName; key: 'theme.light' | 'theme.sepia' | 'theme.dark' }[] = [
  { value: 'light', key: 'theme.light' },
  { value: 'sepia', key: 'theme.sepia' },
  { value: 'dark', key: 'theme.dark' }
]

const SPREADS: { value: Spread; key: 'spread.none' | 'spread.auto' | 'spread.always' }[] = [
  { value: 'none', key: 'spread.none' },
  { value: 'auto', key: 'spread.auto' },
  { value: 'always', key: 'spread.always' }
]

export default function ReaderSettings({ settings, onChange, onClose }: Props) {
  const t = useT()
  const isPreset = FONT_PRESETS.some((p) => p.value === settings.fontFamily)
  const [custom, setCustom] = useState(isPreset ? '' : settings.fontFamily)
  const paginated = settings.flow === 'paginated'

  const clampSize = (n: number) => Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, n))
  const clampLh = (n: number) => Math.round(Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, n)) * 10) / 10

  return (
    <aside className="panel settings-panel" aria-label={t('settings.title')}>
      <div className="panel-head">
        <span>{t('settings.title')}</span>
        <button type="button" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>

      <section>
        <h3>{t('settings.flow')}</h3>
        <div className="segmented wide" role="group">
          <button
            type="button"
            className={settings.flow === 'paginated' ? 'active' : ''}
            onClick={() => onChange({ flow: 'paginated' })}
          >
            {t('flow.paginated')}
          </button>
          <button
            type="button"
            className={settings.flow === 'scrolled' ? 'active' : ''}
            onClick={() => onChange({ flow: 'scrolled' })}
          >
            {t('flow.scrolled')}
          </button>
        </div>
      </section>

      <section>
        <h3>{t('settings.spread')}</h3>
        <div className="segmented wide" role="group" aria-disabled={!paginated}>
          {SPREADS.map((s) => (
            <button
              type="button"
              key={s.value}
              className={settings.spread === s.value ? 'active' : ''}
              disabled={!paginated}
              onClick={() => onChange({ spread: s.value })}
              title={s.value === 'auto' ? t('spread.autoHint') : undefined}
            >
              {t(s.key)}
            </button>
          ))}
        </div>
        {!paginated && <p className="muted small">{t('spread.needsPaginated')}</p>}
      </section>

      <section>
        <h3>{t('settings.theme')}</h3>
        <div className="segmented wide" role="group">
          {THEMES.map((th) => (
            <button
              type="button"
              key={th.value}
              className={settings.theme === th.value ? 'active' : ''}
              onClick={() => onChange({ theme: th.value })}
            >
              {t(th.key)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>{t('settings.font')}</h3>
        <select
          className="select wide"
          value={isPreset ? settings.fontFamily : '__custom__'}
          onChange={(e) => {
            if (e.target.value !== '__custom__') onChange({ fontFamily: e.target.value })
          }}
        >
          {FONT_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {'labelKey' in p ? t(p.labelKey) : p.label}
            </option>
          ))}
          <option value="__custom__">{t('font.custom')}</option>
        </select>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (custom.trim()) onChange({ fontFamily: custom.trim() })
          }}
        >
          <input
            value={custom}
            placeholder={t('font.customPlaceholder')}
            onChange={(e) => setCustom(e.target.value)}
            aria-label={t('font.customAria')}
          />
          <button type="submit" disabled={!custom.trim()}>
            {t('font.apply')}
          </button>
        </form>
      </section>

      <section>
        <h3>
          {t('settings.fontSize')} <span className="value">{settings.fontSize}px</span>
        </h3>
        <div className="stepper">
          <button
            type="button"
            onClick={() => onChange({ fontSize: clampSize(settings.fontSize - 1) })}
            aria-label={t('fontSize.smaller')}
          >
            −
          </button>
          <input
            type="range"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={1}
            value={settings.fontSize}
            onChange={(e) => onChange({ fontSize: clampSize(Number(e.target.value)) })}
          />
          <button
            type="button"
            onClick={() => onChange({ fontSize: clampSize(settings.fontSize + 1) })}
            aria-label={t('fontSize.larger')}
          >
            ＋
          </button>
        </div>
      </section>

      <section>
        <h3>
          {t('settings.lineHeight')} <span className="value">{settings.lineHeight.toFixed(1)}</span>
        </h3>
        <div className="stepper">
          <button
            type="button"
            onClick={() => onChange({ lineHeight: clampLh(settings.lineHeight - 0.1) })}
            aria-label={t('lineHeight.tighter')}
          >
            −
          </button>
          <input
            type="range"
            min={LINE_HEIGHT_MIN}
            max={LINE_HEIGHT_MAX}
            step={0.1}
            value={settings.lineHeight}
            onChange={(e) => onChange({ lineHeight: clampLh(Number(e.target.value)) })}
          />
          <button
            type="button"
            onClick={() => onChange({ lineHeight: clampLh(settings.lineHeight + 0.1) })}
            aria-label={t('lineHeight.wider')}
          >
            ＋
          </button>
        </div>
      </section>

      <section>
        <h3>{t('settings.language')}</h3>
        <LanguageSelect value={settings.language} onChange={(language) => onChange({ language })} className="wide" />
      </section>
    </aside>
  )
}
