// P370: 메모리 알약 펼침의 추이 그림(직전 약 30분). 새로 재지 않는다: 자원 측정(resources.mjs, 도우미면 5초·아니면 30초)이 끝날 때마다(after)
//   판 전체 합(sessionsMB, cpu.sessionsPct)을 받아 TREND_BUCKET_MS 칸으로 묶어 메모리에만 TREND_POINTS개 남긴다(고리). 백엔드를 다시 켜면 비어 있다(DB에 적지 않는다).
//   칸: { at(칸 시작 ms), memMB(칸 안 최고), cpuPct(판 세션 합 CPU, PC 전체 대비, 칸 평균), cpuMax(칸 안 최고), sysCpuPct(PC 전체 CPU, 칸 평균), sysMemPct(PC 메모리 사용률, 칸의 마지막 값), n(묶은 측정 수) }
//   표시(marks): 폭주 감시의 경보(줄 guard가 새로 생기거나 무거움 → 폭주 의심이 됨, resource-guard.mjs)와 잠재우기(세션 상태가 sleeping이 됨)를 그 때·세션 이름·값으로 남긴다.
//   창은 펼침을 열 때만 resources.trend로 받고 열린 동안만 다시 받는다(Chrome.jsx ResourcePill, ResTrend.jsx).
import os from 'node:os';

export const TREND_BUCKET_MS = 30_000;
export const TREND_POINTS = 60; // 30초 × 60 = 30분
export const TREND_MARKS_MAX = 200;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;

// PC 메모리 사용률(%, 소수 한 자리) | null. 순수 함수
export function memPct(total, free) { return num(total) && total > 0 && num(free) ? r1(Math.min(100, Math.max(0, (1 - free / total) * 100))) : null; }

// 측정(snap) → 칸에 더할 값. sys: { total, free }(바이트). 순수 함수
export function sampleOfSnap(snap, sys = null) {
  const c = (snap && snap.cpu) || {};
  return { at: snap && snap.at, memMB: snap ? snap.sessionsMB : null, cpuPct: c.sessionsPct ?? null, sysCpuPct: c.systemPct ?? null, sysMemPct: sys ? memPct(sys.total, sys.free) : null };
}

// 기준 때(now)의 창 밖(가장 오래된 칸 앞) 칸을 버리고 개수를 max로 자른다(제자리). 순수 함수
export function trimPoints(points, now, { bucketMs = TREND_BUCKET_MS, max = TREND_POINTS } = {}) {
  const from = Math.floor(now / bucketMs) * bucketMs - (max - 1) * bucketMs;
  let cut = 0;
  while (cut < points.length && points[cut].at < from) cut++;
  if (points.length - cut > max) cut = points.length - max;
  if (cut > 0) points.splice(0, cut);
  return points;
}

// 칸 고리에 측정 하나를 묶는다(제자리). 같은 칸이면 합치고, 새 칸이면 뒤에 붙인다. 앞 칸보다 이른 측정(시계가 거꾸로)은 버린다. 순수 함수
export function addPoint(points, s, { bucketMs = TREND_BUCKET_MS, max = TREND_POINTS } = {}) {
  if (!s || !num(s.at)) return points;
  const at = Math.floor(s.at / bucketMs) * bucketMs;
  let p = points.length ? points[points.length - 1] : null;
  if (p && at < p.at) return points;
  if (!p || p.at !== at) {
    p = { at, memMB: null, cpuPct: null, cpuMax: null, sysCpuPct: null, sysMemPct: null, n: 0, cpuSum: 0, cpuN: 0, sysSum: 0, sysN: 0 };
    points.push(p);
  }
  p.n++;
  if (num(s.memMB)) p.memMB = p.memMB == null ? s.memMB : Math.max(p.memMB, s.memMB);
  if (num(s.cpuPct)) { p.cpuSum += s.cpuPct; p.cpuN++; p.cpuPct = r1(p.cpuSum / p.cpuN); p.cpuMax = p.cpuMax == null ? s.cpuPct : Math.max(p.cpuMax, s.cpuPct); }
  if (num(s.sysCpuPct)) { p.sysSum += s.sysCpuPct; p.sysN++; p.sysCpuPct = r1(p.sysSum / p.sysN); }
  if (num(s.sysMemPct)) p.sysMemPct = s.sysMemPct;
  return trimPoints(points, at, { bucketMs, max });
}

