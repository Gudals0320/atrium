// P271 단위 시험(이슈 #19): Codex 전달.
// 1) 짧은 한 줄도 판이 붙여 넣고 화면에서 본 뒤 Enter(codexPasteWanted, sendPrompt). Enter 뒤 입력 칸에 글이 남으면 Enter를 다시 친다(어댑터 pastePrompt, 가짜 hc).
// 2) 일하는 중인 Codex의 스티어링(canTypeNow·steerBlock·sendNow): 입력 칸이 비었으면 곧바로 넣고 화면으로 확인, 쓰다 만 글이 있으면 비키지 않고 기다린다.
//    확인된 글은 턴이 끝난 뒤 다시 가지 않는다. 다른 종류(opencode 등)는 그대로 막는다
import test from 'node:test';
import assert from 'node:assert/strict';
import { codexPasteState, codexPasteWanted } from '../src/screen.mjs';
import { DeliveryQueue, canTypeNow, steerBlock } from '../src/delivery.mjs';
import { HcAdapter } from '../src/hc/adapter.mjs';
import { Backend } from '../src/backend.mjs';
import { startFakeHc } from './fake-hc.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(20); } throw new Error('timed out'); };
const cx = (box) => `  >_ OpenAI Codex (v0.167.2)\n\n• OK\n\n› ${box}\n\n  GPT · C:\\w · Ask for approval\n  ← for agents · ? for shortcuts\n`;
const HINT = 'Ask Codex to do anything';

test('P271 codexPasteWanted: Codex에 가는 글은 짧은 한 줄도 판이 붙여 넣는다(빈 글만 아니다)', () => {
  assert.equal(codexPasteWanted('17 더하기 25의 결과를 알려 줘'), true);
  assert.equal(codexPasteWanted('x'), true);
  assert.equal(codexPasteWanted('a\nb'), true);
  assert.equal(codexPasteWanted(''), false);
  assert.equal(codexPasteWanted(null), false);
});

test('P271 판의 보내기: Codex(hook 없음)는 짧은 한 줄도 pastePrompt, Claude Code·다른 종류는 hc terminal.send 그대로', async () => {
  const calls = [];
  const adapter = {
    prompt: async (target, text) => { calls.push(['prompt', target, text]); return {}; },
    pastePrompt: async (target, text, o) => { calls.push(['paste', target, text, typeof o.state]); return { entered: true }; },
  };
  const sessions = new Map([
    ['c', { kind: 'codex', rt: { hooked: false }, agentName: 'cx' }],
    ['l', { kind: 'claude', rt: { hooked: true }, agentName: 'cl' }],
    ['o', { kind: 'opencode', rt: { hooked: false }, agentName: 'oc' }],
  ]);
  const b = { sessions, adapter, hooked: Backend.prototype.hooked };
  for (const [sid, text] of [['c', '17 더하기 25의 결과를 알려 줘'], ['l', 'short'], ['o', 'short']]) await Backend.prototype.sendPrompt.call(b, sid, text);
  assert.deepEqual(calls.map((c) => [c[0], c[1]]), [['paste', 'cx'], ['prompt', 'cl'], ['prompt', 'oc']]);
  assert.equal(calls[0][3], 'function', '화면으로 다 들어간 것을 본다');
});

