// P182 단위 시험: rig(하네스 정의) 1단계 — 정의 찾기·캐시·잘못된 정의, 사람만 켜기, 훅 실행기, deliver·done 훅, atrium guide, tree_quiet 열.
// 진짜 저장소·전달 대기열(B1)·Branch, 가짜 에이전트(p180·p181 시험의 틀). herdr·hc와 claude 없이 돈다. 훅은 진짜 node 프로세스로 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch, ATRIUM_ALLOW } from '../src/branch.mjs';
import { UnitStops } from '../src/unit-stops.mjs';
import { Rig, rigHandlers, validateRig, RIG_HEADER_LINE, RIG_HEADER_TAIL, GUIDE_MAX } from '../src/rig.mjs';
import { runHook, findExe, cmdLine, parseHookOutput, spawnPlan } from '../src/hook-runner.mjs';
import { Backend } from '../src/backend.mjs';
import { VERB_NAMES, CONTRACT_VERSION } from '../src/cli-contract.mjs';
import { BOARD_SYSTEM_PROMPT } from '../src/launch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(HERE, 'fixtures', 'rig-sample');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p182-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const WIN = process.platform === 'win32';

// 시험 훅(t.mjs): 첫 인자가 하는 일
const T_HOOK = `
const [mode, ...rest] = process.argv.slice(2);
let raw = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const input = raw ? JSON.parse(raw) : {};
  const out = (o) => process.stdout.write(JSON.stringify(o));
  if (mode === 'echo') return out({ action: 'pass', note: JSON.stringify({ argv: rest, at: input.at, from: input.from, session: input.session, text: input.text, rigHash: input.rigHash, unit: input.unit, try: input.try, doneText: input.doneText, result: input.result }) });
  if (mode === 'append') return out({ action: 'pass', append: rest[0] });
  if (mode === 'rewrite') return out({ action: 'rewrite', text: rest[0].replace('{T}', input.text) });
  if (mode === 'reject') return out({ action: 'reject', reason: rest[0] });
  if (mode === 'rejectIf') return out(input.session && input.session.name === rest[0] ? { action: 'reject', reason: 'not for ' + rest[0] } : { action: 'pass' });
  if (mode === 'sleep') return setTimeout(() => out({ action: 'pass' }), 8000);
  if (mode === 'big') return process.stdout.write('x'.repeat(1200000));
  if (mode === 'junk') return process.stdout.write('hello');
  if (mode === 'badaction') return out({ action: 'maybe' });
  if (mode === 'exit') { process.stderr.write('boom'); process.exit(3); }
  if (mode === 'empty') return;
});
`;
function writeRig(root, def, { tHook = true } = {}) {
  fs.mkdirSync(path.join(root, '.atrium', 'hooks'), { recursive: true });
  if (tHook) fs.writeFileSync(path.join(root, '.atrium', 'hooks', 't.mjs'), T_HOOK);
  const f = path.join(root, '.atrium', 'rig.json');
  fs.writeFileSync(f, typeof def === 'string' ? def : JSON.stringify(def, null, 2));
  // 같은 밀리초에 다시 쓰면 수정 시각이 같을 수 있다: 앞으로 민다
  const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t);
  return f;
}
const H = (...args) => ['node', '.atrium/hooks/t.mjs', ...args];
const copySample = (dir) => fs.cpSync(path.join(SAMPLE, '.atrium'), path.join(dir, '.atrium'), { recursive: true });

