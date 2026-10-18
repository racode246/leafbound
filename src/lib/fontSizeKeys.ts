import { FONT_SIZE_DEFAULT, FONT_SIZE_MAX, FONT_SIZE_MIN } from '../types'

/**
 * The font size a reader shortcut asks for, or null when the key is not one:
 * Ctrl/⌘ + `=` / `+` (numpad too) one px larger, `-` one px smaller, `0` the default.
 * The result stays within FONT_SIZE_MIN..FONT_SIZE_MAX; at a limit it is the current
 * size, so the caller still cancels the browser's page zoom.
 */
export function fontSizeForKey(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  current: number
): number | null {
  // Ctrl+Alt is AltGr on some layouts and types a character.
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null
  let size: number
  switch (e.key) {
    case '=':
    case '+':
      size = current + 1
      break
    case '-':
      size = current - 1
      break
    case '0':
      size = FONT_SIZE_DEFAULT
      break
    default:
      return null
  }
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, size))
}
