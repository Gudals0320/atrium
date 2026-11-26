// P304 단위 시험: 리포별 목표·마일스톤 레인(atrium plan, 설계 v2). 연산 전부, 검증·상한, 레인과 관리자·느슨한 권한(관리자 아님 표시, 오케스트레이션 하위만 막힘), 가져오기·내보내기 왕복,
// 바뀜 기록(최근 500줄), 방송(plan.changed), 판 API(사람은 HUMAN_OPS만), CLI 출력(설계 3.2 꼴)과 me 한 줄, 계약 9 그대로.
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p304-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p304test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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



// ---------- P304 ----------
const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const A = { now: 1000, actor: { by: 'lead', via: 'agent' } };
const run = (doc, ops, ctx = A) => applyPlanOps(doc, ops, ctx).doc;
// 설계 3.2의 예(물주기 기록)
function sample() {
  return run(emptyPlan(), [
    { op: 'goal', text: '작은 온실의 물주기 기록을 손으로 적지 않게 한다' },
    { op: 'metric', name: '손으로 적는 칸', target: '0', now: '4', unit: '칸' },
    { op: 'metric', name: '하루 기록 시간', target: '2분', now: '12분' },
    { op: 'ms', code: 'M1', title: '센서 값 받기' },
    { op: 'ms', code: 'M2', title: '물주기 기록 자동 채우기', doneWhen: '일주일 기록이 손대지 않고 표에 다 남는다' },
    { op: 'itemAdd', ms: 'M1', text: '센서 연결' },
    { op: 'itemAdd', ms: 'M2', text: '센서 값 → 기록 표 매핑' },
    { op: 'itemAdd', ms: 'M2', text: '온실 PC에 수집기 설치', who: 'user' },
    { op: 'itemAdd', ms: 'M2', text: '일주일 동안 기록을 손대지 않고 둔다', who: 'user', note: '주말부터' },
  ]);
}

