import { EventEmitter } from 'node:events';

export class Keyboard extends EventEmitter {
  #wasRaw = false;
  // Incomplete escape sequence buffered from a previous chunk
  #escBuf = '';
  #escTimer = null;
  // How long to wait for the rest of an escape sequence before treating \x1b as bare ESC
  static #ESC_TIMEOUT_MS = 30;

  start() {
    if (!process.stdin.isTTY) {
      return;
    }

    this.#wasRaw = process.stdin.isRaw || false;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', chunk => this.#handleChunk(chunk));
  }

  stop() {
    if (this.#escTimer !== null) {
      clearTimeout(this.#escTimer);
      this.#escTimer = null;
    }
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(this.#wasRaw);
      } catch {
        // ignore
      }
    }
    // destroy() fully closes the handle so the event loop drains cleanly.
    // pause() only stops reading but keeps the handle ref'd, causing EIO on exit.
    process.stdin.destroy();
  }

  #handleChunk(chunk) {
    // Combine with any buffered incomplete escape sequence from the previous chunk
    if (this.#escBuf) {
      chunk = this.#escBuf + chunk;
      this.#escBuf = '';
      clearTimeout(this.#escTimer);
      this.#escTimer = null;
    }

    // If the chunk ends with a potentially incomplete escape sequence (\x1b or \x1b[),
    // buffer the tail and wait for the next chunk to complete it.
    const tail = chunk.endsWith('\x1b[') ? 2
               : chunk.endsWith('\x1b')  ? 1
               : 0;

    if (tail > 0) {
      const before = chunk.slice(0, -tail);
      if (before) {
        for (const key of parseKeys(before)) this.emit('key', key);
      }
      this.#escBuf = chunk.slice(-tail);
      // After timeout, the user just pressed ESC alone — flush it
      this.#escTimer = setTimeout(() => {
        this.#escTimer = null;
        const buf = this.#escBuf;
        this.#escBuf = '';
        if (buf === '\x1b') {
          this.emit('key', { name: 'escape', ctrl: false, meta: false });
        }
        // '\x1b[' with no final byte: discard (unknown sequence)
      }, Keyboard.#ESC_TIMEOUT_MS);
      return;
    }

    for (const key of parseKeys(chunk)) {
      this.emit('key', key);
    }
  }
}

/**
 * Parse a raw terminal input chunk into zero or more key descriptors.
 * A single chunk can contain multiple sequences when keys are pressed rapidly.
 * @param {string} chunk
 * @returns {Array<{ name: string, ctrl: boolean, meta: boolean }>}
 */
function parseKeys(chunk) {
  const keys = [];
  let i = 0;
  while (i < chunk.length) {
    const ch = chunk[i];

    if (ch === '\x03') { // Ctrl+C
      keys.push({ name: 'c', ctrl: true, meta: false });
      i += 1;
    } else if (ch === '\r' || ch === '\n') {
      keys.push({ name: 'return', ctrl: false, meta: false });
      i += 1;
    } else if (ch === '\x1b') {
      if (chunk[i + 1] === '[') {
        if (chunk[i + 2] === 'A') {
          keys.push({ name: 'up',   ctrl: false, meta: false });
          i += 3;
        } else if (chunk[i + 2] === 'B') {
          keys.push({ name: 'down', ctrl: false, meta: false });
          i += 3;
        } else {
          // Unknown CSI sequence — skip ESC and let next iteration handle '['
          keys.push({ name: 'escape', ctrl: false, meta: false });
          i += 1;
        }
      } else {
        // Bare ESC (or ESC not followed by '[')
        keys.push({ name: 'escape', ctrl: false, meta: false });
        i += 1;
      }
    } else if (ch >= ' ') {
      // Regular printable character (preserve case so callers can distinguish r vs R)
      keys.push({ name: ch, ctrl: false, meta: false });
      i += 1;
    } else {
      i += 1; // skip unknown control character
    }
  }
  return keys;
}
