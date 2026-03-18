import { execFile } from 'node:child_process';
import { readConfig, writeConfig } from '../core/config.mjs';

const EVENTS = ['noti', 'stop'];
const SOUNDS = [
  'Basso', 'Blow', 'Bottle', 'Frog', 'Funk',
  'Glass', 'Hero', 'Morse', 'Ping', 'Pop',
  'Purr', 'Sosumi', 'Submarine', 'Tink',
];

const [event, soundName] = process.argv.slice(3);
const config = readConfig();

if (!event) {
  console.log('Sound settings:');
  console.log(`  noti : ${config.sounds.noti}  (Notification / permission request)`);
  console.log(`  stop : ${config.sounds.stop}  (Claude finished responding)`);
  console.log('');
  console.log('Available sounds:');
  console.log(`  ${SOUNDS.join(', ')}`);
  console.log('');
  console.log('Usage:');
  console.log('  ccw /sound <event> <sound>');
  console.log('  ccw /sound noti Funk');
  console.log('  ccw /sound stop Blow');
  process.exit(0);
}

if (!EVENTS.includes(event)) {
  console.error(`Unknown event: "${event}". Use one of: ${EVENTS.join(', ')}`);
  process.exit(1);
}

if (!soundName) {
  console.error(`Please specify a sound name.`);
  console.log(`Available sounds: ${SOUNDS.join(', ')}`);
  process.exit(1);
}

if (!SOUNDS.includes(soundName)) {
  console.error(`Unknown sound: "${soundName}"`);
  console.log(`Available sounds: ${SOUNDS.join(', ')}`);
  process.exit(1);
}

config.sounds[event] = soundName;
writeConfig(config);
console.log(`✓ Set ${event} sound to: ${soundName}`);

if (process.platform === 'darwin') {
  execFile('afplay', [`/System/Library/Sounds/${soundName}.aiff`], { timeout: 3000 }, () => {});
}
