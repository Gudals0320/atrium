// P363: SDK 세션 종류. 판이 터미널(hc) 대신 백엔드 자식 프로세스로 `claude -p --input-format stream-json --output-format stream-json --verbose`를 돌린다.
// 요금제의 월 API 크레딧은 API·Agent SDK·`claude -p`에만 쓰이고 대화형 Claude Code에는 쓰이지 않는다(도움말 17154008). 그래서 대화형 API 런처(P359)를 걷고
// 이 종류가 판 중계기(auth-relay.mjs, 키는 중계기만 품)를 거쳐 API 키로 돈다. 세션 env에는 ANTHROPIC_API_KEY를 넣지 않는다(ANTHROPIC_BASE_URL = 중계기만).
// - 수명: 일이 있는 동안만 프로세스가 산다. 글은 stdin의 user 메시지 한 줄이다. 쉬면(턴이 끝나고 idleMs) 프로세스를 끝내고 다음 글에서 --resume <ID>로 다시 띄운다.
//   백엔드를 다시 켜도 같은 길이다(프로세스는 백엔드와 함께 끝나고, 다음 글에서 이어 간다). 멈추기는 프로세스 끊기다.
// - 상태: 판의 hook(--settings, UserPromptSubmit·Stop 등)이 그대로 오고, stream 이벤트(init, result, 오류)가 터미널 상태 대신 rt.term을 움직인다.
//   턴 중에 넣은 글은 Claude Code가 지금 턴에 끼워 넣는다(P363 실험: 도구 결과 뒤에 들어가고 UserPromptSubmit hook이 온다). 그래서 기본 대기열은 판의 전달
//   대기열(턴 중이면 기다림)이 그대로 하고, 스티어링(typeNow)은 턴 중에 바로 쓴다.
// - 과금 오류(구매 크레딧 부족 등)는 까닭과 함께 오류(rt.lastError, type billing_error)로 보인다.
import { spawn as nodeSpawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { applyTermStatus } from './state.mjs';
import { cleanEnv } from './proc-env.mjs';
import { transcriptPathFor } from './launch.mjs';
import { clip } from './text.mjs';

export const SDK_HARNESS = 'claude-sdk'; // 런처 하네스 ID(launchers.mjs HARNESSES)
export const SDK_BILLING = 'sdk'; // 세션 billing: 판 중계기를 거쳐 API 키(월 API 크레딧)로 도는 claude -p
export const SDK_LAUNCHER_ID = 'claude-sdk';
export const SDK_IDLE_MS = 60000; // 턴이 끝나고 이만큼 쉬면 프로세스를 끝낸다(다음 글에서 --resume)
export const isSdk = (s) => !!s && s.billing === SDK_BILLING;

// 띄울 인자. resume이면 --resume <ID>, 아니면 --session-id <ID>(+ 처음만 --worktree). 권한은 늘 bypassPermissions(권한 질문 화면이 없다)
export function buildSdkArgs({ sessionId, resume = false, worktree = null, settingsPath, model = null, effort = null, pluginDir = null, systemPromptFile = null, extraArgs = [] }) {
  const a = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];
  a.push(resume ? '--resume' : '--session-id', sessionId);
  if (worktree && !resume) a.push('--worktree', worktree);
  a.push('--no-chrome', '--permission-mode', 'bypassPermissions', '--settings', settingsPath);
  if (model) a.push('--model', model);
  if (effort) a.push('--effort', effort);
  if (pluginDir) a.push('--plugin-dir', pluginDir);
  if (systemPromptFile) a.push('--append-system-prompt-file', systemPromptFile);
  if (extraArgs && extraArgs.length) a.push(...extraArgs.map(String));
  return a;
}

// 자식 env: 부모 Claude Code·판 변수·비밀(proc-env cleanEnv)과 인증 변수를 빼고 ANTHROPIC_BASE_URL만 중계기 주소로. 키는 넣지 않는다.
//   판 변수(ATRIUM_* 등)는 세션 설정 파일의 env로 간다(--settings, 판이 띄운 claude와 같다)
const AUTH_ENV = /^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_BASE_URL|CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_CUSTOM_HEADERS|HC_.*)$/i; // HC_*: 판 터미널 서버 변수(실제 판 값이 새지 않게)
export function sdkEnv(base, { relayUrl }) {
  const env = Object.fromEntries(Object.entries(cleanEnv(base)).filter(([k]) => !AUTH_ENV.test(k)));
  env.ANTHROPIC_BASE_URL = relayUrl;
  return env;
}

