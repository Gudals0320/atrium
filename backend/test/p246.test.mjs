// P246: rig 3 guard의 "일하는 중"을 넓힌다. (가) 판 상태 working·waiting, (나) 그 역할의 도구 실행, (다) 세션 프로세스 나무의 하네스 밖 일
// (Claude Code 도구 명령, 다른 하네스는 하네스가 뜬 뒤 생긴 셸), (라) Claude Code rt.bg. 모두 거짓이 되면 다시 검사(bg_end).
// 뒤 일 중 자기 섹터 쓰기는 그대로, 뒤 일이 끝난 뒤 남의 섹터 쓰기는 되돌림, codex·agy 나무, 잠재우기 판단(다른 하네스도 뒤 일이면 재우지 않음).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig } from '../src/rig.mjs';
import { RigAmp } from '../src/rig-amp.mjs';
import { RIG3_GUARD_KINDS } from '../src/rig-ledger.mjs';
import { Rig3Roles } from '../src/rig3-roles.mjs';
import { BG_POLL_MS } from '../src/rig3-guard.mjs';
import { Sleeper, harnessWork, sessionActivity, sessionSleepPlan, HARNESS_SETTLE_MS, SLEEP_TICK_MS } from '../src/sleep.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p246-'));
const DOC = (name) => ['# ' + name, '', '## 맡은 것', name, '', '## 받는 것과 내는 것', '없음', '', '## 기준', '- 하나', '', '## 요령', '- 하나'].join('\n');
const DEF = () => ({
  version: 3, name: 'p246', purpose: '.atrium/purpose.md',
  roles: { data: { owns: ['data/'] }, ideas: { owns: ['hypotheses/'], launcher: 'codex' }, logic: { owns: ['logic/'], launcher: 'agy' } },
  flows: [{ item: 'snapshot', from: 'data', to: 'ideas' }, { item: 'hint', from: 'human', to: 'data' }],
});
const put = (dir, rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const has = (dir, rel) => fs.existsSync(path.join(dir, rel));
const T0 = 1_700_000_000_000;
const SNAP = 'bash.exe -c "source /c/Users/u/.claude/shell-snapshots/snapshot-bash-1.sh && eval long-job"';

// 가짜 터미널과 프로세스: claude(data) pid 100, codex(ideas) pid 201 아래 나무, agy(logic) pid 301 아래 나무
function procWorld() {
  const w = { kids: [], procs: new Map() };
  const P = (pid, ppid, name, created) => w.procs.set(pid, { pid, ppid, name, created, ws: 0 });
  P(200, 1, 'pwsh.exe', T0); P(201, 200, 'codex.exe', T0 + 1000); P(202, 201, 'cmd.exe', T0 + 2000); P(203, 202, 'node.exe', T0 + 2500); // MCP 서버(뜰 때)
  P(300, 1, 'pwsh.exe', T0); P(301, 300, 'node.exe', T0 + 1000); P(302, 301, 'language_server_windows_x64.exe', T0 + 3000); // agy와 그 도우미
  w.info = {
    'p-data': { shell_pid: 99, foreground_processes: [{ pid: 100, name: 'claude.exe' }] },
    'p-ideas': { shell_pid: 200, foreground_processes: [{ pid: 201, name: 'codex.exe' }, { pid: 200, name: 'pwsh.exe' }] },
    'p-logic': { shell_pid: 300, foreground_processes: [{ pid: 301, name: 'node.exe' }, { pid: 300, name: 'pwsh.exe' }] },
  };
  w.P = P;
  return w;
}

async function board({ sleeper = true } = {}) {
  const dir = tmp();
  const def = DEF();
  put(dir, '.atrium/purpose.md', '# 목적\n');
  for (const r of Object.keys(def.roles)) put(dir, '.atrium/roles/' + r + '.md', DOC(r));
  put(dir, '.atrium/rig.json', JSON.stringify(def, null, 2));
  put(dir, 'data/a.txt', 'data-a\n'); put(dir, 'hypotheses/h1.md', 'h1\n'); put(dir, 'logic/l.md', 'l\n');
  const store = new Store(path.join(tmp(), 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const sent = []; const logs = [];
  const b = { cfg: { dataDir: path.join(tmp(), 'data'), rig3GuardBgPollMs: 0 }, store, sessions: new Map(), log: (...a) => logs.push(a.join(' ')), api: { broadcast: () => {} } };
  b.rig = new Rig(b); b.rigAmp = new RigAmp(b); b.rig3 = new Rig3Roles(b);
  b.queue = { enqueue: (sessionId, text, opts) => { sent.push({ sessionId, text, opts }); return { deliveryId: 'd' + sent.length }; }, pending: () => 0 };
  const W = procWorld();
  b.adapter = { connected: true, processInfo: async (paneId) => W.info[paneId] || null };
  if (sleeper) b.sleeper = new Sleeper(b, { timers: false, readTable: async () => ({ procs: W.procs, at: Date.now() }), readChildren: async () => W.kids });
  const g = b.rig3.guard;
  const mk = (role, kind) => { const s = { sessionId: 'sid-' + role, name: role, kind, workspaceKey: ws.key, rigRole: role, paneId: 'p-' + role, rt: { kind, launchedAt: T0 } }; b.sessions.set(s.sessionId, s); return s; };
  const S = { data: mk('data', 'claude'), ideas: mk('ideas', 'codex'), logic: mk('logic', 'agy') };
  const foreign = () => store.rigEvents({ ws: ws.key, limit: 1000, kinds: RIG3_GUARD_KINDS }).filter((x) => x.kind === 'role_foreign_write');
  const go = (s, to) => { const from = s._st || null; s._st = to; return g.onState(s, from, to); };
  await g.prime(ws.key);
  return { dir, ws, b, g, S, W, sent, logs, foreign, go };
}

test('P246 harnessWork: 하네스가 뜬 뒤 생긴 셸만 센다(codex·agy 나무)', () => {
  const W = procWorld();
  assert.equal(harnessWork(W.procs, 201), 0, '뜰 때 함께 뜬 MCP 서버(cmd /c npx)는 하네스 것');
  assert.equal(harnessWork(W.procs, 301), 0, 'agy 도우미(셸 아님)');
  W.P(210, 201, 'powershell.exe', T0 + HARNESS_SETTLE_MS + 60000); W.P(211, 210, 'node.exe', T0 + HARNESS_SETTLE_MS + 60001);
  W.P(212, 210, 'cmd.exe', T0 + HARNESS_SETTLE_MS + 60002); // 셸 안의 셸은 하나로
  assert.equal(harnessWork(W.procs, 201), 1);
  W.P(220, 201, 'pwsh.exe', T0 + HARNESS_SETTLE_MS + 70000);
  assert.equal(harnessWork(W.procs, 201), 2);
  W.P(310, 301, 'bash.exe', T0 + 90000); // agy의 셸 도구
  assert.equal(harnessWork(W.procs, 301), 1);
  // root가 셸(하네스를 못 찾음)이면 띄운 때(launchedAt)부터 센다. 실행 껍데기(.cmd → cmd.exe)는 띄울 때 생겨 빠진다
  const p = new Map(); const P = (pid, ppid, name, created) => p.set(pid, { pid, ppid, name, created });
  P(1, 0, 'pwsh.exe', T0 - 3600000); P(2, 1, 'cmd.exe', T0 + 500); P(3, 2, 'node.exe', T0 + 800); P(4, 3, 'powershell.exe', T0 + 120000);
  assert.equal(harnessWork(p, 1, { harness: false, launchedAt: T0 }), 1);
  // 생성 시각을 모르는 프로세스와 PID 재사용(부모보다 먼저 생긴 "자식")은 세지 않는다
  P(5, 3, 'cmd.exe', null); P(6, 3, 'bash.exe', T0 - 99999999);
  assert.equal(harnessWork(p, 1, { harness: false, launchedAt: T0 }), 1);
  assert.equal(harnessWork(p, 999), 0);
  assert.equal(BG_POLL_MS, SLEEP_TICK_MS);
});

test('P246 (다) Claude Code 뒤 셸: 턴이 끝나도 뒤 일 동안 자기 섹터 쓰기는 그대로, 끝나면 bg_end 검사', async () => {
  const B = await board();
  await B.go(B.S.data, 'working');
  B.W.kids = [{ pid: 101, ppid: 100, name: 'bash.exe', cmd: SNAP }];
  const r1 = await B.go(B.S.data, 'ready');
  assert.equal(r1.held, true); assert.deepEqual(r1.background, { ...r1.background, n: 1, via: 'process' });
  assert.deepEqual(B.g.view(B.ws.key).background, ['data']);
  // 다른 역할이 일하는 동안 data의 뒤 일이 자기 섹터에 쓴다
  await B.go(B.S.ideas, 'working');
  put(B.dir, 'data/a.txt', 'bg write 1\n'); put(B.dir, 'data/b.csv', '1\n');
  const r2 = await B.go(B.S.ideas, 'ready');
  assert.equal(r2.foreign.length, 0); assert.ok(r2.cands.includes('data'));
  assert.equal(read(B.dir, 'data/a.txt'), 'bg write 1\n'); assert.ok(has(B.dir, 'data/b.csv'));
  // 아직 돈다: 주기에 다시 보아도 그대로
  put(B.dir, 'data/a.txt', 'bg write 2\n');
  const s1 = await B.g.sweep();
  assert.equal(s1[0].held, true);
  // 뒤 일이 끝났다 → 구간을 닫으며 검사(쓴 것은 data의 것)
  B.W.kids = [];
  const s2 = await B.g.sweep();
  assert.equal(s2[0].foreign.length, 0); assert.equal(s2[0].changes, 1);
  assert.deepEqual(B.g.view(B.ws.key).background, []);
  assert.ok(B.logs.some((l) => /rig3 guard .* bg_end data/.test(l)), B.logs.join('\n'));
  assert.equal(read(B.dir, 'data/a.txt'), 'bg write 2\n');
  // 뒤 일이 끝난 뒤 남의 섹터 쓰기는 되돌린다
  await B.go(B.S.ideas, 'working');
  put(B.dir, 'data/a.txt', 'ideas wrote\n');
  const r3 = await B.go(B.S.ideas, 'ready');
  assert.equal(r3.foreign.length, 1); assert.equal(read(B.dir, 'data/a.txt'), 'bg write 2\n');
  assert.equal(B.foreign().length, 1);
});

test('P246 (라) Claude Code rt.bg(뒤 하위 에이전트, 프로세스 없음)만으로도 일함', async () => {
  const B = await board();
  await B.go(B.S.data, 'working');
  B.S.data.rt.bg = { tasks: [{ type: 'subagent', label: 'refresh' }], at: Date.now() };
  const r1 = await B.go(B.S.data, 'ready');
  assert.equal(r1.held, true); assert.equal(r1.background.via, 'hook');
  await B.go(B.S.ideas, 'working'); put(B.dir, 'data/a.txt', 'agent wrote\n');
  assert.equal((await B.go(B.S.ideas, 'ready')).foreign.length, 0);
  B.S.data.rt.bg = { tasks: [], at: Date.now() };
  const s = await B.g.sweep();
  assert.equal(s[0].foreign.length, 0);
  assert.equal(read(B.dir, 'data/a.txt'), 'agent wrote\n');
  // 잠재우기가 없어도(시험·옛 판) rt.bg는 본다
  const C = await board({ sleeper: false });
  await C.go(C.S.data, 'working'); C.S.data.rt.bg = { tasks: [{ type: 'shell', label: 'x' }], at: Date.now() };
  assert.equal((await C.go(C.S.data, 'ready')).held, true);
  C.S.data.rt.bg = null;
  assert.equal((await C.g.sweep())[0].changes, 0);
});

test('P246 (다) codex·agy: 하네스 아래 새 셸이 도는 동안 일함, 나무에서 사라지면 닫는다', async () => {
  const B = await board();
  await B.go(B.S.ideas, 'working');
  B.W.P(230, 201, 'powershell.exe', T0 + HARNESS_SETTLE_MS + 1000);
  const r1 = await B.go(B.S.ideas, 'ready');
  assert.equal(r1.held, true); assert.equal(r1.background.via, 'process');
  await B.go(B.S.logic, 'working'); B.W.P(330, 301, 'bash.exe', T0 + HARNESS_SETTLE_MS + 5000);
  assert.equal((await B.go(B.S.logic, 'ready')).held, true);
  assert.deepEqual(B.g.view(B.ws.key).background.sort(), ['ideas', 'logic']);
  // data가 일하는 동안 ideas·logic의 뒤 일이 자기 섹터에 쓴다
  await B.go(B.S.data, 'working');
  put(B.dir, 'hypotheses/h2.md', 'h2\n'); put(B.dir, 'logic/l.md', 'l2\n');
  assert.equal((await B.go(B.S.data, 'ready')).foreign.length, 0);
  B.W.procs.delete(230); B.W.procs.delete(330);
  const s = await B.g.sweep();
  assert.equal(s.length, 2); for (const x of s) assert.equal(x.foreign.length, 0);
  assert.ok(has(B.dir, 'hypotheses/h2.md')); assert.equal(read(B.dir, 'logic/l.md'), 'l2\n');
  // 이제 ideas가 쉰다: data의 쓰기가 ideas 섹터에 들면 되돌린다
  await B.go(B.S.data, 'working'); put(B.dir, 'hypotheses/h1.md', 'data wrote\n');
  const r = await B.go(B.S.data, 'ready');
  assert.equal(r.foreign.length, 1); assert.equal(read(B.dir, 'hypotheses/h1.md'), 'h1\n');
});

test('P246 (나) 도구 실행은 판 상태와 따로 일 구간이다', async () => {
  const B = await board();
  await B.g.toolBegin(B.ws.key, 'data', 'run-1');
  await B.go(B.S.ideas, 'working'); put(B.dir, 'data/a.txt', 'tool wrote\n');
  assert.equal((await B.go(B.S.ideas, 'ready')).foreign.length, 0);
  const e = await B.g.toolEnd(B.ws.key, 'data', 'run-1');
  assert.equal(e.foreign.length, 0); assert.equal(read(B.dir, 'data/a.txt'), 'tool wrote\n');
});

test('P246 (가) 뒤 일 동안 다시 턴이 시작되면 같은 구간을 잇고, 뒤 일 없이 끝나면 바로 검사', async () => {
  const B = await board();
  await B.go(B.S.data, 'working');
  B.W.kids = [{ pid: 101, ppid: 100, name: 'bash.exe', cmd: SNAP }];
  assert.equal((await B.go(B.S.data, 'ready')).held, true);
  const span = B.g.st(B.ws.key).busy.get('sid-data');
  assert.equal(B.go(B.S.data, 'working'), null, '새 검사를 열지 않는다');
  assert.equal(B.g.st(B.ws.key).busy.get('sid-data'), span); assert.equal(span.bg, null);
  B.W.kids = [];
  const r = await B.go(B.S.data, 'ready');
  assert.equal(typeof r.changes, 'number'); assert.equal(B.g.st(B.ws.key).busy.size, 0);
  assert.ok(B.logs.some((l) => /rig3 guard .* end data/.test(l)));
  // 뒤 일을 보는 동안 다시 일함이 되면 보던 결과는 버린다
  await B.go(B.S.data, 'working');
  B.W.kids = [];
  const p = B.go(B.S.data, 'ready'); B.go(B.S.data, 'working');
  assert.equal(await p, null);
  assert.ok(B.g.st(B.ws.key).busy.get('sid-data'));
});

test('P246 잠들면(sleeping) 뒤 일 구간도 닫는다, 닫힌 세션은 주기에 거둔다, 주기 타이머는 연 구간이 있을 때만', async () => {
  const B = await board();
  await B.go(B.S.data, 'working'); B.W.kids = [{ pid: 101, ppid: 100, name: 'bash.exe', cmd: SNAP }];
  assert.equal((await B.go(B.S.data, 'ready')).held, true);
  B.S.data.rt.sleep = { at: Date.now() }; B.S.data.paneId = null;
  const r = await B.go(B.S.data, 'sleeping');
  assert.equal(typeof r.changes, 'number'); assert.equal(B.g.st(B.ws.key).busy.size, 0);
  // 닫힌 세션
  await B.go(B.S.ideas, 'working'); B.W.P(240, 201, 'cmd.exe', T0 + HARNESS_SETTLE_MS + 9000);
  assert.equal((await B.go(B.S.ideas, 'ready')).held, true);
  B.S.ideas.closedAt = Date.now();
  await B.g.sweep();
  assert.equal(B.g.st(B.ws.key).busy.size, 0);
  // 타이머
  const C = await board(); C.b.cfg.rig3GuardBgPollMs = 60000;
  await C.go(C.S.data, 'working'); C.W.kids = [{ pid: 101, ppid: 100, name: 'bash.exe', cmd: SNAP }];
  await C.go(C.S.data, 'ready');
  assert.ok(C.g.timer);
  C.W.kids = []; await C.g.sweep();
  assert.equal(C.g.timer, null);
  C.g.stop();
});

test('P246 잠재우기 판단: 다른 하네스도 뒤 일(나무의 셸)이 있으면 재우지 않는다', async () => {
  const B = await board();
  const sl = B.b.sleeper;
  await sl.scanBackground([B.S.ideas, B.S.logic, B.S.data]);
  for (const s of [B.S.ideas, B.S.logic, B.S.data]) assert.equal(sl.bgAny(s), null, s.name);
  B.W.P(250, 201, 'pwsh.exe', T0 + HARNESS_SETTLE_MS + 1000); // 하네스가 뜬 때(T0 + 1000)부터
  B.W.P(251, 201, 'pwsh.exe', T0 + HARNESS_SETTLE_MS + 999); // 뜬 뒤 정한 시간 안에 생긴 셸은 하네스 것
  assert.deepEqual(await sl.backgroundNow(B.S.ideas), { n: 1, via: 'process' });
  assert.deepEqual(await sl.backgroundNow(B.S.ideas), { n: 1, via: 'process' });
  assert.ok(sl.bgOf(B.S.ideas)); assert.equal(sl.bgView(B.S.ideas).n, 1);
  assert.equal(sessionActivity({ kind: 'codex', state: 'ready', bg: true }), 'background');
  assert.equal(sessionSleepPlan({ kind: 'codex', state: 'ready', harness: true, convKnown: true, bg: !!sl.bgOf(B.S.ideas), idleSince: 0 }, { now: Date.now(), afterMs: 1 }).why, 'background');
  // 끄는 설정(sleepBgPrecheck false)은 잠재우기만 끈다. guard가 보는 bgAny는 그대로
  B.b.cfg.sleepBgPrecheck = false;
  assert.equal(sl.bgOf(B.S.ideas), null); assert.ok(sl.bgAny(B.S.ideas));
  B.b.cfg.sleepBgPrecheck = true;
  // 셸이 끝나면 다시 쉼. 셸 세션과 잠든 세션은 보지 않는다
  B.W.procs.delete(250);
  assert.equal(await sl.backgroundNow(B.S.ideas), null);
  assert.equal(sl.bgAny({ ...B.S.ideas, kind: 'shell' }), null);
  assert.equal(sl.bgAny({ ...B.S.ideas, rt: { sleep: {} } }), null);
  // Claude Code는 예전 그대로(claude 아래 도구 명령)
  B.W.kids = [{ pid: 101, ppid: 100, name: 'bash.exe', cmd: SNAP }, { pid: 102, ppid: 100, name: 'node.exe', cmd: 'node mcp-server.js' }];
  assert.deepEqual(await sl.backgroundNow(B.S.data), { n: 1, via: 'process' });
});
