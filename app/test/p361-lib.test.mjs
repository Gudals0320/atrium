// P361: API 크레딧 장부를 창에서 보이는 순수 함수(금액·남은 때·적용 대상 줄임·막대·세션 금액·저장 꼴·입력 칸)와 사전 두 벌
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usd, whenShort, dayShort, leftOf, targetsShort, barPct, grantLevel, sessionCost, hasCredits, saveBodyOf, toLocalInput, fromLocalInput, moneyInput, phoneRows, tzLabel, pastedKey, totalParts, basisKey } from '../src/renderer/lib/api-credits.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

test('금액 글', () => {
  assert.equal(usd(127.11), '$127.11'); assert.equal(usd(-4.33), '-$4.33'); assert.equal(usd(0), '$0.00');
  assert.equal(usd(0.004, { small: true }), '<$0.01'); assert.equal(usd(null), '—');
});

test('날짜·남은 때', () => {
  const t = new Date(2026, 10, 27, 9, 0).getTime();
  assert.equal(whenShort(t), '11/27 09:00'); assert.equal(whenShort(t, false), '11/27');
  assert.equal(dayShort('2026-10-24'), '10/24');
  assert.deepEqual(leftOf(t, t - 30 * 3600000), { key: 'apiCredits.leftHours', vars: { n: 30 } });
  assert.deepEqual(leftOf(t, t - 5 * 86400000), { key: 'apiCredits.leftDays', vars: { n: 5 } });
  assert.equal(leftOf(t, t + 1).key, 'apiCredits.expired');
  assert.equal(leftOf(null).key, 'apiCredits.noExpiry');
  assert.equal(fromLocalInput(toLocalInput(t)), t);
  assert.equal(fromLocalInput('2026-11-24'), new Date(2026, 10, 24).getTime());
  assert.equal(fromLocalInput('x'), null);
});

test('적용 대상 줄임, 막대, 색 단계, 세션 금액, 입력 금액', () => {
  assert.deepEqual(targetsShort(['Agent SDK', 'API', '배치 API', 'Playground']), { text: 'Agent SDK, API', more: 2 });
  assert.deepEqual(targetsShort(['API']), { text: 'API', more: 0 });
  assert.equal(barPct({ left: 50, total: 200 }), 25); assert.equal(barPct({ left: 5, total: null }), 0);
  assert.equal(grantLevel({ left: 3, soon: true }), 'warn'); assert.equal(grantLevel({ left: 0 }), 'gone'); assert.equal(grantLevel({ left: 3 }), 'ok');
  assert.equal(sessionCost({ apiCredits: { sessions: { s1: 0.42 } } }, 's1'), 0.42); assert.equal(sessionCost({ apiCredits: { sessions: {} } }, 's1'), null); assert.equal(sessionCost(null, 's1'), null);
  assert.equal(moneyInput('US$1,234.50'), 1234.5); assert.equal(moneyInput('−4.33'), -4.33); assert.equal(moneyInput(''), null); assert.equal(moneyInput('abc'), undefined);
  assert.equal(hasCredits(null), false); assert.equal(hasCredits({ ledger: false, spend: { today: 0, month: 0 } }), false); assert.equal(hasCredits({ ledger: true }), true);
});

test('미리 본 값 → 저장 꼴, 휴대폰 줄', () => {
  const pv = { grants: [{ name: 'API credit (Ultra)', kind: 'plan', plan: 'Ultra', total: 200, remaining: 200, appliesTo: ['API'], expiresAt: 5, hasTime: true, grantedOn: '2026-11-24', expiresText: 'x' }], purchased: { balance: -4.33, due: true }, autoReload: false, warnings: [] };
  const b = saveBodyOf(pv);
  assert.equal(b.grants[0].expiresText, undefined, '읽은 글 조각은 보내지 않는다');
  assert.deepEqual(b.purchased, { balance: -4.33, due: true }); assert.equal(b.autoReload, false); assert.equal('plan' in b, false);
  const rows = phoneRows({ grants: [{ id: 'a', name: 'n', kind: 'plan', left: 50, total: 100, expiresAt: Date.now() + 86400000, soon: true }] });
  assert.equal(rows[0].pct, 50); assert.equal(rows[0].level, 'warn'); assert.equal(rows[0].left2.key, 'apiCredits.leftHours');
});

test('올해가 아니면 연도, 시간대 표시, 방금 붙여 넣음, 0인 프로모션·구매 빼기, 기준 열쇠', () => {
  const now = new Date(2026, 10, 25, 12).getTime();
  assert.equal(whenShort(new Date(2027, 0, 3, 9, 0).getTime(), true, now), '2027/1/3 09:00');
  assert.equal(whenShort(new Date(2026, 10, 27, 9, 0).getTime(), true, now), '11/27 09:00');
  assert.equal(dayShort('2025-12-24', now), '2025/12/24'); assert.equal(dayShort('2026-11-24', now), '11/24');
  assert.match(tzLabel(), /^GMT[+-]\d{1,2}(:\d{2})?$/);
  assert.equal(pastedKey(now - 30000, now), 'apiCredits.pastedJust'); assert.equal(pastedKey(now - 90000, now), 'apiCredits.pastedAgo');
  assert.deepEqual(totalParts({ plan: 324.85, promo: 0, purchased: -4.33 }).map((p) => p.k), ['plan', 'purchased']);
  assert.deepEqual(totalParts({ plan: 10, promo: 5, purchased: 0 }).map((p) => p.k), ['plan', 'promo']);
  assert.equal(totalParts({ plan: 1, promo: 0, purchased: -1 })[1].due, true);
  assert.equal(basisKey('mixed'), 'apiCredits.mixed'); assert.equal(basisKey('official'), 'apiCredits.official'); assert.equal(basisKey('estimate'), 'apiCredits.estimate');
});

test('사전: 영어·한국어 apiCredits 절의 열쇠가 같다', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !('one' in v) ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  assert.ok(en.apiCredits && ko.apiCredits);
  assert.deepEqual(keys(ko.apiCredits).sort(), keys(en.apiCredits).sort());
});
