// P195 단위 시험: rig를 처음 써 본 보고에서 고친 것 — 워크트리 자리의 저장소 조건 경고, 열쇠가 바뀔 때 rig 옮기기와 자리 세션 이름,
// 꺼진 rig의 자리 이름 알림, 자리가 rig 밖 세션에 보내기, 원격 기기의 rig 끄기. 가짜 판은 p190 틀.
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
import { Branch, approvalArgsOf } from '../src/branch.mjs';
import { Rig, validateRig, validateFlow, RIG_HEADER_LINE, HOOK_FROMS } from '../src/rig.mjs';
import { rigFlowHandlers, seatHeader, handoffText } from '../src/rig-flow.mjs';
import { missionGraph } from '../src/mission.mjs';
import { promptTask } from '../src/text.mjs';
import { CONTRACT_VERSION, VERBS, shortHelp } from '../src/cli-contract.mjs';
import { attachFeatures } from '../src/features.mjs';
import { initialLaunchers } from '../src/launchers.mjs';
import { linkRelationPlan } from '../src/relations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(HERE, 'fixtures', 'rig-flow-sample');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p195-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const sampleDef = () => JSON.parse(fs.readFileSync(path.join(SAMPLE, '.atrium', 'rig.json'), 'utf8'));
function writeRig(root, def) {
  fs.cpSync(path.join(SAMPLE, '.atrium'), path.join(root, '.atrium'), { recursive: true });
  const f = path.join(root, '.atrium', 'rig.json');
  fs.writeFileSync(f, JSON.stringify(def, null, 2));
  const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t);
}

// ---------- 가짜 판(p182 틀) + 자리 ----------
async function board({ dir = tmp(), def = sampleDef(), enable = true, batchMs = 40 } = {}) {
  if (def) writeRig(dir, def);
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p195test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], spawned: [],
    api: { broadcast: () => {} }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '' },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { sessionId: s.sessionId, name: s.name, state: d.state, ask: d.ask || null, error: d.error || null, rigSeat: s.rigSeat || null }; },
    ensureLink(from, to, patch = {}) {
      let l = store.linkByPair(from, to);
      if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: !!patch.spawned, observed: !!patch.observed, createdAt: Date.now() }; store.insertLink(l); }
      return store.getLink(l.linkId);
    },
    linkEvent(l, kind, text = null, data = null) { return store.addLinkEvent(l.linkId, kind, text, data); },
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    async spawn(p) {
      const kind = p.kind || (p.launcherDef && p.launcherDef.harness) || 'claude';
      const s = add(p.name, { parentSessionId: p.parentSessionId || null, kind, cwd: p.cwd, onText: b.onSpawnText || null });
      if (p.branch) b.branch.noteChild(s.sessionId, p.branch);
      b.spawned.push(p);
      return { sessionId: s.sessionId, trust: { needsTrust: false } };
    },
    pushTree() { const idx = b.branch.relIndex(); return [...b.sessions.values()].map((s) => ({ sessionId: s.sessionId, parentSessionId: idx.workParentOf(s.sessionId), kind: s.kind || 'claude', state: deriveState(s.rt).state, delivering: b.queue.pending(s.sessionId), loops: 0, bg: null })); },
    closeSession(s, reason) { b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
    resolve: (r) => { for (const s of b.sessions.values()) if (s.name === r || s.sessionId === r) return s; throw Object.assign(new Error('no ' + r), { code: 'not_found' }); },
    resolveWorkspace: async (k) => { const w = store.getWorkspace(k || ws.key); if (!w) throw Object.assign(new Error('no ws'), { code: 'not_found' }); return w; },
    touch: () => {}, features: null,
    async kill(p) { const s = b.sessions.get(p.session); if (!s) return { closed: false }; b.closeSession(s, 'killed'); return { closed: true }; },
  };
  b.rig = new Rig(b);
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    send: async (sid, text) => { if (b.stopped) return; b.sent.push({ sid, text }); const s = b.sessions.get(sid); if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.start();
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: batchMs, verbs: { pollMs: 15, settleMs: 300, turnGraceMs: 300, answerGraceMs: 200 } });
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
  const add = (name, { kind = 'claude', hooked = kind === 'claude', workMs = 30, onText = null, ...extra } = {}) => {
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
  if (enable) store.setRigEnabled(ws.key, true);
  const F = () => b.branch.flow;
  const seat = (s, name) => F().setSeat(s, name);
  const by = (name) => [...b.sessions.values()].find((x) => x.name === name);
  return { b, dir, ws, add, F, seat, by, stop: async () => { b.stopped = true; b.branch.flow.stopCycles(); b.queue.stop(); b.branch.notices.stop(); b.branch.units.stops.stop(); await tick(200); store.close(); } };
}
const U = (b) => b.branch.units;
const V = (b) => b.branch.verbs;
const evs = (b, kind) => b.store.db.prepare('SELECT * FROM events WHERE kind = ? ORDER BY id').all(kind).map((e) => ({ ...e, data: JSON.parse(e.data || 'null') }));


