// P384: 하위의 질문 창을 부모가 처리 중이면(요약 askRoute, 휴대폰 줄 held) 사람 쪽은 흐리게만: 알약 수·N 키 순서·영역 수·OS 알림·휴대폰 수에서 뺀다.
//   올리면(escalated) 지금처럼 응답 필요. 맨 위 세션·권한 질문(askRoute 없음)은 그대로(불변식)
import test from 'node:test';
import assert from 'node:assert/strict';
import { notifyKey, heldByParent, needsHuman } from '../src/renderer/lib/attention.js';
import { inboxOf } from '../src/renderer/lib/faces.js';
import { homeOf, listOf, treeOf } from '../src/renderer/lib/mobile.js';
import { bucketOf, countOf } from '../src/renderer/lib/sidebar-tree.js';
import { navOf, ITEMS } from '../src/renderer/lib/settings-nav.js';
import { workspaceCounts } from '../../backend/src/workspaces.mjs';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const ask = { kind: 'question', toolUseId: 'toolu_A', since: 100 };
const S = (name, o = {}) => ({ sessionId: 'id-' + name, name, state: 'waiting', ask, workspaceKey: 'w', createdAt: 1, ...o });
const held = S('w1', { askRoute: { parent: 'ld', since: 100, escalateAt: 700000, escalated: null } });
const up = S('w2', { askRoute: { parent: 'ld', since: 100, escalateAt: 700000, escalated: 800000 } });
const top = S('top');
const perm = S('w3', { ask: { kind: 'permission', toolUseId: 't' } });

test('P384 부모 처리 중: OS 알림 열쇠 없음, 올리면 다시 생김, 맨 위·권한 질문은 그대로', () => {
  assert.equal(heldByParent(held), true); assert.equal(heldByParent(up), false); assert.equal(heldByParent(top), false);
  assert.equal(heldByParent({ state: 'waiting', held: { parent: 'ld' } }), true, '휴대폰 줄');
  assert.equal(notifyKey(held), null);
  assert.ok(notifyKey(up)); assert.ok(notifyKey(top)); assert.ok(notifyKey(perm));
  assert.equal(needsHuman(held), false); assert.equal(needsHuman(top), true);
});

test('P384 응답 필요 목록: 부모 처리 중은 따로(흐린 줄), 알약 수·N 키 순서에서 뺀다', () => {
  const ib = inboxOf([held, up, top, perm, S('r', { state: 'ready' })]);
  assert.deepEqual(ib.needsYou.map((s) => s.name).sort(), ['top', 'w2', 'w3']);
  assert.deepEqual(ib.held.map((s) => s.name), ['w1']);
  const ib2 = inboxOf([top]);
  assert.deepEqual(ib2.held, []); assert.deepEqual(ib2.needsYou.map((s) => s.name), ['top'], '맨 위 세션은 그대로');
});

test('P384 영역·사이드바 수에서 뺀다', () => {
  assert.equal(workspaceCounts([held, up, top], 'w').needsYou, 2);
  assert.equal(bucketOf(held), 'idle'); assert.equal(bucketOf(up), 'need'); assert.equal(bucketOf(top), 'need');
  assert.equal(countOf([held, top]).need, 1);
});

test('P384 휴대폰: 응답 필요 묶음에 흐린 카드로 끝에 두고, 수(홈 타일·탭 배지·묶음 점)에서는 뺀다', () => {
  const ph = { ...held, askRoute: undefined, held: { parent: 'ld' } };
  const rows = new Map([[ph.sessionId, ph], [top.sessionId, { ...top, waitingSince: 500 }]]);
  const h = homeOf(rows);
  assert.deepEqual(h.needs.map((s) => s.name), ['top', 'w1'], '흐린 카드는 끝에');
  assert.equal(h.counts.need, 1);
  assert.equal(listOf(rows, [{ key: 'w', name: 'w' }]).groups[0].need, 1);
  assert.equal(treeOf(rows, [{ key: 'w', name: 'w' }])[0].need, 1);
});

test('P384 설정 › 알림에 올리기 시간 칸, 사전 두 말', () => {
  assert.ok(ITEMS.some((i) => i.id === 'childAskEscalateMin' && i.page === 'alerts'));
  assert.ok(navOf({ childAskEscalateMin: 10 }, null, null).some((g) => g.pages.includes('alerts')));
  for (const d of [ko, en]) for (const k of ['held', 'heldTitle', 'sub', 'escName', 'escHint', 'escNote', 'escSet', 'escOff']) assert.ok(d.p384 && d.p384[k], k);
  assert.match(ko.p384.held, /\{parent\}/); assert.match(en.p384.escHint, /\{n\}/);
});
