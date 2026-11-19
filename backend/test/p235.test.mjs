// P235(rig2-design 11.17): 판이 연 회의 scoped 자리 PermissionRequest에 판이 deny(글)로 답하고 같은 걸음에 장부 gate reject(1).
// 거절 여부는 설정 파일이 아니라 자리가 지금 하는 회(마지막으로 넣은 일의 회)로 정한다: 판이 연 회 → deny, 요청 회 → 빈 답(응답 필요), 가를 수 없으면 묻는다(2).
// request·every 둘의 입구인 keep 자리도 자리를 나누지 않고 돈다(rig check 경고 없음). denyInsteadOfPrompting은 판이 연 회를 위해 띄운 fresh 자리에만(3). 지금 돌리기는 deny(4)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig } from '../src/rig.mjs';
import { writeSessionSettings } from '../src/launch.mjs';
import { newRuntime, applyTermStatus } from '../src/state.mjs';
import { Backend } from '../src/backend.mjs';
import { UnitStops, REFUSE_FLASH_MS } from '../src/unit-stops.mjs';
import { RigAmp, seatRunOf, permissionDenyBody, BOARD_DENY_MESSAGE } from '../src/rig-amp.mjs';
import { SCOPED_SHELL_LINE, DENY_SHELL_LINE, NO_MANAGER_LINE, RigFlow } from '../src/rig-flow.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p235-'));
const ALLOW = ['Bash(git status:*)'];
// 자리: checker(fresh, every 고리 check의 입구), reviewer(fresh, request 고리 work의 흐름 줄 받는 자리), main(keep, request 고리 입구),
//   watch(keep, every 고리 watch의 입구), dual(keep, request 고리 ask2와 every 고리 tick 둘의 입구), asker(keep, ask 권한, every 고리 poll의 입구), robot(keep, unattended, every 고리 sweep의 입구)
const DEF = () => ({
  version: 2, name: 'p235',
  seats: {
    main: { launcher: 'claude', session: 'keep', permission: 'scoped', allow: ALLOW },
    reviewer: { launcher: 'claude', session: 'fresh', permission: 'scoped', allow: ALLOW, writes: ['reports/'] },
    checker: { launcher: 'claude', session: 'fresh', permission: 'scoped', allow: ALLOW, writes: ['reports/'] },
    watch: { launcher: 'claude', session: 'keep', permission: 'scoped', allow: ALLOW },
    dual: { launcher: 'claude', session: 'keep', permission: 'scoped', allow: ALLOW },
    asker: { launcher: 'claude', session: 'keep' },
    robot: { launcher: 'claude', session: 'keep', permission: 'unattended', writes: ['out/'] },
  },
  loops: {
    work: { kind: 'work', trigger: { request: 'main' }, entry: 'main', flow: [{ from: 'main', on: 'assign', to: 'reviewer' }] },
    check: { kind: 'work', trigger: { every: '7d' }, entry: 'checker', task: 'check' },
    watch: { kind: 'work', trigger: { every: '7d' }, entry: 'watch', task: 'watch' },
    ask2: { kind: 'work', trigger: { request: 'dual' }, entry: 'dual' },
    tick: { kind: 'work', trigger: { every: '7d' }, entry: 'dual', task: 'tick' },
    poll: { kind: 'work', trigger: { every: '7d' }, entry: 'asker', task: 'poll' },
    sweep: { kind: 'work', trigger: { every: '7d' }, entry: 'robot', task: 'sweep' },
  },
});

