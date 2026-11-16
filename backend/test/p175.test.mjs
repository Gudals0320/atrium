// P175 단위 시험: 판에서 두 세션을 이을 때 하위 / 동료를 고른다.
// 고른 값에 따라 연결 + 관계가 한 번에 저장되고(하위는 자동 규칙 그대로, 동료는 사람이 정한 peer), 역할 이름 기본값이 관계를 따른다.
// 선 보기(linkView)에 관계가 붙고, 창의 토글 값·선 이름표가 그것을 따른다. herdr·hc와 claude 없이 돈다(p156·p159의 가짜 판 틀).
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
import { Backend } from '../src/backend.mjs';
import { workspaceOf } from '../src/git.mjs';
import { linkRelationPlan, linkDefaultRole, LINK_CHOICES, PEER_ROLE } from '../src/relations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p175-'));

// ---------- 가짜 판(p159와 같은 틀) + Backend의 linkCreate·linkView ----------
async function fakeBoard() {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  store.insertWorkspace({ ...ws, createdAt: 1 });
  const b = {
    cfg: { profile: 'dev', terminalSession: 'atrium-dev-p175test', port: 0, dataDir: dir, claudeProjects: path.join(dir, 'projects') }, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(),
    broadcasts: [], spawned: [], queued: [], killing: new Set(),
    api: { broadcast: (e, d) => b.broadcasts.push([e, d]) }, log: () => {}, requireTerminal: () => {},
    hooked: (s) => s.kind === 'claude' && s.origin === 'board',
    summary: (s) => ({ state: s.rt.sleep ? 'sleeping' : 'ready', ask: null }),
    broadcastSession: (s) => b.broadcasts.push(['session', s.sessionId]),
    relay: { stats: () => [] },
    resolve(ref) { const s = [...b.sessions.values()].find((x) => x.sessionId === ref || x.name === ref); if (!s) throw Object.assign(new Error('없음'), { code: 'not_found' }); return s; },
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
  b.store.linkPromptStats = () => ({ n: 0, at: null });
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20 });
  // 판의 linkCreate·linkView·linkPromptView를 가짜 판 위에서 부른다
  for (const k of ['linkCreate', 'linkView', 'linkPromptView', 'linksOpen']) b[k] = Backend.prototype[k].bind(b);
  const mk = (name) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, workspaceKey: ws.key, paneId: 'w1:p1', agentName: name, model: 'haiku', effort: 'low', permissionMode: 'acceptEdits', kind: 'claude', origin: 'board', parentSessionId: null, rt: newRuntime({ kind: 'claude' }), createdAt: 1 };
    store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
    b.sessions.set(s.sessionId, s);
    return s;
  };
  return { b, mk, A: mk('alpha'), B: mk('beta'), C: mk('gamma') };
}
const relNotices = (b) => { b.branch.notices.flushAll(); return b.queued.filter((q) => q.text.includes('사람이 판에서 정함')); };

// ---------- 규칙(순수) ----------
test('P175 규칙: 고른 값 → 저장할 관계(하위는 자동에 맡기고, 어긋날 때만 사람이 정한 하위), 기본 역할', () => {
  assert.deepEqual(LINK_CHOICES, ['sub', 'peer']);
  // 하위: 관계 없음·이미 a 아래 하위면 저장하지 않는다(역할 선 = 하위 자동 규칙)
  assert.equal(linkRelationPlan('sub', null, 'a'), null);
  assert.equal(linkRelationPlan(undefined, null, 'a'), null, '기본은 하위');
  assert.equal(linkRelationPlan('sub', { relation: 'sub', up: 'a' }, 'a'), null);
  // 동료·독립·거꾸로 된 하위였으면 사람이 정한 하위로 바꾼다
  assert.equal(linkRelationPlan('sub', { relation: 'peer', up: null }, 'a'), 'sub');
  assert.equal(linkRelationPlan('sub', { relation: 'none', up: null }, 'a'), 'sub');
  assert.equal(linkRelationPlan('sub', { relation: 'sub', up: 'b' }, 'a'), 'sub');
  // 동료: 이미 동료가 아니면 동료
  assert.equal(linkRelationPlan('peer', null, 'a'), 'peer');
  assert.equal(linkRelationPlan('peer', { relation: 'sub', up: 'a' }, 'a'), 'peer');
  assert.equal(linkRelationPlan('peer', { relation: 'peer', up: null }, 'a'), null);
  assert.equal(linkDefaultRole('peer'), PEER_ROLE); assert.equal(PEER_ROLE, '동료');
  assert.equal(linkDefaultRole('sub'), null);
});

