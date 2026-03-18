#!/usr/bin/env node
// session-tracker 훅 상태 전환 테스트

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(__dirname, 'session-tracker.mjs');
const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-test-'));

process.on('exit', () => { try { fs.rmSync(TEST_DIR, { recursive: true }); } catch {} });

let PASS = 0;
let FAIL = 0;

// ── 헬퍼 ──────────────────────────────────────────────────────────────

function fireEvent(sid, event, extras = {}) {
  const payload = JSON.stringify({
    session_id: sid,
    hook_event_name: event,
    cwd: '/test/proj',
    transcript_path: '',
    ...extras,
  });
  spawnSync('node', [HOOK], {
    input: payload,
    env: { ...process.env, ACTIVE_DIR: TEST_DIR },
    encoding: 'utf8',
  });
}

function sessionFile(sid) {
  return path.join(TEST_DIR, `${sid}.json`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function field(file, key) {
  const v = readJson(file)[key];
  return v == null ? '' : String(v);
}

function subfield(file, idx, key) {
  const subs = readJson(file).subagents ?? [];
  const v = idx < subs.length ? subs[idx][key] : undefined;
  return v == null ? '' : String(v);
}

function subsCount(file) {
  return (readJson(file).subagents ?? []).length;
}

function patchJson(file, patch) {
  const data = readJson(file);
  Object.assign(data, patch);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// ── assert 헬퍼 ───────────────────────────────────────────────────────

function assertEq(desc, expected, actual) {
  if (expected === actual) {
    console.log(`  ✓ ${desc}`);
    PASS++;
  } else {
    console.log(`  ✗ ${desc}`);
    console.log(`      expected: ${expected}`);
    console.log(`      actual:   ${actual}`);
    FAIL++;
  }
}

function assertField(desc, expected, file, key) {
  assertEq(desc, expected, field(file, key));
}

function assertSubfield(desc, expected, file, idx, key) {
  assertEq(desc, expected, subfield(file, idx, key));
}

function assertEmpty(desc, file, key) {
  assertField(desc, '', file, key);
}

function assertNonempty(desc, file, key) {
  const val = field(file, key);
  if (val) {
    console.log(`  ✓ ${desc} (${val})`);
    PASS++;
  } else {
    console.log(`  ✗ ${desc} (비어있음)`);
    FAIL++;
  }
}

function assertExists(desc, file) {
  if (fs.existsSync(file)) {
    console.log(`  ✓ ${desc}`);
    PASS++;
  } else {
    console.log(`  ✗ ${desc} (file not found: ${file})`);
    FAIL++;
  }
}

function assertNotExists(desc, file) {
  if (!fs.existsSync(file)) {
    console.log(`  ✓ ${desc}`);
    PASS++;
  } else {
    console.log(`  ✗ ${desc} (file still exists: ${file})`);
    FAIL++;
  }
}

// ── 테스트 케이스 ─────────────────────────────────────────────────────

console.log('\n▶ 1. SessionStart → waiting');
{
  const sid = 's1'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  assertExists ('파일 생성됨',              sf);
  assertField  ('status=waiting',           'waiting',         sf, 'status');
  assertField  ('message=Session started',  'Session started', sf, 'message');
  assertEmpty  ('alertAt 비어있음',          sf, 'alertAt');
}

console.log('\n▶ 2. UserPromptSubmit → working');
{
  const sid = 's2'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '파일 목록 보여줘' });
  assertField  ('status=working',           'working',         sf, 'status');
  assertField  ('message=프롬프트 저장됨',  '파일 목록 보여줘', sf, 'message');
  assertEmpty  ('alertAt 비어있음',          sf, 'alertAt');
}

console.log('\n▶ 3. Stop → waiting + alertAt 설정');
{
  const sid = 's3'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '안녕' });
  fireEvent(sid, 'Stop', { last_assistant_message: '안녕하세요!' });
  assertField  ('status=waiting',               'waiting',     sf, 'status');
  assertField  ('alertEvent=Stop',              'Stop',        sf, 'alertEvent');
  assertField  ('lastResponse 저장됨',          '안녕하세요!', sf, 'lastResponse');
  assertField  ('message=Claude 응답으로 설정', '안녕하세요!', sf, 'message');
  assertNonempty('alertAt 설정됨',               sf, 'alertAt');
}

