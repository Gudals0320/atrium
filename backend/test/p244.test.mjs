// P244: rig 3 3단계 — 박자(every·at, 사이클 번호, 놓친 박자는 한 번, 일하는 역할을 끊지 않음, 사람 손 박자, 역할은 못 침), 항목 사이클,
// 도구(역할이 부름, 남의 도구 거절, every 도구는 역할을 깨우지 않음, 경보면 가진 역할을 깨움, guard 경계), 사이클 요약 모음,
// 한 번짜리 실행(키 없는 환경, 실패하면 숫자만 꼭지), 변경 기록 파일, 보기.
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
import { RIG3_BEAT_KINDS, RIG3_EVENT_KINDS } from '../src/rig-ledger.mjs';
import { loadText, rig3Guide } from '../src/rig3.mjs';
import { Rig3Roles, ROLE_SPAWN } from '../src/rig3-roles.mjs';
import { nextDue, alarmOf, collectCycle, numbersBody, checkAiBody, addEntry, summaryEnv, summaryArgs, runClaudeOnce, rig3BeatHandlers, CHANGELOG, RIG3_BEAT_OPS } from '../src/rig3-beat.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p244-'));
const DOC = (name) => ['# ' + name, '', '## 맡은 것', name + '의 일', '', '## 받는 것과 내는 것', '-', '', '## 기준', '- 기준', '', '## 요령', '- 요령'].join('\n');
const MIN = 60000;
const DEF = () => ({
  version: 3, name: 'p244', purpose: '.atrium/purpose.md',
  beat: { every: '1m', role: 'data' },
  roles: { data: { owns: ['data/'], tools: ['fetch', 'watch'] }, ideas: { owns: ['hypotheses/'], tools: ['think'] }, verify: { owns: ['verify/'] } },
  flows: [
    { item: 'snapshot', from: 'data', to: 'ideas' },
    { item: 'hypothesis', from: 'ideas', to: 'verify' },
    { item: 'result', from: 'verify', to: 'ideas', for: 'hypothesis' },
    { item: 'hint', from: 'human', to: 'ideas' },
  ],
  tools: {
    fetch: { run: ['node', 'tools/fetch.mjs'], every: '5m' },
    watch: { run: ['node', 'tools/watch.mjs'], every: '10m' },
    think: { run: ['node', 'tools/think.mjs'] },
  },
});
const TOOL_SRC = {
  'tools/fetch.mjs': "import fs from 'node:fs'; import path from 'node:path'; const root = process.env.ATRIUM_WORKSPACE_ROOT; fs.mkdirSync(path.join(root, 'data'), { recursive: true }); fs.writeFileSync(path.join(root, 'data', 'prices.txt'), 'p ' + process.argv.slice(2).join(' ')); console.log('fetched', process.env.ATRIUM_RIG_ROLE, process.env.ATRIUM_RIG_CYCLE, process.env.ATRIUM_RIG_BY);",
  'tools/watch.mjs': "console.log('checking'); console.log('ALARM: price gap 7%');",
  'tools/think.mjs': "console.log('thinking'); process.exit(3);",
};
async function board(mod = null) {
  const def = DEF();
  if (mod) mod(def);
  const dir = tmp(); const outside = tmp(); // 판의 저장소·데이터 폴더는 워크스페이스 밖(실제 판과 같다)
  fs.mkdirSync(path.join(dir, '.atrium', 'roles'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.atrium', 'purpose.md'), '# 목적\nP244\n');
  for (const r of Object.keys(def.roles)) fs.writeFileSync(path.join(dir, '.atrium', 'roles', r + '.md'), DOC(r));
  for (const [f, s] of Object.entries(TOOL_SRC)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); }
  fs.writeFileSync(path.join(dir, '.atrium', 'rig.json'), JSON.stringify(def, null, 2));
  const store = new Store(path.join(outside, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const casts = []; const items = new Map(); let dn = 0;
  const settings = { language: 'ko', rig3SummaryModel: 'haiku' };
  const b = { cfg: { hookTimeoutSec: 2, sessionsDir: path.join(outside, 'sessions'), dataDir: path.join(outside, 'data-board'), rig3DeadGraceMs: 0, rig3ToolWaitMs: 20000 }, store, sessions: new Map(), log: () => {}, api: { broadcast: (n, d) => casts.push({ n, d }) }, features: { settings: { get: () => settings } } };
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
  // guard 부름을 센다(진짜 guard를 그대로 부른다)
  const G = b.rig3.guard; const gcalls = [];
  for (const m of ['toolBegin', 'toolEnd', 'accept']) { const f = G[m].bind(G); G[m] = (...a) => { gcalls.push([m, ...a]); return f(...a); }; }
  store.setRigEnabled(ws.key, true);
  await b.rig3.onEnabled(ws.key, true);
  const S = (role) => [...b.sessions.values()].find((s) => s.rigRole === role);
  const key = ws.key;
  const BT = b.rig3.beat;
  const file = (rel, text = rel) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
  const put = (role, rel, o = {}) => b.rig3.items.put(key, { role, session: S(role).sessionId, file: path.join(dir, rel), ...o });
  const ledger = (kinds) => store.rigEvents({ ws: key, limit: 1000, kinds });
  const toRole = (role) => [...items.values()].filter((d) => d.sessionId === S(role).sessionId && !/너는 rig 역할/.test(d.text));
  const base = store.firstRig3Cycle(key).openedAt;
  const ai = []; BT.runner = async (prompt, o) => { ai.push({ prompt, o }); return { ok: true, text: '**돈 것**\n- 요약', meta: { model: o.model, ms: 5 } }; };
  const active = () => b.rig3.active(key);
  return { dir, store, key, b, BT, S, file, put, ledger, toRole, items, casts, gcalls, base, ai, settings, active };
}
const code = async (p, c) => { try { await p; } catch (e) { assert.equal(e.code, c, e.message); return e.message; } assert.fail('기대한 거절 ' + c); };
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 30)); } assert.fail('기다림 넘김'); };

