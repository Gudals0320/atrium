// 자원 감시(ARCH 4절 D1, 5절). 약 30초마다 잰다.
// - 세션별 메모리: 터미널의 process_info로 우리 패널의 셸 PID를 얻고, 그 셸 아래 프로세스(claude와 그 자식)의 작업 집합을 더한다.
// - 제어기: 화면 중계가 띄운 제어기 프로세스의 메모리(hc는 프로세스 없이 파이프라 0)
// - 터미널 서버와 백엔드 자신의 메모리, 동시 실행 수(working·waiting)
// 프로세스 표는 PowerShell의 Win32_Process 한 번으로 읽는다(읽기만 한다). 프로세스를 끄지 않는다.
// P255: CPU 사용률. 같은 표에서 프로세스마다 CPU 시간(KernelModeTime + UserModeTime, 100ns)을 읽고, 앞 측정과의 차이를 지난 시간과 코어 수로 나눈다
//   (세션마다, 판이 띄운 세션 모두). PC 전체는 os.cpus()의 두 측정 차이. 첫 측정은 앞 값이 없어 모른다(null). 측정 주기는 메모리와 같다
// P341: 표에 우선순위(Win32_Process Priority, 기본 우선순위: 보통 8, 보통 이하 6, 낮음 4, 보통 이상 10, 높음 13)도 읽는다(resource-guard.mjs 낮추기).
//   세션 줄에 나무 안에서 CPU를 가장 많이 쓴 프로세스(topCpu)와 메모리가 가장 큰 프로세스(topMem)를 싣는다(폭주 카드·배지). 나무 자체는 창에 보내지 않고
//   this.trees(세션 → 나무)에 둔다. 다음 측정까지의 간격은 nextDelay()가 정한다(폭주 의심 후보가 있으면 짧게)
// P168: Windows는 부모가 끝나도 ParentProcessId를 남기고, 그 PID를 새 프로세스가 다시 받는다. 부모 PID만 따라가면 셸이 받은 PID를
// 부모로 적은 오래된 프로세스(부팅 때의 wininit 등)와 그 아래 시스템 전체가 한 세션으로 들어간다. 그래서 생성 시각을 함께 읽고,
// 부모보다 먼저 생긴 "자식"은 따라가지 않는다
import { execFile } from 'node:child_process';
import os from 'node:os';

// 생성 시각(에포크 ms). 모르면(System·Idle 등) $null
const PS_CREATED = 'c = $(if ($_.CreationDate) { [int64]([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { $null })';

const PS_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  `$p = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,Name,CreationDate,KernelModeTime,UserModeTime,Priority | ForEach-Object { [pscustomobject]@{ i = $_.ProcessId; p = $_.ParentProcessId; w = [int64]$_.WorkingSetSize; n = $_.Name; r = $_.Priority; t = [int64]$_.KernelModeTime + [int64]$_.UserModeTime; ${PS_CREATED} } }`,
  '[pscustomobject]@{ p = @($p) } | ConvertTo-Json -Compress -Depth 3',
].join('; ');

const toMs = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

// P168: child가 parent의 진짜 자식일 수 있는가. 둘 다 생성 시각을 알 때 child가 parent보다 먼저 생겼으면 아니다(PID 재사용). 모르면 예전처럼 본다
export function bornAfter(child, parent) {
  const c = child && child.created, p = parent && parent.created;
  return !(Number.isFinite(c) && Number.isFinite(p) && c < p);
}

