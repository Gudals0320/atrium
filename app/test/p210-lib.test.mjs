// P210 단위 시험: 세션 맵 성능(lib/mission-lineage.js keepSameMap·graphKey·keepSameGraph·sameFacts·factsKeeper·keepCardBoxes, lib/work-light.js holdLights,
// 성능 기록 map 묶음 lib/perf-summary.js). 배치를 다시 세지 않아야 하는 바뀜(활동 시각·턴 진행)과 다시 세야 하는 바뀜(등급·이름·소속·관계)을 가른다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineageLayout, keepSameMap, graphKey, graphSig, keepSameGraph, sameFacts, factsKeeper, keepCardBoxes, sessionToday, dayStart } from '../src/renderer/lib/mission-lineage.js';
import { nodeTier } from '../src/renderer/lib/mission-model.js';
import { holdLights } from '../src/renderer/lib/work-light.js';
import { summarize, mapOf } from '../src/renderer/lib/perf-summary.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const NOW = 1_800_000_000_000;

// ---- 흉내 판: 워크스페이스 둘, 리드 아래 하위 셋, 솔로 하나 ----
const sum = (id, o = {}) => ({ sessionId: id, name: id, kind: 'claude', state: 'ready', workspaceKey: 'c:/w/a/.git', lastActivityAt: NOW - 60_000, createdAt: NOW - 3_600_000, model: 'claude-opus-5-5', effort: 'high', lastPrompt: 'Draft the notes', ...o });
const live0 = () => new Map([
  ['lead', sum('lead', { state: 'working', turn: { startedAt: NOW - 30_000 } })],
  ['k1', sum('k1', { state: 'working', turn: { startedAt: NOW - 20_000 }, lineageParentSessionId: 'lead' })],
  ['k2', sum('k2', { lineageParentSessionId: 'lead' })],
  ['k3', sum('k3', { state: 'sleeping', lineageParentSessionId: 'lead' })],
  ['solo', sum('solo', { workspaceKey: 'c:/w/b/.git' })],
].map(([k, v]) => [k, v]));
function graphOf(live) {
  const nodes = [{ id: 'human', kind: 'human', name: 'you' }];
  for (const s of live.values()) nodes.push({ id: `s:${s.sessionId}`, kind: 'session', sessionId: s.sessionId, name: s.name, agentKind: 'claude', state: s.state, category: s.state === 'working' ? 'working' : 'idle', workspaceKey: s.workspaceKey,
    parentId: s.lineageParentSessionId ? `s:${s.lineageParentSessionId}` : null, lineageParent: s.lineageParentSessionId ? `s:${s.lineageParentSessionId}` : null, peers: [], createdAt: s.createdAt, lastPrompt: s.lastPrompt, activeAt: s.lastActivityAt, turnAt: s.turn ? s.turn.startedAt : null, model: s.model, effort: s.effort });
  const edges = nodes.filter((n) => n.parentId).map((n) => ({ id: `spawn:${n.parentId}>${n.id}`, from: n.parentId, to: n.id, kind: 'spawn', count: 1, lastAt: NOW, relation: 'sub' }));
  return { nodes, edges, counts: {}, at: NOW, extra: {} };
}
const tiersOf = (g, live) => new Map(g.nodes.filter((n) => n.kind === 'session').map((n) => [n.id, nodeTier(n, live.get(n.sessionId))]));
const VG = [{ id: 'g1', name: 'Folder', members: ['c:/w/a/.git'] }];
const layOf = (g, tiers) => lineageLayout(g, { vgroups: VG, tiers, noFolder: 'No folder' });
// 일하는 세션의 활동 시각·턴 진행만 바뀐 갱신(초당 여러 번 오는 것)
const tick = (live, id, n) => { const m = new Map(live); m.set(id, { ...live.get(id), lastActivityAt: NOW + n * 125, turn: { ...live.get(id).turn, tokens: n } }); return m; };

