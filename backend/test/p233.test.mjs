// P233(rig2-design 11.15): rig 자리 권한 질문은 이번 한 번만(1, 보안), follows는 같은 요청자의 앞 회(3), 켜기 확인의 정본 차이(6), settings.local.json 훅(8)
// 가짜 판은 p232 틀을 그대로 쓴다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { Rig } from '../src/rig.mjs';
import { RigDocs } from '../src/rig-docs.mjs';
import { rigSetupHandlers, claudeHooksOf } from '../src/rig-setup.mjs';
import { FOLLOW_MS } from '../src/rig-loops.mjs';
import { parseChoices } from '../src/screen.mjs';
import { planAnswer, onceOnlyChoice, onceOnlyAsk, onceOnlyKeys, ONCE_ONLY_WHY } from '../src/answer.mjs';
import { proposalsFor } from '../src/rig-proposals.mjs';
import { Backend } from '../src/backend.mjs';
import { fmtAsk } from '../bin/atrium-fmt.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const GROW = path.join(FX, 'rig-loops-grow');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p233-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const defOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.atrium', 'rig.json'), 'utf8'));
const ledger = (b, key, q = {}) => b.store.rigEvents({ ws: key, limit: 10000, ...q });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const DAY = 86400000;
const MIN = 60000;

// ---------- 가짜 판(p219 틀) ----------
async function board({ dir = tmp(), from = GROW, def = null, enable = true, batchMs = 40 } = {}) {
  fs.cpSync(from, dir, { recursive: true });
  if (def) { const f = path.join(dir, '.atrium', 'rig.json'); fs.writeFileSync(f, JSON.stringify(def, null, 2)); const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t); }
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p233test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, rigCycles: false };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], spawned: [],
    api: { broadcast: (n, d) => { (b.casts || (b.casts = [])).push({ n, d }); } }, log: () => {}, requireTerminal: () => {},
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
  };
  b.rig = new Rig(b);
  b.rigDocs = new RigDocs(b, { pollMs: 50 });
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
  const L = () => b.branch.flow.loops;
  const seat = (s, name) => F().setSeat(s, name);
  const by = (name) => [...b.sessions.values()].find((x) => x.name === name);
  return { b, dir, ws, add, F, L, seat, by, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); b.branch.units.stops.stop(); F().stopCycles(); await tick(200); store.close(); } };
}
const U = (b) => b.branch.units;
const human = { kind: 'human' };
const local = { auth: { kind: 'local' } };
const V = (b) => b.branch.verbs;
const gotUnit = (s) => until(() => s.texts.some((t) => t.includes('[Atrium 보드] 관계:')));

const gotN = (s, n = 1) => until(() => s.texts.filter((t) => t.includes('[Atrium 보드] 관계:')).length >= n);
const done = (b, s, result, text) => U(b).doneVerb(s, { result, text });
const heads = (s) => s.texts.filter((t) => t.includes('[Atrium 보드] 관계:'));
// 요청 하나를 열고 main이 ok로 닫을 때까지 → 회
async function oneRun(t, main, from, text) {
  const n = heads(main).length;
  const r = t.L().onRequest(main, from, text);
  await gotN(main, n + 1);
  await until(() => main.rt.term.status === 'idle');
  await done(t.b, main, 'ok', '했다');
  await until(() => t.b.store.getCase(r.caseId).state === 'done');
  return t.b.store.getCase(r.caseId);
}


// ---------- 1. rig 자리 권한 질문은 이번 한 번만 ----------
// Claude Code 2.1.328 권한 대화상자의 선택지 글(폴더 경로만 C:\Workspace\demo로). 번호는 판마다 다르므로 두 차례로 둔다
const SCREEN_A = [
  ' Bash command',
  '',
  '   git -C C:\\Workspace\\demo log --oneline -5',
  '   Show recent commits',
  '',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. Yes, and switch to auto mode',
  '   3. Yes, and always allow access to C:\\Workspace\\demo\\ from this project',
  "   4. Yes, and don't ask again for git log commands in C:\\Workspace\\demo",
  '   5. No',
  '',
  ' Esc to cancel · Tab to amend',
].join('\n');
const SCREEN_B = [
  ' Read file',
  '',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  "   2. Yes, and don't ask again this session",
  '   3. No, and tell Claude what to do differently (esc)',
].join('\n');

