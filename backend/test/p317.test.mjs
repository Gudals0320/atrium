// P317 단위 시험: 판 명령이 늘었다는 한 줄. 띄울 때 받은 판(계약·동사·안내문 해시)과 지금 판이 다르면 다음 전달 앞에 한 번,
// 같은 판이면 없음, 그 세션이 쓸 수 없는 동사(P296 오케스트레이션 하위·독립)는 빼기, 깨우기·이어 가기로 안내문을 다시 넣으면 알리지 않고 올림,
// 실은 전달이 실패·취소되면 되돌림, 판 기록이 없는 옛 세션은 띄운 때로 어림, 셸·가져온 세션은 알리지 않음.
// 진짜 저장소·전달 대기열·Branch, 가짜 에이전트(p295 시험의 틀). herdr·hc와 claude 없이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { CONTRACT_VERSION, VERB_NAMES } from '../src/cli-contract.mjs';
import { ORCH_SUB_VERBS } from '../src/orchestration.mjs';
import { BOARD_SYSTEM_PROMPT } from '../src/launch.mjs';
import { HARNESS_PROMPT } from '../src/harness.mjs';
import { NOTICE_HEAD, VERB_SINCE, stampOf, assumedStamp, sameStamp, newVerbs, noticeLine, boardPromptOf, promptHash, NEWS_IDS } from '../src/verbs-notice.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p317-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p317test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 }, decisions: { answerGraceMs: 150, now: () => b.clock || Date.now() } });
  b.decisions.autoSetting = () => false; // 가짜 에이전트의 답("답: …?")으로 자동 카드가 생기지 않게
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

const events = (b, kind) => b.store.db.prepare('SELECT * FROM events WHERE kind = ? ORDER BY id').all(kind).map((e) => ({ ...e, data: JSON.parse(e.data || 'null') }));
const rowStamp = (b, s) => { const r = b.store.db.prepare('SELECT brief FROM sessions WHERE session_id = ?').get(s.sessionId); return r && r.brief ? JSON.parse(r.brief) : null; };
// 옛 판 흉내: 그 동사들을 모르는 판(계약 번호를 낮춘다)
const OLD = (without, contract = 6) => ({ contract, verbs: VERB_NAMES.filter((v) => !without.includes(v)), hash: 'old000000000', at: 1, why: 'start', news: NEWS_IDS }); // P334: 동사 시험이라 새 안내는 안다고 둔다(새 안내는 p334 시험)
const lower = (b, s, st) => { s.briefStamp = st; b.store.updateSession(s.sessionId, { briefStamp: st }); };
const send = (b, s, text, o = {}) => b.queue.enqueue(s.sessionId, text, { origin: { kind: 'human' }, ...o });

test('P317 순수 함수: 새 동사, 한 줄, 같은 판, 옛 세션 어림, 종류별 안내문', () => {
  const old = OLD(['ask', 'todo', 'plan']);
  assert.deepEqual(newVerbs(old), ['ask', 'todo', 'plan']);
  assert.deepEqual(newVerbs(old, { allowed: ['help', 'prompt', 'ask'] }), ['ask']);
  assert.deepEqual(newVerbs(stampOf({ text: 'x' })), []);
  const line = noticeLine(['ask', 'todo']);
  assert.ok(line.startsWith(NOTICE_HEAD + ' atrium ask('), line);
  assert.ok(line.includes('atrium todo('), line);
  assert.ok(line.endsWith('(자세히는 atrium help)'), line);
  assert.ok(!line.includes('\n'));
  assert.equal(noticeLine([]), null);
  const a = stampOf({ text: 'same' }), c = stampOf({ text: 'same', at: 5, why: 'wake' });
  assert.ok(sameStamp(a, c), '때·까닭은 견주지 않는다');
  assert.ok(!sameStamp(a, stampOf({ text: 'other' })), '안내문이 바뀌면 다른 판');
  assert.ok(!sameStamp(a, { ...a, contract: CONTRACT_VERSION - 1 }));
  assert.ok(!sameStamp(a, null));
  assert.equal(a.contract, CONTRACT_VERSION);
  // 옛 세션 어림: P292 합친 뒤·P304 합치기 전에 뜬 세션은 plan만 모른다
  const mid = assumedStamp(VERB_SINCE.todo + 1000);
  assert.deepEqual(newVerbs(mid), ['plan', 'revive', 'fork', 'know']); // P364: know도 P304 뒤. P360: revive·fork는 P304 뒤에 생겼다
  assert.deepEqual(newVerbs(assumedStamp(VERB_SINCE.ask - 1000)), ['ask', 'todo', 'plan', 'revive', 'fork', 'know']); // P364
  assert.deepEqual(newVerbs(assumedStamp(Date.now())), []);
  // 종류별 안내문
  assert.equal(boardPromptOf({ kind: 'claude' }), BOARD_SYSTEM_PROMPT);
  assert.equal(boardPromptOf({ kind: 'codex' }), HARNESS_PROMPT);
  assert.ok(boardPromptOf({ kind: 'hermes', orch: { on: true } }, 'sub').includes('부모'));
  assert.equal(promptHash('a'), promptHash('a'));
});

