// P270 단위 시험: dsh(DeepSeek Harness, dsh-tui) 하네스. 어댑터 인자와 덧씌움 글, 안내문 플러그인, 기록(zstd 프레임 여러 개) 읽기,
// 이어 가기 세션 ID 찾기, 지금 모델, 입력 칸·입력을 잡는 창 읽기, hc 앱 이름(dsh-tui → dsh), 입력을 잡는 창 동안의 막힘 흉내와 보내기 직전 확인
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { ADAPTERS, adapterOf, harnessLaunch, reservedArg, resumable } from '../src/harness.mjs';
import { dshPatchText, dshLaunchFiles, DSH_BOARD_PLUGIN, decodeFrames, readDshEvents, readDshHeader, dshSessionOf, findDshSession, readDshLastAnswer, dshSummary, refreshDshModel, zstdAvailable, logFileIn, waitDshAnswer } from '../src/dsh.mjs';
import { dshGateOf, dshInputBox, promptOnScreen } from '../src/screen.mjs';
import { kindOfApp, KIND_COMMAND } from '../src/hc/model.mjs';
import { HARNESSES } from '../src/launchers.mjs';
import { HcAdapter } from '../src/hc/adapter.mjs';
import { startFakeHc } from './fake-hc.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(20); } throw new Error('timed out'); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'p270-'));
const jl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
// dsh처럼 사건 묶음마다 zstd 프레임 하나를 덧붙인 기록
const zstdLog = (batches) => Buffer.concat(batches.map((b) => zlib.zstdCompressSync(Buffer.from(jl(b)))));
function writeSession(home, cwd, id, batches, { depth = 0, at = Date.now() } = {}) {
  const proj = path.join(home, 'sessions', '--' + cwd.replace(/[:\\/]+/g, '-') + '--');
  const dir = path.join(proj, id);
  fs.mkdirSync(dir, { recursive: true });
  const head = [{ type: 'session', version: 4, id, createdAt: at, cwd, isSeeded: false, delegationDepth: depth }];
  const all = [head.concat(batches[0] || []), ...batches.slice(1)];
  fs.writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), zstdLog(all));
  return path.join(dir, 'session.v4.jsonl.zstd');
}
const GUIDE = '  Welcome to dsh-TUI  Step 1 of 4\n   ❯ Accounts and models · Language and theme\n    ❯ Sign in to a subscription (OAuth)\n    ←/→ step · Enter act on this step / go next · Esc skip the guide';
const STAR = '  🐳 99 hours together!\n   ❯ Feed a Star ⭐\n     Open GitHub in the browser\n   ↑↓ choose · Enter confirm · Esc next time';
const CHAT = [
  '  ❯ Reply with exactly one word: ready',
  '  ● ready',
  '  ╭────────────────────────────────╮',
  '  ⌸ ❯                             ⛶',
  '  ╰────────────────────────────────╯',
  '   deepseek-v4.1-flash · high · mtask',
].join('\n');

test('P270 어댑터: dsh-tui에 세션 덧씌움(--patch)을 앞에 두고, 이어 가기는 --resume, 런치패드는 끈다. 모델 인자는 없다', () => {
  const a = adapterOf('dsh');
  assert.equal(a, ADAPTERS.dsh);
  assert.equal(a.command, 'dsh-tui');
  assert.equal(resumable('dsh'), true);
  assert.deepEqual(a.modelArgs('x'), []);
  const dir = tmp();
  const r = a.build({ sessionId: 'sid-1', resume: false, instructions: { text: '안내 "글"' }, filesDir: dir, launcherArgs: ['--foo'] });
  const patch = path.join(dir, 'dsh', 'sid-1.patch.yml').split('\\').join('/');
  assert.deepEqual(r.args, ['--patch', patch, '--foo']);
  assert.deepEqual(r.env, { DSH_TUI_NO_LAUNCHPAD: '1' });
  assert.equal(r.resumed, false);
  assert.deepEqual(r.files.map((f) => path.basename(f.file)), ['atrium-board.mjs', 'sid-1.patch.yml']);
  const rr = a.build({ sessionId: 'sid-1', resume: true, harnessSessionId: 'abc-123', instructions: { text: 'x' }, filesDir: dir });
  assert.deepEqual(rr.args, ['--patch', patch, '--resume', 'abc-123']);
  assert.equal(rr.harnessSessionId, 'abc-123');
  // 이어 갈 ID를 모르면 새로 띄운다
  assert.deepEqual(a.build({ sessionId: 'sid-1', resume: true, filesDir: dir }).args, ['--patch', patch]);
  assert.equal(a.isBoardLine(['dsh-tui', ...r.args]), true);
  assert.equal(a.isBoardLine(['dsh-tui']), false);
  for (const w of ['--resume', '--patch', '--backend', '--profile', 'update']) assert.equal(reservedArg('dsh', [w]), w);
  assert.equal(reservedArg('dsh', ['--verbose']), null);
  const hl = harnessLaunch({ kind: 'dsh', sessionId: 's2', instructions: { text: 'g' }, boardEnv: { ATRIUM_X: '1' }, binDir: 'B', filesDir: dir });
  assert.deepEqual(hl.command, ['dsh-tui']);
  assert.deepEqual(hl.env, { ATRIUM_X: '1', DSH_TUI_NO_LAUNCHPAD: '1' });
  assert.deepEqual(hl.pathFirst, ['B']);
  assert.deepEqual(KIND_COMMAND.dsh, 'dsh-tui');
  assert.deepEqual(HARNESSES.dsh.fields, ['startCommand', 'args']);
});

