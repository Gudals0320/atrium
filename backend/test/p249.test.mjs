// P249: 옛 rig(1·2) 걷어내기. 옛 꼴 정의는 한 줄 오류, 정의에서 빠진 역할의 세션은 턴을 마친 뒤 rig에서 떼고 재운다(닫지 않는다),
// 새 rig가 옮겨 받은 쓰기 범위·Codex 인자, 장부의 옛 종류 거절, 새 판 DB에 옛 rig 표가 없음, 옛 고리에 붙잡힌 전달은 다시 뜰 때 취소.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig, validateRig, oldRigReason } from '../src/rig.mjs';
import { roleSettingsAmp, codexUnattendedArgs } from '../src/rig-writes.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { deriveState, applyTermStatus } from '../src/state.mjs';
import { SHELL_IN_SHELL_DENY, rulePath } from '../src/rig-writes.mjs';
import { writeSessionSettings } from '../src/launch.mjs';
import { newRuntime, applyHook } from '../src/state.mjs';
import { Backend } from '../src/backend.mjs';
import { RIG_EVENT_KINDS, RIG3_EVENT_KINDS, rigEvent, parseKinds } from '../src/rig-ledger.mjs';
import { validateRig3, checkRoleDoc, normSector, loadText, codexRoleArgs, roleWrites, parseDuration } from '../src/rig3.mjs';
import { Rig3Roles, ROLE_SPAWN, ROLE_PERMISSION_MODE, ROLE_NESTED_SHELL_REASON } from '../src/rig3-roles.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p249-'));
const DOC = (name, o = {}) => [`# ${name}`, '', '## 맡은 것', o.owns || `${name}의 일`, '', '## 받는 것과 내는 것', '받는 것: 없음', '', '## 기준', '- 기준 하나', '', ...(o.noTips ? [] : ['## 요령', '- 요령 하나'])].join('\n');
const DEF = (o = {}) => ({
  version: 3, name: 'p241',
  purpose: '.atrium/purpose.md',
  beat: { every: '1d', at: '07:00', role: 'data' },
  roles: {
    data: { owns: ['data/', 'snapshots/'], tools: ['fetch'], launcher: 'claude', model: 'haiku' },
    ideas: { owns: ['hypotheses/'] },
    ...(o.roles || {}),
  },
  flows: [
    { item: 'snapshot', from: 'data', to: 'ideas' },
    { item: 'data-request', from: ['ideas', 'human'], to: 'data' },
    { item: 'hint', from: 'human', to: 'ideas' },
    ...(o.flows || []),
  ],
  tools: { fetch: { run: ['node', 'tools/fetch.mjs'], every: '1d' }, ...(o.tools || {}) },
  ...(o.extra || {}),
});
function folder(def = DEF(), { docs = true } = {}) {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.atrium', 'roles'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tools', 'fetch.mjs'), 'console.log(1)\n');
  fs.writeFileSync(path.join(dir, '.atrium', 'purpose.md'), '# 목적\n나스닥 연구 P241-PURPOSE\n');
  if (docs) for (const r of Object.keys(def.roles || {})) fs.writeFileSync(path.join(dir, '.atrium', 'roles', `${r}.md`), DOC(r, { owns: `${r}-OWNS-MARK` }));
  fs.writeFileSync(path.join(dir, '.atrium', 'rig.json'), JSON.stringify(def, null, 2));
  return dir;
}
const v3 = (def, root) => validateRig3(def, { root });

