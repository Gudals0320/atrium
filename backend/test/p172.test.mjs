// P172 시험: 전달 대기열 쓰기 쉽게. 같은 세션 대기 글의 순서 바꾸기(reorder, 차례 저장·그 차례대로 보내기)와
// 바로 보내기(sendNow: 일하는 Claude Code → 대기 메시지 길(typeNow), 쉬는 세션 → 곧바로, 일하는 중 입력을 못 받는 종류 → cannot_steer).
// 고치는 중(hold)인 글은 바로 보내기·순서 바꾸기 중에도 보내지 않는다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Store } from '../src/store.mjs';

const cfg = { submitConfirmMs: 30000, deliveryMaxWaitMs: 900000, inputQuietMs: 3000, submitRetryMs: 6000, submitRetries: 2, typeCheckMs: 0 };
const tick = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const fakeStore = () => ({
  rows: new Map(), seqs: [], activeDeliveries: () => [],
  insertDelivery(d) { this.rows.set(d.deliveryId, { ...d }); },
  updateDelivery(id, p) { const r = this.rows.get(id) || {}; Object.assign(r, { status: p.status, reason: p.reason ?? null }); },
  updateDeliveryText(id, text) { const r = this.rows.get(id); if (r) r.text = text; },
  updateDeliverySeq(id, seq) { this.seqs.push([id, seq]); const r = this.rows.get(id); if (r) r.seq = seq; },
  getDelivery(id) { return this.rows.get(id) || null; },
});

function rig(t, view = {}, { box = 'empty' } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const v = { state: 'working', agentPresent: true, termConnected: true, closed: false, lastUserInputAt: 0, kind: 'claude', hooked: true, ...view };
  const sent = [], events = [], nows = [];
  const store = fakeStore();
  const inspect = async () => ({ box, seen: false });
  const q = new DeliveryQueue({ store, cfg, view: () => v, send: async (sid, text) => { sent.push(text); }, inspect, pressEnter: async () => {} });
  q.on('delivery', (d) => events.push({ id: d.deliveryId, status: d.status, reason: d.reason, seq: d.seq }));
  q.on('now', (r) => nows.push(r));
  const step = async (ms = 500) => { t.mock.timers.tick(ms); q.pump(); await tick(); };
  const enq = (text) => { const d = q.enqueue('s', text); t.mock.timers.tick(1); return d; }; // 넣은 시각이 겹치지 않게
  return { q, v, sent, events, nows, store, step, enq };
}

test('P172 순서 바꾸기: 대기 글의 차례를 바꾸면 저장하고 그 차례대로 보낸다. 바뀐 글마다 이벤트를 낸다', async (t) => {
  const { q, v, sent, events, store, step, enq } = rig(t);
  const a = enq('A'), b = enq('B'), c = enq('C');
  await step();
  assert.equal(a.reason, 'working');
  events.length = 0;
  const r = q.reorder([c.deliveryId, a.deliveryId, b.deliveryId]);
  assert.deepEqual(r.order.map((x) => x.deliveryId), [c.deliveryId, a.deliveryId, b.deliveryId]);
  assert.deepEqual(q.list('s').map((d) => d.text), ['C', 'A', 'B'], 'list도 차례대로');
  assert.equal(store.seqs.length, 3, '바뀐 차례를 저장한다');
  assert.ok(events.every((e) => typeof e.seq === 'number') && events.length === 3, '다른 창이 새 차례를 받는다');
  // 보내기: 한가해질 때마다 하나씩 확인
  v.state = 'ready';
  for (let i = 0; i < 3; i++) { await step(); q.onUserPromptSubmit('s', sent[sent.length - 1]); await step(); }
  assert.deepEqual(sent, ['C', 'A', 'B'], '바꾼 차례대로 간다');
  const d = q.enqueue('s', 'D');
  assert.ok(d.seq > Math.max(a.seq, b.seq, c.seq), '뒤에 넣은 글은 맨 뒤');
});

test('P172 순서 바꾸기: 보내는 중·보낸 글은 앞에 그대로, 빠진 대기 글은 뒤에 붙고, 다른 세션 글은 섞지 않는다', async (t) => {
  const { q, v, sent, step, enq } = rig(t, { state: 'ready' });
  const a = enq('A'); await step(); // A는 보냄(확인을 기다림)
  assert.equal(a.status, 'sent');
  const b = enq('B'), c = enq('C'), d = enq('D');
  q.reorder([d.deliveryId]);
  assert.deepEqual(q.list('s').map((x) => x.text), ['A', 'D', 'B', 'C']);
  const other = q.enqueue('s2', 'X');
  assert.throws(() => q.reorder([b.deliveryId, other.deliveryId]), { code: 'bad_request' });
  assert.throws(() => q.reorder([]), { code: 'bad_request' });
  q.onUserPromptSubmit('s', 'A'); await step();
  assert.deepEqual(sent.filter((x) => x !== 'X'), ['A', 'D']);
  void v; void c;
});

