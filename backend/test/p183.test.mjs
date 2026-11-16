// P183 단위 시험: rig 도구(하네스 2단계) — atrium tool 목록·실행·인자, 100초(시험은 짧게) 넘으면 종료 코드 3과 ID, --wait·--runs, 세션마다 하나·parallel,
// 다시 뜨면 lost, 로그 50MB(시험은 작게) 상한, tool-before 통과·거절·인자 고치기, tool-after 덧붙이기, tool_runs 열과 출력 해시, atrium items 도구 실행 수,
// .cmd 인자 거절, 꺼진 워크스페이스 거절. 그리고 rig 켜기 확인(confirm)과 사람이 띄우며 준 첫 요청의 deliver 훅(@fable-peer 추가 조건).
// 진짜 저장소·전달 대기열·Branch, 가짜 에이전트(p182 시험의 틀). 도구와 훅은 진짜 node 프로세스로 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch, ATRIUM_ALLOW } from '../src/branch.mjs';
import { Rig, rigHandlers, validateRig, TOOL_TIMEOUT_MS, TOOL_TIMEOUT_MAX_MS } from '../src/rig.mjs';
import { ToolRuns, badCmdArg, readTail, TOOL_WAIT_MS, TOOL_LOG_MAX } from '../src/tool-runs.mjs';
import { Backend } from '../src/backend.mjs';
import { VERB_NAMES, CONTRACT_VERSION, VERBS } from '../src/cli-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(HERE, 'fixtures', 'rig-sample');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p183-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t0 = Date.now(); while (!(await fn())) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(20); } }
const WIN = process.platform === 'win32';
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const copySample = (dir) => fs.cpSync(path.join(SAMPLE, '.atrium'), path.join(dir, '.atrium'), { recursive: true });
function writeRig(root, def) {
  fs.mkdirSync(path.join(root, '.atrium'), { recursive: true });
  const f = path.join(root, '.atrium', 'rig.json');
  fs.writeFileSync(f, JSON.stringify(def, null, 2));
  const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t);
}
// 시험 도구: 환경·폴더·인자를 JSON 한 줄로, 큰 출력, 잠자기
const T_TOOL = `
const [mode, ...rest] = process.argv.slice(2);
if (mode === 'env') { const e = process.env; process.stdout.write(JSON.stringify({ cwd: process.cwd(), args: rest, unit: e.ATRIUM_UNIT_ID, try: e.ATRIUM_TRY_ID, name: e.ATRIUM_SESSION_NAME, root: e.ATRIUM_WORKSPACE_ROOT, token: e.ATRIUM_SESSION_TOKEN || null, port: e.ATRIUM_PORT || null }) + '\\n'); }
else if (mode === 'big') { process.stdout.write('a'.repeat(Number(rest[0]))); process.stderr.write('b'.repeat(Number(rest[1] || 0))); }
else if (mode === 'sleep') setTimeout(() => process.stdout.write('woke\\n'), Number(rest[0]));
else if (mode === 'exit') { process.stdout.write('bye\\n'); process.exit(Number(rest[0])); }
`;
const T_HOOK = `
const [mode, ...rest] = process.argv.slice(2);
let raw = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const input = raw ? JSON.parse(raw) : {};
  const out = (o) => process.stdout.write(JSON.stringify(o));
  if (mode === 'echo') return out({ action: 'pass', note: JSON.stringify({ at: input.at, tool: input.tool, args: input.args, exitCode: input.exitCode, status: input.status, outputTail: input.outputTail, logPath: input.logPath, durationMs: input.durationMs, unit: input.unit, session: input.session }) });
  if (mode === 'setargs') return out({ action: 'rewrite', args: rest });
  if (mode === 'append') return out({ action: 'pass', append: rest[0] });
  if (mode === 'reject') return out({ action: 'reject', reason: rest[0] });
});
`;
function setupTools(root, def) {
  fs.mkdirSync(path.join(root, '.atrium', 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', 't.mjs'), T_TOOL);
  fs.writeFileSync(path.join(root, '.atrium', 'hooks', 'h.mjs'), T_HOOK);
  writeRig(root, def);
}
const TT = (...a) => ['node', 'tools/t.mjs', ...a];
const HH = (...a) => ['node', '.atrium/hooks/h.mjs', ...a];

// ---------- 가짜 판(p182 틀) + rig + 도구 ----------
async function board({ dir = tmp(), tools = {} } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p183test', port: 0, dataDir: path.join(dir, 'data'), sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], spawned: [],
    api: { broadcast: () => {} }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '' },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { state: d.state, ask: d.ask || null, error: d.error || null }; },
    ensureLink(from, to, patch = {}) {
      let l = store.linkByPair(from, to);
      if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: !!patch.spawned, observed: !!patch.observed, createdAt: Date.now() }; store.insertLink(l); }
      return store.getLink(l.linkId);
    },
    linkEvent(l, kind, text = null, data = null) { return store.addLinkEvent(l.linkId, kind, text, data); },
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    pushTree() { const idx = b.branch.relIndex(); return [...b.sessions.values()].map((s) => ({ sessionId: s.sessionId, parentSessionId: idx.workParentOf(s.sessionId), kind: s.kind || 'claude', state: deriveState(s.rt).state, delivering: b.queue.pending(s.sessionId), loops: 0, bg: null })); },
    closeSession(s, reason) { b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
    resolveWorkspace: async (k) => { const w = store.getWorkspace(k || ws.key); if (!w) throw Object.assign(new Error('no ws'), { code: 'not_found' }); return w; },
    touch: () => {}, features: null,
  };
  b.rig = new Rig(b);
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    send: async (sid, text) => { if (b.stopped) return; b.sent.push({ sid, text }); const s = b.sessions.get(sid); if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.start();
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 40, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 }, tools });
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
  const add = (name, { kind = 'claude', hooked = kind === 'claude', workMs = 80, cwd = dir, ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd, paneId: `${name}:p1`, agentName: name, permissionMode: 'manual', kind, origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind, hooked }), createdAt: Date.now(), ...extra };
    s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle');
    store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
    b.sessions.set(s.sessionId, s);
    s.texts = [];
    s.agent = (text) => {
      s.texts.push(text);
      if (hooked) { applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: text }); b.queue.onUserPromptSubmit(s.sessionId, text); applyTermStatus(s.rt, 'working'); }
      else { applyTermStatus(s.rt, 'working'); b.queue.onAgentWorking(s.sessionId); }
      b.broadcastSession(s);
      setTimeout(() => {
        if (b.stopped) return;
        if (hooked) applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: `답: ${text.slice(-20)}` });
        applyTermStatus(s.rt, 'idle');
        b.broadcastSession(s);
      }, workMs);
    };
    b.broadcastSession(s);
    return s;
  };
  const enable = () => store.setRigEnabled(ws.key, true);
  const T = () => b.branch.tools;
  return { b, dir, ws, add, enable, T, stop: async () => { b.stopped = true; b.branch.tools.stopAll(); b.queue.stop(); b.branch.notices.stop(); b.branch.units.stops.stop(); await tick(300); store.close(); } };
}
const toolRows = (b) => b.store.db.prepare('SELECT * FROM tool_runs ORDER BY started_at, rowid').all();
const hookRows = (b) => b.store.db.prepare('SELECT * FROM rig_hook_runs ORDER BY id').all();
function serve(b) {
  const srv = http.createServer((req, res) => { if (!b.branch.handleHttp(req, res)) { res.writeHead(404); res.end(); } });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => { b.cfg.port = srv.address().port; r(srv); }));
}
function runCli(args, env) {
  return new Promise((resolve) => {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MTASK_|ATRIUM_|HERDR_|HC_)/.test(k)));
    execFile(process.execPath, [path.join(HERE, '..', 'bin', 'atrium-child.mjs'), ...args], { env: { ...clean, ...env }, timeout: 30000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}
const envOf = (b, s) => ({ ATRIUM_PORT: String(b.cfg.port), ATRIUM_SESSION_ID: s.sessionId, ATRIUM_SESSION_TOKEN: b.branch.token(s.sessionId), ATRIUM_TERMINAL_SESSION: b.cfg.terminalSession });

// ---------- 정의 검사 ----------
test('P183 정의 검사(tools): 이름·run 모양·desc·timeoutMs·parallel, 없는 스크립트, 시간 제한 기본과 상한, 안내에 node·python·.exe', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true }); fs.writeFileSync(path.join(root, 'tools', 'x.mjs'), '');
  const ok = validateRig({ tools: { judge: { run: ['node', 'tools/x.mjs'], desc: 'd' }, slow: { run: ['node', 'tools/x.mjs'], timeoutMs: 99 * 3600000, parallel: true } } }, { root });
  assert.equal(ok.ok, true);
  assert.equal(ok.def.tools.judge.timeoutMs, TOOL_TIMEOUT_MS); assert.equal(ok.def.tools.judge.parallel, false);
  assert.equal(ok.def.tools.slow.timeoutMs, TOOL_TIMEOUT_MAX_MS, '상한으로 깎는다'); assert.equal(ok.def.tools.slow.parallel, true);
  const bad = (tools) => validateRig({ tools }, { root });
  assert.match(bad({ 'a b': { run: ['node'] } }).reason, /도구 이름/);
  assert.match(bad({ a: { run: 'node x' } }).reason, /run은 빈 칸 없는 글 배열.*node, python, \.exe/);
  assert.match(bad({ a: { run: ['node'], desc: 3 } }).reason, /desc/);
  assert.match(bad({ a: { run: ['node'], timeoutMs: -1 } }).reason, /timeoutMs/);
  assert.match(bad({ a: { run: ['node'], parallel: 'yes' } }).reason, /parallel/);
  assert.match(bad({ a: { run: ['node', 'tools/nope.mjs'] } }).reason, /스크립트가 없다/);
  assert.match(bad({ a: { run: ['./tools/nope'] } }).reason, /파일이 없다.*node, python, \.exe/);
  assert.match(bad([]).reason, /tools는 객체/);
  // 견본 정의는 맞다(도구 하나와 그 관문·기록 훅)
  const s = validateRig(JSON.parse(fs.readFileSync(path.join(SAMPLE, '.atrium', 'rig.json'), 'utf8')), { root: SAMPLE });
  assert.equal(s.ok, true, s.reason);
  assert.deepEqual(Object.keys(s.def.tools), ['count']);
  assert.deepEqual(s.def.hooks.map((h) => h.at), ['deliver', 'done', 'tool-before', 'tool-after']);
  assert.equal(TOOL_WAIT_MS, 100000); assert.equal(TOOL_LOG_MAX, 50 * 1024 * 1024);
});

