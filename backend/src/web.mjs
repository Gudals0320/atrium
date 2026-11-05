// P48(원격 R2): 백엔드가 창 화면(app/dist)을 같은 포트의 HTTP로 내주고, 브라우저를 짝 맺어 판 API를 쓰게 한다(P56부터 패스키 로그인 세션으로).
// - 화면: GET /(index.html), /renderer.js 등. index.html·renderer.*는 ETag로 다시 확인(no-cache), fonts/는 이름에 해시가 있어 오래 둔다. gzip을 받으면 줄여 보낸다.
// - 짝 맺기: PC 창(판 API 토큰 클라이언트)이 만든 일회용 코드를 넣거나(POST /web/pair/code), 브라우저가 허락을 청하고(POST /web/pair/request) PC 창이 허락하면
//   몇 분 동안 한 번만 쓰는 등록 허가를 받는다(GET /web/pair/poll). P56: 그 브라우저에서 패스키를 등록해야(POST /web/passkey/register) 기기가 생긴다(web-auth.mjs).
// - P56 로그인: 패스키로 서명하면(POST /web/passkey/login) 세션을 HttpOnly 쿠키로 준다. WebSocket /api와 /web/me, /web/upload는 이 쿠키로만 인증한다.
//   옛 기기 토큰(?device=, Authorization: Bearer)은 받지 않는다. 판 API 토큰(backend.json)은 브라우저에 내주지 않는다.
// - 막기: Host는 127.0.0.1·localhost(그 포트)와 ATRIUM_WEB_HOSTS만 받는다(DNS 다시 묶기). 기기 연결은 Origin이 그 주소여야 한다.
//   hook(/hooks/claude)과 하위 세션 명령(/branch/*)은 이 PC의 프로세스만 부른다(isLocalProcess: Host 127.0.0.1, Origin·전달 머리글 없음).
// - 폴더 목록(fs.roots, fs.list)과 업로드(데이터 폴더 uploads/, 크기 상한, 오래된 것 지우기)는 웹 화면의 폴더 탐색기와 붙여넣기가 쓴다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { BACKEND_ROOT, envVar } from './config.mjs';
import { loginAllowed, parseLogins, isRemoteRequest, diagnose, requestAddr, nodeCheck, whoisMatch, needsRepair } from './tailscale.mjs'; // P49(R3), P57(기기 확인)
import { WebAuth, sessionIdOf, sessionCookie, clearCookies, isHttpsOrigin } from './web-auth.mjs'; // P56(S2·S3)

export const PAIR_CODE_TTL_MS = 5 * 60_000;
export const PAIR_REQUEST_TTL_MS = 2 * 60_000;
export const PAIR_FAIL_WINDOW_MS = 10 * 60_000;
export const PAIR_FAIL_PER_IP = 5; // 10분에 한 곳에서 틀릴 수 있는 횟수
export const PAIR_FAIL_GLOBAL = 20; // 10분에 모두 합쳐 틀릴 수 있는 횟수
export const PAIR_CODE_MAX_FAILS = 5; // 지금 코드가 이만큼 틀리면 그 코드를 버린다
export const PAIR_REQUESTS_PENDING_MAX = 3;
export const PAIR_REQUESTS_PER_WINDOW = 10;
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const UPLOAD_MAX_AGE_MS = 7 * 24 * 3600_000;
export const UPLOAD_MAX_TOTAL = 500 * 1024 * 1024;
export const LIST_MAX = 1000;
const DEVICES_KEY = 'webDevices';
const TOUCH_EVERY_MS = 60_000;

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const clipName = (s, n = 40) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const apiErr = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
// P57: 기기 기록에 둘 Tailscale 기기(바깥에서 짝 맺음) 또는 이 PC 안 표시
const nodeRecord = (n) => (n && n.id ? { origin: 'tailscale', tsNode: { id: String(n.id), name: clipName(n.name, 80) || null, login: n.login ? String(n.login) : null } } : { origin: 'local' });
const NODE_REPAIR = new Set(['not_bound', 'local_only', 'other_node', 'other_user']);
const NODE_MSG = {
  not_bound: 'this device was paired before devices were bound to a Tailscale device; pair it again',
  local_only: 'this device was paired on this PC and can be used only on this PC',
  other_node: 'this device was paired from a different Tailscale device',
  other_user: 'this device was paired by a different Tailscale user',
  login_mismatch: 'the Tailscale user does not match the requesting device',
};
// 기기 확인 실패: 묶인 기기와 다르면 401(브라우저가 토큰을 버리고 짝 맺기 화면으로), whois를 못 읽거나 맞지 않으면 403
const nodeErr = (reason) => apiErr('tailscale_node', NODE_MSG[reason] || 'the requesting Tailscale device could not be verified', NODE_REPAIR.has(reason) ? 401 : 403);
// 짝 맺기 요청을 보낸 곳과 토큰을 받으러 온 곳이 같은가(이 PC 안끼리, 같은 Tailscale 기기끼리)
const sameNode = (a, b) => (a && a.id ? !!(b && b.id) && safeEq(a.id, b.id) : !(b && b.id));

