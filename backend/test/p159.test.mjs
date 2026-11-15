// P159 단위 시험: 계보로만 움직이던 동작을 일 관계(하위·동료·독립, P156)로. 잠재우기 묶음, 작업 완료 세기, 닫힘 알림 받는 이, 떼기 = 독립.
// herdr·hc와 claude 없이 돈다(p156 시험의 가짜 판 틀).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime } from '../src/state.mjs';
import { Branch } from '../src/branch.mjs';
import { Sleeper } from '../src/sleep.mjs';
import { Backend } from '../src/backend.mjs';
import { workspaceOf } from '../src/git.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p159-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// ---------- 가짜 판(p156과 같은 틀) ----------
async function fakeBoard() {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  store.insertWorkspace({ ...ws, createdAt: 1 });
  const b = {
    cfg: { profile: 'dev', terminalSession: 'atrium-dev-p159test', port: 0, dataDir: dir, claudeProjects: path.join(dir, 'projects') }, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(),
    broadcasts: [], spawned: [], queued: [], killing: new Set(),
    api: { broadcast: (e, d) => b.broadcasts.push([e, d]) }, log: () => {}, requireTerminal: () => {},
    hooked: (s) => s.kind === 'claude' && s.origin === 'board',
    summary: (s) => ({ state: s.rt.sleep ? 'sleeping' : 'ready', ask: null }),
    broadcastSession: (s) => b.broadcasts.push(['session', s.sessionId]),
    relay: { stats: () => [] },
    ensureLink(from, to, patch = {}) {
      let l = store.linkByPair(from, to);
      if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: !!patch.spawned, observed: !!patch.observed, createdAt: Date.now() }; store.insertLink(l); }
      else { const f = {}; if (l.removedAt) f.removedAt = null; if (patch.role !== undefined && patch.role !== l.role) f.role = patch.role; if (Object.keys(f).length) store.updateLink(l.linkId, f); }
      return store.getLink(l.linkId);
    },
    linkEvent(l, kind, text = null, data = null) { return store.addLinkEvent(l.linkId, kind, text, data); },
    queue: { pending: () => 0, enqueue: (sid, text) => { b.queued.push({ sid, text }); return { deliveryId: 'd' + b.queued.length, sessionId: sid, text, status: 'queued' }; } },
    async spawn(p) {
      const id = crypto.randomUUID();
      const s = { sessionId: id, name: p.name, cwd: p.cwd, paneId: `w${b.spawned.length + 2}:p1`, agentName: p.name, model: p.model, effort: p.effort, permissionMode: p.permissionMode, kind: 'claude', origin: 'board', parentSessionId: p.parentSessionId || null, workspaceKey: (await workspaceOf(p.cwd)).key, rt: newRuntime({ kind: 'claude' }), createdAt: Date.now() + b.spawned.length };
      store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
      b.sessions.set(id, s);
      if (p.branch) b.branch.noteChild(id, p.branch);
      store.setNode({ session_id: id, x: 0, y: 5000 + b.spawned.length * 600, w: 720, h: 460 });
      b.spawned.push(p);
      return { sessionId: id, trust: { needsTrust: false } };
    },
    closeSession(s, reason) { b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
  };
  b.store.getDelivery = () => null;
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20 });
  const lead = mk(b, { name: 'lead', cwd: dir, workspaceKey: ws.key });
  return { b, dir, lead, ws };
}
function mk(b, o) {
  const s = { sessionId: crypto.randomUUID(), paneId: 'w1:p1', agentName: o.name, model: 'haiku', effort: 'low', permissionMode: 'acceptEdits', kind: 'claude', origin: 'board', parentSessionId: null, rt: newRuntime({ kind: 'claude' }), createdAt: 1, ...o };
  b.store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
  b.sessions.set(s.sessionId, s);
  return s;
}
const byName = (b, n) => [...b.sessions.values()].find((x) => x.name === n);
const setUser = (b, a, x, rel) => b.branch.setRelation(a, x, rel, { source: 'user', by: 'user', quiet: true });

// 리드 + 하위(w1) + 동료(p1, --peer) + 사람이 하위로 둔 세션(x, 계보 없음) + 독립으로 둔 하위(w2)
async function team() {
  const f = await fakeBoard();
  const { b, lead, dir, ws } = f;
  await b.branch.spawnChild(lead, { name: 'w1', wait: false });
  await b.branch.spawnChild(lead, { name: 'p1', peer: true, wait: false });
  await b.branch.spawnChild(lead, { name: 'w2', wait: false });
  const x = mk(b, { name: 'x', cwd: dir, workspaceKey: ws.key });
  setUser(b, lead, x, 'sub');
  setUser(b, lead, byName(b, 'w2'), 'none');
  return { ...f, w1: byName(b, 'w1'), p1: byName(b, 'p1'), w2: byName(b, 'w2'), x };
}

