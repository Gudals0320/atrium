// P117 단위 시험: 새 판의 터미널 백엔드 정하기, 두 백엔드를 함께 쥐는 라우터, 옛 판 옮기기(메모리 안의 가짜 백엔드 둘과 가짜 판)
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { decideTerminalBackend, isOldBoard, NEW_BOARD_BACKEND } from '../src/terminal-backend.mjs';
import { TerminalRouter, paneBackend, wsBackend } from '../src/terminal-router.mjs';
import { movePlan, Mover } from '../src/terminal-move.mjs';
import { newRuntime, applyAgentDetected, applyHerdrStatus, applyAgentReleased, deriveState } from '../src/state.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(20); } throw new Error('timed out'); };

test('P117 백엔드 정하기: 환경 변수 > 판 기록 > 옛 숨은 설정 hc > 옛 판 herdr > 새 판 기본', () => {
  assert.deepEqual(decideTerminalBackend({ env: { ATRIUM_TERMINAL_BACKEND: 'hc' }, meta: { backend: 'herdr' } }), { backend: 'hc', source: 'env', invalid: null, persist: false });
  assert.equal(decideTerminalBackend({ env: {}, meta: { backend: 'hc', by: 'move' }, oldBoard: true }).backend, 'hc');
  assert.equal(decideTerminalBackend({ env: {}, meta: { backend: 'hc', by: 'move' } }).persist, false);
  assert.deepEqual(decideTerminalBackend({ env: {}, settings: { terminalBackend: 'hc' }, oldBoard: true }), { backend: 'hc', source: 'setting', invalid: null, persist: true });
  assert.equal(decideTerminalBackend({ env: {}, settings: { terminalBackend: 'herdr' } }).source, 'new-board'); // 기본값이 채워진 옛 설정은 정한 것이 아니다
  assert.deepEqual(decideTerminalBackend({ env: {}, oldBoard: true }), { backend: 'herdr', source: 'old-board', invalid: null, persist: true });
  assert.equal(decideTerminalBackend({ env: {} }).backend, NEW_BOARD_BACKEND);
  assert.equal(NEW_BOARD_BACKEND, 'hc'); // 새 판은 herdr-core(기본 바꾸기 커밋)
  assert.equal(decideTerminalBackend({ env: {}, newBoard: 'hc' }).backend, 'hc');
  assert.equal(decideTerminalBackend({ env: { ATRIUM_TERMINAL_BACKEND: 'tmux' } }).invalid, 'tmux');
  // 옛 판: 세션 행, 저장한 herdr 서버 PID, herdr 세션 폴더 중 하나
  const store = (rows, meta = {}) => ({ anySessionRow: () => rows, getMeta: (k) => meta[k] });
  assert.equal(isOldBoard({ store: store(true), session: 'x', exists: () => false }), true);
  assert.equal(isOldBoard({ store: store(false, { herdrServerPid: 12 }), session: 'x', exists: () => false }), true);
  assert.equal(isOldBoard({ store: store(false), session: 'x', exists: (p) => /herdr[\\/]sessions[\\/]x$/.test(p) }), true);
  assert.equal(isOldBoard({ store: store(false), session: 'x', exists: () => false }), false);
});

