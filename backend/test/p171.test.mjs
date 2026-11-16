// P171 단위 시험: 일시 연결. atrium read·wait는 선을 새로 만들지 않고, 관계 없는 쌍의 atrium prompt는 일시 선(턴이 끝나고 여운 뒤 빠짐),
// 관계 있는 쌍은 영구 선, 관계를 얻거나 "연결 유지"면 영구로 바뀐다. 판이 뜰 때 읽기·기다리기만 오간 옛 선을 지운다(지시가 오간 선은 남는다).
// herdr·hc와 claude 없이 돈다(p116 시험의 가짜 판 틀 + 판의 진짜 ensureLink·linkEvent).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { Backend } from '../src/backend.mjs';
import { missionGraph } from '../src/mission.mjs';
import { linkWeights } from '../src/region-layout.mjs';
import { TempLinks, linkPatch, expiredTemps, readOnlyLink, tempUntilAfter, LINGER_MS, TEMP_MAX_MS } from '../src/temp-links.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p171-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const P = Backend.prototype;

function idle(s) { s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle'); }
async function board() {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p171test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(),
    casts: [], screens: new Map(),
    api: { broadcast: (e, d) => b.casts.push([e, d]) }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async (paneId) => { if (!b.screens.has(paneId)) throw Object.assign(new Error('no pane'), { code: 'pane_not_found' }); return b.screens.get(paneId); } },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { state: d.state, ask: d.ask || null, error: d.error || null }; },
    resolve(ref) { const s = [...b.sessions.values()].find((x) => x.sessionId === ref || x.name === ref); if (!s) throw Object.assign(new Error('없음'), { code: 'not_found' }); return s; },
  };
  // 판의 진짜 연결 코드
  for (const k of ['ensureLink', 'linkEvent', 'linkView', 'linkPromptView', 'linkTargetDone', 'linkCreate']) b[k] = P[k].bind(b);
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    send: async (sid, text) => { const s = b.sessions.get(sid); if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.start();
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, verbs: { pollMs: 15, settleMs: 1500, turnGraceMs: 300, answerGraceMs: 300 } });
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
  b.tempLinks = new TempLinks(b);
  const add = (name, extra = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, paneId: `${name}:p1`, agentName: name, permissionMode: 'manual', kind: 'claude', origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind: 'claude', hooked: true }), createdAt: Date.now(), ...extra };
    idle(s);
    store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
    b.sessions.set(s.sessionId, s);
    b.screens.set(s.paneId, `❯ 이전 글\n● ${name}의 화면`);
    s.agent = (text) => {
      applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: text }); b.queue.onUserPromptSubmit(s.sessionId, text); applyTermStatus(s.rt, 'working');
      setTimeout(() => { applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: `답: ${text}` }); applyTermStatus(s.rt, 'idle'); }, 40);
    };
    return s;
  };
  // A가 B를 띄움(계보), C는 따로
  const A = add('a');
  const B = add('b', { parentSessionId: A.sessionId });
  const C = add('c');
  return { b, store, A, B, C, stop: () => { b.queue.stop(); b.branch.notices.stop(); b.tempLinks.stop(); store.close(); } };
}
const open = (store) => store.links().filter((l) => !l.removedAt);
const pair = (store, x, y) => store.links({ all: true }).find((l) => l.from === x.sessionId && l.to === y.sessionId) || null;

