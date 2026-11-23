// P305: "내 몫" → "할 일"(en "To do"), 카드 종류 "할 일" → "실행"(en "Action"). 응답 필요 알약과 이름이 갈린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, p + k + '.') : [[p + k, v]]));

test('P305 이름: 목록 "할 일"/"To do", 종류 결정·실행·확인·나중에', () => {
  const k = ko.default || ko; const e = en.default || en;
  assert.equal(k.userTasks.pill, '할 일'); assert.equal(k.userTasks.head, '할 일');
  assert.equal(e.userTasks.pill, 'To do'); assert.equal(e.userTasks.head, 'To do');
  assert.deepEqual(k.userTasks.kind, { decide: '결정', do: '실행', check: '확인', later: '나중에', guard: '폭주' }); // P341: guard(판의 폭주 카드)
  assert.deepEqual(e.userTasks.kind, { decide: 'Decide', do: 'Action', check: 'Check', later: 'Later', guard: 'Runaway' });
  assert.equal(k.userTasks.markN, '할 일 {n}'); assert.equal(e.userTasks.markN, 'to do {n}');
  // 응답 필요 알약과 다른 이름
  assert.notEqual(k.userTasks.pill, k.p302 && k.p302.working);
});

test('P305 사전에 옛 이름("내 몫", "For you" 알약)이 남지 않는다', () => {
  for (const [lang, d] of [['ko', ko.default || ko], ['en', en.default || en]]) {
    for (const [key, v] of flat(d)) {
      if (typeof v !== 'string') continue;
      assert.ok(!v.includes('내 몫'), `${lang} ${key}: ${v}`);
      assert.ok(!/"For you"|"Decide" pill|Decide pill/.test(v), `${lang} ${key}: ${v}`);
    }
  }
});

test('P305 두 사전의 키가 같다(userTasks·decisions·autoDecisions·riding)', () => {
  const k = ko.default || ko; const e = en.default || en;
  for (const sec of ['userTasks', 'decisions', 'autoDecisions', 'riding']) {
    assert.deepEqual(flat(k[sec]).map(([x]) => x).sort(), flat(e[sec]).map(([x]) => x).sort(), sec);
  }
});
