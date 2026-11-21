// P289 시험: 스티어링(지금 넣기)이 됐다 안 됐다 하던 까닭. 이름 붙은 Claude Code 세션은 입력 칸 위 가로줄에 이름을 끼워 그려
// 판이 입력 칸을 찾지 못했다(no_box). 입력 칸 찾기(이름 붙은 가로줄, 뒤 작업 줄, 두 줄 상태 줄), 못 넣은 까닭 고르기(steerWhy),
// 같은 까닭은 알림 하나(steer_blocked), 끝내 못 읽으면 턴 끝에 한 번만 들어가는지(물러섬)를 본다. 화면 표본은 지어낸 글이다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { DeliveryQueue, steerWhy } from '../src/delivery.mjs';
import { claudeInputBox, promptOnScreen, isRuleLine, claudeSuggestion } from '../src/screen.mjs';
import { readDraftBox } from '../src/draft-aside.mjs';

const R = (n) => '─'.repeat(n);
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// 지휘 세션과 비슷한 화면: 긴 도구 출력, 표(├──┤), 뒤 작업 줄, 이름 붙은 위 가로줄, NBSP 뒤 글, 두 줄 상태 줄
function screen({ name = 'demo planning thread', box = '', where = 'right', bg = true, working = true } = {}) {
  const top = where === 'right' ? `${R(120)} ${name} ${R(1)}` : where === 'left' ? `${R(2)} ${name} ${R(120)}` : where === 'mid' ? `${R(60)} ${name} ${R(60)}` : R(140);
  return [
    '● Bash(npm test)',
    '  ⎿  ok 1 - parses',
    '     ┌──────────────┬──────────────┐',
    '     ├──────────────┼──────────────┤',
    '     └──────────────┴──────────────┘',
    ...Array.from({ length: 30 }, (_, i) => `     line ${i} of tool output`),
    '',
    working ? '✻ Cogitating… (2m 3s · ↓ 4.1k tokens · esc to interrupt)' : '✻ Cogitated for 3m 45s',
    ...(bg ? ['  ⎿  1 background task · ↓ to manage'] : []),
    '',
    top,
    `❯\u00a0${box}`,
    R(140),
    '  Opus · 1W 43%',
    '  ⏵⏵ bypass permissions on (shift+tab to cycle) · 1 shell',
  ].join('\n');
}

test('P289 가로줄: 이름이 끼어도 가로줄이다. 표·글 줄은 아니다', () => {
  assert.equal(isRuleLine(R(40)), true);
  assert.equal(isRuleLine(`${R(100)} my session ─`), true);
  assert.equal(isRuleLine(`── my session ${R(80)}`), true);
  assert.equal(isRuleLine(`  ${R(50)} 이름 ${R(50)}  `), true);
  assert.equal(isRuleLine('├──────────────┼──────────────┤'), false);
  assert.equal(isRuleLine('────── a long sentence that is mostly words and not a rule at all ──'), false);
  assert.equal(isRuleLine('─'.repeat(11)), false);
  assert.equal(isRuleLine('hello ' + R(40)), false);
});

