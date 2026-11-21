// P306 단위 시험: 사람이 목표 레인을 바꾸면 그 레인의 관리자에게 알림(plan-notify.mjs). 알림 줄, 다음 메시지와 실어 보내기, 마일스톤 끝은 곧바로,
// 관리자 없음·닫힘, 설정 off·now, 미루기는 조용히, 결정 답과 함께 실림, 실패하면 되돌림.
// 진짜 저장소·전달 대기열·Branch, 가짜 에이전트(p284 시험의 틀). herdr·hc와 claude 없이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch, boardSkill, ATRIUM_ALLOW } from '../src/branch.mjs';
import { CONTRACT_VERSION, VERB_NAMES, VERBS, shortHelp } from '../src/cli-contract.mjs';
import { BOARD_SYSTEM_PROMPT } from '../src/launch.mjs';
import { VERB_OP, ORCH_SUB_VERBS, permOf, opRefusal } from '../src/orchestration.mjs';
import { PLAN, HUMAN_OPS, emptyPlan, applyPlanOp, applyPlanOps, planSummary, validatePlanDoc, importCounts, planMarkdown, focusUserItems, docBytes } from '../src/plan.mjs';
import { parsePlanArgs, showLines, writeLines, importLines, meLines, PLAN_HELP } from '../src/plan-cli.mjs';
import { laneName } from '../src/plan-board.mjs';
import { PlanNotes, noteLine, newlyAllChecked, changeBit, PLAN_NOTIFY } from '../src/plan-notify.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p306-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p306test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], spawned: [],
    api: { broadcast: () => {} }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '' },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { state: d.state, ask: d.ask || null, error: d.error || null }; },
    ensureLink(from, to, patch = {}) {
      let l = store.linkByPair(from, to);
      if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: !!patch.spawned, observed: !!patch.observed, createdAt: Date.now() }; store.insertLink(l); }
      return store.getLink(l.linkId);
    },
    linkEvent(l, kind, text = null, data = null) { return store.addLinkEvent(l.linkId, kind, text, data); },
    // 상태가 바뀌면 판처럼 bus로 알린다(Branch.onSession → WorkUnits.onSession)
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    async spawn(p) {
      const s = add(p.name, { parentSessionId: p.parentSessionId || null });
      if (p.branch) b.branch.noteChild(s.sessionId, p.branch);
      b.spawned.push(p);
      return { sessionId: s.sessionId, trust: { needsTrust: false } };
    },
    closeSession(s, reason) { b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
  };
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    send: async (sid, text) => { if (b.stopped) return; b.sent.push({ sid, text }); const s = b.sessions.get(sid); if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.start();
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 } });
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
  // 가짜 에이전트: 글을 받으면 일하고(workMs) 쉰다. onText(text, s)는 일하는 중에 부른다(done을 치는 워커 등)
  const add = (name, { kind = 'claude', hooked = kind === 'claude', workMs = 80, onText = null, ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, paneId: `${name}:p1`, agentName: name, permissionMode: 'manual', kind, origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind, hooked }), createdAt: Date.now(), ...extra };
    idle(s);
    store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
    b.sessions.set(s.sessionId, s);
    s.texts = [];
    s.agent = (text) => {
      s.texts.push(text);
      if (hooked) { applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: text }); b.queue.onUserPromptSubmit(s.sessionId, text); applyTermStatus(s.rt, 'working'); }
      else { applyTermStatus(s.rt, 'working'); b.queue.onAgentWorking(s.sessionId); }
      b.broadcastSession(s);
      const h = s.onText || onText;
      setTimeout(async () => {
        if (b.stopped) return;
        if (h) try { await h(text, s); } catch (e) { s.err = e; }
        if (b.stopped) return;
        if (hooked) applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: `답: ${text.slice(-20)}` });
        applyTermStatus(s.rt, 'idle');
        b.broadcastSession(s);
      }, workMs);
    };
    b.broadcastSession(s);
    return s;
  };
  const busy = (s) => { applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: '사람의 일' }); applyTermStatus(s.rt, 'working'); b.broadcastSession(s); };
  const rest = (s) => { applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: '끝' }); applyTermStatus(s.rt, 'idle'); b.broadcastSession(s); };
  return { b, dir, ws, add, busy, rest, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); await tick(400); store.close(); } };
}
function idle(s) { s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle'); }
const U = (b) => b.branch.units;
const units = (b) => b.store.db.prepare('SELECT * FROM work_units').all();
const tries = (b) => b.store.db.prepare('SELECT * FROM unit_tries').all();
const toParent = (b, p) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ?').all(p.sessionId);
function serve(b) {
  const srv = http.createServer((req, res) => { if (!b.branch.handleHttp(req, res)) { res.writeHead(404); res.end(); } });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => { b.cfg.port = srv.address().port; r(srv); }));
}
function runCli(args, env) {
  return new Promise((resolve) => {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MTASK_|ATRIUM_|HERDR_|HC_)/.test(k)));
    execFile(process.execPath, [path.join(HERE, '..', 'bin', 'atrium-child.mjs'), ...args], { env: { ...clean, ...env }, timeout: 30000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}
const envOf = (b, s) => ({ ATRIUM_PORT: String(b.cfg.port), ATRIUM_SESSION_ID: s.sessionId, ATRIUM_SESSION_TOKEN: b.branch.token(s.sessionId), ATRIUM_TERMINAL_SESSION: b.cfg.terminalSession });



// ---------- P306 ----------
const A = { now: 1000, actor: { by: 'lead', via: 'agent' } };
function sampleOps() {
  return [
    { op: 'goal', text: '수집 목표' },
    { op: 'ms', code: 'M1', title: '센서' },
    { op: 'ms', code: 'M2', title: '기록 채우기' },
    { op: 'itemAdd', ms: 'M2', text: '매핑' },
    { op: 'itemAdd', ms: 'M2', text: '수집기 설치', who: 'user' },
    { op: 'itemAdd', ms: 'M2', text: '일주일 두기', who: 'user' },
    { op: 'focus', code: 'M2' },
  ];
}
// 리드 둘이 같은 워크스페이스에 레인 하나씩
async function twoLanes() {
  const t = await board();
  const l1 = t.add('lead1'), l2 = t.add('lead2'), w = t.add('other');
  const P = t.b.branch.plans;
  const a = P.verb(l1, { action: 'new', name: '수집' }).plan;
  const c = P.verb(l2, { action: 'new', name: '결제' }).plan;
  P.verb(l1, { action: 'op', plan: '수집', ops: sampleOps() });
  P.verb(l2, { action: 'op', plan: '결제', ops: sampleOps() });
  await until(() => !t.b.queue.items || [...t.b.queue.items.values()].every((d) => d.status !== 'queued' && d.status !== 'sending'));
  return { ...t, l1, l2, w, a: a.planId, c: c.planId, H: t.b.branch.handlers };
}

test('P306 알림 줄·마일스톤 끝 판정(순수)', () => {
  assert.deepEqual(PLAN_NOTIFY, ['next', 'now', 'off']);
  assert.equal(noteLine({ name: '수집', bits: ['M2.4 체크'], focus: { code: 'M2', done: 4, total: 7 } }), '[목표] 수집 M2.4 체크(사용자) · M2 4/7');
  assert.equal(noteLine({ name: '수집', bits: ['M2.4 체크', 'M2.6 체크', 'M2.4 체크', 'focus M2 → M3'], focus: null }), '[목표] 수집 M2.4 체크, M2.6 체크, focus M2 → M3(사용자)');
  assert.equal(changeBit({ summary: '  M2.1   체크 ' }), 'M2.1 체크');
  const d0 = applyPlanOps(emptyPlan(), sampleOps(), A).doc;
  const d1 = applyPlanOps(d0, [{ op: 'check', ids: ['M2.1', 'M2.2'] }], A).doc;
  assert.deepEqual(newlyAllChecked(d0, d1), []);
  const d2 = applyPlanOps(d1, [{ op: 'check', ids: ['M2.3'] }], A).doc;
  assert.deepEqual(newlyAllChecked(d1, d2), ['M2']);
  assert.deepEqual(newlyAllChecked(d2, d2), [], '이미 모두 체크였으면 다시 알리지 않는다');
});

test('P306 사람이 체크하면 그 레인의 관리자에게만 다음 메시지와 함께 간다', async () => {
  const t = await twoLanes();
  const { b, l1, l2, w, H } = t;
  try {
    const sent0 = b.sent.length;
    const r = await H['plan.op']({ planId: t.a, op: 'check', ids: ['M2.2'], via: 'foryou' }, {});
    assert.equal(r.note.why, 'next');
    await tick(150);
    assert.equal(b.sent.length, sent0, '곧바로 보내지 않는다(턴을 쓰지 않는다)');
    assert.equal(b.planNotes.pendingCount(l1.sessionId), 1);
    assert.equal(b.planNotes.pendingCount(l2.sessionId), 0);
    // 같은 레인을 또 바꾸면 한 덩어리
    await H['plan.op']({ planId: t.a, op: 'metricNow', metric: 'x', now: '1' }, {}).catch(() => null); // 없는 측정값: 실패, 아무것도 더하지 않는다
    await H['plan.op']({ planId: t.a, op: 'focus', code: 'M1' }, {});
    // 다른 세션이 lead1에게 글을 보낸다 → 그 앞에 실린다
    b.queue.enqueue(l1.sessionId, '다음 일', { origin: { kind: 'agent' } });
    await until(() => l1.texts.some((x) => x.includes('다음 일')));
    const got = l1.texts.find((x) => x.includes('다음 일'));
    assert.match(got, /^\[목표\] 수집 M2\.2 체크, focus M2 → M1\(사용자\) · M1 0\/0\n\n다음 일$/);
    assert.equal(b.planNotes.pendingCount(l1.sessionId), 0);
    assert.ok(!l2.texts.some((x) => x.includes('[목표]')), '다른 레인의 관리자는 받지 않는다');
    assert.ok(!w.texts.some((x) => x.includes('[목표]')));
    const ev = b.store.db.prepare("SELECT * FROM events WHERE kind = 'plan_note'").all();
    assert.equal(ev.length, 1);
    assert.equal(JSON.parse(ev[0].data).why, 'ride');
  } finally { await t.stop(); }
});

test('P306 마일스톤이 모두 체크되면 곧바로 한 번', async () => {
  const t = await twoLanes();
  const { b, l1, H } = t;
  try {
    await H['plan.op']({ planId: t.a, op: 'check', ids: ['M2.1', 'M2.2'] }, {});
    await tick(100);
    assert.ok(!l1.texts.some((x) => x.includes('[목표]')));
    const r = await H['plan.op']({ planId: t.a, op: 'check', ids: ['M2.3'] }, {});
    assert.equal(r.note.why, 'all_checked');
    assert.deepEqual(r.note.allChecked, ['M2']);
    await until(() => l1.texts.some((x) => x.startsWith('[목표]')));
    assert.equal(l1.texts.find((x) => x.startsWith('[목표]')), '[목표] 수집 M2.1 체크, M2.2 체크, M2.3 체크(사용자) · M2 3/3');
    // 풀고 다시 체크하면 다시 곧바로(끝 기준 확인 차례가 또 왔다)
    await H['plan.op']({ planId: t.a, op: 'uncheck', ids: ['M2.3'] }, {});
    const r2 = await H['plan.op']({ planId: t.a, op: 'check', ids: ['M2.3'] }, {});
    assert.equal(r2.note.why, 'all_checked');
  } finally { await t.stop(); }
});

test('P306 관리자 없음·닫힘·에이전트가 바꿈·미루기는 알리지 않는다', async () => {
  const t = await twoLanes();
  const { b, l1, l2, H } = t;
  try {
    // 에이전트(다른 세션)가 바꾼 것은 사람 알림이 아니다(atrium plan show의 "남이 바꾼 것"으로 본다)
    b.branch.plans.verb(l2, { action: 'op', plan: '수집', op: { op: 'check', ids: ['M2.1'] } });
    assert.equal(b.planNotes.pendingCount(l1.sessionId), 0);
    // 미루기는 사람 자기 몫이라 조용히
    const r = await H['plan.op']({ planId: t.a, op: 'snooze', id: 'M2.2', until: Date.now() + 3600e3, via: 'foryou' }, {});
    assert.equal(r.note.why, 'quiet');
    // 관리자 없음
    await H['plan.owner']({ planId: t.c, session: null }, {});
    const r2 = await H['plan.op']({ planId: t.c, op: 'check', ids: ['M2.2'] }, {});
    assert.equal(r2.note.why, 'no_owner');
    // 모인 뒤 관리자가 닫히면 버린다
    await H['plan.op']({ planId: t.a, op: 'check', ids: ['M2.2'] }, {});
    assert.equal(b.planNotes.pendingCount(l1.sessionId), 1);
    b.closeSession(l1, 'test');
    assert.equal(b.planNotes.pendingCount(l1.sessionId), 0);
    const r3 = await H['plan.op']({ planId: t.a, op: 'check', ids: ['M2.3'] }, {});
    assert.equal(r3.note.why, 'no_owner');
  } finally { await t.stop(); }
});

test('P306 관리자를 넘기면 새 관리자가 받고 모인 줄도 옮겨 간다', async () => {
  const t = await twoLanes();
  const { b, l1, l2, H } = t;
  try {
    await H['plan.op']({ planId: t.a, op: 'check', ids: ['M2.2'] }, {});
    await H['plan.owner']({ planId: t.a, session: 'lead2' }, {});
    assert.equal(b.planNotes.pendingCount(l1.sessionId), 0);
    assert.equal(b.planNotes.pendingCount(l2.sessionId), 1);
    b.queue.enqueue(l2.sessionId, '하나 더', { origin: { kind: 'agent' } });
    await until(() => l2.texts.some((x) => x.includes('하나 더')));
    assert.match(l2.texts.find((x) => x.includes('하나 더')), /^\[목표\] 수집 M2\.2 체크, 관리자 @lead1 → @lead2\(사용자\) · M2 1\/3/);
  } finally { await t.stop(); }
});

test('P306 설정: off는 알리지 않고 now는 2초 안의 바뀜을 한 글로 곧바로', async () => {
  const t = await twoLanes();
  const { b, l1, H } = t;
  try {
    b.planNotes.modeFn = () => 'off';
    const r = await H['plan.op']({ planId: t.a, op: 'check', ids: ['M2.2'] }, {});
    assert.equal(r.note.why, 'off');
    assert.equal(b.planNotes.pendingCount(l1.sessionId), 0);
    b.planNotes.modeFn = () => 'now';
    b.planNotes.debounceMs = 60;
    await H['plan.op']({ planId: t.a, op: 'uncheck', ids: ['M2.2'] }, {});
    await H['plan.op']({ planId: t.a, op: 'metricNow', metric: 'm1', now: '3' }, {}).catch(() => null);
    await H['plan.op']({ planId: t.a, op: 'focus', code: 'M1' }, {});
    await until(() => l1.texts.some((x) => x.startsWith('[목표]')));
    const notes = l1.texts.filter((x) => x.startsWith('[목표]'));
    assert.equal(notes.length, 1);
    assert.equal(notes[0], '[목표] 수집 M2.2 체크 풂, focus M2 → M1(사용자) · M1 0/0');
  } finally { await t.stop(); }
});

test('P306 결정 답과 함께 실리고, 실린 전달이 취소되면 다시 붙잡는다', async () => {
  const t = await twoLanes();
  const { b, l1, H } = t;
  try {
    await H['plan.op']({ planId: t.a, op: 'check', ids: ['M2.2'] }, {});
    // 전달 대기열이 처음 보낼 때 앞에 붙일 글(decisions.attachFront가 목표 알림도 싣는다)
    const pre = b.decisions.attachFront({ sessionId: l1.sessionId, deliveryId: 'dx1' });
    assert.equal(pre, '[목표] 수집 M2.2 체크(사용자) · M2 1/3');
    assert.equal(b.planNotes.pendingCount(l1.sessionId), 0);
    b.planNotes.onDelivery({ deliveryId: 'dx1', sessionId: l1.sessionId, status: 'cancelled' });
    assert.equal(b.planNotes.pendingCount(l1.sessionId), 1, '취소되면 다시 붙잡는다');
    const pre2 = b.decisions.attachFront({ sessionId: l1.sessionId, deliveryId: 'dx2' });
    assert.equal(pre2, '[목표] 수집 M2.2 체크(사용자) · M2 1/3');
    b.planNotes.onDelivery({ deliveryId: 'dx2', sessionId: l1.sessionId, status: 'confirmed' });
    assert.equal(b.planNotes.pendingCount(l1.sessionId), 0);
    // 레인 둘이 한 관리자면 한 덩어리 두 줄
    b.branch.plans.verb(l1, { action: 'new', name: '정리' });
    b.branch.plans.verb(l1, { action: 'op', plan: '정리', ops: sampleOps() });
    const third = b.store.plansIn(t.ws.key).find((x) => x.name === '정리');
    await H['plan.op']({ planId: t.a, op: 'check', ids: ['M2.3'] }, {});
    await H['plan.op']({ planId: third.planId, op: 'check', ids: ['M2.1'] }, {});
    const pre3 = b.planNotes.attach(l1.sessionId, 'dx3');
    assert.equal(pre3, '[목표] 수집 M2.3 체크(사용자) · M2 2/3\n[목표] 정리 M2.1 체크(사용자) · M2 1/3');
  } finally { await t.stop(); }
});