async function board({ def = DEF() } = {}) {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.atrium'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.atrium', 'rig.json'), JSON.stringify(def, null, 2));
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  store.setRigEnabled(ws.key, true);
  const logs = [];
  const b = { cfg: { hookTimeoutSec: 2, sessionsDir: path.join(dir, 'sessions') }, store, sessions: new Map(), log: (...a) => logs.push(a.join(' ')) };
  b.rig = new Rig(b);
  b.rigAmp = new RigAmp(b);
  let n = 0;
  const add = (name, { seat = null, kind = 'claude', run = null } = {}) => {
    const s = { sessionId: `sid-${name}-${++n}`, name, kind, cwd: dir, workspaceKey: ws.key, rigSeat: seat, hookToken: `tok-${name}`, rt: newRuntime({ kind, hooked: true }), ...(run ? { rigRun: run } : {}) };
    s.rt.cwd = dir;
    s.settingsPath = writeSessionSettings({ file: path.join(dir, 'sessions', `${s.sessionId}.json`), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: s.hookToken, sessionId: s.sessionId, amp: b.rigAmp.claudeAmp(s) });
    b.sessions.set(s.sessionId, s);
    return s;
  };
  const openCase = (s, loop) => {
    const id = `c${++n}`;
    store.insertCase({ id, workspaceKey: ws.key, owner: s.sessionId, state: 'open', createdAt: Date.now(), versionN: null, loop });
    store.insertCaseItem({ caseId: id, sessionId: s.sessionId, seat: s.rigSeat, worktree: null, worktreePath: null });
    return id;
  };
  const settings = (s) => JSON.parse(fs.readFileSync(s.settingsPath, 'utf8')).permissions || {};
  const gates = () => store.rigEvents({ ws: ws.key, limit: 1000 }).filter((e) => e.kind === 'gate');
  return { dir, store, ws, b, add, openCase, settings, gates, logs };
}

// 자리 세션에 일(시도)을 넣는다: 그 회의 일 → 열린 시도. via.now면 지금 돌리기
function deliver(B, s, caseId, { now = null } = {}) {
  const id = `u${Math.random().toString(16).slice(2, 8)}`;
  B.store.insertUnit({ id, from: s.sessionId, to: s.sessionId, origin: 'cycle', spec: 'x', status: 'open', createdAt: Date.now(), caseId, seat: s.rigSeat, via: { by: s.sessionId, ...(now ? { loop: 'x', now } : {}) } });
  const tr = { id: `t${id}`, unitId: id, sessionId: s.sessionId, header: true, deliveryId: `d${id}`, startedAt: Date.now() - 5 };
  B.store.insertTry(tr);
  return tr;
}
const endTry = (B, tr) => B.store.updateTry(tr.id, { endedAt: Date.now(), result: 'ok' });
const newCase = (B, s, loop) => { const id = `c${Math.random().toString(16).slice(2, 8)}`; B.store.insertCase({ id, workspaceKey: B.ws.key, owner: s.sessionId, state: 'open', createdAt: Date.now(), versionN: null, loop }); return id; };

function hookBackend(B) {
  const be = Object.create(Backend.prototype);
  const casts = [];
  Object.assign(be, {
    sessions: B.b.sessions, store: B.store, rigAmp: B.b.rigAmp, log: () => {}, probeGit: () => {}, onLinkTargetPrompt: () => {}, rigDocs: null,
    api: { broadcast: (n, d) => casts.push({ n, d }) }, queue: { onUserPromptSubmit: () => null }, readChoicesLater: () => {}, recheckBlockedLater: () => {}, refreshModelNow: () => {}, broadcastSession: () => {}, web: null,
  });
  return { be, casts };
}
const reqBody = (s, cmd, id) => JSON.stringify({ hook_event_name: 'PermissionRequest', session_id: s.sessionId, tool_name: 'Bash', tool_input: { command: cmd }, tool_use_id: id, permission_suggestions: [] });
const hdr = (s) => ({ 'x-mt-session': s.sessionId, authorization: `Bearer ${s.hookToken}` });
// 판의 hook 받기를 끝까지: ampTarget → answerHook(응답 본문) → processHook(장부·응답 필요)
async function sendHook(be, s, raw) {
  const wait = be.ampTarget(hdr(s), raw);
  let out = null;
  if (wait) {
    const res = { writableEnded: false, destroyed: false, head: null, body: '', writeHead(c, h) { this.head = { c, h }; }, end(b) { this.body = b || ''; this.writableEnded = true; } };
    await be.answerHook(wait, res);
    out = res.body ? JSON.parse(res.body) : {};
  }
  be.processHook(hdr(s), raw, wait);
  return { wait, out };
}

// ---------- 1. 판이 deny로 답하는 꼴 ----------
test('P235 PermissionRequest 거절 본문: hookSpecificOutput.decision { behavior deny, message }(2.1.328 헤드리스 확인한 꼴)', () => {
  assert.equal(BOARD_DENY_MESSAGE, 'rig: 허용 목록 밖이라 거절했다(판이 연 회라 묻지 않는다). 하지 못한 것은 보고에 적는다.');
  assert.deepEqual(permissionDenyBody(), { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: BOARD_DENY_MESSAGE } } });
});