test('P244 nextDue: every(지난 박자 + every), at(그날 at 기준 칸), 놓친 칸은 지금 뒤의 첫 칸', () => {
  assert.equal(nextDue({ everyMs: MIN }, null, 1000), 1000 + MIN);
  assert.equal(nextDue({ everyMs: MIN }, 5000, 1000), 5000 + MIN);
  const d = new Date(2026, 10, 19, 6, 30).getTime();
  const at7 = new Date(2026, 10, 19, 7, 0).getTime();
  const day = 86400000;
  assert.equal(nextDue({ everyMs: day, at: '07:00' }, null, d), at7);
  assert.equal(nextDue({ everyMs: day, at: '07:00' }, at7, d), at7 + day);
  // 사흘을 놓쳤다: 지금(사흘 뒤 9시) 친 뒤의 다음 칸은 내일 7시 하나(몰아 치지 않는다)
  const late = at7 + 3 * day + 2 * 3600000;
  assert.ok(nextDue({ everyMs: day, at: '07:00' }, at7, d) < late);
  assert.equal(nextDue({ everyMs: day, at: '07:00' }, late, d), at7 + 4 * day);
  // 1시간마다 07:00 기준
  assert.equal(nextDue({ everyMs: 3600000, at: '07:00' }, new Date(2026, 10, 19, 9, 10).getTime(), d), new Date(2026, 10, 19, 10, 0).getTime());
  assert.equal(alarmOf('ok\nALARM: gap 7%\n'), 'gap 7%'); assert.equal(alarmOf('no alarm here'), null);
});

