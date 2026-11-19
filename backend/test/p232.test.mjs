// P232 단위 시험: rig2-design 11.14(P229 실제 저장소 시험에서 돌아온 것)와 판 버그 H18("n of m" 권한 대화상자).
// 이어진 회(follows: 30분 안·같은 요청자만), 개선 회 첫 글의 이어진 회 표시, 개선 계기의 이어진 회 수(every와 먼저 닿는 쪽, "제안 대기" 건너뛰기),
// 정본 기준 = 켤 때의 내용, 기본 경로와 저장소 훅 알림, 바로가기 권한·허용 목록, scoped 새 줄, 다음 회 머리 알림, 정기 점검 허용 목록과 일 글,
// "n of m" 화면 읽기(고정 화면 글)와 화면에서 읽은 권한 질문의 답 키. 가짜 판은 p230 틀
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState, screenPermissionAsk, needKey } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { Rig, validateRig } from '../src/rig.mjs';
import { RigDocs } from '../src/rig-docs.mjs';
import { rigSetupHandlers, claudeHooksOf } from '../src/rig-setup.mjs';
import { presetFiles, shortcutAnswers, normalizeAnswers, CHECK_TASK, READ_ALLOW, GROW_ALLOW, CANON_DEFAULT, LEDGER_DEFAULT, DEFAULT_ANSWERS } from '../src/rig-presets.mjs';
import { seatExtraLines, SCOPED_SHELL_LINE, bodyOf } from '../src/rig-flow.mjs';
import { FOLLOW_MS, RUN_IDLE_MS } from '../src/rig-loops.mjs';
import { parsePermissionDialog, parseChoices } from '../src/screen.mjs';
import { planAnswer } from '../src/answer.mjs';
import { proposalsFor } from '../src/rig-proposals.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const GROW = path.join(FX, 'rig-loops-grow');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p232-'));
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

// ---------- 1. 이어진 회 ----------
test('P232 이어진 회: 앞 회가 30분 안에 닫혔고 같은 요청자면 case_open data.follows와 회의 follows, 다른 요청자·30분 넘음은 없음', async () => {
  const t = await board();
  const { b, ws, add, seat, stop } = t;
  try {
    assert.equal(FOLLOW_MS, RUN_IDLE_MS); assert.equal(FOLLOW_MS, 30 * MIN);
    const main = add('main'); seat(main, 'main');
    const other = add('other');
    const c1 = await oneRun(t, main, human, '첫 요청: CHANGELOG 줄 써 줘');
    assert.equal(c1.follows, null, '앞 회가 없다');
    const c2 = await oneRun(t, main, human, '범위를 넓히지 말고 다시');
    assert.equal(c2.follows, c1.id, '같은 사람, 30분 안');
    const open = ledger(b, ws.key, { kinds: ['case_open'] });
    assert.equal(open.find((r) => r.caseId === c2.id).data.follows, c1.id);
    assert.equal('follows' in open.find((r) => r.caseId === c1.id).data, false);
    // 다른 요청자(rig 밖 세션)는 이어지지 않는다
    const c3 = await oneRun(t, main, { kind: 'agent', session: other }, '다른 세션의 요청');
    assert.equal(c3.follows, null, '요청자가 다르다');
    // 같은 세션이 다시 보내면 이어진다
    const c4 = await oneRun(t, main, { kind: 'agent', session: other }, '같은 세션이 다시');
    assert.equal(c4.follows, c3.id);
    // 30분이 넘으면 이어지지 않는다
    for (const c of [c1, c2, c3, c4]) b.store.updateCase(c.id, { closedAt: Date.now() - FOLLOW_MS - 1000 });
    const c5 = await oneRun(t, main, { kind: 'agent', session: other }, '한참 뒤');
    assert.equal(c5.follows, null, '30분 넘음');
  } finally { await stop(); }
});

