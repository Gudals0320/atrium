// P306: 목표 레인의 창 셈(lib/plans.js): 칩 요약·접기, 가상 실행 카드 고르기·상한, 체크 양방향(같은 연산), 관리자 레인, 측정값 막대, 펼칠 마일스톤, 두 사전
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { laneOf, wsLanes, chipOf, chipText, regionChips, managerLanes, planCards, planCountFor, checkOp, snoozeOp, metricPct, openMs, CHIPS_MAX, CARDS_PER_LANE } from '../src/renderer/lib/plans.js';
import { applyPlanOps, emptyPlan } from '../../backend/src/plan.mjs';
import { translate } from '../src/renderer/lib/i18n.js';

const read = (p) => fs.readFileSync(new URL(`../src/renderer/${p}`, import.meta.url), 'utf8');
const A = { now: 1000, actor: { by: 'lead', via: 'agent' } };
function doc(nUser = 3, extra = []) {
  const ops = [{ op: 'goal', text: 'g' }, { op: 'ms', code: 'M1', title: 'a' }, { op: 'ms', code: 'M2', title: 'b' }, { op: 'itemAdd', ms: 'M2', text: 'head 일' }];
  for (let i = 0; i < nUser; i++) ops.push({ op: 'itemAdd', ms: 'M2', text: '사람 ' + i, who: 'user' });
  ops.push({ op: 'focus', code: 'M2' }, ...extra);
  return applyPlanOps(emptyPlan(), ops, A).doc;
}
const lane = (id, o = {}) => laneOf({ planId: id, wsKey: o.ws || 'w1', workspace: o.wsName || 'shop', no: o.no || id, name: o.name || 'L' + id, status: o.status || 'active', rev: 3, owner: o.owner === undefined ? { sessionId: 's' + id, name: 'lead' + id, open: true } : o.owner, doc: o.doc || doc(o.nUser ?? 3, o.extra || []) });

test('칩: 레인마다 "이름 M2 체크/전체", 사용자 남음, 모두 체크, 멈춤은 흐리게, 보관은 빼기, 많으면 접기', () => {
  const l1 = lane(1, { name: '수집' });
  const c = chipOf(l1);
  assert.equal(chipText(c), '수집 M2 0/4');
  assert.equal(c.userLeft, 3);
  assert.equal(c.allChecked, false);
  const done = lane(2, { name: '결제', extra: [{ op: 'check', ids: ['M2.1', 'M2.2', 'M2.3', 'M2.4'] }] });
  assert.equal(chipOf(done).allChecked, true);
  assert.equal(chipOf(done).userLeft, 0);
  const paused = lane(3, { status: 'paused' }), arch = lane(4, { status: 'archived' });
  const r = regionChips([arch, paused, done, l1], 'w1');
  assert.deepEqual(r.chips.map((x) => x.planId), [1, 2, 3], '보관은 칩에 없고, 진행 먼저');
  assert.equal(r.chips[2].dim, true);
  assert.equal(r.folded, false);
  assert.equal(r.userLeft, 3);
  assert.equal(r.allChecked, true);
  assert.equal(regionChips([l1, done, paused, lane(5)], 'w1').folded, true, CHIPS_MAX + '개 넘으면 접는다');
  assert.equal(regionChips([l1], 'w2').n, 0, '다른 워크스페이스');
  assert.deepEqual(wsLanes([arch, l1], 'w1', { all: true }).map((x) => x.planId), [1, 4]);
});

test('가상 실행 카드: 레인당 2장 + n개 더, 미룬 것·체크한 것·멈춘 레인 빼기, 셀 수는 모두', () => {
  assert.equal(CARDS_PER_LANE, 2);
  const now = 5000;
  const a = lane(1, { name: '수집', nUser: 4, extra: [{ op: 'check', ids: ['M2.2'] }, { op: 'snooze', id: 'M2.3', until: now + 1000 }] }); // 사용자 M2.2(체크)·M2.3(미룸)·M2.4·M2.5
  const b = lane(2, { name: '결제', nUser: 1 });
  const p = lane(3, { status: 'paused' });
  const r = planCards([a, b, p], now);
  assert.deepEqual(r.cards.map((c) => c.itemId + '@' + c.lane), ['M2.4@수집', 'M2.5@수집', 'M2.2@결제']);
  assert.equal(r.total, 3);
  assert.deepEqual(r.more, []);
  const big = lane(4, { name: '큰', nUser: 5 });
  const r2 = planCards([big], now);
  assert.equal(r2.cards.length, 2);
  assert.deepEqual(r2.more.map((m) => [m.lane, m.ms, m.n]), [['큰', 'M2', 3]]);
  assert.equal(r2.total, 5);
  assert.equal(r2.cards[0].source, 'plan');
  assert.equal(r2.cards[0].ownerId, 's4');
  assert.equal(r2.cards[0].key, 'plan:4:M2.2');
  // 미룬 때가 지나면 다시 뜬다
  assert.equal(planCards([a], now + 2000).total, 3);
  // 관리자 카드 표식 수
  assert.equal(planCountFor([a, b, p], 's1', now), 2);
  assert.equal(planCountFor([a, b, p], 's3', now), 0, '멈춘 레인은 세지 않는다');
});

