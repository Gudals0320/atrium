// P237 단위 시험: rig2-design 11.18의 둘째(관리 요청도 작업 회가 된다 → 회 없이 글만).
// atrium prompt --talk와 판 보내기 칸의 "회 없이"(session.send talk): 회·시도·done 없음, 묻기(열린 시도 없음), follows에 세지 않음,
// rig 밖 세션은 보통 prompt, 열린 회가 있는 자리는 넣지 않음(rig_run_open), 장부(loop_skip value talk, 사람은 human_message도), 안내 글. 가짜 판은 p232 틀
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
import { RigAmp } from '../src/rig-amp.mjs';
import { Backend } from '../src/backend.mjs';
import { seatNotice, TALK_SEAT_LINE } from '../src/rig-flow.mjs';
import { TALK_HEAD, talkText } from '../src/rig-loops.mjs';
import { VERBS, shortHelp } from '../src/cli-contract.mjs';
import { rigGuideText } from '../src/rig-templates.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const GROW = path.join(FX, 'rig-loops-grow');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p237-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const defOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.atrium', 'rig.json'), 'utf8'));
const ledger = (b, key, q = {}) => b.store.rigEvents({ ws: key, limit: 10000, ...q });
const MIN = 60000;

// ---------- 가짜 판(p219 틀) ----------
async function board({ dir = tmp(), from = GROW, def = null, enable = true, batchMs = 40 } = {}) {
  fs.cpSync(from, dir, { recursive: true });
  if (def) { const f = path.join(dir, '.atrium', 'rig.json'); fs.writeFileSync(f, JSON.stringify(def, null, 2)); const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t); }
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p232test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, rigCycles: false };
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


const talks = (b, key) => ledger(b, key, { kinds: ['loop_skip'] }).filter((r) => r.value === 'talk');
const casesN = (b, key) => b.store.casesOf(key).length;
const humanSend = (b, p) => Backend.prototype.send.call(b, p); // 사람의 보내기 칸(session.send)
const lastText = (s) => s.texts[s.texts.length - 1];

// ---------- 1. 에이전트의 --talk ----------
test('P237 --talk: request 고리 입구 keep 자리에 보내도 회·일·시도가 없고(done 없음), 글 앞에 회 밖 글 머리, 장부 loop_skip talk 한 줄. 보통 prompt는 회를 연다', async () => {
  const t = await board();
  const { b, ws, add, seat, stop } = t;
  try {
    const main = add('main'); seat(main, 'main');
    const other = add('other');
    const c0 = casesN(b, ws.key);
    const r = await V(b).prompt(other, { name: 'main', text: 'rig를 고쳐 줘: 검사 자리를 빼자', talk: true });
    assert.deepEqual(r.talk, { seat: 'main', loop: 'work' });
    assert.equal(r.unit, null, '일이 아니다');
    await until(() => main.texts.some((x) => x.includes('검사 자리를 빼자')));
    const got = main.texts.find((x) => x.includes('검사 자리를 빼자'));
    assert.ok(got.startsWith(TALK_HEAD), '판 알림 머리가 앞에 붙는다');
    assert.ok(!/관계: 너는 rig/.test(got), '일 머리가 없다');
    assert.equal(casesN(b, ws.key), c0, '회가 열리지 않았다');
    assert.equal(b.store.openTryOf(main.sessionId), null, '열린 시도가 없다(권한은 묻기)');
    assert.equal(ledger(b, ws.key, { kinds: ['case_open', 'loop_trigger', 'assign', 'try_start'] }).length, 0);
    const row = talks(b, ws.key);
    assert.equal(row.length, 1);
    assert.equal(row[0].seat, 'main'); assert.equal(row[0].actor, 'agent'); assert.equal(row[0].ref, r.deliveryId);
    assert.equal(row[0].data.loop, 'work'); assert.equal(row[0].data.talk, true); assert.equal(row[0].data.from, other.sessionId);
    // done이 필요 없다: 닫을 일이 없다
    await until(() => main.rt.term.status === 'idle');
    await assert.rejects(() => Promise.resolve(U(b).doneVerb(main, { result: 'ok', text: 'x' })), /열린|없/);
    // 같은 자리에 보통 prompt는 회를 연다
    const r2 = await V(b).prompt(other, { name: 'main', text: '안내서 한 편 써 줘' });
    assert.ok(r2.unit && r2.unit.caseId, '보통 prompt는 회의 일');
    assert.equal(casesN(b, ws.key), c0 + 1);
    assert.equal(b.store.getCase(r2.unit.caseId).loop, 'work');
  } finally { await stop(); }
});

