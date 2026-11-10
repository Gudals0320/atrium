// P8 단위 시험: 가지 펼치기(ARCH 4절 K). 깊이·자손 계산, 상한, 이름, 나무 자리, 승인 규칙과 env, 세션 토큰, 물려받기, 자손만 끄기,
// board.db 옮기기(P7 모양), 플러그인(스킬, atrium 명령과 별칭 mtask), 하위 세션 명령(bin/atrium-child.mjs, 별칭 bin/mtask-child.mjs)이 env의 판으로만 가는지. herdr와 claude 없이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.mjs';
import { newRuntime } from '../src/state.mjs';
import { writeSessionSettings, writeBoardPlugin, buildStartArgs, buildResumeArgv, BOARD_SYSTEM_PROMPT, HERDR_ALLOW } from '../src/launch.mjs';
import { normalizePatch, Settings } from '../src/settings.mjs';
import * as branchMod from '../src/branch.mjs';
import { Branch, BRANCH_ALLOW, depthOf, isDescendant, descendantsOf, childName, childNotice, boardSkill, childShims, CHILD_NAME_RE } from '../src/branch.mjs';
import { SIZE_STEPS, overlaps, GAP } from '../src/canvas.mjs';
import { workspaceOf } from '../src/git.mjs';
import { lineSlot, LINE_GAP_X, LINE_GAP_Y } from '../src/tree-line.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p8-'));

// ---------- 나무 계산 ----------
test('K3: 깊이는 사람이 띄운 세션이 1단계, 닫힌 중간 세션도 따라가고 고리는 끊는다. 자손과 끄는 순서(깊은 것부터)', () => {
  const rows = new Map([['a', { parentSessionId: null }], ['b', { parentSessionId: 'a' }], ['c', { parentSessionId: 'b' }], ['d', { parentSessionId: 'c' }], ['x', { parentSessionId: 'y' }], ['y', { parentSessionId: 'x' }]]);
  const rowOf = (id) => rows.get(id) || null;
  assert.equal(depthOf('a', rowOf), 1);
  assert.equal(depthOf('c', rowOf), 3);
  assert.equal(depthOf('d', rowOf), 4);
  assert.ok(depthOf('x', rowOf) <= 3); // 고리에서 멈춘다
  assert.equal(depthOf('nope', rowOf), 1);
  assert.equal(isDescendant('c', 'a', rowOf), true);
  assert.equal(isDescendant('a', 'c', rowOf), false);
  assert.equal(isDescendant('a', 'a', rowOf), false);
  assert.equal(isDescendant('x', 'q', rowOf), false);
  const list = [...rows].map(([sessionId, r]) => ({ sessionId, ...r }));
  assert.deepEqual(descendantsOf('a', list).map((x) => x.sessionId), ['d', 'c', 'b']);
  assert.deepEqual(descendantsOf('c', list).map((x) => x.sessionId), ['d']);
});

test('K3(P36): 상한 검사는 없다(checkLimits가 없다)', () => {
  assert.equal(branchMod.checkLimits, undefined);
});

test('K1: 하위 세션 이름 — 주면 herdr 이름 규칙대로, 없으면 <부모>-w<n>', () => {
  assert.equal(childName({ want: 'w1', parentName: 'lead', taken: new Set() }), 'w1');
  assert.throws(() => childName({ want: 'W1', parentName: 'lead', taken: new Set() }), /소문자/);
  assert.throws(() => childName({ want: '1w', parentName: 'lead', taken: new Set() }), /소문자/);
  assert.throws(() => childName({ want: 'w1', parentName: 'lead', taken: new Set(['w1']) }), (e) => e.code === 'name_taken');
  assert.equal(childName({ parentName: 'lead', taken: new Set(['lead-w1']) }), 'lead-w2');
  assert.equal(childName({ parentName: 'S1', taken: new Set() }), 's1-w1');
  assert.equal(childName({ parentName: '9x', taken: new Set() }), 'w1');
  const long = childName({ parentName: 'a'.repeat(32), taken: new Set() });
  assert.ok(CHILD_NAME_RE.test(long) && long.length <= 32);
});

test('K4(P75): 나무 자리 — 부모 오른쪽 한 열, 형제는 앞 형제(의 띠) 아래, 막히면 열을 바꾸지 않고 그 아래로 잇는다', () => {
  const size = SIZE_STEPS.small;
  const parent = { x: 0, y: 0, w: 720, h: 460 };
  const a = lineSlot({ parent, bands: [], size, obstacles: [parent] });
  assert.deepEqual([a.x, a.y], [720 + LINE_GAP_X, 0]);
  const ra = { ...a, ...size };
  const b = lineSlot({ parent, bands: [ra], size, obstacles: [parent, ra] });
  assert.deepEqual([b.x, b.y], [a.x, a.y + size.h + LINE_GAP_Y]);
  // 앞 형제의 띠(손자까지)가 길면 그 아래
  const band = { x: a.x, y: 0, w: 3000, h: 2000 };
  assert.equal(lineSlot({ parent, bands: [band], size }).y, 2000 + LINE_GAP_Y);
  // 열이 다른 노드로 막혀 있으면 같은 열에서 그 아래로(다음 열로 가지 않는다)
  const wall = { x: 840, y: -100, w: 480, h: 3000 };
  const d = lineSlot({ parent, bands: [], size, obstacles: [parent, wall] });
  assert.equal(d.x, 720 + LINE_GAP_X); assert.equal(d.y, wall.y + wall.h + LINE_GAP_Y);
  assert.equal(lineSlot({ parent: null, size }), null);
});

