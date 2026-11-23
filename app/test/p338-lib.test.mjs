// P338 단위 시험: 설정 창 왼쪽 목록(묶음)·설정 찾기·딸린 칸 흐려짐(lib/settings-nav.js), 봇 카드의 런처·하네스 계약 목록·상태 요약·저장소별 표(lib/bots.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { navOf, pagesOf, pageOf, searchItems, rowState, parentOn, ITEMS } from '../src/renderer/lib/settings-nav.js';
import { botsOf, allowedKinds, launcherPicks, harnessPicks, pickedLauncher, patchFromLauncher, patchFromHarness, modelChoices, effortChoices, permissionShown, statusOf, mergeRows, mergeFieldOf } from '../src/renderer/lib/bots.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const lookup = (dict) => (k, v = {}) => { const s = k.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), dict); return typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (m, n) => (n in v ? v[n] : m)) : k; };
const FULL = { sleepAfterMin: 30, archiveDays: 14, usageAlerts: true, usageProbe: true, usageProbeMin: 10, usageHermes: false, planNotify: 'next', perfTrace: false, mergerMode: 'ask', todoTidyMode: 'on', updateCheck: true };

test('왼쪽 목록: 주제 묶음과 쪽, 옛 판이면 빠진다', () => {
  const nav = navOf(FULL, { launchers: [] }, true);
  assert.deepEqual(nav.map((g) => g.group), ['general', 'session', 'alerts', 'bots', 'connect', 'dev']);
  assert.deepEqual(pagesOf(nav), ['general', 'launchers', 'sleep', 'recall', 'alerts', 'bots', 'devices', 'terminal', 'dev']);
  const old = navOf({ sleepAfterMin: 30 }, null, false);
  assert.deepEqual(pagesOf(old), ['general', 'sleep', 'devices', 'terminal']);
  assert.deepEqual(navOf(null, null, false).map((g) => g.group), ['general', 'connect']);
});

test('옛 탭 이름(merger, agents)으로 열면 봇 쪽', () => {
  assert.equal(pageOf('merger'), 'bots');
  assert.equal(pageOf('agents'), 'bots');
  assert.equal(pageOf('launchers'), 'launchers');
  assert.equal(pageOf(null), null);
});

test('찾기 칸의 사전 열쇠는 두 사전에 다 있다', () => {
  for (const [name, d] of [['ko', ko], ['en', en]]) {
    const t = lookup(d);
    for (const it of ITEMS) for (const k of [it.name, it.hint, it.note].filter(Boolean)) assert.notEqual(t(k), k, name + ' ' + k);
    for (const k of ['general', 'launchers', 'sleep', 'recall', 'alerts', 'bots', 'devices', 'terminal', 'dev']) assert.notEqual(t('setNav.page.' + k), 'setNav.page.' + k);
  }
});

test('찾기: 이름에 든 것이 먼저, 풀이로도 찾고 없는 쪽은 뺀다', () => {
  const t = lookup(ko);
  const pages = pagesOf(navOf(FULL, { launchers: [] }, true));
  const r = searchItems('사용량', t, pages);
  assert.ok(r.length >= 3);
  assert.equal(r[0].at, 'name');
  assert.ok(r.some((x) => x.id === 'usageProbeMin'));
  assert.ok(r.every((x, i) => i === 0 || !(x.at === 'name' && r[i - 1].at === 'text')), '이름 먼저');
  const tray = searchItems('트레이', t, pages);
  assert.equal(tray[0].id, 'tray');
  assert.deepEqual(searchItems('', t, pages), []);
  assert.deepEqual(searchItems('없는낱말xyz', t, pages), []);
  assert.ok(!searchItems('성능', t, ['general']).some((x) => x.page === 'dev'), '보이지 않는 쪽은 뺀다');
  const e = searchItems('merge bot', lookup(en), pages);
  assert.equal(e[0].id, 'bot-merge');
});

test('딸린 칸: 들여쓰고 부모가 꺼지면 흐리다', () => {
  assert.deepEqual(rowState('usageProbeMin', { usageProbe: true }), { child: true, dim: false });
  assert.deepEqual(rowState('usageProbeMin', { usageProbe: false }), { child: true, dim: true });
  assert.deepEqual(rowState('usageHermes', { usageProbe: false }), { child: true, dim: true });
  assert.deepEqual(rowState('tray', { tray: false }), { child: false, dim: false });
  assert.equal(parentOn('updateCheck', { updateCheck: false }), false);
  assert.equal(parentOn('bot-merge', { mergerMode: 'off' }), false);
  assert.equal(parentOn('bot-merge', { mergerMode: 'ask' }), true);
  assert.equal(parentOn('nope', {}), true);
});

