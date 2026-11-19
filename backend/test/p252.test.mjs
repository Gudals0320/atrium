// P252: rig 올림에 답해 닫기(빌더 atrium rig answer, 사람 판 API rig.raiseAnswer), 지도·점선 자료에서 빠짐, 다음 깨우는 글, 변경 기록 꼭지, 고친 판으로 닫힘, 장부.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig } from '../src/rig.mjs';
import { writeSessionSettings } from '../src/launch.mjs';
import { newRuntime } from '../src/state.mjs';
import { RigRoles, ROLE_SPAWN } from '../src/rig-roles.mjs';
import { rigMapOf } from '../src/rig-map.mjs';
import { raiseStates, raiseId, waitingRaises, rigTuneHandlers, RIG_TUNE_OPS } from '../src/rig-tune.mjs';
import { RIG_TUNE_KINDS } from '../src/rig-ledger.mjs';
import { numbersBody, collectCycle } from '../src/rig-beat.mjs';
import { builderLoadText, alertText } from '../src/rig-builder.mjs';
import { HUMAN, BUILDER_ROLE } from '../src/rig-def.mjs';
import { VERBS } from '../src/cli-contract.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p252-'));
const DOC = (name) => ['# ' + name, '', '## 맡은 것', name + '의 일', '', '## 받는 것과 내는 것', '-', '', '## 기준', '- 기준', '', '## 요령', '- 요령'].join('\n');
const DEF = () => ({
  version: 3, name: 'p252', purpose: '.atrium/purpose.md',
  beat: { every: '1d', at: '07:00', role: 'data' },
  roles: { data: { owns: ['data/'], tools: ['fetch'] }, ideas: { owns: ['hypotheses/'] }, news: { owns: ['news/'] }, verify: { owns: ['verify/'] } },
  flows: [
    { item: 'snapshot', from: 'data', to: ['ideas', 'news'] },
    { item: 'hypothesis', from: 'ideas', to: 'verify' },
    { item: 'result', from: 'verify', to: 'ideas', for: 'hypothesis' },
    { item: 'data-request', from: 'verify', to: 'data' },
    { item: 'hint', from: 'human', to: 'ideas' },
  ],
  tools: { fetch: { run: ['node', 'tools/fetch.mjs'], every: '1h' } },
});
const TOOL_SRC = { 'tools/fetch.mjs': "console.log('ok')" };
async function board(mod = null) {
  const def = DEF();
  if (mod) mod(def);
  const dir = tmp(); const outside = tmp(); // 판의 저장소·데이터 폴더는 워크스페이스 밖(실제 판과 같다)
  fs.mkdirSync(path.join(dir, '.atrium', 'roles'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.atrium', 'purpose.md'), '# 목적\nP244\n');
  for (const r of Object.keys(def.roles)) fs.writeFileSync(path.join(dir, '.atrium', 'roles', r + '.md'), DOC(r));
  for (const [f, s] of Object.entries(TOOL_SRC)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); }
  fs.writeFileSync(path.join(dir, '.atrium', 'rig.json'), JSON.stringify(def, null, 2));
  const store = new Store(path.join(outside, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const casts = []; const items = new Map(); let dn = 0;
  const settings = { language: 'ko', rig3SummaryModel: 'haiku' };
  const b = { cfg: { hookTimeoutSec: 2, sessionsDir: path.join(outside, 'sessions'), dataDir: path.join(outside, 'data-board'), rig3DeadGraceMs: 0, rig3ToolWaitMs: 20000 }, store, sessions: new Map(), log: () => {}, api: { broadcast: (n, d) => casts.push({ n, d }) }, features: { settings: { get: () => settings } } };
  b.rig = new Rig(b); b.rig3 = new RigRoles(b);
  b.resolveWorkspace = async () => ({ key: ws.key });
  b.queue = {
    enqueue: (sessionId, text, opts) => { const d = { deliveryId: 'd' + ++dn, sessionId, text, opts, status: 'queued' }; items.set(d.deliveryId, d); return d; },
    retext: (id, text) => { const d = items.get(id); if (!d || d.status !== 'queued') return null; d.text = text; return d; },
    cancel: (id) => { const d = items.get(id); if (d) d.status = 'cancelled'; return d; },
  };
  let n = 0;
  b.spawn = async (p) => {
    const role = p[ROLE_SPAWN]; const kind = p.kind || 'claude';
    const L = b.rig3.launchOf(ws.key, role, { kind, cwd: p.cwd });
    const sessionId = 'sid-' + p.name + '-' + ++n;
    const s = { sessionId, name: p.name, kind, cwd: p.cwd, workspaceKey: ws.key, hookToken: 'tok-' + n, permissionMode: L.permissionMode, rt: newRuntime({ kind, hooked: true }), rigRole: L.role };
    s.rt.cwd = p.cwd;
    s.settingsPath = writeSessionSettings({ file: path.join(outside, 'sessions', sessionId + '.json'), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: s.hookToken, sessionId, amp: L.amp });
    b.sessions.set(sessionId, s);
    return { sessionId, name: p.name };
  };
  b.kill = async (p) => { b.sessions.delete(p.session); return { ok: true }; };
  b.sleeper = { isAsleep: (s) => !!s.rt.sleep, info: () => null, sleep: async (s) => { s.rt.sleep = { at: Date.now() }; return {}; }, wake: async (s) => { s.rt.sleep = null; return {}; } };
  store.setRigEnabled(ws.key, true);
  await b.rig3.onEnabled(ws.key, true);
  const S = (role) => [...b.sessions.values()].find((s) => s.rigRole === role);
  const key = ws.key;
  const BT = b.rig3.beat;
  const file = (rel, text = rel) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
  const put = (role, rel, o = {}) => b.rig3.items.put(key, { role, session: S(role).sessionId, file: path.join(dir, rel), ...o });
  const ledger = (kinds) => store.rigEvents({ ws: key, limit: 1000, kinds });
  const toRole = (role) => [...items.values()].filter((d) => d.sessionId === S(role).sessionId && !/너는 rig 역할/.test(d.text));
  const base = store.firstRig3Cycle(key).openedAt;
  const ai = []; BT.runner = async (prompt, o) => { ai.push({ prompt, o }); return { ok: true, text: JSON.stringify({ summary: '요약 글이다.', ran: '가설이 반려됐다.' }), meta: { model: o.model, ms: 5 } }; };
  const active = () => b.rig3.active(key);
  return { dir, store, key, b, BT, S, file, put, ledger, toRole, items, casts, base, ai, settings, active };
}

// 빌더 세션 하나(판이 띄운 것처럼 rigRole @builder)
function addBuilder(B) {
  const s = { sessionId: 'sid-builder', name: 'builder', kind: 'claude', workspaceKey: B.key, rigRole: BUILDER_ROLE, rt: newRuntime({ kind: 'claude', hooked: true }) };
  B.b.sessions.set(s.sessionId, s);
  return s;
}
const LOCAL = { auth: { kind: 'local' } };

test('P252 raiseId·raiseStates: 올림 차례 id, 답함·고친 판·기다림', () => {
  assert.equal(raiseId('raise-3'), 'raise-3'); assert.equal(raiseId('3'), 'raise-3'); assert.equal(raiseId(' RAISE-12 '), 'raise-12');
  assert.equal(raiseId('hypothesis-1'), null); assert.equal(raiseId(''), null);
  const tunes = [
    { kind: 'tune', role: 'a', t: 1 },
    { kind: 'raise', role: 'a', why: '하나', t: 10 },
    { kind: 'raise', role: 'b', why: '둘', t: 20 },
    { kind: 'answer', role: 'a', why: '그대로 둔다', evidence: ['raise-1'], by: 'builder', t: 30 },
    { kind: 'raise', role: 'b', why: '셋', t: 50 },
  ];
  const s = raiseStates(tunes, [{ n: 4, by: 'builder', t: 40 }, { n: 5, by: 'role:a', t: 60 }]);
  assert.deepEqual(s.map((x) => [x.id, x.role, x.state]), [['raise-1', 'a', 'answered'], ['raise-2', 'b', 'fixed'], ['raise-3', 'b', 'waiting']]);
  assert.deepEqual(s[0].answer, { text: '그대로 둔다', by: 'builder', t: 30 });
  assert.equal(s[1].fixedN, 4);
  // 역할이 고친 판(by role:)은 올림을 닫지 않는다
  assert.equal(s[2].fixedN, null);
});

test('P252 빌더가 답해 닫기: 지도 수·점선 자료에서 빠지고, 장부, 다음 깨우는 글, 꼭지, 조정 기록', async () => {
  const B = await board();
  const bs = addBuilder(B);
  const r1 = B.b.rig3.tune.raise(B.key, { role: 'verify', session: B.S('verify').sessionId, reason: '검증 기준이 정의에 없다' });
  const r2 = B.b.rig3.tune.raise(B.key, { role: 'ideas', session: B.S('ideas').sessionId, reason: '가설 꼴이 모자라다' });
  assert.equal(r1.id, 'raise-1'); assert.equal(r2.id, 'raise-2');
  // 빌더에게 간 알림에 id와 answer 명령
  const toB = [...B.items.values()].filter((d) => d.sessionId === bs.sessionId).map((d) => d.text);
  assert.ok(toB.some((t) => /raise-1/.test(t) && /atrium rig answer raise-1/.test(t)), toB.join('\n'));
  let m = rigMapOf(B.b, B.key);
  assert.deepEqual(m.raises.map((x) => [x.id, x.role]), [['raise-1', 'verify'], ['raise-2', 'ideas']]);
  assert.equal(m.head.raises, 2);
  // 역할 세션은 answer를 못 쓴다
  await assert.rejects(B.b.rig3.tune.verb(B.S('verify'), { op: 'answer', raise: 'raise-1', text: 'x' }), (e) => e.code === 'forbidden');
  // 빌더: atrium rig answer raise-1 "<까닭>"
  const a = await B.b.rig3.tune.verb(bs, { op: 'answer', raise: 'raise-1', text: '기준은 정의서 기준 칸에 이미 있다. 정의는 그대로 둔다' });
  assert.deepEqual([a.id, a.role, a.by], ['raise-1', 'verify', 'builder']);
  m = rigMapOf(B.b, B.key);
  assert.deepEqual(m.raises.map((x) => x.id), ['raise-2']); // 빌더 카드 "올림 n"과 캔버스 점선(rigEdges가 m.raises로 긋는다)에서 빠짐
  assert.equal(m.head.raises, 1);
  // 두 번 답하기·없는 올림·빈 까닭은 거절
  await assert.rejects(B.b.rig3.tune.verb(bs, { op: 'answer', raise: 'raise-1', text: '또' }), (e) => e.code === 'already');
  await assert.rejects(B.b.rig3.tune.verb(bs, { op: 'answer', raise: 'raise-9', text: 'x' }), (e) => e.code === 'not_found' && /raise-2/.test(e.message));
  await assert.rejects(B.b.rig3.tune.verb(bs, { op: 'answer', raise: 'raise-2', text: '  ' }), (e) => e.code === 'bad_request');
  // 장부
  const L = B.ledger(['raise_answer']);
  assert.equal(L.length, 1);
  assert.deepEqual([L[0].ref, L[0].seat, L[0].value, L[0].actor, L[0].session], ['raise-1', 'verify', 'builder', 'agent', bs.sessionId]);
  assert.equal(L[0].data.answer, '기준은 정의서 기준 칸에 이미 있다. 정의는 그대로 둔다');
  // 다음 깨우는 글: ideas가 가설을 내면 verify가 깨고, 그 글에 답이 실린다(한 번만)
  B.file('data/s1.md', 's1'); await B.put('data', 'data/s1.md', { kind: 'snapshot' });
  B.b.rig3.items.accept(B.key, { role: 'ideas', id: 'snapshot-1' });
  B.file('hypotheses/h1.md', 'h1'); await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis', from: 'snapshot-1' });
  const wake = B.toRole('verify').map((d) => d.text).join('\n---\n');
  assert.match(wake, /네가 빌더에게 올린 것\(raise-1: "검증 기준이 정의에 없다"\)에 빌더가 고치지 않기로 하고 답했다: 기준은 정의서 기준 칸에 이미 있다/);
  assert.equal(wake.split('raise-1').length - 1, 1);
  assert.deepEqual(B.store.rig3Tunes(B.key, 'verify').filter((t) => t.kind === 'answer').map((t) => t.state), ['told']);
  // 다른 역할(ideas)의 깨우는 글에는 없다
  assert.ok(!B.toRole('ideas').some((d) => /raise-1/.test(d.text)));
  // 변경 기록 꼭지(판이 쓴 숫자·id)
  const n = B.store.lastRig3Cycle(B.key).n;
  const facts = B.BT.facts(B.key, n);
  assert.deepEqual(facts.answers, [{ id: 'raise-1', role: 'verify', by: 'builder', answer: '기준은 정의서 기준 칸에 이미 있다. 정의는 그대로 둔다' }]);
  assert.match(numbersBody(facts, 'ko'), /\*\*올림에 답한 것\*\*\n- \[raise-1\] verify의 올림에 빌더가 고치지 않고 답함: 기준은/);
  assert.match(numbersBody(facts, 'en'), /\*\*Raises answered\*\*\n- \[raise-1\] The builder answered verify's raise without a change: /);
  // 조정 기록(rig role)에 답 줄, 역할 줄의 last는 답이 아니다
  const info = B.b.rig3.tune.roleInfo(B.key, 'verify');
  assert.deepEqual(info.log.map((x) => x.kind), ['raise', 'answer']);
  const rv = B.b.rig3.tune.roleView(B.key, B.active().def.rig3, 'verify');
  assert.equal(rv.last.kind, 'raise'); assert.equal(rv.raises, 1);
  // rig.status(rig 판)의 기다리는 올림
  assert.deepEqual(B.b.rig3.view(B.key, B.active().def).raises.map((x) => x.id), ['raise-2']);
  // 빌더 첫 글의 기다리는 것에서 닫힌 올림은 빠진다
  const w = B.b.rig3.builder.waiting(B.key);
  assert.ok(!w.some((l) => /raise-1/.test(l)));
});

test('P252 사람이 rig 판에서 답해 닫기(판 API rig.raiseAnswer), 고친 판으로 닫히는 길은 그대로', async () => {
  const B = await board();
  B.b.rig3.tune.raise(B.key, { role: 'verify', session: B.S('verify').sessionId, reason: '하나' });
  B.b.rig3.tune.raise(B.key, { role: 'ideas', session: B.S('ideas').sessionId, reason: '둘' });
  const h = rigTuneHandlers(B.b);
  await assert.rejects(h['rig.raiseAnswer']({ raise: 'raise-1', text: 'x' }, { auth: { kind: 'device' } }), (e) => e.code === 'forbidden');
  const a = await h['rig.raiseAnswer']({ raise: '1', text: '이번 주는 그대로 본다' }, LOCAL);
  assert.deepEqual([a.id, a.by], ['raise-1', 'human']);
  const L = B.ledger(['raise_answer']);
  assert.deepEqual([L[0].value, L[0].actor, L[0].session], ['human', 'human', null]);
  assert.deepEqual(rigMapOf(B.b, B.key).raises.map((x) => x.id), ['raise-2']);
  // 깨우는 글은 "사람이"
  B.file('data/s1.md', 's1'); await B.put('data', 'data/s1.md', { kind: 'snapshot' });
  B.b.rig3.items.accept(B.key, { role: 'ideas', id: 'snapshot-1' });
  B.file('hypotheses/h1.md', 'h1'); await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis', from: 'snapshot-1' });
  assert.ok(B.toRole('verify').some((d) => /raise-1: "하나"\)에 사람이 고치지 않기로 하고 답했다: 이번 주는 그대로 본다/.test(d.text)));
  const facts = B.BT.facts(B.key, B.store.lastRig3Cycle(B.key).n);
  assert.match(numbersBody(facts, 'ko'), /- \[raise-1\] verify의 올림에 사람이 고치지 않고 답함: 이번 주는 그대로 본다/);
  // 빌더가 고친 판이 생기면 raise-2는 답 없이 닫힌다(지금 동작). 닫힌 것에 답하면 거절
  B.store.insertRigVersion({ workspaceKey: B.key, hash: 'x', by: 'builder', t: Date.now() + 5 });
  assert.equal(rigMapOf(B.b, B.key).raises.length, 0);
  assert.deepEqual(raiseStates(B.store.rig3Tunes(B.key, null), B.store.rigVersions(B.key)).map((x) => x.state), ['answered', 'fixed']);
  await assert.rejects(h['rig.raiseAnswer']({ raise: 'raise-2', text: 'x' }, LOCAL), (e) => e.code === 'already');
  assert.deepEqual(waitingRaises(B.store, B.key), []);
});

test('P252 빌더 첫 글의 판 안내·올림 알림·명령 목록·장부 종류', () => {
  const t = builderLoadText({ guide: '지침', root: '/w', state: 'on', n: 3, writes: ['.atrium/'], docs: [], alerts: [] });
  assert.match(t, /\[Atrium 보드\] 올림\(raise-<n>\)을 고치지 않기로 정했으면 `atrium rig answer <올림> "<까닭 한 줄>"`로 답한다\..*사용자가 정할 일이면 답하지 않고 열어 둔다/);
  assert.ok(t.indexOf('atrium rig answer') < t.indexOf('## 빌더 지침')); // 지침 밖의 판 글
  assert.match(alertText({ what: 'raise', id: 'raise-4', role: 'verify', reason: '기준' }), /\(raise-4, raise, .*atrium rig answer raise-4 "<까닭>"로 닫는다\. 사용자가 정할 일이면 답하지 않고 열어 둔다\./);
  assert.ok(RIG_TUNE_OPS.includes('answer')); assert.ok(RIG_TUNE_KINDS.includes('raise_answer'));
  const rig = VERBS.find((v) => v.name === 'rig');
  assert.match(rig.args[0], /answer <올림> "<까닭>"/);
  // 빈 사이클 판정에 답이 든다
  const f = collectCycle({ flows: [] }, [{ kind: 'raise_answer', seat: 'a', ref: 'raise-1', value: 'human', data: { raise: 'raise-1', answer: '그대로', by: 'human' } }], { n: 1, from: 0, to: 1 });
  assert.equal(f.empty, false); assert.equal(f.answers.length, 1);
});