// ---------- 2. 개선 회 첫 글 ----------
test('P232 개선 회 첫 글: 사람이 rig 자리에 보낸 글마다 그 글이 연 회와 이어진 앞 회·결과·간격, 일 머리 줄은 떼고 본문', async () => {
  const t = await board();
  const { b, ws, add, seat, F, stop } = t;
  try {
    const main = add('main'); seat(main, 'main');
    const c1 = await oneRun(t, main, human, '릴리즈 노트 써 줘');
    const c2 = await oneRun(t, main, human, '명사형으로 고쳐 줘');
    const r = b.rig.active(ws.key);
    const text = F().cycleSummary(ws.key, r, { index: 'retro', every: '7d', staleMs: DAY }, { since: 0, now: Date.now() + 1 });
    const sec = text.slice(text.indexOf('## 사람이 rig 자리에 보낸 글'));
    assert.match(sec, new RegExp(`- @main\\(main 자리\\): 릴리즈 노트 써 줘 \\(회 ${c1.id}\\)`));
    assert.match(sec, new RegExp(`- @main\\(main 자리\\): 명사형으로 고쳐 줘 \\(회 ${c2.id}, 이어진 회: 앞 회 ${c1.id} "릴리즈 노트 써 줘" done 뒤 0분\\)`));
    assert.ok(!/관계: 너는 rig/.test(sec), '일 머리 판 알림 줄은 뗀다');
    assert.equal(bodyOf('[Atrium 보드] a\n[Atrium 보드] b\n\n본문 한 줄\n둘째 줄'), '본문 한 줄\n둘째 줄');
    assert.equal(bodyOf('그냥 글'), '그냥 글');
  } finally { await stop(); }
});

// ---------- 3. 개선 계기의 이어진 회 수 ----------
test('P232 정의: trigger.followups는 개선 고리의 1~50 정수, 작업 고리면 경고하고 쓰지 않는다', () => {
  const base = defOf(GROW);
  const v = (f, kind = 'improve') => { const d = JSON.parse(JSON.stringify(base)); d.loops.retro.trigger.followups = f; d.loops.retro.kind = kind; return validateRig(d); };
  const ok = v(3);
  assert.equal(ok.ok, true, ok.reason); assert.equal(ok.def.loops.retro.trigger.followups, 3);
  for (const bad of [0, 51, 2.5, '3']) { const x = v(bad); assert.equal(x.ok, false, String(bad)); assert.match(x.reason, /followups는 1~50의 정수/); }
  const w = v(3, 'work');
  assert.equal(w.ok, true, w.reason); assert.equal(w.def.loops.retro.trigger.followups, undefined);
  assert.ok(w.def.warnings.some((x) => /followups는 개선 고리/.test(x)));
});

