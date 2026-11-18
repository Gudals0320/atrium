// P183: rig 도구(하네스 2단계, docs research harness-arch.md 13절 "도구(2단계)"). atrium tool의 판 쪽.
// - 정의: 워크스페이스 뿌리 .atrium/rig.json의 tools({ "<이름>": { run, desc?, timeoutMs?, parallel? } }). 켜진 워크스페이스의 판이 띄운 세션이면 누구나 부른다
//   (자리별 허락은 3단계). 꺼졌거나 정의가 없으면 까닭과 함께 거절(rig_off).
// - 순서: tool-before 훅(통과·거절·인자 고치기) → 실행 → tool-after 훅(기록, 에이전트에게 돌려줄 출력 끝에 덧붙이기). 훅은 P182 실행기, 기록도 rig_hook_runs(tool_run_id).
// - 실행: run 뒤에 인자를 붙여 셸 없이 띄운다. 작업 폴더는 부른 세션의 폴더(워크트리면 워크트리). 환경은 깨끗한 환경(proc-env.mjs)에
//   ATRIUM_UNIT_ID·ATRIUM_TRY_ID·ATRIUM_SESSION_NAME·ATRIUM_WORKSPACE_ROOT. run[0]이 .cmd·.bat으로 풀리면 cmd.exe를 거치므로
//   에이전트가 준 인자와 tool-before가 고친 인자에 [A-Za-z0-9 _.,:=/@+-] 밖의 글자가 하나라도 있으면 거절(cmd.exe 해석을 확실히 막을 수 없다).
// - 판(백엔드)이 프로세스를 쥔다. stdout·stderr를 데이터 폴더 tool-runs/<실행 ID>.log에 50MB까지 쓰고(넘으면 그 뒤는 버리고 끝까지 돌린다), 쓴 바이트의 SHA-256을 남긴다.
//   시간 제한(정의 timeoutMs, 기본 30분, 상한 6시간)을 넘으면 프로세스 나무째 끈다(timeout). 백엔드가 다시 뜨면 돌던 실행은 lost.
// - 세션마다 한 번에 하나(parallel: true인 도구는 다른 실행과 함께 돈다). 명령은 100초까지 기다리고, 끝나지 않았으면 실행 ID를 돌려준다(CLI 종료 코드 3).
// - 장부 tool_runs(store-rig.mjs): 에이전트가 보고하지 않아도 판이 쌓는다. atrium items가 일마다 도구 실행 수를 보인다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findExe, spawnPlan, killTree } from './hook-runner.mjs';
import { cleanEnv } from './proc-env.mjs';
import { sessionInfo, TOOL_RUN_HINT } from './rig.mjs';
import { shownName } from './session-label.mjs';
import { rigEvent } from './rig-ledger.mjs'; // P217: 장부(tool_start·tool_end)

export const TOOL_WAIT_MS = 100000;
export const TOOL_LOG_MAX = 50 * 1024 * 1024;
export const TOOL_TAIL_LINES = 40;
export const TOOL_TAIL_CHARS = 4000;
// .cmd·.bat 도구에 줄 수 있는 인자 글자(@fable-peer 조건)
export const CMD_SAFE_ARG = /^[A-Za-z0-9 _.,:=/@+\-]*$/;
const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }

