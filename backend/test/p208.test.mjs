// P208 단위 시험: atrium 실행 파일 꾸러미(atrium.exe, cmd를 거치지 않는다), Codex --effort 옮기기(호출자 인자 덮기·잘못된 값·받지 않는 종류),
// Codex 신뢰 질문(화면 글 견본, hc 흉내 막힘, trust_wait), Codex 일 머리의 --file 안내
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { childShims } from '../src/branch.mjs';
import { SHIM_EXE_SOURCE, SHIM_EXE_HASH, ensureShimExe, findCsc, shimExeCurrent } from '../src/shim-exe.mjs';
import { effortArgsOf, effortIgnoredLine, CODEX_EFFORTS, Launchers } from '../src/launchers.mjs';
import { isCodexTrustDialog, trustDialogOf, isTrustDialog } from '../src/screen.mjs';
import { HcAdapter } from '../src/hc/adapter.mjs';
import { CODEX_TRUST_STATUS, trustStatusOf, TRUST_STATUS } from '../src/hc/model.mjs';
import { newRuntime, deriveState, applyTermStatus } from '../src/state.mjs';
import { unitHeader, PS_DONE_TAIL } from '../src/work-units.mjs';
import { Backend } from '../src/backend.mjs';
import { Store } from '../src/store.mjs';
import { DEFAULTS } from '../src/settings.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { startFakeHc } from './fake-hc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p208-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(20); } throw new Error('timed out'); };
// 인자 그대로 받았는지 보는 가짜 atrium-child: 받은 argv(JSON env)를 한 줄 JSON으로 찍고 종료 코드 3
const ECHO = `import fs from 'node:fs';
const j = process.env.ATRIUM_ARGV_JSON, f = process.env.ATRIUM_ARGV_FILE;
const a = j != null ? JSON.parse(j) : f != null ? JSON.parse(fs.readFileSync(f, 'utf8')) : process.argv.slice(2);
console.log(JSON.stringify({ src: j != null ? 'json' : f != null ? 'file' : 'argv', a }));
process.exit(3);
`;
// 판이 띄운 Codex(0.167)의 실제 신뢰 화면(경로만 바꿈)
const CODEX_TRUST = [
  '', '  Folder access', '  C:\\w\\proj', '',
  '  Note: You’re in a subdirectory of a Git project. Trusting will apply to the repository root:', '  c:\\w\\proj', '',
  '  Trust this folder? Codex can read, edit, and run files here, subject to your permission settings. Folder settings can run code automatically, even without a model request. Continue only if you',
  '  trust these files. Your trust decision will be saved.', '',
  '› 1. Trust and continue', '  2. Back to Agent Command Center', '', '  enter continue · esc back',
].join('\n');

