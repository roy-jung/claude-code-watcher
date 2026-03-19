import { execFile } from 'node:child_process';
import { readConfig } from '../core/config.mjs';
import {
  ALT_SCREEN_OFF,
  ALT_SCREEN_ON,
  BOLD,
  CLEAR_LINE,
  CURSOR_HIDE,
  CURSOR_SHOW,
  color,
  DIM,
  FG,
  hyperlink,
  RESET,
  visibleLength,
} from './ansi.mjs';
import {
  formatStatus,
  formatTime,
  padEnd,
  padStart,
  statusColor,
  statusLabel,
  truncate,
} from './format.mjs';

// Apply the status color to an arbitrary label string (e.g. a truncated status).
function coloredStatus(status, label) {
  return color(statusColor(status), label);
}

import { getTermSize, MIN_WIDTH } from './layout.mjs';

const TITLE = 'Claude Code Watcher';

// Column widths (fixed)
const SEL_W = 2; // '❯ ' or '  '
const NUM_W = 3; // right-aligned row number
const STAT_W = 12; // status text
const TIME_W = 5; // HH:MM
const GAP = 2; // spaces between columns
const ROW_FIXED = SEL_W + NUM_W + STAT_W + TIME_W + GAP * 4;

// Detail view label column width: longest label (7: updated/started/message) + 2-space gap
const LABEL_W = 9;

function calcVarWidths(cols) {
  const varW = Math.max(0, cols - 4 - ROW_FIXED);
  const projW = Math.floor(varW * 0.38);
  const msgW = varW - projW;
  return { projW, msgW };
}

export class Renderer {
  #store;
  #keyboard;
  #selectedIndex = 0;
  #view = 'list'; // 'list' | 'detail'
  #sessions = [];
  #resizeHandler = null;
  #updateHandler = null;
  #tickTimer = null;
  #prevLines = []; // diff-rendering cache: only changed lines are written to stdout
  // last alert timestamp per sessionId — prevents rapid-fire sounds per session
  #lastAlertAts = new Map();
  // previous alertAt per sessionId — alerts when hook writes a new alertAt timestamp
  #prevAlertAts = new Map();

  constructor(store, keyboard) {
    this.#store = store;
    this.#keyboard = keyboard;
  }