test('P317 옛 판으로 띄운 세션: 다음 전달 앞에 한 줄, 두 번째 글에는 없음, 판 기록을 올림', async () => {
  const { b, add, stop } = await board();
  try {
    const s = add('w1');
    lower(b, s, OLD(['ask', 'todo', 'plan'], 7));
    send(b, s, '첫 글');
    await until(() => s.texts.length === 1);
    const lines = s.texts[0].split('\n');
    assert.ok(lines[0].startsWith(NOTICE_HEAD), s.texts[0]);
    assert.ok(lines[0].includes('atrium ask(') && lines[0].includes('atrium todo(') && lines[0].includes('atrium plan('), lines[0]);
    assert.ok(s.texts[0].endsWith('첫 글'));
    const st = rowStamp(b, s);
    assert.equal(st.contract, CONTRACT_VERSION); assert.deepEqual(st.verbs, VERB_NAMES); assert.equal(st.hash, promptHash(BOARD_SYSTEM_PROMPT));
    const ev = events(b, 'verbs_notice');
    assert.equal(ev.length, 1); assert.deepEqual(ev[0].data.verbs, ['ask', 'todo', 'plan']); assert.equal(ev[0].data.from, 7);
    await until(() => deriveState(s.rt).state === 'ready');
    send(b, s, '둘째 글');
    await until(() => s.texts.length === 2);
    assert.equal(s.texts[1], '둘째 글');
    assert.equal(events(b, 'verbs_notice').length, 1);
    // 다른 세션 글(agent 출처)과 판 알림에도 같은 자리: 새로 낮추면 다시 한 번
    lower(b, s, OLD(['plan']));
    await until(() => deriveState(s.rt).state === 'ready');
    b.queue.enqueue(s.sessionId, '[Atrium 보드] 알림 하나');
    await until(() => s.texts.length === 3);
    assert.ok(s.texts[2].startsWith(NOTICE_HEAD + ' atrium plan('), s.texts[2]);
    assert.ok(!s.texts[2].includes('atrium ask('));
  } finally { await stop(); }
});

test('P317 같은 판이면 없음, 안내문 글만 바뀌고 새 동사가 없으면 알리지 않고 올림', async () => {
  const { b, add, stop } = await board();
  try {
    const s = add('w2');
    b.briefNotices.stamp(s, 'start');
    send(b, s, '그냥 글');
    await until(() => s.texts.length === 1);
    assert.equal(s.texts[0], '그냥 글');
    // 해시만 다름(안내문 다듬기) → 알리지 않고 올림
    lower(b, s, { ...rowStamp(b, s), hash: 'different000' });
    await until(() => deriveState(s.rt).state === 'ready');
    send(b, s, '둘째');
    await until(() => s.texts.length === 2);
    assert.equal(s.texts[1], '둘째');
    assert.equal(rowStamp(b, s).hash, promptHash(BOARD_SYSTEM_PROMPT));
    assert.equal(rowStamp(b, s).why, 'quiet');
    assert.equal(events(b, 'verbs_notice').length, 0);
  } finally { await stop(); }
});

test('P317 쓸 수 없는 동사는 빼기: 자체 오케스트레이션 독립(child·relate 없음)과 하위(부모와만)', async () => {
  const { b, add, stop } = await board();
  try {
    const free = add('h1', { kind: 'hermes', hooked: false, orch: { on: true, via: 'kind', reportFallback: 'last_answer', busy: ['proctree'] } });
    assert.equal(b.branch.permFor(free).scope, 'free');
    lower(b, free, OLD(['relate', 'ask', 'child-wait']));
    send(b, free, '일');
    await until(() => free.texts.length === 1);
    const l1 = free.texts[0].split('\n')[0];
    assert.ok(l1.startsWith(NOTICE_HEAD + ' atrium ask('), l1);
    assert.ok(!l1.includes('relate') && !l1.includes('child-wait'), l1);
    assert.equal(rowStamp(b, free).hash, promptHash(boardPromptOf(free, 'free')));
    // 하위 오케스트레이션: 부모와만 말한다(ORCH_SUB_VERBS)
    const lead = add('lead');
    const sub = add('h2', { kind: 'hermes', hooked: false, parentSessionId: lead.sessionId, orch: { on: true, via: 'kind', reportFallback: 'last_answer', busy: ['proctree'] } });
    b.branch.noteChild(sub.sessionId, { parentSessionId: lead.sessionId });
    const perm = b.branch.permFor(sub);
    assert.equal(perm.scope, 'sub');
    lower(b, sub, OLD(['usage', 'ask', 'todo', 'plan', 'docs']));
    send(b, sub, '하위 일');
    await until(() => sub.texts.length === 1);
    const l2 = sub.texts[0].split('\n')[0];
    assert.equal(l2, noticeLine(['usage']), sub.texts[0]);
    assert.ok(ORCH_SUB_VERBS.includes('usage'));
    // 쓸 수 있는 새 동사가 하나도 없으면 알리지 않고 올린다
    lower(b, sub, OLD(['ask', 'todo']));
    await until(() => !sub.rt || deriveState(sub.rt).state !== 'working');
    await tick(150);
    send(b, sub, '둘째');
    await until(() => sub.texts.length === 2);
    assert.equal(sub.texts[1], '둘째');
    assert.deepEqual(rowStamp(b, sub).verbs, VERB_NAMES);
  } finally { await stop(); }
});