// ---------- 1. 실행 파일 꾸러미 ----------
test('P208 꾸러미 파일: sh·cmd는 그대로, <이름>.target(node·스크립트 두 줄)을 더하고 .ps1은 두지 않는다', () => {
  const s = childShims({ node: 'C:\\n\\node.exe', script: 'C:\\b\\atrium-child.mjs' });
  assert.deepEqual(Object.keys(s).sort(), ['atrium', 'atrium.cmd', 'atrium.target', 'mtask', 'mtask.cmd', 'mtask.target']);
  assert.equal(s['atrium.target'], 'C:\\n\\node.exe\r\nC:\\b\\atrium-child.mjs\r\n');
  assert.equal(s['atrium.cmd'], '@echo off\r\nrem Atrium 보드(P8, P116): 보드가 띄운 세션의 명령. 사용법: atrium help\r\n"C:\\n\\node.exe" "C:\\b\\atrium-child.mjs" %*\r\n');
  assert.match(s.atrium, /^#!\/bin\/sh\n[\s\S]*exec "C:\/n\/node.exe" "C:\/b\/atrium-child.mjs" "\$@"\n$/);
  // C# 글: 인자를 JSON env로, 길면 파일로, .target에서 경로를 읽는다
  for (const w of ['ATRIUM_ARGV_JSON', 'ATRIUM_ARGV_FILE', '.target', 'UseShellExecute = false', 'WaitForExit', 'ExitCode']) assert.ok(SHIM_EXE_SOURCE.includes(w), w);
  assert.match(SHIM_EXE_HASH, /^[0-9a-f]{16}$/);
});

test('P208 꾸러미 빌드: Windows가 아니면 하지 않고, csc가 없으면 .cmd를 그대로 둔다(던지지 않는다)', async () => {
  const d = tmp();
  try {
    assert.deepEqual(await ensureShimExe({ dirs: [d], platform: 'linux' }), { ok: false, why: 'not_windows' });
    const logs = [];
    assert.deepEqual(await ensureShimExe({ dirs: [d], platform: 'win32', csc: null, log: (m) => logs.push(m) }), { ok: false, why: 'no_csc' });
    assert.match(logs[0], /csc\.exe not found/);
    assert.equal(fs.existsSync(path.join(d, 'atrium.exe')), false);
    assert.equal(findCsc({ SystemRoot: 'C:\\nowhere' }, () => false), null);
    assert.equal(findCsc({ SystemRoot: 'C:\\Win' }, (f) => f.includes('Framework64')), path.join('C:\\Win', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

const canBuild = process.platform === 'win32' && !!findCsc();
test('P208 꾸러미 실행(Windows, csc): 여러 줄·큰따옴표·< > | & %·한글 인자가 그대로 가고 종료 코드를 돌려준다. 같은 글이면 다시 빌드하지 않는다', { skip: !canBuild && 'csc.exe 없음' }, async () => {
  const d = tmp();
  try {
    fs.writeFileSync(path.join(d, 'echo.mjs'), ECHO);
    for (const [n, t] of Object.entries(childShims({ script: path.join(d, 'echo.mjs') }))) fs.writeFileSync(path.join(d, n), t);
    const r = await ensureShimExe({ dirs: [d], buildDir: path.join(d, 'build') });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.built, true);
    assert.ok(shimExeCurrent(d, 'atrium') && shimExeCurrent(d, 'mtask'));
    assert.equal(fs.existsSync(path.join(d, 'build')), false, '빌드 폴더는 지운다');
    const args = ['done', 'ok', '판정: rejected\n둘째 줄 (못 하면 atrium done failed "<까닭>") | & %PATH% \'q\' \\끝\\', '', '30'];
    const out = spawnSync(path.join(d, 'atrium.exe'), args, { encoding: 'utf8' });
    assert.equal(out.status, 3, out.stderr);
    assert.deepEqual(JSON.parse(out.stdout), { src: 'json', a: args });
    const m = spawnSync(path.join(d, 'mtask.exe'), [], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(m.stdout), { src: 'json', a: [] });
    // 긴 인자(JSON 30000자 넘음)는 임시 파일로
    const long = 'x'.repeat(31000);
    assert.deepEqual(JSON.parse(spawnSync(path.join(d, 'atrium.exe'), ['child', long], { encoding: 'utf8' }).stdout), { src: 'file', a: ['child', long] });
    // PowerShell 7이 있으면: 그 셸에서 atrium으로 부르면 .cmd가 아니라 .exe로 가고 글이 그대로 간다
    const pwsh = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', `$env:PATH = '${d};' + $env:PATH; atrium prompt a "x\`n(\`"<y>\`") | & %PATH%"; (Get-Command atrium).Source`], { encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toLowerCase() !== 'psmodulepath')) });
    if (!pwsh.error) {
      const [line, src] = pwsh.stdout.trim().split(/\r?\n/);
      assert.deepEqual(JSON.parse(line).a, ['prompt', 'a', 'x\n("<y>") | & %PATH%']);
      assert.match(src, /atrium\.exe$/i);
    }
    assert.deepEqual(await ensureShimExe({ dirs: [d] }), { ok: true, built: false, dirs: [] });
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('P208 atrium-child: 인자 없이 ATRIUM_ARGV_JSON(또는 ATRIUM_ARGV_FILE)이 오면 그것을 argv로 읽는다', () => {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MTASK_|ATRIUM_|HERDR_|HC_)/.test(k)));
  const bin = path.join(HERE, '..', 'bin', 'atrium-child.mjs');
  const r = spawnSync(process.execPath, [bin], { encoding: 'utf8', env: { ...clean, ATRIUM_ARGV_JSON: JSON.stringify(['help', '--long']) } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /atrium prompt/);
  assert.match(r.stdout, /atrium\.exe/, '도움말이 꾸러미와 --file을 말한다');
  const d = tmp();
  try {
    const f = path.join(d, 'a.json'); fs.writeFileSync(f, JSON.stringify(['help']));
    const r2 = spawnSync(process.execPath, [bin], { encoding: 'utf8', env: { ...clean, ATRIUM_ARGV_FILE: f } });
    assert.equal(r2.status, 0, r2.stderr); assert.match(r2.stdout, /atrium prompt/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
  // 인자가 있으면 env보다 인자(다른 길로 부른 경우)
  const r3 = spawnSync(process.execPath, [bin, 'help'], { encoding: 'utf8', env: { ...clean, ATRIUM_ARGV_JSON: '["nope"]' } });
  assert.equal(r3.status, 0); assert.match(r3.stdout, /atrium prompt/);
});

// ---------- 2. Codex --effort ----------
test('P208 effortArgsOf: Codex는 -c model_reasoning_effort로 옮기고 호출자 인자의 같은 값을 뺀다. 잘못된 값은 던지고, 받지 않는 종류는 ignored', () => {
  const r = effortArgsOf('codex', 'medium', ['--approve-for-me', '-c', 'model_reasoning_effort="high"', '-c', 'other=1', '--config=model_reasoning_effort=xhigh', '--config', 'model_reasoning_effort = "low"']);
  assert.deepEqual(r, { args: ['--approve-for-me', '-c', 'other=1', '-c', 'model_reasoning_effort="medium"'], applied: true, effort: 'medium' });
  assert.deepEqual(effortArgsOf('codex', 'low', []).args, ['-c', 'model_reasoning_effort="low"']);
  for (const e of ['low', 'medium', 'high', 'xhigh']) assert.ok(CODEX_EFFORTS.includes(e));
  assert.throws(() => effortArgsOf('codex', 'turbo', []), (e) => e.code === 'bad_request' && /Codex 추론 수준/.test(e.message) && e.key === 'launchers.err.effort');
  // AGY: --effort를 바꿔 넣는다(Claude Code와 같은 값만)
  assert.deepEqual(effortArgsOf('agy', 'low', ['--effort', 'high', '--mode', 'x']).args, ['--mode', 'x', '--effort', 'low']);
  assert.throws(() => effortArgsOf('agy', 'ultra', []), /추론 수준/);
  // claude는 판이 --effort로 따로 넘긴다(인자를 바꾸지 않는다), 받지 않는 종류
  assert.deepEqual(effortArgsOf('claude', 'low', ['-x']), { args: ['-x'], applied: false, effort: 'low' });
  assert.deepEqual(effortArgsOf('opencode', 'low', ['-x']), { args: ['-x'], applied: false, ignored: true, effort: 'low' });
  assert.deepEqual(effortArgsOf('codex', '', ['-c', 'model_reasoning_effort="high"']).args, ['-c', 'model_reasoning_effort="high"'], '값이 없으면 그대로');
  assert.match(effortIgnoredLine('pi', 'low'), /--effort low는 무시했다: pi는 노력 수준을 받지 않는다/);
});

// 판의 띄우기 길(backend spawn): 가짜 터미널, 하네스 시작은 그 인자를 돌려준다
function spawnBackend() {
  const dir = tmp();
  const b = new Backend({ quietMs: 600000, port: 0, logDir: dir, sessionsDir: path.join(dir, 'sessions'), claudeJson: path.join(dir, 'none.json'), claudeCommand: 'claude', hookTimeoutSec: 2 });
  b.store = new Store(path.join(dir, 'board.db'));
  b.sessions = new Map(); b.termOk = true; b.hookUrl = 'http://127.0.0.1:1/hook'; b.plugin = {};
  b.branch = { settingsExtra: () => ({}), noteChild() {}, placeChild: () => null };
  b.features = { settings: { get: () => ({ ...DEFAULTS }) }, launchers: null };
  b.features.launchers = new Launchers({ store: b.store });
  b.queue = { enqueue() {}, pending: () => 0 };
  b.api = { broadcast() {} };
  b.broadcastSession = () => {}; b.broadcastWorkspaces = () => {}; b.probeGit = () => {};
  b.rig = null; b.rigAmp = { claudeAmp: () => undefined, codexAmp: undefined };
  let n = 0;
  b.adapter = {
    connected: true,
    agentKinds: async () => [{ kind: 'claude', installed: true }, { kind: 'codex', installed: true }, { kind: 'opencode', installed: true }],
    createWorkspace: async () => { n++; return { paneId: `w${n}:p1`, workspaceId: `w${n}` }; },
    refreshSubscription: async () => {}, waitShellReady: async () => true,
    startAgent: async (o) => ({ agent: null, argv: [o.kind, ...o.args] }),
    sendText: async () => {}, paneKeys: async () => {},
  };
  b.startHarness = async (s) => ({ agent: null, argv: [s.kind, ...((s.harnessPlan && s.harnessPlan.args) || [])] });
  return { b, cwd: dir, stop: () => b.store.close() };
}

test('P208 띄우기 길(backend spawn): Codex 런처 인자의 model_reasoning_effort를 명시한 --effort가 이긴다. 받지 않는 종류는 effort.ignored, 잘못된 값은 띄우기 전에 거절', async () => {
  const x = spawnBackend();
  try {
    const def = { name: 'cx', harness: 'codex', model: 'gpt-x', args: '--approve-for-me -c model_reasoning_effort="high"', env: {} };
    const r = await x.b.spawn({ cwd: x.cwd, name: 'c1', launcherDef: def, effort: 'medium' });
    const s = x.b.sessions.get(r.sessionId);
    assert.deepEqual(s.harnessPlan.args, ['--approve-for-me', '-c', 'model_reasoning_effort="medium"']);
    assert.deepEqual(r.effort, { value: 'medium', applied: true, ignored: false });
    // --effort를 주지 않으면 호출자 인자 그대로
    const r0 = await x.b.spawn({ cwd: x.cwd, name: 'c0', launcherDef: def });
    assert.deepEqual(x.b.sessions.get(r0.sessionId).harnessPlan.args, ['--approve-for-me', '-c', 'model_reasoning_effort=high'], '호출자 인자(splitArgs가 따옴표를 푼다)');
    assert.equal(r0.effort, undefined);
    // 호출자 없이(종류만): 같은 길
    const r2 = await x.b.spawn({ cwd: x.cwd, name: 'c2', kind: 'codex', effort: 'xhigh' });
    assert.deepEqual(x.b.sessions.get(r2.sessionId).harnessPlan.args, ['-c', 'model_reasoning_effort="xhigh"']);
    const op = await x.b.spawn({ cwd: x.cwd, name: 'o1', kind: 'opencode', effort: 'low' });
    assert.deepEqual(op.effort, { value: 'low', applied: false, ignored: true });
    assert.deepEqual(x.b.sessions.get(op.sessionId).harnessPlan.args, []);
    const before = x.b.sessions.size;
    await assert.rejects(x.b.spawn({ cwd: x.cwd, name: 'c3', kind: 'codex', effort: 'turbo' }), (e) => e.code === 'bad_request');
    assert.equal(x.b.sessions.size, before, '띄우지 않았다');
  } finally { x.stop(); }
});

// atrium child(Branch.spawnChild): 가짜 판(p180 틀을 줄임)
async function board() {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p208test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 't', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), spawned: [],
    api: { broadcast: () => {} }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '' },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { state: d.state, ask: d.ask || null, error: d.error || null }; },
    ensureLink(from, to, patch = {}) { let l = store.linkByPair(from, to); if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: !!patch.spawned, observed: false, createdAt: Date.now() }; store.insertLink(l); } return store.getLink(l.linkId); },
    linkEvent(l, kind, text = null, data = null) { return store.addLinkEvent(l.linkId, kind, text, data); },
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    async spawn(p) { const s = add(p.name, { kind: p.kind || (p.launcherDef && p.launcherDef.harness) || 'claude', parentSessionId: p.parentSessionId || null }); if (p.branch) b.branch.noteChild(s.sessionId, p.branch); b.spawned.push(p); return { sessionId: s.sessionId, trust: { needsTrust: false } }; },
    closeSession(s) { b.sessions.delete(s.sessionId); },
  };
  b.queue = new DeliveryQueue({ store, cfg, view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: true, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; }, send: async () => {} });
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20 });
  const add = (name, { kind = 'claude', ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, paneId: `${name}:p1`, agentName: name, permissionMode: 'manual', kind, origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind, hooked: kind === 'claude' }), createdAt: Date.now(), ...extra };
    s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle');
    store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
    b.sessions.set(s.sessionId, s);
    return s;
  };
  return { b, add, stop: async () => { b.queue.stop(); b.branch.notices.stop(); await sleep(50); store.close(); } };
}

