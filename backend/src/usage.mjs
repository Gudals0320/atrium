// P211: 구독 사용량(Claude, Codex, Antigravity). 한도 창(5시간·주간 등)의 사용률, 리셋 시각, 크레딧, 요금제를 구독마다 마지막 값으로 든다.
// 출처(로컬만, 네트워크로 묻지 않는다. 로그인·키 파일은 열지 않는다):
// - Claude: 판이 띄운 Claude Code의 상태 줄 명령(bin/atrium-statusline.mjs)이 받은 JSON의 rate_limits(five_hour·seven_day의 used_percentage, resets_at)
// - Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl의 token_count 줄 payload.rate_limits(primary·secondary, credits, plan_type).
//   오늘·어제 폴더의 파일 가운데 바뀐 파일만 끝(늘어난 만큼, 처음은 끝 256KB)을 읽는다
// - AGY: 판이 띄운 AGY의 상태 줄 명령이 받은 JSON의 quota({ "gemini-5h"·"gemini-weekly"·"3p-5h"…: { remaining_fraction, reset_time, reset_in_seconds } })와 plan_tier
// 값이 바뀌면 창에 usage.updated를 보내고, 한 창이 90%를 넘으면 그 창이 리셋될 때까지 한 번 usage.alert를 보낸다(설정 usageAlerts).
// 판 기록 meta usage(마지막 값), usageAlerted(알린 열쇠)에 남는다(판이 다시 떠도 마지막 값과 "n분 전"이 보인다)
import fs from 'node:fs';
import path from 'node:path';

export const PROVIDERS = ['claude', 'codex', 'agy'];
// P314: 위 알약에 나오지 않고 펼침 아래쪽에만 나오는 것(키로 읽는 잔액). P347: Hermes 계정 한도는 걷었다(판 기록에 남은 옛 hermes 값은 읽지 않는다)
export const EXTRAS = ['deepseek', 'openrouter'];
export const ALL_PROVIDERS = [...PROVIDERS, ...EXTRAS];
// P314: 탐침(usage-probe.mjs)의 원천 순서와 낡음. 판 값(Codex rollout, Claude·AGY 상태 줄)이 먼저이고, 값이 usageProbeMin분 넘게 낡았고
//   그 구독을 쓰는 판 세션이 일하지 않을 때만 하네스 명령을 부른다. Codex는 주기적으로, Claude와 잔액은 알약을 펼칠 때만(usage.refresh)
export const PERIODIC_PROBES = ['codex'];
export const OPEN_PROBES = ['claude', 'codex', 'balance'];
const FAIL_BACKOFF_MS = 30 * 60 * 1000; // 탐침이 실패하면(명령 없음, grant 없음 등) 이만큼 다시 묻지 않는다
export function staleOf(entry, now, staleMs) { return !entry || !num(entry.at) || now - entry.at > staleMs; }
// 탐침을 부를지: 켜짐, 낡음, 그 구독 세션이 일하지 않음, 묻는 중이 아님, 최근에 묻지 않음(성공은 낡음 간격, 실패는 30분)
export function shouldProbe({ on, stale, busy, inflight, lastTry = 0, lastOk = true, now, staleMs }) {
  if (!on || !stale || busy || inflight) return false;
  const wait = lastOk ? staleMs : Math.max(staleMs, FAIL_BACKOFF_MS);
  return !lastTry || now - lastTry >= wait;
}
export const ALERT_PCT = 90;
const TAIL_FIRST = 256 * 1024;
const TAIL_MAX = 4 * 1024 * 1024;
const QUIET_BROADCAST_MS = 60 * 1000; // 값이 같고 받은 때만 바뀌면 이보다 자주 보내지 않는다

export { spanText, usageLines } from './usage-text.mjs'; // atrium usage 글(하네스 bin의 atrium 명령도 쓴다. fs 없이)

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (v) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

