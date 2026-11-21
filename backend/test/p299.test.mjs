// P299 단위 시험: Hermes 노력 수준. hermes --tui는 --reasoning을 받지 않아(종료 코드 2) 판이 준비된 뒤 /reasoning <값>을 넣는다.
// 어댑터(노력 → 준비된 뒤 넣을 글, 이어 가기, 런처 인자의 --reasoning 값 우선·인자에서 빼기), 이름 맞추기·받지 않는 값 빼기, 넣기(typeReadyInput: 가짜 화면)와 전달 붙잡기,
// 런처 칸(effort, Hermes 값 목록·검사·미리보기), 띄우기 길(backend spawn: 세션에 남기고 harnessPlan.effort, 받지 않는 값은 로그 한 줄), 안내 글 "Ask me anything…" 빈칸 판정,
// atrium child --kind hermes --effort·--launcher·--model(이름 그대로), atrium models 안내. Hermes와 hc 없이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { ADAPTERS, harnessLaunch, HERMES_EFFORTS, hermesEffortOf, hermesReasoningOf, hermesReasoningInput, withoutReasoning, reasoningIn } from '../src/harness.mjs';
import { hermesReasoningShown, hermesInputBox } from '../src/screen.mjs';
import { effortArgsOf, effortIgnoredLine, Launchers, HARNESSES, normalizeLauncher, resolveLauncher, previewLauncher } from '../src/launchers.mjs';
import { newRuntime, deriveState, applyTermStatus } from '../src/state.mjs';
import { Backend } from '../src/backend.mjs';
import { Store } from '../src/store.mjs';
import { DEFAULTS } from '../src/settings.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p299-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const build = (ctx) => ADAPTERS.hermes.build({ sessionId: 's', resume: false, harnessSessionId: null, model: null, effort: null, launcherArgs: [], instructions: null, ...ctx });

