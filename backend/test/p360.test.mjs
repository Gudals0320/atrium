// P360: 세션 되살리기(atrium revive, 창의 다시 열기)와 갈라 열기(atrium fork, SDK로 갈라 열기).
//   이름·ID 풀기, 상태별 되살리기 길, 살아 있으면 거절, 갈라 열기 명령줄과 env(SDK면 중계기 주소, 키 값 없음), 키 없음 거절,
//   닫힌 SDK 세션 다시 열기, 관계 되찾기, 계약 번호와 help
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStartArgs, buildResumeArgs, transcriptPathFor } from '../src/launch.mjs';
import { buildSdkArgs, SdkHost, SDK_LAUNCHER_ID } from '../src/sdk-session.mjs';
import { findTarget, reviveSession, forkSession, restoreRelations, convoSize, reviveLines, forkLines, forkMark } from '../src/revive.mjs';
import { relationIndex } from '../src/relations.mjs';
import { wakeArgs } from '../src/sleep.mjs';
import { newRuntime, deriveState } from '../src/state.mjs';
import { Store } from '../src/store.mjs';
import { Backend } from '../src/backend.mjs';
import { attachRecall } from '../src/recall.mjs';
import { Launchers } from '../src/launchers.mjs';
import { DEFAULTS } from '../src/settings.mjs';
import { CONTRACT_VERSION, VERB_NAMES, shortHelp, contractJson, REVIVE_RULE } from '../src/cli-contract.mjs';
import { ORCH_NO_SPAWN, VERB_OP } from '../src/orchestration.mjs';
import { BOARD_SYSTEM_PROMPT } from '../src/launch.mjs';
import { HARNESS_PROMPT } from '../src/harness.mjs';
import { boardSkill, branchAllow } from '../src/branch.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'p360-'));
const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'p363-fake-claude.mjs');
const until = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 25)); } throw new Error('timeout'); };
const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('명령줄: 갈라 열기는 --resume <원래> --fork-session --session-id <새 ID>(대화형·SDK), 이어 가기에는 붙지 않는다', () => {
  const a = buildStartArgs({ sessionId: 'NEW', forkFrom: 'OLD', settingsPath: 's.json', permissionMode: 'manual', model: 'haiku', worktree: 'w' });
  assert.deepEqual(a.slice(0, 5), ['--resume', 'OLD', '--fork-session', '--session-id', 'NEW']);
  assert.ok(!a.includes('--worktree'), '갈라 열기는 워크트리를 만들지 않는다');
  assert.deepEqual(buildStartArgs({ sessionId: 'N', settingsPath: 's', permissionMode: 'manual' }).slice(0, 2), ['--session-id', 'N']);
  assert.deepEqual(buildResumeArgs({ sessionId: 'N', forkFrom: 'OLD', settingsPath: 's', permissionMode: 'manual' }).slice(0, 3), ['--resume', 'N', '--no-chrome'], '대화가 생긴 뒤에는 자기 대화로 이어 간다');
  const s = buildSdkArgs({ sessionId: 'NEW', forkFrom: 'OLD', settingsPath: 's', worktree: 'w' });
  assert.deepEqual(s.slice(6, 11), ['--resume', 'OLD', '--fork-session', '--session-id', 'NEW']);
  assert.ok(!s.includes('--worktree'));
  const r = buildSdkArgs({ sessionId: 'NEW', forkFrom: 'OLD', resume: true, settingsPath: 's' });
  assert.deepEqual(r.slice(6, 8), ['--resume', 'NEW']); assert.ok(!r.includes('--fork-session'));
  // 깨우기: 대화 기록이 생기기 전이면 다시 갈라 열고, 있으면 자기 대화로
  const launch = { sessionId: 'NEW', forkFrom: 'OLD', settingsPath: 's', permissionMode: 'manual' };
  assert.deepEqual(wakeArgs(launch, { exists: false, convId: 'NEW' }).args.slice(0, 3), ['--resume', 'OLD', '--fork-session']);
  assert.deepEqual(wakeArgs(launch, { exists: true, convId: 'NEW' }).args.slice(0, 2), ['--resume', 'NEW']);
  assert.deepEqual(forkMark({ sessionId: 'S', convId: 'ABC', name: 'lead' }).convId, 'abc');
});

