// P296: 자체 오케스트레이션 세션의 "안에서 일하는 중" 신호(바쁨 신호). 안의 에이전트들은 화면이 조용해도 돈다.
// 판의 화면 상태(작업 중)는 바꾸지 않고 잠재우기(sleep.mjs)와 멈춤 알림(unit-stops.mjs)만 이것을 본다.
// 신호(런처 칸 busy, 기본 ['proctree', 'cpu']):
// - proctree: 하네스 프로세스(패널의 앞쪽 프로세스) 아래에 하네스가 뜬 뒤 SETTLE이 지나 생긴 자손 프로세스가 있다(띄울 때 함께 뜬 도우미는 뺀다)
// - cpu: 하네스 나무(하네스 포함)의 CPU 시간이 앞 측정보다 CPU_RATE(한 코어의 몫) 넘게 늘었다(프로세스마다 차이를 더한다)
// - { files: '<glob>' }: 그 파일의 고친 때가 FILE_WINDOW_MS 안이다(하네스가 알려 주는 상태 파일. 내용은 읽지 않고 고친 때만 본다).
//   %이름% 환경 변수와 ~를 풀고, 상대 경로는 세션 폴더에서 센다. *·?는 한 마디 안, **는 아래 폴더(깊이 GLOB_DEPTH까지)
// 바빴던 뒤 HOLD_MS 동안은 바쁨으로 둔다(측정 사이에 잠깐 조용한 것으로 깨지 않게).
// 한계: 안의 일이 하네스 나무 밖(공유 데몬 등)에서 돌면 proctree·cpu는 보지 못한다. 그런 하네스는 상태 파일 신호를 쓴다(P297: Hermes는 프로필의 gateway 데몬이 일한다)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { descendants } from './resources.mjs';

export const INNER_SETTLE_MS = 30000;
export const INNER_CPU_RATE = 0.05; // 지난 시간의 5%(한 코어 기준)
export const INNER_FILE_WINDOW_MS = 90000;
export const INNER_HOLD_MS = 60000;
export const GLOB_DEPTH = 4;
export const GLOB_MAX = 2000;
// 하네스별 바쁨 읽개(꽂기). busy 칸의 { reader: '<이름>' }가 고른다. fn({ session, now }) → { busy, why? } | null(모름).
// P297: Hermes는 안의 일이 패널 밖 공유 gateway 데몬에서 돌아 나무·CPU로는 안 보인다. P298: 백엔드가 읽개 'hermes'(hermes.mjs hermesBusyOf: state.db async_delegations·턴 임대)를 꽂는다
export const INNER_READERS = new Map();
export function registerInnerReader(name, fn) { INNER_READERS.set(String(name), fn); return () => INNER_READERS.delete(String(name)); }
// busy 칸의 읽개들 → [{ reader, busy }](등록되지 않은 읽개·실패는 빼고 남긴다)
export function readerSignals(busy = [], ctx = {}) {
  const out = [];
  for (const x of busy || []) {
    if (!x || typeof x !== 'object' || !x.reader) continue;
    const fn = INNER_READERS.get(String(x.reader));
    if (!fn) { out.push({ reader: x.reader, busy: null, why: 'not_registered' }); continue; }
    try { const r = fn(ctx); out.push({ reader: x.reader, busy: r ? !!r.busy : null }); } catch (e) { out.push({ reader: x.reader, busy: null, why: e.message }); }
  }
  return out;
}

// %이름%·~ 풀기
export function expandPath(p, { env = process.env, home = os.homedir(), cwd = '.' } = {}) {
  let s = String(p || '').trim().replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (m, k) => (env[k] != null ? env[k] : env[Object.keys(env).find((x) => x.toUpperCase() === k.toUpperCase())] ?? m));
  if (s === '~' || s.startsWith('~/') || s.startsWith('~\\')) s = path.join(home, s.slice(1));
  s = s.split('\\').join('/');
  return path.isAbsolute(s) ? s : path.join(cwd, s).split('\\').join('/');
}
const segRe = (seg) => new RegExp('^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$', 'i');
const hasWild = (s) => /[*?]/.test(s);
// glob → 맞는 파일의 고친 때 목록 [{ file, mtimeMs }]. 읽기만(stat). fsx는 시험이 바꿔 끼운다
export function globTimes(pattern, { fsx = fs, max = GLOB_MAX } = {}) {
  const parts = String(pattern).split('/');
  let i = 0;
  while (i < parts.length && !hasWild(parts[i])) i++;
  const base = parts.slice(0, i).join('/') || '/';
  const rest = parts.slice(i);
  const out = []; let seen = 0;
  const stat = (f) => { try { return fsx.statSync(f); } catch { return null; } };
  if (!rest.length) { const st = stat(base); if (st && st.isFile()) out.push({ file: base, mtimeMs: st.mtimeMs }); return out; }
  const walk = (dir, k, depth) => {
    if (seen > max || k >= rest.length) return;
    const seg = rest[k];
    if (seg === '**') walk(dir, k + 1, depth); // ** = 0 마디
    let names = [];
    try { names = fsx.readdirSync(dir); } catch { return; }
    for (const n of names) {
      if (++seen > max) return;
      const f = dir.replace(/\/+$/, '') + '/' + n;
      if (seg === '**') { const st = stat(f); if (st && st.isDirectory() && depth < GLOB_DEPTH) walk(f, k, depth + 1); continue; }
      if (!segRe(seg).test(n)) continue;
      const st = stat(f);
      if (!st) continue;
      if (k === rest.length - 1) { if (st.isFile()) out.push({ file: f, mtimeMs: st.mtimeMs }); }
      else if (st.isDirectory()) walk(f, k + 1, depth);
    }
  };
  walk(base, 0, 0);
  const uniq = new Map(out.map((x) => [x.file, x])); // ** 때문에 같은 파일이 여러 번 나올 수 있다
  return [...uniq.values()];
}