test('P299 이름 맞추기와 받지 않는 값: Hermes --reasoning 값, 판 값은 그대로, 다른 이름은 바꾸고 모르는 값은 null', () => {
  assert.deepEqual(HERMES_EFFORTS, ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
  for (const e of ['low', 'medium', 'high', 'xhigh', 'max']) assert.equal(hermesEffortOf(e), e, '판의 노력 값은 이름이 같다');
  assert.equal(hermesEffortOf('HIGH'), 'high');
  assert.equal(hermesEffortOf('off'), 'none'); assert.equal(hermesEffortOf('min'), 'minimal'); assert.equal(hermesEffortOf('x-high'), 'xhigh'); assert.equal(hermesEffortOf('extra-high'), 'xhigh');
  assert.equal(hermesEffortOf('turbo'), null); assert.equal(hermesEffortOf(''), null); assert.equal(hermesEffortOf(null), null);
  assert.equal(reasoningIn(['--yolo', '--reasoning', 'low']), 'low'); assert.equal(reasoningIn(['--reasoning=max']), 'max'); assert.equal(reasoningIn(['-m', 'x']), null);
  assert.equal(hermesReasoningOf('high', []), 'high');
  assert.equal(hermesReasoningOf('turbo', []), null, '받지 않는 값은 뺀다');
  assert.equal(hermesReasoningOf('high', ['--reasoning', 'low']), 'low', '런처 인자가 이긴다');
  assert.equal(hermesReasoningOf(null, ['--reasoning=x-high']), 'xhigh');
  assert.deepEqual(withoutReasoning(['--yolo', '--reasoning', 'low', '--reasoning=max', '-s', 'a']), ['--yolo', '-s', 'a']);
  assert.equal(hermesReasoningInput('high'), '/reasoning high'); assert.equal(hermesReasoningInput(null), null);
  // 확인 줄(Hermes 0.23.3 화면 그대로)
  const scr = ' ·  /reasoning high\n ·  reasoning: high\n ─ ready │ gpt 6.1 sol │ 1m 58s ─\n ❯ ';
  assert.equal(hermesInputBox(' ─ ready │ m ─\n ❯ Ask me anything…').text, '', '안내 글은 빈 입력 칸');
  assert.equal(hermesInputBox(' ─ ready │ m ─\n ❯ Try "/help" for commands').text, '');
  assert.equal(hermesInputBox(' ─ ready │ m ─\n ❯ Ask me anything about x').text, 'Ask me anything about x', '사람이 친 글은 그대로');
  assert.equal(hermesReasoningShown(scr, 'high'), true); assert.equal(hermesReasoningShown(scr, 'low'), false); assert.equal(hermesReasoningShown(' ❯ /reasoning high', 'high'), false);
});

test('P299 어댑터: --tui에 --reasoning을 넣지 않고 준비된 뒤 넣을 글(/reasoning <값>), 이어 가기에도. 런처 인자의 --reasoning은 값을 따르고 인자에서 뺀다, 받지 않는 값은 뺀다', () => {
  const r0 = build({ effort: 'high' });
  assert.deepEqual(r0.args, ['--tui']); assert.equal(r0.readyInput, '/reasoning high'); assert.equal(r0.reasoning, 'high');
  assert.deepEqual(build({ effort: 'high', model: 'prov/m1', launcherArgs: ['--yolo'] }).args, ['--tui', '-m', 'prov/m1', '--yolo']);
  const r = build({ effort: 'xhigh', resume: true, harnessSessionId: 'h-1' });
  assert.deepEqual(r.args, ['--tui', '--resume', 'h-1']); assert.equal(r.resumed, true); assert.equal(r.readyInput, '/reasoning xhigh');
  const own = build({ effort: 'high', launcherArgs: ['--reasoning', 'low', '--yolo'] });
  assert.deepEqual(own.args, ['--tui', '--yolo'], 'Hermes가 뜨지 않게 인자에서 뺀다'); assert.equal(own.readyInput, '/reasoning low');
  assert.equal(build({ launcherArgs: ['--reasoning=max'] }).readyInput, '/reasoning max');
  assert.equal(build({ effort: 'turbo' }).readyInput, undefined);
  assert.equal(build({}).readyInput, undefined, '빈 값 = Hermes 설정 기본');
  // 공통 길(harnessLaunch)도 effort를 어댑터에 주고 넣을 글을 돌려준다
  const hl = harnessLaunch({ kind: 'hermes', sessionId: 's', model: 'm', effort: 'medium', launcherArgs: [] });
  assert.ok(!hl.args.includes('--reasoning'), JSON.stringify(hl.args)); assert.equal(hl.readyInput, '/reasoning medium');
  assert.equal(harnessLaunch({ kind: 'codex', sessionId: 's', effort: 'medium', launcherArgs: [] }).readyInput, undefined);
});

test('P299 effortArgsOf(hermes): 인자는 그대로(판이 준비된 뒤 /reasoning으로 넣는다), 이름 맞추기, 받지 않는 값·런처 인자는 ignored와 까닭', () => {
  assert.deepEqual(effortArgsOf('hermes', 'high', ['--yolo']), { args: ['--yolo'], applied: true, effort: 'high' });
  assert.equal(effortArgsOf('hermes', 'off', []).effort, 'none');
  assert.deepEqual(effortArgsOf('hermes', 'turbo', []), { args: [], applied: false, ignored: true, why: 'value', effort: 'turbo' });
  assert.deepEqual(effortArgsOf('hermes', 'high', ['--reasoning', 'low']), { args: ['--reasoning', 'low'], applied: false, ignored: true, why: 'launcherArgs', effort: 'low' });
  assert.match(effortIgnoredLine('hermes', 'turbo', 'value'), /--effort turbo는 무시했다: hermes는 none, minimal, low, medium, high, xhigh, max, ultra만 받는다/);
  assert.match(effortIgnoredLine('hermes', 'low', 'launcherArgs'), /런처 추가 인자의 --reasoning low를 따른다/);
});

test('P299 런처: Hermes 노력 칸(Hermes 값 목록, 빈 값 = 기본), 검사, 띄울 값과 미리보기(/reasoning은 after로 따로)', () => {
  assert.ok(HARNESSES.hermes.fields.includes('effort'));
  assert.deepEqual(HARNESSES.hermes.efforts, ['', ...HERMES_EFFORTS]);
  assert.equal(HARNESSES.hermes.freeModel, true);
  const l = normalizeLauncher({ name: 'omh', harness: 'hermes', model: 'prov/m1', effort: 'ultra', args: '--yolo' });
  assert.equal(l.effort, 'ultra');
  assert.equal(normalizeLauncher({ name: 'omh0', harness: 'hermes' }).effort, '');
  assert.throws(() => normalizeLauncher({ name: 'omh2', harness: 'hermes', effort: 'turbo' }), (e) => e.code === 'bad_request');
  assert.throws(() => normalizeLauncher({ name: 'c', harness: 'claude', effort: 'ultra' }), (e) => e.code === 'bad_request', 'Claude Code 값은 그대로');
  const r = resolveLauncher(l);
  assert.equal(r.kind, 'hermes'); assert.equal(r.effort, 'ultra'); assert.deepEqual(r.args, ['--yolo'], '인자에 넣지 않는다(어댑터가 붙인다)');
  assert.equal(resolveLauncher(l, { effort: 'low' }).effort, 'low', '함께 준 값이 이긴다');
  const pv = previewLauncher(l);
  assert.equal(pv.line, 'hermes -m prov/m1 --yolo'); assert.equal(pv.after, '/reasoning ultra');
  const pv2 = previewLauncher({ ...l, args: '--reasoning low' });
  assert.equal(pv2.line, 'hermes -m prov/m1'); assert.equal(pv2.after, '/reasoning low', '런처 인자가 이긴다');
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
    agentKinds: async () => [{ kind: 'claude', installed: true }, { kind: 'codex', installed: true }, { kind: 'opencode', installed: true }, { kind: 'hermes', installed: true }],
    createWorkspace: async () => { n++; return { paneId: `w${n}:p1`, workspaceId: `w${n}` }; },
    refreshSubscription: async () => {}, waitShellReady: async () => true,
    startAgent: async (o) => ({ agent: null, argv: [o.kind, ...o.args] }),
    sendText: async () => {}, paneKeys: async () => {},
  };
  b.startHarness = async (s) => ({ agent: null, argv: [s.kind, ...((s.harnessPlan && s.harnessPlan.args) || [])] });
  return { b, cwd: dir, stop: () => b.store.close() };
}


test('P299 띄우기 길(backend spawn): Hermes 노력 수준을 세션에 남기고(카드·맵) 하네스 시작 값에 넣을 글, 이어 가기에도. 받지 않는 값은 빼고 로그 한 줄', async () => {
  const x = spawnBackend();
  const logs = []; x.b.log = (...a) => logs.push(a.join(' '));
  try {
    const r = await x.b.spawn({ cwd: x.cwd, name: 'h1', kind: 'hermes', effort: 'high' });
    const s = x.b.sessions.get(r.sessionId);
    assert.equal(s.effort, 'high'); assert.equal(s.harnessPlan.effort, 'high'); assert.deepEqual(s.harnessPlan.args, []);
    assert.deepEqual(r.effort, { value: 'high', applied: true, ignored: false });
    assert.equal(x.b.store.getSession(r.sessionId).effort, 'high', '판 기록에도');
    const first = x.b.harnessLaunchOf(s);
    assert.equal(first.readyInput, '/reasoning high'); assert.ok(!first.args.includes('--reasoning'));
    s._hermesId = 'hs-1';
    const again = x.b.harnessLaunchOf(s, { resume: true });
    assert.ok(again.args.join(' ').includes('--resume hs-1'), JSON.stringify(again.args));
    assert.equal(again.readyInput, '/reasoning high', '이어 가기에도');
    // 런처의 노력 칸
    const def = { name: 'omh', harness: 'hermes', model: 'prov/m1', effort: 'medium', args: '--yolo', env: {} };
    const rl = await x.b.spawn({ cwd: x.cwd, name: 'h2', launcherDef: def });
    const sl = x.b.sessions.get(rl.sessionId);
    const hl2 = x.b.harnessLaunchOf(sl);
    assert.equal(sl.effort, 'medium'); assert.ok(hl2.args.join(' ').includes('-m prov/m1 --yolo')); assert.equal(hl2.readyInput, '/reasoning medium');
    // 런처 인자의 --reasoning이 이긴다(인자에서 빼고 그 값을 넣는다)
    const ra = await x.b.spawn({ cwd: x.cwd, name: 'h3', launcherDef: { ...def, args: '--reasoning low' }, effort: 'high' });
    const sa = x.b.sessions.get(ra.sessionId);
    assert.equal(sa.effort, 'low'); assert.equal(ra.effort.ignored, true);
    const al = x.b.harnessLaunchOf(sa); assert.ok(!al.args.includes('--reasoning')); assert.equal(al.readyInput, '/reasoning low');
    // 받지 않는 값: 띄우되 빼고 로그 한 줄
    const bad = await x.b.spawn({ cwd: x.cwd, name: 'h4', kind: 'hermes', effort: 'turbo' });
    const sb = x.b.sessions.get(bad.sessionId);
    assert.equal(sb.effort, null); assert.equal(bad.effort.ignored, true);
    assert.equal(x.b.harnessLaunchOf(sb).readyInput, undefined);
    assert.ok(logs.some((m) => /hermes effort dropped: turbo/.test(m)), logs.join('\n'));
  } finally { x.stop(); }
});

// atrium child(Branch.spawnChild): 가짜 판(p180 틀을 줄임)
async function board() {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p299test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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


test('P299 atrium child --kind hermes --effort·--launcher·--model: 노력 수준을 넘기고 응답에 보이고, 모델 이름은 그대로, atrium me·models에 보인다', async () => {
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    const r = await b.branch.spawnChild(lead, { name: 'hx', kind: 'hermes', effort: 'high', wait: false });
    assert.equal(b.spawned[0].effort, 'high');
    assert.ok(!r.harness.argv.includes('--reasoning'), JSON.stringify(r.harness.argv)); assert.equal(r.harness.effort, 'high');
    assert.equal(r.effort, 'high'); assert.equal(r.effortNote, null);
    const bad = await b.branch.spawnChild(lead, { name: 'hy', kind: 'hermes', effort: 'turbo', wait: false });
    assert.equal(b.spawned[1].effort, undefined); assert.match(bad.effortNote, /hermes는 none, minimal/);
    // 모델 목록을 판이 모른다: --kind hermes --model은 이름 그대로 -m
    const m = await b.branch.spawnChild(lead, { name: 'hz', kind: 'hermes', model: 'prov/some-model', effort: 'low', wait: false });
    assert.equal(m.resolved.how, 'as-is'); assert.equal(b.spawned[2].model, 'prov/some-model'); assert.equal(b.spawned[2].effort, 'low');
    // 런처(노력 칸)로
    b.features = { launchers: new Launchers({ store: b.store }) };
    const L = b.features.launchers;
    L.create({ launcher: { name: 'omh', harness: 'hermes', model: 'prov/m1', effort: 'xhigh', args: '' } });
    {
      const rl = await b.branch.spawnChild(lead, { name: 'hl', launcher: 'omh', wait: false });
      const sp = b.spawned[3];
      assert.equal((sp.launcherDef || {}).effort, 'xhigh', JSON.stringify(sp));
      const rl2 = await b.branch.spawnChild(lead, { name: 'hl2', launcher: 'omh', effort: 'low', wait: false });
      assert.equal(b.spawned[4].effort, 'low'); assert.equal(rl2.harness.effort, 'low');
    }
    // atrium me: 하위의 노력 수준(띄운 값)
    const hx = b.sessions.get(r.sessionId); hx.effort = 'high'; hx.model = null;
    const me = b.branch.me(lead);
    const c = me.children.find((k) => k.name === 'hx');
    assert.equal(c.effort, 'high');
    // atrium models: Hermes 안내 한 줄
    const ms = await b.branch.listModels(lead);
    const f = (ms.freeModels || []).find((e) => e.kind === 'hermes');
    assert.ok(f && /--kind hermes --model <모델 이름>/.test(f.command), JSON.stringify(ms.freeModels));
    assert.ok(f.efforts.includes('ultra'));
  } finally { await stop(); }
});

test('P299 준비된 뒤 넣기(typeReadyInput): ready·빈 입력 칸을 기다려 /reasoning <값>을 치고 Enter, 확인 줄을 보면 끝. 그동안 전달은 starting으로 붙잡는다', async () => {
  const x = spawnBackend();
  try {
    x.b.branch.holds = () => false; x.b.sleeper = null;
    x.b.cfg.readyInputStepMs = 20; x.b.cfg.readyInputConfirmMs = 1000; x.b.cfg.readyInputWaitMs = 3000;
    const r = await x.b.spawn({ cwd: x.cwd, name: 'h1', kind: 'hermes', effort: 'high' });
    const s = x.b.sessions.get(r.sessionId);
    const typed = [];
    let screen = ' ─ starting ─';
    x.b.adapter.readScreen = async () => screen;
    x.b.adapter.sendText = async (_p, t) => { typed.push(['text', t]); };
    x.b.adapter.paneKeys = async (_p, k) => { typed.push(['keys', k.join('+')]); screen = ' ·  /reasoning high\n ·  reasoning: high\n ─ ready │ m ─\n ❯ '; };
    const setup = { input: '/reasoning high', reasoning: 'high', at: Date.now() };
    s._readyInput = setup;
    s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'working');
    const p = x.b.typeReadyInput(s, setup);
    await sleep(100);
    assert.deepEqual(typed, [], '일하는 동안은 치지 않는다');
    applyTermStatus(s.rt, 'idle');
    assert.equal(x.b.deliveryView(s.sessionId).state, 'starting', '넣기 전에는 전달을 붙잡는다');
    screen = ' ─ ready │ m ─\n ❯ ';
    assert.equal(await p, true);
    assert.deepEqual(typed, [['text', '/reasoning high'], ['keys', 'enter']]);
    assert.equal(s._readyInput, null);
    assert.equal(x.b.deliveryView(s.sessionId).state, 'ready', '넣은 뒤 풀린다');
    // 확인 줄이 안 뜨면 그래도 풀고 로그
    const logs = []; x.b.log = (...a) => logs.push(a.join(' '));
    x.b.adapter.paneKeys = async () => {};
    screen = ' ─ ready │ m ─\n ❯ ';
    const setup2 = { input: '/reasoning low', reasoning: 'low', at: Date.now() };
    s._readyInput = setup2;
    assert.equal(await x.b.typeReadyInput(s, setup2), false);
    assert.equal(s._readyInput, null); assert.ok(logs.some((m) => /ready input not confirmed/.test(m)));
    // 입력 칸에 글이 있으면 치지 않고 기다린다(시간이 다 되면 푼다)
    typed.length = 0; x.b.cfg.readyInputWaitMs = 200;
    x.b.adapter.sendText = async (_p, t) => { typed.push(t); };
    screen = ' ─ ready │ m ─\n ❯ half typed';
    const setup3 = { input: '/reasoning max', reasoning: 'max', at: Date.now() };
    s._readyInput = setup3;
    assert.equal(await x.b.typeReadyInput(s, setup3), false); assert.deepEqual(typed, []); assert.equal(s._readyInput, null);
  } finally { x.stop(); }
});
