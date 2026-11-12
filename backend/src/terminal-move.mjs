// P117: 옛 판 옮기기와 되돌리기(herdr ↔ hc). 사람이 설정 화면의 단추를 누를 때만 돈다(terminal.move).
// 차례:
// 1. 옮길 백엔드를 붙인다(서버를 띄우고, hc는 고정 빌드를 받는다). 못 붙으면 아무것도 바꾸지 않고 끝난다(받기 실패·herdr 없음)
// 2. 판의 주 백엔드를 바꾸고 판 기록(meta terminalBackend)에 남긴다. 그 뒤로 새 세션은 새 백엔드에 뜬다
// 3. 옛 백엔드의 세션을 하나씩 옮긴다. 세션마다 새 백엔드에 같은 대화 ID·이름·env·안내문·연결(판의 줄)로 이어 띄우고, 뜬 것(ready 등)을 본 뒤에만 옛 패널을 닫는다.
//    - 판이 띄운 claude: 옛 패널의 claude를 /exit(한 대화를 두 프로세스가 쓰지 않게. 패널은 셸로 남는다) → 새 백엔드에 작업 공간 → 같은 세션 ID로 이어 가기
//    - 판이 띄운 하네스(codex 등, 이어 가기를 아는 것): 끄고(ctrl+c) → 새 백엔드에서 판의 줄로 이어 가기
//    - 셸: 같은 폴더의 새 셸. 끝난 세션(exited): 남은 셸 자리만 옮긴다
//    - 판에 올린 claude(판이 띄우지 않음): 그 대화 ID로 이어 간다(J1 되살리기와 같은 줄, 사용자 설정). 그 밖의 판에 올린 에이전트와 이어 가기를 모르는 세션은 옮기지 않는다(끝나면 셸로 돌아와 다음 옮기기 때 옮겨진다)
//    - 잠든 세션: 패널이 없다. 잠든 채 두고, 깨면 새 백엔드에서 뜬다
//    - 일하는 중·응답 필요·쓰다 만 글·전달 대기·뒤 일·도는 명령: 끝날 때까지 기다리고(waitMs), 그래도 바쁘면 건너뛰고 알린다
//    실패하면 새 자리를 닫고 옛 패널에서 판의 줄로 다시 이어 간다(그 세션은 옛 백엔드에 남는다). 노드·자리·덩어리·하위 세션 나무·역할 선은 세션 ID에 붙어 그대로다
// 4. 옛 백엔드에 판의 세션이 남지 않았으면 그 백엔드를 떼고, 서버에 패널이 하나도 없을 때만 그 서버를 끈다(도는 서버를 먼저 끄지 않는다)
// 되돌리기(hc → herdr)도 같은 길이다. 연결 알림(setPane의 새 패널 알림)은 보내지 않는다: 에이전트는 이름으로 부르고(atrium prompt), 옮겨도 이름은 같다
import { deriveState, newRuntime } from './state.mjs';
import { paneBackend, makeAdapter, TERMINAL_BACKENDS } from './terminal-backend.mjs';
import { findHerdr } from './herdr/adapter.mjs';
import { convoOf, wakeArgs, sessionActivity, parseExitBackground } from './sleep.mjs';
import { waitClaudeExitOr } from './worktree-exit.mjs';
import { startOpt } from './launchers.mjs';
import { harnessResumable } from './harness.mjs';
import { convOf } from './recall.mjs';
import { keyed } from './msg.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHELL = 'shell';
export const MOVE_WAIT_MS = 10 * 60 * 1000; // 바쁜 세션이 끝나기를 기다리는 시간(기본)
export const MOVE_READY_MS = 90000; // 새 자리에서 준비되기를 기다리는 시간
const READY = new Set(['ready', 'working', 'waiting', 'trust_wait', 'error']);
const apiError = (code, message) => Object.assign(new Error(message), { code });
const otherOf = (b) => (b === 'hc' ? 'herdr' : 'hc');
// rt.move를 빼고 본 상태(옮기는 동안 판에는 starting으로 보인다)
const realState = (rt) => deriveState({ ...rt, move: null }).state;

