import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import Icon from './Icon'

interface Props {
  icon: LucideIcon
  /** The button's accessible name. */
  label: string
  /** The tooltip text; defaults to `label`. */
  tip?: string
  /** The panel the button opens is shown. */
  active?: boolean
  /**
   * Which edge of the button the tooltip lines up with. Buttons at either end of the bar use
   * `start` / `end` so the tooltip stays inside the window.
   */
  align?: 'start' | 'center' | 'end'
  onClick: () => void
  /** Drawn after the icon (the Highlights count). */
  children?: ReactNode
}

/**
 * An icon-only title bar button. Its label shows in a tooltip below it, styled by the reader
 * theme, when it is hovered or focused from the keyboard (CSS: `.bar-tip` in styles.css). There
 * is no native `title`, so only one tooltip ever shows. The tooltip is hidden from screen
 * readers; they read `aria-label`.
 */
export default function BarButton({
  icon,
  label,
  tip,
  active = false,
  align = 'center',
  onClick,
  children
}: Props) {
  return (
    <button
      type="button"
      className={`bar-button bar-icon-button${active ? ' active' : ''}`}
      aria-label={label}
      onClick={onClick}
    >
      <Icon icon={icon} />
      {children}
      <span className={`bar-tip bar-tip-${align}`} aria-hidden="true">
        {tip ?? label}
      </span>
    </button>
  )
}