// stdin에 쓸 사용자 메시지 한 줄
export const userLine = (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: String(text) } }) + '\n';

// 과금 오류 글(API 400 "Your credit balance is too low…", 결제·한도). 대소문자 무시
const BILLING_RE = /credit balance (is )?too low|insufficient[_ ]credit|billing[_ ]error|purchase (more )?credits|plans? (&|and) billing/i;
export const isBillingText = (t) => BILLING_RE.test(String(t || ''));

// stream 한 줄(JSON) → 판이 쓸 사건 | null.
//   { kind: 'init', cwd, model, sessionId } | { kind: 'assistant', text, tools: [이름], error } | { kind: 'result', ok, text, error, turns } | { kind: 'other' }
export function readStreamEvent(j) {
  if (!j || typeof j !== 'object') return null;
  if (j.type === 'system' && j.subtype === 'init') return { kind: 'init', cwd: j.cwd || null, model: j.model || null, sessionId: j.session_id || null, apiKeySource: j.apiKeySource || null };
  if (j.type === 'assistant' && j.message) {
    const c = Array.isArray(j.message.content) ? j.message.content : [];
    const text = c.filter((x) => x && x.type === 'text').map((x) => x.text).join('\n');
    return { kind: 'assistant', text, tools: c.filter((x) => x && x.type === 'tool_use').map((x) => x.name), error: j.error || null };
  }
  if (j.type === 'result') {
    const text = typeof j.result === 'string' ? j.result : '';
    const bad = !!j.is_error || (j.subtype && j.subtype !== 'success');
    return { kind: 'result', ok: !bad, text, turns: j.num_turns ?? null, error: bad ? errorOf(text || (Array.isArray(j.errors) ? j.errors.join(' ') : '') || j.subtype || 'error') : null };
  }
  return { kind: 'other', type: j.type || null };
}
// 오류 글 → rt.lastError 모양
export function errorOf(text, type = null) {
  const t = clip(String(text || ''), 400);
  return { type: type || (isBillingText(t) ? 'billing_error' : 'sdk_error'), message: t || null, at: Date.now() };
}

// 세션 하나의 rt를 stream 사건으로 움직인다(순수에 가깝다: rt만 바꾼다) → 바뀐 것 { turnEnded?, cwd? }
export function applyStreamEvent(rt, ev, now = Date.now()) {
  if (!ev) return {};
  if (ev.kind === 'init') { rt.term.present = true; return ev.cwd ? { cwd: ev.cwd } : {}; }
  if (ev.kind === 'assistant') {
    rt.lastActivityAt = now;
    if (ev.error || (isBillingText(ev.text) && !ev.tools.length)) rt.sdkErr = errorOf(ev.text || ev.error, isBillingText(ev.text) || ev.error === 'billing_error' ? 'billing_error' : null);
    return {};
  }
  if (ev.kind === 'result') {
    const err = ev.error || rt.sdkErr || null;
    rt.sdkErr = null;
    if (ev.text && !err) { rt.lastAnswer = ev.text; rt.lastAnswerAt = now; }
    if (err) { rt.lastError = { ...err, at: now }; rt.lastAnswerAt = now; if (ev.text) rt.lastAnswer = ev.text; }
    if (!rt.turn.endedAt) rt.turn.endedAt = now;
    applyTermStatus(rt, 'idle', now);
    return { turnEnded: true };
  }
  return {};
}

// 프로세스 나무 끄기(Windows는 taskkill /T, 그 밖은 kill)
function killTree(child) {
  if (!child || child.exitCode != null) return;
  if (process.platform === 'win32' && child.pid) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else try { child.kill(); } catch {}
}

