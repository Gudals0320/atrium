// P114: herdr-core(hc) 어댑터. herdr/adapter.mjs(HerdrAdapter)와 같은 바깥 모양이라 판(backend.mjs, relay.mjs)이 어느 쪽이든 같은 메서드를 부른다.
// 터미널 백엔드는 숨은 설정 terminalBackend 또는 ATRIUM_TERMINAL_BACKEND로 고른다(terminal-backend.mjs). 기본은 herdr다.
// - 코어: 판 전용 세션(HC_SESSION = 판의 터미널 세션 이름), 고정 버전을 판 폴더에(pin.mjs), 띄우기·다시 띄우기·끄기는 core.mjs
// - 모델: 패널 = hc 터미널(주소), 작업 공간 = 라벨, 에이전트 = 7501 상태의 앱 이름(model.mjs). 이벤트는 herdr 어댑터의 normalizeEvent 모양으로 낸다
// - 화면: 프레임 모드 attach(stream.mjs). 판 클라이언트의 키 패드·글은 attach DATA로 바로 넣는다(terminal.keys는 사람 입력 뒤 3초를 기다린다)
// - 끊김: 코어 재시작(server.restart, hc update)이나 강제 종료 뒤 holder가 코어를 다시 띄우는 동안 프로그램은 산다. 그래서 짧은 끊김(GRACE_MS)은
//   disconnected로 알리지 않고 다시 구독해 그새 바뀐 것만 이벤트로 낸다(herdr의 disconnected는 "서버와 세션이 꺼짐"이라 판이 끊긴 턴으로 표시한다)
// 아직 없는 것(2b 이후): 세션 시작·이어 가기 연결(registerResume은 기록만), 스킬·승인 규칙(skillText는 null), 옛 판 옮기기
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { hcCall, hcSubscribe, hcPipe, HcError, FramedConn, FRAME } from './rpc.mjs';
import { HcModel, LABEL, paneOf, agentInfoOf, findTerminal, workspaceOf, terminalEnv, keysToBytes, hcName, KIND_COMMAND, isLive, CORE_DOWN } from './model.mjs';
import { HC_PIN, ensureHc, hcBinDir, hcExeIn } from './pin.mjs';
import { startCore, upgradeCore, hcConfigHome, writeBoardConfig, hcStateDir, hcCompat, cliVersion, coreEnv } from './core.mjs';
import { HcController } from './stream.mjs';
import { registryPath } from '../herdr/adapter.mjs';
import { psLine } from '../launch.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const GRACE_MS = 8000; // holder가 코어를 다시 띄우는 데 약 4초(P114 1단계)
const BEAT_MS = 45000; // heartbeat는 15초마다. 세 번 못 받으면 끊긴 것으로 본다
const KEY_GAP_MS = 30; // 키 사이 틈(ESC 다음 키가 Alt 조합으로 읽히지 않게)

export class HcAdapter extends EventEmitter {
  constructor({ session, dataDir, logDir, hcPath = null, pipe = null, pin = HC_PIN, env = process.env, fetchImpl, graceMs = GRACE_MS, tested = [HC_PIN.version] }) {
    super();
    if (!session || session === 'default') throw new Error('이름이 지정된 터미널 세션만 사용할 수 있습니다.');
    this.backend = 'hc';
    this.session = session; this.dataDir = dataDir; this.logDir = logDir; this.pin = pin; this.env = env; this.fetchImpl = fetchImpl;
    this.envExe = hcPath; // ATRIUM_HC
    this.exe = hcPath || (dataDir ? hcExeIn(hcBinDir(dataDir)) : null);
    this.exeDir = this.exe ? path.dirname(this.exe) : null;
    this.configHome = dataDir ? hcConfigHome(dataDir) : null;
    this.pipe = pipe || hcPipe(session, env);
    this.graceMs = graceMs; this.policy = { generations: [pin.generation], tested };
    this.connected = false; this.pong = null; this._corePid = null;
    this.model = new HcModel();
    this._watching = false; this._sub = null;
    this._ctls = new Map(); // paneId → Set(HcController)
    this._held = new Map(); // 판이 바꿔 띄우는 중인 터미널의 이벤트(launch 라벨 → 이벤트들)
    this._replaced = new Set(); // 판이 에이전트 터미널로 바꾼 셸 자리(그 끝 이벤트는 내지 않는다)
    this.subscribedPanes = [];
  }
  // 판은 herdrPath로 실행 파일이 있는지 본다(ensureHerdr). hc 실행 파일을 준다. 판이 찾은 herdr 경로는 따로 둔다(쓰지 않는다)
  get herdrPath() { return this.exe; }
  set herdrPath(v) { this.herdrPathHint = v || null; }