// ---------- 가짜 판(p181 틀) + rig ----------
async function board({ dir = tmp(), batchMs = 40 } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p182test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
    async spawn(p) {
      const s = add(p.name, { parentSessionId: p.parentSessionId || null });
      if (p.branch) b.branch.noteChild(s.sessionId, p.branch);
      b.spawned.push(p);
      return { sessionId: s.sessionId, trust: { needsTrust: false } };
    },
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
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: batchMs, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 } });
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
  const add = (name, { kind = 'claude', hooked = kind === 'claude', workMs = 80, onText = null, ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, paneId: `${name}:p1`, agentName: name, permissionMode: 'manual', kind, origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind, hooked }), createdAt: Date.now(), ...extra };
    s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle');
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
  const enable = () => store.setRigEnabled(ws.key, true);
  return { b, dir, ws, add, enable, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); b.branch.units.stops.stop(); await tick(300); store.close(); } };
}
const U = (b) => b.branch.units;
const runs = (b) => b.store.db.prepare('SELECT * FROM rig_hook_runs ORDER BY id').all();
const deliveriesTo = (b, s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(s.sessionId);
const eventsOf = (b, kind) => b.store.db.prepare('SELECT * FROM events WHERE kind = ? ORDER BY id').all(kind);
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
test('P182 정의 검사: 길목·from·tool·onFail·run 모양, 없는 스크립트, guide 모양과 파일, 시간 제한 상한', () => {
  const root = tmp();
  writeRig(root, {});
  assert.equal(validateRig({}, { root }).ok, true);
  assert.equal(validateRig([], { root }).ok, false);
  assert.match(validateRig({ hooks: [{ at: 'later', run: H('echo') }] }, { root }).reason, /at은/);
  assert.match(validateRig({ hooks: [{ at: 'deliver', run: [] }] }, { root }).reason, /run은/);
  assert.match(validateRig({ hooks: [{ at: 'deliver', run: 'node x.mjs' }] }, { root }).reason, /run은/);
  assert.match(validateRig({ hooks: [{ at: 'done', from: 'human', run: H('echo') }] }, { root }).reason, /deliver 훅에만/);
  assert.match(validateRig({ hooks: [{ at: 'deliver', from: 'robot', run: H('echo') }] }, { root }).reason, /from은/);
  assert.match(validateRig({ hooks: [{ at: 'deliver', tool: 'x', run: H('echo') }] }, { root }).reason, /tool은/);
  assert.match(validateRig({ hooks: [{ at: 'done', onFail: 'maybe', run: H('echo') }] }, { root }).reason, /onFail/);
  assert.match(validateRig({ hooks: [{ at: 'done', run: ['node', '.atrium/hooks/none.mjs'] }] }, { root }).reason, /스크립트가 없다/);
  assert.match(validateRig({ hooks: [{ at: 'done', run: ['./none.cmd'] }] }, { root }).reason, /파일이 없다/);
  assert.match(validateRig({ guide: 3 }, { root }).reason, /guide/);
  assert.match(validateRig({ guide: '.atrium/none.md' }, { root }).reason, /guide/);
  assert.match(validateRig({ guide: '../outside.md' }, { root }).reason, /워크스페이스 안에 없다/);
  const v = validateRig({ hooks: [{ at: 'deliver', run: H('echo'), timeoutMs: 999999 }, { at: 'tool-before', tool: 'judge', run: H('echo'), onFail: 'block' }] }, { root });
  assert.equal(v.ok, true);
  assert.equal(v.def.hooks[0].timeoutMs, 60000, '최대 60초');
  assert.equal(v.def.hooks[0].from, 'any');
  assert.equal(v.def.hooks[1].onFail, 'block');
  // 견본 정의는 맞다
  assert.equal(validateRig(JSON.parse(fs.readFileSync(path.join(SAMPLE, '.atrium', 'rig.json'), 'utf8')), { root: SAMPLE }).ok, true);
});

// ---------- 정의 찾기: 본 체크아웃 뿌리, 워크트리 세션도 ----------
test('P182 정의 찾기: 워크스페이스 뿌리(본 체크아웃)의 .atrium/rig.json. 워크트리에서 띄운 세션도 본 체크아웃의 정의를 따르고 워크트리의 것은 읽지 않는다', async () => {
  const main = tmp();
  const git = (...a) => execFileSync('git', a, { cwd: main, stdio: 'pipe' });
  git('init', '-q'); git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'init');
  const wt = path.join(main, '..', path.basename(main) + '-wt');
  git('worktree', 'add', '-q', wt, '-b', 'wt-branch');
  try {
    const wsMain = await workspaceOf(main); const wsWt = await workspaceOf(wt);
    assert.equal(wsWt.key, wsMain.key, '워크트리는 같은 워크스페이스');
    writeRig(main, { hooks: [{ at: 'deliver', run: H('append', 'from-main') }] });
    writeRig(wt, { hooks: [{ at: 'deliver', run: H('append', 'from-worktree') }] });
    const store = new Store(path.join(tmp(), 'board.db'));
    store.insertWorkspace({ ...wsMain, createdAt: 1 });
    const s = { sessionId: 'wt1', name: 'wt1', cwd: wt, workspaceKey: wsWt.key, kind: 'claude', rt: { cwd: wt } };
    const b = { store, sessions: new Map([[s.sessionId, s]]), log: () => {} };
    const rig = new Rig(b);
    assert.equal(rig.activeForSession('wt1'), null, '켜지 않으면 없다');
    store.setRigEnabled(wsMain.key, true);
    const r = rig.activeForSession('wt1');
    assert.ok(r);
    assert.equal(path.resolve(r.file), path.resolve(main, '.atrium', 'rig.json'));
    const h = await rig.deliver({ target: s, from: { kind: 'human' }, text: '일' });
    assert.match(h.text, /from-main$/);
    assert.doesNotMatch(h.text, /from-worktree/);
    store.close();
  } finally { try { git('worktree', 'remove', '--force', wt); } catch {} }
});

