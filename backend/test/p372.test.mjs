// P372 단위 시험: 판 명령을 쓰는 공통 시험 도구(app/test/e2e/lib/board-agent.mjs).
// 진짜 저장소·전달 대기열·Branch와 HTTP(가짜 판, p292 시험의 틀)에 모듈이 세션 토큰으로 atrium-child.mjs를 부른다.
// 확인: 에이전트 세션(리드)으로 ask·todo를 부르면 판에 진짜 카드가 생긴다(카드 0장이면 실패), 셸 세션·실제 판 env·잘못된 포트·격리 빠짐·없는 세션이면
// 아무것도 부르지 않고 까닭과 고치는 법으로 멈춘다(카드 수 그대로), 셸 토큰으로 직접 부르면 백엔드도 not_board_session으로 거절한다(모듈이 막는 까닭).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { boardAgent, BoardAgentError } = await import(pathToFileURL(path.join(HERE, '..', '..', 'app', 'test', 'e2e', 'lib', 'board-agent.mjs')).href);
const { stripBoardEnv } = await import(pathToFileURL(path.join(HERE, '..', '..', 'app', 'test', 'e2e', 'lib', 'dev-board.mjs')).href);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p372-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p372test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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

function serve(b) {
  const srv = http.createServer((req, res) => { if (!b.branch.handleHttp(req, res)) { res.writeHead(404); res.end(); } });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => { b.cfg.port = srv.address().port; r(srv); }));
}
// 판 API 흉내(모듈의 call): session.list, decision.list만
const apiOf = (b) => async (method) => {
  if (method === 'session.list') return [...b.sessions.values()].map((s) => ({ sessionId: s.sessionId, name: s.name, kind: s.kind, state: deriveState(s.rt).state }));
  if (method === 'decision.list') return { cards: b.store.db.prepare("SELECT * FROM decisions WHERE state = 'open' ORDER BY id").all().map((d) => ({ id: d.id, sessionId: d.session_id, name: (b.sessions.get(d.session_id) || {}).name })) };
  throw new Error('흉내 없음 ' + method);
};
const openCards = (b) => b.store.db.prepare("SELECT COUNT(*) n FROM decisions WHERE state = 'open'").get().n;
async function setup() {
  const k = await board();
  const srv = await serve(k.b);
  // 판이 쓰는 backend.json(모듈은 여기의 판 API 토큰으로 세션 토큰을 만들고 포트·터미널 세션을 견준다)
  fs.writeFileSync(path.join(k.dir, 'backend.json'), JSON.stringify({ pid: process.pid, port: k.b.cfg.port, token: k.b.apiToken, terminalSession: k.b.cfg.terminalSession }));
  const env = { ATRIUM_TERMINAL_SESSION: k.b.cfg.terminalSession, ATRIUM_HERDR_SESSION: k.b.cfg.terminalSession, ATRIUM_PORT: String(k.b.cfg.port), ATRIUM_DATA_DIR: k.dir, ATRIUM_CLAUDE_PROJECTS: path.join(k.dir, 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none' };
  const procEnv = { ...stripBoardEnv(process.env), ...env };
  const lead = k.add('lead');
  const sh = k.add('sh1', { kind: 'shell', hooked: false });
  return { ...k, srv, env, procEnv, lead, sh, ag: (o = {}) => boardAgent({ env, call: apiOf(k.b), procEnv, home: path.join(k.dir, 'home'), ...o }), close: async () => { srv.close(); await k.stop(); } };
}
const codeOf = async (p) => { try { await p; } catch (e) { assert.ok(e instanceof BoardAgentError, e.stack); return e; } assert.fail('던지지 않았다'); };

test('P372 리드(에이전트) 세션으로 ask·todo: 판에 진짜 카드가 생기고 모듈이 다시 찾는다', async () => {
  const k = await setup();
  try {
    const ag = k.ag();
    await assert.rejects(ag.expectCards(1, { ms: 50 }), (e) => e.code === 'no_card' && /0장/.test(e.message), '카드 0장이면 실패');
    const a = await ag.ask('lead', '시험: 어느 안으로 갈까요?', { options: ['A안', 'B안'], why: '시험 카드' });
    assert.equal(a.name, 'lead');
    const t = await ag.todo('lead', '시험: npm 캐시 확인', { cmds: ['npm cache verify'] });
    assert.notEqual(a.id, t.id);
    const mine = await ag.expectCards(2, { session: 'lead' });
    assert.equal(mine.length, 2);
    assert.equal(openCards(k.b), 2);
    const row = k.b.store.db.prepare('SELECT * FROM decisions WHERE id = ?').get(a.id);
    assert.equal(row.session_id, k.lead.sessionId, '카드 주인은 부른 리드');
    const m = await ag.models('lead');
    assert.equal(m.code, 0, m.stderr);
  } finally { await k.close(); }
});

test('P372 셸 세션으로 부르면 모듈이 멈춘다(까닭·고치는 법), 셸 토큰으로 직접 부르면 백엔드가 not_board_session', async () => {
  const k = await setup();
  try {
    const ag = k.ag();
    const e = await codeOf(ag.ask('sh1', '셸에서 카드'));
    assert.equal(e.code, 'shell_session');
    assert.match(e.message, /셸 세션은 판 하위 명령/); assert.match(e.message, /고치기: haiku 세션을 리드로/);
    for (const v of ['todo', 'models']) assert.equal((await codeOf(v === 'todo' ? ag.todo('sh1', 'x') : ag.models('sh1'))).code, 'shell_session');
    assert.equal((await codeOf(ag.child('sh1', 'w1'))).code, 'shell_session');
    assert.equal(openCards(k.b), 0, '카드가 생기지 않았다');
    // 모듈을 거치지 않은 옛 길: 셸 세션 신원(토큰을 줘도)으로 atrium-child ask
    const tok = k.b.branch.token(k.sh.sessionId);
    const r = await new Promise((res) => execFile(process.execPath, [path.join(HERE, '..', 'bin', 'atrium-child.mjs'), 'ask', '셸', '--no-wait', '--json'], { env: { ...k.procEnv, ATRIUM_SESSION_ID: k.sh.sessionId, ATRIUM_SESSION_TOKEN: tok } }, (err, stdout) => res({ code: err ? err.code : 0, stdout })));
    assert.notEqual(r.code, 0); assert.match(r.stdout, /not_board_session/);
    assert.equal(openCards(k.b), 0);
  } finally { await k.close(); }
});

test('P372 환경 검사: 실제 판 env가 남음·잘못된 포트·다른 판·격리 빠짐·없는 세션·판 없음이면 아무것도 부르지 않는다', async () => {
  const k = await setup();
  try {
    // 실제 판 세션 env가 셸에 남음
    let e = await codeOf(k.ag({ procEnv: { ...k.procEnv, ATRIUM_SESSION_ID: 'real-session' } }).ask('lead', 'x'));
    assert.equal(e.code, 'real_env'); assert.match(e.message, /ATRIUM_SESSION_ID/); assert.match(e.message, /clean-env/);
    e = await codeOf(k.ag({ procEnv: { ...k.procEnv, ATRIUM_PORT: '47800' } }).ask('lead', 'x'));
    assert.equal(e.code, 'real_env'); assert.match(e.message, /47800/);
    // 판 값 자체가 실제 판을 가리킴
    e = await codeOf(boardAgent({ env: { ...k.env, ATRIUM_PORT: '47800' }, call: apiOf(k.b), procEnv: stripBoardEnv(process.env) }).ask('lead', 'x'));
    assert.equal(e.code, 'not_isolated'); assert.match(e.message, /실제 판/);
    // 잘못된 포트(데이터 폴더의 판과 다름)
    e = await codeOf(boardAgent({ env: { ...k.env, ATRIUM_PORT: '48999' }, call: apiOf(k.b), procEnv: stripBoardEnv(process.env) }).ask('lead', 'x'));
    assert.equal(e.code, 'wrong_port'); assert.match(e.message, /48999/);
    // 다른 판의 데이터 폴더
    e = await codeOf(boardAgent({ env: { ...k.env, ATRIUM_TERMINAL_SESSION: 'atrium-dev-other', ATRIUM_HERDR_SESSION: 'atrium-dev-other' }, call: apiOf(k.b), procEnv: stripBoardEnv(process.env) }).ask('lead', 'x'));
    assert.equal(e.code, 'wrong_board');
    // 격리 빠짐(대화 기록·데스크톱 앱)
    const { ATRIUM_CLAUDE_PROJECTS, ATRIUM_CLAUDE_DESKTOP, ...bare } = k.env;
    e = await codeOf(boardAgent({ env: bare, call: apiOf(k.b), procEnv: stripBoardEnv(process.env) }).ask('lead', 'x'));
    assert.equal(e.code, 'not_isolated'); assert.match(e.message, /ATRIUM_CLAUDE_PROJECTS/); assert.match(e.message, /ATRIUM_CLAUDE_DESKTOP/);
    // 없는 세션
    e = await codeOf(k.ag().ask('nobody', 'x'));
    assert.equal(e.code, 'no_session'); assert.match(e.message, /ag\.lead/);
    // 판이 떠 있지 않음(backend.json 없음)
    const d2 = tmp();
    e = await codeOf(boardAgent({ env: { ...k.env, ATRIUM_DATA_DIR: d2 }, call: apiOf(k.b), procEnv: stripBoardEnv(process.env) }).ask('lead', 'x'));
    assert.equal(e.code, 'no_board');
    assert.equal(openCards(k.b), 0, '어느 경우에도 카드가 생기지 않았다');
  } finally { await k.close(); }
});
