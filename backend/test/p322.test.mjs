// P322 단위 시험: Claude Code 세션의 이번 턴 서브에이전트 진행(읽기 전용). 대화 기록 표본(<세션 ID>/subagents/agent-*.jsonl·meta.json)
// → 갈래 목록·상태·걸린 시간, 지난 턴 갈래 빼기, 끝 판정(meta.finished, SubagentStop hook, 조용한 end_turn), 취소, 중첩, 판 감시(보통 세션에 종류로 꽂기, 끝을 다음 턴까지 두고 지우기)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claudeSubagentProgress, headOf, tailOf, SUB_QUIET_MS } from '../src/claude-subagents.mjs';
import { registerProgressReader, registerKindProgress, progressReadersOf, ProgressWatcher } from '../src/inner-progress.mjs';
import { newRuntime, applyTermStatus, applyHook } from '../src/state.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p322-'));
const iso = (ms) => new Date(ms).toISOString();
// 표본 대화 기록: 맨 위 기록 파일과 그 옆 subagents 폴더
function fakeConvo() {
  const dir = tmp();
  const id = '11111111-2222-3333-4444-555555555555';
  const transcript = path.join(dir, id + '.jsonl');
  fs.writeFileSync(transcript, '{}\n');
  const sub = path.join(dir, id, 'subagents');
  fs.mkdirSync(sub, { recursive: true });
  const add = (aid, { at, prompt = 'do it', meta = null, last = null, mtime = null }) => {
    const lines = [JSON.stringify({ parentUuid: null, isSidechain: true, agentId: aid, type: 'user', message: { role: 'user', content: prompt }, timestamp: iso(at) })];
    if (last) lines.push(JSON.stringify({ type: 'assistant', agentId: aid, message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }], stop_reason: last.stop }, timestamp: iso(last.at) }));
    if (last && last.hook) lines.push(JSON.stringify({ type: 'attachment', attachment: { type: 'hook_success', hookEvent: 'SubagentStop' }, timestamp: iso(last.at + 50) }));
    const f = path.join(sub, `agent-${aid}.jsonl`);
    fs.writeFileSync(f, lines.join('\n') + '\n');
    if (meta) fs.writeFileSync(path.join(sub, `agent-${aid}.meta.json`), JSON.stringify(meta));
    if (mtime) fs.utimesSync(f, new Date(mtime), new Date(mtime));
    return f;
  };
  return { transcript, add, sub };
}

test('P322 첫 줄·끝 조각 읽기: 시작 시각과 첫 사용자 글, 마지막 assistant가 턴을 마쳤나', () => {
  const h = headOf(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '결제 경로 찾기\n자세히' }] }, timestamp: '2026-11-23T01:00:00.000Z' }) + '\n{"x":1}');
  assert.equal(h.startedAt, Date.parse('2026-11-23T01:00:00.000Z'));
  assert.match(h.prompt, /^결제 경로 찾기/);
  assert.deepEqual(headOf('not json'), { startedAt: null, prompt: null });
  const t1 = tailOf(['{"broken', JSON.stringify({ type: 'assistant', message: { stop_reason: 'end_turn' }, timestamp: '2026-11-23T01:00:05.000Z' })].join('\n'));
  assert.equal(t1.ended, true);
  assert.equal(t1.lastAt, Date.parse('2026-11-23T01:00:05.000Z'));
  assert.equal(tailOf(JSON.stringify({ type: 'assistant', message: { stop_reason: 'tool_use' } })).ended, false, '도구를 부르는 중이면 끝이 아니다');
  assert.equal(tailOf([JSON.stringify({ type: 'assistant', message: { stop_reason: 'end_turn' } }), JSON.stringify({ type: 'user', message: { role: 'user', content: 'tool result' } })].join('\n')).ended, false, '뒤에 도구 결과가 오면 아직 돈다');
  assert.equal(tailOf(JSON.stringify({ type: 'attachment', attachment: { hookEvent: 'SubagentStop' } })).hookStop, true);
});

