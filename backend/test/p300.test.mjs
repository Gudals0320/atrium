// P300 단위 시험: 자체 오케스트레이션 세션의 안 진행(읽기 전용). 임시 SQLite(state.db async_delegations: 도는 중·끝·실패 섞임)로 위임 진행,
// OMH dag-ulw 실행 기록과 위임 원장 표본(P300 조사 꼴: omh_dag/v1 nodes[].attempts, delegation_ledger/v1 children[].dag·stop)으로 DAG 진행,
// 꼴 맞추기, 읽기 실패 → 없음, 판 감시(바쁠 때만 읽고 바뀔 때만 보냄, 끝을 잠깐 두고 다음 턴에 지움). Hermes 없이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { omhLedgerKey, omhHomeOf, omhDagProgress, omhDagRuns, omhLedgerChildren, hermesDelegationProgress, hermesProgressOf, shapeProgress, delegationItems } from '../src/hermes.mjs';
import { registerProgressReader, readProgress, progressReadable, progressSig, stepProgress, ProgressWatcher } from '../src/inner-progress.mjs';
import { newRuntime, applyTermStatus } from '../src/state.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p300-'));
const S = (ms) => ms / 1000;

function fakeHermes() {
  const home = tmp();
  const db = new DatabaseSync(path.join(home, 'state.db'));
  db.exec(`CREATE TABLE async_delegations (delegation_id TEXT PRIMARY KEY, origin_session TEXT NOT NULL, parent_session_id TEXT, state TEXT NOT NULL, dispatched_at REAL NOT NULL, completed_at REAL, updated_at REAL NOT NULL, event_json TEXT, result_json TEXT, delivery_state TEXT NOT NULL DEFAULT 'pending', task_json TEXT)`);
  const add = (id, parent, state, { at, done = null, delivery = 'pending', task = {}, result = null } = {}) => db.prepare('INSERT INTO async_delegations (delegation_id, origin_session, parent_session_id, state, dispatched_at, completed_at, updated_at, delivery_state, task_json, result_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, 'agent:main:x', parent, state, S(at), done ? S(done) : null, S(done || at), delivery, JSON.stringify(task), result ? JSON.stringify(result) : null);
  return { home, db, add };
}

test('P300 OMH 세션 열쇠는 OMH delegation_ledger.ledger_key와 같다(OMH python으로 구한 값)', () => {
  assert.equal(omhLedgerKey('local-' + 'ab'.repeat(32)), 'local-ababababababababababababababababababababab-4ee30d1b9ef2d0e8');
  assert.equal(omhLedgerKey('-_x y.z_-'), 'x_y_z-d32a11bf7bfb967a');
  assert.equal(omhLedgerKey('세션'), 'e600d4f5926e73d4');
  assert.equal(omhLedgerKey('20261121_173108_c7d2d6'), '20261121_173108_c7d2d6-277bcf6618932caa');
  assert.equal(omhHomeOf({ ATRIUM_OMH_HOME: 'C:/o' }), path.resolve('C:/o'));
  assert.equal(omhHomeOf({ OMH_HOME: '~/x' }, { home: 'C:/h' }), path.resolve('C:/h/x'));
  assert.equal(omhHomeOf({}, { home: 'C:/h' }), path.join('C:/h', '.omh'));
});

test('P300 Hermes 위임 진행: 도는 중·끝·실패 섞인 묶음, 다른 세션은 빼고, 끝나면 finished', () => {
  const { home, db, add } = fakeHermes();
  const now = Date.now();
  add('d-old', 'local-a', 'completed', { at: now - 3 * 3600e3, done: now - 3 * 3600e3 + 5000, delivery: 'delivered', task: { goal: '옛 일' } });
  add('d1', 'local-a', 'completed', { at: now - 60000, done: now - 30000, task: { goal: 'TASK: 첫 일\n자세한 설명 [dag:r1/a]' }, result: { status: 'completed' } });
  add('d2', 'local-a', 'running', { at: now - 50000, task: { is_batch: true, goals: ['둘째 일', '셋째 일'], task_indexes: [0, 1] }, result: { results: [{ task_index: 1, status: 'failed' }] } });
  add('d-b', 'local-b', 'running', { at: now - 40000, task: { goal: '남의 일' } });
  let p = hermesDelegationProgress({ id: 'local-a', home, now });
  assert.equal(p.kind, 'delegations');
  assert.deepEqual(p.items.map((x) => [x.name, x.state]), [['첫 일', 'done'], ['둘째 일', 'running'], ['셋째 일', 'failed']], '목표 첫 줄(TASK:·표식 빼고), 묶음의 갈래별 상태');
  assert.deepEqual([p.done, p.total, p.running, p.failed, p.finished], [1, 3, 1, 1, false]);
  assert.equal(p.items[0].endedAt, now - 30000);
  assert.equal(p.key, 'deleg:d1');
  db.prepare("UPDATE async_delegations SET state = 'completed', completed_at = ?, result_json = ? WHERE delegation_id = 'd2'").run(S(now), JSON.stringify({ results: [{ task_index: 0, status: 'completed' }, { task_index: 1, status: 'failed' }] }));
  p = hermesDelegationProgress({ id: 'local-a', home, now });
  assert.equal(p.finished, false, '결과를 아직 넘기지 않았으면 끝나지 않은 것');
  db.prepare("UPDATE async_delegations SET delivery_state = 'delivered'").run();
  p = hermesDelegationProgress({ id: 'local-a', home, now });
  assert.deepEqual([p.done, p.total, p.running, p.failed, p.finished], [2, 3, 0, 1, true]);
  assert.deepEqual(p.items.map((x) => x.name), ['첫 일', '둘째 일', '셋째 일'], '끝나면 가장 늦은 위임 무렵(10분) 것만, 3시간 전 것은 뺀다');
  assert.equal(hermesDelegationProgress({ id: 'local-z', home, now }), null);
  assert.deepEqual(delegationItems({ state: 'running', task_json: '{"goal":"x"}', result_json: null, dispatched_at: 1 }).map((x) => x.state), ['running']);
  db.close();
});

// OMH 기록 표본(조사한 꼴 그대로: omh_dag/v1, 갈래 attempts의 handed_out_at·outcome·settled_at, 원장 children의 dag·started_at·stop)
function omhSample(sid, { now = Date.now(), run = 'textkit-u1' } = {}) {
  const t = S(now);
  const node = (id, label, attempts = [], extra = {}) => ({ id, label, category: 'quick', depends_on: [], write_scope: [], role: 'build', origin: 'define', cycle: 0, prompt: '...', attempts, ...extra });
  const record = { schema_version: 'omh_dag/v1', session_id: sid, run, name: run, goal: 'g', defined_at: t - 300, updated_at: t - 10, cancelled_at: null, repairs: {}, nodes: [
    node('base', '기준선', [{ n: 1, handed_out_at: t - 290, outcome: 'accepted', settled_at: t - 200 }], { role: 'baseline' }),
    node('slug', 'slugify 함수와 시험', [{ n: 1, handed_out_at: t - 190 }]),
    node('count', 'word_count 함수와 시험', [{ n: 1, handed_out_at: t - 190 }]),
    node('wrap', 'wrap_lines 함수와 시험', [{ n: 1, handed_out_at: t - 190 }]),
    node('verify', '통합 검증', [], { role: 'verify', depends_on: ['slug', 'count', 'wrap'] }),
  ] };
  const ledger = { schema_version: 'delegation_ledger/v1', session_id: sid, children: [
    { subagent_id: 's0', child_session_id: 'c0', started_at: t - 285, dag: { run, node: 'base', attempt: 1 }, stop: { status: 'completed', observed_at: t - 210, duration_ms: 75000 } },
    { subagent_id: 's1', child_session_id: 'c1', started_at: t - 185, dag: { run, node: 'slug', attempt: 1 } },
    { subagent_id: 's2', child_session_id: 'c2', started_at: t - 184, dag: { run, node: 'count', attempt: 1 }, stop: { status: 'completed', observed_at: t - 20, duration_ms: 1 } },
    { subagent_id: 'sx', child_session_id: 'cx', started_at: t - 184, dag: { run: 'other', node: 'wrap', attempt: 1 } },
  ] };
  return { record, ledger };
}
function writeOmh(omhHome, sid, record, ledger) {
  const key = omhLedgerKey(sid);
  fs.mkdirSync(path.join(omhHome, 'runtime', 'dag', key), { recursive: true });
  fs.mkdirSync(path.join(omhHome, 'runtime', 'delegation'), { recursive: true });
  fs.writeFileSync(path.join(omhHome, 'runtime', 'dag', key, `${record.run}.json`), JSON.stringify(record));
  if (ledger) fs.writeFileSync(path.join(omhHome, 'runtime', 'delegation', `${key}.json`), JSON.stringify(ledger));
}

test('P300 OMH DAG 진행: 받아들임·도는 하위·돌아와 settle 기다림·아직 하위 없음·기다림, 다른 실행의 하위는 묶지 않는다', () => {
  const now = Date.now();
  const { record, ledger } = omhSample('local-a', { now });
  const p = omhDagProgress(record, ledger.children, { now });
  assert.equal(p.kind, 'dag'); assert.equal(p.key, 'dag:textkit-u1'); assert.equal(p.label, 'textkit-u1');
  assert.deepEqual(p.items.map((x) => [x.name, x.state]), [['기준선', 'done'], ['slugify 함수와 시험', 'running'], ['word_count 함수와 시험', 'running'], ['wrap_lines 함수와 시험', 'running'], ['통합 검증', 'pending']]);
  assert.deepEqual([p.done, p.total, p.running, p.failed, p.finished], [1, 5, 3, 0, false]);
  assert.equal(p.items[0].startedAt, Math.round((S(now) - 285) * 1000), '시작은 묶인 하위의 시작');
  assert.equal(p.items[3].startedAt, Math.round((S(now) - 190) * 1000), '하위가 아직 없으면 나눠 준 때');
  // 실패 하나, 나머지 끝 → 끝(실패 포함)
  const t = S(now);
  record.nodes[1].attempts[0] = { n: 1, handed_out_at: t - 190, outcome: 'accepted', settled_at: t - 5 };
  record.nodes[2].attempts[0] = { n: 1, handed_out_at: t - 190, outcome: 'failed', settled_at: t - 5 };
  record.nodes[3].attempts[0] = { n: 1, handed_out_at: t - 190, outcome: 'accepted', settled_at: t - 5 };
  let q = omhDagProgress(record, ledger.children, { now });
  assert.deepEqual([q.done, q.failed, q.items[4].state, q.finished], [3, 1, 'pending', false], '검증은 실패한 갈래 뒤라 기다림(끝나지 않음)');
  // 고침 묶음이 모두 받아들여지면 뿌리는 고쳐짐(done)
  record.nodes.push({ id: 'count-fix', label: '고침', depends_on: [], write_scope: [], repairs: 'count', attempts: [{ n: 1, handed_out_at: t - 4, outcome: 'accepted', settled_at: t - 2 }] });
  record.repairs = { count: [['count-fix']] };
  record.nodes[4].attempts = [{ n: 1, handed_out_at: t - 2, outcome: 'accepted', settled_at: t - 1 }];
  q = omhDagProgress(record, ledger.children, { now });
  assert.deepEqual([q.done, q.total, q.failed, q.finished], [6, 6, 0, true]);
  // 취소된 실행은 끝(남은 갈래는 취소)
  const c = omhSample('local-a', { now });
  c.record.cancelled_at = t;
  q = omhDagProgress(c.record, c.ledger.children, { now });
  assert.equal(q.finished, true); assert.equal(q.items[1].state, 'cancelled');
  // lost 하위는 다시 나눠 줄 차례
  const l = omhSample('local-a', { now });
  l.ledger.children[1].lost = true;
  assert.equal(omhDagProgress(l.record, l.ledger.children, { now }).items[1].state, 'pending');
  assert.equal(omhDagProgress({ schema_version: 'other' }, []), null);
});

test('P300 hermesProgressOf: 끝나지 않은 OMH 실행이 먼저, 없으면 위임, 기록이 없거나 깨지면 없음(조용히)', () => {
  const now = Date.now();
  const { home, db, add } = fakeHermes();
  const omh = tmp();
  assert.equal(hermesProgressOf({ id: 'local-a', home, omhHome: omh, now }), null, '아무 기록도 없다');
  add('d1', 'local-a', 'running', { at: now - 1000, task: { goal: '[dag:textkit-u1/slug] slug' } });
  assert.equal(hermesProgressOf({ id: 'local-a', home, omhHome: omh, now }).kind, 'delegations');
  const { record, ledger } = omhSample('local-a', { now });
  writeOmh(omh, 'local-a', record, ledger);
  const p = hermesProgressOf({ id: 'local-a', home, omhHome: omh, now });
  assert.equal(p.kind, 'dag', 'OMH 갈래도 Hermes 위임으로 돈다: 끝나지 않은 실행이 있으면 그것을 보인다');
  assert.equal(omhDagRuns({ id: 'local-a', omhHome: omh, now }).length, 1);
  assert.equal(omhLedgerChildren({ id: 'local-a', omhHome: omh }).length, 4);
  assert.equal(omhDagRuns({ id: 'local-a', omhHome: omh, now: now + 7 * 3600e3 }).length, 0, '6시간 넘게 손대지 않은 실행은 뺀다');
  // 깨진 JSON·다른 세션의 기록은 건너뛴다
  const dir = path.join(omh, 'runtime', 'dag', omhLedgerKey('local-a'));
  fs.writeFileSync(path.join(dir, 'broken.json'), '{nope');
  fs.writeFileSync(path.join(dir, 'foreign.json'), JSON.stringify({ ...record, run: 'foreign', session_id: 'local-other' }));
  assert.equal(omhDagRuns({ id: 'local-a', omhHome: omh, now }).length, 1);
  // 원장이 없어도 기록만으로 센다(하위는 아직 없음 → 도는 중)
  fs.rmSync(path.join(omh, 'runtime', 'delegation'), { recursive: true });
  assert.equal(hermesProgressOf({ id: 'local-a', home, omhHome: omh, now }).running, 3);
  // state.db가 없고 OMH도 없으면 없음
  assert.equal(hermesProgressOf({ id: 'local-a', home: path.join(tmp(), 'none'), omhHome: path.join(tmp(), 'none'), now }), null);
  assert.equal(hermesProgressOf({ id: null, home, omhHome: omh }), null);
  db.close();
});

test('P300 진행 꼴 맞추기: 모르는 상태는 기다림, 이름은 한 줄, 빈 목록은 없음', () => {
  const p = shapeProgress({ kind: 'dag', key: 'k', items: [{ name: '줄1\n줄2', state: 'weird' }, { name: 'x'.repeat(200), state: 'done' }] });
  assert.equal(p.items[0].name, '줄1'); assert.equal(p.items[0].state, 'pending');
  assert.ok(p.items[1].name.length <= 80);
  assert.deepEqual([p.done, p.total, p.finished], [1, 2, false]);
  assert.equal(shapeProgress({ kind: 'dag', key: 'k', items: [] }), null);
});

test('P300 진행 읽개 꽂기: busy 칸의 읽개, 실패·없음은 조용히 없음', () => {
  const ok = { kind: 'dag', key: 'k', done: 0, total: 1, running: 1, failed: 0, finished: false, items: [{ name: 'a', state: 'running' }] };
  const off1 = registerProgressReader('p300a', () => { throw new Error('boom'); });
  const off2 = registerProgressReader('p300b', ({ session }) => (session.name === 'x' ? ok : null));
  try {
    assert.equal(progressReadable([{ reader: 'p300b' }]), true);
    assert.equal(progressReadable(['proctree', { reader: 'none' }]), false);
    assert.equal(readProgress([{ reader: 'p300a' }], { session: { name: 'x' } }), null);
    assert.equal(readProgress([{ reader: 'p300a' }, { reader: 'p300b' }], { session: { name: 'x' } }), ok);
    assert.equal(readProgress([{ reader: 'p300b' }], { session: { name: 'y' } }), null);
  } finally { off1(); off2(); }
});

test('P300 보일 값: 도는 것을 본 진행만 끝을 남기고, 한 번 쉰 뒤 다음 턴이 시작되면 지운다', () => {
  const run = (done, finished) => ({ kind: 'dag', key: 'dag:r', done, total: 3, running: finished ? 0 : 1, failed: 0, finished, items: [] });
  let st = stepProgress(null, run(3, true), { working: true });
  assert.equal(st.shown, null, '도는 것을 보지 못한 끝난 진행(판을 다시 띄움 등)은 보이지 않는다');
  st = stepProgress(st, run(0, false), { working: true });
  assert.equal(st.shown.done, 0);
  st = stepProgress(st, run(2, false), { working: false });
  st = stepProgress(st, run(3, true), { working: true });
  assert.equal(st.shown.finished, true, '끝(3/3 끝)을 남긴다');
  st = stepProgress(st, undefined, { working: true });
  assert.equal(st.shown.finished, true, '끝난 턴이 아직 일하는 중이면 둔다');
  st = stepProgress(st, undefined, { working: false });
  assert.ok(st.shown, '쉬는 동안 둔다');
  st = stepProgress(st, run(3, true), { working: true });
  assert.equal(st.shown, null, '다음 턴이 시작되면 지운다');
  st = stepProgress(st, run(3, true), { working: true });
  assert.equal(st.shown, null, '지운 진행은 다시 보이지 않는다');
  st = stepProgress(st, { ...run(0, false), key: 'dag:r2' }, { working: true });
  assert.equal(st.shown.key, 'dag:r2', '새 실행');
  st = stepProgress(st, null, { working: true });
  assert.equal(st.shown, null, '읽기 실패면 없음');
  assert.notEqual(progressSig(run(1, false)), progressSig(run(2, false)));
  assert.equal(progressSig({ ...run(1, false), updatedAt: 5 }), progressSig({ ...run(1, false), updatedAt: 9 }), 'updatedAt만 바뀌면 보내지 않는다');
});

test('P300 판 감시: 일하는 중·바쁠 때만 읽고, 바뀔 때만 요약을 다시 보낸다. 보통 세션은 그대로', () => {
  let cur = null, reads = 0;
  const off = registerProgressReader('p300w', () => { reads++; return cur; });
  try {
    const sent = [];
    const mk = (name, orch) => ({ sessionId: name, name, paneId: name + ':p', kind: 'hermes', orch, rt: newRuntime({ kind: 'hermes', hooked: false }) });
    const h = mk('h', { on: true, busy: [{ reader: 'p300w' }] });
    const plain = mk('plain', null);
    let busy = false;
    const b = { sessions: new Map([['h', h], ['plain', plain]]), sleeper: { innerBusy: () => busy }, broadcastSession: (s, o) => sent.push([s.name, o.cause]), log: () => {} };
    const w = new ProgressWatcher(b, { pollMs: 0 });
    applyTermStatus(h.rt, 'idle'); applyTermStatus(plain.rt, 'working');
    w.poll();
    assert.equal(reads, 0, '쉬고 바쁘지 않으면 읽지 않는다');
    applyTermStatus(h.rt, 'working');
    cur = { kind: 'dag', key: 'dag:r', label: 'r', done: 0, total: 3, running: 1, failed: 0, finished: false, items: [{ name: 'a', state: 'running' }, { name: 'b', state: 'pending' }, { name: 'c', state: 'pending' }], updatedAt: 1 };
    w.poll();
    assert.deepEqual(sent, [['h', 'progress']]);
    assert.equal(w.view(h).done, 0);
    assert.equal(w.view(plain), null, '보통 세션에는 아무것도 없다');
    w.poll(); w.poll();
    assert.equal(sent.length, 1, '같으면 보내지 않는다');
    applyTermStatus(h.rt, 'idle'); busy = true;
    cur = { ...cur, done: 2, running: 1, items: [{ name: 'a', state: 'done' }, { name: 'b', state: 'done' }, { name: 'c', state: 'running' }], updatedAt: 2 };
    w.poll();
    assert.equal(sent.length, 2, '쉬어도 바쁨 신호가 켜져 있으면 읽는다');
    busy = false;
    cur = { ...cur, done: 3, running: 0, finished: true, items: cur.items.map((x) => ({ ...x, state: 'done' })) };
    w.poll();
    assert.equal(w.view(h).finished, true, '보이는 진행이 끝나지 않았으면 쉬어도 읽어 끝을 본다');
    const before = reads;
    w.poll();
    assert.equal(reads, before, '끝난 뒤 쉬는 동안은 읽지 않는다');
    applyTermStatus(h.rt, 'working');
    w.poll();
    assert.equal(w.view(h), null, '다음 턴이 시작되면 지운다');
    assert.equal(sent.filter((x) => x[0] === 'plain').length, 0);
    h.rt.sleep = { at: 1 };
    w.poll();
    assert.equal(w.view(h), null);
  } finally { off(); }
});