// 메모리 안의 가짜 터미널 백엔드(herdr 패널 w1:p1 꼴, hc 주소 t1 꼴). 에이전트를 띄우면 곧 나타나 idle, /exit + Enter면 떠난다
class FakeTerm extends EventEmitter {
  constructor(backend, { fail = {} } = {}) {
    super(); this.backend = backend; this.connected = false; this.running = true; this.n = 0; this.panes = new Map(); this.calls = []; this.fail = fail; this.pong = { version: backend === 'hc' ? '0.1.20' : '0.9.5' };
  }
  id() { this.n++; return this.backend === 'hc' ? { ws: `hw-${this.n}`, pane: `t${this.n}` } : { ws: `w${this.n}`, pane: `w${this.n}:p1` }; }
  rec(m, a) { this.calls.push([m, a]); }
  async probe() { return this.running ? { running: true, pong: this.pong } : { running: false }; }
  async startServer() { if (this.fail.start) throw Object.assign(new Error('download failed: offline'), { code: 'download_failed' }); this.running = true; return { started: true }; }
  async stopServer() { this.rec('stopServer'); this.running = false; return { stopped: true }; }
  checkCompat() { return { ok: true, level: 'ok' }; }
  serverPid() { return this.backend === 'hc' ? 4343 : 777; }
  startEvents() { this._watching = true; setTimeout(() => { this.connected = true; this.emit('connected', this.pong); }, 5); }
  stopEvents() { this._watching = false; }
  async refreshSubscription() {}
  async snapshot() { return { workspaces: [], panes: [...this.panes.values()].map((p) => ({ paneId: p.id, workspaceId: p.ws, agent: p.agent })) }; }
  async listAgents() { return [...this.panes.values()].filter((p) => p.agent).map((p) => ({ name: p.name, paneId: p.id, agent: p.agent, status: 'idle' })); }
  async createWorkspace({ cwd, label }) { if (this.fail.create) throw Object.assign(new Error('nope'), { code: 'unreachable' }); const { ws, pane } = this.id(); this.panes.set(pane, { id: pane, ws, cwd, agent: null }); this.rec('createWorkspace', { cwd, label }); return { workspaceId: ws, paneId: pane }; }
  async waitShellReady() { return true; }
  async startAgent({ name, paneId, args, kind = 'claude' }) {
    this.rec('startAgent', { paneId, args, kind });
    if (this.fail.agent) { setTimeout(() => this.emit('event', { type: 'agent_released', paneId }), 5); return { agent: { paneId } }; }
    const p = this.panes.get(paneId); p.agent = kind; p.name = name;
    setTimeout(() => { this.emit('event', { type: 'agent_detected', paneId, agent: kind }); this.emit('event', { type: 'status', paneId, status: 'idle' }); }, 5);
    return { agent: { paneId, name } };
  }
  async sendText(paneId, t) { this.rec('sendText', { paneId, t }); this._typed = t; }
  async paneKeys(paneId, keys) { this.rec('paneKeys', { paneId, keys }); const p = this.panes.get(paneId); if (keys[0] === 'enter' && this._typed === '/exit' && p && p.agent && !this.fail.noExit) { p.agent = null; setTimeout(() => this.emit('event', { type: 'agent_released', paneId }), 5); } }
  async readScreen() { return ''; }
  async workspacePanes(ws) { return [...this.panes.values()].filter((p) => p.ws === ws).map((p) => ({ paneId: p.id })); }
  async closePane(paneId) { this.rec('closePane', paneId); this.panes.delete(paneId); }
  async closeWorkspace(ws) { this.rec('closeWorkspace', ws); for (const [k, p] of this.panes) if (p.ws === ws) this.panes.delete(k); }
  async getPane(paneId) { const p = this.panes.get(paneId); return p ? { paneId, agent: p.agent } : null; }
  async processInfo() { return { foreground_processes: [] }; }
  async getAgent() { return null; }
  async prompt(target) { this.rec('prompt', target); return { ok: true }; }
  readResumeRecord() { return { found: false }; }
  async registerResume() {}
}

