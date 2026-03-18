import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTIVE_DIR,
  HOOK_SCRIPT_PATH,
  HOOKS_DIR,
  SETTINGS_FILE,
} from '../core/paths.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_HOOK = join(__dirname, '../../hooks/session-tracker.sh');
const SOURCE_MJS  = join(__dirname, '../../hooks/session-tracker.mjs');

const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'Notification',
  'SessionEnd',
  'SubagentStart',
  'SubagentStop',
];

// Tool events require ".*" matcher to fire for all tool names.
// Other lifecycle events ignore the matcher field.
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse']);

function ensureHook(settings, eventName, command) {
  settings.hooks ??= {};
  settings.hooks[eventName] ??= [];

  // Prevent duplicate registration
  const alreadyExists = settings.hooks[eventName].some(entry =>
    (entry.hooks || []).some(h => h.command === command),
  );
  if (alreadyExists) return false;

  const matcher = TOOL_EVENTS.has(eventName) ? '.*' : '';
  const existing = settings.hooks[eventName].find(e => e.matcher === matcher);
  if (existing) {
    existing.hooks.push({ type: 'command', command });
  } else {
    settings.hooks[eventName].push({
      matcher,
      hooks: [{ type: 'command', command }],
    });
  }
  return true;
}

// Create required directories
fs.mkdirSync(HOOKS_DIR, { recursive: true });
fs.mkdirSync(ACTIVE_DIR, { recursive: true });
console.log(`✓ Created directories:`);
console.log(`  ${HOOKS_DIR}`);
console.log(`  ${ACTIVE_DIR}`);

// Copy hook scripts (.sh wrapper + .mjs implementation)
for (const src of [SOURCE_HOOK, SOURCE_MJS]) {
  if (!fs.existsSync(src)) {
    console.error(`✗ Hook script not found at: ${src}`);
    process.exit(1);
  }
}

const MJS_PATH = join(HOOKS_DIR, 'session-tracker.mjs');
fs.copyFileSync(SOURCE_HOOK, HOOK_SCRIPT_PATH);
fs.chmodSync(HOOK_SCRIPT_PATH, 0o755);
fs.copyFileSync(SOURCE_MJS, MJS_PATH);
console.log(`✓ Installed hook script: ${HOOK_SCRIPT_PATH}`);

// Read existing settings.json
let settings = {};

if (fs.existsSync(SETTINGS_FILE)) {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    settings = JSON.parse(raw);
  } catch (err) {
    console.error(`✗ Failed to parse ${SETTINGS_FILE}: ${err.message}`);
    console.error('  Please fix the JSON syntax and run setup again.');
    process.exit(1);
  }

  // Backup before modifying
  const backupPath = `${SETTINGS_FILE}.bak.${Date.now()}`;
  fs.copyFileSync(SETTINGS_FILE, backupPath);
  console.log(`✓ Backed up settings to: ${backupPath}`);
}

// Register hooks
const command = HOOK_SCRIPT_PATH;
let registeredCount = 0;

for (const event of HOOK_EVENTS) {
  const added = ensureHook(settings, event, command);
  if (added) {
    registeredCount++;
    console.log(`  + Registered hook: ${event}`);
  } else {
    console.log(`  ~ Already registered: ${event}`);
  }
}

// Write updated settings
fs.writeFileSync(
  SETTINGS_FILE,
  `${JSON.stringify(settings, null, 2)}\n`,
  'utf8',
);
console.log(`✓ Updated: ${SETTINGS_FILE}`);

console.log('');
if (registeredCount > 0) {
  console.log(`✓ Setup complete! Registered ${registeredCount} new hook(s).`);
} else {
  console.log('✓ Setup complete! All hooks were already registered.');
}
console.log('');
console.log('Next steps:');
console.log('  1. Start a Claude Code session in your project directory');
console.log('  2. In another terminal tab, run: ccw start');
