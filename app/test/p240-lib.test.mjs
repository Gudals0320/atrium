// P240 창 단위 시험: 사람의 "회 없이"가 열린 회 때문에 거절된 실패 칩 글(까닭 코드 rig_run_open → 사전 글, 두 사전)
import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryText } from '../src/renderer/lib/labels.js';
import { setLanguage } from '../src/renderer/lib/i18n.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

test('P240 실패 칩: rig_run_open은 코드 대신 사전 글로(영어·한국어)', () => {
  assert.ok(en.cmdTalk.runOpen && ko.cmdTalk.runOpen, '두 사전에 있다');
  try {
    for (const l of ['en', 'ko']) {
      setLanguage(l);
      const s = deliveryText({ status: 'failed', reason: 'rig_run_open' });
      assert.ok(!s.includes('rig_run_open'), s);
      assert.ok(s.includes((l === 'ko' ? ko : en).cmdTalk.runOpen), s);
    }
  } finally { setLanguage('en'); }
});