// ---------- 기기(P56: 패스키의 공개 키를 판 기록에 둔다) ----------
// 옛 기기(P48~P55의 토큰 기기, hash만 있고 passkey가 없다)는 더 쓸 수 없다. 목록에 needsRepair로 보이고 PC에서 지운다
// P57: 패스키가 있어도 Tailscale 기기 기록(origin)이 없으면 다시 짝 맺어야 한다(needsRepair, 막는 쪽)
export const devicePub = ({ hash, passkey, ...d }) => ({ ...d, needsRepair: !passkey || needsRepair(d), passkey: passkey ? { rpId: passkey.rpId, alg: passkey.alg, createdAt: passkey.createdAt, lastUsedAt: passkey.lastUsedAt || null, backupEligible: !!passkey.backupEligible } : null });
export class Devices {
  constructor({ store, now = Date.now }) { this.store = store; this.now = now; }
  all() { return this.store.getMeta(DEVICES_KEY) || []; }
  save(list) { this.store.setMeta(DEVICES_KEY, list); }
  // 화면에 보일 목록(해시와 공개 키는 빼고)
  list() { return this.all().map(devicePub); }
  get(id) { const d = this.all().find((x) => x.id === id); return d ? devicePub(d) : null; }
  // extra: 다른 단계가 짝 맺기에서 더하는 필드(그대로 둔다). P57: 등록 허가의 extra = nodeRecord(짝 맺은 Tailscale 기기) → origin, tsNode
  add({ name, via, userAgent, passkey, extra = {} }) {
    const d = { ...extra, id: crypto.randomUUID(), name: clipName(name) || 'Browser', via, userAgent: clipName(userAgent, 160), createdAt: this.now(), lastSeenAt: null, passkey };
    this.save([...this.all(), d]);
    return devicePub(d);
  }
  // credential ID(비밀 아님)로 기기 기록을 찾는다(공개 키가 든 원래 기록)
  byCred(credId) {
    if (!credId || typeof credId !== 'string') return null;
    return this.all().find((x) => x.passkey && typeof x.passkey.credId === 'string' && safeEq(x.passkey.credId, credId)) || null;
  }
  setPasskey(id, patch) { const list = this.all(); const d = list.find((x) => x.id === id); if (!d || !d.passkey) return false; Object.assign(d.passkey, patch); this.save(list); return true; }
  touch(id, force = false) {
    const list = this.all(); const d = list.find((x) => x.id === id);
    if (!d) return;
    const t = this.now();
    if (!force && d.lastSeenAt && t - d.lastSeenAt < TOUCH_EVERY_MS) return;
    d.lastSeenAt = t; this.save(list);
  }
  revoke(id) {
    const list = this.all(); const d = list.find((x) => x.id === id);
    if (!d) return false;
    this.save(list.filter((x) => x.id !== id));
    return true;
  }
  rename(id, name) { const list = this.all(); const d = list.find((x) => x.id === id); if (!d || !clipName(name)) return false; d.name = clipName(name); this.save(list); return true; }
}