// ---------- 판(가짜 spawn·kill·sleeper, 진짜 Store·Rig·설정 파일) ----------
async function board(def = DEF(), cfg = {}) {
  const dir = folder(def);
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const casts = []; const logs = []; const sent = []; const spawned = []; const killed = [];
  const b = { cfg: { hookTimeoutSec: 2, sessionsDir: path.join(dir, 'sessions'), dataDir: path.join(dir, 'data'), rig3DeadGraceMs: 0, ...cfg }, store, sessions: new Map(), log: (...a) => logs.push(a.join(' ')), api: { broadcast: (n, d) => casts.push({ n, d }) } };
  b.rig = new Rig(b); b.rig3 = new Rig3Roles(b);
  b.queue = { enqueue: (sessionId, text, opts) => { sent.push({ sessionId, text, opts }); return { deliveryId: 'd' + sent.length }; } };
  let n = 0;
  // backend.spawn이 하는 것만 흉내: rig3.launchOf → 권한 모드·설정 파일, 세션에 역할
  b.spawn = async (p) => {
    const role = p[ROLE_SPAWN]; const kind = p.kind || 'claude';
    const L = b.rig3.launchOf(ws.key, role, { kind, cwd: p.cwd });
    const sessionId = `sid-${p.name}-${++n}`;
    const s = { sessionId, name: p.name, kind, cwd: p.cwd, workspaceKey: ws.key, hookToken: `tok-${n}`, permissionMode: L.permissionMode, model: p.model || null, rt: newRuntime({ kind, hooked: true }), rigRole: L.role };
    s.rt.cwd = p.cwd;
    s.settingsPath = writeSessionSettings({ file: path.join(dir, 'sessions', `${sessionId}.json`), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: s.hookToken, sessionId, amp: L.amp });
    b.sessions.set(sessionId, s);
    spawned.push({ p, L, s });
    return { sessionId, name: p.name };
  };
  b.kill = async (p) => { killed.push(p); const s = b.sessions.get(p.session); if (s) { s.closedAt = Date.now(); b.sessions.delete(p.session); } return { ok: true }; };
  const slept = [];
  b.sleeper = {
    isAsleep: (s) => !!s.rt.sleep,
    info: (s) => ({ name: s.name, kind: 'claude', hooked: true, convKnown: true, state: 'ready', sleeping: !!s.rt.sleep, waking: false, closing: false, draft: false, delivering: 0, loops: 0, bg: false, blocked: null, childBusy: false, parentBusy: false, viewed: false }),
    sleep: async (s, o) => { slept.push([s.name, o]); s.rt.sleep = { at: Date.now(), by: o.by, scope: o.scope }; return { slept: true }; },
  };
  const ledger = (kinds = null) => store.rigEvents({ ws: ws.key, limit: 1000, ...(kinds ? { kinds } : {}) });
  const roleSessions = () => [...b.sessions.values()].filter((s) => s.rigRole);
  const until = async (fn, ms = 2000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 10)); } };
  return { dir, store, ws, b, sent, spawned, killed, slept, logs, casts, ledger, roleSessions, until };
}
const settingsOf = (s) => JSON.parse(fs.readFileSync(s.settingsPath, 'utf8'));
const pre = (s, tool_name, tool_input) => ({ hook_event_name: 'PreToolUse', session_id: s.sessionId, tool_name, tool_input, tool_use_id: 'tu' + Math.random() });


test('P249 옛 꼴 정의를 둔 폴더: rig 상태가 한 줄 오류(invalid)이고 켜도 역할을 띄우지 않는다', async () => {
  const B = await board();
  fs.writeFileSync(path.join(B.dir, '.atrium', 'rig.json'), JSON.stringify({ version: 2, seats: { main: { launcher: 'claude', session: 'keep' } } }));
  const st = B.b.rig.status(B.ws.key);
  assert.equal(st.state, 'invalid'); assert.equal(st.invalid, oldRigReason(2)); assert.ok(!/\n/.test(st.invalid));
  B.b.rig.setEnabled(B.ws.key, true, 'human');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(B.spawned.length, 0);
  assert.equal(B.ledger(['rig_invalid']).length, 1);
});

