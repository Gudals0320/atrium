// P369 단위 시험: 같은 일이 받는 세션에 거듭 들어가지 않는다. 붙잡아 둔 일을 넣을 때 그 전달의 방송이 pump를 다시 불러 시도·머리 전달이 수백 개 생기던 것(재현),
//   스티어링이 대기열의 같은 일 머리 전달을 붙잡기, 끝난 일의 머리 전달 거르기, done 하나 → 합치기 일 하나(같은 하위·같은 끝 커밋), 세션 닫힘 → 보낸 세션마다 잃음 알림 하나.
// 진짜 저장소·전달 대기열·Branch·merger와 진짜 git(p267의 틀). 대기열의 delivery 이벤트가 받는 세션을 다시 방송하는 것까지 판과 같다. SDK 쪽은 진짜 SdkHost와 가짜 claude -p(p363 fixture)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { SdkHost } from '../src/sdk-session.mjs';
import { isBoardNotice } from '../src/text.mjs';

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'p363-fake-claude.mjs');

const tmp = (p = 'mtask-p369-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const G = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', windowsHide: true }).trim();

// ---------- 시험 저장소: 합칠 브랜치 dev가 본 체크아웃에 걸려 있다. 하위마다 워크트리와 커밋 ----------
function repo() {
  const dir = tmp();
  G(dir, 'init', '-q', '-b', 'dev');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  G(dir, 'add', '.'); G(dir, 'commit', '-q', '-m', 'init');
  // P346: 이 시험은 병합 흐름만 본다. 문서 시작 알림(살아 있는 문서가 없는 저장소의 첫 위임)이 알림 글 앞에 붙지 않게 문서 점검을 꺼 둔다(git 밖)
  fs.mkdirSync(path.join(dir, '.atrium'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.atrium', 'docs.json'), '{ "off": true }\n');
  fs.appendFileSync(path.join(dir, '.git', 'info', 'exclude'), '\n/.atrium/\n');
  return dir;
}
function worktree(dir, name, { commit = true, file = name + '.txt', text = name + '\n' } = {}) {
  const wt = path.join(dir, '.claude', 'worktrees', name);
  G(dir, 'worktree', 'add', '-q', '-b', 'worktree-' + name, wt, 'dev');
  if (commit) { fs.writeFileSync(path.join(wt, file), text); G(wt, 'add', '.'); G(wt, 'commit', '-q', '-m', 'work ' + name); }
  return wt;
}

// ---------- 가짜 판(p180 시험의 틀 + 잠재우기·끄기·띄우기) ----------
async function board({ dir = repo(), settings = { mergerMode: 'on' }, jobs, spawnFail = false } = {}) {
  const store = new Store(path.join(tmp('mtask-p369db-'), 'board.db'));
  const ws = await workspaceOf(dir);
  try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p369test', port: 0, dataDir: dir, claudeProjects: path.join(dir, '.projects'), sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const events = [];
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), spawned: [], killed: [], slept: [], events, sent: [],
    plugin: {}, probeGit: () => {}, authRelay: { ensure: async () => {}, url: (sid) => `http://127.0.0.1:9/sec/${sid}` },
    api: { broadcast: (e, v) => events.push([e, v]) }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '', agentKinds: async () => [{ kind: 'claude' }, { kind: 'codex' }] },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { state: s.rt.sleep ? 'sleeping' : d.state, ask: d.ask || null, error: d.error || null }; },
    ensureLink(from, to, patch = {}) {
      let l = store.linkByPair(from, to);
      if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: !!patch.spawned, observed: !!patch.observed, createdAt: Date.now() }; store.insertLink(l); }
      return store.getLink(l.linkId);
    },
    linkEvent(l, kind, text = null, data = null) { return store.addLinkEvent(l.linkId, kind, text, data); },
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    async resolveWorkspace(ref) { return { key: ref || ws.key }; },
    async spawn(p) {
      if (spawnFail) throw Object.assign(new Error('터미널 없음'), { code: 'terminal_down' });
      const s = add(p.name, { cwd: p.cwd, kind: p.kind || 'claude', model: p.model || null, effort: p.effort || null, permissionMode: p.permissionMode || 'manual' });
      b.spawned.push(p);
      if (b.onSpawn) b.onSpawn(s, p);
      return { sessionId: s.sessionId, trust: { needsTrust: false } };
    },
    async kill(p) {
      const s = b.sessions.get(p.session);
      if (!s) throw Object.assign(new Error('없음'), { code: 'not_found' });
      b.killed.push({ name: s.name, after: p.after || null });
      b.closeSession(s, 'killed');
      return { closed: true, name: s.name, ...(p.after === 'archive' ? { after: { archived: true } } : {}) };
    },
    sleeper: { going: new Map(), wakes: new Map(), async wakeFor(s) { s.rt.sleep = null; b.broadcastSession(s); return { awake: true }; }, async sleep(s, o) { b.slept.push({ name: s.name, ...o }); s.rt.sleep = { at: Date.now(), by: o.by }; b.broadcastSession(s); return { slept: true }; } },
    closeSession(s, reason) { b.queue.cancelSession(s.sessionId, 'session closed'); b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
  };
  b.queue = new DeliveryQueue({
    store, cfg,
    inspect: async () => ({ box: 'empty', seen: false, noResend: true }), // 입력 칸은 늘 빈 칸(스티어링이 지금 턴에 들어간다)
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    send: async (sid, text) => {
      if (b.stopped) return; const s = b.sessions.get(sid); if (s && s.rt.sleep) { s.rt.sleep = null; }
      b.sent.push({ sid, text });
      if (s && s.billing === 'sdk') { await b.sdk.send(s, text); s.texts.push(text); applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: text }); b.queue.onUserPromptSubmit(sid, text); b.broadcastSession(s); if (s.onSent) setTimeout(() => s.onSent(text, s), 0); return; } // SDK: stdin 한 줄 + 판 hook(UserPromptSubmit)
      if (s && s.agent) setTimeout(() => s.agent(text), 5);
    },
  });
  b.queue.start();
  b.sdk = new SdkHost(b, { idleMs: 60000, command: [process.execPath, FAKE] });
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, lostBatchMs: 150, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 }, merger: { settings: () => settings, sleepDelayMs: 10, ...(jobs ? { jobs } : {}) } });
  // 진짜 백엔드처럼(backend.mjs queue 'delivery'): 끝난 전달은 Branch에, 그리고 받는 세션을 다시 방송한다(이 방송이 그 자리에서 onSession → pump를 부른다)
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); const s = b.sessions.get(d.sessionId); if (s && d.status === 'queued' && d.reason === 'sleeping') b.sleeper.wakeFor(s, 'delivery').catch(() => {}); if (s) b.broadcastSession(s); });
  const add = (name, { kind = 'claude', hooked = kind === 'claude', workMs = 40, onText = null, cwd = dir, ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd, paneId: name + ':p1', agentName: name, permissionMode: 'manual', kind, origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind, hooked }), createdAt: Date.now(), ...extra };
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
        if (hooked) applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: '답' });
        applyTermStatus(s.rt, 'idle');
        b.broadcastSession(s);
      }, s.workMs ?? workMs);
    };
    b.broadcastSession(s);
    return s;
  };
  const M = () => b.branch.merger;
  const U = () => b.branch.units;
  const worker = (name, wt, { parent, result = 'ok', text = null, kind = 'claude' } = {}) => add(name, { cwd: wt, kind, parentSessionId: parent.sessionId, onText: async (t, s) => { if (t.includes('맡긴 일 u')) s.doneOut = await U().doneVerb(s, { result, text: text || name + ': 브랜치 worktree-' + name + ' 끝냄; 시험 통과' }); } });
  const mergerAct = (act) => { b.onSpawn = (s) => { s.onText = async (t, x) => { const m = /합치는 일 (u[0-9a-f]+)/.exec(t); if (!m) return; const u = b.store.getUnit(m[1]); const [r, txt] = await act(u, x); x.mergeOut = x.mergeOut || []; x.mergeOut.push(await U().doneVerb(x, { result: r, text: txt })); }; }; };
  // P290: 병합 정리 알림(merger가 닫힐 때)은 따로 본다(sumS)
  const isSum = (d) => /^\[Atrium 보드\] 병합 정리: /.test(d.text);
  const toS = (s) => store.db.prepare('SELECT * FROM deliveries WHERE session_id = ?').all(s.sessionId).filter((d) => !isSum(d));
  const sumS = (s) => store.db.prepare('SELECT * FROM deliveries WHERE session_id = ?').all(s.sessionId).filter(isSum);
  const stop = async () => { b.stopped = true; await b.sdk.stopAll(); b.queue.stop(); b.branch.notices.stop(); U().stops.stop(); await tick(200); store.close(); };
  const busy = (s) => { applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: '사람의 일' }); applyTermStatus(s.rt, 'working'); b.broadcastSession(s); };
  const rest = (s) => { applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: '끝' }); applyTermStatus(s.rt, 'idle'); b.broadcastSession(s); };
  return { b, dir, ws, add, worker, mergerAct, M, U, toS, sumS, stop, events, busy, rest };
}
const assign = async (b, lead, name) => { await b.branch.verbs.prompt(lead, { name, text: name + '의 일: 고쳐라' }); };