test('graphKey: 활동 시각·턴 진행만 바뀌면 같다(그래프를 다시 읽지 않는다)', () => {
  const a = live0();
  let b = a;
  for (let i = 1; i <= 20; i++) b = tick(b, i % 2 ? 'lead' : 'k1', i);
  assert.equal(graphKey(b), graphKey(a));
  assert.equal(graphKey([...a.values()]), graphKey(a), '배열도 받는다');
});

test('graphKey: 그래프에 닿는 값이 바뀌면 다르다(상태·이름·소속·부모·마지막 지시·질문·세션 생기고 닫힘)', () => {
  const a = live0(), k = graphKey(a);
  const put = (id, o) => { const m = new Map(a); m.set(id, { ...a.get(id), ...o }); return m; };
  for (const [what, m] of [
    ['상태', put('k2', { state: 'working', turn: { startedAt: NOW } })], ['이름', put('k2', { name: 'k2-new' })], ['소속', put('solo', { workspaceKey: 'c:/w/a/.git' })],
    ['부모', put('k2', { lineageParentSessionId: 'solo' })], ['마지막 지시', put('k2', { lastPrompt: 'Another task' })], ['질문', put('k2', { state: 'waiting', ask: { kind: 'question', summary: 'Which?' } })],
    ['모델', put('k2', { model: 'claude-sonnet-5-5' })], ['오류', put('k2', { state: 'error', error: { message: 'API Error' } })],
  ]) assert.notEqual(graphKey(m), k, what);
  const plus = new Map(a); plus.set('new', sum('new'));
  assert.notEqual(graphKey(plus), k, '세션 생김');
  const minus = new Map(a); minus.delete('k3');
  assert.notEqual(graphKey(minus), k, '세션 닫힘');
});

test('keepSameMap: 같은 내용이면 앞 표(같은 객체), 값·크기가 바뀌면 새 표', () => {
  const p = new Map([['a', 'work'], ['b', 'rest']]);
  assert.equal(keepSameMap(p, new Map([['a', 'work'], ['b', 'rest']])), p);
  const n1 = new Map([['a', 'rest'], ['b', 'rest']]);
  assert.equal(keepSameMap(p, n1), n1);
  const n2 = new Map([['a', 'work']]);
  assert.equal(keepSameMap(p, n2), n2);
  const n3 = new Map([['a', 'work'], ['c', 'rest']]);
  assert.equal(keepSameMap(p, n3), n3);
  assert.equal(keepSameMap(null, n3), n3);
});

test('등급 표: 활동 시각만 바뀐 갱신은 앞 표 그대로 → 배치를 다시 세지 않는다', () => {
  const a = live0(), g = graphOf(a);
  const t0 = tiersOf(g, a);
  let b = a, t = t0;
  for (let i = 1; i <= 10; i++) { b = tick(b, 'k1', i); t = keepSameMap(t, tiersOf(g, b)); }
  assert.equal(t, t0);
});

test('등급 표: 등급이 바뀌는 갱신(일함 → 잠듦)은 새 표 → 배치를 다시 센다(얇은 줄이 생긴다)', () => {
  const a = live0(), g = graphOf(a);
  const t0 = tiersOf(g, a);
  const b = new Map(a); b.set('k2', { ...a.get('k2'), state: 'sleeping' });
  const t1 = keepSameMap(t0, tiersOf(g, b));
  assert.notEqual(t1, t0);
  assert.equal(t1.get('s:k2'), 'sleep');
  const L0 = layOf(g, t0), L1 = layOf(g, t1);
  assert.ok(L0.cards.get('s:k2').thin !== L1.cards.get('s:k2').thin || L0.cards.get('s:k2').h !== L1.cards.get('s:k2').h || JSON.stringify(L0.rows.map((r) => r.chips)) !== JSON.stringify(L1.rows.map((r) => r.chips)), '배치가 달라진다');
});