// ---------- 짝 맺기(일회용 코드, 허락 요청, 횟수 제한) ----------
export class Pairing {
  // P56: 짝 맺기에 성공하면 기기 대신 등록 허가(grants.issue)를 준다
  constructor({ devices, grants, now = Date.now, onChange = () => {} }) {
    this.devices = devices; this.grants = grants; this.now = now; this.onChange = onChange;
    this.code = null; // { code, expiresAt, fails }
    this.requests = new Map(); // id → { id, secretHash, name, ip, userAgent, origin, createdAt, expiresAt, status, grant? }
    this.fails = []; // [{ at, ip }]
    this.requestTimes = [];
  }
  // PC 창이 만든다. 이전 코드는 버린다
  newCode() {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    this.code = { code, expiresAt: this.now() + PAIR_CODE_TTL_MS, fails: 0 };
    this.onChange();
    return { code, expiresAt: this.code.expiresAt };
  }
  currentCode() { const c = this.code; return c && c.expiresAt > this.now() ? { code: c.code, expiresAt: c.expiresAt } : null; }
  cancelCode() { this.code = null; this.onChange(); }
  // 틀린 시도. 10분 창 안에서 그곳·모두의 횟수를 센다
  limited(ip) {
    const t = this.now();
    this.fails = this.fails.filter((f) => t - f.at < PAIR_FAIL_WINDOW_MS);
    const mine = this.fails.filter((f) => f.ip === ip);
    if (mine.length >= PAIR_FAIL_PER_IP || this.fails.length >= PAIR_FAIL_GLOBAL) {
      const oldest = (mine.length >= PAIR_FAIL_PER_IP ? mine : this.fails)[0];
      return { retryAfterMs: PAIR_FAIL_WINDOW_MS - (t - oldest.at) };
    }
    return null;
  }
  // P57: tsNode = 짝 맺기를 청한 Tailscale 기기(이 PC 안이면 null). 허가의 extra로 넘겨 패스키 등록 때 기기 기록에 넣는다
  redeem({ code, name, ip, userAgent, origin, tsNode = null }) {
    const lim = this.limited(ip);
    if (lim) throw Object.assign(apiErr('rate_limited', 'too many pairing attempts', 429), { retryAfterMs: lim.retryAfterMs });
    const c = this.code;
    const ok = c && c.expiresAt > this.now() && typeof code === 'string' && /^\d{6}$/.test(code.trim()) && safeEq(c.code, code.trim());
    if (!ok) {
      this.fails.push({ at: this.now(), ip });
      if (c) { c.fails++; if (c.fails >= PAIR_CODE_MAX_FAILS || c.expiresAt <= this.now()) { this.code = null; this.onChange(); } }
      throw apiErr(c && c.expiresAt > this.now() ? 'bad_code' : 'no_code', 'the code is wrong or expired', 403);
    }
    this.code = null; // 한 번만
    const r = this.grants.issue({ name: clipName(name) || 'Browser', via: 'code', userAgent: clipName(userAgent, 160), origin, extra: nodeRecord(tsNode) });
    this.onChange();
    return r;
  }
  sweep() {
    const t = this.now();
    let changed = false;
    for (const [id, r] of this.requests) {
      if (r.status === 'pending' && r.expiresAt <= t) { r.status = 'expired'; changed = true; }
      if (t - r.createdAt > PAIR_REQUEST_TTL_MS * 3) { this.requests.delete(id); changed = true; }
    }
    if (this.code && this.code.expiresAt <= t) { this.code = null; changed = true; }
    if (changed) this.onChange();
  }
  request({ name, ip, userAgent, origin, tsNode = null }) {
    this.sweep();
    const t = this.now();
    this.requestTimes = this.requestTimes.filter((x) => t - x < PAIR_FAIL_WINDOW_MS);
    const pending = [...this.requests.values()].filter((r) => r.status === 'pending');
    if (pending.length >= PAIR_REQUESTS_PENDING_MAX || this.requestTimes.length >= PAIR_REQUESTS_PER_WINDOW) throw apiErr('rate_limited', 'too many pairing requests', 429);
    this.requestTimes.push(t);
    const id = crypto.randomUUID();
    const secret = crypto.randomBytes(24).toString('base64url');
    // 짧은 확인 글자: PC 창과 브라우저에 같이 보여 맞는 기기인지 사람이 견준다
    const check = String(crypto.randomInt(0, 10_000)).padStart(4, '0');
    this.requests.set(id, { id, secretHash: sha256(secret), name: clipName(name) || 'Browser', ip, userAgent: clipName(userAgent, 160), origin, createdAt: t, expiresAt: t + PAIR_REQUEST_TTL_MS, status: 'pending', check, tsNode: tsNode && tsNode.id ? tsNode : null });
    this.onChange();
    return { requestId: id, secret, check, expiresAt: t + PAIR_REQUEST_TTL_MS };
  }
  pending() { this.sweep(); return [...this.requests.values()].filter((r) => r.status === 'pending').map(({ id, name, ip, userAgent, createdAt, expiresAt, check, tsNode }) => ({ id, name, ip, userAgent, createdAt, expiresAt, check, tsNode: tsNode ? { name: tsNode.name, login: tsNode.login } : null })); }
  decide(id, allow) {
    this.sweep();
    const r = this.requests.get(id);
    if (!r || r.status !== 'pending') throw apiErr('not_found', 'no such pending request', 404);
    if (allow) { const x = this.grants.issue({ name: r.name, via: 'approve', userAgent: r.userAgent, origin: r.origin, extra: nodeRecord(r.tsNode) }); r.status = 'approved'; r.grant = x; }
    else r.status = 'denied';
    this.onChange();
    return { status: r.status };
  }
  // 브라우저가 묻는다. 허락된 등록 허가는 한 번만 내준다
  // P57: tsNode = 지금 묻는 Tailscale 기기(이 PC 안이면 null). 요청을 보낸 곳과 다르면 없는 요청처럼 다룬다
  poll(id, secret, tsNode = null) {
    this.sweep();
    const r = this.requests.get(String(id || ''));
    if (!r || !safeEq(r.secretHash, sha256(secret || ''))) throw apiErr('not_found', 'no such request', 404);
    if (!sameNode(r.tsNode, tsNode)) throw apiErr('not_found', 'no such request', 404);
    if (r.status === 'approved' && r.grant) { const g = r.grant; r.grant = null; r.status = 'taken'; return { status: 'approved', grant: g.grant, expiresAt: g.expiresAt }; }
    return { status: r.status === 'taken' ? 'expired' : r.status };
  }
}

// ---------- Host·Origin ----------
export function allowedHosts(port, extra = envVar('WEB_HOSTS') || '') {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  for (const h of String(extra).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)) hosts.add(h);
  return hosts;
}
export const hostOk = (req, hosts) => hosts.has(String(req.headers.host || '').toLowerCase());
// 기기 연결: Origin이 꼭 있고 받는 주소와 같아야 한다
export function originOk(req, hosts) {
  const o = req.headers.origin;
  if (!o) return false;
  try { const u = new URL(o); return (u.protocol === 'http:' || u.protocol === 'https:') && hosts.has(u.host.toLowerCase()); } catch { return false; }
}
const FORWARD_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip'];
// 이 PC의 프로세스가 직접 부른 요청인지(브라우저도, 앞단 프록시를 거친 것도 아니다). hook·branch·판 API 토큰 연결이 쓴다.
// allowFileOrigin: Electron 창(file:// 페이지)의 WebSocket은 Origin "file://"(또는 "null")을 보낸다
export function isLocalProcess(req, port, { allowFileOrigin = false } = {}) {
  const h = req.headers;
  if (String(h.host || '').toLowerCase() !== `127.0.0.1:${port}` && String(h.host || '').toLowerCase() !== `localhost:${port}`) return false;
  if (FORWARD_HEADERS.some((k) => h[k] != null) || Object.keys(h).some((k) => k.startsWith('tailscale-'))) return false;
  const a = req.socket && req.socket.remoteAddress;
  if (a && !/^(127\.|::1$|::ffff:127\.)/.test(a)) return false;
  if (h.origin != null) return allowFileOrigin && (h.origin === 'file://' || h.origin === 'null');
  if (h['sec-fetch-site'] != null) return false; // 브라우저가 보낸 요청
  return true;
}
export function clientIp(req) {
  const a = (req.socket && req.socket.remoteAddress) || '';
  const xf = req.headers['x-forwarded-for'];
  if (xf && /^(127\.|::1$|::ffff:127\.)/.test(a)) return String(xf).split(',')[0].trim(); // 이 PC의 앞단 프록시(R3)가 넣은 값만 믿는다
  return a;
}

