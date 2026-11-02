// P13 단위 시험: 판 밖 대화의 분류(missed 포함), 띄움 관계 찾기, missed 지우기 거부, 영역 안 대화 노드 자리.
// herdr와 claude 없이 돈다. 대화 기록은 직접 만든 가짜 자료이고 실제 ~/.claude는 읽지 않는다. 휴지통 대신 가짜 지우기를 넣는다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { pathKey, normPath } from '../src/workspaces.mjs';
import { Recall } from '../src/recall.mjs';
import { DAY_MS } from '../src/archive.mjs';
import { DEFAULTS } from '../src/settings.mjs';
import { promptKey, spawnsInCommand, spawnsInLines, matchSpawns, SPAWN_WINDOW_MS } from '../src/spawns.mjs';
import { readSpawns, parseTranscriptChunks, CONVO_PARSER } from '../src/convos.mjs';
import { testDirKind, classifyConvo, trashPlan } from '../src/missed.mjs';
import { placeCards, worktreeBoxes, CARD, CONVO_CAP, convoFace } from '../src/convo-canvas.mjs';
import { overlaps, NODE } from '../src/canvas.mjs';
import { codeRootsOf } from '../src/config.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'p13u-'));
const ID = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-00000000a013`;
const iso = (ms) => new Date(ms).toISOString();
const NOW = Date.now();
const user = (text, { cwd, at, entrypoint = 'cli' }) => JSON.stringify({ type: 'user', uuid: Math.random().toString(36).slice(2), cwd, entrypoint, timestamp: iso(at), message: { role: 'user', content: text } });
const answer = (text, { cwd, at, entrypoint = 'cli' }) => JSON.stringify({ type: 'assistant', uuid: Math.random().toString(36).slice(2), cwd, entrypoint, timestamp: iso(at), message: { role: 'assistant', content: [{ type: 'text', text }] } });
const toolUse = (name, input, { cwd, at, entrypoint = 'cli', sidechain = false }) => JSON.stringify({ type: 'assistant', uuid: Math.random().toString(36).slice(2), cwd, entrypoint, isSidechain: sidechain, timestamp: iso(at), message: { role: 'assistant', content: [{ type: 'tool_use', id: 't' + Math.random(), name, input }] } });
function writeConvo(root, cwd, id, lines, at) {
  const dir = path.join(root, path.resolve(cwd).replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(f, lines.join('\n') + '\n');
  const t = new Date(at + 6000); fs.utimesSync(f, t, t);
  return f;
}
const convo = (root, cwd, id, { at = NOW - 3600000, entrypoint = 'cli', text = '지시', extra = [] } = {}) => writeConvo(root, cwd, id, [user(text, { cwd, at, entrypoint }), ...extra, answer('답', { cwd, at: at + 2000, entrypoint })], at);

// ---------- 띄움 줄 ----------
test('P13 띄움: 명령 글에서 claude -w, herdr agent start·prompt, atrium(옛 이름 mtask) child·spawn을 찾는다', () => {
  const a = spawnsInCommand("claude --model claude-opus-5-5 --effort high -w p13 'You are the P13 worker'");
  assert.deepEqual(a.map((x) => [x.via, x.worktree]), [['claude', 'p13']]);
  assert.equal(a[0].promptKey, promptKey('You are the P13 worker'));
  assert.deepEqual(spawnsInCommand('claude --worktree=feat-x "fix it"').map((x) => x.worktree), ['feat-x']);
  assert.deepEqual(spawnsInCommand('herdr agent start w1 -- claude --model haiku').map((x) => [x.kind, x.via, x.name]), [['start', 'herdr', 'w1']]);
  assert.deepEqual(spawnsInCommand('herdr agent prompt w1 "do the thing" --wait').map((x) => [x.kind, x.name, x.promptKey]), [['prompt', 'w1', promptKey('do the thing')]]);
  const m = spawnsInCommand('atrium child w2 --worktree feat --prompt "go now"');
  assert.deepEqual(m.map((x) => [x.via, x.name, x.worktree, x.promptKey]), [['atrium-child', 'w2', 'feat', promptKey('go now')]]);
  assert.deepEqual(spawnsInCommand('mtask child w2 --worktree feat --prompt "go now"').map((x) => [x.via, x.name]), [['atrium-child', 'w2']]); // 옛 이름(P18 전 기록)
  assert.deepEqual(spawnsInCommand('node backend/bin/atrium.mjs --dev spawn C:/x/y --name s1').map((x) => [x.via, x.cwd]), [['atrium-spawn', 'C:/x/y']]);
  assert.deepEqual(spawnsInCommand('node backend/bin/mtask.mjs --dev spawn C:/x/y --name s1').map((x) => [x.via, x.cwd]), [['atrium-spawn', 'C:/x/y']]);
  assert.deepEqual(spawnsInCommand('node C:/r/backend/bin/atrium-child.mjs child w5').map((x) => [x.via, x.name]), [['atrium-child', 'w5']]);
  assert.deepEqual(spawnsInCommand('powershell -NoProfile -Command "claude -w abc hello"').map((x) => x.worktree), ['abc']); // 따옴표 안
  assert.deepEqual(spawnsInCommand('herdr agent start w3 -- claude -w wt3 "task"').map((x) => [x.via, x.worktree]), [['herdr', 'wt3']]); // 겹쳐 잡지 않는다
  // 띄움이 아닌 것
  for (const c of ['claude --version', 'claude -p "hi"', 'cd ~/.claude && ls', 'herdr --session other agent start x', 'mtask ls', 'atrium ls', 'echo claude -w']) {
    const r = spawnsInCommand(c);
    if (c === 'echo claude -w') assert.equal(r.length, 1); // 글자 그대로는 구분하지 못한다(기록만 보는 한계, 보고에 적음)
    else assert.deepEqual(r, [], c);
  }
});

test('P13 띄움: 대화 기록 줄에서 셸 도구(Bash, PowerShell, run_in_terminal)만, 하위 에이전트 줄과 사람 줄은 빼고', () => {
  const cwd = 'C:/w/repo', at = NOW - 1000;
  const lines = [
    user('claude -w nope', { cwd, at }),
    toolUse('Bash', { command: 'claude -w a1 "first"' }, { cwd, at }),
    toolUse('PowerShell', { command: 'herdr agent start w9' }, { cwd, at: at + 1 }),
    toolUse('mcp__terminal__run_in_terminal', { command: "claude -w a2 'second'", cwd: 'C:/w/repo' }, { cwd, at: at + 2 }),
    toolUse('Bash', { command: 'claude -w side' }, { cwd, at, sidechain: true }),
    toolUse('Read', { file_path: 'claude -w x' }, { cwd, at }),
  ].join('\n');
  const s = spawnsInLines(lines);
  assert.deepEqual(s.map((x) => x.name), ['a1', 'w9', 'a2']);
  assert.equal(s[2].toolCwd, 'C:/w/repo');
  assert.equal(s[0].at, at);
});

test('P13 띄움: 이어 읽기는 늘어난 부분만, 덜 쓴 끝 줄은 다음에', async () => {
  const d = tmp();
  const f = path.join(d, `${ID(1)}.jsonl`);
  const cwd = 'C:/w/repo';
  fs.writeFileSync(f, toolUse('Bash', { command: 'claude -w one' }, { cwd, at: NOW }) + '\n');
  const r1 = await readSpawns(f);
  assert.deepEqual(r1.spawns.map((x) => x.name), ['one']);
  assert.equal(r1.off, fs.statSync(f).size);
  fs.appendFileSync(f, toolUse('Bash', { command: 'claude -w two' }, { cwd, at: NOW + 1 }) + '\n' + toolUse('Bash', { command: 'claude -w three' }, { cwd, at: NOW + 2 }).slice(0, 40));
  const r2 = await readSpawns(f, { from: r1.off });
  assert.deepEqual(r2.spawns.map((x) => x.name), ['two']); // 덜 쓴 줄은 아직
  assert.ok(r2.off < fs.statSync(f).size);
  const r3 = await readSpawns(f, { from: 10 ** 9 }); // 파일이 줄었으면 처음부터
  assert.deepEqual(r3.spawns.map((x) => x.name), ['one', 'two']);
});

test('P13 띄움 맞추기: 워크트리 이름, 폴더, 첫 지시. 시간 창 밖과 자기 자신은 빼고, 띄움 하나에 자식 하나', () => {
  const t = NOW - 10 * 60000;
  const parent = { convId: 'p', cwd: 'C:/w/repo', startAt: t - 60000, spawns: [
    { kind: 'start', via: 'claude', at: t, worktree: 'p13', name: 'p13', promptKey: promptKey('work') },
    { kind: 'start', via: 'herdr', at: t + 1000, name: 'w1' },
    { kind: 'prompt', via: 'herdr', at: t + 30 * 60000 / 10, name: 'w1', promptKey: promptKey('review this') },
    { kind: 'start', via: 'atrium-spawn', at: t + 2000, cwd: 'C:/w/other' },
    { kind: 'start', via: 'claude', at: t + 5000, worktree: 'late', name: 'late' },
  ] };
  const kids = [
    { convId: 'wt', cwd: 'C:\\w\\repo\\.claude\\worktrees\\p13', startAt: t + 4000, promptKey: promptKey('work') },
    { convId: 'wt2', cwd: 'C:/w/repo/.claude/worktrees/p13', startAt: t + 6000, promptKey: promptKey('work') }, // 같은 띄움에 둘째는 안 된다
    { convId: 'hp', cwd: 'C:/w/repo', startAt: t + 30 * 60000 / 10 + 3000, promptKey: promptKey('review this') },
    { convId: 'cw', cwd: 'C:/w/other', startAt: t + 9000, promptKey: null },
    { convId: 'late', cwd: 'C:/w/repo/.claude/worktrees/late', startAt: t + 5000 + SPAWN_WINDOW_MS + 1000 }, // 창 밖
    { convId: 'self', cwd: 'C:/w/repo', startAt: t, promptKey: promptKey('work') },
  ];
  const m = matchSpawns([parent, ...kids]);
  assert.equal(m.get('wt').parent, 'p');
  assert.equal(m.get('wt').by, 'worktree');
  assert.equal(m.has('wt2'), false);
  assert.equal(m.get('hp').by, 'prompt'); // herdr agent start 뒤 첫 agent prompt의 글
  assert.equal(m.get('cw').by, 'cwd');
  assert.equal(m.has('late'), false);
  assert.equal(m.has('p'), false);
  // 머리 요약의 시작 시각과 첫 지시 열쇠
  const s = parseTranscriptChunks([user('<pasted_content id="x">work</pasted_content>', { cwd: 'C:/a', at: t + 5 }), answer('ok', { cwd: 'C:/a', at: t + 9 })].join('\n'));
  assert.equal(s.startAt, t + 5);
  assert.equal(s.promptKey, promptKey('work'));
  assert.ok(CONVO_PARSER >= 3);
});

// ---------- 분류 ----------
test('P13 시험 폴더: 판 코드 저장소와 워크트리의 backend/.dev·experiments, 임시 폴더, mtask- 접두어', () => {
  const roots = codeRootsOf('C:\\Workspace\\multitask\\.claude\\worktrees\\p13');
  assert.deepEqual(roots.map(pathKey), ['c:/workspace/multitask/.claude/worktrees/p13', 'c:/workspace/multitask']);
  const o = { codeRoots: roots, tmp: 'C:\\Users\\u\\AppData\\Local\\Temp', prefix: 'mtask-' };
  assert.equal(testDirKind('C:\\Workspace\\multitask\\backend\\.dev\\proj', o), 'code');
  assert.equal(testDirKind('C:/Workspace/multitask/experiments/proj', o), 'code');
  assert.equal(testDirKind('C:/Workspace/multitask/.claude/worktrees/p8/backend/.dev/proj', o), 'code');
  assert.equal(testDirKind('C:/Workspace/multitask/backend/src', o), null);
  assert.equal(testDirKind('C:/Workspace/multitask', o), null);
  assert.equal(testDirKind('C:/Workspace/multitask/.claude/worktrees/p13', o), null);
  assert.equal(testDirKind('C:/Users/u/AppData/Local/Temp/xyz', o), 'tmp');
  assert.equal(testDirKind('C:/Workspace/mtask-p10-cli', o), 'prefix');
  assert.equal(testDirKind('C:/Workspace/mtask-p13-repo', { ...o, prefix: 'mtask-p13-x' }), null); // 시험 판은 접두어를 바꾼다
  assert.equal(testDirKind('C:/Workspace/multitask-other', o), null);
  assert.equal(testDirKind('C:/Workspace/mtask', o), null);
});

test('P13 분류: 판에 올림, 보관, missed(없어진 폴더, 시험 폴더), 도는 시험 대화, 데스크톱, 판 세션, SDK', () => {
  const row = (o = {}) => ({ cwd: 'C:/w/repo', prompts: 2, entrypoints: ['cli'], ...o });
  const free = { bound: false };
  assert.equal(classifyConvo({ row: row() }).cls, 'board');
  assert.equal(classifyConvo({ row: row(), archived: true }).cls, 'archived');
  assert.equal(classifyConvo({ row: row({ prompts: 0 }) }).cls, 'noPrompt');
  assert.deepEqual(classifyConvo({ row: row(), exists: false }), { cls: 'missed', why: 'gone' });
  assert.deepEqual(classifyConvo({ row: row(), testDir: 'code' }), { cls: 'missed', why: 'code' });
  assert.deepEqual(classifyConvo({ row: row(), testDir: 'tmp', archived: true }), { cls: 'missed', why: 'tmp' }); // missed는 보관과 다른 분류
  assert.deepEqual(classifyConvo({ row: row({ entrypoints: ['sdk-cli'] }), exists: false }), { cls: 'missed', why: 'gone' }); // SDK도 missed
  assert.equal(classifyConvo({ row: row({ entrypoints: ['sdk-cli'] }) }).cls, 'sdk'); // SDK는 캔버스에 올리지 않는다
  assert.equal(classifyConvo({ row: row(), exists: false, binding: { bound: true, open: true, where: 'terminal', pid: 1 } }).cls, 'live'); // 도는 대화는 missed가 아니다
  assert.equal(classifyConvo({ row: row(), boardKnown: true, exists: false }).cls, 'boardSession');
  assert.equal(classifyConvo({ row: row({ entrypoints: ['claude-desktop'] }), exists: false }).cls, 'desktop');
  assert.equal(classifyConvo({ row: row(), binding: { bound: true, where: 'desktop', sure: true } }).cls, 'desktop');
  assert.equal(classifyConvo({ row: row({ entrypoints: [] }), exists: false }).cls, 'other');
  assert.equal(classifyConvo({ row: row(), binding: { bound: true, open: true, where: 'terminal' } }).cls, 'board'); // 다른 터미널에서 도는 대화도 판에 보인다(표시만)
  void free;
});

test('P13 지우기 거부: 뿌리 밖, UUID 아닌 이름, 도는 대화, 묶인 대화, 데스크톱, 판 세션, missed 아님', () => {
  const root = path.join(os.tmpdir(), 'p13-roots', 'projects');
  const f = (n, id = ID(n)) => path.join(root, 'C--w-x', `${id}.jsonl`);
  const base = { cls: 'missed', binding: { bound: false } };
  const plan = trashPlan([
    { ...base, convId: ID(1), path: f(1) },
    { ...base, convId: ID(2), path: path.join(os.tmpdir(), 'elsewhere', `${ID(2)}.jsonl`) },
    { ...base, convId: 'notes', path: path.join(root, 'C--w-x', 'notes.jsonl') },
    { ...base, convId: ID(4), path: f(4, ID(5)) },
    { ...base, convId: ID(6), path: f(6), binding: { bound: true, open: true, where: 'terminal', pid: 9 } },
    { ...base, convId: ID(7), path: f(7), binding: { bound: true, where: 'unknown', sure: false } },
    { ...base, convId: ID(8), path: f(8), desktop: true },
    { ...base, convId: ID(9), path: f(9), boardKnown: true },
    { ...base, convId: ID(10), path: f(10), cls: 'board' },
    { ...base, convId: ID(11), path: path.join(root, '..', 'projects', 'C--w-x', '..', '..', `${ID(11)}.jsonl`) },
    { ...base, convId: ID(12), path: `projects/C--w-x/${ID(12)}.jsonl` },
  ], { roots: [root], dirExists: (d) => d.endsWith(ID(1)) });
  assert.deepEqual(plan.ok.map((x) => x.convId), [ID(1)]);
  assert.equal(plan.ok[0].dir, f(1).slice(0, -6)); // 옆 폴더도 함께
  const why = Object.fromEntries(plan.refused.map((r) => [r.convId, r.reason]));
  assert.equal(why[ID(2)], 'outside_root');
  assert.equal(why.notes, 'not_uuid');
  assert.equal(why[ID(4)], 'not_uuid'); // 파일 이름과 대화 ID가 다르다
  assert.equal(why[ID(6)], 'running');
  assert.equal(why[ID(7)], 'bound');
  assert.equal(why[ID(8)], 'desktop');
  assert.equal(why[ID(9)], 'board_session');
  assert.equal(why[ID(10)], 'not_missed');
  assert.ok(['outside_root', 'bad_path'].includes(why[ID(11)]));
  assert.equal(why[ID(12)], 'bad_path');
});

// ---------- 영역 안 자리 ----------
test('P13 대화 노드 자리: 판 세션 아래 최근 순 격자, 워크트리마다 새 줄, 겹치지 않고, 놓인 것은 그대로', () => {
  const ws = 'k';
  const sess = { id: 's1', kind: 'node', ws, x: 0, y: 0, w: NODE.w, h: NODE.h };
  const other = { id: 'o', kind: 'node', ws: 'other', x: 2000, y: 0, w: 720, h: 460 };
  const cards = [
    ...Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, block: '', at: 1000 - i })),
    { id: 'w1', block: 'feat', at: 2000 }, { id: 'w2', block: 'feat', at: 500 }, { id: 'z1', block: 'zeta', at: 100 },
  ];
  const at = placeCards({ wsKey: ws, cards, items: [sess, other] });
  assert.equal(at.size, cards.length);
  const all = [...at.values()];
  for (const r of all) assert.ok(r.y >= sess.y + sess.h, '판 세션 아래');
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(!overlaps(all[i], all[j], 1), '카드끼리 겹치지 않는다');
  void other; // 다른 영역은 피하지 않는다(영역째로 미는 것은 settleRegions)
  assert.ok(at.get('m0').x < at.get('m1').x && at.get('m0').y === at.get('m1').y, '최근 것이 왼쪽 위');
  assert.ok(at.get('m5').y > at.get('m0').y, '다섯 개 넘으면 다음 줄');
  const mainBottom = Math.max(...cards.filter((c) => !c.block).map((c) => at.get(c.id).y + CARD.h));
  assert.ok(at.get('w1').y > mainBottom, '워크트리는 본 저장소 줄 아래 새 줄');
  assert.equal(at.get('w1').y, at.get('w2').y);
  assert.ok(at.get('z1').y > at.get('w1').y, '워크트리마다 새 줄');
  const boxes = worktreeBoxes(cards.map((c) => ({ ws, block: c.block, ...at.get(c.id) })));
  assert.deepEqual(boxes.map((b) => [b.block, b.n]).sort(), [['feat', 2], ['zeta', 1]]);
  for (const b of boxes) for (const c of cards.filter((x) => !x.block)) assert.ok(!overlaps(b, at.get(c.id), 0), '워크트리 배경이 다른 카드를 덮지 않는다');
  // 이미 놓인 카드는 그대로, 새 카드만
  const placed = new Map([['m0', { x: 5000, y: 5000, w: CARD.w, h: CARD.h }]]);
  const at2 = placeCards({ wsKey: ws, cards: [{ id: 'm0', block: '', at: 9 }, { id: 'n1', block: '', at: 8 }], placed, items: [sess] });
  assert.equal(at2.has('m0'), false);
  assert.ok(!overlaps(at2.get('n1'), placed.get('m0'), 1));
  // 빈 워크스페이스는 영역 자리 안쪽부터
  const at3 = placeCards({ wsKey: ws, cards: [{ id: 'a', block: '' }], items: [], anchor: { x: 100, y: 200 } });
  assert.ok(at3.get('a').x > 100 && at3.get('a').y > 200);
  assert.equal(convoFace('close'), 'card'); assert.equal(convoFace('middle'), 'card'); assert.equal(convoFace('far'), 'far'); assert.equal(convoFace('icon'), 'icon');
});

// ---------- 판 위에서(가짜 백엔드) ----------
function fakeBackend({ convoRoots, workspaces = [], sessionsDir = tmp(), extraCfg = {} }) {
  const dataDir = tmp();
  const store = new Store(path.join(dataDir, 'board.db'));
  for (const w of workspaces) store.insertWorkspace({ ...w, createdAt: Date.now() });
  const events = [];
  const b = {
    cfg: { convoRoots, claudeSessionsDir: sessionsDir, desktopSessionsDir: null, convoScanMs: 60000, claudeProjects: convoRoots[0], sessionsDir: path.join(dataDir, 'sessions'), dataDir, hookTimeoutSec: 2, claudeJson: path.join(dataDir, 'none.json'), claudeCommand: 'claude', ...extraCfg },
    store, bus: new EventEmitter(), sessions: new Map(), events, killing: new Set(),
    api: { broadcast: (ev, data) => events.push([ev, data]) },
    log: () => {}, hooked: () => true,
    resolveWorkspace: async (r) => store.getWorkspace(r) || store.workspaces().find((w) => w.root === normPath(r)),
    ensureWorkspace: (ws) => { if (store.getWorkspace(ws.key)) return false; store.insertWorkspace({ ...ws, createdAt: Date.now() }); return true; },
    broadcastWorkspaces: () => events.push(['workspace.updated']),
  };
  return b;
}
const folderWs = (dir) => ({ key: pathKey(dir), kind: 'folder', root: normPath(dir) });

test('P13 판: 대화 노드를 영역에 올리고(상한), 띄움 선과 "띄운 곳", missed는 빼고 모아 지운다(거부 포함)', async () => {
  const root = tmp(), base = tmp();
  const repo = path.join(base, 'repo'), wt = path.join(repo, '.claude', 'worktrees', 'feat'), plain = path.join(base, 'plain'), testd = path.join(base, 'mtask-x1'), gone = path.join(base, 'gone');
  for (const d of [repo, wt, plain, testd]) fs.mkdirSync(d, { recursive: true });
  const repoWs = { key: pathKey(path.join(repo, '.git')), kind: 'repo', root: normPath(repo) };
  const resolveCwd = async (cwd) => (pathKey(cwd).startsWith(pathKey(repo)) ? repoWs : folderWs(cwd));
  const sessionsDir = tmp();
  const b = fakeBackend({ convoRoots: [root], workspaces: [repoWs, folderWs(plain)], sessionsDir, extraCfg: { codeRoots: [], tmpDir: null, testPrefix: 'mtask-x' } });
  const t0 = NOW - 2 * 3600000;
  // 본 저장소 대화 하나가 워크트리 feat 대화를 띄웠다. 워크트리 대화에는 하위 에이전트 둘
  convo(root, repo, ID(1), { at: t0, text: '본 저장소 일', extra: [toolUse('Bash', { command: "claude -w feat 'feature work'" }, { cwd: repo, at: t0 + 60000 })] });
  const wf = convo(root, wt, ID(2), { at: t0 + 65000, text: 'feature work' });
  fs.mkdirSync(path.join(wf.slice(0, -6), 'subagents'), { recursive: true });
  for (const a of ['agent-a1', 'agent-a2']) { fs.writeFileSync(path.join(wf.slice(0, -6), 'subagents', `${a}.jsonl`), '{}\n'); fs.writeFileSync(path.join(wf.slice(0, -6), 'subagents', `${a}.meta.json`), JSON.stringify({ description: `설명 ${a}`, agentType: 'general' })); }
  // 데스크톱 대화가 띄운 cli 대화(부모는 캔버스에 없다 → "띄운 곳")
  convo(root, plain, ID(3), { at: t0, entrypoint: 'claude-desktop', text: '데스크톱', extra: [toolUse('mcp__terminal__run_in_terminal', { command: 'herdr agent start pw', cwd: plain }, { cwd: plain, at: t0 + 1000, entrypoint: 'claude-desktop' }), toolUse('mcp__terminal__run_in_terminal', { command: 'herdr agent prompt pw "go plain"', cwd: plain }, { cwd: plain, at: t0 + 2000, entrypoint: 'claude-desktop' })] });
  convo(root, plain, ID(4), { at: t0 + 3000, text: 'go plain' });
  // missed: 없어진 폴더 둘, 시험 폴더 하나(옆 폴더 있음). 도는 대화(없어진 폴더) 하나
  convo(root, gone, ID(5), { at: t0 });
  convo(root, gone, ID(6), { at: t0 + 1 });
  const tf = convo(root, testd, ID(7), { at: t0 });
  fs.mkdirSync(path.join(tf.slice(0, -6), 'subagents'), { recursive: true }); fs.writeFileSync(path.join(tf.slice(0, -6), 'subagents', 'agent-z.jsonl'), '{}\n');
  convo(root, gone, ID(8), { at: t0 });
  fs.writeFileSync(path.join(sessionsDir, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: ID(8), entrypoint: 'cli' })); // 지금 도는 대화
  // 상한: plain에 45개 더
  for (let i = 0; i < 45; i++) convo(root, plain, ID(100 + i), { at: t0 - (i + 1) * 60000, text: `많은 대화 ${i}` });
  const trashed = [];
  const r = new Recall(b, { resolveCwd, readProcs: async () => [], settings: () => ({ ...DEFAULTS, archiveDays: 14, autoOpenRepos: false }), trash: async (paths) => { for (const p of paths) { fs.rmSync(p, { recursive: true, force: true }); trashed.push(p); } return { trashed: paths, failed: [] }; } });
  await r.scan({ wait: true });
  await r.changed();
  const nodes = r.canvas.nodes;
  const byId = new Map(nodes.map((n) => [n.convId, n]));
  // 리포 영역: 본 저장소 하나 + 워크트리 하나(블록 feat), 하위 에이전트 2
  assert.ok(byId.has(ID(1)) && byId.has(ID(2)));
  assert.equal(byId.get(ID(2)).block, 'feat');
  assert.equal(byId.get(ID(1)).block, '');
  assert.equal(byId.get(ID(2)).subagents, 2);
  assert.equal(byId.get(ID(2)).workspaceKey, repoWs.key);
  // 띄움 선: 1 → 2
  assert.deepEqual(r.canvas.edges.map((e) => [e.from, e.to, e.via]), [[`convo:${ID(1)}`, `convo:${ID(2)}`, 'claude']]);
  assert.equal(byId.get(ID(1)).children, 1);
  assert.equal(byId.get(ID(2)).spawnedBy.onCanvas, true);
  // 데스크톱 부모: 노드에는 "띄운 곳" 글만(첫 지시 해시로 맞춤)
  assert.equal(byId.get(ID(4)).spawnedBy.label, '데스크톱 앱 대화');
  assert.equal(byId.has(ID(3)), false);
  // 상한: plain 영역은 CONVO_CAP개(최근 것), 나머지는 사이드바에
  const plainNodes = nodes.filter((n) => n.workspaceKey === pathKey(plain));
  assert.equal(plainNodes.length, CONVO_CAP);
  assert.ok(plainNodes.some((n) => n.convId === ID(4)) && !plainNodes.some((n) => n.convId === ID(144)));
  const list = await r.list({});
  const plainList = list.workspaces.find((w) => w.key === pathKey(plain)).convos;
  assert.ok(plainList.find((c) => c.convId === ID(144)) && !plainList.find((c) => c.convId === ID(144)).onCanvas);
  assert.equal(plainList.find((c) => c.convId === ID(4)).onCanvas, true);
  // 겹치지 않는다(영역 안, 다른 노드와)
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) assert.ok(!overlaps(nodes[i], nodes[j], 1), `${nodes[i].convId} ${nodes[j].convId}`);
  // 하위 에이전트 목록
  const sa = await r.subagents({ convo: ID(2) });
  assert.deepEqual(sa.subagents.map((x) => x.description).sort(), ['설명 agent-a1', '설명 agent-a2']);
  // missed: 없어진 폴더 2(도는 것 빼고), 시험 폴더 1. 캔버스와 사이드바에 없다
  const ml = await r.missedList();
  assert.equal(ml.count, 3);
  assert.deepEqual(ml.folders.map((f) => [pathKey(f.folder), f.count]).sort(), [[pathKey(gone), 2], [pathKey(testd), 1]].sort());
  for (const id of [ID(5), ID(6), ID(7), ID(8)]) assert.equal(byId.has(id), false);
  const counts = r.classifyCounts();
  assert.equal(counts.byClass.missed, 3);
  assert.equal(counts.byClass.live, 1);
  assert.equal(counts.byClass.desktop, 1);
  // 확인 없이 부르면 수, 크기, 폴더만
  const ask = await r.missedDelete({ all: true });
  assert.equal(ask.needsConfirm, true); assert.equal(ask.count, 3); assert.equal(ask.folders.length, 2); assert.ok(ask.bytes > 0);
  assert.equal(trashed.length, 0);
  // 폴더 하나 지우기(시험 폴더): 대화 기록과 옆 폴더
  const one = await r.missedDelete({ folder: testd, confirm: true });
  assert.equal(one.trashed, 1);
  assert.equal(fs.existsSync(tf), false); assert.equal(fs.existsSync(tf.slice(0, -6)), false);
  // 도는 대화와 판에 올린 대화는 골라 지워도 거부한다
  const ref = await r.missedDelete({ convos: [ID(8), ID(1), ID(5)], confirm: true });
  assert.equal(ref.trashed, 1);
  assert.deepEqual(ref.refused.map((x) => [x.convId, x.reason]).sort(), [[ID(1), 'not_missed'], [ID(8), 'running']]);
  assert.ok(fs.existsSync(path.join(root, path.resolve(gone).replace(/[^A-Za-z0-9]/g, '-'), `${ID(8)}.jsonl`)));
  // 모두 지우기: 남은 하나. 색인에서 빠지고, 빈 프로젝트 폴더도 남지 않는다(도는 대화가 남은 폴더는 남는다)
  const all = await r.missedDelete({ all: true, confirm: true });
  assert.equal(all.trashed, 1);
  assert.equal((await r.missedList()).count, 0);
  assert.equal(r.store.getConvoById(ID(5)), null);
  assert.equal(fs.existsSync(path.dirname(tf)), false);
  assert.ok(b.store.listEvents ? true : true);
});

test('P13 판: 대화 노드를 옮기면 자리를 지키고, 영역을 옮기면 함께 움직인다', async () => {
  const root = tmp(), base = tmp();
  const plain = path.join(base, 'plain'); fs.mkdirSync(plain, { recursive: true });
  const b = fakeBackend({ convoRoots: [root], workspaces: [folderWs(plain)], extraCfg: { codeRoots: [], tmpDir: null, testPrefix: '' } });
  convo(root, plain, ID(1), { at: NOW - 3600000 });
  convo(root, plain, ID(2), { at: NOW - 7200000 });
  const r = new Recall(b, { resolveCwd: async (c) => folderWs(c), readProcs: async () => [], settings: () => ({ ...DEFAULTS, archiveDays: 14, autoOpenRepos: false }) });
  b.recall = r;
  await r.scan({ wait: true }); await r.changed();
  const n1 = { ...r.canvas.nodes.find((n) => n.convId === ID(1)) };
  r.moveConvo({ convo: ID(1), x: n1.x + 1000, y: n1.y + 500 });
  convo(root, plain, ID(3), { at: NOW - 60000 }); // 새 대화가 와도 옮긴 자리는 그대로
  await r.scan({ wait: true }); await r.changed();
  const after = r.canvas.nodes.find((n) => n.convId === ID(1));
  assert.deepEqual([after.x, after.y], [n1.x + 1000, n1.y + 500]);
  assert.ok(r.canvas.nodes.find((n) => n.convId === ID(3)));
  const { workspaceMove } = await import('../src/canvas-ops.mjs');
  workspaceMove(b, { workspace: pathKey(plain), dx: 300, dy: 40 });
  await r.layoutCanvas();
  const moved = r.canvas.nodes.find((n) => n.convId === ID(1));
  assert.deepEqual([moved.x, moved.y], [after.x + 300, after.y + 40]);
});
