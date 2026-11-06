// P69 앱 안 업데이트(백엔드 쪽): 새 릴리즈 확인(뜰 때와 몇 시간마다, 판 설정 updateCheck), 받기·준비(update.mjs), 바꾸기 시작(update-swap.mjs).
// - 확인 결과와 마지막 확인 시각, 마지막 바꾸기 결과는 판 기록(meta 'update')에 둔다. 바뀌면 update.state 이벤트로 창·트레이·웹 화면에 알린다.
// - 업데이트는 사람이 누를 때만 한다(창의 설정 › 일반 › 업데이트, 트레이 메뉴, atrium update). 원격 기기(웹 화면)는 보기만 한다.
// - 바꾸기: update.restart 이벤트를 보내 창(Electron main)이 update.leaving으로 PID를 알리고 끝나게 한 뒤, 바꾸기 프로세스를 떼어 띄우고 이 백엔드만 끝난다.
//   herdr 서버는 끄지 않는다. 바꾸기 프로세스가 새 백엔드를 띄우고, 건강 확인을 통과하지 못하면 옛 버전으로 돌린다.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { BACKEND_ROOT, envVar } from './config.mjs';
import * as U from './update.mjs';

export const CHECK_EVERY_MS = 6 * 3600 * 1000; // 몇 시간마다
export const FIRST_CHECK_MS = 20000; // 뜬 뒤 이만큼 기다렸다가 처음 확인한다(창을 켤 때)
export const LEAVE_WAIT_MS = 1500; // update.restart 뒤 창들이 PID를 알릴 시간
export const HEALTH_MS = 60000; // 새 백엔드가 이 안에 건강 확인을 통과해야 한다
const apiError = (code, message) => Object.assign(new Error(message), { code });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function attachUpdater(b, opts) { return new Updater(b, opts); }

// 다시 띄울 창에 넘길 인자: 개발용 판의 --dev와 시험의 --remote-debugging-port만
export function relaunchArgsOf(args, profile) {
  if (!Array.isArray(args)) return [];
  return args.map(String).filter((a) => a === '--dev' || (profile === 'dev' && /^--remote-debugging-port=\d{2,5}$/.test(a))).slice(0, 4);
}

export class Updater {
  constructor(b, { fetchJson = U.httpGetJson, prepare = U.prepareRelease, verify = U.verifyRoot, spawnSwap = null, exit = (code) => process.exit(code), codeRoot = path.resolve(BACKEND_ROOT, '..'), env = process.env, checkMs, firstCheckMs, leaveWaitMs = LEAVE_WAIT_MS, timers = true } = {}) {
    this.b = b; this.fetchJson = fetchJson; this.prepare = prepare; this.verify = verify; this.exit = exit; this.leaveWaitMs = leaveWaitMs;
    this.spawnSwap = spawnSwap || ((file, job) => this.defaultSpawnSwap(file, job));
    this.codeRoot = codeRoot;
    this.dir = U.installDirOf(env);
    this.apiUrl = U.updateApiOf(env);
    this.running = U.runningVersion(codeRoot, this.dir);
    this.healthMs = Number(envVar('UPDATE_HEALTH_MS', env) || HEALTH_MS);
    this.checkMs = checkMs ?? Number(envVar('UPDATE_CHECK_MS', env) || CHECK_EVERY_MS);
    this.logFile = path.join(b.cfg.logDir, 'update.log');
    this.job = null; // { kind, phase: prepare|restarting|failed, step, to, error, startedAt, bytes }
    this.leaving = [];
    this.checking = null;
    this.noteResult();
    this.handlers = {
      'update.status': () => this.view(),
      'update.check': () => this.check('manual'),
      'update.apply': (p, c) => this.apply(p || {}, c),
      'update.rollback': (p, c) => this.rollback(p || {}, c),
      'update.leaving': (p) => this.leave(p || {}),
    };
    if (timers) {
      this.firstTimer = setTimeout(() => this.autoCheck('start'), firstCheckMs ?? Number(envVar('UPDATE_FIRST_CHECK_MS', env) || FIRST_CHECK_MS));
      this.timer = setInterval(() => this.autoCheck('timer'), this.checkMs);
      // 뜬 직후 바꾸기 결과가 생기면 알린다(이 백엔드가 바꾸기 프로세스가 띄운 것일 때)
      this.resultTimers = [1000, 3000, 8000, 20000].map((ms) => setTimeout(() => { if (this.noteResult()) this.broadcast(); }, ms));
    }
  }
  stop() { clearTimeout(this.firstTimer); clearInterval(this.timer); for (const t of this.resultTimers || []) clearTimeout(t); }
  log(...a) { const line = `${new Date().toISOString()} ${a.join(' ')}`; try { fs.mkdirSync(path.dirname(this.logFile), { recursive: true }); fs.appendFileSync(this.logFile, line + '\n'); } catch {} }

