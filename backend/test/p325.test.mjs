// P325 단위 시험: 워크트리 치우기(worktree-session.mjs worktree.discard, merger.mjs 치우기 일). P321 시험의 가짜 판(진짜 저장소·대기열·Branch·진짜 git)을 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { promptTask } from '../src/text.mjs';
import { WorktreeSessions, discardGitArgs, discardResultText } from '../src/worktree-session.mjs';
import { discardJobText, discardHeader } from '../src/merger.mjs';

const tmp = (p = 'mtask-p325-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const G = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', windowsHide: true }).trim();

// ---------- 시험 저장소: 합칠 브랜치 dev가 본 체크아웃에 걸려 있다. 하위마다 워크트리와 커밋 ----------
function repo() {
  const dir = tmp();
  G(dir, 'init', '-q', '-b', 'dev');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  G(dir, 'add', '.'); G(dir, 'commit', '-q', '-m', 'init');
  return dir;
}
function worktree(dir, name, { commit = true, file = name + '.txt', text = name + '\n' } = {}) {
  const wt = path.join(dir, '.claude', 'worktrees', name);
  G(dir, 'worktree', 'add', '-q', '-b', 'worktree-' + name, wt, 'dev');
  if (commit) { fs.writeFileSync(path.join(wt, file), text); G(wt, 'add', '.'); G(wt, 'commit', '-q', '-m', 'work ' + name); }
  return wt;
}

// ---------- 가짜 판(p180 시험의 틀 + 잠재우기·끄기·띄우기) ----------
async function board({ dir = repo(), settings = { mergerMode: 'on' }, jobs, spawnFail = false, trust = true } = {}) {
  const trustDirs = trust ? [dir] : [];
  const store = new Store(path.join(tmp('mtask-p325db-'), 'board.db'));
  const ws = await workspaceOf(dir);
  try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p325test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const events = [];
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), spawned: [], killed: [], slept: [], events,
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
    closeSession(s, reason) { b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
  };
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    send: async (sid, text) => { if (b.stopped) return; const s = b.sessions.get(sid); if (s && s.rt.sleep) { s.rt.sleep = null; } if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.start();
  b.resolve = (ref) => { const s = [...b.sessions.values()].find((x) => x.sessionId === ref || x.name === ref); if (!s) throw Object.assign(new Error('없음'), { code: 'not_found' }); return s; };
  b.cfg.claudeJson = path.join(tmp('mtask-p325cj-'), 'claude.json');
  fs.writeFileSync(b.cfg.claudeJson, JSON.stringify({ projects: trustDirs.reduce((o, d) => ({ ...o, [path.resolve(d).split(path.sep).join('/')]: { hasTrustDialogAccepted: true } }), {}) }));
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 }, merger: { settings: () => settings, sleepDelayMs: 10, ...(jobs ? { jobs } : {}) } });
  b.wtSessions = new WorktreeSessions(b, { trustWaitMs: 50 });
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
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
  const stop = async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); U().stops.stop(); await tick(200); store.close(); };
  return { b, dir, ws, add, worker, mergerAct, M, U, toS, sumS, stop, events };
}

const norm = (p) => path.resolve(p).toLowerCase().split(path.sep).join('/');
const wtList = (dir) => G(dir, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => norm(l.slice(9)));
const hasBranch = (dir, br) => { try { G(dir, 'rev-parse', '--verify', '--quiet', 'refs/heads/' + br); return true; } catch { return false; } };
const discardedEv = (events) => events.filter(([e]) => e === 'worktree.discarded').map(([, v]) => v);
// merger 흉내: 치우기 일을 받으면 act(unit) → [result, text]
const discardAct = (b, U, act) => { b.got = []; b.onSpawn = (s) => { s.onText = async (t, x) => { const m = /치우기 일 (u[0-9a-f]+)/.exec(t); if (!m) return; b.got.push(t); const u = b.store.getUnit(m[1]); const [r, txt] = await act(u, x); x.out = await U().doneVerb(x, { result: r, text: txt }); }; }; };

