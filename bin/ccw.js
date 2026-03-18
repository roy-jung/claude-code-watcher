#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const command = args[0] || 'start';

const commands = {
  start: () => import(join(__dirname, '../src/commands/start.mjs')),
  setup: () => import(join(__dirname, '../src/commands/setup.mjs')),
  status: () => import(join(__dirname, '../src/commands/status.mjs')),
  sessions: () => import(join(__dirname, '../src/commands/sessions.mjs')),
  help: () => import(join(__dirname, '../src/commands/help.mjs')),
  '--help': () => import(join(__dirname, '../src/commands/help.mjs')),
  '-h': () => import(join(__dirname, '../src/commands/help.mjs')),
  '/sound': () => import(join(__dirname, '../src/commands/sound.mjs')),
};

if (!commands[command]) {
  console.error(`Unknown command: ${command}`);
  console.error('Run "ccw help" for usage.');
  process.exit(1);
}

commands[command]().catch(err => {
  console.error(err.message);
  process.exit(1);
});