test('P244 박자: 켜면 사이클 0, 시계가 사이클을 열고(번호·장부) 박자 역할을 깨운다. 놓친 박자는 한 번만. 항목에 사이클 번호', async () => {
  const B = await board();
  assert.equal(B.BT.current(B.key), 0);
  assert.deepEqual(B.ledger(['cycle_open']).map((e) => [e.n, e.value]), [[0, 'enable']]);
  B.file('data/s0.md', 's0');
  const r0 = await B.put('data', 'data/s0.md', { kind: 'snapshot' });
  assert.equal(r0.item.cycle, 0); assert.equal(B.store.getItem(B.key, 'snapshot-1').cycle, 0);
  const r = B.active();
  // 아직 칸 전
  assert.deepEqual((await B.BT.tick(B.key, r, B.base + 30000)).filter((x) => x.beat), []);
  // 칸 → 사이클 1
  const out = await B.BT.tick(B.key, r, B.base + MIN + 1000);
  assert.deepEqual(out.find((x) => x.beat).beat, { n: 1, prev: 0, by: 'clock' });
  assert.equal(B.BT.current(B.key), 1);
  const c1 = B.store.getRig3Cycle(B.key, 1); assert.equal(c1.by, 'clock'); assert.equal(c1.dueAt, B.base + MIN);
  const wake = B.toRole('data').at(-1);
  assert.match(wake.text, /\[Atrium 보드\] 사이클 1\./); assert.match(wake.text, /rig 박자 — 사이클 1 열림:/); assert.match(wake.text, /이번 박자 사이에 돈 도구: 없음/);
  assert.equal(wake.opts.origin.kind, 'board');
  B.file('data/s1.md', 's1');
  assert.equal((await B.put('data', 'data/s1.md', { kind: 'snapshot' })).item.cycle, 1);
  // 판이 꺼져 10분을 놓쳤다 → 한 번만(late), 같은 때 다시 돌려도 더 치지 않는다
  const t2 = B.base + MIN + 1000 + 10 * MIN;
  const o2 = await B.BT.tick(B.key, r, t2);
  assert.deepEqual(o2.find((x) => x.beat).beat, { n: 2, prev: 1, by: 'late' });
  assert.deepEqual((await B.BT.tick(B.key, r, t2 + 5000)).filter((x) => x.beat), []);
  assert.deepEqual(B.ledger(['cycle_open']).map((e) => [e.n, e.value]), [[0, 'enable'], [1, 'clock'], [2, 'late']]);
  assert.match(B.toRole('data').at(-1).text, /놓친 박자를 지금 한 번 친다/);
  // 다음 칸은 친 때 + every
  assert.equal(B.BT.view(B.key, r.def.rig3).nextAt, t2 + MIN);
});

test('P244 박자는 일하는 역할을 끊지 않는다: 대기열로 넣고, 아직 넣지 않은 깨우는 글이 있으면 그 글에 더한다', async () => {
  const B = await B0();
  async function B0() { return board(); }
  const r = B.active();
  // ideas가 일하는 중(대기열에 넣지 않은 snapshot 깨우는 글이 있다) — 박자 역할을 ideas로
  const B2 = await board((d) => { d.beat.role = 'ideas'; });
  B2.S('ideas').rt.state = 'working';
  B2.file('data/a.md', 'a');
  await B2.put('data', 'data/a.md', { kind: 'snapshot' });
  const before = B2.toRole('ideas');
  assert.equal(before.length, 1);
  await B2.BT.tick(B2.key, B2.active(), B2.base + MIN + 1);
  const after = B2.toRole('ideas');
  assert.equal(after.length, 1, '새 글을 넣지 않고 기다리는 글에 더한다');
  assert.match(after[0].text, /snapshot-1/); assert.match(after[0].text, /이번 박자 사이에 돈 도구/);
  assert.match(after[0].text, /\[Atrium 보드\] 사이클 1\./);
  // 넣은 뒤(confirmed)면 새 글(대기열 차례는 판의 대기열이 정한다)
  after[0].status = 'confirmed';
  await B2.BT.tick(B2.key, B2.active(), B2.base + 2 * MIN + 2);
  assert.equal(B2.toRole('ideas').length, 2);
  assert.ok(r);
});

test('P244 손 박자: 판 API rig3.beat(사람, local만), 역할 세션의 atrium rig beat는 거절, 꺼진 rig는 거절', async () => {
  const B = await board();
  const H = rig3BeatHandlers(B.b);
  await code(H['rig3.beat']({ workspace: B.key }, { auth: { kind: 'remote' } }), 'forbidden');
  const x = await H['rig3.beat']({ workspace: B.key }, { auth: { kind: 'local' } });
  assert.deepEqual(x, { n: 1, prev: 0, by: 'human' });
  assert.equal(B.ledger(['cycle_open']).at(-1).actor, 'human');
  const admin = new RigAdmin(B.b, {});
  assert.match(await code(admin.verb(B.S('data'), { op: 'beat' }), 'forbidden'), /사람만 친다/);
  assert.deepEqual(RIG3_BEAT_OPS, ['beat', 'tool']);
  // 다음 시계 박자는 손 박자 뒤 every
  const v = B.BT.view(B.key, B.active().def.rig3);
  assert.ok(v.nextAt > Date.now() + 50000);
  B.store.setRigEnabled(B.key, false);
  await code(B.BT.beatNow(B.key), 'rig3_off');
});