test('P237 --talk: 열린 회(시도)가 있는 자리에는 넣지 않는다(rig_run_open, 그 회의 글로 섞이지 않게). 회가 닫히면 들어간다', async () => {
  const t = await board();
  const { b, ws, add, seat, L, stop } = t;
  try {
    const main = add('main'); seat(main, 'main');
    const other = add('other');
    const rq = L().onRequest(main, { kind: 'agent', session: other }, '안내서 써 줘');
    await gotUnit(main);
    await assert.rejects(() => V(b).prompt(other, { name: 'main', text: 'rig 이야기', talk: true }), (e) => e.code === 'rig_run_open' && /회 .*의 일/.test(e.message) && e.caseId === rq.caseId);
    // 사람의 "회 없이"도 같다: 실패한 전달 한 줄(까닭을 창이 보인다)
    const h = await humanSend(b, { target: ['main'], text: 'rig 이야기(사람)', talk: true });
    assert.equal(h.deliveries[0].status, 'failed'); assert.equal(h.deliveries[0].rejected, true);
    assert.match(h.deliveries[0].reason, /회 없이 보낸 글을 넣지 않았다/);
    await tick(80);
    assert.ok(!b.sent.some((x) => x.text.includes('rig 이야기')), '회 없이 보낸 글은 넣지 않았다');
    assert.equal(talks(b, ws.key).length, 0);
    // 회의 일이 닫히면 회 없이 들어간다
    await until(() => main.rt.term.status === 'idle');
    await U(b).doneVerb(main, { result: 'ok', text: '했다' });
    const r = await V(b).prompt(other, { name: 'main', text: 'rig 이야기 다시', talk: true });
    assert.deepEqual(r.talk, { seat: 'main', loop: 'work' });
  } finally { await stop(); }
});

test('P237 --talk: follows에 세지 않는다(회 밖 글이 끼어도 같은 요청자의 다음 회는 앞 회에 이어진다), rig 밖 세션에는 보통 prompt와 같다', async () => {
  const t = await board();
  const { b, ws, add, seat, stop } = t;
  try {
    const main = add('main'); seat(main, 'main');
    const other = add('other');
    const c1 = await oneRun(t, main, { kind: 'agent', session: other }, '첫 요청');
    await V(b).prompt(other, { name: 'main', text: 'rig 고치자', talk: true });
    await until(() => main.texts.some((x) => x.includes('rig 고치자')));
    await until(() => main.rt.term.status === 'idle');
    const c2 = await oneRun(t, main, { kind: 'agent', session: other }, '다시 해 줘');
    assert.equal(c2.follows, c1.id, '회 밖 글은 회가 아니다');
    assert.equal(b.store.casesOf(ws.key).length, 2);
    // rig 밖 세션(자리 없음)에는 --talk가 보통 prompt와 같다
    const plain = add('plain');
    const r = await V(b).prompt(other, { name: 'plain', text: '그냥 글', talk: true });
    assert.equal(r.talk, undefined);
    await until(() => plain.texts.length >= 1);
    assert.equal(plain.texts[0], '그냥 글', '머리가 붙지 않는다');
    assert.equal(talks(b, ws.key).length, 1, 'rig 밖은 장부에 적지 않는다');
  } finally { await stop(); }
});

test('P237 --talk: 같은 rig의 자리끼리는 쓰지 않는다(bad_request). 정의의 흐름으로 보낸다', async () => {
  const def = defOf(GROW);
  def.seats.helper = { launcher: 'claude', session: 'keep', may: ['main'] };
  const t = await board({ def });
  const { b, add, seat, stop } = t;
  try {
    const main = add('main'); seat(main, 'main');
    const helper = add('helper'); seat(helper, 'helper');
    await assert.rejects(() => V(b).prompt(helper, { name: 'main', text: 'x', talk: true }), (e) => e.code === 'bad_request' && /자리끼리/.test(e.message));
  } finally { await stop(); }
});

