// P184 시험: Codex(hook 없음)는 터미널 working만으로 제출 확인하지 않는다. 화면에서 입력 칸이 비고 대화에 보낸 글이 보일 때만 확인하고(이유 screen),
// 시작 중에 넣은 첫 요청이 입력 칸에 남았으면 확인하지 않고 쉬게 된 뒤 Enter를 누른다(P79·P106 손쓰기). 다른 종류는 그대로 working으로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DeliveryQueue } from '../src/delivery.mjs';
import { promptOnScreen } from '../src/screen.mjs';
import { childBundle, childShims } from '../src/branch.mjs';
import { writeHarnessFiles } from '../src/launch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cfg = { submitConfirmMs: 30000, deliveryMaxWaitMs: 900000, inputQuietMs: 3000, submitRetryMs: 6000, submitRetries: 2 };
const tick = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const fakeStore = () => ({ rows: new Map(), activeDeliveries: () => [], insertDelivery(d) { this.rows.set(d.deliveryId, { ...d }); }, updateDelivery(id, p) { const r = this.rows.get(id) || {}; Object.assign(r, { status: p.status, reason: p.reason ?? null }); }, getDelivery(id) { return this.rows.get(id) || null; } });
const ASK = 'This is a longer first request to check how Codex handles a pasted prompt while it is still starting up. Reply only with the word PONG2.';
// Codex 화면: 시작 화면 + (대화) + 입력 칸 + 상태 줄
const codexScreen = (box, above = []) => ['  >_ OpenAI Codex (v0.167.2)', '', '  To get started, describe a task or try one of these commands:', '', ...above, '', `› ${box}`, '', '  model-x xhigh · C:\\repo · Ask for approval', '  ? for shortcuts'].join('\n');
const SCR = {
  inBox: codexScreen(ASK, ['Starting MCP servers (4/5): x (2s • esc to interrupt)']), // P181·P184에서 본 화면: 글이 입력 칸에만 있고 MCP 시작이 working으로 읽힌다
  submitted: codexScreen('Ask Codex to do anything', [`› ${ASK}`, '', '• Working (1s • esc to interrupt)']),
  emptyNotSeen: codexScreen('Ask Codex to do anything'),
  loading: 'Loading…',
};

// kind: 세션 종류. screen: 지금 화면(바꿀 수 있다). send는 터미널 흉내
function rig(t, { kind = 'codex', hooked = false, state = 'ready', screen = SCR.inBox, inspect = true } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const log = { sent: [], enter: 0, inspect: 0, events: [], checks: [], recover: [] };
  const v = { state, agentPresent: true, termConnected: true, closed: false, lastUserInputAt: 0, kind, hooked };
  const cur = { screen };
  const q = new DeliveryQueue({
    store: fakeStore(), cfg, view: () => v,
    send: async (sid, text) => { log.sent.push(text); },
    ...(inspect ? { inspect: async (sid, text) => { log.inspect++; return kind === 'codex' ? { ...promptOnScreen(cur.screen, text, 'codex'), noResend: true } : promptOnScreen(cur.screen, text, 'claude'); }, pressEnter: async () => { log.enter++; } } : {}),
  });
  q.on('delivery', (d) => log.events.push(`${d.status}${d.reason ? `(${d.reason})` : ''}`));
  q.on('screen_check', (r) => log.checks.push(r.why));
  q.on('recover', (r) => log.recover.push(`${r.action}·${r.box}`));
  const step = async (ms) => { t.mock.timers.tick(ms); q.pump(); await tick(); };
  return { q, log, v, cur, step };
}
async function sendOne(r) {
  const d = r.q.enqueue('s', ASK);
  await tick();
  assert.equal(d.status, 'sent');
  return d;
}

test('P184 고치기 전 재현: Codex 입력 칸에 글이 남았는데 working(MCP 시작)이 오면 확인으로 적었다 → 이제 확인하지 않는다', async (t) => {
  const r = rig(t);
  const d = await sendOne(r);
  r.v.state = 'working'; // MCP 서버 시작 표시를 터미널이 working으로 읽는다
  assert.equal(r.q.onAgentWorking('s'), null, 'working만으로는 확인하지 않는다');
  await tick();
  assert.equal(d.status, 'sent');
  assert.deepEqual(r.log.checks, ['in_box'], '화면을 보고 입력 칸에 남은 것을 안다');
  for (let i = 0; i < 80; i++) await r.step(500); // 40초 동안 working(시작이 느림)
  assert.equal(d.status, 'sent', '일하는 중(시작 중)에는 확인 못 함으로 끝내지 않는다');
  assert.equal(r.log.enter, 0, '일하는 중에는 Enter를 누르지 않는다(준비될 때까지 기다린다)');
  assert.equal(r.log.sent.length, 1);
});