// ---------- 화면 파일 ----------
export const WEB_DIST = () => path.resolve(envVar('WEB_DIST') || path.join(BACKEND_ROOT, '..', 'app', 'dist'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8' }; // P49: PWA 매니페스트
const ZIP = new Set(['.html', '.js', '.css', '.map', '.json', '.svg', '.txt', '.webmanifest']);
export function cacheControl(rel) {
  if (/^fonts\//.test(rel)) return 'public, max-age=31536000, immutable'; // 이름에 해시가 있다(build.mjs assetNames)
  return 'no-cache'; // ETag로 다시 확인한다. 바뀌지 않았으면 304
}
const SECURITY_HEADERS = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'cross-origin-opener-policy': 'same-origin' };
const NO_BUILD = `<!doctype html><html><head><meta charset="utf-8"><title>Atrium</title><style>body{background:#070705;color:#e9e6dc;font:15px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;height:100vh}div{max-width:520px;padding:24px}code{background:#1d1c18;padding:2px 6px;border-radius:4px}</style></head>
<body><div><h2>The board screen is not built</h2><p>The backend serves the window from <code>app/dist</code>, which does not exist yet. On the PC, run <code>cd app &amp;&amp; npm run build</code>, then reload this page.</p>
<h2>화면 빌드가 없습니다</h2><p>백엔드는 <code>app/dist</code>의 화면을 내줍니다. PC에서 <code>cd app &amp;&amp; npm run build</code>를 실행한 뒤 이 페이지를 다시 엽니다.</p></div></body></html>`;

export class StaticFiles {
  constructor(dir) { this.dir = dir; this.zipped = new Map(); }
  built() { return fs.existsSync(path.join(this.dir, 'index.html')); }
  // 처리했으면 true
  serve(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    if (rel === '') rel = 'index.html';
    if (!/^[A-Za-z0-9._\-/]+$/.test(rel) || rel.split('/').some((p) => p === '..' || p === '' || p.startsWith('.'))) return false;
    const file = path.resolve(this.dir, rel);
    if (!file.startsWith(path.resolve(this.dir) + path.sep)) return false;
    if (!this.built()) {
      if (rel !== 'index.html') return false;
      res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS }); res.end(NO_BUILD); return true;
    }
    let st; try { st = fs.statSync(file); } catch { return false; }
    if (!st.isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const head = { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': cacheControl(rel), etag, ...SECURITY_HEADERS };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return true; }
    let body = fs.readFileSync(file);
    if (ZIP.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || '')) && body.length > 1024) {
      const k = `${file}|${etag}`;
      if (!this.zipped.has(k)) { for (const key of this.zipped.keys()) if (key.startsWith(`${file}|`)) this.zipped.delete(key); this.zipped.set(k, zlib.gzipSync(body)); }
      body = this.zipped.get(k); head['content-encoding'] = 'gzip'; head.vary = 'accept-encoding';
    }
    head['content-length'] = body.length;
    res.writeHead(200, head); res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }
}

// ---------- 폴더 목록 ----------
// 드라이브는 GetLogicalDrives(DriveInfo)로 읽는다. 글자마다 existsSync로 보면 끊긴 네트워크 드라이브에서 수십 초 멈춘다. 1분 동안 기억한다
let drivesCache = null;
export function parseDrives(out) { return String(out || '').split(/\r?\n/).map((x) => x.trim()).filter((x) => /^[A-Za-z]:\\$/.test(x)).map((x) => x.toUpperCase()); }
export async function driveRoots({ platform = process.platform, run = runDriveInfo, now = Date.now(), fresh = false } = {}) {
  if (platform !== 'win32') return ['/'];
  if (!fresh && drivesCache && now - drivesCache.at < 60_000) return drivesCache.list;
  let list = [];
  try { list = parseDrives(await run()); } catch {}
  if (!list.length) list = [path.parse(os.homedir()).root.toUpperCase()];
  drivesCache = { at: now, list };
  return list;
}
function runDriveInfo() {
  return new Promise((res, rej) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[System.IO.DriveInfo]::GetDrives() | ForEach-Object { $_.Name }'], { timeout: 8000, windowsHide: true }, (e, out) => (e ? rej(e) : res(out))));
}
export function listDirs(p, { max = LIST_MAX } = {}) {
  if (typeof p !== 'string' || !p.trim()) throw apiErr('bad_path', 'path is required');
  if (!path.isAbsolute(p.trim())) throw apiErr('bad_path', 'path must be absolute');
  const dir = path.resolve(p.trim());
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { throw Object.assign(apiErr(e.code === 'ENOENT' ? 'not_found' : 'unreadable', `cannot read ${dir}: ${e.code || e.message}`), { path: dir }); }
  const dirs = [];
  for (const e of ents) {
    let isDir = e.isDirectory();
    if (!isDir && e.isSymbolicLink()) { try { isDir = fs.statSync(path.join(dir, e.name)).isDirectory(); } catch {} }
    if (!isDir) continue;
    if (/^\$|^System Volume Information$/i.test(e.name)) continue; // Windows 시스템 폴더
    dirs.push({ name: e.name, path: path.join(dir, e.name), hidden: e.name.startsWith('.') });
  }
  dirs.sort((a, b) => (a.hidden - b.hidden) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  const parent = path.dirname(dir);
  return { path: dir, parent: parent === dir ? null : parent, dirs: dirs.slice(0, max), truncated: dirs.length > max, total: dirs.length };
}

// ---------- 업로드 ----------
export function safeUploadName(name, contentType = '') {
  let base = path.basename(String(name || '').replace(/\\/g, '/')).normalize('NFC');
  base = base.replace(/[^\p{L}\p{N}._\- ()]/gu, '_').replace(/\s+/g, ' ').replace(/^[.\s]+/, '').trim();
  if (!base) {
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'text/plain': '.txt', 'application/pdf': '.pdf' }[String(contentType).split(';')[0].trim()] || '.bin';
    base = `pasted${ext}`;
  }
  if (base.length > 80) { const ext = path.extname(base).slice(0, 12); base = base.slice(0, 80 - ext.length) + ext; }
  return base;
}
export function uploadPath(dir, name, contentType, now = new Date()) {
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
  return path.join(dir, `${stamp}-${crypto.randomBytes(3).toString('hex')}-${safeUploadName(name, contentType)}`);
}
// 오래된 것과 총량이 넘친 만큼(오래된 것부터) 지운다
export function cleanupUploads(dir, { maxAgeMs = UPLOAD_MAX_AGE_MS, maxTotal = UPLOAD_MAX_TOTAL, now = Date.now(), keep = null } = {}) {
  let files;
  try { files = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => { const f = path.join(dir, e.name); const st = fs.statSync(f); return { f, size: st.size, mtime: st.mtimeMs }; }); } catch { return { removed: 0 }; }
  files.sort((a, b) => a.mtime - b.mtime);
  let total = files.reduce((n, x) => n + x.size, 0), removed = 0;
  for (const x of files) {
    if (x.f === keep) continue;
    if (now - x.mtime > maxAgeMs || total > maxTotal) { try { fs.rmSync(x.f, { force: true }); total -= x.size; removed++; } catch {} }
  }
  return { removed, total };
}

