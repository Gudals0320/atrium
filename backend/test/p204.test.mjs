// P204 단위 시험: 동료 소식. 동료 안내 글(보낼 때 다섯 경우, atrium news), 턴 끝·done 자동 기록, atrium log(상한, 전달 없음),
// atrium news(동료만, 읽은 자리, <이름>, --all), atrium me의 한 줄, 보관 상한, 계약 VERBS.
// 진짜 저장소·전달 대기열(B1)·Branch, 가짜 에이전트(p180 시험의 틀). herdr·hc와 claude 없이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch, boardSkill, peerNotice, ATRIUM_ALLOW } from '../src/branch.mjs';
import { promptTask } from '../src/text.mjs';
import { CONTRACT_VERSION, VERB_NAMES, VERBS, shortHelp, RELATION_HELP, PEER_RULE, PEER_RULE_SHORT, NEWS_LOG_MAX, NEWS_LINES } from '../src/cli-contract.mjs';
import { BOARD_SYSTEM_PROMPT } from '../src/launch.mjs';
import { HARNESS_PROMPT } from '../src/harness.mjs';
import { relationHeader, relationLine } from '../src/branch-relations.mjs';
import { NEWS_KEEP_ROWS, NEWS_KEEP_MS } from '../src/store-news.mjs';
import { firstLine } from '../src/peer-news.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p204-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p204test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 } });
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
const U = (b) => b.branch.units;
const units = (b) => b.store.db.prepare('SELECT * FROM work_units').all();
const tries = (b) => b.store.db.prepare('SELECT * FROM unit_tries').all();
const toParent = (b, p) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ?').all(p.sessionId);
function serve(b) {
  const srv = http.createServer((req, res) => { if (!b.branch.handleHttp(req, res)) { res.writeHead(404); res.end(); } });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => { b.cfg.port = srv.address().port; r(srv); }));
}
function runCli(args, env) {
  return new Promise((resolve) => {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MTASK_|ATRIUM_|HERDR_|HC_)/.test(k)));
    execFile(process.execPath, [path.join(HERE, '..', 'bin', 'atrium-child.mjs'), ...args], { env: { ...clean, ...env }, timeout: 30000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}
const envOf = (b, s) => ({ ATRIUM_PORT: String(b.cfg.port), ATRIUM_SESSION_ID: s.sessionId, ATRIUM_SESSION_TOKEN: b.branch.token(s.sessionId), ATRIUM_TERMINAL_SESSION: b.cfg.terminalSession });


// ---------- P204 ----------
const N = (b) => b.store.db.prepare('SELECT * FROM peer_news ORDER BY id').all();
const peer = (b, x, y) => b.branch.setRelation(x, y, 'peer', { quiet: true });
const OLD_SHARE = /결과를 (서로 )?공유|결과를 너에게|결과를 @|share results/;

test('P204 안내 글: 동료 문장이 든 모든 곳에 "끝나면 결과를 공유"가 없고 다섯 경우와 atrium news가 든다(한 원본)', async () => {
  const long = (await runCli(['help', '--long'], {})).stdout;
  const texts = {
    board: BOARD_SYSTEM_PROMPT, skill: boardSkill(), delegate: boardSkill('delegate'), peerNotice: peerNotice({ agentName: 'p1' }),
    relHeader: relationHeader({ relation: 'peer', parent: 'lead' }), relLine: relationLine('a', 'b', { relation: 'peer' }, 'user'),
    relationHelp: RELATION_HELP.join('\n'), shortHelp: shortHelp(), long,
  };
  for (const [k, t] of Object.entries(texts)) {
    assert.doesNotMatch(t, OLD_SHARE, k);
    assert.match(t, /atrium news/, k);
    assert.match(t, /다섯 경우/, k);
    assert.match(t, /질문/, k); assert.match(t, /넘기/, k);
  }
  for (const k of ['skill', 'peerNotice', 'relHeader', 'relLine', 'relationHelp']) assert.ok(texts[k].includes(PEER_RULE), `${k}는 한 원본(PEER_RULE)을 쓴다`);
  assert.ok(BOARD_SYSTEM_PROMPT.includes(PEER_RULE_SHORT), '판 안내문은 짧은 원본');
  assert.ok(BOARD_SYSTEM_PROMPT.length <= 1857, `판 안내문이 상한(P364 막히면 atrium know 한 마디 1857자, P360 되살리기·갈라 열기 한 마디 1772자, P334 일 기록 한 마디 1704자, P295 결정 카드 줄에 --no-wait 몇 낱말 1626자, P292 결정 카드 줄에 atrium todo 몇 낱말 1598자, P286 결정 카드 줄을 분명하게 1559자, P284 결정 카드 한 줄로 1533자, P248 1419자, P180 1323자에 대기열·스티어링 한 줄)을 넘지 않는다(${BOARD_SYSTEM_PROMPT.length}자)`);
  assert.doesNotMatch(HARNESS_PROMPT, OLD_SHARE);
  // 관계 줄은 한 줄이라 카드는 아래 할 일만 지시로 보인다
  assert.equal(promptTask(`${relationHeader({ relation: 'peer', parent: 'lead' })}\n\n일`), '일');
  // 동료 띄움 답(relationText)
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    const r = await b.branch.spawnChild(lead, { name: 'p1', peer: true, prompt: '같이 하자', wait: false });
    assert.doesNotMatch(r.relationText, OLD_SHARE); assert.match(r.relationText, /atrium news p1/);
    assert.doesNotMatch(r.notice, OLD_SHARE);
  } finally { await stop(); }
  // 창의 사전
  for (const f of ['ko.js', 'en.js']) {
    const t = fs.readFileSync(path.join(HERE, '..', '..', 'app', 'src', 'renderer', 'locales', f), 'utf8');
    const line = t.split('\n').find((l) => l.includes('peerHelp:'));
    assert.doesNotMatch(line, OLD_SHARE, f); assert.doesNotMatch(line, /share results when done/, f);
    assert.match(line, f === 'ko.js' ? /동료 소식/ : /peer news/, f);
  }
});