test('P322 이번 턴 서브에이전트: 도는 중·끝·취소, 이름(설명, 없으면 첫 줄), 중첩 ↳, 지난 턴은 빼고 시작 순으로', () => {
  const { transcript, add } = fakeConvo();
  const now = Date.now();
  const turn = now - 120000;
  add('old', { at: turn - 600000, meta: { description: '지난 턴 일', finished: true }, mtime: turn - 500000 });
  add('a1', { at: turn + 1000, meta: { description: '결제 실패 경로 찾기', spawnDepth: 1 } });
  add('a2', { at: turn + 2000, meta: { description: '환불 시험 목록', spawnDepth: 1 } });
  add('a3', { at: turn + 3000, meta: { description: '로그 형식 확인', finished: true }, last: { at: turn + 24000, stop: 'end_turn' }, mtime: turn + 24000 });
  add('a4', { at: turn + 4000, prompt: '설명 없는 갈래\n둘째 줄', meta: { stoppedByUser: true, parentAgentId: 'a1', spawnDepth: 2 }, mtime: turn + 9000 });
  const p = claudeSubagentProgress({ transcript, turnStartedAt: turn, now });
  assert.equal(p.kind, 'subagents');
  assert.equal(p.key, `sub:${turn + 1000}`, '열쇠는 가장 이른 갈래의 시작');
  assert.deepEqual(p.items.map((x) => [x.name, x.state]), [['결제 실패 경로 찾기', 'running'], ['환불 시험 목록', 'running'], ['로그 형식 확인', 'done'], ['↳ 설명 없는 갈래', 'cancelled']]);
  assert.deepEqual([p.done, p.total, p.running, p.failed, p.finished], [2, 4, 2, 0, false]);
  assert.equal(p.items[2].startedAt, turn + 3000);
  assert.equal(p.items[2].endedAt, turn + 24000, '끝 시각은 기록의 고친 때');
  assert.equal(p.items[0].endedAt, null);
  const later = claudeSubagentProgress({ transcript, turnStartedAt: now + 60000, now });
  assert.deepEqual(later.items.map((x) => x.name), ['결제 실패 경로 찾기', '환불 시험 목록', '로그 형식 확인', '↳ 설명 없는 갈래'], '갈래가 아직 돌면 다음 턴에도 묶음(그 뒤에 시작한 형제 포함)이 남는다');
  assert.equal(later.key, p.key);
  assert.equal(claudeSubagentProgress({ transcript: path.join(path.dirname(transcript), 'none.jsonl'), turnStartedAt: turn, now }), null, '폴더가 없으면 없음');
  assert.equal(claudeSubagentProgress({ transcript: null }), null);
});

test('P322 끝 판정: SubagentStop hook(agent_id), 조용한 end_turn, 도구 중이면 계속 도는 중. 끝난 갈래는 캐시로 다시 읽지 않는다', () => {
  const { transcript, add } = fakeConvo();
  const now = Date.now();
  const turn = now - 120000;
  add('b1', { at: turn + 1000, meta: { description: 'hook으로 끝' } });
  add('b2', { at: turn + 2000, meta: { description: '조용한 끝' }, last: { at: turn + 30000, stop: 'end_turn' }, mtime: now - SUB_QUIET_MS - 5000 });
  add('b3', { at: turn + 3000, meta: { description: '방금 끝난 듯' }, last: { at: now - 1000, stop: 'end_turn' }, mtime: now - 1000 });
  add('b4', { at: turn + 4000, meta: { description: '도구 기다림' }, last: { at: turn + 5000, stop: 'tool_use' }, mtime: now - 60000 });
  const cache = new Map();
  const p = claudeSubagentProgress({ transcript, turnStartedAt: turn, now, stops: new Set(['b1']), cache });
  assert.deepEqual(p.items.map((x) => x.state), ['done', 'done', 'running', 'running']);
  assert.equal(p.items[1].endedAt, turn + 30000, '조용한 끝은 마지막 줄 시각');
  // 끝난 갈래의 meta를 지워도 캐시가 끝으로 둔다
  const sub = path.join(path.dirname(transcript), path.basename(transcript, '.jsonl'), 'subagents');
  fs.writeFileSync(path.join(sub, 'agent-b3.meta.json'), JSON.stringify({ description: '방금 끝난 듯', finished: true }));
  const q = claudeSubagentProgress({ transcript, turnStartedAt: turn, now, cache });
  assert.deepEqual(q.items.map((x) => x.state), ['done', 'done', 'done', 'running']);
  assert.equal(q.items[0].state, 'done', 'stops가 없어도 캐시의 끝은 남는다');
});