test('P244 도구: 역할이 자기 도구를 부른다(출력은 섹터 tool-logs, guard 경계, 장부), 남의 도구·없는 도구 거절, 실패는 종료 코드', async () => {
  const B = await board();
  const admin = new RigAdmin(B.b, {});
  const list = await admin.verb(B.S('data'), { op: 'tool' });
  assert.deepEqual(list.tools.map((t) => [t.name, t.every]), [['fetch', '5m'], ['watch', '10m']]);
  const x = await admin.verb(B.S('data'), { op: 'tool', tool: 'fetch', args: ['now'] });
  assert.equal(x.running, false); assert.equal(x.run.status, 'done'); assert.equal(x.run.exitCode, 0);
  assert.match(x.run.tail, /fetched data 0 role/);
  assert.equal(fs.readFileSync(path.join(B.dir, 'data', 'prices.txt'), 'utf8'), 'p now');
  assert.ok(x.run.log.startsWith(path.join(B.dir, 'data', 'tool-logs', 'fetch-')));
  const ev = B.ledger(['role_tool']).at(-1);
  assert.equal(ev.seat, 'data'); assert.equal(ev.value, 'done'); assert.equal(ev.data.by, 'role'); assert.equal(ev.ref, x.run.id); assert.match(ev.data.log, /^data\/tool-logs\/fetch-tr[0-9a-f]+\.log$/);
  assert.deepEqual(B.gcalls.filter((c) => c[0] !== 'accept').map((c) => [c[0], c[2], c[3]]), [['toolBegin', 'data', x.run.id], ['toolEnd', 'data', x.run.id]]);
  // guard가 도구의 쓰기를 data의 쓰기로 본다(되돌리지 않는다)
  await B.b.rig3.guard.idle(B.key);
  assert.equal(fs.readFileSync(path.join(B.dir, 'data', 'prices.txt'), 'utf8'), 'p now');
  assert.equal(B.ledger(['role_foreign_write']).length, 0);
  // 남의 도구, 없는 도구, 역할이 아닌 세션
  assert.match(await code(admin.verb(B.S('verify'), { op: 'tool', tool: 'fetch' }), 'forbidden'), /fetch는 data의 것이다/);
  await code(admin.verb(B.S('data'), { op: 'tool', tool: 'nope' }), 'unknown_tool');
  await code(B.BT.verb({ sessionId: 'x', workspaceKey: B.key }, { op: 'tool', tool: 'fetch' }), 'forbidden');
  // 실패(종료 코드 3)
  const y = await admin.verb(B.S('ideas'), { op: 'tool', tool: 'think' });
  assert.equal(y.run.exitCode, 3); assert.equal(B.ledger(['role_tool']).at(-1).value, 'failed');
  // 역할이 부른 실행은 깨우지 않는다(결과를 바로 받았다)
  assert.equal(B.toRole('ideas').filter((d) => /도구/.test(d.text)).length, 0);
});

test('P244 every 도구: 판이 시계로 돌리고 역할을 깨우지 않는다. 경보("ALARM:")면 가진 역할을 깨운다. 도는 중이면 겹쳐 돌리지 않는다', async () => {
  const B = await board((d) => { delete d.beat; });
  const r = B.active();
  const n0 = B.toRole('data').length;
  const out = await B.BT.tick(B.key, r, B.base + 5 * MIN + 1);
  const run = out.find((x) => x.tool === 'fetch');
  assert.ok(run);
  assert.ok(!out.some((x) => x.tool === 'watch'), 'watch는 10분');
  await until(() => B.ledger(['role_tool']).length === 1);
  const ev = B.ledger(['role_tool'])[0];
  assert.equal(ev.value, 'done'); assert.equal(ev.data.by, 'clock');
  assert.equal(B.toRole('data').length, n0, '정상 시계 실행은 깨우지 않는다');
  // 경보
  await B.BT.tick(B.key, r, B.base + 10 * MIN + 2);
  await until(() => B.ledger(['role_tool']).some((e) => e.data.tool === 'watch'));
  const w = B.ledger(['role_tool']).find((e) => e.data.tool === 'watch');
  assert.equal(w.value, 'alarm'); assert.equal(w.data.alarm, 'price gap 7%');
  const wake = await until(() => B.toRole('data').find((d) => /도구 경보/.test(d.text)));
  assert.match(wake.text, /도구 watch가 경보를 냈다: price gap 7%/); assert.match(wake.text, /data\/tool-logs\/watch-/);
  // 다음 깨우는 글 머리: 이번 사이클에 돈 네 도구
  assert.match(wake.text, /이번 사이클에 돈 네 도구: .*fetch [12]번/); // 두 번째 fetch는 watch와 같은 주기에 떠 먼저 끝날 수도 있다
  // 겹침: 도는 중이면 시계 실행을 건너뛴다
  B.BT.byTool.set(B.key + '|fetch', 'trbusy');
  const o3 = await B.BT.tick(B.key, r, B.base + 20 * MIN);
  assert.ok(o3.some((x) => x.toolSkipped === 'fetch'));
  B.BT.byTool.delete(B.key + '|fetch');
});