test('P117 라우터: 패널 모양으로 가르고, 이름은 판이 아는 패널로, 새 작업 공간은 주로. 백엔드마다 끊김을 알리고 모두 붙으면 connected', async () => {
  assert.equal(paneBackend('wCY:p1'), 'herdr'); assert.equal(paneBackend('t1b'), 'hc'); assert.equal(wsBackend('hw-ab'), 'hc'); assert.equal(wsBackend('wCY'), 'herdr');
  const h = new FakeTerm('herdr'), c = new FakeTerm('hc');
  const r = new TerminalRouter({ primary: h, others: [c] });
  const ev = [];
  for (const k of ['connected', 'disconnected']) r.on(k, (x) => ev.push([k, x]));
  r.startEvents(() => ['w1:p1', 't1']);
  await until(() => ev.find((e) => e[0] === 'connected'));
  assert.equal(r.backend, 'herdr'); assert.equal(r.mixed(), true);
  const a = await r.createWorkspace({ cwd: 'C:/x' });
  assert.match(a.paneId, /:/);
  const b = await r.createWorkspace({ cwd: 'C:/x', backend: 'hc' });
  assert.match(b.paneId, /^t/);
  await r.startAgent({ name: 'x', paneId: b.paneId });
  assert.equal(c.calls.filter((x) => x[0] === 'startAgent').length, 1); assert.equal(h.calls.filter((x) => x[0] === 'startAgent').length, 0);
  r.resolveTarget = (t) => (t === 'x' ? b.paneId : null);
  await r.prompt('x', 'hi');
  assert.deepEqual(c.calls.filter((x) => x[0] === 'prompt').map((x) => x[1]), ['x']);
  assert.equal((await r.snapshot()).panes.length, 2);
  // 한 백엔드가 끊기면 그 이름으로 알리고, 다시 붙으면 connected
  ev.length = 0;
  c.connected = false; c.emit('disconnected');
  assert.deepEqual(ev, [['disconnected', 'hc']]);
  assert.equal(r.connected, true); // 주(herdr)는 붙어 있다
  c.connected = true; c.emit('connected', c.pong);
  assert.equal(ev.at(-1)[0], 'connected');
  // 주 바꾸기, 떼기
  r.setPrimary('hc'); assert.equal(r.backend, 'hc'); assert.equal(r.serverPid(), 4343);
  assert.equal(r.remove('herdr'), true); assert.equal(r.mixed(), false);
  assert.equal((await r.createWorkspace({ cwd: 'C:/y' })).paneId.startsWith('t'), true);
  r.stopEvents();
});

test('P117 라우터: 나중에 붙인 백엔드(옮기기)는 처음 붙을 때 판 전체 다시 맞추기(connected)를 내지 않는다. 서버 없는 다른 백엔드는 뜰 때 뗀다', async () => {
  const h = new FakeTerm('herdr');
  const r = new TerminalRouter({ primary: h });
  const ev = [];
  r.on('connected', () => ev.push('connected'));
  r.startEvents(() => []);
  await until(() => ev.length === 1);
  const c = new FakeTerm('hc');
  r.add(c, { quiet: true });
  await until(() => c.connected);
  await sleep(20);
  assert.deepEqual(ev, ['connected']);
  const r2 = new TerminalRouter({ primary: new FakeTerm('hc'), others: [Object.assign(new FakeTerm('herdr'), { running: false })] });
  assert.deepEqual(await r2.ensureOthers(), ['herdr']);
  assert.equal(r2.mixed(), false);
  r.stopEvents();
});

test('P117 옮기기 계획: 잠든 세션은 잠든 채, 바쁘면 기다림, 셸·끝난 세션·판의 claude·하네스·판에 올린 claude, 그 밖은 건너뜀', () => {
  assert.deepEqual(movePlan({ sleeping: true }), { plan: 'asleep' });
  assert.deepEqual(movePlan({ paneId: 'w1:p1', busy: 'working', kind: 'claude', hooked: true }), { wait: 'working' });
  assert.deepEqual(movePlan({ paneId: 'w1:p1', kind: 'shell' }), { plan: 'shell' });
  assert.deepEqual(movePlan({ paneId: 'w1:p1', kind: 'claude', hooked: true, state: 'exited' }), { plan: 'pane' });
  assert.deepEqual(movePlan({ paneId: 'w1:p1', kind: 'claude', hooked: true, state: 'ready' }), { plan: 'claude' });
  assert.deepEqual(movePlan({ paneId: 'w1:p1', kind: 'codex', hooked: false, harness: true, state: 'ready' }), { plan: 'harness' });
  assert.deepEqual(movePlan({ paneId: 'w1:p1', kind: 'claude', hooked: false, origin: 'adopted', adoptedConv: true, state: 'ready' }), { plan: 'adopted_claude' });
  assert.deepEqual(movePlan({ paneId: 'w1:p1', kind: 'codex', hooked: false, origin: 'adopted', state: 'ready' }), { skip: 'adopted' });
  assert.deepEqual(movePlan({ paneId: 'w1:p1', kind: 'aider', hooked: false, origin: 'board', state: 'ready' }), { skip: 'not_resumable' });
});

