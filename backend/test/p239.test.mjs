// P239(rig2-design 11.18 2단계): 정의가 바뀌어 떠 있는 keep 자리의 권한이 달라지면 쉴 때 이어 가기로 다시 띄운다(3),
// scoped·ask 자리의 권한 모드가 default가 아니면 장부 gate drift와 응답 필요 카드(4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig } from '../src/rig.mjs';
import { writeSessionSettings } from '../src/launch.mjs';
import { newRuntime } from '../src/state.mjs';
import { Backend } from '../src/backend.mjs';
import { RigAmp, permSigOf, MODE_DRIFT_TEXT } from '../src/rig-amp.mjs';
import { RigProposals } from '../src/rig-proposals.mjs';
import { RigSetup } from '../src/rig-setup.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p239-'));
// main(keep, scoped, writes docs/), asker(keep, ask), robot(keep, unattended 승인), checker(fresh, scoped)
const DEF = (o = {}) => ({
  version: 2, name: 'p239',
  seats: {
    main: { launcher: 'claude', session: 'keep', permission: 'scoped', writes: ['docs/'], allow: ['Bash(git status:*)'], ...(o.main || {}) },
    asker: { launcher: 'claude', session: 'keep', ...(o.asker || {}) },
    robot: { launcher: 'claude', session: 'keep', permission: 'unattended', writes: ['out/'] },
    checker: { launcher: 'claude', session: 'fresh', permission: 'scoped', writes: ['reports/'], ...(o.checker || {}) },
  },
  loops: {
    work: { kind: 'work', trigger: { request: 'main' }, entry: 'main', flow: [{ from: 'main', on: 'assign', to: 'checker' }] },
    poll: { kind: 'work', trigger: { request: 'asker' }, entry: 'asker' },
    sweep: { kind: 'work', trigger: { every: '7d' }, entry: 'robot', task: 'sweep' },
  },
});

async function board() {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.atrium'), { recursive: true });
  const put = (def) => fs.writeFileSync(path.join(dir, '.atrium', 'rig.json'), JSON.stringify(def, null, 2));
  put(DEF());
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  store.setRigEnabled(ws.key, true);
  const casts = [];
  const logs = [];
  const b = { cfg: { hookTimeoutSec: 2, sessionsDir: path.join(dir, 'sessions') }, store, sessions: new Map(), log: (...a) => logs.push(a.join(' ')), api: { broadcast: (n, d) => casts.push({ n, d }) } };
  b.rig = new Rig(b);
  b.rigAmp = new RigAmp(b);
  b.rigProposals = new RigProposals(b);
  b.rig.permit(ws.key, ['robot'], 'human');
  let n = 0;
  const add = (name, { seat = null, kind = 'claude', permissionMode = 'manual' } = {}) => {
    const s = { sessionId: `sid-${name}-${++n}`, name, kind, cwd: dir, workspaceKey: ws.key, rigSeat: seat, hookToken: `tok-${name}`, permissionMode, rt: newRuntime({ kind, hooked: true }) };
    s.rt.cwd = dir;
    s.settingsPath = writeSessionSettings({ file: path.join(dir, 'sessions', `${s.sessionId}.json`), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: s.hookToken, sessionId: s.sessionId, amp: b.rigAmp.claudeAmp(s) });
    b.sessions.set(s.sessionId, s);
    b.rigAmp.noteLaunched(s); // 판이 띄운 때(backend spawn·launchOf)
    return s;
  };
  // 가짜 잠재우기: 잠재우기 → 깨우기(깨우기는 launchOf를 불러 새 설정으로 띄운다)
  const calls = [];
  b.sleeper = {
    isAsleep: (s) => !!s.rt.sleep,
    info: (s) => ({ name: s.name, kind: 'claude', hooked: true, convKnown: true, state: s.fakeState || 'ready', sleeping: !!s.rt.sleep, waking: false, closing: false, draft: !!s.draft, delivering: 0, loops: 0, bg: false, blocked: null, childBusy: false, parentBusy: false, viewed: true }),
    sleep: async (s, o) => { calls.push(['sleep', s.name, o]); s.rt.sleep = { at: Date.now(), by: o.by, scope: o.scope }; return { slept: true }; },
    wake: async (s, why) => { calls.push(['wake', s.name, why]); b.rigAmp.syncSettings(s); b.rigAmp.noteLaunched(s); s.rt.sleep = null; return { woke: true, plan: 'resume' }; },
  };
  const gates = () => store.rigEvents({ ws: ws.key, limit: 1000 }).filter((e) => e.kind === 'gate');
  const asks = () => b.rigProposals.asks({ ws: ws.key });
  return { dir, store, ws, b, add, put, calls, casts, logs, gates, asks };
}
function openTry(B, s) {
  const id = `u${Math.random().toString(16).slice(2, 8)}`;
  B.store.insertUnit({ id, from: s.sessionId, to: s.sessionId, origin: 'cycle', spec: 'x', status: 'open', createdAt: Date.now(), caseId: null, seat: s.rigSeat, via: { by: s.sessionId } });
  const tr = { id: `t${id}`, unitId: id, sessionId: s.sessionId, header: true, deliveryId: `d${id}`, startedAt: Date.now() - 5 };
  B.store.insertTry(tr);
  return tr;
}
const endTry = (B, tr) => B.store.updateTry(tr.id, { endedAt: Date.now(), result: 'ok' });
const allow = (s) => (JSON.parse(fs.readFileSync(s.settingsPath, 'utf8')).permissions || {}).allow || [];