test('계약 11: revive·fork 동사, 오케스트레이션 세션에는 없음, 승인 규칙, help·판 안내문·하네스 안내문·스킬에 사람이 시킬 때만 한 줄', () => {
  assert.equal(CONTRACT_VERSION, 14); // P384: answer로 14. // P364: know로 12
  assert.deepEqual(VERB_NAMES.slice(-4, -2), ['revive', 'fork']); // P384: 뒤에 know, answer. P364: 뒤에 know
  assert.equal(contractJson().contract, 14); // P384 // P364
  const fork = contractJson().verbs.find((v) => v.name === 'fork');
  assert.ok(fork.args.includes('[--launcher 런처]') && fork.args.includes('[--peer]'));
  assert.equal(VERB_OP.revive, 'revive'); assert.equal(VERB_OP.fork, 'fork');
  assert.ok(ORCH_NO_SPAWN.includes('revive') && ORCH_NO_SPAWN.includes('fork'));
  assert.ok(shortHelp().includes('atrium revive <이름|세션 ID|대화 ID>') && shortHelp().includes(REVIVE_RULE));
  assert.ok(!shortHelp({ allowed: ['help', 'prompt'], scope: 'sub' }).includes('atrium revive'), '오케스트레이션 세션 help에는 없다');
  for (const t of [BOARD_SYSTEM_PROMPT, HARNESS_PROMPT, boardSkill()]) { assert.match(t, /atrium revive/); assert.match(t, /atrium fork/); assert.match(t, /사람이 .*(시킬|할) 때만/); }
  assert.ok(!HARNESS_PROMPT.includes('"') && !HARNESS_PROMPT.includes('\n'));
  const allow = branchAllow();
  for (const v of ['revive', 'fork']) assert.ok(allow.includes(`Bash(atrium ${v} *)`), v);
});