test('P271 어댑터 pastePrompt(가짜 hc): Enter 뒤 입력 칸이 비면 한 번, 글이 남으면 Enter를 다시(상한), 안정 판정 글은 뒤를 보지 않는다', async () => {
  const fake = await startFakeHc();
  const a = new HcAdapter({ session: 'p271-unit', dataDir: null, pipe: fake.pipe, env: {} });
  try {
    const r = fake.create({ argv: ['codex'], name: 'cx', cwd: 'C:/w' }).result;
    const t = fake.terms.get(r.address);
    t.screen = cx(HINT);
    await until(() => t.status && t.status.state === 'idle');
    const text = '17 더하기 25의 결과를 알려 줘';
    const st = (s) => codexPasteState(s, text);
    const enters = () => t.inputs.filter((x) => x === '\r').length;
    // (가) 붙여 넣으면 입력 칸에 보이고, 첫 Enter에 제출된다(입력 칸이 빈다)
    const flow1 = until(() => t.inputs.length >= 1).then(async () => { t.screen = cx(text); await until(() => enters() >= 1); t.screen = cx(HINT); });
    const r1 = await a.pastePrompt('cx', text, { state: st, pollMs: 20, enterGapMs: 200 });
    await flow1;
    assert.equal(r1.why, 'shown'); assert.equal(r1.enters, 1); assert.equal(r1.submitted, true);
    assert.deepEqual(t.inputs, [`\x1b[200~${text}\x1b[201~`, '\r'], '짧은 한 줄도 bracketed paste 한 번 뒤 Enter 한 번');
    // (나) 첫 Enter가 줄바꿈이 됐다(입력 칸에 글이 그대로): 두 번째 Enter에 제출된다. 글은 다시 붙여 넣지 않는다
    t.inputs.length = 0; t.inputKinds.length = 0; t.screen = cx(HINT);
    const flow2 = until(() => t.inputs.length >= 1).then(async () => { t.screen = cx(text); await until(() => enters() >= 2); t.screen = cx(HINT); });
    const r2 = await a.pastePrompt('cx', text, { state: st, pollMs: 20, enterGapMs: 200 });
    await flow2;
    assert.equal(r2.enters, 2); assert.equal(r2.submitted, true);
    assert.equal(t.inputs.filter((x) => x.startsWith('\x1b[200~')).length, 1, '붙여 넣기는 한 번뿐');
    // (다) 끝까지 남으면 enterRetries번 더 치고 멈춘다(submitted false, 그 뒤는 판의 제출 확인·Enter 손쓰기)
    t.inputs.length = 0; t.inputKinds.length = 0; t.screen = cx(HINT);
    const flow3 = until(() => t.inputs.length >= 1).then(() => { t.screen = cx(text); });
    const r3 = await a.pastePrompt('cx', text, { state: st, pollMs: 20, enterGapMs: 120, enterRetries: 2 });
    await flow3;
    assert.equal(r3.enters, 3); assert.equal(r3.submitted, false);
    // (라) 글자로 맞추지 못해 안정 판정으로 Enter를 친 글은 Enter 뒤를 보지 않는다(Enter 한 번)
    t.inputs.length = 0; t.inputKinds.length = 0; t.screen = cx('something odd');
    const r4 = await a.pastePrompt('cx', 'zz', { state: (s) => codexPasteState(s, 'zz'), pollMs: 20, stableMs: 100, enterGapMs: 100 });
    assert.equal(r4.why, 'stable'); assert.equal(r4.enters, 1); assert.equal(r4.submitted, null);
    await sleep(50);
    assert.equal(enters(), 1);
  } finally { await fake.close(); }
});

test('P271 canTypeNow·steerBlock: 일하는 Codex도 스티어링을 받는다(hook과 상관없이). opencode·hook 없는 Claude Code는 그대로 막는다', () => {
  const v = (x) => ({ state: 'working', agentPresent: true, termConnected: true, closed: false, ...x });
  assert.equal(canTypeNow(v({ kind: 'codex', hooked: false })), true);
  assert.equal(canTypeNow(v({ kind: 'codex', hooked: false, state: 'ready' })), false, '쉬면 보통 보내기');
  assert.equal(canTypeNow(v({ kind: 'codex', hooked: false, state: 'waiting' })), false, '질문 중에는 넣지 않는다');
  assert.equal(canTypeNow(v({ kind: 'codex', agentPresent: false })), false);
  assert.equal(canTypeNow(v({ kind: 'claude', hooked: true })), true);
  assert.equal(canTypeNow(v({ kind: 'claude', hooked: false })), false);
  assert.equal(canTypeNow(v({ kind: 'opencode', hooked: false })), false);
  assert.equal(steerBlock({ kind: 'codex' }, false), null);
  assert.equal(steerBlock({ kind: 'opencode' }, false), 'kind');
  assert.equal(steerBlock({ kind: 'claude' }, false), 'no_hook');
  assert.equal(steerBlock({ kind: 'claude' }, true), null);
});

