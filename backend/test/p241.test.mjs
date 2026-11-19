// P241: rig 3 1단계. 정의(version 3) 검사, 정의서 칸 검사, v2 정의는 옛 길, 켜기 → 역할마다 세션(무인 인자, 실은 글, 쓰기 범위 설정),
// 섹터 밖 편집 거절, 세션 죽음 → 다시 띄움(상한), 쉬면 재움, 장부.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig, validateRig } from '../src/rig.mjs';
import { SHELL_IN_SHELL_DENY, rulePath } from '../src/rig-writes.mjs';
import { writeSessionSettings } from '../src/launch.mjs';
import { newRuntime, applyHook } from '../src/state.mjs';
import { Backend } from '../src/backend.mjs';
import { RIG_EVENT_KINDS, RIG_ROLE_KINDS, rigEvent, parseKinds } from '../src/rig-ledger.mjs';
import { validateRigDef, checkRoleDoc, normSector, loadText, codexRoleArgs, roleWrites, parseDuration } from '../src/rig-def.mjs';
import { RigRoles, ROLE_SPAWN, ROLE_PERMISSION_MODE, ROLE_NESTED_SHELL_REASON } from '../src/rig-roles.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p241-'));
const DOC = (name, o = {}) => [`# ${name}`, '', '## 맡은 것', o.owns || `${name}의 일`, '', '## 받는 것과 내는 것', '받는 것: 없음', '', '## 기준', '- 기준 하나', '', ...(o.noTips ? [] : ['## 요령', '- 요령 하나'])].join('\n');
const DEF = (o = {}) => ({
  version: 3, name: 'p241',
  purpose: '.atrium/purpose.md',
  beat: { every: '1d', at: '07:00', role: 'data' },
  roles: {
    data: { owns: ['data/', 'snapshots/'], tools: ['fetch'], launcher: 'claude', model: 'haiku' },
    ideas: { owns: ['hypotheses/'] },
    ...(o.roles || {}),
  },
  flows: [
    { item: 'snapshot', from: 'data', to: 'ideas' },
    { item: 'data-request', from: ['ideas', 'human'], to: 'data' },
    { item: 'hint', from: 'human', to: 'ideas' },
    ...(o.flows || []),
  ],
  tools: { fetch: { run: ['node', 'tools/fetch.mjs'], every: '1d' }, ...(o.tools || {}) },
  ...(o.extra || {}),
});
function folder(def = DEF(), { docs = true } = {}) {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.atrium', 'roles'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tools', 'fetch.mjs'), 'console.log(1)\n');
  fs.writeFileSync(path.join(dir, '.atrium', 'purpose.md'), '# 목적\n나스닥 연구 P241-PURPOSE\n');
  if (docs) for (const r of Object.keys(def.roles || {})) fs.writeFileSync(path.join(dir, '.atrium', 'roles', `${r}.md`), DOC(r, { owns: `${r}-OWNS-MARK` }));
  fs.writeFileSync(path.join(dir, '.atrium', 'rig.json'), JSON.stringify(def, null, 2));
  return dir;
}
const v3 = (def, root) => validateRigDef(def, { root });

test('P241 정의 검사: 맞는 정의는 역할·섹터·길·도구를 고른 꼴로, 옛 rig 칸은 없다', () => {
  const dir = folder();
  const v = v3(DEF(), dir);
  assert.equal(v.ok, true, v.reason);
  const d = v.def;
  assert.equal(d.v3, true); assert.equal(d.version, 3);
  assert.deepEqual(Object.keys(d).sort(), ['name', 'rig3', 'v3', 'version', 'warnings'], 'P249: 옛 rig 칸이 없다');
  assert.deepEqual(d.rig3.roles.data.owns, ['data/', 'snapshots/']);
  assert.deepEqual(d.rig3.roles.data.tools, ['fetch']);
  assert.equal(d.rig3.roles.data.model, 'haiku');
  assert.equal(d.rig3.roles.ideas.doc, '.atrium/roles/ideas.md');
  assert.equal(d.rig3.roles.ideas.memory, '.atrium/roles/ideas/memory.md');
  assert.deepEqual(d.rig3.flows[1].from, ['ideas', 'human']);
  assert.equal(d.rig3.tools.fetch.everyMs, 86400000);
  assert.equal(d.rig3.beat.role, 'data'); assert.equal(d.rig3.beat.at, '07:00');
  assert.deepEqual(d.rig3.tune, { after: 3, every: 5, lines: 20 });
  // rig.mjs validateRig가 v3을 rig3.mjs로 넘긴다
  const w = validateRig(DEF(), { root: dir });
  assert.equal(w.ok, true, w.reason); assert.equal(w.def.v3, true);
});

