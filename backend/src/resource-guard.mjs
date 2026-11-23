// P341: 세션 폭주 감시(A)와 판이 띄운 세션의 우선순위 낮추기(B). 자원 측정(resources.mjs ResourceMonitor)이 끝날 때마다 step()이 돈다.
// 사용자(2026-11-23): "세션 하나에서 CPU·RAM 폭주가 종종 생긴다. 모니터링하고 폭발하면 멈추는 기능". 자동으로 하는 것은 되돌릴 수 있는 것
//   (우선순위 낮추기)뿐이고, 프로세스 끄기·일시정지·재우기는 사람이 카드에서 누른다.
// A. 판정(judge, 순수): 세션 나무(패널 셸 아래 모든 프로세스)의 표본 기록으로
//   - cpu: 코어 하나 대비 사용률(줄의 cpuPct × 코어 수)이 기준(기본 90%) 이상인 측정이 끝에서부터 이어진 시간이 기준(기본 3분) 이상
//   - mem: 나무 메모리가 기준(기본 3GB) 이상
//   - grow: 기준 시간(기본 10분, 0이면 끔) 내내 측정마다 줄지 않고 그동안 GROW_MIN_MB 이상 늘었다
//   종류(classify): 셸 패널은 늘 무거움(heavy, 표시만), 에이전트가 일하는 중(working·starting)이면 무거움, 쉼·기다림·잠듦·끝남이면 폭주 의심(suspect).
//   후보(어느 기준이든 80%를 넘음)가 있으면 다음 측정을 FAST_MS로 당긴다(보통 때는 그대로 30초).
// 표시: 측정 줄(snap.sessions[i])에 guard { kind, reasons, since, top, paused?, card? }를 싣는다(창의 배지·메모리 알약 강조·카드 실시간 값).
// 할 일 카드(kind guard): 폭주 의심이 되면 세션마다 한 장(한 번의 폭주 동안 다시 만들지 않는다. 사람이 무시해도 같은 폭주 동안은 다시 띄우지 않는다).
//   카드의 guard 칸(JSON): { kind, reasons, top, state, at, paused? }. 보기: 그 프로세스 끄기(가장 무거운 것이 에이전트 본체·패널 뿌리면 숨기고 재우기를 권함),
//   세션 일시정지(도우미가 있을 때만, 그동안 카드와 배지에 다시 돌리기), 재우기(대화 보존, sleep.mjs), 30분 묻지 않기. 폭주가 풀리면 카드는 판이 닫는다(closed, via resolved).
// 동작 전 확인(P168): 누르는 순간 프로세스 표를 다시 읽어 그 세션의 지금 나무를 만들고, 그 PID·생성 시각이 나무 안일 때만 도우미(proc-control.mjs)에 넘긴다.
//   도우미는 핸들을 쥔 채 생성 시각을 한 번 더 맞춘다. 패널 뿌리·에이전트 본체는 끄지 않는다(재우기). 판이 띄운 세션 나무 밖은 넘기지 않는다.
// 기록: 이벤트 resource_alert { kind, type, cpuPct, memMB, growMB, top, state }(폭주가 시작되거나 무거움 → 의심이 될 때), resource_alert_end { kind, ms, by },
//   resource_action { action, pid, name, ok, why }. report()가 며칠치를 모은다(판 API guard.report, bin/atrium-resource-report.mjs).
// B. 우선순위: 설정 guardLowerPriority(기본 켬)면 측정마다 세션 나무에서 우선순위가 보통(8)인 프로세스를 보통 이하로 낮춘다(이상한 나무는 건드리지 않는다).
//   hc는 에이전트를 셸 없이 터미널의 첫 프로세스로 띄워(terminal.run argv) "명령을 치기 전에 셸을 낮추는" 자리가 없다. 대신 패널이 생기거나 바뀌면(pane_created·pane_moved)
//   곧바로 그 뿌리 프로세스를 낮춘다(onPane): 그 뒤에 뜨는 자식은 Windows가 보통 이하 등급을 물려준다. 그 전에 뜬 자식은 다음 측정이 낮춘다.
//   끄면 세션 나무의 보통 이하(6) 프로세스를 보통으로 되돌린다(판이 낮췄던 것과 그 등급을 물려받은 자식). 터미널 서버·백엔드·창·판 밖 프로세스는 나무에 없어 건드리지 않는다.
import { descendants, suspectTree } from './resources.mjs';
import { PRIO, setPrio, getPrio } from './proc-control.mjs';