// ---------- P195 ----------
import { rigHandlers, gitStateOf, worktreeWarnings, mayReachOutside, rigDirName } from '../src/rig.mjs';
import { RigAdmin } from '../src/rig-admin.mjs';
import { rigSetupHandlers } from '../src/rig-setup.mjs';
import { templateFiles } from '../src/rig-templates.mjs';
import { seatNotice } from '../src/rig-flow.mjs';

const LOCAL = { auth: { kind: 'local' } };
const DEVICE = { auth: { kind: 'device' } };
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString().trim();
const gitInit = (dir) => { git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 't@example.invalid'); git(dir, 'config', 'user.name', 't'); git(dir, 'config', 'commit.gpgsign', 'false'); };
const gitCommit = (dir) => { fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n'); git(dir, 'add', 'a.txt'); git(dir, 'commit', '-q', '-m', 'first'); };
// 틀 3 정의(런처는 claude)
const wtDef = () => templateFiles('main-worker-reviewer-worktree', { main: 'claude', worker: 'claude', reviewer: 'claude' }).def;
function writeDef(dir, def) {
  fs.mkdirSync(path.join(dir, '.atrium', 'seats'), { recursive: true });
  for (const s of Object.keys(def.seats)) fs.writeFileSync(path.join(dir, '.atrium', 'seats', `${s}.txt`), `${s}\n`);
  const f = path.join(dir, '.atrium', 'rig.json');
  fs.writeFileSync(f, JSON.stringify(def, null, 2));
  const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t);
}