// ---------- 캐시와 잘못된 정의 ----------
test('P182 읽기: 수정 시각으로 캐시, 잘못된 정의는 마지막 맞은 정의를 쓰고 rig_invalid 한 번, 고치면 새 정의. 해시는 파일 바이트의 SHA-256', async () => {
  const { b, ws, enable, stop } = await board();
  try {
    const root = ws.root;
    const f = writeRig(root, { hooks: [{ at: 'deliver', run: H('append', 'v1') }] });
    enable();
    const r1 = b.rig.read(ws.key);
    assert.equal(r1.invalid, null);
    assert.equal(r1.hash, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'));
    // 같은 파일이면 다시 읽지 않는다(캐시): 읽기 함수를 가로채 센다
    const orig = fs.readFileSync; let n = 0;
    fs.readFileSync = (...a) => { if (String(a[0]).endsWith('rig.json')) n++; return orig(...a); };
    try { b.rig.read(ws.key); b.rig.read(ws.key); } finally { fs.readFileSync = orig; }
    assert.equal(n, 0, '바뀌지 않은 정의는 다시 읽지 않는다');
    // 잘못된 정의
    writeRig(root, '{ "hooks": [ broken');
    const r2 = b.rig.read(ws.key);
    assert.match(r2.invalid, /JSON이 아니다/);
    assert.equal(r2.hash, r1.hash, '마지막 맞은 정의의 해시');
    assert.deepEqual(r2.def.hooks.map((h) => h.run[3]), ['v1']);
    b.rig.read(ws.key); b.rig.read(ws.key);
    assert.equal(eventsOf(b, 'rig_invalid').length, 1, '같은 잘못은 한 번만 남긴다');
    assert.match(JSON.parse(eventsOf(b, 'rig_invalid')[0].data).reason, /JSON이 아니다/);
    // 검사에서 틀린 정의(JSON은 맞음)도 같다
    writeRig(root, { hooks: [{ at: 'deliver', run: ['node', '.atrium/hooks/none.mjs'] }] });
    assert.match(b.rig.read(ws.key).invalid, /스크립트가 없다/);
    assert.equal(eventsOf(b, 'rig_invalid').length, 2);
    // 훅은 마지막 맞은 정의로 돈다
    const s = { sessionId: 'x', name: 'x', workspaceKey: ws.key };
    assert.match((await b.rig.deliver({ target: s, from: { kind: 'human' }, text: '글' })).text, /v1$/);
    const st = b.rig.status(ws.key);
    assert.equal(st.state, 'on'); assert.equal(st.usingLastGood, true); assert.match(st.invalid, /스크립트가 없다/);
    // 고치면 새 정의
    writeRig(root, { hooks: [{ at: 'deliver', run: H('append', 'v2') }] });
    const r3 = b.rig.read(ws.key);
    assert.equal(r3.invalid, null); assert.notEqual(r3.hash, r1.hash);
    assert.match((await b.rig.deliver({ target: s, from: { kind: 'human' }, text: '글' })).text, /v2$/);
    // 처음부터 잘못된 정의(맞은 것이 없다)는 쓰지 않는다
    const two = await board();
    try {
      writeRig(two.ws.root, 'nope'); two.enable();
      assert.equal(two.b.rig.active(two.ws.key), null);
      assert.equal(two.b.rig.status(two.ws.key).state, 'invalid');
    } finally { await two.stop(); }
  } finally { await stop(); }
});

// ---------- 켜기: 사람만 ----------
test('P182 켜기: rig.enable·disable은 판 API 토큰 연결(local)만, 기기 연결은 거절, 상태는 볼 수 있다. 세션 토큰의 /branch/*에는 켜는 명령이 없다', async () => {
  const { b, ws, add, stop } = await board();
  const srv = await serve(b);
  try {
    copySample(ws.root);
    const h = rigHandlers(b);
    const st0 = await h['rig.status']({ workspace: ws.key }, { auth: { kind: 'device' } });
    assert.equal(st0.state, 'off'); assert.equal(st0.enabled, false); assert.equal(st0.present, true);
    await assert.rejects(h['rig.enable']({ workspace: ws.key }, { auth: { kind: 'device', device: { id: 'p' } } }), (e) => e.code === 'forbidden');
    await assert.rejects(h['rig.enable']({ workspace: ws.key }, null), (e) => e.code === 'forbidden');
    assert.equal(b.store.rigState(ws.key).enabled, false);
    // P183: 확인 없이는 켜지 않고 돌 명령을 돌려준다
    const ask = await h['rig.enable']({ workspace: ws.key }, { auth: { kind: 'local' } });
    assert.equal(ask.needsConfirm, true); assert.equal(ask.enabled, false); assert.equal(b.store.rigState(ws.key).enabled, false);
    const on = await h['rig.enable']({ workspace: ws.key, confirm: true }, { auth: { kind: 'local' } });
    assert.equal(on.state, 'on'); assert.ok(on.enabledAt);
    assert.equal(on.hooks.length, 4); assert.equal(on.guide, true); assert.deepEqual(on.tools.map((x) => x.name), ['count']); // P183: 견본에 도구 훅 둘과 도구 하나
    assert.equal(eventsOf(b, 'rig_enabled').length, 1);
    const off = await h['rig.disable']({ workspace: ws.key }, { auth: { kind: 'local' } });
    assert.equal(off.state, 'off'); assert.equal(off.enabledAt, null);
    // 정의 없음
    fs.rmSync(path.join(ws.root, '.atrium'), { recursive: true, force: true });
    assert.equal((await h['rig.status']({ workspace: ws.key }, {})).state, 'none');
    // 에이전트(세션 토큰)는 /branch/에 rig 켜는 길이 없다
    const w = add('w');
    for (const op of ['rig.enable', 'rig', 'enable']) {
      const body = JSON.stringify({ workspace: ws.key });
      const res = await new Promise((r) => { const q = http.request({ host: '127.0.0.1', port: b.cfg.port, path: `/branch/${op}`, method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${b.branch.token(w.sessionId)}`, 'x-mt-session': w.sessionId } }, (x) => { let t = ''; x.on('data', (d) => (t += d)); x.on('end', () => r(JSON.parse(t))); }); q.end(body); });
      assert.equal(res.error.code, op === 'rig' ? 'bad_request' : 'unknown_op', op); // P188: /branch/rig은 관리자 자리의 check·log·rollback·cleanup뿐(켜는 길은 없다)
    }
    assert.equal(b.store.rigState(ws.key).enabled, false);
  } finally { srv.close(); await stop(); }
});

// ---------- 훅 실행기 ----------
test('P182 실행기: argv 그대로(셸 없이), 입력은 stdin JSON, 빈 출력은 pass, 실패(종료 코드·JSON 아님·모르는 action·시간 초과·1MB 넘음·못 찾음)', async () => {
  const root = tmp(); writeRig(root, {});
  const r = await runHook({ run: H('echo', 'a b', 'x&y|z', '$HOME', '"q"'), cwd: root, input: { at: 'deliver', text: '글' } });
  assert.equal(r.ok, true, r.error);
  const seen = JSON.parse(r.out.note);
  assert.deepEqual(seen.argv, ['a b', 'x&y|z', '$HOME', '"q"'], '셸 해석 없이 그대로');
  assert.equal(seen.text, '글');
  assert.deepEqual((await runHook({ run: H('empty'), cwd: root, input: {} })).out, { action: 'pass' });
  const exit = await runHook({ run: H('exit'), cwd: root, input: {} });
  assert.equal(exit.ok, false); assert.match(exit.error, /종료 코드 3: boom/);
  assert.match((await runHook({ run: H('junk'), cwd: root, input: {} })).error, /JSON이 아니다/);
  assert.match((await runHook({ run: H('badaction'), cwd: root, input: {} })).error, /모르는 action/);
  const t0 = Date.now();
  const slow = await runHook({ run: H('sleep'), cwd: root, input: {}, timeoutMs: 300 });
  assert.equal(slow.ok, false); assert.match(slow.error, /시간 초과\(300ms\)/);
  assert.ok(Date.now() - t0 < 5000, '시간 제한에서 끊는다');
  const big = await runHook({ run: H('big'), cwd: root, input: {} });
  assert.equal(big.ok, false); assert.match(big.error, /출력이 너무 크다/);
  assert.match((await runHook({ run: ['no-such-program-p182'], cwd: root, input: {} })).error, /찾지 못했다/);
  assert.match((await runHook({ run: ['./.atrium/none'], cwd: root, input: {} })).error, /찾지 못했다/);
  // 출력 모양
  assert.deepEqual(parseHookOutput('  '), { ok: true, out: { action: 'pass' } });
  assert.equal(parseHookOutput('[1]').ok, false);
  assert.equal(parseHookOutput('{"action":"rewrite","text":3}').ok, false);
  assert.deepEqual(parseHookOutput('{"append":"x"}').out, { action: 'pass', append: 'x' });
});

test('P182 실행기 Windows: 첫 낱말이 .cmd로 풀리면 cmd.exe /d /s /c로 낱말마다 큰따옴표, 묶어도 풀리는 글자(", %, 줄바꿈)는 띄우지 않는다. 그 밖은 셸 없이', { skip: !WIN }, async () => {
  const root = tmp(); writeRig(root, {});
  fs.writeFileSync(path.join(root, '.atrium', 'hooks', 'w.cmd'), '@node "%~dp0t.mjs" %*\r\n');
  const p = spawnPlan(['.atrium/hooks/w.cmd', 'echo', 'a b'], { cwd: root });
  assert.equal(p.viaCmd, true); assert.deepEqual(p.args.slice(0, 3), ['/d', '/s', '/c']); assert.equal(p.verbatim, true);
  assert.match(p.args[3], /^""[^"]+w\.cmd" "echo" "a b""$/);
  // 확장자 없이 적어도 PATHEXT로 찾는다
  assert.equal(spawnPlan(['.atrium/hooks/w', 'echo'], { cwd: root }).viaCmd, true);
  const r = await runHook({ run: ['.atrium/hooks/w.cmd', 'echo', 'a b', 'x&y|z<>^'], cwd: root, input: { text: 't' } });
  assert.equal(r.ok, true, r.error); assert.equal(r.viaCmd, true);
  assert.deepEqual(JSON.parse(r.out.note).argv, ['a b', 'x&y|z<>^'], 'cmd.exe 특수 글자도 따옴표 안에서 그대로');
  for (const bad of ['50%', 'a"b', 'a\nb']) assert.throws(() => cmdLine('x.cmd', [bad]), (e) => e.code === 'cmd_arg', bad);
  const refused = await runHook({ run: ['.atrium/hooks/w.cmd', 'echo', '%PATH%'], cwd: root, input: {} });
  assert.equal(refused.ok, false); assert.match(refused.error, /쓸 수 없는 글자/);
  // node 같은 .exe는 셸 없이
  const plain = spawnPlan(['node', 'x.mjs'], { cwd: root });
  assert.equal(plain.viaCmd, false); assert.match(plain.exe, /node(\.exe)?$/i);
  assert.ok(findExe('node', { cwd: root }));
});

test('P182 훅 차례: 정의 순서대로 돌고 고친 글이 다음 훅으로, 첫 거절에서 멈춤, onFail pass는 이어 가고 block은 거절. 모든 실행을 기록(결정·까닭·note·고치기 전 글·해시·세션)', async () => {
  const { b, ws, add, enable, stop } = await board();
  try {
    enable();
    const w = add('w');
    writeRig(ws.root, { hooks: [
      { at: 'deliver', run: H('append', 'A') },
      { at: 'deliver', run: H('rewrite', '<{T}>') },
      { at: 'deliver', run: H('junk') }, // 실패 onFail pass → 이어 간다
      { at: 'deliver', run: H('echo') },
      { at: 'deliver', run: H('reject', 'no thanks') },
      { at: 'deliver', run: H('append', 'B') }, // 돌지 않는다
    ] });
    const h = await b.rig.deliver({ target: w, from: { kind: 'human' }, text: '일' });
    assert.equal(h.action, 'reject'); assert.equal(h.reason, 'no thanks');
    const rs = runs(b);
    assert.deepEqual(rs.map((r) => r.decision), ['pass', 'rewrite', 'failed', 'pass', 'reject']);
    assert.deepEqual(rs.map((r) => r.hook_index), [0, 1, 2, 3, 4]);
    assert.equal(rs[0].before_text, '일'); assert.equal(rs[1].before_text, '일\nA');
    assert.equal(rs[3].before_text, null, '바뀌지 않으면 고치기 전 글이 없다');
    const seen = JSON.parse(rs[3].note);
    assert.equal(seen.text, '<일\nA>', '고친 글이 다음 훅으로');
    assert.equal(seen.at, 'deliver'); assert.equal(seen.from.kind, 'human'); assert.equal(seen.session.name, 'w');
    assert.equal(seen.rigHash, b.rig.read(ws.key).hash);
    assert.ok(rs.every((r) => r.rig_hash === seen.rigHash && r.session_id === w.sessionId && r.workspace_key === ws.key));
    assert.match(rs[2].error, /JSON이 아니다/);
    assert.equal(eventsOf(b, 'hook_failed').length, 1);
    // onFail block이면 실패가 거절
    writeRig(ws.root, { hooks: [{ at: 'deliver', run: H('exit'), onFail: 'block' }, { at: 'deliver', run: H('append', 'never') }] });
    const h2 = await b.rig.deliver({ target: w, from: { kind: 'agent', session: w }, text: '일' });
    assert.equal(h2.action, 'reject'); assert.match(h2.reason, /실패했다: 종료 코드 3/);
    assert.equal(runs(b).at(-1).decision, 'blocked');
    // from으로 거른다
    writeRig(ws.root, { hooks: [{ at: 'deliver', from: 'agent', run: H('append', 'agent-only') }, { at: 'deliver', from: 'human', run: H('append', 'human-only') }] });
    assert.match((await b.rig.deliver({ target: w, from: { kind: 'human' }, text: 'x' })).text, /^x\nhuman-only$/);
    assert.match((await b.rig.deliver({ target: w, from: { kind: 'agent', session: w }, text: 'x' })).text, /^x\nagent-only$/);
  } finally { await stop(); }
});

// ---------- deliver: 에이전트·사람·여러 대상·판 알림과 앞머리 ----------
test('P182 deliver(에이전트): atrium prompt는 큐에 넣기 전에 훅을 지난다. 일 머리(+rig 한 줄)는 훅이 고친 글 앞에, 거절은 종료 코드 1과 까닭. 출처 agent와 보낸 세션이 전달에 남는다', async () => {
  const { b, ws, add, enable, stop } = await board();
  const srv = await serve(b);
  try {
    copySample(ws.root); enable();
    const lead = add('lead');
    const w1 = add('w1', { parentSessionId: lead.sessionId });
    const peer = add('peer');
    // 일 하위에게: 일 머리 + 고친 글
    const r = await runCli(['prompt', 'w1', '코드를 고쳐라'], envOf(b, lead));
    assert.equal(r.code, 0, r.stderr);
    await until(() => w1.texts.length === 1);
    const got = w1.texts[0];
    const [head, body] = got.split('\n\n');
    assert.match(head, /^\[Atrium 보드\] 관계: 너는 @lead의 하위 워커다/);
    assert.ok(head.split('\n')[2].endsWith(RIG_HEADER_TAIL), '켜진 워크스페이스의 일 머리에 rig 안내(P188: 셋째 줄 끝)');
    assert.ok(head.split('\n').length <= 3, 'P188: 머리는 세 줄 이하');
    assert.equal(body, '코드를 고쳐라\n[rig sample] deliver hook saw this (from agent)');
    const unit = b.store.db.prepare('SELECT * FROM work_units').get();
    assert.equal(unit.spec, body, '일의 할 일은 고친 글');
    const d = deliveriesTo(b, w1)[0];
    assert.equal(d.origin, 'agent'); assert.equal(d.from_session, lead.sessionId);
    // 관계없는 세션에게(보통 글)
    await runCli(['prompt', 'peer', 'hello'], envOf(b, lead));
    await until(() => peer.texts.length === 1);
    assert.equal(peer.texts[0], 'hello\n[rig sample] deliver hook saw this (from agent)');
    // 거절
    writeRig(ws.root, { hooks: [{ at: 'deliver', run: H('reject', 'messages need a ticket id') }] });
    const no = await runCli(['prompt', 'peer', 'again'], envOf(b, lead));
    assert.equal(no.code, 1); assert.match(no.stderr, /rig_rejected/); assert.match(no.stderr, /messages need a ticket id/);
    await tick(200);
    assert.equal(peer.texts.length, 1, '넣지 않았다');
    assert.equal(deliveriesTo(b, peer).length, 1);
  } finally { srv.close(); await stop(); }
});

test('P182 deliver(child --prompt): 띄우기 전에 훅. 거절이면 띄우지 않는다. 통과면 첫 요청 머리 + 고친 글', async () => {
  const { b, ws, add, enable, stop } = await board();
  try {
    enable();
    const lead = add('lead');
    writeRig(ws.root, { hooks: [{ at: 'deliver', run: H('rejectIf', 'bad') }, { at: 'deliver', run: H('append', 'stamped') }] });
    await assert.rejects(b.branch.spawnChild(lead, { name: 'bad', prompt: '일' }), (e) => e.code === 'rig_rejected' && /not for bad/.test(e.message));
    assert.equal(b.spawned.length, 0, '띄우지 않았다');
    const out = await b.branch.spawnChild(lead, { name: 'good', prompt: '일' });
    assert.ok(out.firstPrompt);
    const child = [...b.sessions.values()].find((s) => s.name === 'good');
    await until(() => child.texts.length === 1);
    assert.match(child.texts[0], /^\[Atrium 보드\] 관계: 너는 @lead의 하위 워커다[\s\S]*\n\n일\nstamped$/);
  } finally { await stop(); }
});

test('P182 deliver(사람·여러 대상): session.send는 대상마다 훅. 거절된 대상은 넣지 않고 실패한 전달(까닭 rig: …)로, 나머지는 고친 글로. 출처 human', async () => {
  const { b, ws, add, enable, stop } = await board();
  try {
    enable();
    const w1 = add('w1'); const w2 = add('w2');
    writeRig(ws.root, { hooks: [{ at: 'deliver', from: 'human', run: H('rejectIf', 'w2') }, { at: 'deliver', run: H('append', 'checked') }] });
    const out = await Backend.prototype.send.call(b, { target: ['w1', 'w2'], text: '둘 다 봐라' });
    const by = Object.fromEntries(out.deliveries.map((d) => [d.name, d]));
    assert.equal(by.w2.status, 'failed'); assert.equal(by.w2.rejected, true); assert.match(by.w2.reason, /^rig: not for w2$/);
    assert.notEqual(by.w1.status, 'failed');
    await until(() => w1.texts.length === 1);
    assert.equal(w1.texts[0], '둘 다 봐라\nchecked');
    await tick(150);
    assert.equal(w2.texts.length, 0);
    const d2 = deliveriesTo(b, w2)[0];
    assert.equal(d2.status, 'failed'); assert.equal(d2.origin, 'human'); assert.equal(d2.from_session, null); assert.equal(d2.text, '둘 다 봐라', '거절된 글은 원문');
    assert.equal(deliveriesTo(b, w1)[0].origin, 'human');
    const sessionsRun = new Set(runs(b).map((r) => r.session_id));
    assert.ok(sessionsRun.has(w1.sessionId) && sessionsRun.has(w2.sessionId), '대상마다 돈다');
  } finally { await stop(); }
});

test('P182 판 알림은 훅을 지나지 않는다: done 보고·멈춤 알림·판이 넣는 글은 그대로(출처 board)', async () => {
  const { b, ws, add, enable, stop } = await board();
  try {
    copySample(ws.root); enable();
    const lead = add('lead');
    const w1 = add('w1', { parentSessionId: lead.sessionId, onText: async (text, s) => { if (text.includes('[Atrium 보드] 관계')) await U(b).doneVerb(s, { result: 'ok', text: '끝\nevidence: 시험' }); } });
    await b.branch.verbs.prompt(lead, { name: 'w1', text: '일' });
    await until(() => lead.texts.length === 1);
    assert.match(lead.texts[0], /^\[Atrium 보드\] @w1가 일 u\w+/);
    assert.ok(lead.texts[0].endsWith('\n끝\nevidence: 시험'), '판 알림 끝에는 덧붙이지 않는다(할 일 인용은 고친 글이다)');
    assert.equal(deliveriesTo(b, lead)[0].origin, 'board');
    const deliverRuns = () => runs(b).filter((r) => r.at === 'deliver').length;
    assert.equal(deliverRuns(), 1, '훅은 atrium prompt에서만 돌았다');
    b.queue.enqueue(w1.sessionId, '판이 넣는 글');
    await until(() => w1.texts.length === 2);
    assert.equal(w1.texts[1], '판이 넣는 글');
    assert.equal(deliverRuns(), 1);
  } finally { await stop(); }
});

// ---------- done ----------
test('P182 done 훅: 거절이면 시도는 열린 채 종료 코드 1과 까닭. "evidence:"를 넣으면 닫힌다. 훅 입력에 일·시도·결과·글', async () => {
  const { b, ws, add, enable, stop } = await board();
  const srv = await serve(b);
  try {
    copySample(ws.root); enable();
    const lead = add('lead');
    const w1 = add('w1', { parentSessionId: lead.sessionId });
    await b.branch.verbs.prompt(lead, { name: 'w1', text: '일' });
    await until(() => w1.texts.length === 1);
    const no = await runCli(['done', 'ok', '다 했다'], envOf(b, w1));
    assert.equal(no.code, 1); assert.match(no.stderr, /rig_rejected/); assert.match(no.stderr, /evidence:/);
    const tr = b.store.openTryOf(w1.sessionId);
    assert.ok(tr, '시도는 열린 채'); assert.equal(tr.result, null);
    assert.equal(b.store.getUnit(tr.unitId).status, 'open');
    assert.equal(eventsOf(b, 'unit_done_rejected').length, 1);
    const rec = runs(b).filter((r) => r.at === 'done');
    assert.equal(rec.length, 1); assert.equal(rec[0].decision, 'reject'); assert.equal(rec[0].unit_id, tr.unitId); assert.equal(rec[0].try_id, tr.id);
    const yes = await runCli(['done', 'ok', '다 했다\nevidence: 시험 셋 통과'], envOf(b, w1));
    assert.equal(yes.code, 0, yes.stderr);
    assert.equal(b.store.openTryOf(w1.sessionId), null);
    assert.equal(b.store.getUnit(tr.unitId).status, 'done');
    // 훅 입력
    writeRig(ws.root, { hooks: [{ at: 'done', run: H('echo') }] });
    await b.branch.verbs.prompt(lead, { name: 'w1', text: '둘째' });
    await until(() => !!b.store.openTryOf(w1.sessionId));
    const t2 = b.store.openTryOf(w1.sessionId);
    await U(b).doneVerb(w1, { result: 'failed', text: '못 했다' });
    const seen = JSON.parse(runs(b).at(-1).note);
    assert.equal(seen.at, 'done'); assert.equal(seen.result, 'failed'); assert.equal(seen.doneText, '못 했다');
    assert.equal(seen.unit.id, t2.unitId); assert.equal(seen.try.id, t2.id); assert.equal(seen.session.name, 'w1');
  } finally { srv.close(); await stop(); }
});

// ---------- 꺼진 워크스페이스 ----------
test('P182 꺼진 워크스페이스·정의 없음: 훅도 기록도 없고 글·머리·done은 오늘과 같다', async () => {
  const { b, ws, add, stop } = await board();
  try {
    copySample(ws.root); // 정의는 있지만 켜지 않았다
    const lead = add('lead');
    const w1 = add('w1', { parentSessionId: lead.sessionId });
    await b.branch.verbs.prompt(lead, { name: 'w1', text: '일' });
    await until(() => w1.texts.length === 1);
    assert.ok(w1.texts[0].endsWith('\n\n일'));
    assert.ok(!w1.texts[0].includes(RIG_HEADER_LINE));
    const r = await U(b).doneVerb(w1, { result: 'ok', text: '증거 없이' });
    assert.equal(r.result, 'ok');
    const out = await Backend.prototype.send.call(b, { target: ['w1'], text: '사람' });
    assert.notEqual(out.deliveries[0].status, 'failed');
    await until(() => w1.texts.includes('사람'));
    assert.equal(runs(b).length, 0); assert.equal(eventsOf(b, 'hook_failed').length, 0); assert.equal(eventsOf(b, 'rig_invalid').length, 0);
    // 정의 없음
    fs.rmSync(path.join(ws.root, '.atrium'), { recursive: true, force: true });
    b.store.setRigEnabled(ws.key, true);
    assert.equal(b.rig.activeForSession(w1.sessionId), null);
    assert.equal((await b.rig.deliver({ target: w1, from: { kind: 'human' }, text: 'x' })).text, 'x');
    assert.equal(runs(b).length, 0);
  } finally { await stop(); }
});

// ---------- atrium guide ----------
test('P182 atrium guide: 자세한 사용법 + 켜진 rig의 안내(주제), 꺼짐·없음·잘못된 정의의 까닭. 계약은 3 그대로, 승인 규칙에 guide', async () => {
  const { b, ws, add, enable, stop } = await board();
  const srv = await serve(b);
  try {
    const w = add('w');
    const none = await runCli(['guide'], envOf(b, w));
    assert.equal(none.code, 0, none.stderr);
    assert.match(none.stdout, /atrium prompt <이름>/, '판의 일반 안내(help --long)');
    assert.match(none.stdout, /rig 정의\(\.atrium\/rig\.json\)가 없다/);
    copySample(ws.root);
    fs.writeFileSync(path.join(ws.root, '.atrium', 'more.txt'), 'MORE TOPIC TEXT');
    const def = JSON.parse(fs.readFileSync(path.join(ws.root, '.atrium', 'rig.json'), 'utf8'));
    def.guide.more = '.atrium/more.txt';
    writeRig(ws.root, def, { tHook: false });
    assert.match((await runCli(['guide'], envOf(b, w))).stdout, /사람이 켜지 않았다/);
    enable();
    const on = await runCli(['guide'], envOf(b, w));
    assert.match(on.stdout, /rig: 켜짐/); assert.match(on.stdout, /# Sample rig/); assert.match(on.stdout, /atrium guide more/);
    assert.match((await runCli(['guide', 'more'], envOf(b, w))).stdout, /MORE TOPIC TEXT/);
    assert.match((await runCli(['guide', 'nope'], envOf(b, w))).stdout, /주제 "nope"의 안내는 없다/);
    const js = JSON.parse((await runCli(['guide', '--json'], envOf(b, w))).stdout);
    assert.equal(js.rig.state, 'on'); assert.deepEqual(js.rig.topics, ['more']);
    // 2만 자에서 자른다
    fs.writeFileSync(path.join(ws.root, '.atrium', 'guide.txt'), 'g'.repeat(GUIDE_MAX + 50));
    const long = b.rig.guide(w); assert.equal(long.text.length, GUIDE_MAX); assert.equal(long.clipped, true);
    // 잘못된 정의
    writeRig(ws.root, '{bad', { tHook: false });
    const bad = await runCli(['guide'], envOf(b, w));
    assert.match(bad.stdout, /지금 잘못됐다\(마지막으로 맞았던 정의를 쓰는 중\): JSON이 아니다/);
    assert.equal(CONTRACT_VERSION, 4); // P185: rig 자리로 4
    assert.ok(VERB_NAMES.includes('guide'));
    for (const r of ['Bash(atrium guide)', 'Bash(atrium guide *)', 'PowerShell(atrium guide)', 'PowerShell(atrium guide *)']) assert.ok(ATRIUM_ALLOW.includes(r), r);
  } finally { srv.close(); await stop(); }
});

// ---------- 0단계 남은 일 ----------
test('P182 판 안내문: 사람이 결과를 물어도 폴링하지 않고 보고가 오면 전한다', () => {
  assert.match(BOARD_SYSTEM_PROMPT, /사람이 결과를 물어도 폴링하지 말고 보고가 오면 전한다/);
});

test('P182 tree_quiet 한 번 표시는 unit_tries.quiet_at: 백엔드가 다시 떠도(멈춤 알림 모듈을 새로 만들어도) 되풀이하지 않는다. 움직임이 생기면 지운다', async () => {
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    const mid = add('mid', { parentSessionId: lead.sessionId, workMs: 40 });
    add('leaf', { parentSessionId: mid.sessionId, workMs: 60 });
    mid.onText = async (text, s) => { if (!text.startsWith('[Atrium 보드] 맡긴 일이 멈췄다') && text.includes('큰 일')) await b.branch.verbs.prompt(s, { name: 'leaf', text: '작은 조각' }); };
    await b.branch.verbs.prompt(lead, { name: 'mid', text: '큰 일' });
    const quietNotices = () => deliveriesTo(b, lead).filter((d) => /아래 하위까지 모두 쉬는데/.test(d.text));
    await until(() => quietNotices().length === 1);
    const top = b.store.openTryOf(mid.sessionId);
    assert.ok(top.quietAt, '시도에 적혔다');
    // 다시 뜬 판처럼: 메모리 상태 없이 새 멈춤 모듈로 나무를 다시 본다
    U(b).stops.stop();
    U(b).stops = new UnitStops(b, U(b), { batchMs: 40 });
    U(b).stops.checkTrees();
    await tick(250);
    assert.equal(quietNotices().length, 1, '되풀이하지 않는다');
    // 움직임이 생기면 지운다
    b.store.updateTry(top.id, {}); // 그대로
    await b.branch.verbs.prompt(mid, { name: 'leaf', text: '조금 더' });
    await until(() => b.store.getTry(top.id).quietAt === null, 3000);
    await until(() => quietNotices().length === 2);
  } finally { await stop(); }
});