export const GUARD_DEFAULTS = { cpuPct: 90, cpuMin: 3, memGB: 3, growMin: 10 };
export const GROW_MIN_MB = 200; // grow: 그 시간 동안 적어도 이만큼은 늘어야
export const FAST_MS = 10_000; // 후보가 있을 때 측정 간격
export const NEAR = 0.8; // 후보: 기준의 이만큼
export const MUTE_MS = 30 * 60_000; // 30분 묻지 않기
export const HIST_MAX = 400; // 세션마다 남기는 표본 수(10초 간격이면 1시간 남짓)
export const ACTIONS = ['kill', 'pause', 'resume', 'sleep', 'mute'];
const BUSY = new Set(['working', 'starting']);
const SHELL = 'shell';

// 판 설정 → 기준. 순수 함수
export function guardConfig(st = {}) {
  const n = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
  return {
    detect: st.guardDetect !== false,
    lower: st.guardLowerPriority !== false,
    cpuPct: n(st.guardCpuPct, GUARD_DEFAULTS.cpuPct),
    cpuMs: n(st.guardCpuMin, GUARD_DEFAULTS.cpuMin) * 60_000,
    memMB: n(st.guardMemGB, GUARD_DEFAULTS.memGB) * 1024,
    growMs: n(st.guardGrowMin, GUARD_DEFAULTS.growMin) * 60_000,
  };
}

// 측정 줄 → 표본 { at, spanMs, core(코어 하나 대비 %), memMB }. 순수 함수
export function sampleOf(row, snap) {
  const cores = (snap && snap.cpu && snap.cpu.cores) || 1;
  return { at: snap.at, spanMs: (snap.cpu && snap.cpu.spanMs) || 0, core: row.cpuPct == null ? null : Math.round(row.cpuPct * cores * 10) / 10, memMB: row.memMB ?? null };
}

