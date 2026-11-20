// P263 단위 시험: 연결 알림을 넣지 않고 "알겠다" 줄을 모든 알림에서 뺀다. 받는 쪽이 할 일을 바꾸는 알림(관계 바뀜, 독립으로 둠, 하위 닫힘,
// 전달 실패, 멈춤)은 그대로 간다. 빠진 알림의 내용(이름, 역할, 종류, 패널, 관계, 마지막 지시)은 atrium me가 준다. 끊기는 일 부모를 바꾸지 않는다.
// herdr·hc와 claude 없이 돈다(p175의 가짜 판 틀).
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
import { Branch, boardSkill } from '../src/branch.mjs';
import { Backend } from '../src/backend.mjs';
import { workspaceOf } from '../src/git.mjs';
import { noticeText, ME_LINE } from '../src/link-notice.mjs';
import * as links from '../src/links.mjs';
import { BOARD_SYSTEM_PROMPT } from '../src/launch.mjs';
import { HARNESS_PROMPT } from '../src/harness.mjs';
import { VERBS } from '../src/cli-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p263-'));

// ---------- 가짜 판(p159와 같은 틀) + Backend의 linkCreate·linkView ----------
async function fakeBoard() {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  store.insertWorkspace({ ...ws, createdAt: 1 });
  const b = {
    cfg: { profile: 'dev', terminalSession: 'atrium-dev-p263test', port: 0, dataDir: dir, claudeProjects: path.join(dir, 'projects') }, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(),
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
  for (const k of ['linkCreate', 'linkDelete', 'linkView', 'linkPromptView', 'linksOpen', 'workParentOf']) b[k] = Backend.prototype[k].bind(b);
  const mk = (name) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, workspaceKey: ws.key, paneId: 'w1:p1', agentName: name, model: 'haiku', effort: 'low', permissionMode: 'acceptEdits', kind: 'claude', origin: 'board', parentSessionId: null, rt: newRuntime({ kind: 'claude' }), createdAt: 1 };
    store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
    b.sessions.set(s.sessionId, s);
    return s;
  };
  return { b, mk, A: mk('alpha'), B: mk('beta'), C: mk('gamma') };
}

const ACK = /알겠다"고만/;
const flush = (b) => { b.branch.notices.flushAll(); return b.queued; };

test('P263 잇기(하위): 받는 세션 둘 다 알림 없음. atrium me가 역할·이름·종류·패널을 준다', async () => {
  const { b, A, B } = await fakeBoard();
  B.kind = 'codex'; B.paneId = 'w7:p2';
  const r = b.linkCreate({ from: A.sessionId, to: B.sessionId, role: '리뷰어', relation: 'sub' });
  assert.equal(r.deliveryId, null); assert.equal(r.notice, null);
  assert.equal(flush(b).length, 0, '잇기만으로는 아무에게도 넣지 않는다');
  const me = b.branch.me(A);
  const kid = me.children.find((c) => c.name === 'beta');
  assert.ok(kid, '하위로 보인다');
  assert.equal(kid.role, '리뷰어'); assert.equal(kid.kind, 'codex'); assert.equal(kid.paneId, 'w7:p2'); assert.equal(kid.source, 'user');
  const meB = b.branch.me(B);
  assert.equal(meB.parent.name, 'alpha'); assert.equal(meB.parent.role, '리뷰어'); assert.equal(meB.parent.kind, 'claude'); assert.equal(meB.parent.paneId, 'w1:p1');
  b.branch.notices.stop();
});

test('P263 잇기(동료)와 관계 바꾸기: 관계 알림은 그대로 가고 "알겠다" 줄이 없다. 역할 알림은 없다', async () => {
  const { b, A, B } = await fakeBoard();
  b.linkCreate({ from: A.sessionId, to: B.sessionId, role: '', relation: 'peer' });
  const q = flush(b);
  assert.equal(q.length, 2, '두 세션에 관계 알림');
  for (const x of q) { assert.ok(x.text.startsWith('[Atrium 보드] '), x.text); assert.ok(x.text.endsWith(ME_LINE)); assert.doesNotMatch(x.text, ACK); assert.doesNotMatch(x.text, /연결 알림/); }
  const me = b.branch.me(A);
  assert.equal(me.peers[0].name, 'beta'); assert.equal(me.peers[0].kind, 'claude'); assert.equal(me.peers[0].paneId, 'w1:p1');
  b.branch.notices.stop();
});

