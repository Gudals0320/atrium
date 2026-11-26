// P370: 메모리 알약 펼침의 추이 그림(ResTrend.jsx)의 순수 함수. 값은 판 API resources.trend(백엔드 resource-trend.mjs: 30초 칸 60개, 경보·잠재우기 표시).
// 단위 시험 app/test/p370-lib.test.mjs
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// 눈금 위끝: v의 1.1배 이상인 1·2·2.5·5 × 10^k. 0이나 모르면 floor. 순수 함수
export function niceMax(v, floor = 1) {
  const t = num(v) && v > 0 ? v * 1.1 : 0;
  if (t <= floor) return floor;
  const e = Math.pow(10, Math.floor(Math.log10(t)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * e >= t) return m * e;
  return 10 * e;
}

// 끊긴 구간: 값이 없거나(null) 칸 사이가 1.5칸보다 넓으면(백엔드가 쉬었거나 PC가 잠듦) 새 줄기. → [[{ at, v }]]. 순수 함수
export function runsOf(points, key, bucketMs) {
  const runs = [];
  let cur = null, last = null;
  for (const p of points || []) {
    const v = p ? p[key] : null;
    if (!num(v) || !p || !num(p.at)) { cur = null; continue; }
    if (!cur || (last != null && p.at - last > bucketMs * 1.5)) { cur = []; runs.push(cur); }
    cur.push({ at: p.at, v }); last = p.at;
  }
  return runs;
}

// 지금(마지막으로 아는 값)과 구간 최고(그 때). peakKey: 최고를 볼 칸(CPU는 칸 안 최고 cpuMax). 순수 함수
export function statOf(points, key, peakKey = key) {
  let now = null, peak = null, peakAt = null;
  for (const p of points || []) {
    if (num(p[key])) now = p[key];
    const v = num(p[peakKey]) ? p[peakKey] : num(p[key]) ? p[key] : null;
    if (v != null && (peak == null || v > peak)) { peak = v; peakAt = p.at; }
  }
  return { now, peak, peakAt };
}

// 줄기 → SVG 길(M x y L …). 한 점뿐인 줄기는 길이 아니라 점으로 그린다(dots). 순수 함수
export function pathOf(run, x, y) { return run.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' '); }
export function areaOf(run, x, y, base) {
  if (run.length < 2) return '';
  return `${pathOf(run, x, y)} L${x(run[run.length - 1].at).toFixed(1)} ${base} L${x(run[0].at).toFixed(1)} ${base} Z`;
}

// 그림 모형. data: resources.trend 결과, o: { w(그림 폭), h(한 칸 높이), pad(좌우 여백) } → 두 칸(mem, cpu)과 표시. 순수 함수
//   CPU 칸은 판 세션 합(PC 전체 대비)과 PC 전체(옅은 기준선, 같은 단위)를 같은 축에. 메모리 칸은 판 세션 합만(PC 메모리는 단위가 달라 글로만).
export function trendModel(data, { w = 372, h = 34, pad = 4 } = {}) {
  const points = (data && data.points) || [];
  const bucketMs = (data && data.bucketMs) || 30000;
  const to = data && num(data.at) ? Math.floor(data.at / bucketMs) * bucketMs : points.length ? points[points.length - 1].at : 0;
  const from = data && num(data.from) ? data.from : to - ((data && data.windowMs) || bucketMs * 60) + bucketMs;
  const span = Math.max(1, to - from);
  const x = (at) => pad + ((at - from) / span) * (w - pad * 2);
  const mem = statOf(points, 'memMB');
  const cpu = statOf(points, 'cpuPct', 'cpuMax');
  const sys = statOf(points, 'sysCpuPct');
  const memMax = niceMax(mem.peak, 100);
  const cpuMax = Math.min(100, niceMax(Math.max(cpu.peak ?? 0, sys.peak ?? 0), 5));
  const top = 3; // 선 두께 여유
  const yOf = (max) => (v) => top + (1 - Math.min(1, Math.max(0, v / max))) * (h - top - 1);
  const ym = yOf(memMax), yc = yOf(cpuMax);
  const lane = (key, y) => { const runs = runsOf(points, key, bucketMs); return { runs, paths: runs.filter((r) => r.length > 1).map((r) => pathOf(r, x, y)), areas: runs.filter((r) => r.length > 1).map((r) => areaOf(r, x, y, h)), dots: runs.filter((r) => r.length === 1).map((r) => ({ x: x(r[0].at), y: y(r[0].v) })) }; };
  const lastPt = (runs, y) => { const r = runs[runs.length - 1]; const p = r && r[r.length - 1]; return p ? { x: x(p.at), y: y(p.v), at: p.at } : null; };
  const m = lane('memMB', ym), c = lane('cpuPct', yc), s = lane('sysCpuPct', yc);
  const sysMem = statOf(points, 'sysMemPct');
  const marks = ((data && data.marks) || []).filter((k) => num(k.at) && k.at >= from - bucketMs && k.at <= to + bucketMs).sort((a, b) => a.at - b.at).map((k) => ({ ...k, x: Math.max(pad, Math.min(w - pad, x(k.at))) }));
  return {
    w, h, from, to, bucketMs, x, empty: !points.some((p) => num(p.memMB) || num(p.cpuPct)), points,
    mem: { ...mem, max: memMax, ...m, end: lastPt(m.runs, ym), y: ym },
    cpu: { ...cpu, max: cpuMax, ...c, end: lastPt(c.runs, yc), y: yc, sys: { ...sys, paths: s.paths, dots: s.dots } },
    sysMemPct: sysMem.now, totalMemMB: (data && data.totalMemMB) ?? null, marks,
  };
}

// 가리킨 자리(그림 안 x) → 가장 가까운 칸 번호(값이 하나라도 있는 칸) | -1. 순수 함수
export function nearestPoint(model, px) {
  let best = -1, d = Infinity;
  model.points.forEach((p, i) => { if (!num(p.memMB) && !num(p.cpuPct)) return; const dx = Math.abs(model.x(p.at) - px); if (dx < d) { d = dx; best = i; } });
  return best;
}
// 가리킨 자리 근처(radius 화면 px 안)의 표시들, 가까운 순. 순수 함수
export function marksNear(model, px, radius = 8) {
  return model.marks.filter((k) => Math.abs(k.x - px) <= radius).sort((a, b) => Math.abs(a.x - px) - Math.abs(b.x - px));
}
// 표시 → 사전 열쇠와 값(가리킴 풀이 한 줄). fmt: { mem, pct }. cores: 줄의 CPU를 코어 하나 대비로(목록·배지와 같은 잣대). 순수 함수
export function markLine(k, fmt, cores = 1) {
  if (k.type === 'sleep') return { key: k.by === 'hand' ? 'p370.markSleepHand' : 'p370.markSleep', vars: { name: k.name, mem: k.memMB != null ? fmt.mem(k.memMB) : '?' } };
  const what = [...new Set((k.reasons || []).filter((r) => r === 'cpu' || r === 'mem' || r === 'grow'))]; // 사전 열쇠 p370.what.*
  return { key: k.kind === 'suspect' ? 'p370.markSuspect' : 'p370.markHeavy', vars: { name: k.name, cpu: k.cpuPct != null ? fmt.pct(k.cpuPct * cores) : '?', mem: k.memMB != null ? fmt.mem(k.memMB) : '?' }, what };
}
