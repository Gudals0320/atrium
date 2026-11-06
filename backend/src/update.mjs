// P69 앱 안 업데이트: 설치 폴더, 버전 비교, 릴리즈 읽기, 받기 주소 검사, current.json 바꾸기, 오래된 버전 지우기, 압축 풀기, 준비(npm ci·빌드)와 미리 보기.
// - 설치 폴더(ATRIUM_INSTALL_DIR, 기본 %LOCALAPPDATA%\atrium\versions)에 버전마다 저장소 소스 전체(<태그>\backend, <태그>\app, 그 안의 node_modules와 app\dist)를 둔다.
//   지금 버전은 current.json({ current, switchedAt })이 가리킨다. P71: 손으로 하는 되돌리기를 빼서 앞 버전(previous)을 적지도 남기지도 않는다.
//   새 백엔드가 뜨지 못할 때의 자동 되돌리기(update-swap.mjs)는 바꾸기 작업 파일의 옛 코드 폴더(fromRoot)와 옛 current.json(currentBefore)으로 한다. 판 데이터(판 기록, 플러그인, 세션 설정 파일)는 버전 밖 데이터 폴더에 있다.
// - 새 릴리즈는 GitHub API(인증 없음)의 releases/latest로 본다. 정식 릴리즈만(초안·사전 릴리즈 제외). 시험만 ATRIUM_UPDATE_API로 가짜 서버를 준다.
//   P70 dev 채널(판 설정 updateChannel): 릴리즈 목록(releases?per_page=30)에서 정식과 사전 릴리즈(dev 빌드, 태그 v<x.y.z>-dev.<n>) 가운데 가장 높은 버전을 고른다.
// - 받기 주소는 이 저장소의 GitHub 주소만 받는다(https, api.github.com·github.com·codeload.github.com). 가짜 서버(127.0.0.1)는 API 주소를 바꾼 시험에서만.
// - 바꾸기(update-swap.mjs)는 백엔드만 끄고 herdr 서버는 그대로 둔다. 새 백엔드가 herdr 세션에 다시 붙는다(ARCH 4절 C3).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { envVar } from './config.mjs';

export const UPDATE_REPO = 'Gudals0320/atrium';
export const DEFAULT_UPDATE_API = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
export const OFFICIAL_HOSTS = ['api.github.com', 'github.com', 'codeload.github.com'];
export const CURRENT_FILE = 'current.json';
export const RESULT_FILE = 'last-update.json';
export const JOB_FILE = 'swap-job.json';
export const LAUNCHER = 'launch.mjs';
export const LAUNCHER_CMD = 'Atrium.cmd';
export const STAGING_SUFFIX = '.staging';
const TAG_RE = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
export const CHANNELS = ['stable', 'dev']; // P70: 업데이트 채널. stable은 정식 릴리즈만, dev는 사전 릴리즈(dev 빌드)도
export const LIST_PER_PAGE = 30;
export const channelOf = (v) => (v === 'dev' ? 'dev' : 'stable');

const localAppData = () => process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
export const defaultInstallDir = () => path.join(localAppData(), 'atrium', 'versions');
export const installDirOf = (env = process.env) => path.resolve(envVar('INSTALL_DIR', env) || defaultInstallDir());
export const updateApiOf = (env = process.env) => envVar('UPDATE_API', env) || DEFAULT_UPDATE_API;
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
export const isDefaultInstallDir = (dir) => samePath(dir, defaultInstallDir());
// 개발용 판은 실제 설치 폴더를 바꾸지 않는다(확인만 한다)
export function installAllowed(cfg, dir) {
  if (cfg.profile === 'dev' && isDefaultInstallDir(dir)) return { ok: false, reason: 'dev_real_install', message: '개발용 판은 실제 설치 폴더를 바꾸지 않습니다. ATRIUM_INSTALL_DIR로 시험 폴더를 지정하세요.' };
  return { ok: true };
}

