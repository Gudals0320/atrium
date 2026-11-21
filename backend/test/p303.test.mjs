// P303 단위 시험: 결정 카드 닫기 규칙. 사람의 직접 글은 손 카드를 닫지 않고(에이전트가 --done), 자동 카드는 닫되 만든 지 10초 안이면 남긴다.
// 예의상 맺음 말("원하시면 말씀해 주세요", "Let me know if you need anything")은 자동 카드의 질문이 아니다.
// 진짜 저장소·전달 대기열(B1)·Branch, 가짜 에이전트, 가짜 시계(p292 시험의 틀). herdr·hc와 claude 없이 돈다.
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
import { CONTRACT_VERSION, VERB_NAMES, VERBS, shortHelp, ASK_OPEN_MAX, ASK_QUESTION_MAX, ASK_OPTIONS_MAX } from '../src/cli-contract.mjs';
import { BOARD_SYSTEM_PROMPT } from '../src/launch.mjs';
import { HARNESS_PROMPT } from '../src/harness.mjs';
import { findAsk, findQuestion, isQuestion, isPolite, isCheck } from '../src/auto-ask.mjs';
import { AUTO_FRESH_MS } from '../src/decisions.mjs';
import { TODO_LATER_MAX, TODO_CMDS_MAX } from '../src/cli-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p303-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p303test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 }, decisions: { answerGraceMs: 150, now: () => b.clock || Date.now() } });
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




// ---------- P303 ----------
const D = (b) => b.store.db.prepare('SELECT * FROM decisions ORDER BY id').all();
const events = (b, kind) => b.store.db.prepare('SELECT * FROM events WHERE kind = ? ORDER BY id').all(kind).map((e) => ({ ...e, data: JSON.parse(e.data || 'null') }));
const ask = (b, s, o) => b.branch.dispatch('ask', s, o);
const todo = (b, s, o) => b.branch.dispatch('todo', s, o);
const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const dl = (b, s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(s.sessionId);
function turn(b, s, answer, { prompt = '사람의 일' } = {}) {
  applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt }); applyTermStatus(s.rt, 'working'); b.broadcastSession(s);
  applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: answer }); applyTermStatus(s.rt, 'idle'); b.broadcastSession(s);
}

test('P303 사람의 직접 글: 손 카드(결정·할 일·확인·나중)는 그대로, 자동 카드는 닫힘, 만든 지 10초 안의 자동 카드는 남김, --done으로 닫힘', async () => {
  const { b, add, stop } = await board();
  try {
    b.clock = Date.now();
    const lead = add('lead');
    const q = ask(b, lead, { question: '이대로 구현할까요?', options: ['예', '아니오'] });
    const d = todo(b, lead, { text: '명령 치기', cmds: ['ls'] });
    const c = todo(b, lead, { text: '보기', check: true });
    const l = todo(b, lead, { text: '나중 일', later: '키를 받으면' });
    // 카드를 올린 1초 뒤 사람이 다른 요청을 보낸다(#26)
    b.clock += 1000;
    assert.equal(b.decisions.onHuman(lead.sessionId, 'bar'), 0);
    assert.equal(b.decisions.onHuman(lead.sessionId, 'terminal'), 0);
    for (const x of [q, d, c, l]) assert.equal(b.store.getDecision(x.id).state, 'open');
    const kept = events(b, 'decision_kept').at(-1).data;
    assert.deepEqual(kept.hand.sort(), [q.id, d.id, c.id]); assert.deepEqual(kept.fresh, []); assert.equal(kept.where, 'terminal');
    assert.ok(!events(b, 'decision_end').some((e) => e.data.via === 'session'));
    // 대화로 답을 받은 에이전트가 --done으로 닫는다
    assert.equal(ask(b, lead, { done: q.id }).closed, true);
    assert.equal(todo(b, lead, { done: c.id }).closed, true);
    assert.equal(b.store.getDecision(q.id).state, 'closed'); assert.equal(b.store.getDecision(q.id).via, 'agent');
    for (const x of [q, d, c, l]) ask(b, lead, { done: x.id });
    // 자동 카드: 만든 지 10초 안의 직접 글은 남기고, 그 뒤의 글은 닫는다
    const l2 = add('lead2');
    turn(b, l2, '두 길이 있습니다.\n\n어느 쪽으로 할까요?');
    const auto = b.store.openDecisions(l2.sessionId)[0];
    assert.equal(auto.auto, true); assert.equal(auto.createdAt, b.clock, '자동 카드도 판의 시계');
    b.clock += AUTO_FRESH_MS - 1;
    assert.equal(b.decisions.onHuman(l2.sessionId, 'bar'), 0);
    assert.equal(b.store.getDecision(auto.id).state, 'open');
    assert.deepEqual(events(b, 'decision_kept').at(-1).data, { hand: [], fresh: [auto.id], where: 'bar' });
    b.clock += 1;
    assert.equal(b.decisions.onHuman(l2.sessionId, 'bar'), 1);
    const r = b.store.getDecision(auto.id);
    assert.equal(r.state, 'answered'); assert.equal(r.via, 'session');
    assert.deepEqual(events(b, 'decision_end').at(-1).data.autoIds, [auto.id]);
    // 손 카드와 자동 카드가 함께: 자동 카드만 닫는다
    const l3 = add('lead3');
    b.clock = Date.now() - 60000; // 손 카드는 이 턴 앞에 만들었다(턴의 시작은 진짜 시계)
    todo(b, l3, { text: '나중에 정리', cmds: ['git gc'] });
    await tick(5);
    b.clock = Date.now();
    turn(b, l3, 'Should I continue?');
    const a3 = b.store.openDecisions(l3.sessionId).find((x) => x.auto);
    b.clock += AUTO_FRESH_MS;
    assert.equal(b.decisions.onHuman(l3.sessionId, 'bar'), 1);
    assert.equal(b.store.getDecision(a3.id).state, 'answered');
    assert.deepEqual(b.store.openDecisions(l3.sessionId).map((x) => [x.kind, x.auto]), [['do', false]]);
  } finally { await stop(); }
});