test('P233 선택지 판정: 글이 그냥 Yes이거나 no·거절이면 받고, 이번 호출을 넘어 권한을 바꾸는 선택지는 모두 거절(번호가 아니라 글)', () => {
  assert.equal(onceOnlyChoice('Yes'), 'yes');
  assert.equal(onceOnlyChoice(' yes. '), 'yes');
  assert.equal(onceOnlyChoice('No'), 'no');
  assert.equal(onceOnlyChoice('No, and tell Claude what to do differently (esc)'), 'no');
  for (const l of ['Yes, and switch to auto mode', 'Yes, and always allow access to C:\\Workspace\\demo\\ from this project', "Yes, and don't ask again for git log commands in C:\\Workspace\\demo", 'Yes, allow all edits during this session', 'Yes, and auto-accept edits', 'Always allow', 'Nope?', '']) assert.equal(onceOnlyChoice(l), null, l);
  const a = parseChoices(SCREEN_A);
  assert.deepEqual(a.map((c) => onceOnlyChoice(c.label)), ['yes', null, null, null, 'no']);
  const b = parseChoices(SCREEN_B);
  assert.deepEqual(b.map((c) => onceOnlyChoice(c.label)), ['yes', null, 'no'], '번호가 달라도 글로');
});

test('P233 카드: rig 자리의 ask는 받는 선택지만(번호는 화면 그대로) + onceOnly·hiddenChoices, 선택지를 모르면 표시만', () => {
  const ask = { kind: 'permission', tool: 'Bash', summary: 'Bash: git log', choices: parseChoices(SCREEN_A), since: 1 };
  const v = onceOnlyAsk(ask);
  assert.equal(v.onceOnly, true); assert.equal(v.hiddenChoices, 3);
  assert.deepEqual(v.choices.map((c) => `${c.n}. ${c.label}`), ['1. Yes', '5. No']);
  assert.equal(ask.choices.length, 5, '원래 ask는 그대로');
  const bare = onceOnlyAsk({ kind: 'permission', tool: 'Bash', since: 1 });
  assert.equal(bare.onceOnly, true); assert.equal('choices' in bare, false);
  const q = { kind: 'question', questions: [] };
  assert.equal(onceOnlyAsk(q), q, '권한 질문이 아니면 그대로');
  // atrium ls·watch 줄
  assert.match(fmtAsk(v), /선택지: 1\.Yes \| 5\.No {2}\(rig 자리: 이번 한 번만 받는다, 넓히는 선택지 3개 숨김\)/);
  assert.doesNotMatch(fmtAsk({ ...ask }), /rig 자리/, 'rig 밖은 전과 같다');
});

test('P233 answer: rig 자리는 Yes(번호 키)와 No(esc)만, 넓히는 선택지는 까닭과 함께 거절. rig 밖 세션은 그대로', () => {
  const ask = { kind: 'permission', tool: 'Bash', choices: parseChoices(SCREEN_A), since: 1 };
  const O = { onceOnly: true };
  assert.deepEqual(planAnswer(ask, { choice: 1 }, O).steps, [{ keys: ['1'] }]);
  assert.deepEqual(planAnswer(ask, { choice: 5 }, O).steps, [{ keys: ['esc'] }]);
  assert.deepEqual(planAnswer(ask, { choice: 'reject' }, O).steps, [{ keys: ['esc'] }]);
  assert.equal(planAnswer(ask, { choice: 'amend', text: '짧게' }, O).steps[0].keys[0], 'tab', '덧붙이기는 1번(Yes)');
  for (const n of [2, 3, 4]) {
    assert.throws(() => planAnswer(ask, { choice: n }, O), (e) => e.code === 'rig_once_only' && e.message.startsWith(ONCE_ONLY_WHY) && e.message.includes(`${n}. Yes, and`));
  }
  assert.equal(ONCE_ONLY_WHY, 'rig 자리는 한 번만 허락한다. 늘 허락하려면 rig 고치기에서 자리의 허용 목록(allow)에 더한다.');
  const askB = { kind: 'permission', tool: 'Read', choices: parseChoices(SCREEN_B), since: 1 };
  assert.throws(() => planAnswer(askB, { choice: 2 }, O), /rig 자리는 한 번만/);
  assert.deepEqual(planAnswer(askB, { choice: 3 }, O).steps, [{ keys: ['esc'] }]);
  // 선택지를 아직 못 읽었으면 1(승인)만(전과 같음)
  assert.deepEqual(planAnswer({ kind: 'permission', since: 1 }, { choice: 1 }, O).steps, [{ keys: ['1'] }]);
  // rig 밖: 그대로
  assert.deepEqual(planAnswer(ask, { choice: 2 }).steps, [{ keys: ['2'] }]);
  assert.deepEqual(planAnswer(ask, { choice: 3 }).steps, [{ keys: ['3'] }]);
});