test('keepSameGraph: 시각 값(at·activeAt·since·lastAt·count)만 다르면 앞 그래프, 노드·선이 바뀌면 새 그래프', () => {
  const a = live0(), g0 = graphOf(a);
  const g1 = JSON.parse(JSON.stringify(g0)); g1.at += 5000; for (const n of g1.nodes) { if (n.kind === 'session') { n.activeAt += 999; n.since = NOW; } } for (const e of g1.edges) { e.lastAt += 10; e.count += 3; }
  assert.equal(keepSameGraph(g0, g1), g0);
  assert.equal(graphSig(g0), graphSig(g1));
  const g2 = JSON.parse(JSON.stringify(g0)); g2.nodes[2].state = 'sleeping';
  assert.equal(keepSameGraph(g0, g2), g2);
  const g3 = JSON.parse(JSON.stringify(g0)); g3.edges.push({ id: 'x', from: 's:solo', to: 's:k2', kind: 'relation', relation: 'peer' });
  assert.equal(keepSameGraph(g0, g3), g3);
  const g4 = JSON.parse(JSON.stringify(g0)); g4.extra = { 'c:/w/a/.git': { seats: [] } };
  assert.equal(keepSameGraph(g0, g4), g4, '다른 칸이 바뀌면 새 그래프');
  assert.equal(keepSameGraph(null, g0), g0);
});

test('keepCardBoxes: 같은 입력으로 다시 센 배치는 카드 상자를 모두 앞 객체로(카드 memo가 다시 그리지 않는다)', () => {
  const a = live0(), g = graphOf(a), t = tiersOf(g, a);
  const L0 = layOf(g, t), L1 = keepCardBoxes(L0, layOf(g, t));
  assert.ok(L1.cards.size === L0.cards.size && L1.cards.size === 5);
  for (const [id, b] of L1.cards) assert.equal(b, L0.cards.get(id), id);
});

test('keepCardBoxes: 바뀐 카드만 새 상자(질문이 생겨 키가 커진 카드), 나머지는 앞 객체', () => {
  const a = live0(), g = graphOf(a), t = tiersOf(g, a);
  const L0 = layOf(g, t);
  const g2 = JSON.parse(JSON.stringify(g));
  const sNode = g2.nodes.find((n) => n.id === 's:solo'); sNode.state = 'waiting'; sNode.ask = 'Allow npm ci in the worktree and then run the whole release check again from the start?'; sNode.lastPrompt = 'x'.repeat(200);
  const b = new Map(a); b.set('solo', { ...a.get('solo'), state: 'waiting' });
  // 다른 노드 객체는 앞 그래프 것을 그대로(판에서 같은 그래프를 받은 것처럼)
  g2.nodes = g2.nodes.map((n) => (n.id === 's:solo' ? n : g.nodes.find((x) => x.id === n.id)));
  const L1 = keepCardBoxes(L0, layOf(g2, tiersOf(g2, b)));
  assert.notEqual(L1.cards.get('s:solo'), L0.cards.get('s:solo'), '바뀐 카드는 새 상자');
  assert.ok(L1.cards.get('s:solo').h > L0.cards.get('s:solo').h, '키가 커졌다');
  for (const id of ['s:lead', 's:k1', 's:k2', 's:k3']) assert.equal(L1.cards.get(id), L0.cards.get(id), `${id} 다른 줄의 카드는 앞 상자`);
});

test('sameFacts·factsKeeper: 같은 글·수·내용이 같은 객체면 앞 사실(같은 객체), 하나라도 다르면 새 사실', () => {
  const k = { id: 'claude', mark: 'C', label: 'Claude Code' };
  const f0 = { kind: 'claude', k, stateText: 'Working', age: '2m', task: 'Draft', bg: { n: 1, kinds: ['shell'] }, err: null };
  const keep = factsKeeper();
  assert.equal(keep('a', f0), f0);
  const f1 = { ...f0, k: { ...k }, bg: { n: 1, kinds: ['shell'] } };
  assert.ok(sameFacts(f0, f1));
  assert.equal(keep('a', f1), f0, '내용이 같으면 앞 객체');
  const f2 = { ...f0, age: '3m' };
  assert.equal(keep('a', f2), f2, '지난 시간 글이 바뀌면 새 객체');
  assert.equal(keep('a', { ...f2 }), f2);
  assert.ok(!sameFacts(f0, { ...f0, bg: { n: 2, kinds: ['shell'] } }));
  assert.ok(!sameFacts(f0, { ...f0, extra: 1 }));
  assert.ok(!sameFacts(f0, null));
});