test('P289 입력 칸 찾기: 이름 붙은 위 가로줄(오른쪽·왼쪽·가운데), 뒤 작업 줄, 두 줄 상태 줄', () => {
  for (const where of ['right', 'left', 'mid', 'none']) {
    const e = claudeInputBox(screen({ where }));
    assert.equal(e.found, true, where);
    assert.equal(e.text, '', where);
    const f = claudeInputBox(screen({ where, box: 'half typed note' }));
    assert.equal(f.found, true, where);
    assert.equal(f.text, 'half typed note', where);
    assert.ok(f.above.some((l) => l.includes('background task')), where);
  }
  // 고치기 전 꼴(가로줄 글자만 받던 RULE)로는 못 찾던 화면이다
  const old = (t) => { const L = t.split('\n'); const rules = L.map((l, i) => (/^\s*[─━]{12,}\s*$/.test(l) ? i : -1)).filter((i) => i >= 0); return rules.length >= 2 && /^\s*[❯>]/.test(L[rules[rules.length - 2] + 1] || ''); };
  assert.equal(old(screen({ where: 'right' })), false);
  assert.equal(old(screen({ where: 'none' })), true);
  // 화면 검사(promptOnScreen)와 쓰다 만 글 읽기(draft-aside)도 같은 찾기를 쓴다
  assert.equal(promptOnScreen(screen(), 'steer this please').box, 'empty');
  assert.equal(promptOnScreen(screen({ box: 'steer this please' }), 'steer this please').box, 'ours');
  assert.equal(promptOnScreen(screen({ box: 'other words' }), 'steer this please').box, 'other');
  assert.equal(readDraftBox(screen({ box: 'draft' }), 'claude').found, true);
  // 흐린 제안 글 가르기(ANSI)도 이름 붙은 가로줄에서 입력 칸을 찾는다
  const ansi = screen().replace('❯\u00a0', '❯\u00a0\x1b[7mf\x1b[0m\x1b[2mix the lint errors\x1b[22m');
  assert.equal(claudeSuggestion(ansi), 'fix the lint errors');
});

test('P289 까닭 고르기(steerWhy)', () => {
  const v = { termConnected: true, agentPresent: true, state: 'working', kind: 'claude', hooked: true };
  assert.equal(steerWhy({ view: v }), null);
  assert.equal(steerWhy({ view: v, look: { box: 'empty' } }), null);
  assert.equal(steerWhy({ view: v, look: { box: 'unknown' } }), 'no_box');
  assert.equal(steerWhy({ view: v, look: null }), 'box_unknown');
  assert.equal(steerWhy({ view: v, look: { box: 'other' } }), 'draft_in_box');
  assert.equal(steerWhy({ view: v, look: { box: 'other' }, aside: true }), null);
  assert.equal(steerWhy({ view: v, look: { box: 'ours' } }), 'draft_in_box');
  assert.equal(steerWhy({ view: { ...v, termConnected: false } }), 'term_disconnected');
  assert.equal(steerWhy({ view: { ...v, agentPresent: false } }), 'no_agent');
  assert.equal(steerWhy({ view: { ...v, state: 'waiting' } }), 'waiting');
  assert.equal(steerWhy({ view: { ...v, state: 'ready' } }), 'not_working');
  assert.equal(steerWhy({ view: { ...v, bgOnly: true } }), 'not_working');
  assert.equal(steerWhy({ view: { ...v, hooked: false } }), 'no_hook');
  assert.equal(steerWhy({ view: { ...v, kind: 'opencode' } }), 'kind');
  assert.equal(steerWhy({ view: { ...v, kind: 'codex', hooked: false }, look: { box: 'empty' } }), null);
  assert.equal(steerWhy({ view: { ...v, lastUserInputAt: 1000 }, now: 2000, quietMs: 3000 }), 'user_typing');
});

// 진짜 저장소와 대기열, 가짜 세션 하나(상태와 화면을 시험이 정한다)
function rig(view0 = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p289-'));
  const store = new Store(path.join(dir, 'board.db'));
  const sid = 'sess-1';
  const v = { state: 'working', agentPresent: true, termConnected: true, lastUserInputAt: 0, closed: false, kind: 'claude', hooked: true, ...view0 };
  const r = { store, sid, v, screen: screen(), sent: [], events: [], deliveries: [] };
  const cfg = { inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, typeCheckMs: 20 };
  r.q = new DeliveryQueue({
    store, cfg, view: () => r.v,
    send: async (s, text) => { r.sent.push(text); setTimeout(() => r.q.onUserPromptSubmit(sid, text), 5); },
    inspect: async (s, text) => promptOnScreen(r.screen, text, 'claude'),
  });
  r.q.on('steer_blocked', (e) => r.events.push(e));
  r.q.on('delivery', (d) => r.deliveries.push(d));
  r.q.start();
  r.done = () => { r.q.stop(); try { store.close && store.close(); } catch {} };
  return r;
}

