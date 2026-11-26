// P375 단위 시험: 판 안내가 늘었다(BRIEF_NEWS)의 빠진 안내(P368 know 규칙)와 안내문 해시 장부(BRIEF_LEDGER) 지킴.
// 새 안내가 옛 판 세션에 한 번 붙음, 쓸 수 없는 세션(자체 오케스트레이션 독립·하위)에는 그 줄만, 이미 받은 세션·깨운 세션은 없음,
// 여러 항목은 한 줄, 장부에 해시가 있는 판은 그 줄까지 안다고 봄, 안내문 해시가 바뀌었는데 장부에 줄이 없으면 실패.
// 진짜 저장소·전달 대기열·Branch, 가짜 에이전트(p317 시험의 틀). herdr·hc와 claude 없이 돈다.
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
import { CONTRACT_VERSION, VERB_NAMES, KNOW_RULE, KNOW_HINT_RULE } from '../src/cli-contract.mjs';
import { BOARD_SYSTEM_PROMPT } from '../src/launch.mjs';
import { HARNESS_PROMPT } from '../src/harness.mjs';
import { orchPromptLines } from '../src/orchestration.mjs';
import { NEWS_HEAD, NOTICE_HEAD, NEWS_IDS, BRIEF_NEWS, BRIEF_LEDGER, newNews, newsFits, newsLine, ledgerNews, ledgerProblems, briefHashes, briefVariants, assumedStamp, promptHash, noticeLine } from '../src/verbs-notice.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p375-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p375test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
const lower = (b, s, st) => { s.briefStamp = st; b.store.updateSession(s.sessionId, { briefStamp: st }); };
const send = (b, s, text, o = {}) => b.queue.enqueue(s.sessionId, text, { origin: { kind: 'human' }, ...o });


const entry = (by) => BRIEF_LEDGER.find((e) => e.by === by);
// P364를 합친 판으로 띄운 세션(know 동사는 알지만 P368의 규칙은 모름). news 칸은 그때의 판대로 records만
const P364 = (variant = 'board', o = {}) => ({ contract: CONTRACT_VERSION, verbs: [...VERB_NAMES], hash: entry('P364').hashes[variant], at: 1, why: 'start', news: ['records'], ...o });
const MERGE_P368 = Date.parse('2026-11-26T01:49:16+09:00');
const ORCH = { on: true, via: 'kind', reportFallback: 'last_answer', busy: ['proctree'] };