test('P159 잠재우기 묶음: 하위는 함께(사람이 정한 하위 포함), 동료·독립은 따로', async () => {
  const { b, lead, w1, p1, w2, x } = await team();
  const busy = new Set();
  b.queue.pending = (sid) => (busy.has(sid) ? 1 : 0); // 전달 대기 = 일하는 중(sleep.mjs busy)
  const ready = () => { for (const s of b.sessions.values()) Object.assign(s.rt.term, { status: 'idle', present: true, launchPending: false }); };
  ready();
  const sl = new Sleeper(b, { timers: false });
  const info = (s) => sl.info(s);
  assert.deepEqual([info(lead).childBusy, info(lead).descBusy], [false, false]);
  busy.add(w1.sessionId);
  assert.equal(info(lead).childBusy, true, '하위가 일하면 리드는 깨어 있다');
  busy.clear(); busy.add(x.sessionId);
  assert.equal(info(lead).childBusy, true, '사람이 하위로 둔 세션(계보 없음)도 묶음');
  assert.equal(info(lead).descBusy, true);
  busy.clear(); busy.add(p1.sessionId);
  assert.deepEqual([info(lead).childBusy, info(lead).descBusy], [false, false], '동료는 리드를 깨워 두지 않는다');
  busy.clear(); busy.add(w2.sessionId);
  assert.deepEqual([info(lead).childBusy, info(lead).descBusy], [false, false], '독립도 따로');
  busy.clear(); busy.add(lead.sessionId);
  assert.equal(info(w1).parentBusy, true);
  assert.equal(info(x).parentBusy, true);
  assert.equal(info(p1).parentBusy, false, '일하는 리드가 동료를 깨워 두지 않는다');
  assert.equal(info(w2).parentBusy, false);
  // 동료의 하위는 동료 묶음
  await b.branch.spawnChild(p1, { name: 'p1w', wait: false });
  ready();
  busy.clear(); busy.add(byName(b, 'p1w').sessionId);
  assert.equal(info(p1).childBusy, true);
  assert.equal(info(lead).descBusy, false, '동료 아래 일은 리드의 자손이 아니다');
  sl.stop(); b.branch.notices.stop();
});

test('P159 작업 완료 세기: 일 부모가 열린 하위는 안 셈, 동료·독립은 셈, 일 부모가 닫히면 다시 셈', async () => {
  const { b, lead, w1, p1, w2, x } = await team();
  const me = { sessions: b.sessions, branch: b.branch, workParentOf: Backend.prototype.workParentOf };
  const ds = (s) => Backend.prototype.doneScope.call(me, s, { unseen: true });
  assert.deepEqual(ds(lead), { unseen: true, unseenSub: false });
  assert.deepEqual(ds(w1), { unseen: false, unseenSub: true });
  assert.deepEqual(ds(x), { unseen: false, unseenSub: true }, '사람이 하위로 둔 세션');
  assert.deepEqual(ds(p1), { unseen: true, unseenSub: false }, '동료는 맨 위 세션처럼');
  assert.deepEqual(ds(w2), { unseen: true, unseenSub: false }, '독립도');
  // 동료를 다시 하위로 두면 빠진다
  setUser(b, lead, p1, 'sub');
  assert.deepEqual(ds(p1), { unseen: false, unseenSub: true });
  // 리드가 닫히면 모두 셈
  b.sessions.delete(lead.sessionId);
  for (const s of [w1, x, p1]) assert.deepEqual(ds(s), { unseen: true, unseenSub: false });
  b.branch.notices.stop();
});

test('P159 부모가 닫히면 일 자식(사람이 정한 하위 포함) 요약을 다시 보내고, 동료는 보내지 않는다', async () => {
  const { b, lead, w1, p1, x } = await team();
  const sent = [];
  const fake = {
    sessions: b.sessions, branch: b.branch, workParentOf: Backend.prototype.workParentOf,
    queue: { cancelSession: () => {} }, relay: { detach: () => {} }, cfg: { sessionsDir: 'nowhere' },
    store: { docks: () => [], links: () => [], updateSession: () => {}, addEvent: () => {} },
    api: { broadcast: () => {} }, bus: { emit: (e, s, r) => b.bus.emit(e, s, r) }, adapter: { refreshSubscription: () => {} },
    broadcastSession: (s, o) => sent.push([s.name, o && o.onlyIfFlagsChanged]),
  };
  Backend.prototype.closeSession.call(fake, lead, 'killed');
  assert.deepEqual(sent.map((r) => r[0]).sort(), [w1.name, x.name].sort());
  assert.ok(!sent.some((r) => r[0] === p1.name));
  b.branch.notices.stop();
});

