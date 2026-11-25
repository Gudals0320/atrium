// P367: SDK 세션의 백그라운드 일 지키기(신호별: stream 목록, hook 목록, 띄운 도구 결과만), 끝나면 끔, 스스로 도는 턴,
//   도구 요점, 턴 토큰·금액과 누계, 권한·질문 hook이 응답 필요(waiting)를 만들지 않음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SdkHost, SDK_LAUNCHER_ID, readStreamEvent, applyStreamEvent, sdkHookGuard } from '../src/sdk-session.mjs';
import { toolGist, bgLaunchOf, sdkBackground, applyBgEvent, turnUsage, addTurnUsage, usageCost, faceView, bgView, SDK_BG_MAX_MS } from '../src/sdk-face.mjs';
import { newRuntime, deriveState, applyHook } from '../src/state.mjs';
import { steerBlock } from '../src/delivery.mjs';
import { Store } from '../src/store.mjs';
import { Backend } from '../src/backend.mjs';
import { Launchers } from '../src/launchers.mjs';
import { DEFAULTS } from '../src/settings.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'p367-'));
const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'p367-fake-claude.mjs');
const until = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } throw new Error('timeout'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sdkRt = () => { const rt = newRuntime({ kind: 'claude', hooked: true }); rt.term.present = true; rt.term.status = 'idle'; rt.phase = 'running'; return rt; };

test('도구 요점: 파일 경로, 명령 앞부분, 서브에이전트 설명, 찾은 글과 폴더, 주소', () => {
  assert.equal(toolGist('Read', { file_path: 'C:/x/a.md' }), 'C:/x/a.md');
  assert.equal(toolGist('Edit', { file_path: 'C:/x/b.js', old_string: 'a', new_string: 'b' }), 'C:/x/b.js');
  assert.equal(toolGist('Bash', { command: 'git   log\n --oneline -3', description: 'log' }), 'git log --oneline -3');
  assert.equal(toolGist('Agent', { description: 'Judge units', prompt: 'long…' }), 'Judge units');
  assert.equal(toolGist('Grep', { pattern: 'foo', path: 'src' }), 'foo @ src');
  assert.equal(toolGist('WebFetch', { url: 'https://example.com', prompt: 'x' }), 'https://example.com');
  assert.equal(toolGist('TodoWrite', { todos: [{}, {}] }), '2 todos');
  assert.ok(toolGist('Bash', { command: 'x'.repeat(400) }).length <= 121);
  assert.equal(bgLaunchOf('Async agent launched successfully. (internal)'), 'subagent');
  assert.equal(bgLaunchOf('Command running in background with ID: b1. Output is being written to: …'), 'shell');
  assert.equal(bgLaunchOf('1\thello'), null);
});

test('백그라운드 일: stream 목록이 가장 새 hook 목록을 이기고, 띄운 도구 결과는 끝남을 볼 때까지 센다(안전한 기본)', () => {
  const rt = sdkRt(); const t = 1000000;
  // hook만(옛 길): Stop의 background_tasks
  applyHook(rt, { hook_event_name: 'Stop', background_tasks: [{ id: 'a', type: 'subagent', status: 'running', description: 'x' }] }, t);
  assert.equal(sdkBackground(rt, t + 1).length, 1);
  // stream 목록이 더 새것이면 그것
  applyBgEvent(rt, readStreamEvent({ type: 'system', subtype: 'background_tasks_changed', tasks: [] }), t + 10);
  assert.equal(sdkBackground(rt, t + 11).length, 0, '끝났다는 stream 목록');
  // 띄운 도구 결과만(목록 신호 없음)
  const rt2 = sdkRt();
  applyBgEvent(rt2, readStreamEvent({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: 'Async agent launched successfully.' }] }] } }), t);
  assert.deepEqual(sdkBackground(rt2, t + 1).map((x) => [x.type, x.guess]), [['subagent', true]]);
  applyBgEvent(rt2, readStreamEvent({ type: 'system', subtype: 'task_notification', task_id: 'ag', tool_use_id: 'tu1', status: 'completed' }), t + 5);
  assert.equal(sdkBackground(rt2, t + 6).length, 0, '끝남 알림');
  // 끝남을 못 본 띄운 일도 아주 오래(SDK_BG_MAX_MS) 소식이 없으면 더 기다리지 않는다
  applyBgEvent(rt2, readStreamEvent({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu2', content: 'Command running in background with ID: b9.' }] } }), t + 10);
  assert.equal(sdkBackground(rt2, t + 20).length, 1);
  assert.equal(sdkBackground(rt2, t + 10 + SDK_BG_MAX_MS + 1).length, 0);
  // 세션 맵 꼴
  const v = bgView(rt2, t + 20);
  assert.deepEqual([v.n, v.kinds, v.via], [1, ['shell'], 'sdk']);
  // 서브에이전트의 도구 결과(parent_tool_use_id)는 주 에이전트 일이 아니다
  assert.equal(readStreamEvent({ type: 'user', parent_tool_use_id: 'x', message: { content: [{ type: 'tool_result', tool_use_id: 'z', content: 'Async agent launched successfully.' }] } }).kind, 'other');
});

test('턴 토큰·금액: 모델별 턴 합(서브에이전트 포함) × 가격표, 캐시 쓰기 1시간 값, 세션 누계, 모르는 모델', () => {
  const j = { type: 'result', usage: { input_tokens: 1, output_tokens: 1 }, model_usage_since_last_result: { 'claude-haiku-5-5': { inputTokens: 1000000, outputTokens: 1000000, cacheReadInputTokens: 1000000, cacheCreationInputTokens: 2000000, cacheCreationEphemeral1hInputTokens: 1000000 } } };
  const u = turnUsage(j);
  // haiku-5-5: 입력 0.1, 캐시 쓰기 5분 0.125, 1시간 0.2, 캐시 읽기 0.01, 출력 0.5 (달러/백만)
  assert.deepEqual([u.in, u.out, u.cacheR, u.cacheW], [1000000, 1000000, 1000000, 2000000]);
  assert.equal(u.cost, 0.1 + 0.125 + 0.2 + 0.01 + 0.5);
  assert.equal(usageCost('claude-opus-5-5', { in: 1000000 }), 4);
  // model_usage가 없으면 usage와 init의 모델
  const u2 = turnUsage({ usage: { input_tokens: 1000000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, 'claude-sonnet-5-5');
  assert.equal(u2.cost, 2);
  const u3 = turnUsage({ model_usage_since_last_result: { 'mystery-model': { inputTokens: 5 } } });
  assert.deepEqual([u3.cost, u3.unpriced], [0, 1]);
  const rt = sdkRt();
  addTurnUsage(rt, u, 1); addTurnUsage(rt, u2, 2);
  assert.equal(rt.sdkUsage.turns, 2);
  assert.equal(Math.round(rt.sdkUsage.total.cost * 1e6) / 1e6, Math.round((u.cost + 2) * 1e6) / 1e6);
  assert.equal(rt.sdkUsage.total.in, 2000000);
  assert.equal(rt.sdkUsage.last.cost, 2);
  // stream result 한 줄이 턴 값을 남긴다
  const rt2 = sdkRt(); rt2.term.status = 'working';
  applyStreamEvent(rt2, readStreamEvent({ type: 'system', subtype: 'init', model: 'claude-haiku-5-5' }));
  applyStreamEvent(rt2, readStreamEvent({ ...j, subtype: 'success', is_error: false, result: 'ok' }));
  assert.equal(rt2.sdkUsage.turns, 1); assert.equal(faceView(rt2).usage.last.cost, u.cost);
});

test('지금 하는 일: 생각 중 → 도구(요점) → 도구 결과 뒤 생각 중 → 답 끝나면 없음. 스스로 도는 턴(init)은 일하는 중', () => {
  const rt = sdkRt();
  // 판이 넣은 글 없이 init이 오면(백그라운드 일이 끝난 턴) 일하는 중
  const r = applyStreamEvent(rt, readStreamEvent({ type: 'system', subtype: 'init', model: 'claude-haiku-5-5' }), 100);
  assert.ok(r.autoTurn); assert.equal(deriveState(rt).state, 'working'); assert.equal(rt.sdkNow.kind, 'thinking');
  applyStreamEvent(rt, readStreamEvent({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }] } }), 200);
  assert.deepEqual([rt.sdkNow.kind, rt.sdkNow.tool, rt.sdkNow.gist, rt.sdkNow.since], ['tool', 'Bash', 'npm test', 200]);
  applyStreamEvent(rt, readStreamEvent({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } }), 300);
  assert.equal(rt.sdkNow.kind, 'thinking');
  // 서브에이전트(parent_tool_use_id)의 도구는 주 에이전트의 지금 일을 바꾸지 않는다
  applyStreamEvent(rt, readStreamEvent({ type: 'assistant', parent_tool_use_id: 'p', message: { content: [{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: 'x' } }] } }), 350);
  assert.equal(rt.sdkNow.kind, 'thinking');
  applyStreamEvent(rt, readStreamEvent({ type: 'result', subtype: 'success', is_error: false, result: 'done' }), 400);
  assert.equal(rt.sdkNow, null); assert.equal(deriveState(rt).state, 'ready'); assert.equal(rt.sdkTurn.tools, 1);
});