// 옮기기에 필요한 만큼의 가짜 판. 어댑터 이벤트를 세션 상태에 반영한다(backend.mjs onHerdrEvent의 줄인 꼴)
function fakeBoard(router) {
  const sessions = new Map(), meta = {}, events = [];
  const b = {
    cfg: { killWaitMs: 2000, claudeProjects: 'C:/nowhere' }, sessions, killing: new Set(), adapter: router, relay: { detach() {} }, log() {},
    store: { getMeta: (k) => meta[k], setMeta: (k, v) => { meta[k] = v; }, addEvent: (sid, kind, data) => events.push({ sid, kind, data }), saveRuntime() {}, updateSession() {} },
    api: { broadcast() {} }, meta, events,
    hooked: (s) => s.rt.hooked !== false, broadcastSession() {}, registerResume() {},
    launchOf: (s) => ({ sessionId: s.sessionId, settingsPath: 'C:/s.json', permissionMode: 'manual', extraArgs: [] }),
    async withNewPane(create, register) { const r = await create(); await register(r); return r; },
    async setPane(s, paneId, ws) { s.paneId = paneId; s.herdrWorkspaceId = ws; },
    async onTerminalPrimaryChanged(to) { meta.primaryChanged = to; },
    sleeper: { going: new Map(), wakes: new Map(), info: (s) => ({ kind: s.kind, state: deriveState(s.rt).state, draft: false, delivering: 0, loops: 0, bg: false }), async restoreAfterExit() {} },
    recall: { transcriptExists: () => false },
  };
  router.on('event', (e) => {
    const s = [...sessions.values()].find((x) => x.paneId === e.paneId);
    if (!s) return;
    if (e.type === 'agent_detected') applyAgentDetected(s.rt);
    if (e.type === 'status') applyHerdrStatus(s.rt, e.status);
    if (e.type === 'agent_released') applyAgentReleased(s.rt);
  });
  return b;
}
function addSession(b, { sessionId, name, kind = 'claude', paneId, ws, ready = true, asleep = false }) {
  const rt = newRuntime({ kind, hooked: kind === 'claude' });
  if (kind === 'shell') rt.phase = 'running';
  else if (ready) { applyAgentDetected(rt); applyHerdrStatus(rt, 'idle'); }
  if (asleep) rt.sleep = { at: 1, by: 'auto', scope: 'session' };
  const s = { sessionId, name, kind, cwd: 'C:/w', paneId: asleep ? null : paneId, herdrWorkspaceId: asleep ? null : ws, agentName: name, rt, origin: 'board' };
  b.sessions.set(sessionId, s);
  return s;
}

