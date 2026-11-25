// P359: 판 중계기(auth relay) 관리. 구독 한도가 바닥날 때 새 워커만 API 키 과금으로 띄우는 런처 "Claude Code (API)"를 받친다.
// - 키: 설정에서 받은 API 키를 OS 보호 저장소(DPAPI, dpapi.mjs)로 암호화해 <데이터 폴더>/auth-relay/key.bin에 암호문만 둔다.
//   판은 키를 돌려주지 않는다(있음/없음만). 푸는 것은 중계기 자식 프로세스뿐이다(auth-relay-child.mjs).
// - 중계기: 판이 node로 띄우는 자식. 127.0.0.1의 포트 하나, 경로 앞머리 비밀(같은 PC의 다른 프로그램이 마음대로 쓰지 못하게).
//   처음 API 런처를 띄울 때 뜨고, 판이 꺼지면 함께 끈다. 갑자기 죽으면 다시 띄우고 알린다(1분에 3번까지).
//   포트·비밀은 relay.json에 두어 판을 다시 켜도 세션 설정 파일의 주소가 그대로 맞는다. 포트가 막히면 새 포트로 띄우고 onMoved로 알린다.
// - 요청 기록: requests.jsonl(시각, 경로, 상태, 모델, 입력·출력·캐시 토큰(P361: 1시간 캐시 쓰기 cacheW1h), 세션). 머리글·본문·키는 남기지 않는다.
// - P361: Admin 키(admin.bin, 같은 암호화). 공식 비용 조회(queryCost)는 같은 자식 프로그램을 mode cost로 한 번 띄워 그 자식만 키를 푼다.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RELAY_PLACEHOLDER, relayUrl, newSecret, SECRET_RE, keyOk } from './auth-relay-core.mjs';
import { protect as dpapiProtect } from './dpapi.mjs';
export { RELAY_PLACEHOLDER };

const CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'auth-relay-child.mjs');
const READY_MS = 20000;
const LOG_MAX = 4 * 1024 * 1024;
const err = (code, message, key, vars = {}) => Object.assign(new Error(message), { code, key, vars });

// 세션 env에 자리표시가 있는가(그 세션은 API 과금)
export const usesRelay = (env) => !!env && Object.values(env).some((v) => String(v).includes(RELAY_PLACEHOLDER));
// 자식에게 줄 env: 판·Claude Code·Anthropic 값을 뺀다
const childEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => !/^(ATRIUM_|MTASK_|HC_|HERDR_|ANTHROPIC_|CLAUDE|ELECTRON_RUN_AS_NODE$)/i.test(k)));