test('P175 하위로 잇기: 연결과 역할만 저장(관계 줄 없음), 지금 관계는 자동 하위, 관계 알림 없음', async () => {
  const { b, A, B } = await fakeBoard();
  const r = b.linkCreate({ from: A.sessionId, to: B.sessionId, role: '리뷰어', relation: 'sub' });
  assert.equal(r.relation, 'sub'); assert.equal(r.relationSet, null);
  assert.deepEqual(b.store.relationRows(), [], '하위는 자동 규칙 그대로');
  assert.equal(r.link.role, '리뷰어');
  assert.deepEqual(r.link.relation, { relation: 'sub', source: 'auto', up: A.sessionId });
  assert.equal(b.queued.filter((q) => q.sid === A.sessionId && q.text.includes('"리뷰어"')).length, 1, 'A에 역할 알림');
  assert.equal(relNotices(b).length, 0, '자동이라 관계 알림은 없다');
  // relation 없이 부르면(옛 창·CLI) 하위와 같다
  const C = [...b.sessions.values()].find((x) => x.name === 'gamma');
  assert.equal(b.linkCreate({ from: A.sessionId, to: C.sessionId, role: '리뷰어' }).relation, 'sub');
  assert.deepEqual(b.store.relationRows(), []);
  b.branch.notices.stop();
});

test('P175 동료로 잇기: 연결 + 사람이 정한 peer가 한 번에, 역할 기본은 동료, 두 세션에 관계 알림, 선 보기에 관계', async () => {
  const { b, A, B } = await fakeBoard();
  const r = b.linkCreate({ from: A.sessionId, to: B.sessionId, role: '', relation: 'peer' });
  assert.equal(r.relation, 'peer'); assert.equal(r.relationSet, 'peer');
  const rows = b.store.relationRows();
  assert.equal(rows.length, 1);
  assert.deepEqual({ a: rows[0].a, b: rows[0].b, relation: rows[0].relation, source: rows[0].source }, { a: A.sessionId, b: B.sessionId, relation: 'peer', source: 'user' });
  // 역할 이름: 비우면 "동료"(저장은 그대로, P159 선 보기는 동료 쌍의 역할을 숨기고 storedRole에 둔다)
  const l = b.store.linkByPair(A.sessionId, B.sessionId);
  assert.equal(l.role, PEER_ROLE);
  assert.equal(r.link.role, null); assert.equal(r.link.storedRole, PEER_ROLE);
  assert.deepEqual(r.link.relation, { relation: 'peer', source: 'user', up: null });
  // 선 기록: 관계 바뀜과 역할이 한 선에
  const kinds = b.store.linkEvents(l.linkId).map((e) => e.kind);
  assert.ok(kinds.includes('relation') && kinds.includes('role'), kinds.join(','));
  assert.ok(b.broadcasts.some(([e, d]) => e === 'relation.updated' && d.relation === 'peer' && d.source === 'user'));
  // P156·P159 규칙 그대로: 두 세션 모두에게 관계 알림
  const nl = relNotices(b);
  assert.equal(nl.length, 2);
  assert.match(nl.find((q) => q.sid === B.sessionId).text, /@alpha와 너는 이제 동료다/);
  // 일 부모가 생기지 않는다(동료)
  assert.equal(b.branch.relIndex().workParentOf(B.sessionId), null);
  // 사람이 쓴 이름은 그대로
  const C = [...b.sessions.values()].find((x) => x.name === 'gamma');
  b.linkCreate({ from: A.sessionId, to: C.sessionId, role: '설계 짝', relation: 'peer' });
  assert.equal(b.store.linkByPair(A.sessionId, C.sessionId).role, '설계 짝');
  // linksOpen도 선마다 관계를 붙인다
  const open = b.linksOpen();
  assert.ok(open.every((x) => x.relation && x.relation.relation === 'peer'));
  b.branch.notices.stop();
});