test('P263 끊기: 받는 세션에 알림 없음, 응답에 cut. 확인 글이 알린다고 하지 않는다. me의 역할 연결에서 빠진다', async () => {
  const { b, A, B, C } = await fakeBoard();
  // 역할만 있는 선(관계 줄 없는 옛 역할 선): 역할 연결로 보인다
  const l = b.ensureLink(A.sessionId, C.sessionId, { role: '조사' });
  const before = b.branch.me(A);
  assert.ok(before.children.some((c) => c.name === 'gamma') || before.roles.some((r) => r.name === 'gamma'));
  const ask = b.linkDelete({ link: l.linkId });
  assert.ok(ask.needsConfirm); assert.doesNotMatch(ask.message, /알립니다/);
  const r = b.linkDelete({ link: l.linkId, confirm: true });
  assert.equal(r.removed, true); assert.equal(r.deliveryId, null); assert.equal(r.cut, true);
  assert.equal(flush(b).length, 0);
  const after = b.branch.me(A);
  assert.ok(!after.roles.some((x) => x.name === 'gamma') && !after.children.some((x) => x.name === 'gamma'));
  // 역할 없는 선: cut false
  const l2 = b.ensureLink(B.sessionId, C.sessionId, {});
  assert.equal(b.linkDelete({ link: l2.linkId, confirm: true }).cut, false);
  b.branch.notices.stop();
});

test('P263 끊기는 일 부모를 바꾸지 않는다(사람이 정한 하위·동료·띄운 하위). 하위에서 빼는 것은 독립으로 두기이고 그 알림은 간다', async () => {
  const { b, A, B, C } = await fakeBoard();
  b.linkCreate({ from: A.sessionId, to: B.sessionId, role: '리뷰어', relation: 'sub' });
  const lAB = b.store.linkByPair(A.sessionId, B.sessionId);
  b.linkDelete({ link: lAB.linkId, confirm: true });
  assert.equal(b.branch.relIndex().workParentOf(B.sessionId), A.sessionId, '선만 끊어도 하위 그대로(확인 글이 말하는 대로)');
  assert.equal(flush(b).length, 0);
  // 동료 선을 끊어도 동료 줄은 남는다
  b.linkCreate({ from: A.sessionId, to: C.sessionId, role: '', relation: 'peer' });
  flush(b); b.queued.length = 0;
  b.linkDelete({ link: b.store.linkByPair(A.sessionId, C.sessionId).linkId, confirm: true });
  assert.deepEqual(b.branch.relIndex().peersOf(A.sessionId).map((p) => p.id), [C.sessionId]);
  assert.equal(flush(b).length, 0);
  // 띄운 하위(계보)의 선: 선만 끊으면 일 부모 그대로, 독립으로도 두면 두 세션에 알림(알겠다 줄 없음)
  const kid = (await b.branch.spawnChild(A, { name: 'k1', wait: false }).catch(() => null)) && [...b.sessions.values()].find((x) => x.name === 'k1');
  if (kid) {
    const lk = b.store.linkByPair(A.sessionId, kid.sessionId);
    b.queued.length = 0;
    b.linkDelete({ link: lk.linkId, confirm: true });
    assert.equal(b.branch.relIndex().workParentOf(kid.sessionId), A.sessionId);
    assert.equal(flush(b).length, 0);
  }
  b.queued.length = 0;
  b.branch.independent(B);
  const q = flush(b);
  assert.equal(q.length, 2, '독립으로 둠은 두 세션에');
  for (const x of q) { assert.match(x.text, /독립으로 둠/); assert.doesNotMatch(x.text, ACK); }
  b.branch.notices.stop();
});

test('P263 연결 알림 글(roleNotice·unlinkNotice·paneChangedNotice)은 없다. 판 소스 어디에도 "알겠다고만 답해라"가 없다', () => {
  for (const k of ['roleNotice', 'unlinkNotice', 'paneChangedNotice']) assert.equal(links[k], undefined, k);
  assert.ok(!noticeText(['@w1가 닫혔다(사람이 닫음).']).includes('알겠다'));
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(mjs|js|md)$/.test(f.name) && ACK.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  walk(SRC);
  assert.deepEqual(hits, []);
});

test('P263 안내 글: 판 안내·하네스 안내·스킬·help가 "[Atrium 보드]" 글을 연결 알림이라고 하지 않고, 잇기·끊기는 atrium me로 본다고 말한다', () => {
  const texts = { board: BOARD_SYSTEM_PROMPT, harness: HARNESS_PROMPT, skill: boardSkill(), me: VERBS.find((v) => v.name === 'me').does };
  for (const [k, t] of Object.entries(texts)) {
    assert.doesNotMatch(t, /보드가 알려 주는 연결/, k);
    assert.match(t, /잇거나 끊은 역할 연결/, k);
    assert.match(t, /atrium me|여기에만 보인다/, k);
  }
  assert.match(BOARD_SYSTEM_PROMPT, /"\[Atrium 보드\]"\(예전 이름도\)로 시작하는 글은 보드 알림이다/);
  assert.equal(BOARD_SYSTEM_PROMPT.split('\n').length, 9, '판 안내는 아홉 줄 그대로(P284: 결정 카드 한 줄을 더했다)');
  assert.ok(!/[\r\n"]/.test(HARNESS_PROMPT), '하네스 안내문은 한 줄, 큰따옴표 없이');
  const help = fs.readFileSync(path.join(HERE, '..', 'bin', 'atrium-child.mjs'), 'utf8');
  assert.match(help, /사람이 판에서 잇거나 끊은 역할 연결은 알림 없이 여기에만 보인다/);
});
