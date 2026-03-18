import { spawn } from 'node:child_process';
import { SessionStore } from '../core/store.mjs';
import { Renderer } from '../ui/renderer.mjs';
import { Keyboard } from '../input/keyboard.mjs';

if (!process.stdin.isTTY) {
  console.error('Error: ccw requires an interactive terminal (TTY).');
  console.error('Run this in a VS Code terminal tab or similar TTY environment.');
  process.exit(1);
}

// Suppress EIO errors emitted on stdin during shutdown (expected when the TTY
// handle is destroyed or the terminal tears down while reads are still pending).
process.stdin.on('error', () => {});

const store = new SessionStore();
const keyboard = new Keyboard();
const renderer = new Renderer(store, keyboard);

// Guard flag prevents duplicate cleanup from concurrent signal paths
let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  renderer.stop();
  keyboard.stop();
  store.stop();
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

keyboard.on('quit', () => { cleanup(); process.exit(0); });
keyboard.on('respawn', () => {
  if (cleanedUp) return;
  cleanedUp = true;
  renderer.stop();
  store.stop();
  // Restore raw mode but keep stdin open so the child can inherit it.
  // unref() lets the event loop drain naturally instead of calling exit(),
  // which avoids the EIO error the child would get if the parent closed fd 0 first.
  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode(false); } catch { /* ignore */ }
  }
  process.stdin.removeAllListeners('data');
  process.stdin.unref();
  spawn(process.argv[0], process.argv.slice(1), { stdio: 'inherit' });
});

store.on('error', (err) => {
  cleanup();
  console.error('Store error:', err.message);
  process.exit(1);
});

keyboard.start();
store.start();
renderer.start();
