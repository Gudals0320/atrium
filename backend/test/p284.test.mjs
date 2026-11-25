// P284 단위 시험: 결정 카드(atrium ask). 만들기·상한·거절(하위), 답하기 → 전달과 answered, 무시 → 전달 없음, 직접 글 → 닫힘,
// 판 알림·다른 세션의 글은 닫지 않음, 세션 닫힘 → closed, --done·--list(CLI), 웹 푸시(응답 필요 스위치, 카드마다 한 번), 계약 7.
// 진짜 저장소·전달 대기열(B1)·Branch, 가짜 에이전트(p204 시험의 틀). herdr·hc와 claude 없이 돈다.
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
import { humanPrompt, answerText } from '../src/decisions.mjs';
import { Pusher, prefKind, pushText, pushPayload } from '../src/web-push.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p284-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p284test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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



// ---------- P284 ----------
const D = (b) => b.store.db.prepare('SELECT * FROM decisions ORDER BY id').all();
const delivs = (b, s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(s.sessionId);
const ask = (b, s, o) => b.branch.dispatch('ask', s, o);
const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };

test('P284 계약과 안내: ask 동사, 계약 7, 허용 규칙, 판·하네스 안내문 한 줄, 스킬', async () => {
  assert.equal(CONTRACT_VERSION, 11); // P360: revive·fork로 11. // P346: docs init·on·off로 10. // P296: 오케스트레이션 허용 동사로 9. // P292: todo로 8
  assert.ok(VERB_NAMES.includes('ask'));
  const v = VERBS.find((x) => x.name === 'ask');
  assert.ok(v.args.some((a) => a.includes('--option')) && v.args.some((a) => a.includes('--done')) && v.args.some((a) => a.includes('--list')));
  assert.match(shortHelp(), /atrium ask/);
  assert.ok(ATRIUM_ALLOW.includes('Bash(atrium ask *)') && ATRIUM_ALLOW.includes('PowerShell(atrium ask *)'));
  assert.equal(BOARD_SYSTEM_PROMPT.split('\n').filter((l) => l.includes('atrium ask')).length, 1, '판 안내문은 한 줄만');
  assert.match(HARNESS_PROMPT, /atrium ask/); assert.doesNotMatch(HARNESS_PROMPT, /["\n]/, '하네스 안내문은 줄바꿈·큰따옴표 없이');
  assert.match(boardSkill(), /atrium ask/); assert.match(boardSkill(), /--done/);
  const long = (await runCli(['help', '--long'], {})).stdout;
  assert.match(long, /atrium ask --done/); assert.match(long, /atrium ask --list/);
});

test('P284 만들기·상한·거절: 사람과 직접 일하는 세션은 카드를 남기고 하위 워커는 거절한다', async () => {
  const { b, add, stop } = await board();
  const changed = [];
  b.api.broadcast = (ev, d) => { if (ev === 'decision.changed') changed.push(d); };
  try {
    const lead = add('lead');
    const r = ask(b, lead, { question: '  그림이 이대로면\n마무리시킬까요?  ', options: ['마무리', '한 번 더'], why: 'PC 칩과 목록 그림' });
    assert.equal(r.open, 1); assert.equal(r.max, ASK_OPEN_MAX);
    const row = D(b)[0];
    assert.equal(row.question, '그림이 이대로면 마무리시킬까요?'); assert.equal(row.state, 'open'); assert.deepEqual(JSON.parse(row.options), ['마무리', '한 번 더']); assert.equal(row.why, 'PC 칩과 목록 그림');
    assert.equal(changed.length, 1); assert.equal(changed[0].cards.length, 1); assert.equal(changed[0].cards[0].name, 'lead');
    // 상한
    assert.equal(err(() => ask(b, lead, { question: 'x'.repeat(ASK_QUESTION_MAX + 1) })).code, 'too_long');
    assert.equal(err(() => ask(b, lead, { question: 'q', options: Array.from({ length: ASK_OPTIONS_MAX + 1 }, (_, i) => 'o' + i) })).code, 'too_long');
    assert.equal(err(() => ask(b, lead, { question: 'q', options: ['a'.repeat(81)] })).code, 'too_long');
    assert.equal(err(() => ask(b, lead, { question: 'q', why: 'w'.repeat(301) })).code, 'too_long');
    assert.equal(err(() => ask(b, lead, { question: '' })).code, 'bad_request');
    assert.equal(err(() => ask(b, lead, { question: 'q', options: ['a', 'a'] })).code, 'bad_request');
    assert.equal(err(() => ask(b, lead, { question: '[Atrium 보드] 가짜' })).code, 'board_prefix');
    for (let i = 1; i < ASK_OPEN_MAX; i++) ask(b, lead, { question: '질문 ' + i });
    const e = err(() => ask(b, lead, { question: '하나 더' }));
    assert.equal(e.code, 'too_many'); assert.match(e.message, /atrium ask --done/);
    // 하위 워커는 부모에게 묻는다
    const r2 = await b.branch.spawnChild(lead, { name: 'w1', prompt: '일', wait: false });
    const w1 = b.sessions.get(r2.sessionId) || [...b.sessions.values()].find((x) => x.name === 'w1');
    const e2 = err(() => ask(b, w1, { question: '어떻게 할까요?' }));
    assert.equal(e2.code, 'sub_worker'); assert.match(e2.message, /atrium prompt lead/);
    // 동료는 쓴다(일 상위가 없다)
    const p = add('p1');
    b.branch.setRelation(lead, p, 'peer', { quiet: true });
    assert.equal(ask(b, p, { question: '동료의 질문' }).open, 1);
    // --list는 자기 것만
    assert.equal(ask(b, p, { list: true }).cards.length, 1);
    assert.equal(ask(b, lead, { list: true }).cards.length, ASK_OPEN_MAX);
  } finally { await stop(); }
});

test('P284 답하기 → 그 세션에 "[결정] 질문 → 답" 보통 메시지(대기열)와 answered, 무시 → 전달 없음과 ignored', async () => {
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    const h = b.branch.handlers;
    const a = ask(b, lead, { question: '이 방향으로 진행할까요?', options: ['진행', '멈춤'] });
    const n0 = delivs(b, lead).length;
    const r = h['decision.answer']({ id: a.id, answer: '진행' }, { kind: 'desktop' });
    assert.equal(r.state, 'answered');
    const ds = delivs(b, lead);
    assert.equal(ds.length, n0 + 1);
    assert.equal(ds.at(-1).text, '[결정] 이 방향으로 진행할까요? → 진행'); assert.equal(ds.at(-1).origin, 'human');
    const row = b.store.getDecision(a.id);
    assert.equal(row.state, 'answered'); assert.equal(row.answer, '진행'); assert.equal(row.via, 'pc'); assert.ok(row.answeredAt);
    await until(() => lead.texts.some((t) => t.startsWith('[결정]'))); // 대기열 규칙대로 들어간다
    // 이미 끝난 카드
    assert.equal(err(() => h['decision.answer']({ id: a.id, answer: '또' })).code, 'already_closed');
    // 한 줄 답(원격 기기)
    const c = ask(b, lead, { question: 'q'.repeat(120) });
    h['decision.answer']({ id: c.id, answer: '  직접 쓴 답  ' }, { remote: true, auth: { device: { id: 'x' } } });
    assert.equal(delivs(b, lead).at(-1).text, answerText('q'.repeat(120), '직접 쓴 답'));
    assert.match(delivs(b, lead).at(-1).text, /^\[결정\] q{80}… → 직접 쓴 답$/);
    assert.equal(b.store.getDecision(c.id).via, 'remote');
    // 무시
    const g = ask(b, lead, { question: '무시할 질문' });
    const n1 = delivs(b, lead).length;
    assert.equal(h['decision.ignore']({ id: g.id }).state, 'ignored');
    assert.equal(delivs(b, lead).length, n1, '무시는 세션에 아무것도 보내지 않는다');
    assert.equal(b.store.getDecision(g.id).state, 'ignored');
    assert.equal(h['decision.list']().cards.length, 0);
    assert.equal(err(() => h['decision.answer']({ id: 9999, answer: 'x' })).code, 'not_found');
    assert.equal(err(() => h['decision.answer']({ id: ask(b, lead, { question: 'q2' }).id, answer: '  ' })).code, 'bad_request');
  } finally { await stop(); }
});

test('P284 직접 글 → 손 카드는 그대로(P303), 판 알림·다른 세션의 글은 닫지 않음, 세션 닫힘 → closed', async () => {
  const { b, add, stop } = await board();
  try {
    const lead = add('lead'); const other = add('other');
    const a = ask(b, lead, { question: '질문 A' }); const a2 = ask(b, lead, { question: '질문 B' });
    // 판 알림(출처 board)과 다른 세션의 글(atrium prompt)은 닫지 않는다
    b.queue.enqueue(lead.sessionId, '[Atrium 보드] 알림');
    await b.branch.dispatch('prompt', other, { name: 'lead', text: '다른 세션의 글' });
    await until(() => lead.texts.some((t) => t === '다른 세션의 글'));
    assert.equal(b.store.getDecision(a.id).state, 'open');
    // 터미널 직접 글 판정
    assert.equal(humanPrompt('그냥 진행해'), true);
    assert.equal(humanPrompt('[Atrium 보드] 하위 @w1이 끝났다'), false);
    assert.equal(humanPrompt('[결정] 질문 → 답'), false);
    assert.equal(humanPrompt('<task-notification>…'), false);
    assert.equal(humanPrompt('  '), false);
    // 사람이 직접 보낸 글(명령 바·휴대폰 입력·터미널)
    // P303: 손 카드는 닫지 않는다(사람의 글이 그 질문의 답인지 판은 모른다. 에이전트가 --done으로 닫는다)
    assert.equal(b.decisions.onHuman(lead.sessionId, 'bar'), 0);
    for (const id of [a.id, a2.id]) assert.equal(b.store.getDecision(id).state, 'open');
    for (const id of [a.id, a2.id]) ask(b, lead, { done: id });
    // 세션 닫힘
    const c = ask(b, other, { question: '닫힐 질문' });
    b.closeSession(other, 'killed');
    assert.equal(b.store.getDecision(c.id).state, 'closed'); assert.equal(b.store.getDecision(c.id).via, 'closed');
    assert.equal(b.branch.handlers['decision.list']().cards.length, 0);
  } finally { await stop(); }
});

test('P284 CLI: atrium ask → 번호, --list, --done, 하위 거절(종료 코드 1), 잘못 씀(2)', async () => {
  const { b, add, stop } = await board();
  const srv = await serve(b);
  try {
    const lead = add('lead');
    const r = await runCli(['ask', '이대로 마무리할까요?', '--option', '마무리', '--option', '한 번 더', '--why', '그림 확인'], envOf(b, lead));
    assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /결정 카드 #1/);
    const row = D(b)[0]; assert.deepEqual(JSON.parse(row.options), ['마무리', '한 번 더']); assert.equal(row.why, '그림 확인');
    const j = JSON.parse((await runCli(['ask', '두 번째', '--json'], envOf(b, lead))).stdout); assert.equal(j.id, 2); assert.equal(j.open, 2);
    const l = await runCli(['ask', '--list'], envOf(b, lead)); assert.match(l.stdout, /#1 .*이대로 마무리할까요\? \[마무리 \| 한 번 더\] \(맥락: 그림 확인\)/); assert.match(l.stdout, /#2/);
    const d = await runCli(['ask', '--done', '1'], envOf(b, lead)); assert.equal(d.code, 0); assert.match(d.stdout, /#1를 닫았다/);
    assert.equal(b.store.getDecision(1).state, 'closed'); assert.equal(b.store.getDecision(1).via, 'agent');
    assert.match((await runCli(['ask', '--done', '1'], envOf(b, lead))).stdout, /이미 끝났다/);
    assert.equal((await runCli(['ask', '--done', '99'], envOf(b, lead))).code, 1);
    assert.equal((await runCli(['ask'], envOf(b, lead))).code, 2);
    assert.equal((await runCli(['ask', 'x'.repeat(ASK_QUESTION_MAX + 1)], envOf(b, lead))).code, 2);
    const r2 = await b.branch.spawnChild(lead, { name: 'w1', prompt: '일', wait: false });
    const w1 = [...b.sessions.values()].find((x) => x.name === 'w1');
    const sub = await runCli(['ask', '어떻게 할까요?'], envOf(b, w1));
    assert.equal(sub.code, 1); assert.match(sub.stderr, /sub_worker/); assert.match(sub.stderr, /atrium prompt lead/);
    void r2;
  } finally { srv.close(); await stop(); }
});

test('P284 웹 푸시: 결정 카드는 응답 필요 스위치를 따르고 카드마다 한 번', () => {
  assert.equal(prefKind('decision'), 'need');
  assert.equal(pushText([{ name: 'lead', kind: 'decision', ws: 'repo' }], 'ko').title, '@lead · 할 일');
  assert.equal(pushText([{ name: 'lead', kind: 'decision', ws: 'repo' }], 'en').title, '@lead · to do');
  assert.equal(pushPayload([{ sessionId: 'a', name: 'a', kind: 'done' }, { sessionId: 'b', name: 'b', kind: 'decision' }], 'en').sessionId, 'b');
  const p = new Pusher({ store: null, timers: false, batchMs: 60000 });
  try {
    p.mem = [{ deviceId: 'd1', endpoint: 'https://fcm.googleapis.com/x', kinds: { need: false } }];
    p.decision({ id: 1, sessionId: 's0', name: 'lead', workspaceKey: null }); // P357: 세션마다 쿨다운이 있어 다른 세션으로
    assert.equal(p.decisions.at(-1).why, 'kind_off');
    p.mem = [{ deviceId: 'd1', endpoint: 'https://fcm.googleapis.com/x' }];
    p.decision({ id: 2, sessionId: 's1', name: 'lead' });
    assert.equal(p.pending.get('d1').items.get('s1').kind, 'decision');
    p.decision({ id: 2, sessionId: 's1', name: 'lead' });
    assert.equal(p.decisions.at(-1).why, 'cooldown', '같은 카드는 한 번');
    p.decision({ id: 3, sessionId: 's1', name: 'lead' });
    assert.equal(p.decisions.at(-1).why, 'cooldown', 'P357: 같은 세션의 다른 카드도 쿨다운 안에는 한 번');
    const before = p.decisions.length;
    p.decision({ id: 4, sessionId: 's2', name: 'other' });
    assert.equal(p.decisions.length, before, '다른 세션의 카드는 묶음에 든다(쿨다운 아님)');
    assert.equal(p.pending.get('d1').items.get('s2').decisionId, 4, 'P357: 누르면 갈 카드 번호');
  } finally { p.stop(); }
});