test('P232 개선 계기: 이어진 회가 n개 쌓이면 every보다 먼저 돌고(loop_trigger followups), 제안이 정해지지 않았으면 건너뛴다("제안 대기")', async () => {
  const def = defOf(GROW); def.loops.retro.trigger.followups = 2;
  const t = await board({ def });
  const { b, ws, add, seat, L, stop } = t;
  try {
    const main = add('main'); seat(main, 'main');
    const t0 = Date.now();
    await L().tick(t0); // 계기를 건다
    const mk = (id, at, follows) => b.store.insertCase({ id, workspaceKey: ws.key, owner: main.sessionId, state: 'done', createdAt: at, closedAt: at + 1, loop: 'work', follows });
    mk('cw1', t0 + 10, null); mk('cw2', t0 + 20, 'cw1');
    assert.deepEqual(await L().tick(t0 + 30), [], '이어진 회 하나는 모자라다');
    // 회 밖에서 입구 자리가 낸 제안이 기다리는 중
    const p = await b.branch.rigAdmin.verb(main, { op: 'propose', target: 'rules', text: '# Rules\n\n- one more\n', why: 'x' });
    mk('cw3', t0 + 40, 'cw2');
    assert.deepEqual(await L().tick(t0 + 50), [], '제안 대기');
    const sk = ledger(b, ws.key, { kinds: ['loop_skip'] }).filter((r) => r.value === 'proposal_pending');
    assert.equal(sk.length, 1); assert.match(sk[0].text, /제안 대기/); assert.match(sk[0].text, new RegExp(p.proposal.id));
    assert.deepEqual(await L().tick(t0 + 60), [], '같은 기다림은 한 번만 적는다');
    assert.equal(ledger(b, ws.key, { kinds: ['loop_skip'] }).filter((r) => r.value === 'proposal_pending').length, 1);
    await b.rigProposals.decide(ws.key, p.proposal.id, 'reject', { reason: '아직 이르다' });
    const f = await L().tick(t0 + 70);
    assert.equal(f.length, 1); assert.equal(f[0].loop, 'retro');
    const trig = ledger(b, ws.key, { kinds: ['loop_trigger'] }).at(-1);
    assert.equal(trig.value, 'followups'); assert.equal(trig.data.followups, 2); assert.match(trig.text, /이어진 회 2개/);
    assert.equal(b.store.getCase(f[0].caseId).loop, 'retro');
    await gotN(main);
    assert.ok(heads(main).at(-1).includes('이어진 회 2개(2개마다)로 연 회다'));
    // 센 회는 다시 세지 않는다(지난 개선 회 뒤부터)
    b.store.updateCase(f[0].caseId, { state: 'done', closedAt: t0 + 80 });
    assert.deepEqual(await L().tick(t0 + 90), []);
    const row = b.store.getLoopRow(ws.key, 'retro');
    assert.equal(row.lastAt, t0 + 70); assert.equal(row.nextAt, t0 + 70 + 7 * DAY, '돌았으니 every 시각도 그때부터');
  } finally { await stop(); }
});

// ---------- 4. 정본 기준 = 켤 때의 내용 ----------
test('P232 정본 기준: 켜기 전에 손으로 쓴 첫 규칙은 승인 안 된 바뀜이 아니다(켤 때의 내용이 기준), 다른 경로의 옛 표시도 다시 잡고, 켠 뒤 손 고침은 그대로 잡는다', async () => {
  const t = await board({ enable: false });
  const { b, ws, dir, stop } = t;
  proposalsFor(b); // 판(backend.mjs)은 늘 만든다
  try {
    // 옛 rig의 표시(같은 문서 이름, 다른 경로, 시작 글)
    b.store.setDocMark(ws.key, 'rules', { path: 'docs/old-rules.md', approvedSha: sha('# 규칙\n'), approvedText: '# 규칙\n', approvedAt: 1, approvedBy: 'first_seen' });
    const f = path.join(dir, 'docs', 'rules.txt');
    fs.writeFileSync(f, '# Rules\n\n- hand written before enable\n');
    b.rig.setEnabled(ws.key, true, 'human');
    const m = b.store.docMark(ws.key, 'rules');
    assert.equal(m.approvedBy, 'enabled'); assert.equal(m.path, 'docs/rules.txt'); assert.equal(m.approvedSha, sha(fs.readFileSync(f)));
    await b.rigDocs.scan(); await tick(60); await b.rigDocs.scan();
    assert.equal(ledger(b, ws.key, { kinds: ['doc_unapproved'] }).length, 0, '켜기 전 손 고침은 기준이다');
    assert.equal(b.store.docMark(ws.key, 'rules').unapprovedAt, null);
    // 켠 뒤의 손 고침은 승인 안 된 바뀜
    fs.appendFileSync(f, '- after enable\n'); const tt = new Date(Date.now() + 5000); fs.utimesSync(f, tt, tt);
    await b.rigDocs.scan();
    assert.equal(ledger(b, ws.key, { kinds: ['doc_unapproved'] }).length, 1);
    // 껐다 켜면 그때의 내용이 다시 기준
    b.rig.setEnabled(ws.key, false, 'human'); b.rig.setEnabled(ws.key, true, 'human');
    assert.equal(b.store.docMark(ws.key, 'rules').unapprovedAt, null); assert.equal(b.store.docMark(ws.key, 'rules').approvedSha, sha(fs.readFileSync(f)));
  } finally { await stop(); }
});