test('대화 크기: 마지막 모델 답의 usage(입력 + 캐시 + 출력), 없으면 파일 크기 어림. 합성 답(오류)은 세지 않는다', () => {
  const dir = tmp();
  try {
    const f = path.join(dir, 'c.jsonl');
    const line = (o) => JSON.stringify(o) + '\n';
    fs.writeFileSync(f, line({ type: 'user', message: { role: 'user', content: 'hi' } }) + line({ type: 'assistant', message: { model: 'claude-haiku-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 20000, cache_creation_input_tokens: 3000, output_tokens: 50 } } }) + line({ type: 'assistant', message: { model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } } }));
    assert.deepEqual(convoSize(f), { tokens: 23060, bytes: fs.statSync(f).size, how: 'usage' });
    const g = path.join(dir, 'd.jsonl'); fs.writeFileSync(g, line({ type: 'user', message: { content: 'x'.repeat(600) } }));
    const z = convoSize(g); assert.equal(z.how, 'bytes'); assert.ok(z.tokens > 50);
    assert.equal(convoSize(path.join(dir, 'none.jsonl')), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 판(가짜 터미널 없음): SDK 세션은 가짜 claude -p, 닫힌 세션 다시 열기는 실제 Recall과 Store
function board({ keyed = true, idleMs = 300 } = {}) {
  const dir = tmp();
  const fake = path.join(dir, 'fake'); fs.mkdirSync(fake);
  process.env.P363_FAKE_DIR = fake;
  const projects = path.join(dir, 'projects');
  const b = new Backend({ quietMs: 600000, port: 0, logDir: dir, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), claudeJson: path.join(dir, 'none.json'), claudeCommand: 'claude', claudeProjects: projects, hookTimeoutSec: 2 });
  b.store = new Store(path.join(dir, 'board.db'));
  b.sessions = new Map(); b.termOk = true; b.hookUrl = 'http://127.0.0.1:1/hook'; b.plugin = { pluginDir: 'C:/plug', systemPromptFile: 'C:/plug.md' };
  const closed = new Map();
  const rel = [];
  b.branch = {
    closed, summaryExtra: () => ({}), settingsExtra: (sid) => ({ env: { ATRIUM_SESSION: sid } }), noteChild() {}, placeChild: () => null, holds: () => false,
    relIndex: () => relationIndex({ rows: rel, lineageOf: (id) => { const s = b.sessions.get(id); return s ? s.parentSessionId || null : (closed.get(id) || {}).parentSessionId || null; }, links: b.store.links() }),
    setRelation: (a, x, relation) => rel.push({ a: a.sessionId, b: x.sessionId, relation, source: 'agent', at: Date.now() }),
  };
  b.features = { settings: { get: () => ({ ...DEFAULTS }) }, launchers: null, summaryExtra: () => ({}) };
  b.features.launchers = new Launchers({ store: b.store });
  const queued = [];
  b.queue = { enqueue: (sid, text) => { queued.push({ sid, text }); return { deliveryId: 'd1' }; }, pending: () => 0, poke() {}, cancelSession() {} };
  b.api = { broadcast() {} };
  b.broadcastSession = () => {}; b.broadcastWorkspaces = () => {}; b.probeGit = () => {};
  b.authRelay = { keyPresent: () => keyed, ensure: async () => { if (!keyed) throw Object.assign(new Error('no key'), { code: 'auth_relay_no_key', key: 'authRelay.err.noKey' }); }, url: (sid) => `http://127.0.0.1:9/sec/${sid}` };
  b.adapter = { connected: false, agentKinds: async () => [], refreshSubscription: async () => {}, createWorkspace: async () => { throw new Error('no terminal'); } };
  b.sdk = new SdkHost(b, { idleMs, command: [process.execPath, FAKE] });
  b.recall = attachRecall(b, { timers: false, readProcs: async () => [], resolveCwd: async (cwd) => ({ key: cwd.toLowerCase(), root: cwd, kind: 'folder' }) });
  const log = () => { try { return fs.readFileSync(path.join(fake, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)); } catch { return []; } };
  // 원래 대화 기록 하나(사람 글과 모델 답 usage)
  const writeConvo = (cwd, id, words = 'Remember LIME-3') => {
    const f = transcriptPathFor(projects, cwd, id);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, [{ type: 'user', sessionId: id, cwd, message: { role: 'user', content: words } }, { type: 'assistant', sessionId: id, message: { model: 'claude-haiku-5-5', usage: { input_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200, output_tokens: 7 } } }].map((x) => JSON.stringify(x)).join('\n') + '\n');
    return f;
  };
  const done = async () => { await b.sdk.stopAll(); b.store.close(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { b, dir, fake, log, queued, writeConvo, done, rel };
}

test('이름·ID 풀기: 판의 세션이 먼저(살아 있음·잠듦·끝남), 닫힌 세션은 이름이 겹치면 늦게 닫힌 것, 보관 표시, 모르는 UUID는 판 밖 대화', async () => {
  const { b, dir, done } = board();
  try {
    const r = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, name: 'a1' });
    assert.equal(findTarget(b, 'a1').state, 'live'); assert.equal(findTarget(b, '@a1').state, 'live'); assert.equal(findTarget(b, r.sessionId.toUpperCase()).state, 'live');
    const s = b.sessions.get(r.sessionId);
    s.rt.sleep = { at: 1 }; assert.equal(findTarget(b, 'a1').state, 'sleeping'); s.rt.sleep = null;
    await b.kill({ session: 'a1', confirm: true });
    const t = findTarget(b, 'a1'); assert.equal(t.state, 'closed'); assert.equal(t.row.sessionId, r.sessionId); assert.equal(t.archived, false);
    // 같은 이름으로 다시 띄우고 닫으면 이름은 늦게 닫힌 것을 가리킨다
    const r2 = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, name: 'a1' });
    await new Promise((res) => setTimeout(res, 5));
    await b.kill({ session: 'a1', confirm: true, after: 'archive' });
    const t2 = findTarget(b, 'a1'); assert.equal(t2.row.sessionId, r2.sessionId); assert.equal(t2.archived, true);
    assert.equal(findTarget(b, r.sessionId).row.sessionId, r.sessionId, 'ID는 그 세션');
    assert.deepEqual(findTarget(b, UUID(7)), { state: 'convo', convId: UUID(7) });
    assert.equal(findTarget(b, 'nobody').state, 'none');
    assert.throws(() => findTarget(b, ''), (e) => e.code === 'bad_request');
  } finally { await done(); }
});

test('되살리기 길: 살아 있으면 거절(이름), 없으면 not_found, 잠듦은 깨우기, 판 밖 대화는 판으로 열기', async () => {
  const { b, dir, done } = board();
  try {
    const r = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, name: 'live1' });
    await assert.rejects(() => reviveSession(b, 'live1'), (e) => e.code === 'alive' && e.name === 'live1' && e.key === 'revive.err.alive');
    await assert.rejects(() => reviveSession(b, 'ghost'), (e) => e.code === 'not_found');
    const s = b.sessions.get(r.sessionId);
    const woke = [];
    b.sleeper = { bgView: () => null, summaryExtra: () => ({}), wakeFor: async (x, why) => { woke.push([x.name, why]); x.rt.sleep = null; return { ms: 12 }; } };
    s.rt.sleep = { at: 1 };
    const w = await reviveSession(b, 'live1', { by: 'agent:lead' });
    assert.deepEqual(woke, [['live1', 'revive:agent:lead']]); assert.equal(w.from, 'sleeping'); assert.equal(w.billing, 'api');
    const opened = [];
    b.recall.openConvo = async (p) => { opened.push(p.convo); return { sessionId: r.sessionId, name: 'live1' }; };
    const c = await reviveSession(b, UUID(9));
    assert.deepEqual(opened, [UUID(9)]); assert.equal(c.from, 'convo');
  } finally { await done(); }
});

test('닫힌 SDK 세션 다시 열기: 같은 세션 ID·이름·자리, 터미널 없이 다음 글에서 --resume(대화 기억), 보관된 것도 꺼내며 연다. 키가 없으면 열지 않는다', async () => {
  const { b, dir, log, done } = board();
  try {
    const r = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, model: 'haiku', name: 'sdk1' });
    const s = b.sessions.get(r.sessionId);
    await b.sendPrompt(r.sessionId, 'hello one');
    await until(() => /n=1/.test(s.rt.lastAnswer || ''));
    const node = b.store.nodeOf(r.sessionId);
    await b.sdk.stop(s, 'test');
    await b.kill({ session: 'sdk1', confirm: true, after: 'archive' });
    assert.ok(!b.sessions.has(r.sessionId));
    // 대화 기록(가짜 claude는 상태 파일, 판은 대화 기록 파일로 이어 갈지 본다)
    const tx = transcriptPathFor(b.cfg.claudeProjects, dir, r.sessionId); fs.mkdirSync(path.dirname(tx), { recursive: true }); fs.writeFileSync(tx, '{}\n');
    const x = await reviveSession(b, 'sdk1', { by: 'user' });
    assert.equal(x.sessionId, r.sessionId); assert.equal(x.name, 'sdk1'); assert.equal(x.from, 'archived'); assert.equal(x.billing, 'api'); assert.equal(x.resume, true);
    const s2 = b.sessions.get(r.sessionId);
    assert.deepEqual([s2.billing, s2.paneId, s2.model], ['sdk', null, 'haiku']);
    const n2 = b.store.nodeOf(r.sessionId); assert.deepEqual([n2.x, n2.y], [node.x, node.y], '마지막 자리');
    assert.equal(b.store.closedSession(r.sessionId), null, '닫힘이 풀렸다');
    const marks = b.store.archiveMarks(); assert.ok(!(marks.get(`session:${r.sessionId}`) || {}).archivedAt, '보관이 풀렸다');
    await b.sendPrompt(r.sessionId, 'hello two');
    await until(() => /n=2/.test(s2.rt.lastAnswer || ''));
    assert.match(s2.rt.lastAnswer, /first=hello one resume=true/, '같은 대화를 이어 간다');
    assert.ok(log().at(-1).argv.includes('--resume'));
    // 키가 없으면 다시 열지 않는다
    await b.sdk.stop(s2, 'test');
    await b.kill({ session: 'sdk1', confirm: true });
    b.authRelay.ensure = async () => { throw Object.assign(new Error('no key'), { code: 'auth_relay_no_key' }); };
    await assert.rejects(() => reviveSession(b, 'sdk1'), (e) => e.code === 'auth_relay_no_key');
    assert.ok(!b.sessions.has(r.sessionId));
  } finally { await done(); }
});