test('P117 옮기기(herdr → hc): 판의 claude는 옛 패널에서 /exit 뒤 hc에 같은 세션 ID로 이어 띄우고, 뜬 뒤에만 옛 패널을 닫는다. 셸은 새 셸, 잠든 세션은 잠든 채, 다 옮기면 빈 herdr를 끈다', async () => {
  const h = new FakeTerm('herdr'), c = new FakeTerm('hc');
  const r = new TerminalRouter({ primary: h });
  r.startEvents(() => []);
  await until(() => r.connected);
  const b = fakeBoard(r);
  for (const [id, ws] of [['w1:p1', 'w1'], ['w2:p1', 'w2']]) h.panes.set(id, { id, ws, agent: id === 'w1:p1' ? 'claude' : null });
  const lead = addSession(b, { sessionId: 'sid-lead', name: 'lead', paneId: 'w1:p1', ws: 'w1' });
  const sh = addSession(b, { sessionId: 'sid-sh', name: 'sh1', kind: 'shell', paneId: 'w2:p1', ws: 'w2' });
  const z = addSession(b, { sessionId: 'sid-z', name: 'zz', asleep: true });
  r.add(c, { quiet: true }); // 판이 붙일 hc(가짜)를 미리 넣어 둔다
  const mover = new Mover(b, { waitMs: 200, pollMs: 20 });
  const plan = await mover.start({ to: 'hc' });
  assert.equal(plan.needsConfirm, true);
  assert.deepEqual(plan.plan.map((x) => [x.name, x.plan]), [['lead', 'claude'], ['sh1', 'shell'], ['zz', 'asleep']]);
  await mover.start({ to: 'hc', confirm: true });
  await mover.job.done;
  const v = mover.view();
  assert.equal(v.state, 'done', JSON.stringify(v.error));
  assert.deepEqual(v.rows.map((x) => [x.name, x.result]), [['lead', 'moved'], ['sh1', 'moved'], ['zz', 'asleep']]);
  assert.equal(r.backend, 'hc'); assert.equal(b.meta.terminalBackend.backend, 'hc'); assert.equal(b.meta.primaryChanged, 'hc');
  assert.match(lead.paneId, /^t/); assert.match(sh.paneId, /^t/); assert.equal(z.paneId, null);
  // 옛 claude를 끄고(/exit) → hc에 이어 띄우고 → 옛 작업 공간을 닫는다
  assert.ok(h.calls.find((x) => x[0] === 'sendText' && x[1].t === '/exit'));
  const st = c.calls.find((x) => x[0] === 'startAgent' && x[1].paneId === lead.paneId);
  assert.ok(st, 'claude started on hc');
  assert.ok(st[1].args.includes('--session-id')); // 대화 기록이 없으면 같은 세션 ID로 새로
  assert.deepEqual(h.calls.filter((x) => x[0] === 'closeWorkspace').map((x) => x[1]), ['w1', 'w2']);
  assert.equal(lead.rt.move, undefined); assert.equal(deriveState(lead.rt).state, 'ready');
  assert.equal(deriveState(sh.rt).state, 'shell_idle');
  // herdr에 판의 세션이 남지 않았고 패널도 없다 → 떼고 끈다
  assert.equal(r.mixed(), false);
  assert.ok(h.calls.find((x) => x[0] === 'stopServer'));
  assert.deepEqual(b.events.filter((e) => e.kind === 'terminal_moved').map((e) => e.sid), ['sid-lead', 'sid-sh']);
  r.stopEvents();
});

test('P117 되돌리기(hc → herdr): hc에서 에이전트를 끄면 그 자리에 셸이 남는다. 옛 작업 공간째 닫아 남은 셸도 닫고, 비면 hc 코어를 끈다', async () => {
  const c = new FakeTerm('hc'), h = new FakeTerm('herdr');
  // hc처럼: /exit로 에이전트가 끝나면 같은 작업 공간에 셸을 다시 띄우고, 옛 주소를 부르면 새 셸로 따라간다
  const moved = new Map();
  const paneKeys = c.paneKeys.bind(c);
  c.paneKeys = async (paneId, keys) => {
    const p = c.panes.get(paneId);
    const had = p && p.agent && keys[0] === 'enter' && c._typed === '/exit';
    await paneKeys(paneId, keys);
    if (had) { c.n++; const id = `t${c.n}`; c.panes.set(id, { id, ws: p.ws, agent: null }); c.panes.delete(paneId); moved.set(paneId, id); }
  };
  c.follow = async (id) => moved.get(id) || id;
  const r = new TerminalRouter({ primary: c });
  r.startEvents(() => []);
  await until(() => r.connected);
  const b = fakeBoard(r);
  c.panes.set('t1', { id: 't1', ws: 'hw-1', agent: 'claude' }); c.n = 1;
  const lead = addSession(b, { sessionId: 'sid-lead', name: 'lead', paneId: 't1', ws: 'hw-1' });
  r.add(h, { quiet: true });
  const mover = new Mover(b, { waitMs: 100, pollMs: 20 });
  await mover.start({ to: 'herdr', confirm: true });
  await mover.job.done;
  assert.deepEqual(mover.view().rows.map((x) => [x.name, x.result]), [['lead', 'moved']]);
  assert.match(lead.paneId, /:/);
  assert.deepEqual(c.calls.filter((x) => x[0] === 'closeWorkspace').map((x) => x[1]), ['hw-1']);
  assert.equal(c.panes.size, 0); // 남은 셸까지 닫혔다
  assert.ok(c.calls.find((x) => x[0] === 'stopServer'));
  assert.equal(r.backend, 'herdr'); assert.equal(r.mixed(), false);
  r.stopEvents();
});

