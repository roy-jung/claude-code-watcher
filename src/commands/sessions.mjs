import { SessionStore } from '../core/store.mjs';

const store = new SessionStore();
store.start();
store.stop();

const sessions = store.getSessions();
console.log(JSON.stringify(sessions, null, 2));