// 한 번 재기. 순수 함수(프로세스 표와 파일 때를 받는다).
// o: { procs(Map pid → { pid, ppid, name, created, cpu(ms) }), root(하네스 PID), harness(root가 하네스 자신인가), launchedAt, signals, files([{ glob, newest }]), prev, now }
// → { busy, why: [신호], n(자손 수), cpu: Map(pid → cpu), cpuMs(이번에 늘어난 CPU), at, lastBusyAt }
export function innerWork({ procs = null, root = null, harness = true, launchedAt = 0, signals = ['proctree', 'cpu'], files = [], readers = [], prev = null, now = Date.now(), settleMs = INNER_SETTLE_MS, cpuRate = INNER_CPU_RATE, fileWindowMs = INNER_FILE_WINDOW_MS, holdMs = INNER_HOLD_MS } = {}) {
  const want = new Set(signals.filter((x) => typeof x === 'string'));
  const why = [];
  let n = 0, cpuMs = 0;
  const cpu = new Map();
  if (procs && root) {
    const tree = descendants(procs, Number(root));
    const top = tree[0];
    if (top) {
      const born = harness && Number.isFinite(top.created) ? top.created : launchedAt || top.created || 0;
      const since = born + settleMs;
      n = tree.filter((p) => p !== top && Number.isFinite(p.created) && p.created >= since).length;
      if (want.has('proctree') && n > 0) why.push('proctree');
      for (const p of tree) if (Number.isFinite(p.cpu)) cpu.set(p.pid, p.cpu);
      if (prev && prev.cpu && prev.at && now > prev.at) {
        for (const [pid, c] of cpu) { const b = prev.cpu.get(pid); cpuMs += b != null ? Math.max(0, c - b) : 0; }
        if (want.has('cpu') && cpuMs / (now - prev.at) >= cpuRate) why.push('cpu');
      }
    }
  }
  if (files.some((f) => f.newest && now - f.newest <= fileWindowMs)) why.push('files');
  for (const r of readers) if (r.busy) why.push(`reader:${r.reader}`);
  const lastBusyAt = why.length ? now : prev ? prev.lastBusyAt || 0 : 0;
  const busy = why.length > 0 || (!!lastBusyAt && now - lastBusyAt < holdMs);
  return { busy, why, n, cpu, cpuMs, at: now, lastBusyAt };
}
// P329: 프로세스 표(resources.mjs readProcessTable)의 cpu는 Windows CPU 시간(KernelModeTime + UserModeTime, 100ns 단위)이다.
//   innerWork는 ms로 센다(INNER_CPU_RATE: 지난 시간 ms 대비). 전에는 100ns 값을 그대로 넘겨 1만 배 민감했다(쉬는 하네스의 아주 작은 CPU도 바쁨으로 보여
//   omo 세션이 잠들지 못했다). 측정하는 쪽(sleep.mjs scanInner)이 이것으로 바꿔 넘긴다. 순수 함수
export const CPU_TICKS_PER_MS = 1e4;
export function procsCpuMs(procs) {
  if (!procs) return procs;
  const out = new Map();
  for (const [k, p] of procs) out.set(k, p && Number.isFinite(p.cpu) ? { ...p, cpu: p.cpu / CPU_TICKS_PER_MS } : p);
  return out;
}
// busy 칸의 파일 묶음 → [{ glob, newest }]
export function fileSignals(busy = [], { cwd = '.', env = process.env, fsx = fs } = {}) {
  return (busy || []).filter((x) => x && typeof x === 'object' && x.files).map((x) => {
    const glob = expandPath(x.files, { env, cwd });
    const times = globTimes(glob, { fsx });
    return { glob, newest: times.reduce((a, t) => Math.max(a, t.mtimeMs || 0), 0) || null };
  });
}
