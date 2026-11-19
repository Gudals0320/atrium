// P242: rig 3 2단계 — 항목, 길, 받음·반려. put(정상, 섹터 밖, 길에 없는 종류, 해시, --from, --redo), 길 전달과 깨우는 글(기다리는 것 n, 한 글로 합침),
// accept·return·drop·pass, 뒤집기와 늦은 반려, inbox, for와 답 없는 받은 항목, 멈춘 역할 일깨움 한 번 → 장부, 입력 창구, 장부 종류, 실을 글·안내, 구조 보기의 수.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig } from '../src/rig.mjs';
import { RigAmp } from '../src/rig-amp.mjs';
import { RigAdmin } from '../src/rig-admin.mjs';
import { writeSessionSettings } from '../src/launch.mjs';
import { newRuntime, applyHook } from '../src/state.mjs';
import { RIG3_EVENT_KINDS, RIG_EVENT_KINDS } from '../src/rig-ledger.mjs';
import { loadText, rig3Guide, validateRig3 } from '../src/rig3.mjs';
import { Rig3Roles, ROLE_SPAWN } from '../src/rig3-roles.mjs';
import { RIG3_ITEM_OPS, parseItemId, answerKinds, rig3Handlers, INTAKE_DIR } from '../src/rig3-items.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p242-'));
const DOC = (name) => [`# ${name}`, '', '## 맡은 것', `${name}의 일`, '', '## 받는 것과 내는 것', '-', '', '## 기준', '- 기준', '', '## 요령', '- 요령'].join('\n');
const DEF = () => ({
  version: 3, name: 'p242', purpose: '.atrium/purpose.md',
  roles: { data: { owns: ['data/'] }, ideas: { owns: ['hypotheses/'] }, verify: { owns: ['verify/'] } },
  flows: [
    { item: 'snapshot', from: 'data', to: 'ideas' },
    { item: 'hypothesis', from: 'ideas', to: 'verify' },
    { item: 'result', from: 'verify', to: 'ideas', for: 'hypothesis' },
    { item: 'hint', from: 'human', to: 'ideas' },
    { item: 'request', from: 'human', to: 'data' },
  ],
});
async function board(cfg = {}, mod = null) {
  const def = DEF();
  if (mod) mod(def);
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.atrium', 'roles'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.atrium', 'purpose.md'), '# 목적\nP242\n');
  for (const r of Object.keys(def.roles)) fs.writeFileSync(path.join(dir, '.atrium', 'roles', `${r}.md`), DOC(r));
  fs.writeFileSync(path.join(dir, '.atrium', 'rig.json'), JSON.stringify(def, null, 2));
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const casts = []; const items = new Map(); let dn = 0;
  const b = { cfg: { hookTimeoutSec: 2, sessionsDir: path.join(dir, 'sessions'), dataDir: path.join(dir, 'data-board'), rig3DeadGraceMs: 0, ...cfg }, store, sessions: new Map(), log: () => {}, api: { broadcast: (n, d) => casts.push({ n, d }) } };
  b.rig = new Rig(b); b.rigAmp = new RigAmp(b); b.rig3 = new Rig3Roles(b);
  // 대기열(넣은 글, 대기 중이면 retext로 바뀜)
  b.queue = {
    enqueue: (sessionId, text, opts) => { const d = { deliveryId: 'd' + ++dn, sessionId, text, opts, status: 'queued' }; items.set(d.deliveryId, d); return d; },
    retext: (id, text) => { const d = items.get(id); if (!d || d.status !== 'queued') return null; d.text = text; return d; },
    cancel: (id) => { const d = items.get(id); if (!d || d.status !== 'queued') throw Object.assign(new Error('x'), { code: 'not_cancellable' }); d.status = 'cancelled'; return d; },
  };
  let n = 0;
  const spawnedP = [];
  b.spawn = async (p) => {
    spawnedP.push(p);
    const role = p[ROLE_SPAWN]; const kind = p.kind || 'claude';
    const L = b.rig3.launchOf(ws.key, role, { kind, cwd: p.cwd });
    const sessionId = `sid-${p.name}-${++n}`;
    const s = { sessionId, name: p.name, kind, cwd: p.cwd, workspaceKey: ws.key, hookToken: `tok-${n}`, permissionMode: L.permissionMode, rt: newRuntime({ kind, hooked: true }), rigRole: L.role };
    s.rt.cwd = p.cwd;
    s.settingsPath = writeSessionSettings({ file: path.join(dir, 'sessions', `${sessionId}.json`), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: s.hookToken, sessionId, amp: L.amp });
    b.sessions.set(sessionId, s);
    return { sessionId, name: p.name };
  };
  b.kill = async (p) => { b.sessions.delete(p.session); return { ok: true }; };
  const slept = []; const woke = [];
  b.sleeper = { isAsleep: (s) => !!s.rt.sleep, info: () => null, sleep: async (s, o) => { slept.push([s.name, o]); s.rt.sleep = { at: Date.now(), by: o.by, scope: o.scope }; return { slept: true }; }, wake: async (s, why) => { woke.push([s.name, why]); s.rt.sleep = null; return { awake: true }; } };
  store.setRigEnabled(ws.key, true);
  await b.rig3.onEnabled(ws.key, true);
  const S = (role) => [...b.sessions.values()].find((s) => s.rigRole === role);
  const I = b.rig3.items;
  const key = ws.key;
  const file = (rel, text = rel) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
  const put = (role, rel, o = {}) => I.put(key, { role, session: S(role).sessionId, file: path.join(dir, rel), ...o });
  const ledger = (kinds) => store.rigEvents({ ws: key, limit: 1000, kinds });
  const toRole = (role) => [...items.values()].filter((d) => d.sessionId === S(role).sessionId && !/너는 rig 역할/.test(d.text));
  const deliverAll = () => { for (const d of items.values()) d.status = 'confirmed'; };
  return { dir, store, key, b, I, S, file, put, ledger, toRole, deliverAll, items, casts, spawnedP, slept, woke };
}
const code = async (p, c) => { try { await p; } catch (e) { assert.equal(e.code, c, e.message); return e.message; } assert.fail(`기대한 거절 ${c}`); };
const codeSync = (fn, c) => { try { fn(); } catch (e) { assert.equal(e.code, c, e.message); return e.message; } assert.fail(`기대한 거절 ${c}`); };