// ---------- 도우미 ----------
const triesOf = (b, uid) => b.store.db.prepare('SELECT * FROM unit_tries WHERE unit_id = ?').all(uid);
const headsOf = (b, s, uid) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? AND text LIKE ?').all(s.sessionId, '%맡긴 일 ' + uid + '%');
const gotUnit = (s, uid) => s.texts.filter((t) => t.includes('맡긴 일 ' + uid)).length; // 받는 세션에 실제로 들어간 수
const lostTo = (b, s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ?').all(s.sessionId).filter((r) => isBoardNotice(r.text) && /들어가지 않았다/.test(r.text));
const mergeUnits = (b) => b.store.db.prepare("SELECT * FROM work_units WHERE origin = 'merge'").all();
// H가 맡긴 일(열린 시도)을 하위 w가 done 없이 쉬는 동안, 일 부모를 L로 바꾼다 → L의 일은 판이 붙잡는다(held)
async function heldSetup(x, w) {
  const { b, add, U } = x;
  const H = add('head'), L = add('lead');
  b.branch.setRelation(H, w, 'sub', { quiet: true });
  const first = await b.branch.verbs.prompt(H, { name: w.name, text: '첫 일: 그림을 보내고 기다려라' });
  await until(() => gotUnit(w, first.unit.id) === 1 && deriveState(w.rt).state === 'ready', 8000);
  b.branch.setRelation(H, w, 'none', { quiet: true });
  b.branch.setRelation(L, w, 'sub', { quiet: true });
  const go = await b.branch.verbs.prompt(L, { name: w.name, text: 'GO: 작은 수정 뒤 닫아라' });
  assert.equal(go.unit.held, true, '앞 시도(H의 일)가 열려 있어 판이 붙잡는다');
  assert.equal(U().store().openTryOf(w.sessionId).unitId, first.unit.id);
  return { H, L, first, go };
}

test('P369 재현(대화형): 붙잡아 둔 일을 넣을 때 그 전달의 방송이 pump를 다시 불러도 시도·머리 전달은 하나, 하위에 한 번 들어간다', async () => {
  const x = await board();
  const { b, add, busy, rest, U, stop } = x;
  try {
    const w = add('w');
    const { L, go } = await heldSetup(x, w);
    // 사람이 w에게 친 한 턴이 done 없이 끝난다 → H의 시도를 끝내고 L의 일을 넣는다(옛 판: 여기서 같은 일 수백 개)
    busy(w); rest(w);
    await until(() => gotUnit(w, go.unit.id) === 1, 8000);
    assert.equal(triesOf(b, go.unit.id).length, 1, '시도 하나');
    assert.equal(headsOf(b, w, go.unit.id).length, 1, '머리 전달 하나');
    // 하위가 done으로 닫고, 몇 턴을 더 돌아도 같은 일이 다시 들어가지 않는다
    await U().doneVerb(w, { result: 'ok', text: '다 했다' });
    for (let i = 0; i < 3; i++) { busy(w); rest(w); await tick(60); }
    await tick(300);
    assert.equal(gotUnit(w, go.unit.id), 1);
    assert.equal(U().store().openTryOf(w.sessionId), null, '열린 시도가 남지 않는다');
    assert.equal(lostTo(b, L).length, 0);
  } finally { await stop(); }
});

test('P369 재현(SDK): 가짜 claude -p 하위도 같은 길에서 시도·머리 전달 하나, done 뒤 다시 들어가지 않는다', async () => {
  process.env.P363_FAKE_DIR = tmp('mtask-p369fake-');
  const x = await board();
  const { b, add, U, stop } = x;
  try {
    const w = add('ws', { billing: 'sdk', paneId: null, settingsPath: path.join(process.env.P363_FAKE_DIR, 's.json'), model: 'haiku' });
    const { L, go } = await heldSetup(x, w);
    // SDK 하위에 사람이 보낸 글(대기열) 한 턴 → 끝나면 판이 L의 일을 넣는다
    b.queue.enqueue(w.sessionId, '사람의 글 한 줄', { origin: { kind: 'human' } });
    await until(() => gotUnit(w, go.unit.id) === 1, 10000);
    await until(() => deriveState(w.rt).state === 'ready', 10000);
    assert.equal(triesOf(b, go.unit.id).length, 1, '시도 하나');
    assert.equal(headsOf(b, w, go.unit.id).length, 1, '머리 전달 하나');
    await U().doneVerb(w, { result: 'ok', text: '다 했다' });
    b.queue.enqueue(w.sessionId, '사람의 글 둘', { origin: { kind: 'human' } });
    await until(() => w.texts.includes('사람의 글 둘') && deriveState(w.rt).state === 'ready', 10000);
    await tick(300);
    assert.equal(gotUnit(w, go.unit.id), 1, 'done 뒤 다시 들어가지 않는다');
    assert.equal(lostTo(b, L).length, 0);
  } finally { await stop(); }
});

test('P369 스티어링이 대기열의 같은 일 머리 전달을 붙잡는다: 머리·할 일·스티어링 글이 지금 턴에 한 번', async () => {
  const { b, add, busy, rest, stop } = await board();
  try {
    const L = add('lead'); const w = add('w');
    b.branch.setRelation(L, w, 'sub', { quiet: true });
    busy(w);
    const go = await b.branch.verbs.prompt(L, { name: 'w', text: 'GO: 다섯 가지를 고쳐라' });
    assert.equal(go.unit.kind, 'new'); assert.equal(go.delivery.reason, 'working', '일하는 중이라 대기열에 선다');
    const st = await b.branch.verbs.prompt(L, { name: 'w', text: '같은 뜻: 다섯 가지 고친 뒤 done', steer: true });
    assert.equal(st.unit.kind, 'followup'); assert.equal(st.unit.joined, true);
    assert.equal(st.deliveryId, go.deliveryId, '새 전달 없이 머리 전달에 붙였다');
    await until(() => w.texts.length === 1, 5000);
    assert.match(w.texts[0], new RegExp('맡긴 일 ' + go.unit.id)); assert.match(w.texts[0], /GO: 다섯 가지를 고쳐라/); assert.match(w.texts[0], /같은 뜻: 다섯 가지 고친 뒤 done$/);
    assert.match(b.store.getDelivery(go.deliveryId).reason, /typed$/, '지금 턴에 넣었다(스티어링)');
    rest(w); await tick(400);
    assert.equal(w.texts.length, 1, '턴이 끝나도 다시 들어가지 않는다');
    assert.equal(b.store.db.prepare('SELECT COUNT(*) n FROM deliveries WHERE session_id = ?').get(w.sessionId).n, 1);
  } finally { await stop(); }
});

test('P369 끝난 일의 머리 전달은 넣지 않는다(unit_closed, 보낸 쪽 알림 없음). 이어지는 지시는 그대로 들어간다(P215)', async () => {
  const { b, add, busy, rest, U, stop } = await board();
  try {
    const L = add('lead'); const w = add('w');
    b.branch.setRelation(L, w, 'sub', { quiet: true });
    busy(w);
    const go = await b.branch.verbs.prompt(L, { name: 'w', text: 'GO: 고쳐라' });
    const more = await b.branch.verbs.prompt(L, { name: 'w', text: '하나 더: 기록도' });
    assert.equal(more.unit.kind, 'followup');
    U().done(w, { result: 'ok', text: '이미 했다' }); // 하위가 머리를 받기 전에(다른 길로 받은 지시로) 닫았다
    rest(w);
    await until(() => b.store.getDelivery(go.deliveryId).status === 'cancelled', 4000);
    assert.equal(b.store.getDelivery(go.deliveryId).reason, 'unit_closed');
    await until(() => w.texts.includes('하나 더: 기록도'), 4000);
    await tick(400);
    assert.equal(gotUnit(w, go.unit.id), 0, '끝난 일의 머리는 들어가지 않는다');
    assert.equal(lostTo(b, L).length, 0, '잃음 알림 없음');
  } finally { await stop(); }
});

test('P369 불변식: 대기열·스티어링·붙잡음을 섞어도 일 하나는 받는 세션에 많아야 한 번', async () => {
  const x = await board();
  const { b, add, busy, rest, U, stop } = x;
  try {
    const w = add('w');
    const { L } = await heldSetup(x, w);
    await b.branch.verbs.prompt(L, { name: 'w', text: 'GO 스티어링(보통 글)', steer: true });
    busy(w); rest(w);
    await tick(300);
    for (let round = 0; round < 3; round++) {
      busy(w);
      const a = await b.branch.verbs.prompt(L, { name: 'w', text: '일 ' + round });
      if (a.unit && !a.unit.held) await b.branch.verbs.prompt(L, { name: 'w', text: '스티어링 ' + round, steer: true });
      await b.branch.verbs.prompt(L, { name: 'w', text: '대기열 덧붙임 ' + round });
      rest(w); await tick(250);
      const open = U().store().openTryOf(w.sessionId);
      if (open) await U().doneVerb(w, { result: 'ok', text: '닫음 ' + round });
      busy(w); rest(w); await tick(250);
    }
    await tick(600);
    const units = b.store.db.prepare('SELECT * FROM work_units WHERE to_session = ?').all(w.sessionId);
    assert.ok(units.length >= 4);
    for (const u of units) {
      assert.ok(gotUnit(w, u.id) <= 1, u.id + ' 들어간 수 ' + gotUnit(w, u.id));
      assert.ok(triesOf(b, u.id).length <= 1, u.id + ' 시도 수 ' + triesOf(b, u.id).length);
    }
  } finally { await stop(); }
});

test('P369 done 하나 → 합치기 일 많아야 하나: 같은 하위·같은 끝 커밋이면 다시 만들지 않고, 새 커밋이면 새로', async () => {
  const { b, dir, add, worker, U, stop } = await board();
  try {
    const lead = add('lead');
    const wt = worktree(dir, 'd1');
    const w = worker('d1', wt, { parent: lead });
    b.onSpawn = () => {}; // merger는 합치지 않고 쉰다(합치기 일이 열린 채)
    await assign(b, lead, 'd1');
    await until(() => w.doneOut, 5000);
    assert.equal(w.doneOut.claimedBy, 'merger');
    assert.equal(mergeUnits(b).length, 1);
    // 같은 끝 커밋으로 다시 done(옛 판: 같은 일이 다시 들어올 때마다 합치기 일이 하나씩 늘었다)
    w.doneOut = null;
    const again = await b.branch.verbs.prompt(lead, { name: 'd1', text: 'd1의 일: 고쳐라' });
    await until(() => w.doneOut || w.err, 5000).catch(() => { throw new Error('again: ' + JSON.stringify({ again: again.unit, delivery: again.delivery, err: w.err && w.err.message, texts: w.texts.map((t) => t.slice(-30)), sleep: w.rt.sleep, state: deriveState(w.rt).state, open: U().store().openTryOf(w.sessionId) })); });
    assert.equal(w.doneOut.claimedBy, 'merger'); assert.equal(w.doneOut.merge.dup, true);
    assert.equal(w.doneOut.merge.unit, mergeUnits(b)[0].id, '이미 맡긴 합치기 일');
    assert.equal(mergeUnits(b).length, 1, '합치기 일은 그대로 하나');
    // 새 커밋이면 새 합치기 일
    fs.writeFileSync(path.join(wt, 'more.txt'), 'more'); G(wt, 'add', '.'); G(wt, 'commit', '-q', '-m', 'more');
    w.doneOut = null;
    await assign(b, lead, 'd1');
    await until(() => w.doneOut, 5000);
    assert.ok(!w.doneOut.merge.dup);
    assert.equal(mergeUnits(b).length, 2);
  } finally { await stop(); }
});

test('P369 세션 닫힘 → 보낸 세션마다 잃음 알림 하나("글 n개"), 늦게 끝난 전달은 다시 알리지 않는다, 사람이 지운 글은 알리지 않는다', async () => {
  const { b, add, busy, stop } = await board();
  try {
    const L = add('lead'); const L2 = add('lead2'); const xs = add('x');
    busy(xs);
    for (let i = 0; i < 5; i++) await b.branch.verbs.prompt(L, { name: 'x', text: '글 ' + i });
    await b.branch.verbs.prompt(L2, { name: 'x', text: '다른 보낸 쪽의 글' });
    const gone = await b.branch.verbs.prompt(L, { name: 'x', text: '사람이 지울 글' });
    b.queue.cancel(gone.deliveryId);
    b.closeSession(xs, 'test');
    await until(() => lostTo(b, L).length === 1 && lostTo(b, L2).length === 1, 4000);
    const n = lostTo(b, L)[0].text;
    assert.match(n, /^\[Atrium 보드\] @x에게 보낸 글 5개가 들어가지 않았다\(cancelled: session closed\)\. 첫 글: "글 0"\. @x는 닫혔다/);
    assert.match(lostTo(b, L2)[0].text, /^\[Atrium 보드\] @x에게 보낸 글\("다른 보낸 쪽의 글"\)이 들어가지 않았다/, '하나면 옛 꼴');
    // 닫힌 세션에 늦게 끝난 전달(판 밖에서 넣은 글)도 같은 쌍이면 다시 알리지 않는다
    b.queue.enqueue(xs.sessionId, '늦은 글', { origin: { kind: 'agent', session: L.sessionId } });
    await tick(1200);
    assert.equal(lostTo(b, L).length, 1);
    const ev = b.store.db.prepare("SELECT * FROM events WHERE kind = 'delivery_lost_notice' AND session_id = ?").all(L.sessionId);
    assert.equal(ev.length, 1); assert.equal(JSON.parse(ev[0].data).n, 5);
  } finally { await stop(); }
});