// 부모 PID로 자식을 읽는 PowerShell. 부모 자신도 함께 읽어 생성 시각을 비교한다. props: [줄 키, Win32_Process 속성]
function childQuery(ids, props) {
  const filter = ids.map((p) => `ParentProcessId=${p} OR ProcessId=${p}`).join(' OR ');
  const extra = props.map(([k, prop]) => `; ${k} = $_.${prop}`).join('');
  return `$ErrorActionPreference = 'SilentlyContinue'; @(Get-CimInstance Win32_Process -Filter '${filter}' -Property ProcessId,ParentProcessId,CreationDate${props.map(([, prop]) => ',' + prop).join('')} | ForEach-Object { [pscustomobject]@{ i = $_.ProcessId; p = $_.ParentProcessId; ${PS_CREATED}${extra} } }) | ConvertTo-Json -Compress`;
}
// P168: childQuery의 JSON → ids의 진짜 자식 줄만(부모보다 먼저 생긴 줄은 뺀다). map: 원래 줄 → 돌려줄 꼴. 순수 함수
export function parseChildren(out, ids, map) {
  const want = new Set(ids.map(Number));
  const all = [].concat(JSON.parse(out || '[]') || []).filter(Boolean).map((x) => ({ ...map(x), created: toMs(x.c) }));
  const parents = new Map(all.filter((r) => want.has(Number(r.pid))).map((r) => [Number(r.pid), r]));
  return all.filter((r) => want.has(Number(r.ppid)) && bornAfter(r, parents.get(Number(r.ppid))));
}

export function readProcessTable() {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT], { encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 32 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve(null);
      try {
        const j = JSON.parse(out);
        const procs = new Map();
        for (const x of [].concat(j.p || [])) procs.set(x.i, { pid: x.i, ppid: x.p, ws: x.w, name: x.n, created: toMs(x.c), cpu: toMs(x.t), prio: toMs(x.r) }); // P341: prio
        resolve({ procs, at: Date.now() });
      } catch { resolve(null); }
    });
  });
}

// G2(P5): 셸 PID들의 바로 아래 프로세스(셸에서 돌고 있는 명령). Windows에서 터미널의 process_info는 셸만 준다(P5에서 확인)
export function childProcesses(pids) {
  const ids = pids.map(Number).filter((p) => Number.isInteger(p) && p > 0);
  if (!ids.length) return Promise.resolve([]);
  const ps = childQuery(ids, [['n', 'Name']]);
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 10000 }, (err, out) => {
      if (err) return resolve([]);
      try { resolve(parseChildren(out, ids, (x) => ({ pid: x.i, ppid: x.p, name: x.n }))); } catch { resolve([]); }
    });
  });
}

// P105: claude 프로세스 바로 아래에서 도는 Claude Code 도구 명령(Bash·PowerShell 도구. 뒤에서 도는 셸 포함)인가. 순수 함수.
// 실험(P105 작업 기록): Bash 도구는 `bash.exe -c "source …/shell-snapshots/snapshot-bash-….sh …"`, PowerShell 도구는
// `cmd.exe /d /s /c "chcp 65001 >nul & pwsh … -Command "$__claudeCodeScript…"`로 claude 바로 아래에 뜨고 명령이 끝날 때까지 남는다.
// MCP 서버(node, uvx, cmd /c npx, 따로 설치한 MCP 실행 파일 등), hook, 상태줄 명령에는 이 표시가 없다. 명령줄을 모르면 도구 명령으로 보지 않는다
export function isToolCommand(p) {
  const c = String((p && p.cmd) || '');
  return /[\\/]shell-snapshots[\\/]snapshot-/i.test(c) || /\$__claudeCode/.test(c);
}

// P105: pids(claude 프로세스) 바로 아래 프로세스와 명령줄. → [{ pid, ppid, name, cmd }] | null(읽지 못함). 읽기만 한다
export function childCommands(pids) {
  const ids = [...new Set(pids.map(Number))].filter((p) => Number.isInteger(p) && p > 0);
  if (!ids.length) return Promise.resolve([]);
  const ps = childQuery(ids, [['n', 'Name'], ['l', 'CommandLine']]);
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve(null);
      try { resolve(parseChildren(out, ids, (x) => ({ pid: x.i, ppid: x.p, name: x.n, cmd: x.l || '' }))); } catch { resolve(null); }
    });
  });
}