// 표본 기록(오래된 것 먼저) → 걸린 기준들 [{ type: cpu, pct, ms, since } | { type: mem, memMB } | { type: grow, fromMB, toMB, ms }]. 순수 함수
export function judge(hist, cfg, now = hist.length ? hist[hist.length - 1].at : Date.now()) {
  const out = [];
  if (!hist || !hist.length) return out;
  const last = hist[hist.length - 1];
  // cpu: 끝에서부터 이어진 높은 측정. 시작은 그 첫 측정이 잰 구간의 앞끝
  let start = null;
  for (let i = hist.length - 1; i >= 0; i--) {
    const h = hist[i];
    if (h.core == null || h.core < cfg.cpuPct) break;
    start = h.at - (h.spanMs || 0);
  }
  if (start != null && now - start >= cfg.cpuMs) out.push({ type: 'cpu', pct: Math.round(last.core), ms: now - start, since: start });
  if (last.memMB != null && last.memMB >= cfg.memMB) out.push({ type: 'mem', memMB: last.memMB });
  if (cfg.growMs > 0 && last.memMB != null) {
    // 기준 시간 앞의 마지막 표본(밑)부터 끝까지 줄지 않고 늘었나
    let base = -1;
    for (let i = hist.length - 1; i >= 0; i--) if (hist[i].at <= now - cfg.growMs) { base = i; break; }
    if (base >= 0) {
      let ok = true;
      for (let i = base + 1; i < hist.length && ok; i++) if (hist[i].memMB == null || hist[i - 1].memMB == null || hist[i].memMB < hist[i - 1].memMB) ok = false;
      const from = hist[base].memMB;
      if (ok && from != null && last.memMB - from >= GROW_MIN_MB) out.push({ type: 'grow', fromMB: from, toMB: last.memMB, ms: now - hist[base].at });
    }
  }
  return out;
}
// 후보인가(다음 측정을 당길까): 지금 기준의 NEAR를 넘었나. 순수 함수
export function nearAlert(hist, cfg) {
  const last = hist && hist.length ? hist[hist.length - 1] : null;
  if (!last) return false;
  return (last.core != null && last.core >= cfg.cpuPct * NEAR) || (last.memMB != null && last.memMB >= cfg.memMB * NEAR);
}
// 폭주 의심(suspect) | 무거움(heavy). shell: 셸 패널인가, state: 판의 세션 상태. 순수 함수
export function classify(shell, state) {
  if (shell || state === 'shell_running' || state === 'shell_idle') return 'heavy';
  return BUSY.has(state) ? 'heavy' : 'suspect';
}
// 카드에 보일 가장 무거운 프로세스: CPU가 걸렸으면 CPU 맨 위, 아니면 메모리 맨 위. agent: 패널 뿌리이거나 에이전트 본체(끄기 대신 재우기). 순수 함수
export function topOf(row, reasons) {
  const cpu = reasons.some((r) => r.type === 'cpu');
  const t = (cpu ? row.topCpu : row.topMem) || row.topMem || row.topCpu || null;
  if (!t) return null;
  const agent = Number(t.pid) === Number(row.shellPid) || (row.claudePid != null && Number(t.pid) === Number(row.claudePid));
  return { ...t, agent };
}
// 같은 폭주 동안 카드를 다시 만들지 않는다: 만들 수 있나. 순수 함수
export function mayCard(alert, { detect = true, mutedUntil = 0, now = Date.now(), open = false } = {}) {
  return !!alert && detect && alert.kind === 'suspect' && !alert.carded && !open && !(mutedUntil > now);
}
// 동작 전 확인: tree(지금 읽은 세션 나무)에 pid가 있고 생성 시각이 맞으면 그 프로세스, 아니면 까닭. 순수 함수
export function verifyTarget(tree, pid, created = null) {
  if (!tree || !tree.length) return { why: 'no_tree' };
  const p = tree.find((x) => Number(x.pid) === Number(pid));
  if (!p) return { why: 'not_in_session' };
  if (created != null && Number.isFinite(Number(created)) && Number.isFinite(p.created) && Math.abs(p.created - Number(created)) > 5) return { why: 'pid_reused' };
  if (!Number.isFinite(p.created)) return { why: 'no_created' };
  return { proc: p };
}
// 우선순위를 바꿀 프로세스: mode lower → 보통(8)인 것, restore → 보통 이하(6)인 것. trees: Map(세션 → 나무). 순수 함수
export function priorityTargets(trees, mode) {
  const want = mode === 'restore' ? 6 : 8;
  const out = [];
  for (const tree of trees.values()) for (const p of tree || []) if (p && p.prio === want && Number(p.pid) > 4) out.push(p);
  return out;
}
// 며칠치 기록 → 보고(기준 다듬기용). events: [{ t, session_id, kind, data }]. 순수 함수
export function reportOf(events, names = () => null) {
  const r = { alerts: 0, byKind: {}, byType: {}, top: {}, ends: 0, endMs: [], actions: {}, rows: [] };
  for (const e of events || []) {
    const d = (typeof e.data === 'string' ? safeJson(e.data) : e.data) || {};
    if (e.kind === 'resource_alert') {
      r.alerts++; r.byKind[d.kind] = (r.byKind[d.kind] || 0) + 1;
      for (const t of d.types || [d.type]) if (t) r.byType[t] = (r.byType[t] || 0) + 1;
      if (d.top && d.top.name) r.top[d.top.name] = (r.top[d.top.name] || 0) + 1;
      const sid = e.sessionId ?? e.session_id;
      r.rows.push({ t: e.t, session: names(sid) || sid, kind: d.kind, types: d.types || [d.type], cpuPct: d.cpuPct ?? null, memMB: d.memMB ?? null, growMB: d.growMB ?? null, top: d.top ? `${d.top.name}${d.top.pid ? ` (${d.top.pid})` : ''}` : null, state: d.state || null });
    } else if (e.kind === 'resource_alert_end') { r.ends++; if (Number.isFinite(d.ms)) r.endMs.push(d.ms); }
    else if (e.kind === 'resource_action') { const k = `${d.action}:${d.ok ? 'ok' : d.why || 'fail'}`; r.actions[k] = (r.actions[k] || 0) + 1; }
  }
  r.endMs.sort((a, b) => a - b);
  r.medianEndMs = r.endMs.length ? r.endMs[Math.floor(r.endMs.length / 2)] : null;
  delete r.endMs;
  r.rows.sort((a, b) => a.t - b.t);
  return r;
}
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
const apiErr = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