test('linkPatch: 새 일시 선, 영구 선에 일시 글, 일시 선의 영구화, 지운 선 다시 열기', () => {
  const now = 1000;
  const ins = linkPatch(null, { from: 'x', to: 'y', observed: true, transient: true }, now, () => 'L1').insert;
  assert.equal(ins.transient, true); assert.equal(ins.tempUntil, now + TEMP_MAX_MS); assert.equal(ins.linkId, 'L1');
  const perm = linkPatch(null, { from: 'x', to: 'y', observed: true }, now).insert;
  assert.equal(perm.transient, false); assert.equal(perm.tempUntil, null);
  // 열린 영구 선에 일시 글: 그대로 영구
  assert.deepEqual(linkPatch({ observed: true, transient: false }, { observed: true, transient: true }, now).update, {});
  // 열린 일시 선에 또 일시 글: 수명만 늘린다
  assert.deepEqual(linkPatch({ observed: true, transient: true, tempUntil: 5 }, { observed: true, transient: true }, now).update, { tempUntil: now + TEMP_MAX_MS });
  // 일시 선에 역할·관계(transient 없는 부름): 영구로
  assert.deepEqual(linkPatch({ observed: true, transient: true, tempUntil: 5, role: null }, { role: '리뷰어' }, now).update, { transient: false, tempUntil: null, role: '리뷰어' });
  // 일시로 지워진 쌍에 또 일시 글: 다시 일시로 연다
  assert.deepEqual(linkPatch({ observed: true, transient: true, removedAt: 9 }, { observed: true, transient: true }, now).update, { removedAt: null, tempUntil: now + TEMP_MAX_MS });
  // 지워진 일시 선에 관계로 다시: 영구로 연다
  assert.deepEqual(linkPatch({ observed: true, transient: true, removedAt: 9 }, {}, now).update, { removedAt: null, transient: false, tempUntil: null });
  // 지워진 영구 선에 일시 글: 일시로 다시 연다(사람이 지운 선)
  assert.deepEqual(linkPatch({ observed: true, transient: false, removedAt: 9 }, { observed: true, transient: true }, now).update, { removedAt: null, transient: true, tempUntil: now + TEMP_MAX_MS });
});

test('tempUntilAfter·expiredTemps·readOnlyLink', () => {
  assert.equal(tempUntilAfter('prompt', null, 10), 10 + TEMP_MAX_MS);
  assert.equal(tempUntilAfter('target_done', null, 10), 10 + LINGER_MS);
  assert.equal(tempUntilAfter('prompt_result', { ok: false }, 10), 10 + LINGER_MS);
  assert.equal(tempUntilAfter('reply', null, 10), null);
  const ls = [{ linkId: 1, transient: true, tempUntil: 5 }, { linkId: 2, transient: true, tempUntil: 50 }, { linkId: 3, transient: false, tempUntil: 1 }, { linkId: 4, transient: true, tempUntil: 1, removedAt: 2 }, { linkId: 5, transient: true, tempUntil: 1 }];
  const r = expiredTemps(ls, 10, (l) => l.linkId === 5);
  assert.deepEqual(r.gone.map((l) => l.linkId), [1]); assert.deepEqual(r.extend.map((l) => l.linkId), [5]);
  const l = { from: 'x', to: 'y' };
  assert.equal(readOnlyLink(l, [{ kind: 'reply', data: { verb: 'read' } }, { kind: 'wait_result', data: {} }, { kind: 'reply', data: { verb: 'wait' } }]), true);
  assert.equal(readOnlyLink(l, [{ kind: 'reply', data: { verb: 'read' } }, { kind: 'prompt', data: {} }]), false, '지시가 오간 선은 남는다');
  assert.equal(readOnlyLink(l, []), false);
  assert.equal(readOnlyLink({ ...l, role: '리뷰어' }, [{ kind: 'reply', data: { verb: 'read' } }]), false);
  assert.equal(readOnlyLink({ ...l, spawned: true }, [{ kind: 'reply', data: { verb: 'read' } }]), false);
  assert.equal(readOnlyLink(l, [{ kind: 'reply', data: { verb: 'read' } }], () => true), false, '관계 있는 쌍은 남긴다');
});

test('atrium read·wait는 새 연결을 만들지 않고 세션 사건에 남는다', async () => {
  const { b, store, A, C, stop } = await board();
  try {
    const r = await b.branch.verbs.read(A, { name: 'c' });
    assert.ok(r.text.includes('c의 화면'));
    const w = await b.branch.verbs.wait(A, { name: 'c', timeoutMs: 2000 });
    assert.equal(w.status, 'idle');
    assert.equal(store.links({ all: true }).length, 0, '선이 생기지 않는다');
    const ev = store.events ? store.events({ sessionId: A.sessionId }) : null;
    if (ev) { const kinds = (ev.events || ev).map((e) => e.kind); assert.ok(kinds.includes('atrium_read') && kinds.includes('atrium_wait'), kinds.join(',')); }
    void C;
  } finally { stop(); }
});