// ---------- 목록·실행·인자 ----------
test('P183 목록과 실행: 인자는 run 뒤에, 작업 폴더는 부른 세션의 폴더(워크트리), 깨끗한 환경 + ATRIUM_UNIT_ID·TRY_ID·SESSION_NAME·WORKSPACE_ROOT. 견본 도구는 관문이 --every를 붙이고 기록 훅이 한 줄 덧붙인다', async () => {
  const { b, ws, add, enable, T, stop } = await board();
  try {
    copySample(ws.root); enable();
    const wt = path.join(ws.root, 'wt'); fs.mkdirSync(wt);
    const w = add('w', { cwd: wt });
    const list = T().list(w);
    assert.deepEqual(list.tools.map((x) => x.name), ['count']);
    assert.equal(list.tools[0].desc.startsWith('Prints tick lines'), true);
    // 견본 도구의 스크립트(.atrium/tools/count.mjs)는 정의가 있는 뿌리 기준으로 푼다(세션 폴더 wt에는 없다)
    const { run } = await T().run(w, { tool: 'count', args: ['--to', '3', '--every', '10'] });
    assert.equal(run.status, 'done'); assert.equal(run.exitCode, 0);
    assert.deepEqual(run.args, ['--to', '3', '--every', '10']); assert.equal(run.argsGiven, null);
    assert.deepEqual(run.argv, ['node', '.atrium/tools/count.mjs', '--to', '3', '--every', '10']);
    assert.match(run.tail, /tick 1\/3\ntick 2\/3\ntick 3\/3/);
    assert.equal(run.appended, '[rig sample] tool-after saw count exit 0 (3 tail lines)');
    assert.equal(run.cwd, wt);
    // 관문이 인자를 고친다(--every 1000을 붙임). 고치기 전 인자가 남는다
    const r2 = (await T().run(w, { tool: 'count', args: ['--to', '1'] })).run;
    assert.deepEqual(r2.args, ['--to', '1', '--every', '1000']); assert.deepEqual(r2.argsGiven, ['--to', '1']);
    // 관문 거절
    await assert.rejects(T().run(w, { tool: 'count', args: [] }), (e) => e.code === 'rig_rejected' && /needs --to N/.test(e.message));
    const rej = toolRows(b).find((x) => x.status === 'rejected');
    assert.ok(rej && /needs --to N/.test(rej.error), '거절도 장부에 남는다');
    await assert.rejects(T().run(w, { tool: 'nope' }), (e) => e.code === 'unknown_tool' && /count/.test(e.message));
    // 환경과 작업 폴더(세션 폴더)
    setupTools(ws.root, { tools: { t: { run: TT('env') } } });
    assert.equal(JSON.parse((await T().run(w, { tool: 't' })).run.tail.trim()).cwd, wt, '작업 폴더는 부른 세션의 폴더');
    const e = JSON.parse((await T().run(add('e1'), { tool: 't', args: ['a b', '--x=1'] })).run.tail.trim());
    assert.deepEqual(e.args, ['a b', '--x=1'], '인자는 셸 없이 그대로');
    assert.equal(e.root, ws.root); assert.equal(e.name, 'e1'); assert.equal(e.unit, ''); assert.equal(e.try, '');
    assert.equal(e.token, null, '판의 세션 토큰은 넘기지 않는다'); assert.equal(e.port, null);
  } finally { await stop(); }
});