// 카드 글(판 언어). 창은 guard 칸으로 다시 그린다. 이 글은 휴대폰 옛 창·atrium todo --list용
const fmtMB = (m) => (m >= 1024 ? `${(m / 1024).toFixed(1)}GB` : `${Math.round(m)}MB`);
export function cardText(name, g, lang = 'en') {
  const ko = lang === 'ko';
  const bits = g.reasons.map((r) => r.type === 'cpu' ? (ko ? `CPU ${r.pct}% · ${Math.round(r.ms / 60000)}분` : `CPU ${r.pct}% for ${Math.round(r.ms / 60000)} min`)
    : r.type === 'mem' ? (ko ? `메모리 ${fmtMB(r.memMB)}` : `memory ${fmtMB(r.memMB)}`)
    : (ko ? `메모리 ${fmtMB(r.fromMB)} → ${fmtMB(r.toMB)} 계속 늘어남` : `memory growing ${fmtMB(r.fromMB)} → ${fmtMB(r.toMB)}`));
  const top = g.top ? (ko ? ` · 가장 무거운 프로세스 ${g.top.name} (PID ${g.top.pid})` : ` · heaviest process ${g.top.name} (PID ${g.top.pid})`) : '';
  return ko ? `@${name} 폭주 의심: 쉬는 중인데 ${bits.join(', ')}${top}` : `@${name} may be running away: idle but ${bits.join(', ')}${top}`;
}

export class ResourceGuard {
  // b: 백엔드(sessions, store, decisions, sleeper, adapter, log), monitor: ResourceMonitor, proc: ProcControl, settings: () => 판 설정
  constructor(b, { monitor, proc, settings = () => ({}), now = () => Date.now(), setPriority = setPrio, getPriority = getPrio } = {}) {
    Object.assign(this, { b, monitor, proc, settings, now, setPriority, getPriority });
    this.hist = new Map(); // 세션 → 표본[]
    this.alerts = new Map(); // 세션 → { kind, reasons, since, top, carded, cardId, state }
    this.mute = new Map(); // 세션 → 이때까지 카드를 만들지 않는다
    this.paused = new Map(); // 세션 → { at, procs: [{ pid, created, name }] } (판 기록 meta guardPaused에도)
    this.lowered = 0; // 이번 실행에서 낮춘 수
    try { const p = b.store.getMeta('guardPaused') || {}; for (const [sid, v] of Object.entries(p)) if (v && Array.isArray(v.procs)) this.paused.set(sid, v); } catch {}
    this.lowerWas = (() => { try { return !!b.store.getMeta('guardLowered'); } catch { return false; } })(); // 앞 실행이 낮춰 둔 채인가(끔이면 되돌린다)
  }
  cfg() { let st = {}; try { st = this.settings() || {}; } catch {} return guardConfig(st); }
  canPause() { return !!(this.proc && this.proc.available()); }
  // 다음 측정 간격: 후보·경보가 있으면 FAST_MS
  nextDelay() {
    const cfg = this.cfg();
    if (!cfg.detect) return null;
    for (const [sid, h] of this.hist) if (!this.paused.has(sid) && (this.alerts.has(sid) || nearAlert(h, cfg))) return FAST_MS;
    return null;
  }
  savePaused() { try { this.b.store.setMeta('guardPaused', Object.fromEntries(this.paused)); } catch {} }
  dec() { return this.b.decisions || null; }
  openCard(sid) { const d = this.dec(); if (!d) return null; return d.store().openDecisions(sid).find((x) => x.kind === 'guard') || null; }

