// P315 사이드바 세션 줄은 이름 차례: 대소문자 무시, 자연 숫자, 활동·응답 필요로 자리를 바꾸지 않는다, 하위 나무 안도 이름 차례
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, sessionCmp, groupLayout } from '../src/renderer/lib/sidebar-tree.js';
import { byName } from '../src/renderer/lib/sidebar.js';

const W = { key: 'a', name: 'a', root: 'C:/a' };
const S = (name, extra = {}) => ({ sessionId: `id-${name}`, name, kind: 'claude', state: 'ready', workspaceKey: 'a', ...extra });
const names = (rows) => rows.filter((r) => r.type === 'session').map((r) => r.s.name);

test('P315 이름 차례: 대소문자 무시, 숫자는 자연 차례, 한글·영문 섞여도 늘 같다', () => {
  const list = ['p10', 'P9', 'beta', 'Alpha', '나무', 'p2', '가지', 'zeta'];
  const a = [...list].map((n) => S(n)).sort(sessionCmp).map((s) => s.name);
  const b = [...list].reverse().map((n) => S(n)).sort(sessionCmp).map((s) => s.name);
  assert.deepEqual(a, b, '들어온 차례와 상관없이 같다');
  assert.ok(a.indexOf('Alpha') < a.indexOf('beta'));
  assert.ok(a.indexOf('p2') < a.indexOf('P9') && a.indexOf('P9') < a.indexOf('p10'));
  assert.ok(a.indexOf('가지') < a.indexOf('나무'));
  // 대소문자만 다른 이름도 차례가 정해진다
  const c = byName((x) => x.n, (x) => x.k);
  assert.notEqual(c({ n: 'ab', k: '1' }, { n: 'AB', k: '2' }), 0);
});

test('P315 활동·응답 필요가 바뀌어도 펼친 목록 차례는 그대로', () => {
  const one = [S('w2', { lastActivityAt: 10 }), S('w10', { lastActivityAt: 30 }), S('w1', { lastActivityAt: 20 })];
  const two = [S('w2', { lastActivityAt: 99999, state: 'waiting' }), S('w10', { lastActivityAt: 1, state: 'error' }), S('w1', { lastActivityAt: 5, state: 'working' })];
  const r1 = names(buildRows({ workspaces: [W], groups: [], sessions: one }).rows);
  const r2 = names(buildRows({ workspaces: [W], groups: [], sessions: two }).rows);
  assert.deepEqual(r1, ['w1', 'w2', 'w10']);
  assert.deepEqual(r2, r1);
});

test('P315 하위 나무: 부모 아래에 붙고, 같은 부모의 하위끼리 이름 차례(띄운 차례·활동과 상관없이)', () => {
  const kid = (name, order, extra = {}) => S(name, { parentSessionId: 'id-lead', createdAt: 100 + order, lastActivityAt: 1000 - order, branch: { child: true, order }, ...extra });
  const sessions = [S('zlead', {}), S('lead'), kid('zz', 1), kid('aa', 2, { state: 'waiting' }), kid('mm', 3, { lastActivityAt: 99999 }), S('mid')];
  const { rows } = buildRows({ workspaces: [W], groups: [], sessions });
  assert.deepEqual(names(rows), ['lead', 'aa', 'mm', 'zz', 'mid', 'zlead']);
  assert.deepEqual(rows.filter((r) => r.type === 'session').map((r) => r.indent), [0, 1, 1, 1, 0, 0]);
});

test('P315 접힌 워크스페이스 아래 남는 줄(응답 필요·실행 중)도 이름 차례, 고르는 것은 그대로', () => {
  const sessions = [S('z-need', { state: 'waiting', lastActivityAt: 50 }), S('a-run', { state: 'working', lastActivityAt: 1 }), S('m-idle'), S('b-err', { state: 'error' })];
  const { rows } = buildRows({ workspaces: [W], groups: [], sessions, collapsed: { a: true } });
  assert.deepEqual(names(rows), ['a-run', 'b-err', 'z-need']);
});

test('P315 폴더 밖 워크스페이스는 이름 차례, 폴더와 폴더 안은 사람이 끌어 정한 차례 그대로', () => {
  const ws = [{ key: 'k3', name: 'web' }, { key: 'k1', name: 'App10' }, { key: 'k2', name: 'app9' }, { key: 'k4', name: 'zeta' }, { key: 'k5', name: 'alpha' }];
  const lay = groupLayout(ws, [{ id: 'g1', name: 'Z', members: ['k4', 'k5'] }]);
  assert.deepEqual(lay.groups[0].workspaces.map((w) => w.name), ['zeta', 'alpha']);
  assert.deepEqual(lay.ungrouped.map((w) => w.name), ['app9', 'App10', 'web']);
});