  call(method, params = {}, timeoutMs = 15000) { return hcCall(this.pipe, method, params, timeoutMs); }
  log(m) { this.emit('log', m); }

  // ---------- 코어 ----------
  async ping() { return this.call('hello', { generation: this.pin.generation }, 3000); }
  async probe() {
    try {
      const h = await this.ping();
      const st = await this.call('server.status', {}, 3000).catch(() => null);
      if (st) this._corePid = st.pid;
      return { running: true, pong: { type: 'pong', version: h.version, protocol: h.generation, capabilities: { features: h.features || [], core: h.core || null } }, status: st };
    } catch (e) { return { running: false, error: e.code }; }
  }
  checkCompat(pong) { return hcCompat(pong, this.policy); }
  async cliVersion() { return this.exe ? cliVersion({ exe: this.exe, session: this.session, configHome: this.configHome, base: this.env }) : null; }
  async skillText() { return null; } // 스킬·승인 규칙은 2a 밖(판은 herdr 스킬 글로 둔다)
  serverPid() { return this._corePid; }

  // 고정한 hc를 판 폴더에 준비한다(없으면 받는다). 코어가 다른 버전으로 돌면 바꾸지 않고 pending을 남긴다(upgrade가 바꾼다)
  async ensureBinary({ coreRunning = false } = {}) {
    const r = await ensureHc({ dataDir: this.dataDir, pin: this.pin, envExe: this.envExe, coreRunning, fetchImpl: this.fetchImpl, log: (m) => this.log(m) });
    this.exe = r.exe; this.exeDir = r.dir; this.binary = r;
    return r;
  }
  async startServer() {
    const p0 = await this.probe();
    if (p0.running) return { started: false, pong: p0.pong, pid: this._corePid };
    const t0 = Date.now();
    try { await this.ensureBinary(); } catch (e) { throw new HcError(e.code || 'not_found', e.message, 'server'); }
    writeBoardConfig(this.configHome);
    let st;
    try { st = await startCore({ exe: this.exe, session: this.session, configHome: this.configHome, base: this.env }); }
    catch (e) { throw new HcError(e.code || 'start_failed', e.message, 'server'); }
    for (let i = 0; i < 100; i++) {
      const p = await this.probe();
      if (p.running) return { started: true, pong: p.pong, pid: this._corePid || st.pid, ms: Date.now() - t0 };
      await sleep(100);
    }
    throw new HcError('start_failed', 'core did not answer hello in 10s', 'server');
  }
  // 프로그램도 끈다. 판은 사람이 고른 "터미널 모두 끄기"(트레이·herdr.stop)에서만 부른다
  async stopServer() {
    let out = '';
    try { out = JSON.stringify(await this.call('server.stop', {}, 15000)); } catch (e) { out = e.message; }
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) { if (!(await this.probe()).running) return { stopped: true, out }; await sleep(100); }
    return { stopped: false, out };
  }
  // 코어만 다시 띄운다(프로그램은 산다). fresh면 판이 만든 env로(새 PATH 등)
  async restartServer({ fresh = false } = {}) {
    const params = fresh ? { environment: coreEnv(this.env, { session: this.session, configHome: this.configHome }) } : {};
    const r = await this.call('server.restart', params, 30000).catch((e) => ({ error: e.message }));
    for (let i = 0; i < 100; i++) { await sleep(100); const p = await this.probe(); if (p.running) return { restarted: !r.error, pid: this._corePid, result: r }; }
    return { restarted: false, result: r };
  }
  // 고정 버전이 바뀌었으면 새 빌드를 받아 hc update로 바꾼다(코어만 다시 뜬다)
  async upgrade() {
    const running = (await this.probe()).running;
    const r = await this.ensureBinary({ coreRunning: running });
    if (r.source !== 'pending') return { upgraded: false, version: r.version, source: r.source };
    const from = hcExeIn(r.pending.dir);
    const u = await upgradeCore({ exe: this.exe, from, session: this.session, configHome: this.configHome, base: this.env });
    fs.writeFileSync(path.join(this.exeDir, 'VERSION'), this.pin.version + '\n');
    fs.rmSync(r.pending.staging, { recursive: true, force: true });
    return { upgraded: true, from: r.version, to: this.pin.version, result: u };
  }
  async deleteSession() {
    if ((await this.probe()).running) return { deleted: false, reason: 'running' };
    const dir = hcStateDir(this.session, this.env);
    fs.rmSync(dir, { recursive: true, force: true });
    return { deleted: !fs.existsSync(dir), out: dir };
  }
  exists() { return fs.existsSync(hcStateDir(this.session, this.env)); }

  // ---------- 이벤트 ----------
  startEvents() { this._watching = true; this._connectLoop(); }
  stopEvents() { this._watching = false; if (this._sub) this._sub.close(); this._sub = null; clearInterval(this._beatTimer); }
  async refreshSubscription() {} // hc 구독은 터미널을 거르지 않는다(모든 터미널의 이벤트가 온다)

  async _connectLoop() {
    if (this._looping) return;
    this._looping = true;
    let downSince = null;
    try {
      while (this._watching) {
        let closed = null;
        try { ({ closed } = await this._subscribe()); } catch (e) { this.log(`subscribe failed: ${e.code || e.message}`); }
        if (closed) {
          downSince = null;
          if (!this.connected) { this.connected = true; this.emit('connected', this.pong); }
          await closed; // 구독이 끊길 때까지
          if (!this._watching) break;
          this.log('event subscription closed');
          // 코어가 터미널을 끝내고 꺼졌다(서버 끔 등): 짧은 끊김이 아니다. 바로 알린다(판이 끊긴 턴을 표시하고 다시 붙으면 되살린다)
          if (this._coreDown && this.connected) { this._coreDown = false; this.connected = false; this.emit('disconnected'); }
        }
        downSince ||= Date.now();
        if (this.connected && Date.now() - downSince > this.graceMs) { this.connected = false; this.emit('disconnected'); }
        await sleep(this.connected ? 300 : 1000);
      }
    } finally { this._looping = false; }
  }
  // 구독 하나를 연다. 처음(끊긴 뒤 포함)은 조용히 싣고, 짧은 끊김 뒤에는 그새 바뀐 것을 이벤트로 낸다 → { closed: 구독이 끝날 때 풀리는 Promise }
  // (Promise를 그대로 돌려주면 async 함수의 await가 그것까지 기다린다)
  async _subscribe() {
    const p = await this.probe();
    if (!p.running) throw new HcError('unreachable', p.error || 'core not running', 'events.subscribe');
    this.pong = p.pong;
    let onClose;
    const closed = new Promise((r) => { onClose = r; });
    this._lastBeat = Date.now();
    const sub = hcSubscribe(this.pipe, {}, { onMessage: (m) => this._message(m), onClose: () => onClose() });
    const snap = await sub.ready;
    const terms = snap.terminals || [];
    if (this.connected) {
      // 짧은 끊김 뒤: 그새 코어가 터미널을 끝냈으면(서버 끔·재부팅·holder 잃음) herdr 서버가 꺼졌다 뜬 것과 같다. 끊김과 붙음으로 알린다
      const nowLive = new Set(terms.filter(isLive).map((t) => t.address));
      const gone = this.model.live().filter((t) => !nowLive.has(t.address)).map((t) => t.address);
      let down = !!this._coreDown;
      if (!down && gone.length) down = (await this._list(true).catch(() => [])).some((t) => gone.includes(t.address) && CORE_DOWN.has(t.reason));
      if (down) { this._coreDown = false; this.connected = false; this.log('core ended terminals while away; reporting a restart'); this.emit('disconnected'); this.model.load(terms); }
      else this._emitAll(this.model.diff(terms));
    } else { this._coreDown = false; this.model.load(terms); }
    this._sub = sub;
    this.subscribedPanes = this.model.live().map((t) => t.address);
    clearInterval(this._beatTimer);
    this._beatTimer = setInterval(() => { if (Date.now() - this._lastBeat > BEAT_MS) { this.log('no heartbeat; resubscribing'); sub.close(); } }, 5000);
    if (this._beatTimer.unref) this._beatTimer.unref();
    return { closed };
  }
  _message(m) {
    this._lastBeat = Date.now();
    if (m.method === 'event') this._emitAll(this.model.apply(m.params));
    else if (m.method === 'missed') { this.log('events missed; applying fresh snapshot'); this._emitAll(this.model.diff((m.params && m.params.terminals) || [])); }
  }
  _emitAll(events) {
    for (const e of events) {
      if (e.type === 'terminal_finished' && CORE_DOWN.has(e.reason)) this._coreDown = true;
      // 화면 스트림에 넘길 것
      const set = e.paneId && this._ctls.get(e.paneId);
      if (set && ['size', 'pane_restarted', 'terminal_finished', 'pane_closed'].includes(e.type)) for (const c of set) c.onTerminalEvent(e);
      // 판이 바꿔 띄우는 중인 터미널: 판이 pane_moved로 알기 전에는 내지 않는다(모르는 패널로 보고 판에 올리지 않게)
      const t = e.paneId && this.model.terms.get(e.paneId);
      const launch = t && t.labels && t.labels['atrium-launch'];
      if (launch && this._held.has(launch)) { this._held.get(launch).push(e); continue; }
      if (e.paneId && this._replaced.has(e.paneId) && ['pane_exited', 'terminal_finished', 'pane_closed', 'agent_released'].includes(e.type)) continue;
      if (['size', 'pane_restarted', 'pane_lost', 'turn', 'terminal_finished'].includes(e.type)) { this.emit('hc', e); continue; } // 판(herdr 모양)이 모르는 것
      this.emit('event', e);
    }
  }

  // ---------- 작업 공간, 패널, 에이전트 ----------
  async _list(all = false) { return (await this.call('terminal.list', all ? { all: true } : {})).terminals || []; }
  _byAddress(list) { return new Map(list.map((t) => [t.address, t])); }
  async snapshot() {
    const list = await this._list();
    const by = this._byAddress(list);
    const live = list.filter(isLive);
    const panes = live.map((t) => { const p = paneOf(t, by); return { paneId: p.paneId, workspaceId: p.workspaceId, agent: p.agent, status: p.status }; });
    const ws = [...new Set(panes.map((p) => p.workspaceId))].map((w) => { const t = live.find((x) => workspaceOf(x, by) === w); return { workspaceId: w, label: (t && t.labels && t.labels[LABEL.wsLabel]) || null }; });
    return { workspaces: ws, panes };
  }
  // 판이 띄우는 터미널의 env(PATH는 레지스트리 PATH 앞에 판의 hc 폴더, XDG_CONFIG_HOME은 빈 값). P114 2a 관리자 결정
  async paneEnv(extra = {}) {
    const reg = await registryPath().catch(() => null);
    const base = reg || this.env[Object.keys(this.env).find((k) => k.toUpperCase() === 'PATH')] || '';
    return terminalEnv({ exeDir: this.exeDir, basePath: base, extra });
  }
  // 셸 터미널 하나 = 판의 작업 공간 하나(herdr workspace.create와 같은 자리)
  async createWorkspace({ cwd, label, env = {} }) {
    const ws = `hw-${crypto.randomBytes(5).toString('hex')}`;
    const labels = { [LABEL.ws]: ws };
    if (label) labels[LABEL.wsLabel] = String(label).slice(0, 120);
    const r = await this.call('terminal.run', { cwd, env: await this.paneEnv(env), labels, no_parent: true }, 30000);
    return { workspaceId: ws, paneId: r.address };
  }
  // hc가 바라는 띄우기: 에이전트를 터미널의 첫 argv로(셸에 치면 foreground가 셸로 남고, 강제로 끝나면 상태가 남는다. P114 1단계 3번)
  async runAgent({ name = null, argv, cwd, env = {}, labels = {}, workspaceId = null }) {
    const lab = { ...labels };
    if (workspaceId) lab[LABEL.ws] = workspaceId;
    if (name) lab[LABEL.name] = String(name);
    const params = { argv, cwd, env: await this.paneEnv(env), labels: lab, no_parent: true };
    const n = hcName(name);
    if (n) params.name = n;
    return this.call('terminal.run', params, 60000);
  }
  async waitShellReady(paneId, timeoutMs = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const t = await this.readScreen(paneId, { source: 'visible' }).catch((e) => (e.code === 'unreachable' ? Promise.reject(e) : ''));
      if (/PS [^\n]*>/.test(t)) return true;
      await sleep(200);
    }
    return false;
  }
  // herdr agent.start 자리: 판이 createWorkspace로 만든 셸 자리를 에이전트가 첫 argv인 터미널로 바꾸고 pane_moved로 새 패널을 알린다.
  // 새 터미널의 이벤트는 pane_moved를 낸 뒤에 넘긴다(그 전에 판이 모르는 패널로 보고 판에 올리지 않게). 옛 셸 자리의 끝 이벤트는 내지 않는다
  async startAgent({ name, paneId, args = [], kind = 'claude', command = null }) {
    const t = await this.call('terminal.get', { terminal: paneId });
    const by = this.model.terms.size ? this.model.terms : this._byAddress([t]);
    const ws = workspaceOf(t, by);
    const argv = [...(command && command.length ? command : [KIND_COMMAND[kind] || kind]), ...args];
    const launch = crypto.randomBytes(6).toString('hex');
    this._held.set(launch, []);
    let r;
    try {
      r = await this.runAgent({ name, argv, cwd: t.cwd, labels: { ...(t.labels || {}), 'atrium-launch': launch }, workspaceId: ws });
    } catch (e) { this._held.delete(launch); throw e; }
    this._replaced.add(paneId);
    this.emit('event', { type: 'pane_moved', paneId: r.address, workspaceId: ws, previousPaneId: paneId, raw: { hc: 'startAgent', argv } });
    const held = this._held.get(launch) || [];
    this._held.delete(launch);
    for (const e of held) if (e.type !== 'pane_created') this.emit('event', e);
    await this.closePane(paneId).catch((e) => this.log(`close replaced shell ${paneId}: ${e.message}`));
    const info = { name: name || r.name || r.address, paneId: r.address, workspaceId: ws, agent: kind, status: 'unknown', launchPending: true, agentSessionId: null, title: '', cwd: r.cwd || t.cwd, tabId: null };
    return { agent: info, argv: r.argv || argv, replacedPane: paneId };
  }
  // P97 모양: 셸 프롬프트에 명령을 친다(판이 실행 명령을 쓰는 호출자). hc에서는 상태가 셸 안에서 오므로 앱 이름으로 알아본다
  async typeAgent({ name, paneId, args, kind, command, timeoutMs = 60000 }) {
    const argv = [...command, ...args];
    await this.sendText(paneId, psLine(argv));
    await sleep(150);
    await this.paneKeys(paneId, ['enter']);
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const p = await this.getPane(paneId).catch(() => null);
      if (p && p.agent === kind) { if (name) await this.renameAgent(paneId, name); return { agent: await this.getAgent(paneId), argv, typed: true }; }
      await sleep(500);
    }
    throw Object.assign(new HcError('agent_not_detected', `${kind} did not report status in ${paneId} within ${timeoutMs}ms`, 'agent.start'), { argv });
  }
  async getPane(paneId) {
    let t;
    try { t = await this.call('terminal.get', { terminal: paneId }); } catch (e) { if (e.code === 'agent_not_found') e.code = 'pane_not_found'; throw e; }
    if (!isLive(t)) throw new HcError('pane_not_found', `${paneId} is ${t.state}`, 'terminal.get');
    return paneOf(t, this.model.terms.size ? this.model.terms : this._byAddress([t]));
  }
  // herdr의 탭 배치는 없다(판이 배치를 쥔다). 덩어리 자동 붙이기(canvas-ops autoDockSplit)는 이 오류를 기록하고 넘어간다
  async paneLayout() { throw new HcError('not_supported', 'hc has no tab layout', 'pane.layout'); }
  async workspacePanes(workspaceId) {
    const list = await this._list();
    const by = this._byAddress(list);
    return list.filter((t) => isLive(t) && workspaceOf(t, by) === workspaceId).map((t) => ({ paneId: t.address, tabId: null, agent: paneOf(t, by).agent }));
  }
  async agentKinds() {
    if (this._kinds) return this._kinds;
    const where = (k) => new Promise((res) => execFile('where.exe', [k], { encoding: 'utf8', windowsHide: true, timeout: 5000 }, (e, so) => res(e ? null : String(so).split(/\r?\n/)[0].trim() || null)));
    const kinds = Object.keys(KIND_COMMAND);
    const found = await Promise.all(kinds.map(where));
    this._kinds = kinds.map((k, i) => ({ kind: k, installed: !!found[i], path: found[i] }));
    return this._kinds;
  }
  // hc에는 이어 가기 기록이 없다. 판이 쥔 세션 ID로 판이 다시 띄운다(2b). 여기서는 받았다고만 한다
  async registerResume({ paneId, sessionId }) { this.log(`registerResume ignored for ${paneId} (${sessionId}): the board keeps resume records`); return { stored: 'board' }; }
  readResumeRecord() { return { found: false }; }
  async renameAgent(target, name) {
    const list = await this._list();
    const t = findTerminal(list, target);
    if (!t) throw new HcError('agent_not_found', `no terminal ${target}`, 'agent.rename');
    const r = await this.call('terminal.label', { terminal: t.address, labels: { [LABEL.name]: String(name) } });
    return agentInfoOf({ ...t, labels: r.labels || { ...(t.labels || {}), [LABEL.name]: String(name) } }, this._byAddress(list));
  }
  async getAgent(target) {
    try { const list = await this._list(); const t = findTerminal(list, target); return t ? agentInfoOf(t, this._byAddress(list)) : null; }
    catch (e) { if (e.code === 'unreachable') throw e; return null; }
  }
  async listAgents() { const list = await this._list(); const by = this._byAddress(list); return list.filter(isLive).map((t) => agentInfoOf(t, by)).filter(Boolean); }
  async _target(target) {
    const t = findTerminal(await this._list(), target);
    if (!t) throw new HcError('agent_not_found', `no live terminal ${target}`, 'terminal');
    return t;
  }
  // 판의 전달(B1)이 보낼 때를 정한 뒤 부른다. hc는 막힌(blocked) 프로그램에는 force 없이 거부하고(agent_blocked), 사람이 쓰다 만 글이 있으면 최대 60초 기다린다
  async prompt(target, text) {
    const t = await this._target(target);
    if (!(t.status && t.status.app)) throw new HcError('agent_not_found', `${target} runs no agent (no status report)`, 'terminal.send');
    return this.call('terminal.send', { terminal: t.address, text: String(text).replace(/\r\n?/g, '\n') }, 120000);
  }
  async sendKeys(target, keys) { const t = await this._target(target); return this.paneKeys(t.address, keys); }
  // 글을 Enter 없이 넣는다(herdr pane.send_text). 여러 줄이면 bracketed paste로 감싼다
  async sendText(paneId, text) {
    const s = String(text);
    return this._typeRaw(paneId, [/\n/.test(s) ? `\x1b[200~${s}\x1b[201~` : s]);
  }
  // 키 이름 → 바이트를 attach DATA로 바로(키 패드, 답하기). 모르는 키가 있으면 hc의 terminal.keys(조용해질 때까지 기다림)
  async paneKeys(paneId, keys) {
    const bytes = keysToBytes(keys);
    if (!bytes) return this.call('terminal.keys', { terminal: paneId, keys }, 30000);
    return this._typeRaw(paneId, bytes);
  }
  // 붙어 있는 화면 스트림이 있으면 그것으로, 없으면 지금 크기로 잠깐 붙어서 친다(크기를 바꾸지 않는다)
  async _typeRaw(paneId, parts) {
    const ctl = [...(this._ctls.get(paneId) || [])].find((c) => c.exited == null && c.conn && c.ch != null);
    if (ctl) { for (let i = 0; i < parts.length; i++) { if (i) await sleep(KEY_GAP_MS); ctl.input(parts[i]); } return { typed: parts.length, via: 'stream' }; }
    const t = await this.call('terminal.get', { terminal: paneId });
    if (!isLive(t)) throw new HcError('pane_not_found', `${paneId} is ${t.state}`, 'terminal.attach');
    const conn = new FramedConn(this.pipe);
    try {
      await conn.open();
      const r = await conn.call('terminal.attach', { terminal: paneId, cols: t.cols || 120, rows: t.rows || 40, resumed: true });
      conn.claim(r.channel, (f) => { if (f.kind === FRAME.DATA) { const b = Buffer.alloc(4); b.writeUInt32LE(f.payload.length, 0); conn.write(r.channel, FRAME.CREDIT, b); } });
      for (let i = 0; i < parts.length; i++) { if (i) await sleep(KEY_GAP_MS); conn.write(r.channel, FRAME.DATA, Buffer.from(parts[i], 'utf8')); }
      await sleep(50);
      conn.write(r.channel, FRAME.CLOSE);
      return { typed: parts.length, via: 'attach' };
    } finally { setTimeout(() => conn.close(), 100); }
  }
  // 화면 읽기. hc는 화면 + 그 위 기록 줄 수(lines) 한 방식뿐이고 ANSI는 없다(format은 무시한다)
  async readScreen(paneId, { source = 'visible', lines } = {}) {
    const want = source === 'visible' ? 0 : Math.min(Math.max(Number(lines) || 200, 1), 10000);
    const r = await this.call('terminal.read', { terminal: paneId, lines: want });
    const text = (r && r.text) || '';
    if (source === 'visible' || !lines) return text;
    return text.split('\n').slice(-Number(lines)).join('\n');
  }
  async closeWorkspace(workspaceId) {
    const panes = await this.workspacePanes(workspaceId);
    for (const p of panes) await this.closePane(p.paneId);
    return { closed: panes.length };
  }
  // 끝내고 기록도 지운다(herdr에서 패널을 닫으면 없어지는 것과 같게)
  async closePane(paneId) {
    try { await this.call('terminal.kill', { terminal: paneId }, 20000); } catch (e) { if (e.code !== 'agent_not_found') throw e; }
    try { await this.call('terminal.rm', { terminal: paneId }, 10000); } catch {}
    return { closed: true };
  }
  async processInfo(paneId) {
    const t = await this.call('terminal.get', { terminal: paneId });
    const f = t.foreground;
    return { shell_pid: t.pid || null, foreground_processes: f ? [{ pid: f.pid, name: f.name }] : [], cwd: (f && f.cwd) || t.cwd };
  }
  // hc에는 붙은 보는 이 목록이 없다(D3). 판 밖 보는 이가 크기를 가져가면 화면 스트림의 size(external)로 안다
  readClients() { return { available: false, clients: [] }; }

  // ---------- 화면 제어기 ----------
  openController(paneId, cols, rows) {
    const c = new HcController({ pipe: this.pipe, terminal: paneId, cols, rows, log: (m) => this.log(m) });
    if (!this._ctls.has(paneId)) this._ctls.set(paneId, new Set());
    this._ctls.get(paneId).add(c);
    c.once('exit', () => { const s = this._ctls.get(paneId); if (s) { s.delete(c); if (!s.size) this._ctls.delete(paneId); } });
    return c;
  }
}
