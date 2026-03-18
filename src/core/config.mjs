import fs from 'node:fs';
import { CONFIG_FILE } from './paths.mjs';

const DEFAULTS = {
  sounds: {
    noti: 'Funk',
    stop: 'Blow',
  },
};

export function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      ...DEFAULTS,
      ...parsed,
      sounds: { ...DEFAULTS.sounds, ...parsed.sounds },
    };
  } catch {
    return { ...DEFAULTS, sounds: { ...DEFAULTS.sounds } };
  }
}

export function writeConfig(config) {
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}