test('P304 연산: 목표·측정값·마일스톤·focus·항목·체크·미루기, 받은 문서는 그대로', () => {
  const d0 = emptyPlan();
  const d = sample();
  assert.deepEqual(d0, emptyPlan(), '받은 문서를 바꾸지 않는다');
  assert.equal(d.goal, '작은 온실의 물주기 기록을 손으로 적지 않게 한다');
  assert.deepEqual(d.metrics.map((m) => m.id), ['m1', 'm2']);
  assert.equal(d.focus, 'M1', '첫 마일스톤이 focus');
  assert.deepEqual(d.milestones.find((m) => m.code === 'M2').items.map((i) => [i.id, i.who]), [['M2.1', 'head'], ['M2.2', 'user'], ['M2.3', 'user']]);
  let e = run(d, [{ op: 'metric', name: '손으로 적는 칸', now: '3' }, { op: 'metricNow', metric: 'm2', now: '10분' }]);
  assert.equal(e.metrics[0].now, '3'); assert.equal(e.metrics[0].target, '0'); assert.equal(e.metrics[1].now, '10분');
  e = run(e, [{ op: 'metricRm', metric: '하루 기록 시간' }]); assert.equal(e.metrics.length, 1);
  let r = applyPlanOps(d, [{ op: 'focus', code: 'm2' }, { op: 'check', ids: ['M2.1', 'm2.2'] }], { now: 5, actor: { by: 'lead', via: 'agent' } });
  assert.equal(r.doc.focus, 'M2', '코드는 대소문자를 가리지 않고 찾는다');
  const m2 = r.doc.milestones[1];
  assert.deepEqual(m2.items[0].done, { at: 5, by: 'lead', via: 'agent' });
  assert.deepEqual(r.results[1].milestones[0], { code: 'M2', total: 3, done: 2, userLeft: 1, userTotal: 2, headLeft: 0, allChecked: false, snoozed: 0 });
  assert.deepEqual(r.log.map((l) => l.summary), ['focus M1 → M2', 'M2.1 체크', 'M2.2 체크']);
  r = applyPlanOps(r.doc, [{ op: 'check', ids: ['M2.1', 'M2.3'] }], A);
  assert.deepEqual(r.results[0].items.map((i) => i.changed), [false, true]);
  assert.equal(r.results[0].milestones[0].allChecked, true);
  assert.equal(r.doc.milestones[1].state, 'open', '다 체크돼도 저절로 닫지 않는다');
  r = applyPlanOps(r.doc, [{ op: 'uncheck', ids: ['M2.3'] }], A); assert.equal(r.doc.milestones[1].items[2].done, null);
  let f = run(r.doc, [{ op: 'msDone', code: 'M1' }]); assert.equal(f.milestones[0].state, 'done'); assert.equal(f.milestones[0].doneAt, 1000);
  f = run(f, [{ op: 'msReopen', code: 'M1' }]); assert.equal(f.milestones[0].state, 'open'); assert.equal(f.milestones[0].doneAt, null);
  let g = run(d, [{ op: 'itemEdit', id: 'M2.3', text: '일주일 그대로 둔다', note: '', who: 'head' }]);
  assert.deepEqual([g.milestones[1].items[2].text, g.milestones[1].items[2].note, g.milestones[1].items[2].who], ['일주일 그대로 둔다', null, 'head']);
  r = applyPlanOps(g, [{ op: 'itemEdit', id: 'M2.1', move: 'M1:1' }], A);
  assert.equal(r.results[0].id, 'M1.2'); assert.equal(r.results[0].from, 'M2.1');
  assert.deepEqual(r.doc.milestones[0].items.map((i) => i.id), ['M1.2', 'M1.1'], '자리 1 = 맨 앞');
  g = run(r.doc, [{ op: 'itemRm', id: 'M2.3' }, { op: 'itemAdd', ms: 'M2', text: '새 항목' }]);
  assert.equal(g.milestones[1].items.at(-1).id, 'M2.4', '지운 번호(M2.3)는 다시 쓰지 않는다');
  r = applyPlanOps(d, [{ op: 'ms', code: 'M3', title: '알림', before: 'M2' }, { op: 'ms', code: 'M2', newCode: 'R2', purpose: '목적 글' }, { op: 'focus', code: 'R2' }], A);
  assert.deepEqual(r.doc.milestones.map((m) => m.code), ['M1', 'M3', 'R2']);
  assert.deepEqual(r.results[1].renamed, { 'M2.1': 'R2.1', 'M2.2': 'R2.2', 'M2.3': 'R2.3' });
  assert.equal(r.doc.nextItem.R2, 4); assert.equal(r.doc.nextItem.M2, undefined);
  let h = run(r.doc, [{ op: 'ms', code: 'R2', after: 'M1' }]); assert.deepEqual(h.milestones.map((m) => m.code), ['M1', 'R2', 'M3']);
  h = run(h, [{ op: 'msRm', code: 'R2' }]); assert.equal(h.focus, 'M1', 'focus를 지우면 첫 열린 마일스톤');
  h = run(d, [{ op: 'snooze', id: 'M2.2', until: 9999 }]); assert.equal(h.milestones[1].items[1].snoozeUntil, 9999);
  assert.equal(focusUserItems({ ...h, focus: 'M2' }, 100).find((i) => i.id === 'M2.2').snoozed, true);
  h = run(h, [{ op: 'check', ids: ['M2.2'] }]); assert.equal(h.milestones[1].items[1].snoozeUntil, null, '체크하면 미루기가 풀린다');
  assert.equal(err(() => applyPlanOp(d, { op: 'check', ids: ['M9.1'] })).code, 'not_found');
  assert.equal(err(() => applyPlanOp(d, { op: 'focus', code: 'M9' })).code, 'not_found');
  assert.equal(err(() => applyPlanOp(d, { op: 'nope' })).code, 'bad_request');
  assert.equal(err(() => applyPlanOp(d, { op: 'ms', code: 'M5' })).code, 'bad_request', '새 마일스톤은 이름');
  assert.equal(err(() => applyPlanOp(d, { op: 'ms', code: 'M1', newCode: 'M2' })).code, 'exists');
  assert.equal(err(() => applyPlanOp(d, { op: 'itemEdit', id: 'M2.1' })).code, 'bad_request', '고칠 것이 없다');
  assert.equal(err(() => applyPlanOps(d, [{ op: 'check', ids: ['M2.1'] }, { op: 'check', ids: ['X.1'] }], A)).code, 'not_found');
  assert.equal(d.milestones[1].items[0].done, null, '여러 연산 가운데 하나가 실패하면 아무것도 바꾸지 않는다');
  assert.deepEqual(HUMAN_OPS.slice().sort(), ['check', 'focus', 'itemAdd', 'itemEdit', 'itemRm', 'metricNow', 'msDone', 'msReopen', 'snooze', 'uncheck']);
});

test('P304 상한과 검증: 글 길이, 수, 코드 꼴, 문서 200KB', () => {
  const d = sample();
  assert.equal(err(() => applyPlanOp(d, { op: 'goal', text: 'x'.repeat(PLAN.goalMax + 1) })).code, 'too_long');
  let m = emptyPlan();
  for (let i = 0; i < PLAN.metricsMax; i++) m = run(m, [{ op: 'metric', name: 'n' + i }]);
  assert.equal(err(() => applyPlanOp(m, { op: 'metric', name: 'more' })).code, 'too_many');
  assert.equal(err(() => applyPlanOp(m, { op: 'metric', name: 'x'.repeat(61) })).code, 'too_long');
  assert.equal(err(() => applyPlanOp(m, { op: 'metric', name: 'n1', target: 'x'.repeat(41) })).code, 'too_long');
  for (const bad of ['', '-M', 'M 2', 'M2/3', 'x'.repeat(13), '한글']) assert.equal(err(() => applyPlanOp(d, { op: 'ms', code: bad, title: 't' })).code, 'bad_request', bad);
  assert.equal(err(() => applyPlanOp(d, { op: 'ms', code: 'M9', title: 'x'.repeat(121) })).code, 'too_long');
  assert.equal(err(() => applyPlanOp(d, { op: 'ms', code: 'M9', title: 't', doneWhen: 'x'.repeat(601) })).code, 'too_long');
  let ms = run(emptyPlan(), Array.from({ length: PLAN.milestonesMax }, (_, i) => ({ op: 'ms', code: 'M' + i, title: 't' })));
  assert.equal(err(() => applyPlanOp(ms, { op: 'ms', code: 'Z', title: 't' })).code, 'too_many');
  let it = run(emptyPlan(), [{ op: 'ms', code: 'M1', title: 't' }, ...Array.from({ length: PLAN.itemsMax }, () => ({ op: 'itemAdd', ms: 'M1', text: 'a' }))]);
  assert.equal(err(() => applyPlanOp(it, { op: 'itemAdd', ms: 'M1', text: 'b' })).code, 'too_many');
  assert.equal(err(() => applyPlanOp(d, { op: 'itemAdd', ms: 'M1', text: 'x'.repeat(301) })).code, 'too_long');
  assert.equal(err(() => applyPlanOp(d, { op: 'itemAdd', ms: 'M1', text: 'a', note: 'x'.repeat(601) })).code, 'too_long');
  assert.equal(err(() => applyPlanOp(d, { op: 'itemAdd', ms: 'M1', text: 'a', who: 'worker' })).code, 'bad_request');
  const ops = [];
  for (let i = 0; i < 6; i++) { ops.push({ op: 'ms', code: 'B' + i, title: 't' }); for (let j = 0; j < 60; j++) ops.push({ op: 'itemAdd', ms: 'B' + i, text: 'x'.repeat(300), note: 'y'.repeat(600) }); }
  const e = err(() => applyPlanOps(emptyPlan(), ops, A));
  assert.equal(e.code, 'too_long'); assert.match(e.message, /KB/);
  assert.ok(docBytes(sample()) < PLAN.docBytesMax);
});

