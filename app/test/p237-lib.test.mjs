// P237 창 단위 시험: rig2-design 11.18의 둘째. 보내기 칸의 "회 없이"는 받는 세션에 rig 자리가 있을 때만 보이고 talk 칸을 실는다. 두 사전
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { talkSeats, talkParam } from '../src/renderer/lib/talk.js';
import { recipients } from '../src/renderer/lib/cmd-input.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const S = [
  { sessionId: 'a', name: 'main', kind: 'claude', rigSeat: 'main' },
  { sessionId: 'b', name: 'other', kind: 'claude', rigSeat: null },
  { sessionId: 'c', name: 'sh', kind: 'shell', rigSeat: null },
];

test('P237 "회 없이": 받는 세션 가운데 rig 자리 세션만', () => {
  assert.deepEqual(talkSeats(recipients('@main rig 고치자', S), S), ['main']);
  assert.deepEqual(talkSeats(recipients('@other 글', S), S), [], 'rig 자리가 아니면 보이지 않는다');
  assert.deepEqual(talkSeats(recipients('@other @main 글', S), S), ['main']);
  assert.deepEqual(talkSeats(recipients('@all 글', S), S), ['main'], '@all은 판의 rig 자리 세션');
  assert.deepEqual(talkSeats(recipients('@nobody 글', S), S), []);
  assert.deepEqual(talkSeats(recipients('글만', S), S), []);
});

test('P237 "회 없이": 켰고 보일 때만 session.send에 talk를 싣는다', () => {
  assert.deepEqual(talkParam(true, true), { talk: true });
  assert.deepEqual(talkParam(true, false), {}, '받는 rig 자리가 없으면 싣지 않는다');
  assert.deepEqual(talkParam(false, true), {});
});

test('P237 두 사전과 창 코드', () => {
  for (const L of [ko, en]) {
    assert.ok(L.cmdTalk && L.cmdTalk.label && L.cmdTalk.title);
    assert.equal(L.cmdTalk.phoneTitle, undefined, '휴대폰에는 "회 없이"가 없다(11.18)');
    assert.match(L.cmdTalk.title, /\{names\}/);
  }
  assert.equal(ko.cmdTalk.label, '회 없이');
  assert.equal(en.cmdTalk.label, 'No run');
  const cb = fs.readFileSync(path.join(HERE, '..', 'src', 'renderer', 'CommandBar.jsx'), 'utf8');
  assert.match(cb, /talkTo\.length > 0 && \(/, '받는 rig 자리가 있을 때만 단추');
  assert.match(cb, /data-action="cmd-talk"/);
  assert.match(cb, /talkParam\(talkRef\.current\.on, talkRef\.current\.offered\)/);
  const ph = fs.readFileSync(path.join(HERE, '..', 'src', 'renderer', 'Phone.jsx'), 'utf8');
  assert.ok(!/talk/.test(ph), '휴대폰 입력 줄에는 "회 없이"를 두지 않는다(보내면 보내기 칸처럼 회가 열린다)');
});