test('P322 백그라운드 서브에이전트: 끝 알림이 새 턴을 열어도 같은 묶음(열쇠 그대로), 다 끝난 뒤 새 턴이면 없음, 오래 멈춘 지난 갈래는 뺀다', () => {
  const { transcript, add } = fakeConvo();
  const now = Date.now();
  const t1 = now - 120000;
  add('g1', { at: t1 + 1000, meta: { description: '긴 일 하나' } });
  add('g2', { at: t1 + 1100, meta: { description: '긴 일 둘' } });
  add('g3', { at: t1 + 1200, meta: { description: '짧은 일', finished: true }, mtime: now - 30000 });
  add('stale', { at: t1 - 3 * 3600e3, meta: { description: '꺼진 세션의 갈래' }, last: { at: t1 - 3 * 3600e3, stop: 'tool_use' }, mtime: t1 - 3 * 3600e3 });
  const cache = new Map();
  const a = claudeSubagentProgress({ transcript, turnStartedAt: t1, now, cache });
  // 짧은 일이 끝나 알림 턴이 열렸다
  const t2 = now - 29000;
  const b = claudeSubagentProgress({ transcript, turnStartedAt: t2, now, cache });
  assert.equal(b.key, a.key, '같은 묶음');
  assert.deepEqual(b.items.map((x) => [x.name, x.state]), [['긴 일 하나', 'running'], ['긴 일 둘', 'running'], ['짧은 일', 'done']]);
  assert.deepEqual([b.done, b.total, b.finished], [1, 3, false]);
  const sub = path.join(path.dirname(transcript), path.basename(transcript, '.jsonl'), 'subagents');
  // 긴 일 하나만 끝나 또 알림 턴이 열렸다: 앞서 끝난 짧은 일도 묶음에 남는다
  fs.writeFileSync(path.join(sub, 'agent-g1.meta.json'), JSON.stringify({ description: '긴 일 하나', finished: true }));
  fs.utimesSync(path.join(sub, 'agent-g1.jsonl'), new Date(now - 15000), new Date(now - 15000));
  const t3 = now - 20000;
  const b3 = claudeSubagentProgress({ transcript, turnStartedAt: t3, now, cache });
  assert.deepEqual(b3.items.map((x) => [x.name, x.state]), [['긴 일 하나', 'done'], ['긴 일 둘', 'running'], ['짧은 일', 'done']]);
  assert.equal(b3.key, a.key);
  // 둘 다 끝나고 한참 뒤 새 턴
  for (const g of ['g2']) { fs.writeFileSync(path.join(sub, `agent-${g}.meta.json`), JSON.stringify({ description: g, finished: true })); fs.utimesSync(path.join(sub, `agent-${g}.jsonl`), new Date(now - 10000), new Date(now - 10000)); }
  const c = claudeSubagentProgress({ transcript, turnStartedAt: t3, now, cache });
  assert.deepEqual([c.done, c.total, c.finished, c.key], [3, 3, true, a.key]);
  assert.equal(claudeSubagentProgress({ transcript, turnStartedAt: now - 1000, now, cache }), null, '다 끝난 뒤의 새 턴에는 없음');
});

test('P322 SubagentStop hook은 상태를 바꾸지 않고 agent_id만 적는다', () => {
  const rt = newRuntime();
  applyHook(rt, { hook_event_name: 'UserPromptSubmit', prompt: 'go' }, 1000);
  applyHook(rt, { hook_event_name: 'SubagentStop', agent_id: 'abc' }, 2000);
  applyHook(rt, { hook_event_name: 'SubagentStop' }, 2100);
  assert.deepEqual(rt.subStops, ['abc']);
  assert.equal(rt.turn.startedAt, 1000);
  assert.equal(rt.turn.endedAt, null);
});

