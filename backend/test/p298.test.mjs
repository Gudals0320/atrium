// P298 단위 시험: Hermes(+OMH) 하네스. 어댑터 build(처음·이어 가기·모델·reserved), 세션별 atrium 감싸개(sh·cmd·ps1, 공백·따옴표 경로, 지우기),
// 화면 상태(hermesStateOf: P297 원자료의 ready·일함 줄, 승인·질문·확인 창), 입력 칸·붙여 넣기 확인, 임시 SQLite(state.db 꼴)로 세션 찾기·마지막 답·바쁨,
// 오케스트레이션 기본값(P296과의 합: 하위·독립 권한), 하위가 도는 동안 마지막 답 보고를 미룸, hc 모델의 화면 상태 들고 있기. Hermes와 hc 없이 돈다.
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
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { ADAPTERS, adapterOf, harnessLaunch, reservedArg, resumable, wrapperFiles, wrapperDirOf, removeWrapperDir, writeLaunchFiles } from '../src/harness.mjs';
import { hermesStateOf, hermesInputBox, hermesPasteState, promptOnScreen } from '../src/screen.mjs';
import { hermesHomeOf, hermesSessionOf, hermesLastAnswer, hermesUsageOf, hermesBusyOf, messageText } from '../src/hermes.mjs';
import { orchOf, permOf, ORCH_DEFAULTS, orchPromptLines } from '../src/orchestration.mjs';
import { registerInnerReader, readerSignals } from '../src/inner-work.mjs';
import { Sleeper } from '../src/sleep.mjs';
import { KIND_COMMAND, HcModel, isScreenStatus, LABEL } from '../src/hc/model.mjs';
import { HARNESSES, describeHarnesses } from '../src/launchers.mjs';
import { FALLBACK_MARK } from '../src/work-units.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p298-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p298test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
    // 상태가 바뀌면 판처럼 bus로 알린다(Branch.onSession → WorkUnits.onSession)
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    async spawn(p) {
      const s = add(p.name, { parentSessionId: p.parentSessionId || null });
      if (p.branch) b.branch.noteChild(s.sessionId, p.branch);
      b.spawned.push(p);
      return { sessionId: s.sessionId, trust: { needsTrust: false } };
    },
    closeSession(s, reason) { b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
  };
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    send: async (sid, text) => { if (b.stopped) return; b.sent.push({ sid, text }); const s = b.sessions.get(sid); if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.start();
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 } });
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
  // 가짜 에이전트: 글을 받으면 일하고(workMs) 쉰다. onText(text, s)는 일하는 중에 부른다(done을 치는 워커 등)
  const add = (name, { kind = 'claude', hooked = kind === 'claude', workMs = 80, onText = null, ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, paneId: `${name}:p1`, agentName: name, permissionMode: 'manual', kind, origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind, hooked }), createdAt: Date.now(), ...extra };
    idle(s);
    store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
    b.sessions.set(s.sessionId, s);
    s.texts = [];
    s.agent = (text) => {
      s.texts.push(text);
      if (hooked) { applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: text }); b.queue.onUserPromptSubmit(s.sessionId, text); applyTermStatus(s.rt, 'working'); }
      else { applyTermStatus(s.rt, 'working'); b.queue.onAgentWorking(s.sessionId); }
      b.broadcastSession(s);
      const h = s.onText || onText;
      setTimeout(async () => {
        if (b.stopped) return;
        if (h) try { await h(text, s); } catch (e) { s.err = e; }
        if (b.stopped) return;
        if (hooked) applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: `답: ${text.slice(-20)}` });
        applyTermStatus(s.rt, 'idle');
        b.broadcastSession(s);
      }, workMs);
    };
    b.broadcastSession(s);
    return s;
  };
  const busy = (s) => { applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: '사람의 일' }); applyTermStatus(s.rt, 'working'); b.broadcastSession(s); };
  const rest = (s) => { applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: '끝' }); applyTermStatus(s.rt, 'idle'); b.broadcastSession(s); };
  return { b, dir, ws, add, busy, rest, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); await tick(400); store.close(); } };
}
function idle(s) { s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle'); }
const U = (b) => b.branch.units;
const units = (b) => b.store.db.prepare('SELECT * FROM work_units').all();
const tries = (b) => b.store.db.prepare('SELECT * FROM unit_tries').all();
const toParent = (b, p) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ?').all(p.sessionId);
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


const ev = (b, s, kind) => b.store.db.prepare('SELECT * FROM events WHERE session_id = ? AND kind = ? ORDER BY id').all(s.sessionId, kind);
const delivs = (b, s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(s.sessionId);
function subOf(b, add, parent, name, extra = {}) {
  const w = add(name, { parentSessionId: parent.sessionId, ...extra });
  b.store.updateSession(w.sessionId, { parentSessionId: parent.sessionId });
  b.branch.noteChild(w.sessionId, { role: '워커', depth: 2, by: parent.sessionId, at: Date.now(), kind: w.kind });
  return w;
}

// ---------- 어댑터 ----------
test('P298 어댑터: --tui 고정, 이어 가기 --resume, 모델 -m, 안내문 env, reserved, 배운 세션 ID', () => {
  const a = adapterOf('hermes');
  assert.equal(a, ADAPTERS.hermes); assert.equal(a.command, 'hermes'); assert.equal(a.sessionIdFrom, 'learned'); assert.ok(resumable('hermes')); assert.equal(a.pathWrapper, true);
  const first = harnessLaunch({ kind: 'hermes', sessionId: 's1', model: 'gpt-x', launcherArgs: ['--yolo'], instructions: { file: 'f', text: '안내 한 줄' }, boardEnv: { ATRIUM_PORT: '1' } });
  assert.deepEqual(first.command, ['hermes']);
  assert.deepEqual(first.args, ['--tui', '-m', 'gpt-x', '--yolo']);
  assert.equal(first.env.HERMES_EPHEMERAL_SYSTEM_PROMPT, '안내 한 줄'); assert.equal(first.env.ATRIUM_PORT, '1');
  assert.equal(first.resumed, false); assert.equal(first.harnessSessionId, null);
  const again = harnessLaunch({ kind: 'hermes', sessionId: 's1', resume: true, harnessSessionId: 'local-abc', instructions: { file: 'f', text: 'x' } });
  assert.deepEqual(again.args, ['--tui', '--resume', 'local-abc']); assert.equal(again.resumed, true); assert.equal(again.env.HERMES_EPHEMERAL_SYSTEM_PROMPT, 'x', '이어 갈 때도 안내문을 다시 준다');
  const noId = harnessLaunch({ kind: 'hermes', sessionId: 's1', resume: true });
  assert.deepEqual(noId.args, ['--tui'], 'ID를 모르면 새로 띄운다');
  for (const w of ['--resume', '-c', '--continue', '--tui', '--cli', '--ignore-rules', '--safe-mode', 'gateway', 'sessions', '-z']) assert.equal(reservedArg('hermes', [w]), w, w);
  assert.equal(reservedArg('hermes', ['--yolo', '--reasoning', 'high']), null);
  assert.equal(KIND_COMMAND.hermes, 'hermes');
  assert.equal(HARNESSES.hermes.kind, 'hermes'); assert.ok(HARNESSES.hermes.fields.includes('model'));
  assert.equal(describeHarnesses().find((h) => h.id === 'hermes').orchDefault, true);
});

test('P298 세션별 atrium 감싸개: sh·cmd·ps1, 판 env를 담고 atrium-child를 부른다, 공백·따옴표 경로, PATH 맨 앞, 지우기', () => {
  const dir = tmp();
  const filesDir = path.join(dir, 'har ness');
  const env = { ATRIUM_PORT: '48048', ATRIUM_DATA_DIR: "C:/a b/it's 100%", ATRIUM_SESSION_ID: 'sid-1', 'BAD-NAME': 'x' };
  const node = 'C:/Program Files/nodejs/node.exe', script = 'C:/x y/bin/lib/bin/atrium-child.mjs';
  const l = harnessLaunch({ kind: 'hermes', sessionId: 'sid-1', boardEnv: env, binDir: 'C:/d/bin', filesDir, wrapper: { node, script } });
  const wdir = wrapperDirOf(filesDir, 'hermes', 'sid-1');
  assert.deepEqual(l.pathFirst, [wdir, 'C:/d/bin'], '감싸개 폴더가 판 bin/보다 앞');
  const names = l.files.map((f) => path.basename(f.file)).sort();
  assert.deepEqual(names, ['atrium', 'atrium.cmd', 'atrium.ps1', 'mtask', 'mtask.cmd', 'mtask.ps1']);
  const by = Object.fromEntries(l.files.map((f) => [path.basename(f.file), f.text]));
  assert.match(by.atrium, /^#!\/bin\/sh\n/); assert.match(by.atrium, /export ATRIUM_DATA_DIR='C:\/a b\/it'\\''s 100%'/); assert.match(by.atrium, /exec 'C:\/Program Files\/nodejs\/node.exe' 'C:\/x y\/bin\/lib\/bin\/atrium-child.mjs' "\$@"/);
  assert.match(by['atrium.cmd'], /set "ATRIUM_DATA_DIR=C:\/a b\/it's 100%%"/); assert.match(by['atrium.cmd'], /"C:\/Program Files\/nodejs\/node.exe" "C:\/x y\/bin\/lib\/bin\/atrium-child.mjs" %\*/);
  assert.match(by['atrium.ps1'], /\$env:ATRIUM_DATA_DIR = 'C:\/a b\/it''s 100%'/); assert.match(by['atrium.ps1'], /& 'C:\/Program Files\/nodejs\/node.exe' 'C:\/x y\/bin\/lib\/bin\/atrium-child.mjs' @args/);
  for (const t of Object.values(by)) { assert.doesNotMatch(t, /BAD-NAME/); assert.doesNotMatch(t, /TOKEN/); }
  // 감싸개가 없는 종류(codex)는 그대로
  const c = harnessLaunch({ kind: 'codex', sessionId: 'sid-1', binDir: 'C:/d/bin', filesDir, wrapper: { node, script } });
  assert.deepEqual(c.pathFirst, ['C:/d/bin']); assert.equal(c.files.length, 0);
  // 쓰고 지우기
  writeLaunchFiles(l.files);
  assert.ok(fs.existsSync(path.join(wdir, 'atrium.cmd')));
  assert.equal(removeWrapperDir(filesDir, 'codex', 'sid-1'), false);
  assert.equal(removeWrapperDir(filesDir, 'hermes', 'sid-1'), true);
  assert.ok(!fs.existsSync(wdir));
  assert.match(wrapperDirOf(filesDir, 'hermes', '../../x'), /bin-x$/, '세션 ID의 경로 글자는 뺀다');
});

test('P298 감싸개가 판에 닿는다: 감싸개(Windows는 .cmd, 그 밖은 sh)로 부른 atrium이 판 env 없이도 그 세션으로 인증된다', { skip: process.platform !== 'win32' && !fs.existsSync('/bin/sh') }, async () => {
  const { b, add, stop } = await board();
  const srv = await serve(b);
  try {
    const s = add('hm', { kind: 'hermes', hooked: false });
    fs.mkdirSync(b.cfg.sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(b.cfg.sessionsDir, `${s.sessionId}.token`), b.branch.token(s.sessionId));
    const files = wrapperFiles({ dir: path.join(b.cfg.dataDir, 'harness', 'hermes', 'bin-t'), env: { ATRIUM_PORT: String(b.cfg.port), ATRIUM_DATA_DIR: b.cfg.dataDir, ATRIUM_SESSION_ID: s.sessionId, ATRIUM_TERMINAL_SESSION: b.cfg.terminalSession, ATRIUM_PROFILE: 'dev' }, node: process.execPath, script: path.join(HERE, '..', 'bin', 'atrium-child.mjs') });
    writeLaunchFiles(files);
    const cmd = files.find((f) => path.basename(f.file) === 'atrium.cmd').file;
    const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MTASK_|ATRIUM_|HERDR_|HC_)/.test(k)));
    const r = await new Promise((resolve) => execFile(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', process.platform === 'win32' ? ['/d', '/c', cmd, 'me'] : [files.find((f) => path.basename(f.file) === 'atrium').file, 'me'], { env: clean, timeout: 30000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
    assert.equal(r.code, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /@hm/);
  } finally { srv.close(); await stop(); }
});

// ---------- 화면 ----------
// P297 원자료(p297-busy-samples.txt)의 상태 줄
const SAMPLES = {
  ready: ' ─ ready │ gpt 6.1 sol │ 23.8k/500k │ [█░░░░░░░░░] 5% │ 49s │ ✓ 2s │ ◎ 98% │ ◷ 3.3s │ ↑ 17 ',
  ready0: ' ─ ready │ gpt 6.1 sol │ 22s │ voice off │ 2 sessions                                         ─ C:\\Workspace\\mtask-x',
  working: [
    ' ─ (´･_･`) reflecting…    · 2s │ gpt 6.1 sol │ 28s │ voice off │ 3 sessions                ',
    ' ─ (°ロ°) reasoning…     · 5s │ gpt 6.1 sol │ 19.8k/500k │ [░░░░░░░░░░] 4% │ 31s │ ◎ 20% │ ◷',
    ' ─ ( ˘⌣˘)♡ analyzing…     · 8s │ gpt 6.1 sol │ 19.8k/500k │ [░░░░░░░░░░] 4% │ 34s │ ◎ 20% │',
    ' ─ ヽ(>∀<☆)☆ computing…     · 11s │ gpt 6.1 sol │ 22.6k/500k │ [█░░░░░░░░░] 5 │ 37 │ ◎ 56% │',
    ' ─ ( •_•)>⌐■-■ ruminating…    · 4s │ gpt 6.1 sol │ 23.1k/500k │ [█░░░░░░░░░] 5% │ 43s │ ◎ 7',
    ' ─ (⌐■_■) deliberating…  · 1m 7s │ gpt 6.1 sol │ 23.6k/500k │',
  ],
};
const screen = (status, input = ' ❯ Try "explain this codebase"', above = []) => [' ╭───╮', ' │  Session: 5da569c1  │', ' ╰───╯', '', ...above, '', status, input].join('\n');

test('P298 화면 상태(hermesStateOf): ready → idle, 일함 → working, 창 → blocked, 그 밖 null', () => {
  assert.equal(hermesStateOf(screen(SAMPLES.ready)), 'idle');
  assert.equal(hermesStateOf(screen(SAMPLES.ready0)), 'idle');
  for (const w of SAMPLES.working) assert.equal(hermesStateOf(screen(w, ' ❯ ')), 'working', w);
  assert.equal(hermesStateOf('PS C:\\x> hermes --tui'), null, '아직 그려지지 않음');
  assert.equal(hermesStateOf(''), null);
  // 승인 창(⚠ approval required + 선택지), 질문(clarify) 힌트, 확인 창
  const approval = screen(SAMPLES.working[0], ' ❯ ', ['⚠ approval required', '  git reset --hard HEAD', '  ❯ Allow once', '    Allow this session', '    Always allow', '    Deny']);
  assert.equal(hermesStateOf(approval), 'blocked');
  assert.equal(hermesStateOf(screen(SAMPLES.ready, ' ❯ ', ['  Which file?', '  1. a.txt', '  2. b.txt', '  ↑/↓ select · Enter confirm · Esc/Ctrl+C cancel'])), 'blocked');
  assert.equal(hermesStateOf(screen(SAMPLES.ready, ' ❯ ', ['  Overwrite file?  Y/N quick'])), 'blocked');
  // 대화 위쪽 멀리(상태 줄에서 18줄 넘게 위) 사람 글에 낱말이 있어도 막힘이 아니다
  const far = screen(SAMPLES.ready, undefined, ['❯ what does "⚠ approval required" mean?', ...Array.from({ length: 25 }, (_, i) => `  line ${i}`)]);
  assert.equal(hermesStateOf(far), 'idle');
});

test('P298 입력 칸·붙여 넣기 확인·제출 확인', () => {
  assert.deepEqual(hermesInputBox(screen(SAMPLES.ready)).text, '', '흐린 안내는 빈 칸');
  assert.equal(hermesInputBox(screen(SAMPLES.ready, ' ❯ Try "/help" for commands')).text, '');
  const two = screen(SAMPLES.ready, ' ❯ line one\n   line two');
  assert.equal(hermesInputBox(two).text, 'line one line two'); assert.equal(hermesInputBox(two).rows, 2);
  // 대화의 사용자 줄(상태 줄 위 ❯)은 입력 칸이 아니다
  assert.equal(hermesInputBox(screen(SAMPLES.ready, ' ❯ ', ['❯ earlier prompt'])).text, '');
  assert.equal(hermesInputBox('no status').found, false);
  assert.deepEqual(hermesPasteState(two, 'line one\nline two'), { box: 'line one line two', done: true });
  assert.equal(hermesPasteState(screen(SAMPLES.ready, ' ❯ line one'), 'line one\nline two').done, false, '아직 다 들어가지 않음');
  assert.equal(hermesPasteState(screen(SAMPLES.ready), 'x').done, false);
  const long = 'x'.repeat(300) + ' END';
  assert.equal(hermesPasteState(screen(SAMPLES.ready, ` ❯ ${'x'.repeat(190)}\n   ${'x'.repeat(110)} END`), long).done, true, '꺾인 긴 글');
  assert.equal(promptOnScreen(two, 'line one\nline two', 'hermes').box, 'ours');
  assert.equal(promptOnScreen(screen(SAMPLES.working[1], ' ❯ ', ['❯ line one', '  line two']), 'line one\nline two', 'hermes').box, 'empty');
  assert.equal(promptOnScreen(screen(SAMPLES.working[1], ' ❯ ', ['❯ line one', '  line two']), 'line one\nline two', 'hermes').seen, true);
});

// ---------- state.db(임시 SQLite) ----------
function fakeHermes({ schema = 'ok' } = {}) {
  const home = tmp();
  const db = new DatabaseSync(path.join(home, 'state.db'));
  db.exec('PRAGMA journal_mode = WAL');
  if (schema === 'ok') {
    db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, created_source TEXT, model TEXT, parent_session_id TEXT, started_at REAL NOT NULL, cwd TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cache_read_tokens INTEGER DEFAULT 0, reasoning_tokens INTEGER DEFAULT 0, api_call_count INTEGER DEFAULT 0);
      CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT, tool_calls TEXT, timestamp REAL NOT NULL, finish_reason TEXT);
      CREATE TABLE async_delegations (delegation_id TEXT PRIMARY KEY, origin_session TEXT NOT NULL, parent_session_id TEXT, state TEXT NOT NULL, dispatched_at REAL NOT NULL, completed_at REAL, updated_at REAL NOT NULL, delivery_state TEXT NOT NULL DEFAULT 'pending');
      CREATE TABLE session_turn_leases (conversation_id TEXT PRIMARY KEY, holder TEXT NOT NULL, acquired_at REAL NOT NULL, expires_at REAL NOT NULL);`);
  } else db.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, other TEXT)');
  return { home, db };
}

test('P298 state.db: 세션 찾기(그 폴더·띄운 뒤·맨 위 tui, 다른 판 세션 빼기), 마지막 답, 모델·토큰', () => {
  const { home, db } = fakeHermes();
  const t0 = Date.now();
  const s = (id, cwd, at, extra = {}) => db.prepare('INSERT INTO sessions (id, source, created_source, model, parent_session_id, started_at, cwd, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, extra.source || 'tui', extra.created || 'tui', extra.model || 'gpt-x', extra.parent || null, at / 1000, cwd, 120, 7);
  s('local-old', 'C:\\W\\a', t0 - 3600e3);
  s('local-other', 'C:\\W\\b', t0 + 1000);
  s('20261121_sub', 'C:\\W\\a', t0 + 1500, { source: 'subagent', created: 'subagent', parent: 'local-mine' });
  s('local-mine', 'C:\\W\\a', t0 + 2000);
  s('local-later', 'C:\\W\\a', t0 + 9000);
  assert.equal(hermesSessionOf({ cwd: 'C:/W/a/', since: t0, home }), 'local-mine');
  assert.equal(hermesSessionOf({ cwd: 'c:\\w\\A', since: t0, home, exclude: ['local-mine'] }), 'local-later');
  assert.equal(hermesSessionOf({ cwd: 'C:/W/zz', since: t0, home }), null);
  const m = (sid, role, content, at, tool = null) => db.prepare('INSERT INTO messages (session_id, role, content, tool_calls, timestamp) VALUES (?, ?, ?, ?, ?)').run(sid, role, content, tool, at / 1000);
  m('local-mine', 'user', 'hi', t0 + 3000);
  m('local-mine', 'assistant', 'PONG', t0 + 4000);
  m('local-mine', 'user', '[ASYNC DELEGATION BATCH COMPLETE — deleg_1]', t0 + 5000);
  m('local-mine', 'assistant', '', t0 + 5500, '[{"id":"c1"}]');
  m('local-mine', 'assistant', JSON.stringify([{ type: 'text', text: '하위 결과: ' }, { type: 'text', text: 'READY' }]), t0 + 6000);
  m('local-mine', 'assistant', null, t0 + 6500, '[{"id":"c2"}]');
  const a = hermesLastAnswer({ id: 'local-mine', home });
  assert.equal(a.text, '하위 결과: READY'); assert.ok(Math.abs(a.at - (t0 + 6000)) < 5);
  assert.equal(hermesLastAnswer({ id: 'local-other', home }), null);
  assert.equal(messageText('  plain  '), 'plain');
  assert.deepEqual(hermesUsageOf({ id: 'local-mine', home }), { model: 'gpt-x', input: 120, output: 7, cacheRead: 0, reasoning: 0, apiCalls: 0 });
  db.close();
});

test('P298 state.db 바쁨: 도는 하위, 결과를 아직 넘기지 않음, 턴 임대, 오래된 줄, 다른 세션', () => {
  const { home, db } = fakeHermes();
  const now = Date.now();
  const d = (id, parent, state, delivery, at = now - 5000) => db.prepare('INSERT INTO async_delegations (delegation_id, origin_session, parent_session_id, state, dispatched_at, updated_at, delivery_state) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'agent:main:x', parent, state, at / 1000, at / 1000, delivery);
  assert.deepEqual(hermesBusyOf({ id: 'local-a', home, now }), { busy: false, running: 0, undelivered: 0, lease: false });
  d('d1', 'local-a', 'running', 'pending');
  assert.equal(hermesBusyOf({ id: 'local-a', home, now }).running, 1);
  assert.equal(hermesBusyOf({ id: 'local-b', home, now }).busy, false, '다른 세션의 하위는 세지 않는다');
  db.prepare("UPDATE async_delegations SET state = 'completed' WHERE delegation_id = 'd1'").run();
  assert.deepEqual(hermesBusyOf({ id: 'local-a', home, now }), { busy: true, running: 0, undelivered: 1, lease: false }, '끝났지만 결과를 아직 넘기지 않았다(곧 새 턴이 들어온다)');
  db.prepare("UPDATE async_delegations SET delivery_state = 'delivered' WHERE delegation_id = 'd1'").run();
  assert.equal(hermesBusyOf({ id: 'local-a', home, now }).busy, false);
  d('d0', 'local-a', 'running', 'pending', now - 7 * 3600e3);
  assert.equal(hermesBusyOf({ id: 'local-a', home, now }).busy, false, '6시간 넘은 줄은 버려진 것');
  db.prepare('INSERT INTO session_turn_leases VALUES (?, ?, ?, ?)').run('local-a', 'gw', now / 1000 - 1, now / 1000 + 30);
  assert.deepEqual(hermesBusyOf({ id: 'local-a', home, now }), { busy: true, running: 0, undelivered: 0, lease: true });
  assert.equal(hermesBusyOf({ id: 'local-a', home, now: now + 60000 }).lease, false, '임대가 끝났다');
  assert.equal(hermesBusyOf({ id: null, home }), null);
  db.close();
});

test('P298 state.db가 없거나 스키마가 다르면 조용히 null', () => {
  assert.equal(hermesSessionOf({ cwd: 'C:/x', home: path.join(tmp(), 'none') }), null);
  const { home, db } = fakeHermes({ schema: 'other' });
  assert.equal(hermesSessionOf({ cwd: 'C:/x', home }), null);
  assert.equal(hermesLastAnswer({ id: 'x', home }), null);
  assert.equal(hermesBusyOf({ id: 'x', home }), null);
  assert.equal(hermesUsageOf({ id: 'x', home }), null);
  db.close();
  assert.equal(hermesHomeOf({ ATRIUM_HERMES_HOME: home }), path.resolve(home));
  assert.equal(hermesHomeOf({ HERMES_HOME: 'C:/h' }, { profile: 'work' }), path.join(path.resolve('C:/h'), 'profiles', 'work'));
  if (process.platform === 'win32') assert.equal(hermesHomeOf({ LOCALAPPDATA: 'C:\\L' }), path.join('C:\\L', 'hermes'));
});

// ---------- P296과의 합 ----------
test('P298 오케스트레이션 기본값과 권한: hermes는 자체 오케스트레이션, 마지막 답 물러섬, 읽개 바쁨. 하위는 부모하고만, 독립은 child 없음', () => {
  const o = orchOf('hermes', null);
  assert.deepEqual(o, { on: true, via: 'kind', reportFallback: 'last_answer', busy: [{ reader: 'hermes' }] });
  assert.equal(ORCH_DEFAULTS.hermes.orchestrates, true);
  assert.equal(orchOf('hermes', { reportFallback: 'none' }).reportFallback, null, '런처가 none이면 끈다');
  assert.equal(describeHarnesses().find((h) => h.id === 'hermes').fallbackDefault, 'last_answer');
  const verbs = ['help', 'child', 'child-kill', 'prompt', 'done', 'item', 'me', 'usage', 'ask', 'todo', 'read'];
  const sub = permOf({ orch: o, relation: 'sub', parentId: 'p', verbs });
  assert.equal(sub.scope, 'sub'); assert.ok(!sub.allowed.includes('child')); assert.ok(sub.allowed.includes('done'));
  const free = permOf({ orch: o, relation: 'none', verbs });
  assert.equal(free.scope, 'free'); assert.ok(!free.allowed.includes('child')); assert.ok(free.allowed.includes('ask'));
  // 안내문 머리는 하네스 안 위임을 허락한다(P297: 보통 안내문은 delegate_task를 막았다). 한 줄로 이어 env에 싣는다
  const line = orchPromptLines('sub').join(' ');
  assert.match(line, /위임/); assert.doesNotMatch(line, /[\n"]/);
});

test('P298 바쁨 읽개: 지금 바쁜가(innerBusyNow)는 잰 값이 없어도 읽개를 곧바로 부른다', () => {
  let busy = false;
  const off = registerInnerReader('p298t', () => ({ busy }));
  try {
    const sl = Object.create(Sleeper.prototype); sl.inner = new Map();
    const s = { sessionId: 'x', orch: { on: true, busy: [{ reader: 'p298t' }] }, rt: {} };
    assert.equal(sl.innerBusyNow(s), false);
    busy = true;
    assert.equal(sl.innerBusyNow(s), true);
    assert.equal(sl.innerBusyNow({ ...s, orch: { on: true, busy: ['cpu'] } }), false, '읽개가 없으면 잰 값만');
    assert.equal(sl.innerBusyNow({ ...s, orch: null }), false);
    assert.deepEqual(readerSignals([{ reader: 'p298t' }], {}), [{ reader: 'p298t', busy: true }]);
  } finally { off(); }
});

test('P298 하위 에이전트가 도는 동안은 마지막 답으로 닫지 않고, 조용해지면 닫는다(멈춤 알림 없음)', async () => {
  const { b, add, stop } = await board();
  try {
    b.branch.units.fallbackMs = 600;
    let busy = true;
    b.sleeper = { innerBusy: () => false, innerBusyNow: () => busy };
    const lead = add('lead');
    const w = subOf(b, add, lead, 'hm1', { kind: 'hermes', hooked: false, orch: orchOf('hermes', null) });
    w.onText = async (text, s) => { s.rt.lastAnswer = 'p298 결과: 하위가 PONG'; s.rt.lastAnswerAt = Date.now(); };
    await b.branch.dispatch('prompt', lead, { name: 'hm1', text: 'p298 일을 해라' });
    await until(() => ev(b, w, 'unit_stop_quiet').length === 1, 5000);
    assert.equal(JSON.parse(ev(b, w, 'unit_stop_quiet')[0].data).because, 'inner_work');
    await tick(900);
    assert.equal(b.store.db.prepare("SELECT * FROM work_units WHERE status = 'done'").all().length, 0, '하위가 도는 동안은 닫지 않는다');
    busy = false;
    assert.equal(b.branch.units.stops.onInnerQuiet(w), 'fallback');
    await until(() => b.store.db.prepare("SELECT * FROM work_units WHERE status = 'done'").all().length === 1, 5000);
    const tr = b.store.db.prepare('SELECT * FROM unit_tries').all()[0];
    assert.equal(tr.result, 'ok'); assert.ok(tr.done_text.startsWith(FALLBACK_MARK)); assert.match(tr.done_text, /PONG/);
    assert.ok(!delivs(b, lead).some((d) => d.text.includes('맡긴 일이 멈췄다')), '멈춤 알림과 겹치지 않는다');
  } finally { await stop(); }
});

// ---------- hc 모델 ----------
test('P298 hc 모델: 화면 상태(흉내)는 에이전트로 보이고 코어 스냅숏이 상태를 모르면 들고 있는다', () => {
  const m = new HcModel();
  const t = { address: 't1', state: 'live', pid: 5, labels: { [LABEL.agent]: 'hermes', [LABEL.board]: '1' }, status: null, cwd: 'C:/W/a' };
  m.load([t]);
  const evs = m.apply({ type: 'status', terminal: 't1', data: { status: { app: 'hermes', state: 'idle', synthetic: true, screen: true }, reported: false } });
  assert.deepEqual(evs.map((e) => e.type), ['agent_detected', 'status']);
  assert.equal(evs[0].agent, 'hermes'); assert.equal(evs[1].status, 'idle');
  assert.ok(isScreenStatus(m.terms.get('t1').status));
  const w = m.apply({ type: 'status', terminal: 't1', data: { status: { app: 'hermes', state: 'working', synthetic: true, screen: true }, reported: false } });
  assert.deepEqual(w.map((e) => [e.type, e.status]), [['status', 'working']]);
  assert.deepEqual(m.diff([{ ...t }]), [], '코어가 상태를 모르면 흉내를 둔다');
  assert.equal(m.terms.get('t1').status.state, 'working');
  const fin = m.apply({ type: 'finished', terminal: 't1', data: { reason: 'exited', exit_code: 0 } });
  assert.ok(fin.some((e) => e.type === 'agent_released' && e.agent === 'hermes'));
});