// 세션 하나를 어떻게 옮길지(순수 함수). x: { paneId, kind, hooked, origin, state, sleeping, harness, adoptedConv, busy }
// → { plan } | { wait: 까닭 } | { skip: 까닭 }
export function movePlan(x) {
  if (x.sleeping) return { plan: 'asleep' };
  if (!x.paneId) return { skip: 'no_pane' };
  if (x.busy) return { wait: x.busy };
  if (x.kind === SHELL) return { plan: 'shell' };
  if (x.state === 'exited') return { plan: 'pane' };
  if (x.kind === 'claude' && x.hooked) return { plan: 'claude' };
  if (x.harness) return { plan: 'harness' };
  if (x.kind === 'claude' && x.adoptedConv) return { plan: 'adopted_claude' };
  return { skip: x.origin === 'adopted' ? 'adopted' : 'not_resumable' };
}

export function attachMove(b, opts = {}) { return new Mover(b, opts); }

export class Mover {
  constructor(b, { waitMs = MOVE_WAIT_MS, readyMs = MOVE_READY_MS, pollMs = 2000 } = {}) {
    this.b = b; this.waitMs = waitMs; this.readyMs = readyMs; this.pollMs = pollMs;
    this.job = null;
    this.last = b.store.getMeta('terminalMove') || null;
    // 옮기다 백엔드가 꺼졌으면 남은 표시를 지운다(그 세션은 옛 자리나 새 자리에 있다. 판이 다시 맞춘다)
    for (const s of b.sessions.values()) if (s.rt && s.rt.move) { delete s.rt.move; b.store.saveRuntime(s.sessionId, s.rt); }
    this.handlers = { 'terminal.status': () => this.status(), 'terminal.move': (p) => this.start(p || {}) };
  }
  router() { return this.b.adapter; }
  // 세션마다 어느 백엔드에 있는가(잠든 세션은 asleep)
  where(s) { return s.paneId ? paneBackend(s.paneId) : s.rt && s.rt.sleep ? 'asleep' : 'none'; }
  counts() {
    const c = { herdr: 0, hc: 0, asleep: 0 };
    for (const s of this.b.sessions.values()) { const w = this.where(s); if (w in c) c[w]++; }
    return c;
  }
  status() {
    const r = this.router();
    return { backend: r.backend, backends: r.view ? r.view() : [{ backend: r.backend, primary: true, connected: r.connected }], sessions: this.counts(), job: this.view(), last: this.last, decided: this.b.store.getMeta('terminalBackend') || null, forced: !!(r.backendPick && r.backendPick.source === 'env') };
  }
  view(j = this.job) {
    if (!j) return null;
    const by = (k) => j.rows.filter((x) => x.result === k).length;
    return { id: j.id, to: j.to, from: j.from, state: j.state, startedAt: j.startedAt, endedAt: j.endedAt || null, error: j.error || null, rows: j.rows.map((x) => ({ ...x })), moved: by('moved'), asleep: by('asleep'), waiting: by('waiting'), skipped: by('skipped'), failed: by('failed'), remaining: j.remaining ?? null };
  }
  emit() { this.b.api.broadcast('terminal.move', this.view()); }
  // 판이 어떻게 옮길지 미리 본다(바꾸지 않는다)
  info(s) {
    const b = this.b;
    const sl = b.sleeper ? b.sleeper.info(s) : { state: deriveState(s.rt).state };
    const state = deriveState(s.rt).state;
    let busy = null;
    if (s.kind === SHELL) busy = state === 'shell_running' ? 'running' : null;
    else if (state !== 'exited') busy = sessionActivity({ ...sl, state, childBusy: false, parentBusy: false, viewed: false }, { mode: 'hand' });
    if (!busy && b.sleeper && (b.sleeper.going.has(s.sessionId) || b.sleeper.wakes.has(s.sessionId))) busy = 'waking';
    if (!busy && b.killing.has(s.sessionId)) busy = 'closing';
    const conv = s.kind === 'claude' && !b.hooked(s) ? convOf(s) : null;
    return { name: s.name, paneId: s.paneId, kind: s.kind || 'claude', hooked: b.hooked(s), origin: s.origin, state, sleeping: !!s.rt.sleep, harness: !b.hooked(s) && s.kind !== SHELL && harnessResumable(s), adoptedConv: !!(conv && b.recall && b.recall.transcriptExists(conv, s.rt.cwd || s.cwd)), busy };
  }
  // terminal.move { to, confirm, waitMs }. confirm 없이 부르면 계획만 돌려준다
  async start(p) {
    const to = String(p.to || '').trim().toLowerCase();
    if (!TERMINAL_BACKENDS.includes(to)) throw apiError('bad_request', `옮길 터미널 백엔드: ${TERMINAL_BACKENDS.join(' | ')}`);
    const r = this.router();
    if (r.backendPick && r.backendPick.source === 'env') throw keyed(apiError('forced', 'ATRIUM_TERMINAL_BACKEND로 백엔드를 정해 띄운 판은 옮기지 않습니다.'), 'terminalMove.err.forced');
    if (this.job && !this.job.endedAt) throw keyed(apiError('busy', '터미널 백엔드를 옮기는 중입니다.'), 'terminalMove.err.busy');
    const list = [...this.b.sessions.values()].filter((s) => this.where(s) !== to);
    const plan = list.map((s) => ({ name: s.name, sessionId: s.sessionId, kind: s.kind || 'claude', ...movePlan(this.info(s)) }));
    if (!p.confirm) return { needsConfirm: true, to, from: r.backend, plan, sessions: this.counts() };
    const job = this.job = { id: Date.now().toString(36), to, from: r.backend === to ? otherOf(to) : r.backend, state: 'preparing', startedAt: Date.now(), rows: plan.map((x) => ({ name: x.name, sessionId: x.sessionId, kind: x.kind, result: 'pending', plan: x.plan || null, reason: x.wait || x.skip || null })), waitMs: Math.max(0, Math.min(Number(p.waitMs ?? this.waitMs), 60 * 60 * 1000)) };
    this.emit();
    job.done = this.run(job).catch((e) => { job.error = { code: e.code || 'error', message: e.message, key: e.key || null, vars: e.vars || null }; }).finally(() => {
      job.state = job.error ? 'failed' : 'done'; job.endedAt = Date.now();
      for (const row of job.rows) if (row.result === 'pending' || row.result === 'moving') Object.assign(row, { result: 'skipped', reason: 'not_started' }); // 시작 전에 멈춘 옮기기
      job.remaining = [...this.b.sessions.values()].filter((s) => s.paneId && paneBackend(s.paneId) !== this.router().backend).length;
      this.last = this.view(job);
      this.b.store.setMeta('terminalMove', this.last);
      this.b.store.addEvent(null, 'terminal_move', { to: job.to, from: job.from, error: job.error, moved: this.last.moved, skipped: this.last.skipped, failed: this.last.failed, remaining: job.remaining, ms: job.endedAt - job.startedAt });
      this.b.log(`terminal move to ${job.to}: ${job.error ? `failed ${job.error.code}` : 'done'} moved=${this.last.moved} skipped=${this.last.skipped} failed=${this.last.failed} remaining=${job.remaining}`);
      this.emit();
    });
    return { started: true, job: this.view() };
  }

