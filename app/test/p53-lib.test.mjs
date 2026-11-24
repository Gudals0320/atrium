// P53 시험: 영어의 "Prompt" 두 뜻 나누기(#9). (#10 변경 내역의 백엔드 줄 이름표는 P347에서 변경 내역과 함께 걷었다)
import test from 'node:test';
import assert from 'node:assert/strict';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

test('P53 #9: 영어에서 셸의 명령 대기는 요청 이름표(Prompt)와 다른 말이다', () => {
  for (const r of [en.node.prompt, en.convo.prompt]) assert.equal(r, 'Prompt');
  for (const v of [en.workspaces.shellPrompt, en.chat.prompt, en.chat.promptLast.replace('{cmd}', 'ls')]) {
    assert.ok(!/^Prompt\b/.test(v), v);
    assert.match(v, /^Waiting for command/);
  }
  // 한국어도 두 뜻이 다르다(P39 용어표: 요청 / 명령 입력 대기)
  assert.equal(ko.node.prompt, '요청');
  assert.equal(ko.workspaces.shellPrompt, '명령 입력 대기');
  assert.ok(ko.chat.promptLast.startsWith(ko.chat.prompt));
  assert.ok(en.chat.promptLast.startsWith(en.chat.prompt));
});
