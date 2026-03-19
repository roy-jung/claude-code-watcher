// ANSI escape code constants and helpers

const ESC = '\x1b';
const CSI = `${ESC}[`;
const OSC = `${ESC}]`;

export const RESET = `${CSI}0m`;
export const BOLD = `${CSI}1m`;
export const DIM = `${CSI}2m`;
export const ITALIC = `${CSI}3m`;
export const UNDERLINE = `${CSI}4m`;
export const REVERSE = `${CSI}7m`;

// Foreground colors
export const FG = {
  BLACK: `${CSI}30m`,
  RED: `${CSI}31m`,
  GREEN: `${CSI}32m`,
  YELLOW: `${CSI}33m`,
  BLUE: `${CSI}34m`,
  MAGENTA: `${CSI}35m`,
  CYAN: `${CSI}36m`,
  WHITE: `${CSI}37m`,
  BRIGHT_BLACK: `${CSI}90m`, // gray
  BRIGHT_RED: `${CSI}91m`,
  BRIGHT_GREEN: `${CSI}92m`,
  BRIGHT_YELLOW: `${CSI}93m`,
  BRIGHT_BLUE: `${CSI}94m`,
  BRIGHT_MAGENTA: `${CSI}95m`,
  BRIGHT_CYAN: `${CSI}96m`,
  BRIGHT_WHITE: `${CSI}97m`,
};

// Background colors
export const BG = {
  BLACK: `${CSI}40m`,
  RED: `${CSI}41m`,
  GREEN: `${CSI}42m`,
  YELLOW: `${CSI}43m`,
  BLUE: `${CSI}44m`,
  MAGENTA: `${CSI}45m`,
  CYAN: `${CSI}46m`,
  WHITE: `${CSI}47m`,
  BRIGHT_BLACK: `${CSI}100m`,
  BRIGHT_WHITE: `${CSI}107m`,
};

// Cursor control
export const CURSOR_HOME = `${CSI}H`;
export const CURSOR_HIDE = `${CSI}?25l`;
export const CURSOR_SHOW = `${CSI}?25h`;
export const CLEAR_SCREEN = `${CSI}2J`;
export const CLEAR_LINE = `${CSI}K`;

// Alternate screen buffer
export const ALT_SCREEN_ON = `${CSI}?1049h`;
export const ALT_SCREEN_OFF = `${CSI}?1049l`;

// Auto-wrap mode (disable to prevent last-column wrapping artifacts)
export const WRAP_OFF = `${CSI}?7l`;
export const WRAP_ON = `${CSI}?7h`;

/**
 * Move cursor to row, col (1-indexed)
 */
export function moveTo(row, col) {
  return `${CSI}${row};${col}H`;
}

/**
 * Wrap text in ANSI color codes, reset at end.
 */
export function color(ansiCode, text) {
  return `${ansiCode}${text}${RESET}`;
}

/**
 * Create an OSC 8 hyperlink (clickable in supported terminals like VS Code)
 * @param {string} url
 * @param {string} text
 */
export function hyperlink(url, text) {
  return `${OSC}8;;${url}\x07${text}${OSC}8;;\x07`;
}

/**
 * Strip all ANSI escape sequences from a string (for length measurement)
 */
// RegExp constructor used intentionally: Biome noControlCharactersInRegex
// does not check string arguments, only regex literals.
const STRIP_ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g;

export function stripAnsi(str) {
  STRIP_ANSI_RE.lastIndex = 0;
  return str.replace(STRIP_ANSI_RE, '');
}

/**
 * Returns the terminal display width of a single Unicode code point.
 * CJK/Hangul/fullwidth/emoji characters occupy 2 columns; most others occupy 1.
 * Zero-width characters (ZWJ, variation selectors, combining marks) return 0.
 */
export function charDisplayWidth(cp) {
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0; // control chars
  if (cp === 0x200d) return 0; // ZWJ (Zero Width Joiner)
  if (cp >= 0xfe00 && cp <= 0xfe0f) return 0; // variation selectors VS1–VS16
  if (cp >= 0xe0100 && cp <= 0xe01ef) return 0; // variation selectors supplement
  if (cp >= 0x300 && cp <= 0x36f) return 0; // combining diacritical marks
  if (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK Radicals
    (cp >= 0x3040 && cp <= 0x33ff) || // Kana, Bopomofo, etc.
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Extension A
    (cp >= 0x4e00 && cp <= 0xa4cf) || // CJK Unified Ideographs + Yi
    (cp >= 0xa960 && cp <= 0xa97f) || // Hangul Jamo Extended-A
    (cp >= 0xac00 && cp <= 0xd7ff) || // Hangul Syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
    (cp >= 0xfe10 && cp <= 0xfe6f) || // CJK Compatibility Forms + Small Forms
    (cp >= 0xff01 && cp <= 0xff60) || // Fullwidth Forms
    (cp >= 0xffe0 && cp <= 0xffe6) || // Fullwidth Signs
    (cp >= 0x1b000 && cp <= 0x1b0ff) || // Kana Supplement
    (cp >= 0x1f1e0 && cp <= 0x1f1ff) || // Regional indicator symbols (flags)
    (cp >= 0x1f300 && cp <= 0x1faff) || // Emoji: Misc Symbols, Transport, Supplemental, etc.
    (cp >= 0x1fb00 && cp <= 0x1fbff) || // Symbols for Legacy Computing
    (cp >= 0x20000 && cp <= 0x2fffd) || // CJK Extension B–F
    (cp >= 0x30000 && cp <= 0x3fffd) // CJK Extension G+
  )
    return 2;
  return 1;
}

// Module-level segmenter for grapheme cluster splitting (Node.js 16+)
const _segmenter = new Intl.Segmenter();

/**
 * Returns the terminal display width of a grapheme cluster (one user-perceived character).
 * Handles ZWJ sequences (👨‍👩‍👧‍👦), regional indicator pairs (🇰🇷), skin tone modifiers (👋🏽),
 * and VS16 emoji presentation (❤️).
 */
export function graphemeDisplayWidth(segment) {
  const cp = segment.codePointAt(0);
  const w = charDisplayWidth(cp);
  // A grapheme cluster containing VS16 (U+FE0F) forces emoji presentation → 2 columns
  if (w === 1 && segment.includes('\uFE0F')) return 2;
  return w;
}

/**
 * Get the visible display width of a string (without ANSI codes).
 * Uses grapheme cluster segmentation to correctly handle emoji sequences,
 * ZWJ sequences, regional indicator pairs, and skin tone modifiers.
 */
export function visibleLength(str) {
  const plain = stripAnsi(str);
  let width = 0;
  for (const { segment } of _segmenter.segment(plain)) {
    width += graphemeDisplayWidth(segment);
  }
  return width;
}

export { _segmenter };