test('P249 빠진 역할: 도는 턴은 마치게 두고, 쉬면 역할 표시를 떼고 재운다. 닫지 않는다. 장부 role_removed', async () => {
  const B = await board();
  B.b.rig.setEnabled(B.ws.key, true, 'human');
  await B.until(() => B.roleSessions().length === 2);
  const ideas = B.roleSessions().find((s) => s.rigRole === 'ideas');
  ideas.rt.term.present = true; ideas.rt.phase = 'running'; applyTermStatus(ideas.rt, 'idle');
  applyHook(ideas.rt, { hook_event_name: 'UserPromptSubmit', prompt: '일' }); applyTermStatus(ideas.rt, 'working');
  assert.equal(deriveState(ideas.rt).state, 'working');
  // 정의에서 ideas를 뺀다(ideas가 받던 길도 함께)
  const def = DEF(); delete def.roles.ideas; def.flows = [{ item: 'data-request', from: 'human', to: 'data' }];
  fs.writeFileSync(path.join(B.dir, '.atrium', 'rig.json'), JSON.stringify(def, null, 2));
  const t = new Date(Date.now() + 5000); fs.utimesSync(path.join(B.dir, '.atrium', 'rig.json'), t, t);
  assert.ok(!B.b.rig.read(B.ws.key).def.rig3.roles.ideas);
  let out = await B.b.rig3.detachRemoved();
  assert.deepEqual(out.map((x) => [x.role, x.waiting]), [['ideas', 'working']]);
  assert.equal(ideas.rigRole, 'ideas'); assert.equal(B.slept.length, 0);
  applyHook(ideas.rt, { hook_event_name: 'Stop', last_assistant_message: '끝' }); applyTermStatus(ideas.rt, 'idle');
  assert.equal(deriveState(ideas.rt).state, 'ready');
  out = await B.b.rig3.detachRemoved();
  assert.equal(out.length, 1); assert.equal(out[0].detached, 'ideas'); assert.equal(out[0].slept, true);
  assert.equal(ideas.rigRole, null);
  assert.equal(B.store.db.prepare('SELECT rig_role FROM sessions WHERE session_id = ?').get(ideas.sessionId), undefined, '가짜 판은 세션 줄이 없다(저장소 호출만)');
  assert.deepEqual(B.slept.map(([n, o]) => [n, o.scope]), [['ideas', 'session']]);
  assert.equal(B.killed.length, 0, '닫지 않는다');
  assert.ok(B.b.sessions.has(ideas.sessionId));
  const rows = B.ledger(['role_removed']);
  assert.equal(rows.length, 1); assert.equal(rows[0].seat, 'ideas'); assert.equal(rows[0].value, 'slept');
  // 다시 보면 할 일이 없고, 남은 역할(data)은 그대로
  assert.deepEqual(await B.b.rig3.detachRemoved(), []);
  assert.equal(B.roleSessions().map((s) => s.rigRole).join(), 'data');
  // 주기(tick)도 같은 길을 탄다: 다른 빠진 역할 세션이 잠들어 있으면 재우지 않고 떼기만
  const data = B.roleSessions()[0]; data.rt.sleep = { at: Date.now() };
  const def2 = DEF(); def2.roles = { ideas: { owns: ['hypotheses/'] } }; def2.flows = [{ item: 'hint', from: 'human', to: 'ideas' }]; def2.tools = {}; delete def2.beat;
  fs.writeFileSync(path.join(B.dir, '.atrium', 'rig.json'), JSON.stringify(def2, null, 2));
  const t2 = new Date(Date.now() + 9000); fs.utimesSync(path.join(B.dir, '.atrium', 'rig.json'), t2, t2);
  assert.ok(B.b.rig.read(B.ws.key).def.rig3.roles.ideas);
  const x = (await B.b.rig3.detachRemoved()).find((y) => y.role === 'data');
  assert.equal(x.slept, false); assert.equal(data.rigRole, null);
  assert.equal(B.ledger(['role_removed']).at(-1).value, 'asleep');
});

test('P249 옮겨 받은 바닥: 역할 설정 파일 증폭과 Codex 무인 인자(--approve-for-me·샌드박스·승인 인자를 걷어 냄)', () => {
  const a = roleSettingsAmp({ protectedFiles: ['.atrium/rig.json'], root: 'C:/x/ws', cwd: 'C:/x/ws' });
  assert.deepEqual(a.permissions, { disableAutoMode: 'disable' });
  assert.equal(a.hooks.PreToolUse.timeout, 10);
  assert.ok(a.deny.includes('Edit(//c/x/ws/.atrium/rig.json)')); assert.ok(a.deny.includes('Bash(pwsh:*)'));
  assert.deepEqual(codexUnattendedArgs(['--yolo', '-s', 'read-only', '-a', 'on-request', '-c', 'sandbox_mode=x', '--approve-for-me', '-c', 'model_reasoning_effort=high']), ['-c', 'model_reasoning_effort=high', '--sandbox', 'workspace-write', '--ask-for-approval', 'never']);
});

test('P249 장부는 옛 rig 종류를 받지 않고, 새 판 DB에는 옛 rig 표를 만들지 않는다', async () => {
  const B = await board();
  assert.throws(() => rigEvent(B.b, { kind: 'gate', ws: B.ws.key }), /모르는 kind/);
  assert.throws(() => parseKinds('case_open'), /모르는 kind/);
  assert.ok(RIG_EVENT_KINDS.includes('rig_version'));
  const tables = B.store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'rig%'").all().map((r) => r.name);
  for (const old of ['rig_hook_runs', 'rig_cases', 'rig_permits', 'rig_loops', 'rig_artifacts', 'rig_proposals']) assert.ok(!tables.includes(old), old);
  for (const keep of ['rig_versions', 'rig_events']) assert.ok(tables.includes(keep), keep);
});

test('P249 옛 rig 고리에 붙잡힌 전달(loop_paused)은 다시 뜰 때 보내지 않고 취소로 닫는다', () => {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  store.insertDelivery({ deliveryId: 'dold', sessionId: 's1', text: '붙잡힌 요청', status: 'queued', reason: 'loop_paused', createdAt: 1, seq: 1, origin: 'human' });
  store.insertDelivery({ deliveryId: 'dnew', sessionId: 's1', text: '보통 글', status: 'queued', reason: null, createdAt: 2, seq: 2, origin: 'human' });
  const q = new DeliveryQueue({ store, cfg: {}, view: () => ({ closed: true }), send: async () => {} });
  assert.equal(store.getDelivery('dold').status, 'cancelled'); assert.equal(store.getDelivery('dold').reason, 'loop_dropped');
  assert.equal(q.pending('s1'), 1);
  store.close();
});