// ---------- 3. 권한이 바뀌면 다음 쉴 때 다시 띄우기 ----------
test('P239 권한 서명: writes·allow·permission·deny만 본다', () => {
  const a = permSigOf({ permission: 'scoped', writes: ['docs/'], allow: [], deny: [], stopVerify: true, preTool: [] });
  assert.equal(a, permSigOf({ permission: 'scoped', writes: ['docs/'], allow: [], deny: [], stopVerify: false, preTool: [1] }));
  assert.notEqual(a, permSigOf({ permission: 'scoped', writes: ['docs/', 'guides/'], allow: [], deny: [] }));
  assert.notEqual(a, permSigOf({ permission: 'ask', writes: ['docs/'], allow: [], deny: [] }));
  assert.notEqual(a, permSigOf({ permission: 'scoped', writes: ['docs/'], allow: ['Bash(ls:*)'], deny: [] }));
  assert.notEqual(a, permSigOf({ permission: 'scoped', writes: ['docs/'], allow: [], deny: ['Bash(rm:*)'] }));
  assert.equal(permSigOf(null), null);
});

test('P239 writes가 바뀐 keep 자리: 열린 시도 중에는 표시만, 쉬면 잠재우기·깨우기(이어 가기)로 새 설정 파일. rig 판에 권한 바뀜', async () => {
  const B = await board();
  const main = B.add('main', { seat: 'main' });
  const amp = B.b.rigAmp;
  assert.equal(amp.permStale(main), null);
  assert.equal(await amp.permCheck(main), null);
  const tr = openTry(B, main);
  // 정의 v2: main의 writes에 guides/
  B.put(DEF({ main: { writes: ['docs/', 'guides/'] } }));
  const st = amp.permStale(main);
  assert.ok(st);
  assert.deepEqual(st.from.writes, ['docs/']);
  assert.deepEqual(st.to.writes, ['docs/', 'guides/']);
  // 열린 시도 중: 다시 띄우지 않는다. rig 판에 알린다(rig.seats)와 sessionView의 permStale
  assert.deepEqual(await amp.permCheck(main), { waiting: 'open_try' });
  assert.equal(B.calls.length, 0);
  assert.ok(B.casts.some((c) => c.n === 'rig.seats' && c.d.workspace === B.ws.key));
  const view = new RigSetup(B.b).sessionView(main);
  assert.equal(view.permStale, true);
  // 일하는 중(시도는 닫혔지만 턴이 돈다)도 기다린다
  endTry(B, tr);
  main.fakeState = 'working';
  assert.deepEqual(await amp.permCheck(main), { waiting: 'working' });
  main.fakeState = 'ready';
  // 쉰다 → 잠재우기(혼자, 사람이 잠재울 때의 판정) → 깨우기(rig_perm)
  const r = await amp.permCheck(main);
  assert.deepEqual(r, { restarted: true, plan: 'resume' });
  assert.deepEqual(B.calls.map((c) => [c[0], c[1]]), [['sleep', 'main'], ['wake', 'main']]);
  assert.deepEqual(B.calls[0][2], { by: 'rig', mode: 'hand', scope: 'session' });
  assert.equal(B.calls[1][2], 'rig_perm');
  assert.equal(amp.permStale(main), null, '새 서명');
  assert.ok(allow(main).some((x) => /guides\/\*\*\)$/.test(x)), '새 설정 파일에 guides/ 편집 허용');
  assert.equal(new RigSetup(B.b).sessionView(main).permStale, undefined);
  // 다시 보면 할 일이 없다
  assert.equal(await amp.permCheck(main), null);
  assert.equal(B.calls.length, 2);
});

