import { homedir } from 'node:os';
import { join } from 'node:path';

export const HOME_DIR = homedir();
export const CLAUDE_DIR = join(HOME_DIR, '.claude');
export const DASHBOARD_DIR = join(CLAUDE_DIR, 'dashboard');
export const ACTIVE_DIR = join(DASHBOARD_DIR, 'active');
export const HOOKS_DIR = join(CLAUDE_DIR, 'hooks');
export const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');
export const HOOK_SCRIPT_NAME = 'session-tracker.sh';
export const HOOK_SCRIPT_PATH = join(HOOKS_DIR, HOOK_SCRIPT_NAME);
export const CONFIG_FILE = join(DASHBOARD_DIR, 'config.json');
