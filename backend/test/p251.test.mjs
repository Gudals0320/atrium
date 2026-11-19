// P251: rig 구조 지도 자료(rig.map)와 공유 배치(roleOrder·rolePairs), 켤 때 한 번 역할 노드 놓기, 세션 요약·그래프의 rigRole.
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
import { rigMapOf, rigMaps, placeRoles, itemState, rigMapHandlers, MAP_RECENT } from '../src/rig-map.mjs';
import { roleOrder, rolePairs, RIG_LAYOUT } from '../src/rig-map-layout.mjs';
import { missionGraph } from '../src/mission.mjs';
import { HUMAN, BUILDER_ROLE } from '../src/rig-def.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p251-'));
const DOC = (name) => ['# ' + name, '', '## 맡은 것', name + '의 일', '', '## 받는 것과 내는 것', '-', '', '## 기준', '- 기준', '', '## 요령', '- 요령'].join('\n');
const DEF = () => ({
  version: 3, name: 'p251', purpose: '.atrium/purpose.md',
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

test('P251 roleOrder: 길 앞뒤로 칸, 가지는 같은 칸에 쌓고 고리(되돌아오는 길)는 back으로 떼며 답 길(for)은 차례에 넣지 않는다', () => {
  const d = DEF();
  const o = roleOrder(Object.keys(d.roles), d.flows);
  assert.deepEqual(o.cols, [['data'], ['ideas', 'news'], ['verify']]);
  assert.deepEqual(o.back, [['verify', 'data']]);
  assert.equal(o.layer.get('verify'), 2); assert.equal(o.row.get('news'), 1);
  // 사람 입력을 받는 역할부터 걷는다: 고리 a → b → a에서 사람이 b에 넣으면 b가 앞
  const o2 = roleOrder(['a', 'b'], [{ item: 'x', from: 'a', to: 'b' }, { item: 'y', from: 'b', to: 'a' }, { item: 'h', from: HUMAN, to: 'b' }]);
  assert.deepEqual(o2.cols, [['b'], ['a']]);
  // 길이 없는 역할은 0칸, 칸이 많으면 줄을 바꾼다
  const chain = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
  const o3 = roleOrder([...chain, 'lone'], chain.slice(1).map((r, i) => ({ item: 'k' + i, from: chain[i], to: r })), { maxCols: 4 });
  assert.equal(o3.layer.get('lone'), 0); assert.equal(o3.lines, 2);
  assert.deepEqual([o3.line.get('r5'), o3.col.get('r5')], [1, 0]);
  assert.equal(RIG_LAYOUT.MAXCOLS, 4);
});

test('P251 rolePairs: 길을 함께 쓰는 역할 쌍마다 하나(방향 fwd·back, 답 길 forBack). 사람 길은 쌍이 아니다', () => {
  const d = DEF();
  const ps = rolePairs(Object.keys(d.roles), d.flows);
  const by = Object.fromEntries(ps.map((p) => [p.key, p]));
  assert.deepEqual(Object.keys(by).sort(), ['data|ideas', 'data|news', 'data|verify', 'ideas|verify']);
  assert.deepEqual([by['ideas|verify'].fwd, by['ideas|verify'].back, by['ideas|verify'].forBack], [['hypothesis'], ['result'], ['result']]);
  assert.deepEqual([by['data|verify'].fwd, by['data|verify'].back], [[], ['data-request']]);
  assert.ok(!ps.some((p) => p.a === HUMAN || p.b === HUMAN));
});

test('P251 itemState: 끝난 판 → 그 값, 받음 줄은 반려 > 기다림 > 받음 > 넘김', () => {
  assert.equal(itemState({ state: 'superseded' }, [{ state: 'returned' }]), 'superseded');
  assert.equal(itemState({ state: 'live' }, [{ state: 'accepted' }, { state: 'returned' }]), 'returned');
  assert.equal(itemState({ state: 'live' }, [{ state: 'accepted' }, { state: 'waiting' }]), 'waiting');
  assert.equal(itemState({ state: 'live' }, []), 'live');
});

test('P251 rig.map 자료: 역할·섹터 최근 항목·길 수(이번 사이클)·열린 반려·기다리는 raise·박자·사이클 항목 순서·꼭지·머리 수', async () => {
  const B = await board();
  B.file('data/s1.md', 's1'); await B.put('data', 'data/s1.md', { kind: 'snapshot' });
  B.b.rig3.items.accept(B.key, { role: 'ideas', id: 'snapshot-1' });
  B.file('hypotheses/h1.md', 'h1'); await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis', from: 'snapshot-1' });
  B.b.rig3.items.giveBack(B.key, { role: 'verify', id: 'hypothesis-1', reason: '미래 참조가 있다' });
  B.b.rig3.tune.raise(B.key, { role: 'verify', session: B.S('verify').sessionId, reason: '검증 기준이 정의에 없다' });
  for (let i = 2; i <= 5; i++) { B.file('data/s' + i + '.md', 's' + i); await B.put('data', 'data/s' + i + '.md', { kind: 'snapshot' }); }
  const m = rigMapOf(B.b, B.key);
  assert.equal(m.status, 'on'); assert.equal(m.name, 'p251');
  assert.deepEqual(m.roles.map((r) => r.name), ['data', 'ideas', 'news', 'verify']);
  const data = m.roles.find((r) => r.name === 'data');
  assert.equal(data.sectors[0].path, 'data/'); assert.equal(data.sectors[0].items.length, MAP_RECENT); assert.equal(data.sectors[0].more, 5 - MAP_RECENT);
  assert.equal(data.sectors[0].items[0].id, 'snapshot-5'); // 새 것부터
  assert.deepEqual(data.beat, { every: '1d', at: '07:00', cycle: true });
  assert.deepEqual(data.tools.map((t) => [t.name, t.every]), [['fetch', '1h']]);
  const ideas = m.roles.find((r) => r.name === 'ideas');
  assert.deepEqual(ideas.intake, ['hint']); assert.equal(ideas.returnedOwn, 1);
  assert.equal(ideas.sectors[0].items[0].state, 'returned'); assert.equal(ideas.sectors[0].items[0].reason, '미래 참조가 있다');
  const hyp = m.flows.find((f) => f.item === 'hypothesis');
  assert.equal(hyp.openReturns, 1); assert.deepEqual(hyp.cycle && [hyp.cycle.put, hyp.cycle.returned], [1, 1]);
  const snap = m.flows.find((f) => f.item === 'snapshot');
  assert.equal(snap.cycle.put, 5); assert.equal(snap.waiting, 4 + 5); // ideas 4(1 받음) + news 5
  assert.equal(m.flows.find((f) => f.item === 'hint').human, true);
  assert.deepEqual(m.raises.map((x) => [x.role, x.reason]), [['verify', '검증 기준이 정의에 없다']]);
  assert.equal(m.head.raises, 1); assert.equal(m.head.cycle, 0); assert.ok(m.head.attention >= 1); // raise는 사람이 볼 것
  assert.deepEqual(m.cycleItems.slice(0, 4).map((x) => [x.k, x.id, x.what]), [[1, 'snapshot-1', 'put'], [2, 'snapshot-1', 'accept'], [3, 'hypothesis-1', 'put'], [4, 'hypothesis-1', 'return']]);
  assert.equal(m.cycleItems[3].reason, '미래 참조가 있다');
  assert.equal(m.entry, null);
  // 빌더나 사람이 고친 판이 생기면 raise는 다뤄진 것(사라진다)
  B.store.insertRigVersion({ workspaceKey: B.key, hash: 'x', by: 'builder', t: Date.now() + 5 });
  assert.equal(rigMapOf(B.b, B.key).raises.length, 0);
  // 판 API: 하나와 모두
  const h = rigMapHandlers(B.b);
  assert.equal((await h['rig.map']({})).maps.length, 1);
  assert.equal((await h['rig.map']({ workspace: B.key })).maps[0].workspace, B.key);
  assert.equal(rigMaps(B.b).length, 1);
});

test('P251 꺼진 rig도 자료가 있다(status off). 정의가 없는 워크스페이스는 자료가 없다', async () => {
  const B = await board();
  B.b.rig.setEnabled(B.key, false, 'human');
  const m = rigMapOf(B.b, B.key);
  assert.equal(m.status, 'off'); assert.equal(m.enabled, false); assert.equal(m.roles.length, 4);
  fs.rmSync(path.join(B.dir, '.atrium', 'rig.json'));
  assert.equal(rigMapOf(B.b, B.key), null);
});

test('P251 켤 때 한 번 역할 노드를 길 차례로 놓는다(칸·가지 줄). 그 뒤 사람이 옮긴 자리는 placeRoles를 다시 부르지 않는 한 그대로', async () => {
  const B = await board();
  const rows = new Map(); B.store.setNode = (n) => rows.set(n.session_id, { ...n }); B.store.nodes = () => [...rows.values()]; // 시험 판은 세션 줄이 없어 노드 표만 흉내
  let i = 0;
  for (const s of B.b.sessions.values()) B.store.setNode({ session_id: s.sessionId, x: 500 - 40 * i, y: 300 + 10 * i++, w: 600, h: 400, z: 0 });
  const moved = placeRoles(B.b, B.key);
  assert.ok(moved >= 3);
  const at = (role) => B.store.nodes().find((n) => n.session_id === B.S(role).sessionId);
  const x0 = at('data').x, y0 = at('data').y;
  assert.equal(at('ideas').x, x0 + 680); assert.equal(at('news').x, x0 + 680); assert.equal(at('news').y, y0 + 470);
  assert.equal(at('verify').x, x0 + 2 * 680); assert.equal(at('ideas').y, y0);
  assert.ok(B.casts.some((c) => c.n === 'board.node' && c.d.sessionId === B.S('news').sessionId));
});

test('P251 세션 그래프 노드에 rigRole(역할·빌더)이 실린다', () => {
  const g = missionGraph({ sessions: [{ sessionId: 'a', name: 'data', state: 'ready', rigRole: 'data' }, { sessionId: 'b', name: 'builder', state: 'ready', rigRole: BUILDER_ROLE }, { sessionId: 'c', name: 'c', state: 'ready' }] });
  const by = Object.fromEntries(g.nodes.filter((n) => n.kind === 'session').map((n) => [n.sessionId, n.rigRole]));
  assert.deepEqual(by, { a: 'data', b: BUILDER_ROLE, c: null });
});