test('P208 atrium child --kind codex --effort: 띄우기 길에 effort를 넘기고 응답에 옮긴 인자를 보인다. 받지 않는 종류는 "무시했다" 줄, 잘못된 값은 띄우지 않는다', async () => {
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    const r = await b.branch.spawnChild(lead, { name: 'rv', kind: 'codex', effort: 'medium', wait: false });
    assert.equal(b.spawned[0].effort, 'medium');
    assert.ok(r.harness.argv.includes('model_reasoning_effort="medium"'), JSON.stringify(r.harness.argv));
    assert.equal(r.harness.effort, 'medium'); assert.equal(r.effort, 'medium'); assert.equal(r.effortNote, null);
    const o = await b.branch.spawnChild(lead, { name: 'op', kind: 'opencode', effort: 'low', wait: false });
    assert.equal(b.spawned[1].effort, undefined, '받지 않는 종류에는 넘기지 않는다');
    assert.match(o.effortNote, /--effort low는 무시했다: opencode는 노력 수준을 받지 않는다/);
    const n = b.spawned.length;
    await assert.rejects(b.branch.spawnChild(lead, { name: 'bad', kind: 'codex', effort: 'turbo', wait: false }), (e) => e.code === 'bad_request');
    assert.equal(b.spawned.length, n);
  } finally { await stop(); }
});

