// P307: 휴대폰 목표 레인(lib/phone-plan.js): 폴더 머리 칩(하나·접기·가볍게 열림이면 없음), 시트 고르기(목록 → 레인, 하나면 곧바로, 사라진 레인), "사용자 것만" 거르기,
// 계단·펼친 마일스톤, 할 일 시트의 목표 판 단추가 휴대폰에서 시트로 가는 길, 두 사전
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { phoneChip, sheetPick, sheetItems, sheetSteps } from '../src/renderer/lib/phone-plan.js';
import { laneOf } from '../src/renderer/lib/plans.js';
import { applyPlanOps, emptyPlan } from '../../backend/src/plan.mjs';
import { translate } from '../src/renderer/lib/i18n.js';
import { fitRow } from '../src/renderer/lib/row-fit.js';

const read = (p) => fs.readFileSync(new URL(`../src/renderer/${p}`, import.meta.url), 'utf8');
const A = { now: 1000, actor: { by: 'lead', via: 'agent' } };
function doc(nUser = 2, extra = []) {
  const ops = [{ op: 'goal', text: 'g' }, { op: 'ms', code: 'M1', title: 'a' }, { op: 'ms', code: 'M2', title: 'b' }, { op: 'itemAdd', ms: 'M1', text: 'm1 일' }, { op: 'itemAdd', ms: 'M2', text: 'head 일' }];
  for (let i = 0; i < nUser; i++) ops.push({ op: 'itemAdd', ms: 'M2', text: '사람 ' + i, who: 'user' });
  ops.push({ op: 'focus', code: 'M2' }, ...extra);
  return applyPlanOps(emptyPlan(), ops, A).doc;
}
const lane = (id, o = {}) => laneOf({ planId: id, wsKey: o.ws || 'w1', workspace: 'shop', no: o.no || id, name: o.name || 'L' + id, status: o.status || 'active', rev: 2, owner: null, doc: o.doc || doc(o.nUser ?? 2, o.extra || []) });

test('폴더 머리 칩: 레인 하나면 PC 칩 글, 둘 이상이면 접기, 가볍게 열림·레인 없음이면 없음', () => {
  const one = phoneChip([lane(1, { name: '수집' })], 'w1');
  assert.equal(one.folded, false);
  assert.equal(one.n, 1);
  assert.equal(one.one.name, '수집');
  assert.equal(one.one.code, 'M2');
  assert.equal(one.userLeft, 2);
  const two = phoneChip([lane(1), lane(2, { nUser: 1 })], 'w1');
  assert.equal(two.folded, true, '휴대폰은 둘부터 "레인 n"');
  assert.equal(two.one, null);
  assert.equal(two.n, 2);
  assert.equal(two.userLeft, 3);
  assert.equal(phoneChip([lane(1)], 'w1', { lite: true }), null, 'P293 가볍게 열림에서는 칩을 그리지 않는다');
  assert.equal(phoneChip([lane(1)], 'w2'), null, '다른 워크스페이스');
  assert.equal(phoneChip([lane(1, { status: 'archived' })], 'w1'), null, '보관 레인만 있으면 칩 없음');
  const paused = phoneChip([lane(1, { status: 'paused' })], 'w1');
  assert.equal(paused.dim, true);
  assert.equal(paused.userLeft, 0, '멈춘 레인의 사용자 항목은 점을 켜지 않는다');
  const all = phoneChip([lane(1, { extra: [{ op: 'check', ids: ['M2.1', 'M2.2', 'M2.3'] }] })], 'w1');
  assert.equal(all.allChecked, true);
});

test('시트 고르기: 목록 → 레인, 레인이 하나면 곧바로, planId로 열기(할 일 시트), 사라진 레인이면 목록', () => {
  const ls = [lane(1, { name: '수집' }), lane(2, { name: '결제' }), lane(3, { name: '옛', status: 'archived' }), lane(9, { ws: 'w2' })];
  assert.equal(sheetPick(ls, null), null);
  const list = sheetPick(ls, { wsKey: 'w1', planId: null });
  assert.equal(list.mode, 'list');
  assert.deepEqual(list.chips.map((c) => c.name), ['수집', '결제'], '보관 레인은 목록에 없다');
  const l2 = sheetPick(ls, { wsKey: 'w1', planId: 2 });
  assert.equal(l2.mode, 'lane');
  assert.equal(l2.lane.name, '결제');
  assert.equal(l2.back, true, '레인이 여럿이면 목록으로 돌아가는 단추');
  const solo = sheetPick(ls, { wsKey: 'w2', planId: null });
  assert.equal(solo.mode, 'lane', '레인 하나면 목록 없이 그 레인');
  assert.equal(solo.back, false);
  const fromCard = sheetPick(ls, { wsKey: null, planId: '9' });
  assert.equal(fromCard.mode, 'lane', '할 일 카드는 planId만 알아도 연다(번호·글 둘 다)');
  assert.equal(fromCard.wsKey, 'w2');
  const gone = sheetPick(ls, { wsKey: 'w1', planId: 77 });
  assert.equal(gone.mode, 'list', '사라진 레인이면 목록');
  const arch = sheetPick(ls, { wsKey: 'w1', planId: 3 });
  assert.equal(arch.mode, 'lane', '보관 레인도 planId로는 연다');
  assert.equal(sheetPick([], { wsKey: 'w1', planId: null }).chips.length, 0);
});

