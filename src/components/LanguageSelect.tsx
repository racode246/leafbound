import { useT } from '../i18n'
import type { LanguageSetting } from '../types'

interface Props {
  value: LanguageSetting
  onChange: (value: LanguageSetting) => void
  className?: string
}

export default function LanguageSelect({ value, onChange, className = '' }: Props) {
  const t = useT()
  return (
    <select
      className={`select ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value as LanguageSetting)}
      aria-label={t('settings.language')}
      title={t('settings.language')}
    >
      <option value="system">{t('lang.system')}</option>
      <option value="ja">{t('lang.ja')}</option>
      <option value="en">{t('lang.en')}</option>
    </select>
  )
}
