// P216 단위 시험: 종료된 자리 세션(exited)의 창 표시. rig 띠의 "종료됨" 표시와 [다시 띄우기](lib/rig-band.js), 자리 머리의 종료 수,
// 요약 열 건의 다시 맡길 일(lib/rig-map.js caseGroups), 휴대폰 갈래, 두 사전의 글. 그래프 견본은 P197·P198과 같은 test/fixtures/rig-band-graph.json에서 일 하나를 종료로 바꾼다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineageLayout } from '../src/renderer/lib/mission-lineage.js';
import { caseGroups } from '../src/renderer/lib/rig-map.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const FIX = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'rig-band-graph.json'), 'utf8'));
const WS = 'C:/w/band';
const SESS = [
  { sid: 's-main', name: 'main', seat: 'main', state: 'idle', t: 1 },
  { sid: 's-mgr', name: 'manager', seat: 'manager', state: 'working', t: 2 },
  { sid: 's-t1', name: 'tester-1', seat: 'tester', state: 'idle', t: 3, parent: 's-main' },
  { sid: 's-w1', name: 'worker-1', seat: 'worker', state: 'idle', t: 4, parent: 's-main' },
  { sid: 's-r1', name: 'reviewer-1', seat: 'reviewer', state: 'sleeping', t: 5, parent: 's-main' },
  { sid: 's-r2', name: 'reviewer-2', seat: 'reviewer', state: 'idle', t: 6, parent: 's-main' },
  { sid: 's-d1', name: 'docs-1', seat: 'docs', state: 'exited', t: 7, parent: 's-main' },
  { sid: 's-w2', name: 'worker-2', seat: 'worker', state: 'working', t: 8, parent: 's-main' },
];
const TIER = { working: 'work', idle: 'rest', sleeping: 'sleep', exited: 'done' };
// docs-1(fresh)이 쥔 열린 일과 manager(keep)가 쥔 열린 일을 종료로 바꾼 견본
function exitedFix() {
  const R0 = JSON.parse(JSON.stringify(FIX));
  let fresh = null, keep = null;
  for (const c of R0.cases) for (const u of c.units) {
    if (u.status !== 'open' || !u.sessionId) continue;
    if (!fresh && u.sessionId === 's-d1') { u.retry = true; u.stop = 'exited'; fresh = { c: c.id, u: u.unit }; }
    if (!keep && u.sessionId === 's-mgr') { u.retry = true; keep = { c: c.id, u: u.unit }; }
  }
  for (const s of R0.seats) for (const x of s.sessions) if (x.sessionId === 's-d1') { x.busy = false; x.exited = true; }
  return { R0, fresh, keep };
}
function graph(R0) {
  const nodes = SESS.map((s) => ({ id: `s:${s.sid}`, kind: 'session', sessionId: s.sid, name: s.name, agentKind: 'claude', state: s.state, category: s.state, workspaceKey: WS, parentId: s.parent ? `s:${s.parent}` : null, lineageParent: s.parent ? `s:${s.parent}` : null, peers: [], createdAt: s.t, rigSeat: s.seat }));
  const edges = SESS.filter((s) => s.parent).map((s) => ({ from: `s:${s.parent}`, to: `s:${s.sid}`, kind: 'spawn', count: 0 }));
  return { nodes, edges, counts: {}, at: 0, rig: { [WS]: R0 } };
}
const lay = (g, o = {}) => lineageLayout(g, { order: [WS], tiers: new Map(g.nodes.map((n) => [n.id, TIER[n.state] || 'rest'])), ...o });

test('P216 견본: 일의 stop·retry, 자리 세션의 exited 칸', () => {
  for (const c of FIX.cases) for (const u of c.units) { assert.ok('retry' in u && 'stop' in u, u.unit); }
  for (const s of FIX.seats) for (const x of s.sessions) assert.ok('exited' in x, x.name);
});

test('P216 rig 띠(PC): 종료된 자리 세션의 일에 "종료됨" 표시(다시 맡길 일 ID), 자리 머리는 busy에 넣지 않고 종료 수를 따로', () => {
  const { R0, fresh, keep } = exitedFix();
  assert.ok(fresh, '견본에 docs-1의 열린 일이 있다');
  const l = lay(graph(R0));
  const ex = l.rb.marks.filter((m) => m.kind === 'exited');
  const f = ex.find((m) => m.retryUnit === fresh.u);
  assert.ok(f, 'fresh 자리: 카드 아래 종료 표시');
  assert.equal(f.caseId, fresh.c);
  if (keep) {
    const k = ex.find((m) => m.retryUnit === keep.u);
    assert.ok(k, 'keep 자리: 일 있음 대신 종료 표시');
    assert.ok(!l.rb.marks.some((m) => m.kind === 'holds' && m.unit === keep.u));
  }
  const docs = l.rb.list[0].seats.find((s) => s.name === 'docs');
  assert.equal(docs.busy, 0); assert.equal(docs.exited, 1);
  // 표시는 서로 겹치지 않는다(같은 열)
  const same = l.rb.marks.filter((m) => m.x === f.x && m !== f);
  for (const m of same) assert.ok(m.y + m.h <= f.y || f.y + f.h <= m.y, '겹침 없음');
  // 종료 없는 견본은 표시가 없다
  assert.equal(lay(graph(FIX)).rb.marks.filter((m) => m.kind === 'exited').length, 0);
});

test('P216 휴대폰 갈래: 종료 표시', () => {
  const { R0, fresh } = exitedFix();
  const l = lay(graph(R0), { phone: true });
  assert.ok(l.rb.marks.some((m) => m.kind === 'exited' && m.retryUnit === fresh.u));
});

test('P216 요약 열 건: 다시 맡길 일 목록(retry)', () => {
  const { R0, fresh } = exitedFix();
  const g = caseGroups(graph(R0));
  const all = [...g.open, ...g.blocked, ...g.done];
  assert.deepEqual(all.find((c) => c.id === fresh.c).retry.includes(fresh.u), true);
  assert.ok(all.filter((c) => c.id !== fresh.c).every((c) => Array.isArray(c.retry)));
});

test('P216 글: 두 사전, 단추와 표시', () => {
  for (const d of [en, ko]) {
    for (const k of ['exited', 'seatExited', 'tip', 'button', 'buttonN', 'done', 'fail']) assert.ok(d.rigRetry && d.rigRetry[k], k);
    assert.ok(Object.values(d).some((v) => v && typeof v === 'object' && 'chgRigBuilder_exited' in v) || 'chgRigBuilder_exited' in d, 'chgRigBuilder_exited');
  }
  assert.equal(ko.rigRetry.button, '다시 띄우기');
  assert.match(read('RigBand.jsx'), /data-action="rb-retry"/);
  assert.match(read('SummaryColumn.jsx'), /data-role="mm-sum-retry"/);
  assert.match(read('MissionLineage.jsx'), /api\.call\('rig\.retry'/);
  assert.match(read('styles.css'), /\.mt-rb-mark\.k-exited/);
});