test('P242 put: 정상(종류·낸 역할·해시·장부), 섹터 밖, 길에 없는 종류, 같은 파일 다시 내기, --from', async () => {
  const B = await board();
  B.file('data/s1.md', 'snap 1');
  const r = await B.put('data', 'data/s1.md', { kind: 'snapshot' });
  assert.equal(r.item.id, 'snapshot-1'); assert.equal(r.item.rev, 1); assert.equal(r.item.path, 'data/s1.md'); assert.deepEqual(r.item.to, ['ideas']);
  assert.match(r.item.sha256, /^[0-9a-f]{64}$/); assert.equal(r.waitingOwn, 1);
  const row = B.store.getItem(B.key, 'snapshot-1');
  assert.equal(row.role, 'data'); assert.equal(row.kind, 'snapshot'); assert.equal(row.cycle, null); assert.equal(row.state, 'live'); assert.equal(row.sessionId, B.S('data').sessionId);
  assert.deepEqual(B.store.receipts(B.key, { itemId: 'snapshot-1' }).map((x) => [x.role, x.state, x.flow]), [['ideas', 'waiting', 0]]);
  const ev = B.ledger(['item_put']);
  assert.equal(ev.length, 1); assert.equal(ev[0].value, 'new'); assert.equal(ev[0].seat, 'data'); assert.equal(ev[0].ref, 'snapshot-1'); assert.equal(ev[0].line, 0); assert.equal(ev[0].data.sha256, r.item.sha256);
  // 섹터 밖(남의 섹터, 워크스페이스 밖), 길에 없는 종류, 없는 파일
  B.file('hypotheses/x.md');
  assert.match(await code(B.put('data', 'hypotheses/x.md', { kind: 'snapshot' }), 'out_of_sector'), /섹터 밖 파일이다: hypotheses\/x\.md\. 항목은 네 섹터\(data\/\)/);
  await code(B.I.put(B.key, { role: 'data', file: path.join(os.tmpdir(), 'nowhere.md'), kind: 'snapshot' }), 'out_of_sector');
  B.file('data/s2.md', 'snap 2');
  assert.match(await code(B.put('data', 'data/s2.md', { kind: 'hypothesis' }), 'no_flow'), /길에 없는 종류다: hypothesis.*낼 수 있는 것: snapshot/);
  await code(B.put('data', 'data/none.md', { kind: 'snapshot' }), 'not_found');
  // 낸 파일을 새 항목으로 다시 내지 않는다
  assert.match(await code(B.put('data', 'data/s1.md', { kind: 'snapshot' }), 'item_file_used'), /이미 낸 항목 snapshot-1.*--redo snapshot-1/);
  // --from
  B.file('hypotheses/h1.md', 'h1');
  const h = await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis', from: 'snapshot-1' });
  assert.equal(h.item.id, 'hypothesis-1'); assert.equal(h.item.from, 'snapshot-1');
  await code(B.put('ideas', 'hypotheses/x.md', { kind: 'hypothesis', from: 'nothing-9' }), 'not_found');
  assert.deepEqual(parseItemId('trade-report-58'), { kind: 'trade-report', n: 58 });
});