  settings() { return (this.b.features && this.b.features.settings.get()) || this.b.store.getMeta('settings') || {}; }
  enabled() { return this.settings().updateCheck !== false; }
  meta() { return this.b.store.getMeta('update') || {}; }
  putMeta(patch) { const m = { ...this.meta(), ...patch }; this.b.store.setMeta('update', m); return m; }
  broadcast() { this.b.api.broadcast('update.state', this.view()); }
  view() {
    this.noteResult(); // 바꾸기 프로세스는 새 백엔드가 뜬 뒤에 결과를 쓴다. 창이 붙어 물을 때 읽는다
    const m = this.meta();
    const cur = U.readCurrent(this.dir);
    const latest = m.latest ? { tag: m.latest.tag, version: m.latest.version, name: m.latest.name, url: m.latest.url, notes: m.latest.notes, publishedAt: m.latest.publishedAt } : null;
    const available = !!(latest && this.running.version && U.compareVersions(latest.version, this.running.version) > 0);
    const allowed = U.installAllowed(this.b.cfg, this.dir);
    return {
      current: { version: this.running.version, tag: this.running.tag, installed: this.running.installed },
      latest, available, checkedAt: m.checkedAt || null, error: m.error || null, enabled: this.enabled(),
      installDir: this.dir, previous: (cur && cur.previous) || null, canRollback: !!(cur && cur.previous && allowed.ok),
      allowed: allowed.ok, job: this.job, lastResult: m.lastResult || null,
    };
  }
  // 바꾸기 프로세스가 남긴 결과(last-update.json)를 판 기록에 옮긴다. 창은 처음 보는 결과를 한 번 알린다
  noteResult() {
    const r = U.readResult(this.dir);
    if (!r || !r.at) return false;
    const m = this.meta();
    if (m.lastResult && m.lastResult.at === r.at) return false;
    this.putMeta({ lastResult: r });
    try { this.b.store.addEvent(null, 'update_result', r); } catch {}
    this.log(`swap result ${JSON.stringify(r)}`);
    return true;
  }

  async autoCheck(reason) {
    if (!this.enabled() || this.job) return;
    await this.check(reason).catch(() => {});
  }
  check(reason = 'manual') {
    if (this.checking) return this.checking;
    this.checking = (async () => {
      try {
        const rel = U.parseRelease(await this.fetchJson(this.apiUrl));
        if (rel) this.putMeta({ checkedAt: Date.now(), latest: rel, error: null });
        else this.putMeta({ checkedAt: Date.now(), error: 'no_release' });
      } catch (e) {
        this.putMeta({ checkedAt: Date.now(), error: e.code === 'no_release' ? 'no_release' : String(e.message || e).slice(0, 300) });
      }
      const v = this.view();
      this.log(`check ${reason} current=${v.current.version} latest=${v.latest && v.latest.tag} available=${v.available}${v.error ? ` error=${v.error}` : ''}`);
      this.broadcast();
      return v;
    })().finally(() => { this.checking = null; });
    return this.checking;
  }

  guard(c) {
    if (c && c.auth && c.auth.kind !== 'local') throw apiError('forbidden', 'only the board on this PC can update');
    const ok = U.installAllowed(this.b.cfg, this.dir);
    if (!ok.ok) throw apiError(ok.reason, ok.message);
    if (this.job && this.job.phase !== 'failed') throw apiError('update_busy', '업데이트가 이미 진행 중입니다');
  }
  setJob(patch) { this.job = { ...(this.job || {}), ...patch, at: Date.now() }; this.broadcast(); }

  async apply(p, c) {
    this.guard(c);
    let v = this.view();
    if (!v.available) v = await this.check('apply');
    if (!v.available) throw apiError('no_update', `새 버전이 없습니다(지금 ${v.current.version})`);
    if (!p.confirm) return { needsConfirm: true, to: v.latest.tag, message: `${v.latest.tag}로 업데이트합니다. 준비가 끝나면 백엔드와 창이 다시 뜹니다. herdr의 세션은 그대로 이어집니다.` };
    const rel = this.meta().latest;
    this.job = null;
    this.setJob({ kind: 'update', phase: 'prepare', step: 'download', to: rel.tag, error: null, startedAt: Date.now() });
    this.runUpdate(rel).catch(() => {});
    return { started: true, to: rel.tag };
  }
  async runUpdate(rel) {
    this.log(`update start ${this.running.version} → ${rel.tag}`);
    try {
      const protocol = this.b.herdrCompat && this.b.herdrCompat.ok ? this.b.herdrCompat.protocol : null;
      const r = await this.prepare({ dir: this.dir, release: rel, apiUrl: this.apiUrl, protocol, step: (step, d) => { this.log(`step ${step}${d ? ` ${JSON.stringify(d)}` : ''}`); this.setJob({ step, part: null, bytes: null, ...(d || {}) }); }, log: (l) => this.log(l) });
      const before = U.readCurrent(this.dir);
      const previous = this.running.installed ? this.running.tag : (before && before.current) || null;
      await this.swap({ kind: 'update', toRoot: r.root, to: { tag: rel.tag, version: rel.version }, currentAfter: { current: rel.tag, previous: previous === rel.tag ? null : previous, switchedAt: Date.now() } });
    } catch (e) {
      this.log(`update failed ${e.stack || e.message}`);
      this.setJob({ phase: 'failed', error: String(e.message || e).slice(0, 500) });
    }
  }

