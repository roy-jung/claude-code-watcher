import {
  charDisplayWidth,
  color,
  FG,
  RESET,
  visibleLength,
} from './ansi.mjs';

/**
 * Truncate a string to maxLen terminal columns, appending ellipsis if needed.
 * Correctly handles wide (2-column) CJK/Hangul characters.
 */
export function truncate(str, maxLen) {
  if (!str) return '';
  str = str.replace(/\r?\n/g, ' ');
  let width = 0;
  let i = 0;
  for (const char of str) {
    const cw = charDisplayWidth(char.codePointAt(0));
    if (width + cw > maxLen - 1) {
      return str.slice(0, i) + '…';
    }
    width += cw;
    i += char.length; // handles surrogate pairs (emoji, CJK Extension B+)
  }
  return str;
}

/**
 * Pad a string to a fixed visible width (left-aligned).
 */
export function padEnd(str, width) {
  const visible = visibleLength(str);
  if (visible >= width) return str;
  return str + ' '.repeat(width - visible);
}

/**
 * Pad a string to a fixed visible width (right-aligned).
 */
export function padStart(str, width) {
  const visible = visibleLength(str);
  if (visible >= width) return str;
  return ' '.repeat(width - visible) + str;
}

/**
 * Format a Date to HH:MM:SS string.
 */
export function formatTime(date) {
  if (!(date instanceof Date)) return '--:--:--';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Return ANSI color code for a given session status.
 */
export function statusColor(status) {
  switch (status) {
    case 'working':
      return FG.YELLOW;
    case 'waiting':
      return FG.GREEN;
    case 'stale':
      return FG.BRIGHT_BLACK;
    case 'notification':
      return FG.CYAN;
    case 'error':
      return FG.RED;
    default:
      return FG.WHITE;
  }
}

/**
 * Return a colored status label string.
 */
export function formatStatus(status) {
  return color(statusColor(status), status);
}

