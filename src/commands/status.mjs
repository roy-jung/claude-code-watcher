import { SessionStore } from '../core/store.mjs';
import { BOLD, color, FG, RESET, visibleLength } from '../ui/ansi.mjs';
import { formatStatus, truncate } from '../ui/format.mjs';

const store = new SessionStore();
store.start();
store.stop();

const sessions = store.getSessions();

if (sessions.length === 0) {
  console.log('No active Claude sessions.');
  console.log(
    `\nRun "ccw setup" to install hooks, then start a Claude Code session.`,
  );
  process.exit(0);
}

const colW = { project: 24, status: 12, message: 40, since: 6 };

// Header
console.log('');
console.log(
  `    ${BOLD}${color(FG.BRIGHT_WHITE, '#')} ` +
    `${'Project'.padEnd(colW.project)} ` +
    `${'Status'.padEnd(colW.status)} ` +
    `${'Last Message'.padEnd(colW.message)} ` +
    `${'Since'.padEnd(colW.since)}${RESET}`,
);
console.log(
  '─'.repeat(
    4 + 1 + colW.project + 1 + colW.status + 1 + colW.message + 1 + colW.since,
  ),
);

sessions.forEach((session, i) => {
  const num = String(i + 1).padEnd(4);
  const project = truncate(session.displayName, colW.project).padEnd(
    colW.project,
  );
  const msg = truncate(
    session.message || session.lastResponse || '',
    colW.message,
  ).padEnd(colW.message);
  const since = (session.sinceLabel || '').padEnd(colW.since);

  const statusColored = formatStatus(session.status);
  const statusPadded =
    statusColored +
    ' '.repeat(Math.max(0, colW.status - visibleLength(session.status)));

  console.log(`${num} ${project} ${statusPadded} ${msg} ${since}`);
});

console.log('');
console.log(`Total: ${sessions.length} session(s)`);
