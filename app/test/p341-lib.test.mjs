// P341 창 단위 시험: 폭주 배지 글, 카드 보기 고르기(에이전트 본체면 끄기 대신 재우기 권함), 지금 값, 설정 쪽 자리.
import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeParts, guardActions, whyParts, liveTop, guardOf, fmtMem, fmtMin } from '../src/renderer/lib/guard.js';
import { navOf, pagesOf, searchItems, rowState, PAGE_ICON } from '../src/renderer/lib/settings-nav.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const lookup = (dict) => (k, v = {}) => { const s = k.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), dict); return typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (m, n) => (n in v ? v[n] : m)) : k; };

test('배지 글: CPU·메모리·증가, 증가가 있으면 메모리는 증가로, 멈춘 세션은 일시정지 하나', () => {
  assert.deepEqual(badgeParts({ reasons: [{ type: 'cpu', pct: 97, ms: 4 * 60000 }] }), [{ key: 'guard.badge.cpu', vars: { pct: 97, min: 4 } }]);
  assert.deepEqual(badgeParts({ reasons: [{ type: 'mem', memMB: 3500 }, { type: 'grow', fromMB: 1000, toMB: 3500, ms: 1 }] }).map((p) => p.key), ['guard.badge.grow']);
  assert.deepEqual(badgeParts({ reasons: [{ type: 'mem', memMB: 3500 }] })[0].vars, { mem: '3.4GB' });
  assert.deepEqual(badgeParts({ paused: { at: 1 }, reasons: [{ type: 'cpu', pct: 1, ms: 1 }] }), [{ key: 'guard.badge.paused', vars: {} }]);
  assert.deepEqual(badgeParts(null), []);
  const t = lookup(ko);
  assert.equal(t('guard.badge.cpu', { pct: 95, min: 4 }), 'CPU 95% · 4분');
  assert.equal(lookup(en)('guard.badge.grow', { mem: '3.4GB' }), 'Mem 3.4GB ↑');
});

test('카드 보기: 끄기는 에이전트 본체가 아닐 때만, 일시정지는 도우미가 있을 때만, 멈췄으면 다시 돌리기', () => {
  const card = { guard: { top: { pid: 30, name: 'node.exe', agent: false } } };
  assert.deepEqual(guardActions(card, { canPause: true }), { acts: ['kill', 'pause', 'sleep', 'mute'], recommend: null });
  assert.deepEqual(guardActions(card, { canPause: false }).acts, ['kill', 'sleep', 'mute']);
  const agent = { guard: { top: { pid: 10, name: 'claude.exe', agent: true } } };
  assert.deepEqual(guardActions(agent, { canPause: true }), { acts: ['pause', 'sleep', 'mute'], recommend: 'sleep' });
  assert.deepEqual(guardActions({ guard: { ...card.guard, paused: { at: 1 } } }, { canPause: true }).acts, ['resume', 'sleep']);
  assert.deepEqual(guardActions(card, { canPause: true, sleepable: false }).acts, ['kill', 'pause', 'mute']);
});

test('지금 값: 같은 PID면 표본의 CPU·메모리로', () => {
  const card = { guard: { top: { pid: 30, name: 'node.exe', cpuPct: 10, memMB: 50 } } };
  assert.deepEqual(liveTop(card, { topCpu: { pid: 30, cpuPct: 12, memMB: 60 } }), { pid: 30, name: 'node.exe', cpuPct: 12, memMB: 60 });
  assert.equal(liveTop(card, { topCpu: { pid: 31, cpuPct: 99 } }).cpuPct, 10);
  assert.equal(guardOf({ sessions: [{ sessionId: 'a', guard: { kind: 'heavy' } }] }, 'a').kind, 'heavy');
  assert.equal(guardOf(null, 'a'), null);
});

test('이유 글과 숫자', () => {
  assert.equal(fmtMem(512), '512MB'); assert.equal(fmtMem(2048), '2.0GB'); assert.equal(fmtMem(null), '?');
  assert.equal(fmtMin(10), 1); assert.equal(fmtMin(185000), 3);
  const p = whyParts({ reasons: [{ type: 'grow', fromMB: 1000, toMB: 1500, ms: 600000 }] });
  assert.equal(lookup(ko)(p[0].key, p[0].vars), '메모리가 10분 동안 계속 늘어남 1000MB → 1.5GB');
});

test('설정: 세션 묶음에 자원 쪽(설정 키가 있을 때), 기준값은 폭주 감지의 딸린 칸, 찾기', () => {
  const st = { sleepAfterMin: 30, archiveDays: 14, guardDetect: true, guardLowerPriority: true };
  assert.deepEqual(navOf(st, { launchers: [] }, false).find((g) => g.group === 'session').pages, ['launchers', 'sleep', 'resources', 'recall']);
  assert.equal(pagesOf(navOf({ sleepAfterMin: 30 }, null, false)).includes('resources'), false); // 옛 판
  assert.equal(PAGE_ICON.resources, 'gauge');
  assert.deepEqual(rowState('guardCpuPct', { guardDetect: false }), { child: true, dim: true });
  assert.deepEqual(rowState('guardCpuPct', { guardDetect: true }), { child: true, dim: false });
  const pages = pagesOf(navOf(st, { launchers: [] }, false));
  assert.equal(searchItems('폭주', lookup(ko), pages)[0].id, 'guardDetect');
  assert.equal(searchItems('priority', lookup(en), pages)[0].id, 'guardLowerPriority');
});

test('사전: en·ko가 같은 열쇠', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, p + k + '.') : [p + k]));
  assert.deepEqual(keys(ko.guard).sort(), keys(en.guard).sort());
  assert.equal(ko.userTasks.kind.guard, '폭주');
  assert.equal(en.setNav.page.resources, 'Resources');
});