test('P184 시작이 끝나 쉬면 입력 칸에 남은 첫 요청에 Enter를 누르고, 화면에 제출된 것을 본 뒤에만 확인한다(두 번 넣지 않음)', async (t) => {
  const r = rig(t);
  const d = await sendOne(r);
  r.v.state = 'working'; r.q.onAgentWorking('s'); await tick();
  for (let i = 0; i < 20; i++) await r.step(500); // 10초 시작 중
  r.v.state = 'ready'; // MCP 시작이 끝났다
  for (let i = 0; i < 4 && r.log.enter === 0; i++) await r.step(500);
  assert.equal(r.log.enter, 1, '준비되자 Enter 한 번');
  assert.equal(d.status, 'sent', 'Enter만으로는 확인하지 않는다');
  r.cur.screen = SCR.submitted; r.v.state = 'working'; r.q.onAgentWorking('s'); await tick();
  assert.equal(d.status, 'confirmed');
  assert.equal(d.reason, 'screen');
  assert.equal(r.log.sent.length, 1, '글은 한 번만 넣었다');
  assert.ok(r.log.events.includes('confirmed(screen)'));
});

test('P184 Enter가 한동안 줄바꿈으로만 들어가도(부하) 입력 칸에 글이 남아 있는 동안 Enter를 더 누르고, 제출되면 확인한다', async (t) => {
  const r = rig(t);
  const d = await sendOne(r);
  r.v.state = 'working'; r.q.onAgentWorking('s'); await tick();
  assert.equal(r.q.unsubmitted('s'), true, '입력 칸에 남았다(이 사이 끝난 턴은 답이 아니다)');
  r.v.state = 'ready';
  for (let i = 0; i < 120 && r.log.enter < 5; i++) await r.step(500); // Enter 다섯 번까지 제출되지 않는다
  assert.equal(r.log.enter, 5, `Enter ${r.log.enter}번(예전 상한 2번을 넘는다)`);
  assert.equal(d.status, 'sent', '확인 기한(30초)이 지나도 손쓰는 동안은 끝내지 않는다');
  r.cur.screen = SCR.submitted; await r.step(1600);
  assert.equal(d.status, 'confirmed'); assert.equal(d.reason, 'screen');
  assert.equal(r.log.sent.length, 1);
  assert.equal(r.q.unsubmitted('s'), false);
});

test('P184 Enter 상한(codexEnterRetries)을 넘도록 입력 칸에 남으면 확인 못 함으로 끝낸다', async (t) => {
  const r = rig(t);
  const d = await sendOne(r);
  for (let i = 0; i < 400 && d.status === 'sent'; i++) await r.step(500);
  assert.equal(d.status, 'unconfirmed');
  assert.equal(r.log.enter, 8, 'Enter는 8번까지');
  assert.equal(r.log.sent.length, 1, '다시 넣지 않는다');
});

test('P184 제대로 제출된 Codex 요청은 working이 오면 곧바로 화면으로 확인한다', async (t) => {
  const r = rig(t, { screen: SCR.submitted });
  const d = await sendOne(r);
  r.v.state = 'working'; r.q.onAgentWorking('s'); await tick();
  assert.equal(d.status, 'confirmed'); assert.equal(d.reason, 'screen');
  assert.equal(r.log.enter, 0);
});

test('P184 working이 agent.prompt 응답보다 먼저 와도(sending 중) 화면으로 본다', async (t) => {
  const r = rig(t);
  let release;
  r.q.send = (sid, text) => new Promise((res) => { r.log.sent.push(text); release = res; });
  const d = r.q.enqueue('s', ASK); await tick();
  assert.equal(d.status, 'sending');
  r.v.state = 'working'; r.q.onAgentWorking('s');
  release(); await tick();
  assert.equal(d.status, 'sent', '입력 칸에 남았으면 sending 중 working도 확인이 아니다');
  r.cur.screen = SCR.submitted; await r.step(1600);
  assert.equal(d.status, 'confirmed'); assert.equal(d.reason, 'screen');
});