// ---- 봇 ----
const HARN = [
  { id: 'claude', fields: ['startCommand', 'model', 'effort', 'permissionMode', 'args', 'env'], models: ['haiku', 'sonnet', 'claude-sonnet-5-5'] },
  { id: 'codex', fields: ['startCommand', 'model', 'effort', 'permissionMode', 'args'], models: ['gpt-6-astra'], efforts: ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] },
  { id: 'dsh', fields: ['startCommand', 'args'], models: [] },
  { id: 'hermes', fields: ['startCommand', 'model', 'effort', 'permissionMode', 'args'], models: [], efforts: ['', 'low', 'medium', 'high'] },
  { id: 'shell', fields: [], models: [] }, { id: 'command', fields: ['command', 'env'], models: [] },
];
const SET = { mergerMode: 'ask', mergerKind: 'claude', mergerModel: 'claude-sonnet-5-5', mergerEffort: 'medium', mergerPermission: '', todoTidyMode: 'on', todoTidyKind: 'claude', todoTidyModel: 'haiku', todoTidyEffort: 'low' };
const LDATA = { favorites: ['l2', 'l1'], harnesses: HARN, launchers: [
  { id: 'l1', name: 'Opus high', harness: 'claude', model: 'claude-opus-5-5', effort: 'high', permissionMode: 'acceptEdits' },
  { id: 'l2', name: 'Sonnet', harness: 'claude', model: 'claude-sonnet-5-5', effort: 'medium', permissionMode: 'manual' },
  { id: 'l3', name: 'Codex', harness: 'codex', model: '', effort: 'ultra', permissionMode: 'auto' },
  { id: 'l4', name: 'sh', harness: 'shell' }, { id: 'l5', name: 'cmd', harness: 'command' }, { id: 'l6', name: 'dsh', harness: 'dsh' },
] };

test('봇 목록과 받는 하네스', () => {
  const bots = botsOf(null, SET);
  assert.deepEqual(bots.map((b) => b.id), ['merge', 'todoTidy']);
  assert.equal(allowedKinds(bots[0]), null);
  assert.deepEqual(allowedKinds(bots[1]), ['claude', 'codex']);
});

test('런처 고르기: 에이전트 런처만, 봇이 받는 하네스만, 지금 값과 맞는 런처', () => {
  const [merge, tidy] = botsOf(null, SET);
  assert.deepEqual(launcherPicks(LDATA, null).map((l) => l.id), ['l2', 'l1', 'l3', 'l6']);
  assert.deepEqual(launcherPicks(LDATA, ['claude', 'codex']).map((l) => l.id), ['l2', 'l1', 'l3']);
  assert.equal(pickedLauncher(launcherPicks(LDATA), merge).id, 'l2');
  assert.equal(pickedLauncher(launcherPicks(LDATA), tidy), null);
  assert.deepEqual(harnessPicks(HARN, ['claude', 'codex']), ['claude', 'codex']);
  assert.ok(!harnessPicks(HARN, null).includes('shell'));
  assert.ok(harnessPicks(HARN, null, 'weird').includes('weird'));
});

test('런처를 고르면 그 하네스·모델·노력(받는 값만)·승인 방식을 봇 키에', () => {
  const [merge, tidy] = botsOf(null, SET);
  assert.deepEqual(patchFromLauncher(merge, LDATA.launchers[0], HARN), [['mergerKind', 'claude'], ['mergerModel', 'claude-opus-5-5'], ['mergerEffort', 'high'], ['mergerPermission', 'acceptEdits']]);
  // Codex 런처: 빈 모델은 봇 기본, ultra는 봇 설정이 받지 않아 빈 값
  assert.deepEqual(patchFromLauncher(tidy, LDATA.launchers[2], HARN), [['todoTidyKind', 'codex'], ['todoTidyModel', 'haiku'], ['todoTidyEffort', '']]);
  // 하네스만: 모르는 모델이면 목록 첫 값, 받지 않는 노력이면 빈 값
  assert.deepEqual(patchFromHarness(tidy, 'codex', HARN), [['todoTidyKind', 'codex'], ['todoTidyModel', 'gpt-6-astra']]);
  assert.deepEqual(patchFromHarness(merge, 'dsh', HARN), [['mergerKind', 'dsh']]);
});