test('P239 권한 아닌 칸만 바뀌면(모델·stopVerify·흐름) 다시 띄우지 않는다. fresh 자리는 보지 않는다', async () => {
  const B = await board();
  const main = B.add('main', { seat: 'main' });
  const checker = B.add('checker', { seat: 'checker' });
  const def = DEF({ main: { model: 'sonnet' }, checker: { writes: ['reports/', 'x/'] } });
  def.amp = undefined;
  def.loops.work.flow = [];
  B.put(def);
  assert.equal(B.b.rigAmp.permStale(main), null);
  assert.equal(B.b.rigAmp.permStale(checker), null, 'fresh 자리는 다음 회에 새로 뜬다');
  const out = await B.b.rigAmp.permTick();
  assert.deepEqual(out, []);
  assert.equal(B.calls.length, 0);
});

test('P239 permission·allow·deny가 바뀐 keep 자리도 다시 띄운다. 잠든 자리는 깨어날 때 새 설정이라 할 일이 없다', async () => {
  const B = await board();
  const main = B.add('main', { seat: 'main' });
  const asker = B.add('asker', { seat: 'asker' });
  B.put(DEF({ main: { allow: ['Bash(git status:*)', 'Bash(ls:*)'] }, asker: { permission: 'scoped' } }));
  assert.ok(B.b.rigAmp.permStale(main));
  assert.ok(B.b.rigAmp.permStale(asker));
  asker.rt.sleep = { at: Date.now(), by: 'auto', scope: 'session' };
  const out = await B.b.rigAmp.permTick();
  assert.deepEqual(out.map((x) => [x.name, x.restarted || x.waiting]), [['main', true], ['asker', 'asleep']]);
  assert.deepEqual(B.calls.map((c) => c[1]), ['main', 'main']);
  // deny
  B.put(DEF({ main: { allow: ['Bash(git status:*)', 'Bash(ls:*)'], deny: ['Bash(rm:*)'] } }));
  assert.ok(B.b.rigAmp.permStale(main));
});

test('P239 떠 있는 세션에 자리를 정함(rig.seat): 기준 null → 쉬면 다시 띄운다. 이 판 전에 띄운 세션(기준 없음)은 지금 값을 기준으로', async () => {
  const B = await board();
  const s = B.add('free');
  assert.equal(s.rt.rigPermSig, null, '자리 없이 띄움');
  s.rigSeat = 'main';
  B.b.rigAmp.noteSeated(s);
  const st = B.b.rigAmp.permStale(s);
  assert.ok(st);
  assert.equal(st.from, null);
  assert.equal(st.to.permission, 'scoped');
  assert.deepEqual(await B.b.rigAmp.permCheck(s), { restarted: true, plan: 'resume' });
  assert.equal(B.b.rigAmp.permStale(s), null);
  // 이 자리로 띄운 세션을 같은 자리에 다시 앉히면 그대로
  const m = B.add('main', { seat: 'main' });
  B.b.rigAmp.noteSeated(m);
  assert.equal(B.b.rigAmp.permStale(m), null);
  // 이 판 전에 띄운 세션: 기준을 지금 값으로
  const old = B.add('old', { seat: 'main' });
  delete old.rt.rigPermSig;
  assert.equal(B.b.rigAmp.permStale(old), null);
  assert.ok(old.rt.rigPermSig);
  B.put(DEF({ main: { writes: ['docs/', 'guides/'] } }));
  assert.ok(B.b.rigAmp.permStale(old));
});