test('P184 working 신호를 놓쳐도 Codex는 screenCheckMs마다 화면을 보고 확인한다', async (t) => {
  const r = rig(t, { screen: SCR.emptyNotSeen });
  const d = await sendOne(r);
  await r.step(1600);
  assert.equal(d.status, 'sent', '입력 칸이 비었어도 대화에 보이지 않으면 확인하지 않는다');
  assert.deepEqual(r.log.checks, ['not_seen']);
  r.cur.screen = SCR.submitted; await r.step(1600);
  assert.equal(d.status, 'confirmed'); assert.equal(d.reason, 'screen');
});

test('P184 화면을 못 읽으면(뜨는 중) 확인하지 않고 다시 본다', async (t) => {
  const r = rig(t, { screen: SCR.loading });
  const d = await sendOne(r);
  r.v.state = 'working'; r.q.onAgentWorking('s'); await tick();
  assert.equal(d.status, 'sent'); assert.deepEqual(r.log.checks, ['unknown']);
  r.cur.screen = SCR.submitted; await r.step(1600);
  assert.equal(d.status, 'confirmed');
});

test('P184 다른 종류는 그대로: hook 없는 Claude Code·opencode·pi는 working으로 확인, hook 있는 Claude Code는 UserPromptSubmit으로 확인', async (t) => {
  for (const kind of ['claude', 'opencode', 'pi']) {
    const r = rig(t, { kind, screen: SCR.inBox });
    const d = await sendOne(r);
    r.v.state = 'working'; r.q.onAgentWorking('s'); await tick();
    assert.equal(d.status, 'confirmed', kind); assert.equal(d.reason, 'term working', kind);
    assert.equal(r.log.inspect, 0, `${kind}: 화면을 보지 않는다`);
    t.mock.timers.reset();
  }
  const r = rig(t, { kind: 'claude', hooked: true });
  const d = await sendOne(r);
  r.q.onUserPromptSubmit('s', ASK);
  assert.equal(d.status, 'confirmed'); assert.equal(d.reason, null);
});

test('P184 화면 읽기가 없는 판(inspect 없음)의 Codex는 예전처럼 working으로 확인한다', async (t) => {
  const r = rig(t, { inspect: false });
  const d = await sendOne(r);
  r.v.state = 'working'; r.q.onAgentWorking('s'); await tick();
  assert.equal(d.status, 'confirmed'); assert.equal(d.reason, 'term working');
});

test('P184 하네스 bin에 atrium 명령 코드를 함께 두고(lib/), 판 코드 폴더 없이 그것만으로 돈다', async () => {
  const lib = childBundle();
  assert.deepEqual(Object.keys(lib).sort(), ['bin/atrium-child.mjs', 'src/cli-contract.mjs', 'src/codex-models.mjs', 'src/config.mjs', 'src/model-name.mjs', 'src/usage-text.mjs']); // P211: atrium usage 글
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p184-bin-'));
  try {
    const binDir = path.join(tmp, 'bin');
    const shims = childShims({ script: path.join(binDir, 'lib', 'bin', 'atrium-child.mjs') });
    writeHarnessFiles({ dir: path.join(tmp, 'plugin'), binDir, bin: shims, lib, prompt: 'x' });
    assert.ok(fs.readFileSync(path.join(binDir, 'atrium.cmd'), 'utf8').includes(path.join(binDir, 'lib', 'bin', 'atrium-child.mjs')), '.cmd가 bin/lib의 코드를 부른다');
    assert.ok(fs.readFileSync(path.join(binDir, 'atrium'), 'utf8').includes(`${binDir.split(path.sep).join('/')}/lib/bin/atrium-child.mjs`));
    const r = spawnSync(process.execPath, [path.join(binDir, 'lib', 'bin', 'atrium-child.mjs'), 'help'], { encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /atrium help/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('P184 화면 판정: 첫 줄이 짧은 여러 줄 글도 대화에 보이면 seen', () => {
  const multi = 'Do this now:\n1. write a.txt\n2. reply DONE';
  const scr = codexScreen('Ask Codex to do anything', ['› Do this now:', '  1. write a.txt', '  2. reply DONE', '', '• Working']);
  assert.deepEqual(promptOnScreen(scr, multi, 'codex'), { box: 'empty', seen: true });
  assert.equal(promptOnScreen(SCR.inBox, ASK, 'codex').box, 'ours');
  assert.equal(promptOnScreen(SCR.inBox, ASK, 'codex').seen, false);
});
