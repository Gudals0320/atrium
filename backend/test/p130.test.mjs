// P130: 판이 hc 터미널에 친 키(쓰다 만 글 비키기·되돌리기, 키 패드, 답하기, 끄기의 키)는 AUTOMATIC_INPUT(kind 6)으로 보낸다.
// hc는 attach DATA만 사람 입력으로 세어 그 뒤 terminal.send·keys가 약 3초 조용한 틈을 기다린다. 사람이 판 터미널로 친 키(relay)는 그대로 DATA다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { HcAdapter } from '../src/hc/adapter.mjs';
import { HcController } from '../src/hc/stream.mjs';
import { TerminalRelay } from '../src/relay.mjs';
import { blockReason } from '../src/delivery.mjs';
import { startFakeHc } from './fake-hc.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(20); } throw new Error('timed out'); };
const kinds = (fake, addr) => fake.terms.get(addr).inputKinds;

test('P130 잠깐 붙어 치기: 판이 친 키·글은 kind 6(automatic_input), hc가 받지 않으면 DATA', async () => {
  const fake = await startFakeHc();
  const a = new HcAdapter({ session: 'p130-unit', dataDir: null, pipe: fake.pipe, env: {} });
  try {
    const t = fake.create({ argv: ['claude'] }).result;
    // 쓰다 만 글 비키기의 Ctrl+S(draftIo.type = sendText)
    const k = await a.sendText(t.address, '');
    assert.equal(k.via, 'attach'); assert.equal(k.automatic, true);
    await until(() => fake.terms.get(t.address).inputs.join('') === '\x13');
    assert.deepEqual(kinds(fake, t.address), ['auto']);
    // 되돌리는 붙여넣기(sendText)도 판 입력
    await a.sendText(t.address, 'a\nb');
    await until(() => kinds(fake, t.address).length === 2);
    assert.deepEqual(kinds(fake, t.address), ['auto', 'auto']);
    assert.equal(fake.terms.get(t.address).inputs[1], '\x1b[200~a\nb\x1b[201~');
    // 옛 hc(automatic_input 없음): DATA로 보낸다(키는 들어가고 3초 기다림만 남는다)
    fake.automaticInput = false;
    const old = await a.paneKeys(t.address, ['enter']); // 키 패드·Enter 되살리기
    assert.equal(old.automatic, false);
    await until(() => kinds(fake, t.address).length === 3);
    assert.equal(kinds(fake, t.address)[2], 'data');
  } finally { a.stopEvents(); await fake.close(); }
});

test('P130 붙은 화면 스트림: 사람 입력(relay·input)은 DATA, 판이 친 키(paneKeys·sendText)는 kind 6, 붙기 전 판 입력은 줄 세웠다가 kind 6', async () => {
  const fake = await startFakeHc();
  const a = new HcAdapter({ session: 'p130-unit', dataDir: null, pipe: fake.pipe, env: {}, moveWaitMs: 100 });
  try {
    const t = fake.create({ argv: ['claude'] }).result;
    const c = a.openController(t.address, 100, 30);
    c.inputAuto('\x13'); // 붙기 전: 줄 세움
    await until(() => c.conn && c.ch != null);
    await until(() => kinds(fake, t.address).length === 1);
    assert.equal(c.autoInput, true);
    c.input('hi'); // 사람(창의 xterm → relay)
    await until(() => kinds(fake, t.address).length === 2);
    const r = await a.paneKeys(t.address, ['esc']);
    assert.equal(r.via, 'stream'); assert.equal(r.automatic, true);
    await a.sendText(t.address, 'draft');
    await until(() => kinds(fake, t.address).length === 4);
    assert.deepEqual(fake.terms.get(t.address).inputs, ['\x13', 'hi', '\x1b', 'draft']);
    assert.deepEqual(kinds(fake, t.address), ['auto', 'data', 'auto', 'auto']);
    c.close();
  } finally { a.stopEvents(); await fake.close(); }
});

test('P130 hc가 kind 6을 받지 않는 스트림: 판 입력도 DATA(키가 사라지지 않게)', async () => {
  const fake = await startFakeHc();
  fake.automaticInput = false;
  const c = new HcController({ pipe: fake.pipe, terminal: fake.create({ argv: ['claude'] }).result.address, cols: 80, rows: 24 });
  try {
    await until(() => c.conn && c.ch != null);
    assert.equal(c.autoInput, false);
    c.inputAuto('\x13');
    await until(() => kinds(fake, c.terminal).length === 1);
    assert.deepEqual(kinds(fake, c.terminal), ['data']);
  } finally { c.close(); await fake.close(); }
});

test('P130 사람 입력 판단(B1 규칙 4)은 그대로: relay 입력은 ctl.input(DATA)과 onInput으로, 3초 안이면 user_typing', () => {
  const calls = [];
  const ctl = Object.assign(new EventEmitter(), { pid: 'hc:1', exited: null, resize() {}, close() {}, focus() {}, input(d) { calls.push(['input', d]); }, inputAuto(d) { calls.push(['auto', d]); } });
  const seen = [];
  const relay = new TerminalRelay({ adapter: { openController: () => ctl }, onInput: (sid, d) => seen.push([sid, d]) });
  const client = { clientId: 'A', sendEvent: () => {} };
  relay.attach({ sessionId: 's1', paneId: 't1' }, 100, 30, client);
  relay.input('s1', 'x', client);
  assert.deepEqual(calls, [['input', 'x']]);
  assert.deepEqual(seen, [['s1', 'x']]);
  const now = Date.now();
  const view = { state: 'ready', agentPresent: true, termConnected: true, closed: false };
  assert.equal(blockReason({ ...view, lastUserInputAt: now - 1000 }, now, { inputQuietMs: 3000 }), 'user_typing');
  assert.equal(blockReason({ ...view, lastUserInputAt: now - 3500 }, now, { inputQuietMs: 3000 }), null);
});
