// 자원 감시(ARCH 4절 D1, 5절). 약 30초마다 잰다.
// - 세션별 메모리: 터미널의 process_info로 우리 패널의 셸 PID를 얻고, 그 셸 아래 프로세스(claude와 그 자식)의 작업 집합을 더한다.
// - 제어기: 화면 중계가 띄운 제어기 프로세스의 메모리(hc는 프로세스 없이 파이프라 0)
// - 터미널 서버와 백엔드 자신의 메모리, 동시 실행 수(working·waiting)
// 프로세스 표는 PowerShell의 Win32_Process 한 번으로 읽는다(읽기만 한다). 프로세스를 끄지 않는다.
// P168: Windows는 부모가 끝나도 ParentProcessId를 남기고, 그 PID를 새 프로세스가 다시 받는다. 부모 PID만 따라가면 셸이 받은 PID를
// 부모로 적은 오래된 프로세스(부팅 때의 wininit 등)와 그 아래 시스템 전체가 한 세션으로 들어간다. 그래서 생성 시각을 함께 읽고,
// 부모보다 먼저 생긴 "자식"은 따라가지 않는다
import { execFile } from 'node:child_process';

// 생성 시각(에포크 ms). 모르면(System·Idle 등) $null
const PS_CREATED = 'c = $(if ($_.CreationDate) { [int64]([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { $null })';

const PS_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  `$p = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,Name,CreationDate | ForEach-Object { [pscustomobject]@{ i = $_.ProcessId; p = $_.ParentProcessId; w = [int64]$_.WorkingSetSize; n = $_.Name; ${PS_CREATED} } }`,
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
        for (const x of [].concat(j.p || [])) procs.set(x.i, { pid: x.i, ppid: x.p, ws: x.w, name: x.n, created: toMs(x.c) });
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
export const mb = (bytes) => Math.round((bytes / 1048576) * 10) / 10;

export class ResourceMonitor {
  // sample()이 부를 함수들을 받는다. 시험에서 바꿔 넣는다.
  constructor({ sessions, processInfo, controllers, serverPid = () => null, readTable = readProcessTable, intervalMs = 30000, log = null }) {
    Object.assign(this, { sessions, processInfo, controllers, serverPid, readTable, intervalMs });
    this.warn = logOnce(log);
    this.last = null;
  }
  start(onSample) {
    this.onSample = onSample; this.stopped = false;
    this.timer = setInterval(() => this.sample().catch(() => {}), this.intervalMs);
    this.firstTimer = setTimeout(() => this.sample().catch(() => {}), 3000); // 첫 측정도 stop()에서 취소한다(이슈 #1-10)
  }
  stop() { this.stopped = true; clearInterval(this.timer); clearTimeout(this.firstTimer); }

  async sample() {
    const t0 = Date.now();
    const table = await this.readTable();
    if (!table) return this.last;
    const list = this.sessions();
    const rows = [], infos = [];
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
      rows.push({
        sessionId: s.sessionId, name: s.name, state: s.state, shellPid: shell || null, claudePid: claude ? claude.pid : null,
        memMB: tree ? mb(tree.reduce((a, p) => a + p.ws, 0)) : null, claudeMB: claudeTree ? mb(claudeTree.reduce((a, p) => a + p.ws, 0)) : null, procs: tree ? tree.length : 0,
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
    };
    this.last = snap;
    if (this.onSample && !this.stopped) this.onSample(snap); // 멈춘 뒤 끝난 측정은 알리지 않는다
    return snap;
  }
}