test('P239 setSeat(rig.seat)가 noteSeated를 부른다', async () => {
  const { RigFlow } = await import('../src/rig-flow.mjs');
  const B = await board();
  const s = B.add('free');
  const f = Object.create(RigFlow.prototype);
  Object.assign(f, { b: { ...B.b, broadcastSession: () => {} }, store: () => B.store, seatedOf: () => [] });
  f.setSeat(s, 'asker', { by: 'human' });
  assert.equal(s.rigSeat, 'asker');
  assert.ok(B.b.rigAmp.permStale(s), '자리 없이 띄운 세션 → 다시 띄울 대상');
});

test('P239 launchOf: 띄울 때 서명을 남기고, 이어 가기 명령만 다시 만들 때(launch false)는 남기지 않는다', async () => {
  const B = await board();
  const main = B.add('main', { seat: 'main' });
  const be = Object.create(Backend.prototype);
  Object.assign(be, { rigAmp: B.b.rigAmp, plugin: {} });
  B.put(DEF({ main: { writes: ['docs/', 'guides/'] } }));
  be.launchOf(main, { launch: false });
  assert.ok(B.b.rigAmp.permStale(main));
  be.launchOf(main);
  assert.equal(B.b.rigAmp.permStale(main), null);
});

// ---------- 4. 권한 모드 어긋남 ----------
function hookBackend(B) {
  const be = Object.create(Backend.prototype);
  Object.assign(be, {
    sessions: B.b.sessions, store: B.store, rigAmp: B.b.rigAmp, log: () => {}, probeGit: () => {}, onLinkTargetPrompt: () => {}, rigDocs: null,
    api: B.b.api, queue: { onUserPromptSubmit: () => null }, readChoicesLater: () => {}, recheckBlockedLater: () => {}, refreshModelNow: () => {}, broadcastSession: () => {}, web: null,
  });
  return be;
}
const hdr = (s) => ({ 'x-mt-session': s.sessionId, authorization: `Bearer ${s.hookToken}` });
const hook = (be, s, ev, mode) => be.processHook(hdr(s), JSON.stringify({ hook_event_name: ev, session_id: s.sessionId, permission_mode: mode, ...(ev === 'PostToolUse' ? { tool_name: 'Edit', tool_input: { file_path: 'docs/a.md' }, tool_use_id: 'x' } : {}) }), null);

test('P239 권한 모드 어긋남: scoped 자리가 acceptEdits → 장부 gate drift 한 줄과 카드 하나, 같은 모드는 더 적지 않고, default로 돌아오면 카드가 사라진다', async () => {
  const B = await board();
  const be = hookBackend(B);
  const main = B.add('main', { seat: 'main' });
  hook(be, main, 'UserPromptSubmit', 'default');
  assert.equal(B.gates().length, 0);
  assert.equal(B.asks().length, 0);
  hook(be, main, 'PostToolUse', 'acceptEdits');
  hook(be, main, 'PostToolUse', 'acceptEdits');
  hook(be, main, 'Stop', 'acceptEdits');
  const g = B.gates();
  assert.equal(g.length, 1);
  assert.deepEqual({ value: g[0].value, at: g[0].data.at, mode: g[0].data.mode, seat: g[0].seat, session: g[0].session }, { value: 'drift', at: 'permission', mode: 'acceptEdits', seat: 'main', session: main.sessionId });
  let a = B.asks();
  assert.equal(a.length, 1);
  assert.deepEqual({ id: a[0].id, kind: a[0].kind, seat: a[0].seat, mode: a[0].mode, sessionName: a[0].sessionName }, { id: `mode:${main.sessionId}`, kind: 'mode_drift', seat: 'main', mode: 'acceptEdits', sessionName: 'main' });
  assert.equal(MODE_DRIFT_TEXT('main', 'acceptEdits'), 'rig 자리 main의 권한 모드가 acceptEdits로 바뀌었다. 자리 터미널에서 Shift+Tab으로 manual로 돌린다.');
  assert.equal(MODE_DRIFT_TEXT('main', 'auto', 'acceptEdits'), 'rig 자리 main의 권한 모드가 auto로 바뀌었다. 자리 터미널에서 Shift+Tab으로 acceptEdits로 돌린다.');
  assert.ok(B.casts.some((c) => c.n === 'rig.asks'));
  assert.equal(a[0].back, 'manual');
  // 더 넓은 모드로 또 바뀌면 한 줄 더, 카드는 여전히 하나
  hook(be, main, 'PostToolUse', 'auto');
  assert.equal(B.gates().length, 2);
  a = B.asks();
  assert.equal(a.length, 1);
  assert.equal(a[0].mode, 'auto');
  // 잠든 자리는 카드를 숨긴다(깨면 띄운 모드)
  main.rt.sleep = { at: Date.now() };
  assert.equal(B.asks().length, 0);
  main.rt.sleep = null;
  // default로 돌아옴 → 카드가 사라진다
  hook(be, main, 'UserPromptSubmit', 'default');
  assert.equal(B.asks().length, 0);
  assert.equal(main.rt.rigModeDrift, null);
  assert.equal(B.gates().length, 2);
  // 카드에는 단추가 없다
  assert.throws(() => B.b.rigProposals.answer(`mode:${main.sessionId}`, 'accept'), /Shift\+Tab/);
});