test('체크 양방향: 판의 체크와 할 일의 했음은 같은 plan.op, 결과가 카드에서 사라진다', () => {
  assert.deepEqual(checkOp('M2.3'), { op: 'check', ids: ['M2.3'] });
  assert.deepEqual(checkOp('M2.3', false), { op: 'uncheck', ids: ['M2.3'] });
  assert.deepEqual(snoozeOp('M2.3', 9), { op: 'snooze', id: 'M2.3', until: 9 });
  const d0 = doc(2);
  const l0 = laneOf({ planId: 1, wsKey: 'w', name: 'x', status: 'active', rev: 1, doc: d0 });
  assert.equal(planCards([l0]).total, 2);
  const d1 = applyPlanOps(d0, [checkOp('M2.2')], { now: 2000, actor: { by: 'user', via: 'foryou' } }).doc; // 할 일에서 했음
  const l1 = laneOf({ planId: 1, wsKey: 'w', name: 'x', status: 'active', rev: 2, doc: d1 }, l0);
  assert.deepEqual(planCards([l1]).cards.map((c) => c.itemId), ['M2.3']);
  assert.equal(l1.summary.focus.done, 1);
  const d2 = applyPlanOps(d1, [checkOp('M2.2', false)], A).doc; // 판에서 풂
  assert.equal(planCards([laneOf({ planId: 1, wsKey: 'w', name: 'x', status: 'active', rev: 3, doc: d2 })]).total, 2);
  // 목록 줄(문서 없음)은 userItems를 쓰고, 같은 rev면 앞 문서를 잇는다
  const brief = laneOf({ planId: 1, wsKey: 'w', name: 'x', status: 'active', rev: 2, summary: l1.summary, userItems: l1.userItems }, l1);
  assert.ok(brief.doc);
  assert.equal(laneOf({ planId: 1, wsKey: 'w', name: 'x', status: 'active', rev: 5, userItems: [] }, l1).doc, null);
});

test('관리자 레인, 측정값 막대, 펼칠 마일스톤', () => {
  const a = lane(1), b = lane(2, { owner: { sessionId: 's1', name: 'lead1' } }), c = lane(3, { owner: null }), d = lane(4, { owner: { sessionId: 's1' }, status: 'archived' });
  assert.deepEqual(managerLanes([a, b, c, d], 's1').map((x) => x.planId), [1, 2]);
  assert.deepEqual(managerLanes([a, b, c, d], null), []);
  assert.equal(metricPct({ now: '5', target: '10' }), 0.5);
  assert.equal(metricPct({ now: '12분', target: '2분' }) < 0.3, true, '줄이는 목표');
  assert.equal(metricPct({ now: 'x', target: '2' }), null);
  assert.equal(metricPct({ now: '3', target: '3' }), 1);
  const dd = doc(1);
  assert.equal(openMs(dd, null).code, 'M2', 'focus');
  assert.equal(openMs(dd, 'M1').code, 'M1');
  assert.equal(openMs(dd, 'M9').code, 'M2');
  assert.equal(openMs(emptyPlan(), null), null);
});

test('창 자리와 두 사전', () => {
  assert.match(read('Regions.jsx'), /<LaneChips wsKey=\{key\} \/>/);
  assert.match(read('SessionNode.jsx'), /<ManagerChip sessionId=\{s\.sessionId\} \/>/);
  assert.match(read('MissionLineage.jsx'), /<ManagerChip sessionId=\{n\.sessionId\} map \/>/);
  assert.match(read('Chrome.jsx'), /<PlanPanelHost \/>/);
  assert.match(read('Decisions.jsx'), /PlanCardRow/);
  const en = fs.readFileSync(new URL('../src/renderer/locales/en.js', import.meta.url), 'utf8');
  const ko = fs.readFileSync(new URL('../src/renderer/locales/ko.js', import.meta.url), 'utf8');
  const keys = (src) => { const s = src.slice(src.indexOf('  plan: {')); return [...s.slice(0, s.indexOf('\n  },\n')).matchAll(/^\s+([A-Za-z]+):/gm)].map((m) => m[1]); };
  assert.deepEqual(keys(ko), keys(en));
  assert.equal(translate('ko', 'plan.card.kind'), '실행');
  assert.equal(translate('en', 'plan.card.kind'), 'Action');
  assert.equal(translate('ko', 'plan.folded', { n: 4 }), '레인 4');
  assert.equal(translate('en', 'plan.notify.next'), 'With next message');
});