test('권한·질문 hook(승인 화면 없음): SDK 세션은 응답 필요가 되지 않고 일하는 중 그대로, 스티어링을 막지 않는다. 거절된 호출은 얼굴의 한 줄', () => {
  const rt = sdkRt(); rt.term.status = 'working';
  const body = { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf build' }, tool_use_id: 'tu9' };
  applyHook(rt, body, 1000);
  assert.equal(deriveState(rt).state, 'waiting', '(보통 claude 세션은 응답 필요다)');
  assert.ok(sdkHookGuard(rt, 'PermissionRequest', body, 1000));
  assert.equal(deriveState(rt).state, 'working');
  assert.equal(steerBlock({ state: deriveState(rt).state }), null, '스티어링이 막히지 않는다');
  assert.deepEqual(rt.sdkDenied.items, [{ tool: 'Bash', gist: 'rm -rf build' }]);
  // 질문 도구(AskUserQuestion)의 PreToolUse도 같다
  applyHook(rt, { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'go?' }] }, tool_use_id: 'q1' }, 1100);
  sdkHookGuard(rt, 'PreToolUse', {}, 1100);
  assert.equal(deriveState(rt).state, 'working');
  // result의 permission_denials도 거절 줄로 남는다
  applyStreamEvent(rt, readStreamEvent({ type: 'result', subtype: 'success', is_error: false, result: 'x', permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/a' } }] }), 1200);
  assert.equal(rt.sdkDenied.items[0].gist, 'rm -rf /tmp/a');
  assert.equal(deriveState(rt).state, 'ready');
});

// ---- 판 통합(가짜 claude -p) ----
function sdkBoard({ idleMs = 150 } = {}) {
  const dir = tmp();
  const fake = path.join(dir, 'fake'); fs.mkdirSync(fake);
  process.env.P363_FAKE_DIR = fake;
  const b = new Backend({ quietMs: 600000, port: 0, logDir: dir, sessionsDir: path.join(dir, 'sessions'), claudeJson: path.join(dir, 'none.json'), claudeCommand: 'claude', claudeProjects: path.join(dir, 'projects'), hookTimeoutSec: 2 });
  b.store = new Store(path.join(dir, 'board.db'));
  b.sessions = new Map(); b.termOk = true; b.hookUrl = 'http://127.0.0.1:1/hook'; b.plugin = {};
  b.branch = { settingsExtra: (sid) => ({ env: { ATRIUM_SESSION: sid } }), noteChild() {}, placeChild: () => null, holds: () => false, summaryExtra: () => ({}) };
  b.features = { settings: { get: () => ({ ...DEFAULTS }) }, launchers: null, summaryExtra: () => ({}) };
  b.features.launchers = new Launchers({ store: b.store });
  b.queue = { enqueue: () => ({ deliveryId: 'd1' }), pending: () => 0, poke() {}, cancelSession() {}, onUserPromptSubmit: () => true };
  b.api = { broadcast() {} };
  const casts = [];
  b.broadcastSession = (s, o) => casts.push(o && o.cause); b.broadcastWorkspaces = () => {}; b.probeGit = () => {};
  b.authRelay = { ensure: async () => {}, url: (sid) => `http://127.0.0.1:9/sec/${sid}` };
  b.adapter = { connected: false, agentKinds: async () => [], refreshSubscription: async () => {}, createWorkspace: async () => { throw new Error('no terminal'); } };
  b.sdk = new SdkHost(b, { idleMs, command: [process.execPath, FAKE] });
  return { b, dir, casts };
}
const pidOf = (b, sid) => b.sdk.view({ sessionId: sid }).pid;

for (const sig of ['stream', 'launch']) {
  test(`백그라운드 일(${sig === 'stream' ? 'stream 목록' : '띄운 도구 결과만'}): 쉼이 지나도 끄지 않고, 끝나 스스로 돈 턴의 답을 본 뒤 쉬면 끈다`, async () => {
    const { b, dir, casts } = sdkBoard({ idleMs: 150 });
    try {
      const r = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, model: 'haiku', name: 'bg' });
      const s = b.sessions.get(r.sessionId);
      await b.sendPrompt(r.sessionId, `BG 900 ${sig}`);
      await until(() => s.rt.lastAnswer === 'STARTED');
      const pid = pidOf(b, r.sessionId);
      assert.equal(deriveState(s.rt).state, 'ready');
      assert.equal(b.summary(s).background.n, 1, '세션 맵에 백그라운드 일 하나');
      assert.equal(b.summary(s).sdkFace.bg.agents, 1);
      await sleep(600); // 쉼(150ms)의 몇 배
      assert.ok(b.sdk.alive(r.sessionId), '백그라운드 일이 도는 동안은 끄지 않는다');
      assert.equal(pidOf(b, r.sessionId), pid);
      await until(() => s.rt.lastAnswer === 'RESULTS AGENT-DONE', 4000);
      assert.ok(casts.includes('sdk:init'), '스스로 도는 턴을 판이 따른다');
      assert.equal(b.summary(s).background, null);
      await until(() => !b.sdk.alive(r.sessionId), 4000);
      assert.equal(deriveState(s.rt).state, 'ready');
      assert.equal(s.rt.sdkUsage.turns, 2, '두 턴의 토큰이 누계에');
      assert.ok(s.rt.sdkUsage.total.cost > 0);
    } finally { await b.sdk.stopAll(); }
  });
}