// 정의의 run 낱말 가운데 뿌리 기준 상대 경로(슬래시가 있고 뿌리 아래에 있는 파일)는 절대 경로로. 작업 폴더가 세션 폴더(워크트리)라도
// 도구 스크립트는 정의가 있는 본 체크아웃의 것을 쓴다(정의 검사와 같은 기준). 에이전트가 준 인자는 건드리지 않는다
export function rootedRun(run, root) {
  const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
  return run.map((w, i) => {
    if (path.isAbsolute(w) || w.startsWith('-') || !/[\\/]/.test(w)) return w;
    const f = path.resolve(root, w);
    if (isFile(f)) return f;
    if (i === 0) for (const e of ['.exe', '.cmd', '.bat', '.com']) if (isFile(f + e)) return f + e;
    return w;
  });
}
// 로그 파일 끝(마지막 줄들) → 글
export function readTail(file, { lines = TOOL_TAIL_LINES, chars = TOOL_TAIL_CHARS } = {}) {
  if (!file) return '';
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const n = Math.min(size, chars * 4);
    const buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, size - n);
    let s = buf.toString('utf8');
    if (n < size) s = s.replace(/^[^\n]*\n/, ''); // 잘린 첫 줄은 뺀다
    s = s.split(/\r?\n/).slice(-lines - 1).join('\n');
    return s.length > chars ? s.slice(-chars) : s;
  } catch { return ''; } finally { if (fd != null) try { fs.closeSync(fd); } catch {} }
}
// .cmd·.bat 도구의 인자 검사 → 걸린 인자 | null
export const badCmdArg = (args) => (args || []).find((a) => !CMD_SAFE_ARG.test(String(a))) ?? null;

export class ToolRuns {
  // b: 백엔드(store, sessions, rig, cfg.dataDir, log). opts: waitMs(명령이 기다리는 시간), logMax, env(시험용), platform
  constructor(b, { waitMs = TOOL_WAIT_MS, logMax = TOOL_LOG_MAX, env = null, platform = process.platform } = {}) {
    this.b = b; this.waitMs = waitMs; this.logMax = logMax; this.envOverride = env; this.platform = platform;
    this.live = new Map(); // 실행 ID → { id, sessionId, tool, parallel, child, done: Promise }
    // 백엔드가 다시 떴다: 지난번에 돌던 실행은 판이 더 쥐지 않는다
    try { const n = b.store.loseRunningToolRuns(); if (n && b.log) b.log(`tool runs lost on start: ${n}`); } catch {}
  }
  store() { return this.b.store; }
  dir() { return path.join(this.b.cfg.dataDir, 'tool-runs'); }

  // 부르는 세션의 워크스페이스에 켜진 rig와 도구가 있는가 → 읽기 결과. 아니면 까닭과 함께 던진다
  gate(caller) {
    const rig = this.b.rig; const key = caller.workspaceKey;
    if (!rig || !key) throw apiError('rig_off', '이 세션의 워크스페이스에는 rig가 없다(도구 없음).');
    const r = rig.read(key);
    if (!r.present) throw apiError('rig_off', `이 워크스페이스에는 rig 정의(${'.atrium/rig.json'})가 없다(도구 없음).`);
    if (!rig.enabled(key)) throw apiError('rig_off', '이 워크스페이스의 rig는 사람이 켜지 않았다(꺼진 동안 도구는 돌지 않는다). 사람에게 보드의 영역 이름표 메뉴에서 켜 달라고 한다.');
    if (!r.def) throw apiError('rig_off', `rig 정의가 잘못돼 쓰지 않는다: ${r.invalid || '?'}`);
    if (!r.def.tools || !Object.keys(r.def.tools).length) throw apiError('rig_off', 'rig 정의에 도구(tools)가 없다.');
    // P185: 자리 세션은 그 자리의 tools만(정의 seats.<자리>.tools, 없으면 모두)
    const flow = this.b.branch && this.b.branch.flow;
    const ctx = flow ? flow.seatCtx(caller) : null;
    if (ctx && ctx.seat.tools) return { ...r, def: { ...r.def, tools: Object.fromEntries(Object.entries(r.def.tools).filter(([k]) => ctx.seat.tools.includes(k))) }, seatTools: ctx.seat.tools, seat: ctx.name };
    return r;
  }

  // atrium tool(목록과 설명)
  list(caller) {
    const r = this.gate(caller);
    const running = [...this.live.values()].filter((x) => x.sessionId === caller.sessionId).map((x) => ({ id: x.id, tool: x.tool }));
    return { workspace: caller.workspaceKey, root: r.root, hash: r.hash, invalid: r.invalid || null, tools: Object.values(r.def.tools).map((x) => ({ name: x.name, desc: x.desc, run: x.run, timeoutMs: x.timeoutMs, parallel: x.parallel })), running };
  }

