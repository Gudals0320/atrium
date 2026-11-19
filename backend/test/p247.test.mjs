// P247: rig 3 5단계 — 빌더. 빌더 세션 띄우기·찾기(워크스페이스마다 하나), 실을 글, 빌더 쓰기 범위와 guard(빌더 쓰기는 되돌리지 않고 역할의 .atrium/ 쓰기는 되돌림),
// 빌더 고침 → 판 by builder와 꼭지의 빌더 칸, 떠 있는 역할에게 정의서 바뀜 알림·다시 띄우기, raise·멈춘 역할 → 빌더(없으면 그대로),
// rig check 묶음 견줌, rig.events 꼬리 읽기, 역할 첫 글의 긴 일 줄, 주기 조정 턴의 답 항목 재료, 꼬리표 판 번호.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig } from '../src/rig.mjs';
import { RigAmp } from '../src/rig-amp.mjs';
import { RigAdmin } from '../src/rig-admin.mjs';
import { writeSessionSettings } from '../src/launch.mjs';
import { newRuntime, applyHook } from '../src/state.mjs';
import { rigEvent, readEvents, RIG3_BUILDER_KINDS } from '../src/rig-ledger.mjs';
import { loadText, rig3Guide, builderWrites, builderOwns, toolScripts, BUILDER_ROLE, LONG_JOB_LINE, checkRoleDoc } from '../src/rig3.mjs';
import { Rig3Roles, ROLE_SPAWN } from '../src/rig3-roles.mjs';
import { builderLoadText, readGuide, alertText, rig3BuilderHandlers, GUIDE_FILE } from '../src/rig3-builder.mjs';
import { collectCycle, entryBody } from '../src/rig3-beat.mjs';
import { judge } from '../src/rig3-guard.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p247-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DOC = (name, tune = '- 처음 요령', crit = '- 기준 ' + name) => ['# ' + name, '', '## 맡은 것', name + '의 일', '', '## 받는 것과 내는 것', '- 받고 낸다', '', '## 기준', crit, '', '## 요령', tune, ''].join('\n');
const DEF = () => ({
  version: 3, name: 'p247', purpose: '.atrium/purpose.md',
  beat: { every: '1h', role: 'data' },
  roles: { data: { owns: ['data/'] }, ideas: { owns: ['hypotheses/'] }, verify: { owns: ['verify/'] } },
  flows: [
    { item: 'snapshot', from: 'data', to: 'ideas' },
    { item: 'hypothesis', from: 'ideas', to: 'verify' },
    { item: 'result', from: 'verify', to: 'ideas', for: 'hypothesis' },
  ],
});
async function board({ mod = null, rig = true, cfg = {}, on = true } = {}) {
  const def = DEF();
  if (mod) mod(def);
  const dir = tmp(); const outside = tmp();
  if (rig) {
    fs.mkdirSync(path.join(dir, '.atrium', 'roles'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.atrium', 'purpose.md'), '# 목적\nP247 목적 글\n');
    for (const r of Object.keys(def.roles)) fs.writeFileSync(path.join(dir, '.atrium', 'roles', r + '.md'), DOC(r));
    fs.writeFileSync(path.join(dir, '.atrium', 'rig.json'), JSON.stringify(def, null, 2));
  }
  const store = new Store(path.join(outside, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const items = new Map(); let dn = 0;
  const b = { cfg: { hookTimeoutSec: 2, sessionsDir: path.join(outside, 'sessions'), dataDir: path.join(outside, 'data-board'), rig3DeadGraceMs: 0, rig3GuardBgPollMs: 0, ...cfg }, store, sessions: new Map(), log: () => {}, api: { broadcast: () => {} }, features: { settings: { get: () => ({ language: 'ko' }) } } };
  b.rig = new Rig(b); b.rigAmp = new RigAmp(b); b.rig3 = new Rig3Roles(b);
  b.resolveWorkspace = async () => ({ key: ws.key });
  b.queue = {
    enqueue: (sessionId, text, opts) => { const d = { deliveryId: 'd' + ++dn, sessionId, text, opts, status: 'queued' }; items.set(d.deliveryId, d); return d; },
    retext: (id, text) => { const d = items.get(id); if (!d || d.status !== 'queued') return null; d.text = text; return d; },
    cancel: (id) => { const d = items.get(id); if (d) d.status = 'cancelled'; return d; },
  };
  let n = 0; const spawns = [];
  b.spawn = async (p) => {
    spawns.push(p);
    const role = p[ROLE_SPAWN]; const kind = p.kind || 'claude';
    const L = b.rig3.launchOf(ws.key, role, { kind, cwd: p.cwd });
    const sessionId = 'sid-' + p.name + '-' + ++n;
    const s = { sessionId, name: p.name, kind, cwd: p.cwd, model: p.model || null, workspaceKey: ws.key, hookToken: 'tok-' + n, permissionMode: L.permissionMode, rt: newRuntime({ kind, hooked: true }), rigRole: L.role };
    s.rt.cwd = p.cwd;
    s.settingsPath = writeSessionSettings({ file: path.join(outside, 'sessions', sessionId + '.json'), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: s.hookToken, sessionId, amp: L.amp });
    b.sessions.set(sessionId, s);
    return { sessionId, name: p.name };
  };
  b.kill = async (p) => { b.sessions.delete(p.session); return { ok: true }; };
  b.sleeper = { isAsleep: (s) => !!s.rt.sleep, info: () => null, sleep: async (s) => { s.rt.sleep = { at: Date.now() }; return {}; }, wake: async (s) => { s.rt.sleep = null; return {}; } };
  const key = ws.key;
  if (rig && on) { store.setRigEnabled(key, true); await b.rig3.onEnabled(key, true); b.rig3.beat.runner = async () => ({ ok: false, text: '', meta: { model: 'x', error: 'test' } }); await b.rig3.guard.idle(key); }
  const S = (role) => [...b.sessions.values()].find((s) => s.rigRole === role);
  const file = (rel, text = rel) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
  const read = (rel) => { try { return fs.readFileSync(path.join(dir, rel), 'utf8'); } catch { return null; } };
  const put = (role, rel, o = {}) => { file(rel, rel + ' ' + Math.random()); return b.rig3.items.put(key, { role, session: S(role).sessionId, file: path.join(dir, rel), ...o }); };
  const ledger = (kinds) => store.rigEvents({ ws: key, limit: 1000, kinds });
  const toS = (s) => [...items.values()].filter((d) => d.sessionId === s.sessionId);
  const G = b.rig3.guard;
  // 상태 바뀜 하나(판 상태). 검사가 끝날 때까지 기다린다
  const turn = async (s, fn) => { await G.onState(s, 'ready', 'working'); await wait(25); await fn(); await G.onState(s, 'working', 'ready'); await G.idle(key); await wait(5); };
  const ready = (s) => { applyHook(s.rt, { hook_event_name: 'Stop', session_id: s.sessionId, last_assistant_message: 'ok' }); s.rt.phase = 'running'; s.rt.term.present = true; s.rt.term.status = 'idle'; };
  return { dir, store, key, b, S, file, read, put, ledger, items, toS, G, turn, ready, spawns, admin: new RigAdmin(b, {}) };
}
const code = async (p, c) => { try { await p; } catch (e) { assert.equal(e.code, c, e.message); return e; } assert.fail('기대한 거절 ' + c); };

test('P247 빌더 띄우기·찾기: 워크스페이스마다 하나, 있으면 그 세션으로(사람의 말), 무인·쓰기 범위 설정, 실은 글, 장부 builder_spawn', async () => {
  const B = await board();
  const r = await B.b.rig3.builder.talk(B.key, { model: 'haiku' });
  assert.equal(r.spawned, true);
  const s = B.b.sessions.get(r.session);
  assert.equal(s.rigRole, BUILDER_ROLE); assert.equal(s.name, 'builder'); assert.equal(s.model, 'haiku');
  assert.equal(s.permissionMode, 'bypassPermissions');
  const j = JSON.parse(fs.readFileSync(s.settingsPath, 'utf8'));
  assert.ok(j.hooks && j.hooks.PreToolUse, '설정 파일에 PreToolUse(판이 쓰기 범위를 본다)');
  const first = B.toS(s)[0];
  assert.equal(first.opts.origin.kind, 'board');
  assert.match(first.text, /너는 이 워크스페이스의 rig 빌더다/);
  assert.match(first.text, /## 빌더 지침[\s\S]*구성안 한 장/);
  assert.match(first.text, /## 지금 정의 \(\.atrium\/rig\.json\)[\s\S]*"version": 3/);
  assert.match(first.text, /## 목적 \(\.atrium\/purpose\.md\)\nP247 목적 글|## 목적 \(\.atrium\/purpose\.md\)\n# 목적\nP247 목적 글/);
  for (const role of ['data', 'ideas', 'verify']) assert.match(first.text, new RegExp('## 정의서 \\(\\.atrium/roles/' + role + '\\.md\\)'));
  assert.match(first.text, /지금 rig: 켜짐, 판 \d+/);
  assert.match(first.text, /쓰는 곳: \.atrium\//);
  assert.equal(B.ledger(RIG3_BUILDER_KINDS).length, 1);
  // 다시 말하기 → 같은 세션, 사람의 말로 넣는다
  const r2 = await B.b.rig3.builder.talk(B.key, { text: '역할 하나를 더하고 싶다' });
  assert.equal(r2.session, r.session); assert.equal(r2.spawned, false);
  const last = B.toS(s).at(-1);
  assert.equal(last.text, '역할 하나를 더하고 싶다'); assert.equal(last.opts.origin.kind, 'human');
  assert.equal([...B.b.sessions.values()].filter((x) => x.rigRole === BUILDER_ROLE).length, 1);
  assert.equal(B.ledger(RIG3_BUILDER_KINDS).length, 1);
  // 빌더는 역할이 아니다: 주기가 다시 띄우거나 역할 보기에 넣지 않는다, rig.status의 rig3.builder에 보인다
  const v = B.b.rig.status(B.key).rig3;
  assert.equal(v.builder.session.sessionId, r.session);
  assert.ok(!v.roles.some((x) => x.name === BUILDER_ROLE));
  // 빌더 세션이 닫히면 다음 말하기가 새로 띄운다
  B.b.sessions.delete(r.session);
  const r3 = await B.b.rig3.builder.talk(B.key, {});
  assert.equal(r3.spawned, true); assert.notEqual(r3.session, r.session);
  // 판 API: 사람만(local)
  const H = rig3BuilderHandlers(B.b);
  await code(H['rig3.builder']({ workspace: B.key }, { auth: { kind: 'remote' } }), 'forbidden');
  const h = await H['rig3.builder']({ workspace: B.key, text: 'hi' }, { auth: { kind: 'local' } });
  assert.equal(h.session, r3.session);
});

test('P247 rig가 없는 워크스페이스에서도 빌더를 띄운다(실을 글: 지금 rig 없음). 다른 워크스페이스는 제 빌더', async () => {
  const A = await board({ rig: false });
  const r = await A.b.rig3.builder.talk(A.key, {});
  const s = A.b.sessions.get(r.session);
  assert.equal(s.permissionMode, 'bypassPermissions');
  const t = A.toS(s)[0].text;
  assert.match(t, /지금 rig: 없음/);
  assert.doesNotMatch(t, /## 지금 정의/);
  assert.match(t, /## 기다리는 것[\s\S]*\(없다\)/);
  const Bb = await board();
  const r2 = await Bb.b.rig3.builder.talk(Bb.key, {});
  assert.notEqual(Bb.b.rig3.builder.sessionOf(Bb.key), null);
  assert.equal(A.b.rig3.builder.sessionOf(Bb.key), null);
  assert.ok(r2.session);
});

test('P247 실을 글(순수)과 지침 파일: 구성안 칸, 좋다고 한 뒤에만, 정의서 네 칸, rig check, 켜기는 사람, 설계 쪽이 다시 쓴다', () => {
  const g = readGuide();
  assert.ok(fs.existsSync(GUIDE_FILE));
  assert.match(g, /설계 쪽\(fable-peer\)이 다시 쓴다/);
  for (const w of ['역할', '쥔 섹터', '길', '박자', '도구', '입력 창구', '기준']) assert.ok(g.includes(w), w);
  assert.match(g, /좋다고 하기 전에는 정의와 정의서를 쓰지 않는다/);
  assert.match(g, /## 맡은 것.*## 받는 것과 내는 것.*## 기준.*## 요령/);
  assert.match(g, /atrium rig check/);
  assert.match(g, /켜는 것은 사람이/);
  assert.match(g, /역할 런처는 기본 `claude`/);
  assert.match(g, /분리 실행/);
  const t = builderLoadText({ guide: 'G', root: 'C:/x', state: 'off', n: 3, writes: ['.atrium/'], rigText: '{"version":3}', purpose: { rel: '.atrium/purpose.md', text: 'P' }, docs: [{ rel: '.atrium/roles/a.md', text: 'A' }, { rel: '.atrium/roles/b.md', text: null }], entry: '## 사이클 1\n- x', alerts: ['- raise 하나'] });
  assert.match(t, /지금 rig: 꺼짐, 판 3/);
  assert.match(t, /## 정의서 \(\.atrium\/roles\/b\.md\)\n\(없다\)/);
  assert.match(t, /## 최근 변경 기록 꼭지\n## 사이클 1/);
  assert.match(t, /## 기다리는 것[^\n]*\n- raise 하나/);
  assert.match(alertText({ what: 'raise', role: 'ideas', reason: 'R', materials: ['heard-1'] }), /역할 ideas이 빌더에게 올렸다\(raise[^)]*\): R \(재료: heard-1\)/);
  assert.match(alertText({ what: 'stalled', role: 'verify', items: ['hypothesis-1'] }), /verify이 받은 것에 답하지 않고 멈췄다.*hypothesis-1/);
});

test('P247 빌더 쓰기 범위: .atrium/와 정의가 가리키는 도구 스크립트. PreToolUse가 그 밖 편집을 막는다', async () => {
  const B = await board({ mod: (d) => { d.tools = { fetch: { run: ['node', 'tools/fetch.mjs'] }, inner: { run: ['node', '.atrium/tools/inner.mjs'] } }; d.roles.data.tools = ['fetch', 'inner']; } , cfg: {}, on: false });
  // 도구 스크립트가 없으면 정의가 잘못이라 먼저 둔다
  B.file('tools/fetch.mjs', '//'); B.file('.atrium/tools/inner.mjs', '//');
  B.store.setRigEnabled(B.key, true); await B.b.rig3.onEnabled(B.key, true); await B.G.idle(B.key);
  const r3 = B.b.rig3.defOf(B.key).def.rig3;
  assert.deepEqual(toolScripts(r3).sort(), ['.atrium/tools/inner.mjs', 'tools/fetch.mjs']);
  assert.deepEqual(builderWrites(r3), ['.atrium/', 'tools/fetch.mjs']);
  assert.ok(builderOwns(r3, '.atrium/rig.json')); assert.ok(builderOwns(r3, 'tools/fetch.mjs')); assert.ok(!builderOwns(r3, 'tools/other.mjs')); assert.ok(!builderOwns(r3, 'data/x'));
  const r = await B.b.rig3.builder.talk(B.key, {});
  const s = B.b.sessions.get(r.session);
  assert.ok(B.b.rig3.wants(s, 'PreToolUse'));
  const w = (f) => B.b.rig3.answer(s, 'PreToolUse', { tool_name: 'Write', tool_input: { file_path: path.join(B.dir, f), content: 'x' } });
  assert.equal(await w('.atrium/rig.json'), null);
  assert.equal(await w('.atrium/roles/ideas.md'), null);
  assert.equal(await w('tools/fetch.mjs'), null);
  const d = await w('data/x.txt');
  assert.equal(d.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(d.hookSpecificOutput.permissionDecisionReason, /빌더의 쓰기 범위 밖이다/);
  const sh = await B.b.rig3.answer(s, 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'cmd /c echo x > a' } });
  assert.equal(sh.hookSpecificOutput.permissionDecision, 'deny');
  // 역할은 여전히 .atrium/에 쓰지 못한다
  const rd = await B.b.rig3.answer(B.S('ideas'), 'PreToolUse', { tool_name: 'Write', tool_input: { file_path: path.join(B.dir, '.atrium/roles/ideas.md'), content: 'x' } });
  assert.equal(rd.hookSpecificOutput.permissionDecision, 'deny');
  // 순수 판단
  assert.deepEqual(judge({ cands: [BUILDER_ROLE], owner: null, builder: true }), { legit: true, why: 'builder' });
  assert.equal(judge({ cands: ['ideas'], owner: null, builder: true }).legit, false);
  assert.equal(judge({ cands: [BUILDER_ROLE], owner: { role: 'data', kind: 'sector' }, builder: false }).legit, false);
});

test('P247 guard: 빌더 턴의 .atrium/ 쓰기는 그대로(새 판 by builder, 꼭지의 빌더 칸), 역할의 .atrium/ 쓰기는 되돌림, 빌더의 섹터 쓰기도 되돌림', async () => {
  const B = await board();
  const r = await B.b.rig3.builder.talk(B.key, {});
  const bs = B.b.sessions.get(r.session);
  const v0 = B.store.lastRigVersion(B.key).n;
  // 빌더가 ideas 정의서의 기준 칸 글을 다듬는다
  await B.turn(bs, () => B.file('.atrium/roles/ideas.md', DOC('ideas', '- 처음 요령', '- 기준 ideas(다듬음)')));
  assert.match(B.read('.atrium/roles/ideas.md'), /다듬음/, '빌더의 쓰기는 되돌리지 않는다');
  assert.equal(B.ledger(['role_foreign_write']).length, 0);
  B.b.rig.read(B.key);
  const v1 = B.store.lastRigVersion(B.key);
  assert.equal(v1.n, v0 + 1); assert.equal(v1.by, 'builder');
  const ev = B.ledger(['rig_version']).at(-1);
  assert.deepEqual(ev.data.changed, ['role:ideas']); assert.equal(ev.data.changed_by, 'builder');
  // 꼭지의 "빌더가 고친 것"
  const f = collectCycle(B.b.rig3.defOf(B.key).def.rig3, B.ledger(null), { n: 1, from: 0, to: Date.now(), by: 'beat' });
  assert.deepEqual(f.builder, [{ n: v1.n, changed: ['role:ideas'] }]);
  assert.match(entryBody(f, 'ko'), new RegExp('\\*\\*빌더가 고친 것\\*\\*\\n- 판 ' + v1.n + ': 정의서 ideas 바뀜'));
  assert.match(entryBody(f, 'en'), new RegExp('What the builder fixed\\*\\*\\n- Version ' + v1.n + ': role doc ideas changed'));
  // 역할(ideas)이 턴에 data의 정의서를 고침 → 되돌림(빌더가 쉬고 있다)
  const before = B.read('.atrium/roles/data.md');
  await B.turn(B.S('ideas'), () => B.file('.atrium/roles/data.md', DOC('data', '- 남이 고침')));
  assert.equal(B.read('.atrium/roles/data.md'), before);
  assert.equal(B.ledger(['role_foreign_write']).at(-1).value, 'restored');
  // 빌더가 역할의 섹터에 씀 → 되돌림(격리)과 빌더에게 알림
  await B.turn(bs, () => B.file('data/by-builder.txt', 'x'));
  assert.equal(B.read('data/by-builder.txt'), null);
  const fw = B.ledger(['role_foreign_write']).at(-1);
  assert.equal(fw.value, 'quarantined'); assert.deepEqual(fw.data.candidates, [BUILDER_ROLE]);
  assert.match(B.toS(bs).at(-1).text, /네\(빌더\) 턴 동안 빌더의 쓰기 범위 밖에 쓴 것을 되돌렸다: data\/by-builder\.txt/);
});

test('P247 꺼진 rig: 빌더 턴이 끝나면 맞는 정의를 판으로 남긴다(by builder). 처음 짓기도 같다', async () => {
  const B = await board({ rig: false });
  const r = await B.b.rig3.builder.talk(B.key, {});
  const bs = B.b.sessions.get(r.session);
  await B.turn(bs, () => {
    const d = DEF();
    B.file('.atrium/purpose.md', '# 목적\n새로 지음\n');
    for (const x of Object.keys(d.roles)) B.file('.atrium/roles/' + x + '.md', DOC(x));
    B.file('.atrium/rig.json', JSON.stringify(d, null, 2));
  });
  await wait(10);
  const v = B.store.lastRigVersion(B.key);
  assert.ok(v, '판이 남았다'); assert.equal(v.by, 'builder'); assert.equal(v.note, 'builder');
  assert.equal(B.b.rig.enabled(B.key), false, '켜는 것은 사람이다');
  const c = B.admin.check(B.key);
  assert.equal(c.ok, true); assert.equal(c.same, true, 'rig check의 same은 묶음 해시로 견준다');
  assert.equal(c.bundle, v.hash);
  // 빌더 세션은 atrium rig check·log --events를 쓴다
  const ck = await B.admin.verb(bs, { op: 'check' });
  assert.equal(ck.ok, true);
  const lg = await B.admin.verb(bs, { op: 'log', events: true });
  assert.ok(Array.isArray(lg.rows));
});

test('P247 rig check(v3): 지금 판과 같은 내용을 묶음 해시로 견준다(정의서만 바뀌면 다르다)', async () => {
  const B = await board();
  const c = B.admin.check(B.key);
  assert.equal(c.ok, true); assert.equal(c.same, true);
  assert.equal(c.bundle, B.store.lastRigVersion(B.key).hash);
  assert.notEqual(c.hash, c.bundle);
  // 후보 내용(다른 정의)은 다르다
  const d = DEF(); d.name = 'other';
  const c2 = B.admin.check(B.key, { text: JSON.stringify(d) });
  assert.equal(c2.ok, true); assert.equal(c2.same, false);
  // 정의서만 손으로 바뀌면 check가 읽으며 새 판이 되고(켜진 rig), 그 판과 같다
  await wait(15);
  B.file('.atrium/roles/verify.md', DOC('verify', '- 손으로'));
  const c3 = B.admin.check(B.key);
  assert.equal(c3.same, true); assert.notEqual(c3.bundle, c.bundle);
});

test('P247 떠 있는 역할: 정의서가 바뀌면 다음 깨우는 글에 "정의서가 바뀌었다, 다시 읽는다", 쥔 섹터·도구가 바뀌면 쉴 때 다시 띄운다', async () => {
  const B = await board();
  const r = await B.b.rig3.builder.talk(B.key, {});
  const bs = B.b.sessions.get(r.session);
  await B.turn(bs, () => B.file('.atrium/roles/verify.md', DOC('verify', '- 처음 요령', '- 통과 조건: 거래 100 이상')));
  B.b.rig.read(B.key);
  const notes = B.b.rig3.items.guardNotices(B.key, 'verify');
  assert.equal(notes.length, 1);
  assert.match(notes[0], /빌더\)에서 정의서\(\.atrium\/roles\/verify\.md\)이 바뀌었다\. 정의서가 바뀌었다, 다시 읽는다: \.atrium\/roles\/verify\.md/);
  assert.deepEqual(B.b.rig3.items.guardNotices(B.key, 'verify'), [], '한 번만');
  assert.deepEqual(B.b.rig3.items.guardNotices(B.key, 'data'), [], '바뀌지 않은 역할에는 없다');
  // 깨우는 글에 붙는다
  await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis' });
  // (알림은 위에서 이미 꺼냈다. 다시 바꾸고 깨우는 글을 본다)
  await B.turn(bs, () => B.file('.atrium/roles/verify.md', DOC('verify', '- 처음 요령', '- 통과 조건: 거래 200 이상')));
  B.b.rig.read(B.key);
  await B.put('ideas', 'hypotheses/h2.md', { kind: 'hypothesis' });
  const wake = B.toS(B.S('verify')).at(-1).text;
  assert.match(wake, /정의서가 바뀌었다, 다시 읽는다/);
  // rig.json에서 data의 섹터를 바꿈 → data에 알림 + 다시 띄울 표시 → 쉴(잠든) 때 새로 띄운다
  const oldData = B.S('data');
  await B.turn(bs, () => { const d = DEF(); d.roles.data.owns = ['data/', 'raw/']; B.file('.atrium/rig.json', JSON.stringify(d, null, 2)); });
  B.b.rig.read(B.key);
  assert.ok(B.b.rig3.restart.has(B.key + '|data'));
  assert.ok(!B.b.rig3.restart.has(B.key + '|ideas'), '섹터·도구가 그대로인 역할은 다시 띄우지 않는다');
  oldData.rt.sleep = { at: Date.now() };
  const x = await B.b.rig3.keep(B.key, 'data');
  assert.equal(x.why, 'redefined');
  assert.ok(!B.b.sessions.has(oldData.sessionId));
  assert.notEqual(B.S('data').sessionId, oldData.sessionId);
  assert.equal(B.ledger(['role_respawn']).at(-1).data.prev.why, 'redefined');
  assert.match(B.toS(B.S('data'))[0].text, /쓰는 곳: data\/, raw\//);
  assert.ok(!B.b.rig3.restart.has(B.key + '|data'));
});

test('P247 raise·멈춘 역할 → 빌더 세션(대기열). 사람이 볼 것 줄은 그대로. 빌더가 없으면 지금처럼', async () => {
  // 빌더 없음
  const A = await board();
  const ra = A.b.rig3.tune.raise(A.key, { role: 'ideas', session: A.S('ideas').sessionId, reason: '검증 번호를 누가 주나' });
  assert.equal(ra.toBuilder, false);
  assert.equal(A.ledger(['role_raise']).at(-1).data.toBuilder, false);
  // 빌더 있음
  const B = await board({ cfg: { rig3StallMs: 0 } });
  const r = await B.b.rig3.builder.talk(B.key, {});
  const bs = B.b.sessions.get(r.session);
  bs.rt.sleep = { at: Date.now() }; // 잠든 빌더에도 대기열로 넣는다(대기열이 깨운다)
  const rr = B.b.rig3.tune.raise(B.key, { role: 'ideas', session: B.S('ideas').sessionId, reason: '검증 번호를 누가 주나' });
  assert.equal(rr.toBuilder, true);
  assert.match(B.toS(bs).at(-1).text, /역할 ideas이 빌더에게 올렸다\(raise[^)]*\): 검증 번호를 누가 주나/);
  const ev = B.ledger(['role_raise']).at(-1);
  assert.equal(ev.data.toBuilder, true); assert.match(ev.text, /빌더에게 전함/);
  // 멈춘 역할: 한 번 일깨우고 그 뒤에도 그대로면 빌더에게
  const v = B.S('verify');
  B.ready(v);
  await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis' });
  for (const d of B.items.values()) d.status = 'sent';
  await wait(5);
  assert.deepEqual(B.b.rig3.items.watch(B.key, 'verify', v).nudged, ['hypothesis-1']);
  await wait(5); B.ready(v);
  assert.deepEqual(B.b.rig3.items.watch(B.key, 'verify', v).stalled, ['hypothesis-1']);
  assert.match(B.toS(bs).at(-1).text, /역할 verify이 받은 것에 답하지 않고 멈췄다.*hypothesis-1/);
  assert.equal(B.ledger(['item_stalled']).at(-1).data.toBuilder, true);
  // 꼭지: 사람이 볼 것에 raise·멈춤 줄이 남고 "(빌더에게 전함)"
  const f = collectCycle(B.b.rig3.defOf(B.key).def.rig3, B.ledger(null), { n: 1, from: 0, to: Date.now(), by: 'beat' });
  const body = entryBody(f, 'ko');
  assert.match(body, /ideas가 요령으로 풀 일이 아니라고 빌더에게 올렸다: 검증 번호를 누가 주나 \(빌더에게 전함\)/);
  assert.match(body, /verify가 받은 것에 답하지 않고 멈췄다: \[hypothesis-1\] \(빌더에게 전함\)/);
  assert.match(entryBody(f, 'en'), /\(sent to the builder\)/);
  // 빌더가 없던 동안의 raise는 빌더를 띄울 때 실을 글에 나온다
  const A2 = await A.b.rig3.builder.talk(A.key, {});
  assert.match(A.toS(A.b.sessions.get(A2.session))[0].text, /## 기다리는 것[^\n]*\n- [^\n]*ideas raise: 검증 번호를 누가 주나/);
});

test('P247 rig.events 꼬리 읽기(커서 없이): 가장 새 줄을 빠뜨리지 않는다. 커서 뒤 읽기는 그대로', async () => {
  const B = await board();
  for (let i = 1; i <= 5; i++) rigEvent(B.b, { kind: 'role_heard', ws: B.key, seat: 'ideas', actor: 'agent', ref: 't-' + i, text: 'n' + i });
  const last = B.store.lastRigSeq(B.key);
  const t = readEvents(B.b, B.key, { limit: 3 });
  assert.deepEqual(t.rows.map((r) => r.seq), [last - 2, last - 1, last]);
  assert.equal(t.more, true);
  const all = readEvents(B.b, B.key, { limit: 2000 });
  assert.equal(all.rows.at(-1).seq, last); assert.equal(all.more, false);
  const c = readEvents(B.b, B.key, { since: last - 4, limit: 2 });
  assert.deepEqual(c.rows.map((r) => r.seq), [last - 3, last - 2]);
  assert.equal(c.more, true);
});

test('P247 역할 첫 글과 atrium guide: 긴 일은 판의 도구 → 하네스 뒤 실행, 분리 실행은 안 됨', async () => {
  const B = await board({ mod: (d) => { d.tools = { fetch: { run: ['node', 'tools/fetch.mjs'] } }; d.roles.data.tools = ['fetch']; }, on: false });
  B.file('tools/fetch.mjs', '//');
  const r3 = B.b.rig3.defOf(B.key).def.rig3;
  const withTool = loadText(r3, 'data', {});
  assert.ok(withTool.includes(LONG_JOB_LINE));
  assert.match(withTool, /먼저 판이 돌리는 도구\(`atrium rig tool`\)로, 아니면 하네스의 뒤 실행\(백그라운드 실행\)으로 한다\. 분리 실행\(Start-Process, start, nohup, setsid\)으로는 하지 않는다: 판이 그 프로세스를 보지 못해 그것이 쓴 것을 되돌린다/);
  const noTool = loadText(r3, 'ideas', {});
  assert.match(noTool, /오래 걸리는 일은 턴을 붙들지 않는다\. 먼저 판이 돌리는 도구\(네 도구가 정의에 있을 때\)로, 아니면 하네스의 뒤 실행/);
  assert.match(noTool, /분리 실행\(Start-Process, start, nohup, setsid\)으로는 하지 않는다/);
  assert.match(rig3Guide(r3, 'ideas'), /분리 실행\(Start-Process, start, nohup, setsid\)으로는 하지 않는다/);
});

test('P247 주기 조정 턴: 받은 답 항목(for 길)도 재료(id·종류만), 세기 기준은 반려·바로잡음·되돌린 쓰기만', async () => {
  const B = await board({ mod: (d) => { d.tune = { after: 3, every: 2, lines: 20 }; } });
  const T = B.b.rig3.tune;
  const h = await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis' });
  B.b.rig3.items.accept(B.key, { role: 'verify', id: h.item.id });
  const res = await B.put('verify', 'verify/r1.md', { kind: 'result', from: h.item.id });
  const ans = T.answersOf(B.key, 'ideas');
  assert.deepEqual(ans.map((a) => [a.id, a.item, a.for, a.by]), [[res.item.id, 'result', 'hypothesis', 'verify']]);
  assert.deepEqual(T.answersOf(B.key, 'verify'), [], '답 항목은 받는 역할의 것');
  let x = T.state(B.key, 'ideas');
  assert.equal(x.mats.length, 0, '세기 재료에는 들지 않는다');
  assert.equal(T.check(B.key, 'ideas', B.S('ideas')), null, '사이클이 차기 전에는 열지 않는다');
  await B.b.rig3.beat.strike(B.key, { by: 'human' });
  await B.b.rig3.beat.strike(B.key, { by: 'human' });
  assert.equal(T.state(B.key, 'ideas').cycles, 2);
  assert.ok(T.check(B.key, 'ideas', B.S('ideas')));
  const tt = B.ledger(['tune_turn']).at(-1);
  assert.equal(tt.value, 'every'); assert.deepEqual(tt.data.answers, [{ id: res.item.id, item: 'result' }]);
  const text = B.toS(B.S('ideas')).at(-1).text;
  assert.match(text, new RegExp('네가 낸 것에 돌아온 답 항목[^\\n]*\\n- ' + res.item.id + ' result\\(verify가 hypothesis에 답함\\)'));
  // 답 항목 id를 근거로 조정할 수 있다
  B.file('.atrium/roles/ideas/tune.md', '- 처음 요령\n- 결과에서 본 모양을 먼저 적는다');
  const t = T.tune(B.key, { role: 'ideas', session: B.S('ideas').sessionId, file: '.atrium/roles/ideas/tune.md', why: '결과 모양', evidence: [res.item.id] });
  assert.ok(t.n);
  // 세기 기준(after 3)에는 답 항목이 들지 않는다: 답 셋이 와도 사이클이 없으면 열지 않는다
  const B2 = await board({ mod: (d) => { d.tune = { after: 1, every: 50, lines: 20 }; } });
  for (let i = 1; i <= 3; i++) { const hh = await B2.put('ideas', 'hypotheses/x' + i + '.md', { kind: 'hypothesis' }); B2.b.rig3.items.accept(B2.key, { role: 'verify', id: hh.item.id }); await B2.put('verify', 'verify/y' + i + '.md', { kind: 'result', from: hh.item.id }); }
  assert.equal(B2.b.rig3.tune.answersOf(B2.key, 'ideas').length, 3);
  assert.equal(B2.b.rig3.tune.check(B2.key, 'ideas', B2.S('ideas')), null);
});

test('P247 꼬리표 판 번호: 반영된 실제 판으로 찍는다(그새 다른 판이 들어왔으면 다시 찍는다)', async () => {
  const B = await board({ mod: (d) => { d.tune = { after: 1, every: 5, lines: 20 }; } });
  const T = B.b.rig3.tune;
  const h = await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis' });
  B.b.rig3.items.giveBack(B.key, { role: 'verify', session: B.S('verify').sessionId, id: h.item.id, reason: '미래 참조' });
  B.file('.atrium/roles/ideas/tune.md', '- 처음 요령\n- 진입 시각을 먼저 적는다');
  const a = T.tune(B.key, { role: 'ideas', session: B.S('ideas').sessionId, file: '.atrium/roles/ideas/tune.md', why: '미래 참조', evidence: [h.item.id] });
  const doc1 = checkRoleDoc(B.read('.atrium/roles/ideas.md')).sections['요령'];
  assert.match(doc1, new RegExp('- 진입 시각을 먼저 적는다 \\[v' + a.n + ' · ' + h.item.id + '\\]'));
  // 그새 다른 판이 먼저 들어온 경우: 판 남기기 직전에 다른 판을 끼워 넣는다
  const h2 = await B.put('ideas', 'hypotheses/h2.md', { kind: 'hypothesis' });
  B.b.rig3.items.giveBack(B.key, { role: 'verify', session: B.S('verify').sessionId, id: h2.item.id, reason: '또 미래 참조' });
  const orig = B.b.rig.recordNow.bind(B.b.rig); let once = true;
  B.b.rig.recordNow = (k, o) => { if (once) { once = false; B.store.insertRigVersion({ workspaceKey: k, hash: 'other-' + Date.now(), by: 'unknown', note: null }); } return orig(k, o); };
  const want = B.store.lastRigVersion(B.key).n + 1;
  B.file('.atrium/roles/ideas/tune.md', doc1 + '\n- 둘째 줄');
  const b2 = T.tune(B.key, { role: 'ideas', session: B.S('ideas').sessionId, file: '.atrium/roles/ideas/tune.md', why: '또', evidence: [h2.item.id] });
  const doc2 = checkRoleDoc(B.read('.atrium/roles/ideas.md')).sections['요령'];
  const tag = /- 둘째 줄 \[v(\d+)/.exec(doc2);
  assert.ok(tag);
  assert.equal(Number(tag[1]), want + 1, '짐작(' + want + ')이 아니라 처음 반영된 판');
  assert.equal(b2.n, want + 2, '다시 찍은 판이 하나 더 남는다');
  assert.match(doc2, new RegExp('\\[v' + a.n + ' · ' + h.item.id + '\\]'), '있던 줄의 꼬리표는 그대로');
  assert.equal(B.ledger(['rig_version']).at(-1).data.note, 'tune ideas retag');
});