test('P317 깨우기·이어 가기로 안내문을 다시 넣으면 알리지 않고 올림', async () => {
  const { b, add, stop } = await board();
  try {
    const s = add('w3');
    lower(b, s, OLD(['ask', 'todo', 'plan']));
    b.briefNotices.stamp(s, 'wake'); // sleep.mjs 깨우기 → launchOf, 하네스 startHarness가 부른다
    const st = rowStamp(b, s);
    assert.equal(st.why, 'wake'); assert.deepEqual(st.verbs, VERB_NAMES);
    assert.equal(events(b, 'brief_stamp').at(-1).data.why, 'wake');
    send(b, s, '깨운 뒤 글');
    await until(() => s.texts.length === 1);
    assert.equal(s.texts[0], '깨운 뒤 글');
    assert.equal(events(b, 'verbs_notice').length, 0);
    // backend.launchOf(가짜가 아닌 판)도 같은 손을 부른다: 플러그인 인자로 띄운 Claude Code
    const src = fs.readFileSync(new URL('../src/backend.mjs', import.meta.url), 'utf8');
    assert.ok(/launch && withPlugin && this\.briefNotices\) try \{ this\.briefNotices\.stamp\(s, 'relaunch'\)/.test(src));
    assert.ok(/this\.briefNotices\.stamp\(s, why\)/.test(src), 'startHarness');
  } finally { await stop(); }
});

test('P317 실은 전달이 취소되면 판을 되돌려 다음 전달에 다시 붙인다', async () => {
  const { b, add, stop } = await board();
  try {
    const s = add('w4');
    lower(b, s, OLD(['todo']));
    const old = s.briefStamp;
    b.queue.onDelivery = null;
    const before = s.briefStamp;
    // attachFront를 직접 불러 실린 뒤, 그 전달이 취소된 것처럼
    const pre = b.queue.attachFront({ sessionId: s.sessionId, deliveryId: 'd-x', origin: 'human' });
    assert.ok(pre.startsWith(NOTICE_HEAD + ' atrium todo('), pre);
    assert.notEqual(s.briefStamp, before);
    b.queue.emit('delivery', { deliveryId: 'd-x', sessionId: s.sessionId, status: 'cancelled' });
    assert.equal(s.briefStamp, old);
    assert.deepEqual(rowStamp(b, s), old);
    assert.equal(events(b, 'verbs_notice_back').length, 1);
    send(b, s, '다시');
    await until(() => s.texts.length === 1);
    assert.ok(s.texts[0].startsWith(NOTICE_HEAD + ' atrium todo('), s.texts[0]);
  } finally { await stop(); }
});

test('P317 판 기록이 없는 옛 세션은 띄운 때로 어림, 셸·가져온 세션은 알리지 않음, 판 기록은 저장소에 남는다', async () => {
  const { b, add, stop } = await board();
  try {
    const t = VERB_SINCE.todo + 60000; // P292 합친 뒤·P304 전에 뜬 세션(omh-install 사례)
    const s = add('old1', { createdAt: t });
    s.briefStamp = null; s.rt.launchedAt = t;
    send(b, s, '오랜만');
    await until(() => s.texts.length === 1);
    assert.ok(s.texts[0].startsWith(noticeLine(['plan', 'revive', 'fork', 'know'])), s.texts[0]); // P364. P360
    assert.equal(events(b, 'verbs_notice').at(-1).data.assumed, true);
    // 같은 세션 기록을 다시 읽으면(백엔드 다시 켬) 판이 남아 있다
    const row = b.store.openSessions().find((r) => r.sessionId === s.sessionId);
    assert.deepEqual(row.briefStamp.verbs, VERB_NAMES);
    // 가져온 세션(판이 안내문을 주지 않음)은 알리지 않는다
    const ad = add('ad1', { origin: 'adopted', createdAt: 1 });
    send(b, ad, '가져온');
    await until(() => ad.texts.length === 1);
    assert.equal(ad.texts[0], '가져온');
    assert.equal(b.briefNotices.attach(ad.sessionId, null), null);
    // 셸
    const sh = add('sh1', { kind: 'shell', hooked: false, createdAt: 1 });
    assert.equal(b.briefNotices.attach(sh.sessionId, null), null);
    assert.equal(b.briefNotices.stamp(sh, 'start'), null);
  } finally { await stop(); }
});
