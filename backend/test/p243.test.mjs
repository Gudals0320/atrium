// P243: rig 3 남의 쓰기 되돌리기(rig3-guard.mjs). 턴 경계는 판 상태 전환(모든 하네스)과 도구 실행의 시작·끝.
// 섹터 안 쓰기 통과, 남의 섹터 쓰기(주인 쉼) → 되돌림·격리·장부·알림, 주인도 일하던 창 → 그대로, 섹터 밖·.atrium/ → 되돌림(후보 여럿),
// 새 파일 격리, 지운 파일 되살림, 크기 한도 → 기록만, 판 자신의 쓰기 통과, 빼는 목록, 하네스 종류와 무관(broadcastSession).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig } from '../src/rig.mjs';
import { RigAmp } from '../src/rig-amp.mjs';
import { Backend } from '../src/backend.mjs';
import { RIG3_GUARD_KINDS, RIG3_EVENT_KINDS, RIG_EVENT_KINDS, parseKinds } from '../src/rig-ledger.mjs';
import { validateRig3 } from '../src/rig3.mjs';
import { Rig3Roles } from '../src/rig3-roles.mjs';
import { ownerOf, skipRules, isSkipped, judge, walk, foreignNotice, GUARD_SKIP_NAMES } from '../src/rig3-guard.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p243-'));
const DOC = (name) => ['# ' + name, '', '## 맡은 것', name, '', '## 받는 것과 내는 것', '없음', '', '## 기준', '- 하나', '', '## 요령', '- 하나'].join('\n');
const DEF = (o = {}) => ({
  version: 3, name: 'p243', purpose: '.atrium/purpose.md',
  roles: { data: { owns: ['data/'] }, ideas: { owns: ['hypotheses/'], launcher: 'codex' }, ...(o.roles || {}) },
  flows: [{ item: 'snapshot', from: 'data', to: 'ideas' }, { item: 'hint', from: 'human', to: 'data' }],
  ...(o.extra || {}),
});
const put = (dir, rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const has = (dir, rel) => fs.existsSync(path.join(dir, rel));

async function board(def = DEF(), cfg = {}) {
  const dir = tmp();
  put(dir, '.atrium/purpose.md', '# 목적\n');
  for (const r of Object.keys(def.roles)) put(dir, '.atrium/roles/' + r + '.md', DOC(r));
  put(dir, '.atrium/rig.json', JSON.stringify(def, null, 2));
  put(dir, 'data/a.txt', 'data-a\n');
  put(dir, 'hypotheses/h1.md', 'h1\n');
  put(dir, 'README.md', 'readme\n');
  put(dir, 'node_modules/x/index.js', 'x\n');
  const store = new Store(path.join(tmp(), 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const sent = []; const logs = [];
  const b = { cfg: { dataDir: path.join(tmp(), 'data'), ...cfg }, store, sessions: new Map(), log: (...a) => logs.push(a.join(' ')), api: { broadcast: () => {} } };
  b.rig = new Rig(b); b.rigAmp = new RigAmp(b); b.rig3 = new Rig3Roles(b);
  b.queue = { enqueue: (sessionId, text, opts) => { sent.push({ sessionId, text, opts }); return { deliveryId: 'd' + sent.length }; } };
  const g = b.rig3.guard;
  const mk = (role, kind = 'claude') => { const s = { sessionId: 'sid-' + role, name: role, kind, workspaceKey: ws.key, rigRole: role, rt: { kind } }; b.sessions.set(s.sessionId, s); return s; };
  const S = { data: mk('data', 'claude'), ideas: mk('ideas', 'codex') };
  const ledger = () => store.rigEvents({ ws: ws.key, limit: 1000, kinds: RIG3_GUARD_KINDS });
  const foreign = () => ledger().filter((x) => x.kind === 'role_foreign_write');
  // 상태 전환 흉내(backend.broadcastSession이 부르는 것과 같다)
  const go = (s, to) => { const from = s._st || null; s._st = to; return g.onState(s, from, to); };
  await g.prime(ws.key);
  return { dir, store, ws, b, g, S, sent, logs, ledger, foreign, go };
}

test('P243 장부 종류: rig 3 guard 종류는 따로 둔 목록', () => {
  assert.deepEqual(RIG3_GUARD_KINDS, ['role_foreign_write', 'role_guard_base']);
  for (const k of RIG3_GUARD_KINDS) assert.ok(!RIG_EVENT_KINDS.includes(k) && !RIG3_EVENT_KINDS.includes(k), k);
  assert.deepEqual(parseKinds('role_foreign_write,role_spawn'), ['role_foreign_write', 'role_spawn']);
});

test('P243 정의의 ignore 칸과 주인·빼는 규칙(순수 함수)', () => {
  const v = validateRig3(DEF({ extra: { ignore: ['build', './cache/'] } }));
  assert.equal(v.ok, true, v.reason);
  assert.deepEqual(v.def.rig3.ignore, ['build/', 'cache/']);
  assert.match(validateRig3(DEF({ extra: { ignore: ['.atrium/x/'] } })).reason, /ignore에 \.atrium\/를 넣지 않는다/);
  assert.match(validateRig3(DEF({ extra: { ignore: '/abs' } })).reason, /ignore는 폴더 경로 배열/);
  assert.match(validateRig3(DEF({ extra: { ignore: ['../up'] } })).reason, /상대 폴더/);
  assert.deepEqual(validateRig3(DEF()).def.rig3.ignore, []);
  const r3 = v.def.rig3;
  assert.deepEqual(ownerOf(r3, 'data/x.csv'), { role: 'data', kind: 'sector' });
  assert.deepEqual(ownerOf(r3, 'Data/X.csv'), { role: 'data', kind: 'sector' });
  assert.deepEqual(ownerOf(r3, '.atrium/roles/ideas/memory.md'), { role: 'ideas', kind: 'memory' });
  assert.equal(ownerOf(r3, '.atrium/roles/ideas.md'), null);
  assert.equal(ownerOf(r3, 'README.md'), null);
  const rules = skipRules(r3);
  for (const n of GUARD_SKIP_NAMES) assert.ok(isSkipped(rules, 'a/' + n + '/x.js'), n);
  assert.ok(isSkipped(rules, '.git', true)); assert.ok(isSkipped(rules, 'build/out.bin')); assert.ok(isSkipped(rules, '.claude/worktrees/w/x'));
  assert.ok(!isSkipped(rules, 'data/node_modules.txt')); assert.ok(!isSkipped(rules, 'builder/x'));
  assert.deepEqual(judge({ cands: [], owner: null }), { legit: true, why: 'outside' });
  assert.deepEqual(judge({ cands: ['data'], owner: { role: 'data' } }), { legit: true, why: 'owner' });
  assert.deepEqual(judge({ cands: ['ideas'], owner: { role: 'data' } }), { legit: false, why: 'other_sector' });
  assert.deepEqual(judge({ cands: ['ideas'], owner: null }), { legit: false, why: 'no_sector' });
  assert.deepEqual(judge({ cands: ['ideas'], owner: null, board: true }), { legit: true, why: 'board' });
  assert.match(foreignNotice('ideas', ['data/a.txt'], { owns: ['hypotheses/'], others: ['data'] }), /섹터 밖에 쓴 것을 되돌렸다: data\/a\.txt\. 자기 섹터\(hypotheses\/\)와 기억 폴더\(\.atrium\/roles\/ideas\/\)에만 쓰고, 남에게 줄 것은 항목으로 낸다\..*data도 일하고 있어/);
});

test('P243 기준 목록: 처음 한 번 만들고(장부 role_guard_base) 빼는 폴더는 넣지 않는다', async () => {
  const B = await board();
  const rows = B.ledger();
  assert.equal(rows.length, 1); assert.equal(rows[0].kind, 'role_guard_base');
  const j = JSON.parse(fs.readFileSync(path.join(B.g.dirOf(B.ws.key), 'base.json'), 'utf8'));
  assert.ok(j.files['data/a.txt']); assert.ok(j.files['.atrium/rig.json']); assert.ok(!Object.keys(j.files).some((k) => k.startsWith('node_modules/')));
  assert.equal(j.files['data/a.txt'][2].length, 64);
  const keep = path.join(B.g.dirOf(B.ws.key), 'keep', j.files['data/a.txt'][2].slice(0, 2), j.files['data/a.txt'][2]);
  assert.equal(fs.readFileSync(keep, 'utf8'), 'data-a\n');
  assert.ok(typeof rows[0].data.ms === 'number');
  // 다시 prime해도 새로 만들지 않는다(디스크에서 읽음)
  B.g.ws.clear(); await B.g.prime(B.ws.key);
  assert.equal(B.ledger().length, 1);
});

test('P243 자기 섹터와 기억 폴더 쓰기는 그대로(Claude Code 역할)', async () => {
  const B = await board();
  B.go(B.S.data, 'working');
  put(B.dir, 'data/a.txt', 'data-a v2 longer\n'); put(B.dir, 'data/new.csv', '1,2\n'); put(B.dir, '.atrium/roles/data/memory.md', 'mem\n');
  const r = await B.go(B.S.data, 'ready');
  assert.equal(r.changes, 3); assert.equal(r.foreign.length, 0);
  assert.equal(read(B.dir, 'data/a.txt'), 'data-a v2 longer\n'); assert.ok(has(B.dir, 'data/new.csv'));
  assert.equal(B.foreign().length, 0); assert.equal(B.sent.length, 0);
});

test('P243 남의 섹터 쓰기(주인 쉼) → 되돌림·격리·장부·알림', async () => {
  const B = await board();
  B.go(B.S.ideas, 'working'); // Codex 역할
  put(B.dir, 'data/a.txt', 'ideas wrote this\n');
  const r = await B.go(B.S.ideas, 'ready');
  assert.equal(r.foreign.length, 1);
  assert.equal(read(B.dir, 'data/a.txt'), 'data-a\n'); // 되돌림
  const f = B.foreign()[0];
  assert.equal(f.value, 'restored'); assert.equal(f.seat, 'ideas'); assert.equal(f.session, 'sid-ideas'); assert.equal(f.ref, 'data/a.txt');
  assert.deepEqual(f.data.candidates, ['ideas']); assert.equal(f.data.owner, 'data'); assert.equal(f.data.why, 'other_sector'); assert.equal(f.actor, 'board');
  assert.equal(fs.readFileSync(f.data.quarantine, 'utf8'), 'ideas wrote this\n'); // 남의 쓰기 내용은 격리에
  assert.equal(B.sent.length, 1); assert.equal(B.sent[0].sessionId, 'sid-ideas');
  assert.match(B.sent[0].text, /섹터 밖에 쓴 것을 되돌렸다: data\/a\.txt/); assert.deepEqual(B.sent[0].opts.origin, { kind: 'board' });
  assert.ok(B.logs.some((l) => /rig3 guard .* end ideas: files \d+, changed 1, hashed 1, foreign 1, \d+ms/.test(l)), B.logs.join('\n'));
  // 되돌린 뒤 다음 검사는 조용하다
  B.go(B.S.ideas, 'working'); const r2 = await B.go(B.S.ideas, 'ready');
  assert.equal(r2.changes, 0);
});

test('P243 주인도 같은 창에 일했으면 주인의 것으로 본다(되돌리지 않음)', async () => {
  const B = await board();
  B.go(B.S.data, 'working'); B.go(B.S.ideas, 'working');
  put(B.dir, 'data/a.txt', 'who wrote me?\n');
  const r = await B.go(B.S.ideas, 'ready'); // ideas가 먼저 끝남, data는 아직 일한다
  assert.equal(r.foreign.length, 0); assert.deepEqual(r.cands.sort(), ['data', 'ideas']);
  // 주인이 먼저 끝나고 그 뒤에 남이 쓴 것은 되돌린다
  B.go(B.S.ideas, 'working');
  await B.go(B.S.data, 'ready');
  put(B.dir, 'data/a.txt', 'after owner left\n');
  const r2 = await B.go(B.S.ideas, 'ready');
  assert.equal(r2.foreign.length, 1); assert.equal(read(B.dir, 'data/a.txt'), 'who wrote me?\n');
});

test('P243 어느 섹터도 아닌 곳·.atrium/(정의·목적·남의 정의서) → 되돌림, 일하던 역할이 여럿이면 후보를 다 적는다', async () => {
  const B = await board();
  B.go(B.S.data, 'working'); B.go(B.S.ideas, 'working');
  put(B.dir, 'README.md', 'changed readme!\n');
  put(B.dir, '.atrium/roles/ideas.md', 'broken doc\n');
  put(B.dir, '.atrium/rig.json', '{}');
  const r = await B.go(B.S.data, 'ready');
  assert.equal(r.foreign.length, 3);
  assert.equal(read(B.dir, 'README.md'), 'readme\n'); assert.match(read(B.dir, '.atrium/roles/ideas.md'), /## 요령/); assert.equal(JSON.parse(read(B.dir, '.atrium/rig.json')).version, 3);
  for (const f of B.foreign()) { assert.deepEqual(f.data.candidates.sort(), ['data', 'ideas']); assert.equal(f.seat, null); assert.equal(f.data.why, 'no_sector'); }
  // 둘 다에게 알리고, 서로를 가리지 못했다고 적는다
  assert.deepEqual(B.sent.map((x) => x.sessionId).sort(), ['sid-data', 'sid-ideas']);
  assert.match(B.sent.find((x) => x.sessionId === 'sid-data').text, /ideas도 일하고 있어 누가 썼는지 가리지 못했다/);
});

test('P243 새 파일은 지우지 않고 격리로 옮기고, 지운 파일은 되살린다', async () => {
  const B = await board();
  B.go(B.S.data, 'working');
  put(B.dir, 'hypotheses/sneaky.md', 'from data\n');
  put(B.dir, 'stray/out.txt', 'stray\n');
  fs.unlinkSync(path.join(B.dir, 'hypotheses/h1.md'));
  await B.go(B.S.data, 'ready');
  assert.ok(!has(B.dir, 'hypotheses/sneaky.md')); assert.ok(!has(B.dir, 'stray/out.txt'));
  assert.equal(read(B.dir, 'hypotheses/h1.md'), 'h1\n');
  const rows = B.foreign();
  const by = Object.fromEntries(rows.map((x) => [x.ref, x]));
  assert.equal(by['hypotheses/sneaky.md'].value, 'quarantined'); assert.equal(fs.readFileSync(by['hypotheses/sneaky.md'].data.quarantine, 'utf8'), 'from data\n');
  assert.equal(by['stray/out.txt'].value, 'quarantined');
  assert.equal(by['hypotheses/h1.md'].value, 'revived'); assert.equal(by['hypotheses/h1.md'].data.what, 'deleted');
  assert.equal(B.sent.length, 1); assert.match(B.sent[0].text, /hypotheses\/sneaky\.md.*stray\/out\.txt.*hypotheses\/h1\.md|hypotheses\/h1\.md/);
});

test('P243 크기 한도를 넘는 파일은 되돌리지 못한다고 기록만(지금 것을 기준으로)', async () => {
  const B = await board(DEF(), { rig3GuardKeepFileMax: 64 });
  put(B.dir, 'data/big.bin', 'x'.repeat(100)); // 판 밖(사람)이 둔 큰 파일
  B.go(B.S.data, 'working'); await B.go(B.S.data, 'ready'); // 주인이 받아들임(해시 없음)
  B.go(B.S.ideas, 'working');
  put(B.dir, 'data/big.bin', 'y'.repeat(120));
  const r = await B.go(B.S.ideas, 'ready');
  assert.equal(r.foreign[0].action, 'unrestorable');
  assert.equal(read(B.dir, 'data/big.bin'), 'y'.repeat(120));
  const f = B.foreign()[0]; assert.equal(f.value, 'unrestorable'); assert.equal(f.data.unrestorable, 'too_big');
  assert.equal(B.sent.length, 1); // 그래도 알린다
  B.go(B.S.ideas, 'working'); assert.equal((await B.go(B.S.ideas, 'ready')).changes, 0); // 되풀이하지 않는다
});

test('P243 판 자신의 쓰기(accept)와 판 밖(사람)의 쓰기는 받아들인다', async () => {
  const B = await board();
  // 사람이 쉬는 동안 고친 것: 다음 턴 시작 검사가 받아들인다
  put(B.dir, '.atrium/purpose.md', '# 목적 v2 사람이 고침\n');
  await new Promise((r) => setTimeout(r, 30)); // 고친 시각이 턴 시작보다 앞이다
  B.go(B.S.ideas, 'working');
  // 판이 입력 창구 파일을 쓰고 accept
  put(B.dir, '.atrium/inbox/hint-1.md', 'hint\n');
  B.g.accept(B.ws.key, ['.atrium/inbox/hint-1.md']);
  const r = await B.go(B.S.ideas, 'ready');
  assert.equal(r.foreign.length, 0);
  assert.match(read(B.dir, '.atrium/purpose.md'), /v2/); assert.ok(has(B.dir, '.atrium/inbox/hint-1.md'));
  assert.equal(B.foreign().length, 0);
  const j = JSON.parse(fs.readFileSync(path.join(B.g.dirOf(B.ws.key), 'base.json'), 'utf8'));
  assert.ok(j.files['.atrium/inbox/hint-1.md']);
});

test('P243 빼는 목록: 기본(node_modules·.git 등)과 정의의 ignore는 보지 않는다', async () => {
  const B = await board(DEF({ extra: { ignore: ['scratch/'] } }));
  B.go(B.S.ideas, 'working');
  put(B.dir, 'node_modules/y/index.js', 'y\n'); put(B.dir, 'data/node_modules/z.js', 'z\n'); put(B.dir, '.git/HEAD', 'ref\n'); put(B.dir, 'scratch/tmp.txt', 't\n');
  const r = await B.go(B.S.ideas, 'ready');
  assert.equal(r.changes, 0); assert.ok(has(B.dir, 'scratch/tmp.txt'));
  const files = await walk(B.dir, skipRules({ ignore: ['scratch/'] }));
  assert.ok(!files.has('scratch/tmp.txt')); assert.ok(files.has('data/a.txt'));
});

test('P243 하네스와 무관: 턴 경계는 판 상태 전환(Backend.broadcastSession)으로 잡는다 — claude·codex·agy·opencode·pi', async () => {
  const B = await board();
  const fake = { sessions: B.b.sessions, summary: (s) => ({ state: s.rt._state, unseen: 0, quiet: false, delivering: 0 }), store: { addEvent() {}, saveRuntime() {} }, api: { broadcast() {} }, onLinkTargetState() {}, bus: { emit() {} }, rig3: B.b.rig3 };
  for (const kind of ['claude', 'codex', 'agy', 'opencode', 'pi']) {
    const s = { sessionId: 'sid-k-' + kind, name: 'ideas-' + kind, kind, workspaceKey: B.ws.key, rigRole: 'ideas', rt: { kind, _state: 'ready' }, lastState: null };
    B.b.sessions.set(s.sessionId, s);
    Backend.prototype.broadcastSession.call(fake, s, { cause: 'spawn' });
    s.rt._state = 'working'; Backend.prototype.broadcastSession.call(fake, s, { cause: 'term:working' });
    put(B.dir, 'data/' + kind + '.txt', kind);
    s.rt._state = 'ready'; Backend.prototype.broadcastSession.call(fake, s, { cause: 'term:idle' });
    await B.g.idle(B.ws.key);
    assert.ok(!has(B.dir, 'data/' + kind + '.txt'), kind);
    B.b.sessions.delete(s.sessionId);
  }
  assert.equal(B.foreign().length, 5);
  assert.ok(B.foreign().every((f) => f.value === 'quarantined' && f.data.trigger === 'end'));
});

test('P243 잠든 역할에게는 깰 때 알리고, 닫힌 세션의 일 구간은 닫는다, 도구 실행도 일 구간이다', async () => {
  const B = await board();
  // 잠든 data에게 알림: 미뤘다가 깰 때
  B.go(B.S.data, 'working');
  put(B.dir, 'hypotheses/x.md', 'x\n');
  B.S.data.rt.sleep = { at: 1 };
  await B.go(B.S.data, 'sleeping');
  assert.equal(B.sent.length, 0);
  B.S.data.rt.sleep = null;
  B.go(B.S.data, 'ready');
  assert.equal(B.sent.length, 1); assert.equal(B.sent[0].sessionId, 'sid-data');
  // 닫힌 세션: 일하는 중에 판에서 빠지면 다음 검사가 구간을 닫는다(영원히 주인으로 보지 않는다)
  B.go(B.S.data, 'working');
  B.b.sessions.delete('sid-data');
  B.go(B.S.ideas, 'working'); await B.go(B.S.ideas, 'ready');
  B.go(B.S.ideas, 'working');
  put(B.dir, 'data/a.txt', 'ideas again, data is gone\n');
  const r = await B.go(B.S.ideas, 'ready');
  assert.equal(r.foreign.length, 1);
  // 도구 실행: data의 도구가 data/에 쓴 것은 그대로, 섹터 밖은 되돌린다
  B.b.sessions.set('sid-data', B.S.data);
  B.g.toolBegin(B.ws.key, 'data', 'tr1');
  put(B.dir, 'data/tool-out.csv', '9\n'); put(B.dir, 'out-of-sector.txt', 'no\n');
  const t = await B.g.toolEnd(B.ws.key, 'data', 'tr1');
  assert.deepEqual(t.foreign.map((f) => f.path), ['out-of-sector.txt']); assert.ok(has(B.dir, 'data/tool-out.csv'));
  assert.equal(B.foreign().at(-1).data.trigger, 'tool_end');
});
