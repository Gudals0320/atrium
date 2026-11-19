// P252 창 단위 시험: 박자·도구 주기를 사람 말로(periodText, ko·en, 모르는 꼴은 그대로), 기다리는 올림 줄(raiseRows), 조정 기록의 올림 답 줄, 두 사전의 새 글
import test from 'node:test';
import assert from 'node:assert/strict';
import { periodText } from '../src/renderer/lib/rig-map.js';
import { raiseRows, tuneLogRows } from '../src/renderer/lib/rig.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

// 사전 하나로 도는 작은 t(창의 i18n과 같은 {이름} 채우기와 { one, other } 고르기)
const tOf = (d, lang) => (key, vars = {}) => {
  let v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), d);
  if (v && typeof v === 'object') v = v[new Intl.PluralRules(lang).select(Number(vars.n))] ?? v.other;
  assert.equal(typeof v, 'string', key);
  return v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
};
const tk = tOf(ko, 'ko'); const te = tOf(en, 'en');

test('P252 periodText: 하루 박자와 at, 시간·분·초, 소수, 하루가 아닌 주기의 기준 시각(ko·en)', () => {
  assert.equal(periodText('1d', '07:00', tk), '매일 07:00');
  assert.equal(periodText('1d', '07:00', te), 'every day 07:00');
  assert.equal(periodText('1d', null, tk), '매일');
  assert.equal(periodText('2d', '06:30', tk), '2일마다 06:30');
  assert.equal(periodText('2d', '06:30', te), 'every 2 days 06:30');
  assert.equal(periodText('6h', null, tk), '6시간마다');
  assert.equal(periodText('6h', null, te), 'every 6 hours');
  assert.equal(periodText('1h', null, tk), '매시간');
  assert.equal(periodText('1h', null, te), 'every hour');
  assert.equal(periodText('30m', null, tk), '30분마다');
  assert.equal(periodText('30m', null, te), 'every 30 minutes');
  assert.equal(periodText('1m', null, te), 'every minute');
  assert.equal(periodText('45s', null, tk), '45초마다');
  assert.equal(periodText('1.5h', null, tk), '1.5시간마다');
  assert.equal(periodText('1.5h', null, te), 'every 1.5 hours');
  assert.equal(periodText('6h', '07:00', tk), '6시간마다(07:00 기준)');
  assert.equal(periodText('6h', '07:00', te), 'every 6 hours from 07:00');
});

test('P252 periodText: 꼴을 모르는 값은 원래 값 그대로', () => {
  for (const t of [tk, te]) {
    assert.equal(periodText('weekly', null, t), 'weekly');
    assert.equal(periodText('1w', null, t), '1w');
    assert.equal(periodText('90', null, t), '90');
    assert.equal(periodText('weekly', '07:00', t), 'weekly 07:00');
    assert.equal(periodText(null, '07:00', t), '07:00');
    assert.equal(periodText('', null, t), '');
  }
});

test('P252 raiseRows: rig3.raises → 올림 줄(id 없는 것은 뺀다)', () => {
  assert.deepEqual(raiseRows(null), []);
  assert.deepEqual(raiseRows({ raises: [{ id: 'raise-2', role: 'verify', reason: '기준', t: 5 }, { role: 'x' }] }), [{ id: 'raise-2', role: 'verify', reason: '기준', t: 5 }]);
});

test('P252 조정 기록의 올림 답 줄: key answer, by, 되돌리기 없음, 글', () => {
  const rows = tuneLogRows({ log: [{ id: 1, kind: 'raise', state: 'noted', why: '기준', t: 1 }, { id: 2, kind: 'answer', state: 'told', why: '그대로 둔다', evidence: ['raise-1'], by: 'builder', t: 2 }] });
  assert.deepEqual([rows[0].key, rows[0].by, rows[0].undo, rows[0].evidence], ['answer', 'builder', null, ['raise-1']]);
  const v = (t) => ({ raise: rows[0].evidence[0], by: t('rigRaise.byBuilder'), why: rows[0].why });
  assert.equal(tk('rigTune.k.answer', v(tk)), 'raise-1에 빌더의 답(고치지 않음): 그대로 둔다');
  assert.equal(te('rigTune.k.answer', v(te)), 'The builder answered raise-1 (no change): 그대로 둔다');
});

test('P252 두 사전: rigRaise·rigPeriod 같은 열쇠, 다음 박자·도구 줄', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !('other' in v) ? keys(v, p + k + '.') : [p + k]));
  for (const n of ['rigRaise', 'rigPeriod']) assert.deepEqual(keys(ko[n]).sort(), keys(en[n]).sort(), n);
  assert.equal(tk('rigPeriod.next', { time: '07:00', period: periodText('1d', '07:00', tk) }) + ')', '다음 박자 07:00(매일 07:00)');
  assert.equal(te('rigPeriod.tool', { name: 'fetch', period: periodText('1h', null, te), time: '08:00' }), 'fetch: every hour, next 08:00');
  assert.equal(te('rigRaise.h', { n: 1 }), '1 waiting raise'); assert.equal(tk('rigRaise.h', { n: 2 }), '기다리는 올림 2');
  // 안 쓰게 된 옛 열쇠는 없다
  for (const d of [ko, en]) { assert.equal(d.rigMap.beatEvery, undefined); assert.equal(d.rigCycle.next, undefined); assert.equal(d.rigCycle.tool, undefined); }
});
