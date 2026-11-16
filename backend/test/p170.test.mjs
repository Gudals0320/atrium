// P170 단위 시험: Claude Code 밖 하네스(codex, opencode, pi)의 잠재우기·깨우기, 보는 중의 시간 제한(ARCH 4절 D4).
// 가짜 판·가짜 어댑터로 돈다(터미널과 하네스 없이)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { sleepTarget, sessionActivity, sessionSleepPlan, repoSleepPlan, idleSince, busyMark, harnessConvId, Sleeper } from '../src/sleep.mjs';
import { newRuntime, deriveState, applyTermStatus, applyAgentDetected, applyAgentReleased } from '../src/state.mjs';
import { transcriptPathFor } from '../src/launch.mjs';
import { TerminalRelay } from '../src/relay.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p170-'));
const MIN = 60000;
const ID = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-00000000a170`;
const H = (x = {}) => ({ name: 'cx', kind: 'codex', hooked: false, harness: true, convKnown: true, state: 'ready', sleeping: false, waking: false, closing: false, delivering: 0, loops: 0, childBusy: false, descBusy: false, parentBusy: false, viewed: false, draft: false, bg: false, blocked: null, idleSince: 0, ...x });

test('P170 판정: codex·opencode·pi는 판이 띄우고 이어 갈 대화 ID를 알면 대상이다. 대화 ID 없음·일하는 중·응답 기다림·초안이면 빠진다', () => {
  for (const kind of ['codex', 'opencode', 'pi']) {
    assert.equal(sleepTarget(H({ kind })), null, kind);
    assert.equal(sleepTarget(H({ kind, convKnown: false })), 'no_convo', `${kind} 대화 ID 없음`);
    assert.equal(sleepTarget(H({ kind, harness: false })), 'not_board', `${kind} 판이 띄우지 않음`);
    assert.equal(sleepTarget(H({ kind, state: 'working' })), 'not_ready');
    assert.equal(sessionActivity(H({ kind, state: 'working' })), 'working');
    assert.equal(sessionActivity(H({ kind, state: 'waiting' })), 'needs_you');
    assert.equal(sessionActivity(H({ kind, draft: true })), 'draft', `${kind} 초안`);
    assert.equal(sessionActivity(H({ kind, draft: true }), { mode: 'hand' }), 'draft', '손으로 잠재울 때도 초안은 막는다');
  }
  assert.equal(sleepTarget(H({ kind: 'shell' })), 'not_claude');
  assert.equal(sleepTarget(H({ kind: 'aider' })), 'not_claude', '이어 가기가 없는 종류');
  assert.equal(sessionActivity(H({ kind: 'shell', draft: true })), null, '셸의 초안은 리포를 깨워 두지 않는다');
  // 뒤 일을 모르는 종류: 모두 잠재우기(bulk)도 쉬는 상태가 정한 시간 동안 이어졌을 때만
  const now = 100 * MIN;
  assert.equal(sleepTarget(H({ idleSince: now - 5 * MIN }), { mode: 'bulk', now, afterMs: 30 * MIN }), 'idle_short');
  assert.equal(sleepTarget(H({ idleSince: now - 40 * MIN }), { mode: 'bulk', now, afterMs: 30 * MIN }), null);
  assert.equal(sleepTarget(H({ idleSince: now - 5 * MIN }), { mode: 'hand', now, afterMs: 30 * MIN }), null, '사람이 고르면 바로');
  assert.equal(sleepTarget(H({ kind: 'claude', hooked: true, idleSince: now - 5 * MIN }), { mode: 'bulk', now, afterMs: 30 * MIN }), null, 'Claude Code는 그대로');
  // 리포·세션 규칙
  const o = { now, afterMs: 30 * MIN };
  assert.deepEqual(repoSleepPlan([H({ idleSince: now - 40 * MIN })], o).targets, ['cx']);
  assert.equal(repoSleepPlan([H({ idleSince: now - 40 * MIN, state: 'working' })], o).why, 'working');
  assert.equal(sessionSleepPlan(H({ idleSince: now - 40 * MIN }), o).why, null);
  assert.equal(sessionSleepPlan(H({ idleSince: now - 40 * MIN, convKnown: false }), o).why, 'nothing');
  // 쉬기 시작한 때: hook 없는 하네스는 턴 끝·손댄 때·띄운 때(터미널 상태 알림 lastActivityAt은 같은 idle에도 다시 온다)
  assert.equal(idleSince({ kind: 'codex', touchedAt: 5, rt: { lastActivityAt: 99, lastHookAt: null, turn: { endedAt: 30 }, launchedAt: 10 } }), 30);
  // 대화 ID: 판 기록이 먼저, 없으면 터미널이 아는 것
  assert.equal(harnessConvId({ harnessPlan: { harnessSessionId: 'a' }, rt: { term: { agentSessionId: 'b' } } }), 'a');
  assert.equal(harnessConvId({ harnessPlan: {}, rt: { term: { agentSessionId: 'b' } } }), 'b');
  assert.equal(harnessConvId({ harnessPlan: null, rt: { term: {} } }), null);
});

test('P170 busyMark: 보는 중뿐이면 보는 창에서 손댄 때, 다른 일이 있으면 지금', () => {
  const act = (x) => x.a;
  assert.equal(busyMark([{ a: 'viewing', viewAt: 50 }, { a: null }], act, 10, 100), 50);
  assert.equal(busyMark([{ a: 'viewing', viewAt: 50 }, { a: 'working' }], act, 10, 100), 100);
  assert.equal(busyMark([{ a: 'viewing', viewAt: 50 }], act, 70, 100), 70, '앞서 본 일보다 당기지 않는다');
});

// ---------- 가짜 판: 리포 ka에 claude a1과 codex cx(이어 갈 대화 ID를 터미널이 앎) ----------
function board({ repoMin = 30, sessMin = 30 } = {}) {
  const root = tmp(), cwd = tmp();
  const events = [], calls = [];
  const sessions = new Map();
  const settings = { sleepAfterMin: repoMin, sessionSleepAfterMin: sessMin };
  const screens = new Map(); // 패널 → 화면 글
  const store = { saveRuntime: () => {}, updateSession: (sid, f) => calls.push(['update', sid, Object.keys(f)]), addEvent: (sid, kind, data) => events.push({ sid, kind, data }), workspaces: () => [{ key: 'ka', root: 'C:/x/repo-a' }] };
  const queue = new EventEmitter(); queue.items = []; queue.pending = (sid) => queue.items.filter((d) => d.sessionId === sid).length; queue.cancelSession = () => {};
  let wsN = 10;
  const paneOf = (pane) => [...sessions.values()].find((x) => x.paneId === pane);
  const b = {
    cfg: { claudeProjects: root, killWaitMs: 2000 }, sessions, store, queue, killing: new Set(), log: () => {},
    hooked: (s) => s.rt.hooked !== false, relay: { stats: () => [], detach: () => {} },
    features: { loops: { activeCount: () => 0 }, settings: { get: () => settings } },
    requireTerminal: () => {},
    resolve: (ref) => sessions.get(ref) || [...sessions.values()].find((s) => s.name === ref),
    resolveWorkspace: async (ref) => ({ key: ref }),
    broadcastSession: () => {},
    withNewPane: async (create, register) => { const r = await create(); await register(r); return r; },
    launchOf: (s) => ({ sessionId: s.sessionId, settingsPath: 'C:/d/x.json', permissionMode: 'manual', model: 'haiku', effort: null }),
    // 하네스 끄기(backend.stopHarnessAgent의 가짜): Ctrl+C 두 번에 끝난다. stuck이면 끝나지 않는다
    stopHarnessAgent: async (s, steps = []) => { calls.push(['stopHarness', s.name]); steps.push('ctrl+c', 'ctrl+c'); if (s.stuck) return false; applyAgentReleased(s.rt); return true; },
    // 하네스 이어 띄우기(backend.startHarness의 가짜)
    startHarness: async (s, o) => { calls.push(['startHarness', s.name, o.resume, o.why, s.harnessPlan.harnessSessionId]); s.rt.exit = null; s.rt.phase = 'starting'; setTimeout(() => { applyAgentDetected(s.rt); applyTermStatus(s.rt, 'idle'); }, 20); return { resumed: true }; },
    adapter: {
      connected: true,
      processInfo: async () => null,
      readScreen: async (pane) => screens.get(pane) || '',
      sendText: async () => {},
      paneKeys: async (pane) => { const s = paneOf(pane); if (s) setTimeout(() => applyAgentReleased(s.rt), 10); },
      workspacePanes: async () => [], closeWorkspace: async () => {}, closePane: async () => {}, refreshSubscription: async () => {},
      createWorkspace: async () => { wsN++; return { paneId: `w${wsN}:p1`, workspaceId: `w${wsN}` }; },
      waitShellReady: async () => true,
      startAgent: async ({ name, paneId }) => { calls.push(['startAgent', name]); const s = paneOf(paneId); setTimeout(() => { applyAgentDetected(s.rt); applyTermStatus(s.rt, 'idle'); }, 20); return { agent: { launchPending: true } }; },
    },
  };
  let n = 0;
  const add = (name, kind, x = {}) => {
    const hooked = kind === 'claude';
    const rt = newRuntime({ kind, hooked });
    applyAgentDetected(rt); applyTermStatus(rt, 'idle');
    rt.lastActivityAt = Date.now(); rt.launchedAt = Date.now() - 60 * MIN; rt.lastHookAt = hooked ? Date.now() - 40 * MIN : null;
    const s = { sessionId: ID(++n), name, cwd, kind, origin: 'board', paneId: `w${n}:p1`, termWorkspaceId: `w${n}`, agentName: name, rt, touchedAt: Date.now() - 40 * MIN, workspaceKey: 'ka', parentSessionId: null, ...x };
    sessions.set(s.sessionId, s);
    if (hooked) { const f = transcriptPathFor(root, cwd, s.sessionId); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, '{}\n'); }
    return s;
  };
  const a1 = add('a1', 'claude');
  const cx = add('cx', 'codex', { harnessPlan: { model: null, args: [], harnessSessionId: null, launchedAt: Date.now() - 60 * MIN } });
  cx.rt.term.agentSessionId = '019a0000-0000-7000-8000-00000000c0de';
  const sl = new Sleeper(b, { timers: false, wakeReadyMs: 3000, settleMs: 10, staggerMs: 30 });
  b.sleeper = sl;
  return { b, sl, a1, cx, add, events, calls, settings, screens };
}
const st = (s) => deriveState(s.rt).state;

test('P170 잠재우기: 쉬는 codex는 Ctrl+C 두 번으로 끝내고 패널을 닫아 잠든다. 대화 ID는 판 기록에 남고 같은 대화로 깬다', async () => {
  const { sl, a1, cx, calls, events } = board();
  assert.equal(sl.summaryExtra(cx).sleepable, true, '메모리 알약·이름표 메뉴가 센다');
  assert.equal(sl.info(cx).convKnown, true);
  await sl.tick();
  assert.deepEqual([st(a1), st(cx)], ['sleeping', 'sleeping']);
  assert.ok(calls.some((c) => c[0] === 'stopHarness' && c[1] === 'cx'));
  assert.equal(cx.paneId, null);
  assert.equal(cx.rt.sleep.convId, '019a0000-0000-7000-8000-00000000c0de');
  assert.equal(cx.harnessPlan.harnessSessionId, '019a0000-0000-7000-8000-00000000c0de', '터미널이 아는 ID를 잠들기 전에 판 기록에 남긴다');
  assert.equal(cx.rt.sleep.scope, 'repo');
  const slept = events.find((e) => e.kind === 'slept' && e.data.name === 'cx');
  assert.ok(slept && slept.data.steps.some((x) => /codex exit/.test(x)));
  assert.equal(sl.summaryExtra(cx).sleep.scope, 'repo');
  // 노드를 누르면 같은 대화로 깬다(하네스 이어 가기)
  const r = await sl.wakeOne({ session: 'cx', why: 'click' });
  assert.equal(r.woke, true); assert.equal(r.plan, 'resume');
  assert.equal(st(cx), 'ready');
  assert.deepEqual(calls.find((c) => c[0] === 'startHarness'), ['startHarness', 'cx', true, 'wake', '019a0000-0000-7000-8000-00000000c0de']);
  assert.ok(!calls.some((c) => c[0] === 'startAgent' && c[1] === 'cx'), 'claude 실행 인자로 띄우지 않는다');
});

test('P170 잠재우기: 대화 ID를 모르는 codex, 일하는 codex, 입력 칸에 글이 남은 codex는 잠들지 않는다', async () => {
  const one = board();
  one.cx.rt.term.agentSessionId = null;
  await one.sl.tick();
  assert.equal(st(one.cx), 'ready', '대화 ID 없음');
  assert.equal(st(one.a1), 'sleeping', '대상이 아닌 하네스는 리포를 막지 않는다');
  const two = board({ sessMin: 0 });
  applyTermStatus(two.cx.rt, 'working');
  await two.sl.tick();
  assert.deepEqual([st(two.a1), st(two.cx)], ['ready', 'working'], '일하는 하네스는 리포의 일(세션 규칙은 끔)');
  const three = board({ repoMin: 0 });
  three.screens.set(three.cx.paneId, 'OpenAI Codex\n\n› half written prompt\n\n  ? for shortcuts\n');
  await assert.rejects(three.sl.sleepRepoHand({ workspace: 'ka' }).then((r) => { if (r.skipped.length) throw Object.assign(new Error('skipped'), { code: r.skipped[0].reason }); return r; }), (e) => e.code === 'sleep_draft');
  assert.equal(st(three.cx), 'ready');
  assert.ok(three.cx.paneId, '패널은 그대로');
  assert.equal(three.sl.blockOf(three.cx).why, 'draft');
  // 끝내기 키로 끝나지 않으면 미룬다
  const four = board({ repoMin: 0 });
  four.cx.stuck = true;
  const r = await four.sl.sleepRepoHand({ workspace: 'ka' });
  assert.equal(st(four.cx), 'ready'); assert.equal(four.cx.rt.sleep, null);
  assert.ok(r.skipped.some((x) => x.name === 'cx' && x.reason === 'still_running'));
  assert.equal(four.sl.blockOf(four.cx).why, 'sleep_failed');
});

test('P170 세션 규칙: 리포가 바빠도 오래 쉰 codex는 혼자 잠든다', async () => {
  const { sl, a1, cx } = board();
  applyTermStatus(a1.rt, 'working');
  await sl.tick();
  assert.deepEqual([st(a1), st(cx)], ['working', 'sleeping']);
  assert.equal(cx.rt.sleep.scope, 'session');
  assert.ok(sl.status().repos[0].each.some((x) => x.name === 'cx' && x.scope === 'session'));
});

test('P170 보는 중 시간 제한: 손댄 지 절전 시간이 지난 창의 보기는 세지 않는다. 다시 손대면 다시 센다. 손으로 잠재우기는 보기를 보지 않는다', async () => {
  const { sl, a1, cx, settings } = board();
  const view = sl.handlers['board.viewing'];
  const c = {};
  view({ focus: cx.sessionId, close: [a1.sessionId], inputAgoMs: 0 }, c);
  assert.equal(sl.info(cx).viewed, true);
  await sl.tick();
  assert.deepEqual([st(a1), st(cx)], ['ready', 'ready'], '지금 손대는 창이 보는 노드');
  assert.equal(sl.plan('ka').why, 'viewing');
  // 손대지 않은 지 31분: 그 창의 보기는 세지 않고, 시계는 손댄 때부터 센다(곧 잠든다)
  sl.inputAt.set(c, Date.now() - 31 * MIN);
  sl.busyAt.set('ka', Date.now() - 31 * MIN); sl.sessBusyAt.clear();
  assert.equal(sl.info(cx).viewed, false);
  assert.equal(sl.plan('ka').why, null);
  // 다시 손대면(창이 새 inputAgoMs를 알림) 다시 센다
  view({ focus: cx.sessionId, close: [a1.sessionId], inputAgoMs: 1000 }, c);
  assert.equal(sl.info(cx).viewed, true);
  assert.equal(sl.plan('ka').why, 'viewing');
  // 판 터미널로 친 키도 손댄 것이다
  sl.inputAt.set(c, Date.now() - 31 * MIN);
  sl.noteInput(c);
  assert.equal(sl.info(cx).viewed, true);
  // 손대지 않는 창이 보는 동안 리포가 잠든다(tick)
  sl.inputAt.set(c, Date.now() - 31 * MIN); sl.busyAt.set('ka', Date.now() - 31 * MIN); sl.sessBusyAt.clear();
  await sl.tick();
  assert.deepEqual([st(a1), st(cx)], ['sleeping', 'sleeping']);
  // 세션 절전 시간이 0이면 리포 절전 시간으로 센다
  settings.sessionSleepAfterMin = 0; settings.sleepAfterMin = 45;
  assert.equal(sl.viewLimitMs(), 45 * MIN);
  settings.sleepAfterMin = 0;
  assert.equal(sl.viewLimitMs(), 0, '둘 다 끄면 제한 없음');
});

test('P170 보는 중 시간 제한: 손대는 때를 알리지 않는 창(옛 창)은 늘 보는 것으로 세고, 손으로 잠재우기는 보기를 보지 않는다', async () => {
  const { sl, a1, cx } = board();
  const c = {};
  sl.handlers['board.viewing']({ focus: cx.sessionId }, c);
  sl.busyAt.set('ka', Date.now() - 31 * MIN);
  assert.equal(sl.info(cx).viewed, true);
  assert.equal(sl.plan('ka').why, 'viewing');
  const r = await sl.sleepRepoHand({ workspace: 'ka' });
  assert.equal(r.slept, 2);
  assert.deepEqual([st(a1), st(cx)], ['sleeping', 'sleeping']);
});

test('P170 보는 중 시간 제한: 붙은 터미널도 그 창에서 손댄 때로 센다(relay.clientsOf)', () => {
  const ctl = new EventEmitter(); ctl.pid = 1; ctl.input = () => {}; ctl.resize = () => {}; ctl.close = () => {}; ctl.exited = null;
  const relay = new TerminalRelay({ adapter: { openController: () => ctl }, onInput: () => {} });
  const { b, sl, cx } = board();
  b.relay = relay;
  const c = { send: () => {}, sendEvent: () => {}, sendBinary: () => {}, clientId: 'w1' };
  relay.attach(cx, 100, 30, c);
  assert.deepEqual(relay.clientsOf(cx.sessionId), [c]);
  assert.equal(sl.info(cx).viewed, true, '알리지 않는 창');
  sl.inputAt.set(c, Date.now() - 31 * MIN);
  assert.equal(sl.info(cx).viewed, false, '손대지 않은 지 오래된 창');
  sl.inputAt.set(c, Date.now() - 1 * MIN);
  assert.equal(sl.info(cx).viewed, true);
  sl.dropClient(c);
  assert.equal(sl.inputAt.has(c), false);
});