// ---------- 3. Codex 신뢰 질문 ----------
test('P208 Codex 신뢰 화면: 실제 화면 글을 알아보고, 다른 종류의 질문·입력 칸과 섞지 않는다', () => {
  assert.equal(isCodexTrustDialog(CODEX_TRUST), true);
  assert.equal(trustDialogOf('codex', CODEX_TRUST), true);
  assert.equal(trustDialogOf('claude', CODEX_TRUST), false);
  assert.equal(isTrustDialog(CODEX_TRUST), false);
  assert.equal(isCodexTrustDialog('  Trust this folder? Codex can read'), false, '선택지까지 보여야');
  assert.equal(isCodexTrustDialog('› Ask Codex to do anything\n  ? for shortcuts'), false);
  assert.equal(trustDialogOf('opencode', CODEX_TRUST), false);
  // 판 상태: hook 없는 codex + 막힘 + 화면 확인 → trust_wait(응답 필요). 화면을 보기 전에는 waiting
  const rt = newRuntime({ kind: 'codex', hooked: false });
  rt.term.status = 'blocked';
  assert.equal(deriveState(rt).state, 'waiting');
  rt.trustScreen = { at: 1 };
  assert.deepEqual(deriveState(rt), { state: 'trust_wait', confirmedByScreen: true });
  assert.equal(trustStatusOf('codex'), CODEX_TRUST_STATUS); assert.equal(trustStatusOf('claude'), TRUST_STATUS);
  assert.equal(CODEX_TRUST_STATUS.app, 'codex'); assert.equal(CODEX_TRUST_STATUS.synthetic, true);
});