test('P270 덧씌움 글: 세션 기록 올리기를 끄고, 안내문 플러그인을 파일 URL로 넣고, 글은 JSON 문자열로 적는다', () => {
  const t = dshPatchText({ prompt: 'a "b"\nc', pluginFile: 'C:/x/atrium-board.mjs' });
  assert.match(t, /- id: session-log-deepseek\n  config:\n    enabled: false/);
  assert.match(t, /- id: atrium-board\n      name: "file:\/\/\/C:\/x\/atrium-board\.mjs"/);
  assert.ok(t.includes('        text: "a \\"b\\"\\nc"'));
  assert.doesNotMatch(dshPatchText({ prompt: 'x', pluginFile: 'C:/x/p.mjs', uploadLog: true }), /session-log-deepseek/);
  assert.doesNotMatch(dshPatchText({ prompt: '', pluginFile: 'C:/x/p.mjs' }), /atrium-board/);
  const l = dshLaunchFiles({ dir: 'D:\\data\\harness\\dsh', sessionId: 'a/b', prompt: 'p' });
  assert.equal(l.patch, 'D:/data/harness/dsh/a_b.patch.yml');
  assert.equal(l.files[0].text, DSH_BOARD_PLUGIN);
});

test('P270 안내문 플러그인: 시스템 프롬프트에 이름이 겹치지 않는 조각 atrium:board를 더한다(빈 글이면 더하지 않는다)', async () => {
  const f = path.join(tmp(), 'atrium-board.mjs');
  fs.writeFileSync(f, DSH_BOARD_PLUGIN);
  const p = await import(pathToFileURL(f).href);
  assert.equal(p.name, 'atrium-board');
  assert.deepEqual(p.inject, ['systemPrompt']);
  const got = [];
  p.apply({ systemPrompt: { section: (s) => got.push(s) } }, { text: ' 판 안내 ' });
  p.apply({ systemPrompt: { section: (s) => got.push(s) } }, { text: '' });
  assert.deepEqual(got, [{ name: 'atrium:board', order: 10300, text: '판 안내', interpolate: false }]);
});

test('P270 기록: zstd 프레임 여러 개를 이어 푼다. 찢긴 끝 프레임은 버리고, 압축을 끈 기록(.jsonl)은 그대로 읽는다', { skip: !zstdAvailable() }, () => {
  const b1 = [{ type: 'a', n: 1 }], b2 = [{ type: 'b', n: 2 }, { type: 'c', n: 3 }];
  const buf = zstdLog([b1, b2]);
  assert.deepEqual(decodeFrames(buf).trim().split('\n').map((l) => JSON.parse(l).n), [1, 2, 3]);
  const torn = Buffer.concat([buf, zlib.zstdCompressSync(Buffer.from(jl([{ type: 'd', n: 4 }]))).subarray(0, 12)]);
  assert.deepEqual(decodeFrames(torn).trim().split('\n').map((l) => JSON.parse(l).n), [1, 2, 3]);
  assert.equal(decodeFrames(Buffer.from(jl(b1))), jl(b1));
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'session.v3.jsonl.zstd'), buf);
  fs.writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), buf);
  assert.equal(path.basename(logFileIn(dir)), 'session.v4.jsonl.zstd');
});

test('P270 이어 가기 ID: 그 폴더에서 띄운 뒤 생긴 맨 위 세션(하위 에이전트·다른 폴더·판의 다른 세션이 가진 것은 뺀다)', { skip: !zstdAvailable() }, async () => {
  const home = tmp();
  const since = Date.now();
  writeSession(home, 'C:/w/a', 'sub-1', [[]], { depth: 1, at: since + 10 });
  writeSession(home, 'C:/w/other', 'oth-1', [[]], { at: since + 10 });
  writeSession(home, 'C:/w/a', 'taken-1', [[]], { at: since + 20 });
  const f = writeSession(home, 'C:/w/a', 'mine-1', [[{ type: 'turn/start' }]], { at: since + 30 });
  assert.equal(dshSessionOf({ cwd: 'C:\\w\\A\\', since, home, exclude: ['taken-1'] }), 'mine-1');
  assert.equal(dshSessionOf({ cwd: 'C:/w/none', since, home }), null);
  assert.equal(readDshHeader(f).id, 'mine-1');
  assert.equal(findDshSession(home, 'mine-1'), f);
  assert.equal(findDshSession(home, 'nope'), null);
  assert.equal(dshSessionOf({ cwd: 'C:/w/a', since, home: path.join(home, 'missing') }), null);
});