test('P175 다시 잇기: 동료였던 쌍을 하위로 고르면 사람이 정한 하위, 하위였던 쌍을 동료로', async () => {
  const { b, A, B } = await fakeBoard();
  b.linkCreate({ from: A.sessionId, to: B.sessionId, role: '', relation: 'peer' });
  const r = b.linkCreate({ from: A.sessionId, to: B.sessionId, role: '리뷰어', relation: 'sub' });
  assert.equal(r.relationSet, 'sub');
  assert.deepEqual(r.link.relation, { relation: 'sub', source: 'user', up: A.sessionId });
  assert.equal(r.link.role, '리뷰어', '하위면 역할 이름이 보인다');
  assert.equal(b.branch.relIndex().workParentOf(B.sessionId), A.sessionId);
  // 하위 → 동료
  const p = b.linkCreate({ from: A.sessionId, to: B.sessionId, role: '리뷰어', relation: 'peer' });
  assert.equal(p.relationSet, 'peer'); assert.equal(p.link.relation.relation, 'peer');
  // 선 기록 토글이 기본 이름을 바꿀 때 부르는 모양: 관계 + 새 기본 이름이 한 번에, A에게 새 역할 알림
  const before = b.queued.length;
  const s2 = b.linkCreate({ from: A.sessionId, to: B.sessionId, role: 'Reviewer', relation: 'sub' });
  assert.equal(s2.relationSet, 'sub'); assert.equal(s2.link.role, 'Reviewer');
  assert.ok(b.queued.slice(before).some((q) => q.sid === A.sessionId && q.text.includes('"Reviewer"')));
  const p2 = b.linkCreate({ from: A.sessionId, to: B.sessionId, role: PEER_ROLE, relation: 'peer' });
  assert.equal(p2.relationSet, 'peer'); assert.equal(b.store.linkByPair(A.sessionId, B.sessionId).role, PEER_ROLE);
  // 이미 동료면 관계를 다시 쓰지 않는다
  assert.equal(b.linkCreate({ from: A.sessionId, to: B.sessionId, role: '리뷰어', relation: 'peer' }).relationSet, null);
  b.branch.notices.stop();
});

test('P175 거절: 모르는 관계, 빈 역할(하위), 하위 고리는 선을 만들지 않는다', async () => {
  const { b, A, B } = await fakeBoard();
  assert.throws(() => b.linkCreate({ from: A.sessionId, to: B.sessionId, role: 'x', relation: 'boss' }), /관계는/);
  assert.throws(() => b.linkCreate({ from: A.sessionId, to: B.sessionId, role: '', relation: 'sub' }), /역할은/);
  assert.equal(b.store.linkByPair(A.sessionId, B.sessionId), null);
  // A가 B의 하위(사람이 정함)인데 B를 A의 하위로 → 같은 쌍을 뒤집는 것이라 고리가 아니다. 셋이면 고리
  const C = [...b.sessions.values()].find((x) => x.name === 'gamma');
  b.branch.setRelation(B, A, 'sub', { source: 'user', by: 'user', quiet: true });
  b.branch.setRelation(C, B, 'sub', { source: 'user', by: 'user', quiet: true }); // C > B > A
  b.branch.setRelation(A, C, 'peer', { source: 'user', by: 'user', quiet: true }); // A·C는 동료(선은 있고 역할은 없다)
  assert.throws(() => b.linkCreate({ from: A.sessionId, to: C.sessionId, role: '리뷰어', relation: 'sub' }), (e) => e.code === 'cycle');
  assert.equal(b.store.linkByPair(A.sessionId, C.sessionId).role, null, '고리면 역할도 정하지 않는다');
  assert.equal(b.branch.relationBetween(A.sessionId, C.sessionId).relation, 'peer', '관계도 그대로');
  b.branch.notices.stop();
});

// ---------- 창: 토글 값·선 이름표·사전 ----------
test('P175 창: 잇는 상자·선 기록 토글이 부르는 API, 동료 기본 이름 저장, 두 사전의 글', async () => {
  // Links.jsx는 JSX라 node가 바로 읽지 못한다. 부르는 모양을 글로 확인한다(토글 값·이름표는 app/test/p175-lib.test.mjs)
  const src = fs.readFileSync(path.join(ROOT, 'app', 'src', 'renderer', 'Links.jsx'), 'utf8');
  assert.match(src, /api\.call\('link\.create', \{ from, to, role: sent, relation: rel \}\)/, '잇는 상자가 관계를 함께 보낸다');
  assert.match(src, /api\.call\('relation\.set', \{ a: link\.from, b: link\.to, relation: k \}\)/, '선 기록 토글은 relation.set(사람)');
  assert.match(src, /rel === 'peer' && typed === t\('relations\.peerRole'\) \? PEER_ROLE : typed/, '동료 기본 이름은 판의 낱말로 저장');
  assert.match(src, /if \(!edited\) setRole\(roleDefault\(t, k\)\)/, '사람이 쓴 이름은 관계를 바꿔도 그대로');
  assert.match(src, /next \? api\.call\('link\.create', \{ from: link\.from, to: link\.to, role: next, relation: k \}\) : api\.call\('relation\.set'/, '선 기록 토글: 기본 이름이면 역할도 함께, 아니면 관계만');
  const ko = (await import('../../app/src/renderer/locales/ko.js')).default;
  const en = (await import('../../app/src/renderer/locales/en.js')).default;
  for (const d of [ko, en]) for (const k of ['as', 'asLabel', 'subHelp', 'peerHelp', 'createdPeer', 'setFail']) assert.ok(d.linkRel && d.linkRel[k], k);
});