  start() {
    this.#sessions = this.#store.getSessions();
    process.stdout.write(ALT_SCREEN_ON + CURSOR_HIDE);

    // Prime prevAlertAts with current values so existing alertAt timestamps
    // don't trigger spurious alerts on the first store update event.
    for (const session of this.#sessions) {
      this.#prevAlertAts.set(session.sessionId, session.alertAt);
    }

    this.#updateHandler = sessions => {
      this.#sessions = sessions;
      if (this.#selectedIndex >= this.#sessions.length) {
        this.#selectedIndex = Math.max(0, this.#sessions.length - 1);
      }
      this.#checkNotifications();
      this.#render();
    };
    this.#store.on('update', this.#updateHandler);
    this.#keyboard.on('key', key => this.#handleKey(key));
    this.#resizeHandler = () => {
      this.#prevLines = [];
      this.redraw();
    };
    process.stdout.on('resize', this.#resizeHandler);
    this.#tickTimer = setInterval(() => this.#render(), 1000);
    this.#render();
  }

  #checkNotifications() {
    const currentIds = new Set(this.#sessions.map(s => s.sessionId));

    for (const id of this.#prevAlertAts.keys()) {
      if (!currentIds.has(id)) this.#prevAlertAts.delete(id);
    }

    for (const session of this.#sessions) {
      const { sessionId, alertAt, alertEvent } = session;
      const prev = this.#prevAlertAts.get(sessionId);

      if (alertAt && alertAt !== prev) {
        this.#alert(sessionId, alertEvent);
      }

      this.#prevAlertAts.set(sessionId, alertAt);
    }
  }

  #alert(sessionId, alertEvent) {
    const now = Date.now();
    if (now - (this.#lastAlertAts.get(sessionId) ?? 0) < 3000) return; // 3초 이내 중복 사운드 방지
    this.#lastAlertAts.set(sessionId, now);

    process.stdout.write('\x07');
    if (process.platform === 'darwin') {
      const cfg = readConfig();
      const soundKey = alertEvent === 'Stop' ? 'stop' : 'noti';
      const soundName =
        cfg.sounds?.[soundKey] ?? (alertEvent === 'Stop' ? 'Blow' : 'Funk');
      execFile(
        'afplay',
        [`/System/Library/Sounds/${soundName}.aiff`],
        { timeout: 3000 },
        () => {
          /* ignore errors */
        },
      );
    }
  }

  #renderHelpLine(lines, cols, keys) {
    const help = keys
      .map(([k, v]) => `${color(FG.BRIGHT_WHITE, k)} ${DIM}${v}${RESET}`)
      .join('   ');
    const credit = color(FG.BRIGHT_BLACK, '@roy-jung');
    const helpPart = `  ${help}`;
    const gap = Math.max(
      0,
      cols - visibleLength(helpPart) - visibleLength(credit),
    );
    lines.push(`${helpPart}${' '.repeat(gap)}${credit}`);
  }

  stop() {
    if (this.#tickTimer) {
      clearInterval(this.#tickTimer);
      this.#tickTimer = null;
    }
    if (this.#resizeHandler)
      process.stdout.removeListener('resize', this.#resizeHandler);
    if (this.#updateHandler)
      this.#store.removeListener('update', this.#updateHandler);
    process.stdout.write(CURSOR_SHOW + ALT_SCREEN_OFF);
  }

  redraw() {
    this.#render();
  }

  selectNext() {
    if (this.#sessions.length === 0) return;
    this.#selectedIndex = (this.#selectedIndex + 1) % this.#sessions.length;
    this.#render();
  }

  selectPrev() {
    if (this.#sessions.length === 0) return;
    this.#selectedIndex =
      (this.#selectedIndex - 1 + this.#sessions.length) % this.#sessions.length;
    this.#render();
  }

  toggleDetail() {
    if (this.#sessions.length === 0) return;
    this.#view = this.#view === 'list' ? 'detail' : 'list';
    this.#render();
  }

  #handleKey(key) {
    switch (key.name) {
      case 'q':
      case 'Q':
        this.#keyboard.emit('quit');
        break;
      case 'r':
        this.#store.reload();
        break;
      case 'R':
        this.#keyboard.emit('respawn');
        break;
      case 'up':
        if (this.#view === 'list') this.selectPrev();
        break;
      case 'down':
        if (this.#view === 'list') this.selectNext();
        break;
      case 'return':
      case 'enter':
        this.toggleDetail();
        break;
      case 'escape':
        if (this.#view === 'detail') {
          this.#view = 'list';
          this.#render();
        }
        break;
    }
  }

  #render() {
    const { cols, rows } = getTermSize();
    const lines = [];

    if (cols < MIN_WIDTH) {
      this.#renderCompact(lines, cols, rows);
    } else {
      // Use cols-1 so the box never touches the terminal's last column,
      // avoiding auto-wrap artifacts in terminals like Ghostty.
      const w = cols - 1;
      if (this.#view === 'detail' && this.#sessions.length > 0) {
        this.#renderDetail(lines, w, rows);
      } else {
        this.#renderList(lines, w, rows);
      }
    }
    this.#flush(lines, rows);
  }

  /** Compact view: project name + colored status indicator (COMPACT_WIDTH <= cols < MIN_WIDTH). */
  #renderCompact(lines, cols, rows) {
    const w = cols - 1; // avoid auto-wrap like full view
    const inner = w - 2; // between │ and │

    // Top border with title: ╭─ Claude Code Watcher ───╮
    const titleStr = '─ Claude Code Watcher ';
    const rightDashes = Math.max(0, inner - titleStr.length);
    lines.push(color(FG.WHITE, `╭${titleStr}${'─'.repeat(rightDashes)}╮`));

    if (this.#sessions.length === 0) {
      lines.push(
        `${color(FG.WHITE, '│')}${padEnd(color(FG.BRIGHT_BLACK, ' ○'), inner)}${color(FG.WHITE, '│')}`,
      );
    } else {
      const nameW = inner - 3; // ' ● ' = 3
      for (const session of this.#sessions) {
        const dot = color(statusColor(session.status), '●');
        const name = color(statusColor(session.status), padEnd(truncate(session.displayName, nameW), nameW));
        lines.push(
          `${color(FG.WHITE, '│')} ${dot} ${name}${color(FG.WHITE, '│')}`,
        );
      }
    }

    lines.push(color(FG.WHITE, `╰${'─'.repeat(inner)}╯`));

    const credit = color(FG.BRIGHT_BLACK, '@roy-jung');
    lines.push(
      ' '.repeat(Math.max(0, w - visibleLength('@roy-jung'))) + credit,
    );

    this.#flush(lines, rows);
  }

#renderHeader(lines, cols, now) {
    const count = this.#sessions.length;
    const inner = cols - 4;
    const dot = count > 0 ? color(FG.CYAN, '●') : color(FG.BRIGHT_BLACK, '○');
    const stats = `${dot} ${BOLD}${count}${RESET} active  ${color(FG.BRIGHT_BLACK, '·')}  ${color(FG.BRIGHT_BLACK, formatTime(now))}`;
    const titleTxt = `${color(FG.BRIGHT_MAGENTA, '## ')}${BOLD}${TITLE}${RESET}${color(FG.BRIGHT_MAGENTA, ' ##')}`;
    const pad = Math.max(
      0,
      inner - visibleLength(titleTxt) - visibleLength(stats),
    );
    lines.push(color(FG.MAGENTA, `╭${'─'.repeat(cols - 2)}╮`));
    lines.push(
      `${color(FG.MAGENTA, '│')} ${titleTxt}${' '.repeat(pad)}${stats} ${color(FG.MAGENTA, '│')}`,
    );
    lines.push(color(FG.MAGENTA, `╰${'─'.repeat(cols - 2)}╯`));
  }

  #renderList(lines, cols, rows) {
    const now = new Date();
    const inner = cols - 4; // visible content width between '│ ' and ' │'
    const { projW, msgW } = calcVarWidths(cols);

    // ── Header box ────────────────────────────────────────────────────
    this.#renderHeader(lines, cols, now);

    // ── Session list box ──────────────────────────────────────────────
    lines.push(color(FG.WHITE, `╭${'─'.repeat(cols - 2)}╮`));

    const hdr = buildDataLine(
      '  ',
      padStart('#', NUM_W),
      padEnd('Project', projW),
      padEnd('Status', STAT_W),
      padEnd('Last Message', msgW),
      padEnd('Time', TIME_W),
    );
    lines.push(
      `${color(FG.WHITE, '│')} ${BOLD}${hdr}${RESET} ${color(FG.WHITE, '│')}`,
    );
    lines.push(
      `${color(FG.WHITE, '│')}  ${color(FG.BRIGHT_BLACK, '─'.repeat(inner - 1))} ${color(FG.WHITE, '│')}`,
    );

    if (this.#sessions.length === 0) {
      lines.push(
        `${color(FG.WHITE, '│')}  ${color(FG.BRIGHT_BLACK, padEnd('No active Claude sessions', inner - 1))} ${color(FG.WHITE, '│')}`,
      );
    } else {
      // fixed lines: header-box(3) + list-top(1) + col-hdr(1) + underline(1) + list-bottom(1) + help(1) = 8
      const maxRows = Math.max(1, rows - 1 - 8);
      this.#sessions.slice(0, maxRows).forEach((session, i) => {
        const isSelected = i === this.#selectedIndex;
        const numStr = String(i + 1);

        const sel = isSelected ? color(FG.CYAN, '❯ ') : '  ';
        const num = padEnd(
          color(isSelected ? FG.CYAN : FG.BRIGHT_BLACK, numStr.padStart(NUM_W)),
          NUM_W,
        );
        const rc = str => color(statusColor(session.status), str);

        const proj = rc(padEnd(truncate(session.displayName, projW), projW));
        const subagents = this.#store.getSubagents(session.sessionId);
        const activeSubCount = subagents.filter(
          s => s.status === 'working',
        ).length;
        let stat;
        if (activeSubCount > 0) {
          const badge = color(FG.BRIGHT_BLACK, `[${activeSubCount}]`);
          const badgeW = 1 + String(activeSubCount).length + 2; // ' [N]'
          const label = truncate(statusLabel(session.status), STAT_W - badgeW);
          stat = padEnd(
            `${coloredStatus(session.status, label)} ${badge}`,
            STAT_W,
          );
        } else {
          stat = padEnd(formatStatus(session.status), STAT_W);
        }
        const msg = rc(padEnd(
          truncate(session.message || session.lastResponse || '', msgW),
          msgW,
        ));
        const time = rc(padEnd(session.sinceLabel || '', TIME_W));

        const rowLine = buildDataLine(sel, num, proj, stat, msg, time);
        lines.push(
          isSelected
            ? `${color(FG.WHITE, '│')} ${BOLD}${rowLine}${RESET} ${color(FG.WHITE, '│')}`
            : `${color(FG.WHITE, '│')} ${rowLine} ${color(FG.WHITE, '│')}`,
        );
      });
    }

    lines.push(color(FG.WHITE, `╰${'─'.repeat(cols - 2)}╯`));

    this.#renderHelpLine(lines, cols, [
      ['q', 'quit'],
      ['↑↓', 'navigate'],
      ['↵', 'detail'],
      ['r', 'refresh'],
      ['R', 'restart'],
    ]);
  }

  #renderDetail(lines, cols, rows) {
    const session = this.#sessions[this.#selectedIndex];
    if (!session) {
      this.#view = 'list';
      this.#renderList(lines, cols, rows);
      return;
    }

    const now = new Date();
    const inner = cols - 4;
    const isVSCode = process.env.TERM_PROGRAM === 'vscode';

    // ── Header box ────────────────────────────────────────────────────
    this.#renderHeader(lines, cols, now);

    // ── Session detail box ────────────────────────────────────────────
    lines.push(color(FG.WHITE, `╭${'─'.repeat(cols - 2)}╮`));
    lines.push(
      `${color(FG.WHITE, '│')}  ${BOLD}${color(FG.BRIGHT_WHITE, padEnd(session.displayName, inner - 1))}${RESET} ${color(FG.WHITE, '│')}`,
    );
    lines.push(
      `${color(FG.WHITE, '│')}  ${color(FG.BRIGHT_BLACK, padEnd(session.sessionId, inner - 1))} ${color(FG.WHITE, '│')}`,
    );
    lines.push(
      `${color(FG.WHITE, '│')}${' '.repeat(cols - 2)}${color(FG.WHITE, '│')}`,
    );

    const row = (label, value) =>
      `${color(FG.WHITE, '│')}  ${padEnd(color(FG.BRIGHT_BLACK, label), LABEL_W)}${padEnd(value, inner - 10)} ${color(FG.WHITE, '│')}`;

    const cwdValue =
      isVSCode && session.cwd
        ? hyperlink(
            `vscode://file/${session.cwd}`,
            truncate(session.cwd, inner - 10),
          )
        : color(FG.BRIGHT_WHITE, truncate(session.cwd || '-', inner - 10));
    lines.push(row('cwd', cwdValue));
    lines.push(row('status', formatStatus(session.status)));
    lines.push(row('updated', color(FG.BRIGHT_WHITE, session.sinceLabel)));
    lines.push(
      row(
        'started',
        color(
          FG.BRIGHT_WHITE,
          session.startedAt instanceof Date
            ? session.startedAt.toLocaleString()
            : session.startedAt || '-',
        ),
      ),
    );
    lines.push(
      `${color(FG.WHITE, '│')}${' '.repeat(cols - 2)}${color(FG.WHITE, '│')}`,
    );

    if (session.message) {
      lines.push(
        row(
          'message',
          color(FG.BRIGHT_WHITE, truncate(session.message, inner - 10)),
        ),
      );
    }

    if (session.lastResponse) {
      lines.push(
        `${color(FG.WHITE, '│')}  ${color(FG.BRIGHT_BLACK, padEnd('last response', inner - 1))} ${color(FG.WHITE, '│')}`,
      );
      wrapText(session.lastResponse, inner - 3).forEach(l => {
        lines.push(color(FG.WHITE, `│   ${padEnd(l, inner - 2)} │`));
      });
    }

    const subagents = this.#store
      .getSubagents(session.sessionId)
      .filter(s => s.status === 'working');
    if (subagents.length > 0) {
      lines.push(
        `${color(FG.WHITE, '│')}${' '.repeat(cols - 2)}${color(FG.WHITE, '│')}`,
      );
      lines.push(
        `${color(FG.WHITE, '│')}  ${color(FG.BRIGHT_BLACK, padEnd('subagents', inner - 1))} ${color(FG.WHITE, '│')}`,
      );
      for (const sub of subagents) {
        const subStatus = padEnd(color(FG.YELLOW, sub.status), STAT_W);
        const subDescW = inner - STAT_W - 11;
        const subDesc = truncate(sub.agentType || sub.agentId, subDescW);
        const subTime = color(
          FG.BRIGHT_BLACK,
          sub.startedAt ? sub.startedAt.slice(11, 16) : '',
        );
        lines.push(
          `${color(FG.WHITE, '│')}   ${subStatus}  ${padEnd(subDesc, subDescW)}  ${subTime} ${color(FG.WHITE, '│')}`,
        );
      }
    }

    lines.push(color(FG.BRIGHT_WHITE, `╰${'─'.repeat(cols - 2)}╯`));

    this.#renderHelpLine(lines, cols, [
      ['esc/↵', 'back'],
      ['q', 'quit'],
    ]);
  }

  #flush(lines, rows) {
    const limit = rows - 1;
    let output = '';

    for (let i = 0; i < limit; i++) {
      const newLine = i < lines.length ? lines[i] : '';
      if (newLine !== (this.#prevLines[i] ?? '')) {
        // \x1b[R;CH — move cursor to row R (1-indexed), col 1, then write + clear to EOL
        output += `\x1b[${i + 1};1H${newLine}${CLEAR_LINE}`;
        this.#prevLines[i] = newLine;
      }
    }
    this.#prevLines.length = limit;

    if (output) process.stdout.write(output);
  }
}

/** Build a data row with consistent column spacing (no vertical separators). */
function buildDataLine(sel, num, proj, stat, msg, time) {
  return `${sel}${num}  ${proj}  ${stat}  ${msg}  ${time}`;
}

/** Word-wrap text to fit within maxWidth visible columns, preserving newlines. */
function wrapText(text, maxWidth) {
  if (!text) return [];
  const result = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph) {
      result.push('');
      continue;
    }
    let current = '';
    let currentWidth = 0;
    for (const word of paragraph.split(' ')) {
      const wordWidth = visibleLength(word);
      const needed = currentWidth + (current ? 1 : 0) + wordWidth;
      if (current && needed > maxWidth) {
        result.push(current);
        current = word;
        currentWidth = wordWidth;
      } else {
        current = current ? `${current} ${word}` : word;
        currentWidth = needed;
      }
    }
    if (current) result.push(current);
  }
  return result;
}