  async rollback(p, c) {
    this.guard(c);
    const cur = U.readCurrent(this.dir);
    if (!cur || !cur.previous) throw apiError('no_previous', '되돌릴 앞 버전이 없습니다');
    const root = path.join(this.dir, cur.previous);
    if (!fs.existsSync(root)) throw apiError('no_previous', `앞 버전 폴더가 없습니다: ${cur.previous}`);
    if (!p.confirm) return { needsConfirm: true, to: cur.previous, message: `앞 버전 ${cur.previous}로 되돌립니다. 백엔드와 창이 다시 뜹니다. herdr의 세션은 그대로 이어집니다.` };
    this.job = null;
    this.setJob({ kind: 'rollback', phase: 'prepare', step: 'verify', to: cur.previous, error: null, startedAt: Date.now() });
    (async () => {
      try {
        const protocol = this.b.herdrCompat && this.b.herdrCompat.ok ? this.b.herdrCompat.protocol : null;
        const v = await this.verify(root, { protocol });
        if (!v.ok) throw new Error(`앞 버전을 확인하지 못했습니다: ${v.problems.join('; ')}`);
        await this.swap({ kind: 'rollback', toRoot: root, to: { tag: cur.previous, version: U.versionOfRoot(root) }, currentAfter: { current: cur.previous, previous: cur.current, switchedAt: Date.now() } });
      } catch (e) { this.log(`rollback failed ${e.message}`); this.setJob({ phase: 'failed', error: String(e.message || e).slice(0, 500) }); }
    })();
    return { started: true, to: cur.previous };
  }

  // 창(Electron main)이 끝나기 전에 PID와 다시 띄울 때 쓸 인자를 알린다
  leave(p) {
    const pid = Number(p.pid);
    this.leaving.push({ pid: Number.isInteger(pid) && pid > 0 ? pid : null, args: relaunchArgsOf(p.args, this.b.cfg.profile) });
    this.log(`window leaving pid=${p.pid}`);
    return { ok: true };
  }

  async swap({ kind, toRoot, to, currentAfter }) {
    this.setJob({ phase: 'restarting', step: null });
    this.leaving = [];
    this.b.api.broadcast('update.restart', { kind, from: { tag: this.running.tag, version: this.running.version }, to });
    await sleep(this.leaveWaitMs);
    const job = {
      kind, installDir: this.dir, fromRoot: this.codeRoot, toRoot, toInstalled: path.dirname(path.resolve(toRoot)).toLowerCase() === this.dir.toLowerCase(),
      from: { tag: this.running.tag, version: this.running.version }, to,
      currentBefore: U.readCurrent(this.dir), currentAfter,
      waitPids: [process.pid, ...this.leaving.map((x) => x.pid).filter(Boolean)], oldBackendPid: process.pid,
      relaunch: this.leaving.length > 0, relaunchArgs: (this.leaving.find((x) => x.args.length) || { args: [] }).args,
      healthMs: this.healthMs, nodePath: process.execPath, profileArgv: this.b.cfg.profile === 'dev' ? ['--dev'] : [], logFile: this.logFile,
    };
    const file = path.join(this.dir, U.JOB_FILE);
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(job, null, 2));
    this.log(`swap ${kind} → ${to.tag} relaunch=${job.relaunch} wait=${JSON.stringify(job.waitPids)}`);
    this.spawnSwap(file, job);
    try { this.b.store.addEvent(null, 'update_swap', { kind, from: job.from, to }); } catch {}
    // 이 백엔드만 끝낸다(herdr 서버는 그대로). 바꾸기 프로세스가 새 백엔드를 띄운다
    setTimeout(() => this.b.stop('update').catch(() => {}).then(() => this.exit(0)), 50);
    return { swapping: true };
  }
  defaultSpawnSwap(file) {
    const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(BACKEND_ROOT, 'src', 'update-swap.mjs'), file], { cwd: this.dir, env: U.cleanEnv(process.env), detached: true, stdio: 'ignore', windowsHide: true });
    p.on('error', (e) => this.log(`swap spawn error ${e.message}`));
    p.unref();
  }
}