test('P172 바로 보내기: 일하는 Claude Code(hook 있음)면 맨 앞으로 와서 대기 메시지 길(typeNow)로 지금 들어가고 "바로 보냄"이 남는다', async (t) => {
  const { q, sent, events, nows, step, enq } = rig(t);
  const a = enq('A'), b = enq('B'), c = enq('C\n');
  await step();
  assert.deepEqual(sent, [], '일하는 중이라 기다린다');
  const r = q.sendNow(c.deliveryId);
  assert.equal(r.how, 'type');
  assert.equal(nows.length, 1, '판 기록(delivery_now)');
  assert.deepEqual(q.list('s').map((x) => x.deliveryId), [c.deliveryId, a.deliveryId, b.deliveryId], '대기 맨 앞으로');
  await step(); await step();
  assert.deepEqual(sent, ['C'], '일하는 중에 입력 칸으로 넣는다(끝 줄바꿈 없이)');
  assert.equal(c.status, 'sent'); assert.equal(c.reason, 'now_typed');
  q.onUserPromptSubmit('s', 'C');
  assert.equal(c.status, 'confirmed'); assert.equal(c.reason, 'now_typed', '전달 기록에 바로 보냄');
  await step();
  assert.equal(a.status, 'queued', '나머지는 그대로 기다린다');
  assert.ok(events.some((e) => e.id === c.deliveryId && e.reason === 'now_typed'));
});

test('P172 바로 보내기: 쉬는 세션은 곧바로 보낸다(reason now)', async (t) => {
  const { q, v, sent, step, enq } = rig(t, { state: 'waiting' }); // 질문 중이라 막혀 있다가
  const a = enq('A'), b = enq('B');
  await step();
  q.sendNow(b.deliveryId);
  v.state = 'ready';
  await step();
  assert.deepEqual(sent, ['B']);
  q.onUserPromptSubmit('s', 'B');
  assert.equal(b.reason, 'now');
  await step(); await step();
  assert.deepEqual(sent, ['B', 'A']);
  void a;
});

test('P172 바로 보내기: 일하는 중 입력을 못 받는 종류(opencode, hook 없는 세션)는 cannot_steer, 보낸 글·없는 글은 거절', async (t) => {
  for (const view of [{ kind: 'opencode', hooked: false }, { kind: 'claude', hooked: false }]) { // P271: Codex는 받는다(p271.test)
    const { q, enq, step } = rig(t, view);
    const a = enq('A');
    await step();
    assert.throws(() => q.sendNow(a.deliveryId), { code: 'cannot_steer' });
    assert.equal(a.typeNow, undefined, '거절하면 아무것도 바꾸지 않는다');
    t.mock.timers.reset();
  }
  const { q, v, step, enq } = rig(t, { state: 'ready' });
  const a = enq('A'); await step();
  assert.throws(() => q.sendNow(a.deliveryId), { code: 'already_sent' });
  assert.throws(() => q.sendNow('dnope'), { code: 'not_found' });
  void v;
});

test('P172 고치는 중인 글은 바로 보내기·순서 바꾸기 중에도 보내지 않는다', async (t) => {
  const { q, v, sent, step, enq } = rig(t);
  const a = enq('A'), b = enq('B'), c = enq('C');
  await step();
  q.hold(a.deliveryId);
  assert.throws(() => q.sendNow(a.deliveryId), { code: 'editing' }, '고치는 글 자체는 바로 보내지 않는다');
  q.sendNow(c.deliveryId); // 다른 글을 바로 보내도
  await step(); await step();
  assert.deepEqual(sent, ['C']);
  q.onUserPromptSubmit('s', 'C');
  q.reorder([b.deliveryId, a.deliveryId]); // B를 앞으로
  assert.equal(a.editing, true, '자리만 옮기고 붙잡힌 그대로');
  v.state = 'ready';
  await step(); q.onUserPromptSubmit('s', 'B');
  for (let i = 0; i < 4; i++) await step(1000);
  assert.deepEqual(sent, ['C', 'B'], 'A는 붙잡힌 동안 가지 않는다');
  q.reorder([a.deliveryId]);
  for (let i = 0; i < 3; i++) await step(1000);
  assert.deepEqual(sent, ['C', 'B'], '순서를 바꿔도 붙잡힌 글은 가지 않는다');
  q.update(a.deliveryId, 'A2');
  await step(); await step();
  assert.deepEqual(sent, ['C', 'B', 'A2'], '놓으면 간다');
});

test('P172 저장소: 차례(seq)를 저장하고 다시 뜨면 그 차례로 읽는다', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p172-'));
  try {
    const st = new Store(path.join(dir, 'board.db'));
    const mk = (id, t) => st.insertDelivery({ deliveryId: id, sessionId: 's', text: id, status: 'queued', reason: null, createdAt: t, seq: t });
    mk('d1', 100); mk('d2', 200); mk('d3', 300);
    st.updateDeliverySeq('d3', 50);
    assert.deepEqual(st.activeDeliveries().map((d) => d.deliveryId), ['d3', 'd1', 'd2']);
    assert.equal(st.getDelivery('d3').seq, 50);
    const q = new DeliveryQueue({ store: st, cfg, view: () => ({ state: 'working', agentPresent: true, termConnected: true }), send: async () => {} });
    assert.deepEqual(q.list('s').map((d) => d.deliveryId), ['d3', 'd1', 'd2'], '대기열도 저장된 차례로');
    st.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
