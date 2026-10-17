import type { LucideIcon } from 'lucide-react'

/** px; a little taller than the cap height of the 14 px UI text. */
export const ICON_SIZE = 16
/** In the icon's 24-unit grid: about 1.2 px at 16 px, close to the weight of the UI text. */
export const ICON_STROKE = 1.75

/**
 * Every icon in the app goes through this, so they share one size and stroke:
 *
 *   import { X } from 'lucide-react'
 *   <button type="button" onClick={onClose} aria-label={t('close')}>
 *     <Icon icon={X} />
 *   </button>
 *
 * The icon is drawn in `currentColor`, so it follows the button's text colour and the reader
 * theme. It is hidden from screen readers: the button keeps its own name (`aria-label`, or
 * `title` where there is no label). Its alignment with neighbouring text is set on `.icon` in
 * styles.css; a place that needs a bigger icon (the page-turn edges) resizes `.icon` there.
 */
export default function Icon({ icon: Glyph }: { icon: LucideIcon }) {
  return (
    <Glyph
      className="icon"
      size={ICON_SIZE}
      strokeWidth={ICON_STROKE}
      aria-hidden="true"
      focusable="false"
    />
  )
}