// pid와 그 아래 모든 프로세스. P168: 부모보다 먼저 생긴 "자식"(PID 재사용)은 따라가지 않는다
export function descendants(procs, root) {
  const kids = new Map();
  for (const p of procs.values()) { if (!kids.has(p.ppid)) kids.set(p.ppid, []); kids.get(p.ppid).push(p.pid); }
  const out = []; const seen = new Set(); const stack = [root];
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid) || !procs.has(pid)) continue;
    const me = procs.get(pid);
    seen.add(pid); out.push(me);
    for (const k of kids.get(pid) || []) if (bornAfter(procs.get(k), me)) stack.push(k);
  }
  return out;
}

// P168: 세션 하나의 나무에 들 수 없는 시스템 프로세스. 들어 있으면 셈이 틀린 것이다
const SYSTEM_PROC_RE = /^(wininit|services|lsass|csrss|smss|winlogon|system)(\.exe)?$/i;
// tree(descendants 결과, 첫 줄이 뿌리)가 이상하면 까닭 문자열, 아니면 null. otherShells: 다른 세션들의 셸 PID. 순수 함수
export function suspectTree(tree, otherShells = []) {
  const others = new Set([...otherShells].map(Number).filter(Boolean));
  const sys = tree.find((p) => SYSTEM_PROC_RE.test(p.name || ''));
  if (sys) return `system process ${sys.name} (pid ${sys.pid})`;
  const sh = tree.slice(1).find((p) => others.has(Number(p.pid)));
  if (sh) return `another session's shell (pid ${sh.pid})`;
  return null;
}
// 같은 까닭(key)은 한 번만 기록하는 log. → (key, msg) => void
export function logOnce(log) {
  const seen = new Set();
  return (key, msg) => { if (!log || seen.has(key)) return; seen.add(key); try { log(msg); } catch {} };
}
// ---------- P255: CPU ----------
// 프로세스의 CPU 시간 열쇠(PID 재사용을 가르려고 생성 시각을 붙인다)
export const cpuKey = (p) => `${p.pid}|${p.created ?? ''}`;
// 표 → Map(열쇠 → CPU 시간 100ns). 순수 함수
export function cpuTimes(procs) {
  const m = new Map();
  for (const p of procs.values()) if (Number.isFinite(p.cpu)) m.set(cpuKey(p), p.cpu);
  return m;
}
// 나무(프로세스들)가 앞 측정(prev: cpuTimes, prevAt: 그때 ms) 뒤에 쓴 CPU 시간(100ns). 앞 측정이 없으면 null.
// 그 사이 새로 뜬 프로세스는 쓴 시간 전부, 앞에도 있던 프로세스는 늘어난 만큼. 순수 함수
export function treeCpu(tree, prev, prevAt) {
  if (!prev || !tree) return null;
  let sum = 0;
  for (const p of tree) {
    if (!Number.isFinite(p.cpu)) continue;
    const before = prev.get(cpuKey(p));
    if (before != null) sum += Math.max(0, p.cpu - before);
    else if (Number.isFinite(p.created) && Number.isFinite(prevAt) && p.created >= prevAt) sum += p.cpu;
  }
  return sum;
}
// P341: 프로세스 하나가 앞 측정 뒤에 쓴 CPU 시간(100ns) | null. 순수 함수
export function procCpu(p, prev, prevAt) {
  if (!prev || !p || !Number.isFinite(p.cpu)) return null;
  const before = prev.get(cpuKey(p));
  if (before != null) return Math.max(0, p.cpu - before);
  return Number.isFinite(p.created) && Number.isFinite(prevAt) && p.created >= prevAt ? p.cpu : null;
}
// P341: 나무에서 CPU를 가장 많이 쓴 프로세스(topCpu)와 작업 집합이 가장 큰 프로세스(topMem). 줄: { pid, created, name, cpuPct(PC 전체 대비), memMB }.
//   CPU를 모르면(첫 측정) topCpu는 null. 순수 함수
export function treeTops(tree, prev, prevAt, ms, cores) {
  if (!tree || !tree.length) return { topCpu: null, topMem: null };
  const row = (p, ticks) => ({ pid: p.pid, created: Number.isFinite(p.created) ? p.created : null, name: p.name || '?', cpuPct: cpuPct(ticks, ms, cores), memMB: mb(p.ws || 0) });
  let best = null, bestT = -1, big = null;
  for (const p of tree) {
    const t = procCpu(p, prev, prevAt);
    if (t != null && t > bestT) { best = p; bestT = t; }
    if (!big || (p.ws || 0) > (big.ws || 0)) big = p;
  }
  return { topCpu: best ? row(best, bestT) : null, topMem: big ? row(big, procCpu(big, prev, prevAt)) : null };
}
// CPU 시간(100ns)을 지난 시간(ms)과 코어 수로 나눈 PC 전체 대비 사용률(%, 소수 한 자리). 모르면 null. 순수 함수
export function cpuPct(ticks, ms, cores) {
  if (ticks == null || !(ms > 0) || !(cores > 0)) return null;
  return Math.round(Math.min(100, Math.max(0, (ticks / (ms * 1e4 * cores)) * 100)) * 10) / 10;
}
// os.cpus() 두 번 → PC 전체 사용률(%, 소수 한 자리) | null. 순수 함수
export function systemCpuPct(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return null;
  let idle = 0, total = 0;
  for (let i = 0; i < a.length; i++) {
    const x = (a[i] && a[i].times) || {}, y = (b[i] && b[i].times) || {};
    const sum = (t) => (t.user || 0) + (t.nice || 0) + (t.sys || 0) + (t.idle || 0) + (t.irq || 0);
    total += sum(y) - sum(x); idle += (y.idle || 0) - (x.idle || 0);
  }
  if (!(total > 0)) return null;
  return Math.round(Math.min(100, Math.max(0, (1 - idle / total) * 100)) * 10) / 10;
}
export const mb = (bytes) => Math.round((bytes / 1048576) * 10) / 10;

