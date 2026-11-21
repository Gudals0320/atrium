// P296: 자체 오케스트레이션의 창 쪽(런처 칸 저장 값, 카드 표, 스티어링 막음, 사전)
import test from 'node:test';
import assert from 'node:assert/strict';
import { orchApplies, orchDefault, launcherOrchestrates, orchBody, orchTag, innerWhyText, sessionOrch } from '../src/renderer/lib/orch.js';
import { steerBlock } from '../src/renderer/lib/steer.js';
import { STEER_WHYS } from '../src/renderer/lib/labels.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const HS = [{ id: 'claude', orchDefault: false }, { id: 'hermes', orchDefault: true }];
const t = (k, v = {}) => k + (Object.keys(v).length ? JSON.stringify(v) : '');

test('P296 런처 칸: 하네스 기본, 켜고 끄기, 저장 값', () => {
  assert.equal(orchApplies('claude'), true); assert.equal(orchApplies('shell'), false); assert.equal(orchApplies('command'), false);
  assert.equal(orchDefault(HS, 'hermes'), true); assert.equal(orchDefault(HS, 'claude'), false);
  assert.equal(launcherOrchestrates(HS, { harness: 'claude' }), false);
  assert.equal(launcherOrchestrates(HS, { harness: 'claude', orchestrates: true }), true);
  assert.equal(launcherOrchestrates(HS, { harness: 'hermes' }), true);
  assert.equal(launcherOrchestrates(HS, { harness: 'hermes', orchestrates: false }), false);
  assert.equal(launcherOrchestrates(HS, { harness: 'shell', orchestrates: true }), false);
  assert.deepEqual(orchBody(HS, { harness: 'claude' }), { reportFallback: '' });
  assert.deepEqual(orchBody(HS, { harness: 'claude', orchestrates: true, reportFallback: 'last_answer' }), { orchestrates: true, reportFallback: 'last_answer' });
  assert.deepEqual(orchBody(HS, { harness: 'claude', orchestrates: false, reportFallback: 'last_answer' }), { orchestrates: false, reportFallback: '' }, '끄면 물러섬도 뺀다');
  assert.deepEqual(orchBody(HS, { harness: 'hermes' }), { reportFallback: '' }, '기본 그대로면 칸을 두지 않는다');
  assert.deepEqual(orchBody(HS, { harness: 'claude', orchestrates: true, busy: ['cpu'] }), { orchestrates: true, reportFallback: '', busy: ['cpu'] });
  assert.deepEqual(orchBody(HS, { harness: 'command', orchestrates: true }), {});
});

test('P296 카드 표: 보통·하위·안에서 일하는 중', () => {
  assert.equal(orchTag({}, t), null); assert.equal(sessionOrch({ orch: { on: false } }), null);
  const free = orchTag({ orch: { on: true, scope: 'free' } }, t);
  assert.deepEqual([free.text, free.busy], ['orch.tag', false]); assert.match(free.title, /orch.titleFree/);
  const sub = orchTag({ orch: { on: true, scope: 'sub', inner: { busy: true, why: ['cpu', 'files'] } } }, t);
  assert.equal(sub.text, 'orch.tagBusy'); assert.equal(sub.busy, true); assert.match(sub.title, /orch.titleSub/); assert.match(sub.title, /orch.innerTitle/);
  assert.equal(innerWhyText(['cpu', 'files'], t), 'orch.why.cpu, orch.why.files');
  assert.equal(innerWhyText([], t), 'orch.why.hold');
});

test('P296 스티어링 막음(창): 오케스트레이션 세션은 대기열만', () => {
  assert.equal(steerBlock({ kind: 'claude', hooked: true, orch: { on: true } }), 'orchestrates');
  assert.equal(steerBlock({ kind: 'claude', hooked: true }), null);
  assert.ok(STEER_WHYS.includes('orchestrates'));
});

test('P296 사전: 두 언어에 같은 칸', () => {
  for (const d of [ko, en]) {
    for (const k of ['tag', 'tagBusy', 'titleFree', 'titleSub', 'innerTitle', 'field', 'fieldNote', 'fallback']) assert.ok(d.orch[k], k);
    for (const w of ['proctree', 'cpu', 'files', 'hold']) assert.ok(d.orch.why[w], w);
    assert.ok(d.cmdSteer.why_orchestrates); assert.ok(d.steerWhy.orchestrates);
    assert.ok(d.launchers.err.orchestrates);
  }
  assert.ok(Object.values(ko).some((v) => v && typeof v === 'object' && v.sleepWhy_inner_work));
  assert.ok(Object.values(en).some((v) => v && typeof v === 'object' && v.sleepWhy_inner_work));
});
