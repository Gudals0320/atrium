// P98 단위 시험: 위 바의 묶음 칩(lib/ws-tabs.js) — 묶음 칩 모으기, 수 합, 이전·다음 순서, 묶음 칩을 누를 때 고를 워크스페이스, 두 사전의 글
import test from 'node:test';
import assert from 'node:assert/strict';
import { wsTabs, tabKeys, sumCounts, tabOf, groupPick, memberLabel } from '../src/renderer/lib/ws-tabs.js';
import { stepWorkspace } from '../src/renderer/lib/keys.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

// 사용자 그림 모양: 워크스페이스 열한 개, 묶음 둘(저절로 만든 폴더 묶음 proj, 사람이 만든 그룹 lab)
const W = (key, extra = {}) => ({ key, name: key.split('/').pop(), root: `E:/work/${key}`, kind: 'folder', ...extra });
const WS = [
  W('a1'), W('a2'), W('a3'), W('lab-x'),
  W('proj/web', { label: 'web' }), W('lab-y'), W('empty'), W('core'),
  W('proj/web/collector', { label: 'web/collector' }), W('proj/api', { label: 'api' }), W('notes'),
];
const GROUPS = [
  { id: 'g1', name: 'proj', auto: true, root: 'e:/work/proj', members: ['proj/api', 'proj/web', 'proj/web/collector'] },
  { id: 'g2', name: 'lab', members: ['lab-y', 'lab-x'] },
];
const S = (id, ws, extra = {}) => ({ sessionId: id, workspaceKey: ws, kind: 'claude', state: 'ready', ...extra });
const SESS = [
  S('s1', 'a1'), S('s2', 'a2'), S('s3', 'a3'), S('s4', 'lab-x'), S('s5', 'proj/web'),
  S('s6', 'lab-y', { state: 'working' }), S('s7', 'lab-y', { kind: 'shell', state: 'shell_idle' }),
  S('s8', 'core'), S('s9', 'core'), S('s10', 'core', { unseen: true }),
  S('s11', 'proj/web/collector', { state: 'waiting' }), S('s12', 'proj/api', { state: 'trust_wait' }),
  S('s13', 'notes'), S('s14', 'notes'),
];

test('묶음 칩 모으기: 구성 둘 이상인 묶음은 칩 하나, 첫 구성의 자리에 놓는다', () => {
  const tabs = wsTabs(WS, GROUPS);
  assert.deepEqual(tabs.map((t) => (t.type === 'group' ? `[${t.name}]` : t.key)), ['a1', 'a2', 'a3', '[lab]', '[proj]', 'empty', 'core', 'notes']);
  const proj = tabs.find((t) => t.id === 'g1');
  assert.equal(proj.auto, true);
  assert.equal(proj.root, 'e:/work/proj');
  assert.deepEqual(proj.keys, ['proj/api', 'proj/web', 'proj/web/collector'], '묶음 안 순서는 그룹 구성 순서');
  assert.deepEqual(proj.ws.map((w) => w.key), proj.keys);
  const lab = tabs.find((t) => t.id === 'g2');
  assert.equal(lab.auto, false);
  assert.deepEqual(lab.keys, ['lab-y', 'lab-x'], '사람이 정한 순서');
  assert.equal(tabs.length, 8, '칩 열한 개 → 여덟 개');
});

test('묶음 칩 모으기: 판에 없는 구성은 빼고, 구성이 하나뿐이면 그 워크스페이스 칩 그대로', () => {
  const groups = [{ id: 'g1', name: 'one', members: ['a2', 'gone'] }, { id: 'g2', name: 'none', members: [] }];
  const tabs = wsTabs([W('a1'), W('a2'), W('a3')], groups);
  assert.deepEqual(tabs.map((t) => t.type + ':' + (t.key || t.id)), ['ws:a1', 'ws:a2', 'ws:a3']);
  assert.deepEqual(wsTabs([W('a1')], null).map((t) => t.key), ['a1']);
  assert.deepEqual(wsTabs(null, GROUPS), []);
  // 같은 워크스페이스가 두 그룹에 적혀 있으면(망가진 값) 앞 그룹만
  const dup = wsTabs([W('x'), W('y'), W('z')], [{ id: 'g1', name: 'A', members: ['x', 'y'] }, { id: 'g2', name: 'B', members: ['y', 'z'] }]);
  assert.deepEqual(dup.map((t) => t.type + ':' + (t.key || t.id)), ['group:g1', 'ws:z']);
});

