// P176: 음성 입력이 사람 모르게 이어지지 않게. 말 없음 자동 멈춤, 창이 보낸 멈춘 까닭, 끝 줄의 까닭(voice.mjs). 가짜 Soniox로 시험한다
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { VoiceRelay, voiceEndReason, VOICE_IDLE_MS, VOICE_STOP_REASONS } from '../src/voice.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await wait(10); } throw new Error(`timeout: ${fn}`); }

// 가짜 Soniox: 빈 글(소리 끝)이면 finished를 보내고 닫는다. talk(i, text): i번째 연결에 글 토막을 보낸다
async function fakeSoniox() {
  const conns = [];
  const wss = new WebSocketServer({ port: 0 });
  wss.on('connection', (ws) => {
    conns.push(ws);
    ws.on('message', (d, bin) => {
      if (bin) return;
      if (String(d) === '') { ws.send(JSON.stringify({ tokens: [], finished: true })); setTimeout(() => ws.close(), 5); }
    });
  });
  await new Promise((r) => wss.on('listening', r));
  return { url: `ws://127.0.0.1:${wss.address().port}`, conns, talk: (i, text) => conns[i].send(JSON.stringify({ tokens: [{ text, is_final: false }] })), close: () => new Promise((r) => { for (const c of wss.clients) c.terminate(); wss.close(r); }) };
}
const fakeClient = () => { const events = []; return { kind: 'desktop', events, sendEvent: (e, d) => events.push({ e, d }) }; };
const endOf = (c) => c.events.find((x) => x.e === 'voice.end');

test('말 없음 상한은 30초, 창이 보내는 까닭과 창에 알리는 끝 까닭', () => {
  assert.equal(VOICE_IDLE_MS, 30000);
  assert.deepEqual(VOICE_STOP_REASONS, ['user', 'send', 'hidden', 'unmount']);
  for (const r of ['user', 'send', 'hidden', 'unmount', 'replaced']) assert.equal(voiceEndReason(r), 'done');
  for (const r of ['silence', 'limit', 'error', 'dropped']) assert.equal(voiceEndReason(r), r);
});

test('말 없음: 들은 글이 idleMs 동안 새로 오지 않으면 저절로 멈추고 silence로 알린다', async () => {
  const srv = await fakeSoniox();
  const logs = [];
  const v = new VoiceRelay({ getKey: async () => 'k', url: srv.url, log: (m) => logs.push(m), idleMs: 300, finishWaitMs: 500 });
  const c = fakeClient();
  const t0 = Date.now();
  const r = await v.start({}, c);
  // 소리는 계속 와도(조용한 방의 잡음) 들은 글이 없으면 말 없음이다
  const feed = setInterval(() => v.onBinary(c, Buffer.alloc(320)), 50);
  await until(() => endOf(c), 3000);
  clearInterval(feed);
  assert.ok(Date.now() - t0 >= 300, '상한 전에는 멈추지 않는다');
  assert.deepEqual(endOf(c).d, { id: r.id, reason: 'silence' });
  assert.equal(v.streams.size, 0);
  assert.match(logs.find((l) => / end /.test(l)), /^voice v1 end silence /);
  await srv.close();
});

test('말 없음: 들은 글이 오는 동안에는 상한을 다시 잰다', async () => {
  const srv = await fakeSoniox();
  const v = new VoiceRelay({ getKey: async () => 'k', url: srv.url, idleMs: 300, finishWaitMs: 500 });
  const c = fakeClient();
  await v.start({}, c);
  await until(() => srv.conns.length);
  let n = 0;
  const talk = setInterval(() => srv.talk(0, `말${++n}`), 100);
  await wait(700);
  clearInterval(talk);
  assert.equal(endOf(c), undefined, '말하는 동안은 멈추지 않는다');
  await until(() => endOf(c), 3000);
  assert.equal(endOf(c).d.reason, 'silence');
  await srv.close();
});

test('창이 보낸 까닭: 창에는 done, 끝 줄에는 그 까닭(hidden·send·user), 모르는 값은 user', async () => {
  const srv = await fakeSoniox();
  const logs = [];
  const v = new VoiceRelay({ getKey: async () => 'k', url: srv.url, log: (m) => logs.push(m), idleMs: 0 });
  for (const [sent, want] of [['hidden', 'hidden'], ['send', 'send'], [undefined, 'user'], ['bogus', 'user']]) {
    const c = fakeClient();
    const r = await v.start({}, c);
    assert.deepEqual(v.stop({ id: r.id, reason: sent }, c), { ok: true });
    await until(() => endOf(c));
    assert.deepEqual(endOf(c).d, { id: r.id, reason: 'done' });
    assert.match(logs.filter((l) => l.startsWith(`voice ${r.id} end `))[0], new RegExp(`^voice ${r.id} end ${want} `));
  }
  assert.ok(logs.some((l) => /^voice v1 start /.test(l)));
  await srv.close();
});

test('idleMs 0이면 말 없음으로 멈추지 않는다(10분 상한은 그대로)', async () => {
  const srv = await fakeSoniox();
  const v = new VoiceRelay({ getKey: async () => 'k', url: srv.url, idleMs: 0, maxMs: 400, finishWaitMs: 200 });
  const c = fakeClient();
  await v.start({}, c);
  await until(() => endOf(c), 3000);
  assert.equal(endOf(c).d.reason, 'limit');
  await srv.close();
});