// 전달 대기열 틀(가짜 시계). Codex 화면: box(입력 칸) · seen(대화에 보낸 글이 보임)
function rig(t, { box = 'empty' } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const cfg = { submitConfirmMs: 30000, deliveryMaxWaitMs: 900000, inputQuietMs: 3000, submitRetryMs: 6000, submitRetries: 2, typeCheckMs: 0, screenCheckMs: 1500 };
  const v = { state: 'working', agentPresent: true, termConnected: true, closed: false, lastUserInputAt: 0, kind: 'codex', hooked: false };
  const scr = { box, seen: false };
  const sent = [], asides = [], enters = [];
  const rows = new Map();
  const store = { activeDeliveries: () => [], insertDelivery(d) { rows.set(d.deliveryId, { ...d }); }, updateDelivery(id, p) { Object.assign(rows.get(id) || {}, p); }, updateDeliveryText() {}, updateDeliverySeq() {}, getDelivery: (id) => rows.get(id) || null };
  const drafts = { aside: async (sid, d) => { asides.push(d.deliveryId); return { state: 'clear' }; }, back: async () => ({ result: 'restored' }) };
  const q = new DeliveryQueue({ store, cfg, view: () => v, send: async (sid, text) => { sent.push(text); scr.box = 'empty'; scr.seen = true; }, inspect: async () => ({ ...scr, noResend: true }), pressEnter: async () => { enters.push(1); }, drafts });
  const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
  const step = async (ms = 500) => { t.mock.timers.tick(ms); q.pump(); await tick(); };
  return { q, v, scr, sent, asides, enters, step };
}

test('P271 스티어링: 일하는 Codex에 steer(typeNow+aside)로 넣으면 곧바로 넣고 화면으로 확인한다. 턴이 끝난 뒤 다시 가지 않는다', async (t) => {
  const { q, v, sent, asides, step } = rig(t);
  const d = q.enqueue('s', 'STEER: 고양이도 넣어', { typeNow: true, aside: true });
  await step(); await step();
  assert.deepEqual(sent, ['STEER: 고양이도 넣어'], '일하는 중에 넣었다');
  assert.equal(d.status, 'sent'); assert.equal(d.reason, 'typed');
  assert.deepEqual(asides, [], '입력 칸이 비었으면 비키기를 부르지 않는다(Codex)');
  for (let i = 0; i < 4; i++) await step(); // screenCheckMs 뒤 화면 확인(입력 칸이 비고 대화에 보인다)
  assert.equal(d.status, 'confirmed'); assert.equal(d.reason, 'screen');
  v.state = 'ready'; // 턴이 끝났다
  for (let i = 0; i < 20; i++) await step();
  assert.deepEqual(sent, ['STEER: 고양이도 넣어'], '확인된 글은 다시 가지 않는다');
});

test('P271 스티어링: 일하는 Codex 입력 칸에 쓰다 만 글이 있으면 비키지 않고(Ctrl+C가 턴을 멈출 수 있다) 기다린다', async (t) => {
  const { q, v, scr, sent, asides, step } = rig(t, { box: 'other' });
  const d = q.enqueue('s', '정정', { typeNow: true, aside: true });
  for (let i = 0; i < 6; i++) await step();
  assert.deepEqual(sent, []); assert.deepEqual(asides, []);
  assert.equal(d.status, 'queued'); assert.equal(d.reason, 'draft');
  scr.box = 'empty'; // 사람이 지웠다
  for (let i = 0; i < 4; i++) await step();
  assert.deepEqual(sent, ['정정']);
  void v;
});

test('P271 바로 보내기: 일하는 Codex의 대기 글은 cannot_steer 없이 맨 앞으로 와서 지금 턴에 넣는다(how type)', async (t) => {
  const { q, sent, step } = rig(t);
  const a = q.enqueue('s', 'A'); t.mock.timers.tick(1);
  const b = q.enqueue('s', 'B'); t.mock.timers.tick(1);
  await step();
  assert.equal(a.reason, 'working'); assert.deepEqual(sent, [], '보통 대기 글은 턴을 기다린다');
  const r = q.sendNow(b.deliveryId);
  assert.equal(r.how, 'type');
  await step(); await step();
  assert.deepEqual(sent, ['B']);
  assert.equal(a.status, 'queued', '다른 대기 글은 차례 그대로');
});