test('P241 정의 검사: 섹터 겹침, 없는 역할, human 받는 쪽, 없는 도구, 두 역할의 도구, 옛 rig 칸, .atrium 섹터', () => {
  const dir = folder();
  const no = (def, re) => { const v = v3(def, dir); assert.equal(v.ok, false, JSON.stringify(def)); assert.match(v.reason, re); };
  no(DEF({ roles: { ideas: { owns: ['data/raw/'] } } }), /섹터가 겹친다: data의 data\/와 ideas의 data\/raw\//);
  no(DEF({ roles: { ideas: { owns: ['./Data'] } } }), /섹터가 겹친다/); // 대소문자·./ 무시
  no(DEF({ flows: [{ item: 'x', from: 'data', to: 'verify' }] }), /flows\[3\]\.to에 없는 역할이 있다: verify/);
  no(DEF({ flows: [{ item: 'x', from: 'ghost', to: 'data' }] }), /flows\[3\]\.from에 없는 역할이 있다: ghost/);
  no(DEF({ flows: [{ item: 'x', from: 'data', to: 'human' }] }), /human은 입력 창구/);
  no(DEF({ roles: { ideas: { owns: ['h/'], tools: ['broker'] } } }), /roles\.ideas\.tools에 없는 도구가 있다: "broker"/);
  no(DEF({ roles: { ideas: { owns: ['h/'], tools: ['fetch'] } } }), /도구 fetch를 data와 ideas 둘이 가졌다/);
  no(DEF({ extra: { seats: {} } }), /옛 rig 칸이 있다: seats/);
  no(DEF({ extra: { loops: {} } }), /옛 rig 칸이 있다: loops/);
  no(DEF({ roles: { ideas: { owns: ['.atrium/x/'] } } }), /\.atrium\/를 넣지 않는다/);
  no(DEF({ roles: { ideas: { owns: ['../up/'] } } }), /상대 폴더/);
  no(DEF({ roles: { ideas: { owns: [] } } }), /owns는 역할이 쥔 폴더 하나 이상/);
  no(DEF({ roles: { human: { owns: ['x/'] } } }), /human은 입력 창구 이름/);
  no(DEF({ flows: [{ item: 'x', from: 'data', to: 'ideas', for: 'nothing' }] }), /for는 이 정의의 다른 길이 나르는 항목 종류/);
  no(DEF({ extra: { beat: { every: 'often' } } }), /beat\.every/);
  no(DEF({ extra: { beat: { every: '1d', role: 'trade' } } }), /beat\.role이 없는 역할/);
  no({ ...DEF(), purpose: '.atrium/none.md' }, /목적 문서가 없다/);
  // for는 다른 길의 항목이면 된다(2단계가 쓴다)
  const ok = v3(DEF({ flows: [{ item: 'result', from: 'ideas', to: 'data', for: 'snapshot' }] }), dir);
  assert.equal(ok.ok, true, ok.reason); assert.equal(ok.def.rig3.flows[3].for, 'snapshot');
  assert.equal(normSector('a\\b'), 'a/b/'); assert.equal(normSector('/abs'), null); assert.equal(normSector('C:/x'), null);
  assert.equal(parseDuration('30m'), 1800000); assert.equal(parseDuration('x'), null);
});

test('P241 정의서: 네 칸(맡은 것, 받는 것과 내는 것, 기준, 요령)이 빠지면 오류, 파일이 없어도 오류', () => {
  assert.deepEqual(checkRoleDoc(DOC('a')).missing, []);
  const c = checkRoleDoc(DOC('a', { noTips: true }));
  assert.deepEqual(c.missing, ['요령']);
  assert.equal(checkRoleDoc('## 맡은 것\nx\n## 받는 것과 내는 것\ny\n## 기준 (고정)\nz\n## 요령(조정 칸)\n- w').ok, true);
  const dir = folder();
  fs.writeFileSync(path.join(dir, '.atrium', 'roles', 'ideas.md'), DOC('ideas', { noTips: true }));
  const v = v3(DEF(), dir);
  assert.equal(v.ok, false); assert.match(v.reason, /역할 ideas의 정의서\(\.atrium\/roles\/ideas\.md\)에 칸이 빠졌다: ## 요령/);
  fs.rmSync(path.join(dir, '.atrium', 'roles', 'ideas.md'));
  const w = v3(DEF(), dir);
  assert.equal(w.ok, false); assert.match(w.reason, /역할 ideas의 정의서가 없다/);
});

test('P241·P249 옛 꼴 정의(version 2 이하, version 없음)는 한 줄 오류, version 3에 옛 칸이 있어도 오류', () => {
  for (const [raw, shown] of [[{ version: 2, seats: { main: { launcher: 'claude', session: 'keep' } } }, '2'], [{ version: 1 }, '1'], [{}, '없음'], [{ seats: {} }, '없음']]) {
    const v = validateRig(raw, {});
    assert.equal(v.ok, false);
    assert.ok(v.reason.startsWith(`옛 rig 정의(version ${shown})는 더 읽지 않는다`), v.reason);
    assert.ok(!/\n/.test(v.reason), '한 줄');
  }
  const bad = validateRig({ version: 3, seats: {} }, {});
  assert.equal(bad.ok, false); assert.match(bad.reason, /옛 rig 칸이 있다: seats/);
});

test('P241 실을 글: 목적·정의서·기억, 쓰는 곳, 받는 것·내는 것. Codex 인자는 무인과 섹터', () => {
  const d = v3(DEF(), folder()).def.rig3;
  const t = loadText(d, 'ideas', { purpose: 'PURPOSE-X', role: 'DOC-X', memory: null }, { root: 'C:\\w' });
  assert.match(t, /^\[Atrium 보드\] 너는 rig 역할 ideas이다/);
  assert.match(t, /쓰는 곳: hypotheses\/, 기억 \.atrium\/roles\/ideas\/\./);
  assert.match(t, /받는 것: snapshot\(data에게서\), hint\(human에게서\)\. 내는 것: data-request\(data에게\)/);
  assert.match(t, /## 목적 \(\.atrium\/purpose\.md\)\nPURPOSE-X/);
  assert.match(t, /## 정의서 \(\.atrium\/roles\/ideas\.md\)\nDOC-X/);
  assert.match(t, /## 기억 \(\.atrium\/roles\/ideas\/memory\.md\)\n\(아직 없다\)/);
  const long = loadText(d, 'ideas', { purpose: 'p'.repeat(7000), role: 'r', memory: 'm' });
  assert.match(long, /…\(잘림: 전체는 \.atrium\/purpose\.md\)/);
  assert.match(loadText(d, 'data', {}, { why: 'respawn' }), /세션이 끝나 판이 새로 띄웠다/);
  assert.deepEqual(roleWrites(d.roles.data), ['data/', 'snapshots/', '.atrium/roles/data/']);
  const root = path.resolve('/r3root');
  const a = codexRoleArgs(['--model', 'm', '-C', 'old', '--add-dir=x', '--sandbox', 'workspace-write', '--ask-for-approval', 'never'], root, d.roles.data);
  assert.deepEqual(a, ['--model', 'm', '--sandbox', 'workspace-write', '--ask-for-approval', 'never', '-C', path.resolve(root, 'data/'), '--add-dir', path.resolve(root, 'snapshots/'), '--add-dir', path.resolve(root, '.atrium/roles/data/')]);
});

test('P241 장부: rig 역할 종류는 따로 둔 목록', () => {
  assert.deepEqual(RIG_ROLE_KINDS.slice(0, 5), ['role_spawn', 'role_respawn', 'role_gave_up', 'role_write_denied', 'role_slept']); // P242가 item_* 종류를 뒤에 더했다
  for (const k of RIG_ROLE_KINDS) assert.ok(!RIG_EVENT_KINDS.includes(k), k);
  assert.deepEqual(parseKinds('role_spawn,rig_version'), ['role_spawn', 'rig_version']);
  assert.throws(() => parseKinds('role_nope'), /모르는 kind/);
});

// ---------- 판(가짜 spawn·kill·sleeper, 진짜 Store·Rig·설정 파일) ----------
async function board(def = DEF(), cfg = {}) {
  const dir = folder(def);
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const casts = []; const logs = []; const sent = []; const spawned = []; const killed = [];
  const b = { cfg: { hookTimeoutSec: 2, sessionsDir: path.join(dir, 'sessions'), dataDir: path.join(dir, 'data'), rig3DeadGraceMs: 0, ...cfg }, store, sessions: new Map(), log: (...a) => logs.push(a.join(' ')), api: { broadcast: (n, d) => casts.push({ n, d }) } };
  b.rig = new Rig(b); b.rig3 = new RigRoles(b);
  b.queue = { enqueue: (sessionId, text, opts) => { sent.push({ sessionId, text, opts }); return { deliveryId: 'd' + sent.length }; } };
  let n = 0;
  // backend.spawn이 하는 것만 흉내: rig3.launchOf → 권한 모드·설정 파일, 세션에 역할
  b.spawn = async (p) => {
    const role = p[ROLE_SPAWN]; const kind = p.kind || 'claude';
    const L = b.rig3.launchOf(ws.key, role, { kind, cwd: p.cwd });
    const sessionId = `sid-${p.name}-${++n}`;
    const s = { sessionId, name: p.name, kind, cwd: p.cwd, workspaceKey: ws.key, hookToken: `tok-${n}`, permissionMode: L.permissionMode, model: p.model || null, rt: newRuntime({ kind, hooked: true }), rigRole: L.role };
    s.rt.cwd = p.cwd;
    s.settingsPath = writeSessionSettings({ file: path.join(dir, 'sessions', `${sessionId}.json`), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: s.hookToken, sessionId, amp: L.amp });
    b.sessions.set(sessionId, s);
    spawned.push({ p, L, s });
    return { sessionId, name: p.name };
  };
  b.kill = async (p) => { killed.push(p); const s = b.sessions.get(p.session); if (s) { s.closedAt = Date.now(); b.sessions.delete(p.session); } return { ok: true }; };
  const slept = [];
  b.sleeper = {
    isAsleep: (s) => !!s.rt.sleep,
    info: (s) => ({ name: s.name, kind: 'claude', hooked: true, convKnown: true, state: 'ready', sleeping: !!s.rt.sleep, waking: false, closing: false, draft: false, delivering: 0, loops: 0, bg: false, blocked: null, childBusy: false, parentBusy: false, viewed: false }),
    sleep: async (s, o) => { slept.push([s.name, o]); s.rt.sleep = { at: Date.now(), by: o.by, scope: o.scope }; return { slept: true }; },
  };
  const ledger = (kinds = null) => store.rigEvents({ ws: ws.key, limit: 1000, ...(kinds ? { kinds } : {}) });
  const roleSessions = () => [...b.sessions.values()].filter((s) => s.rigRole);
  const until = async (fn, ms = 2000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 10)); } };
  return { dir, store, ws, b, sent, spawned, killed, slept, logs, casts, ledger, roleSessions, until };
}
const settingsOf = (s) => JSON.parse(fs.readFileSync(s.settingsPath, 'utf8'));
const pre = (s, tool_name, tool_input) => ({ hook_event_name: 'PreToolUse', session_id: s.sessionId, tool_name, tool_input, tool_use_id: 'tu' + Math.random() });

test('P241 켜기 → 역할마다 세션 하나(무인, 실은 글, 쓰기 범위 설정 파일), 장부 role_spawn, 다시 켜도 그대로', async () => {
  const B = await board();
  const st = B.b.rig.setEnabled(B.ws.key, true, 'human');
  assert.equal(st.state, 'on'); assert.equal(st.format, 3);
  await B.until(() => B.roleSessions().length === 2 && B.sent.length === 2);
  const [data, ideas] = ['data', 'ideas'].map((r) => B.roleSessions().find((s) => s.rigRole === r));
  assert.equal(data.name, 'data'); assert.equal(ideas.name, 'ideas');
  const pd = B.spawned.find((x) => x.s === data).p;
  assert.equal(path.resolve(pd.cwd), path.resolve(B.dir)); assert.equal(pd.kind, 'claude'); assert.equal(pd.model, 'haiku');
  assert.equal(data.permissionMode, ROLE_PERMISSION_MODE); assert.equal(ROLE_PERMISSION_MODE, 'bypassPermissions');
  // 설정 파일: 셸 안의 셸 거절, 정의 파일 거절, PreToolUse를 판이 기다려 답함, auto mode 끔(bypass는 끄지 않음)
  const j = settingsOf(data);
  for (const r of SHELL_IN_SHELL_DENY) assert.ok(j.permissions.deny.includes(r), r);
  assert.ok(j.permissions.deny.includes(`Edit(${rulePath(path.join(B.dir, '.atrium', 'rig.json'))})`));
  assert.ok(j.permissions.deny.includes(`Edit(${rulePath(path.join(B.dir, '.atrium', 'roles', 'data.md'))})`));
  assert.equal(j.permissions.disableAutoMode, 'disable'); assert.equal(j.permissions.disableBypassPermissionsMode, undefined);
  assert.ok(j.hooks.PreToolUse[0].hooks[0].timeout >= 10);
  // 실은 글: 판 알림(board), 목적·정의서 글
  const t = B.sent.find((x) => x.sessionId === ideas.sessionId);
  assert.equal(t.opts.origin.kind, 'board');
  assert.match(t.text, /P241-PURPOSE/); assert.match(t.text, /ideas-OWNS-MARK/); assert.match(t.text, /쓰는 곳: hypotheses\//);
  // 섹터와 기억 폴더를 만들었다
  for (const p of ['data', 'snapshots', 'hypotheses', '.atrium/roles/data', '.atrium/roles/ideas']) assert.ok(fs.statSync(path.join(B.dir, p)).isDirectory(), p);
  const rows = B.ledger(['role_spawn']);
  assert.deepEqual(rows.map((r) => r.seat).sort(), ['data', 'ideas']);
  assert.equal(rows[0].actor, 'board');
  assert.ok(rows.find((r) => r.seat === 'data').data.writes.includes('.atrium/roles/data/'));
  // 상태 보기
  const v = B.b.rig.status(B.ws.key).rig3;
  assert.deepEqual(v.roles.map((r) => [r.name, r.session && r.session.name]), [['data', 'data'], ['ideas', 'ideas']]);
  assert.deepEqual(v.roles[1].gets, ['snapshot', 'hint']); assert.deepEqual(v.roles[1].puts, ['data-request']);
  // 다시 켜도 새로 띄우지 않는다
  const again = await B.b.rig3.onEnabled(B.ws.key, true);
  assert.ok(again.every((x) => x.kept)); assert.equal(B.spawned.length, 2);
});

test('P241 쓰기 범위: 섹터 밖 편집은 묻지 않고 거절(장부 role_write_denied), 자기 섹터·기억은 통과, Bash 안의 셸 거절', async () => {
  const B = await board();
  B.b.store.setRigEnabled(B.ws.key, true);
  await B.b.rig3.onEnabled(B.ws.key, true);
  const ideas = B.roleSessions().find((s) => s.rigRole === 'ideas');
  const deny = (out) => out && out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision === 'deny' ? out.hookSpecificOutput.permissionDecisionReason : null;
  const ask = (tool, input) => B.b.rig3.answer(ideas, 'PreToolUse', pre(ideas, tool, input));
  assert.match(deny(await ask('Write', { file_path: path.join(B.dir, 'data', 'x.csv'), content: 'x' })), /역할 ideas의 쓰기 범위 밖이다: .*data.x\.csv\. 쓸 수 있는 곳: hypotheses\/, \.atrium\/roles\/ideas\//);
  assert.ok(deny(await ask('Edit', { file_path: path.join(B.dir, '.atrium', 'roles', 'ideas.md'), old_string: 'a', new_string: 'b' })), '자기 정의서도 고치지 못한다');
  assert.ok(deny(await ask('Write', { file_path: path.join(B.dir, 'README.md'), content: 'x' })));
  assert.equal(await ask('Write', { file_path: path.join(B.dir, 'hypotheses', 'h1.md'), content: 'x' }), null);
  assert.equal(await ask('Write', { file_path: path.join(B.dir, '.atrium', 'roles', 'ideas', 'memory.md'), content: 'x' }), null);
  assert.equal(await ask('Read', { file_path: path.join(B.dir, 'data', 'x.csv') }), null, '읽기는 막지 않는다');
  assert.equal(deny(await ask('Bash', { command: 'powershell -Command "Set-Content x y"' })), ROLE_NESTED_SHELL_REASON);
  assert.equal(await ask('Bash', { command: 'ls data' }), null, '셸 명령의 쓰기는 막지 못한다(P241 조사)');
  const rows = B.ledger(['role_write_denied']);
  assert.deepEqual(rows.map((r) => r.value), ['writes', 'writes', 'writes', 'nested_shell']);
  assert.ok(rows.every((r) => r.seat === 'ideas' && r.session === ideas.sessionId));
  // 판의 hook 받기: 역할 세션의 PreToolUse를 기다려 답한다
  const fake = { sessions: B.b.sessions, rig3: B.b.rig3 };
  const body = pre(ideas, 'Write', { file_path: path.join(B.dir, 'data', 'y'), content: '' });
  assert.ok(Backend.prototype.ampTarget.call(fake, { authorization: `Bearer ${ideas.hookToken}`, 'x-mt-session': ideas.sessionId }, JSON.stringify(body)));
  assert.equal(Backend.prototype.ampTarget.call(fake, { authorization: 'Bearer nope', 'x-mt-session': ideas.sessionId }, JSON.stringify(body)), null);
  // 끈 뒤에도 떠 있는 역할 세션의 쓰기 범위는 지킨다(무인 세션이 풀리지 않게)
  B.b.store.setRigEnabled(B.ws.key, false);
  assert.ok(deny(await ask('Write', { file_path: path.join(B.dir, 'data', 'z'), content: '' })));
});

test('P241 설정 파일 맞추기: rig 3이 역할의 거절 규칙을 되살린다(rig 2 맞추기는 역할 세션에 쓰지 않는다)', async () => {
  const B = await board();
  B.b.store.setRigEnabled(B.ws.key, true);
  await B.b.rig3.onEnabled(B.ws.key, true);
  const data = B.roleSessions().find((s) => s.rigRole === 'data');
  const j = settingsOf(data); delete j.permissions.deny; fs.writeFileSync(data.settingsPath, JSON.stringify(j));
  assert.equal(B.b.rig3.syncSettings(data), true);
  assert.ok(settingsOf(data).permissions.deny.includes(SHELL_IN_SHELL_DENY[0]));
  assert.equal(B.b.rig3.syncSettings(data), false, '같은 값이면 다시 쓰지 않는다');
  const src = fs.readFileSync(new URL('../src/backend.mjs', import.meta.url), 'utf8');
  assert.match(src, /\(ev === 'UserPromptSubmit' \|\| ev === 'Stop'\) && s\.rigRole && this\.rig3\) this\.rig3\.syncSettings\(s\);/);
});

test('P241 세션 죽음: 닫히면·끝나면 같은 글을 실어 다시 띄운다(role_respawn), 상한을 넘으면 그만둔다(role_gave_up)', async () => {
  const B = await board(DEF(), { rig3RespawnMax: 2 });
  B.b.store.setRigEnabled(B.ws.key, true);
  await B.b.rig3.onEnabled(B.ws.key, true);
  const ideas0 = B.roleSessions().find((s) => s.rigRole === 'ideas');
  // 닫힘
  B.b.sessions.delete(ideas0.sessionId);
  let out = await B.b.rig3.tick();
  assert.deepEqual(out.map((x) => [x.role, x.spawned, x.why]), [['ideas', 'ideas', 'closed']]);
  const ideas1 = B.roleSessions().find((s) => s.rigRole === 'ideas');
  assert.notEqual(ideas1.sessionId, ideas0.sessionId);
  assert.match(B.sent.at(-1).text, /세션이 끝나 판이 새로 띄웠다/);
  let rows = B.ledger(['role_respawn']);
  assert.equal(rows.length, 1); assert.equal(rows[0].data.prev.sessionId, ideas0.sessionId); assert.equal(rows[0].data.prev.why, 'closed');
  // 끝남(exited): 끝난 세션을 닫고 다시 띄운다
  ideas1.rt.exit = { kind: 'crash', at: Date.now() };
  out = await B.b.rig3.tick();
  assert.equal(out[0].why, 'exited');
  assert.deepEqual(B.killed.map((k) => k.session), [ideas1.sessionId]);
  rows = B.ledger(['role_respawn']);
  assert.equal(rows.length, 2); assert.equal(rows[1].data.prev.exit, 'crash');
  // 상한(2번): 세 번째는 그만둔다
  const ideas2 = B.roleSessions().find((s) => s.rigRole === 'ideas');
  B.b.sessions.delete(ideas2.sessionId);
  out = await B.b.rig3.tick();
  assert.deepEqual(out, [{ ws: B.ws.key, role: 'ideas', gaveUp: true }]);
  assert.equal(B.ledger(['role_gave_up']).length, 1);
  assert.equal((await B.b.rig3.tick()).length, 0, '그만둔 뒤에는 다시 띄우지 않는다');
  assert.equal(B.b.rig.status(B.ws.key).rig3.roles.find((r) => r.name === 'ideas').gaveUp, true);
  // 다시 켜면 풀린다
  B.b.rig.setEnabled(B.ws.key, false, 'human');
  B.b.rig.setEnabled(B.ws.key, true, 'human');
  await B.until(() => B.roleSessions().filter((s) => s.rigRole === 'ideas').length === 1);
  // 꺼진 rig는 지키지 않는다
  B.b.store.setRigEnabled(B.ws.key, false);
  for (const s of B.roleSessions()) B.b.sessions.delete(s.sessionId);
  assert.deepEqual(await B.b.rig3.tick(), []);
});

test('P241 쉬면 판이 재운다(role_slept), 일하는 중·잠든 세션은 그대로', async () => {
  const B = await board(DEF(), { rig3IdleMs: 60000 });
  B.b.store.setRigEnabled(B.ws.key, true);
  await B.b.rig3.onEnabled(B.ws.key, true);
  const data = B.roleSessions().find((s) => s.rigRole === 'data');
  const ideas = B.roleSessions().find((s) => s.rigRole === 'ideas');
  for (const s of [data, ideas]) { applyHook(s.rt, { hook_event_name: 'Stop', session_id: s.sessionId, last_assistant_message: '준비됨' }); s.rt.phase = 'running'; s.rt.term.present = true; s.rt.term.status = 'idle'; }
  ideas.rt.term.status = 'working'; // 일하는 중
  assert.deepEqual(await B.b.rig3.tick(), [], '쉰 지 1분이 안 됐다');
  const out = await B.b.rig3.tick(Date.now() + 5 * 60000);
  assert.deepEqual(out.map((x) => [x.role, x.slept]), [['data', 'data']]);
  assert.deepEqual(B.slept.map((x) => [x[0], x[1].scope, x[1].by]), [['data', 'session', 'rig']]);
  assert.equal(B.ledger(['role_slept']).length, 1);
  assert.deepEqual(await B.b.rig3.tick(Date.now() + 10 * 60000), [], '잠든 세션은 살아 있는 것으로 본다(다시 띄우지 않는다)');
});