test('P117 옮기기: 새 자리에서 뜨지 못하면 새 자리를 닫고 옛 패널에서 다시 이어 간다(그 세션은 herdr에 남는다). 바쁜 세션은 기다리다 건너뛴다. hc를 못 받으면 아무것도 바꾸지 않는다', async () => {
  const h = new FakeTerm('herdr'), c = new FakeTerm('hc', { fail: { agent: true } });
  const r = new TerminalRouter({ primary: h });
  r.startEvents(() => []);
  await until(() => r.connected);
  const b = fakeBoard(r);
  for (const [id, ws] of [['w1:p1', 'w1'], ['w2:p1', 'w2']]) h.panes.set(id, { id, ws, agent: 'claude' });
  const lead = addSession(b, { sessionId: 'sid-lead', name: 'lead', paneId: 'w1:p1', ws: 'w1' });
  const busy = addSession(b, { sessionId: 'sid-b', name: 'busy', paneId: 'w2:p1', ws: 'w2' });
  applyHerdrStatus(busy.rt, 'working');
  r.add(c, { quiet: true });
  const mover = new Mover(b, { waitMs: 150, pollMs: 20, readyMs: 500 });
  await mover.start({ to: 'hc', confirm: true });
  await mover.job.done;
  const v = mover.view();
  assert.deepEqual(v.rows.map((x) => [x.name, x.result]), [['lead', 'failed'], ['busy', 'skipped']]);
  assert.match(v.rows[1].reason, /busy: working/);
  assert.equal(lead.paneId, 'w1:p1'); // 옛 패널로 돌아왔다
  assert.ok(h.calls.find((x) => x[0] === 'startAgent' && x[1].paneId === 'w1:p1'), 'resumed in the old herdr pane');
  assert.ok(c.calls.find((x) => x[0] === 'closeWorkspace'), 'new hc workspace closed');
  assert.equal(h.calls.some((x) => x[0] === 'closeWorkspace' || x[0] === 'closePane'), false); // 옛 패널은 닫지 않았다
  assert.equal(r.mixed(), true); // herdr에 남은 세션이 있어 떼지 않는다
  assert.equal(v.remaining, 2);
  r.stopEvents();

  // hc를 받지 못함(오프라인): 아무것도 바꾸지 않는다
  const h2 = new FakeTerm('herdr');
  const r2 = new TerminalRouter({ primary: h2 });
  r2.startEvents(() => []);
  await until(() => r2.connected);
  const b2 = fakeBoard(r2);
  h2.panes.set('w1:p1', { id: 'w1:p1', ws: 'w1', agent: 'claude' });
  addSession(b2, { sessionId: 's1', name: 'a', paneId: 'w1:p1', ws: 'w1' });
  const m2 = new Mover(b2);
  m2.ensureTarget = async () => { throw Object.assign(new Error('herdr-core(hc)를 준비하지 못했습니다: offline'), { code: 'hc_unavailable', key: 'terminalMove.err.hcUnavailable' }); };
  await m2.start({ to: 'hc', confirm: true });
  await m2.job.done;
  assert.equal(m2.view().state, 'failed'); assert.equal(m2.view().error.code, 'hc_unavailable');
  assert.equal(r2.backend, 'herdr'); assert.equal(b2.meta.terminalBackend, undefined);
  assert.equal(h2.calls.some((x) => x[0] === 'sendText'), false);
  r2.stopEvents();
});
