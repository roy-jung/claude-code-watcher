import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { join } from 'node:path';
import { ACTIVE_DIR } from './paths.mjs';
import { deriveSession, parseSession } from './session.mjs';

const POLL_INTERVAL_MS = 2000;

export class SessionStore extends EventEmitter {
  #sessions = new Map(); // sessionId -> SessionRecord
  #watcher = null;
  #pollTimer = null;
  // Per-file debounce timers: filename -> TimeoutId
  #pendingTimers = new Map();

  start() {
    fs.mkdirSync(ACTIVE_DIR, { recursive: true });
    this.#loadAll();
    this.#startWatching();
  }

  stop() {
    if (this.#watcher) {
      this.#watcher.close();
      this.#watcher = null;
    }
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = null;
    }
    for (const timer of this.#pendingTimers.values()) {
      clearTimeout(timer);
    }
    this.#pendingTimers.clear();
  }

  getSessions() {
    const now = new Date();
    return Array.from(this.#sessions.values())
      .map(s => deriveSession(s, now))
      .sort((a, b) => (a.tty || '').localeCompare(b.tty || ''));
  }

  getSubagents(parentId) {
    return this.#sessions.get(parentId)?.subagents ?? [];
  }

  reload() {
    this.#loadAll();
    this.emit('update', this.getSessions());
  }

  #loadAll() {
    let files;
    try {
      files = fs.readdirSync(ACTIVE_DIR);
    } catch {
      return;
    }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      this.#loadFile(join(ACTIVE_DIR, file), file);
    }
  }

  #loadFile(filePath, filename) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const raw = JSON.parse(content);
      const record = parseSession(raw, filename);
      if (!record) return;

      // Auto-delete session files left by force-killed Claude Code.
      // process.kill(pid, 0) checks existence without sending a signal.
      if (raw.ppid) {
        try {
          process.kill(raw.ppid, 0);
        } catch (err) {
          if (err.code === 'ESRCH') {
            // Process no longer exists — orphaned file, clean up.
            try { fs.unlinkSync(filePath); } catch { /* already gone */ }
            return;
          }
          // EPERM means process exists but we lack permission — still alive.
        }
      }

      this.#sessions.set(record.sessionId, record);
    } catch {
      // Skip files with parse errors; will retry on next event
    }
  }

  #startWatching() {
    try {
      this.#watcher = fs.watch(
        ACTIVE_DIR,
        { persistent: false },
        (_, filename) => {
          if (!filename || !filename.endsWith('.json')) return;

          // Debounce per file: cancel previous timer for this file and reset
          const existing = this.#pendingTimers.get(filename);
          if (existing) clearTimeout(existing);

          const timer = setTimeout(() => {
            this.#pendingTimers.delete(filename);
            const filePath = join(ACTIVE_DIR, filename);
            const sessionId = filename.replace(/\.json$/, '');

            try {
              if (!fs.existsSync(filePath)) {
                this.#sessions.delete(sessionId);
              } else {
                this.#loadFile(filePath, filename);
              }
              this.emit('update', this.getSessions());
            } catch (err) {
              this.emit('error', err);
            }
          }, 50);

          this.#pendingTimers.set(filename, timer);
        },
      );

      this.#watcher.on('error', err => {
        // Close properly before falling back to polling
        try {
          this.#watcher.close();
        } catch {
          /* ignore */
        }
        this.#watcher = null;
        this.#startPolling();
      });
    } catch {
      this.#startPolling();
    }
  }

  #startPolling() {
    this.#pollTimer = setInterval(() => {
      try {
        this.#loadAll();
        this.emit('update', this.getSessions());
      } catch (err) {
        this.emit('error', err);
      }
    }, POLL_INTERVAL_MS);
  }
}