// ---------- 2. 회별 판정 ----------
test('P235 회별 판정: request·every 둘의 입구인 keep 자리. every 회 → deny와 gate 한 걸음, 요청 회 → 빈 답과 응답 필요, 시도 없음 → 묻기', async () => {
  const B = await board();
  const { be, casts } = hookBackend(B);
  const dual = B.add('dual', { seat: 'dual' });
  const amp = B.b.rigAmp;
  // 시도가 없으면 회를 모른다 → 묻는다
  assert.deepEqual(amp.permissionVerdict(dual), { deny: false, why: 'unknown', loop: null, caseId: null });
  // every 고리(tick)의 회
  const cTick = newCase(B, dual, 'tick');
  const tr1 = deliver(B, dual, cTick);
  assert.deepEqual(amp.permissionVerdict(dual), { deny: true, why: 'every', loop: 'tick', caseId: cTick });
  const r1 = await sendHook(be, dual, reqBody(dual, 'mkdir zz', 'tu1'));
  assert.ok(r1.wait, '판이 기다려 답한다');
  assert.deepEqual(r1.out, permissionDenyBody());
  assert.equal(dual.rt.pendingAsk, null, '응답 필요에 두지 않는다');
  let g = B.gates();
  assert.equal(g.length, 1);
  assert.deepEqual({ value: g[0].value, at: g[0].data.at, target: g[0].data.target, via: g[0].data.via, why: g[0].data.why, loop: g[0].data.loop, caseId: g[0].caseId, seat: g[0].seat }, { value: 'reject', at: 'permission', target: 'mkdir zz', via: 'board', why: 'every', loop: 'tick', caseId: cTick, seat: 'dual' });
  assert.match(g[0].text, /^permission: Bash 묻지 않고 거절: mkdir zz$/);
  assert.equal(casts.find((c) => c.n === 'session.hook').d.refused, true);
  endTry(B, tr1);
  // 같은 자리, 요청 고리(ask2)의 회 → 빈 답(Claude Code가 묻는다), 응답 필요
  const cAsk = newCase(B, dual, 'ask2');
  deliver(B, dual, cAsk);
  assert.deepEqual(amp.permissionVerdict(dual), { deny: false, why: 'request', loop: 'ask2', caseId: cAsk });
  const r2 = await sendHook(be, dual, reqBody(dual, 'mkdir yy', 'tu2'));
  assert.equal(r2.wait, null, '판은 먼저 빈 200을 준다(결정 없음)');
  assert.equal(dual.rt.pendingAsk && dual.rt.pendingAsk.kind, 'permission', '응답 필요');
  assert.equal(B.gates().length, 1, '요청 회는 거절로 적지 않는다');
  // 설정 파일에는 받침이 없다(keep 자리)
  assert.equal(B.b.rigAmp.syncSettings(dual), false);
  assert.equal(B.settings(dual).denyInsteadOfPrompting, undefined);
});

test('P235 회별 판정: 지금 돌리기(via.now)는 판이 연 회(deny), 회 밖 글이 들어오면 그 시도 동안 묻는다(가를 수 없음), 다음 시도에서 다시 가린다', async () => {
  const B = await board();
  const { be } = hookBackend(B);
  const amp = B.b.rigAmp;
  const watch = B.add('watch', { seat: 'watch' });
  const c1 = newCase(B, watch, 'watch');
  const tr = deliver(B, watch, c1, { now: 'human' });
  assert.equal(amp.permissionVerdict(watch).why, 'now');
  assert.equal(amp.permissionVerdict(watch).deny, true);
  // 판의 전달(그 시도의 머리, 판 알림, 에이전트 글)은 그 회의 글이다
  assert.equal(amp.notePrompt(watch, `[Atrium 보드] 자리 watch, 일 ${tr.unitId}\n\nx`, null), false);
  assert.equal(amp.notePrompt(watch, 'hello', { deliveryId: 'dx', origin: 'agent' }), false);
  assert.equal(amp.permissionVerdict(watch).deny, true);
  // 사람이 보낸 글(판 전달 origin human) 또는 판을 거치지 않고 친 글 → 회를 가를 수 없다 → 묻는다
  watch.rigForeignAt = null;
  const raw = JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: watch.sessionId, prompt: 'please also mkdir q' });
  be.queue.onUserPromptSubmit = () => ({ deliveryId: 'dh', origin: 'human' });
  be.processHook(hdr(watch), raw);
  assert.deepEqual(amp.permissionVerdict(watch), { deny: false, why: 'foreign', loop: 'watch', caseId: c1 });
  const r = await sendHook(be, watch, reqBody(watch, 'mkdir q', 'tu9'));
  assert.equal(r.wait, null);
  assert.equal(watch.rt.pendingAsk && watch.rt.pendingAsk.kind, 'permission', '진짜 질문은 거절로 숨지 않는다');
  assert.equal(B.gates().length, 0);
  // 그 시도가 닫히고 다음 every 회가 오면 다시 deny
  endTry(B, tr);
  await new Promise((res) => setTimeout(res, 5));
  deliver(B, watch, newCase(B, watch, 'watch'));
  const tr2 = B.store.openTryOf(watch.sessionId);
  B.store.st('UPDATE unit_tries SET started_at = ? WHERE id = ?').run(Date.now() + 1, tr2.id); // 시도 시작이 회 밖 글보다 뒤
  assert.equal(amp.permissionVerdict(watch).deny, true);
});

