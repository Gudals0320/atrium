// P245: rig 3 4단계 — 조정과 되돌리기. 재료(반려·heard·되돌린 남의 쓰기) 세기와 조정 턴(재료 n건, m사이클, 정의 값),
// tune 반영(고정 칸 그대로·예산 안·근거 있음)과 거절, tune --none, raise, 판(해시 묶음, 정의서만 바뀐 판, 다시 검사),
// 정의서 하나 되돌리기(다른 역할의 뒤 조정은 남음), 변경 기록 tunes, guard.accept.
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
import { newRuntime } from '../src/state.mjs';
import { rigEvent, RIG3_TUNE_KINDS } from '../src/rig-ledger.mjs';
import { loadText, rig3Guide, bundleOf, bundleSig, checkRoleDoc } from '../src/rig3.mjs';
import { Rig3Roles, ROLE_SPAWN } from '../src/rig3-roles.mjs';
import { collectCycle, numbersBody, entryBody, cleanProse, pruneToolLogs } from '../src/rig3-beat.mjs';
import { replaceSection, parseTune, tagBody, countLines, sameBody, stripTag, rig3TuneHandlers, RIG3_TUNE_OPS } from '../src/rig3-tune.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p245-'));
const DOC = (name, tune = '- 처음 요령') => ['# ' + name, '', '## 맡은 것', name + '의 일', '', '## 받는 것과 내는 것', '- 받고 낸다', '', '## 기준', '- 기준 ' + name, '', '## 요령', tune, ''].join('\n');
const DEF = () => ({
  version: 3, name: 'p245', purpose: '.atrium/purpose.md',
  beat: { every: '1h', role: 'data' },
  roles: { data: { owns: ['data/'] }, ideas: { owns: ['hypotheses/'] }, verify: { owns: ['verify/'] } },
  flows: [
    { item: 'snapshot', from: 'data', to: 'ideas' },
    { item: 'hypothesis', from: 'ideas', to: 'verify' },
    { item: 'result', from: 'verify', to: 'ideas', for: 'hypothesis' },
  ],
});
async function board(mod = null) {
  const def = DEF();
  if (mod) mod(def);
  const dir = tmp(); const outside = tmp();
  fs.mkdirSync(path.join(dir, '.atrium', 'roles'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.atrium', 'purpose.md'), '# 목적\nP245\n');
  for (const r of Object.keys(def.roles)) fs.writeFileSync(path.join(dir, '.atrium', 'roles', r + '.md'), DOC(r));
  fs.writeFileSync(path.join(dir, '.atrium', 'rig.json'), JSON.stringify(def, null, 2));
  const store = new Store(path.join(outside, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const items = new Map(); let dn = 0;
  const b = { cfg: { hookTimeoutSec: 2, sessionsDir: path.join(outside, 'sessions'), dataDir: path.join(outside, 'data-board'), rig3DeadGraceMs: 0 }, store, sessions: new Map(), log: () => {}, api: { broadcast: () => {} }, features: { settings: { get: () => ({ language: 'ko' }) } } };
  b.rig = new Rig(b); b.rigAmp = new RigAmp(b); b.rig3 = new Rig3Roles(b);
  b.resolveWorkspace = async () => ({ key: ws.key });
  b.queue = {
    enqueue: (sessionId, text, opts) => { const d = { deliveryId: 'd' + ++dn, sessionId, text, opts, status: 'queued' }; items.set(d.deliveryId, d); return d; },
    retext: (id, text) => { const d = items.get(id); if (!d || d.status !== 'queued') return null; d.text = text; return d; },
    cancel: (id) => { const d = items.get(id); if (d) d.status = 'cancelled'; return d; },
  };
  let n = 0;
  b.spawn = async (p) => {
    const role = p[ROLE_SPAWN]; const kind = p.kind || 'claude';
    const L = b.rig3.launchOf(ws.key, role, { kind, cwd: p.cwd });
    const sessionId = 'sid-' + p.name + '-' + ++n;
    const s = { sessionId, name: p.name, kind, cwd: p.cwd, workspaceKey: ws.key, hookToken: 'tok-' + n, permissionMode: L.permissionMode, rt: newRuntime({ kind, hooked: true }), rigRole: L.role };
    s.rt.cwd = p.cwd;
    s.settingsPath = writeSessionSettings({ file: path.join(outside, 'sessions', sessionId + '.json'), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: s.hookToken, sessionId, amp: L.amp });
    b.sessions.set(sessionId, s);
    return { sessionId, name: p.name };
  };
  b.kill = async (p) => { b.sessions.delete(p.session); return { ok: true }; };
  b.sleeper = { isAsleep: (s) => !!s.rt.sleep, info: () => null, sleep: async (s) => { s.rt.sleep = { at: Date.now() }; return {}; }, wake: async (s) => { s.rt.sleep = null; return {}; } };
  const G = b.rig3.guard; const accepts = [];
  { const f = G.accept.bind(G); G.accept = (k, rels) => { accepts.push(rels); return f(k, rels); }; }
  store.setRigEnabled(ws.key, true);
  await b.rig3.onEnabled(ws.key, true);
  b.rig3.beat.runner = async () => ({ ok: false, text: '', meta: { model: 'x', error: 'test' } });
  const key = ws.key;
  const S = (role) => [...b.sessions.values()].find((s) => s.rigRole === role);
  const T = b.rig3.tune;
  const file = (rel, text = rel) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
  const put = (role, rel, o = {}) => { file(rel, rel + ' ' + Math.random()); return b.rig3.items.put(key, { role, session: S(role).sessionId, file: path.join(dir, rel), ...o }); };
  const ret = (role, id, reason) => b.rig3.items.giveBack(key, { role, session: S(role).sessionId, id, reason });
  const ledger = (kinds) => store.rigEvents({ ws: key, limit: 1000, kinds });
  const toRole = (role) => [...items.values()].filter((d) => d.sessionId === S(role).sessionId);
  const docText = (role) => fs.readFileSync(path.join(dir, '.atrium', 'roles', role + '.md'), 'utf8');
  const tuneOf = (role) => checkRoleDoc(docText(role)).sections['요령'];
  const verN = () => (store.lastRigVersion(key) || {}).n;
  const admin = new RigAdmin(b, {});
  // 반려 셋(ideas가 낸 가설을 verify가 반려)
  const returns3 = async (k = 3) => { const ids = []; for (let i = 1; i <= k; i++) { const x = await put('ideas', 'hypotheses/h' + i + '-' + Math.random().toString(36).slice(2, 6) + '.md', { kind: 'hypothesis' }); ret('verify', x.item.id, '미래 참조: 종가를 진입에 썼다 ' + i); ids.push(x.item.id); } return ids; };
  return { dir, store, key, b, T, S, file, put, ret, ledger, toRole, items, accepts, docText, tuneOf, verN, admin, returns3 };
}
const code = async (p, c) => { try { await p; } catch (e) { assert.equal(e.code, c, e.message); return e; } assert.fail('기대한 거절 ' + c); };

test('P245 순수 함수: 칸 바꾸기, 새 요령 칸 읽기(본문만·정의서 전체·고정 칸 바뀜·없던 칸), 꼬리표, 줄 수', () => {
  const d = DOC('ideas', '- 하나\n- 둘');
  const x = replaceSection(d, '요령', '- 셋');
  assert.equal(checkRoleDoc(x).sections['요령'], '- 셋');
  assert.equal(checkRoleDoc(x).sections['기준'], '- 기준 ideas');
  assert.equal(replaceSection(d, '없는 칸', 'x'), null);
  const mid = replaceSection(d, '기준', '- 새 기준');
  assert.match(mid, /## 기준\n- 새 기준\n\n## 요령/);
  assert.deepEqual(parseTune(d, '- a\n- b\n'), { ok: true, body: '- a\n- b' });
  assert.equal(parseTune(d, DOC('ideas', '- 바뀐 요령')).body, '- 바뀐 요령');
  const fx = parseTune(d, DOC('ideas', '- x').replace('- 기준 ideas', '- 기준을 느슨하게'));
  assert.equal(fx.ok, false); assert.equal(fx.code, 'fixed_changed'); assert.deepEqual(fx.fixed, ['기준']);
  assert.equal(parseTune(d, DOC('ideas') + '\n## 덤\n- y').code, 'fixed_changed');
  const t = tagBody('- 하나 [v1]\n- 둘', '- 하나\n- 새 줄\n\n- 둘', 4, ['hypothesis-1', 'heard-2']);
  assert.equal(t, '- 하나 [v1]\n- 새 줄 [v4 · hypothesis-1 heard-2]\n\n- 둘');
  assert.equal(stripTag('- 새 줄 [v4 · a-1]'), '- 새 줄');
  assert.equal(countLines(t), 3);
  assert.ok(sameBody('- a [v2 · x-1]\n\n- b', '- a\n- b'));
  assert.ok(!sameBody('- a', '- a\n- b'));
});

test('P245 판(버전): 정의·목적·모든 정의서의 해시 묶음. 정의서만 바뀌어도 판이 오르고 정의 검사가 다시 돈다', async () => {
  const B = await board();
  const v1 = B.verN();
  assert.ok(v1 >= 1);
  const parts = B.store.rig3Bundle(B.key, v1);
  assert.deepEqual(Object.keys(parts).sort(), ['purpose', 'rig.json', 'role:data', 'role:ideas', 'role:verify']);
  const root = B.b.rig.rootOf(B.key);
  const raw = JSON.parse(fs.readFileSync(path.join(root, '.atrium/rig.json'), 'utf8'));
  assert.equal(bundleOf(root, raw, parts['rig.json']).hash, B.store.lastRigVersion(B.key).hash);
  assert.ok(bundleSig(root, raw).split(',').length === 4);
  // 정의서만 손으로 고침 → 새 판, 장부 rig_version data.changed = [role:ideas]
  await new Promise((r) => setTimeout(r, 15));
  fs.writeFileSync(path.join(root, '.atrium/roles/ideas.md'), DOC('ideas', '- 손으로 고친 요령'));
  const r = B.b.rig.read(B.key);
  assert.equal(r.n, v1 + 1);
  const ev = B.ledger(['rig_version']).at(-1);
  assert.deepEqual(ev.data.changed, ['role:ideas']);
  assert.match(ev.text, /바뀐 것: 정의서 ideas/);
  // 정의서 칸이 빠지면 다시 검사해 잘못으로 보고 마지막 맞은 판을 쓴다(P241 캐시 문제)
  await new Promise((r) => setTimeout(r, 15));
  fs.writeFileSync(path.join(root, '.atrium/roles/ideas.md'), '# ideas\n## 맡은 것\nx\n');
  const bad = B.b.rig.read(B.key);
  assert.match(bad.invalid, /정의서.*칸이 빠졌다/);
  assert.equal(bad.n, v1 + 1);
  await new Promise((r) => setTimeout(r, 15));
  fs.writeFileSync(path.join(root, '.atrium/roles/ideas.md'), DOC('ideas', '- 다시 맞음'));
  const ok = B.b.rig.read(B.key);
  assert.equal(ok.invalid, null); assert.equal(ok.n, v1 + 2);
  // 목적만 바뀌어도 판
  await new Promise((r) => setTimeout(r, 15));
  fs.writeFileSync(path.join(root, '.atrium/purpose.md'), '# 목적\n바뀜\n');
  assert.equal(B.b.rig.read(B.key).n, v1 + 3);
  assert.deepEqual(B.ledger(['rig_version']).at(-1).data.changed, ['purpose']);
});

test('P245 재료와 조정 턴: 반려 셋이면 턴(재료 id·요령 칸·예산·답 셋), 열린 턴은 다시 열지 않는다. heard·되돌린 남의 쓰기도 재료', async () => {
  const B = await board();
  const ids = await B.returns3(2);
  assert.equal(B.T.check(B.key, 'ideas', B.S('ideas')), null); // 2건: 아직
  const h = await B.T.verb(B.S('ideas'), { op: 'heard', text: '금은 야간 구간을 따로 봐라' });
  assert.equal(h.id, 'heard-1'); assert.equal(h.materials, 3); assert.equal(h.after, 3);
  const before = B.toRole('ideas').length;
  const x = B.T.check(B.key, 'ideas', B.S('ideas'));
  assert.deepEqual(x.tuneTurn, [...ids, 'heard-1']);
  const turn = B.toRole('ideas').slice(before).map((d) => d.text).join('\n');
  assert.match(turn, /rig 조정 턴 — 역할 ideas\. 지난 조정 뒤 재료 3건/);
  assert.match(turn, new RegExp(ids[0] + ' 반려\\(verify\\): 미래 참조'));
  assert.match(turn, /heard-1 사람의 바로잡음: 금은 야간/);
  assert.match(turn, /지금 요령 칸\(1줄, 예산 20줄, \.atrium\/roles\/ideas\.md\):\n- 처음 요령/);
  assert.match(turn, /atrium rig tune --file \.atrium\/roles\/ideas\/tune\.md --why/);
  assert.match(turn, /atrium rig tune --none/); assert.match(turn, /atrium rig raise/);
  const tt = B.ledger(['tune_turn']).at(-1);
  assert.equal(tt.seat, 'ideas'); assert.equal(tt.value, 'after');
  assert.equal(B.T.check(B.key, 'ideas', B.S('ideas')), null); // 열린 턴
  assert.equal(B.T.state(B.key, 'ideas').open, true);
  // 되돌린 남의 쓰기: 후보 역할의 재료
  const w = rigEvent(B.b, { kind: 'role_foreign_write', ws: B.key, seat: null, actor: 'board', value: 'restored', ref: 'data/x.txt', data: { path: 'data/x.txt', owner: 'data', candidates: ['verify', 'ideas'] } });
  const m = B.T.materials(B.key, 'verify');
  assert.deepEqual(m.map((x) => x.id), ['write-' + w.seq]);
  assert.match(m[0].text, /data\/x\.txt \(restored, 주인 data, 함께 일한 역할 verify\|ideas\)/);
  assert.equal(B.T.materials(B.key, 'data').length, 0);
  // heard는 역할 세션만
  await code(B.T.verb({ sessionId: 'x', workspaceKey: B.key }, { op: 'heard', text: 'x' }), 'forbidden');
  await code(B.T.verb(B.S('ideas'), { op: 'heard', text: ' ' }), 'bad_request');
});

test('P245 조정 턴 기준: 정의 tune 값(after), m사이클(재료가 하나라도 있을 때)', async () => {
  const B = await board((d) => { d.tune = { after: 5, every: 2, lines: 20 }; });
  await B.returns3(1);
  assert.equal(B.T.check(B.key, 'ideas', B.S('ideas')), null);
  await B.b.rig3.beat.strike(B.key, { by: 'human' });
  assert.equal(B.T.check(B.key, 'ideas', B.S('ideas')), null);
  await B.b.rig3.beat.strike(B.key, { by: 'human' });
  assert.equal(B.T.state(B.key, 'ideas').cycles, 2);
  assert.ok(B.T.check(B.key, 'ideas', B.S('ideas')).tuneTurn);
  assert.equal(B.ledger(['tune_turn']).at(-1).value, 'every');
  // 재료가 없는 역할은 사이클만으로 열지 않는다
  assert.equal(B.T.check(B.key, 'verify', B.S('verify')), null);
  // after는 정의 값(5)
  const B2 = await board((d) => { d.tune = { after: 2 }; });
  await B2.returns3(2);
  assert.equal(B2.T.check(B2.key, 'ideas', B2.S('ideas')) && B2.ledger(['tune_turn']).at(-1).value, 'after');
});

test('P245 tune 반영: 요령 칸만 바뀌고 꼬리표·새 판·장부·기록·guard.accept, 다음 판은 정의서 ideas가 바뀐 판', async () => {
  const B = await board();
  const ids = await B.returns3(3);
  B.T.check(B.key, 'ideas', B.S('ideas'));
  const v0 = B.verN();
  const f = B.file('.atrium/roles/ideas/tune.md', '- 처음 요령\n- 진입에 쓰는 값이 그 시점에 알 수 있는 값인지 먼저 본다\n');
  const x = await B.admin.verb(B.S('ideas'), { op: 'tune', file: f, why: '미래 참조 반려 셋', evidence: [ids[0], ids[2]] });
  assert.equal(x.prevN, v0); assert.equal(x.n, v0 + 1); assert.equal(x.added, 1); assert.equal(x.removed, 0); assert.equal(x.lines, 2);
  assert.equal(B.tuneOf('ideas'), '- 처음 요령\n- 진입에 쓰는 값이 그 시점에 알 수 있는 값인지 먼저 본다 [v' + x.n + ' · ' + ids[0] + ' ' + ids[2] + ']');
  const doc = checkRoleDoc(B.docText('ideas'));
  assert.equal(doc.sections['기준'], '- 기준 ideas'); assert.equal(doc.sections['맡은 것'], 'ideas의 일');
  assert.ok(B.accepts.some((r) => r.includes('.atrium/roles/ideas.md')));
  const ev = B.ledger(['role_tune']).at(-1);
  assert.equal(ev.value, 'applied'); assert.equal(ev.seat, 'ideas'); assert.equal(ev.data.n, x.n); assert.deepEqual(ev.data.evidence, [ids[0], ids[2]]);
  assert.match(ev.data.diff, /^\+- 진입에 쓰는 값/m);
  const rv = B.ledger(['rig_version']).at(-1);
  assert.equal(rv.defN, x.n); assert.deepEqual(rv.data.changed, ['role:ideas']); assert.equal(rv.data.changed_by, 'role:ideas'); assert.equal(rv.actor, 'agent');
  assert.equal(B.store.rig3Tunes(B.key, 'ideas').at(-1).state, 'applied');
  const st = B.T.state(B.key, 'ideas');
  assert.equal(st.open, false); assert.equal(st.mats.length, 0);
  // 보기: 정의서 판·조정 수
  const view = B.b.rig3.view(B.key, B.b.rig.read(B.key).def).roles.find((r) => r.name === 'ideas').tune;
  assert.equal(view.n, x.n); assert.equal(view.tunes, 1); assert.equal(view.lines, 2); assert.equal(view.budget, 20); assert.equal(view.material, 0);
  // 새로 뜨는 역할이 싣는 정의서에 반영된 요령
  assert.match(loadText(B.b.rig.read(B.key).def.rig3, 'ideas', { role: B.docText('ideas') }), /먼저 본다 \[v/);
  // --text도 받는다(같은 내용은 거절)
  await code(Promise.resolve().then(() => B.T.tune(B.key, { role: 'ideas', text: B.tuneOf('ideas'), why: 'x', evidence: [ids[0]] })), 'tune_rejected');
});

test('P245 tune 거절: 고정 칸 바뀜, 예산 넘음, 없는 근거, 근거 없음, 같음. 정의서·판은 그대로, 장부 rejected', async () => {
  const B = await board((d) => { d.tune = { lines: 3 }; });
  const ids = await B.returns3(3);
  const v0 = B.verN(); const doc0 = B.docText('ideas');
  const try_ = (o) => B.T.verb(B.S('ideas'), { op: 'tune', why: '까닭', evidence: [ids[0]], ...o });
  let e = await code(try_({ text: DOC('ideas', '- 새 요령').replace('- 기준 ideas', '- 기준을 내 맘대로') }), 'tune_rejected');
  assert.equal(e.why, 'fixed_changed'); assert.match(e.message, /고정 칸이 바뀌었다: ## 기준/);
  e = await code(try_({ text: '- 1\n- 2\n- 3\n- 4' }), 'tune_rejected');
  assert.equal(e.why, 'over_budget'); assert.match(e.message, /4줄이다\. 예산 3줄/);
  e = await code(try_({ text: '- 새', evidence: ['hypothesis-99'] }), 'tune_rejected');
  assert.equal(e.why, 'no_evidence'); assert.match(e.message, /재료에 없다: hypothesis-99/);
  e = await code(B.T.verb(B.S('verify'), { op: 'tune', text: '- 새', why: 'x', evidence: [ids[0]] }), 'tune_rejected'); // 남의 재료
  assert.equal(e.why, 'no_evidence');
  e = await code(try_({ text: '- 새', evidence: [] }), 'tune_rejected');
  assert.equal(e.why, 'no_evidence');
  e = await code(try_({ text: '- 처음 요령' }), 'tune_rejected');
  assert.equal(e.why, 'tune_same');
  await code(try_({ text: '- 새', why: '' }), 'bad_request');
  await code(try_({ file: path.join(B.dir, 'nope.md'), text: undefined }), 'not_found');
  assert.equal(B.docText('ideas'), doc0); assert.equal(B.verN(), v0);
  assert.equal(B.ledger(['role_tune']).filter((x) => x.value === 'rejected').length, 6);
  assert.equal(B.store.rig3Tunes(B.key, 'ideas', { states: ['rejected'] }).length, 5);
  // 거절은 답이 아니다(재료 그대로)
  assert.equal(B.T.state(B.key, 'ideas').mats.length, 3);
  // 역할 세션이 아니면·꺼진 rig면
  await code(B.T.verb({ sessionId: 'x', workspaceKey: B.key }, { op: 'tune', text: '- x', why: 'x', evidence: ['a-1'] }), 'forbidden');
  B.store.setRigEnabled(B.key, false);
  await code(B.T.verb(B.S('ideas'), { op: 'tune', text: '- x', why: 'x', evidence: [ids[0]] }), 'rig3_off');
});

test('P245 tune --none과 raise: 턴을 닫는 답, 장부·기록, 변경 기록에 "역할이 바꾼 것"과 "사람이 볼 것"', async () => {
  const B = await board();
  await B.returns3(3);
  B.T.check(B.key, 'ideas', B.S('ideas'));
  const n = await B.T.verb(B.S('ideas'), { op: 'tune', none: '반려는 정의서 기준이 모호해서다' });
  assert.equal(n.none, true);
  assert.equal(B.T.state(B.key, 'ideas').open, false);
  assert.equal(B.T.state(B.key, 'ideas').mats.length, 0);
  assert.equal(B.ledger(['role_tune']).at(-1).value, 'none');
  await code(B.T.verb(B.S('ideas'), { op: 'raise', reason: '' }), 'bad_request');
  await B.returns3(1);
  const r = await B.T.verb(B.S('ideas'), { op: 'raise', reason: '검증 기준이 바뀌어야 한다' });
  assert.equal(r.raised, true); assert.equal(r.materials.length, 1);
  assert.equal(B.T.state(B.key, 'ideas').mats.length, 0);
  assert.deepEqual(B.store.rig3Tunes(B.key, 'ideas').map((t) => [t.kind, t.state]), [['none', 'noted'], ['raise', 'noted']]);
  const rows = B.ledger();
  const facts = collectCycle(B.b.rig.read(B.key).def.rig3, rows, { n: 1, from: 0, to: Date.now(), by: 'clock' });
  assert.deepEqual(facts.tunes.map((t) => t.kind), ['none']);
  assert.deepEqual(facts.decide.filter((d) => d.what === 'raise').map((d) => d.reason), ['검증 기준이 바뀌어야 한다']);
  const body = numbersBody(facts, 'ko');
  assert.match(body, /- ideas: 조정 턴에 고칠 것 없음 — 반려는/);
  assert.match(body, /\*\*사람이 볼 것\*\*\n(.*\n)*- ideas가 요령으로 풀 일이 아니라고 빌더에게 올렸다: 검증 기준이/);
  assert.match(numbersBody(facts, 'en'), /ideas raised to the builder/);
});

test('P245 되돌리기(사람): 정의서 하나의 요령 칸만 지난 판으로, 다른 역할의 뒤 조정은 남는다. 새 판·장부·다음 깨우는 글', async () => {
  const B = await board();
  const v1 = B.verN();
  const ids = await B.returns3(3);
  const a = await B.T.verb(B.S('ideas'), { op: 'tune', text: '- 처음 요령\n- ideas 새 요령', why: 'ideas 까닭', evidence: [ids[1]] });
  const w = rigEvent(B.b, { kind: 'role_foreign_write', ws: B.key, seat: 'data', actor: 'board', value: 'quarantined', ref: 'verify/x', data: { path: 'verify/x', owner: 'verify', candidates: ['data'] } });
  const d = await B.T.verb(B.S('data'), { op: 'tune', text: '- data 새 요령', why: 'data 까닭', evidence: ['write-' + w.seq] });
  assert.equal(d.n, a.n + 1);
  const dataTune = B.tuneOf('data');
  // 역할 세션의 role --rollback은 거절(사람만), 보기는 된다
  await code(B.T.verb(B.S('ideas'), { op: 'role', rollback: v1 }), 'forbidden');
  const info = await B.T.verb(B.S('verify'), { op: 'role', role: 'ideas' });
  assert.equal(info.n, a.n); assert.deepEqual(info.versions, [v1, a.n]); assert.equal(info.log.at(-1).kind, 'tune'); assert.match(info.tune, /ideas 새 요령/);
  // 판 API: local만
  const H = rig3TuneHandlers(B.b);
  await code(H['rig3.rollback']({ workspace: B.key, role: 'ideas', n: v1 }, { auth: { kind: 'remote' } }), 'forbidden');
  const r = await H['rig3.rollback']({ workspace: B.key, role: 'ideas', n: v1 }, { auth: { kind: 'local' } });
  assert.equal(r.from, v1); assert.equal(r.n, d.n + 1); assert.equal(r.removed, 1);
  assert.equal(B.tuneOf('ideas'), '- 처음 요령');
  assert.equal(B.tuneOf('data'), dataTune); // 다른 역할의 뒤 조정은 남는다
  const rv = B.ledger(['rig_version']).at(-1);
  assert.deepEqual(rv.data.changed, ['role:ideas']); assert.equal(rv.data.changed_by, 'human');
  const rb = B.ledger(['role_rollback']).at(-1);
  assert.equal(rb.seat, 'ideas'); assert.equal(rb.actor, 'human'); assert.equal(rb.value, String(v1));
  assert.ok(B.accepts.filter((x) => x.includes('.atrium/roles/ideas.md')).length >= 2);
  // 같은 것으로 다시 되돌리면 바뀌지 않음
  assert.equal((await H['rig3.rollback']({ workspace: B.key, role: 'ideas', n: v1 }, { auth: { kind: 'local' } })).unchanged, true);
  await code(H['rig3.rollback']({ workspace: B.key, role: 'ideas', n: 999 }, { auth: { kind: 'local' } }), 'not_found');
  // 되돌린 역할의 다음 깨우는 글에 알림(한 번)
  B.b.rig3.items.notify(B.key, 'ideas', '- 시험 줄'); // 아직 넣지 않은 깨우는 글이 있으면 그 글에 더해진다
  const wake = B.toRole('ideas').filter((x) => /- 시험 줄/.test(x.text)).map((x) => x.text).join('\n');
  assert.match(wake, /사람이 네 정의서\(\.atrium\/roles\/ideas\.md\)의 요령 칸을 판 \d+의 것으로 되돌렸다/);
  assert.deepEqual(B.T.takeNotices(B.key, 'ideas'), []);
  // 꺼진 rig에서도 사람은 되돌린다
  B.store.setRigEnabled(B.key, false);
  const r2 = await H['rig3.rollback']({ workspace: B.key, role: 'ideas', n: a.n }, { auth: { kind: 'local' } });
  assert.match(B.tuneOf('ideas'), /ideas 새 요령/); assert.ok(r2.n > r.n);
  // 변경 기록: 되돌림과 조정
  const facts = collectCycle(B.b.rig.read(B.key).def.rig3, B.ledger(), { n: 1, from: 0, to: Date.now(), by: 'clock' });
  assert.deepEqual(facts.tunes.map((t) => [t.kind, t.role]), [['tune', 'ideas'], ['tune', 'data'], ['rollback', 'ideas'], ['rollback', 'ideas']]);
  const body = numbersBody(facts, 'ko');
  assert.match(body, new RegExp('- ideas 요령 칸 판 ' + v1 + '→' + a.n + ' \\(\\+1 −0\\): ideas 까닭 — 근거 \\[' + ids[1] + '\\]'));
  assert.match(body, /- ideas 요령 칸을 사람이 판 \d+의 것으로 되돌림 → 판 \d+/);
});

test('P245 변경 기록: 조정(판 번호·근거 id)은 판이 쓰고 AI는 글만, 사이클 구간의 조정', async () => {
  const B = await board();
  const ids = await B.returns3(3);
  await B.b.rig3.beat.strike(B.key, { by: 'human' }); // 사이클 1 열림
  await B.T.verb(B.S('ideas'), { op: 'tune', text: '- 처음 요령\n- 새 줄', why: '까닭', evidence: [ids[0]] });
  const f = B.b.rig3.beat.facts(B.key, 1);
  assert.equal(f.tunes.length, 1); assert.deepEqual(f.tunes[0].evidence, [ids[0]]); assert.ok(f.ids.includes(ids[0]));
  assert.equal(f.empty, false);
  const pr = cleanProse(JSON.stringify({ roles: 'ideas가 미래 참조 반려를 보고 요령을 더했다. 판 7로 올렸다.' }));
  assert.equal(pr.roles, 'ideas가 미래 참조 반려를 보고 요령을 더했다.'); assert.equal(pr.dropped, 1);
  assert.match(entryBody(f, 'ko', pr), new RegExp('\\*\\*역할이 바꾼 것\\*\\*\\nideas가 미래 참조 반려를 보고 요령을 더했다\\.\\n- ideas 요령 칸 판 \\d+→\\d+ \\(\\+1 −0\\): 까닭 — 근거 \\[' + ids[0] + '\\]'));
  // 박자가 사이클 2를 열면 사이클 1의 꼭지에 조정이 쓰인다(AI 실패 → 숫자만)
  await B.b.rig3.beat.strike(B.key, { by: 'human' });
  const until = async (fn) => { for (let i = 0; i < 200; i++) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } assert.fail('기다림'); };
  const c = await until(() => { const x = B.store.getRig3Cycle(B.key, 1); return x.entryState === 'done' ? x : null; });
  assert.match(c.entry, /\*\*역할이 바꾼 것\*\*\n- ideas 요령 칸 판 \d+→\d+ \(\+1 −0\): 까닭 — 근거 \[/);
});

test('P245 장부 종류·명령·실을 글·안내', async () => {
  assert.deepEqual(RIG3_TUNE_KINDS, ['tune_turn', 'role_tune', 'role_raise', 'role_heard', 'role_rollback']);
  assert.deepEqual(RIG3_TUNE_OPS, ['tune', 'raise', 'heard', 'role']);
  const B = await board();
  const r3 = B.b.rig.read(B.key).def.rig3;
  const t = loadText(r3, 'ideas', {});
  assert.match(t, /atrium rig heard "<요지>"/); assert.match(t, /반려·바로잡음이 3건 쌓이거나 \(하나라도 있고\) 5사이클이 지나면 판이 조정 턴을 준다/);
  assert.match(rig3Guide(r3, 'ideas'), /atrium rig tune/);
  // rig-admin의 길: tune 명령이 rig 3으로 간다
  await code(B.admin.verb(B.S('ideas'), { op: 'raise' }), 'bad_request');
  const info = await B.admin.verb(B.S('ideas'), { op: 'role' });
  assert.equal(info.role, 'ideas'); assert.equal(info.budget, 20); assert.equal(info.lines, 1);
  const H = rig3TuneHandlers(B.b);
  assert.equal((await H['rig3.role']({ workspace: B.key, role: 'verify' })).role, 'verify');
  await code(H['rig3.role']({ workspace: B.key, role: 'nope' }), 'not_found');
});

test('P245 덧붙임: 꼭지의 숫자·id는 판만 쓴다 — AI 글의 숫자 든 문장은 지우고, 모두 지워지면 숫자만. 판의 숫자는 그대로 나온다', async () => {
  assert.deepEqual(cleanProse('{"summary":"두 역할이 일했다.","ran":"가설 3개가 반려됐다. 검증이 기준을 지켰다.","roles":"판 ５에서 바뀜.","decide":"[hint-1]을 본다."}'), { summary: '두 역할이 일했다.', ran: '검증이 기준을 지켰다.', dropped: 3 });
  assert.deepEqual(cleanProse('\x60\x60\x60json\n{"ran":"좋다."}\n\x60\x60\x60'), { ran: '좋다.', dropped: 0 });
  assert.equal(cleanProse('{"ran":"12개"}'), null);
  assert.equal(cleanProse('그냥 글'), null);
  const B = await board();
  await B.b.rig3.beat.strike(B.key, { by: 'human' }); // 사이클 1
  const ids = await B.returns3(2);
  const until = async (fn) => { for (let i = 0; i < 200; i++) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } assert.fail('기다림'); };
  // AI가 숫자를 지어내도 꼭지에는 판의 숫자만
  B.b.rig3.beat.runner = async () => ({ ok: true, text: JSON.stringify({ summary: '가설이 거듭 반려됐다. 반려는 7건이다.', ran: '검증이 가설 99개를 돌려보냈다.' }), meta: { model: 'haiku' } });
  await B.b.rig3.beat.strike(B.key, { by: 'human' });
  const c = await until(() => { const x = B.store.getRig3Cycle(B.key, 1); return x.entryState === 'done' ? x : null; });
  assert.equal(c.entryBy, 'ai'); assert.equal(c.entryMeta.dropped, 2);
  assert.doesNotMatch(c.entry, /7건|99/);
  assert.match(c.entry, /가설이 거듭 반려됐다\./);
  const draft = numbersBody(B.b.rig3.beat.facts(B.key, 1), 'ko');
  for (const line of draft.split('\n').filter((l) => l.startsWith('- '))) assert.ok(c.entry.includes(line), '판의 줄: ' + line);
  assert.match(c.entry, new RegExp('hypothesis \\(ideas → verify\\): 낸 2 · 받음 0 · 반려 2 — \\[' + ids[0] + '\\] \\[' + ids[1] + '\\]'));
});

test('P245 덧붙임: 도구 기록은 가진 역할의 섹터 tool-logs/에 도구마다 최근 200개(정의값)만 남는다', async () => {
  const dir = tmp();
  for (let i = 0; i < 5; i++) { const f = path.join(dir, 'fetch-tr' + (0xa0 + i).toString(16) + '.log'); fs.writeFileSync(f, String(i)); fs.utimesSync(f, new Date(1e12 + i * 1000), new Date(1e12 + i * 1000)); }
  fs.writeFileSync(path.join(dir, 'other-tr01.log'), 'x'); fs.writeFileSync(path.join(dir, 'fetch-notes.txt'), 'x');
  assert.equal(pruneToolLogs(dir, 'fetch', 3), 2);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['fetch-notes.txt', 'fetch-tra2.log', 'fetch-tra3.log', 'fetch-tra4.log', 'other-tr01.log']);
  assert.equal(pruneToolLogs(dir, 'fetch', 3), 0);
  assert.equal(pruneToolLogs(path.join(dir, 'none'), 'fetch', 3), 0);
  // 실제 실행 뒤 지운다(판 설정 rig3ToolLogsKeep로 줄여 본다)
  const B = await board((d) => { d.roles.data.tools = ['fetch']; d.tools = { fetch: { run: ['node', '-e', "console.log('ok')"] } }; });
  B.b.cfg.rig3ToolLogsKeep = 2;
  B.b.cfg.rig3ToolWaitMs = 20000;
  for (let i = 0; i < 4; i++) await B.admin.verb(B.S('data'), { op: 'tool', tool: 'fetch' });
  const logs = fs.readdirSync(path.join(B.dir, 'data', 'tool-logs')).filter((n) => /^fetch-tr[0-9a-f]+\.log$/.test(n));
  assert.equal(logs.length, 2);
  assert.equal(B.b.rig3.beat ? (await import('../src/rig3-beat.mjs')).TOOL_LOGS_KEEP : 0, 200);
});