// ---------- 5. 기본 경로, 훅 알림, 바로가기 권한 ----------
test('P232 기본 경로와 바로가기: 정본 .atrium/canon/rules.md, 장부 .atrium/ledger/work.jsonl, 산출물 reports/. "규칙이 자라는 반복 작업"은 scoped + git 읽기 넷, 이어진 회 3', () => {
  assert.equal(CANON_DEFAULT, '.atrium/canon/rules.md'); assert.equal(LEDGER_DEFAULT, '.atrium/ledger/work.jsonl');
  assert.equal(DEFAULT_ANSWERS.canon.path, CANON_DEFAULT); assert.equal(DEFAULT_ANSWERS.ledger.path, LEDGER_DEFAULT); assert.equal(DEFAULT_ANSWERS.sector.path, 'reports/');
  const g = presetFiles(shortcutAnswers('grow'), { launcher: 'claude' });
  assert.deepEqual(g.def.docs.rules, { path: '.atrium/canon/rules.md', role: 'canon' });
  assert.equal(g.def.docs.ledger.path, '.atrium/ledger/work.jsonl');
  assert.equal(g.def.seats.main.permission, 'scoped');
  assert.deepEqual(g.def.seats.main.allow, ['Bash(git log:*)', 'Bash(git show:*)', 'Bash(git diff:*)', 'Bash(git cat-file:*)']);
  assert.deepEqual(GROW_ALLOW, g.def.seats.main.allow);
  assert.ok(!g.def.seats.main.allow.some((r) => /-C/.test(r)), 'git -C는 없다');
  assert.deepEqual(g.def.loops.improve.trigger, { every: '7d', followups: 3, notify: 'main' });
  assert.match(g.guides['.atrium/seats/main.txt'], /이어진 회\(앞 회가 끝나고 30분 안에 같은 쪽이 보낸 다음 요청\)가 3번 쌓이면/);
  const v = validateRig(g.def, { exists: () => true });
  assert.equal(v.ok, true, v.reason); assert.equal(v.def.loops.improve.trigger.followups, 3);
  // 직접 고른 답: 이어진 회 0은 끔, 허용 목록에 git -C는 받지 않는다
  const c = presetFiles({ ...DEFAULT_ANSWERS, canon: { on: true }, ledger: { on: true, improve: true, days: 7, followups: 0 } }, { launcher: 'claude' });
  assert.deepEqual(c.def.loops.improve.trigger, { every: '7d', notify: 'main' });
  assert.throws(() => normalizeAnswers({ ledger: { on: true, improve: true, followups: 99 } }), /이어진 회 수는 0~50/);
  assert.throws(() => normalizeAnswers({ permission: 'scoped', allow: ['Bash(git -C:*)'] }), /git -C는 허용 목록에 넣지 않는다/);
  assert.throws(() => normalizeAnswers({ permission: 'scoped', allow: ['not a rule!'] }), /권한 규칙 배열/);
  // scoped인데 allow를 주지 않으면 읽기 허용 목록
  assert.deepEqual(presetFiles({ ...DEFAULT_ANSWERS, permission: 'scoped' }, { launcher: 'claude' }).def.seats.main.allow, READ_ALLOW);
});