test('P195 gitStateOf와 worktreeWarnings: 저장소 아님, 커밋 없음, 정상', () => {
  const dir = tmp();
  try {
    assert.equal(gitStateOf(dir, { run: (a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }), 'norepo');
    gitInit(dir);
    assert.equal(gitStateOf(dir, { run: (a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }), 'nocommit');
    gitCommit(dir);
    assert.equal(gitStateOf(dir, { run: (a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }), 'ok');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const seats = { main: { name: 'main' }, worker: { name: 'worker', worktree: true } };
  assert.deepEqual(worktreeWarnings(seats, 'ok'), []);
  assert.deepEqual(worktreeWarnings({ main: { name: 'main' } }, 'norepo'), [], '워크트리 자리가 없으면 경고 없음');
  const [a] = worktreeWarnings(seats, 'norepo');
  assert.match(a, /이 자리는 워크트리를 쓴다\(worker\): git 저장소와 첫 커밋이 필요하다/); assert.match(a, /git 저장소가 아니다/);
  assert.match(worktreeWarnings(seats, 'nocommit')[0], /커밋이 없다/);
});

test('P195 워크트리 자리 경고: rig check·rig.get·켜기 미리보기(status)·틀 목록과 만들기', async () => {
  const { b, dir, ws, stop } = await board({ def: null, enable: false });
  try {
    writeDef(dir, wtDef());
    const A = new RigAdmin(b, b.branch);
    // 저장소 아님
    let c = A.check(ws.key);
    assert.equal(c.ok, true, '정의는 맞다(경고만)');
    assert.ok(c.warnings.some((w) => /워크트리를 쓴다\(worker\)/.test(w) && /git 저장소가 아니다/.test(w)), JSON.stringify(c.warnings));
    const s0 = b.rig.status(ws.key);
    assert.equal(s0.worktreeGit, 'norepo'); assert.ok(s0.warnings.some((w) => /워크트리/.test(w)));
    const g0 = await rigSetupHandlers(b)['rig.get']({}, LOCAL);
    assert.equal(g0.worktreeGit, 'norepo'); assert.ok(g0.warnings.some((w) => /워크트리/.test(w)));
    const en = await rigHandlers(b)['rig.enable']({}, LOCAL);
    assert.equal(en.needsConfirm, true); assert.equal(en.worktreeGit, 'norepo', '켜기 미리보기도 안다');
    const tp = await rigSetupHandlers(b)['rig.templates']({ workspace: ws.key }, LOCAL);
    assert.equal(tp.git, 'norepo');
    const t3 = tp.templates.find((t) => t.id === 'main-worker-reviewer-worktree');
    assert.equal(t3.blocked, 'norepo'); assert.match(t3.blockedReason, /git 저장소와 첫 커밋이 필요하다/);
    assert.equal(tp.templates.find((t) => t.id === 'main-worker').blocked, undefined, '워크트리 없는 틀은 그대로');
    assert.equal((await rigSetupHandlers(b)['rig.templates']({}, LOCAL)).templates.every((t) => !t.blocked), true, '워크스페이스를 주지 않으면 옛 그대로');
    // 커밋 없음
    gitInit(dir);
    await tick(3100); // gitStateOf의 3초 기억
    assert.equal(b.rig.status(ws.key).worktreeGit, 'nocommit');
    assert.ok(A.check(ws.key).warnings.some((w) => /커밋이 없다/.test(w)));
    // 정상
    gitCommit(dir);
    await tick(3100);
    assert.equal(b.rig.status(ws.key).worktreeGit, null);
    assert.equal(A.check(ws.key).warnings.some((w) => /워크트리/.test(w)), false);
  } finally { await stop(); }
});

test('P195 rig.create: 워크트리 틀은 저장소가 아니면 까닭과 함께 거절, 다른 틀은 그대로 만든다', async () => {
  const { b, dir, stop } = await board({ def: null, enable: false });
  try {
    await assert.rejects(rigSetupHandlers(b)['rig.create']({ template: 'main-worker-reviewer-worktree', launchers: { main: 'claude', worker: 'claude', reviewer: 'claude' } }, LOCAL), /워크트리를 쓴다\(worker\)/);
    assert.equal(fs.existsSync(path.join(dir, '.atrium', 'rig.json')), false);
    const r = await rigSetupHandlers(b)['rig.create']({ template: 'main-worker', launchers: { main: 'claude', worker: 'claude' } }, LOCAL);
    assert.equal(r.ok, true);
  } finally { await stop(); }
});

test('P195 열쇠가 바뀌면(폴더 → 저장소) rig 켜기·보호 목록·표·데이터 폴더가 함께 옮겨 가고 자리 세션 이름은 그대로', async () => {
  const { b, dir, ws, add, F, stop } = await board({ def: null, enable: false });
  try {
    writeDef(dir, wtDef());
    b.store.setRigEnabled(ws.key, true);
    const n1 = b.rig.currentN(ws.key);
    assert.equal(n1, 1, '켜면 버전 1');
    b.store.setRigProtected(ws.key, { pointers: ['/seats/reviewer'], files: [] });
    const main = add('main');
    F().setSeat(main, 'main');
    b.store.nextSeatN(ws.key, 'worker'); b.store.nextSeatN(ws.key, 'worker');
    b.store.setCycle(ws.key, 0, { nextAt: 123 });
    const c = F().caseFor(main, ws.key);
    const f1 = b.store.rigVersion(ws.key, 1).file;
    assert.ok(fs.existsSync(path.join(dir, f1)));
    const enabledAt = b.store.rigState(ws.key).enabledAt;
    // 폴더가 저장소가 됨
    gitInit(dir); gitCommit(dir);
    const to = await workspaceOf(dir);
    assert.equal(to.kind, 'repo'); assert.notEqual(to.key, ws.key);
    const r = b.store.rekeyWorkspace(ws.key, to);
    for (const s of b.sessions.values()) if (s.workspaceKey === ws.key) s.workspaceKey = to.key;
    const moved = b.rig.rekey(ws.key, to.key);
    assert.equal(moved, 1, '버전 파일 하나를 옮겼다');
    assert.ok(r.rig && r.rig.rig_cases === 1);
    // 켜짐·보호·표
    assert.deepEqual(b.store.rigState(to.key), { enabled: true, enabledAt });
    assert.deepEqual(b.store.rigProtected(to.key).pointers, ['/seats/reviewer']);
    assert.equal(b.store.rigState(ws.key), null, '옛 줄은 없다');
    assert.equal(b.store.getCase(c.id).workspaceKey, to.key);
    assert.equal(b.store.nextSeatN(to.key, 'worker'), 3, '자리 셈을 이어 간다');
    assert.equal(b.store.getCycle(to.key, 0).nextAt, 123);
    const v = b.store.rigVersions(to.key);
    assert.equal(v.length, 1);
    assert.ok(v[0].file.startsWith(`rigs/${rigDirName(to.key)}/`), v[0].file);
    assert.ok(fs.existsSync(path.join(dir, v[0].file)), '데이터 폴더의 버전 파일도 새 폴더로');
    assert.equal(fs.existsSync(path.join(dir, 'rigs', rigDirName(ws.key))), false, '옛 폴더는 비워 지웠다');
    // rig는 켜진 채, 같은 버전, 자리 세션은 이름과 자리 그대로
    assert.equal(b.rig.status(to.key).state, 'on');
    assert.equal(b.rig.currentN(to.key), 1, '같은 내용이라 새 버전이 생기지 않는다');
    assert.equal(main.name, 'main'); assert.equal(main.rigSeat, 'main');
    assert.equal(b.store.getSession(main.sessionId).name, 'main');
    assert.ok(F().seatCtx(main), '자리 맥락이 살아 있다');
  } finally { await stop(); }
});

test('P195 열쇠 옮기기: 대상에 이미 버전이 있으면 번호를 뒤로 민다(건의 버전도 함께), 켜짐은 어느 쪽이든 켜져 있으면 켜짐', () => {
  const dir = tmp();
  const st = new Store(path.join(dir, 'board.db'));
  try {
    st.insertWorkspace({ key: 'a', kind: 'folder', root: dir, createdAt: 1 });
    st.insertWorkspace({ key: 'b', kind: 'repo', root: dir, createdAt: 2 });
    st.setRigEnabled('a', true);
    st.insertRigVersion({ workspaceKey: 'a', hash: 'h1', by: 'human' }); st.insertRigVersion({ workspaceKey: 'a', hash: 'h2', by: 'human' });
    st.insertRigVersion({ workspaceKey: 'b', hash: 'x1', by: 'human' });
    st.insertCase({ id: 'c1', workspaceKey: 'a', owner: 's', createdAt: 5, versionN: 2 });
    st.insertCase({ id: 'c2', workspaceKey: 'b', owner: 's', createdAt: 6, versionN: 1 });
    st.rekeyWorkspace('a', { key: 'b', kind: 'repo', root: dir });
    assert.deepEqual(st.rigVersions('b').map((v) => [v.n, v.hash]), [[1, 'x1'], [2, 'h1'], [3, 'h2']]);
    assert.equal(st.getCase('c1').versionN, 3); assert.equal(st.getCase('c2').versionN, 1);
    assert.equal(st.rigState('b').enabled, true);
    assert.deepEqual(st.rigVersions('a'), []);
  } finally { st.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('P195 rig가 꺼졌거나 잘못되면 자리 이름으로 보낸 것에 그 까닭을 돌려준다(엉뚱한 비슷한 이름 대신)', async () => {
  const { b, dir, ws, add, F, stop } = await board({ enable: true });
  try {
    const main = add('main'); F().setSeat(main, 'main');
    add('techno-worker-1-codex');
    b.store.setRigEnabled(ws.key, false);
    await assert.rejects(V(b).prompt(main, { name: 'worker', text: 'x' }), (e) => e.code === 'rig_off' && /rig가 꺼져 있다/.test(e.message) && /worker는 이 워크스페이스 rig의 자리 이름/.test(e.message) && /사람이 보드에서/.test(e.message) && !/비슷한 이름/.test(e.message));
    // 자리 없는 세션도 같다(rig 정의가 있는 워크스페이스)
    const lone = add('lone');
    await assert.rejects(V(b).prompt(lone, { name: '@reviewer', text: 'x' }), (e) => e.code === 'rig_off');
    // 자리 이름이 아니면 옛 그대로(not_found와 비슷한 이름)
    await assert.rejects(V(b).prompt(main, { name: 'techno-worker', text: 'x' }), (e) => e.code === 'not_found');
    // 켰는데 정의가 잘못이고 쓸 정의가 없다(처음부터 잘못)
    const f = path.join(dir, '.atrium', 'rig.json');
    const bad = JSON.parse(fs.readFileSync(f, 'utf8')); bad.flow[0].to = 'nobody';
    b.rig.cache.clear(); b.store.db.prepare('DELETE FROM rig_versions').run(); b.rig.versionDefs.clear();
    fs.writeFileSync(f, JSON.stringify(bad)); const t = new Date(Date.now() + 200000); fs.utimesSync(f, t, t);
    b.store.setRigEnabled(ws.key, true);
    await assert.rejects(V(b).prompt(lone, { name: 'worker', text: 'x' }), (e) => e.code === 'rig_off' && /잘못되어 쓰이지 않는다\(까닭: flow\[0\]\.to/.test(e.message));
  } finally { await stop(); }
});

test('P195 자리가 rig 밖 세션에 보내기: 관리자 자리는 늘, 다른 자리는 may의 "@이름"·"*"로. 글만 가고 일은 만들지 않는다', async () => {
  const def = sampleDef();
  def.seats.reviewer.may = ['main', '@outsider'];
  const { b, ws, add, F, stop } = await board({ def });
  try {
    const main = add('main'); F().setSeat(main, 'main');
    const out = add('outsider'); const other = add('other');
    const w = add('worker-9'); F().setSeat(w, 'worker');
    const rv = add('reviewer-9'); F().setSeat(rv, 'reviewer');
    // 관리자 자리(main): 아무 자리 없는 세션에 글만
    const r1 = await V(b).prompt(main, { name: 'other', text: '알림 하나' });
    assert.equal(r1.unit, null, '일을 만들지 않는다');
    await until(() => other.texts.some((t) => t.includes('알림 하나')));
    assert.deepEqual(b.store.casesOf(ws.key), [], '건도 없다');
    // reviewer: may의 @outsider만
    const r2 = await V(b).prompt(rv, { name: 'outsider', text: '검토 메모' });
    assert.equal(r2.unit, null);
    await until(() => out.texts.some((t) => t.includes('검토 메모')));
    await assert.rejects(V(b).prompt(rv, { name: 'other', text: 'x' }), (e) => e.code === 'rig_refused' && /seats\.reviewer\.may에 "@other"/.test(e.message) && /관리자 자리\(main\)에서 보낸다/.test(e.message));
    // worker: may에 rig 밖 없음 → 거절
    await assert.rejects(V(b).prompt(w, { name: 'outsider', text: 'x' }), (e) => e.code === 'rig_refused' && /"\*"\(자리 없는 세션 모두\)/.test(e.message));
    // 자리 이름은 흐름 규칙 그대로(worker는 reviewer에 맡기지 못한다)
    await assert.rejects(V(b).prompt(w, { name: 'reviewer', text: 'x' }), (e) => e.code === 'rig_refused');
  } finally { await stop(); }
});

test('P195 "*"는 자리 없는 세션 모두, 정의 검사는 "@이름"·"*"를 받고 맞지 않는 이름을 거절한다', async () => {
  const seat = { name: 'worker', may: ['*'] };
  assert.equal(mayReachOutside(seat, 'main', ['anyone']), true);
  assert.equal(mayReachOutside({ name: 'worker', may: ['@Bob'] }, 'main', ['bob']), true, '대소문자 무시');
  assert.equal(mayReachOutside({ name: 'worker', may: ['main'] }, 'main', ['bob']), false);
  assert.equal(mayReachOutside({ name: 'main', may: [] }, 'main', ['bob']), true, '관리자 자리');
  assert.equal(mayReachOutside({ name: 'main', may: [] }, null, ['bob']), false, 'manager가 없으면 관리자 자리도 없다');
  const raw = (may) => ({ seats: { main: { launcher: 'claude', session: 'keep', may } }, flow: [] });
  assert.equal(validateFlow(raw(['*', '@lead-1'])).ok, true);
  assert.match(validateFlow(raw(['@bad name'])).reason, /rig 밖 세션 이름이 맞지 않다/);
  assert.match(validateFlow(raw(['ghost'])).reason, /없는 자리가 있다: ghost.*"@<이름>"/);
  // 자리 알림이 관리자 자리의 rig 밖 보내기를 말한다
  assert.match(seatNotice({ seat: 'main', assign: ['worker'], manager: true }), /rig 밖 세션에 글만/);
  assert.doesNotMatch(seatNotice({ seat: 'worker', may: ['main'] }), /rig 밖/);
  const def = sampleDef(); def.seats.worker.may = ['main', '*'];
  const { b, add, F, stop } = await board({ def });
  try {
    const w = add('worker-9'); F().setSeat(w, 'worker');
    const lone = add('lone');
    const r = await V(b).prompt(w, { name: 'lone', text: '글' });
    assert.equal(r.unit, null);
    await until(() => lone.texts.some((t) => t.includes('글')));
  } finally { await stop(); }
});

test('P195 원격 기기: rig 끄기는 되고 켜기·만들기·저장은 안 된다', async () => {
  const { b, ws, stop } = await board({ enable: true });
  try {
    const H = rigHandlers(b);
    await assert.rejects(H['rig.enable']({ confirm: true }, DEVICE), (e) => e.code === 'forbidden');
    const r = await H['rig.disable']({}, DEVICE);
    assert.equal(r.enabled, false);
    const ev = b.store.db.prepare("SELECT data FROM events WHERE kind = 'rig_disabled' ORDER BY id DESC LIMIT 1").get();
    assert.equal(JSON.parse(ev.data).by, 'remote');
    await assert.rejects(H['rig.enable']({ confirm: true }, DEVICE), (e) => e.code === 'forbidden');
    await assert.rejects(rigSetupHandlers(b)['rig.save']({ seats: {} }, DEVICE), (e) => e.code === 'forbidden');
    await assert.rejects(H['rig.disable']({}, { auth: { kind: 'session' } }), (e) => e.code === 'forbidden', '판 API 토큰·기기 토큰이 아니면 못 끈다');
    await assert.rejects(H['rig.disable']({}, null), (e) => e.code === 'forbidden');
    const on = await H['rig.enable']({ confirm: true }, LOCAL);
    assert.equal(on.enabled, true);
  } finally { await stop(); }
});
