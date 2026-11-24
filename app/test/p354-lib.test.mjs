// P354: 시선 태그(lib/gaze-pick.js). 화면 가운데 세션을 명령줄 받는 이로 고르는 규칙과 명령줄에 넣는 규칙
import test from 'node:test';
import assert from 'node:assert/strict';
import { gazePick, gazeScores, onScreen, canReceive, gazeTag, loadGazeOn, saveGazeOn, GAZE_KEY, MIN_ZOOM } from '../src/renderer/lib/gaze-pick.js';
import { autoTag } from '../src/renderer/lib/cmd-input.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';
import { ITEMS } from '../src/renderer/lib/settings-nav.js';

const screen = { width: 1600, height: 1000 };
const N = (id, x, y, w = 800, h = 500) => ({ id, name: id, x, y, w, h });
// 월드 점 (cx, cy)를 화면 가운데에 두는 변환
const at = (cx, cy, zoom = 1) => ({ x: screen.width / 2 - cx * zoom, y: screen.height / 2 - cy * zoom, zoom });

test('하나가 가운데: 그 세션을 고른다', () => {
  const nodes = [N('a', 0, 0), N('b', 2000, 0)];
  assert.deepEqual(gazePick({ nodes, view: at(400, 250), screen }), { id: 'a', name: 'a' });
});

test('둘이 나란히 가운데 빈 틈: 비슷하면 비운다, 지금 태그가 후보면 그대로', () => {
  const nodes = [N('a', 0, 0), N('b', 900, 0)]; // 틈 100(800~900)의 가운데 850
  const view = at(850, 250, 0.8);
  const sc = gazeScores({ nodes, view, screen });
  assert.equal(sc.length, 2);
  assert.ok(sc.every((x) => !x.inside));
  assert.equal(gazePick({ nodes, view, screen }), null, '틀린 세션보다 비운다');
  assert.deepEqual(gazePick({ nodes, view, screen, current: 'b' }), { id: 'b', name: 'b' }, '지금 태그를 지킨다');
});

test('둘이 나란히: 가운데가 한쪽 안이면 그쪽', () => {
  const nodes = [N('a', 0, 0), N('b', 900, 0)];
  assert.equal(gazePick({ nodes, view: at(1200, 250, 0.8), screen }).id, 'b');
  assert.equal(gazePick({ nodes, view: at(500, 250, 0.8), screen }).id, 'a');
});

test('가운데가 비었고 하나만 가까이: 가까우면 고르고, 짧은 변의 35% 밖이면 고르지 않는다', () => {
  const nodes = [N('a', 0, 0, 400, 300)];
  // 노드 왼쪽 가장자리가 화면 가운데에서 오른쪽으로 짧은 변의 20%
  assert.equal(gazePick({ nodes, view: at(-200, 150), screen }).id, 'a');
  // 짧은 변의 40% 밖
  assert.equal(gazePick({ nodes, view: at(-400, 150), screen }), null);
});

test('멀리 축소(배율 0.20 아래)면 태그하지 않는다', () => {
  const nodes = [N('a', 0, 0)];
  assert.equal(gazePick({ nodes, view: at(400, 250, MIN_ZOOM - 0.01), screen }), null);
  assert.equal(gazePick({ nodes, view: at(400, 250, MIN_ZOOM), screen }).id, 'a');
});

test('축소해 여럿이 보이면 가운데 점을 품은 노드만 고른다', () => {
  const nodes = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) nodes.push(N(`s${i}${j}`, i * 900, j * 600));
  // 가운데가 s11 안
  assert.equal(gazePick({ nodes, view: at(900 + 400, 600 + 250, 0.3), screen }).id, 's11');
  // 가운데가 틈(노드 밖)이면 비운다
  assert.equal(gazePick({ nodes, view: at(1750, 550, 0.3), screen }), null);
});