export class ResourceMonitor {
  // sample()이 부를 함수들을 받는다. 시험에서 바꿔 넣는다.
  constructor({ sessions, processInfo, controllers, serverPid = () => null, readTable = readProcessTable, intervalMs = 30000, log = null, cpus = () => os.cpus(), nextDelay = null }) {
    Object.assign(this, { sessions, processInfo, controllers, serverPid, readTable, intervalMs, cpus, nextDelay });
    this.trees = new Map(); // P341: 세션 → 마지막 측정의 나무(셸 아래 모든 프로세스, 이상한 나무는 빠짐). 창에 보내지 않는다
    this.after = []; // P341: 측정마다 부를 함수(snap, monitor)
    this.prevCpu = null; // P255: { times(cpuTimes), at, cpus } 앞 측정
    this.warn = logOnce(log);
    this.last = null;
  }
  start(onSample) {
    this.onSample = onSample; this.stopped = false;
    // P341: 고정 주기 대신 측정이 끝날 때마다 다음 측정을 건다(nextDelay가 있으면 그 간격, 폭주 의심 후보가 있을 때 짧게)
    const loop = (ms) => { this.timer = setTimeout(() => this.sample().catch(() => {}).finally(() => { if (!this.stopped) loop(this.delay()); }), ms); };
    loop(3000); // 첫 측정도 stop()에서 취소한다(이슈 #1-10)
  }
  delay() { let d = null; try { d = this.nextDelay ? this.nextDelay() : null; } catch {} return Number.isFinite(d) && d > 0 ? Math.min(d, this.intervalMs) : this.intervalMs; }
  stop() { this.stopped = true; clearTimeout(this.timer); }