  // atrium tool <이름> [인자…] → { run } (끝났으면 종료 코드·꼬리·덧붙인 글, 아니면 running)
  async run(caller, o = {}) {
    const st = this.store(); const rig = this.b.rig;
    const r = this.gate(caller);
    const name = String(o.tool || '');
    const tool = r.def.tools[name];
    if (!tool) throw apiError('unknown_tool', r.seat && this.b.rig.read(caller.workspaceKey).def.tools[name] ? `rig의 ${r.seat} 자리는 도구 ${name}를 쓰지 못한다. 이 자리의 도구: ${r.seatTools.join(', ') || '(없음)'}` : `rig에 도구 ${name || '(이름 없음)'}가 없다. 있는 도구: ${Object.keys(r.def.tools).join(', ')}`);
    // P188: 사람만 고치는 파일의 해시가 사람이 넣을 때와 다르면 도구를 돌리지 않는다(알림: 관리자 자리와 사람). 장부에 rejected로 남긴다
    const changed = rig.changedFiles ? rig.changedFiles(caller.workspaceKey) : [];
    if (changed.length) {
      const why = `사람만 고치는 파일이 사람이 승인한 때와 달라 rig 도구를 돌리지 않는다: ${changed.map((x) => `${x.path}${x.got ? '' : '(없음)'}`).join(', ')}. 그 파일을 되돌리거나 사람에게 보드의 rig 메뉴에서 다시 승인해 달라고 한다.`;
      const tr0 = st.openTryOf(caller.sessionId);
      const rid = 'tr' + crypto.randomBytes(5).toString('hex');
      st.insertToolRun({ id: rid, sessionId: caller.sessionId, workspaceKey: caller.workspaceKey, unitId: tr0 ? tr0.unitId : null, tryId: tr0 ? tr0.id : null, tool: name, argv: tool.run, args: Array.isArray(o.args) ? o.args.map(String) : [], cwd: null, rigHash: r.hash, status: 'rejected', startedAt: Date.now(), endedAt: Date.now(), hooks: [], error: 'rig_protected' });
      { this.toolEvent('tool_end', { id: rid, workspaceKey: caller.workspaceKey, sessionId: caller.sessionId, unitId: tr0 ? tr0.unitId : null, tryId: tr0 ? tr0.id : null }, tr0 ? { id: tr0.unitId } : null, { value: 'rejected', text: `${name}: 사람만 고치는 파일이 바뀌었다`, data: { tool: name, why: 'rig_protected' } }); }
      rig.alert(caller.workspaceKey, { kind: 'file', items: changed.map((x) => x.path), hash: changed.map((x) => x.got || 'missing').join(','), reason: why });
      throw apiError('rig_protected', why, { files: changed.map((x) => x.path) });
    }
    const given = Array.isArray(o.args) ? o.args.map(String) : [];
    if (!tool.parallel) {
      const busy = [...this.live.values()].find((x) => x.sessionId === caller.sessionId);
      if (busy) throw apiError('tool_busy', `이 세션의 도구 실행 ${busy.id}(${busy.tool})이 아직 돈다. 세션마다 한 번에 하나다. 기다리기: atrium tool --wait ${busy.id}`, { runId: busy.id });
    }
    const info = sessionInfo(caller);
    const cwd = info.cwd && fs.existsSync(info.cwd) ? info.cwd : r.root;
    const tr = st.openTryOf(caller.sessionId);
    const unit = tr ? st.getUnit(tr.unitId) : null;
    const env = { ...(this.envOverride || cleanEnv(process.env)), ATRIUM_UNIT_ID: tr ? tr.unitId : '', ATRIUM_TRY_ID: tr ? tr.id : '', ATRIUM_SESSION_NAME: shownName(caller) || caller.name || '', ATRIUM_WORKSPACE_ROOT: r.root };
    const runWords = rootedRun(tool.run, r.root);
    const exe = findExe(runWords[0], { cwd, env, platform: this.platform });
    const viaCmd = this.platform === 'win32' && !!exe && /\.(cmd|bat)$/i.test(exe);
    const cmdRefuse = (a, who) => apiError('cmd_args', `도구 ${name}는 .cmd·.bat(${path.basename(exe)})이라 cmd.exe를 거친다. ${who} 인자에 쓸 수 없는 글자가 있다: ${JSON.stringify(String(a).slice(0, 80))}. 쓸 수 있는 글자: A-Z a-z 0-9 빈칸 _ . , : = / @ + -. ${TOOL_RUN_HINT}`);
    if (viaCmd) { const bad = badCmdArg(given); if (bad != null) throw cmdRefuse(bad, '준'); }
    const id = 'tr' + crypto.randomBytes(5).toString('hex');
    const startedAt = Date.now();
    const base = { id, sessionId: caller.sessionId, workspaceKey: caller.workspaceKey, unitId: unit ? unit.id : null, tryId: tr ? tr.id : null, tool: name, cwd, rigHash: r.hash, startedAt };
    const hctx = { key: caller.workspaceKey, session: info, from: { kind: 'agent', session: info }, unit: unit ? { id: unit.id, from: unit.from, spec: unit.spec, origin: unit.origin } : null, try: tr ? { id: tr.id, startedAt: tr.startedAt } : null, tool: name, toolRunId: id, match: (h) => !h.tool || h.tool === name };
    // tool-before 관문
    let args = given; const hooks = [];
    if (r.def.hooks.some((h) => h.at === 'tool-before')) {
      const hb = await rig.runAt(r, { ...hctx, at: 'tool-before', args: given });
      hooks.push(...hb.runs);
      if (hb.action === 'reject') {
        st.insertToolRun({ ...base, argv: tool.run, args: given, status: 'rejected', endedAt: Date.now(), hooks, error: hb.reason });
        this.toolEvent('tool_end', base, unit, { value: 'rejected', text: `${name}: ${hb.reason || '거절'}`, data: { tool: name } });
        st.addEvent(caller.sessionId, 'tool_rejected', { runId: id, tool: name, reason: hb.reason });
        throw apiError('rig_rejected', `rig의 tool-before 훅이 도구 ${name} 실행을 거절했다: ${hb.reason}`, { runId: id });
      }
      args = hb.args || given;
    }
    if (viaCmd) { const bad = badCmdArg(args); if (bad != null) { st.insertToolRun({ ...base, argv: tool.run, args, argsGiven: given, status: 'rejected', endedAt: Date.now(), hooks, error: 'cmd_args' }); throw cmdRefuse(bad, 'tool-before 훅이 고친'); } }
    const argsGiven = JSON.stringify(args) !== JSON.stringify(given) ? given : null;
    const argv = [...tool.run, ...args];
    const logPath = path.join(this.dir(), `${id}.log`);
    st.insertToolRun({ ...base, argv, args, argsGiven, status: 'running', logPath, hooks });
    st.addEvent(caller.sessionId, 'tool_run', { runId: id, tool: name, args, rigHash: r.hash });
    this.toolEvent('tool_start', base, unit, { value: 'running', text: `${name}${args.length ? ' ' + args.join(' ') : ''}`, data: { tool: name } });
    this.b.log && this.b.log(`tool ${name} ${id} by ${caller.name}: ${argv.join(' ')}`);
    const done = this.exec({ id, argv: [...runWords, ...args], cwd, env, tool, logPath }).then((res) => this.finish({ id, r, hctx, tool, args, startedAt, logPath, hooks, res }))
      .catch((e) => { try { st.updateToolRun(id, { status: 'error', endedAt: Date.now(), error: String(e && e.message || e) }); } catch {} })
      .finally(() => this.live.delete(id));
    this.live.set(id, { id, sessionId: caller.sessionId, tool: name, parallel: tool.parallel, done });
    return this.waitFor(id, o.waitMs != null ? Number(o.waitMs) : this.waitMs);
  }