test('P232 저장소 훅 알림: .claude/settings.json에 hooks가 있으면 rig.presets의 claudeHooks(막지 않음)', async () => {
  const d = tmp();
  assert.equal(claudeHooksOf(d), false);
  fs.mkdirSync(path.join(d, '.claude'));
  fs.writeFileSync(path.join(d, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: [] } }));
  assert.equal(claudeHooksOf(d), false);
  fs.writeFileSync(path.join(d, '.claude', 'settings.json'), JSON.stringify({ hooks: {} }));
  assert.equal(claudeHooksOf(d), false, '빈 hooks');
  fs.writeFileSync(path.join(d, '.claude', 'settings.json'), '\uFEFF' + JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node x.mjs' }] }] } }));
  assert.equal(claudeHooksOf(d), true);
  fs.writeFileSync(path.join(d, '.claude', 'settings.json'), '{ not json');
  assert.equal(claudeHooksOf(d), false);
  const t = await board();
  try {
    fs.mkdirSync(path.join(t.dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(t.dir, '.claude', 'settings.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] } }));
    const p = await rigSetupHandlers(t.b)['rig.presets']({ workspace: t.ws.key }, local);
    assert.equal(p.claudeHooks, true);
    assert.equal((await rigSetupHandlers(t.b)['rig.presets']({}, local)).claudeHooks, undefined, '워크스페이스를 주지 않으면 없다');
  } finally { await t.stop(); }
});

// ---------- 6. scoped 새 줄, 정기 점검 ----------
test('P232 scoped 안내 줄: 파이프·다른 셸 감싸기 금지, git은 -C 없이, 묻는 명령은 무인 회를 멈춤, 파일은 Read/Glob/Grep', () => {
  assert.equal(SCOPED_SHELL_LINE, '[Atrium 보드] Do not pipe shell commands or wrap them in another shell. Run git in the working folder without -C. A command that asks stops an unattended run. Read files with Read/Glob/Grep.');
  const g = validateRig(presetFiles(shortcutAnswers('grow'), { launcher: 'claude' }).def, { exists: () => true });
  assert.ok(seatExtraLines(g.def, 'main').includes(SCOPED_SHELL_LINE), '"규칙이 자라는 반복 작업"의 main(scoped)에 단다');
});

test('P232 정기 점검: 허용 목록에 npm outdated·ls·view, git ls-tree, gh run view(gh api 없음), 일 글에 세 줄, 보고서 경로', () => {
  for (const r of ['Bash(npm outdated:*)', 'Bash(npm ls:*)', 'Bash(npm view:*)', 'Bash(git ls-tree:*)', 'Bash(gh run view:*)', 'Bash(gh run list:*)']) assert.ok(READ_ALLOW.includes(r), r);
  assert.ok(!READ_ALLOW.some((r) => /gh api|git -C/.test(r)));
  assert.match(CHECK_TASK, /Look at CI with gh run list and gh run view\./);
  assert.match(CHECK_TASK, /Name the report reports\/<YYYY-MM-DD>-<run ID>\.md\./);
  assert.match(CHECK_TASK, /If node_modules is missing, compare package\.json with npm view <package> version\./);
  const c = presetFiles(shortcutAnswers('check'), { launcher: 'claude' });
  assert.deepEqual(c.def.seats.checker.allow, READ_ALLOW);
  assert.equal(c.def.docs.ledger.path, '.atrium/ledger/work.jsonl'); assert.equal(c.def.docs.output.path, 'reports/');
  assert.equal(c.def.loops.work.task, CHECK_TASK);
});

// ---------- 7. 다음 회 머리 알림 ----------
test('P232 다음 회 머리: 정본 반영 알림은 바로 보내지 않고 그 자리의 다음 회 첫 글 머리에 한 번 붙는다', async () => {
  const t = await board();
  const { b, ws, add, seat, stop } = t;
  try {
    const main = add('main'); seat(main, 'main');
    const p = await b.branch.rigAdmin.verb(main, { op: 'propose', target: 'rules', text: '# Rules\n\n- Keep answers short.\n- Name the range.\n', why: '범위' });
    const n0 = b.sent.filter((x) => x.sid === main.sessionId).length;
    const out = await b.rigProposals.decide(ws.key, p.proposal.id, 'approve', { by: 'human' });
    assert.equal(out.applied, true);
    await tick(150);
    assert.equal(b.sent.filter((x) => x.sid === main.sessionId).length, n0, '바로 보내지 않는다(쉬는 keep 세션의 턴을 쓰지 않는다)');
    const notes = b.store.seatNotes(ws.key, 'main');
    assert.equal(notes.length, 1); assert.equal(notes[0].kind, 'proposal');
    assert.equal(notes[0].text, `[Atrium 보드] rig: 정본 rules(docs/rules.txt)가 바뀌었다(제안 ${p.proposal.id} 승인·반영). 다시 읽는다.`);
    // 다음 요청의 회: 머리에 붙고, 다시 붙지 않는다
    const c = await oneRun(t, main, human, '다음 요청');
    const h = heads(main).at(-1);
    const lines = h.split('\n');
    const at = lines.indexOf(notes[0].text);
    assert.ok(at > 0, '머리 줄에 있다');
    assert.ok(lines.slice(0, at).every((l) => l.startsWith('[Atrium 보드]')), '머리(판 줄) 안');
    assert.ok(h.indexOf('다음 요청') > h.indexOf('다시 읽는다'), '요청 글 앞');
    assert.equal(b.store.seatNotes(ws.key, 'main').length, 0, '썼다');
    await oneRun(t, main, human, '그다음 요청');
    assert.ok(!heads(main).at(-1).includes('다시 읽는다'), '한 번만');
    assert.ok(c);
  } finally { await stop(); }
});

// ---------- 8. "n of m" 권한 대화상자 ----------
const SCREENS = path.join(FX, 'screens');
const screen = (n) => fs.readFileSync(path.join(SCREENS, `${n}.txt`), 'utf8');
test('P232 "n of m" 화면 읽기: Claude Code 2.1.328의 권한 질문 1 of 3·2 of 3(고정 화면 글)을 권한 질문으로 읽는다(머리 줄의 n of m, 점선 상자 안 명령, 선택지 넷)', () => {
  const p1 = parsePermissionDialog(screen('p232-perm-1of3'));
  assert.deepEqual({ q: p1.question, step: p1.step, tool: p1.tool, detail: p1.detail }, { q: 'Do you want to proceed?', step: { n: 1, m: 3 }, tool: 'Bash command', detail: 'mkdir gamma1' });
  const p2 = parsePermissionDialog(screen('p232-perm-2of3'));
  assert.deepEqual({ step: p2.step, detail: p2.detail }, { step: { n: 2, m: 3 }, detail: 'mkdir gamma2' });
  assert.deepEqual(p2.choices.map((c) => c.n), [1, 2, 3, 4]); assert.equal(p2.choices[3].label, 'No'); assert.equal(p2.choices[0].selected, true);
  // 질문 줄이 없어도 n of m과 Yes·No 선택지면 권한 질문
  const noQ = screen('p232-perm-2of3').replace('Do you want to proceed?', '');
  assert.deepEqual(parsePermissionDialog(noQ).step, { n: 2, m: 3 });
  // 권한 질문이 아닌 화면
  assert.equal(parsePermissionDialog('❯ \n──────────────\n  Haiku 5.5'), null);
  assert.equal(parsePermissionDialog(' Quick safety check\n Is this a project you trust?\n ❯ 1. Yes, I trust this folder\n   2. No, exit'), null, '신뢰 질문(질문 줄·n of m 없음)');
  assert.equal(parsePermissionDialog(' Exiting worktree session\n ❯ 1. Keep worktree\n   2. Remove worktree'), null);
  assert.equal(parsePermissionDialog(' Which one?\n ❯ 1. Apples\n   2. Pears\n 1 of 2'), null, 'Yes·No 선택지가 아니다');
});

test('P232 화면에서 읽은 권한 질문 → 응답 필요 ask(도구·명령·n of m), 답 키는 번호(No는 esc)', () => {
  const p = parsePermissionDialog(screen('p232-perm-2of3'));
  const a = screenPermissionAsk(p, 1000);
  assert.deepEqual({ kind: a.kind, tool: a.tool, summary: a.summary, toolUseId: a.toolUseId, since: a.since, fromScreen: a.fromScreen, step: a.step, question: a.question }, { kind: 'permission', tool: 'Bash', summary: 'Bash: mkdir gamma2', toolUseId: null, since: 1000, fromScreen: true, step: { n: 2, m: 3 }, question: 'Do you want to proceed?' });
  assert.equal(a.choices.length, 4);
  assert.deepEqual(planAnswer(a, { choice: 1 }).steps, [{ keys: ['1'] }]);
  assert.deepEqual(planAnswer(a, { choice: 4 }).steps, [{ keys: ['esc'] }], 'No는 esc');
  assert.match(planAnswer(a, { choice: 4 }).label, /거부/);
  assert.throws(() => planAnswer(a, { choice: 5 }), (e) => e.code === 'bad_request');
  assert.equal(needKey({ state: 'waiting', ask: a }), 'ask:permission:Bash:Bash: mkdir gamma2');
  // 판 상태: hook이 붙은 세션이 막혔고 이 ask가 있으면 응답 필요(알 수 없는 대화상자가 아니다)
  const rt = newRuntime(); rt.term.present = true; rt.phase = 'running'; rt.hooksSinceLaunch = 3; rt.term.launchPending = false;
  applyTermStatus(rt, 'blocked');
  assert.equal(deriveState(rt).ask.kind, 'unknown_dialog', '고치기 전 모습');
  rt.pendingAsk = a;
  assert.equal(deriveState(rt).state, 'waiting'); assert.equal(deriveState(rt).ask.summary, 'Bash: mkdir gamma2');
});

test('P232 병렬 권한 질문의 줄: hook이 한꺼번에 와도 기다리는 ask는 화면 차례(첫째)이고, 앞 질문이 풀리면 다음 것이 올라온다', () => {
  const rt = newRuntime(); rt.term.present = true; rt.phase = 'running'; rt.term.launchPending = false;
  const H = (ev, x = {}) => applyHook(rt, { hook_event_name: ev, ...x });
  const pre = (id, cmd) => H('PreToolUse', { tool_name: 'Bash', tool_use_id: id, tool_input: { command: cmd } });
  const req = (cmd) => H('PermissionRequest', { tool_name: 'Bash', tool_input: { command: cmd } });
  // P229·P232에서 본 차례: Pre A, 요청 A, Pre B, 요청 B
  H('UserPromptSubmit', { prompt: 'x' }); applyTermStatus(rt, 'working');
  pre('tA', 'mkdir a'); req('mkdir a'); applyTermStatus(rt, 'blocked'); pre('tB', 'mkdir b'); req('mkdir b');
  assert.equal(rt.pendingAsk.toolUseId, 'tA', '화면의 1 of 2는 A다(옛 판은 B를 보였다)');
  assert.deepEqual(rt.askQueue.map((a) => a.toolUseId), ['tA', 'tB']);
  // A에 답함 → A가 돌고 PostToolUse → B가 올라온다(터미널은 막힌 채)
  H('PostToolUse', { tool_name: 'Bash', tool_use_id: 'tA' });
  assert.equal(rt.pendingAsk.toolUseId, 'tB'); assert.equal(deriveState(rt).state, 'waiting');
  H('PostToolUse', { tool_name: 'Bash', tool_use_id: 'tB' });
  assert.equal(rt.pendingAsk, null);
  // 터미널이 잠깐 working이 되었다가 다시 막히는 차례(P229 10회차의 7분 멈춤)
  pre('tC', 'git log a..b'); pre('tD', 'git log c..d'); req('git log a..b'); req('git log c..d');
  assert.deepEqual(rt.askQueue.map((a) => a.toolUseId), ['tC', 'tD'], 'Pre가 먼저 둘 와도 입력으로 잇는다');
  assert.equal(rt.pendingAsk.toolUseId, 'tC');
  applyTermStatus(rt, 'working');
  assert.equal(rt.pendingAsk, null); assert.equal(rt.lastAskResolved.toolUseId, 'tC');
  applyTermStatus(rt, 'blocked');
  assert.equal(rt.pendingAsk.toolUseId, 'tD', '다시 막히면 줄의 다음 질문(알 수 없는 대화상자가 아니다)');
  assert.equal(deriveState(rt).ask.summary, 'Bash: git log c..d');
  // 턴이 끝나면 줄을 비운다
  H('Stop', { last_assistant_message: 'done' });
  assert.equal(rt.pendingAsk, null); assert.equal(rt.askQueue, null);
  applyTermStatus(rt, 'idle'); applyTermStatus(rt, 'blocked');
  assert.equal(rt.pendingAsk, null, '남은 줄이 없다');
});