  // ---------- 측정마다 ----------
  async step(snap, mon = this.monitor) {
    const cfg = this.cfg();
    const now = snap.at || this.now();
    const live = new Set();
    for (const row of snap.sessions || []) {
      const sid = row.sessionId; live.add(sid);
      const s = this.b.sessions.get(sid);
      const h = this.hist.get(sid) || [];
      h.push(sampleOf(row, snap)); if (h.length > HIST_MAX) h.splice(0, h.length - HIST_MAX);
      this.hist.set(sid, h);
      const p = this.paused.get(sid);
      if (p) { const a = this.alerts.get(sid); row.guard = { ...(a ? this.view(a) : { kind: 'suspect', reasons: [], since: p.at, top: null }), paused: { at: p.at } }; continue; }
      if (!cfg.detect || row.suspect) { this.endAlert(sid, row.suspect ? 'suspect_tree' : 'off'); continue; }
      const reasons = judge(h, cfg, now);
      if (!reasons.length) { this.endAlert(sid, 'resolved'); continue; }
      const kind = classify(row.kind === SHELL || (s && s.kind === SHELL), row.state);
      let a = this.alerts.get(sid);
      const fresh = !a;
      const was = a ? a.kind : null;
      if (!a) { a = { since: now, carded: false, cardId: null }; this.alerts.set(sid, a); }
      Object.assign(a, { kind, reasons, top: topOf(row, reasons), state: row.state, memMB: row.memMB, cpuPct: row.cpuPct });
      if (fresh || (was === 'heavy' && kind === 'suspect')) this.logAlert(sid, a, row);
      // 카드: 의심이면 한 장(같은 폭주 동안 한 번). 일하는 중으로 바뀌면(무거움) 닫는다
      const open = this.openCard(sid);
      if (open && !a.cardId) a.cardId = open.id; // 판이 다시 떴을 때 열린 카드를 이어 받는다
      if (kind === 'suspect' && mayCard(a, { detect: cfg.detect, mutedUntil: this.mute.get(sid) || 0, now, open: !!open })) this.makeCard(s, a);
      else if (kind !== 'suspect' && open) this.closeCard(open, 'working');
      row.guard = this.view(a);
    }
    for (const sid of [...this.hist.keys()]) if (!live.has(sid)) { this.hist.delete(sid); this.endAlert(sid, 'gone'); }
    for (const sid of [...this.paused.keys()]) if (!this.b.sessions.has(sid)) { this.paused.delete(sid); this.savePaused(); }
    this.closeOrphans();
    this.sweepPriority(cfg, mon && mon.trees ? mon.trees : new Map(), snap);
  }
  view(a) { return { kind: a.kind, reasons: a.reasons, since: a.since, top: a.top, ...(a.cardId ? { card: a.cardId } : {}) }; }
  logAlert(sid, a, row) {
    const g = (t) => a.reasons.find((r) => r.type === t);
    const data = { kind: a.kind, type: a.reasons[0].type, types: a.reasons.map((r) => r.type), cpuPct: g('cpu') ? g('cpu').pct : null, memMB: row.memMB ?? null, growMB: g('grow') ? Math.round(g('grow').toMB - g('grow').fromMB) : null, top: a.top ? { name: a.top.name, pid: a.top.pid, cpuPct: a.top.cpuPct, memMB: a.top.memMB, agent: a.top.agent } : null, state: row.state };
    this.b.store.addEvent(sid, 'resource_alert', data);
    this.b.log(`resource alert ${row.name} ${a.kind} ${data.types.join('+')} cpu=${data.cpuPct ?? '-'}% mem=${data.memMB ?? '-'}MB top=${a.top ? `${a.top.name}(${a.top.pid})` : '-'} state=${row.state}`);
  }
  endAlert(sid, by) {
    const a = this.alerts.get(sid);
    if (!a) return;
    this.alerts.delete(sid);
    this.b.store.addEvent(sid, 'resource_alert_end', { kind: a.kind, ms: this.now() - a.since, by });
    const open = this.openCard(sid);
    if (open) this.closeCard(open, by);
  }
  makeCard(s, a) {
    const d = this.dec();
    if (!d || !s) return null;
    let lang = 'en'; try { lang = (this.settings() || {}).language || 'en'; } catch {}
    const g = { kind: a.kind, reasons: a.reasons, top: a.top, state: a.state, at: this.now() };
    const name = s.name;
    const card = d.store().addDecision({ sessionId: s.sessionId, name, question: cardText(name, g, lang), options: [], createdAt: this.now(), kind: 'guard', guard: g });
    a.carded = true; a.cardId = card.id;
    this.b.store.addEvent(s.sessionId, 'decision_todo', { id: card.id, kind: 'guard', by: 'board' });
    d.changed();
    try { d.push(s, card); } catch {}
    return card;
  }
  closeCard(card, via, state = 'closed') {
    const d = this.dec();
    if (!d || !card) return;
    const r = d.store().endDecision(card.id, { state, via: `guard_${via}` });
    if (!r) return;
    this.b.store.addEvent(card.sessionId, 'decision_end', { id: card.id, state, via: `guard_${via}`, kind: 'guard' });
    d.changed();
  }
  // 경보도 일시정지도 없는 세션의 열린 폭주 카드(판이 다시 떴을 때 남은 것)
  closeOrphans() {
    const d = this.dec();
    if (!d) return;
    for (const c of d.store().openDecisions()) if (c.kind === 'guard' && !this.alerts.has(c.sessionId) && !this.paused.has(c.sessionId)) this.closeCard(c, 'resolved');
  }