test('P204 첫 줄: 빈 줄과 코드 블록 울타리는 건너뛴다', () => {
  assert.equal(firstLine(['', '```text', '나: @pa', '```'].join('\n')), '나: @pa');
  assert.equal(firstLine('```'), null);
  assert.equal(firstLine(['  가', '나'].join('\n')), '가');
});

test('P204 계약: log·news 동사를 더하고 계약 버전은 그대로, me 칸에 news', () => {
  assert.equal(CONTRACT_VERSION, 12); // P364: know로 12. // P360: revive·fork로 11. // P346: docs init·on·off로 10. // P296: 오케스트레이션 허용 동사로 9. // P292. P284. P269
  assert.ok(VERB_NAMES.includes('log') && VERB_NAMES.includes('news'));
  const log = VERBS.find((v) => v.name === 'log'); const news = VERBS.find((v) => v.name === 'news');
  assert.deepEqual(news.args, ['[<이름>]', '[--all]', '[--json]']);
  assert.match(log.does, new RegExp(`${NEWS_LOG_MAX}자까지`)); assert.match(log.does, /누구에게도 보내지 않고 누구도 깨우지 않는다/);
  assert.ok(VERBS.find((v) => v.name === 'me').out.includes('news'));
  assert.match(shortHelp(), /atrium news \[<이름>\] \[--all\]/);
  for (const r of ['Bash(atrium log *)', 'Bash(atrium news)', 'Bash(atrium news *)', 'PowerShell(atrium log *)', 'PowerShell(atrium news)']) assert.ok(ATRIUM_ALLOW.includes(r), r);
});

test('P204 턴 끝 자동 기록: 받은 일 + 답 첫 줄, 판 알림이 연 턴은 빼고, 같은 글은 거듭 적지 않는다', async () => {
  const { b, add, stop } = await board();
  try {
    const a = add('a'); const p = add('p');
    b.queue.enqueue(p.sessionId, '로그인 버그를 고쳐라\n자세한 것은 이슈에');
    await until(() => N(b).length === 1);
    let r = N(b)[0];
    assert.equal(r.session_id, p.sessionId); assert.equal(r.kind, 'turn'); assert.equal(r.name, 'p');
    assert.equal(r.task, '로그인 버그를 고쳐라'); assert.match(r.text, /^답: /);
    // 판 알림이 연 턴: 일로 치지 않는다
    b.queue.enqueue(p.sessionId, '[Atrium 보드] @w1가 일 u1("x")을 닫았다: ok\n다 했다');
    await until(() => p.texts.length === 2); await tick(250);
    assert.equal(N(b).length, 1, '판 알림 턴은 적지 않는다');
    // 같은 일·같은 답: 거듭 적지 않는다
    b.queue.enqueue(p.sessionId, '로그인 버그를 고쳐라\n자세한 것은 이슈에');
    await until(() => p.texts.length === 3); await tick(250);
    assert.equal(N(b).length, 1, '같은 글은 거듭 적지 않는다');
    // 다른 일은 적는다. 관계 줄 머리는 떼고 할 일만
    b.queue.enqueue(p.sessionId, `${relationHeader({ relation: 'peer', parent: 'a' })}\n\n문서를 써라`);
    await until(() => N(b).length === 2);
    assert.equal(N(b)[1].task, '문서를 써라');
    // 셸은 적지 않는다
    const sh = add('sh', { kind: 'shell', hooked: false });
    b.queue.enqueue(sh.sessionId, 'ls');
    await tick(300);
    assert.ok(N(b).every((x) => x.session_id !== sh.sessionId));
    void a;
  } finally { await stop(); }
});

