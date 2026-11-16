// P168 시험: 세션 메모리 셈이 PID 재사용을 거른다. Windows는 부모가 끝나도 ParentProcessId를 남기고 그 PID를 다른 프로세스가 받는다.
// 셸이 받은 PID를 부모로 적은 더 오래된 프로세스(부팅 때의 wininit 꼴)와 그 아래 나무는 세지 않고, 셸 뒤에 생긴 진짜 자식은 센다.
// 진짜 프로세스 표를 읽지 않는다(가짜 표와 가짜 PowerShell 출력만).
import test from 'node:test';
import assert from 'node:assert/strict';
import { descendants, bornAfter, parseChildren, suspectTree, logOnce, ResourceMonitor, mb } from '../src/resources.mjs';
import { Sleeper } from '../src/sleep.mjs';

const MB = 1048576;
const BOOT = 1_700_000_000_000, LATER = BOOT + 3_600_000;
// 셸 100(나중에 생김)의 PID를 부팅 때 끝난 프로세스가 쓰고 있었다. wininit(4)의 부모는 그 옛 100이다
const table = () => new Map([
  [4, { pid: 4, ppid: 100, ws: 10 * MB, name: 'wininit.exe', created: BOOT }],
  [5, { pid: 5, ppid: 4, ws: 500 * MB, name: 'services.exe', created: BOOT + 10 }],
  [6, { pid: 6, ppid: 5, ws: 900 * MB, name: 'svchost.exe', created: BOOT + 20 }],
  [100, { pid: 100, ppid: 50, ws: 5 * MB, name: 'cmd.exe', created: LATER }],
  [101, { pid: 101, ppid: 100, ws: 300 * MB, name: 'node.exe', created: LATER + 50 }],
  [102, { pid: 102, ppid: 101, ws: 40 * MB, name: 'codex.exe', created: LATER + 90 }],
]);
const sum = (tree) => mb(tree.reduce((a, p) => a + p.ws, 0));

test('1 descendants는 셸보다 먼저 생긴 "자식"(wininit 꼴)과 그 아래를 세지 않고, 셸 뒤에 생긴 자식은 센다', () => {
  const tree = descendants(table(), 100);
  assert.deepEqual(tree.map((p) => p.pid).sort((a, b) => a - b), [100, 101, 102]);
  assert.equal(sum(tree), 345);
  assert.equal(suspectTree(tree), null);
});

test('2 생성 시각이 없는 줄은 예전과 같다(부모 PID만 따라간다)', () => {
  const t = new Map([...table()].map(([k, v]) => [k, { ...v, created: null }]));
  const tree = descendants(t, 100);
  assert.deepEqual(tree.map((p) => p.pid).sort((a, b) => a - b), [4, 5, 6, 100, 101, 102]);
  // 이런 나무는 시스템 프로세스가 들어 이상한 값이다
  assert.match(suspectTree(tree), /wininit\.exe/);
  // 한쪽만 모를 때도 예전처럼 따라간다
  assert.equal(bornAfter({ created: BOOT }, { created: null }), true);
  assert.equal(bornAfter({ created: null }, { created: LATER }), true);
  assert.equal(bornAfter({ created: LATER }, { created: LATER }), true); // 같은 ms는 자식일 수 있다
  assert.equal(bornAfter({ created: BOOT }, { created: LATER }), false);
});

// childQuery의 PowerShell 출력 꼴: i(PID), p(부모), c(생성 시각 ms 또는 null), n(이름), l(명령줄). 부모 줄도 함께 온다
const psOut = JSON.stringify([
  { i: 100, p: 50, c: LATER, n: 'cmd.exe', l: 'cmd.exe' },
  { i: 4, p: 100, c: BOOT, n: 'wininit.exe', l: 'wininit.exe' },
  { i: 101, p: 100, c: LATER + 50, n: 'node.exe', l: 'node codex.js' },
  { i: 200, p: 150, c: LATER, n: 'claude.exe', l: 'claude' },
  { i: 201, p: 200, c: LATER + 5, n: 'bash.exe', l: 'bash -c "source x/shell-snapshots/snapshot-bash-1.sh"' },
  { i: 150, p: 1, c: LATER - 10, n: 'cmd.exe', l: 'cmd' },
]);

test('3 childProcesses·childCommands의 해석은 부모보다 먼저 생긴 줄을 빼고 부모 자신의 줄도 돌려주지 않는다', () => {
  const kids = parseChildren(psOut, [100, 200], (x) => ({ pid: x.i, ppid: x.p, name: x.n }));
  assert.deepEqual(kids.map((k) => k.pid).sort((a, b) => a - b), [101, 201]);
  const cmds = parseChildren(psOut, [100, 200], (x) => ({ pid: x.i, ppid: x.p, name: x.n, cmd: x.l || '' }));
  assert.equal(cmds.find((k) => k.pid === 201).cmd.includes('shell-snapshots'), true);
  assert.equal(cmds.some((k) => k.name === 'wininit.exe'), false);
});

test('4 생성 시각이 없는 PowerShell 출력은 예전과 같다(부모 PID만 본다)', () => {
  const out = JSON.stringify([{ i: 4, p: 100, c: null, n: 'wininit.exe' }, { i: 101, p: 100, c: null, n: 'node.exe' }]);
  const kids = parseChildren(out, [100], (x) => ({ pid: x.i, ppid: x.p, name: x.n }));
  assert.deepEqual(kids.map((k) => k.pid).sort((a, b) => a - b), [4, 101]);
  // 한 줄만 오면 ConvertTo-Json은 배열이 아닌 객체를 준다
  assert.deepEqual(parseChildren(JSON.stringify({ i: 101, p: 100, c: LATER, n: 'node.exe' }), [100], (x) => ({ pid: x.i, ppid: x.p })).map((k) => k.pid), [101]);
  assert.deepEqual(parseChildren('', [100], (x) => x), []);
});

