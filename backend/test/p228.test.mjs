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
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p228-'));
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
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p228test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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

// ---------- P228 ----------
import { rigSetupHandlers } from '../src/rig-setup.mjs';
import { RigAdmin } from '../src/rig-admin.mjs';
import { rigGuideText } from '../src/rig-templates.mjs';
import { presetFiles, shortcutAnswers, normalizeAnswers, DEFAULT_ANSWERS, SHORTCUTS, READ_ALLOW, draftsDir, scriptRun, REVIEW_SEAT } from '../src/rig-presets.mjs';
import { legacyCreate } from './legacy-rig.mjs';

const LOCAL = { auth: { kind: 'local' } };
const DEVICE = { auth: { kind: 'device' } };
const HS = (b) => rigSetupHandlers(b);
const empty = (o = {}) => board({ def: null, enable: false, ...o });
// 답이 만든 파일·폴더를 임시 폴더에 놓고 검사한다(rig.create가 쓰는 것과 같은 것)
function materialize(r) {
  const dir = tmp();
  for (const d of r.dirs) fs.mkdirSync(path.join(dir, d), { recursive: true });
  for (const [f, t] of Object.entries({ ...r.files, ...r.guides })) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); }
  return dir;
}
const checkOf = (r) => { const dir = materialize(r); try { return validateRig(r.def, { root: dir }); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };
// 사람이 피할 수 없는(알리려는) 경고: 무인 승인 전, Codex의 쓰기 범위·허용 목록, 쓰기 범위 없는 무인·scoped 자리
const EXPECTED_WARN = /unattended|Codex|writes와 allow가 없다|writes\(쓰기 범위\)가 없다/;
const combo = (trigger, session, perm, m) => ({
  ...DEFAULT_ANSWERS, trigger, session, permission: perm === 'un' ? 'scoped' : perm, unattended: perm === 'un',
  canon: { ...DEFAULT_ANSWERS.canon, on: !!(m & 1) }, ledger: { ...DEFAULT_ANSWERS.ledger, on: !!(m & 2), improve: !!(m & 4) },
  sector: { ...DEFAULT_ANSWERS.sector, on: !!(m & 8) }, check: { ...DEFAULT_ANSWERS.check, on: !!(m & 16) }, review: { ...DEFAULT_ANSWERS.review, on: !!(m & 32) },
});

test('P228 세 질문 × 덧붙임: 대화상자가 만드는 모든 조합이 rig check(정의 검사)를 오류 없이 통과한다', () => {
  let n = 0;
  for (const trigger of ['request', 'every']) for (const session of ['keep', 'fresh']) for (const perm of ['ask', 'scoped', 'un']) for (const kind of ['claude', 'codex']) {
    for (let m = 0; m < 64; m++) {
      const r = presetFiles(combo(trigger, session, perm, m), { launcher: kind, reviewLauncher: kind === 'claude' ? 'codex' : 'claude' });
      const v = checkOf(r);
      const tag = JSON.stringify({ trigger, session, perm, kind, m });
      assert.ok(v.ok, `${tag}: ${v.reason}`);
      const odd = v.def.warnings.filter((w) => !EXPECTED_WARN.test(w));
      assert.deepEqual(odd, [], `${tag}: 뜻밖의 경고`);
      if (kind === 'claude' && perm !== 'un') assert.deepEqual(v.def.warnings.filter((w) => !/writes와 allow가 없다|Codex/.test(w)), [], `${tag}: Claude 자리는 경고 없음`);
      // 모양: 고리 work 하나(+ 개선), 자리 하나(+ 검토), event는 없다
      assert.equal(r.def.version, 2);
      assert.deepEqual(Object.keys(r.def.loops), m & 2 && m & 4 ? ['work', 'improve'] : ['work']);
      assert.ok(!JSON.stringify(r.def.loops).includes('"event"'));
      assert.deepEqual(Object.keys(r.def.seats), m & 32 ? ['main', REVIEW_SEAT] : ['main']);
      n++;
    }
  }
  assert.equal(n, 2 * 2 * 3 * 2 * 64);
});

test('P228 언제·누가: request는 keep만(fresh를 골라도 keep), every는 1d·7d·<n>h, 권한 ask·scoped와 질문 없이 돌리기. 틀린 답은 까닭과 함께 거절', () => {
  const x = normalizeAnswers({ trigger: 'request', session: 'fresh' });
  assert.equal(x.session, 'keep');
  let r = presetFiles({ trigger: 'every', every: '6h', session: 'fresh' });
  assert.deepEqual(r.def.loops.work.trigger, { every: '6h' });
  assert.equal(r.def.seats.main.close, 'run'); assert.equal(r.def.seats.main.max_live, 1);
  assert.ok(r.def.loops.work.task, 'every 고리는 task가 늘 있다(없으면 안내를 읽으라는 한 줄)');
  assert.equal(r.def.manager, undefined, 'fresh 자리 하나면 manager 없음');
  r = presetFiles({ trigger: 'request' });
  assert.deepEqual(r.def.loops.work.trigger, { request: 'main' }); assert.equal(r.def.manager, 'main'); assert.equal(r.def.loops.work.task, undefined);
  r = presetFiles({ unattended: true, permission: 'scoped' }, { launcher: 'claude' });
  assert.equal(r.def.seats.main.permission, 'unattended'); assert.equal(r.def.seats.main.allow, undefined, 'unattended에는 허용 목록을 쓰지 않는다');
  r = presetFiles({ permission: 'scoped' }, { launcher: 'claude' });
  assert.deepEqual(r.def.seats.main.allow, READ_ALLOW);
  assert.ok(READ_ALLOW.some((a) => a.startsWith('PowerShell(Get-ChildItem')), 'PowerShell 읽기 cmdlet(11.8의 3)');
  assert.ok(!READ_ALLOW.some((a) => /Bash\((powershell|pwsh|cmd)/i.test(a)), 'Bash로 감싼 셸은 허용 목록에 쓰지 않는다(11.10)');
  r = presetFiles({ permission: 'scoped' }, { launcher: 'codex', kindOf: () => 'codex' });
  assert.equal(r.def.seats.main.allow, undefined, 'Codex 자리에는 허용 목록을 넣지 않는다(쓰이지 않는다)');
  for (const [a, re] of [[{ trigger: 'event' }, /request 또는 every/], [{ trigger: 'every', every: '5m' }, /1d, 7d 또는 <n>h/], [{ trigger: 'every', every: '0h' }, /<n>h/], [{ seat: 'Main' }, /자리 이름/], [{ permission: 'unattended' }, /unattended 체크/],
    [{ canon: { on: true, path: 'C:/x/rules.md' } }, /상대 경로/], [{ sector: { on: true, path: '../out/' } }, /상대 경로/], [{ ledger: { on: true, path: 'ledger/' } }, /장부는 파일/], [{ ledger: { on: true, improve: true, days: 0 } }, /1~90일/],
    [{ seat: 'reviewer', review: { on: true } }, /reviewer/]]) assert.throws(() => normalizeAnswers(a), (e) => e.code === 'bad_request' && re.test(e.message), JSON.stringify(a));
});

test('P228 덧붙임: 정본(loads, 없으면 시작 글), 장부(writes, 개선 고리와 사람 승인), 산출물 폴더(섹터 하나와 produces), 기계 검사(done 훅), 검토 자리(다른 런처, 반려 최대 2)', () => {
  const r = presetFiles({ trigger: 'request', canon: { on: true }, ledger: { on: true, improve: true, days: 3 }, sector: { on: true, path: 'out' }, check: { on: true, script: 'scripts/check.py' }, review: { on: true } }, { launcher: 'claude', reviewLauncher: 'codex' });
  const d = r.def;
  assert.deepEqual(d.docs.rules, { path: 'docs/rules.md', role: 'canon' }); assert.deepEqual(d.seats.main.loads, ['rules']);
  assert.ok(r.files['docs/rules.md'].length > 0, '정본이 없으면 판이 시작 글로 만든다');
  assert.equal(d.docs.ledger.role, 'ledger'); assert.equal(r.files['ledger/log.jsonl'], '');
  assert.deepEqual(d.loops.improve, { kind: 'improve', trigger: { every: '3d', notify: 'main' }, entry: 'main', reads: ['ledger'], produces: ['proposals'], approve: 'human' });
  assert.equal(d.docs.proposals.role, 'sector');
  assert.deepEqual(d.docs.output, { path: 'out/', role: 'sector', intake: 'register', keep: 20 });
  assert.deepEqual(d.loops.work.produces, ['output']);
  assert.deepEqual(d.seats.main.writes, ['ledger', '.atrium/drafts/main/', 'output']);
  assert.ok(!d.seats.main.writes.includes('rules'), '정본은 writes에 두지 않는다(제안으로만)');
  assert.deepEqual(d.hooks, [{ at: 'done', run: ['python', 'scripts/check.py'], onFail: 'block' }]);
  assert.equal(r.files['scripts/check.py'], undefined, '.py는 시작 파일을 만들지 않는다(사람이 둔다)');
  assert.deepEqual(d.seats.reviewer, { launcher: 'codex', session: 'fresh', max_live: 1, close: 'run', guide: '.atrium/seats/reviewer.txt', writes: false, reads: ['rules'] });
  assert.deepEqual(d.results, ['ok', 'failed', 'rejected']);
  assert.deepEqual(d.loops.work.flow, [{ from: 'main', on: 'ok', to: 'reviewer' }, { from: 'reviewer', on: 'rejected', to: 'main', max: 2 }]);
  assert.match(r.guides['.atrium/seats/main.txt'], /atrium rig propose/); assert.match(r.guides['.atrium/seats/reviewer.txt'], /done rejected/);
  assert.deepEqual(scriptRun('a/b.mjs'), ['node', 'a/b.mjs']); assert.deepEqual(scriptRun('a.ps1').slice(-2), ['-File', 'a.ps1']); assert.deepEqual(scriptRun('bin/check'), ['bin/check']);
  assert.equal(checkOf(r).ok, false, '사람이 고른 스크립트가 없으면 검사가 막는다');
  const v = checkOf({ ...r, files: { ...r.files, 'scripts/check.py': 'print("{}")\n' } }); assert.ok(v.ok, v.reason);
});

test('P228 제안 초안: 제안을 내는 고리(개선)의 입구 자리 writes에 .atrium/drafts/<자리>/가 저절로 들고, 개선이 없으면 넣지 않는다', () => {
  const on = presetFiles({ seat: 'writer', ledger: { on: true, improve: true } });
  assert.ok(on.def.seats.writer.writes.includes(draftsDir('writer'))); assert.equal(draftsDir('writer'), '.atrium/drafts/writer/');
  assert.ok(on.dirs.includes('.atrium/drafts/writer/'));
  const off = presetFiles({ seat: 'writer', ledger: { on: true, improve: false } });
  assert.ok(!off.def.seats.writer.writes.some((w) => w.startsWith('.atrium/drafts/')));
  const v = checkOf(on); assert.ok(v.ok, v.reason); assert.ok(!v.def.warnings.some((w) => /쓸 곳/.test(w)), '쓸 곳 없음 경고가 없다');
});

test('P228 바로가기 둘: 정기 점검(매주, fresh, 산출물 폴더 + 장부, scoped와 읽기 허용 목록, 보고서 폴더를 쓰기 범위)과 규칙이 자라는 반복 작업(요청, keep, 정본 + 장부와 개선(사람 승인)). 채운 뒤 바꿀 수 있다', () => {
  assert.deepEqual(SHORTCUTS.map((s) => s.id), ['check', 'grow']);
  const c = shortcutAnswers('check');
  assert.equal(c.shortcut, 'check'); assert.equal(c.trigger, 'every'); assert.equal(c.every, '7d'); assert.equal(c.session, 'fresh'); assert.equal(c.permission, 'scoped'); assert.equal(c.unattended, false);
  assert.equal(c.sector.on, true); assert.equal(c.ledger.on, true); assert.equal(c.ledger.improve, false); assert.equal(c.canon.on, false); assert.equal(c.canon.path, DEFAULT_ANSWERS.canon.path, '꺼진 덧붙임도 경로 기본값을 지닌다');
  let r = presetFiles(c, { launcher: 'claude' });
  assert.equal(r.def.name, 'Regular check');
  assert.deepEqual(r.def.loops.work.trigger, { every: '7d' }); assert.ok(/report/.test(r.def.loops.work.task));
  assert.equal(r.def.seats.checker.permission, 'scoped'); assert.deepEqual(r.def.seats.checker.allow, READ_ALLOW);
  assert.deepEqual(r.def.seats.checker.writes, ['ledger', 'output']); assert.equal(r.def.docs.output.path, 'reports/');
  let v = checkOf(r); assert.ok(v.ok, v.reason); assert.deepEqual(v.def.warnings, []);
  const g = shortcutAnswers('grow');
  r = presetFiles(g, { launcher: 'claude' });
  assert.equal(r.def.name, 'Repeated work with growing rules');
  assert.deepEqual(r.def.loops.work.trigger, { request: 'main' }); assert.equal(r.def.seats.main.session, 'keep');
  assert.deepEqual(r.def.seats.main.loads, ['rules']); assert.equal(r.def.loops.improve.approve, 'human'); assert.equal(r.def.loops.improve.trigger.every, '7d');
  assert.ok(r.def.seats.main.writes.includes('.atrium/drafts/main/'));
  v = checkOf(r); assert.ok(v.ok, v.reason); assert.deepEqual(v.def.warnings, []);
  // 바꾸기: 정기 점검을 매일로, 검토 자리와 기계 검사를 켬, 질문 없이 돌리기
  r = presetFiles({ ...c, every: '1d', review: { on: true }, check: { on: true }, unattended: true }, { launcher: 'claude' });
  assert.deepEqual(r.def.loops.work.trigger, { every: '1d' }); assert.equal(r.def.seats.checker.permission, 'unattended'); assert.ok(r.def.seats.reviewer); assert.equal(r.def.hooks.length, 1);
  assert.equal(r.answers.shortcut, 'check', '바로가기에서 시작한 것은 그대로 적힌다');
  v = checkOf(r); assert.ok(v.ok, v.reason);
  // 바꾸기: 규칙이 자라는 일에서 개선을 끔
  r = presetFiles({ ...g, ledger: { ...g.ledger, improve: false } }, { launcher: 'claude' });
  assert.deepEqual(Object.keys(r.def.loops), ['work']); assert.equal(r.def.docs.proposals, undefined);
  assert.throws(() => shortcutAnswers('main-worker'), /모르는 바로가기/);
});

test('P228 rig.presets: 바로가기 둘과 기본 답(원격도 읽는다). 3자리 틀은 목록에 없고 rig.templates도 없다', async () => {
  const { b, stop } = await empty();
  try {
    const p = await HS(b)['rig.presets']({}, DEVICE);
    assert.deepEqual(p.shortcuts.map((s) => s.id), ['check', 'grow']);
    assert.ok(p.shortcuts.every((s) => s.title && s.desc && s.en && s.en.title && s.answers && s.answers.shortcut === s.id));
    assert.deepEqual(p.defaults, { ...DEFAULT_ANSWERS });
    assert.deepEqual(p.every, ['1d', '7d']);
    assert.ok(!JSON.stringify(p).includes('main-worker'));
    assert.equal(HS(b)['rig.templates'], undefined);
    await assert.rejects(HS(b)['rig.create']({ template: 'main-worker', launchers: { main: 'claude', worker: 'claude' } }, LOCAL), /answers/);
  } finally { await stop(); }
});

test('P228 rig.create(정기 점검): 보고서 폴더·빈 장부·자리 안내를 만들고, 정의는 rig check를 통과한다. 켜면 무인 승인 길은 그대로', async () => {
  const { b, ws, dir, add, stop } = await empty();
  try {
    const r = await HS(b)['rig.create']({ answers: shortcutAnswers('check') }, LOCAL);
    assert.equal(r.ok, true); assert.equal(r.preset, 'check'); assert.deepEqual(r.launchers, { checker: 'claude' });
    assert.deepEqual(r.warnings, []);
    for (const f of ['reports', 'ledger/checks.jsonl', '.atrium/seats/checker.txt', '.atrium/rig.json']) assert.ok(fs.existsSync(path.join(dir, f)), f);
    assert.deepEqual(b.store.rigVersions(ws.key).map((v) => v.note), ['create check']);
    const s = add('someone');
    const c = await new RigAdmin(b, b.branch).verb(s, { op: 'check' });
    assert.equal(c.ok, true, c.reason);
    const e = b.store.db.prepare("SELECT data FROM events WHERE kind = 'rig_create'").all().map((x) => JSON.parse(x.data));
    assert.equal(e.length, 1); assert.equal(e[0].preset, 'check'); assert.equal(e[0].trigger, 'every');
    // 질문 없이 돌리기: 켜기 확인(rig.enable confirm)이 무인 자리를 승인한다(지금 길 그대로)
  } finally { await stop(); }
});

test('P228 rig.create(규칙이 자라는 일 + 기계 검사): 있는 정본은 덮지 않고(kept), 없는 시작 스크립트는 만들어 늘 통과한다. 질문 없이 돌리기는 켜기 확인으로 승인', async () => {
  const { b, ws, dir, stop } = await empty();
  try {
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'rules.md'), 'mine\n');
    const a = { ...shortcutAnswers('grow'), check: { on: true, script: '.atrium/hooks/check.mjs' }, unattended: true };
    const r = await HS(b)['rig.create']({ answers: a }, LOCAL);
    assert.ok(r.kept.includes('docs/rules.md')); assert.equal(fs.readFileSync(path.join(dir, 'docs', 'rules.md'), 'utf8'), 'mine\n');
    assert.ok(r.written.includes('.atrium/hooks/check.mjs'));
    for (const f of ['.atrium/proposals', '.atrium/drafts/main', 'ledger/corrections.jsonl']) assert.ok(fs.existsSync(path.join(dir, f)), f);
    const out = execFileSync(process.execPath, [path.join(dir, '.atrium', 'hooks', 'check.mjs')], { input: JSON.stringify({ result: 'ok' }) }).toString();
    assert.deepEqual(JSON.parse(out), { action: 'pass' });
    assert.ok(r.warnings.some((w) => /unattended/.test(w)));
    assert.deepEqual(b.rig.unattendedSeats(b.rig.read(ws.key).def), ['main']);
    const st0 = b.rig.status(ws.key);
    assert.equal(st0.seats.find((x) => x.name === 'main').permission, 'unattended');
    b.rig.setEnabled(ws.key, true, 'human');
    const st = b.rig.status(ws.key);
    assert.equal(st.seats.find((x) => x.name === 'main').approved, true, '켜기 확인이 무인 자리를 승인');
  } finally { await stop(); }
});

test('P228 rig.create: 이미 있는 3자리 정의 위에는 만들지 않고, 3자리 정의는 그대로 읽힌다', async () => {
  const { b, ws, stop } = await empty();
  try {
    legacyCreate(b, ws.key, 'main-worker-reviewer', { main: 'claude', worker: 'claude', reviewer: 'codex' });
    await assert.rejects(HS(b)['rig.create']({ answers: shortcutAnswers('check') }, LOCAL), (e) => e.code === 'rig_exists');
    const g = await HS(b)['rig.get']({}, LOCAL);
    assert.equal(g.status, 'off'); assert.deepEqual(Object.keys(g.definition.seats), ['main', 'worker', 'reviewer']);
    b.store.setRigEnabled(ws.key, true);
    assert.equal(b.rig.status(ws.key).state, 'on');
  } finally { await stop(); }
});

test('P228 atrium guide rig: 3자리 틀 대신 바로가기 둘의 정의를 예로 든다', () => {
  const g = rigGuideText();
  assert.ok(!/main-worker/.test(g)); assert.match(g, /바로가기 둘/); assert.match(g, /"name": "Regular check"/); assert.match(g, /"name": "Repeated work with growing rules"/);
});