// ---------- 버전 ----------
export function parseVersion(s) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(s || '').trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [] };
}
// a < b → 음수, 같으면 0, a > b → 양수. 읽을 수 없는 버전은 가장 낮다
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] - y[k];
  if (!x.pre.length || !y.pre.length) return (x.pre.length ? -1 : 0) - (y.pre.length ? -1 : 0); // 사전 버전이 정식보다 낮다
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
    if (pn && qn) { if (+p !== +q) return +p - +q; continue; }
    if (pn !== qn) return pn ? -1 : 1;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}
export const versionOfTag = (tag) => String(tag || '').trim().replace(/^v/, '');
// ">=22.13" 같은 engines 범위(이 저장소가 쓰는 꼴만)
export function nodeSatisfies(version, range) {
  if (!range) return true;
  const m = /^\s*>=\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*$/.exec(String(range));
  if (!m) return true;
  const v = parseVersion(String(version).replace(/^v/, '')) || { major: 0, minor: 0, patch: 0 };
  const need = [+m[1], +(m[2] || 0), +(m[3] || 0)], have = [v.major, v.minor, v.patch];
  for (let i = 0; i < 3; i++) if (have[i] !== need[i]) return have[i] > need[i];
  return true;
}

// ---------- 릴리즈 ----------
// GitHub releases/latest 응답(또는 목록의 한 항목) → 쓸 값. 초안, 태그가 버전 꼴이 아닌 것, 그리고 prerelease를 켜지 않으면 사전 릴리즈는 null
export function parseRelease(j, { prerelease = false } = {}) {
  if (!j || typeof j !== 'object' || j.draft || (j.prerelease && !prerelease)) return null;
  const tag = String(j.tag_name || '').trim();
  if (!TAG_RE.test(tag)) return null;
  const notes = String(j.body || '').replace(/\r\n/g, '\n').trim();
  return {
    tag, version: versionOfTag(tag), name: String(j.name || tag).slice(0, 200),
    url: typeof j.html_url === 'string' && /^https?:\/\//.test(j.html_url) ? j.html_url : null,
    notes: notes.length > 4000 ? `${notes.slice(0, 4000)}…` : notes,
    publishedAt: j.published_at ? Date.parse(j.published_at) || null : null,
    tarball: typeof j.tarball_url === 'string' ? j.tarball_url : null,
    prerelease: !!j.prerelease,
  };
}
// P70: 릴리즈 목록 → 채널에서 가장 높은 버전. dev는 정식과 사전 릴리즈 모두, stable은 정식만. 없으면 null
export function pickRelease(list, channel = 'stable') {
  if (!Array.isArray(list)) return null;
  const dev = channelOf(channel) === 'dev';
  let best = null;
  for (const j of list) {
    const r = parseRelease(j, { prerelease: dev });
    if (r && (!best || compareVersions(r.version, best.version) > 0)) best = r;
  }
  return best;
}
// P70: releases/latest 주소 → 같은 저장소의 릴리즈 목록 주소(시험의 가짜 서버도). 꼴이 다르면 null
export function releasesListUrl(apiUrl = DEFAULT_UPDATE_API) {
  let u;
  try { u = new URL(apiUrl); } catch { return null; }
  if (!/\/releases\/latest\/?$/.test(u.pathname)) return null;
  u.pathname = u.pathname.replace(/\/releases\/latest\/?$/, '/releases');
  u.search = `?per_page=${LIST_PER_PAGE}`;
  return u.href;
}
// P70: 채널의 최신 릴리즈를 읽는다. stable은 releases/latest, dev는 목록. 없으면 null
export async function fetchLatest(fetchJson, apiUrl = DEFAULT_UPDATE_API, channel = 'stable') {
  if (channelOf(channel) === 'stable') return parseRelease(await fetchJson(apiUrl));
  const url = releasesListUrl(apiUrl);
  if (!url) throw new Error(`릴리즈 목록 주소를 만들 수 없습니다: ${apiUrl}`);
  return pickRelease(await fetchJson(url), 'dev');
}