console.log('\n▶ 4. Notification (working 중) → notification + alertAt 설정');
{
  const sid = 's4'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '파일 삭제해줘' });
  fireEvent(sid, 'Notification', { message: 'Claude needs your permission to use Bash' });
  assertField  ('status=notification',       'notification', sf, 'status');
  assertField  ('alertEvent=Notification',   'Notification', sf, 'alertEvent');
}

console.log('\n▶ 5. Notification (waiting 중) → waiting 유지 (백그라운드 핑)');
{
  const sid = 's5'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'Stop', { last_assistant_message: '완료' });
  fireEvent(sid, 'Notification', { message: 'background ping' });
  assertField  ('status=waiting 유지',       'waiting',      sf, 'status');
  assertField  ('alertEvent=Notification',   'Notification', sf, 'alertEvent');
  assertField  ('message 덮어쓰지 않음',     '완료',         sf, 'message');
}

console.log('\n▶ 6. SubagentStart/Stop → working 유지 (alertAt 변화 없음)');
{
  const sid = 's6'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '분석해줘' });
  fireEvent(sid, 'SubagentStart');
  assertField  ('SubagentStart → working',     'working', sf, 'status');
  fireEvent(sid, 'SubagentStop');
  assertField  ('SubagentStop → working 유지', 'working', sf, 'status');
  assertEmpty  ('alertAt 비어있음 (알람 없음)', sf, 'alertAt');
}

console.log('\n▶ 7. notification → UserPromptSubmit → working');
{
  const sid = 's7'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '뭔가 해줘' });
  fireEvent(sid, 'Notification', { message: '권한 요청' });
  fireEvent(sid, 'UserPromptSubmit', { prompt: '허락함' });
  assertField  ('status=working', 'working', sf, 'status');
}

console.log('\n▶ 7b. notification → PreToolUse (권한 승인) → working');
{
  const sid = 's7b'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '파일 삭제해줘' });
  fireEvent(sid, 'Notification', { message: 'Bash 실행 권한 요청' });
  assertField  ('Notification → notification', 'notification', sf, 'status');
  fireEvent(sid, 'PreToolUse');
  assertField  ('PreToolUse → working 복원',   'working',      sf, 'status');
}

console.log('\n▶ 7c. notification → PostToolUse (실제 실행 순서) → working');
{
  const sid = 's7c'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '파일 삭제해줘' });
  fireEvent(sid, 'PreToolUse');
  fireEvent(sid, 'Notification', { message: 'Bash 실행 권한 요청' });
  assertField  ('Notification → notification', 'notification', sf, 'status');
  fireEvent(sid, 'PostToolUse');
  assertField  ('PostToolUse → working 복원',  'working',      sf, 'status');
}

console.log('\n▶ 8. SessionEnd → 파일 삭제');
{
  const sid = 's8'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  assertExists    ('SessionStart 후 파일 존재', sf);
  fireEvent(sid, 'SessionEnd');
  assertNotExists ('SessionEnd 후 파일 삭제됨', sf);
}

console.log('\n▶ 9. session_id 없음 → 아무것도 안 함');
{
  const countBefore = fs.readdirSync(TEST_DIR).length;
  spawnSync('node', [HOOK], {
    input: JSON.stringify({ hook_event_name: 'Stop', cwd: '/test/proj' }),
    env: { ...process.env, ACTIVE_DIR: TEST_DIR },
    encoding: 'utf8',
  });
  const countAfter = fs.readdirSync(TEST_DIR).length;
  assertEq('파일 수 변화 없음', String(countBefore), String(countAfter));
}

console.log('\n▶ 10. startedAt 보존 (재기동 시)');
{
  const sid = 's10'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  const started = field(sf, 'startedAt');
  fireEvent(sid, 'Stop', { last_assistant_message: '완료' });
  assertField('startedAt 유지됨', started, sf, 'startedAt');
}