test('모델·노력 목록은 하네스 표(계약)가 주고, 받지 않는 칸은 숨긴다', () => {
  assert.deepEqual(modelChoices(HARN, 'claude', 'haiku'), { show: true, list: ['haiku', 'sonnet', 'claude-sonnet-5-5'], free: false });
  assert.deepEqual(modelChoices(HARN, 'claude', 'opus-x').list.slice(-1), ['opus-x']);
  assert.equal(modelChoices(HARN, 'dsh', '').show, false);
  assert.equal(modelChoices(HARN, 'hermes', '').free, true);
  assert.deepEqual(effortChoices(HARN, 'codex').list, ['', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(effortChoices(HARN, 'hermes').list, ['', 'low', 'medium', 'high']);
  assert.equal(effortChoices(HARN, 'dsh').show, false);
  assert.equal(permissionShown(HARN, 'claude'), true);
  assert.equal(permissionShown(HARN, 'dsh'), false);
});

test('상태 줄: 판 요약 → 상태·오늘 한 것·갈 세션, 요약이 없으면 설정만', () => {
  const st = { merge: { state: 'working', today: { merged: 3, failed: 1 }, open: { merging: 1, queued: 2 }, mergers: [{ name: 'merger-a', sessionId: 's9' }] }, todoTidy: { state: 'idle', hour: 30, perHour: 30, today: { cards: 7, dropped: 2, fallback: 0 } } };
  const m = statusOf('merge', st);
  assert.equal(m.state, 'working');
  assert.equal(m.go, 's9');
  assert.deepEqual(m.parts.map((p) => p.key), ['bots.today.merged', 'bots.today.failed', 'bots.today.queued', 'bots.today.sessions']);
  const x = statusOf('todoTidy', st);
  assert.equal(x.capped, true);
  assert.deepEqual(x.parts.map((p) => p.vars.n), [30, 7, 2]);
  assert.equal(statusOf('merge', null, { mergerMode: 'off' }).state, 'off');
  assert.equal(statusOf('todoTidy', null, {}).state, 'idle');
  const t = lookup(ko);
  for (const p of [...m.parts, ...x.parts]) assert.notEqual(t(p.key, p.vars), p.key);
});

test('저장소별 표: 이름 차례와 칸 확인', () => {
  const rows = mergeRows({ workspaces: [{ workspace: 'w2', target: null }, { workspace: 'w1', target: 'dev' }] }, [{ key: 'w1', name: 'beta' }, { key: 'w2', name: 'alpha' }]);
  assert.deepEqual(rows.map((r) => r.name), ['alpha', 'beta']);
  assert.deepEqual(mergeRows(null), []);
  assert.deepEqual(mergeFieldOf('target', ' dev '), { value: 'dev' });
  assert.deepEqual(mergeFieldOf('target', ''), { value: '' });
  assert.equal(mergeFieldOf('target', 'a..b').error, 'target');
  assert.deepEqual(mergeFieldOf('where', 'main'), { value: 'main' });
  assert.equal(mergeFieldOf('where', 'x').error, 'where');
  assert.deepEqual(mergeFieldOf('push', true), { value: true });
  assert.equal(mergeFieldOf('push', 'on').error, 'push');
  assert.deepEqual(mergeFieldOf('guide', 'docs\\m.md'), { value: 'docs/m.md' });
  assert.equal(mergeFieldOf('guide', 'C:/x.md').error, 'guide');
  assert.equal(mergeFieldOf('guide', '../x.md').error, 'guide');
});

test('설정 창: 옛 가로 탭이 아니라 왼쪽 목록과 찾기 칸, 자동 결정 카드는 봇 카드에', () => {
  const src = fs.readFileSync(new URL('../src/renderer/Settings.jsx', import.meta.url), 'utf8');
  assert.ok(src.includes('data-field="settings-search"'));
  assert.ok(src.includes('mt-set-nav'));
  assert.ok(!src.includes('autoDecisions.settingName'));
  const bots = fs.readFileSync(new URL('../src/renderer/Bots.jsx', import.meta.url), 'utf8');
  assert.ok(bots.includes('setting-autoDecisions'));
  assert.ok(bots.includes("'merger.config.set'"));
});