const isLoopback = (h) => h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1';
// 받기 주소 검사. 이 저장소의 GitHub 주소만(https). 가짜 서버는 API 주소를 127.0.0.1로 바꾼 시험에서 그 주소와 같은 출처만
export function checkDownloadUrl(url, apiUrl = DEFAULT_UPDATE_API) {
  let u;
  try { u = new URL(url); } catch { return { ok: false, reason: 'bad_url' }; }
  let api = null;
  try { api = new URL(apiUrl); } catch {}
  if (api && apiUrl !== DEFAULT_UPDATE_API && isLoopback(api.hostname) && u.origin === api.origin) return { ok: true, test: true };
  if (u.protocol !== 'https:') return { ok: false, reason: 'not_https' };
  if (u.username || u.password) return { ok: false, reason: 'credentials' };
  if (!OFFICIAL_HOSTS.includes(u.hostname)) return { ok: false, reason: 'host' };
  let p;
  try { p = decodeURIComponent(u.pathname).toLowerCase(); } catch { return { ok: false, reason: 'bad_url' }; }
  if (p.includes('/../') || p.includes('\\')) return { ok: false, reason: 'bad_url' };
  const repo = UPDATE_REPO.toLowerCase();
  const want = u.hostname === 'api.github.com' ? `/repos/${repo}/` : `/${repo}/`;
  if (!p.startsWith(want)) return { ok: false, reason: 'repo' };
  return { ok: true };
}
// API 주소 검사: https, 또는 127.0.0.1 시험 서버
export function checkApiUrl(apiUrl) {
  let u;
  try { u = new URL(apiUrl); } catch { return { ok: false, reason: 'bad_url' }; }
  if (u.protocol === 'https:' || (u.protocol === 'http:' && isLoopback(u.hostname))) return { ok: true };
  return { ok: false, reason: 'not_https' };
}

// ---------- 받기 ----------
const UA = 'atrium-updater';
function get(url, { headers = {}, timeoutMs = 30000 } = {}) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const r = mod.get(u, { headers: { 'User-Agent': UA, ...headers }, timeout: timeoutMs }, res);
    r.on('error', rej);
    r.on('timeout', () => r.destroy(new Error(`시간 초과: ${u.host}`)));
  });
}
async function readBody(x, maxBytes, onBytes) {
  const chunks = []; let n = 0;
  for await (const c of x) { n += c.length; if (n > maxBytes) throw new Error(`받은 크기가 너무 큽니다(${maxBytes}바이트 넘음)`); chunks.push(c); if (onBytes) onBytes(n); }
  return Buffer.concat(chunks);
}
export async function httpGetJson(url, { timeoutMs = 20000 } = {}) {
  const ok = checkApiUrl(url);
  if (!ok.ok) throw new Error(`릴리즈 확인 주소를 쓸 수 없습니다(${ok.reason})`);
  const x = await get(url, { headers: { Accept: 'application/vnd.github+json' }, timeoutMs });
  const body = await readBody(x, 2 * 1024 * 1024);
  if (x.statusCode === 404) throw Object.assign(new Error('릴리즈가 없습니다'), { code: 'no_release' });
  if (x.statusCode !== 200) throw new Error(`릴리즈 확인 실패: HTTP ${x.statusCode}`);
  return JSON.parse(body.toString('utf8'));
}
// 압축을 받는다. 넘겨 주기(30x)도 주소마다 다시 검사한다
export async function download(url, { apiUrl = DEFAULT_UPDATE_API, maxBytes = 300 * 1024 * 1024, onBytes, timeoutMs = 120000 } = {}) {
  let cur = url;
  for (let hop = 0; hop < 6; hop++) {
    const ok = checkDownloadUrl(cur, apiUrl);
    if (!ok.ok) throw Object.assign(new Error(`받기 주소를 쓸 수 없습니다(${ok.reason}): ${cur}`), { code: 'bad_download_url' });
    const x = await get(cur, { timeoutMs });
    if (x.statusCode >= 300 && x.statusCode < 400 && x.headers.location) { x.resume(); cur = new URL(x.headers.location, cur).href; continue; }
    if (x.statusCode !== 200) { x.resume(); throw new Error(`받기 실패: HTTP ${x.statusCode}`); }
    return readBody(x, maxBytes, onBytes);
  }
  throw new Error('넘겨 주기가 너무 많습니다');
}