console.log('\n▶ 11. Stop 후 UserPromptSubmit → alertAt 미변경 (spurious alert 방지)');
{
  const sid = 's11'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '첫 번째 요청' });
  fireEvent(sid, 'Stop', { last_assistant_message: '완료' });
  const alertAtAfterStop = field(sf, 'alertAt');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '두 번째 요청' });
  assertField('status=working',                    'working',          sf, 'status');
  assertField('alertAt 변경 없음 (Stop 시점 유지)', alertAtAfterStop,  sf, 'alertAt');
}

console.log('\n▶ 12. Notification (notification 상태) → waiting 유지 (이중 권한 요청 시나리오)');
{
  const sid = 's12'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '파일 삭제해줘' });
  fireEvent(sid, 'Notification', { message: '첫 번째 권한 요청' });
  assertField('첫 Notification → notification', 'notification', sf, 'status');
  fireEvent(sid, 'Stop', { last_assistant_message: '삭제 완료' });
  fireEvent(sid, 'Notification', { message: '백그라운드 완료 알림' });
  assertField('Stop 후 Notification → waiting', 'waiting',      sf, 'status');
  assertField('alertEvent=Notification',         'Notification', sf, 'alertEvent');
}

console.log('\n▶ 13. SubagentStart/Stop → 실행 중 배열에 추가, 종료 시 제거');
{
  const sid = 's13'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '분석해줘' });
  fireEvent(sid, 'SubagentStart', { agent_id: 'agent-001', agent_type: 'general-purpose' });
  assertSubfield('SubagentStart → status=working', 'working',         sf, 0, 'status');
  assertSubfield('agentType 기록됨',               'general-purpose', sf, 0, 'agentType');
  fireEvent(sid, 'SubagentStop', { agent_id: 'agent-001' });
  assertEq      ('SubagentStop → 목록에서 제거됨', '0', String(subsCount(sf)));
}

console.log('\n▶ 14. subagents 보존 (이벤트 반복 시 기존 목록 유지)');
{
  const sid = 's14'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  patchJson(sf, { subagents: ['fake-child-1', 'fake-child-2'] });
  fireEvent(sid, 'Stop', { last_assistant_message: '완료' });
  assertEq('Stop 후 subagents 보존됨', '2', String(subsCount(sf)));
}

console.log('\n▶ 15. cwd / transcript / project 보존 (cwd 없는 이벤트)');
{
  const sid = 's15'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  patchJson(sf, { cwd: '/my/real/myapp', transcript: '/tmp/transcript.jsonl' });
  // cwd 없는 이벤트 (SubagentStart payload에 cwd 없음)
  spawnSync('node', [HOOK], {
    input: JSON.stringify({ session_id: sid, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'general-purpose' }),
    env: { ...process.env, ACTIVE_DIR: TEST_DIR },
    encoding: 'utf8',
  });
  assertField('cwd 보존됨',        '/my/real/myapp',       sf, 'cwd');
  assertField('project 보존됨',    'myapp',                sf, 'project');
  assertField('transcript 보존됨', '/tmp/transcript.jsonl', sf, 'transcript');
}

console.log('\n▶ 16. 복수 subagent — 개별 종료 시 해당 항목만 제거');
{
  const sid = 's16'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '두 에이전트 실행' });
  fireEvent(sid, 'SubagentStart', { agent_id: 'a1', agent_type: 'Explore' });
  fireEvent(sid, 'SubagentStart', { agent_id: 'a2', agent_type: 'Plan' });
  assertEq('두 SubagentStart → 2개', '2', String(subsCount(sf)));
  fireEvent(sid, 'SubagentStop', { agent_id: 'a1' });
  assertEq('a1 종료 후 1개 남음',    '1', String(subsCount(sf)));
  assertEq('남은 항목은 a2(Plan)',   'Plan', subfield(sf, 0, 'agentType'));
  fireEvent(sid, 'SubagentStop', { agent_id: 'a2' });
  assertEq('a2 종료 후 0개',         '0', String(subsCount(sf)));
}