test('관계 되찾기: 계보 부모를 다시 적고, 닫힐 때 뗀 역할 선을 역할 그대로 다시 잇는다(하위가 돌아온다). 닫힌 상대·사람이 먼저 끊은 선은 되찾지 않고 적는다', async () => {
  const { b, dir, done } = board();
  try {
    const lead = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, name: 'lead' });
    const boss = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, name: 'boss' });
    const w1 = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, name: 'w1', parentSessionId: lead.sessionId });
    const w2 = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, name: 'w2', parentSessionId: lead.sessionId });
    const L = b.sessions.get(lead.sessionId); L.parentSessionId = boss.sessionId; b.store.updateSession(lead.sessionId, { parentSessionId: boss.sessionId });
    b.ensureLink(lead.sessionId, w1.sessionId, { role: '워커', spawned: true });
    b.ensureLink(lead.sessionId, w2.sessionId, { role: '워커', spawned: true });
    b.ensureLink(boss.sessionId, lead.sessionId, { role: '리드' });
    const peer = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, name: 'p1' });
    const pl = b.ensureLink(lead.sessionId, peer.sessionId, { role: '동료' });
    b.store.updateLink(pl.linkId, { removedAt: Date.now() - 60000 }); // 사람이 그 전에 끊은 선
    await b.kill({ session: 'w2', confirm: true });
    await b.kill({ session: 'lead', confirm: true });
    assert.equal(b.store.links().filter((l) => l.from === lead.sessionId || l.to === lead.sessionId).length, 0, '닫으면 판에서 선이 빠진다');
    const x = await reviveSession(b, 'lead');
    const r = x.relations;
    assert.equal(b.sessions.get(lead.sessionId).parentSessionId, boss.sessionId, '계보 부모');
    assert.equal(r.parent, 'boss');
    assert.deepEqual(r.children, ['w1']);
    assert.deepEqual(r.roles.map((l) => [l.name, l.role, l.dir]).sort(), [['boss', '리드', 'in'], ['w1', '워커', 'out']]);
    assert.ok(r.missing.some((m) => m.name === 'w2' && m.why === 'other_closed'), '닫힌 하위는 되찾지 못한 것');
    assert.ok(!r.roles.some((l) => l.name === 'p1'), '사람이 먼저 끊은 선은 두다');
    const open = b.store.links().filter((l) => l.from === lead.sessionId);
    assert.deepEqual(open.map((l) => [l.to, l.role]), [[w1.sessionId, '워커']]);
    const lines = reviveLines(x).join('\n');
    assert.match(lines, /닫힌 세션을 판으로 다시 열었다/); assert.match(lines, /하위 @w1/); assert.match(lines, /@w2\(상대가 닫혀 있음\)/);
  } finally { await done(); }
});