test('P183 일 안의 실행: ATRIUM_UNIT_ID·TRY_ID가 그 일, tool_runs에 일·시도, atrium items가 일마다 도구 실행 수를 보인다', async () => {
  const { b, ws, add, enable, T, stop } = await board();
  const srv = await serve(b);
  try {
    setupTools(ws.root, { tools: { t: { run: TT('env') } } }); enable();
    const lead = add('lead');
    const w1 = add('w1', { parentSessionId: lead.sessionId, workMs: 60000 });
    const r = await runCli(['prompt', 'w1', '일을 해라'], envOf(b, lead));
    assert.equal(r.code, 0, r.stderr);
    await until(() => w1.texts.length === 1);
    const tr = b.store.openTryOf(w1.sessionId);
    assert.ok(tr);
    const out = await runCli(['tool', 't', 'x'], envOf(b, w1));
    assert.equal(out.code, 0, out.stderr);
    const tail = JSON.parse(out.stdout.split('--- 출력 꼬리 ---\n')[1].split('\n---')[0]);
    assert.equal(tail.unit, tr.unitId); assert.equal(tail.try, tr.id);
    await runCli(['tool', 't', 'y'], envOf(b, w1));
    const rows = toolRows(b);
    assert.equal(rows.length, 2); assert.ok(rows.every((x) => x.unit_id === tr.unitId && x.try_id === tr.id));
    const items = b.branch.units.items(lead);
    assert.equal(items.items[0].toolRuns, 2);
    const cli = await runCli(['items'], envOf(b, lead));
    assert.match(cli.stdout, /도구 실행 2/);
  } finally { srv.close(); await stop(); }
});