console.log('\n▶ 17. 중간 이벤트에도 subagents 보존');
{
  const sid = 's17'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '분석해줘' });
  fireEvent(sid, 'SubagentStart', { agent_id: 'b1', agent_type: 'Explore' });
  fireEvent(sid, 'Notification', { message: '권한 요청' });
  fireEvent(sid, 'PreToolUse');
  fireEvent(sid, 'Notification', { message: '다른 권한 요청' });
  assertEq('Notification/PreToolUse 후 subagents 보존', '1', String(subsCount(sf)));
  fireEvent(sid, 'SubagentStop', { agent_id: 'b1' });
  fireEvent(sid, 'Stop', { last_assistant_message: '완료' });
  assertEq   ('Stop 후 subagents 비어있음', '0', String(subsCount(sf)));
  assertField('최종 status=waiting', 'waiting', sf, 'status');
}

console.log('\n▶ 18. notification → working 전체 flow');
{
  const sid = 's18'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '파일 삭제해줘' });
  assertField ('UserPromptSubmit → working',      'working',      sf, 'status');
  fireEvent(sid, 'Notification', { message: 'Bash 실행 권한 요청' });
  assertField ('Notification → notification',     'notification', sf, 'status');
  fireEvent(sid, 'PreToolUse');
  assertField ('PreToolUse → working 복원',       'working',      sf, 'status');
  fireEvent(sid, 'Stop', { last_assistant_message: '삭제 완료' });
  assertField ('Stop → waiting',                  'waiting',      sf, 'status');
  assertField ('alertEvent=Stop',                 'Stop',         sf, 'alertEvent');
  assertNonempty('alertAt 설정됨',                 sf, 'alertAt');
}

console.log('\n▶ 19. subagent 실행 중 Stop → subagents 보존 (비정상 종료 대비)');
{
  const sid = 's19'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '분석해줘' });
  fireEvent(sid, 'SubagentStart', { agent_id: 'c1', agent_type: 'general-purpose' });
  fireEvent(sid, 'Stop', { last_assistant_message: '완료' });
  assertEq   ('Stop 후 미완료 subagent 보존', '1', String(subsCount(sf)));
  assertField('status=waiting', 'waiting', sf, 'status');
}

console.log('\n▶ 20. PostToolUse (waiting 중) → waiting 유지 (Stop 후 지연 이벤트 대비)');
{
  const sid = 's20'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '뭔가 해줘' });
  fireEvent(sid, 'Stop', { last_assistant_message: '완료' });
  assertField('Stop → waiting',              'waiting', sf, 'status');
  fireEvent(sid, 'PostToolUse');
  assertField('PostToolUse → waiting 유지',  'waiting', sf, 'status');
  fireEvent(sid, 'PreToolUse');
  assertField('PreToolUse → waiting 유지',   'waiting', sf, 'status');
}

console.log('\n▶ 21. notification → PostToolUse → working + alertAt 보존');
{
  const sid = 's21'; const sf = sessionFile(sid);
  fireEvent(sid, 'SessionStart');
  fireEvent(sid, 'UserPromptSubmit', { prompt: '파일 삭제해줘' });
  fireEvent(sid, 'Notification', { message: 'Bash 권한 요청' });
  const alertAt = field(sf, 'alertAt');
  assertNonempty('Notification → alertAt 설정됨', sf, 'alertAt');
  fireEvent(sid, 'PostToolUse');
  assertField   ('PostToolUse → working 복원',    'working', sf, 'status');
  assertField   ('alertAt 보존됨',                alertAt,   sf, 'alertAt');
}

// ── 결과 ──────────────────────────────────────────────────────────────

console.log('\n────────────────────────────────────');
const total = PASS + FAIL;
console.log(`결과: ${PASS}/${total} 통과`);
if (FAIL > 0) {
  console.log(`실패: ${FAIL}건`);
  process.exit(1);
} else {
  console.log('모두 통과!');
}
