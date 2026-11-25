// P367: SDK 세션 노드 얼굴의 순수 함수. 대화 기록 묶기(연속 도구 호출은 한 묶음, 결과는 그 호출에, 백그라운드 끝남 알림, 끝부분만), 묶음 한 줄,
//   도구 요점, 지금 하는 일 한 줄(도구·생각 중·백그라운드), 토큰·금액 글
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildItems, groupLine, toolGist, taskNote, nowOf, nowShort, bgLine, elapsed, tok, money, inputHead } from '../src/renderer/lib/sdk-face.js';

const t = (k, v = {}) => `${k}${Object.keys(v).length ? JSON.stringify(v) : ''}`;

test('대화 기록 묶기: 연속 도구 호출은 한 묶음, 결과는 tool_use_id로 그 호출에, 글이 끼면 새 묶음', () => {
  const msgs = [
    { seq: 1, role: 'user', text: 'do it' },
    { seq: 2, role: 'tool_use', tool: 'Read', toolUseId: 'a', input: { file_path: 'C:/r/README.md' } },
    { seq: 3, role: 'tool_use', tool: 'Bash', toolUseId: 'b', input: { command: 'git log --oneline -3' } },
    { seq: 4, role: 'tool_result', toolUseId: 'a', text: '# readme', isError: false },
    { seq: 5, role: 'tool_result', toolUseId: 'b', text: 'fatal: x', isError: true },
    { seq: 6, role: 'tool_use', tool: 'Edit', toolUseId: 'c', input: { file_path: 'C:/r/notes.txt' } },
    { seq: 7, role: 'tool_result', toolUseId: 'c', text: 'ok' },
    { seq: 8, role: 'assistant', text: '## Summary\n- did' },
    { seq: 9, role: 'tool_use', tool: 'Read', toolUseId: 'd', input: { file_path: 'x' } },
  ];
  const it = buildItems(msgs);
  assert.deepEqual(it.map((x) => x.type), ['user', 'tools', 'assistant', 'tools']);
  assert.equal(it[1].calls.length, 3, '결과가 사이에 껴도 연속 호출은 한 묶음');
  assert.deepEqual(it[1].calls.map((c) => [c.tool, c.gist, c.result && c.result.isError]), [['Read', 'C:/r/README.md', false], ['Bash', 'git log --oneline -3', true], ['Edit', 'C:/r/notes.txt', false]]);
  assert.equal(it[3].calls[0].result, null, '아직 결과 없음');
  const g = groupLine(it[1].calls);
  assert.equal(g.head, 'Read · Bash · Edit');
  assert.equal(g.gists, 'README.md, git log --oneline -3, notes.txt');
  assert.equal(groupLine([{ tool: 'Read', gist: 'a' }, { tool: 'Read', gist: 'b' }]).head, 'Read 2');
});

test('백그라운드 끝남 알림은 따로 한 줄, 긴 대화는 끝부분만(앞은 수로)', () => {
  const note = '<task-notification>\n<task-id>x</task-id>\n<status>completed</status>\n<summary>Agent "wait" finished</summary>\n</task-notification>';
  assert.deepEqual(taskNote(note), { summary: 'Agent "wait" finished', status: 'completed' });
  assert.equal(taskNote('hello'), null);
  assert.deepEqual(buildItems([{ seq: 1, role: 'user', text: note }]).map((x) => x.type), ['bgdone']);
  const many = Array.from({ length: 100 }, (_, i) => ({ seq: i, role: i % 2 ? 'assistant' : 'user', text: `m${i}` }));
  const it = buildItems(many, { max: 10 });
  assert.equal(it.length, 10);
  assert.deepEqual([it[0].type, it[0].n], ['more', 91]);
  assert.equal(it[9].text, 'm99');
});

test('도구 요점과 입력 앞부분', () => {
  assert.equal(toolGist('Agent', { description: 'Judge units', prompt: 'p' }), 'Judge units');
  assert.equal(toolGist('Grep', { pattern: 'foo', path: 'src' }), 'foo @ src');
  assert.equal(toolGist('Bash', { command: 'a\n  b' }), 'a b');
  assert.equal(inputHead({ command: 'npm test' }), 'npm test');
  assert.ok(inputHead({ x: 'y'.repeat(2000) }).length <= 601);
});

test('지금 하는 일: 일하는 중이면 도구(요점)·생각 중·답 쓰는 중, 쉬면 백그라운드 일, 아무것도 없으면 null', () => {
  const now = 100000;
  const s = { state: 'working', sdkFace: { now: { kind: 'tool', tool: 'Bash', gist: 'npm test', since: now - 65000 } } };
  assert.deepEqual(nowOf(s, t), { kind: 'tool', text: 'Bash: npm test', since: now - 65000 });
  assert.equal(nowShort(s, t, now), 'Bash: npm test · 1m 05s');
  assert.equal(nowOf({ state: 'working', sdkFace: { now: { kind: 'thinking', since: 1 } } }, t).text, 'sdkFace.thinking');
  assert.equal(nowOf({ state: 'working', sdkFace: { now: null }, turn: { startedAt: 5 } }, t).since, 5);
  const idleBg = { state: 'ready', sdkFace: { now: null, bg: { n: 2, agents: 1, shells: 1 } } };
  assert.equal(nowOf(idleBg, t).kind, 'bg');
  assert.equal(bgLine(idleBg.sdkFace.bg, t), 'sdkFace.bg{"n":2,"kinds":"sdkFace.bgAgents{\\"n\\":1} · sdkFace.bgShells{\\"n\\":1}"}');
  assert.equal(nowOf({ state: 'ready', sdkFace: { now: null, bg: null } }, t), null);
  assert.equal(nowOf({ state: 'working' }, t), null, 'SDK 얼굴 값이 없는 세션');
});

test('토큰·금액·경과 글', () => {
  assert.deepEqual([tok(950), tok(37406), tok(1500), tok(2300000)], ['950', '37k', '1.5k', '2.3M']);
  assert.deepEqual([money(0.01173826), money(1.234), money(0.0004), money(0)], ['$0.012', '$1.23', '<$0.001', '$0.000']);
  assert.deepEqual([elapsed(12000), elapsed(185000), elapsed(3725000)], ['12s', '3m 05s', '1h 02m']);
});