test('P242 해시: 낸 뒤 파일이 바뀌면 받을 때·inbox에서 알아보고 장부에 한 번(item_changed)', async () => {
  const B = await board();
  B.file('data/s1.md', 'v1');
  await B.put('data', 'data/s1.md', { kind: 'snapshot' });
  B.file('data/s1.md', 'v1 고침');
  const ib = B.I.inbox(B.key, 'ideas');
  assert.equal(ib.received[0].changed, 'changed');
  const a = B.I.accept(B.key, { role: 'ideas', id: 'snapshot-1' });
  assert.equal(a.changed, 'changed');
  const ev = B.ledger(['item_changed']);
  assert.equal(ev.length, 1); assert.equal(ev[0].value, 'changed'); assert.equal(ev[0].ref, 'snapshot-1');
});

test('P242 --redo: 낸 역할만, 같은 내용은 거절, 다음 판(rev)은 받는 역할에게 다시 간다', async () => {
  const B = await board();
  B.file('hypotheses/h1.md', 'h1');
  await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis' });
  B.file('verify/r.md', 'x');
  assert.match(await code(B.put('verify', 'verify/r.md', { redo: 'hypothesis-1' }), 'forbidden'), /다시 내기\(--redo\)는 낸 역할만/);
  assert.match(await code(B.put('ideas', 'hypotheses/h1.md', { redo: 'hypothesis-1' }), 'item_same'), /내용이 같다/);
  B.file('hypotheses/h1.md', 'h1 고침');
  const r = await B.put('ideas', 'hypotheses/h1.md', { redo: 'hypothesis-1' });
  assert.equal(r.item.id, 'hypothesis-1'); assert.equal(r.item.rev, 2); assert.equal(r.item.kind, 'hypothesis');
  const revs = B.store.itemRevs(B.key, 'hypothesis-1');
  assert.deepEqual(revs.map((x) => [x.rev, x.state]), [[1, 'superseded'], [2, 'live']]);
  assert.deepEqual(B.store.receipts(B.key, { itemId: 'hypothesis-1' }).map((x) => [x.rev, x.state]), [[1, 'superseded'], [2, 'waiting']]);
  assert.equal(B.ledger(['item_put']).at(-1).value, 'redo');
  assert.match(B.toRole('verify').at(-1).text, /hypothesis-1 판 2\(다시 냄\)/);
});

test('P242 길 전달과 깨우는 글: 받은 항목(경로·종류·낸 역할·어디서), 기다리는 것 n, 대기 중이면 한 글로 합침', async () => {
  const B = await board();
  B.file('data/s1.md', 's');
  await B.put('data', 'data/s1.md', { kind: 'snapshot' });
  let w = B.toRole('ideas');
  assert.equal(w.length, 1);
  assert.equal(w[0].opts.origin.kind, 'board');
  assert.match(w[0].text, /^\[Atrium 보드\] rig 받은 것:\n- snapshot-1 \(snapshot, data가 냄\): data\/s1\.md/);
  assert.match(w[0].text, /답하지 않은 받은 것 1\. 네가 낸 것 가운데 기다리는 것 0\./);
  assert.match(w[0].text, /atrium rig accept <항목>/);
  // ideas가 가설 둘을 낸다: verify의 대기 중인 글 하나에 합쳐진다. ideas의 기다리는 것이 센다
  B.file('hypotheses/h1.md', '1'); B.file('hypotheses/h2.md', '2');
  await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis', from: 'snapshot-1' });
  const r2 = await B.put('ideas', 'hypotheses/h2.md', { kind: 'hypothesis', from: 'snapshot-1' });
  assert.equal(r2.waitingOwn, 2);
  w = B.toRole('verify');
  assert.equal(w.length, 1, '대기 중이면 한 글');
  assert.match(w[0].text, /- hypothesis-1 \(hypothesis, ideas가 냄, snapshot-1에서\): hypotheses\/h1\.md\n- hypothesis-2 /);
  assert.match(w[0].text, /답하지 않은 받은 것 2\./);
  // 넣은 뒤에 온 것은 새 글
  B.deliverAll();
  B.file('hypotheses/h3.md', '3');
  await B.put('ideas', 'hypotheses/h3.md', { kind: 'hypothesis' });
  assert.equal(B.toRole('verify').length, 2);
  // verify가 낸 것이 ideas에게 쌓이면 verify의 깨우는 글에 "기다리는 것"이 보인다
  B.file('verify/r1.md', 'r');
  await B.put('verify', 'verify/r1.md', { kind: 'result', from: 'hypothesis-1' });
  B.deliverAll();
  B.file('hypotheses/h4.md', '4');
  await B.put('ideas', 'hypotheses/h4.md', { kind: 'hypothesis' });
  assert.match(B.toRole('verify').at(-1).text, /네가 낸 것 가운데 기다리는 것 1\./);
});