test('P270 마지막 답·지금 모델·토큰: 마지막 assistant/message 글(진행 줄 ⏵는 뗀다), 마지막 request/header의 제공자/모델과 노력 수준', { skip: !zstdAvailable() }, () => {
  const home = tmp();
  const ev = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'request/header', data: { header: { config: { provider: 'bai', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' } } } },
    { type: 'assistant/message', time: 100, data: { turn: 1, message: { role: 'assistant', content: [{ type: 'reasoning', text: 'think' }, { type: 'text', text: '⏵ Checking the files\n\nAll good.' }] }, usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 5 } } },
    { type: 'assistant/message', time: 110, data: { turn: 1, message: { role: 'assistant', content: [{ type: 'reasoning', text: 'no text' }] }, usage: { inputTokens: 1, outputTokens: 1 } } },
    { type: 'turn/end', time: 120, data: { turn: 1, reason: { kind: 'completed' } } },
  ];
  const s = dshSummary(ev);
  assert.deepEqual(s.answer, { text: 'All good.', at: 100, turn: 1 });
  assert.equal(s.open, false);
  assert.equal(s.model, 'bai/deepseek-v4.1-flash');
  assert.equal(s.effort, 'high');
  assert.deepEqual(s.usage, { input: 11, output: 3, cacheRead: 5 });
  assert.equal(dshSummary([{ type: 'turn/start' }]).open, true);
  const f = writeSession(home, 'C:/w/a', 's1', [ev.slice(0, 3), ev.slice(3)]);
  assert.equal(readDshLastAnswer(f).text, 'All good.');
  assert.equal(readDshEvents(f)[0].type, 'session');
  const st = refreshDshModel(f, null);
  assert.equal(st.model, 'bai/deepseek-v4.1-flash');
  assert.equal(refreshDshModel(f, st), st); // 크기가 그대로면 다시 읽지 않는다
  assert.equal(refreshDshModel(path.join(home, 'gone'), null), null);
});

test('P270 화면: 입력을 잡는 창(첫 실행 안내·별 요청), dsh-TUI 입력 칸(빈 칸·쓴 글·보낸 글 확인)', () => {
  assert.equal(dshGateOf(GUIDE), 'guide');
  assert.equal(dshGateOf('  欢迎使用 dsh-TUI  第 2 / 4 步'), 'guide');
  assert.equal(dshGateOf(STAR), 'star');
  assert.equal(dshGateOf(CHAT), null);
  assert.equal(dshGateOf('Welcome to dsh-TUI'), null);
  const b = dshInputBox(CHAT);
  assert.equal(b.found, true);
  assert.equal(b.text, '');
  assert.equal(dshInputBox(CHAT.replace('⌸ ❯              ', '⌸ ❯ hello there  ')).text, 'hello there');
  assert.equal(dshInputBox(GUIDE).found, false);
  assert.deepEqual(promptOnScreen(CHAT, 'Reply with exactly one word: ready', 'dsh'), { box: 'empty', seen: true });
  assert.equal(promptOnScreen(CHAT.replace('⌸ ❯                         ', '⌸ ❯ please do the thing now '), 'please do the thing now and report', 'dsh').box, 'ours');
});

test('P270 hc 앱 이름: dsh-TUI는 7501 앱 이름 dsh-tui로 알린다 → 판 종류 dsh', () => {
  assert.equal(kindOfApp('dsh-tui'), 'dsh');
});

test('P270 hc: dsh-TUI 첫 실행 안내가 보이는 동안 막힘을 흉내 내고 글을 거부한다. 안내가 닫히고 잠시 뒤 코어의 상태로 돌아가 글을 받는다', async () => {
  const fake = await startFakeHc();
  fake.screenOf = (t) => (t.argv[0] === 'dsh-tui' ? GUIDE : null); // 화면은 만들 때 정하고, 그 뒤는 fake.terms의 screen을 바꾼다
  const a = new HcAdapter({ session: 'p270-unit', dataDir: null, pipe: fake.pipe, env: {}, moveWaitMs: 500, trustPollMs: 30, dshGateWatchMs: 3000 });
  a.dshSettleMs = 150;
  const ev = [];
  a.on('event', (e) => ev.push(e));
  a.startEvents();
  try {
    await until(() => a.connected);
    const ws = await a.createWorkspace({ cwd: 'C:/w' });
    const r = await a.startAgent({ name: 'd1', paneId: ws.paneId, kind: 'dsh', command: ['dsh-tui'], args: ['--patch', 'x.patch.yml'] });
    const addr = r.agent.paneId;
    fake.setStatus(addr, { app: 'dsh-tui', state: 'idle' });
    const blocked = await until(() => ev.find((e) => e.type === 'status' && e.paneId === addr && e.status === 'blocked'));
    assert.equal(blocked.detail.app, 'dsh-tui');
    await assert.rejects(a.prompt('d1', 'hello'), (e) => e.code === 'agent_blocked');
    assert.deepEqual(fake.terms.get(addr).sent, []);
    // 사람이 터미널에서 안내를 닫는다 → 잠시 뒤 코어의 상태(idle)로 돌아간다
    fake.terms.get(addr).screen = CHAT;
    const back = await until(() => ev.find((e) => e.type === 'status' && e.paneId === addr && e.status === 'idle' && ev.indexOf(e) > ev.indexOf(blocked)));
    assert.ok(back);
    assert.equal(ev.some((e) => e.type === 'agent_released'), false);
    await a.prompt('d1', 'hello');
    assert.deepEqual(fake.terms.get(addr).sent, ['hello']);
  } finally { a.stopEvents(); await fake.close(); }
});

test('P270 hc 보내기 직전 확인: 지켜보기가 보기 전에 안내가 그려졌어도(갓 띄움) 글을 거부한다', async () => {
  const fake = await startFakeHc();
  fake.screenOf = (t) => (t.argv[0] === 'dsh-tui' ? CHAT : null);
  const a = new HcAdapter({ session: 'p270-unit2', dataDir: null, pipe: fake.pipe, env: {}, moveWaitMs: 500, trustPollMs: 5000, dshGateWatchMs: 0 });
  a.startEvents();
  try {
    await until(() => a.connected);
    const ws = await a.createWorkspace({ cwd: 'C:/w' });
    const r = await a.startAgent({ name: 'd2', paneId: ws.paneId, kind: 'dsh', command: ['dsh-tui'] });
    const addr = r.agent.paneId;
    fake.setStatus(addr, { app: 'dsh-tui', state: 'idle' });
    await until(() => a.model.terms.get(addr) && a.model.terms.get(addr).status);
    setTimeout(() => { fake.terms.get(addr).screen = STAR; }, 300); // 첫 확인 뒤, 다시 보기 전에 창이 뜬다
    await assert.rejects(a.prompt('d2', 'hello'), (e) => e.code === 'agent_blocked' && /star/.test(e.message));
    assert.deepEqual(fake.terms.get(addr).sent, []);
  } finally { a.stopEvents(); await fake.close(); }
});

// P279: 7501 done 때 기록에 그 턴의 마지막 글이 아직 없으면(앞 단계 글만 있고 턴이 열림) 턴이 닫힐 때까지 다시 읽는다
test('P279 dsh 마지막 답: 기록의 턴이 닫힐 때까지 기다리고, 끝내 열려 있으면 본 것 가운데 가장 새 답을 쓴다', async () => {
  const sleep = async () => {};
  const seq = [
    { text: '3 fruits.', at: 200, open: true }, // 도구를 부르기 전 글(턴이 아직 열림)
    { text: '3 fruits.', at: 200, open: true },
    { text: '3 fruits.\n\natrium me reports: ok', at: 210, open: false }, // 마지막 글과 turn/end가 쓰였다
  ];
  let i = 0;
  const a = await waitDshAnswer({ read: () => seq[Math.min(i++, seq.length - 1)], since: 100, sleep });
  assert.equal(a.text, '3 fruits.\n\natrium me reports: ok');
  assert.equal(i, 3);
  // 끝내 열려 있으면 가장 새 답(tries번 읽음)
  let n = 0;
  const b = await waitDshAnswer({ read: () => ({ text: 'step ' + n, at: 300 + n++, open: true }), since: 100, tries: 4, sleep });
  assert.equal(b.text, 'step 3');
  assert.equal(n, 4);
  // 지난번 답보다 새 답이 없으면 null(화면으로 돌아간다), 읽기 오류는 없는 것으로
  assert.equal(await waitDshAnswer({ read: () => ({ text: 'old', at: 100, open: false }), since: 100, tries: 3, sleep }), null);
  assert.equal(await waitDshAnswer({ read: () => { throw new Error('busy'); }, tries: 2, sleep }), null);
  // 닫힌 새 답은 곧바로
  let k = 0;
  const c = await waitDshAnswer({ read: () => { k++; return { text: 'done', at: 500, open: false }; }, since: 100, sleep });
  assert.equal(c.text, 'done'); assert.equal(k, 1);
});