test('수 합: 세션·셸·작업 중·응답 필요·확인할 결과를 구성마다 더한다', () => {
  const tabs = wsTabs(WS, GROUPS);
  const proj = tabs.find((t) => t.id === 'g1');
  assert.deepEqual(sumCounts(SESS, proj.keys), { sessions: 3, working: 0, needsYou: 2, review: 0, shells: 0 });
  const lab = tabs.find((t) => t.id === 'g2');
  assert.deepEqual(sumCounts(SESS, lab.keys), { sessions: 3, working: 1, needsYou: 0, review: 0, shells: 1 });
  assert.deepEqual(sumCounts(SESS, ['core']), { sessions: 3, working: 0, needsYou: 0, review: 1, shells: 0 });
  assert.deepEqual(sumCounts(SESS, ['empty']), { sessions: 0, working: 0, needsYou: 0, review: 0, shells: 0 });
  assert.deepEqual(sumCounts(SESS, []), { sessions: 0, working: 0, needsYou: 0, review: 0, shells: 0 });
});

test('이전·다음: 칩 순서대로, 묶음 칩 자리에서는 구성을 묶음 안 순서로 지난다(끝에서 처음으로)', () => {
  const keys = tabKeys(wsTabs(WS, GROUPS));
  assert.deepEqual(keys, ['a1', 'a2', 'a3', 'lab-y', 'lab-x', 'proj/api', 'proj/web', 'proj/web/collector', 'empty', 'core', 'notes']);
  assert.equal(keys.length, WS.length, '모든 워크스페이스에 키보드로 갈 수 있다');
  assert.equal(stepWorkspace(keys, 'a3', 1), 'lab-y');
  assert.equal(stepWorkspace(keys, 'lab-x', 1), 'proj/api');
  assert.equal(stepWorkspace(keys, 'proj/web/collector', 1), 'empty');
  assert.equal(stepWorkspace(keys, 'proj/api', -1), 'lab-x');
  assert.equal(stepWorkspace(keys, 'notes', 1), 'a1');
  assert.equal(stepWorkspace(keys, 'a1', -1), 'notes');
});

test('지금 칩과 묶음 칩을 누를 때 고를 워크스페이스', () => {
  const tabs = wsTabs(WS, GROUPS);
  const proj = tabs.find((t) => t.id === 'g1');
  assert.equal(tabOf(tabs, 'proj/web/collector'), proj);
  assert.equal(tabOf(tabs, 'core').key, 'core');
  assert.equal(tabOf(tabs, 'nope'), null);
  assert.equal(groupPick(proj, 'proj/web', null), 'proj/web', '지금 것이 묶음 안이면 그대로');
  assert.equal(groupPick(proj, 'core', 'proj/web/collector'), 'proj/web/collector', '마지막으로 고른 구성');
  assert.equal(groupPick(proj, 'core', 'gone'), 'proj/api', '없으면 첫 구성');
  assert.equal(groupPick(proj, null), 'proj/api');
  assert.equal(groupPick(tabOf(tabs, 'core'), 'core'), null, '묶음 칩이 아니다');
  assert.equal(memberLabel(WS[8]), 'web/collector', '저절로 만든 묶음은 뿌리에서의 상대 경로');
  assert.equal(memberLabel(WS[3]), 'lab-x');
  assert.equal(memberLabel(null), '');
});

test('두 사전: 묶음 칩 글이 같은 키와 같은 자리 표시를 가진다', () => {
  const keys = Object.keys(en.wsGroupTab).sort();
  assert.deepEqual(Object.keys(ko.wsGroupTab).sort(), keys);
  const slots = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  for (const k of keys) assert.equal(slots(ko.wsGroupTab[k]), slots(en.wsGroupTab[k]), k);
  assert.ok(!/\n/.test(en.wsGroupTab.kindAuto) && en.wsGroupTab.title.split('\n').length === 3);
  assert.equal(ko.wsGroupTab.title.split('\n').length, 3);
});