test('P304 가져오기 검사와 내보내기 왕복(JSON·Markdown)', () => {
  const d = run(sample(), [{ op: 'check', ids: ['M2.1'] }, { op: 'focus', code: 'M2' }]);
  const back = validatePlanDoc(JSON.stringify(d));
  assert.deepEqual(back, d, 'export --json → import는 같은 문서');
  assert.deepEqual(importCounts(back), { goal: 1, metrics: 2, milestones: 2, items: 4, user: 2, checked: 1, focus: 'M2' });
  const hand = validatePlanDoc({ goal: ' 목표 ', milestones: [{ code: 'A', title: '하나', items: [{ text: 'a' }, { id: 'A.5', text: 'b', who: 'USER', done: true }, { id: 'A.5', text: 'c' }] }, { code: 'B', title: '둘', state: 'done' }] });
  assert.deepEqual(hand.milestones[0].items.map((i) => i.id), ['A.6', 'A.5', 'A.7']);
  assert.equal(hand.milestones[0].items[1].who, 'user'); assert.deepEqual(hand.milestones[0].items[1].done, { at: null, by: 'import', via: 'import' });
  assert.equal(hand.nextItem.A, 8); assert.equal(hand.focus, 'A'); assert.equal(hand.goal, '목표');
  const e = err(() => validatePlanDoc({ version: 2, focus: 'Z', metrics: 'x', milestones: [{ code: 'bad code', items: [{ who: 'bot' }] }, { code: 'bad code', title: 't' }] }));
  assert.equal(e.code, 'bad_plan');
  assert.ok(e.problems.length >= 5, e.problems.join('\n'));
  assert.ok(e.problems.some((p) => /version/.test(p)) && e.problems.some((p) => /focus/.test(p)) && e.problems.some((p) => /두 번/.test(p)) && e.problems.some((p) => /who/.test(p)));
  assert.equal(err(() => validatePlanDoc('{not json')).code, 'bad_plan');
  assert.equal(err(() => validatePlanDoc([1])).code, 'bad_plan');
  assert.equal(err(() => validatePlanDoc({ format: 'json', doc: {} })).code, 'bad_plan', '꼴이 아닌 객체');
  const md = planMarkdown(d, { name: 'shop' });
  assert.match(md, /^# shop 목표/); assert.match(md, /## M2 물주기 기록 자동 채우기 · 지금 · 1\/3/); assert.match(md, /- \[x\] M2\.1 \(head\)/); assert.match(md, /- \[ \] M2\.3 \(사용자\) 일주일 동안 기록을 손대지 않고 둔다 — 주말부터/);
  const s = planSummary(d);
  assert.equal(s.focus.code, 'M2'); assert.equal(s.focus.userLeft, 2);
  assert.deepEqual(focusUserItems(d).map((i) => i.id), ['M2.2', 'M2.3']);
});

test('P304 저장소: 레인 번호, rev, 바뀜 기록 최근 500줄, 지움 표시·되살림·30일 뒤 지움, 키 옮기기', () => {
  const dir = tmp();
  const st = new Store(path.join(dir, 'board.db'));
  try {
    const doc = sample();
    const a = st.createPlan({ wsKey: 'w1', name: '수집', doc, owner: 's1', createdBy: 's1', at: 10, by: 'lead', log: [{ op: 'new', summary: '레인 만듦', by: 'lead', via: 'agent', manager: true }] });
    const b2 = st.createPlan({ wsKey: 'w1', name: '결제', doc: emptyPlan(), owner: 's2', at: 10, by: 'p' });
    const c = st.createPlan({ wsKey: 'w2', name: '수집', doc: emptyPlan(), at: 10, by: 'x' });
    assert.deepEqual([a.no, b2.no, c.no], [1, 2, 1], '번호는 워크스페이스마다');
    assert.equal(a.status, 'active'); assert.equal(a.rev, 1); assert.deepEqual(a.doc, doc);
    let r = st.savePlan({ planId: a.planId, rev: 2, at: 11, by: 'user', log: [{ op: 'check', ref: 'M2.1', summary: 'M2.1 체크', by: 'user', via: 'pc' }] });
    assert.equal(r.owner, 's1', '사람이 쓰면 관리자는 그대로'); assert.equal(r.rev, 2);
    r = st.savePlan({ planId: a.planId, rev: 3, at: 12, by: 'w', owner: null, status: 'paused', log: [{ op: 'owner', summary: 'x', by: 'w', via: 'agent', manager: false }] });
    assert.equal(r.owner, null); assert.equal(r.status, 'paused');
    const log = st.planLog(a.planId);
    assert.deepEqual(log.map((l) => [l.by, l.via, l.op, l.rev, l.manager]), [['w', 'agent', 'owner', 3, false], ['user', 'pc', 'check', 2, null], ['lead', 'agent', 'new', 1, true]]);
    assert.equal(st.planLog(a.planId, { afterId: log[1].id }).length, 1);
    st.savePlan({ planId: a.planId, rev: 4, at: 13, by: 'lead', keep: PLAN.logKeep, log: Array.from({ length: 520 }, (_, i) => ({ op: 'check', summary: 's' + i, by: 'lead' })) });
    assert.equal(st.db.prepare('SELECT COUNT(*) AS n FROM plan_log WHERE plan_id = ?').get(a.planId).n, 500);
    assert.equal(st.planLog(b2.planId).length, 0, '레인마다 따로');
    st.markPlansDeleted('w1', 100);
    assert.equal(st.plansIn('w1').length, 0); assert.equal(st.plansIn('w1', { deleted: true }).length, 2);
    assert.equal(st.restorePlans('w1'), 2);
    st.markPlansDeleted('w1', 100);
    assert.deepEqual(st.prunePlans(100 + 29 * 86400e3), []);
    assert.deepEqual(st.prunePlans(100 + 31 * 86400e3).sort(), [a.planId, b2.planId].sort());
    assert.equal(st.getPlan(a.planId), null); assert.equal(st.planLog(a.planId).length, 0);
    st.createPlan({ wsKey: 'w3', name: '수집', doc, at: 1, by: 'x' });
    assert.equal(st.movePlans('w3', 'w2'), 1);
    assert.deepEqual(st.plansIn('w2').map((x) => [x.no, x.name]), [[1, '수집'], [2, '수집 (2)']], '번호는 뒤로, 같은 이름은 (2)');
  } finally { st.close(); }
});

test('P304 레인과 관리자: 만들기·고르기·넘기기·상태, 관리자 아닌 쓰기는 막지 않고 표시, 오케스트레이션 하위만 막힘', async () => {
  const { b, add, stop } = await board();
  try {
    const plan = (s, body) => Promise.resolve().then(() => b.branch.dispatch('plan', s, body));
    const lead = add('lead');
    const n1 = await plan(lead, { action: 'new', name: '수집' });
    assert.equal(n1.plan.no, 1); assert.equal(n1.plan.owner.name, 'lead');
    // 관리하는 레인이 하나면 --plan 없이
    let w = await plan(lead, { action: 'op', ops: [{ op: 'goal', text: '목표' }, { op: 'ms', code: 'M1', title: '하나' }] });
    assert.equal(w.rev, 2, '연산 여럿은 한 rev'); assert.equal(w.manager, true);
    await plan(lead, { action: 'new', name: '결제' });
    let e = await plan(lead, { action: 'op', ops: [{ op: 'goal', text: 'x' }] }).catch((x) => x);
    assert.equal(e.code, 'pick_plan'); assert.match(e.message, /#1 수집\(@lead\), #2 결제\(@lead\)/);
    const shown = await plan(lead, { action: 'show' });
    assert.equal(shown.pick, true); assert.equal(shown.lanes.length, 2, '보기는 고를 수 없으면 목록');
    assert.equal((await plan(lead, { action: 'show', plan: '2' })).name, '결제');
    assert.equal((await plan(lead, { action: 'show', plan: '#1' })).name, '수집');
    assert.equal((await plan(lead, { action: 'show', plan: '결제' })).manager, true);
    assert.equal((await plan(lead, { action: 'new', name: '수집' }).catch((x) => x)).code, 'exists');
    assert.equal((await plan(lead, { action: 'new', name: '12' }).catch((x) => x)).code, 'bad_request');
    assert.equal((await plan(lead, { action: 'show', plan: '없음' }).catch((x) => x)).code, 'not_found');
    // 다른 세션(동료)이 남의 레인을 고친다: 막지 않고 관리자 아님
    const peer = add('peer');
    assert.equal((await plan(peer, { action: 'op', ops: [{ op: 'check', ids: ['M1.1'] }] }).catch((x) => x)).code, 'pick_plan', '관리하는 레인이 없으면 고른다');
    w = await plan(peer, { action: 'op', plan: '수집', ops: [{ op: 'itemAdd', ms: 'M1', text: '동료가 더함' }] });
    assert.equal(w.manager, false); assert.equal(w.lane.owner, 'lead');
    assert.ok(writeLines(w, { action: 'op', ops: [{ op: 'itemAdd' }] }).some((l) => /관리자 아님: 이 레인의 관리자는 @lead/.test(l)));
    const lg = b.store.planLog(n1.plan.planId, { limit: 1 })[0];
    assert.equal(lg.by, 'peer'); assert.equal(lg.manager, false);
    // 하위 워커도 막지 않는다(스킬 문장이 읽기만 하라고 한다)
    const r2 = await b.branch.spawnChild(lead, { name: 'w1', prompt: '일', wait: false });
    const w1 = b.sessions.get(r2.sessionId);
    assert.equal((await plan(w1, { action: 'op', plan: '수집', ops: [{ op: 'check', ids: ['M1.1'] }] })).manager, false);
    const sh = await plan(w1, { action: 'show', plan: '수집' });
    assert.ok(showLines(sh).some((l) => /관리자가 아니다/.test(l)));
    // 관리자 넘기기·상태
    let o = await plan(lead, { action: 'owner', plan: '결제', owner: 'peer' });
    assert.equal(o.owner.name, 'peer'); assert.equal(o.manager, true); assert.match(o.log[0], /관리자 @lead → @peer/);
    assert.equal((await plan(peer, { action: 'op', ops: [{ op: 'goal', text: '결제 목표' }] })).manager, true, 'peer는 이제 결제 하나를 관리');
    o = await plan(peer, { action: 'owner', plan: '결제', owner: 'none' }); assert.equal(o.owner, null);
    assert.match(showLines(await plan(lead, { action: 'show', plan: '결제' }))[0], /관리자 없음/);
    const s1 = await plan(lead, { action: 'status', plan: '수집', status: 'paused' }); assert.equal(s1.status, 'paused');
    assert.equal((await plan(lead, { action: 'status', plan: '수집', status: 'bogus' }).catch((x) => x)).code, 'bad_request');
    await plan(lead, { action: 'status', plan: '수집', status: 'archived' });
    assert.equal((await plan(lead, { action: 'list' })).lanes.length, 1, '보관한 레인은 목록에서 빠진다');
    assert.equal((await plan(lead, { action: 'list', all: true })).lanes.length, 2);
    // 관리자가 닫혀도 레인은 남는다
    const n3 = await plan(peer, { action: 'new', name: '알림' });
    b.closeSession(peer, 'test');
    const after = await plan(lead, { action: 'show', plan: '알림' });
    assert.equal(after.owner.open, false); assert.match(showLines(after)[0], /@peer\(닫힘\)/);
    assert.equal(n3.plan.no, 3);
    // 오케스트레이션: 독립(free)은 쓰고, 하위(sub)는 plan 동사가 없다
    assert.equal(VERB_OP.plan, 'plan'); assert.ok(!ORCH_SUB_VERBS.includes('plan'));
    assert.equal(opRefusal(permOf({ orch: { on: true }, relation: 'none' }), 'plan'), null);
    assert.deepEqual(opRefusal(permOf({ orch: { on: true }, relation: 'sub', parentId: lead.sessionId }), 'plan'), { verb: 'plan', why: 'scope' });
    const orchLead = add('olead', { orch: { on: true, via: 'kind' } });
    assert.equal(b.branch.refusalOf(orchLead, 'plan', {}), null);
    const r3 = await b.branch.spawnChild(lead, { name: 'osub', prompt: '일', wait: false });
    const osub = b.sessions.get(r3.sessionId); osub.orch = { on: true, via: 'kind' };
    assert.equal(b.branch.refusalOf(osub, 'plan', {}).code, 'not_permitted');
    const lone = add('lone', { workspaceKey: null });
    assert.equal((await plan(lone, { action: 'show' }).catch((x) => x)).code, 'no_workspace');
    assert.equal(laneName(' #수집 '), '수집');
  } finally { await stop(); }
});

test('P304 판 API와 방송: 사람은 체크·focus·항목·측정값 지금·관리자·상태, plan.changed에 창이 쓸 값', async () => {
  const { b, ws, add, stop } = await board();
  const changed = [];
  b.api.broadcast = (ev, d) => { if (ev === 'plan.changed') changed.push(d); };
  try {
    const H = b.branch.handlers;
    const lead = add('lead');
    const n = await b.branch.dispatch('plan', lead, { action: 'import', new: '수집', doc: JSON.stringify(run(sample(), [{ op: 'focus', code: 'M2' }])) });
    assert.equal(n.created, true);
    const id = n.plan.planId;
    const c0 = changed.at(-1);
    for (const k of ['planId', 'wsKey', 'workspace', 'no', 'name', 'status', 'rev', 'doc', 'summary', 'owner', 'updatedAt', 'updatedBy', 'by', 'via', 'at', 'manager', 'changes']) assert.ok(k in c0, k);
    assert.equal(c0.wsKey, ws.key); assert.equal(c0.by, 'lead'); assert.equal(c0.via, 'agent'); assert.equal(c0.changes[0].op, 'new');
    let r = await H['plan.op']({ planId: id, op: 'check', ids: ['M2.2'] }, { clientId: 'c1' });
    assert.equal(r.plan.doc.milestones[1].items[1].done.by, 'user'); assert.equal(r.manager, null);
    assert.equal(changed.at(-1).via, 'pc'); assert.equal(changed.at(-1).changes[0].summary, 'M2.2 체크');
    r = await H['plan.op']({ workspace: ws.key, plan: '수집', ops: [{ op: 'metricNow', metric: 'm1', now: '2' }, { op: 'itemAdd', ms: 'M2', text: '사람이 더함', who: 'user' }] }, { remote: true });
    assert.equal(changed.at(-1).via, 'remote'); assert.equal(r.plan.doc.metrics[0].now, '2');
    await H['plan.op']({ planId: id, op: { op: 'uncheck', ids: ['M2.2'] }, via: 'foryou' }, {});
    assert.equal(changed.at(-1).via, 'foryou');
    assert.equal(r.plan.owner.name, 'lead');
    for (const op of [{ op: 'goal', text: 'x' }, { op: 'ms', code: 'M9', title: 't' }, { op: 'msRm', code: 'M1' }]) assert.equal((await H['plan.op']({ planId: id, op }, {}).catch((x) => x)).code, 'not_permitted', op.op);
    const g = await H['plan.get']({ planId: id });
    assert.equal(g.name, '수집'); assert.ok(g.log.length >= 3); assert.equal(g.summary.focus.code, 'M2');
    await b.branch.dispatch('plan', lead, { action: 'new', name: '결제' });
    const l = await H['plan.list']({});
    assert.equal(l.plans.length, 2); assert.deepEqual(l.plans[0].userItems.map((i) => i.id), ['M2.2', 'M2.3', 'M2.4']); assert.equal(l.plans[0].doc, undefined, '목록에는 문서를 싣지 않는다');
    const peer = add('peer');
    assert.equal((await H['plan.owner']({ planId: id, session: 'peer' }, {})).owner.name, 'peer');
    assert.equal((await H['plan.status']({ planId: id, status: 'paused' }, {})).status, 'paused');
    assert.deepEqual((await H['plan.list']({})).plans.find((x) => x.planId === id).userItems, [], '멈춘 레인의 사람 몫은 할 일 목록에 싣지 않는다');
    assert.match((await H['plan.export']({ planId: id, format: 'md' })).text, /M2\.4 \(사용자\) 사람이 더함/);
    assert.equal((await H['plan.export']({ planId: id })).doc.name, '수집', 'JSON 내보내기에 레인 이름');
    assert.equal((await H['plan.log']({ planId: id, limit: 2 })).rows.length, 2);
    const doc = JSON.stringify(sample());
    assert.equal((await H['plan.import']({ planId: id, doc }, {}).catch((x) => x)).code, 'plan_exists');
    assert.equal((await H['plan.import']({ planId: id, doc, replace: true, ifRev: 1 }, {}).catch((x) => x)).code, 'stale_rev');
    const dry = await H['plan.import']({ planId: id, doc, dry: true }, {});
    assert.equal(dry.dry, true); assert.equal(dry.wouldReplace, true);
    const rp = await H['plan.import']({ planId: id, doc, replace: true, ifRev: (await H['plan.get']({ planId: id })).rev }, {});
    assert.equal(rp.replaced, true);
    assert.equal((await H['plan.get']({ planId: 999 }).catch((x) => x)).code, 'not_found');
    void peer;
  } finally { await stop(); }
});

test('P304 CLI: 설계 3.2 꼴의 출력, 레인 목록, 남이 바꾼 것, me 줄, 내보내기 → 다른 워크스페이스에 새 레인으로', async () => {
  const { b, ws, add, stop } = await board();
  const srv = await serve(b);
  try {
    const lead = add('lead');
    const env = envOf(b, lead);
    const cli = (...a) => runCli(['plan', ...a], env);
    assert.match((await cli()).stdout, /아직 레인이 없다/);
    assert.match((await cli('list')).stdout, /아직 레인이 없다/);
    let r = await cli('new', '수집');
    assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /^레인 #1 수집 만듦 · 관리자 @lead/);
    for (const a of [
      ['goal', '작은 온실의 물주기 기록을 손으로 적지 않게 한다'],
      ['metric', '손으로 적는 칸', '--target', '0', '--now', '4', '--unit', '칸'],
      ['metric', '하루 기록 시간', '--target', '2분', '--now', '12분'],
      ['ms', 'M1', '센서 값 받기'],
      ['ms', 'M2', '물주기 기록 자동 채우기', '--done-when', '일주일 기록이 손대지 않고 표에 다 남는다'],
      ['item', 'M2', '센서 값 → 기록 표 매핑'],
      ['item', 'M2', '온실 PC에 수집기 설치', '--who', 'user'],
      ['item', 'M2', '일주일 동안 기록을 손대지 않고 둔다', '--who', 'user', '--note', '주말부터'],
      ['focus', 'M2'],
    ]) { const x = await cli(...a); assert.equal(x.code, 0, a.join(' ') + '\n' + x.stderr); }
    r = await cli('check', 'M2.1');
    assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /^M2\.1 체크함 · M2 1\/3 · rev 11/);
    r = await cli('item', 'M2', '빠진 값 알림');
    assert.match(r.stdout, /^M2\.4 더함\(head\) · M2 1\/4 · rev 12/);
    await cli();
    // 사람(PC)과 다른 세션이 바꾼다 → 관리자의 show에 한 줄
    await b.branch.handlers['plan.op']({ workspace: ws.key, plan: '수집', op: 'check', ids: ['M2.2'] }, {});
    const other = add('other');
    const oenv = envOf(b, other);
    r = await runCli(['plan', 'item', 'M1', '다른 세션이 더함', '--plan', '1'], oenv);
    assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /관리자 아님: 이 레인의 관리자는 @lead/);
    r = await cli();
    const out = r.stdout.split('\n');
    assert.equal(out[0], '레인  #1 수집 · @lead · 진행 (너)');
    assert.equal(out[1], '목표  작은 온실의 물주기 기록을 손으로 적지 않게 한다');
    assert.equal(out[2], '측정  손으로 적는 칸 4 → 0칸 · 하루 기록 시간 12분 → 2분');
    assert.match(out[3], /^지금  M2 물주기 기록 자동 채우기  2\/4 \(사용자 1 남음\)  rev 14$/);
    assert.equal(out[4], '  끝 기준: 일주일 기록이 손대지 않고 표에 다 남는다');
    assert.equal(out[5], '  [x] M2.1   head  센서 값 → 기록 표 매핑');
    assert.equal(out[7], '  [ ] M2.3   user  일주일 동안 기록을 손대지 않고 둔다   메모: 주말부터');
    assert.match(r.stdout, /다른 마일스톤  M1 0\/1   \(atrium plan --all\)/);
    assert.match(r.stdout, /남이 바꾼 것\(지난 확인 뒤\): M2\.2 체크\(PC, \d+초 전\), M1\.1 더함\(head\)\(@other, 관리자 아님, \d+초 전\)/);
    assert.doesNotMatch((await cli()).stdout, /남이 바꾼 것/, '본 뒤에는 다시 보이지 않는다');
    assert.match((await cli('--all')).stdout, /M1 센서 값 받기  0\/1/);
    assert.match((await runCli(['plan', '--plan', '수집'], oenv)).stdout, /관리자가 아니다/);
    // 레인 둘: --plan 없이 쓰면 고르라는 오류(종료 1), 목록
    await cli('new', '결제');
    r = await cli('check', 'M2.3'); assert.equal(r.code, 1); assert.match(r.stderr, /--plan <이름\|번호>로 고른다/);
    r = await cli('list');
    assert.match(r.stdout, /레인 2개/); assert.match(r.stdout, /#1 수집 · @lead · 진행 \(너\) · 지금 M2 물주기 기록 자동 채우기 2\/4 \(사용자 1\)/); assert.match(r.stdout, /#2 결제 · @lead · 진행 \(너\) · 마일스톤 없음/);
    const me = await runCli(['me'], env);
    assert.match(me.stdout, /plan: #1 수집 · M2 물주기 기록 자동 채우기 2\/4 \(사용자 1\) · 너는 관리자 → atrium plan --plan 수집/);
    assert.match(me.stdout, /plan: #2 결제 · focus 없음/);
    const mj = JSON.parse((await runCli(['me', '--json'], env)).stdout);
    assert.equal(mj.plans.length, 2); assert.equal(mj.plans[0].userLeft, 1);
    assert.equal((await runCli(['me', '--json'], oenv)).stdout.includes('"plans"'), false, '관리하는 레인이 없으면 칸이 없다');
    r = await cli('check', 'M2.3', 'M2.4', '--plan', '수집'); assert.match(r.stdout, /M2 항목이 모두 체크됐다/);
    r = await cli('ms', 'M2', '--done', '--plan', '#1'); assert.match(r.stdout, /^M2 끝냄 · 4\/4 · rev 16/);
    r = await cli('owner', '결제', 'other'); assert.match(r.stdout, /^#2 결제 관리자 @lead → @other/);
    r = await cli('status', '결제', 'paused'); assert.match(r.stdout, /상태 active → paused/); assert.match(r.stdout, /관리자 아님/);
    assert.equal((await cli('status', '결제', 'nope')).code, 2);
    assert.equal((await cli('check', '--plan', '수집')).code, 2);
    assert.equal((await cli('ms', 'M2', '--done', '--rm')).code, 2);
    r = await cli('focus', 'M9', '--plan', '수집'); assert.equal(r.code, 1); assert.match(r.stderr, /atrium plan: 마일스톤이 없다: M9/);
    const j = JSON.parse((await cli('check', 'M1.9', '--plan', '수집', '--json')).stdout);
    assert.equal(j.error.code, 'not_found');
    // 내보내기 → 다른 워크스페이스에 새 레인으로(이름은 JSON의 name)
    const ex = await cli('export', '--json', '--plan', '수집');
    assert.equal(JSON.parse(ex.stdout).name, '수집');
    const file = path.join(os.tmpdir(), 'p304-export-' + crypto.randomBytes(3).toString('hex') + '.json');
    fs.writeFileSync(file, ex.stdout);
    const far = add('far', { workspaceKey: 'other-ws' });
    const fenv = envOf(b, far);
    r = await runCli(['plan', 'import', file, '--new', '수집', '--dry'], fenv);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /가져오기 미리보기\(바꾸지 않음\): 목표 1 · 측정값 2 · 마일스톤 2\(항목 5, 사용자 2, 체크됨 4\) · focus M2/);
    assert.match(r.stdout, /새 레인 "수집"으로 만든다/);
    assert.equal(b.store.plansIn('other-ws').length, 0, '미리보기는 만들지 않는다');
    r = await runCli(['plan', 'import', file, '--new', ''], fenv);
    r = await runCli(['plan', 'import', file], fenv); assert.equal(r.code, 1, '레인이 없으면 고르라는 오류');
    r = await runCli(['plan', 'import', file, '--new', '수집'], fenv); assert.match(r.stdout, /^가져왔다\(새 레인 #1 수집\): /);
    const [src] = b.store.plansIn(ws.key); const [dst] = b.store.plansIn('other-ws');
    assert.deepEqual(dst.doc, src.doc, '왕복한 문서가 같다'); assert.equal(dst.owner, far.sessionId);
    assert.equal((await runCli(['plan', 'import', file], fenv)).code, 1, '이미 있으면 --replace');
    fs.writeFileSync(file, '{"milestones":[{"code":"bad code"}]}');
    r = await runCli(['plan', 'import', file, '--replace'], fenv);
    assert.equal(r.code, 1); assert.match(r.stderr, /- milestones\[0\]\.code/);
    fs.rmSync(file, { force: true });
    assert.match((await cli('export', '--md', '--plan', '수집')).stdout, /^# .* · 수집 목표/);
    r = await cli('log', '--lines', '3', '--plan', '수집'); assert.equal(r.stdout.trim().split('\n').length, 3);
  } finally { srv.close(); await stop(); }
});

test('P304 계약과 안내: plan 동사, 계약 9 그대로, 허용 규칙, 판 안내문은 그대로, 스킬 단락, help plan', async () => {
  assert.equal(CONTRACT_VERSION, 13); // P364: know로 12. // P360: revive·fork로 11. // P346: docs init·on·off로 10.
  assert.ok(VERB_NAMES.includes('plan'));
  const v = VERBS.find((x) => x.name === 'plan');
  assert.match(v.does, /관리자/); assert.match(v.does, /--who user/); assert.ok(v.args.some((a) => a.includes('--plan')));
  assert.ok(VERBS.find((x) => x.name === 'me').out.includes('plans'));
  assert.match(shortHelp(), /atrium plan/);
  for (const c of ['atrium', 'mtask']) for (const a of ['Bash(' + c + ' plan)', 'Bash(' + c + ' plan *)', 'PowerShell(' + c + ' plan *)']) assert.ok(ATRIUM_ALLOW.includes(a), a);
  assert.doesNotMatch(BOARD_SYSTEM_PROMPT, /atrium plan/, '판 안내문에는 줄을 더하지 않는다');
  assert.match(boardSkill(), /## 리포의 목표·마일스톤\(레인\)/); assert.match(boardSkill(), /남의 레인은 읽기만/);
  const h = (await runCli(['help', 'plan'], {})).stdout;
  assert.equal(h.trim(), PLAN_HELP);
  assert.match((await runCli(['help', '--long'], {})).stdout, /atrium plan list/);
  assert.deepEqual(parsePlanArgs([]), { json: false, help: false, action: 'show', all: false });
  assert.deepEqual(parsePlanArgs(['item', 'M2.4', '--move', 'M3:2', '--plan', '수집']).ops[0], { op: 'itemEdit', id: 'M2.4', move: 'M3:2' });
  assert.equal(parsePlanArgs(['item', 'M2.4', '--move', 'M3:2', '--plan', '수집']).plan, '수집');
  assert.deepEqual(parsePlanArgs(['item', 'M2', '글', '--who', 'user']).ops[0], { op: 'itemAdd', ms: 'M2', text: '글', who: 'user' });
  assert.deepEqual(parsePlanArgs(['owner', '수집', 'me']), { json: false, help: false, action: 'owner', plan: '수집', owner: 'me' });
  assert.deepEqual(parsePlanArgs(['new', '결제', '흐름']), { json: false, help: false, action: 'new', name: '결제 흐름' });
  assert.deepEqual(parsePlanArgs(['import', '-', '--dry', '--if-rev', '4', '--new', 'x']), { json: false, help: false, action: 'import', file: '-', replace: false, ifRev: 4, dry: true, new: 'x' });
  assert.equal(err(() => parsePlanArgs(['goal', '--bogus'])).usage, true);
  assert.deepEqual(meLines([]), []);
  assert.ok(importLines({ dry: true, counts: { goal: 0, metrics: 0, milestones: 1, items: 0, user: 0, checked: 0, focus: 'A' }, current: { rev: 3, milestones: 2, items: 5 } })[1].includes('--replace'));
  assert.equal(writeLines({ rev: 3, changed: [{ code: 'M1', created: false, renamed: { 'M1.1': 'X.1' } }], log: ['마일스톤 코드 M1 → X'], plan: null }, { action: 'op', ops: [{ op: 'ms' }] })[1], '바뀐 항목 ID: M1.1 → X.1');
});