test('관계 있는 쌍(띄움 계보)의 prompt는 영구 연결, 그 뒤 read는 있는 연결에 기록을 붙인다', async () => {
  const { b, store, A, B, stop } = await board();
  try {
    const r = await b.branch.verbs.prompt(A, { name: 'b', text: '일 해', wait: true, timeoutMs: 5000 });
    assert.equal(r.turn.status, 'done');
    const l = pair(store, A, B);
    assert.ok(l && !l.transient && !l.removedAt && l.tempUntil == null, '영구 선');
    await b.branch.verbs.read(A, { name: 'b' });
    assert.ok(store.linkEvents(l.linkId).some((e) => e.kind === 'reply' && e.data.verb === 'read'));
    assert.equal(b.tempLinks.sweep(Date.now() + TEMP_MAX_MS * 10), 0, '쓸어도 남는다');
  } finally { stop(); }
});

test('관계 없는 쌍의 prompt는 일시 연결이고 턴이 끝난 뒤 여운이 지나면 판에서 빠진다(기록은 남는다)', async () => {
  const { b, store, A, C, stop } = await board();
  try {
    const r = await b.branch.verbs.prompt(A, { name: 'c', text: '한 번만 물어볼게', wait: true, timeoutMs: 5000 });
    assert.equal(r.turn.status, 'done');
    let l = pair(store, A, C);
    assert.ok(l.transient && !l.removedAt, '일시 선');
    assert.ok(b.casts.some(([e, d]) => e === 'link.updated' && d.linkId === l.linkId && d.transient === true), '창에 일시 선으로 알린다');
    // 턴 끝(판의 F1: onLinkTargetState → linkTargetDone)
    C.openPromptFrom = { linkId: l.linkId, at: Date.now(), working: true };
    b.linkTargetDone(C, store.getLink(l.linkId), 'ready');
    l = store.getLink(l.linkId);
    assert.ok(l.tempUntil > Date.now() && l.tempUntil <= Date.now() + LINGER_MS, '여운만 남는다');
    assert.equal(b.tempLinks.sweep(Date.now()), 0, '여운 동안은 보인다');
    assert.equal(b.tempLinks.sweep(Date.now() + LINGER_MS + 1), 1);
    l = store.getLink(l.linkId);
    assert.ok(l.removedAt, '판에서 빠졌다');
    assert.ok(b.casts.some(([e, d]) => e === 'link.removed' && d.linkId === l.linkId && d.reason === 'temporary'));
    const kinds = store.linkEvents(l.linkId).map((e) => e.kind);
    assert.ok(kinds.includes('prompt') && kinds.includes('target_done'), '기록은 남는다');
    assert.equal(open(store).length, 0);
    // 그 뒤 read는 새 선을 만들지 않는다
    await b.branch.verbs.read(A, { name: 'c' });
    assert.equal(open(store).length, 0);
  } finally { stop(); }
});

test('일하는 중인 일시 선은 수명이 지나도 늘린다', async () => {
  const { b, store, A, C, stop } = await board();
  try {
    const l = b.ensureLink(A.sessionId, C.sessionId, { observed: true, transient: true });
    C.openPromptFrom = { linkId: l.linkId, at: Date.now() };
    applyTermStatus(C.rt, 'working');
    assert.equal(b.tempLinks.sweep(Date.now() + TEMP_MAX_MS + 1), 0);
    assert.ok(store.getLink(l.linkId).tempUntil > Date.now() + TEMP_MAX_MS);
  } finally { stop(); }
});

test('관계를 얻으면(atrium relate, 역할 선, 연결 유지) 일시 선이 영구가 된다. 독립(none)은 그대로 일시', async () => {
  const { b, store, A, C, stop } = await board();
  try {
    await b.branch.verbs.prompt(A, { name: 'c', text: 'x', wait: true, timeoutMs: 5000 });
    let l = pair(store, A, C);
    assert.ok(l.transient);
    b.branch.relateVerb(A, { name: 'c', relation: 'none' });
    assert.ok(store.getLink(l.linkId).transient, '독립은 일 관계가 아니다');
    b.branch.relateVerb(A, { name: 'c', relation: 'peer' });
    l = store.getLink(l.linkId);
    assert.ok(!l.transient && l.tempUntil == null, '동료가 되면 영구');
    // 동료 사이의 prompt는 영구 그대로
    await b.branch.verbs.prompt(A, { name: 'c', text: 'y', wait: true, timeoutMs: 5000 });
    assert.ok(!store.getLink(l.linkId).transient);
  } finally { stop(); }
});