test('sessionToday: 그래프 활동 시각이 어제여도 창이 가진 세션 값이 오늘이면 오늘(그래프는 활동 시각만으로 다시 읽지 않는다)', () => {
  const noon = new Date(2026, 10, 18, 12).getTime(), mid = dayStart(noon);
  assert.equal(sessionToday({ activeAt: mid - 3600e3 }, { lastActivityAt: mid + 60e3 }, 'rest', noon), true);
  assert.equal(sessionToday({ activeAt: mid + 60e3 }, { lastActivityAt: mid - 3600e3 }, 'rest', noon), true);
  assert.equal(sessionToday({ activeAt: mid - 60e3 }, { lastActivityAt: mid - 3600e3 }, 'rest', noon), false);
});

test('holdLights: 움직이는 동안 도는 빛을 멈추고, 멈춘 뒤 문서 시간 0 박자로 다시 돌린다', () => {
  const anim = (st) => ({ playState: st, startTime: 1234, pause() { this.playState = 'paused'; } });
  const a1 = anim('running'), a2 = anim('running'), a3 = anim('finished');
  const el = (list) => ({ getAnimations: () => list });
  const root = { querySelectorAll: (sel) => (sel === '.mt-mm-light' ? [el([a1, a2]), el([a3])] : []) };
  assert.equal(holdLights(root, true), 2);
  assert.equal(a1.playState, 'paused'); assert.equal(a2.playState, 'paused'); assert.equal(a3.playState, 'finished');
  assert.equal(holdLights(root, false), 2);
  assert.equal(a1.startTime, 0); assert.equal(a2.startTime, 0); assert.equal(a3.startTime, 1234);
  assert.equal(holdLights(null, true), 0);
});

test('성능 기록: map 묶음(배치 셈·그래프 읽기 횟수와 ms, 카드 그리기)을 요약에 넣는다(값만)', () => {
  assert.deepEqual(mapOf({ layout: 3, layoutMs: 21.456, layoutMax: 9.111, graph: 1, graphMs: 4.2, cards: 40, open: 1, name: 'x' }), { layout: 3, layoutMs: 21.46, layoutMax: 9.11, graph: 1, graphMs: 4.2, cards: 40, open: 1 });
  const s = summarize({ sec: 30, gaps: [7], wheel: [], longTasks: [], loafs: [], renders: {}, rebuild: {}, nodes: {}, view: {}, map: { layout: 2, layoutMs: 10, cards: 5, open: 1 } });
  assert.deepEqual(s.map, { layout: 2, layoutMs: 10, cards: 5, open: 1 });
  assert.ok(!('map' in summarize({ sec: 1, gaps: [] })), 'map이 없으면 넣지 않는다');
});

test('세션 맵 창(PC·휴대폰)은 그래프를 graphKey가 바뀔 때만 다시 읽고, 등급 표·카드 사실·카드 상자를 앞 것으로 남긴다', () => {
  for (const f of ['MissionLineage.jsx', 'PhoneMap.jsx']) {
    const s = fs.readFileSync(path.join(SRC, f), 'utf8');
    assert.match(s, /graphKey\(sessions\)/, f);
    assert.match(s, /\[(open, )?gkey, (links, thread, loops|dkey), reloadN\]/, `${f}: 세션 대신 gkey에 걸린다`); // P293: 휴대폰은 연결·Thread·루프를 내용 열쇠(dkey)로
    assert.match(s, /keepSameMap\(tiersRef\.current/, f);
    assert.match(s, /keepSameGraph\(prev, g\)/, f);
    assert.match(s, /keepFacts\(id, cardFacts\(/, f);
    assert.match(s, /keepCardBoxes\(lastLay\.current/, f);
    if (f === 'PhoneMap.jsx') assert.match(s, /holdLights\(vp, true\)/, f); // P349: PC 맵은 CSS가 움직이는 동안 빛 고리를 숨긴다(p349-lib.test.mjs)
  }
  const pt = fs.readFileSync(path.join(SRC, 'perf-trace.js'), 'utf8');
  assert.match(pt, /export function noteMap/);
});