// 판의 SDK 세션 프로세스들. b는 Backend(sessions, store, authRelay, cfg, plugin, pluginFor, broadcastSession, queue, log, probeGit)
export class SdkHost {
  constructor(b, { idleMs = SDK_IDLE_MS, spawn = nodeSpawn, command = null } = {}) {
    this.b = b; this.idleMs = idleMs; this.spawnFn = spawn;
    this.command = command; // [실행 파일, ...앞 인자](시험의 가짜 claude). 없으면 claude
    this.procs = new Map(); // sessionId → { child, buf, err, startedAt, resume, idle, stopping }
  }
  alive(sid) { const p = this.procs.get(sid); return !!(p && p.child && p.child.exitCode == null && !p.stopping); }
  view(s) { const p = this.procs.get(s.sessionId); return { alive: this.alive(s.sessionId), pid: p && p.child ? p.child.pid || null : null, startedAt: p ? p.startedAt : null, resume: p ? !!p.resume : null }; }
  // 이어 갈 대화가 있는가(대화 기록 파일). 워크트리로 들어간 세션은 hook·init이 알려 준 폴더의 기록
  hasTranscript(s) {
    const cands = [s.rt.transcriptPath, transcriptPathFor(this.b.cfg.claudeProjects, s.rt.cwd || s.cwd, s.sessionId), transcriptPathFor(this.b.cfg.claudeProjects, s.cwd, s.sessionId)].filter(Boolean);
    return cands.some((f) => { try { return fs.existsSync(f); } catch { return false; } });
  }
  // 띄울 계획(명령·인자·폴더) → 시험이 본다
  planOf(s, { relayUrl }) {
    const resume = !!s.sdkStarted || this.hasTranscript(s);
    const cwd = resume && s.rt.cwd && fs.existsSync(s.rt.cwd) ? s.rt.cwd : s.cwd;
    const plug = this.b.pluginFor ? this.b.pluginFor(s.orch ? s : null) : this.b.plugin || {};
    const args = buildSdkArgs({ sessionId: s.sessionId, resume, worktree: s.sdkWorktree || null, settingsPath: s.settingsPath, model: s.model, effort: s.effort, pluginDir: plug.pluginDir || null, systemPromptFile: plug.systemPromptFile || null, extraArgs: s.extraArgs || [] });
    const head = this.command || [this.b.cfg.sdkCommand || this.b.cfg.claudeCommand || 'claude'];
    return { file: head[0], args: [...head.slice(1), ...args], cwd, resume, env: sdkEnv(process.env, { relayUrl }) };
  }
  async start(s) {
    const relayUrl = await this.b.authRelay.ensure().then(() => this.b.authRelay.url(s.sessionId)); // 키가 없거나 못 띄우면 던진다(글은 대기열이 다시 본다)
    const plan = this.planOf(s, { relayUrl });
    const child = this.spawnFn(plan.file, plan.args, { cwd: plan.cwd, env: plan.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const p = { child, buf: '', err: '', startedAt: Date.now(), resume: plan.resume, idle: null, stopping: false };
    this.procs.set(s.sessionId, p);
    s.sdkStarted = true;
    s.rt.term.present = true; s.rt.term.launchPending = false; s.rt.phase = 'running';
    this.b.store.addEvent(s.sessionId, 'sdk_start', { pid: child.pid || null, resume: plan.resume, cwd: plan.cwd.split(path.sep).join('/'), args: plan.args.filter((a) => !/^http/.test(a)) });
    this.b.log(`sdk start ${s.name} pid=${child.pid} resume=${plan.resume}`);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => { p.buf += c; let i; while ((i = p.buf.indexOf('\n')) >= 0) { const line = p.buf.slice(0, i); p.buf = p.buf.slice(i + 1); if (line.trim()) this.onLine(s, p, line); } });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => { p.err = (p.err + c).slice(-2000); });
    child.stdin.on('error', () => {});
    child.on('error', (e) => { p.err = (p.err + `\n${e.code || e.message}`).slice(-2000); this.onExit(s, p, null); });
    child.on('exit', (code) => this.onExit(s, p, code));
    return p;
  }
  onLine(s, p, line) {
    let j; try { j = JSON.parse(line); } catch { return; }
    const ev = readStreamEvent(j);
    if (!ev || ev.kind === 'other') return;
    const live = this.b.sessions.get(s.sessionId);
    if (!live) return;
    const r = applyStreamEvent(live.rt, ev);
    if (ev.kind === 'init' && r.cwd && r.cwd !== live.rt.cwd) { live.rt.cwd = r.cwd; if (this.b.probeGit) this.b.probeGit(live, r.cwd); }
    if (ev.kind === 'init' && ev.apiKeySource) live.rt.sdkKeySource = ev.apiKeySource;
    if (ev.kind === 'result') {
      if (ev.error) { this.b.store.addEvent(s.sessionId, 'sdk_error', { type: live.rt.lastError && live.rt.lastError.type, message: clip(ev.error.message, 300) }); this.b.log(`sdk error ${s.name}: ${clip(ev.error.message, 160)}`); }
      this.armIdle(live, p);
      if (this.b.queue) this.b.queue.poke(s.sessionId);
    }
    this.b.broadcastSession(live, { cause: `sdk:${ev.kind}` });
  }
  // 턴이 끝났다. 뒤 일이 없고 대기열이 비었으면 idleMs 뒤에 끝낸다(다음 글에서 --resume)
  armIdle(s, p) {
    clearTimeout(p.idle);
    p.idle = setTimeout(() => {
      if (this.procs.get(s.sessionId) !== p) return;
      const bg = s.rt.bg && Array.isArray(s.rt.bg.tasks) && s.rt.bg.tasks.length;
      if (s.rt.term.status === 'working' || bg) return this.armIdle(s, p);
      this.stop(s, 'idle').catch(() => {});
    }, this.idleMs);
    if (p.idle.unref) p.idle.unref();
  }
  onExit(s, p, code) {
    if (p.exited) return;
    p.exited = true;
    clearTimeout(p.idle);
    if (this.procs.get(s.sessionId) === p) this.procs.delete(s.sessionId);
    const live = this.b.sessions.get(s.sessionId);
    this.b.store.addEvent(s.sessionId, 'sdk_exit', { code: code ?? null, why: p.stopping || null, ms: Date.now() - p.startedAt });
    this.b.log(`sdk exit ${s.name} code=${code} why=${p.stopping || 'self'}`);
    if (!live) return;
    // 턴 중에 스스로 끝났다(끊김·충돌·인자 오류): 오류로 보이고 쉼으로 돌린다. 판이 끈 것(idle·kill)은 그대로 쉼
    if (live.rt.term.status === 'working' && !p.stopping) {
      const tail = String(p.err || '').trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' ');
      live.rt.lastError = errorOf(tail || `claude -p exited (${code})`, isBillingText(tail) ? 'billing_error' : 'sdk_exit');
      applyTermStatus(live.rt, 'idle');
    } else if (live.rt.term.status === 'working') applyTermStatus(live.rt, 'idle');
    this.b.broadcastSession(live, { cause: 'sdk:exit' });
  }
  // 글 하나 넣기(판의 전달 대기열이 부른다). 프로세스가 없으면 띄운다(이어 갈 대화가 있으면 --resume)
  async send(s, text) {
    let p = this.procs.get(s.sessionId);
    if (!p || !this.alive(s.sessionId)) p = await this.start(s);
    clearTimeout(p.idle);
    p.child.stdin.write(userLine(text));
    if (s.rt.term.status !== 'working') { s.rt.lastError = null; applyTermStatus(s.rt, 'working'); }
    this.b.broadcastSession(s, { cause: 'sdk:send' });
    return { ok: true, pid: p.child.pid || null };
  }
  // 멈추기 = 프로세스 끊기(지금 턴도 끝난다). 끝날 때까지 잠깐 기다린다
  async stop(s, why = 'stop', { waitMs = 5000 } = {}) {
    const p = this.procs.get(s.sessionId);
    if (!p) return false;
    p.stopping = why;
    clearTimeout(p.idle);
    const gone = new Promise((r) => { if (p.exited) r(); else p.child.once('exit', () => r()); });
    try { p.child.stdin.end(); } catch {}
    const t = setTimeout(() => killTree(p.child), why === 'idle' ? 1500 : 200);
    await Promise.race([gone, new Promise((r) => setTimeout(r, waitMs))]);
    clearTimeout(t);
    if (!p.exited) { killTree(p.child); this.onExit(s, p, null); }
    return true;
  }
  async stopAll(why = 'board stop') { await Promise.all([...this.procs.keys()].map((sid) => { const s = this.b.sessions.get(sid) || { sessionId: sid, name: sid, rt: null }; return this.stop(s, why).catch(() => {}); })); }
}