test('P325 순수: git 인자, 결과 한 줄, merger 치우기 일 글과 머리', () => {
  const root = '/r', p = '/r/.claude/worktrees/a1';
  assert.deepEqual(discardGitArgs({ root, path: p, branch: 'worktree-a1' }), { remove: ['-C', root, 'worktree', 'remove', p], branch: null });
  assert.deepEqual(discardGitArgs({ root, path: p, branch: 'worktree-a1', keepBranch: false, force: true }), { remove: ['-C', root, 'worktree', 'remove', '--force', p], branch: ['-C', root, 'branch', '-D', 'worktree-a1'] });
  assert.equal(discardGitArgs({ root, path: p, branch: null, keepBranch: false }).branch, null);
  assert.match(discardResultText({ path: p, branch: 'b', keepBranch: true }, { via: 'board', removed: true }), /워크트리 치움\(보드\).*브랜치 b 남김/);
  assert.match(discardResultText({ path: p, branch: 'b', keepBranch: false }, { via: 'merger', removed: true, branchDeleted: true }), /\(merger\).*브랜치 b 지움/);
  assert.match(discardResultText({ path: p, branch: 'b' }, { removed: false, error: '잠김' }), /실패: 잠김/);
  const x = { child: 'a1', root, worktree: p, branch: 'worktree-a1', tip: 'abc', target: 'dev', ahead: 2, dirty: 1, keepBranch: false, force: true };
  const spec = discardJobText(x);
  assert.match(spec.split('\n')[0], /^치우기: @a1 \(worktree-a1/);
  assert.match(spec, /worktree remove --force \/r\/.claude\/worktrees\/a1/);
  assert.match(spec, /branch -D worktree-a1/);
  assert.doesNotMatch(discardJobText({ ...x, keepBranch: true, force: false }), /branch -D|--force/);
  const h = discardHeader({ unitId: 'u1', child: 'a1' }).split('\n');
  assert.equal(h.length, 3);
  assert.match(h[0], /^\[Atrium 보드\] 관계: 너는 이 워크스페이스의 merger다.*치우기 일 u1/);
});

test('P325 확인 값(dryRun): 브랜치·앞선 커밋·변경·자리, merger 켬이면 via merger, 끔이면 board. 리포 뿌리 세션은 not_worktree', async () => {
  const on = await board({ settings: { mergerMode: 'on' } });
  try {
    const wt = worktree(on.dir, 'a1');
    fs.writeFileSync(path.join(wt, 'dirty.txt'), 'x');
    const s = on.add('a1', { cwd: wt });
    const v = await on.b.wtSessions.discard({ session: 'a1', dryRun: true });
    assert.equal(v.branch, 'worktree-a1'); assert.equal(v.ahead, 1); assert.equal(v.dirty, 1); assert.equal(v.target, 'dev');
    assert.equal(norm(v.path), norm(wt)); assert.equal(v.via, 'merger'); assert.ok(on.b.sessions.has(s.sessionId));
    on.add('lead');
    await assert.rejects(on.b.wtSessions.discard({ session: 'lead' }), (e) => e.code === 'not_worktree');
  } finally { await on.stop(); }
  const off = await board({ settings: { mergerMode: 'off' } });
  try {
    const wt = worktree(off.dir, 'a2');
    off.add('a2', { cwd: wt });
    assert.equal((await off.b.wtSessions.discard({ session: 'a2', dryRun: true })).via, 'board');
  } finally { await off.stop(); }
});

test('P325 판 직접(merger 끔): 세션을 닫고 보관 → git worktree remove, 브랜치는 남기기(기본) / 끄면 branch -D', async () => {
  const x = await board({ settings: { mergerMode: 'off' } });
  try {
    const wt1 = worktree(x.dir, 'k1'); const wt2 = worktree(x.dir, 'k2');
    const s1 = x.add('k1', { cwd: wt1 }); x.add('k2', { cwd: wt2 });
    const r1 = await x.b.wtSessions.discard({ session: 'k1' });
    assert.equal(r1.via, 'board'); assert.equal(r1.removed, true); assert.equal(r1.branchDeleted, false); assert.equal(r1.error, null);
    assert.ok(!x.b.sessions.has(s1.sessionId));
    assert.deepEqual(x.b.killed.find((k) => k.name === 'k1'), { name: 'k1', after: 'archive' });
    assert.ok(!wtList(x.dir).includes(norm(wt1))); assert.ok(!fs.existsSync(wt1));
    assert.ok(hasBranch(x.dir, 'worktree-k1'), '브랜치는 남는다');
    const r2 = await x.b.wtSessions.discard({ session: 'k2', keepBranch: false });
    assert.equal(r2.branchDeleted, true);
    assert.ok(!hasBranch(x.dir, 'worktree-k2'));
    const ev = discardedEv(x.events);
    assert.equal(ev.length, 2);
    assert.deepEqual(ev.map((e) => [e.name, e.via, e.removed, e.keepBranch, e.branchDeleted]), [['k1', 'board', true, true, false], ['k2', 'board', true, false, true]]);
    const news = x.b.store.db.prepare("SELECT * FROM events WHERE kind = 'worktree_discarded'").all();
    assert.equal(news.length, 2);
  } finally { await x.stop(); }
});

test('P325 변경 있음: force 없이는 거절(세션·워크트리 그대로), force면 변경까지 지운다', async () => {
  const x = await board({ settings: { mergerMode: 'off' } });
  try {
    const wt = worktree(x.dir, 'd1');
    fs.writeFileSync(path.join(wt, 'wip.txt'), 'not committed');
    const s = x.add('d1', { cwd: wt });
    await assert.rejects(x.b.wtSessions.discard({ session: 'd1' }), (e) => e.code === 'dirty' && e.dirty === 1);
    assert.ok(x.b.sessions.has(s.sessionId)); assert.ok(fs.existsSync(wt)); assert.equal(x.b.killed.length, 0);
    const r = await x.b.wtSessions.discard({ session: 'd1', force: true, keepBranch: false });
    assert.equal(r.removed, true); assert.ok(!fs.existsSync(wt)); assert.ok(!hasBranch(x.dir, 'worktree-d1'));
  } finally { await x.stop(); }
});

test('P325 merger 켬: 세션을 닫고 merger에게 치우기 일, merger가 지우면 판이 git으로 확인하고 ok', async () => {
  const x = await board({ settings: { mergerMode: 'on' } });
  try {
    const wt = worktree(x.dir, 'm1');
    const s = x.add('m1', { cwd: wt });
    discardAct(x.b, x.U, async (u) => { G(x.dir, 'worktree', 'remove', u.meta.worktree); G(x.dir, 'branch', '-D', u.meta.branch); return ['ok', '치움 ' + u.meta.worktree]; });
    const r = await x.b.wtSessions.discard({ session: 'm1', keepBranch: false });
    assert.equal(r.via, 'merger'); assert.ok(r.unit); assert.ok(!x.b.sessions.has(s.sessionId));
    const u0 = x.b.store.getUnit(r.unit);
    assert.equal(u0.origin, 'merge'); assert.equal(u0.meta.discard, true); assert.equal(u0.meta.keepBranch, false); assert.equal(u0.meta.force, false);
    await until(() => x.b.store.getUnit(r.unit).status !== 'open', 8000);
    assert.equal(x.b.store.getUnit(r.unit).status, 'done');
    const got = x.b.got[0];
    assert.match(got, /치우기 일/); assert.match(got, /branch -D worktree-m1/);
    assert.match(got, /## 치우기 일/, '처음 일에는 merger 안내(치우기 단락)가 붙는다');
    assert.ok(!wtList(x.dir).includes(norm(wt))); assert.ok(!hasBranch(x.dir, 'worktree-m1'));
    const ev = discardedEv(x.events);
    assert.equal(ev.length, 1); assert.equal(ev[0].via, 'merger'); assert.equal(ev[0].removed, true); assert.equal(ev[0].branchDeleted, true); assert.equal(ev[0].error, null);
    assert.equal(x.b.store.db.prepare("SELECT * FROM deliveries WHERE text LIKE '%병합 정리%'").all().length, 0, '정리 알림 없음');
  } finally { await x.stop(); }
});

test('P325 merger 켬: merger가 ok라 했지만 워크트리가 남았으면 failed(사람에게 알림), 브랜치 남기기면 브랜치는 보지 않는다', async () => {
  const x = await board({ settings: { mergerMode: 'on' } });
  try {
    const wt = worktree(x.dir, 'm2');
    x.add('m2', { cwd: wt });
    discardAct(x.b, x.U, async () => ['ok', '치움(거짓)']);
    const r = await x.b.wtSessions.discard({ session: 'm2' });
    await until(() => x.b.store.getUnit(r.unit).status !== 'open', 8000);
    assert.equal(x.b.store.getUnit(r.unit).status, 'failed');
    const ev = discardedEv(x.events);
    assert.equal(ev.length, 1); assert.equal(ev[0].removed, false); assert.match(ev[0].error, /워크트리가 남아 있다/);
    assert.ok(fs.existsSync(wt));
  } finally { await x.stop(); }
});

test('P325 merger 켬인데 merger를 띄우지 못하면 판이 직접 치운다', async () => {
  const x = await board({ settings: { mergerMode: 'on' }, spawnFail: true });
  try {
    const wt = worktree(x.dir, 'f1');
    x.add('f1', { cwd: wt });
    const r = await x.b.wtSessions.discard({ session: 'f1', keepBranch: false });
    assert.equal(r.via, 'merger');
    await until(() => discardedEv(x.events).length > 0, 8000);
    const ev = discardedEv(x.events)[0];
    assert.equal(ev.via, 'board'); assert.equal(ev.removed, true); assert.equal(ev.branchDeleted, true);
    assert.equal(x.b.store.getUnit(r.unit).status, 'cancelled');
    assert.ok(!fs.existsSync(wt)); assert.ok(!hasBranch(x.dir, 'worktree-f1'));
  } finally { await x.stop(); }
});