test('P233 휴대폰 키 패드(session.keys): rig 자리의 권한 질문에는 받는 선택지의 번호만, 화살표는 거절. esc·enter·tab은 그대로', () => {
  const ask = { kind: 'permission', choices: parseChoices(SCREEN_A), since: 1 };
  assert.deepEqual(onceOnlyKeys(ask, ['1']), ['1']);
  assert.deepEqual(onceOnlyKeys(ask, ['5']), ['5']);
  assert.deepEqual(onceOnlyKeys(ask, ['esc', 'enter', 'tab', 'space']), ['esc', 'enter', 'tab', 'space']);
  for (const k of ['2', '3', '4']) assert.throws(() => onceOnlyKeys(ask, [k]), /rig 자리는 한 번만/);
  assert.throws(() => onceOnlyKeys(ask, ['down', 'enter']), /화살표 대신 번호나 Esc/);
  assert.throws(() => onceOnlyKeys(ask, ['up']), /rig_once_only|rig 자리/);
  assert.throws(() => onceOnlyKeys(ask, ['9']), /rig 자리는 한 번만/, '없는 번호');
  assert.deepEqual(onceOnlyKeys({ kind: 'permission' }, ['1']), ['1'], '선택지를 모르면 1만');
  assert.throws(() => onceOnlyKeys({ kind: 'permission' }, ['2']), /rig 자리는 한 번만/);
});

// 판(backend.mjs)의 answer·sendKeysTo·askView를 가짜 this로 부른다
function fakeBackend(s, perm) {
  const sent = []; const events = []; const paneKeys = [];
  const b = {
    cfg: { answerStepMs: 0 }, sessions: new Map([[s.sessionId, s]]),
    rigAmp: { seatPermission: (key, seat) => (perm ? { permission: perm, asked: perm } : null) },
    resolve: () => s, requireTerminal: () => {}, hooked: () => true, checkBlocked: async () => {}, touch: () => {},
    adapter: { getAgent: async () => ({ status: 'blocked' }), sendKeys: async (n, keys) => sent.push(keys), sendText: async () => {}, paneKeys: async (p, keys) => paneKeys.push(keys) },
    keyChain: (id, fn) => fn(), peers: { touch: () => {} },
    store: { addEvent: (sid, kind, rec) => events.push({ kind, rec }) }, api: { broadcast: () => {} },
  };
  Object.setPrototypeOf(b, Backend.prototype);
  return { b, sent, events, paneKeys };
}
const seatSession = (extra = {}) => { const rt = newRuntime({ kind: 'claude', hooked: true }); rt.term.present = true; applyTermStatus(rt, 'blocked'); rt.pendingAsk = { kind: 'permission', tool: 'Bash', toolUseId: 'tu1', summary: 'Bash: git log', choices: parseChoices(SCREEN_A), since: 5 }; return { sessionId: 's1', name: 'main', agentName: 'main', paneId: 'main:p1', kind: 'claude', workspaceKey: 'ws', rt, ...extra }; };

