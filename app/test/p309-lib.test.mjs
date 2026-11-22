// P309: 감싼 호출자 omh(OMH Native)와 명령 런처의 하네스 계열, 셸에서 화면을 차지한 조용한 프로그램의 창 쪽 순수 함수
import test from 'node:test';
import assert from 'node:assert/strict';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';
import { KINDS, kindOf, shownKind } from '../src/renderer/lib/kinds.js';
import { ICONS, COMMAND_FAMILIES, autoFamily, commandFamily, wrapperOf, launcherIcon } from '../src/renderer/lib/launchers.js';
import { orchApplies, orchHarness, launcherOrchestrates, orchBody, launcherFallback } from '../src/renderer/lib/orch.js';
import { shellProgram, shellRunning } from '../src/renderer/lib/labels.js';
import { isBusy, toneOf } from '../src/renderer/lib/phone.js';

const H = [{ id: 'claude', label: 'Claude Code', orchDefault: false, fallbackDefault: null }, { id: 'hermes', label: 'Hermes', orchDefault: true, fallbackDefault: 'last_answer' }];

test('P309 종류 OMH: Hermes 로고·색, 카드 이름 OMH, 아이콘 목록에 있다', () => {
  assert.equal(kindOf('omh'), KINDS.omh);
  assert.equal(KINDS.omh.label, 'OMH'); assert.equal(KINDS.omh.logo, KINDS.hermes.logo); assert.equal(KINDS.omh.color, KINDS.hermes.color);
  assert.ok(ICONS.includes('omh'));
  assert.equal(shownKind({ kind: 'hermes', flavor: 'omh' }), 'omh');
});

test('P309 하네스 계열: 빈 값은 자동(omh → hermes, 그 밖은 셸), 고른 값이 이긴다', () => {
  assert.deepEqual(COMMAND_FAMILIES, ['shell', 'hermes', 'agent']);
  assert.equal(autoFamily('omh'), 'hermes'); assert.equal(autoFamily('C:\\x\\omh.cmd --new'), 'hermes'); assert.equal(autoFamily('vim'), 'shell'); assert.equal(autoFamily(''), 'shell');
  assert.equal(commandFamily({ harness: 'command', command: 'omh' }), 'hermes');
  assert.equal(commandFamily({ harness: 'command', command: 'omh', family: 'shell' }), 'shell');
  assert.equal(commandFamily({ harness: 'command', command: 'omo', family: 'agent' }), 'agent');
  assert.equal(commandFamily({ harness: 'hermes' }), null);
  assert.equal(wrapperOf('hermes'), null);
});

test('P309 런처 아이콘: omh 명령·실행 명령은 OMH, 고른 아이콘이 이긴다', () => {
  assert.equal(launcherIcon({ harness: 'command', command: 'omh' }), 'omh');
  assert.equal(launcherIcon({ harness: 'command', command: 'omh', family: 'shell' }), null);
  assert.equal(launcherIcon({ harness: 'hermes', startCommand: 'omh' }), 'omh');
  assert.equal(launcherIcon({ harness: 'hermes' }), 'hermes');
  assert.equal(launcherIcon({ harness: 'command', command: 'omh', icon: 'claude' }), 'claude');
});

test('P309 오케스트레이션 칸: 하네스 계열 명령 런처에도 있고, Hermes 계열은 종류 기본(켬·마지막 답)', () => {
  const omh = { harness: 'command', command: 'omh' };
  assert.equal(orchApplies('command', omh), true); assert.equal(orchApplies('command', { harness: 'command', command: 'vim' }), false); assert.equal(orchApplies('command'), false);
  assert.equal(orchHarness(omh), 'hermes'); assert.equal(orchHarness({ harness: 'command', command: 'omo', family: 'agent' }), null);
  assert.equal(launcherOrchestrates(H, omh), true);
  assert.equal(launcherFallback(H, omh), true);
  assert.deepEqual(orchBody(H, omh), { reportFallback: '' }); // 종류 기본과 같으면 칸을 두지 않는다
  const omo = { harness: 'command', command: 'omo', family: 'agent' };
  assert.equal(launcherOrchestrates(H, omo), false);
  assert.deepEqual(orchBody(H, { ...omo, orchestrates: true }), { orchestrates: true, reportFallback: '' });
});

test('P309 셸에서 화면을 차지한 조용한 프로그램: 바쁨·작업 중이 아니다', () => {
  const prog = { kind: 'shell', state: 'shell_idle', shell: { atPrompt: false, command: null, program: true } };
  const run = { kind: 'shell', state: 'shell_running', shell: { atPrompt: false, command: 'npm test', program: false } };
  assert.equal(shellProgram(prog), true); assert.equal(shellRunning(prog), false);
  assert.equal(shellRunning(run), true);
  assert.equal(isBusy(prog), false); assert.equal(isBusy(run), true);
  assert.equal(toneOf(prog), 'ready'); assert.equal(toneOf(run), 'shell_running');
});

test('P309 새 글은 두 사전에 같은 키로 있다', () => {
  for (const ns of ['launcherFamily', 'shellProgram']) assert.deepEqual(Object.keys(ko[ns]).sort(), Object.keys(en[ns]).sort(), ns);
  for (const f of ['shell', 'hermes', 'agent']) { assert.ok(ko.launcherFamily[f] && en.launcherFamily[f]); assert.ok(ko.launcherFamily[`note_${f}`] && en.launcherFamily[`note_${f}`]); }
  assert.match(ko.launcherFamily.auto, /\{family\}/); assert.match(en.launcherFamily.auto, /\{family\}/);
});