test('P322 판 감시: 보통 Claude Code 세션에 종류 읽개로 꽂혀 칩 0/3 → 3/3, 끝을 다음 턴까지 두고 지운다. 오케스트레이션 세션은 busy 칸 그대로', () => {
  const { transcript, add } = fakeConvo();
  const base = Date.now() - 300000;
  const offR = registerProgressReader('claude-subagents-p322', ({ session: s, now }) => claudeSubagentProgress({ transcript, turnStartedAt: s.rt.turn.startedAt, now, stops: new Set(s.rt.subStops || []) }));
  const offK = registerKindProgress('claude', 'claude-subagents-p322');
  try {
    const c = { sessionId: 'c', name: 'c', kind: 'claude', paneId: 'p1', rt: newRuntime(), orch: null };
    const sh = { sessionId: 'sh', name: 'sh', kind: 'shell', paneId: 'p2', rt: newRuntime(), orch: null };
    const o = { sessionId: 'o', name: 'o', kind: 'hermes', paneId: 'p3', rt: newRuntime(), orch: { on: true, busy: [{ reader: 'nope' }] } };
    assert.deepEqual(progressReadersOf(c), [{ reader: 'claude-subagents-p322' }]);
    assert.deepEqual(progressReadersOf(sh), [], '셸은 종류 읽개가 없다');
    assert.deepEqual(progressReadersOf(o), [{ reader: 'nope' }], '오케스트레이션 세션은 busy 칸');
    assert.deepEqual(progressReadersOf({ kind: 'claude', orch: { on: false } }), [], '오케스트레이션을 끈 세션은 읽지 않는다');
    const sent = [];
    const b = { sessions: new Map([[c.sessionId, c], [sh.sessionId, sh], [o.sessionId, o]]), sleeper: null, log() {}, broadcastSession: (s, x) => sent.push([s.sessionId, x.cause]) };
    const w = new ProgressWatcher(b, { pollMs: 0 });
    applyHook(c.rt, { hook_event_name: 'UserPromptSubmit', prompt: 'three subagents' }, base);
    applyTermStatus(c.rt, 'working');
    w.poll(base + 1000);
    assert.equal(w.view(c), null, '아직 서브에이전트가 없다');
    for (const [i, d] of ['A', 'B', 'C'].entries()) add('s' + i, { at: base + 2000 + i * 100, meta: { description: '갈래 ' + d } });
    w.poll(base + 3000);
    assert.deepEqual([w.view(c).done, w.view(c).total, w.view(c).running], [0, 3, 3]);
    assert.deepEqual(sent, [['c', 'progress']]);
    applyHook(c.rt, { hook_event_name: 'SubagentStop', agent_id: 's0' }, base + 4000);
    w.poll(base + 5000);
    assert.deepEqual([w.view(c).done, w.view(c).running], [1, 2]);
    applyHook(c.rt, { hook_event_name: 'SubagentStop', agent_id: 's1' }, base + 6000);
    applyHook(c.rt, { hook_event_name: 'SubagentStop', agent_id: 's2' }, base + 6000);
    w.poll(base + 7000);
    assert.equal(w.view(c).finished, true);
    assert.deepEqual([w.view(c).done, w.view(c).total], [3, 3]);
    applyHook(c.rt, { hook_event_name: 'Stop', last_assistant_message: 'done' }, base + 8000);
    applyTermStatus(c.rt, 'idle');
    w.poll(base + 9000); w.poll(base + 10000);
    assert.equal(w.view(c).finished, true, '턴이 끝나도 다음 턴까지 "3/3 끝"');
    applyHook(c.rt, { hook_event_name: 'UserPromptSubmit', prompt: 'next' }, base + 20000);
    applyTermStatus(c.rt, 'working');
    w.poll(base + 21000);
    assert.equal(w.view(c), null, '다음 턴이 시작되면 지운다');
    assert.equal(sent.filter((x) => x[0] === 'sh').length, 0);
    c.rt.sleep = { at: 1 };
    w.poll(base + 22000);
    assert.equal(w.view(c), null);
  } finally { offK(); offR(); }
});