// ---------- 묶음: 백엔드에 붙인다 ----------
export class WebServer {
  // api: ApiServer(clients, dropWhere), boot: () => 웹 창의 시작 값(프로필 등)
  // P49: tailscale(TailscaleWatch)가 있으면 이 PC의 Tailscale 이름을 Host 허용 목록에 저절로 넣고 로그인 사용자를 제한한다. settings()는 판 설정(remoteSameUser, remoteAllowedLogins)
  constructor({ cfg, store, api, log = () => {}, recentDirs = () => [], now = Date.now, tailscale = null, settings = () => ({}) }) {
    this.cfg = cfg; this.api = api; this.log = log; this.recentDirs = recentDirs; this.now = now; this.tailscale = tailscale; this.settings = settings;
    this.baseHosts = allowedHosts(cfg.port);
    this.devices = new Devices({ store, now });
    // P56: 패스키와 세션. 수명은 판 설정(remoteSessionHours, remoteIdleMinutes). 연결이 열린 세션은 끊긴 시간을 세지 않는다
    this.auth = new WebAuth({ store, devices: this.devices, now, log, connected: (h) => !!this.api && [...this.api.clients].some((c) => c.auth && c.auth.session === h), limits: () => this.sessionLimits() });
    this.pairing = new Pairing({ devices: this.devices, grants: this.auth.grants, now, onChange: () => this.broadcastLocal() });
    this.files = new StaticFiles(WEB_DIST());
    this.uploadDir = path.join(cfg.dataDir, 'uploads');
    try { cleanupUploads(this.uploadDir); } catch {}
    this.sweepTimer = setInterval(() => { this.pairing.sweep(); this.sweepSessions(); }, 15_000); this.sweepTimer.unref();
  }
  sessionLimits() {
    let st = {}; try { st = this.settings() || {}; } catch {}
    // P56 창 시험만: 개발용 판에서 세션 수명을 초로 줄인다(만료 뒤 다시 확인을 보려고). 실제 판은 이 값을 읽지 않는다
    const testSec = this.cfg.profile === 'dev' ? Number(envVar('WEB_SESSION_TEST_SEC')) : NaN;
    return { maxAgeMs: testSec > 0 ? testSec * 1000 : Number(st.remoteSessionHours) * 3600_000, idleMs: Number(st.remoteIdleMinutes) * 60_000 };
  }
  stop() { clearInterval(this.sweepTimer); }
  // P49: 허용 Host = 127.0.0.1·localhost(그 포트), ATRIUM_WEB_HOSTS, 이 PC의 Tailscale 이름
  get hosts() { const ts = this.tailscale ? this.tailscale.hosts() : []; if (!ts.length) return this.baseHosts; return new Set([...this.baseHosts, ...ts]); }
  policy() {
    let st = {}; try { st = this.settings() || {}; } catch {}
    return { sameUser: st.remoteSameUser !== false, allowed: parseLogins(st.remoteAllowedLogins), self: this.tailscale ? this.tailscale.selfLogin() : null, tsHosts: this.tailscale ? this.tailscale.hosts() : [] };
  }
  // P49: atrium remote status와 설정의 연결된 기기 탭이 보이는 진단
  async remoteStatus({ fresh = false } = {}) {
    const ts = this.tailscale ? (fresh ? await this.tailscale.refresh() : this.tailscale.last) : { installed: false, disabled: true };
    const pol = this.policy();
    return { ...diagnose(ts, { port: this.cfg.port, hosts: [...this.hosts], devices: this.devices.all().length, unbound: this.devices.all().filter(needsRepair).length, built: this.files.built(), sameUser: pol.sameUser, allowed: pol.allowed }), port: this.cfg.port, sameUser: pol.sameUser, allowed: pol.allowed };
  }
  url() { return `http://localhost:${this.cfg.port}/`; } // P56: 패스키는 IP 주소에서 쓰지 못한다(RP ID는 이름)
  status() { return { url: this.url(), built: this.files.built(), devices: this.devices.all().length, hosts: [...this.hosts] }; }
  boot(device) {
    const dev = this.cfg.profile === 'dev';
    return { device, port: this.cfg.port, profile: this.cfg.profile, herdrSession: this.cfg.herdrSession, defaultCwd: dev ? path.join(BACKEND_ROOT, '.dev', 'proj') : os.homedir(), defaultModel: dev ? 'haiku' : '' };
  }
  // 판 API 토큰 클라이언트(PC 창, CLI)에만: 기기 목록과 허락 요청
  view() { return { devices: this.devices.list().map((d) => ({ ...d, sessions: this.auth.sessions.countFor(d.id) })), requests: this.pairing.pending(), code: this.pairing.currentCode() }; }
  broadcastLocal() {
    if (!this.api) return;
    const v = this.view();
    for (const c of this.api.clients) if (c.subscribed && !(c.auth && c.auth.device)) c.sendEvent('device.updated', v);
    // 기기에는 목록만(코드와 요청은 보이지 않는다)
    for (const c of this.api.clients) if (c.subscribed && c.auth && c.auth.device) c.sendEvent('device.updated', { devices: v.devices });
  }