test('P239 권한 모드 어긋남: 띄운 모드보다 넓을 때만. plan은 어긋남이 아니다', async () => {
  const B = await board();
  const be = hookBackend(B);
  const main = B.add('main', { seat: 'main' });
  hook(be, main, 'PostToolUse', 'plan');
  hook(be, main, 'PostToolUse', 'dontAsk');
  assert.equal(B.gates().length, 0);
  assert.equal(B.asks().length, 0);
  hook(be, main, 'PostToolUse', 'bypassPermissions');
  assert.equal(B.asks()[0].mode, 'bypassPermissions');
  hook(be, main, 'PostToolUse', 'plan'); // 좁아지면 사라진다
  assert.equal(B.asks().length, 0);
  // acceptEdits로 띄운 ask 자리: acceptEdits·default·plan은 그대로, auto·bypass만 어긋남. 돌아갈 모드는 acceptEdits
  const a2 = B.add('asker', { seat: 'asker', permissionMode: 'acceptEdits' });
  hook(be, a2, 'PostToolUse', 'acceptEdits');
  hook(be, a2, 'PostToolUse', 'default');
  assert.equal(B.asks().length, 0);
  hook(be, a2, 'PostToolUse', 'auto');
  const a = B.asks();
  assert.deepEqual(a.map((x) => [x.sessionName, x.mode, x.back]), [['asker', 'auto', 'acceptEdits']]);
  assert.equal(B.gates().at(-1).data.launched, 'acceptEdits');
});

test('P239 권한 모드 어긋남: ask 자리(기본 모드로 띄움)도 본다. unattended 자리, rig 밖 세션은 보지 않는다', async () => {
  const B = await board();
  const be = hookBackend(B);
  const asker = B.add('asker', { seat: 'asker' });
  const robot = B.add('robot', { seat: 'robot', permissionMode: 'bypassPermissions' });
  const free = B.add('free');
  const askerBypass = B.add('asker2', { seat: 'asker', permissionMode: 'acceptEdits' });
  hook(be, asker, 'PostToolUse', 'acceptEdits');
  hook(be, robot, 'PostToolUse', 'bypassPermissions');
  hook(be, robot, 'PostToolUse', 'acceptEdits');
  hook(be, free, 'PostToolUse', 'acceptEdits');
  hook(be, askerBypass, 'PostToolUse', 'acceptEdits');
  const a = B.asks();
  assert.deepEqual(a.map((x) => x.sessionName), ['asker'], 'acceptEdits로 띄운 ask 자리의 acceptEdits는 어긋남이 아니다');
  assert.equal(B.gates().length, 1);
  assert.equal(B.gates()[0].seat, 'asker');
});

test('P239 다시 띄우면(noteLaunched) 어긋남을 지운다', async () => {
  const B = await board();
  const be = hookBackend(B);
  const main = B.add('main', { seat: 'main' });
  hook(be, main, 'PostToolUse', 'acceptEdits');
  assert.equal(B.asks().length, 1);
  B.b.rigAmp.noteLaunched(main);
  assert.equal(B.asks().length, 0);
});