  // 옮길 백엔드를 붙인다(서버를 띄우고 붙을 때까지). 이미 붙어 있으면 그대로
  async ensureTarget(to) {
    const b = this.b, r = this.router();
    let a = r.get(to);
    if (!a) {
      let cfg = b.cfg;
      if (to === 'herdr') {
        const found = b.cfg.herdrPath ? { path: b.cfg.herdrPath } : await findHerdr({ envPath: b.cfg.herdrEnvPath, settingPath: b.herdrSettingPath ? b.herdrSettingPath() : '' }).catch(() => ({ path: null }));
        if (!found.path) throw keyed(apiError('herdr_missing', 'herdr를 찾지 못해 되돌릴 수 없습니다. herdr를 설치하거나 설정에서 herdr 경로를 지정하세요.'), 'terminalMove.err.herdrMissing');
        cfg = { ...b.cfg, herdrPath: found.path };
        b.cfg.herdrPath ||= found.path;
      }
      a = makeAdapter(to, cfg);
    }
    const p0 = await a.probe();
    if (!p0.running) {
      try { await a.startServer(); }
      catch (e) {
        if (to === 'hc') throw keyed(apiError('hc_unavailable', `herdr-core(hc)를 준비하지 못했습니다: ${e.message}. 판은 지금 백엔드에 그대로 있습니다.`), 'terminalMove.err.hcUnavailable', { error: e.message });
        throw keyed(apiError('start_failed', `${to} 서버를 띄우지 못했습니다: ${e.message}`), 'terminalMove.err.startFailed', { backend: to, error: e.message });
      }
    }
    const p = await a.probe();
    const compat = a.checkCompat(p.pong);
    if (!compat.ok) throw keyed(apiError('incompatible', `${to}가 호환되지 않습니다: ${(compat.problems || []).join('; ')}`), 'terminalMove.err.incompatible', { backend: to, problems: (compat.problems || []).join('; ') });
    if (!r.get(to)) r.add(a, { quiet: true });
    for (const t = Date.now(); !a.connected && Date.now() - t < 20000;) await sleep(100);
    if (!a.connected) throw keyed(apiError('unreachable', `${to} 서버에 붙지 못했습니다.`), 'terminalMove.err.startFailed', { backend: to, error: 'events not connected' });
    return a;
  }