test('5 자원 감시: 시스템 프로세스나 다른 세션의 셸이 든 나무는 값을 버리고 기록에 같은 까닭을 한 번만 남긴다', async () => {
  const t = new Map([...table()].map(([k, v]) => [k, { ...v, created: null }])); // 생성 시각을 모르는 옛 꼴: 예전 셈이면 1.7GB가 한 세션에 든다
  t.set(300, { pid: 300, ppid: 101, ws: 7 * MB, name: 'pwsh.exe', created: null }); // 다른 세션의 셸이 이 나무 안에 있다
  t.set(400, { pid: 400, ppid: 50, ws: 20 * MB, name: 'pwsh.exe', created: null });
  const logs = [];
  const m = new ResourceMonitor({
    sessions: () => [{ sessionId: 'a', name: 'cx', paneId: 'pa', state: 'idle' }, { sessionId: 'b', name: 'sh', paneId: 'pb', state: 'shell_idle' }, { sessionId: 'c', name: 'ok', paneId: 'pc', state: 'idle' }],
    processInfo: async (p) => ({ pa: { shell_pid: 100, foreground_processes: [] }, pb: { shell_pid: 300, foreground_processes: [] }, pc: { shell_pid: 400, foreground_processes: [] } })[p],
    controllers: () => [], readTable: async () => ({ procs: t }), log: (msg) => logs.push(msg),
  });
  const snap = await m.sample();
  const a = snap.sessions.find((r) => r.sessionId === 'a');
  assert.equal(a.memMB, null);
  assert.match(a.suspect, /wininit/);
  assert.equal(snap.sessions.find((r) => r.sessionId === 'c').memMB, 20);
  assert.equal(snap.sessionsMB, mb(7 * MB + 20 * MB)); // 버린 값은 합에 들지 않는다
  await m.sample();
  assert.equal(logs.length, 1, logs.join('\n'));
  assert.match(logs[0], /dropped memory of cx/);

  // 시스템 프로세스 없이 다른 세션의 셸만 든 나무
  const t2 = new Map([[100, { pid: 100, ppid: 50, ws: MB, name: 'cmd.exe' }], [300, { pid: 300, ppid: 100, ws: MB, name: 'pwsh.exe' }]]);
  assert.match(suspectTree(descendants(t2, 100), [300]), /another session's shell/);
  assert.equal(suspectTree(descendants(t2, 300), [100]), null); // 뿌리 자신은 다른 세션의 셸로 보지 않는다
});

test('6 고친 표에서는 같은 세션이 제 값을 얻는다(PID 재사용을 거른 셈)', async () => {
  const m = new ResourceMonitor({
    sessions: () => [{ sessionId: 'a', name: 'cx', paneId: 'pa', state: 'idle' }],
    processInfo: async () => ({ shell_pid: 100, foreground_processes: [] }), controllers: () => [], readTable: async () => ({ procs: table() }),
  });
  const snap = await m.sample();
  assert.equal(snap.sessions[0].memMB, 345);
  assert.equal(snap.sessions[0].procs, 3);
  assert.equal(snap.sessions[0].suspect, undefined);
});

test('7 잠재울 때 재는 메모리도 같은 규칙: PID 재사용을 거르고, 이상한 나무는 버리고 한 번만 기록한다', async () => {
  const logs = [];
  const b = { sessions: new Map(), store: { saveRuntime() {} }, log: (msg) => logs.push(msg), adapter: { processInfo: async () => ({ shell_pid: 100, foreground_processes: [] }) }, resources: { last: { sessions: [] } } };
  const good = new Sleeper(b, { timers: false, readTable: async () => ({ procs: table() }), readChildren: async () => [] });
  const r = await good.measure({ sessionId: 'a', name: 'cx', paneId: 'pa' });
  assert.equal(r.memMB, 345);
  assert.deepEqual(r.procs.map((p) => p.pid).sort((x, y) => x - y), [100, 101, 102]);

  const old = new Map([...table()].map(([k, v]) => [k, { ...v, created: null }]));
  const bad = new Sleeper(b, { timers: false, readTable: async () => ({ procs: old }), readChildren: async () => [] });
  const r2 = await bad.measure({ sessionId: 'a', name: 'cx', paneId: 'pa' });
  assert.equal(r2.memMB, null);
  assert.deepEqual(r2.procs, []);
  await bad.measure({ sessionId: 'a', name: 'cx', paneId: 'pa' });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /sleep: dropped memory of cx/);

  // 다른 세션의 셸(마지막 자원 표본)이 든 나무
  b.resources.last.sessions = [{ sessionId: 'z', shellPid: 101 }];
  const r3 = await good.measure({ sessionId: 'a', name: 'cx', paneId: 'pa' });
  assert.equal(r3.memMB, null);
});

test('8 logOnce는 같은 키를 한 번만, log가 없으면 아무것도 하지 않는다', () => {
  const out = []; const w = logOnce((m) => out.push(m));
  w('k', 'x'); w('k', 'y'); w('j', 'z');
  assert.deepEqual(out, ['x', 'z']);
  logOnce(null)('k', 'x');
});