test('P244 사이클 요약: 지난 사이클을 장부에서 모으고(길마다 수·반려·pass·도구·되돌림·멈춤) AI 한 번으로 변경 기록에 한 꼭지', async () => {
  const B = await board();
  const r = B.active();
  await B.BT.beatNow(B.key); // 사이클 1(사이클 0은 빈 첫 채움: 꼭지 없음)
  await until(() => B.store.getRig3Cycle(B.key, 0).entryState === 'empty');
  assert.equal(B.ai.length, 0);
  // 사이클 1의 일
  B.file('data/s1.md', 's1'); await B.put('data', 'data/s1.md', { kind: 'snapshot' });
  B.b.rig3.items.accept(B.key, { role: 'ideas', id: 'snapshot-1' });
  B.file('hypotheses/h1.md', 'h1'); await B.put('ideas', 'hypotheses/h1.md', { kind: 'hypothesis', from: 'snapshot-1' });
  B.b.rig3.items.giveBack(B.key, { role: 'verify', id: 'hypothesis-1', reason: '검증 번호가 없다' });
  B.b.rig3.items.pass(B.key, { role: 'verify', reason: '이번 박자에 낼 것 없음' });
  await new RigAdmin(B.b, {}).verb(B.S('data'), { op: 'tool', tool: 'fetch' });
  const f = B.BT.facts(B.key, 1);
  assert.deepEqual(f.flows.map((x) => [x.item, x.put, x.accepted, x.returned]), [['snapshot', 1, 1, 0], ['hypothesis', 1, 0, 1], ['result', 0, 0, 0], ['hint', 0, 0, 0]]);
  assert.deepEqual(f.flows[1].ids, ['hypothesis-1']);
  assert.deepEqual(f.returns, [{ id: 'hypothesis-1', by: 'verify', to: 'ideas', reason: '검증 번호가 없다', late: false }]);
  assert.deepEqual(f.passTurn, { verify: 1 }); // 답하지 않은 받은 것이 없으니 박자에 대한 pass
  assert.equal(f.tools[0].name, 'fetch'); assert.equal(f.tools[0].byRole, 1);
  // 박자 → 사이클 1 꼭지(AI)
  assert.ok(r);
  await B.BT.beatNow(B.key);
  await until(() => B.store.getRig3Cycle(B.key, 1).entryState === 'done');
  const c1 = B.store.getRig3Cycle(B.key, 1);
  assert.equal(c1.entryBy, 'ai'); assert.match(c1.entry, /^## 사이클 1 · /); assert.match(c1.entry, /- 요약/);
  assert.equal(B.ai.length, 1); assert.equal(B.ai[0].o.model, 'haiku');
  assert.match(B.ai[0].prompt, /hypothesis-1/); assert.match(B.ai[0].prompt, /검증 번호가 없다/);
  const log = fs.readFileSync(path.join(B.dir, CHANGELOG), 'utf8');
  assert.match(log, /^# rig 변경 기록/); assert.match(log, /## 사이클 1/);
  assert.ok(B.gcalls.some((c) => c[0] === 'accept' && c[2][0] === CHANGELOG), '판의 쓰기(guard.accept)');
  const ev = B.ledger(['cycle_entry']).at(-1); assert.equal(ev.n, 1); assert.equal(ev.value, 'ai');
  // 설정으로 모델을 바꾼다 + AI 실패 → 숫자만
  B.settings.rig3SummaryModel = 'sonnet';
  B.BT.runner = async (p, o) => { B.ai.push({ p, o }); return { ok: false, text: '', meta: { model: o.model, error: 'boom' } }; };
  B.file('data/s2.md', 's2'); await B.put('data', 'data/s2.md', { kind: 'snapshot' });
  await B.BT.beatNow(B.key);
  await until(() => B.store.getRig3Cycle(B.key, 2).entryState === 'done');
  const c2 = B.store.getRig3Cycle(B.key, 2);
  assert.equal(B.ai.at(-1).o.model, 'sonnet');
  assert.equal(c2.entryBy, 'numbers'); assert.equal(c2.entryMeta.error, 'boom');
  assert.match(c2.entry, /\*\*돈 것\*\*\n- snapshot \(data → ideas\): 낸 1 · 받음 0 · 반려 0 — \[snapshot-2\]/);
  assert.match(c2.entry, /\*\*역할이 바꾼 것\*\*\n- 없음/); assert.match(c2.entry, /\*\*사람이 볼 것\*\*\n- 없음/); assert.match(c2.entry, /판이 모은 숫자만으로 썼다/);
  // 새 것이 위
  const log2 = fs.readFileSync(path.join(B.dir, CHANGELOG), 'utf8');
  assert.ok(log2.indexOf('## 사이클 2') < log2.indexOf('## 사이클 1'));
  // AI가 자료에 없는 id를 쓰면 숫자만
  B.BT.runner = async () => ({ ok: true, text: '- 바뀜 [snapshot-99]', meta: {} });
  await B.BT.beatNow(B.key);
  await until(() => B.store.getRig3Cycle(B.key, 3).entryState === 'done');
  assert.equal(B.store.getRig3Cycle(B.key, 3).entryBy, 'numbers');
  // 보기: 지금 사이클, 최근 꼭지(새 것부터)
  const v = B.b.rig3.view(B.key, B.active().def).cycle;
  assert.equal(v.n, 4); assert.deepEqual(v.entries.map((e) => e.n), [3, 2, 1]); assert.equal(v.changelog, CHANGELOG);
  assert.deepEqual(v.beat, { every: '1m', at: null, role: 'data' });
});

test('P244 꼭지 이어 쓰기: 판이 꼭지를 쓰다 꺼진 닫힌 사이클은 다음 주기에 쓴다. 사람이 볼 것(멈춤·반려된 입력)', async () => {
  const B = await board((d) => { delete d.beat; });
  const now = Date.now();
  B.store.insertRig3Cycle({ ws: B.key, n: 1, openedAt: now - 1000, by: 'human' });
  B.store.insertRig3Cycle({ ws: B.key, n: 2, openedAt: now + 10, by: 'human' });
  B.store.setRig3CycleEntry(B.key, 1, { entryState: 'writing' });
  await B.BT.tick(B.key, B.active(), now + 20);
  await until(() => B.store.getRig3Cycle(B.key, 1).entryState === 'done');
  // collectCycle 순수: 멈춤·반려된 입력·되돌리지 못한 쓰기
  const r3 = B.active().def.rig3;
  const f = collectCycle(r3, [
    { kind: 'item_stalled', seat: 'ideas', data: { items: ['snapshot-3'] } },
    { kind: 'item_return', seat: 'ideas', toSeat: 'human', line: 3, ref: 'hint-1', value: 'receiver', data: { reason: '모호하다' } },
    { kind: 'role_foreign_write', seat: 'ideas', value: 'unrestorable', ref: 'big.bin', data: { path: 'big.bin', candidates: ['ideas'] } },
    { kind: 'role_tool', seat: 'data', value: 'alarm', ref: 'tr1', data: { tool: 'watch', by: 'clock', exit: 0, alarm: 'gap' } },
    { kind: 'role_tool', seat: 'data', value: 'alarm', ref: 'tr2', data: { tool: 'watch', by: 'clock', exit: 0, alarm: 'gap' } },
  ], { n: 5, from: now, to: now + 1, by: 'clock' });
  assert.deepEqual(f.decide.map((d) => d.what), ['stalled', 'intake_returned', 'foreign_unrestorable', 'tool_alarms']);
  const body = numbersBody(f, 'ko');
  assert.match(body, /ideas가 받은 것에 답하지 않고 멈췄다: \[snapshot-3\]/); assert.match(body, /넣은 입력 \[hint-1\]가 ideas에게 반려됐다: 모호하다/);
  assert.match(body, /watch \(data\): 2번\(시계 2, 역할 0\), 경보 2/);
  assert.match(numbersBody(f, 'en'), /\*\*For you to look at\*\*/);
  assert.equal(checkAiBody('## 사이클 5\n- [hint-1] 반려 [snapshot-3]', f), '- [hint-1] 반려 [snapshot-3]');
  assert.equal(checkAiBody('- [hint-1] 반려', f), null, '사람이 볼 것의 id(멈춘 snapshot-3)를 뺐다');
  assert.equal(checkAiBody('- [hint-9]', f), null); assert.equal(checkAiBody('   ', f), null);
  assert.equal(addEntry('', '## 사이클 1\n- a').split('\n')[0], '# rig 변경 기록');
  const two = addEntry(addEntry('', '## 사이클 1\n- a'), '## 사이클 2\n- b');
  assert.ok(two.indexOf('사이클 2') < two.indexOf('사이클 1'));
});

test('P244 한 번짜리 실행: ANTHROPIC_API_KEY를 뺀 환경, claude -p 인자, JSON 결과·토큰·비용, 실패와 시간 넘김', async () => {
  const env = summaryEnv({ PATH: process.env.PATH, ANTHROPIC_API_KEY: 'x', anthropic_api_key: 'y', CLAUDECODE: '1', ATRIUM_TOKEN: 't', SYSTEMROOT: process.env.SYSTEMROOT || '' });
  assert.ok(!Object.keys(env).some((k) => /anthropic_api_key|^claudecode$|^atrium_/i.test(k)));
  assert.deepEqual(summaryArgs('haiku'), ['-p', '--model', 'haiku', '--tools', '', '--no-session-persistence', '--output-format', 'json']);
  const dir = tmp();
  const fake = path.join(dir, 'fake-claude.mjs');
  fs.writeFileSync(fake, "let s=''; process.stdin.on('data',(d)=>s+=d); process.stdin.on('end',()=>{ const mode=process.env.FAKE_MODE; if(mode==='fail'){ console.error('nope'); process.exit(2); } if(mode==='slow'){ setTimeout(()=>{}, 60000); return; } console.log(JSON.stringify({ type:'result', is_error:false, result: 'key=' + (process.env.ANTHROPIC_API_KEY ? 'yes' : 'no') + ' model=' + process.argv[process.argv.indexOf('--model')+1] + ' len=' + s.length, total_cost_usd: 0.0012, usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 20 } })); });");
  const base = { ...process.env, ['ANTHROPIC' + '_API_KEY']: 'x'.repeat(8) }; // 가짜 값(자식에게 가면 안 된다)
  const ok = await runClaudeOnce('hello', { model: 'haiku', cwd: dir, cmd: [process.execPath, fake], env: summaryEnv(base) });
  assert.equal(ok.ok, true); assert.equal(ok.text, 'key=no model=haiku len=5');
  assert.equal(ok.meta.inputTokens, 15); assert.equal(ok.meta.outputTokens, 20); assert.equal(ok.meta.costUsd, 0.0012);
  const bad = await runClaudeOnce('x', { cwd: dir, cmd: [process.execPath, fake], env: { ...summaryEnv(base), FAKE_MODE: 'fail' } });
  assert.equal(bad.ok, false); assert.match(bad.meta.error, /nope/);
  const slow = await runClaudeOnce('x', { cwd: dir, cmd: [process.execPath, fake], env: { ...summaryEnv(base), FAKE_MODE: 'slow' }, timeoutMs: 500 });
  assert.equal(slow.ok, false); assert.equal(slow.meta.error, 'timeout');
  const none = await runClaudeOnce('x', { cwd: dir, cmd: ['definitely-not-a-claude-exe-p244'] });
  assert.equal(none.ok, false);
});

test('P244 장부 종류·실을 글·안내', async () => {
  assert.deepEqual(RIG3_BEAT_KINDS, ['cycle_open', 'cycle_entry', 'role_tool', 'role_beat']);
  assert.ok(!RIG3_EVENT_KINDS.includes('cycle_open'));
  const B = await board();
  const r3 = B.active().def.rig3;
  const t = loadText(r3, 'data', { purpose: 'p', role: 'r', memory: null });
  assert.match(t, /atrium rig tool <이름>/); assert.match(t, /판이 1m마다 사이클을 열고 너를 깨운다/);
  assert.doesNotMatch(loadText(r3, 'verify', {}), /atrium rig tool|사이클을 열고/);
  assert.match(rig3Guide(r3, 'data'), /네 도구: fetch, watch/);
});

test('P244 역할 칸 beat: 사이클을 열지 않고 그 역할만 깨운다', async () => {
  const B = await board((d) => { delete d.beat; d.roles.verify.beat = { every: '2m' }; });
  const n0 = B.toRole('verify').length;
  const out = await B.BT.tick(B.key, B.active(), B.base + 2 * MIN + 5);
  assert.ok(out.some((x) => x.roleBeat === 'verify'));
  assert.equal(B.BT.current(B.key), 0);
  assert.equal(B.toRole('verify').length, n0 + 1);
  assert.match(B.toRole('verify').at(-1).text, /rig 박자\(verify\)/);
  assert.equal(B.ledger(['role_beat']).length, 1);
});

test('P244 사람이 넣은 입력이 반려되면 그 사이클의 꼭지 "사람이 볼 것"에 항목·누가·까닭이 든다(AI가 빼면 숫자만)', async () => {
  const B = await board();
  await B.BT.beatNow(B.key);
  const x = await B.b.rig3.items.intake(B.key, { item: 'hint', text: '가격이 오를까?' });
  B.b.rig3.items.giveBack(B.key, { role: 'ideas', id: x.item.id, reason: '무엇을 볼지 모호하다' });
  B.BT.runner = async () => ({ ok: true, text: '**돈 것**\n- 입력 하나가 반려됐다', meta: { model: 'haiku' } }); // 사람이 볼 것을 뺀 AI 글
  await B.BT.beatNow(B.key);
  await until(() => B.store.getRig3Cycle(B.key, 1).entryState === 'done');
  const c = B.store.getRig3Cycle(B.key, 1);
  assert.equal(c.entryBy, 'numbers');
  assert.match(c.entry, /\*\*사람이 볼 것\*\*\n- 넣은 입력 \[hint-1\]가 ideas에게 반려됐다: 무엇을 볼지 모호하다/);
  const v = B.b.rig3.view(B.key, B.active().def).cycle;
  assert.match(v.entries[0].text, /hint-1/);
});

test('P244 안내는 put <종류> <파일>만, 항목 없는 pass는 박자에만, 지키기 알림은 "네 턴 동안(돌린 스크립트 포함)"', async () => {
  const { ITEM_HOWTO } = await import('../src/rig3.mjs');
  const { foreignNotice } = await import('../src/rig3-guard.mjs');
  const B = await board();
  const r3 = B.active().def.rig3;
  for (const t of [ITEM_HOWTO.join('\n'), rig3Guide(r3, 'ideas'), loadText(r3, 'ideas', {}), B.b.rig3.items.wakeText(B.key, 'ideas', ['- x'])]) {
    assert.doesNotMatch(t, /--item/); assert.match(t, /put <종류> <파일>/); assert.doesNotMatch(t, /pass \[<항목>\]/);
  }
  assert.match(ITEM_HOWTO.join('\n'), /박자에 낼 것이 없으면 \x60pass "<까닭>"\x60\(박자에만 답하고 받은 것은 닫지 않는다\)/);
  const help = fs.readFileSync(new URL('../bin/atrium-child.mjs', import.meta.url), 'utf8');
  const helpText = help.slice(help.indexOf('rig 3 역할(보드가'), help.indexOf('atrium rig log --events'));
  assert.doesNotMatch(helpText, /--item/); assert.match(helpText, /atrium rig put <종류> <파일>/);
  const contract = fs.readFileSync(new URL('../src/cli-contract.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(contract, /put <파일> --item/);
  // 받은 것이 있어도 항목 없는 pass는 박자 답(turn)만
  B.file('data/s.md', 's'); await B.put('data', 'data/s.md', { kind: 'snapshot' });
  const p = B.b.rig3.items.pass(B.key, { role: 'ideas', reason: '박자에 낼 것 없음' });
  assert.equal(p.turn, true); assert.deepEqual(p.passed, []); assert.equal(B.b.rig3.items.pendingOf(B.key, 'ideas').length, 1);
  assert.deepEqual(B.b.rig3.items.pass(B.key, { role: 'ideas', id: 'snapshot-1', reason: '볼 것 없음' }).passed, ['snapshot-1']);
  // 옛 꼴 put <파일> --item <종류>는 CLI가 받기만 한다
  assert.match(help, /let file = rest\[1\]; let kind = val\('item'\);/);
  assert.match(foreignNotice('ideas', ['data/a.txt'], { owns: ['hypotheses/'] }), /^\[Atrium 보드\] 네 턴 동안\(돌린 스크립트 포함\) 섹터 밖에 쓴 것을 되돌렸다: data\/a\.txt/);
});
