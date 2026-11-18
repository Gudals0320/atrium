// P211: 구독 사용량(Claude, Codex, Antigravity). 한도 창(5시간·주간 등)의 사용률, 리셋 시각, 크레딧, 요금제를 구독마다 마지막 값으로 든다.
// 출처(로컬만, 네트워크로 묻지 않는다. 로그인·키 파일은 열지 않는다):
// - Claude: 판이 띄운 Claude Code의 상태 줄 명령(bin/atrium-statusline.mjs)이 받은 JSON의 rate_limits(five_hour·seven_day의 used_percentage, resets_at)
// - Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl의 token_count 줄 payload.rate_limits(primary·secondary, credits, plan_type).
//   오늘·어제 폴더의 파일 가운데 바뀐 파일만 끝(늘어난 만큼, 처음은 끝 256KB)을 읽는다
// - AGY: 판이 띄운 AGY의 상태 줄 명령이 받은 JSON의 quota_buckets({ 이름: { remaining_fraction, reset_in_seconds } })
// 값이 바뀌면 창에 usage.updated를 보내고, 한 창이 90%를 넘으면 그 창이 리셋될 때까지 한 번 usage.alert를 보낸다(설정 usageAlerts).
// 판 기록 meta usage(마지막 값), usageAlerted(알린 열쇠)에 남는다(판이 다시 떠도 마지막 값과 "n분 전"이 보인다)
import fs from 'node:fs';
import path from 'node:path';

export const PROVIDERS = ['claude', 'codex', 'agy'];
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
  const qb = input.quota_buckets;
  const list = Array.isArray(qb) ? qb.map((b, i) => [isObj(b) ? b.name || b.id || b.key || `q${i + 1}` : `q${i + 1}`, b]) : isObj(qb) ? Object.entries(qb) : [];
  const windows = [];
  for (const [name, b] of list) {
    if (!isObj(b)) continue;
    const rf = num(b.remaining_fraction) ? b.remaining_fraction : null;
    const used = rf != null ? (1 - rf) * 100 : num(b.used_percentage) ? b.used_percentage : null;
    if (used == null) continue;
    const resetsAt = num(b.reset_in_seconds) ? at + Math.round(b.reset_in_seconds * 1000) : toMs(b.reset_time ?? b.resets_at);
    windows.push({ id: String(name), minutes: null, usedPct: pct(used), resetsAt });
  }
  if (!windows.length) return null;
  const m = isObj(input.model) ? input.model.display_name || input.model.id || null : typeof input.model === 'string' ? input.model : null;
  return { provider: 'agy', source: 'statusline', at, windows, credits: null, plan: null, model: m };
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
const sig = (e) => e ? JSON.stringify([e.windows.map((w) => [w.id, w.usedPct, w.resetsAt ? Math.round(w.resetsAt / 60000) : null]), e.credits, e.plan, e.model]) : '';
export const sameUsage = (a, b) => sig(a) === sig(b);

// ---------- 상태 줄 명령 ----------
const fwd = (p) => String(p).split(path.sep).join('/');
const q = (s) => `"${String(s).replace(/"/g, '')}"`;
// 상태 줄 명령 글. 셸(Git Bash·cmd)에서 같게 읽히도록 경로는 슬래시와 큰따옴표, 사용자 명령은 base64로 넘긴다
export function statusLineCommand({ node = process.execPath, script, kind, userSettings = null, userCommand = null, quietDefault = false }) {
  return [q(fwd(node)), q(fwd(script)), kind, ...(userCommand ? ['--user-cmd-b64', Buffer.from(userCommand, 'utf8').toString('base64')] : userSettings ? ['--user-settings', q(fwd(userSettings))] : []), ...(quietDefault ? ['--default', 'none'] : [])].join(' ');
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
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export class UsageBook {
  // o: { store(getMeta·setMeta), broadcast(이벤트, 값), settings() → 판 설정, codexHome, claudeUserSettings, agyUserSettings, script, node, now, pollMs, log }
  constructor(o = {}) {
    this.o = o;
    this.now = o.now || (() => Date.now());
    this.codex = new CodexUsageReader({ home: o.codexHome, now: this.now });
    const saved = o.store ? o.store.getMeta('usage') : null;
    this.data = Object.fromEntries(PROVIDERS.map((p) => [p, isObj(saved) && isObj(saved[p]) ? saved[p] : null]));
    this.alerted = pruneAlerted(o.store ? o.store.getMeta('usageAlerted') : null, this.now());
    this.lastSent = 0;
    this.timer = null;
  }
  start() {
    this.pollCodex();
    const ms = this.o.pollMs ?? 30000;
    if (ms > 0) { this.timer = setInterval(() => this.pollCodex(), ms); if (this.timer.unref) this.timer.unref(); }
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  alertsOn() { const s = this.o.settings ? this.o.settings() || {} : {}; return s.usageAlerts !== false; }
  get() { return { providers: { ...this.data }, alertsOn: this.alertsOn(), at: this.now() }; }
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
    return { ok: true, changed: this.set(e) };
  }
  set(e) {
    const prev = this.data[e.provider];
    if (prev && e.at < (prev.at || 0) && e.provider === 'codex') return false; // 옛 rollout이 더 나중 값을 덮지 않는다
    const same = sameUsage(prev, e);
    this.data[e.provider] = e;
    const now = this.now();
    if (same && now - this.lastSent < QUIET_BROADCAST_MS) return false;
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
    const base = { ...(line || {}), type: 'command', enabled: true, command: statusLineCommand({ node: this.o.node, script: this.o.script, kind: 'agy', userCommand: cmd, quietDefault: !cmd }) };
    return cmd ? base : { ...base, stack_with_default: true };
  }
}

