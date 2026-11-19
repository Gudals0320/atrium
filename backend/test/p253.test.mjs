// P253: 머리 띠 "사람이 볼 것" 수는 아직 열린 것만(답했거나 고친 판으로 닫힌 올림은 뺀다). 변경 기록 꼭지는 그대로. 판 준비는 p252.test.mjs와 같다.
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
import { rigMapOf, openDecide } from '../src/rig-map.mjs';
import { raiseStates, raiseId, waitingRaises, rigTuneHandlers, RIG_TUNE_OPS } from '../src/rig-tune.mjs';
import { RIG_TUNE_KINDS } from '../src/rig-ledger.mjs';
import { numbersBody, collectCycle } from '../src/rig-beat.mjs';
import { builderLoadText, alertText, readGuide } from '../src/rig-builder.mjs';
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

test('P253 openDecide: 답했거나 고친 판으로 닫힌 올림은 빼고, 기다리는 올림·id 없는 올림·다른 사람이 볼 것은 남긴다', () => {
  const decide = [{ what: 'raise', id: 'raise-1' }, { what: 'raise', id: 'raise-2' }, { what: 'raise', id: 'raise-3' }, { what: 'raise', id: null }, { what: 'gave_up', role: 'a' }];
  const states = [{ id: 'raise-1', state: 'answered' }, { id: 'raise-2', state: 'fixed' }, { id: 'raise-3', state: 'waiting' }];
  assert.deepEqual(openDecide(decide, states).map((d) => (d.what === 'raise' ? d.id : d.what)), ['raise-3', null, 'gave_up']);
  assert.deepEqual(openDecide(decide, []).length, 5);
  assert.deepEqual(openDecide(null, states), []);
});

test('P253 rig.map 머리 띠 사람이 볼 것: 올림에 답하면 수가 줄고, 변경 기록 쪽(사이클 사실 decide)은 그대로', async () => {
  const B = await board();
  const bs = addBuilder(B);
  B.b.rig3.tune.raise(B.key, { role: 'verify', session: B.S('verify').sessionId, reason: '검증 기준이 정의에 없다' });
  B.b.rig3.tune.raise(B.key, { role: 'ideas', session: B.S('ideas').sessionId, reason: '가설 꼴이 모자라다' });
  const before = rigMapOf(B.b, B.key).head.attention;
  assert.ok(before >= 2, 'raise 둘이 사람이 볼 것에 든다: ' + before);
  await B.b.rig3.tune.verb(bs, { op: 'answer', raise: 'raise-1', text: '기준은 이미 있다. 정의는 그대로 둔다' });
  const m = rigMapOf(B.b, B.key);
  assert.equal(m.head.attention, before - 1);
  // 기록(이번 사이클 사실)에는 두 올림이 그대로 있다
  const c = B.store.lastRig3Cycle(B.key);
  const rows = B.store.rigEvents({ ws: B.key, kinds: ['role_raise'], limit: 100 });
  assert.equal(rows.length, 2);
  const facts = collectCycle(B.b.rig.read(B.key).def.rig3, B.store.rigEvents({ ws: B.key, sinceT: c.openedAt, limit: 100000 }), { n: c.n, from: c.openedAt, to: Date.now() });
  assert.equal(facts.decide.filter((d) => d.what === 'raise').length, 2);
  // 사람이 답해도 같다(rig.raiseAnswer)
  await rigTuneHandlers(B.b)['rig.raiseAnswer']({ workspace: B.dir, raise: 'raise-2', text: '지금은 고치지 않는다' }, LOCAL);
  assert.equal(rigMapOf(B.b, B.key).head.attention, before - 2);
});