// 앞 측정의 세션 상태(prev: Map(세션 → { kind, state, memMB }))와 이번 줄들 → 새 표시와 다음 상태. 순수 함수
//   경보: 줄 guard(멈춘 세션 빼고)가 새로 생기거나 무거움 → 폭주 의심. 멈춘 동안은 앞 종류를 이어 가(다시 돌려도 새 표시를 만들지 않는다)
//   잠재우기: 앞에 깨어 있던 세션이 sleeping. 아낀 메모리는 앞 측정의 그 세션 메모리. extra(sessionId) → 덧붙일 값({ by } 등)
export function marksOf(prev, rows, at, extra = () => null) {
  const marks = [];
  const next = new Map();
  for (const x of rows || []) {
    if (!x || !x.sessionId) continue;
    const was = prev.get(x.sessionId) || null;
    const paused = !!(x.guard && x.guard.paused);
    const g = x.guard && !paused ? x.guard : null;
    const kind = g ? g.kind : paused && was ? was.kind : null;
    if (g && (!was || !was.kind || (was.kind === 'heavy' && g.kind === 'suspect'))) {
      const reasons = g.reasons || [];
      marks.push({ at, type: 'alert', kind: g.kind, sessionId: x.sessionId, name: x.name, reasons: reasons.map((r) => r.type), ...(reasons.length && reasons.every((r) => r.instant) ? { instant: true } : {}), cpuPct: x.cpuPct ?? null, memMB: x.memMB ?? null });
    }
    if (x.state === 'sleeping' && was && was.state && was.state !== 'sleeping') {
      let more = null; try { more = extra(x.sessionId); } catch {}
      marks.push({ at, type: 'sleep', sessionId: x.sessionId, name: x.name, memMB: was.memMB ?? null, ...(more || {}) });
    }
    next.set(x.sessionId, { kind, state: x.state, memMB: num(x.memMB) && x.memMB > 0 ? x.memMB : was ? was.memMB : null });
  }
  return { marks, next };
}

// 창에 보낼 꼴: 칸의 셈 칸(cpuSum 등)을 빼고, 표시는 창 안의 것만. 순수 함수
export function trendView(points, marks, { now, bucketMs = TREND_BUCKET_MS, max = TREND_POINTS, totalMemMB = null } = {}) {
  const from = Math.floor(now / bucketMs) * bucketMs - (max - 1) * bucketMs;
  return {
    at: now, bucketMs, windowMs: bucketMs * max, from, totalMemMB,
    points: points.filter((p) => p.at >= from).map((p) => ({ at: p.at, memMB: p.memMB, cpuPct: p.cpuPct, cpuMax: p.cpuMax, sysCpuPct: p.sysCpuPct, sysMemPct: p.sysMemPct, n: p.n })),
    marks: marks.filter((m) => m.at >= from),
  };
}

export class ResourceTrend {
  // sys: () => { total, free }(바이트, 측정 때 한 번 읽는다), extra: 잠재우기 표시에 덧붙일 값, now: 시계
  constructor({ bucketMs = TREND_BUCKET_MS, max = TREND_POINTS, sys = () => ({ total: os.totalmem(), free: os.freemem() }), extra = () => null, now = () => Date.now() } = {}) {
    Object.assign(this, { bucketMs, max, sys, extra, now });
    this.points = [];
    this.marks = [];
    this.prev = new Map();
  }
  // 측정마다(ResourceMonitor.after, 폭주 감시가 줄에 guard를 실은 뒤)
  add(snap) {
    if (!snap || !num(snap.at)) return;
    let sys = null; try { sys = this.sys(); } catch {}
    this.totalMemMB = sys && num(sys.total) ? Math.round(sys.total / 1048576) : this.totalMemMB ?? null;
    addPoint(this.points, sampleOfSnap(snap, sys), { bucketMs: this.bucketMs, max: this.max });
    const { marks, next } = marksOf(this.prev, snap.sessions, snap.at, this.extra);
    this.prev = next;
    if (marks.length) this.marks.push(...marks);
    const from = Math.floor(snap.at / this.bucketMs) * this.bucketMs - (this.max - 1) * this.bucketMs;
    let cut = 0;
    while (cut < this.marks.length && this.marks[cut].at < from) cut++;
    if (this.marks.length - cut > TREND_MARKS_MAX) cut = this.marks.length - TREND_MARKS_MAX;
    if (cut > 0) this.marks.splice(0, cut);
  }
  view(now = this.now()) { return trendView(this.points, this.marks, { now, bucketMs: this.bucketMs, max: this.max, totalMemMB: this.totalMemMB ?? null }); }
}
