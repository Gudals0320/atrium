// P233 창 단위 시험: rig2-design 11.15. rig 자리 권한 질문의 "이번 한 번만" 줄, 켜기 확인의 정본 차이 글, 두 사전
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onceOnlyLine } from '../src/renderer/lib/labels.js';
import { setLanguage } from '../src/renderer/lib/i18n.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(HERE, '..', 'src', 'renderer', f), 'utf8');

test('P233 응답 필요 줄: rig 자리(ask.onceOnly)의 권한 질문은 받는 선택지만 보이고, rig 밖은 줄이 없다', () => {
  setLanguage('ko');
  const s = { ask: { kind: 'permission', onceOnly: true, hiddenChoices: 3, choices: [{ n: 1, label: 'Yes' }, { n: 5, label: 'No' }] } };
  assert.equal(onceOnlyLine(s), 'rig 자리라 이번 한 번만 받습니다: 1. Yes · 5. No');
  assert.equal(onceOnlyLine({ ask: { kind: 'permission', onceOnly: true } }), ko.rigP233.onceOnlyBare);
  assert.equal(onceOnlyLine({ ask: { kind: 'permission', choices: [{ n: 1, label: 'Yes' }, { n: 2, label: 'Yes, and switch to auto mode' }] } }), '', 'rig 밖');
  assert.equal(onceOnlyLine({ ask: { kind: 'question', onceOnly: true } }), '');
  assert.equal(onceOnlyLine({}), '');
  setLanguage('en');
  assert.equal(onceOnlyLine(s), 'Rig seat, this time only: 1. Yes · 5. No');
  setLanguage('ko');
});

test('P233 두 사전: rigP233 열쇠가 같고, 정본 차이 글에 이름·경로·+n −m, 훅 알림에 settings.local.json', () => {
  assert.deepEqual(Object.keys(ko.rigP233).sort(), Object.keys(en.rigP233).sort());
  for (const k of ['drift']) for (const v of ['{doc}', '{path}', '{added}', '{removed}']) { assert.ok(ko.rigP233[k].includes(v), `ko ${k} ${v}`); assert.ok(en.rigP233[k].includes(v), `en ${k} ${v}`); }
  assert.match(ko.rigP233.drift, /마지막 승인 내용과 다릅니다\(\+\{added\} −\{removed\}\)\. 켜면 지금 내용이 기준이 됩니다/);
  assert.match(ko.rigP232.claudeHooks, /settings\.local\.json/); assert.match(en.rigP232.claudeHooks, /settings\.local\.json/);
  assert.match(ko.rigP233.onceOnlyTip, /허용 목록\(allow\)/);
});

test('P233 창: 켜기 확인 두 곳(만들기 대화상자, 켜기 확인 창)이 정본 차이를 보이고, 응답 필요 줄·말풍선이 한 번만 줄을 보인다', () => {
  assert.match(read('RigSetup.jsx'), /<CanonDrift drift=\{st\.canonDrift\} \/>/);
  assert.match(read('Regions.jsx'), /<CanonDrift drift=\{st\.canonDrift\} \/>/);
  assert.match(read('RigAsks.jsx'), /export function CanonDrift/);
  assert.match(read('Chrome.jsx'), /data-role="ask-once-only"/);
  assert.match(read('SessionNode.jsx'), /data-role="ask-once-only"/);
});
