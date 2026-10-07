import { useState } from 'react'
import {
  FONT_PRESETS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  type Settings,
  type ThemeName
} from '../types'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
}

const THEMES: { value: ThemeName; label: string }[] = [
  { value: 'light', label: '白' },
  { value: 'sepia', label: 'セピア' },
  { value: 'dark', label: '黒' }
]

export default function ReaderSettings({ settings, onChange, onClose }: Props) {
  const isPreset = FONT_PRESETS.some((p) => p.value === settings.fontFamily)
  const [custom, setCustom] = useState(isPreset ? '' : settings.fontFamily)

  const clampSize = (n: number) => Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, n))
  const clampLh = (n: number) => Math.round(Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, n)) * 10) / 10

  return (
    <aside className="panel settings-panel" aria-label="表示設定">
      <div className="panel-head">
        <span>表示設定</span>
        <button type="button" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>

      <section>
        <h3>読み方向</h3>
        <div className="segmented wide" role="group">
          <button
            type="button"
            className={settings.flow === 'paginated' ? 'active' : ''}
            onClick={() => onChange({ flow: 'paginated' })}
          >
            横読み（ページ送り）
          </button>
          <button
            type="button"
            className={settings.flow === 'scrolled' ? 'active' : ''}
            onClick={() => onChange({ flow: 'scrolled' })}
          >
            縦読み（スクロール）
          </button>
        </div>
      </section>

      <section>
        <h3>配色</h3>
        <div className="segmented wide" role="group">
          {THEMES.map((t) => (
            <button
              type="button"
              key={t.value}
              className={settings.theme === t.value ? 'active' : ''}
              onClick={() => onChange({ theme: t.value })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>フォント</h3>
        <select
          className="select wide"
          value={isPreset ? settings.fontFamily : '__custom__'}
          onChange={(e) => {
            if (e.target.value !== '__custom__') onChange({ fontFamily: e.target.value })
          }}
        >
          {FONT_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value="__custom__">カスタム…</option>
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
            placeholder="インストール済みフォント名"
            onChange={(e) => setCustom(e.target.value)}
            aria-label="カスタムフォント名"
          />
          <button type="submit" disabled={!custom.trim()}>
            適用
          </button>
        </form>
      </section>

      <section>
        <h3>
          文字サイズ <span className="value">{settings.fontSize}px</span>
        </h3>
        <div className="stepper">
          <button type="button" onClick={() => onChange({ fontSize: clampSize(settings.fontSize - 1) })} aria-label="小さく">
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
          <button type="button" onClick={() => onChange({ fontSize: clampSize(settings.fontSize + 1) })} aria-label="大きく">
            ＋
          </button>
        </div>
      </section>

      <section>
        <h3>
          行間 <span className="value">{settings.lineHeight.toFixed(1)}</span>
        </h3>
        <div className="stepper">
          <button type="button" onClick={() => onChange({ lineHeight: clampLh(settings.lineHeight - 0.1) })} aria-label="狭く">
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
          <button type="button" onClick={() => onChange({ lineHeight: clampLh(settings.lineHeight + 0.1) })} aria-label="広く">
            ＋
          </button>
        </div>
      </section>
    </aside>
  )
}