// ---------- 승인 규칙과 env ----------
// Claude Code 규칙의 대략적인 맞춤(시험용): Tool(prefix:*)는 prefix로 시작, Tool(a b *)는 a b 뒤 아무것, Tool(x)는 같음
function allowed(rules, tool, cmd) {
  return rules.some((r) => {
    const m = /^(\w+)\((.*)\)$/.exec(r); if (!m || m[1] !== tool) return false;
    const p = m[2];
    if (p.endsWith(':*')) return cmd === p.slice(0, -2) || cmd.startsWith(p.slice(0, -2) + ' ') || cmd.startsWith(p.slice(0, -2));
    if (p.endsWith(' *')) return cmd.startsWith(p.slice(0, -1));
    if (p.endsWith('*')) return cmd.startsWith(p.slice(0, -1));
    return cmd === p;
  });
}
test('K2: 승인 규칙 — 하위 세션 명령과 herdr 일 시키기·기다리기·답 읽기만. 다른 atrium·herdr 명령과 다른 판 호출은 묻는다', () => {
  for (const c of ['atrium child w1', 'atrium child w1 --prompt "x"', 'atrium children', 'atrium children --all', 'atrium child-kill w1', 'mtask child w1', 'mtask child w1 --prompt "x"', 'mtask children', 'mtask children --all', 'mtask child-kill w1', 'herdr agent prompt w1 "do it" --wait --timeout 600000', 'herdr agent wait w1 --timeout 600000', 'herdr agent read w1 --source recent-unwrapped --lines 80']) {
    assert.ok(allowed(BRANCH_ALLOW, 'Bash', c), `허용해야 한다: ${c}`);
  }
  for (const c of ['atrium kill w1', 'atrium settings set tray on', 'mtask kill w1', 'mtask settings set tray on', 'mtask call session.kill', 'node mtask.mjs kill w1', 'herdr pane split --current', 'herdr agent start x', 'herdr agent send-keys w1 enter', 'herdr --session other agent prompt w1 "x"', 'herdr server stop', 'mtaskchild']) {
    assert.ok(!allowed(BRANCH_ALLOW, 'Bash', c), `묻어야 한다: ${c}`);
  }
  assert.ok(allowed(BRANCH_ALLOW, 'PowerShell', 'mtask child w1'));
  assert.ok(allowed(BRANCH_ALLOW, 'PowerShell', 'atrium child w1'));
  assert.ok(!BRANCH_ALLOW.some((r) => /herdr:\*|herdr \*\)/.test(r)), 'herdr 전체 허용(P4 allowHerdr)은 넣지 않는다');
});

test('K1·K2: 세션 설정 파일에 env(판, 세션 ID, 세션 토큰)와 규칙이 들어가고 hook·allowHerdr는 그대로', () => {
  const d = tmp();
  const f = path.join(d, 's.json');
  writeSessionSettings({ file: f, hookUrl: 'http://127.0.0.1:47820/hooks/claude', token: 'h', sessionId: 'sid', env: { ATRIUM_PORT: '47820', ATRIUM_SESSION_ID: 'sid', ATRIUM_SESSION_TOKEN: 't' }, allow: BRANCH_ALLOW });
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(j.env.ATRIUM_PORT, '47820'); assert.equal(j.env.ATRIUM_SESSION_ID, 'sid');
  assert.deepEqual(j.permissions.allow, BRANCH_ALLOW);
  assert.ok(j.hooks.Stop);
  assert.ok(!Object.keys(j.env).some((k) => /ANTHROPIC|CLAUDE/.test(k)));
  const g = path.join(d, 'g.json');
  writeSessionSettings({ file: g, hookUrl: 'x', token: 'h', sessionId: 'sid', allowHerdr: true, allow: BRANCH_ALLOW });
  const k = JSON.parse(fs.readFileSync(g, 'utf8')).permissions.allow;
  assert.deepEqual(k.slice(0, HERDR_ALLOW.length), HERDR_ALLOW);
  assert.equal(new Set(k).size, k.length);
});

test('K1: 워크트리는 처음 띄울 때만 claude -w로 넘기고 이어 가기 명령에는 넣지 않는다. 하위 세션은 새 세션 ID로(갈라 열기 없음)', () => {
  const a = buildStartArgs({ sessionId: 'id1', settingsPath: 's.json', permissionMode: 'manual', model: 'haiku', worktree: 'feat-a' });
  assert.deepEqual(a.slice(0, 4), ['--session-id', 'id1', '--worktree', 'feat-a']);
  const r = buildResumeArgv({ sessionId: 'id1', settingsPath: 's.json', permissionMode: 'manual', worktree: 'feat-a' });
  assert.ok(!r.includes('--worktree') && !r.includes('--fork-session'));
  assert.ok(!buildStartArgs({ sessionId: 'id2', settingsPath: 's', permissionMode: 'manual' }).includes('--worktree'));
});