test('P242 accept·return·drop·pass: 반려는 낸 역할을 깨우고, 낸 역할은 --redo나 drop으로 끝낸다', async () => {
  const B = await board();
  B.file('hypotheses/h1.md', '1'); B.file('hypotheses/h2.md', '2');
  await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis' });
  await B.put('ideas', 'hypotheses/h2.md', { kind: 'hypothesis' });
  B.deliverAll();
  // 너에게 온 것이 아니면 받지 못한다, 까닭 없는 반려는 거절
  codeSync(() => B.I.accept(B.key, { role: 'data', id: 'hypothesis-1' }), 'forbidden');
  codeSync(() => B.I.giveBack(B.key, { role: 'verify', id: 'hypothesis-1', reason: ' ' }), 'bad_request');
  codeSync(() => B.I.giveBack(B.key, { role: 'ideas', id: 'hypothesis-1', reason: 'x' }), 'bad_request');
  const r = B.I.giveBack(B.key, { role: 'verify', id: 'hypothesis-1', reason: '미래 참조' });
  assert.equal(r.to, 'ideas'); assert.equal(r.late, null);
  assert.match(B.toRole('ideas').at(-1).text, /- 반려: hypothesis-1 \(verify\): "미래 참조" → 고쳐 다시 내기 atrium rig put <파일> --redo hypothesis-1/);
  assert.match(B.toRole('ideas').at(-1).text, /반려된 네 항목 1/);
  let ib = B.I.inbox(B.key, 'ideas');
  assert.deepEqual(ib.returned.map((x) => [x.id, x.by[0].role, x.by[0].reason]), [['hypothesis-1', 'verify', '미래 참조']]);
  // 다시 내면 반려 목록에서 빠지고 verify에게 다시 간다
  B.file('hypotheses/h1.md', '1 고침');
  await B.put('ideas', 'hypotheses/h1.md', { redo: 'hypothesis-1' });
  assert.deepEqual(B.I.inbox(B.key, 'ideas').returned, []);
  assert.deepEqual(B.I.inbox(B.key, 'verify').received.map((x) => [x.id, x.rev]), [['hypothesis-2', 1], ['hypothesis-1', 2]], '온 차례대로');
  const a = B.I.accept(B.key, { role: 'verify', id: 'hypothesis-1', note: '시험한다' });
  assert.deepEqual(a.answer, ['result']);
  assert.equal(B.I.accept(B.key, { role: 'verify', id: 'hypothesis-1' }).already, true);
  // 둘째는 반려 → drop
  B.I.giveBack(B.key, { role: 'verify', id: 'hypothesis-2', reason: '시험할 수 없다' });
  codeSync(() => B.I.drop(B.key, { role: 'verify', id: 'hypothesis-2', reason: 'x' }), 'forbidden');
  const d = B.I.drop(B.key, { role: 'ideas', id: 'hypothesis-2', reason: '버린다' });
  assert.equal(d.item.state, 'dropped');
  assert.deepEqual(B.I.inbox(B.key, 'ideas').returned, []);
  await code(B.put('ideas', 'hypotheses/h2.md', { redo: 'hypothesis-2' }), 'bad_request');
  // pass: 항목 하나, 그리고 남은 것 모두
  B.file('hypotheses/h3.md', '3'); B.file('hypotheses/h4.md', '4');
  await B.put('ideas', 'hypotheses/h3.md', { kind: 'hypothesis' });
  await B.put('ideas', 'hypotheses/h4.md', { kind: 'hypothesis' });
  assert.deepEqual(B.I.pass(B.key, { role: 'verify', id: 'hypothesis-3', reason: '이미 본 것' }).passed, ['hypothesis-3']);
  const p = B.I.pass(B.key, { role: 'verify', reason: '이번에는 없다' });
  assert.deepEqual(p.passed.sort(), ['hypothesis-1', 'hypothesis-4'], '받고 답 항목이 없는 hypothesis-1(for)도 pass');
  assert.equal(B.I.pass(B.key, { role: 'verify', reason: '없다' }).turn, true);
  ib = B.I.inbox(B.key, 'verify');
  assert.deepEqual([ib.received.length, ib.unanswered.length], [0, 0]);
  const kinds = B.ledger(['item_accept', 'item_return', 'item_drop', 'item_pass']).map((x) => `${x.kind}:${x.ref || '-'}:${x.value || ''}`);
  assert.deepEqual(kinds, ['item_return:hypothesis-1:receiver', 'item_accept:hypothesis-1:', 'item_return:hypothesis-2:receiver', 'item_drop:hypothesis-2:', 'item_pass:hypothesis-3:item', 'item_pass:hypothesis-1:item', 'item_pass:hypothesis-4:item', 'item_pass:-:turn']);
});