test('P233 판: scoped·ask rig 자리는 한 번만(카드의 ask, atrium answer 거절, 키 패드 거절), unattended 자리와 rig 밖 세션은 그대로', async () => {
  for (const perm of ['scoped', 'ask', null]) {
    const s = seatSession({ rigSeat: 'main' });
    const { b, sent, paneKeys } = fakeBackend(s, perm);
    assert.equal(b.onceOnly(s), true, String(perm));
    const v = b.askView(s, { ...s.rt.pendingAsk });
    assert.deepEqual(v.choices.map((c) => c.n), [1, 5]); assert.equal(v.onceOnly, true);
    await assert.rejects(b.answer({ session: 'main', choice: 2, toolUseId: 'tu1' }), (e) => e.code === 'rig_once_only' && /rig 고치기에서 자리의 허용 목록/.test(e.message));
    assert.equal(sent.length, 0, '거절하면 키를 보내지 않는다');
    const ok = await b.answer({ session: 'main', choice: 1, toolUseId: 'tu1' });
    assert.equal(ok.sent, true); assert.deepEqual(sent, [['1']]);
    s.rt.pendingAsk = { kind: 'permission', tool: 'Bash', toolUseId: 'tu2', choices: parseChoices(SCREEN_A), since: 6 };
    await assert.rejects(b.sendKeysTo({ session: 'main', keys: ['3'] }, null), /rig 자리는 한 번만/);
    await assert.rejects(b.sendKeysTo({ session: 'main', keys: ['down'] }, null), /rig 자리는 한 번만/);
    assert.equal(paneKeys.length, 0);
    await b.sendKeysTo({ session: 'main', keys: ['esc'] }, null);
    assert.deepEqual(paneKeys, [['esc']]);
  }
  // unattended 자리(사람이 승인함)와 rig 밖 세션: 그대로
  for (const [extra, perm] of [[{ rigSeat: 'main' }, 'unattended'], [{}, 'scoped']]) {
    const s = seatSession(extra);
    const { b, sent, paneKeys } = fakeBackend(s, perm);
    assert.equal(b.onceOnly(s), false);
    const v = b.askView(s, { ...s.rt.pendingAsk });
    assert.equal(v.choices.length, 5); assert.equal(v.onceOnly, undefined);
    const r = await b.answer({ session: 'main', choice: 2, toolUseId: 'tu1' });
    assert.equal(r.sent, true); assert.deepEqual(sent, [['2']]);
    s.rt.pendingAsk = { kind: 'permission', tool: 'Bash', toolUseId: 'tu2', choices: parseChoices(SCREEN_A), since: 6 };
    await b.sendKeysTo({ session: 'main', keys: ['3'] }, null);
    assert.deepEqual(paneKeys, [['3']]);
  }
  // 권한 질문이 아닌 질문(AskUserQuestion)은 rig 자리여도 그대로
  const s = seatSession({ rigSeat: 'main' });
  s.rt.pendingAsk = { kind: 'question', questions: [{ question: 'Q?', options: ['a', 'b', 'c'], multiSelect: false }], since: 7 };
  const { b, paneKeys } = fakeBackend(s, 'scoped');
  await b.sendKeysTo({ session: 'main', keys: ['3'] }, null);
  assert.deepEqual(paneKeys, [['3']]);
});

// ---------- 2. follows: 같은 요청자의 앞 회 ----------
test('P233 이어진 회: 같은 고리에서 같은 요청자의 가장 늦게 닫힌 회가 30분 안이면 follows, 그사이 다른 요청자의 회가 닫혀도 이어진다', async () => {
  const t = await board();
  const { b, ws, add, seat, stop } = t;
  try {
    const main = add('main'); seat(main, 'main');
    const other = add('other');
    const c1 = await oneRun(t, main, human, '첫 요청: CHANGELOG 줄 써 줘');
    const c2 = await oneRun(t, main, { kind: 'agent', session: other }, '다른 세션의 요청');
    assert.equal(c2.follows, null, '요청자가 다르다');
    const c3 = await oneRun(t, main, human, '범위를 넓히지 말고 다시');
    assert.equal(c3.follows, c1.id, '사이에 다른 요청자의 회(c2)가 닫혀도 사람의 앞 회 c1에 이어진다');
    const open = ledger(b, ws.key, { kinds: ['case_open'] });
    assert.equal(open.find((r) => r.caseId === c3.id).data.follows, c1.id);
    const c4 = await oneRun(t, main, { kind: 'agent', session: other }, '같은 세션이 다시');
    assert.equal(c4.follows, c2.id, '다른 세션도 자기 앞 회에');
    const c5 = await oneRun(t, main, human, '한 번 더');
    assert.equal(c5.follows, c3.id, '같은 요청자의 가장 늦게 닫힌 회');
    // 사람의 마지막 회가 30분을 넘었으면, 다른 요청자의 회가 30분 안이어도 이어지지 않는다
    for (const c of [c1, c3, c5]) b.store.updateCase(c.id, { closedAt: Date.now() - FOLLOW_MS - 1000 });
    const c6 = await oneRun(t, main, human, '한참 뒤');
    assert.equal(c6.follows, null, '30분 넘음');
  } finally { await stop(); }
});