export class AuthRelay {
  constructor({ dataDir, log = () => {}, onChange = () => {}, onNotice = () => {}, onMoved = () => {}, upstream = null, node = process.execPath, protect = dpapiProtect, now = () => Date.now() }) {
    this.dir = path.join(dataDir, 'auth-relay');
    this.keyFile = path.join(this.dir, 'key.bin');
    this.adminKeyFile = path.join(this.dir, 'admin.bin'); // P361: Admin 키(공식 사용량·비용 API). 암호문만, 푸는 것은 자식(비용 조회)뿐
    this.stateFile = path.join(this.dir, 'relay.json');
    this.logFile = path.join(this.dir, 'requests.jsonl');
    Object.assign(this, { log, onChange, onNotice, onMoved, upstream, node, protect, now });
    this.child = null; this.port = null; this.starting = null; this.stopping = false;
    this.requests = 0; this.refused = 0; this.lastError = null; this.startedAt = null; this.deaths = [];
    this.state = this.readState();
  }
  readState() {
    try { const s = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')); if (SECRET_RE.test(s.secret)) return { port: Number(s.port) || 0, secret: s.secret }; } catch {}
    return { port: 0, secret: newSecret() };
  }
  saveState() { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(this.stateFile, JSON.stringify(this.state)); }
  keyPresent() { try { return fs.statSync(this.keyFile).size > 0; } catch { return false; } }
  adminPresent() { try { return fs.statSync(this.adminKeyFile).size > 0; } catch { return false; } }
  status() {
    return { keyPresent: this.keyPresent(), adminKeyPresent: this.adminPresent(), running: !!(this.child && this.port), starting: !!this.starting, port: this.child ? this.port : null, requests: this.requests, refused: this.refused, lastError: this.lastError, startedAt: this.startedAt, pid: this.child ? this.child.pid : null };
  }
  changed() { try { this.onChange(this.status()); } catch {} }
  fail(kind) { this.lastError = { kind, at: this.now() }; }

  // 설정 탭에서 받은 키를 암호화해 둔다. 값은 돌려주지 않는다
  async setKey(key) {
    const k = typeof key === 'string' ? key.trim() : '';
    if (!keyOk(k)) throw err('bad_request', 'API 키 모양이 아닙니다(보이는 글자 20~400자)', 'authRelay.err.keyShape');
    let ct;
    try { ct = await this.protect(k); } catch (e) { throw err('protect_failed', `키를 OS 보호 저장소로 암호화하지 못했습니다 (${e.code || 'error'})`, 'authRelay.err.protect'); }
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.keyFile + '.tmp';
    fs.writeFileSync(tmp, ct); fs.renameSync(tmp, this.keyFile);
    this.log('auth relay: key saved (encrypted)');
    if (this.child) { await this.stop(); await this.ensure().catch(() => {}); }
    this.lastError = null;
    this.changed();
    return { keyPresent: true };
  }
  async removeKey() {
    try { fs.rmSync(this.keyFile, { force: true }); } catch {}
    await this.stop();
    this.log('auth relay: key removed');
    this.changed();
    return { keyPresent: false };
  }

  // P361: Admin 키. API 키와 같이 암호화해 두고 값은 돌려주지 않는다. 중계기를 다시 띄우지 않는다(비용 조회 자식이 그때그때 푼다)
  async setAdminKey(key) {
    const k = typeof key === 'string' ? key.trim() : '';
    if (!keyOk(k)) throw err('bad_request', 'Admin 키 모양이 아닙니다(보이는 글자 20~400자)', 'apiCredits.err.adminShape');
    let ct;
    try { ct = await this.protect(k); } catch (e) { throw err('protect_failed', `키를 OS 보호 저장소로 암호화하지 못했습니다 (${e.code || 'error'})`, 'authRelay.err.protect'); }
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.adminKeyFile + '.tmp';
    fs.writeFileSync(tmp, ct); fs.renameSync(tmp, this.adminKeyFile);
    this.log('auth relay: admin key saved (encrypted)');
    this.changed();
    return { adminKeyPresent: true };
  }
  async removeAdminKey() {
    try { fs.rmSync(this.adminKeyFile, { force: true }); } catch {}
    this.log('auth relay: admin key removed');
    this.changed();
    return { adminKeyPresent: false };
  }
  // P361: 공식 비용 조회(1시간 칸). 자식을 한 번 띄워 묻고 끝낸다 → { rows: [{ s, e, usd }], refreshedAt, pages }. 실패는 code cost_failed, vars.why
  queryCost({ from, to, timeoutMs = 90000 }) {
    if (!this.adminPresent()) return Promise.reject(err('no_admin_key', 'Admin 키가 없습니다', 'apiCredits.err.noAdmin'));
    return new Promise((resolve, reject) => {
      let p;
      try { p = spawn(this.node, [CHILD], { env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); }
      catch { return reject(err('cost_failed', '비용 조회를 띄우지 못했습니다', 'apiCredits.err.cost', { why: 'spawn_failed' })); }
      let done = false; let buf = '';
      const finish = (e, v) => { if (done) return; done = true; clearTimeout(t); try { p.stdin.end(); } catch {} if (e) reject(e); else resolve(v); };
      const fail = (why) => finish(err('cost_failed', `공식 비용을 받지 못했습니다 (${why})`, 'apiCredits.err.cost', { why }));
      const t = setTimeout(() => { try { p.kill(); } catch {} fail('timeout'); }, timeoutMs);
      p.stdout.setEncoding('utf8');
      p.stdout.on('data', (c) => {
        buf += c; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          let m; try { m = JSON.parse(line); } catch { continue; }
          if (m.t === 'cost') finish(null, { rows: Array.isArray(m.rows) ? m.rows : [], refreshedAt: m.refreshedAt ?? null, pages: m.pages || 0 });
          else if (m.t === 'fatal') fail(String(m.why || 'fatal').slice(0, 60));
        }
      });
      p.stderr.on('data', () => {});
      p.on('error', () => fail('spawn_failed'));
      p.on('exit', (code) => fail(`exit_${code}`));
      p.stdin.write(JSON.stringify({ mode: 'cost', adminKeyFile: this.adminKeyFile, from, to, ...(this.upstream ? { upstream: this.upstream } : {}) }) + '\n');
    });
  }
  // P361: 요청 기록 모두(돌려 쓴 .1 먼저) → 줄 목록. 장부가 지출을 셈할 때 쓴다(파일이 그대로면 담아 둔 것)
  allRequests() {
    const files = [this.logFile + '.1', this.logFile];
    const sig = files.map((f) => { try { const s = fs.statSync(f); return `${s.size}:${s.mtimeMs}`; } catch { return '-'; } }).join('|');
    if (this.allCache && this.allCache.sig === sig) return this.allCache.recs;
    const recs = [];
    for (const f of files) { let text = ''; try { text = fs.readFileSync(f, 'utf8'); } catch { continue; } for (const l of text.split('\n')) { if (!l) continue; try { recs.push(JSON.parse(l)); } catch {} } }
    this.allCache = { sig, recs };
    return recs;
  }

  url(sessionId) {
    if (!this.child || !this.port) throw err('auth_relay_down', 'API 중계기가 떠 있지 않습니다', 'authRelay.err.down', { why: (this.lastError && this.lastError.kind) || 'stopped' });
    return relayUrl({ port: this.port, secret: this.state.secret, sessionId });
  }
  // 세션 env의 자리표시를 그 세션의 중계기 주소로. 자리표시가 없으면 그대로. 중계기가 안 떠 있으면 띄우고, 못 띄우면 던진다
  async fillEnv(env, sessionId) {
    if (!usesRelay(env)) return env;
    await this.ensure();
    const u = this.url(sessionId);
    return Object.fromEntries(Object.entries(env).map(([k, v]) => [k, String(v).split(RELAY_PLACEHOLDER).join(u)]));
  }

  async ensure() {
    if (this.child && this.port) return this.status();
    if (!this.keyPresent()) { this.fail('no_key'); throw err('auth_relay_no_key', 'API 키가 없습니다. 설정 › 런처의 API 키 칸에 넣으세요.', 'authRelay.err.noKey'); }
    if (!this.starting) this.starting = this.start().finally(() => { this.starting = null; this.changed(); });
    await this.starting;
    return this.status();
  }
  async start() {
    this.stopping = false;
    let r = await this.spawnOnce(this.state.port);
    if (!r.ok && r.why === 'port_in_use' && this.state.port) { this.log(`auth relay: port ${this.state.port} in use, picking a new one`); r = await this.spawnOnce(0); }
    if (!r.ok) { this.fail(r.why); throw err('auth_relay_down', `API 중계기를 띄우지 못했습니다 (${r.why})`, 'authRelay.err.start', { why: r.why }); }
    const moved = this.state.port && this.state.port !== r.port;
    this.state.port = r.port; this.saveState();
    this.startedAt = this.now(); this.lastError = null;
    this.log(`auth relay: listening on 127.0.0.1:${r.port} pid=${this.child.pid}`);
    if (moved) try { this.onMoved((sid) => relayUrl({ port: this.port, secret: this.state.secret, sessionId: sid })); } catch (e) { this.log(`auth relay: moved hook failed: ${e.message}`); }
  }
  spawnOnce(port) {
    return new Promise((resolve) => {
      let p;
      try { p = spawn(this.node, [CHILD], { env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); }
      catch (e) { return resolve({ ok: false, why: 'spawn_failed' }); }
      let done = false; let buf = '';
      const finish = (x) => { if (done) return; done = true; clearTimeout(t); resolve(x); };
      const t = setTimeout(() => { try { p.kill(); } catch {} finish({ ok: false, why: 'timeout' }); }, READY_MS);
      p.stdout.setEncoding('utf8');
      p.stdout.on('data', (c) => {
        buf += c; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          let m; try { m = JSON.parse(line); } catch { continue; }
          if (m.t === 'ready') { this.child = p; this.port = m.port; finish({ ok: true, port: m.port }); }
          else if (m.t === 'fatal') finish({ ok: false, why: String(m.why || 'fatal').slice(0, 40) });
          else if (m.t === 'req') this.record(m);
        }
      });
      p.stderr.on('data', () => {}); // 자식 오류 글은 읽지 않는다(값이 섞일 일은 없지만 남기지 않는다)
      p.on('error', () => finish({ ok: false, why: 'spawn_failed' }));
      p.on('exit', (code) => { finish({ ok: false, why: `exit_${code}` }); if (this.child === p) this.died(code); });
      p.stdin.write(JSON.stringify({ keyFile: this.keyFile, port, secret: this.state.secret, ...(this.upstream ? { upstream: this.upstream } : {}) }) + '\n');
    });
  }
  record(m) {
    const { t, ...rec } = m; // eslint-disable-line no-unused-vars
    if (rec.refused) this.refused++; else this.requests++;
    if (rec.status >= 400 || rec.err) this.fail(rec.err || rec.refused || `http_${rec.status}${rec.errType ? `:${rec.errType}` : ''}`);
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      try { if (fs.statSync(this.logFile).size > LOG_MAX) fs.renameSync(this.logFile, this.logFile + '.1'); } catch {}
      fs.appendFileSync(this.logFile, JSON.stringify(rec) + '\n');
    } catch {}
    this.changed();
  }
  recent(limit = 20) {
    try { return fs.readFileSync(this.logFile, 'utf8').trim().split('\n').filter(Boolean).slice(-limit).map((l) => JSON.parse(l)); } catch { return []; }
  }
  died(code) {
    this.child = null; this.port = null;
    if (this.stopping) return;
    this.fail(`exit_${code}`);
    const now = this.now();
    this.deaths = [...this.deaths.filter((x) => now - x < 60000), now];
    const again = this.deaths.length <= 3 && this.keyPresent();
    this.log(`auth relay: exited (code ${code})${again ? ', restarting' : ''}`);
    try { this.onNotice({ kind: again ? 'restarted' : 'down', code }); } catch {}
    this.changed();
    if (again) { const tm = setTimeout(() => this.ensure().catch((e) => this.log(`auth relay: restart failed: ${e.message}`)), 1000); if (tm.unref) tm.unref(); }
  }
  async stop() {
    this.stopping = true;
    const p = this.child; this.child = null; this.port = null;
    if (!p) return;
    await new Promise((r) => { const t = setTimeout(r, 2000); p.once('exit', () => { clearTimeout(t); r(); }); try { p.stdin.end(); } catch {} try { p.kill(); } catch {} });
    this.changed();
  }
}