test('백그라운드 일(hook 목록만): Stop hook의 background_tasks가 있으면 끄지 않고, 빈 목록이 오면 쉼 뒤 끈다', async () => {
  const { b, dir } = sdkBoard({ idleMs: 150 });
  try {
    const r = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, model: 'haiku', name: 'bgh' });
    const s = b.sessions.get(r.sessionId);
    await b.sendPrompt(r.sessionId, 'BG 60000 none');
    await until(() => s.rt.lastAnswer === 'STARTED');
    applyHook(s.rt, { hook_event_name: 'Stop', background_tasks: [{ id: 'b1', type: 'shell', status: 'running', command: 'sleep 99' }] });
    await sleep(600);
    assert.ok(b.sdk.alive(r.sessionId), 'hook 목록만으로도 지킨다');
    applyHook(s.rt, { hook_event_name: 'Stop', background_tasks: [] });
    await until(() => !b.sdk.alive(r.sessionId), 4000);
  } finally { await b.sdk.stopAll(); }
});

test('신호가 하나도 없는 백그라운드 일은 지킬 수 없다(쉼 뒤 끈다) — 그래서 stream·hook·도구 결과 셋을 다 본다', async () => {
  const { b, dir } = sdkBoard({ idleMs: 150 });
  try {
    const r = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, model: 'haiku', name: 'bgn' });
    const s = b.sessions.get(r.sessionId);
    await b.sendPrompt(r.sessionId, 'BG 60000 none');
    await until(() => s.rt.lastAnswer === 'STARTED');
    await until(() => !b.sdk.procs.has(r.sessionId), 4000);
    assert.equal(s.rt.sdkBg, null, '끝나면 백그라운드 상태도 지운다');
  } finally { await b.sdk.stopAll(); }
});

test('판 hook 길: SDK 세션의 PermissionRequest는 waiting을 만들지 않고 사건으로 남긴다', async () => {
  const { b, dir } = sdkBoard({ idleMs: 60000 });
  try {
    const r = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, model: 'haiku', name: 'perm' });
    const s = b.sessions.get(r.sessionId);
    s.rt.term.status = 'working';
    b.processHook({ 'x-mt-session': r.sessionId, authorization: `Bearer ${s.hookToken}` }, JSON.stringify({ hook_event_name: 'PermissionRequest', session_id: r.sessionId, tool_name: 'Bash', tool_input: { command: 'rm -rf dist' }, tool_use_id: 'tu1' }));
    const sum = b.summary(s);
    assert.equal(sum.state, 'working');
    assert.equal(sum.ask, null);
    assert.equal(sum.sdkFace.denied.items[0].tool, 'Bash');
    assert.equal(b.deliveryView(r.sessionId).state, 'working');
  } finally { await b.sdk.stopAll(); }
});