test('P242 뒤집기와 늦은 반려: 받음은 이어진 항목 전까지 뒤집고, 이어진 항목을 가진 역할도 반려한다', async () => {
  const B = await board();
  B.file('data/s1.md', 's');
  await B.put('data', 'data/s1.md', { kind: 'snapshot' });
  B.I.accept(B.key, { role: 'ideas', id: 'snapshot-1' });
  B.file('hypotheses/h1.md', '1'); B.file('hypotheses/h2.md', '2');
  await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis', from: 'snapshot-1' });
  await B.put('ideas', 'hypotheses/h2.md', { kind: 'hypothesis', from: 'snapshot-1' });
  // 뒤집기: 받은 뒤 반려
  B.I.accept(B.key, { role: 'verify', id: 'hypothesis-1' });
  const r = B.I.giveBack(B.key, { role: 'verify', id: 'hypothesis-1', reason: '사양을 쓰다 흠을 찾음' });
  assert.equal(r.late, null);
  assert.equal(B.ledger(['item_return']).at(-1).data.was, 'accepted');
  // 이어진 항목을 낸 뒤에는 뒤집지 못한다
  B.I.accept(B.key, { role: 'verify', id: 'hypothesis-2' });
  B.file('verify/r2.md', 'r');
  await B.put('verify', 'verify/r2.md', { kind: 'result', from: 'hypothesis-2' });
  assert.match(codeSync(() => B.I.giveBack(B.key, { role: 'verify', id: 'hypothesis-2', reason: 'x' }), 'answered'), /이미 result-1를 냈다/);
  // ideas도 snapshot-1에서 이어진 항목을 냈다: 받음을 뒤집지 못한다
  codeSync(() => B.I.giveBack(B.key, { role: 'ideas', id: 'snapshot-1', reason: 'x' }), 'answered');
  // 늦은 반려: verify는 snapshot-1을 받지 않았지만 snapshot-1에서 이어진 hypothesis를 가졌다 → data에게 돌아간다
  const late = B.I.giveBack(B.key, { role: 'verify', id: 'snapshot-1', reason: '스냅숏의 결측' });
  assert.equal(late.to, 'data'); assert.match(late.late, /^hypothesis-/);
  const ev = B.ledger(['item_return']).at(-1);
  assert.equal(ev.value, 'late'); assert.equal(ev.toSeat, 'data');
  assert.match(B.toRole('data').at(-1).text, /반려: snapshot-1 \(verify, hypothesis-\d에서 이어진 것을 보고\): "스냅숏의 결측"/);
  assert.deepEqual(B.I.inbox(B.key, 'data').returned.map((x) => [x.id, x.by[0].late]), [['snapshot-1', true]]);
  // 이어진 것을 가지지 않은 역할은 반려하지 못한다
  B.file('data/s2.md', 's2');
  await B.put('data', 'data/s2.md', { kind: 'snapshot' });
  codeSync(() => B.I.giveBack(B.key, { role: 'verify', id: 'snapshot-2', reason: 'x' }), 'forbidden');
});

test('P242 길의 for: 받았는데 답 항목이 없으면 센다, 답 항목(--from)이나 pass로 풀린다', async () => {
  const B = await board();
  assert.deepEqual(answerKinds(B.b.rig.read(B.key).def.rig3, 'verify', 'hypothesis'), ['result']);
  B.file('hypotheses/h1.md', '1'); B.file('hypotheses/h2.md', '2');
  await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis' });
  await B.put('ideas', 'hypotheses/h2.md', { kind: 'hypothesis' });
  B.I.accept(B.key, { role: 'verify', id: 'hypothesis-1' });
  B.I.accept(B.key, { role: 'verify', id: 'hypothesis-2' });
  let ib = B.I.inbox(B.key, 'verify');
  assert.deepEqual(ib.unanswered.map((x) => [x.id, x.need]), [['hypothesis-1', ['result']], ['hypothesis-2', ['result']]]);
  B.file('verify/r1.md', 'r1');
  await B.put('verify', 'verify/r1.md', { kind: 'result', from: 'hypothesis-1' });
  B.I.pass(B.key, { role: 'verify', id: 'hypothesis-2', reason: '시험 불가' });
  ib = B.I.inbox(B.key, 'verify');
  assert.deepEqual(ib.unanswered, []);
  // ideas는 for가 없는 길(snapshot)을 받으면 받음으로 끝난다
  B.file('data/s1.md', 's');
  await B.put('data', 'data/s1.md', { kind: 'snapshot' });
  B.I.accept(B.key, { role: 'ideas', id: 'snapshot-1' });
  assert.deepEqual(B.I.inbox(B.key, 'ideas').unanswered, []);
});