test('P235 회별 판정: scoped만. ask 자리·승인된 unattended·rig 밖은 판이 답하지 않는다. fresh 자리는 그 세션의 회(받침이 있으면 늘 deny)', async () => {
  const B = await board();
  const amp = B.b.rigAmp;
  const asker = B.add('asker', { seat: 'asker' });
  deliver(B, asker, newCase(B, asker, 'poll'));
  assert.deepEqual(amp.permissionVerdict(asker), { deny: false, why: 'permission', loop: null, caseId: null });
  assert.equal(amp.permissionVerdict(B.add('loose')).why, 'no_seat');
  assert.equal(amp.wants(B.add('loose2'), 'PermissionRequest'), false);
  // 승인 전 unattended(keep)는 scoped로 돌아 회로 정한다
  const robot = B.add('robot', { seat: 'robot' });
  deliver(B, robot, newCase(B, robot, 'sweep'));
  assert.equal(amp.permissionVerdict(robot).deny, true);
  assert.equal(B.settings(robot).denyInsteadOfPrompting, undefined, 'keep 자리에는 받침이 없다');
  // fresh: 받침이 있는 판이 연 회의 세션은 늘 deny(회 밖 글이 와도 Claude Code가 거절하므로 판도 거절로 적는다)
  const chk = B.add('checker-1', { seat: 'checker', run: { loop: 'check' } });
  assert.equal(B.settings(chk).denyInsteadOfPrompting, true);
  assert.deepEqual(amp.permissionVerdict(chk), { deny: true, why: 'fresh', loop: 'check', caseId: null });
  chk.rigForeignAt = Date.now() + 1000;
  assert.equal(amp.permissionVerdict(chk).deny, true);
  // fresh 요청 회의 자리: 받침 없음, 묻는다
  const rev = B.add('reviewer-1', { seat: 'reviewer', run: { loop: 'work' } });
  assert.equal(B.settings(rev).denyInsteadOfPrompting, undefined);
  assert.equal(amp.permissionVerdict(rev).why, 'request');
});

// ---------- 3. 받침과 rig check ----------
test('P235 받침: denyInsteadOfPrompting은 판이 연 회의 fresh 자리 설정에만. keep 자리는 every만 닿아도, 섞여도 없다. 섞인 keep 자리에 rig check 경고 없음', async () => {
  const B = await board();
  const { add, settings, b, ws } = B;
  assert.equal(settings(add('checker-1', { seat: 'checker', run: { loop: 'check' } })).denyInsteadOfPrompting, true);
  for (const seat of ['main', 'watch', 'dual', 'robot']) {
    const s = add(seat, { seat });
    assert.equal(settings(s).denyInsteadOfPrompting, undefined, seat);
    // every 회의 시도가 열려도 설정 파일은 바뀌지 않는다(Claude Code가 세션 중 --settings를 다시 읽는지에 기대지 않는다)
    if (seat !== 'main') { deliver(B, s, newCase(B, s, seat === 'dual' ? 'tick' : seat === 'watch' ? 'watch' : 'sweep')); b.rigAmp.syncSettings(s); assert.equal(settings(s).denyInsteadOfPrompting, undefined, seat); }
    assert.equal(settings(s).disableAutoMode, 'disable');
  }
  // 옛 판이 keep 자리 파일에 남긴 받침은 다시 맞출 때 뺀다
  const w2 = add('watch-old', { seat: 'watch' });
  const j = JSON.parse(fs.readFileSync(w2.settingsPath, 'utf8')); j.permissions.denyInsteadOfPrompting = true; fs.writeFileSync(w2.settingsPath, JSON.stringify(j));
  w2.ampSig = null;
  assert.equal(b.rigAmp.syncSettings(w2), true);
  assert.equal(settings(w2).denyInsteadOfPrompting, undefined);
  // rig check: request·every 둘의 입구인 keep 자리(dual)에 경고가 없다
  const def = b.rig.active(ws.key).def;
  assert.deepEqual((def.warnings || []).filter((w) => /dual|mixed|섞/.test(w)), []);
  assert.equal(seatRunOf(def, 'dual').why, 'mixed', '자리 알림(회를 모를 때)은 그대로 묻는 쪽 줄');
});