// ---------- 압축 풀기(tar, tar.gz) ----------
function octal(b) {
  if (b[0] & 0x80) { let n = 0; for (let i = 1; i < b.length; i++) n = n * 256 + b[i]; return n; } // base-256
  const s = b.toString('latin1').replace(/\0.*$/s, '').trim();
  return s ? parseInt(s, 8) : 0;
}
function paxRecords(buf) {
  // 줄마다 "<바이트 수> <열쇠>=<값>\n"
  const out = {}; let i = 0;
  while (i < buf.length) {
    const sp = buf.indexOf(0x20, i); if (sp < 0) break;
    const len = parseInt(buf.subarray(i, sp).toString('latin1'), 10);
    if (!(len > 0)) break;
    const rec = buf.subarray(sp + 1, i + len).toString('utf8').replace(/\n$/, '');
    const eq = rec.indexOf('='); if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}
// tar를 dest에 푼다. strip: 앞 경로 몇 마디를 뗀다(GitHub 압축은 맨 위 폴더 하나). 절대 경로, .., 드라이브, 역슬래시는 거부한다. 링크는 건너뛴다
export function untar(buf, dest, { strip = 1 } = {}) {
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const root = path.resolve(dest);
  fs.mkdirSync(root, { recursive: true });
  let off = 0, pax = null, longName = null, files = 0, dirs = 0;
  const skipped = [];
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    const str = (a, n) => { const s = h.subarray(a, a + n); const z = s.indexOf(0); return s.subarray(0, z < 0 ? n : z).toString('utf8'); };
    const size = octal(h.subarray(124, 136));
    const type = h[156] ? String.fromCharCode(h[156]) : '0';
    const ustar = h.subarray(257, 262).toString('latin1') === 'ustar';
    off += 512;
    const body = buf.subarray(off, off + size);
    off += Math.ceil(size / 512) * 512;
    if (type === 'x') { pax = paxRecords(body); continue; }
    if (type === 'g') continue;
    if (type === 'L') { longName = body.toString('utf8').replace(/\0.*$/s, ''); continue; }
    const prefix = ustar ? str(345, 155) : '';
    const name = (pax && pax.path) || longName || (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100));
    pax = null; longName = null;
    if (name.startsWith('/') || name.includes('\\') || /^[A-Za-z]:/.test(name)) throw Object.assign(new Error(`압축 안의 경로를 쓸 수 없습니다: ${name}`), { code: 'bad_archive' });
    const parts = name.split('/').filter((p) => p && p !== '.');
    if (parts.some((p) => p === '..' || p.includes(':'))) throw Object.assign(new Error(`압축 안의 경로를 쓸 수 없습니다: ${name}`), { code: 'bad_archive' });
    const rel = parts.slice(strip);
    if (!rel.length) continue;
    const out = path.join(root, ...rel);
    if (!out.startsWith(root + path.sep)) throw Object.assign(new Error(`압축 안의 경로를 쓸 수 없습니다: ${name}`), { code: 'bad_archive' });
    if (type === '5') { fs.mkdirSync(out, { recursive: true }); dirs++; }
    else if (type === '0' || type === '7') { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, body); files++; }
    else skipped.push(rel.join('/'));
  }
  return { files, dirs, skipped };
}

