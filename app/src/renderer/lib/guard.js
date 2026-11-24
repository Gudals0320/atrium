// P341: 폭주 감시의 창 쪽 순수 함수(배지 글, 카드 보기 고르기). 값은 자원 표본(resources)의 줄 guard와 폭주 카드(kind guard)의 guard 칸에서 온다(백엔드 resource-guard.mjs).
// 단위 시험 app/test/p341-lib.test.mjs
export const fmtMem = (mb) => (mb == null ? '?' : mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${Math.round(mb)}MB`);
export const fmtMin = (ms) => Math.max(1, Math.round((ms || 0) / 60000));

// 자원 표본에서 그 세션의 guard | null
export function guardOf(resources, sessionId) {
  const r = resources && resources.sessions ? resources.sessions.find((x) => x.sessionId === sessionId) : null;
  return r && r.guard ? r.guard : null;
}
export function rowOf(resources, sessionId) { return resources && resources.sessions ? resources.sessions.find((x) => x.sessionId === sessionId) || null : null; }

// 배지 조각: [{ key, vars }] (사전 열쇠 guard.badge.*). 멈춘 세션은 paused 하나
export function badgeParts(g) {
  if (!g) return [];
  if (g.paused) return [{ key: 'guard.badge.paused', vars: {} }];
  const out = [];
  for (const r of g.reasons || []) {
    if (r.type === 'cpu') out.push(r.instant ? { key: 'p348.badgeCpuNow', vars: { pct: r.pct } } : { key: 'guard.badge.cpu', vars: { pct: r.pct, min: fmtMin(r.ms) } }); // P348: 곧바로 단 배지
    else if (r.type === 'mem' && !(g.reasons || []).some((x) => x.type === 'grow')) out.push({ key: 'guard.badge.mem', vars: { mem: fmtMem(r.memMB) } });
    else if (r.type === 'grow') out.push({ key: 'guard.badge.grow', vars: { mem: fmtMem(r.toMB) } });
  }
  return out;
}
// 카드의 보기. card: 폭주 카드, o: { canPause, paused, sleepable, top(지금 값이 있으면) } → ['kill' | 'pause' | 'resume' | 'sleep' | 'mute']
// 가장 무거운 것이 에이전트 본체·패널 뿌리면 끄기를 빼고 재우기를 권한다(recommend)
// 턴은 끝났고 뒤 일만 도는 세션(bgOnly)은 판의 절전 규칙이 막는다(잠재우면 뒤 일이 함께 끝난다): 재우기를 빼고 끄기를 권한다(bgBlock)
export function guardActions(card, o = {}) {
  const g = (card && card.guard) || {};
  const top = o.top || g.top || null;
  const paused = !!(o.paused ?? g.paused);
  const bgOnly = !!(o.bgOnly ?? g.bgOnly);
  const sleepable = o.sleepable !== false && !bgOnly;
  const acts = [];
  if (top && !top.agent && !paused) acts.push('kill');
  if (paused) acts.push('resume'); else if (o.canPause) acts.push('pause');
  if (sleepable) acts.push('sleep');
  if (!paused) acts.push('mute');
  return { acts, recommend: top && top.agent && sleepable ? 'sleep' : bgOnly && top && !top.agent && !paused ? 'kill' : null, bgBlock: bgOnly && o.sleepable !== false };
}
// 카드 머리 글 조각(사전 열쇠 guard.why.*)
export function whyParts(g) {
  return (g && g.reasons ? g.reasons : []).map((r) => (r.type === 'cpu' && r.instant ? { key: 'p348.whyCpuNow', vars: { pct: r.pct } } : r.type === 'cpu' ? { key: 'guard.why.cpu', vars: { pct: r.pct, min: fmtMin(r.ms) } } : r.type === 'mem' ? { key: 'guard.why.mem', vars: { mem: fmtMem(r.memMB) } } : { key: 'guard.why.grow', vars: { from: fmtMem(r.fromMB), to: fmtMem(r.toMB), min: fmtMin(r.ms) } }));
}
// 지금 값의 가장 무거운 프로세스(같은 PID면 지금 표본의 값, 아니면 카드의 값)
export function liveTop(card, row) {
  const g = (card && card.guard) || {};
  const t = g.top || null;
  if (!t || !row) return t;
  const cpu = row.topCpu && Number(row.topCpu.pid) === Number(t.pid) ? row.topCpu : null;
  const mem = row.topMem && Number(row.topMem.pid) === Number(t.pid) ? row.topMem : null;
  const now = cpu || mem;
  return now ? { ...t, cpuPct: now.cpuPct, memMB: now.memMB } : t;
}

// P348: 메모리 알약 펼침의 세션 목록 차례. 폭주 의심 → 무거움 → 나머지, 그 안에서 CPU 큰 순, 메모리 큰 순, 이름.
//   잰 메모리가 없거나 잠든 세션은 뺀다(잠든 세션은 리포 묶음의 잠든 줄로). rows: 자원 표본 줄, sessions: Map(판의 세션). 순수 함수
const RANK = { suspect: 0, heavy: 1 };
export function resOrder(rows, sessions = new Map()) {
  const live = (rows || []).filter((x) => x && x.memMB > 0 && !((sessions.get(x.sessionId) || {}).state === 'sleeping'));
  const rank = (x) => (x.guard ? RANK[x.guard.kind] ?? 1 : 2);
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : -1);
  return live.slice().sort((a, b) => rank(a) - rank(b) || n(b.cpuPct) - n(a.cpuPct) || n(b.memMB) - n(a.memMB) || String(a.name).localeCompare(String(b.name)));
}