test('갈라 열기(SDK): 원래 대화를 --resume <원래> --fork-session --session-id <새 ID>로 이어받는다. env는 중계기 주소만(키 값 없음), 원래 세션은 그대로, 곁에 놓고 계보 표, 응답에 과금·대화 크기', async () => {
  const { b, dir, log, done } = board();
  try {
    // 원래 세션: 대화형 claude(닫힌 행)처럼 대화 기록만 있는 판 세션. 여기서는 SDK 세션을 띄워 대화 기록을 만든 뒤 닫는다
    const src = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, model: 'claude-haiku-5-5', effort: 'low', name: 'lead' });
    const f = (() => { const p = transcriptPathFor(b.cfg.claudeProjects, dir, src.sessionId); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify({ type: 'assistant', message: { model: 'claude-haiku-5-5', usage: { input_tokens: 3, cache_read_input_tokens: 40000, cache_creation_input_tokens: 0, output_tokens: 9 } } }) + '\n'); return p; })();
    const before = fs.readFileSync(f, 'utf8');
    const x = await forkSession(b, 'lead', { launcher: SDK_LAUNCHER_ID });
    assert.equal(x.name, 'lead-fork'); assert.equal(x.billing, 'api'); assert.equal(x.sdk, true); assert.equal(x.relation, 'none');
    assert.equal(x.model, 'claude-haiku-5-5'); assert.equal(x.effort, 'low', '원래 세션의 값');
    assert.equal(x.size.tokens, 40012); assert.equal(x.from.name, 'lead');
    const s = b.sessions.get(x.sessionId);
    assert.deepEqual([s.billing, s.parentSessionId, s.rt.forkFrom.sessionId, s.rt.forkFrom.convId], ['sdk', null, src.sessionId, src.sessionId.toLowerCase()]);
    assert.equal(b.summary(s).forkFrom.name, 'lead');
    const n0 = b.store.nodeOf(src.sessionId), n1 = b.store.nodeOf(x.sessionId);
    assert.ok(Math.abs(n1.x - n0.x) + Math.abs(n1.y - n0.y) < 3000, '원래 세션 곁');
    await b.sendPrompt(x.sessionId, 'what word?');
    await until(() => s.rt.lastAnswer);
    const first = log().at(-1);
    const i = first.argv.indexOf('--resume');
    assert.deepEqual(first.argv.slice(i, i + 5), ['--resume', src.sessionId.toLowerCase(), '--fork-session', '--session-id', x.sessionId]);
    assert.equal(first.hasKey, false, 'env에 키가 없다'); assert.equal(first.base, `http://127.0.0.1:9/sec/${x.sessionId}`, '중계기 세션 주소');
    assert.equal(fs.readFileSync(f, 'utf8'), before, '원래 대화 기록은 그대로');
    assert.ok(b.sessions.has(src.sessionId), '원래 세션은 그대로');
    const lines = forkLines(x).join('\n');
    assert.match(lines, /API 크레딧 과금/); assert.match(lines, /40,012 토큰/); assert.match(lines, /캐시에 새로 쓴다/);
    // 이름이 겹치면 -2, --peer면 부른 세션의 동료
    const y = await forkSession(b, 'lead', { launcher: SDK_LAUNCHER_ID, peer: true, caller: b.sessions.get(src.sessionId) });
    assert.equal(y.name, 'lead-fork-2'); assert.equal(y.relation, 'peer');
    assert.equal(b.sessions.get(y.sessionId).parentSessionId, src.sessionId);
  } finally { await done(); }
});