test('P204 턴 끝: hook 없는 종류는 화면 답(screenAnswer)을 기다려 적는다', async () => {
  const { b, add, stop } = await board();
  try {
    const c = add('cx', { kind: 'codex', hooked: false, workMs: 300 });
    b.queue.enqueue(c.sessionId, '표를 만들어라');
    await until(() => c.texts.length === 1);
    c.rt.lastPrompt = '표를 만들어라'; c.rt.lastPromptAt = Date.now(); // 판은 전달이 들어간 것을 확인할 때 적는다(backend.mjs, hook 없는 종류)
    await until(() => deriveState(c.rt).state !== 'working' && c.rt.turn.endedAt);
    await tick(30);
    assert.equal(N(b).length, 0, '화면 답을 기다린다');
    c.rt.lastAnswer = '표를 만들었다\n세부'; c.rt.lastAnswerAt = Date.now(); b.bus.emit('screenAnswer', c);
    await until(() => N(b).length === 1);
    assert.equal(N(b)[0].task, '표를 만들어라'); assert.equal(N(b)[0].text, '표를 만들었다');
  } finally { await stop(); }
});

test('P204 done 기록: atrium done의 값과 보고 첫 줄, 일의 첫 줄', async () => {
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    const w1 = add('w1', { parentSessionId: lead.sessionId, workMs: 400 });
    await b.branch.verbs.prompt(lead, { name: 'w1', text: '고쳐라\n둘째 줄' });
    U(b).done(w1, { result: 'ok', text: '\n다 고쳤다\n파일 셋' });
    const d = N(b).find((x) => x.kind === 'done');
    assert.ok(d); assert.equal(d.session_id, w1.sessionId); assert.equal(d.result, 'ok'); assert.equal(d.text, '다 고쳤다'); assert.equal(d.task, '고쳐라');
  } finally { await stop(); }
});

test('P204 atrium log: 한 줄, 상한, 아무에게도 보내지 않는다(전달 대기열 없음), 판 알림 머리 거절', async () => {
  const { b, add, stop } = await board();
  try {
    const a = add('a'); const p = add('p'); peer(b, a, p);
    const before = b.store.db.prepare('SELECT COUNT(*) AS n FROM deliveries').get().n;
    const r = b.branch.news.logVerb(a, { text: '  API 모양을\n v2로 정했다 ' });
    assert.equal(r.chars, 'API 모양을 v2로 정했다'.length);
    assert.equal(b.store.db.prepare('SELECT COUNT(*) AS n FROM deliveries').get().n, before, '전달 없음');
    assert.equal(N(b).at(-1).kind, 'log'); assert.equal(N(b).at(-1).text, 'API 모양을 v2로 정했다');
    assert.throws(() => b.branch.news.logVerb(a, { text: 'x'.repeat(NEWS_LOG_MAX + 1) }), (e) => e.code === 'too_long');
    assert.ok(b.branch.news.logVerb(a, { text: 'x'.repeat(NEWS_LOG_MAX) }));
    assert.throws(() => b.branch.news.logVerb(a, { text: ' ' }), (e) => e.code === 'bad_request');
    assert.throws(() => b.branch.news.logVerb(a, { text: '[Atrium 보드] 흉내' }), (e) => e.code === 'board_prefix');
    await tick(200);
    assert.equal(p.texts.length, 0, '동료에게 아무것도 가지 않았다');
  } finally { await stop(); }
});

