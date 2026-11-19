// P232 단위 시험: 판 버그 H18("n of m" 권한 대화상자). 화면 읽기(고정 화면 글)와 화면에서 읽은 권한 질문의 답 키, 병렬 권한 질문의 줄.
// P249: 옛 rig 2(이어진 회, 정본 기준, 바로가기 등) 시험은 걷어냈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState, screenPermissionAsk, needKey } from '../src/state.mjs';
import { parsePermissionDialog, parseChoices } from '../src/screen.mjs';
import { planAnswer } from '../src/answer.mjs';


const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const SCREENS = path.join(FX, 'screens');
const screen = (n) => fs.readFileSync(path.join(SCREENS, `${n}.txt`), 'utf8');

test('P232 "n of m" 화면 읽기: Claude Code 2.1.328의 권한 질문 1 of 3·2 of 3(고정 화면 글)을 권한 질문으로 읽는다(머리 줄의 n of m, 점선 상자 안 명령, 선택지 넷)', () => {
  const p1 = parsePermissionDialog(screen('p232-perm-1of3'));
  assert.deepEqual({ q: p1.question, step: p1.step, tool: p1.tool, detail: p1.detail }, { q: 'Do you want to proceed?', step: { n: 1, m: 3 }, tool: 'Bash command', detail: 'mkdir gamma1' });
  const p2 = parsePermissionDialog(screen('p232-perm-2of3'));
  assert.deepEqual({ step: p2.step, detail: p2.detail }, { step: { n: 2, m: 3 }, detail: 'mkdir gamma2' });
  assert.deepEqual(p2.choices.map((c) => c.n), [1, 2, 3, 4]); assert.equal(p2.choices[3].label, 'No'); assert.equal(p2.choices[0].selected, true);
  // 질문 줄이 없어도 n of m과 Yes·No 선택지면 권한 질문
  const noQ = screen('p232-perm-2of3').replace('Do you want to proceed?', '');
  assert.deepEqual(parsePermissionDialog(noQ).step, { n: 2, m: 3 });
  // 권한 질문이 아닌 화면
  assert.equal(parsePermissionDialog('❯ \n──────────────\n  Haiku 5.5'), null);
  assert.equal(parsePermissionDialog(' Quick safety check\n Is this a project you trust?\n ❯ 1. Yes, I trust this folder\n   2. No, exit'), null, '신뢰 질문(질문 줄·n of m 없음)');
  assert.equal(parsePermissionDialog(' Exiting worktree session\n ❯ 1. Keep worktree\n   2. Remove worktree'), null);
  assert.equal(parsePermissionDialog(' Which one?\n ❯ 1. Apples\n   2. Pears\n 1 of 2'), null, 'Yes·No 선택지가 아니다');
});

test('P232 화면에서 읽은 권한 질문 → 응답 필요 ask(도구·명령·n of m), 답 키는 번호(No는 esc)', () => {
  const p = parsePermissionDialog(screen('p232-perm-2of3'));
  const a = screenPermissionAsk(p, 1000);
  assert.deepEqual({ kind: a.kind, tool: a.tool, summary: a.summary, toolUseId: a.toolUseId, since: a.since, fromScreen: a.fromScreen, step: a.step, question: a.question }, { kind: 'permission', tool: 'Bash', summary: 'Bash: mkdir gamma2', toolUseId: null, since: 1000, fromScreen: true, step: { n: 2, m: 3 }, question: 'Do you want to proceed?' });
  assert.equal(a.choices.length, 4);
  assert.deepEqual(planAnswer(a, { choice: 1 }).steps, [{ keys: ['1'] }]);
  assert.deepEqual(planAnswer(a, { choice: 4 }).steps, [{ keys: ['esc'] }], 'No는 esc');
  assert.match(planAnswer(a, { choice: 4 }).label, /거부/);
  assert.throws(() => planAnswer(a, { choice: 5 }), (e) => e.code === 'bad_request');
  assert.equal(needKey({ state: 'waiting', ask: a }), 'ask:permission:Bash:Bash: mkdir gamma2');
  // 판 상태: hook이 붙은 세션이 막혔고 이 ask가 있으면 응답 필요(알 수 없는 대화상자가 아니다)
  const rt = newRuntime(); rt.term.present = true; rt.phase = 'running'; rt.hooksSinceLaunch = 3; rt.term.launchPending = false;
  applyTermStatus(rt, 'blocked');
  assert.equal(deriveState(rt).ask.kind, 'unknown_dialog', '고치기 전 모습');
  rt.pendingAsk = a;
  assert.equal(deriveState(rt).state, 'waiting'); assert.equal(deriveState(rt).ask.summary, 'Bash: mkdir gamma2');
});