// ---------- 3. 켜기 확인의 정본 차이 ----------
test('P233 켜기 확인의 정본 차이: 처음 켤 때는 없고, 껐다가 정본이 마지막 승인 내용과 달라지면 rig.status·rig.get의 canonDrift(+n −m, 차이). 켜면 지금 내용이 기준', async () => {
  const t = await board({ enable: false });
  const { b, ws, dir, stop } = t;
  proposalsFor(b);
  try {
    const f = path.join(dir, 'docs', 'rules.txt');
    fs.writeFileSync(f, '# Rules\n\n- one\n- two\n');
    // 처음 켜기 전: 견줄 것이 없다(손으로 쓴 첫 규칙이 있어도)
    b.store.setDocMark(ws.key, 'rules', { path: 'docs/rules.txt', approvedSha: crypto.createHash('sha256').update('# 규칙\n').digest('hex'), approvedText: '# 규칙\n', approvedAt: 1, approvedBy: 'first_seen' });
    assert.deepEqual(b.rig.status(ws.key).canonDrift, [], '처음 켤 때는 보이지 않는다');
    assert.deepEqual((await rigSetupHandlers(b)['rig.get']({ workspace: ws.key }, local)).canonDrift, []);
    b.rig.setEnabled(ws.key, true, 'human');
    assert.deepEqual(b.rig.status(ws.key).canonDrift, [], '켜져 있으면 없다');
    b.rig.setEnabled(ws.key, false, 'human');
    assert.deepEqual(b.rig.status(ws.key).canonDrift, [], '꺼도 정본이 그대로면 없다');
    // 꺼진 동안(또는 켜져 있던 동안 승인 없이) 바뀜
    fs.writeFileSync(f, '# Rules\n\n- one\n- TWO\n- three\n');
    const d = b.rig.status(ws.key).canonDrift;
    assert.equal(d.length, 1);
    assert.equal(d[0].doc, 'rules'); assert.equal(d[0].path, 'docs/rules.txt');
    assert.equal(d[0].added, 2); assert.equal(d[0].removed, 1);
    assert.match(d[0].diff, /^-- two$/m); assert.match(d[0].diff, /^\+- three$/m);
    const g = await rigSetupHandlers(b)['rig.get']({ workspace: ws.key }, local);
    assert.equal(g.canonDrift.length, 1); assert.equal(g.canonDrift[0].added, 2);
    // 켜면 지금 내용이 기준(차이 없음)
    b.rig.setEnabled(ws.key, true, 'human'); b.rig.setEnabled(ws.key, false, 'human');
    assert.deepEqual(b.rig.status(ws.key).canonDrift, []);
    // 정본 파일이 없어져도 알린다
    fs.rmSync(f);
    const gone = b.rig.status(ws.key).canonDrift;
    assert.equal(gone.length, 1); assert.equal(gone[0].exists, false); assert.equal(gone[0].added, 0); assert.equal(gone[0].removed, 5);
  } finally { await stop(); }
});

// ---------- 4. 훅 알림은 settings.local.json도 ----------
test('P233 저장소 훅 알림: .claude/settings.local.json의 hooks도 본다(settings.json에 없어도)', async () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, '.claude'));
  fs.writeFileSync(path.join(d, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: [] } }));
  fs.writeFileSync(path.join(d, '.claude', 'settings.local.json'), JSON.stringify({ hooks: {} }));
  assert.equal(claudeHooksOf(d), false, '빈 hooks');
  fs.writeFileSync(path.join(d, '.claude', 'settings.local.json'), '\uFEFF' + JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node guard.mjs' }] }] } }));
  assert.equal(claudeHooksOf(d), true);
  fs.rmSync(path.join(d, '.claude', 'settings.json'));
  assert.equal(claudeHooksOf(d), true, 'settings.json이 없어도');
  fs.writeFileSync(path.join(d, '.claude', 'settings.local.json'), '{ broken');
  assert.equal(claudeHooksOf(d), false);
  const t = await board();
  try {
    fs.mkdirSync(path.join(t.dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(t.dir, '.claude', 'settings.local.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] } }));
    assert.equal((await rigSetupHandlers(t.b)['rig.presets']({ workspace: t.ws.key }, local)).claudeHooks, true);
  } finally { await t.stop(); }
});