  async run(job) {
    const b = this.b, r = this.router();
    await this.ensureTarget(job.to);
    if (r.backend !== job.to) {
      r.setPrimary(job.to);
      b.store.setMeta('terminalBackend', { backend: job.to, by: 'move', from: job.from, at: Date.now() });
      if (b.onTerminalPrimaryChanged) await b.onTerminalPrimaryChanged(job.to);
    }
    job.state = 'moving'; this.emit();
    const rows = new Map(job.rows.map((x) => [x.sessionId, x]));
    const until = Date.now() + job.waitMs;
    let pending = [...rows.values()];
    while (pending.length) {
      const next = [];
      for (const row of pending) {
        const s = b.sessions.get(row.sessionId);
        if (!s) { Object.assign(row, { result: 'skipped', reason: 'closed' }); continue; }
        if (this.where(s) === job.to) { Object.assign(row, { result: 'moved', reason: 'already' }); continue; }
        const plan = movePlan(this.info(s));
        if (plan.wait) { Object.assign(row, { result: 'waiting', reason: plan.wait }); next.push(row); continue; }
        if (plan.skip) { Object.assign(row, { result: 'skipped', reason: plan.skip }); continue; }
        if (plan.plan === 'asleep') { Object.assign(row, { result: 'asleep', plan: 'asleep', reason: null }); continue; }
        Object.assign(row, { result: 'moving', plan: plan.plan, reason: null }); this.emit();
        const t0 = Date.now();
        try { const out = await this.moveOne(s, plan.plan, job.to); Object.assign(row, { result: out.result, reason: out.reason || null, ms: Date.now() - t0 }); }
        catch (e) { Object.assign(row, { result: 'failed', reason: e.code || e.message, ms: Date.now() - t0 }); }
        this.emit();
      }
      if (!next.length || Date.now() > until) { for (const row of next) Object.assign(row, { result: 'skipped', reason: `busy: ${row.reason}` }); break; }
      pending = next;
      this.emit();
      await sleep(this.pollMs);
    }
    // 옛 백엔드에 판의 세션이 남지 않았으면 떼고, 그 서버에 패널이 없을 때만 끈다
    const from = otherOf(job.to);
    const left = [...b.sessions.values()].filter((s) => s.paneId && paneBackend(s.paneId) === from);
    const old = r.get(from);
    if (old && !left.length) {
      let panes = null;
      try { panes = (await old.snapshot()).panes.length; } catch {}
      r.remove(from);
      if (panes === 0) { const st = await old.stopServer().catch((e) => ({ stopped: false, out: e.message })); job.stoppedOld = { backend: from, stopped: !!st.stopped }; }
      else job.stoppedOld = { backend: from, stopped: false, panes };
    }
  }