test('P289 이름 붙은 지휘 세션 화면에 스티어링이 지금 턴에 들어간다', async () => {
  const r = rig();
  try {
    const d = r.q.enqueue(r.sid, 'steer note one', { typeNow: true, aside: true, origin: { kind: 'human' } });
    await until(() => r.sent.length === 1);
    assert.equal(r.sent[0], 'steer note one');
    await until(() => r.store.getDelivery(d.deliveryId).status === 'confirmed');
    assert.equal(r.events.length, 0);
  } finally { r.done(); }
});

test('P289 입력 칸을 못 찾으면 까닭(no_box)을 한 번만 남기고, 턴이 끝나면 한 번만 넣는다', async () => {
  const r = rig();
  r.screen = 'just some output\nwithout any input box\n';
  try {
    const d = r.q.enqueue(r.sid, 'queued answer', { origin: { kind: 'human' } });
    await tick(60);
    assert.equal(r.sent.length, 0); // 일하는 중 대기열 글
    for (let i = 0; i < 8; i++) { r.q.sendNow(d.deliveryId); await tick(40); } // 사람이 "지금 넣기"를 거듭 누른다
    await until(() => r.events.length >= 1);
    await tick(150);
    assert.deepEqual(r.events.map((e) => e.why), ['no_box']);
    assert.equal(r.sent.length, 0);
    const shown = r.deliveries.filter((x) => x.deliveryId === d.deliveryId && x.steerWhy === 'no_box');
    assert.ok(shown.length >= 1, '창으로 가는 delivery 이벤트에 까닭이 실린다');
    assert.equal(r.q.sendNow(d.deliveryId).steerWhy, 'no_box'); // 다시 누르면 앞서 못 넣은 까닭을 돌려준다(창 알림)
    // 턴이 끝난다 → 보통 보내기로 한 번
    r.v = { ...r.v, state: 'ready' };
    await until(() => r.sent.length === 1);
    await until(() => r.store.getDelivery(d.deliveryId).status === 'confirmed');
    await tick(100);
    assert.equal(r.sent.length, 1);
  } finally { r.done(); }
});

test('P289 화면이 고쳐지면(입력 칸이 보이면) 기다리던 스티어링이 지금 턴에 들어가고 까닭이 지워진다', async () => {
  const r = rig();
  r.screen = 'no box here\n';
  try {
    const d = r.q.enqueue(r.sid, 'late steer', { typeNow: true, aside: true });
    await until(() => r.events.length === 1);
    r.screen = screen();
    await until(() => r.sent.length === 1);
    await until(() => r.store.getDelivery(d.deliveryId).status === 'confirmed');
    const last = r.deliveries.filter((x) => x.deliveryId === d.deliveryId).pop();
    assert.equal(last.steerWhy, null);
    assert.equal(last.reason, 'typed');
  } finally { r.done(); }
});

test('P289 쓰다 만 글(비킬 수 없음)·질문 중·받지 않는 종류의 까닭', async () => {
  const a = rig();
  a.screen = screen({ box: 'sentence the person is writing' });
  try {
    a.q.enqueue(a.sid, 'phone line', { typeNow: true }); // 휴대폰 입력 줄(P90): 비키지 않는다
    await until(() => a.events.length === 1);
    assert.equal(a.events[0].why, 'draft_in_box');
  } finally { a.done(); }
  const b = rig({ state: 'waiting' });
  try {
    b.q.enqueue(b.sid, 'steer while asking', { typeNow: true, aside: true });
    await until(() => b.events.length === 1);
    assert.equal(b.events[0].why, 'waiting');
    await tick(80);
    assert.equal(b.events.length, 1);
  } finally { b.done(); }
  const c = rig({ kind: 'opencode', hooked: false });
  try {
    c.q.enqueue(c.sid, 'steer opencode', { typeNow: true, aside: true });
    await until(() => c.events.length === 1);
    assert.equal(c.events[0].why, 'kind');
    assert.throws(() => c.q.sendNow(c.q.list(c.sid)[0].deliveryId), (e) => e.code === 'cannot_steer'); // 설계상 안 되는 경우는 그대로 거절
  } finally { c.done(); }
});