// ---------- 100초(시험은 짧게), --wait, --runs, 종료 코드 ----------
test('P183 오래 도는 실행: 기다리는 시간을 넘으면 종료 코드 3과 실행 ID, --wait로 이어 받고 --runs에 보인다. 도구의 종료 코드가 0이 아니면 1', async () => {
  const { b, ws, add, enable, stop } = await board({ tools: { waitMs: 400 } });
  const srv = await serve(b);
  try {
    copySample(ws.root); enable();
    const w = add('w');
    const env = envOf(b, w);
    const list = await runCli(['tool'], env);
    assert.equal(list.code, 0, list.stderr); assert.match(list.stdout, /atrium tool count/);
    const long = await runCli(['tool', 'count', '--to', '8', '--every', '150'], env);
    assert.equal(long.code, 3, long.stderr);
    const id = long.stdout.match(/실행 (tr[0-9a-f]+)이 아직 돈다/)[1];
    assert.match(long.stdout, new RegExp(`atrium tool --wait ${id}`));
    const busy = await runCli(['tool', 'count', '--to', '1'], env);
    assert.equal(busy.code, 1); assert.match(busy.stderr, /tool_busy/); assert.match(busy.stderr, new RegExp(id));
    const w1 = await runCli(['tool', '--wait', id, '--timeout', '100'], env);
    assert.equal(w1.code, 3);
    const w2 = await runCli(['tool', '--wait', id, '--timeout', '5000'], env);
    assert.equal(w2.code, 0, w2.stderr);
    assert.match(w2.stdout, /끝났다\. 종료 코드 0/); assert.match(w2.stdout, /tick 8\/8/);
    assert.match(w2.stdout, /\[rig sample\] tool-after saw count exit 0/);
    const json = JSON.parse((await runCli(['tool', '--json', '--wait', id], env)).stdout);
    assert.equal(json.run.status, 'done'); assert.equal(json.run.exitCode, 0);
    const fail = await runCli(['tool', 'count', '--to', '1', '--every', '5', '--fail'], env);
    assert.equal(fail.code, 1); assert.match(fail.stdout, /종료 코드 2/); assert.match(fail.stdout, /tool-after saw count exit 2/);
    const runs = await runCli(['tool', '--runs'], env);
    assert.equal(runs.code, 0); assert.match(runs.stdout, new RegExp(id)); assert.match(runs.stdout, /종료 코드 2/);
    // 남의 실행은 기다리지 못한다
    const other = await runCli(['tool', '--wait', id], envOf(b, add('o')));
    assert.equal(other.code, 1); assert.match(other.stderr, /not_found/);
    // 이름 뒤의 --x는 도구의 인자다(atrium의 플래그가 아니다)
    const lead = await runCli(['tool', 'count', '--to', '1', '--every', '5', '--json'], env);
    assert.equal(lead.code, 0, lead.stderr); assert.match(lead.stdout, /도구 count 실행/);
    const usage = await runCli(['tool', '--bogus'], env);
    assert.equal(usage.code, 2);
  } finally { srv.close(); await stop(); }
});

test('P183 세션마다 하나: 도는 동안 같은 세션의 다른 실행은 tool_busy, parallel 도구와 다른 세션은 함께 돈다. 시간 제한을 넘으면 나무째 끄고 timeout', async () => {
  const { b, ws, add, enable, T, stop } = await board({ tools: { waitMs: 50 } });
  try {
    setupTools(ws.root, { tools: { s: { run: TT('sleep') }, p: { run: TT('sleep'), parallel: true }, short: { run: TT('sleep'), timeoutMs: 300 } } }); enable();
    const a = add('a'); const c = add('c');
    const first = (await T().run(a, { tool: 's', args: ['1500'] })).run;
    assert.equal(first.status, 'running');
    await assert.rejects(T().run(a, { tool: 's', args: ['10'] }), (e) => e.code === 'tool_busy' && e.runId === first.id);
    const par = (await T().run(a, { tool: 'p', args: ['10'], waitMs: 3000 })).run;
    assert.equal(par.status, 'done', 'parallel 도구는 함께 돈다');
    const other = (await T().run(c, { tool: 's', args: ['10'], waitMs: 3000 })).run;
    assert.equal(other.status, 'done', '다른 세션은 따로');
    const done = (await T().wait(a, { runId: first.id, timeoutMs: 5000 })).run;
    assert.equal(done.status, 'done'); assert.match(done.tail, /woke/);
    const to = (await T().run(c, { tool: 'short', args: ['5000'], waitMs: 4000 })).run;
    assert.equal(to.status, 'timeout'); assert.match(to.error, /시간 제한/);
    assert.ok(to.durationMs < 3000);
  } finally { await stop(); }
});