// ---------- 설치 폴더와 current.json ----------
export function readCurrent(dir) {
  try { const j = JSON.parse(fs.readFileSync(path.join(dir, CURRENT_FILE), 'utf8')); return j && typeof j === 'object' ? { current: j.current || null, switchedAt: j.switchedAt || null } : null; } catch { return null; } // P71: 옛 파일의 previous는 읽지 않는다
}
// 쓰다 끊겨도 반쪽 파일이 남지 않게 옆 파일에 쓰고 바꾼다
export function writeCurrent(dir, value) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, CURRENT_FILE), tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameRetry(tmp, file);
  return value;
}
// tag를 지금 버전으로
export function switchCurrent(dir, tag, now = Date.now()) {
  const before = readCurrent(dir);
  return { before, after: writeCurrent(dir, { current: tag, switchedAt: now }) };
}
export function listVersions(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && TAG_RE.test(e.name)).map((e) => e.name).sort(compareVersions); } catch { return []; }
}
function rmRetry(p) { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
function renameRetry(a, b) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(a, b); return; } catch (e) { if (i >= 20 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e; const t = Date.now() + 250; while (Date.now() < t) { /* 잠깐 기다린다(백신 검사 등) */ } }
  }
}
// 지금 버전(그리고 keep)만 남기고 옛 버전 폴더와 남은 준비 폴더를 지운다. 지우지 못한 것(쓰는 중)은 다음에 다시 지운다.
// P71: 바로 앞 버전은 손으로 되돌릴 때 쓰려고 남겼는데, 되돌리기를 빼서 남기지 않는다. 바꾸기 프로세스는 새 백엔드가 뜬 뒤(또는 옛 것으로 돌린 뒤)에만 부른다
export function pruneVersions(dir, { keep = [], keepStaging = [] } = {}) {
  const cur = readCurrent(dir) || {};
  const hold = new Set([cur.current, ...keep].filter(Boolean));
  const removed = [], failed = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { return { removed, failed }; }
  for (const e of entries) {
    const staging = e.name.endsWith(STAGING_SUFFIX) && TAG_RE.test(e.name.slice(0, -STAGING_SUFFIX.length));
    if (staging ? keepStaging.includes(e.name.slice(0, -STAGING_SUFFIX.length)) : (!TAG_RE.test(e.name) || hold.has(e.name))) continue;
    try { rmRetry(path.join(dir, e.name)); removed.push(e.name); } catch (err) { failed.push({ name: e.name, error: err.code || err.message }); }
  }
  return { removed, failed };
}
export function cleanStaging(dir, tag) {
  const p = path.join(dir, `${tag}${STAGING_SUFFIX}`);
  if (!fs.existsSync(p)) return false;
  rmRetry(p);
  return true;
}

// 코드 폴더(backend와 app이 든 저장소 소스)의 버전. 설치 폴더 안이면 그 태그도
export function versionOfRoot(root) {
  for (const f of [path.join(root, 'app', 'package.json'), path.join(root, 'backend', 'package.json')]) {
    try { const v = JSON.parse(fs.readFileSync(f, 'utf8')).version; if (v) return v; } catch {}
  }
  return null;
}
export function runningVersion(codeRoot, dir) {
  const version = versionOfRoot(codeRoot);
  const parent = path.dirname(path.resolve(codeRoot));
  const installed = samePath(parent, dir) && TAG_RE.test(path.basename(codeRoot));
  return { version, tag: installed ? path.basename(codeRoot) : null, installed, root: path.resolve(codeRoot) };
}