// 시각: 초(1e12 미만)·밀리초·ISO 글·숫자 글 → 밀리초 | null
export function toMs(v) {
  if (num(v)) return v < 1e12 ? Math.round(v * 1000) : Math.round(v);
  if (typeof v === 'string' && v.trim()) { const n = Number(v); if (Number.isFinite(n)) return toMs(n); const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  return null;
}
// 창 이름: 분 → 5h | week | day | <분>m
export function windowIdOf(minutes) {
  if (minutes === 300) return '5h';
  if (minutes === 10080) return 'week';
  if (minutes === 1440) return 'day';
  return num(minutes) ? `${minutes}m` : 'window';
}

// Claude 상태 줄 입력 → 구독 값 | null
const CLAUDE_KEYS = { five_hour: ['5h', 300], seven_day: ['week', 10080] };
export function claudeUsageOf(input, at = Date.now()) {
  const rl = isObj(input) && isObj(input.rate_limits) ? input.rate_limits : null;
  if (!rl) return null;
  const windows = [];
  for (const [key, w] of Object.entries(rl)) {
    if (!isObj(w) || !num(w.used_percentage)) continue;
    const [id, minutes] = CLAUDE_KEYS[key] || [key, null];
    windows.push({ id, minutes, usedPct: pct(w.used_percentage), resetsAt: toMs(w.resets_at) });
  }
  if (!windows.length) return null;
  const m = isObj(input.model) ? input.model.display_name || input.model.id || null : null;
  return { provider: 'claude', source: 'statusline', at, windows, credits: null, plan: null, model: m };
}

// Codex rate_limits → 구독 값 | null
export function codexUsageOf(rl, at = Date.now()) {
  if (!isObj(rl)) return null;
  const windows = [];
  for (const key of ['primary', 'secondary']) {
    const w = rl[key];
    if (!isObj(w) || !num(w.used_percent)) continue;
    const minutes = num(w.window_minutes) ? w.window_minutes : null;
    windows.push({ id: windowIdOf(minutes), minutes, usedPct: pct(w.used_percent), resetsAt: toMs(w.resets_at) });
  }
  if (!windows.length) return null;
  const c = isObj(rl.credits) ? rl.credits : null;
  const credits = c ? { hasCredits: !!c.has_credits, unlimited: !!c.unlimited, balance: c.balance == null ? null : String(c.balance) } : null;
  return { provider: 'codex', source: 'rollout', at, windows, credits, plan: typeof rl.plan_type === 'string' ? rl.plan_type : null, model: null };
}

// AGY 상태 줄 입력 → 구독 값 | null. quota_buckets는 { 이름: 칸 } 또는 [칸](칸의 이름은 name·id·key).
// 칸: remaining_fraction(0~1, 남은 몫) → 사용률 = (1 − 몫)×100, reset_in_seconds(받은 때부터) 또는 reset_time(시각)
export function agyUsageOf(input, at = Date.now()) {
  if (!isObj(input)) return null;
  const qb = isObj(input.quota) || Array.isArray(input.quota) ? input.quota : input.quota_buckets; // 1.5.10 시험: quota { "gemini-5h": {…}, "3p-weekly": {…} }
  const list = Array.isArray(qb) ? qb.map((b, i) => [isObj(b) ? b.name || b.id || b.key || `q${i + 1}` : `q${i + 1}`, b]) : isObj(qb) ? Object.entries(qb) : [];
  const windows = [];
  for (const [name, b] of list) {
    if (!isObj(b)) continue;
    const rf = num(b.remaining_fraction) ? b.remaining_fraction : null;
    const used = rf != null ? (1 - rf) * 100 : num(b.used_percentage) ? b.used_percentage : null;
    if (used == null) continue;
    const resetsAt = num(b.reset_in_seconds) ? at + Math.round(b.reset_in_seconds * 1000) : toMs(b.reset_time ?? b.resets_at);
    const minutes = /(^|-)5h$/.test(name) ? 300 : /(^|-)weekly$/.test(name) ? 10080 : /(^|-)daily$/.test(name) ? 1440 : null;
    windows.push({ id: String(name), minutes, usedPct: pct(used), resetsAt });
  }
  if (!windows.length) return null;
  const m = isObj(input.model) ? input.model.display_name || input.model.id || null : typeof input.model === 'string' ? input.model : null;
  return { provider: 'agy', source: 'statusline', at, windows, credits: null, plan: typeof input.plan_tier === 'string' ? input.plan_tier : null, model: m };
}

// ---------- Codex rollout 끝 읽기 ----------
// 글 조각(줄들)에서 마지막 rate_limits 줄 → { rl, at } | null. limit_id가 codex(또는 없음)인 줄을 먼저 본다
export function lastRateLimits(text) {
  const lines = String(text).split(/\r?\n/);
  let other = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.includes('"rate_limits"')) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const rl = isObj(o) && isObj(o.payload) ? o.payload.rate_limits : null;
    if (!isObj(rl)) continue;
    const at = toMs(o.timestamp) || null;
    if (rl.limit_id == null || rl.limit_id === 'codex') return { rl, at };
    if (!other) other = { rl, at };
  }
  return other;
}
const dayDir = (root, d) => path.join(root, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
// 오늘·어제 폴더의 rollout 파일. 파일마다 { size, mtimeMs, hit }를 들고, 바뀐 파일만 늘어난 부분(처음은 끝 256KB, 못 찾으면 4MB까지)을 읽는다
export class CodexUsageReader {
  constructor({ home, now = () => Date.now(), days = 2 } = {}) { this.home = home; this.now = now; this.days = days; this.files = new Map(); this.reads = 0; }
  readPart(file, from, to) {
    const fd = fs.openSync(file, 'r');
    try { const len = Math.max(0, to - from); const buf = Buffer.alloc(len); const n = fs.readSync(fd, buf, 0, len, from); this.reads++; return buf.toString('utf8', 0, n); } finally { fs.closeSync(fd); }
  }
  scanFile(file, st) {
    const prev = this.files.get(file);
    if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs) return prev.hit;
    let hit = prev && st.size >= prev.size ? prev.hit : null;
    if (prev && st.size > prev.size) {
      const t = this.readPart(file, Math.max(prev.size - 1, 0), st.size); // 앞 줄 끝 한 글자부터(늘어난 첫 줄이 잘리지 않게)
      const h = lastRateLimits(t); if (h) hit = h;
    } else {
      for (let back = TAIL_FIRST; ; back *= 4) {
        const from = Math.max(0, st.size - back);
        const t = this.readPart(file, from, st.size);
        const h = lastRateLimits(from > 0 ? t.slice(t.indexOf('\n') + 1) : t);
        if (h) { hit = h; break; }
        if (from === 0 || back >= TAIL_MAX) break;
      }
    }
    if (hit && !hit.at) hit = { ...hit, at: st.mtimeMs };
    this.files.set(file, { size: st.size, mtimeMs: st.mtimeMs, hit });
    return hit;
  }
  // → 가장 나중 값 { rl, at, file } | null
  poll() {
    if (!this.home) return null;
    const seen = new Set();
    let best = null;
    for (let d = 0; d < this.days; d++) {
      const dir = dayDir(this.home, new Date(this.now() - d * 86400000));
      let names = [];
      try { names = fs.readdirSync(dir).filter((n) => /^rollout-.*\.jsonl$/.test(n)); } catch { continue; }
      for (const n of names) {
        const file = path.join(dir, n);
        seen.add(file);
        let st; try { st = fs.statSync(file); } catch { continue; }
        let hit = null; try { hit = this.scanFile(file, st); } catch { continue; }
        if (hit && (!best || hit.at > best.at)) best = { ...hit, file };
      }
    }
    for (const f of [...this.files.keys()]) if (!seen.has(f)) this.files.delete(f);
    return best;
  }
}