test('P183 다시 뜨면 lost: 장부에 running으로 남은 실행은 새 ToolRuns가 lost로 바꾼다. 보드가 꺼질 때(stopAll) 도는 실행을 끝내고 lost', async () => {
  const { b, ws, add, enable, T, stop } = await board({ tools: { waitMs: 30 } });
  try {
    setupTools(ws.root, { tools: { s: { run: TT('sleep') } } }); enable();
    const a = add('a');
    const run = (await T().run(a, { tool: 's', args: ['20000'] })).run;
    assert.equal(run.status, 'running');
    T().stopAll();
    await until(() => b.store.getToolRun(run.id).status === 'lost');
    await until(() => !T().live.has(run.id));
    assert.equal(b.store.getToolRun(run.id).status, 'lost', 'finish가 덮어쓰지 않는다');
    // 다시 뜸
    b.store.insertToolRun({ id: 'trdead', sessionId: a.sessionId, tool: 's', argv: [], args: [], status: 'running', startedAt: Date.now() });
    new ToolRuns(b);
    const x = b.store.getToolRun('trdead');
    assert.equal(x.status, 'lost'); assert.ok(x.endedAt);
  } finally { await stop(); }
});

test('P183 로그: stdout·stderr를 tool-runs/<ID>.log에, 상한(시험은 1000바이트)에서 자르고 끝까지 돌린다. out_sha256은 쓴 바이트의 SHA-256, 꼬리는 마지막 줄들', async () => {
  const { b, ws, add, enable, T, stop } = await board({ tools: { logMax: 1000 } });
  try {
    setupTools(ws.root, { tools: { big: { run: TT('big') }, x: { run: TT('exit') } } }); enable();
    const a = add('a');
    const r = (await T().run(a, { tool: 'big', args: ['3000', '500'] })).run;
    assert.equal(r.status, 'done'); assert.equal(r.exitCode, 0);
    assert.equal(r.logPath, path.join(b.cfg.dataDir, 'tool-runs', `${r.id}.log`));
    const buf = fs.readFileSync(r.logPath);
    assert.equal(buf.length, 1000); assert.equal(r.logBytes, 1000); assert.equal(r.logCut, true);
    assert.equal(r.outSha256, sha(buf));
    const small = (await T().run(a, { tool: 'x', args: ['0'] })).run;
    assert.equal(small.logCut, false); assert.equal(small.outSha256, sha(Buffer.from('bye\n')));
    assert.equal(readTail(small.logPath), 'bye\n');
    // 꼬리는 마지막 40줄
    const many = path.join(b.cfg.dataDir, 'many.log'); fs.writeFileSync(many, Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n') + '\n');
    const tl = readTail(many).trim().split('\n');
    assert.equal(tl.length, 40); assert.equal(tl[39], 'line 99');
  } finally { await stop(); }
});

// ---------- 훅 ----------
test('P183 tool-before·tool-after: 통과·거절·인자 고치기, tool 칸으로 거르기, after 입력(종료 코드·꼬리·로그·시간)과 덧붙이기. 모든 훅 실행은 rig_hook_runs에 tool_run_id와 함께, tool_runs.hooks에 요약', async () => {
  const { b, ws, add, enable, T, stop } = await board();
  try {
    setupTools(ws.root, {
      hooks: [
        { at: 'tool-before', tool: 'other', run: HH('reject', 'not me') },
        { at: 'tool-before', tool: 't', run: HH('echo') },
        { at: 'tool-before', tool: 't', run: HH('setargs', 'fixed', 'args') },
        { at: 'tool-after', run: HH('echo') },
        { at: 'tool-after', run: HH('append', 'line one') },
        { at: 'tool-after', tool: 't', run: HH('append', 'line two') },
      ],
      tools: { t: { run: TT('env') }, other: { run: TT('env') } },
    });
    enable();
    const a = add('a');
    const r = (await T().run(a, { tool: 't', args: ['given'] })).run;
    assert.equal(r.status, 'done');
    assert.deepEqual(JSON.parse(r.tail).args, ['fixed', 'args'], '고친 인자로 돈다');
    assert.deepEqual(r.argsGiven, ['given']);
    assert.equal(r.appended, 'line one\nline two');
    const hs = hookRows(b).filter((x) => x.tool_run_id === r.id);
    assert.deepEqual(hs.map((x) => [x.at, x.hook_index, x.decision]), [['tool-before', 1, 'pass'], ['tool-before', 2, 'rewrite'], ['tool-after', 3, 'pass'], ['tool-after', 4, 'pass'], ['tool-after', 5, 'pass']]);
    const beforeIn = JSON.parse(hs[0].note);
    assert.equal(beforeIn.at, 'tool-before'); assert.equal(beforeIn.tool, 't'); assert.deepEqual(beforeIn.args, ['given']); assert.equal(beforeIn.session.name, 'a');
    assert.equal(hs[1].before_text, JSON.stringify(['given']), '고치기 전 인자');
    const afterIn = JSON.parse(hs[2].note);
    assert.equal(afterIn.exitCode, 0); assert.equal(afterIn.status, 'done'); assert.deepEqual(afterIn.args, ['fixed', 'args']);
    assert.equal(afterIn.logPath, r.logPath); assert.match(afterIn.outputTail, /"fixed"/); assert.ok(afterIn.durationMs >= 0);
    assert.ok(hs.every((x) => x.rig_hash === r.rigHash && x.session_id === a.sessionId));
    assert.deepEqual(r.hooks.map((x) => x.at), ['tool-before', 'tool-before', 'tool-after', 'tool-after', 'tool-after']);
    // 거절: 도구를 띄우지 않는다
    await assert.rejects(T().run(a, { tool: 'other' }), (e) => e.code === 'rig_rejected' && /not me/.test(e.message));
    const rej = toolRows(b).find((x) => x.tool === 'other');
    assert.equal(rej.status, 'rejected'); assert.equal(rej.log_path, null);
    assert.equal(hookRows(b).find((x) => x.tool_run_id === rej.id).decision, 'reject');
  } finally { await stop(); }
});

test('P183 tool_runs 열: 실행 ID, 세션, 워크스페이스, 일, 시도, 도구, argv·인자, 폴더, 정의 해시, 상태, 종료 코드, 시작·끝, 로그 경로·바이트, 출력 해시, 훅 기록', async () => {
  const { b, ws, add, enable, T, stop } = await board();
  try {
    setupTools(ws.root, { hooks: [{ at: 'tool-after', run: HH('append', 'x') }], tools: { x: { run: TT('exit') } } }); enable();
    const a = add('a');
    const r = (await T().run(a, { tool: 'x', args: ['0'] })).run;
    const cols = b.store.db.prepare('PRAGMA table_info(tool_runs)').all().map((c) => c.name);
    for (const c of ['id', 'session_id', 'workspace_key', 'unit_id', 'try_id', 'tool', 'argv', 'args', 'args_given', 'cwd', 'rig_hash', 'status', 'exit_code', 'started_at', 'ended_at', 'log_path', 'log_bytes', 'log_cut', 'out_sha256', 'hooks', 'appended', 'error']) assert.ok(cols.includes(c), c);
    const row = b.store.db.prepare('SELECT * FROM tool_runs WHERE id = ?').get(r.id);
    assert.equal(row.session_id, a.sessionId); assert.equal(row.workspace_key, ws.key); assert.equal(row.tool, 'x');
    assert.equal(row.rig_hash, b.rig.read(ws.key).hash); assert.equal(row.exit_code, 0); assert.ok(row.ended_at >= row.started_at);
    assert.equal(row.out_sha256, sha(fs.readFileSync(row.log_path)));
    assert.equal(JSON.parse(row.hooks).length, 1); assert.equal(row.appended, 'x');
    assert.ok(b.store.db.prepare('PRAGMA table_info(rig_hook_runs)').all().some((c) => c.name === 'tool_run_id'));
    const ev = b.store.db.prepare("SELECT kind FROM events WHERE kind IN ('tool_run', 'tool_done') ORDER BY id").all().map((e) => e.kind);
    assert.deepEqual(ev, ['tool_run', 'tool_done']);
  } finally { await stop(); }
});

// ---------- .cmd 인자 ----------
test('P183 .cmd·.bat 인자: [A-Za-z0-9 _.,:=/@+-] 밖의 글자는 에이전트가 준 것도 tool-before가 고친 것도 거절, 그 밖은 cmd.exe로 돈다', { skip: !WIN }, async () => {
  const { b, ws, add, enable, T, stop } = await board();
  try {
    setupTools(ws.root, { hooks: [{ at: 'tool-before', tool: 'bad', run: HH('setargs', 'a&b') }], tools: { c: { run: ['tools/echo.cmd'] }, bad: { run: ['tools/echo.cmd'] } } });
    fs.writeFileSync(path.join(ws.root, 'tools', 'echo.cmd'), '@echo off\r\necho args=%*\r\n');
    enable();
    const a = add('a');
    for (const bad of ['a&b', 'x|y', '<in', 'out>', 'c^d', '%PATH%', '!x!', '"q"', 'line\nbreak', '(p)', 'a;b', "it's"]) {
      await assert.rejects(T().run(a, { tool: 'c', args: ['ok', bad] }), (e) => e.code === 'cmd_args' && /node, python, \.exe/.test(e.message), JSON.stringify(bad));
    }
    assert.equal(toolRows(b).length, 0, '준 인자 거절은 장부 전에(훅도 돌지 않는다)');
    const ok = (await T().run(a, { tool: 'c', args: ['A-z_0.9', 'k=v,w:x/y@z+1', 'two words'] })).run;
    assert.equal(ok.status, 'done', ok.error); assert.match(ok.tail, /args="A-z_0\.9" "k=v,w:x\/y@z\+1" "two words"/);
    await assert.rejects(T().run(a, { tool: 'bad', args: ['fine'] }), (e) => e.code === 'cmd_args' && /tool-before 훅이 고친/.test(e.message));
    assert.equal(toolRows(b).find((x) => x.tool === 'bad').status, 'rejected');
  } finally { await stop(); }
});
test('P183 .cmd 인자 검사 글자', () => {
  assert.equal(badCmdArg(['a', 'B-9_.,:=/@+', 'with space']), null);
  for (const x of ['&', '|', '<', '>', '^', '%', '!', '"', "'", '\n', '\r', '\t', '(', ')', ';', '\\', '*', '?', '`', '$', '한']) assert.equal(badCmdArg(['ok', `a${x}b`]), `a${x}b`, JSON.stringify(x));
});

// ---------- 꺼진 워크스페이스 ----------
test('P183 꺼진 워크스페이스·정의 없음·도구 없음·잘못된 정의: atrium tool은 까닭과 함께 종료 코드 1, 도구도 훅도 돌지 않고 장부도 없다', async () => {
  const { b, ws, add, enable, stop } = await board();
  const srv = await serve(b);
  try {
    const a = add('a'); const env = envOf(b, a);
    let r = await runCli(['tool'], env);
    assert.equal(r.code, 1); assert.match(r.stderr, /rig_off/); assert.match(r.stderr, /정의.*없다/);
    copySample(ws.root);
    r = await runCli(['tool', 'count', '--to', '1'], env);
    assert.equal(r.code, 1); assert.match(r.stderr, /사람이 켜지 않았다/);
    enable();
    writeRig(ws.root, { hooks: [] });
    r = await runCli(['tool'], env);
    assert.equal(r.code, 1); assert.match(r.stderr, /도구\(tools\)가 없다/);
    writeRig(ws.root, { tools: { a: { run: 'bad' } } });
    b.rig.cache.clear();
    r = await runCli(['tool'], env);
    assert.equal(r.code, 1); assert.match(r.stderr, /정의가 잘못돼/);
    assert.equal(toolRows(b).length, 0); assert.equal(hookRows(b).length, 0);
  } finally { srv.close(); await stop(); }
});

// ---------- 계약·승인 규칙·안내 ----------
test('P183 계약: tool 동사를 더했고 계약은 3 그대로, 승인 규칙에 atrium tool(Bash·PowerShell), guide에 도구 이름', async () => {
  assert.equal(CONTRACT_VERSION, 4); // P185: rig 자리로 4
  assert.ok(VERB_NAMES.includes('tool'));
  assert.ok(VERBS.find((v) => v.name === 'items').out.includes('toolRuns'));
  const allow = ATRIUM_ALLOW.join(' ');
  for (const c of ['atrium', 'mtask']) {
    assert.ok(allow.includes(`Bash(${c} tool)`) && allow.includes(`Bash(${c} tool *)`), c);
    assert.ok(allow.includes(`PowerShell(${c} tool *)`), c);
  }
  const { b, ws, add, enable, stop } = await board();
  const srv = await serve(b);
  try {
    copySample(ws.root); enable();
    const g = await runCli(['guide'], envOf(b, add('a')));
    assert.equal(g.code, 0); assert.match(g.stdout, /rig 도구: count/); assert.match(g.stdout, /atrium tool \[<이름> \[인자…\]\]/);
    assert.match(g.stdout, /도구의 run에는 node, python, \.exe를 바로 적는다/);
    assert.match(g.stdout, /Tool `count`/);
  } finally { srv.close(); await stop(); }
});

// ---------- @fable-peer 추가 조건 ----------
test('P183 rig 켜기 확인: confirm 없이는 켜지 않고 돌 훅·도구의 명령(argv)을 돌려준다. 확인하면 켜지고, 정의가 바뀌어도 그대로 켜져 있다. 끄기는 묻지 않는다. 기기는 상태만', async () => {
  const { b, ws, stop } = await board();
  try {
    copySample(ws.root);
    const h = rigHandlers(b);
    const ask = await h['rig.enable']({ workspace: ws.key }, { auth: { kind: 'local' } });
    assert.equal(ask.needsConfirm, true); assert.equal(b.store.rigState(ws.key).enabled, false);
    assert.deepEqual(ask.hooks.map((x) => x.run.join(' ')), ['node .atrium/hooks/stamp.mjs', 'node .atrium/hooks/evidence.mjs', 'node .atrium/hooks/gate.mjs', 'node .atrium/hooks/record.mjs']);
    assert.deepEqual(ask.tools.map((x) => [x.name, x.run.join(' ')]), [['count', 'node .atrium/tools/count.mjs']]);
    await assert.rejects(h['rig.enable']({ workspace: ws.key, confirm: true }, { auth: { kind: 'device' } }), (e) => e.code === 'forbidden');
    await assert.rejects(h['rig.enable']({ workspace: ws.key }, { auth: { kind: 'device' } }), (e) => e.code === 'forbidden', '기기는 확인 내용도 받지 않는다');
    const on = await h['rig.enable']({ workspace: ws.key, confirm: true }, { auth: { kind: 'local' } });
    assert.equal(on.state, 'on'); assert.equal(on.needsConfirm, undefined);
    writeRig(ws.root, { hooks: [] });
    assert.equal((await h['rig.status']({ workspace: ws.key }, { auth: { kind: 'device' } })).state, 'on', '정의가 바뀌어도 다시 묻지 않는다');
    const off = await h['rig.disable']({ workspace: ws.key }, { auth: { kind: 'local' } });
    assert.equal(off.state, 'off');
  } finally { await stop(); }
});

test('P183 사람이 띄우며 준 첫 요청: 띄우기 전에 받는 쪽 워크스페이스 rig의 deliver 훅(from human)을 지난다. 거절이면 띄우지 않고, 통과면 고친 글을 넣는다. 하위 세션(branch)은 branch.mjs가 한다', async () => {
  const dir = tmp();
  const ws = await workspaceOf(dir);
  let reached = 0; const seen = [];
  let verdict = { action: 'pass', text: 'fixed text' };
  const fake = {
    termOk: true, adapter: { connected: true, agentKinds: async () => [] }, sessions: new Map(), features: null, cfg: {},
    requireTerminal: Backend.prototype.requireTerminal, humanFirstPrompt: Backend.prototype.humanFirstPrompt,
    rig: { deliver: async (x) => { seen.push(x); return verdict; } },
    ensureWorkspace() { reached++; throw Object.assign(new Error('stop here'), { code: 'reached' }); },
  };
  const go = (p) => Backend.prototype.spawn.call(fake, p).catch((e) => e);
  try {
    verdict = { action: 'reject', reason: 'needs a ticket' };
    const e1 = await go({ cwd: dir, kind: 'codex', name: 'c1', prompt: 'do it\r\nnow' });
    assert.equal(e1.code, 'rig_rejected'); assert.match(e1.message, /needs a ticket/); assert.equal(e1.key, 'rig.spawnRejected');
    assert.equal(reached, 0, '띄우기 전에 거절');
    assert.equal(seen[0].from.kind, 'human'); assert.equal(seen[0].workspaceKey, ws.key); assert.equal(seen[0].text, 'do it\nnow');
    assert.equal(seen[0].target.name, 'c1'); assert.equal(seen[0].target.kind, 'codex');
    verdict = { action: 'pass', text: 'fixed text' };
    const e2 = await go({ cwd: dir, kind: 'codex', name: 'c2', prompt: 'hello' });
    assert.equal(e2.code, 'reached'); assert.equal(reached, 1);
    assert.equal(await fake.humanFirstPrompt({ prompt: 'hello' }, { ws, name: 'c3', kind: 'claude', model: null, cwd: dir }), 'fixed text');
    seen.length = 0;
    assert.equal(await fake.humanFirstPrompt({ prompt: 'raw', branch: {} }, { ws, name: 'c4', kind: 'claude', model: null, cwd: dir }), 'raw', '하위 세션은 여기서 훅을 돌리지 않는다');
    assert.equal(seen.length, 0);
    const e3 = await go({ cwd: dir, kind: 'codex', name: 'c5' });
    assert.equal(e3.code, 'reached'); assert.equal(seen.length, 0, '첫 요청이 없으면 훅도 없다');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('P183 사람의 첫 요청 훅(진짜 Rig): 켜진 워크스페이스의 deliver 훅이 from human으로 돌고 기록된다. 꺼졌으면 그대로', async () => {
  const { b, ws, enable, stop } = await board();
  try {
    copySample(ws.root);
    const call = (prompt) => Backend.prototype.humanFirstPrompt.call(b, { prompt }, { ws, name: 'n1', kind: 'claude', model: null, cwd: ws.root });
    assert.equal(await call('hi'), 'hi', '꺼진 워크스페이스는 그대로');
    assert.equal(hookRows(b).length, 0);
    enable();
    assert.equal(await call('hi'), 'hi\n[rig sample] deliver hook saw this (from human)');
    const h = hookRows(b);
    assert.equal(h.length, 1); assert.equal(h[0].at, 'deliver'); assert.equal(h[0].session_id, null, '띄우기 전이라 세션 ID가 없다');
  } finally { await stop(); }
});