// ---------- 준비 ----------
// 부모 Claude Code 표시 변수와 ELECTRON_RUN_AS_NODE를 뺀 환경(npm, 미리 보기, 새 백엔드)
export const cleanEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)));
// 프로세스를 돌리고 끝을 기다린다. 실패하면 출력의 끝 몇 줄을 함께 던진다
export function run(cmd, args, { cwd, env = cleanEnv(), timeoutMs = 15 * 60 * 1000, onLine } = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const tail = [];
    const take = (d) => { for (const l of String(d).split(/\r?\n/)) { if (!l.trim()) continue; tail.push(l); if (tail.length > 30) tail.shift(); if (onLine) onLine(l); } };
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (out.length > 1e6) out = out.slice(-1e6); take(d); });
    p.stderr.on('data', take);
    const timer = setTimeout(() => { try { p.kill(); } catch {} }, timeoutMs);
    p.on('error', (e) => { clearTimeout(timer); rej(e); });
    p.on('close', (code) => { clearTimeout(timer); if (code === 0) res({ out, tail }); else rej(Object.assign(new Error(`${path.basename(cmd)} ${args.slice(-2).join(' ')} 실패(코드 ${code}): ${tail.slice(-6).join(' | ')}`), { tail })); });
  });
}
// npm. 이 Node 옆의 npm-cli.js가 있으면 그것을(.cmd를 셸 없이 띄울 수 없다), 없으면 cmd로 npm을 부른다
export function npmCommand(args, node = process.execPath) {
  const cli = path.join(path.dirname(node), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fs.existsSync(cli)) return [node, [cli, ...args]];
  return [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', ['npm', ...args].join(' ')]];
}
const runNpm = (args, cwd, o) => { const [c, a] = npmCommand(args); return run(c, a, { cwd, ...o }); };

export const electronExe = (root) => path.join(root, 'app', 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
// 새 버전이 뜰 수 있는지 미리 본다: 빌드한 창, Electron 실행 파일, 백엔드 모듈 불러오기, Node 버전, herdr 프로토콜(지금 도는 herdr와 맞는지)
export async function verifyRoot(root, { protocol = null, node = process.execPath } = {}) {
  const problems = [];
  if (!fs.existsSync(path.join(root, 'app', 'dist', 'index.html'))) problems.push('app/dist 없음');
  if (!fs.existsSync(electronExe(root))) problems.push('Electron 실행 파일 없음');
  if (!fs.existsSync(path.join(root, 'backend', 'node_modules', 'ws'))) problems.push('backend/node_modules 없음');
  let info = null;
  try {
    const r = await run(node, ['--disable-warning=ExperimentalWarning', path.join(root, 'backend', 'src', 'update-verify.mjs')], { cwd: path.join(root, 'backend'), timeoutMs: 60000 });
    info = JSON.parse(r.out.trim().split(/\r?\n/).pop());
  } catch (e) { problems.push(`미리 보기 실패: ${String(e.message).slice(0, 300)}`); }
  if (info) {
    problems.push(...(info.problems || []));
    if (protocol != null && Array.isArray(info.protocols) && !info.protocols.includes(protocol)) problems.push(`herdr 프로토콜 ${protocol}을 받지 않음(${info.protocols.join(', ')})`);
  }
  return { ok: !problems.length, problems, info };
}

// 릴리즈를 받아 설치 폴더의 <태그>에 준비한다: 받기 → <태그>.staging에 풀기 → npm ci(backend, app) → Electron 받기 → 빌드 → 미리 보기 → <태그>로 이름 바꾸기.
// 실패하면 준비 폴더를 지우고 던진다. step(name, detail)로 진행을 알린다
export async function prepareRelease({ dir, release, apiUrl = DEFAULT_UPDATE_API, protocol = null, step = () => {}, log = () => {}, fetchBuf = download, npm = runNpm, verify = verifyRoot, node = process.execPath }) {
  if (!release || !release.tag || !release.tarball) throw new Error('받을 릴리즈가 없습니다');
  const cur = readCurrent(dir);
  if (cur && cur.current === release.tag) throw Object.assign(new Error(`이미 ${release.tag}입니다`), { code: 'already_current' });
  const staging = path.join(dir, `${release.tag}${STAGING_SUFFIX}`);
  fs.mkdirSync(dir, { recursive: true });
  rmRetry(staging);
  const onLine = (l) => log(`  ${l}`);
  try {
    step('download');
    let last = 0;
    const tgz = await fetchBuf(release.tarball, { apiUrl, onBytes: (n) => { if (n - last > 1024 * 1024) { last = n; step('download', { bytes: n }); } } });
    step('extract', { bytes: tgz.length });
    const x = untar(tgz, staging, { strip: 1 });
    log(`extracted ${x.files} files${x.skipped.length ? `, skipped ${x.skipped.length}` : ''}`);
    const got = versionOfRoot(staging);
    if (!fs.existsSync(path.join(staging, 'backend', 'package.json')) || !fs.existsSync(path.join(staging, 'app', 'package.json'))) throw new Error('압축에 backend·app이 없습니다');
    if (got !== release.version) throw Object.assign(new Error(`압축의 버전(${got})이 태그(${release.tag})와 다릅니다`), { code: 'version_mismatch' });
    step('install', { part: 'backend' });
    await npm(['ci', '--no-audit', '--no-fund'], path.join(staging, 'backend'), { onLine });
    step('install', { part: 'app' });
    await npm(['ci', '--no-audit', '--no-fund'], path.join(staging, 'app'), { onLine });
    // Electron 45는 npm ci 때 실행 파일을 받지 않고 처음 쓸 때 받는다. 여기서 미리 받는다(내려받은 것은 Electron 캐시에 남는다)
    const inst = path.join(staging, 'app', 'node_modules', 'electron', 'install.js');
    if (!fs.existsSync(electronExe(staging)) && fs.existsSync(inst)) { step('install', { part: 'electron' }); await run(node, [inst], { cwd: path.join(staging, 'app'), onLine }); }
    step('build');
    await npm(['run', 'build'], path.join(staging, 'app'), { onLine });
    step('verify');
    const v = await verify(staging, { protocol, node });
    if (!v.ok) throw Object.assign(new Error(`새 버전을 확인하지 못했습니다: ${v.problems.join('; ')}`), { code: 'verify_failed', problems: v.problems });
    const final = path.join(dir, release.tag);
    if (fs.existsSync(final)) { log(`replacing ${release.tag}`); rmRetry(final); } // 지난번에 지우지 못한 같은 버전 폴더
    renameRetry(staging, final);
    return { root: final, verify: v };
  } catch (e) {
    try { rmRetry(staging); } catch (err) { log(`staging cleanup failed ${err.message}`); }
    throw e;
  }
}

// 바로가기가 부르는 실행기(설치 폴더의 launch.mjs와 Atrium.cmd)를 새 버전의 것으로 바꾼다. 아이콘도 설치 폴더로 복사한다(버전 폴더는 지워질 수 있다)
export function writeLauncher(dir, root) {
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(root, 'app', 'scripts', 'launch.mjs'), path.join(dir, LAUNCHER));
  fs.writeFileSync(path.join(dir, LAUNCHER_CMD), '@echo off\r\nrem Atrium 실행기(P69). 바탕화면 바로가기가 부른다. current.json이 가리키는 버전의 창을 띄운다\r\nchcp 65001 >nul\r\nnode "%~dp0launch.mjs" %*\r\nif errorlevel 1 pause\r\n');
  const ico = path.join(root, 'app', 'assets', 'icon.ico');
  if (fs.existsSync(ico)) fs.copyFileSync(ico, path.join(dir, 'atrium.ico'));
  return { launcher: path.join(dir, LAUNCHER_CMD), icon: fs.existsSync(path.join(dir, 'atrium.ico')) ? path.join(dir, 'atrium.ico') : null };
}

export function readResult(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, RESULT_FILE), 'utf8')); } catch { return null; } }
export function writeResult(dir, r) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, RESULT_FILE), JSON.stringify(r, null, 2)); return r; }
