// P264 단위 시험: Codex에 긴 글 넣기. 붙여 넣은 글이 입력 칸에 다 들어갔는지 화면으로 보기(codexPasteState),
// 판이 붙여 넣고 본 뒤 Enter(어댑터 pastePrompt, 가짜 hc), 판의 보내기가 Codex 여러 줄·긴 글만 이 길로 보내는가(sendPrompt)
import test from 'node:test';
import assert from 'node:assert/strict';
import { codexPasteState, codexPasteWanted, promptOnScreen } from '../src/screen.mjs';
import { HcAdapter } from '../src/hc/adapter.mjs';
import { Backend } from '../src/backend.mjs';
import { startFakeHc } from './fake-hc.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(20); } throw new Error('timed out'); };
// Codex 화면(입력 칸은 아래쪽 마지막 "› " 줄, 그 아래 빈 줄과 모델 줄)
const cx = (box) => `  >_ OpenAI Codex (v0.167.2)\n\n• OK\n\n› ${box}\n\n  GPT · C:\\w · Ask for approval\n  ← for agents · ? for shortcuts\n`;
const long = ['첫 줄: "quoted" and ' + "'single'" + ' back' + String.fromCharCode(92) + 'slash 한글', ...Array.from({ length: 11 }, (_, i) => `Line ${i + 1}: filler text 줄 ${i + 1}`)].join('\n');

test('P264 codexPasteState: 접힌 자리표시의 글자 수가 보낸 글에 닿았는가, 펼친 글은 끝이 보낸 글의 끝인가', () => {
  const n = [...long].length;
  assert.deepEqual(codexPasteState(cx(`[Pasted Content ${n} chars]`), long), { box: `[Pasted Content ${n} chars]`, done: true });
  assert.equal(codexPasteState(cx(`[Pasted Content ${n + 1} chars]`), long).done, true); // 줄바꿈 하나가 더 붙어도 다 들어갔다
  assert.equal(codexPasteState(cx(`[Pasted Content ${n - 200} chars]`), long).done, false); // 아직 받는 중
  assert.equal(codexPasteState(cx(`[Pasted Content 9 chars][Pasted Content ${n} chars]`), long).done, true); // 앞에 남은 글이 있어도 마지막 자리표시로 본다
  // 1,000자 아래는 입력 칸에 펼쳐진다(꺾인 줄은 들여 써 이어짐)
  const short = 'line one "q"\nline two \\\\ end of 한글 text here';
  assert.equal(codexPasteState(cx('line one "q" line two \\\\ end of 한글\n  text here'), short).done, true);
  assert.equal(codexPasteState(cx('line one "q" line two'), short).done, false);
  // 빈 칸·안내 글·입력 칸 없음
  assert.deepEqual(codexPasteState(cx('Ask Codex to do anything'), long), { box: '', done: false });
  assert.deepEqual(codexPasteState('no codex here', long), { box: '', done: false });
  // CRLF는 LF로 센다
  assert.equal(codexPasteState(cx(`[Pasted Content ${n} chars]`), long.replace(/\n/g, '\r\n')).done, true);
  // 제출 확인(promptOnScreen)은 자리표시를 보낸 글로 본다(그대로)
  assert.equal(promptOnScreen(cx(`[Pasted Content ${n} chars]`), long, 'codex').box, 'ours');
});

test('P264 codexPasteWanted: 여러 줄·긴 글은 판이 붙여 넣는다(P271: 짧은 한 줄도)', () => {
  assert.equal(codexPasteWanted('one line'), true);
  assert.equal(codexPasteWanted('x'.repeat(200)), true);
  assert.equal(codexPasteWanted('x'.repeat(201)), true);
  assert.equal(codexPasteWanted('a\nb'), true);
  assert.equal(codexPasteWanted(''), false);
});

