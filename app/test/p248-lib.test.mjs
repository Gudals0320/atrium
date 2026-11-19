// P248 시험: 사람이 보낸 글의 대기열·스티어링 선택(lib/steer.js, 휴대폰 sendPlan). 기본은 대기열, 고르면 steer
import test from 'node:test';
import assert from 'node:assert/strict';
import { steerBlock, steerTargets, steerParam, steerFellBack } from '../src/renderer/lib/steer.js';
import { sendPlan } from '../src/renderer/lib/phone.js';
import { recipients } from '../src/renderer/lib/cmd-input.js';
import { setLanguage, t } from '../src/renderer/lib/i18n.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const S = (name, f = {}) => ({ sessionId: 'id-' + name, name, state: 'working', kind: 'claude', hooked: true, ...f });

test('P248 steerBlock: 판이 띄운 Claude Code만 스티어링한다(상태와 상관없이 종류로)', () => {
  assert.equal(steerBlock(S('a')), null);
  assert.equal(steerBlock(S('a', { kind: undefined })), null, '종류가 없으면 Claude Code');
  assert.equal(steerBlock(S('a', { state: 'ready' })), null, '쉬는 세션도 고를 수 있다(보통 보내기)');
  assert.equal(steerBlock(S('c', { kind: 'codex' })), 'kind');
  assert.equal(steerBlock(S('h', { hooked: false })), 'no_hook');
  assert.equal(steerBlock(null), 'kind');
});

test('P248 steerTargets: 받는 세션을 스티어링할 수 있는 것과 없는 것(까닭)으로 나눈다. @all, 없는 이름, 셸', () => {
  const list = [S('a'), S('c', { kind: 'codex' }), S('h', { hooked: false }), S('sh', { kind: 'shell' })];
  assert.deepEqual(steerTargets(recipients('@a 고쳐', list), list), { can: ['a'], cannot: [] });
  assert.deepEqual(steerTargets(recipients('@a @c 고쳐', list), list), { can: ['a'], cannot: [{ name: 'c', why: 'kind' }] });
  assert.deepEqual(steerTargets(recipients('@c 고쳐', list), list), { can: [], cannot: [{ name: 'c', why: 'kind' }] });
  assert.deepEqual(steerTargets(recipients('@all 고쳐', list), list), { can: ['a'], cannot: [{ name: 'c', why: 'kind' }, { name: 'h', why: 'no_hook' }] }, '@all은 셸을 빼고 모두');
  assert.deepEqual(steerTargets(recipients('@nobody x', list), list), { can: [], cannot: [] }, '없는 이름은 세지 않는다');
});

test('P248 steerParam: 켰고 스티어링할 수 있는 받는 세션이 있을 때만 steer: true. 기본은 대기열(칸 없음)', () => {
  const can = { can: ['a'], cannot: [] }, none = { can: [], cannot: [{ name: 'c', why: 'kind' }] };
  assert.deepEqual(steerParam(false, can), {});
  assert.deepEqual(steerParam(true, can), { steer: true });
  assert.deepEqual(steerParam(true, none), {}, '스티어링할 수 없으면 싣지 않는다(대기열)');
  assert.deepEqual(steerFellBack([{ name: 'a', steer: { ok: true } }, { name: 'c', steer: { ok: false, why: 'kind' } }, { name: 'q' }]), [{ name: 'c', why: 'kind' }]);
});

test('P248 휴대폰 sendPlan: 기본은 대기열, 스티어링을 고르면 steer(스티어링할 수 없는 세션에는 싣지 않는다), 셸은 그대로', () => {
  assert.deepEqual(sendPlan(S('a'), 'x'), { method: 'session.send', text: 'x' });
  assert.deepEqual(sendPlan(S('a'), 'x', { steer: true }), { method: 'session.send', text: 'x', steer: true });
  assert.deepEqual(sendPlan(S('a', { state: 'ready' }), 'x', { steer: true }), { method: 'session.send', text: 'x', steer: true }, '상태는 백엔드가 본다(쉬면 보통 보내기)');
  assert.deepEqual(sendPlan(S('c', { kind: 'codex' }), 'x', { steer: true }), { method: 'session.send', text: 'x' });
  assert.deepEqual(sendPlan(S('h', { hooked: false }), 'x', { steer: true }), { method: 'session.send', text: 'x' });
  assert.deepEqual(sendPlan(S('sh', { kind: 'shell' }), 'ls\n', { steer: true }), { method: 'terminal.input', data: 'ls\r' });
  for (const p of [sendPlan(S('a'), 'x'), sendPlan(S('a'), 'x', { steer: true })]) assert.equal(p.whileWorking, undefined, '옛 바로 넣기(whileWorking type)는 쓰지 않는다');
});

test('P248 사전: 두 언어에 같은 열쇠, 까닭 글', () => {
  assert.deepEqual(Object.keys(ko.cmdSteer).sort(), Object.keys(en.cmdSteer).sort());
  setLanguage('ko');
  assert.equal(t('cmdSteer.label'), '스티어링');
  assert.match(t('cmdSteer.off', { why: t('cmdSteer.why_kind') }), /스티어링할 수 없음: 일하는 중에 입력을 받지 못하는 종류/);
  assert.match(t('cmdSteer.title'), /Ctrl\+Enter/);
  setLanguage('en');
  assert.equal(t('cmdSteer.label'), 'Steer');
});