test('사용자 것만 거르기와 계단', () => {
  const d = doc(2, [{ op: 'check', ids: ['M2.2'] }]);
  const { steps, ms } = sheetSteps(d);
  assert.equal(ms.code, 'M2', '고른 것이 없으면 focus');
  assert.deepEqual(steps.map((s) => [s.code, s.done, s.total, s.focus, s.open]), [['M1', 0, 1, false, false], ['M2', 1, 3, true, true]]);
  assert.equal(sheetItems(ms).length, 3);
  assert.deepEqual(sheetItems(ms, true).map((x) => x.id), ['M2.2', 'M2.3'], '사용자 것만(체크한 것도 남긴다)');
  assert.equal(sheetSteps(d, 'M1').ms.code, 'M1');
  assert.equal(sheetSteps(d, 'M1').steps[0].open, true);
  assert.deepEqual(sheetItems(null), []);
  assert.deepEqual(sheetSteps(null).steps, []);
});

test('연결: 맵 폴더 머리 칩(가볍게 열림 넘김), 휴대폰 뿌리의 시트, 할 일 카드의 목표 판 → openPlanBoard', () => {
  const pm = read('PhoneMap.jsx');
  assert.match(pm, /<PhoneLaneChip wsKey=\{r\.key\} lite=\{plan\.lite\} \/>/);
  assert.match(read('Phone.jsx'), /<PhonePlanSheet \/>/);
  const plan = read('Plan.jsx');
  assert.equal((plan.match(/openPlanBoard\((c|m)\.planId, e\.currentTarget\)/g) || []).length, 2, '실행 카드와 n개 더 줄');
  const st = read('store.js');
  assert.match(st, /export function openPlanBoard\(planId, anchor = null\) \{\n  if \(phonePlanHosts > 0\)/);
});

test('두 사전에 휴대폰 목표 글', async () => {
  const ko = (await import('../src/renderer/locales/ko.js')).default;
  const en = (await import('../src/renderer/locales/en.js')).default;
  for (const k of Object.keys(ko.phonePlan)) assert.ok(en.phonePlan[k], 'en ' + k);
  for (const k of Object.keys(en.phonePlan)) assert.ok(ko.phonePlan[k], 'ko ' + k);
  assert.equal(translate('ko', 'phonePlan.lanes', { n: 3 }), '목표 레인 3');
  assert.equal(translate('en', 'phonePlan.userOnly'), 'Mine only');
  assert.equal(translate('ko', 'phonePlan.userOnly'), '사용자 것만');
});

test('맵 카드 첫 줄: 이름이 잘리면 tight(짧은 표식·칩), 그래도 잘리면 tight2(상태 점만), 넉넉하면 그대로', () => {
  // 가짜 줄: 단계마다 이름에 남는 폭(need: 이름 전체 폭)
  const mk = (need, room) => { const cls = new Set(['c1']); const row = { classList: { add: (...a) => a.forEach((x) => cls.add(x)), remove: (...a) => a.forEach((x) => cls.delete(x)), contains: (x) => cls.has(x) } };
    const name = { get scrollWidth() { return need; }, get clientWidth() { return Math.min(need, cls.has('tight2') ? room[2] : cls.has('tight') ? room[1] : room[0]); } }; return { row, name, cls }; };
  let s = mk(40, [60, 80, 120]);
  assert.equal(fitRow(s.row, s.name), 0); assert.equal(s.cls.has('tight'), false);
  s = mk(100, [60, 110, 160]);
  assert.equal(fitRow(s.row, s.name), 1); assert.equal(s.cls.has('tight'), true); assert.equal(s.cls.has('tight2'), false);
  s = mk(230, [0, 120, 207]);
  assert.equal(fitRow(s.row, s.name), 2, '긴 이름: 둘째 단계(이름이 줄의 절반 이상)');
  assert.equal(fitRow(s.row, mk(40, [60, 60, 60]).name), 0, '다시 재면 앞 단계를 지우고 잰다');
  assert.equal(s.cls.has('tight'), false);
  assert.equal(fitRow(null, null), 0);
  assert.match(read('PhoneMap.jsx'), /lite=\{!plan\.tiles\} fit \/>/, '휴대폰 맵만 fit');
  assert.match(read('phone.css'), /\.c1\.tight \.mt-plan-mgr\.map \.mt-plan-cn \{ display: none; \}/);
});