test('P303 예의상 맺음 말은 질문이 아니다(한국어·영어), 진짜 질문·확인 부탁은 그대로', async () => {
  const polite = [
    '필요 없으면 말씀해 주세요, 지우겠습니다.', // #22
    '원하시면 말씀해 주세요.', // #23
    '궁금한 점이 있으면 알려 주세요.',
    '더 필요하면 말씀해 주세요.',
    '편하실 때 알려 주세요.',
    '추가로 필요한 것이 있으면 말씀해 주세요.',
    '문제가 있으면 알려 주세요.',
    '언제든 말씀해 주세요.',
    'Let me know if you need anything else.',
    'Let me know if you have any questions.',
    'Feel free to ask if anything is unclear.',
    "Don't hesitate to reach out.",
    'If you need anything else, just let me know.',
  ];
  for (const s of polite) {
    assert.ok(isPolite(s), s); assert.equal(isQuestion(s), false, s);
    assert.equal(findAsk('정리를 마쳤습니다. 커밋은 abc123입니다.\n\n' + s), null, s);
  }
  // 사용 기록의 두 답(맺음 말로 끝남)
  assert.equal(findAsk('옛 파일 둘을 남겨 두었습니다. 필요 없으면 말씀해 주세요, 지우겠습니다.'), null);
  assert.equal(findAsk('설정 화면에 켜고 끄는 칸도 둘 수 있습니다. 원하시면 말씀해 주세요.'), null);
  // 진짜 물음은 그대로
  const real = [
    ['두 길이 있습니다.\n\n어느 쪽으로 할까요?', 'decide', '어느 쪽으로 할까요?'],
    ['1. **빠르게**\n2. **깔끔하게**\n\n정해 주세요.', 'decide', '정해 주세요.'],
    ['원하시는 쪽을 골라 주세요.', 'decide', '원하시는 쪽을 골라 주세요.'],
    ['원하시면 어느 쪽으로 할지 말씀해 주세요.', 'decide', '원하시면 어느 쪽으로 할지 말씀해 주세요.'],
    ['편한 쪽을 말씀해 주세요.', 'decide', '편한 쪽을 말씀해 주세요.'],
    ['이대로 마무리할까요? 궁금한 점이 있으면 말씀해 주세요.', 'decide', '이대로 마무리할까요?'],
    ['이대로 마무리할까요?\n\n궁금한 점이 있으면 말씀해 주세요.', 'decide', '이대로 마무리할까요?'],
    ['Should I push the branch? Let me know if you have questions.', 'decide', 'Should I push the branch?'],
    ['Want me to merge it?', 'decide', 'Want me to merge it?'],
    ['Let me know which option you prefer.', 'decide', 'Let me know which option you prefer.'],
    ['I fixed it. Let me know if it works.', 'check', 'Let me know if it works.'],
    ['창에서 단추가 보이는지 확인해 주세요.', 'check', '창에서 단추가 보이는지 확인해 주세요.'],
  ];
  for (const [t, kind, question] of real) { const f = findAsk(t); assert.ok(f, t); assert.equal(f.kind, kind, t); assert.equal(f.question, question, t); }
  // 판: 맺음 말로 끝난 턴은 자동 카드를 만들지 않는다
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    turn(b, lead, '고쳤습니다.\n\n원하시면 말씀해 주세요.');
    assert.equal(b.store.openDecisions(lead.sessionId).length, 0);
    turn(b, lead, '고쳤습니다.\n\n이대로 커밋할까요?');
    assert.equal(b.store.openDecisions(lead.sessionId).length, 1);
  } finally { await stop(); }
});

test('P303 안내: 스킬 본문과 atrium ask 출력은 대화로 답을 받으면 --done으로 닫으라고 한다', () => {
  const sk = boardSkill();
  assert.match(sk, /대화로 답을 받으면 그 카드를 `atrium ask --done <번호>`/);
  assert.doesNotMatch(sk, /보드가 카드를 닫는다/);
  const cli = fs.readFileSync(path.join(HERE, '..', 'bin', 'atrium-child.mjs'), 'utf8');
  assert.ok(!cli.includes('사람이 다른 길로 답하면 보드가 닫는다'));
});