// ---------- 2. 사람의 "회 없이" ----------
test('P237 보내기 칸 "회 없이"(session.send talk): 회를 열지 않고 글만, 장부 human_message + loop_skip talk. 끄면 회가 열린다', async () => {
  const t = await board();
  const { b, ws, add, seat, stop } = t;
  try {
    const main = add('main'); seat(main, 'main');
    const r = await humanSend(b, { target: ['main'], text: '정의의 검사 자리를 빼 줘', talk: true });
    const d = r.deliveries[0];
    assert.deepEqual(d.talk, { seat: 'main', loop: 'work' });
    assert.equal(d.run, undefined);
    await until(() => main.texts.some((x) => x.includes('검사 자리를 빼 줘')));
    assert.equal(main.texts.find((x) => x.includes('검사 자리를 빼 줘')), talkText('정의의 검사 자리를 빼 줘'));
    assert.equal(b.store.casesOf(ws.key).length, 0);
    const hm = ledger(b, ws.key, { kinds: ['human_message'] });
    assert.equal(hm.length, 1); assert.equal(hm[0].caseId, null); assert.equal(hm[0].text, '정의의 검사 자리를 빼 줘', '장부의 사람 글은 머리 없이');
    const tk = talks(b, ws.key);
    assert.equal(tk.length, 1); assert.equal(tk[0].actor, 'human'); assert.equal(tk[0].data.from, 'human'); assert.equal(tk[0].ref, d.deliveryId);
    await until(() => main.rt.term.status === 'idle');
    const r2 = await humanSend(b, { target: ['main'], text: '안내서 써 줘' });
    assert.ok(r2.deliveries[0].run && r2.deliveries[0].run.caseId, '회 없이를 끄면 request 계기');
    // rig 밖 세션에는 talk가 아무것도 바꾸지 않는다
    const plain = add('plain');
    const r3 = await humanSend(b, { target: ['plain'], text: '보통 글', talk: true });
    assert.equal(r3.deliveries[0].talk, undefined);
    await until(() => plain.texts.length >= 1);
    assert.equal(plain.texts[0], '보통 글');
  } finally { await stop(); }
});

// ---------- 3. 권한 판정(P235): 회 밖 글 ----------
test('P237 권한: 회 없이 보낸 글이 들어가기 전에 회가 열렸으면 그 시도는 섞임(묻기). 보통 에이전트 글은 그 회의 글', async () => {
  const t = await board();
  const { b, add, seat, L, stop } = t;
  try {
    const amp = new RigAmp(b);
    const main = add('main'); seat(main, 'main');
    const other = add('other');
    L().onRequest(main, { kind: 'agent', session: other }, '안내서 써 줘');
    await gotUnit(main);
    assert.equal(amp.notePrompt(main, 'rig 이야기', { deliveryId: 'dx', origin: 'agent' }), false, '에이전트 글은 회의 글');
    assert.equal(amp.notePrompt(main, talkText('rig 이야기'), { deliveryId: 'dy', origin: 'agent', talk: true }), true, '회 밖 글은 판 알림 머리여도 섞임');
    assert.ok(main.rigForeignAt);
  } finally { await stop(); }
});

// ---------- 4. 안내 글 ----------
test('P237 안내: atrium help(계약)의 prompt --talk, 관리자·입구 자리 알림의 한 줄, rig 안내의 관리자 줄, CLI 도움말', async () => {
  const p = VERBS.find((v) => v.name === 'prompt');
  assert.ok(p.args.includes('[--talk]'));
  assert.match(p.does, /--talk면 rig 자리에 회를 열지 않고 글만/);
  assert.ok(p.out.includes('talk'));
  assert.match(shortHelp(), /rig를 고치자는 말은 관리자 자리에 --talk로 보낸다/);
  assert.match(rigGuideText(), /rig를 고치자는 말\(관리 요청\)은 rig 밖 세션이 관리자 자리에 `atrium prompt <자리> --talk/);
  const bin = fs.readFileSync(path.join(HERE, '..', 'bin', 'atrium-child.mjs'), 'utf8');
  assert.match(bin, /\[--case 건\] \[--talk\]/);
  assert.match(bin, /--talk는 rig 자리에 회를 열지 않고 글만 넣는다/);
  assert.ok(seatNotice({ seat: 'main', manager: true, talk: true }).split('\n').includes(TALK_SEAT_LINE));
  assert.ok(!seatNotice({ seat: 'worker' }).includes(TALK_SEAT_LINE));
  // 판이 고르는 자리: 관리자 자리와 request 고리 입구
  const def = defOf(GROW); def.manager = undefined; delete def.manager;
  def.seats.side = { launcher: 'claude', session: 'keep' };
  const t = await board({ def });
  try {
    const r = t.b.rig.active(t.ws.key);
    assert.ok(t.F().seatNoticeOf(r.def, 'main', t.ws.key).includes(TALK_SEAT_LINE), 'request 고리 입구');
    assert.ok(!t.F().seatNoticeOf(r.def, 'side', t.ws.key).includes(TALK_SEAT_LINE));
  } finally { await t.stop(); }
});