test('갈라 열기 거절: 키가 없으면(SDK) 띄우지 않는다, 대화 기록이 없으면 no_transcript, Claude Code가 아니면 not_claude', async () => {
  const { b, dir, done } = board({ keyed: false });
  try {
    const rows = [];
    // 키 없음: 원래 세션은 닫힌 대화형 claude 행(대화 기록 있음)
    const id = UUID(1);
    b.store.insertSession({ sessionId: id, name: 'old', cwd: dir, paneId: null, termWorkspaceId: null, agentName: 'old', model: 'haiku', effort: null, permissionMode: 'manual', settingsPath: '', hookToken: '', resumeArgv: null, createdAt: 1, touchedAt: 1, runtime: newRuntime({ kind: 'claude', hooked: true }), kind: 'claude', origin: 'board', parentSessionId: null, workspaceKey: dir.toLowerCase() });
    b.store.updateSession(id, { closedAt: Date.now(), closeReason: 'killed' });
    await assert.rejects(() => forkSession(b, 'old', { launcher: SDK_LAUNCHER_ID }), (e) => e.code === 'no_transcript', '대화 기록이 없다');
    const p = transcriptPathFor(b.cfg.claudeProjects, dir, id); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, '{}\n');
    await assert.rejects(() => forkSession(b, 'old', { launcher: SDK_LAUNCHER_ID }), (e) => e.code === 'auth_relay_no_key' && e.key === 'authRelay.err.noKey');
    assert.equal(b.sessions.size, 0, '띄우지 않았다');
    const cid = UUID(2);
    b.store.insertSession({ sessionId: cid, name: 'cx', cwd: dir, paneId: null, termWorkspaceId: null, agentName: 'cx', model: null, effort: null, permissionMode: 'manual', settingsPath: '', hookToken: '', resumeArgv: null, createdAt: 1, touchedAt: 1, runtime: newRuntime({ kind: 'codex', hooked: false }), kind: 'codex', origin: 'board', parentSessionId: null, workspaceKey: dir.toLowerCase() });
    b.store.updateSession(cid, { closedAt: Date.now(), closeReason: 'killed' });
    await assert.rejects(() => forkSession(b, 'cx', {}), (e) => e.code === 'not_claude');
    void rows;
  } finally { await done(); }
});