test('흔들림 막기: 지금 태그와 새 1등의 차이가 작으면 바꾸지 않는다', () => {
  const nodes = [N('a', 0, 0, 400, 300), N('b', 1000, 0, 400, 300)];
  // 가운데가 두 노드 사이(틈 400~1000)에서 a 쪽으로 조금 치우침: a가 앞서지만 차이가 작아 지금 b를 지킨다
  const view = at(695, 150, 1);
  const sc = gazeScores({ nodes, view, screen });
  assert.equal(sc[0].id, 'a');
  assert.ok(sc[0].score < sc[1].score * 1.25);
  assert.equal(gazePick({ nodes, view, screen, current: 'b' }).id, 'b');
  assert.equal(gazePick({ nodes, view, screen }), null, '지금 태그가 없으면 비슷해서 비운다');
  // a 쪽으로 더 치우치면(a가 뚜렷이 앞섬) a로 바뀐다
  assert.equal(gazePick({ nodes, view: at(560, 150), screen, current: 'b' }).id, 'a');
  // 가운데가 a 안으로 들어가면 바뀐다
  assert.equal(gazePick({ nodes, view: at(200, 150), screen, current: 'b' }).id, 'a');
});

test('화면 밖 노드는 후보가 아니다, onScreen은 조금이라도 보이면 참', () => {
  const view = at(400, 250);
  assert.equal(onScreen(N('a', 0, 0), view, screen), true);
  assert.equal(onScreen(N('far', 5000, 0), view, screen), false);
  assert.equal(onScreen(N('edge', 1150, 0, 100, 100), view, screen), true, '오른쪽 끝에 조금 걸침');
  assert.equal(gazeScores({ nodes: [N('far', 5000, 0)], view, screen }).length, 0);
  assert.equal(onScreen(null, view, screen), false);
});

test('받을 수 있는 세션: 셸과 끝난 세션은 빼고, 잠든 세션은 넣는다', () => {
  assert.equal(canReceive({ kind: 'claude', state: 'ready' }), true);
  assert.equal(canReceive({ kind: 'claude', state: 'sleeping' }), true);
  assert.equal(canReceive({ kind: 'shell', state: 'shell_idle' }), false);
  assert.equal(canReceive({ kind: 'codex', state: 'exited' }), false);
  assert.equal(canReceive(null), false);
});

test('명령줄: 빈 글에 시선 태그를 넣고, 옮겨 가고, 고를 것이 없으면 뺀다', () => {
  let s = gazeTag({ text: '', auto: null, by: null }, 'a', {}, autoTag);
  assert.deepEqual(s, { text: '@a ', auto: 'a', by: 'gaze' });
  s = gazeTag(s, 'b', {}, autoTag);
  assert.deepEqual(s, { text: '@b ', auto: 'b', by: 'gaze' });
  s = gazeTag(s, null, {}, autoTag);
  assert.deepEqual(s, { text: '', auto: null, by: null });
});

test('명령줄: 누른 세션이 먼저이고, 화면 밖으로 나가 풀리면 시선 세션으로', () => {
  const clicked = { text: '@a ', auto: 'a', by: 'click' };
  assert.equal(gazeTag(clicked, 'b', {}, autoTag), clicked, '누른 세션은 시선이 바꾸지 않는다');
  assert.deepEqual(gazeTag(clicked, 'b', { release: true }, autoTag), { text: '@b ', auto: 'b', by: 'gaze' });
  assert.deepEqual(gazeTag(clicked, null, { release: true }, autoTag), { text: '', auto: null, by: null }, '고를 것이 없으면 비운다');
});

test('명령줄: 사람이 친 글·고친 태그는 바꾸지 않는다', () => {
  assert.deepEqual(gazeTag({ text: '안녕', auto: null, by: null }, 'a', {}, autoTag), { text: '안녕', auto: null, by: null });
  assert.deepEqual(gazeTag({ text: '@a 할 일', auto: 'a', by: 'gaze' }, 'b', {}, autoTag), { text: '@a 할 일', auto: null, by: null });
  assert.deepEqual(gazeTag({ text: '@x ', auto: null, by: null }, 'a', {}, autoTag), { text: '@x ', auto: null, by: null }, '손으로 넣은 태그');
});

test('설정: 기본 켬, 끄면 저장소에 0', () => {
  const m = new Map();
  const st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  assert.equal(loadGazeOn(st), true);
  assert.equal(saveGazeOn(st, false), false);
  assert.equal(m.get(GAZE_KEY), '0');
  assert.equal(loadGazeOn(st), false);
  saveGazeOn(st, true);
  assert.equal(loadGazeOn(st), true);
  assert.equal(loadGazeOn(null), true);
});

test('문구: 두 사전에 있고 설정 찾기 칸이 있다', () => {
  for (const d of [en, ko]) for (const k of ['name', 'hint', 'note', 'chipTitle']) assert.ok(d.gaze[k], k);
  assert.ok(ITEMS.some((x) => x.id === 'gazeTag' && x.page === 'general'));
});