  // P57: 바깥 요청이면 요청한 Tailscale 기기를 whois로 읽는다(주소마다 잠깐 기억). 이 PC 안 요청은 null. 못 읽으면 { ok: false }
  async whoisOf(req) {
    if (!isRemoteRequest(req, this.cfg.port)) return null;
    const addr = requestAddr(req);
    if (!addr) return { ok: false, reason: 'bad_addr' };
    if (!this.tailscale || typeof this.tailscale.whois !== 'function') return { ok: false, reason: 'disabled' };
    try { return await this.tailscale.whois(addr); } catch { return { ok: false, reason: 'whois_failed' }; }
  }
  // P57: 자격(P56 세션, 패스키 서명) 확인 다음의 기기 확인. 바깥 요청은 기록의 tsNode와 지금 요청한 기기가 같아야 한다. 막으면 까닭만 로그에 남긴다
  async checkNode(req, device, what) {
    const r = nodeCheck(req, device, await this.whoisOf(req), this.cfg.port);
    if (!r.ok) this.log(`web ${what} refused: tailscale node ${r.reason} (device ${device.id})`);
    return r;
  }
  // P57: 짝 맺기의 기기 확인. 바깥이면 whois가 맞아야 하고, 그 기기({ id, name, login })를 기록에 둔다. 이 PC 안이면 node: null
  async pairNode(req, what) {
    const w = await this.whoisOf(req);
    if (w === null) return { ok: true, reason: null, node: null };
    const m = whoisMatch(req, w);
    if (!m.ok) this.log(`web ${what} refused: tailscale node ${m.reason}`);
    return m;
  }