  // ---------- B. 우선순위 ----------
  sweepPriority(cfg, trees, snap) {
    const ok = new Map([...trees].filter(([sid]) => { const r = (snap.sessions || []).find((x) => x.sessionId === sid); return r && !r.suspect; }));
    if (cfg.lower) {
      let n = 0;
      for (const p of priorityTargets(ok, 'lower')) if (this.setPriority(p.pid, 'below')) n++;
      if (n) { this.lowered += n; if (!this.lowerWas) { this.lowerWas = true; try { this.b.store.setMeta('guardLowered', true); } catch {} } this.b.log(`priority: lowered ${n} board session process(es) to below normal`); }
    } else if (this.lowerWas) {
      let n = 0;
      for (const p of priorityTargets(ok, 'restore')) if (this.setPriority(p.pid, 'normal')) n++;
      this.lowerWas = false; try { this.b.store.setMeta('guardLowered', false); } catch {}
      this.b.log(`priority: restored ${n} board session process(es) to normal`);
    }
  }
  // 패널이 생기거나 바뀌었다(에이전트 띄우기·되살리기·셸 남기기): 뿌리 프로세스를 곧바로 낮춘다(그 뒤 자식은 등급을 물려받는다)
  async onPane(paneId) {
    if (!paneId || !this.cfg().lower || !this.b.adapter || !this.b.adapter.processInfo) return false;
    const info = await this.b.adapter.processInfo(paneId).catch(() => null);
    const pid = info && info.shell_pid;
    if (!pid || this.getPriority(pid) !== 0) return false; // 0 = 보통. 이미 다른 등급이면 두지 않는다
    const ok = this.setPriority(pid, 'below');
    if (ok && !this.lowerWas) { this.lowerWas = true; try { this.b.store.setMeta('guardLowered', true); } catch {} }
    return ok;
  }
  // 설정이 바뀌었다: 우선순위 끔이면 곧바로 한 번 잰다(되돌리기)
  onSettings() { if (!this.cfg().lower && this.lowerWas && this.monitor) this.monitor.sample().catch(() => {}); }