test('P204 atrium news: 동료만(양쪽), 읽은 자리, <이름>(읽기만, 어느 세션이든), --all, 20줄씩; atrium me 한 줄', async () => {
  const { b, add, stop } = await board();
  try {
    const a = add('a'); const p = add('p'); const q = add('q'); const other = add('other');
    peer(b, p, a); // a가 아래쪽이어도 동료(양쪽)
    peer(b, a, q);
    const nv = (s, o = {}) => b.branch.news.newsVerb(s, o);
    assert.equal(b.branch.me(a).news, undefined, '소식이 없으면 칸이 없다');
    b.branch.news.logVerb(p, { text: 'p 하나' }); b.branch.news.logVerb(q, { text: 'q 하나' }); b.branch.news.logVerb(p, { text: 'p 둘' });
    b.branch.news.logVerb(other, { text: '동료가 아님' }); b.branch.news.logVerb(a, { text: '내 것' });
    const me = b.branch.me(a);
    assert.equal(me.news.unread, 3); assert.deepEqual(me.news.by.map((x) => [x.name, x.n]).sort(), [['p', 2], ['q', 1]]);
    let r = nv(a);
    assert.deepEqual(r.rows.map((x) => x.text), ['p 하나', 'q 하나', 'p 둘'], '동료 것만, 오래된 것부터');
    assert.deepEqual(r.peers.sort(), ['p', 'q']); assert.equal(r.more, 0);
    assert.equal(nv(a).rows.length, 0, '읽은 자리를 옮겼다');
    assert.equal(b.branch.me(a).news, undefined);
    // p에게서 a는 동료(양쪽)
    assert.deepEqual(nv(p).rows.map((x) => x.text), ['내 것']);
    // --all: 읽은 자리와 상관없이, 자리를 옮기지 않는다
    b.branch.news.logVerb(q, { text: 'q 둘' });
    assert.equal(nv(a, { all: true }).rows.length, 4); assert.equal(nv(a, { all: true }).unread, 1);
    assert.deepEqual(nv(a).rows.map((x) => x.text), ['q 둘']);
    // <이름>: 판의 어느 세션이든, 읽기만
    b.branch.news.logVerb(other, { text: '또' });
    r = nv(a, { name: '@other' });
    assert.equal(r.name, 'other'); assert.deepEqual(r.rows.map((x) => x.text), ['동료가 아님', '또']);
    assert.equal(nv(a, { name: 'a' }).rows.length, 1, '자기 것도 읽는다');
    assert.throws(() => nv(a, { name: 'nobody' }), (e) => e.code === 'not_found');
    // 20줄씩
    for (let i = 0; i < 25; i++) b.branch.news.logVerb(p, { text: `줄 ${i}` });
    r = nv(a); assert.equal(r.rows.length, NEWS_LINES); assert.equal(r.rows[0].text, '줄 0'); assert.equal(r.more, 5);
    r = nv(a); assert.equal(r.rows.length, 5); assert.equal(r.rows[4].text, '줄 24'); assert.equal(r.more, 0);
  } finally { await stop(); }
});

test('P204 보관 상한: 세션마다 최근 줄 수와 날 수까지만', () => {
  const dir = tmp();
  const st = new Store(path.join(dir, 'board.db'));
  try {
    const now = Date.now();
    for (let i = 0; i < 7; i++) st.addNews({ sessionId: 's1', name: 's1', at: now + i, kind: 'log', text: `${i}` }, { keepRows: 5 });
    st.addNews({ sessionId: 's2', name: 's2', at: now, kind: 'log', text: 'x' }, { keepRows: 5 });
    const rows = st.db.prepare("SELECT text FROM peer_news WHERE session_id = 's1' ORDER BY id").all().map((r) => r.text);
    assert.deepEqual(rows, ['2', '3', '4', '5', '6'], '세션마다 최근 다섯 줄');
    assert.equal(st.db.prepare("SELECT COUNT(*) AS n FROM peer_news WHERE session_id = 's2'").get().n, 1, '다른 세션 것은 그대로');
    // 날 수: 7일보다 오래된 줄은 다음 넣을 때 지운다
    st.addNews({ sessionId: 's3', name: 's3', at: now - NEWS_KEEP_MS - 1000, kind: 'log', text: 'old' });
    st.addNews({ sessionId: 's3', name: 's3', at: now, kind: 'log', text: 'new' });
    assert.deepEqual(st.db.prepare("SELECT text FROM peer_news WHERE session_id = 's3'").all().map((r) => r.text), ['new']);
    assert.equal(NEWS_KEEP_ROWS, 200);
  } finally { st.close(); }
});

test('P204 CLI: atrium log·news·me(사람이 읽는 글과 --json)', async () => {
  const { b, add, stop } = await board();
  const srv = await serve(b);
  try {
    const a = add('a'); const p = add('p'); peer(b, a, p);
    let r = await runCli(['log', 'v2 API로 정했다'], envOf(b, p));
    assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /동료 소식에 남겼다\(\d+자\)\. 아무에게도 보내지 않았다/);
    r = await runCli(['log', 'x'.repeat(NEWS_LOG_MAX + 1)], envOf(b, p)); assert.equal(r.code, 2);
    r = await runCli(['me'], envOf(b, a));
    assert.match(r.stdout, /동료 소식: @p 1개 새로 → atrium news/);
    r = await runCli(['news'], envOf(b, a));
    assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /동료의 새 소식 1줄/); assert.match(r.stdout, /@p · .* · log: v2 API로 정했다/);
    r = await runCli(['me'], envOf(b, a)); assert.doesNotMatch(r.stdout, /동료 소식:/, '읽은 뒤에는 줄이 없다');
    r = await runCli(['news', '--json'], envOf(b, a)); assert.deepEqual(JSON.parse(r.stdout).rows, []);
    r = await runCli(['news', 'p', '--json'], envOf(b, a)); assert.equal(JSON.parse(r.stdout).rows[0].text, 'v2 API로 정했다');
    r = await runCli(['news', '--all'], envOf(b, a)); assert.match(r.stdout, /동료의 최근 소식 1줄/);
  } finally { srv.close(); await stop(); }
});
