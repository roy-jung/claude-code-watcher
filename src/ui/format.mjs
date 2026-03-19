import {
  _segmenter,
  color,
  FG,
  graphemeDisplayWidth,
  visibleLength,
} from './ansi.mjs';

/**
 * Truncate a string to maxLen terminal columns, appending ellipsis if needed.
 * Uses grapheme cluster segmentation to correctly handle emoji and wide characters.
 */
export function truncate(str, maxLen) {
  if (!str) return '';
  str = str.replace(/\r?\n/g, ' ');
  let width = 0;
  let i = 0;
  for (const { segment } of _segmenter.segment(str)) {
    const cw = graphemeDisplayWidth(segment);
    if (width + cw > maxLen - 1) {
      return `${str.slice(0, i)}…`;
    }
    width += cw;
    i += segment.length;
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
      return FG.BRIGHT_BLUE;
    case 'waiting':
      return FG.BRIGHT_WHITE;
    case 'notification':
      return FG.BRIGHT_RED;
    default:
      return FG.BRIGHT_BLACK;
  }
}

const STATUS_LABEL = {
  working:      '작업중',
  waiting:      '대기중',
  notification: '응답 요청',
};

export function statusLabel(status) {
  return STATUS_LABEL[status] ?? status;
}

/**
 * Return a colored status label string.
 */
export function formatStatus(status) {
  return color(statusColor(status), statusLabel(status));
}