test('K2(P36): 플러그인에 atrium 스킬과 옛 이름 delegate(같은 글), atrium 명령(sh, cmd, 별칭 mtask)이 생기고 짧은 안내에 한 줄', () => {
  const d = tmp();
  const extra = new Branch({ store: { branchRows: () => [] }, bus: new EventEmitter() }).pluginExtra();
  const pl = writeBoardPlugin({ dir: d, skillText: '---\nname: herdr\n---\n', skills: extra.skills, bin: childShims({ node: 'C:\\node\\node.exe', script: 'C:\\m\\bin\\atrium-child.mjs' }) });
  const root = path.join(d, 'atrium-herdr');
  const skill = fs.readFileSync(path.join(root, 'skills', 'atrium', 'SKILL.md'), 'utf8');
  const old = fs.readFileSync(path.join(root, 'skills', 'delegate', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: atrium\n/); assert.match(old, /^---\nname: delegate\n/);
  assert.equal(skill.split('\n---\n')[1], old.split('\n---\n')[1]); // 몸글이 같다(돌던 세션이 옛 이름을 불러도 새 글)
  assert.ok(!skill.includes('mtask') && !skill.includes('multitask'));
  for (const w of ['atrium child', '--worktree', '--prompt', '--model', '--effort', 'herdr agent wait', 'herdr agent prompt', 'herdr agent read', 'atrium child-kill', 'atrium child-wait', 'needs_trust', 'needs_commit', '보드에서 @wt1 카드의 신뢰 질문에 답해 주세요.', 'git worktree add', '--session', '상한은 없다', '사용자가 말하지 않아도', '완료 기준']) assert.ok(skill.includes(w), w);
  for (const w of ['상한(', '개, 깊이', '판 밖 터미널을 열라고 한다']) assert.ok(!skill.includes(w), w);
  // 길이: P8 delegate 글(3107바이트)의 두 배를 넘지 않는다. P111: 잠든 워커 줄에 혼자 잠들기와 깨우기 범위(+77바이트)를 더해 80바이트를 더 둔다
  assert.ok(Buffer.byteLength(skill) <= 2 * 3107 + 80, `skill ${Buffer.byteLength(skill)}B`);
  assert.match(skill.split('\n')[2], /사용자가 말하지 않아도/); // 설명에 스스로 쓰는 때
  assert.equal(boardSkill('delegate'), old);
  for (const c of ['atrium', 'mtask']) { // 옛 이름 mtask는 P18 전에 띄운 세션의 스킬 글이 말한다
    const sh = fs.readFileSync(path.join(root, 'bin', c), 'utf8');
    assert.match(sh, /^#!\/bin\/sh\n/); assert.match(sh, /exec "C:\/node\/node.exe" "C:\/m\/bin\/atrium-child.mjs" "\$@"/);
    assert.match(fs.readFileSync(path.join(root, 'bin', `${c}.cmd`), 'utf8'), /"C:\\node\\node.exe" "C:\\m\\bin\\atrium-child.mjs" %\*/);
  }
  assert.match(BOARD_SYSTEM_PROMPT, /atrium-herdr:atrium/); assert.match(BOARD_SYSTEM_PROMPT, /delegate/); assert.match(BOARD_SYSTEM_PROMPT, /상한은 없다/);
  assert.ok(BRANCH_ALLOW.includes('Bash(atrium child-wait *)') && BRANCH_ALLOW.includes('PowerShell(atrium child-wait *)'));
  assert.equal(BOARD_SYSTEM_PROMPT.split('\n').length, 7); // P21: 잠든 세션 깨우기 한 줄, P81: atrium me 한 줄
  assert.ok(pl.pluginDir.endsWith('atrium-herdr'));
  assert.match(childNotice({ role: '워커', agentName: 'w1', paneId: 'w2:p1', depth: 2 }), /herdr agent prompt w1/);
});

test('K3(P36): 상한 설정이 없다. 판 기록에 남은 옛 키는 오류 없이 무시한다', () => {
  for (const k of ['branchMaxChildren', 'branchMaxDepth', 'branchMaxTotal']) assert.throws(() => normalizePatch({ [k]: 2 }), /알 수 없는 설정/);
  const d = tmp(); const store = new Store(path.join(d, 'b.db'));
  store.setMeta('settings', { branchMaxChildren: 4, branchMaxDepth: 3, branchMaxTotal: 2, tray: false });
  const st = new Settings({ store, broadcast: () => {} });
  const got = st.get();
  assert.equal(got.tray, false);
  for (const k of ['branchMaxChildren', 'branchMaxDepth', 'branchMaxTotal']) { assert.ok(!(k in got), k); assert.ok(!(k in st.describe()), k); }
  st.set({ key: 'tray', value: true }); // 옛 키가 남아도 다른 설정은 바뀐다
  assert.equal(st.get().tray, true);
  store.close();
});

// ---------- 저장소 옮기기 ----------
test('K4: P7까지의 board.db에 branch 열이 더해지고, 부모·하위 세션 기록이 다시 열어도 남는다', () => {
  const d = tmp(); const file = path.join(d, 'board.db');
  // P7 모양: sessions에 branch 열이 없다
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE sessions (session_id TEXT PRIMARY KEY, name TEXT NOT NULL, cwd TEXT NOT NULL, group_id TEXT, pane_id TEXT, workspace_id TEXT, agent_name TEXT, model TEXT, effort TEXT, permission_mode TEXT NOT NULL, settings_path TEXT NOT NULL, hook_token TEXT NOT NULL, resume_argv TEXT, resume_verified INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, closed_at INTEGER, seen_at INTEGER, runtime TEXT, touched_at INTEGER, kind TEXT, origin TEXT, parent_session_id TEXT, workspace_key TEXT, close_reason TEXT, dismissed_at INTEGER, reopened_as TEXT) STRICT;`);
  db.prepare("INSERT INTO sessions (session_id, name, cwd, permission_mode, settings_path, hook_token, created_at, kind, origin, parent_session_id) VALUES ('p', 'lead', 'C:/w', 'manual', '', '', 1, 'claude', 'board', NULL), ('q', 'helper', 'C:/w', 'manual', '', '', 2, 'claude', 'adopted', 'p')").run();
  db.close();
  let store = new Store(file);
  const cols = store.db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
  assert.ok(cols.includes('branch'));
  let rows = store.branchRows();
  assert.equal(rows.find((r) => r.sessionId === 'q').parentSessionId, 'p');
  assert.equal(rows.find((r) => r.sessionId === 'q').branch, null); // 판에 올린 에이전트는 하위 세션 기록이 없다
  store.setBranch('q', { role: '워커', depth: 2, by: 'p' });
  store.close();
  store = new Store(file);
  rows = store.branchRows();
  assert.deepEqual(rows.find((r) => r.sessionId === 'q').branch, { role: '워커', depth: 2, by: 'p' });
  store.close();
});

// ---------- Branch(가짜 판) ----------
async function fakeBoard({ limits } = {}) {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  if (limits) store.setMeta('settings', limits);
  const ws = await workspaceOf(dir);
  store.insertWorkspace({ ...ws, createdAt: 1 });
  const b = {
    cfg: { profile: 'dev', herdrSession: 'atrium-dev-p8test', port: 0, dataDir: dir }, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(),
    broadcasts: [], spawned: [], killed: [], links: [], queued: [],
    api: { broadcast: (e, d) => b.broadcasts.push([e, d]) }, log: () => {}, requireHerdr: () => {},
    hooked: (s) => s.kind === 'claude' && s.origin === 'board',
    summary: (s) => ({ state: 'ready', ask: null }),
    ensureLink: (from, to, patch) => { const l = { linkId: 'l' + b.links.length, from, to, ...patch }; b.links.push(l); return l; },
    linkEvent: () => ({}),
    queue: { enqueue: (sid, text) => { b.queued.push({ sid, text }); return { deliveryId: 'd' + b.queued.length, status: 'queued' }; } },
    async spawn(p) {
      const id = crypto.randomUUID();
      const s = { sessionId: id, name: p.name, cwd: p.cwd, paneId: `w${b.spawned.length + 2}:p1`, agentName: p.name, model: p.model, effort: p.effort, permissionMode: p.permissionMode, kind: p.kind, origin: 'board', parentSessionId: p.parentSessionId || null, workspaceKey: (await workspaceOf(p.cwd)).key, rt: newRuntime({ kind: p.kind }), createdAt: Date.now() };
      store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
      b.sessions.set(id, s);
      if (p.branch) b.branch.noteChild(id, p.branch);
      const place = p.branch ? b.branch.placeChild(p.parentSessionId, s.workspaceKey) : null;
      store.setNode({ session_id: id, x: place ? place.x : 0, y: place ? place.y : 5000 + b.spawned.length * 600, w: place ? place.w : 720, h: place ? place.h : 460, size: place ? place.size : null });
      b.spawned.push({ ...p, place });
      return { sessionId: id, trust: { needsTrust: false } };
    },
    async kill({ session }) { const s = b.sessions.get(session); b.sessions.delete(session); store.updateSession(session, { closedAt: Date.now() }); b.bus.emit('closed', s); b.killed.push(s.name); return { closed: true }; },
  };
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10 });
  const lead = { sessionId: crypto.randomUUID(), name: 'lead', cwd: dir, paneId: 'w1:p1', agentName: 'lead', model: 'haiku', effort: 'low', permissionMode: 'acceptEdits', kind: 'claude', origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind: 'claude' }), createdAt: 1 };
  store.insertSession({ ...lead, settingsPath: '', hookToken: '', runtime: lead.rt });
  store.setNode({ session_id: lead.sessionId, x: 0, y: 0, w: 720, h: 460 });
  b.sessions.set(lead.sessionId, lead);
  return { b, dir, lead, ws };
}

test('K1: 하위 세션은 부모의 폴더·모델·노력 수준·권한 모드를 물려받고(P22: 그룹 없음), 역할 선(워커)과 판 이벤트가 남는다. 지시에 다른 값이 있으면 그것', async () => {
  const { b, dir, lead } = await fakeBoard();
  const r = await b.branch.spawnChild(lead, { name: 'w1', wait: false });
  const p = b.spawned[0];
  assert.equal(p.cwd, dir); assert.equal(p.model, 'haiku'); assert.equal(p.effort, 'low'); assert.equal(p.permissionMode, 'acceptEdits'); assert.equal(p.group, undefined); assert.equal(p.parentSessionId, lead.sessionId);
  assert.equal(r.role, '워커'); assert.equal(r.depth, 2); assert.equal(r.agentName, 'w1'); assert.match(r.notice, /herdr agent prompt w1/);
  assert.deepEqual(b.links[0], { linkId: 'l0', from: lead.sessionId, to: r.sessionId, role: '워커', spawned: true });
  assert.ok(b.store.events({ sessionId: lead.sessionId }).some((e) => e.kind === 'branch_child' && e.data.child === 'w1'));
  // 다른 모델·역할·첫 지시
  const r2 = await b.branch.spawnChild(lead, { name: 'w2', model: 'sonnet', role: '리뷰어', prompt: 'Reply with exactly: ok', wait: false });
  assert.equal(b.spawned[1].model, 'sonnet'); assert.equal(r2.role, '리뷰어');
  assert.deepEqual(b.queued[0], { sid: r2.sessionId, text: 'Reply with exactly: ok' });
  // 요약: 깊이와 부모 이름
  const sum = b.branch.summaryExtra(b.sessions.get(r.sessionId)).branch;
  assert.equal(sum.depth, 2); assert.equal(sum.parentName, 'lead'); assert.equal(sum.role, '워커'); assert.equal(sum.child, true);
  assert.equal(b.branch.summaryExtra(lead).branch.children, 2);
  // 워크트리는 git 저장소에서만
  await assert.rejects(b.branch.spawnChild(lead, { name: 'w3', worktree: 'feat', wait: false }), /Git 저장소/);
  await assert.rejects(b.branch.spawnChild(lead, { name: 'w3', kind: 'shell', wait: false }), /에이전트만/);
  // P36: 커밋이 없는 저장소는 needs_commit 한 문장(판은 빈 커밋을 만들지 않는다)
  const repo = tmp();
  execFileSync('git', ['init', '-q', repo]);
  b.cfg.claudeJson = path.join(repo, 'no-claude.json');
  fs.writeFileSync(b.cfg.claudeJson, JSON.stringify({ projects: {} }));
  const n0 = b.spawned.length;
  await assert.rejects(b.branch.spawnChild(lead, { name: 'w3', cwd: repo, worktree: 'feat', wait: false }), (e) => e.code === 'needs_commit' && /첫 커밋/.test(e.message) && !/\n/.test(e.message));
  assert.equal(b.spawned.length, n0);
  assert.equal(execFileSync('git', ['-C', repo, 'rev-list', '--all', '--count'], { encoding: 'utf8' }).trim(), '0'); // 커밋을 대신 만들지 않았다
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init']);
  // P36: 신뢰를 받지 않은 저장소는 미리 거부하지 않고 신뢰 관문으로 띄운다(-w 없이, 신뢰 질문이 노드에 뜬다). 응답은 needs_trust와 한 문장
  const g = await b.branch.spawnChild(lead, { name: 'w3', cwd: repo, worktree: 'feat', prompt: 'do it', wait: false });
  assert.equal(b.spawned.at(-1).worktree, null); assert.equal(b.spawned.at(-1).branch.gate, 'trust');
  assert.equal(g.status, 'needs_trust'); assert.equal(g.needsTrust, true); assert.equal(g.gate, 'trust'); assert.equal(g.worktree, 'feat');
  assert.equal(g.tellHuman, '보드에서 @w3 카드의 신뢰 질문에 답해 주세요.');
  assert.equal(g.next.wait, 'atrium child-wait w3');
  assert.ok(b.branch.holds(g.sessionId)); // 판의 전달(첫 지시)은 관문을 지날 때까지 멈춘다
  fs.writeFileSync(b.cfg.claudeJson, JSON.stringify({ projects: { [repo.split(path.sep).join('/')]: { hasTrustDialogAccepted: true } } }));
  const wt = await b.branch.spawnChild(lead, { name: 'w4', cwd: repo, worktree: 'feat2', effort: 'high', wait: false });
  assert.equal(b.spawned.at(-1).worktree, 'feat2'); assert.equal(wt.worktree, 'feat2'); assert.equal(wt.needsTrust, false); assert.equal(wt.tellHuman, null);
  // P36: --effort가 물려받기를 덮는다. 맞지 않는 값은 거부
  assert.equal(b.spawned.at(-1).effort, 'high'); assert.equal(wt.effort, 'high');
  await assert.rejects(b.branch.spawnChild(lead, { name: 'w5', effort: 'huge', wait: false }), /추론 수준/);
});

test('P36: 신뢰 예상 — 커밋 없는 저장소는 상위 폴더의 신뢰를 물려받고, 커밋이 생기면 저장소 루트에서 멈춘다', async () => {
  const { predictTrust } = await import('../src/launch.mjs');
  const parent = tmp(); const repo = path.join(parent, 'r'); fs.mkdirSync(repo);
  const cj = path.join(parent, 'claude.json');
  fs.writeFileSync(cj, JSON.stringify({ projects: { [parent.split(path.sep).join('/')]: { hasTrustDialogAccepted: true }, [repo.split(path.sep).join('/')]: { hasTrustDialogAccepted: false } } }));
  assert.equal(predictTrust(repo, cj).needsTrust, false); // git 아님
  execFileSync('git', ['init', '-q', repo]);
  assert.equal(predictTrust(repo, cj).needsTrust, false); // 커밋 없는 저장소(실험 C)
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init']);
  assert.equal(predictTrust(repo, cj).needsTrust, true); // 첫 커밋 뒤(실험 B·C)
});

// P36: 신뢰 관문을 지나는 흐름(가짜 herdr). 사람이 답해 ready가 되면 /exit 뒤 같은 패널·같은 세션 ID로 claude -w를 띄우고, 그 사이 들어간 지시는 다시 보낸다
test('P36: 신뢰 관문 — ready가 되면 claude -w로 다시 띄우고, 관문 동안 전달을 멈추며, child-wait는 needs_trust와 한 문장을 돌려준다', async () => {
  const { b, lead } = await fakeBoard();
  const repo = tmp();
  execFileSync('git', ['init', '-q', repo]);
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init']);
  b.cfg.claudeJson = path.join(repo, 'claude.json');
  fs.writeFileSync(b.cfg.claudeJson, JSON.stringify({ projects: {} }));
  const calls = [];
  b.cfg.killWaitMs = 500;
  b.adapter = {
    sendKeys: async (n, k) => calls.push(['keys', n, k]),
    sendText: async (p, t) => { calls.push(['text', p, t]); if (t === '/exit') child.rt.herdr.present = false; },
    paneKeys: async (p, k) => calls.push(['paneKeys', p, k]),
    waitShellReady: async () => true,
    startAgent: async (o) => { calls.push(['start', o]); child.rt.herdr.present = true; return { agent: null }; },
  };
  b.launchOf = (s) => ({ sessionId: s.sessionId, settingsPath: 's.json', permissionMode: s.permissionMode, model: s.model, effort: s.effort, extraArgs: [] });
  b.broadcastSession = () => {}; b.registerResume = () => {};
  b.branch.childWaitMs = 300;
  const g = await b.branch.spawnChild(lead, { name: 'wt1', cwd: repo, worktree: 'wt1', prompt: 'first', wait: false });
  const child = b.sessions.get(g.sessionId);
  // 신뢰 질문에서 멈춤: child-wait는 needs_trust와 한 문장
  child.rt.herdr = { ...child.rt.herdr, status: 'blocked', present: true, launchPending: true, agentSessionId: null };
  child.rt.trustScreen = { at: Date.now() };
  const w = await b.branch.waitChild(lead, { name: 'wt1' });
  assert.equal(w.status, 'needs_trust'); assert.equal(w.tellHuman, '보드에서 @wt1 카드의 신뢰 질문에 답해 주세요.'); assert.equal(w.gated, true); assert.equal(w.timeout, true);
  b.bus.emit('session', child, { state: 'trust_wait' });
  assert.equal(calls.length, 0); // 신뢰 질문에는 아무것도 보내지 않는다
  assert.ok(b.branch.holds(child.sessionId));
  // 사람이 수락: ~/.claude.json에 신뢰가 쓰이고 ready가 된다. 그 사이 herdr로 직접 들어간 지시가 하나 있다
  fs.writeFileSync(b.cfg.claudeJson, JSON.stringify({ projects: { [repo.split(path.sep).join('/')]: { hasTrustDialogAccepted: true } } }));
  child.rt.trustScreen = null; child.rt.herdr.status = 'idle';
  child.rt.lastPrompt = 'slipped in'; child.rt.lastPromptAt = Date.now();
  const before = b.queued.length;
  b.bus.emit('session', child, { state: 'ready' });
  b.bus.emit('session', child, { state: 'ready' }); // 두 번 와도 한 번만 다시 띄운다
  for (let i = 0; i < 40 && b.branch.gated(child.sessionId); i++) await new Promise((r) => setTimeout(r, 25));
  const starts = calls.filter((c) => c[0] === 'start');
  assert.equal(starts.length, 1);
  const args = starts[0][1].args;
  assert.deepEqual(args.slice(0, 4), ['--session-id', child.sessionId, '--worktree', 'wt1']);
  assert.equal(starts[0][1].paneId, child.paneId);
  assert.ok(calls.findIndex((c) => c[0] === 'text' && c[2] === '/exit') < calls.findIndex((c) => c[0] === 'start'));
  assert.equal(b.branch.holds(child.sessionId), false);
  assert.ok(b.store.events({ sessionId: child.sessionId }).some((e) => e.kind === 'trust_gate_passed' && e.data.trusted && e.data.slipped));
  assert.deepEqual(b.queued.slice(before), [{ sid: child.sessionId, text: 'slipped in' }]);
  // 다시 켠 판도 관문 기록을 읽는다
  assert.equal(new Branch(b).gated(child.sessionId), false);
  // 관문을 지난 뒤 child-wait는 ready를 돌려준다
  child.rt.phase = 'running';
  const w2 = await b.branch.waitChild(lead, { name: 'wt1' });
  assert.equal(w2.status, 'ready'); assert.equal(w2.needsTrust, false); assert.equal(w2.timeout, false); assert.equal(w2.next.wait, 'herdr agent wait wt1 --timeout 600000');
  await assert.rejects(b.branch.waitChild(b.sessions.get(g.sessionId), { name: 'lead' }), (e) => e.code === 'not_parent');
});

test('K1: 다른 폴더면 그 워크스페이스에 띄운다', async () => {
  const { b, lead } = await fakeBoard();
  const other = tmp();
  const r = await b.branch.spawnChild(lead, { name: 'far', cwd: other, wait: false });
  assert.equal(b.spawned[0].cwd, path.resolve(other));
  assert.notEqual(r.workspaceKey, lead.workspaceKey);
  assert.equal(b.spawned[0].place, null); // 다른 워크스페이스는 그 영역의 빈자리 규칙
});

test('K4: 하위 세션 노드는 부모 오른쪽에(P73: 16:9 가로 보통), 형제는 위아래로 쌓인다(P75: 띄운 순서, 순서 번호)', async () => {
  const { b, lead } = await fakeBoard();
  await b.branch.spawnChild(lead, { name: 'w1', wait: false });
  await b.branch.spawnChild(lead, { name: 'w2', wait: false });
  const [a, c] = b.spawned.map((x) => x.place);
  assert.equal(a.size, 'wide-normal'); assert.equal(a.w, SIZE_STEPS['wide-normal'].w); assert.equal(a.aspect, '16:9');
  assert.ok(a.x >= 720); assert.equal(a.y, 0);
  assert.equal(c.x, a.x); assert.equal(c.y, a.y + a.h + LINE_GAP_Y);
  const kids = [...b.sessions.values()].filter((x) => x.parentSessionId === lead.sessionId);
  assert.deepEqual(kids.map((x) => b.branch.summaryExtra(x).branch.order), [1, 2]);
});

test('K2·K3(P36): 상한 없음 — 한 세션이 하위 세션 32개, 8단계 나무를 만들고(옛 설정 키가 있어도) 거부가 없다. 형제 자리는 나무 모양으로 겹치지 않는다', async () => {
  const { b, lead } = await fakeBoard();
  b.store.setMeta('settings', { branchMaxChildren: 4, branchMaxDepth: 3, branchMaxTotal: 6 }); // 옛 판 기록
  const kids = [];
  for (let i = 1; i <= 32; i++) kids.push(await b.branch.spawnChild(lead, { name: `w${i}`, wait: false }));
  assert.equal(b.branch.listChildren(lead, {}).children.length, 32);
  assert.deepEqual(b.branch.listChildren(lead, {}).counts, { children: 32, total: 32 });
  // 깊이 8단계
  let cur = lead, last = null;
  for (let d = 2; d <= 8; d++) { last = await b.branch.spawnChild(cur, { name: `d${d}`, wait: false }); cur = b.sessions.get(last.sessionId); }
  assert.equal(last.depth, 8);
  assert.equal(b.store.events({}).filter((e) => e.kind === 'branch_refused').length, 0);
  // 자리: 32개 형제 모두 나무 자리(부모 오른쪽), 서로 겹치지 않고, P75: 격자로 접지 않고 한 열에 띄운 순서대로
  const places = b.spawned.slice(0, 32).map((x) => x.place);
  assert.ok(places.every(Boolean), 'all placed in the tree');
  assert.ok(places.every((p) => p.x >= 720 + 200));
  for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++) assert.ok(!overlaps(places[i], places[j], GAP - 1), `${i} ${j}`);
  assert.equal(new Set(places.map((p) => p.x)).size, 1, 'P75: 격자로 접지 않고 한 열');
  for (let i = 1; i < places.length; i++) assert.ok(places[i].y > places[i - 1].y, `띄운 순서 ${i}`);
  // 깊이 사슬은 단계마다 오른쪽으로
  const chain = b.spawned.slice(32).map((x) => x.place);
  for (let i = 1; i < chain.length; i++) assert.ok(chain[i].x > chain[i - 1].x);
  // 나무 목록(all)
  assert.equal(b.branch.listChildren(lead, { all: true }).children.length, 39);
  assert.equal(b.branch.tree().limits, undefined);
});

test('K3: 자기 자손이 아니면 끄기를 not_parent로 거부하고, 자손을 끄면 그 아래도 깊은 것부터 끈다', async () => {
  const { b, lead } = await fakeBoard();
  const w1 = await b.branch.spawnChild(lead, { name: 'w1', wait: false });
  const w2 = await b.branch.spawnChild(lead, { name: 'w2', wait: false });
  const mid = b.sessions.get(w1.sessionId);
  await b.branch.spawnChild(mid, { name: 'deep', wait: false });
  const sib = b.sessions.get(w2.sessionId);
  await assert.rejects(b.branch.killChild(sib, { name: 'w1' }), (e) => e.code === 'not_parent');
  await assert.rejects(b.branch.killChild(mid, { name: 'lead' }), (e) => e.code === 'not_parent');
  await assert.rejects(b.branch.killChild(lead, { name: 'lead' }), (e) => e.code === 'not_parent');
  assert.ok(b.store.events({}).some((e) => e.kind === 'branch_refused' && e.data.code === 'not_parent'));
  const r = await b.branch.killChild(lead, { name: 'w1' });
  assert.deepEqual(r.killed.map((k) => k.name), ['deep', 'w1']);
  assert.deepEqual(b.killed, ['deep', 'w1']);
  // 닫힌 자식 아래가 남은 경우도(only로 가운데만 끈 뒤) 할아버지가 끌 수 있다
  const w3 = await b.branch.spawnChild(lead, { name: 'w3', wait: false });
  await b.branch.spawnChild(b.sessions.get(w3.sessionId), { name: 'orphan', wait: false });
  await b.branch.killChild(lead, { name: 'w3', only: true });
  assert.ok([...b.sessions.values()].some((s) => s.name === 'orphan'));
  await b.branch.killChild(lead, { name: 'orphan' });
  assert.ok(![...b.sessions.values()].some((s) => s.name === 'orphan'));
  // 목록
  const ls = b.branch.listChildren(lead, {});
  assert.deepEqual(ls.children.map((c) => c.name), ['w2']);
});

// ---------- HTTP와 명령 ----------
function serve(b) {
  const srv = http.createServer((req, res) => { if (!b.branch.handleHttp(req, res)) { res.writeHead(404); res.end(); } });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => { b.cfg.port = srv.address().port; r(srv); }));
}
function runChild(args, env, script = 'atrium-child.mjs') {
  return new Promise((resolve) => {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('MTASK_') && !k.startsWith('ATRIUM_')));
    execFile(process.execPath, [path.join(HERE, '..', 'bin', script), ...args], { env: { ...clean, ...env }, timeout: 20000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}

test('K1: 하위 세션 명령은 env의 판으로 세션 토큰을 들고 간다. 토큰이 틀리거나 판에 없는 세션이면 거부, 다른 판이 답하면 멈춘다', async () => {
  const { b, lead } = await fakeBoard();
  const srv = await serve(b);
  try {
    const env = b.branch.envFor(lead.sessionId);
    assert.equal(env.ATRIUM_HERDR_SESSION, 'atrium-dev-p8test'); assert.equal(env.ATRIUM_SESSION_ID, lead.sessionId);
    assert.ok(env.ATRIUM_SESSION_TOKEN !== b.apiToken && env.ATRIUM_SESSION_TOKEN.length === 64); // 판 API 토큰이 아니다
    const ok = await runChild(['child', 'w1', '--no-wait'], env);
    assert.equal(ok.code, 0, ok.stderr);
    assert.match(ok.stdout, /하위 세션을 생성했습니다: @w1 \(herdr 이름 w1/);
    assert.match(ok.stdout, /일 시키기: herdr agent prompt w1/);
    const ls = await runChild(['children'], env);
    assert.match(ls.stdout, /@lead\(1단계\)의 하위 세션 1개/);
    // P18 전에 띄운 세션: 옛 플러그인 shim이 부르는 mtask-child.mjs와 옛 env(MTASK_*)도 된다
    const old = Object.fromEntries(Object.entries(env).map(([k, v]) => [k.replace(/^ATRIUM_/, 'MTASK_'), v]));
    const ls2 = await runChild(['children'], old, 'mtask-child.mjs');
    assert.equal(ls2.code, 0, ls2.stderr); assert.match(ls2.stdout, /@lead\(1단계\)의 하위 세션 1개/);
    const bad = await runChild(['children'], { ...env, ATRIUM_SESSION_TOKEN: 'x'.repeat(64) });
    assert.notEqual(bad.code, 0); assert.match(bad.stderr, /bad_token/);
    assert.ok(b.store.events({}).some((e) => e.kind === 'branch_rejected'));
    const nobody = await runChild(['children'], { ...env, ATRIUM_SESSION_ID: 'nope' });
    assert.match(nobody.stderr, /not_on_board/);
    const other = await runChild(['children'], { ...env, ATRIUM_HERDR_SESSION: 'atrium' });
    assert.match(other.stderr, /다른 보드에서 응답했습니다/);
    const noenv = await runChild(['child'], {});
    assert.match(noenv.stderr, /보드에서 시작한 세션이 아닙니다/);
    const nope = await runChild(['kill', 'w1'], env);
    assert.equal(nope.code, 2); assert.match(nope.stderr, /child, children, child-kill, child-wait, wake, models만/);
    const five = await runChild(['child-kill', 'lead'], env);
    assert.match(five.stderr, /not_parent/);
  } finally { srv.close(); }
});

test('K1: 판이 띄운 세션의 설정 파일을 다시 쓸 때(P8 전 세션) env와 규칙만 더하고 hook과 다른 규칙은 그대로', async () => {
  const { b, dir, lead } = await fakeBoard();
  const f = path.join(dir, 'old.json');
  writeSessionSettings({ file: f, hookUrl: 'http://127.0.0.1:1/hooks/claude', token: 'h', sessionId: lead.sessionId, allowHerdr: true });
  lead.settingsPath = f;
  assert.equal(b.branch.refreshSettings(), 1);
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(j.env.ATRIUM_SESSION_ID, lead.sessionId);
  for (const r of [...HERDR_ALLOW, ...BRANCH_ALLOW]) assert.ok(j.permissions.allow.includes(r), r);
  assert.ok(j.hooks.UserPromptSubmit);
  assert.equal(b.branch.refreshSettings(), 0); // 이미 있으면 다시 쓰지 않는다
});