  // ---------- 사람의 동작 ----------
  // 그 세션의 지금 나무(표를 새로 읽는다). → { tree, shell, claude } | 까닭으로 던짐
  async freshTree(s) {
    if (!s || !s.paneId) throw apiErr('no_pane', 'That session has no terminal.');
    const [table, info] = await Promise.all([this.monitor.readTable(), this.b.adapter.processInfo(s.paneId).catch(() => null)]);
    if (!table) throw apiErr('no_table', 'Could not read the process table.');
    const shell = info && info.shell_pid;
    if (!shell) throw apiErr('no_pane', 'Could not find the terminal process of that session.');
    const tree = descendants(table.procs, shell);
    const others = [];
    for (const [sid, t] of (this.monitor.trees || new Map())) if (sid !== s.sessionId && t && t[0]) others.push(t[0].pid);
    const bad = suspectTree(tree, others);
    if (bad) throw apiErr('suspect_tree', `The process tree of that session looks wrong (${bad}); nothing was touched.`);
    const claude = info && (info.foreground_processes || []).find((p) => /claude/i.test(p.name || ''));
    return { tree, shell, claude: claude ? claude.pid : null, table };
  }
  record(sid, action, data) {
    this.b.store.addEvent(sid, 'resource_action', { action, ...data });
    this.b.log(`resource action ${action} ${this.b.sessions.get(sid) ? this.b.sessions.get(sid).name : sid} ok=${!!data.ok}${data.why ? ` why=${data.why}` : ''}${data.name ? ` ${data.name}(${data.pid})` : ''}`);
  }
  // p: { id(카드) | session, action, pid?, created? }
  async act(p = {}) {
    const action = String(p.action || '');
    if (!ACTIONS.includes(action)) throw apiErr('bad_request', `action is one of ${ACTIONS.join(', ')}`);
    const d = this.dec();
    const card = p.id != null && d ? d.store().getDecision(p.id) : null;
    const sid = card ? card.sessionId : p.session ? (this.b.resolve ? this.b.resolve(p.session).sessionId : String(p.session)) : null;
    const s = sid ? this.b.sessions.get(sid) : null;
    if (!s) throw apiErr('not_found', 'That session is not on the board.');
    const out = await this['_' + action](s, p, card);
    this.refresh();
    return out;
  }
  async _kill(s, p, card) {
    const g = card && card.guard ? card.guard : {};
    const a = this.alerts.get(s.sessionId);
    const pid = Number(p.pid ?? (g.top && g.top.pid) ?? (a && a.top && a.top.pid));
    const created = p.created ?? (g.top && Number(g.top.pid) === pid ? g.top.created : null) ?? (a && a.top && Number(a.top.pid) === pid ? a.top.created : null);
    if (!Number.isInteger(pid) || pid <= 0) throw apiErr('bad_request', 'Which process? (pid)');
    const t = await this.freshTree(s);
    const v = verifyTarget(t.tree, pid, created);
    if (!v.proc) { this.record(s.sessionId, 'kill', { pid, ok: false, why: v.why }); throw apiErr(v.why, v.why === 'pid_reused' ? 'That process already ended (its PID now belongs to another process). Nothing was touched.' : 'That process is no longer in this session. Nothing was touched.'); }
    if (pid === Number(t.shell) || (t.claude && pid === Number(t.claude))) { this.record(s.sessionId, 'kill', { pid, name: v.proc.name, ok: false, why: 'agent_process' }); throw apiErr('agent_process', 'That is the agent itself. Put the session to sleep instead (the conversation is kept).'); }
    // 그 프로세스와 그 아래(모두 세션 나무 안). 자식 먼저
    const sub = descendants(t.table.procs, pid).filter((x) => t.tree.some((y) => y.pid === x.pid)).reverse();
    let res = await this.proc.call('kill', sub).catch(() => null);
    if (!res) { res = new Map(); for (const x of sub) { try { process.kill(x.pid); res.set(x.pid, 'ok'); } catch { res.set(x.pid, 'failed'); } } } // 도우미가 없으면 방금 확인한 나무로
    const ok = res.get(pid) === 'ok';
    this.record(s.sessionId, 'kill', { pid, name: v.proc.name, ok, n: sub.length, why: ok ? null : res.get(pid) || 'failed' });
    if (!ok) throw apiErr('kill_failed', `Could not end ${v.proc.name} (${res.get(pid) || 'failed'}).`);
    return { ok: true, action: 'kill', pid, name: v.proc.name, ended: [...res.values()].filter((x) => x === 'ok').length };
  }
  async _pause(s) {
    if (this.paused.has(s.sessionId)) return { ok: true, action: 'pause', already: true };
    if ((await this.proc.ensure()) !== 'ready') throw apiErr('no_helper', 'Pausing is not available on this PC (no csc.exe to build the helper).');
    const t = await this.freshTree(s);
    const procs = t.tree.filter((x) => Number.isFinite(x.created)).map((x) => ({ pid: x.pid, created: x.created, name: x.name }));
    const res = await this.proc.call('suspend', procs);
    const done = procs.filter((x) => res && res.get(x.pid) === 'ok');
    if (!done.length) { this.record(s.sessionId, 'pause', { ok: false, why: 'suspend_failed', n: procs.length }); throw apiErr('pause_failed', 'Could not pause that session.'); }
    const at = this.now();
    this.paused.set(s.sessionId, { at, procs: done }); this.savePaused();
    const card = this.openCard(s.sessionId);
    if (card) this.setCardGuard(card, { ...(card.guard || {}), paused: { at } });
    this.record(s.sessionId, 'pause', { ok: true, n: done.length, of: procs.length, name: (this.alerts.get(s.sessionId) || {}).top ? this.alerts.get(s.sessionId).top.name : null });
    return { ok: true, action: 'pause', n: done.length };
  }
  async resumeSession(s, why = 'resume') {
    const p = this.paused.get(s.sessionId);
    if (!p) return { ok: true, action: 'resume', already: true };
    const res = await this.proc.call('resume', p.procs).catch(() => null);
    const n = p.procs.filter((x) => res && res.get(x.pid) === 'ok').length;
    this.paused.delete(s.sessionId); this.savePaused();
    this.hist.delete(s.sessionId); // 멈춘 동안의 표본은 버리고 다시 잰다(같은 폭주면 카드는 그대로 다시 의심으로)
    const card = this.openCard(s.sessionId);
    if (card) { const g = { ...(card.guard || {}) }; delete g.paused; this.setCardGuard(card, g); }
    this.record(s.sessionId, 'resume', { ok: !!res, n, of: p.procs.length, why: why === 'resume' ? null : why });
    return { ok: true, action: 'resume', n };
  }
  async _resume(s) { return this.resumeSession(s, 'resume'); }
  async _sleep(s, p, card) {
    if (!this.b.sleeper) throw apiErr('no_sleep', 'Sleep is not available.');
    if (this.paused.has(s.sessionId)) await this.resumeSession(s, 'before_sleep');
    try { await this.b.sleeper.sleep(s, { by: 'hand', mode: 'hand', scope: 'session' }); }
    catch (e) { this.record(s.sessionId, 'sleep', { ok: false, why: e.code || 'failed' }); throw e; }
    this.record(s.sessionId, 'sleep', { ok: true });
    const c = card && card.state === 'open' ? card : this.openCard(s.sessionId);
    if (c) this.closeCard(c, 'sleep', 'answered');
    this.endAlert(s.sessionId, 'sleep');
    return { ok: true, action: 'sleep' };
  }
  async _mute(s, p, card) {
    const until = this.now() + MUTE_MS;
    this.mute.set(s.sessionId, until);
    const c = card && card.state === 'open' ? card : this.openCard(s.sessionId);
    if (c) this.closeCard(c, 'mute', 'ignored');
    this.record(s.sessionId, 'mute', { ok: true, until });
    return { ok: true, action: 'mute', until };
  }
  // 잠재우기 전(sleep.mjs): 멈춘 세션은 먼저 다시 돌린다(멈춘 claude는 /exit를 받지 못한다)
  async beforeSleep(s) { if (this.paused.has(s.sessionId)) await this.resumeSession(s, 'before_sleep').catch(() => {}); }
  setCardGuard(card, g) { const d = this.dec(); if (!d) return; d.store().setGuard(card.id, g); d.changed(); }
  // 지금 값을 창에 다시 보낸다(동작 뒤 배지가 곧바로 바뀌게)
  refresh() {
    const last = this.monitor && this.monitor.last;
    if (!last) return;
    for (const row of last.sessions || []) {
      const a = this.alerts.get(row.sessionId); const p = this.paused.get(row.sessionId);
      if (p) row.guard = { ...(a ? this.view(a) : { kind: 'suspect', reasons: [], since: p.at, top: null }), paused: { at: p.at } };
      else if (a) row.guard = this.view(a); else delete row.guard;
    }
    last.guard = this.status();
    try { this.b.api.broadcast('resources', last); } catch {}
  }
  status() { const cfg = this.cfg(); return { detect: cfg.detect, lower: cfg.lower, canPause: this.canPause(), lowered: this.lowered }; }
  // 며칠치 보고
  report(p = {}) {
    const days = Math.max(1, Math.min(90, Number(p.days) || 7));
    const since = this.now() - days * 86400_000;
    const ev = this.b.store.eventsAfter(since, ['resource_alert', 'resource_alert_end', 'resource_action'], 100000);
    const names = (id) => { const s = this.b.sessions.get(id) || (this.b.store.getSession ? this.b.store.getSession(id) : null); return s ? s.name : null; };
    return { days, since, cfg: this.cfg(), ...reportOf(ev, names) };
  }
  handlers() {
    return {
      'guard.act': (p) => this.act(p),
      'guard.report': (p) => this.report(p),
      'guard.status': () => this.status(),
    };
  }
}