test('P232 병렬 권한 질문의 줄: hook이 한꺼번에 와도 기다리는 ask는 화면 차례(첫째)이고, 앞 질문이 풀리면 다음 것이 올라온다', () => {
  const rt = newRuntime(); rt.term.present = true; rt.phase = 'running'; rt.term.launchPending = false;
  const H = (ev, x = {}) => applyHook(rt, { hook_event_name: ev, ...x });
  const pre = (id, cmd) => H('PreToolUse', { tool_name: 'Bash', tool_use_id: id, tool_input: { command: cmd } });
  const req = (cmd) => H('PermissionRequest', { tool_name: 'Bash', tool_input: { command: cmd } });
  // P229·P232에서 본 차례: Pre A, 요청 A, Pre B, 요청 B
  H('UserPromptSubmit', { prompt: 'x' }); applyTermStatus(rt, 'working');
  pre('tA', 'mkdir a'); req('mkdir a'); applyTermStatus(rt, 'blocked'); pre('tB', 'mkdir b'); req('mkdir b');
  assert.equal(rt.pendingAsk.toolUseId, 'tA', '화면의 1 of 2는 A다(옛 판은 B를 보였다)');
  assert.deepEqual(rt.askQueue.map((a) => a.toolUseId), ['tA', 'tB']);
  // A에 답함 → A가 돌고 PostToolUse → B가 올라온다(터미널은 막힌 채)
  H('PostToolUse', { tool_name: 'Bash', tool_use_id: 'tA' });
  assert.equal(rt.pendingAsk.toolUseId, 'tB'); assert.equal(deriveState(rt).state, 'waiting');
  H('PostToolUse', { tool_name: 'Bash', tool_use_id: 'tB' });
  assert.equal(rt.pendingAsk, null);
  // 터미널이 잠깐 working이 되었다가 다시 막히는 차례(P229 10회차의 7분 멈춤)
  pre('tC', 'git log a..b'); pre('tD', 'git log c..d'); req('git log a..b'); req('git log c..d');
  assert.deepEqual(rt.askQueue.map((a) => a.toolUseId), ['tC', 'tD'], 'Pre가 먼저 둘 와도 입력으로 잇는다');
  assert.equal(rt.pendingAsk.toolUseId, 'tC');
  applyTermStatus(rt, 'working');
  assert.equal(rt.pendingAsk, null); assert.equal(rt.lastAskResolved.toolUseId, 'tC');
  applyTermStatus(rt, 'blocked');
  assert.equal(rt.pendingAsk.toolUseId, 'tD', '다시 막히면 줄의 다음 질문(알 수 없는 대화상자가 아니다)');
  assert.equal(deriveState(rt).ask.summary, 'Bash: git log c..d');
  // 턴이 끝나면 줄을 비운다
  H('Stop', { last_assistant_message: 'done' });
  assert.equal(rt.pendingAsk, null); assert.equal(rt.askQueue, null);
  applyTermStatus(rt, 'idle'); applyTermStatus(rt, 'blocked');
  assert.equal(rt.pendingAsk, null, '남은 줄이 없다');
});