  // WebSocket /api 연결 허락. 판 API 토큰(이 PC의 프로세스) 또는 P56 세션 쿠키(브라우저, 같은 출처). null이면 막는다
  // P57: 바깥 기기 연결은 whois를 기다려야 하므로 약속(Promise)을 돌려준다(ApiServer.handleUpgrade가 기다린다)
  authorize(req, apiToken) {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname !== '/api') return null;
    const token = u.searchParams.get('token');
    if (token != null) return safeEq(token, apiToken) && isLocalProcess(req, this.cfg.port, { allowFileOrigin: true }) ? { kind: 'local' } : null;
    if (u.searchParams.has('device')) { this.log('web connect refused: device tokens are no longer accepted (pair again with a passkey)'); return null; }
    const sid = sessionIdOf(req, this.cfg.port);
    if (sid) {
      const hosts = this.hosts;
      if (!hostOk(req, hosts) || !originOk(req, hosts)) return null;
      const lg = loginAllowed(req, this.policy()); // P49: 다른 Tailscale 사용자는 세션이 있어도 막는다
      if (!lg.ok) { this.log(`web connect refused: tailscale user ${lg.reason}`); return null; }
      const s = this.auth.sessions.check(sid);
      const d = s && this.devices.get(s.deviceId);
      if (!d || d.needsRepair) { this.log('web connect refused: no live session'); return null; }
      const remote = isRemoteRequest(req, this.cfg.port);
      const accept = (node) => {
        if (!this.auth.sessions.valid(s.hash)) return null; // whois를 기다리는 사이에 세션이 끝났으면
        this.auth.sessions.touch(s.hash);
        this.devices.touch(d.id, true);
        setImmediate(() => this.broadcastLocal()); // 마지막 접속을 PC 창 목록에
        return { kind: 'device', device: { id: d.id, name: d.name }, session: s.hash, remote, login: lg.login, ...(node ? { tsNode: { id: node.id, name: node.name } } : {}) };
      };
      if (!remote) return accept(null);
      return this.checkNode(req, d, 'connect').then((r) => (r.ok ? accept(r.node) : null), () => null); // P57: 자격(세션) 확인 다음에 기기 확인
    }
    return null;
  }
  // P56: 세션이 끝난 연결을 닫는다(4401). 웹 화면은 다시 확인 화면으로 간다
  closeSession(pred, reason) {
    if (!this.api) return 0;
    let n = 0;
    for (const c of [...this.api.clients]) if (c.auth && c.auth.session && pred(c.auth.session, c)) { try { c.ws.close(4401, reason); n++; } catch {} }
    return n;
  }
  sweepSessions() {
    this.auth.sweep();
    return this.closeSession((h) => !this.auth.sessions.valid(h), 'session ended');
  }
  // 쿠키의 세션과 그 기기. 없으면 401
  sessionOf(req) {
    const s = this.auth.sessions.check(sessionIdOf(req, this.cfg.port));
    const d = s && this.devices.get(s.deviceId);
    if (!d) throw apiErr('login_required', 'sign in with the passkey', 401);
    // 다시 짝 맺어야 하는 기기는 다시 확인해도 소용없다(다시 확인 ↔ 거부 고리를 만들지 않게 짝 맺기 화면으로)
    if (d.needsRepair) throw nodeErr('not_bound');
    return { device: d, session: s };
  }
  // 기기를 끊으면 그 기기의 연결을 곧바로 닫는다(4401)
  revoke(id) {
    const ok = this.devices.revoke(id);
    if (ok) this.auth.sessions.endDevice(id); // P56: 그 기기의 세션도 모두 끝난다
    if (ok && this.api) for (const c of [...this.api.clients]) if (c.auth && c.auth.device && c.auth.device.id === id) { try { c.ws.close(4401, 'device revoked'); } catch {} }
    if (ok) this.broadcastLocal();
    return ok;
  }

  // HTTP. 처리했으면 true
  handleHttp(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const p = url.pathname;
    const isWeb = p.startsWith('/web/');
    const isStatic = !isWeb && (req.method === 'GET' || req.method === 'HEAD') && !p.startsWith('/hooks/') && !p.startsWith('/branch/') && p !== '/health' && p !== '/api';
    if (!isWeb && !isStatic) return false;
    if (!hostOk(req, this.hosts)) { res.writeHead(421, { 'content-type': 'text/plain' }); res.end('misdirected request'); return true; }
    if (isStatic) return this.files.serve(req, res);
    const send = (status, obj, extra = {}) => { if (res.headersSent) return; res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS, ...extra }); res.end(JSON.stringify(obj)); };
    const fail = (e) => send(e.status || 400, { error: { code: e.code || 'error', message: e.message, ...(e.retryAfterMs ? { retryAfterMs: e.retryAfterMs } : {}) } }, e.retryAfterMs ? { 'retry-after': String(Math.ceil(e.retryAfterMs / 1000)) } : {});
    // 브라우저에서 온 요청은 같은 출처여야 한다(다른 사이트가 짝 맺기를 시도하거나 올리지 못하게)
    if (req.headers.origin != null ? !originOk(req, this.hosts) : req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') { fail(apiErr('bad_origin', 'cross-origin request', 403)); return true; }
    // P49: Tailscale로 온 요청은 이 PC의 Tailscale 사용자(또는 허용 목록)만 짝 맺고 쓴다
    const lg = loginAllowed(req, this.policy());
    if (!lg.ok) { fail(apiErr('tailscale_user', lg.reason === 'no_login' ? 'this Tailscale device has no user login (tagged device or funnel)' : 'this Tailscale user is not allowed on this board', 403)); return true; }
    const ua = String(req.headers['user-agent'] || '');
    const ip = clientIp(req);
    const origin = () => { if (req.headers.origin == null) throw apiErr('bad_origin', 'the request has no Origin', 403); return String(req.headers.origin); };
    const login = (r, how) => { // P56: 세션 쿠키를 주고 PC 창 목록을 새로 한다
      this.log(`web device ${how} ${r.device.id} ${r.device.name}`);
      this.broadcastLocal();
      send(200, { device: r.device, expiresAt: r.session.expiresAt }, { 'set-cookie': sessionCookie({ port: this.cfg.port, id: r.session.id, secure: isHttpsOrigin(req.headers.origin), maxAgeSec: r.session.maxAgeMs / 1000 }) });
    };
    // P56 세션 다음에 P57 기기 확인. 묶인 기기와 다르면(다른 기기, 이 PC 안 기기, 옛 기기) 401로 다시 짝 맺게, whois를 못 읽으면 403
    const device = async () => {
      const { device: d } = this.sessionOf(req);
      const r = await this.checkNode(req, d, p); if (!r.ok) throw nodeErr(r.reason);
      return d;
    };
    // P57: 짝 맺기·패스키 등록·로그인을 청한 곳. 바깥이면 whois가 맞아야 하고 그 Tailscale 기기를, 이 PC 안이면 null을 돌려준다
    const paired = async () => { const r = await this.pairNode(req, p); if (!r.ok) throw nodeErr(r.reason); return r.node; };
    // P57: 등록 허가는 그 허가를 받은 곳(같은 Tailscale 기기, 또는 이 PC 안끼리)에서만 쓴다
    const grantHere = (node) => (g) => sameNode(g.extra && g.extra.tsNode, node);
    // P57: 패스키 서명을 확인한 기기가 지금 요청한 Tailscale 기기에 묶여 있어야 세션을 만든다
    const boundHere = (w) => (d) => { if (devicePub(d).needsRepair) throw nodeErr('not_bound'); const r = nodeCheck(req, d, w, this.cfg.port); if (!r.ok) { this.log(`web ${p} refused: tailscale node ${r.reason} (device ${d.id})`); throw nodeErr(r.reason); } };
    const body = (max = 16 * 1024) => new Promise((resolve, reject) => {
      const chunks = []; let n = 0;
      req.on('data', (d) => { n += d.length; if (n <= max) chunks.push(d); });
      req.on('end', () => { if (n > max) return reject(apiErr('too_big', 'request too large', 413)); try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(apiErr('bad_json', 'invalid JSON')); } });
      req.on('error', reject);
    });
    (async () => {
      try {
        if (p === '/web/me' && req.method === 'GET') { const d = await device(); this.devices.touch(d.id); return send(200, this.boot({ id: d.id, name: d.name })); }
        if (p === '/web/pair/code' && req.method === 'POST') { const o = origin(); const tsNode = await paired(); const b = await body(); const r = this.pairing.redeem({ code: String(b.code || ''), name: b.name, ip, userAgent: ua, origin: o, tsNode }); this.log('web pairing code accepted, waiting for the passkey'); return send(200, r); }
        if (p === '/web/pair/request' && req.method === 'POST') { const o = origin(); const tsNode = await paired(); const b = await body(); const r = this.pairing.request({ name: b.name, ip, userAgent: ua, origin: o, tsNode }); this.log(`web pair request ${r.requestId}`); return send(200, r); }
        if (p === '/web/pair/poll' && req.method === 'GET') { const tsNode = await paired(); return send(200, this.pairing.poll(url.searchParams.get('id'), url.searchParams.get('secret'), tsNode)); }
        // P56: 패스키 등록(짝 맺기의 허가로 한 번)과 로그인, 로그아웃. P57: 등록은 허가를 받은 곳에서만, 로그인은 묶인 Tailscale 기기에서만
        if (p === '/web/passkey/register/options' && req.method === 'POST') { const o = origin(); const node = await paired(); const b = await body(); return send(200, this.auth.registerOptions({ grant: b.grant, origin: o, allow: grantHere(node) })); }
        if (p === '/web/passkey/register' && req.method === 'POST') { const o = origin(); const node = await paired(); const b = await body(64 * 1024); return login(this.auth.register({ grant: b.grant, credential: b.credential, origin: o, allow: grantHere(node) }), 'paired with a passkey'); }
        if (p === '/web/passkey/login/options' && req.method === 'POST') { const o = origin(); await paired(); const b = await body(); return send(200, this.auth.loginOptions({ credentialId: b.credentialId, origin: o })); }
        if (p === '/web/passkey/login' && req.method === 'POST') { const o = origin(); await paired(); const w = await this.whoisOf(req); const b = await body(64 * 1024); return login(this.auth.login({ credential: b.credential, origin: o, check: boundHere(w) }), 'signed in with the passkey'); }
        if (p === '/web/logout' && req.method === 'POST') {
          origin();
          const s = this.auth.sessions.check(sessionIdOf(req, this.cfg.port));
          if (s) { this.auth.sessions.end(s.hash); this.closeSession((h) => h === s.hash, 'signed out'); }
          return send(200, { ok: true }, { 'set-cookie': clearCookies(this.cfg.port) });
        }
        if (p === '/web/upload' && req.method === 'POST') { await device(); return this.upload(req, url, send, fail); }
        return send(404, { error: { code: 'not_found', message: p } });
      } catch (e) { fail(e); }
    })();
    return true;
  }
  upload(req, url, send, fail) {
    const len = Number(req.headers['content-length'] || 0);
    if (len > UPLOAD_MAX_BYTES) { req.resume(); return fail(apiErr('too_big', `file is larger than ${UPLOAD_MAX_BYTES} bytes`, 413)); }
    fs.mkdirSync(this.uploadDir, { recursive: true });
    const file = uploadPath(this.uploadDir, url.searchParams.get('name'), req.headers['content-type']);
    const out = fs.createWriteStream(file, { flags: 'wx' });
    let n = 0, over = false;
    req.on('data', (d) => { n += d.length; if (n > UPLOAD_MAX_BYTES && !over) { over = true; out.destroy(); req.unpipe(out); try { fs.rmSync(file, { force: true }); } catch {} fail(apiErr('too_big', `file is larger than ${UPLOAD_MAX_BYTES} bytes`, 413)); } });
    req.pipe(out);
    out.on('finish', () => {
      if (over) return;
      try { cleanupUploads(this.uploadDir, { keep: file }); } catch {}
      this.log(`web upload ${path.basename(file)} ${n}B`);
      send(200, { path: file, bytes: n });
    });
    out.on('error', (e) => { if (!over) fail(apiErr('write_failed', e.message, 500)); });
  }

  // 판 API(WebSocket)에 더하는 것. c.auth.kind가 'local'(PC 창·CLI)이어야 하는 것은 localOnly로 막는다
  handlers() {
    const localOnly = (fn) => (p, c) => { if (c && c.auth && c.auth.kind !== 'local') throw apiErr('forbidden', 'only the board on this PC can do this', 403); return fn(p, c); };
    return {
      'device.list': (p, c) => (c && c.auth && c.auth.kind !== 'local' ? { devices: this.devices.list(), me: c.auth.device } : this.view()),
      'device.revoke': (p) => ({ revoked: this.revoke(String(p.id || '')) }),
      'device.rename': (p) => { const ok = this.devices.rename(String(p.id || ''), p.name); if (ok) this.broadcastLocal(); return { renamed: ok }; },
      'device.code': localOnly(() => this.pairing.newCode()),
      'device.cancelCode': localOnly(() => { this.pairing.cancelCode(); return { ok: true }; }),
      'device.approve': localOnly((p) => this.pairing.decide(String(p.id || ''), true)),
      'device.deny': localOnly((p) => this.pairing.decide(String(p.id || ''), false)),
      'web.status': () => this.status(),
      'remote.status': (p) => this.remoteStatus({ fresh: !!(p && p.fresh) }), // P49
      'fs.roots': async () => {
        const drives = await driveRoots();
        const seen = new Set(); const recent = [];
        for (const d of this.recentDirs()) { if (!d || seen.has(d.toLowerCase())) continue; seen.add(d.toLowerCase()); try { if (fs.statSync(d).isDirectory()) recent.push(d); } catch {} if (recent.length >= 12) break; }
        return { drives, home: os.homedir(), recent, sep: path.sep };
      },
      'fs.list': (p) => listDirs(p.path),
    };
  }
}