test('P375 순수 함수: 빠진 안내 두 줄, 장부로 아는 안내, 받는 쪽 거르기, 여러 항목 한 줄', () => {
  assert.deepEqual(NEWS_IDS, ['records', 'know-start', 'know-hint']);
  // P364 판: 해시가 장부의 P364 줄 → records까지 안다. P368 두 줄은 모른다
  assert.deepEqual(ledgerNews(entry('P364').hashes.board), ['records']);
  assert.deepEqual(newNews(P364()), ['know-start', 'know-hint']);
  // P368 판(지금 안내문)으로 뜬 세션: news 칸이 옛 판의 것(records만)이어도 해시로 안다(뒤에 안내문이 또 바뀌어도 다시 알리지 않는다)
  assert.deepEqual(newNews({ ...P364(), hash: entry('P368').hashes.board }), []);
  assert.deepEqual(newNews({ ...P364(), hash: entry('P368').hashes['orch-sub-plain'] }), []);
  assert.deepEqual(ledgerNews('unknown00000'), []);
  assert.deepEqual(ledgerNews(null), []);
  // 판 기록이 없는 옛 세션의 어림: P368 합치기 전이면 모른다
  assert.deepEqual(newNews(assumedStamp(MERGE_P368 - 1000)), ['know-start', 'know-hint']);
  assert.deepEqual(newNews(assumedStamp(MERGE_P368 + 1000)), []);
  // 받는 쪽 거르기(P296 permOf): 보통 세션은 모두, 자체 오케스트레이션 독립(child 없음)·하위(know만)는 know-start만
  const normal = { kind: 'claude' }, orch = { kind: 'hermes', orch: ORCH };
  assert.ok(NEWS_IDS.every((id) => newsFits(id, normal, { allowed: null })));
  const free = { allowed: VERB_NAMES.filter((v) => !['child', 'child-kill', 'relate', 'child-wait', 'revive', 'fork'].includes(v)) };
  assert.deepEqual(NEWS_IDS.filter((id) => newsFits(id, orch, free)), ['know-start']);
  assert.deepEqual(NEWS_IDS.filter((id) => newsFits(id, orch, { allowed: ['help', 'prompt', 'done', 'item', 'me', 'usage', 'know'] })), ['know-start']);
  assert.deepEqual(NEWS_IDS.filter((id) => newsFits(id, orch, { allowed: ['help', 'prompt', 'done'] })), [], 'know가 없는 하위는 know 안내도 없다');
  assert.equal(newsFits('nope', normal, null), false);
  // 각 안내가 실제로 그 꼴의 안내문에 있다(거르기가 안내문과 맞는다)
  const v = briefVariants();
  assert.ok(v.board.includes(KNOW_HINT_RULE) && HARNESS_PROMPT.includes(KNOW_HINT_RULE));
  assert.ok(!v['orch-free'].includes('1~3번') && !v['orch-sub'].includes('1~3번'), '자체 오케스트레이션 안내문에는 맡기기 전 찾기가 없다');
  assert.ok(v['orch-sub-plain'].includes('시작할 때') && BOARD_SYSTEM_PROMPT.includes(KNOW_RULE));
  assert.ok(!v['orch-free'].includes('--record'), '자체 오케스트레이션 안내문에는 records 약속이 없다');
  // 여러 항목: 한 줄, 짧게, atrium help를 가리킨다, 안내문 전체를 다시 넣지 않는다
  const all = newsLine(NEWS_IDS);
  assert.ok(all.startsWith(NEWS_HEAD + ' ') && all.endsWith('(자세히는 atrium help)'), all);
  assert.ok(!all.includes('\n'), '한 줄');
  assert.equal(all.split(' / ').length, 3);
  assert.ok(all.length <= 300, `짧게: ${all.length}자`);
  for (const n of BRIEF_NEWS) assert.ok(n.line.length <= 110 && !n.line.includes('\n'), n.id);
  assert.ok(all.length < BOARD_SYSTEM_PROMPT.length / 4);
  assert.equal(newsLine(['know-start']), `${NEWS_HEAD} ${BRIEF_NEWS[1].line}(자세히는 atrium help)`);
});