// ---------- 4. 일 머리 줄은 그 회의 계기 ----------
test('P235 일 머리 줄: keep 자리도 그 일의 회로 정한다(every 회 → 묻지 않고 거절 줄, 요청 회 → 묻는 줄)', async () => {
  const B = await board();
  const def = B.b.rig.active(B.ws.key).def;
  assert.deepEqual(seatRunOf(def, 'dual', { loop: 'tick' }), { promptless: true, why: 'every', loops: ['tick'] });
  assert.deepEqual(seatRunOf(def, 'dual', { loop: 'ask2' }), { promptless: false, why: 'request', loops: ['ask2'] });
  const dual = B.add('dual', { seat: 'dual' });
  const flow = Object.create(RigFlow.prototype);
  flow.b = B.b; flow.store = () => B.store;
  assert.deepEqual(flow.extraLinesOf(B.ws.key, def, 'dual', { caseId: newCase(B, dual, 'tick') }), [DENY_SHELL_LINE, NO_MANAGER_LINE]);
  assert.deepEqual(flow.extraLinesOf(B.ws.key, def, 'dual', { caseId: newCase(B, dual, 'ask2') }), [SCOPED_SHELL_LINE, NO_MANAGER_LINE]);
  assert.deepEqual(flow.extraLinesOf(B.ws.key, def, 'dual'), [SCOPED_SHELL_LINE, NO_MANAGER_LINE]);
});

// ---------- 5. 거절 직후 화면의 잠깐 막힘 ----------
test('P235 거절 직후 화면이 잠깐 막힘(묻는 훅 없음)으로 읽혀도 바로 needs_human으로 적지 않는다. 막힘이 남으면 잠시 뒤 적는다', async () => {
  const tr = { id: 't1', unitId: 'u1', sessionId: 's1', header: true, deliveryId: 'd1' };
  const recorded = [];
  const prev = new Map();
  const units = { prev, recordStop: (s, t, why) => recorded.push([t.id, why]), nameOf: () => 'x', waiters: new Map() };
  const store = { openTryOf: () => tr, getDelivery: () => ({ status: 'confirmed' }), getUnit: () => ({ id: 'u1', from: 'HUMAN-none', to: 's1', spec: 'x', status: 'open' }), addEvent: () => {} };
  const b = { sessions: new Map([['s1', {}]]), store, log: () => {} };
  const us = new UnitStops(b, units, { batchMs: 10 });
  const s = { sessionId: 's1', rigRefusedAt: Date.now(), rt: {} };
  const blocked = { state: 'waiting', ask: { kind: 'unknown_dialog' } };
  // 잔상: 막힘이 곧 풀린다 → 적지 않는다
  prev.set('s1', 'waiting');
  assert.equal(us.onState(s, blocked, 'working', tr), null);
  prev.set('s1', 'working');
  // 진짜 막힘: 남아 있다 → 잠시 뒤 적는다
  s.rigRefusedAt = Date.now();
  assert.equal(us.onState(s, blocked, 'working', tr), null);
  prev.set('s1', 'waiting');
  await new Promise((r) => setTimeout(r, REFUSE_FLASH_MS + 200));
  assert.deepEqual(recorded, [['t1', 'needs_human']]);
  // 권한 질문(훅이 온 ask)이거나 거절이 오래전이면 바로 needs_human
  assert.equal(us.onState(s, { state: 'waiting', ask: { kind: 'permission' } }, 'working', tr), 'needs_human');
  s.rigRefusedAt = Date.now() - REFUSE_FLASH_MS - 1;
  assert.equal(us.onState(s, blocked, 'working', tr), 'needs_human');
  us.stop();
});