test('P208 신뢰(hc, Codex): 상태를 말하기 전 화면의 신뢰 질문 → 막힘을 흉내(앱 codex, kind trust), 글은 거부. 사람이 신뢰해 Codex가 idle을 말하면 풀린다(에이전트가 떠나지 않는다)', async () => {
  const fake = await startFakeHc();
  let hold = true;
  fake.silent = (t) => t.argv[0] === 'codex' && hold;
  fake.screenOf = (t) => (t.argv[0] === 'codex' ? CODEX_TRUST : null);
  const a = new HcAdapter({ session: 'p208-unit', dataDir: null, pipe: fake.pipe, env: {}, moveWaitMs: 500, trustPollMs: 30 });
  const ev = [];
  a.on('event', (e) => ev.push(e));
  try {
    a.startEvents();
    await until(() => a.connected);
    const ws = await a.createWorkspace({ cwd: 'C:/w' });
    const r = await a.startAgent({ name: 'rv', paneId: ws.paneId, kind: 'codex', args: ['-c', 'model_reasoning_effort="medium"'] });
    const addr = r.agent ? r.agent.paneId : r.paneId || ws.paneId;
    const st = await until(() => ev.find((e) => e.type === 'status' && e.status === 'blocked'));
    assert.equal(st.detail.kind, 'trust');
    assert.ok(ev.find((e) => e.type === 'agent_detected' && e.agent === 'codex'));
    const p = st.paneId || addr;
    assert.equal((await a.getPane(p)).status, 'blocked');
    await assert.rejects(a.prompt('rv', 'hello'), (e) => e.code === 'agent_blocked');
    hold = false;
    fake.setStatus(p, { app: 'codex', state: 'idle' });
    await until(() => ev.find((e) => e.type === 'status' && e.paneId === p && e.status === 'idle'));
    assert.equal(ev.some((e) => e.type === 'agent_released'), false);
  } finally { a.stopEvents(); await fake.close(); }
});

// ---------- 일 머리 ----------
test('P208 일 머리: Codex가 받는 일은 둘째 줄 끝에 --file 안내(세 줄 그대로). Claude Code는 그대로', () => {
  const c = unitHeader({ parent: 'lead', unitId: 'u1', kind: 'codex' });
  assert.equal(c.split('\n').length, 3);
  assert.ok(c.split('\n')[1].endsWith(PS_DONE_TAIL));
  assert.match(PS_DONE_TAIL, /atrium done ok --file <경로>/);
  assert.equal(unitHeader({ parent: 'lead', unitId: 'u1', kind: 'claude' }), unitHeader({ parent: 'lead', unitId: 'u1' }));
  assert.ok(!unitHeader({ parent: 'lead', unitId: 'u1' }).includes(PS_DONE_TAIL));
});