test('P242 멈춘 역할: 답 없이 쉬면 한 번 일깨우고(item_nudge), 그 뒤 한 턴에도 그대로면 장부(item_stalled)와 rig 판 한 줄', async () => {
  const B = await board({ rig3StallMs: 0 });
  const v = B.S('verify');
  const idle = (s) => { applyHook(s.rt, { hook_event_name: 'Stop', session_id: s.sessionId, last_assistant_message: 'ok' }); s.rt.phase = 'running'; s.rt.term.present = true; s.rt.term.status = 'idle'; };
  for (const s of [B.S('data'), B.S('ideas'), v]) idle(s);
  assert.deepEqual(await B.b.rig3.tick(), [], '받은 것이 없으면 아무것도 하지 않는다');
  B.file('hypotheses/h1.md', '1');
  await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis' });
  B.deliverAll();
  await new Promise((r) => setTimeout(r, 5));
  let out = await B.b.rig3.tick();
  assert.deepEqual(out.map((x) => [x.role, x.nudged]), [['verify', ['hypothesis-1']]]);
  assert.match(B.toRole('verify').at(-1).text, /rig 받은 것에 답하지 않고 멈췄다:\n- hypothesis-1 \(hypothesis, ideas\): 받음·반려·pass가 없다/);
  assert.equal(B.ledger(['item_nudge']).length, 1);
  assert.deepEqual(await B.b.rig3.tick(), [], '일깨운 뒤 아직 턴이 없으면 기다린다');
  // 대기 중인 글이 있으면 보지 않는다(대기열이 _ofSession을 알면)
  B.b.queue._ofSession = (sid) => [...B.items.values()].filter((d) => d.sessionId === sid);
  await new Promise((r) => setTimeout(r, 5)); idle(v);
  const queued = [...B.items.values()].filter((d) => d.sessionId === v.sessionId).at(-1); queued.status = 'queued';
  assert.deepEqual(await B.b.rig3.tick(), []);
  B.deliverAll();
  out = await B.b.rig3.tick();
  assert.deepEqual(out.map((x) => [x.role, x.stalled]), [['verify', ['hypothesis-1']]]);
  const ev = B.ledger(['item_stalled']);
  assert.equal(ev.length, 1); assert.equal(ev[0].seat, 'verify'); assert.equal(ev[0].ref, 'hypothesis-1');
  assert.deepEqual(B.b.rig.status(B.key).rig3.roles.find((r) => r.name === 'verify').items.stalled, ['hypothesis-1']);
  await new Promise((r) => setTimeout(r, 5)); idle(v);
  assert.deepEqual(await B.b.rig3.tick(), [], '한 번만');
  // 받고 답 항목이 없는 것(for)은 받음 때 일깨움을 새로 센다
  B.I.accept(B.key, { role: 'verify', id: 'hypothesis-1' });
  await new Promise((r) => setTimeout(r, 5)); idle(v);
  out = await B.b.rig3.tick();
  assert.deepEqual(out.map((x) => x.nudged), [['hypothesis-1']]);
  assert.match(B.toRole('verify').at(-1).text, /받았는데 result 항목\(--from hypothesis-1\)도 pass도 없다/);
});

test('P242 입력 창구: 사람의 글 → .atrium/intake/<종류>-<n>.md, human이 낸 항목, 받는 역할에게. 반려는 rig 판에', async () => {
  const B = await board();
  const r = await B.I.intake(B.key, { item: 'hint', text: 'NQ 월요일을 봐라' });
  assert.equal(r.item.id, 'hint-1'); assert.equal(r.item.role, 'human'); assert.equal(r.item.path, `${INTAKE_DIR}/hint-1.md`);
  assert.equal(fs.readFileSync(path.join(B.dir, '.atrium', 'intake', 'hint-1.md'), 'utf8'), 'NQ 월요일을 봐라\n');
  assert.match(B.toRole('ideas').at(-1).text, /- hint-1 \(hint, 입력 창구가 냄\): \.atrium\/intake\/hint-1\.md/);
  assert.equal(B.ledger(['item_put']).at(-1).value, 'intake'); assert.equal(B.ledger(['item_put']).at(-1).actor, 'human');
  await code(B.I.intake(B.key, { item: 'snapshot', text: 'x' }), 'no_flow');
  await code(B.I.intake(B.key, { item: 'hint', text: '  ' }), 'bad_request');
  // 역할은 입력 창구 폴더에 낸 것으로 put하지 못한다(섹터 밖)
  B.file('.atrium/intake/x.md');
  await code(B.put('ideas', '.atrium/intake/x.md', { kind: 'hint' }), 'out_of_sector');
  const before = B.items.size;
  B.I.giveBack(B.key, { role: 'ideas', id: 'hint-1', reason: '모호하다' });
  assert.equal(B.items.size, before, '사람에게는 세션 글을 넣지 않는다');
  assert.deepEqual(B.b.rig.status(B.key).rig3.intake, { kinds: ['hint', 'request'], returned: [{ id: 'hint-1', path: '.atrium/intake/hint-1.md', by: [{ role: 'ideas', reason: '모호하다', late: false }] }] });
  // 판 API: 사람(판 API 토큰)만
  const h = rig3Handlers({ ...B.b, resolveWorkspace: async () => ({ key: B.key }) });
  await code(h['rig3.intake']({ item: 'request', text: 'GC도' }, { auth: { kind: 'device' } }), 'forbidden');
  const x = await h['rig3.intake']({ item: 'request', text: 'GC도' }, { auth: { kind: 'local' } });
  assert.equal(x.item.id, 'request-1'); assert.deepEqual(x.item.to, ['data']);
});

