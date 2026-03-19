/**
 * Parse raw JSON data into a SessionRecord.
 * Returns null if the data is invalid.
 * @param {unknown} raw
 * @param {string} filename
 * @returns {SessionRecord|null}
 */
export function parseSession(raw, filename) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const sessionId = raw.session || filename.replace(/\.json$/, '');
  if (!sessionId) return null;

  return {
    sessionId,
    project: raw.project || 'unknown',
    cwd: raw.cwd || '',
    status: raw.status || 'waiting',
    message: raw.message || '',
    lastResponse: raw.lastResponse || '',
    sessionName: raw.sessionName || '',
    transcript: raw.transcript || '',
    alertAt: raw.alertAt || '',
    alertEvent: raw.alertEvent || '',
    updated: raw.updated || '',
    startedAt: raw.startedAt || '',
    tty: raw.tty || '',
    subagents: Array.isArray(raw.subagents) ? raw.subagents : [],
  };
}

/**
 * Add derived display fields to a SessionRecord.
 * @param {SessionRecord} record
 * @param {Date} now
 * @returns {DerivedSession}
 */
export function deriveSession(record, now = new Date()) {
  const updatedAt = parseDate(record.updated) || now;
  const startedAt = parseDate(record.startedAt) || now;
  const status = classifyStatus(record.status);

  return {
    ...record,
    updatedAt,
    startedAt,
    status,
    sinceLabel: formatClock(updatedAt),
    displayName: buildDisplayName(record),
  };
}

/**
 * Classify session status.
 * @param {string} status
 * @returns {string}
 */
export function classifyStatus(status) {
  return status || 'waiting';
}

/**
 * Parse a date string in the format "YYYY-MM-DD HH:MM:SS" or ISO 8601.
 * @param {string} str
 * @returns {Date|null}
 */
function parseDate(str) {
  if (!str) return null;
  // Handle "YYYY-MM-DD HH:MM:SS" format
  const normalized = str.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Build a human-readable display name, appending the TTY short name
 * so multiple sessions in the same project can be told apart.
 * e.g. "/dev/ttys003" → "my-project · s003"
 */
function buildDisplayName(record) {
  const base = record.sessionName || record.project || record.sessionId;
  if (!record.tty) return base;
  // "/dev/ttys003" → "s003",  "/dev/pts/3" → "pts/3"
  const short = record.tty.replace(/^\/dev\/(tty)?/, '');
  return `[${short}] ${base}`;
}

/**
 * Format a Date to HH:MM string (last-updated clock time).
 * @param {Date} date
 * @returns {string}
 */
function formatClock(date) {
  if (!(date instanceof Date)) return '--:--';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