// ---------- 90% 알림 ----------
// 창이 리셋되기 전까지 한 번: 열쇠 = 구독|창|리셋 시각(10분 단위로 묶는다. AGY 리셋은 받은 때부터 센 초라 조금씩 흔들린다)
export const alertKeyOf = (provider, w) => `${provider}|${w.id}|${w.resetsAt ? Math.round(w.resetsAt / 600000) : 'none'}`;
export function alertsOf(entry, done, now = Date.now(), threshold = ALERT_PCT) {
  if (!entry || !Array.isArray(entry.windows)) return [];
  const out = [];
  for (const w of entry.windows) {
    if (!num(w.usedPct) || w.usedPct < threshold) continue;
    if (w.resetsAt && w.resetsAt <= now) continue;
    const key = alertKeyOf(entry.provider, w);
    if (done.has(key)) continue;
    out.push({ key, provider: entry.provider, window: w.id, minutes: w.minutes ?? null, usedPct: w.usedPct, resetsAt: w.resetsAt || null });
  }
  return out;
}
// 알린 열쇠 { 열쇠: 지울 때 } 가운데 지난 것을 뺀다(리셋 뒤 한 시간, 리셋을 모르면 8일)
export function pruneAlerted(map, now = Date.now()) { return Object.fromEntries(Object.entries(map || {}).filter(([, until]) => num(until) && until > now)); }

