// P326 단위 시험: Codex 세션의 이번 턴 서브에이전트 진행(읽기 전용). rollout 표본(하위 둘·guardian 하나·다른 부모 하나·지난 기록 .zst)
// → 하위 둘만, 이름(agent_path 끝 마디 + 별명), 끝 판정(task_complete, turn_aborted, 조용한 final_answer), 물려받은 기록은 보지 않기, 종류로 꽂기
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexSubagentProgress, codexSubMeta, codexSubTail, uuidTime, codexDayDirs } from '../src/codex-subagents.mjs';
import { registerKindProgress, progressReadersOf, registerProgressReader, progressReadable } from '../src/inner-progress.mjs';
import { codexSessionOf } from '../src/harness.mjs';

const iso = (ms) => new Date(ms).toISOString();
// UUIDv7 꼴 ID(만든 때 ms + 꼬리)
const v7 = (ms, tail) => { const h = ms.toString(16).padStart(12, '0'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-7${tail.slice(0, 3)}-8${tail.slice(3, 6)}-${tail.slice(6, 18).padEnd(12, '0')}`; };
const meta = (o) => JSON.stringify({ timestamp: iso(o.at), ordinal: 0, type: 'session_meta', payload: o.payload });
const ev = (ord, at, type, extra = {}) => JSON.stringify({ timestamp: iso(at), ordinal: ord, type: 'event_msg', payload: { type, ...extra } });
const answer = (ord, at, text) => JSON.stringify({ timestamp: iso(at), ordinal: ord, type: 'response_item', payload: { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text }] } });
const spawnMeta = ({ id, root, parent, at, path: p, nick, depth = 1, from = 3, cwd = 'C:\\x' }) => meta({ at, payload: { session_id: root, id, forked_from_id: parent, parent_thread_id: parent, timestamp: iso(at), cwd, originator: 'codex-tui', source: { subagent: { thread_spawn: { parent_thread_id: parent, depth, agent_path: p, agent_nickname: nick, agent_role: null } } }, thread_source: 'subagent', agent_nickname: nick, agent_path: p, subagent_history_start_ordinal: from } });

function fakeHome(now) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p326-'));
  const dir = codexDayDirs(home, now)[0];
  fs.mkdirSync(dir, { recursive: true });
  const put = (name, lines, mtime) => { const f = path.join(dir, name); fs.writeFileSync(f, lines.join('\n') + '\n'); if (mtime) fs.utimesSync(f, new Date(mtime), new Date(mtime)); return f; };
  return { home, dir, put };
}

test('P326 머리·끝 읽기: thread_spawn만 하위로, guardian은 빼고, 물려받은 기록의 끝 표시는 보지 않는다', () => {
  const at = Date.parse('2026-11-23T04:15:39.820Z');
  const h = codexSubMeta(spawnMeta({ id: 'C', root: 'R', parent: 'R', at, path: '/root/alpha', nick: 'Hooke', from: 17 }) + '\n{"x":1}');
  assert.deepEqual({ ...h }, { id: 'c', root: 'r', parent: 'r', depth: 1, nickname: 'Hooke', task: 'alpha', startedAt: at, fromOrdinal: 17 });
  const guardian = meta({ at, payload: { id: 'g', session_id: 'r', parent_thread_id: 'r', source: { subagent: { other: 'guardian' } }, thread_source: 'guardian_review' } });
  assert.equal(codexSubMeta(guardian), null, 'guardian(명령 승인 검토)은 칩에 넣지 않는다');
  assert.equal(codexSubMeta(meta({ at, payload: { id: 'r', source: 'cli', thread_source: 'user' } })), null, '맨 위 스레드');
  assert.equal(codexSubMeta('not json'), null);
  // 물려받은 기록(ordinal < 시작)의 turn_aborted는 보지 않는다
  const inherited = [ev(5, at, 'task_started'), ev(8, at, 'turn_aborted')];
  assert.equal(codexSubTail([...inherited, ev(17, at + 1, 'task_started'), answer(18, at + 2, 'alpha')].join('\n'), 17).state, null, '자기 몫에 끝 표시가 없으면 아직 돈다');
  assert.equal(codexSubTail([...inherited, ev(17, at + 1, 'task_started'), answer(18, at + 2, 'alpha')].join('\n'), 17).answered, true);
  const done = codexSubTail(['{"broken', ...inherited, ev(17, at + 1, 'task_started'), answer(18, at + 2, 'alpha'), ev(19, at + 3, 'task_complete', { last_agent_message: 'alpha' })].join('\n'), 17);
  assert.equal(done.state, 'done'); assert.equal(done.lastAt, at + 3);
  assert.equal(codexSubTail([ev(17, at, 'task_started'), ev(18, at + 1, 'turn_aborted')].join('\n'), 17).state, 'cancelled');
  assert.equal(codexSubTail([ev(17, at, 'task_complete'), ev(18, at + 1, 'task_started')].join('\n'), 17).state, null, '다시 일을 받으면 다시 돈다');
  assert.equal(uuidTime('01a2069d-bfb5-72d0-908c-5aeacbe589a0'), 0x01a2069dbfb5);
  assert.equal(uuidTime('11111111-2222-4333-8444-555555555555'), null, 'v7이 아니면 모른다');
});

test('P326 이번 턴 Codex 서브에이전트: 하위 둘만(guardian·다른 부모·.zst·지난 턴 빼고), 이름, 끝 판정, 중첩 ↳', () => {
  const now = Date.now();
  const turn = now - 60000;
  const { home, put } = fakeHome(now);
  const R = v7(now - 600000, 'aaa111aaa111aaa111');
  const OTHER = v7(now - 500000, 'bbb222bbb222bbb222');
  put(`rollout-x-${R}.jsonl`, [meta({ at: now - 600000, payload: { id: R, session_id: R, source: 'cli', thread_source: 'user', cwd: 'C:\\x' } })]);
  const A = v7(turn + 1000, 'c01c01c01c01c01c01'), B = v7(turn + 2000, 'c02c02c02c02c02c02'), N = v7(turn + 3000, 'c03c03c03c03c03c03');
  const G = v7(turn + 1500, 'd01d01d01d01d01d01'), X = v7(turn + 1600, 'e01e01e01e01e01e01'), OLD = v7(now - 400000, 'f01f01f01f01f01f01');
  put(`rollout-a-${A}.jsonl`, [spawnMeta({ id: A, root: R, parent: R, at: turn + 1000, path: '/root/alpha', nick: 'Hooke' }), ev(3, turn + 1100, 'task_started'), answer(4, turn + 5000, 'alpha'), ev(5, turn + 5100, 'task_complete')]);
  put(`rollout-b-${B}.jsonl`, [spawnMeta({ id: B, root: R, parent: R, at: turn + 2000, path: '/root/beta', nick: 'Carver' }), ev(3, turn + 2100, 'task_started')]);
  // 중첩: beta가 띄운 하위(parent는 B, session_id는 R)
  put(`rollout-n-${N}.jsonl`, [spawnMeta({ id: N, root: R, parent: B, at: turn + 3000, path: '/root/beta/gamma', nick: 'Noether', depth: 2 }), ev(3, turn + 3100, 'task_started')]);
  put(`rollout-g-${G}.jsonl`, [meta({ at: turn + 1500, payload: { id: G, session_id: R, parent_thread_id: R, source: { subagent: { other: 'guardian' } }, thread_source: 'guardian_review' } }), ev(1, turn + 1600, 'task_started')]);
  put(`rollout-o-${X}.jsonl`, [spawnMeta({ id: X, root: OTHER, parent: OTHER, at: turn + 1600, path: '/root/other', nick: 'Other' }), ev(3, turn + 1700, 'task_started')]);
  put(`rollout-z-${OLD}.jsonl.zst`, ['zstd']);
  // 지난 턴에 끝난 하위(오래 그대로)
  const P = v7(now - 300000, 'a0aa0aa0aa0aa0aa0a');
  put(`rollout-p-${P}.jsonl`, [spawnMeta({ id: P, root: R, parent: R, at: now - 300000, path: '/root/past', nick: 'Past' }), ev(3, now - 299000, 'task_complete')], now - 2 * 3600000);
  const cache = new Map();
  const p = codexSubagentProgress({ threadId: R, home, turnStartedAt: turn, now, cache });
  assert.ok(p, '진행이 있다');
  assert.equal(p.kind, 'subagents');
  assert.deepEqual(p.items.map((x) => [x.name, x.state]), [['alpha (Hooke)', 'done'], ['beta (Carver)', 'running'], ['↳ gamma (Noether)', 'running']]);
  assert.equal(p.total, 3); assert.equal(p.done, 1); assert.equal(p.running, 2); assert.equal(p.finished, false);
  assert.equal(p.items[0].endedAt, turn + 5100);
  assert.equal(cache.get(path.join(codexDayDirs(home, now)[0], `rollout-g-${G}.jsonl`)), false, 'guardian 파일은 우리 것이 아니라고 기억한다(다시 열지 않는다)');
  // 끝: beta는 task_complete, gamma는 조용한 final_answer(QUIET 넘게 그대로)
  put(`rollout-b-${B}.jsonl`, [spawnMeta({ id: B, root: R, parent: R, at: turn + 2000, path: '/root/beta', nick: 'Carver' }), ev(3, turn + 2100, 'task_started'), ev(4, turn + 9000, 'task_complete')]);
  put(`rollout-n-${N}.jsonl`, [spawnMeta({ id: N, root: R, parent: B, at: turn + 3000, path: '/root/beta/gamma', nick: 'Noether', depth: 2 }), ev(3, turn + 3100, 'task_started'), answer(4, turn + 8000, 'gamma')], now - 30000);
  const q = codexSubagentProgress({ threadId: R, home, turnStartedAt: turn, now, cache });
  assert.deepEqual(q.items.map((x) => x.state), ['done', 'done', 'done']);
  assert.equal(q.finished, true); assert.equal(q.key, p.key, '같은 묶음');
  // 다른 판 세션(OTHER)에서는 그 하위 하나만
  const o = codexSubagentProgress({ threadId: OTHER, home, turnStartedAt: turn, now });
  assert.deepEqual(o.items.map((x) => x.name), ['other (Other)']);
  // 다음 턴(하위 없음): 지난 턴에 끝난 것은 보이지 않는다
  assert.equal(codexSubagentProgress({ threadId: R, home, turnStartedAt: now + 5000, now: now + 6000, cache }), null);
  assert.equal(codexSubagentProgress({ threadId: null, home }), null);
  assert.equal(codexSubagentProgress({ threadId: R, home: path.join(home, 'none') }), null);
});

test('P326 옛 꼴 파일 이름 <부모>_<자식>: 다른 부모는 머리를 열지 않고 거른다', () => {
  const now = Date.now();
  const turn = now - 30000;
  const { home, put } = fakeHome(now);
  const R = v7(now - 100000, 'aaa111aaa111aaa111'), OTHER = v7(now - 90000, 'bbb111bbb111bbb111');
  const A = v7(turn + 1000, 'c01c01c01c01c01c01'), X = v7(turn + 1000, 'c09c09c09c09c09c09');
  put(`rollout-a-${R}_${A}.jsonl`, [spawnMeta({ id: A, root: R, parent: R, at: turn + 1000, path: '/root/a', nick: 'Ada' }), ev(3, turn + 1100, 'task_started')]);
  const xf = put(`rollout-x-${OTHER}_${X}.jsonl`, ['not json at all, would be cached false if opened']);
  const cache = new Map();
  const p = codexSubagentProgress({ threadId: R, home, turnStartedAt: turn, now, cache });
  assert.deepEqual(p.items.map((x) => x.name), ['a (Ada)']);
  assert.equal(cache.has(xf), false, '다른 부모의 파일은 열지 않았다');
});

test('P326 Codex 세션 찾기(codexSessionOf)는 같은 폴더의 하위 스레드 rollout을 판 세션의 스레드로 잡지 않는다', () => {
  const now = Date.now();
  const { home, put } = fakeHome(now);
  const cwd = path.join(os.tmpdir(), 'mtask-p326-cwd');
  const R = v7(now - 5000, 'aaa111aaa111aaa111'), A = v7(now - 1000, 'c01c01c01c01c01c01');
  // 하위가 since에 더 가깝게 생겨도 맨 위 스레드를 고른다
  put(`rollout-r-${R}.jsonl`, [meta({ at: now - 5000, payload: { id: R, session_id: R, cwd, source: 'cli', thread_source: 'user' } })]);
  put(`rollout-a-${A}.jsonl`, [spawnMeta({ id: A, root: R, parent: R, at: now - 1000, path: '/root/a', nick: 'Ada', cwd })]);
  assert.equal(codexSessionOf({ cwd, since: now - 1000, home, now }), R);
});

test('P326 Codex 세션은 종류로 codex-subagents 읽개를 쓴다(오케스트레이션 세션은 busy 칸 그대로)', () => {
  const off = registerKindProgress('codex', 'codex-subagents');
  const offR = registerProgressReader('codex-subagents', () => null);
  try {
    assert.deepEqual(progressReadersOf({ kind: 'codex' }), [{ reader: 'codex-subagents' }]);
    assert.equal(progressReadable(progressReadersOf({ kind: 'codex' })), true);
    assert.deepEqual(progressReadersOf({ kind: 'codex', orch: { on: false } }), [], '오케스트레이션 세션은 busy 칸만');
  } finally { off(); offR(); }
});