test('P159 닫힘 알림: 일 부모에게(계보 부모와 다르면 일 부모), 동료가 닫히면 띄운 짝에게 그대로, 독립으로 둔 세션도 띄운 쪽에', async () => {
  const { b, lead, w1, p1, w2, x, dir, ws } = await team();
  const other = mk(b, { name: 'other', cwd: dir, workspaceKey: ws.key });
  setUser(b, other, w1, 'sub'); // w1: 계보 부모 lead, 일 부모 other
  b.closeSession(w1, 'killed');
  b.closeSession(x, 'pane exited');
  b.closeSession(p1, 'killed');
  b.closeSession(w2, 'killed');
  await tick(60);
  const to = (s) => b.queued.filter((q) => q.sid === s.sessionId).map((q) => q.text).join('\n');
  assert.match(to(other), /@w1가 닫혔다\(사람이 닫음\)/);
  assert.doesNotMatch(to(lead), /@w1가 닫혔다/, '일 부모가 다르면 계보 부모에게는 보내지 않는다');
  assert.match(to(lead), /@x가 닫혔다\(스스로 끝남\)/, '사람이 하위로 둔 세션(계보 없음)');
  assert.match(to(lead), /@p1가 닫혔다/, '동료가 닫혀도 짝에게');
  assert.match(to(lead), /@w2가 닫혔다/);
  b.branch.notices.stop();
});

test('P159 떼기 = 독립: session.detach는 일 부모(사람이 정한 하위 포함)에서 독립으로 두고 계보는 남는다, 일 부모가 없으면 no_parent', async () => {
  const { b, lead, w1, p1, x } = await team();
  const r = b.branch.detach(x, { by: 'user' });
  assert.deepEqual(r, { detached: true, name: 'x', from: 'lead', by: 'user', relation: 'none' });
  assert.equal(b.branch.relIndex().between(lead.sessionId, x.sessionId).relation, 'none');
  assert.equal(x.parentSessionId, null, '계보가 없던 세션은 그대로 없다');
  b.branch.detach(w1, { by: 'user' });
  assert.equal(w1.parentSessionId, lead.sessionId, '계보는 사실로 남는다');
  assert.deepEqual(b.branch.relIndex().explicitOf(lead.sessionId, w1.sessionId).source, 'user');
  assert.throws(() => b.branch.detach(p1, { by: 'user' }), (e) => e.code === 'no_parent', '동료는 일 부모가 없다');
  await tick(60);
  assert.ok(b.queued.some((q) => q.sid === w1.sessionId && /사람이 독립으로 둠/.test(q.text)));
  assert.ok(b.queued.some((q) => q.sid === lead.sessionId && /@w1는 이제 너의 하위 세션이 아니다\(사람이 독립으로 둠\)/.test(q.text)));
  // 닫힌 일 부모에서도 독립으로 둔다(관계 줄만, 선은 열지 않는다)
  const f = await team();
  f.b.closeSession(f.lead, 'killed');
  const links0 = f.b.store.links().filter((l) => !l.removedAt).length;
  f.b.branch.detach(f.w1, { by: 'user' });
  assert.equal(f.b.branch.relIndex().workParentOf(f.w1.sessionId), null);
  assert.equal(f.b.store.links().filter((l) => !l.removedAt).length, links0);
  b.branch.notices.stop(); f.b.branch.notices.stop();
});

test('P159 API 글: session.detach·link.delete는 일 부모를 보고, 떼기 확인은 독립으로 두기, --head는 계보를 지운다', () => {
  const src = fs.readFileSync(path.join(HERE, '..', 'src', 'backend.mjs'), 'utf8');
  assert.match(src, /const parentLink = !!\(a && b && this\.workParentOf\(b\.sessionId\) === a\.sessionId\)/);
  assert.match(src, /const pid = this\.workParentOf\(s\.sessionId\);\r?\n\s+if \(!pid\) throw keyed\(apiError\('no_parent'/);
  const br = fs.readFileSync(path.join(HERE, '..', 'src', 'branch.mjs'), 'utf8');
  assert.match(br, /if \(by === 'user'\) return this\.independent\(s, \{ notify \}\);/);
  assert.match(br, /maybeHead[\s\S]*this\.detach\(s, \{ by: 'head'/);
});
