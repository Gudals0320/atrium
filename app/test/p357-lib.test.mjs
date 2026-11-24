// P357: 결정 카드 알림을 누르면 그 카드로(lib/push.js 카드 번호), 카드가 지금 어디 있나(lib/decisions.js cardPlace), 종류 꼬리표 말 하나(kindWord, 두 사전)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kindWord, cardPlace, KINDS } from '../src/renderer/lib/decisions.js';
import { notificationOf, clickUrl, cardParam, cardIdOf, openParam } from '../src/renderer/lib/push.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const get = (o, k) => k.split('.').reduce((a, x) => (a == null ? a : a[x]), o);

test('P357 종류 꼬리표: 모든 종류가 한 사전 열쇠(userTasks.kind)이고 두 사전에 있다. 휴대폰의 옛 말(kind_do 할 일)은 없다', () => {
  for (const k of KINDS) { assert.equal(kindWord(k), `userTasks.kind.${k}`); assert.ok(get(ko, kindWord(k)), k); assert.ok(get(en, kindWord(k)), k); }
  assert.equal(kindWord('weird'), 'userTasks.kind.decide');
  assert.deepEqual([ko.userTasks.kind.decide, ko.userTasks.kind.do, ko.userTasks.kind.check, ko.userTasks.kind.later, ko.userTasks.kind.guard], ['결정', '실행', '확인', '나중에', '폭주']);
  assert.equal(ko.mobile.kind_do, undefined); assert.equal(en.mobile.kind_do, undefined);
  for (const k of ['cardGone']) { assert.ok(ko.mobile[k]); assert.ok(en.mobile[k]); }
  assert.deepEqual(Object.keys(ko.termAnswered).sort(), Object.keys(en.termAnswered).sort());
  assert.equal(ko.termAnswered.tag, '터미널에서 답함');
  // 휴대폰·PC 카드가 같은 열쇠를 쓴다(옛 mobile.kind_ 열쇠를 부르지 않는다)
  const mob = fs.readFileSync(path.join(HERE, '../src/renderer/MobileApp.jsx'), 'utf8');
  const pc = fs.readFileSync(path.join(HERE, '../src/renderer/Decisions.jsx'), 'utf8');
  assert.ok(!mob.includes('mobile.kind_')); assert.ok(mob.includes('kindWord(d.kind)')); assert.ok(pc.includes('kindWord(d.kind)'));
});

test('P357 알림 누르기: 카드 번호를 알림 data에 싣고, 새로 여는 주소에 ?card=를 더한다', () => {
  const n = notificationOf({ v: 1, title: 'x', body: 'y', tag: 'atrium-s1', sessionId: 's1', kind: 'decision', decisionId: 12 });
  assert.equal(n.options.data.decisionId, 12); assert.equal(n.options.data.sessionId, 's1');
  assert.equal(notificationOf({ v: 1, sessionId: 's1', kind: 'done' }).options.data.decisionId, undefined);
  assert.equal(notificationOf({ v: 1, sessionId: 's1', kind: 'decision', decisionId: '12; drop' }).options.data.decisionId, undefined);
  assert.equal(clickUrl({ sessionId: 's1', decisionId: 12 }, '/app/'), '/app/?open=s1&card=12');
  assert.equal(clickUrl({ sessionId: 's1' }, '/app/'), '/app/?open=s1');
  assert.equal(cardParam('?open=s1&card=12'), 12); assert.equal(openParam('?open=s1&card=12'), 's1');
  assert.equal(cardParam('?card=-1'), null); assert.equal(cardParam('?card=abc'), null); assert.equal(cardParam(''), null);
  assert.equal(cardIdOf(3.5), null); assert.equal(cardIdOf('7'), 7);
});

test('P357 알림을 눌러 온 카드: 지금 목록 · 나중 묶음 · 이미 닫힘', () => {
  const cards = [{ id: 1, deferred: false }, { id: 2, deferred: true }];
  assert.equal(cardPlace(cards, 1), 'active');
  assert.equal(cardPlace(cards, '2'), 'later');
  assert.equal(cardPlace(cards, 3), 'gone');
  assert.equal(cardPlace(null, 1), 'gone');
});