test('P375 장부 지킴: 안내문 해시가 바뀌었는데 장부에 줄이 없거나 알릴 것 없음 표시가 없으면 실패', () => {
  const problems = ledgerProblems();
  assert.deepEqual(problems, [], problems.join('\n'));
  const cur = briefHashes();
  assert.deepEqual(Object.keys(cur), ['board', 'harness', 'orch-sub', 'orch-sub-plain', 'orch-free', 'orch-free-plain']);
  assert.equal(cur.board, promptHash(BOARD_SYSTEM_PROMPT));
  assert.equal(cur['orch-sub'], promptHash(orchPromptLines('sub').join('\n')));
  // 흉내: 판 안내문이 바뀌고 장부에 줄이 없다 → 무엇을 할지 말하며 실패
  const changed = { ...cur, board: 'changed00000' };
  const p1 = ledgerProblems(changed);
  assert.equal(p1.length, 1);
  assert.match(p1[0], /board 0634[0-9a-f]+→changed00000/);
  assert.match(p1[0], /BRIEF_NEWS에 \{ id/);
  assert.match(p1[0], /BRIEF_LEDGER 끝에/);
  assert.match(p1[0], /quiet: '<알릴 것 없음 까닭 한 줄>'/);
  assert.ok(p1[0].includes(JSON.stringify(changed)), '붙여 넣을 지금 해시');
  // 줄을 더하면 통과: 알릴 것 없음(까닭 한 줄)
  assert.deepEqual(ledgerProblems(changed, [...BRIEF_LEDGER, { by: 'P999', hashes: changed, quiet: '글 다듬기(뜻 그대로)' }]), []);
  // 새 동사로 더해도 통과, 없는 동사면 실패
  assert.deepEqual(ledgerProblems(changed, [...BRIEF_LEDGER, { by: 'P999', hashes: changed, verbs: ['know'] }]), []);
  assert.match(ledgerProblems(changed, [...BRIEF_LEDGER, { by: 'P999', hashes: changed, verbs: ['nope'] }]).join('\n'), /'nope'가 계약/);
  // 까닭도 항목도 없으면 실패
  assert.match(ledgerProblems(changed, [...BRIEF_LEDGER, { by: 'P999', hashes: changed, quiet: ' ' }]).join('\n'), /하나가 있어야 한다/);
  // BRIEF_NEWS에 없는 id, 앞 줄에 이미 있는 id(새 안내는 새 id)
  assert.match(ledgerProblems(changed, [...BRIEF_LEDGER, { by: 'P999', hashes: changed, news: ['ghost'] }]).join('\n'), /'ghost'가 BRIEF_NEWS에 없다/);
  assert.match(ledgerProblems(changed, [...BRIEF_LEDGER, { by: 'P999', hashes: changed, news: ['records'] }]).join('\n'), /이미 있다/);
  // 장부에 오르지 않은 새 안내(안내문을 안 바꾸고 BRIEF_NEWS만 더함: sameStamp라 아무도 받지 못한다)
  const extra = [...BRIEF_NEWS, { id: 'lonely', line: 'x' }];
  assert.match(ledgerProblems(cur, BRIEF_LEDGER, { news: extra }).join('\n'), /'lonely'가 장부/);
  // 해시 꼴이 빠진 줄
  assert.match(ledgerProblems(changed, [...BRIEF_LEDGER, { by: 'P999', hashes: { board: 'changed00000' }, quiet: '까닭' }]).join('\n'), /해시가 모두/);
});

test('P375 P364 판 세션: 다음 전달 앞에 새 안내 한 줄 한 번, 두 번째 글에는 없음, 판 기록을 올림', async () => {
  const { b, add, stop } = await board();
  try {
    const s = add('w1');
    lower(b, s, P364());
    send(b, s, '첫 글');
    await until(() => s.texts.length === 1);
    const lines = s.texts[0].split('\n'); // 판이 앞에 붙인 줄, 빈 줄, 글
    assert.equal(lines.length, 3, s.texts[0]);
    assert.equal(lines[0], newsLine(['know-start', 'know-hint']));
    assert.ok(!lines[0].includes('--record'), '이미 받은 안내(records)는 없다');
    assert.equal(lines[1], ''); assert.equal(lines[2], '첫 글');
    assert.ok(!s.texts[0].includes(NOTICE_HEAD), '새 동사는 없다');
    const ev = events(b, 'verbs_notice');
    assert.equal(ev.length, 1); assert.deepEqual(ev[0].data.news, ['know-start', 'know-hint']); assert.deepEqual(ev[0].data.verbs, []);
    assert.deepEqual(rowStamp(b, s).news, NEWS_IDS);
    assert.equal(rowStamp(b, s).hash, promptHash(BOARD_SYSTEM_PROMPT));
    await until(() => deriveState(s.rt).state === 'ready');
    send(b, s, '둘째 글');
    await until(() => s.texts.length === 2);
    assert.equal(s.texts[1], '둘째 글');
    assert.equal(events(b, 'verbs_notice').length, 1);
    // 하네스(Codex 등) 세션도 같은 두 줄
    const cx = add('c1', { kind: 'codex', hooked: false });
    lower(b, cx, P364('harness'));
    send(b, cx, '코덱스');
    await until(() => cx.texts.length === 1);
    assert.equal(cx.texts[0], newsLine(['know-start', 'know-hint']) + '\n\n코덱스');
    assert.equal(rowStamp(b, cx).hash, promptHash(HARNESS_PROMPT));
  } finally { await stop(); }
});

test('P375 쓸 수 없는 세션에는 그 줄을 빼기: 자체 오케스트레이션 독립·하위는 know-start만, 쓸 것이 없으면 알리지 않고 올림', async () => {
  const { b, add, stop } = await board();
  try {
    const free = add('h1', { kind: 'hermes', hooked: false, orch: ORCH });
    assert.equal(b.branch.permFor(free).scope, 'free');
    lower(b, free, { ...P364('orch-free-plain'), news: [] }); // records도 모르는 판: 자체 오케스트레이션 안내문에 없으니 빼기
    send(b, free, '일');
    await until(() => free.texts.length === 1);
    assert.equal(free.texts[0], newsLine(['know-start']) + '\n\n일');
    const lead = add('lead');
    const sub = add('h2', { kind: 'hermes', hooked: false, parentSessionId: lead.sessionId, orch: ORCH });
    b.branch.noteChild(sub.sessionId, { parentSessionId: lead.sessionId });
    assert.equal(b.branch.permFor(sub).scope, 'sub');
    lower(b, sub, P364('orch-sub-plain'));
    send(b, sub, '하위 일');
    await until(() => sub.texts.length === 1);
    assert.equal(sub.texts[0], newsLine(['know-start']) + '\n\n하위 일');
    assert.equal(rowStamp(b, sub).hash, promptHash(orchPromptLines('sub').join(' ')));
    // know-start를 이미 안 오케스트레이션 하위(뒤 판)에 know-hint만 새로면: 쓸 수 없으니 알리지 않고 올린다
    await until(() => deriveState(sub.rt).state !== 'working');
    await tick(150);
    lower(b, sub, { ...P364('orch-sub-plain'), hash: 'other0000000', news: ['records', 'know-start'] });
    send(b, sub, '둘째');
    await until(() => sub.texts.length === 2);
    assert.equal(sub.texts[1], '둘째');
    assert.equal(rowStamp(b, sub).why, 'quiet');
    assert.deepEqual(rowStamp(b, sub).news, NEWS_IDS, '판은 모두 올린다(관계가 바뀌어도 다시 알리지 않는다)');
  } finally { await stop(); }
});

test('P375 이미 받은 세션·깨운 세션은 없음, 장부에 해시가 있는 판은 계약이 달라도 다시 알리지 않음', async () => {
  const { b, add, stop } = await board();
  try {
    // 지금 판으로 띄움
    const s = add('w2');
    b.briefNotices.stamp(s, 'start');
    send(b, s, '그냥 글');
    await until(() => s.texts.length === 1);
    assert.equal(s.texts[0], '그냥 글');
    // P368 판으로 뜬 세션(news 칸은 그때의 판 = records만). 뒤에 계약이 오른 판을 흉내(다른 판) → 해시로 안다: 알릴 것 없음
    const t = add('w3');
    lower(b, t, { ...P364(), hash: entry('P368').hashes.board, contract: CONTRACT_VERSION - 1 });
    send(b, t, 'P368 판');
    await until(() => t.texts.length === 1);
    assert.equal(t.texts[0], 'P368 판');
    assert.equal(rowStamp(b, t).why, 'quiet');
    // P364 판에서 깨우기·이어 가기로 안내문을 다시 넣으면 알리지 않고 올린다
    const w = add('w4');
    lower(b, w, P364());
    b.briefNotices.stamp(w, 'wake');
    assert.deepEqual(rowStamp(b, w).news, NEWS_IDS);
    send(b, w, '깨운 뒤 글');
    await until(() => w.texts.length === 1);
    assert.equal(w.texts[0], '깨운 뒤 글');
    assert.equal(events(b, 'verbs_notice').length, 0);
  } finally { await stop(); }
});

test('P375 판 기록이 없는 옛 세션: 새 동사 한 줄과 새 안내 한 줄(여러 항목이 한 줄로 묶임)', async () => {
  const { b, add, stop } = await board();
  try {
    const at = Date.parse('2026-11-21T23:00:00+09:00'); // P304 뒤·P317 전에 뜬 세션
    const s = add('old1', { createdAt: at });
    s.briefStamp = null; s.rt.launchedAt = at;
    send(b, s, '오랜만');
    await until(() => s.texts.length === 1);
    const lines = s.texts[0].split('\n');
    assert.equal(lines.length, 4, s.texts[0]); // 동사 한 줄, 안내 한 줄, 빈 줄, 글
    assert.equal(lines[0], noticeLine(['revive', 'fork', 'know']));
    assert.equal(lines[1], newsLine(['records', 'know-start', 'know-hint']));
    assert.equal(lines[3], '오랜만');
    assert.ok(!lines[0].includes('막혔을 때'), '언제 찾는지는 새 안내 줄이 말한다');
  } finally { await stop(); }
});