  async sample() {
    const t0 = Date.now();
    const table = await this.readTable();
    if (!table) return this.last;
    const list = this.sessions();
    const tAt = Number.isFinite(table.at) ? table.at : Date.now();
    let cpusNow = null; try { cpusNow = this.cpus(); } catch {}
    const prev = this.prevCpu;
    const dt = prev ? tAt - prev.at : 0;
    const cores = (Array.isArray(cpusNow) && cpusNow.length) || 1;
    let cpuSum = prev ? 0 : null; // 판이 띄운 세션들의 CPU 시간 합
    const rows = [], infos = [];
    const trees = new Map(); // P341
    for (const s of list) {
      let info = null; // 에이전트 없는 셸 세션도 패널이 있으면 잰다(이슈 #1-11). 실패는 null
      if (s.paneId) info = await this.processInfo(s.paneId).catch(() => null);
      infos.push(info);
    }
    const shells = infos.map((i) => (i && i.shell_pid) || null);
    list.forEach((s, n) => {
      const info = infos[n], shell = shells[n];
      const claude = info && (info.foreground_processes || []).find((p) => /claude/i.test(p.name || ''));
      let tree = shell ? descendants(table.procs, shell) : [];
      let claudeTree = claude ? descendants(table.procs, claude.pid) : [];
      // P168: 다른 세션의 셸이나 시스템 프로세스가 든 나무는 값을 버린다(null = 모름). 기록에는 같은 까닭을 한 번만 남긴다
      const others = shells.filter((p, m) => p && m !== n);
      const bad = suspectTree(tree, others) || suspectTree(claudeTree, others);
      if (bad) { this.warn(`${s.sessionId}:${bad}`, `resources: dropped memory of ${s.name} (shell ${shell}): ${bad}, ${tree.length} procs`); tree = null; claudeTree = null; }
      if (tree && tree.length) trees.set(s.sessionId, tree); // P341
      const ticks = tree && tree.length ? treeCpu(tree, prev && prev.times, prev && prev.at) : prev ? 0 : null;
      if (cpuSum != null && ticks != null) cpuSum += ticks;
      rows.push({
        sessionId: s.sessionId, name: s.name, state: s.state, shellPid: shell || null, claudePid: claude ? claude.pid : null,
        memMB: tree ? mb(tree.reduce((a, p) => a + p.ws, 0)) : null, claudeMB: claudeTree ? mb(claudeTree.reduce((a, p) => a + p.ws, 0)) : null, procs: tree ? tree.length : 0,
        cpuPct: cpuPct(ticks, dt, cores),
        kind: s.kind || null, // P341: 셸 패널(shell)인가
        ...(tree && tree.length ? treeTops(tree, prev && prev.times, prev && prev.at, dt, cores) : { topCpu: null, topMem: null }), // P341
        ...(bad ? { suspect: bad } : {}),
      });
    });
    const ctl = this.controllers();
    const ctlMB = mb(ctl.reduce((a, c) => a + ((table.procs.get(c.controllerPid) || {}).ws || 0), 0));
    const hp = this.serverPid();
    const snap = {
      at: Date.now(), ms: Date.now() - t0,
      sessions: rows,
      sessionCount: list.length,
      sessionsMB: mb(rows.reduce((a, r) => a + (r.memMB || 0) * 1048576, 0)),
      running: list.filter((s) => s.state === 'working').length,
      waiting: list.filter((s) => s.state === 'waiting' || s.state === 'trust_wait').length,
      controllers: { count: ctl.length, memMB: ctlMB, pids: ctl.map((c) => c.controllerPid) },
      terminalServer: hp && table.procs.get(hp) ? { pid: hp, memMB: mb(table.procs.get(hp).ws) } : null,
      backend: { pid: process.pid, memMB: mb(process.memoryUsage().rss) },
      cpu: { sessionsPct: cpuPct(cpuSum, dt, cores), systemPct: prev ? systemCpuPct(prev.cpus, cpusNow) : null, cores, spanMs: prev ? dt : null }, // P255
    };
    this.prevCpu = { times: cpuTimes(table.procs), at: tAt, cpus: cpusNow };
    this.trees = trees; // P341
    for (const f of this.after) { try { await f(snap, this); } catch (e) { this.warn(`after:${e && e.message}`, `resources: after-sample error ${e && e.stack}`); } } // P341: 폭주 감시·우선순위(창에 보내기 전에 줄에 guard를 싣는다)
    this.last = snap;
    if (this.onSample && !this.stopped) this.onSample(snap); // 멈춘 뒤 끝난 측정은 알리지 않는다
    return snap;
  }
}