test('일시 선이 빠진 뒤에도 atrium relate로 관계를 정하면 영구 선으로 다시 열린다', async () => {
  const { b, store, A, C, stop } = await board();
  try {
    await b.branch.verbs.prompt(A, { name: 'c', text: 'x', wait: true, timeoutMs: 5000 });
    const l = pair(store, A, C);
    b.linkEvent(store.getLink(l.linkId), 'target_done', null, null, { quiet: true });
    b.tempLinks.sweep(Date.now() + LINGER_MS + 1);
    assert.ok(store.getLink(l.linkId).removedAt);
    b.branch.relateVerb(A, { name: 'c', relation: 'sub' });
    const nl = store.getLink(l.linkId);
    assert.ok(!nl.removedAt && !nl.transient, '하위가 되면 영구로 다시 연다');
  } finally { stop(); }
});

test('사람의 역할 선과 연결 유지는 일시 선을 영구로 바꾼다', async () => {
  const { b, store, A, C, stop } = await board();
  try {
    const l1 = b.ensureLink(A.sessionId, C.sessionId, { observed: true, transient: true });
    b.tempLinks.keep({ link: l1.linkId });
    assert.ok(!store.getLink(l1.linkId).transient, '연결 유지');
    assert.equal(b.tempLinks.keep({ link: l1.linkId }).kept, false, '영구 선에는 할 일 없음');
    const l2 = b.ensureLink(C.sessionId, A.sessionId, { observed: true, transient: true });
    b.ensureLink(C.sessionId, A.sessionId, { role: '리뷰어' }); // linkCreate가 부르는 것과 같다
    assert.ok(!store.getLink(l2.linkId).transient, '역할 선');
    assert.throws(() => b.tempLinks.keep({ link: 'nope' }), /찾을 수 없습니다/);
  } finally { stop(); }
});

test('판이 뜰 때 읽기·기다리기만 오간 옛 선을 지운다(지시가 오간 선, 관계 있는 쌍은 남는다)', async () => {
  const { b, store, A, B, C, stop } = await board();
  try {
    const D = (() => { const s = { ...C, sessionId: crypto.randomUUID(), name: 'd', paneId: 'd:p1' }; store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt }); b.sessions.set(s.sessionId, s); return s; })();
    // 옛 판처럼 read·wait가 만든 선(관찰, 역할 없음)
    const mk = (x, y) => { const l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from: x.sessionId, to: y.sessionId, role: null, spawned: false, observed: true, createdAt: Date.now() }; store.insertLink(l); return l; };
    const readOnly = mk(A, C); store.addLinkEvent(readOnly.linkId, 'reply', '화면', { via: 'atrium', verb: 'read' }); store.addLinkEvent(readOnly.linkId, 'wait_result', null, { status: 'idle' });
    const prompted = mk(C, D); store.addLinkEvent(prompted.linkId, 'reply', '화면', { verb: 'read' }); store.addLinkEvent(prompted.linkId, 'prompt', '해 줘', { via: 'atrium' });
    const related = mk(A, B); store.addLinkEvent(related.linkId, 'reply', '화면', { verb: 'read' }); // A가 B를 띄움
    const n = b.tempLinks.cleanupReadLinks();
    assert.equal(n, 1);
    assert.ok(store.getLink(readOnly.linkId).removedAt);
    assert.ok(!store.getLink(prompted.linkId).removedAt);
    assert.ok(!store.getLink(related.linkId).removedAt);
    assert.equal(b.tempLinks.cleanupReadLinks(), 0, '두 번째는 할 일 없음');
  } finally { stop(); }
});

test('세션 맵과 영역 무게는 일시 선을 일 관계로 보지 않는다', () => {
  const sessions = [{ sessionId: 'x', state: 'ready' }, { sessionId: 'y', state: 'ready' }];
  const temp = { linkId: 'L', from: 'x', to: 'y', observed: true, transient: true, lastText: 'hi' };
  const g = missionGraph({ sessions, links: [temp] });
  assert.equal(g.edges.filter((e) => e.kind === 'prompt').length, 0);
  const g2 = missionGraph({ sessions, links: [{ ...temp, transient: false }] });
  assert.equal(g2.edges.filter((e) => e.kind === 'prompt').length, 1);
  const areaOf = (id) => (id === 'x' ? 'A' : 'B');
  assert.deepEqual(linkWeights({ links: [temp], areaOf }), []);
  assert.equal(linkWeights({ links: [{ ...temp, transient: false }], areaOf }).length, 1);
});