test('P264 어댑터 pastePrompt(가짜 hc): bracketed paste → 화면에 다 들어간 뒤 Enter, 막힘·에이전트 없음 거부, 기한 넘으면 Enter 없음', async () => {
  const fake = await startFakeHc();
  const a = new HcAdapter({ session: 'p264-unit', dataDir: null, pipe: fake.pipe, env: {} });
  try {
    const r = fake.create({ argv: ['codex'], name: 'cx', cwd: 'C:/w' }).result;
    const t = fake.terms.get(r.address);
    t.screen = cx('Ask Codex to do anything');
    await until(() => t.status && t.status.state === 'idle');
    const n = [...long].length;
    // 붙여 넣은 뒤 300ms 동안은 빈 칸(Codex가 받는 중), 그 뒤 자리표시
    const shown = until(() => t.inputs.length >= 1).then(async () => { await sleep(300); t.screen = cx(`[Pasted Content ${n} chars]`); await until(() => t.inputs.length >= 2); t.screen = cx('Ask Codex to do anything'); }); // P271: Enter에 제출되면 입력 칸이 빈다
    const t0 = Date.now();
    const res = await a.pastePrompt('cx', long.replace(/\n/g, '\r\n'), { state: (s) => codexPasteState(s, long), pollMs: 20, stableMs: 5000 });
    await shown;
    assert.equal(res.entered, true); assert.equal(res.why, 'shown');
    assert.ok(Date.now() - t0 >= 300, 'Enter는 화면에 다 들어간 뒤');
    await until(() => t.inputs.length >= 2);
    assert.deepEqual(t.inputs, [`\x1b[200~${long}\x1b[201~`, '\r']); // CRLF는 LF로, 붙여 넣기 한 번 뒤 Enter 한 번
    assert.deepEqual(t.inputKinds, ['auto', 'auto']); // 판 입력(사람 입력으로 세지 않는다, P130)
    assert.deepEqual(t.sent, []); // hc terminal.send(붙여 넣기와 Enter를 함께)는 쓰지 않는다
    // 입력 칸 글이 stableMs 동안 그대로면 다 받은 것으로 보고 Enter(글자 수를 못 맞춰도)
    t.inputs.length = 0; t.inputKinds.length = 0; t.screen = cx('something odd');
    const st = await a.pastePrompt('cx', 'a\nb', { state: (s) => codexPasteState(s, 'zz'), pollMs: 20, stableMs: 150 });
    assert.equal(st.why, 'stable'); assert.equal(st.entered, true);
    // 기한 안에 입력 칸에 아무것도 보이지 않으면 Enter를 치지 않는다(그 뒤는 판의 제출 확인·Enter 손쓰기)
    t.inputs.length = 0; t.inputKinds.length = 0; t.screen = cx('Ask Codex to do anything');
    const to = await a.pastePrompt('cx', 'a\nb', { state: (s) => codexPasteState(s, 'a\nb'), pollMs: 20, timeoutMs: 200 });
    assert.equal(to.entered, false); assert.equal(to.why, 'timeout');
    await sleep(100);
    assert.deepEqual(t.inputs, ['\x1b[200~a\nb\x1b[201~']);
    // 막혔으면(질문 중) 붙여 넣지 않고 agent_blocked(전달은 waiting으로 물러난다)
    fake.setStatus(r.address, { app: 'codex', state: 'blocked', kind: 'permission', msg: 'approve' });
    await until(async () => { const x = await a.getAgent('cx'); return x && x.status === 'blocked'; });
    t.inputs.length = 0;
    await assert.rejects(a.pastePrompt('cx', 'a\nb', { state: () => ({ box: '', done: true }) }), (e) => e.code === 'agent_blocked');
    assert.deepEqual(t.inputs, []);
    // 셸(에이전트 없음)에는 보내지 않는다
    const sh = fake.create({ argv: ['pwsh.exe'], name: 'sh1' }).result;
    await assert.rejects(a.pastePrompt(sh.address, 'a\nb', { state: () => ({ box: '', done: true }) }), (e) => e.code === 'agent_not_found');
  } finally { await fake.close(); }
});

test('P264 판의 보내기: Codex(hook 없음)는 pastePrompt(P271: 짧은 한 줄도), Claude Code·다른 종류는 hc terminal.send 그대로', async () => {
  const calls = [];
  const adapter = {
    prompt: async (target, text) => { calls.push(['prompt', target, text]); return {}; },
    pastePrompt: async (target, text, o) => { calls.push(['paste', target, text, typeof o.state]); return { entered: true }; },
  };
  const sessions = new Map([
    ['c', { kind: 'codex', rt: { hooked: false }, agentName: 'cx' }],
    ['l', { kind: 'claude', rt: { hooked: true }, agentName: 'cl' }],
    ['o', { kind: 'opencode', rt: { hooked: false }, agentName: 'oc' }],
    ['a', { kind: 'agy', rt: { hooked: false }, agentName: 'ag' }],
  ]);
  const b = { sessions, adapter, hooked: Backend.prototype.hooked };
  const send = (sid, text) => Backend.prototype.sendPrompt.call(b, sid, text);
  await send('c', 'one\ntwo'); await send('c', 'x'.repeat(300)); await send('c', 'short one line');
  await send('l', 'one\ntwo'); await send('o', 'one\ntwo'); await send('a', 'one\ntwo');
  assert.deepEqual(calls.map((c) => [c[0], c[1]]), [['paste', 'cx'], ['paste', 'cx'], ['paste', 'cx'], ['prompt', 'cl'], ['prompt', 'oc'], ['prompt', 'ag']]);
  assert.equal(calls[0][3], 'function');
  // 옛 어댑터(pastePrompt 없음)는 예전대로
  calls.length = 0;
  const b2 = { sessions, adapter: { prompt: adapter.prompt }, hooked: Backend.prototype.hooked };
  await Backend.prototype.sendPrompt.call(b2, 'c', 'one\ntwo');
  assert.deepEqual(calls.map((c) => c[0]), ['prompt']);
});