  // 띄우고 끝날 때까지 → { exitCode, status, error, bytes, cut, sha }
  exec({ id, argv, cwd, env, tool, logPath }) {
    return new Promise((resolve) => {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      const fd = fs.openSync(logPath, 'w');
      const hash = crypto.createHash('sha256');
      let bytes = 0; let cut = false; let why = null; let closed = false; let timer = null;
      const write = (d) => {
        if (closed) return;
        if (bytes >= this.logMax) { cut = true; return; }
        const part = bytes + d.length > this.logMax ? d.subarray(0, this.logMax - bytes) : d;
        if (part.length < d.length) cut = true;
        try { fs.writeSync(fd, part); hash.update(part); bytes += part.length; } catch {}
      };
      const end = (x) => { if (closed) return; closed = true; clearTimeout(timer); try { fs.closeSync(fd); } catch {} resolve({ ...x, bytes, cut, sha: hash.digest('hex') }); };
      let plan;
      try { plan = spawnPlan(argv, { cwd, env, platform: this.platform }); }
      catch (e) { return end({ exitCode: null, status: 'error', error: e.message }); }
      let child;
      try { child = spawn(plan.file, plan.args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], windowsVerbatimArguments: plan.verbatim }); }
      catch (e) { return end({ exitCode: null, status: 'error', error: `띄우지 못했다: ${e.message}` }); }
      timer = setTimeout(() => { why = 'timeout'; killTree(child, this.platform); }, tool.timeoutMs);
      child.stdout.on('data', write); child.stderr.on('data', write);
      child.on('error', (e) => end({ exitCode: null, status: 'error', error: `띄우지 못했다: ${e.message}` }));
      child.on('close', (code) => end(why === 'timeout' ? { exitCode: code ?? null, status: 'timeout', error: `시간 제한(${tool.timeoutMs}ms)을 넘어 껐다` } : why === 'stopped' ? { exitCode: code ?? null, status: 'lost', error: '보드가 꺼지며 끝냈다' } : { exitCode: code, status: 'done', error: null }));
      this.kill = this.kill || new Map(); this.kill.set(id, () => { why = 'stopped'; killTree(child, this.platform); });
    });
  }

  // P217: 도구 실행의 장부 줄. base: 실행 행의 칸(id, workspaceKey, sessionId, unitId, tryId), unit: 그 일(건)
  toolEvent(kind, base, unit, x) {
    const u = unit && unit.id && this.store().getUnit ? this.store().getUnit(unit.id) : null;
    const s = base.sessionId ? this.b.sessions.get(base.sessionId) : null;
    rigEvent(this.b, { kind, ws: base.workspaceKey, caseId: u ? u.caseId || null : null, unitId: base.unitId || null, tryId: base.tryId || null, seat: base.seat !== undefined ? base.seat : s ? s.rigSeat || null : null, session: base.sessionId || null, actor: 'agent', ref: base.id, ...x });
  }
  // 끝난 실행: tool-after 훅 → 장부
  async finish({ id, r, hctx, tool, args, startedAt, logPath, hooks, res }) {
    const st = this.store();
    if (this.kill) this.kill.delete(id);
    if (this.b.rigDocs && r.def.toolDocs && r.def.toolDocs[tool.name]) this.b.rigDocs.noteRecords(hctx.key, r.def, { tool: tool.name, sessionId: hctx.session ? hctx.session.id : null }); // P219: records 도구가 쓴 장부
    const endedAt = Date.now();
    const tail = readTail(logPath);
    let appended = null;
    if (res.status !== 'lost' && r.def.hooks.some((h) => h.at === 'tool-after')) {
      try {
        const ha = await this.b.rig.runAt(r, { ...hctx, at: 'tool-after', args, after: { exitCode: res.exitCode, status: res.status, durationMs: endedAt - startedAt, outputTail: tail, logPath } });
        hooks.push(...ha.runs);
        if (ha.appends.length) appended = ha.appends.join('\n');
      } catch (e) { hooks.push({ at: 'tool-after', decision: 'failed', error: e.message }); }
    }
    st.updateToolRun(id, { status: res.status, exitCode: res.exitCode ?? null, endedAt, logBytes: res.bytes, logCut: res.cut, outSha256: res.sha, hooks, appended, error: res.error || null });
    st.addEvent(hctx.session ? hctx.session.id : null, 'tool_done', { runId: id, tool: tool.name, status: res.status, exitCode: res.exitCode ?? null, ms: endedAt - startedAt, bytes: res.bytes, cut: res.cut });
    this.toolEvent('tool_end', { id, workspaceKey: hctx.key, sessionId: hctx.session ? hctx.session.id : null, unitId: hctx.unit ? hctx.unit.id : null, tryId: hctx.try ? hctx.try.id : null, seat: hctx.session ? hctx.session.seat : null }, hctx.unit, { value: res.status, text: `${tool.name} ${res.status}${res.exitCode != null ? ` 종료 코드 ${res.exitCode}` : ''}`, data: { tool: tool.name, exit: res.exitCode ?? null, ms: endedAt - startedAt } });
    this.b.log && this.b.log(`tool ${tool.name} ${id} ${res.status} exit=${res.exitCode} ${endedAt - startedAt}ms ${res.bytes}B${res.cut ? ' (log cut)' : ''}`);
  }

  // 그 실행을 ms까지 기다린다 → { run }
  async waitFor(id, ms) {
    const x = this.live.get(id);
    if (x) await Promise.race([x.done, sleep(Math.max(0, ms))]);
    return { run: this.view(this.store().getToolRun(id)) };
  }
  view(row) {
    if (!row) return null;
    const over = row.status !== 'running';
    return { ...row, running: !over, durationMs: (row.endedAt || Date.now()) - row.startedAt, tail: over ? readTail(row.logPath) : null };
  }
  // atrium tool --wait <ID>: 이 세션의 실행만
  async wait(caller, o = {}) {
    const id = String(o.runId || '');
    const row = id ? this.store().getToolRun(id) : null;
    if (!row || row.sessionId !== caller.sessionId) throw apiError('not_found', `이 세션의 도구 실행을 찾을 수 없다: ${id || '(ID 없음)'}. 최근 실행: atrium tool --runs`);
    const ms = o.timeoutMs != null && Number(o.timeoutMs) > 0 ? Math.min(Number(o.timeoutMs), 600000) : this.waitMs;
    return this.waitFor(id, ms);
  }
  // atrium tool --runs: 이 세션의 최근 실행
  runs(caller, o = {}) {
    const limit = Math.min(Math.max(Number(o.limit) || 20, 1), 200);
    return { runs: this.store().toolRunsOf(caller.sessionId, limit).map((x) => ({ id: x.id, tool: x.tool, args: x.args, status: x.status, exitCode: x.exitCode, startedAt: x.startedAt, endedAt: x.endedAt, unitId: x.unitId, logPath: x.logPath, logCut: x.logCut, error: x.error })) };
  }
  // /branch/tool: { op: list | run | wait | runs }
  verb(caller, o = {}) {
    const op = o.op || (o.tool ? 'run' : 'list');
    if (op === 'list') return this.list(caller);
    if (op === 'run') return this.run(caller, o);
    if (op === 'wait') return this.wait(caller, o);
    if (op === 'runs') return this.runs(caller, o);
    throw apiError('bad_request', `atrium tool: 모르는 일 ${op}`);
  }
  // 보드가 꺼질 때: 도는 실행을 끝낸다(다시 뜬 판은 쥐지 못한다. 장부에는 lost)
  stopAll() {
    for (const [id, k] of this.kill || []) { try { k(); } catch {} try { this.store().updateToolRun(id, { status: 'lost', endedAt: Date.now(), error: '보드가 꺼지며 끝냈다' }); } catch {} }
  }
}