test('P242 명령 길(rig-admin verb): 역할 세션만, 꺼진 rig는 거절', async () => {
  const B = await board();
  const A = new RigAdmin(B.b, null);
  B.file('data/s1.md', 's');
  const r = await A.verb(B.S('data'), { op: 'put', file: path.join(B.dir, 'data', 's1.md'), kind: 'snapshot' });
  assert.equal(r.item.id, 'snapshot-1');
  const ib = await A.verb(B.S('ideas'), { op: 'inbox' });
  assert.deepEqual(ib.received.map((x) => x.id), ['snapshot-1']);
  assert.equal((await A.verb(B.S('ideas'), { op: 'accept', id: 'snapshot-1' })).item.id, 'snapshot-1');
  await code(A.verb({ sessionId: 'x', workspaceKey: B.key }, { op: 'inbox' }), 'forbidden');
  B.store.setRigEnabled(B.key, false);
  await code(A.verb(B.S('ideas'), { op: 'inbox' }), 'rig3_off');
  assert.deepEqual(RIG3_ITEM_OPS, ['put', 'accept', 'return', 'pass', 'drop', 'inbox']);
});

test('P242 장부 종류, 실을 글·안내(항목 명령), 다시 뜨면 받은 것을 싣는다, 구조 보기의 길마다 수', async () => {
  for (const k of ['item_put', 'item_accept', 'item_return', 'item_pass', 'item_drop', 'item_nudge', 'item_stalled', 'item_changed']) { assert.ok(RIG3_EVENT_KINDS.includes(k), k); assert.ok(!RIG_EVENT_KINDS.includes(k), k); }
  const B = await board();
  const r3 = B.b.rig.read(B.key).def.rig3;
  const t = loadText(r3, 'verify', {});
  assert.doesNotMatch(t, /명령이 아직 없다/);
  assert.match(t, /atrium rig put <파일> --item <종류>/); assert.match(t, /atrium rig accept <항목>/); assert.match(t, /--redo <항목>/);
  const g = rig3Guide(r3, 'verify');
  assert.match(g, /받는 것: hypothesis\(ideas에게서\)\. 내는 것: result\(ideas에게, 받은 hypothesis마다\)/);
  assert.match(g, /atrium rig inbox/);
  const gd = B.b.rig.guide(B.S('verify'));
  assert.equal(gd.state, 'on'); assert.match(gd.text, /너는 역할 verify/);
  // 길마다 수
  B.file('hypotheses/h1.md', '1'); B.file('hypotheses/h2.md', '2'); B.file('hypotheses/h3.md', '3');
  for (const n of [1, 2, 3]) await B.put('ideas', `hypotheses/h${n}.md`, { kind: 'hypothesis' });
  B.I.accept(B.key, { role: 'verify', id: 'hypothesis-1' });
  B.I.giveBack(B.key, { role: 'verify', id: 'hypothesis-2', reason: 'x' });
  const v = B.b.rig.status(B.key).rig3;
  assert.deepEqual(v.flows[1].counts, { put: 3, accepted: 1, returned: 1, waiting: 1, passed: 0 });
  assert.deepEqual(v.flows[0].counts, { put: 0, accepted: 0, returned: 0, waiting: 0, passed: 0 });
  const vi = v.roles.find((r) => r.name === 'verify').items;
  assert.deepEqual([vi.pending, vi.unanswered], [1, 1]);
  assert.equal(v.roles.find((r) => r.name === 'ideas').items.returned, 1);
  // 다시 뜨면 받은 것이 실린다
  B.b.sessions.delete(B.S('verify').sessionId);
  await B.b.rig3.tick();
  const load = [...B.items.values()].filter((d) => /너는 rig 역할 verify/.test(d.text)).at(-1).text;
  assert.match(load, /## 받은 것 \(판이 쥔 것/);
  assert.match(load, /- 받음 기다림: hypothesis-3 \(hypothesis, ideas\): hypotheses\/h3\.md/);
  assert.match(load, /- 받았고 답 항목\(result\)이 없음: hypothesis-1/);
  assert.ok(validateRig3(DEF(), { root: B.dir }).ok);
});

test('P242 끄면 역할 세션을 재운다(닫지 않음, 일하는 턴은 끝난 뒤, 넣지 않은 판 알림은 거둠), 켜면 깨운다', async () => {
  const B = await board();
  const ready = (s) => { applyHook(s.rt, { hook_event_name: 'Stop', session_id: s.sessionId, last_assistant_message: 'ok' }); s.rt.phase = 'running'; s.rt.term.present = true; s.rt.term.status = 'idle'; };
  for (const r of ['data', 'ideas', 'verify']) ready(B.S(r));
  B.deliverAll();
  B.file('hypotheses/h1.md', '1');
  await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis' }); // verify에게 아직 넣지 않은 깨우는 글
  const pending = B.toRole('verify').at(-1);
  assert.equal(pending.status, 'queued');
  B.S('ideas').rt.term.status = 'working'; // 일하는 턴
  B.store.setRigEnabled(B.key, false);
  const out = await B.b.rig3.onEnabled(B.key, false);
  assert.deepEqual(out.filter((x) => x.slept).map((x) => x.role).sort(), ['data', 'verify']);
  assert.deepEqual(out.filter((x) => x.waiting).map((x) => x.role), ['ideas']);
  assert.equal(pending.status, 'cancelled', '넣지 않은 판 알림은 거둔다');
  assert.equal(B.b.sessions.size, 3, '닫지 않는다');
  assert.ok(B.slept.every(([, o]) => o.scope === 'session' && o.by === 'rig'));
  // 꺼진 rig에는 항목 명령이 없다
  await code(B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis' }), 'rig3_off');
  // 턴이 끝나면 다음 주기에 재운다
  assert.deepEqual((await B.b.rig3.tick()).filter((x) => x.off).map((x) => x.waiting), ['working']);
  B.S('ideas').rt.term.status = 'idle';
  assert.deepEqual((await B.b.rig3.tick()).filter((x) => x.off).map((x) => x.slept), ['ideas']);
  assert.deepEqual(await B.b.rig3.tick(), [], '다 재웠으면 더 보지 않는다');
  const rows = B.ledger(['role_slept']);
  assert.equal(rows.length, 3); assert.ok(rows.every((r) => r.value === 'rig_off'));
  // 켜면 깨운다(새로 띄우지 않는다)
  const before = B.spawnedP.length;
  B.store.setRigEnabled(B.key, true);
  const on = await B.b.rig3.onEnabled(B.key, true);
  assert.deepEqual(on.filter((x) => x.woke).map((x) => x.role).sort(), ['data', 'ideas', 'verify']);
  assert.deepEqual(B.woke.map((x) => x[1]), ['rig', 'rig', 'rig']);
  assert.equal(B.spawnedP.length, before);
  assert.equal(B.ledger(['role_woke']).length, 3);
  assert.ok(RIG3_EVENT_KINDS.includes('role_woke'));
});

test('P242 역할 칸 effort: 정의에서 읽어 모델처럼 띄울 때 넘긴다', async () => {
  const B = await board({}, (d) => { d.roles.verify.effort = 'high'; d.roles.data.model = 'haiku'; });
  const p = B.spawnedP.find((x) => x.name === 'verify');
  assert.equal(p.effort, 'high');
  assert.equal(B.spawnedP.find((x) => x.name === 'data').effort, undefined);
  assert.equal(B.b.rig.read(B.key).def.rig3.roles.verify.effort, 'high');
  assert.equal(B.b.rig.status(B.key).rig3.roles.find((r) => r.name === 'verify').effort, 'high');
  assert.equal(B.ledger(['role_spawn']).find((r) => r.seat === 'verify').data.effort, 'high');
  const bad = validateRig3({ ...DEF(), roles: { ...DEF().roles, data: { owns: ['data/'], effort: 'very high' } } }, { root: B.dir });
  assert.equal(bad.ok, false); assert.match(bad.reason, /roles\.data\.effort는 노력 수준 낱말/);
  const nope = validateRig3({ ...DEF(), roles: { ...DEF().roles, data: { owns: ['data/'], speed: 1 } } }, { root: B.dir });
  assert.match(nope.reason, /칸: owns, tools, launcher, model, effort, beat/);
});