// 값이 같은가(받은 때는 보지 않는다. 리셋 시각은 분 단위로)
const sig = (e) => e ? JSON.stringify([(e.windows || []).map((w) => [w.id, w.usedPct, w.resetsAt ? Math.round(w.resetsAt / 60000) : null]), e.credits, e.plan, e.model, e.balance || null, e.sameAs || null, e.source]) : '';
export const sameUsage = (a, b) => sig(a) === sig(b);

// ---------- 상태 줄 명령 ----------
const fwd = (p) => String(p).split(path.sep).join('/');
const q = (s) => `"${String(s).replace(/"/g, '')}"`;
// 상태 줄 명령 글. 셸(Git Bash·cmd)에서 같게 읽히도록 경로는 슬래시와 큰따옴표, 사용자 명령은 base64로 넘긴다
// shim(.cmd 꾸러미)을 주면 node·스크립트 대신 그것을 부른다. AGY는 명령의 큰따옴표를 \"로 넘겨 cmd가 읽지 못하므로(1.5.10 개발용 판 시험) 따옴표 없는 꾸러미 경로를 쓴다
const bare = (p) => (/[\s"&|<>^]/.test(p) ? q(p) : p);
export function statusLineCommand({ node = process.execPath, script, kind, userSettings = null, userCommand = null, quietDefault = false, shim = null }) {
  return [...(shim ? [bare(fwd(shim))] : [q(fwd(node)), q(fwd(script))]), kind, ...(userCommand ? ['--user-cmd-b64', Buffer.from(userCommand, 'utf8').toString('base64')] : userSettings ? ['--user-settings', q(fwd(userSettings))] : []), ...(quietDefault ? ['--default', 'none'] : [])].join(' ');
}
// 판의 상태 줄 명령 파일을 판 데이터 폴더에 둔다(판 코드 폴더가 업데이트로 바뀌어도 띄운 세션의 설정이 그대로 가리킨다) → 파일 경로
export function writeStatusLineScript(dir, source = new URL('../bin/atrium-statusline.mjs', import.meta.url)) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'atrium-statusline.mjs');
  const text = fs.readFileSync(source, 'utf8');
  let cur = null; try { cur = fs.readFileSync(file, 'utf8'); } catch {}
  if (cur !== text) fs.writeFileSync(file, text);
  return file;
}
// AGY용 꾸러미(.cmd): 이 판의 node로 같은 폴더의 atrium-statusline.mjs를 부른다(표준 입출력은 물려준다) → 파일 경로
export function writeStatusLineShim(dir, node = process.execPath) {
  const file = path.join(dir, 'atrium-statusline.cmd');
  const text = `@echo off\r\nrem Atrium 보드(P211): 판의 상태 줄 명령\r\n"${node}" "%~dp0atrium-statusline.mjs" %*\r\n`;
  let cur = null; try { cur = fs.readFileSync(file, 'utf8'); } catch {}
  if (cur !== text) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, text); }
  return file;
}
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export class UsageBook {
  // o: { store(getMeta·setMeta), broadcast(이벤트, 값), settings() → 판 설정, codexHome, claudeUserSettings, agyUserSettings, script, node, now, pollMs, log }
  constructor(o = {}) {
    this.o = o;
    this.now = o.now || (() => Date.now());
    this.codex = new CodexUsageReader({ home: o.codexHome, now: this.now });
    const saved = o.store ? o.store.getMeta('usage') : null;
    this.data = Object.fromEntries(ALL_PROVIDERS.map((p) => [p, isObj(saved) && isObj(saved[p]) ? saved[p] : null]));
    this.probe = o.probe || {}; // P314: { codex(), claude(), balance() } → Promise<값 | [값] | null>
    this.probing = new Set(); // 지금 묻는 중인 탐침
    this.tries = {}; // 탐침 → { at, ok }
    this.alerted = pruneAlerted(o.store ? o.store.getMeta('usageAlerted') : null, this.now());
    this.lastSent = 0;
    this.timer = null;
  }
  start() {
    this.tick();
    const ms = this.o.pollMs ?? 30000;
    if (ms > 0) { this.timer = setInterval(() => this.tick(), ms); if (this.timer.unref) this.timer.unref(); }
  }
  tick() { this.pollCodex(); for (const k of PERIODIC_PROBES) this.maybeProbe(k); }
  settingsNow() { return this.o.settings ? this.o.settings() || {} : {}; }
  probeOn() { return this.settingsNow().usageProbe !== false; }
  staleMs() { const m = Number(this.settingsNow().usageProbeMin); return (Number.isFinite(m) && m > 0 ? m : 10) * 60000; }
  // 탐침이 보는 값(잔액은 둘 가운데 더 낡은 것)
  probeEntry(k) {
    if (k !== 'balance') return this.data[k];
    const list = ['deepseek', 'openrouter'].map((p) => this.data[p]).filter(Boolean);
    return list.length ? list.reduce((a, b) => (a.at < b.at ? a : b)) : null;
  }
  // 탐침 하나를 부를지 보고 부른다 → Promise<bool>(불렀나)
  maybeProbe(k, { force = false } = {}) {
    const fn = this.probe[k];
    if (typeof fn !== 'function') return Promise.resolve(false);
    const now = this.now();
    const t = this.tries[k] || {};
    const busy = k === 'balance' ? false : !!(this.o.busy && this.o.busy(k));
    const ok = shouldProbe({ on: this.probeOn(), stale: force || staleOf(this.probeEntry(k), now, this.staleMs()), busy, inflight: this.probing.has(k), lastTry: t.at, lastOk: t.ok !== false, now, staleMs: force ? 0 : this.staleMs() });
    if (!ok) return Promise.resolve(false);
    return this.runProbe(k, fn);
  }
  async runProbe(k, fn) {
    const t0 = Date.now();
    this.probing.add(k);
    this.tries[k] = { at: this.now(), ok: true };
    this.sendNow();
    let r = null;
    try { r = await fn(); } catch (e) { if (this.o.log) this.o.log(`usage probe ${k} failed: ${e.message}`); }
    this.probing.delete(k);
    const list = (Array.isArray(r) ? r : r ? [r] : []).filter((e) => isObj(e) && ALL_PROVIDERS.includes(e.provider));
    this.tries[k] = { at: this.now(), ok: list.length > 0 };
    if (this.o.log) this.o.log(list.length ? `usage probe ${k}: ok ${Date.now() - t0}ms` : `usage probe ${k}: no value ${Date.now() - t0}ms`);
    let changed = false;
    for (const e of list) if (this.set(e, { force: true })) changed = true;
    this.sendNow();
    return changed || list.length > 0;
  }
  // P314: 알약을 펼칠 때(usage.refresh). 낡은 것만 묻는다(Claude는 여기서만) → 지금 값
  refresh() {
    for (const k of OPEN_PROBES) this.maybeProbe(k);
    return this.get();
  }
  sendNow() { this.lastSent = this.now(); if (this.o.broadcast) this.o.broadcast('usage.updated', this.get()); }
  stop() { clearInterval(this.timer); this.timer = null; }
  alertsOn() { const s = this.o.settings ? this.o.settings() || {} : {}; return s.usageAlerts !== false; }
  // P314: 알약 밖(EXTRAS) 값은 있을 때만 싣는다(옛 창·시험이 보는 꼴 그대로)
  get() { return { providers: Object.fromEntries(ALL_PROVIDERS.filter((p) => PROVIDERS.includes(p) || this.data[p]).map((p) => [p, this.data[p]])), alertsOn: this.alertsOn(), probeOn: this.probeOn(), probing: [...this.probing], at: this.now(), ...(this.o.extra ? this.o.extra() : {}) }; } // P361: extra = API 크레딧 장부(apiCredits)
  pollCodex() {
    let r = null;
    try { r = this.codex.poll(); } catch (e) { if (this.o.log) this.o.log(`usage codex poll failed: ${e.message}`); }
    if (!r) return false;
    const e = codexUsageOf(r.rl, r.at || this.now());
    return e ? this.set(e) : false;
  }
  // 상태 줄 명령이 알린 값. kind: claude | agy → { ok, changed }
  report(kind, input) {
    const at = this.now();
    const e = kind === 'claude' ? claudeUsageOf(input, at) : kind === 'agy' ? agyUsageOf(input, at) : null;
    if (!e) return { ok: false, changed: false };
    // P314: 상태 줄에는 모델별 주간 창이 없다. 탐침이 준 모델별 창(week:<모델>)은 리셋 전까지 잇는다
    const prev = this.data[e.provider];
    if (kind === 'claude' && prev && Array.isArray(prev.windows)) {
      const keep = prev.windows.filter((w) => /^week:/.test(w.id) && !e.windows.some((x) => x.id === w.id) && (!w.resetsAt || w.resetsAt > at));
      if (keep.length) e.windows = [...e.windows, ...keep];
    }
    return { ok: true, changed: this.set(e) };
  }
  set(e, { force = false } = {}) {
    if (!e || !ALL_PROVIDERS.includes(e.provider)) return false; // P347: 걷은 구독(옛 hermes 등)은 받지 않는다
    const prev = this.data[e.provider];
    if (prev && e.at < (prev.at || 0) && e.provider === 'codex') return false; // 옛 rollout이 더 나중 값을 덮지 않는다
    const same = sameUsage(prev, e);
    this.data[e.provider] = e;
    const now = this.now();
    if (same && !force && now - this.lastSent < QUIET_BROADCAST_MS) return false;
    this.save();
    this.lastSent = now;
    if (this.o.broadcast) this.o.broadcast('usage.updated', this.get());
    if (!same) this.checkAlerts(e);
    return !same;
  }
  save() { if (this.o.store) this.o.store.setMeta('usage', this.data); }
  checkAlerts(e) {
    if (!this.alertsOn()) return [];
    const now = this.now();
    const done = new Set(Object.keys(this.alerted));
    const list = alertsOf(e, done, now);
    if (!list.length) return [];
    for (const a of list) {
      this.alerted[a.key] = a.resetsAt ? a.resetsAt + 3600000 : now + 8 * 86400000;
      if (this.o.broadcast) this.o.broadcast('usage.alert', a);
      if (this.o.log) this.o.log(`usage alert ${a.provider} ${a.window} ${a.usedPct}%`);
    }
    this.alerted = pruneAlerted(this.alerted, now);
    if (this.o.store) this.o.store.setMeta('usageAlerted', this.alerted);
    return list;
  }
  // 판이 띄우는 Claude Code의 statusLine(세션 설정 파일). 사용자 상태 줄은 부를 때마다 사용자 설정 파일에서 읽는다(padding만 여기서 옮긴다)
  claudeStatusLine() {
    if (!this.o.script) return null;
    const u = this.o.claudeUserSettings ? readJson(this.o.claudeUserSettings) : null;
    const sl = u && isObj(u.statusLine) ? u.statusLine : null;
    return { type: 'command', command: statusLineCommand({ node: this.o.node, script: this.o.script, kind: 'claude', userSettings: this.o.claudeUserSettings || null }), ...(sl && num(sl.padding) ? { padding: sl.padding } : {}) };
  }
  // 판이 띄우는 AGY의 statusLine(--settings). userLine = 호출자 --settings의 statusLine(있으면). 사용자 명령(호출자 것, 없으면 AGY 설정의 것)을 이어 부르고,
  //   사용자 명령이 없으면 AGY 기본 줄을 그대로 두도록 stack_with_default로 쌓고 판 명령은 아무것도 쓰지 않는다
  agyStatusLine(userLine = null) {
    if (!this.o.script) return null;
    let line = isObj(userLine) ? userLine : null;
    if (line && line.enabled === false) return null; // 사용자가 상태 줄을 껐다
    let cmd = line && typeof line.command === 'string' && line.command.trim() ? line.command.trim() : null;
    if (!cmd && !line) {
      const g = this.o.agyUserSettings ? readJson(this.o.agyUserSettings) : null;
      const gl = g && isObj(g.statusLine) ? g.statusLine : null;
      if (gl && gl.enabled === false) return null;
      if (gl && typeof gl.command === 'string' && gl.command.trim()) { cmd = gl.command.trim(); line = gl; }
    }
    if (cmd && cmd.includes('atrium-statusline')) cmd = null;
    const base = { ...(line || {}), type: 'command', enabled: true, command: statusLineCommand({ node: this.o.node, script: this.o.script, kind: 'agy', userCommand: cmd, quietDefault: !cmd, shim: this.o.agyShim || null }) };
    return cmd ? base : { ...base, stack_with_default: true };
  }
}