  // ---------- 세션 하나 ----------
  async moveOne(s, plan, to) {
    const b = this.b;
    const old = { paneId: s.paneId, ws: s.herdrWorkspaceId, rt: s.rt };
    s.rt.move = { to, at: Date.now(), plan };
    b.broadcastSession(s, { cause: `move:${to}` });
    b.killing.add(s.sessionId); // 판이 닫는 옛 패널: "판 밖에서 닫음"으로 보지 않는다. 판에 올린 에이전트를 셸로 내리지 않는다
    let created = null, stopped = false;
    const steps = [];
    try {
      // 1. 옛 패널의 에이전트를 끈다(패널은 남는다)
      if (plan === 'claude' || plan === 'adopted_claude') { stopped = await this.exitClaude(s, steps); }
      else if (plan === 'harness') { stopped = await b.stopHarnessAgent(s, steps); if (!stopped) throw apiError('still_running', `${s.kind} did not stop`); }
      // 2. 새 백엔드에 작업 공간(판이 만드는 패널이라 판에 올리지 않는다)
      created = await b.withNewPane(() => b.adapter.createWorkspace({ backend: to, cwd: plan === 'shell' && s.rt.cwd ? s.rt.cwd : s.cwd, label: s.name }), (x) => b.setPane(s, x.paneId, x.workspaceId, `moved to ${to}`, { quiet: true }));
      try { b.relay.detach(s.sessionId); } catch {}
      steps.push(`${to} workspace ${created.workspaceId}`);
      const shellReady = await b.adapter.waitShellReady(s.paneId, 15000);
      // 3. 같은 줄로 띄우고 뜬 것을 본다
      if (plan === 'shell' || plan === 'pane') {
        if (!shellReady) throw apiError('shell_not_ready', 'new shell did not show a prompt');
        if (plan === 'shell') {
          const rt = newRuntime({ kind: SHELL, hooked: false });
          rt.phase = 'running'; rt.cwd = s.rt.cwd; rt.move = s.rt.move;
          s.rt = rt; s.agentName = s.paneId;
          b.store.updateSession(s.sessionId, { agentName: s.agentName, runtime: rt });
        }
      } else {
        this.resetForLaunch(s);
        if (plan === 'claude') {
          const { args } = wakeArgs(b.launchOf(s), convoOf(s, b.cfg.claudeProjects));
          await b.adapter.startAgent({ name: s.agentName, paneId: s.paneId, args, ...startOpt(s) });
          b.registerResume(s);
        } else if (plan === 'harness') await b.startHarness(s, { resume: true, why: 'move' });
        else if (plan === 'adopted_claude') await b.recall.resumeHookless(s, 'move');
        await this.waitReady(s);
      }
      // 4. 옛 자리를 닫는다
      await this.closeOld(s, old, steps);
      delete s.rt.move;
      b.store.addEvent(s.sessionId, 'terminal_moved', { to, plan, from: paneBackend(old.paneId), oldPane: old.paneId, newPane: s.paneId, steps });
      b.broadcastSession(s, { cause: `moved:${to}` });
      return { result: 'moved' };
    } catch (e) {
      steps.push(`failed: ${e.code || e.message}`);
      await this.rollback(s, plan, old, created, stopped, steps).catch((x) => steps.push(`rollback failed: ${x.code || x.message}`));
      delete s.rt.move;
      b.store.addEvent(s.sessionId, 'terminal_move_failed', { to, plan, error: e.code || e.message, steps });
      b.broadcastSession(s, { cause: 'move:failed' });
      return { result: 'failed', reason: e.code || e.message };
    } finally { b.killing.delete(s.sessionId); }
  }
  resetForLaunch(s) {
    const rt = s.rt;
    rt.exit = null; rt.phase = 'starting'; rt.launchedAt = Date.now(); rt.hooksSinceLaunch = 0; rt.sessionEnd = null; rt.pendingAsk = null; rt.exitRequested = false;
    rt.herdr = { status: null, launchPending: true, agentSessionId: null, present: false, at: Date.now() };
  }
  // claude를 /exit로 끈다(잠재우기와 같은 확인: 워크트리 나가기 질문은 남기기, 뒤 일 확인 창이면 Esc로 닫고 실패)
  async exitClaude(s, steps) {
    const b = this.b;
    if (!s.rt.herdr.present) return true;
    s.rt.exitRequested = true;
    await b.adapter.sendText(s.paneId, '/exit'); await sleep(150); await b.adapter.paneKeys(s.paneId, ['enter']);
    const w = await waitClaudeExitOr(b, s, b.cfg.killWaitMs, { by: 'move', steps, stopOn: parseExitBackground });
    if (w.stopped || s.rt.herdr.present) {
      if (b.sleeper) await b.sleeper.restoreAfterExit(s, !!w.stopped).catch(() => {});
      s.rt.exitRequested = false;
      throw apiError(w.stopped ? 'background' : 'still_running', w.stopped ? 'background work is running' : 'claude did not exit after /exit');
    }
    return true;
  }
  async waitReady(s) {
    const t0 = Date.now();
    while (Date.now() - t0 < this.readyMs) {
      if (!this.b.sessions.has(s.sessionId)) throw apiError('closed', 'session closed while moving');
      if (s.rt.exit) throw apiError('resume_failed', `exited right after resume (${s.rt.exit.kind})`);
      const st = realState(s.rt);
      if (READY.has(st) && (s.rt.herdr.present || s.kind === SHELL)) return st;
      await sleep(200);
    }
    throw apiError('timeout', `not ready in ${Math.round(this.readyMs / 1000)}s`);
  }
  // 옛 자리를 닫는다. 그 작업 공간을 다른 판 세션이 쓰지 않으면 작업 공간째(hc에서 에이전트가 끝나 남은 셸까지), 쓰면 이 세션의 패널만(남은 셸을 따라가 함께)
  async closeOld(s, old, steps) {
    const b = this.b;
    const cur = b.adapter.follow ? await b.adapter.follow(old.paneId).catch(() => old.paneId) : old.paneId;
    const shared = [...b.sessions.values()].some((x) => x !== s && x.herdrWorkspaceId === old.ws && x.paneId && paneBackend(x.paneId) === paneBackend(old.paneId));
    if (!shared) { await b.adapter.closeWorkspace(old.ws); steps.push(`old workspace ${old.ws} closed`); return; }
    for (const id of new Set([cur, old.paneId])) await b.adapter.closePane(id).then(() => steps.push(`old pane ${id} closed`)).catch(() => {});
  }
  // 새 자리를 닫고 옛 패널로 돌아간다. 에이전트를 껐으면 옛 패널에서 판의 줄로 다시 이어 간다(그 세션은 옛 백엔드에 남는다)
  async rollback(s, plan, old, created, stopped, steps) {
    const b = this.b;
    if (!b.sessions.has(s.sessionId)) return;
    if (created) {
      if (s.rt.herdr.present && (plan === 'claude' || plan === 'adopted_claude')) { await b.adapter.sendText(s.paneId, '/exit').catch(() => {}); await sleep(150); await b.adapter.paneKeys(s.paneId, ['enter']).catch(() => {}); for (const t = Date.now(); s.rt.herdr.present && Date.now() - t < 5000;) await sleep(200); }
      if (s.rt.herdr.present && plan === 'harness') await b.stopHarnessAgent(s, steps).catch(() => {});
      await b.adapter.closeWorkspace(created.workspaceId).catch(() => {});
      steps.push(`new workspace ${created.workspaceId} closed`);
    }
    const back = b.adapter.follow ? await b.adapter.follow(old.paneId).catch(() => old.paneId) : old.paneId; // hc: 에이전트가 끝나 그 자리에 남은 셸
    if (s.paneId !== back) await b.setPane(s, back, old.ws, 'move failed', { quiet: true });
    try { b.relay.detach(s.sessionId); } catch {}
    if (plan === 'shell' || plan === 'pane') { s.rt = old.rt; s.agentName = plan === 'shell' ? old.paneId : s.agentName; b.store.updateSession(s.sessionId, { agentName: s.agentName, runtime: s.rt }); return; }
    if (!stopped) return; // 에이전트를 끄기 전에 실패했다(그대로 돈다)
    this.resetForLaunch(s);
    await b.adapter.waitShellReady(s.paneId, 8000);
    if (plan === 'claude') { const { args } = wakeArgs(b.launchOf(s), convoOf(s, b.cfg.claudeProjects)); await b.adapter.startAgent({ name: s.agentName, paneId: s.paneId, args, ...startOpt(s) }); b.registerResume(s); }
    else if (plan === 'harness') await b.startHarness(s, { resume: true, why: 'move_back' });
    else if (plan === 'adopted_claude') await b.recall.resumeHookless(s, 'move_back');
    steps.push('resumed in the old pane');
  }
}
