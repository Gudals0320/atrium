// P314 단위 시험: 사용량 펼침 아래쪽 줄의 표시 규칙. 알약은 Claude·Codex·AGY만(그 밖은 펼침 아래쪽), Claude 모델별 주간은 펼침에만,
// 잔액 글, 출처 열쇠, 묻는 중, 두 사전의 새 열쇠. P347: Hermes 사용량(합침·따로 줄)은 걷었다(옛 값이 와도 보이지 않는다)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pillLine, pillOf, remainingOf, shownWindows, windowLabel, extraRows, balanceOf, sourceKey, probingOf, PROVIDERS, EXTRAS } from '../src/renderer/lib/usage.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';
import * as usageLib from '../src/renderer/lib/usage.js';

const NOW = Date.parse('2026-11-22T03:00:00Z');
const H = 3600000;
const claude = { provider: 'claude', source: 'probe:claude', at: NOW, windows: [{ id: '5h', usedPct: 12, resetsAt: NOW + H }, { id: 'week', usedPct: 55, resetsAt: NOW + 90 * H }, { id: 'week:Fable', usedPct: 97, resetsAt: NOW + 90 * H }] };
const codex = { provider: 'codex', source: 'probe:codex', at: NOW, windows: [{ id: '5h', usedPct: 20, resetsAt: NOW + 3 * H }, { id: 'week', usedPct: 17, resetsAt: NOW + 140 * H }] };
const hermes = { provider: 'hermes', source: 'probe:hermes', at: NOW, hermesProvider: 'openai-codex', plan: 'Plus', windows: codex.windows, sameAs: 'codex' };
const deepseek = { provider: 'deepseek', source: 'probe:balance', at: NOW, windows: [], balance: { total: 7.25, currency: 'USD' } };
const view = { providers: { claude, codex, agy: null, hermes, deepseek }, probing: ['balance'] };

test('P314 알약은 지금처럼 세 대표만, 모델별 주간은 알약·남은 양에서 빠진다(97%여도 알약 색을 바꾸지 않는다)', () => {
  const line = pillLine(view, NOW);
  assert.deepEqual(line.parts.map((p) => p.provider), ['claude', 'codex']);
  assert.deepEqual(line.parts[0].wins.map((w) => w.id), ['5h', 'week']);
  assert.equal(line.level, 'ok');
  assert.equal(pillOf(view, NOW).parts.length, 2);
  assert.equal(remainingOf(view, 'claude', NOW).pct, 45);
  assert.deepEqual(PROVIDERS, ['claude', 'codex', 'agy']);
});

test('P314 펼침은 모델별 주간도 보인다(주간 (Fable))', () => {
  assert.deepEqual(shownWindows('claude', claude, { all: true }).map((w) => w.id), ['5h', 'week', 'week:Fable']);
  assert.deepEqual(shownWindows('claude', claude).map((w) => w.id), ['5h', 'week']);
  const t = (k) => (k === 'usage.win.week' ? '주간' : k);
  assert.equal(windowLabel('week:Fable', t), '주간 (Fable)');
});

test('P347 아래쪽 줄: 옛 백엔드가 hermes 값을 보내도(같은 계정·다른 계정) 줄이 없다, 잔액 줄만', () => {
  assert.deepEqual(extraRows(view).map((r) => [r.provider, r.type]), [['deepseek', 'balance']]);
  const apart = { providers: { ...view.providers, hermes: { ...hermes, sameAs: null } } };
  assert.deepEqual(extraRows(apart).map((r) => [r.provider, r.type]), [['deepseek', 'balance']]);
  const noCodex = { providers: { ...view.providers, codex: null } };
  assert.deepEqual(extraRows(noCodex).map((r) => r.provider), ['deepseek']);
  assert.deepEqual(extraRows({ providers: { claude, codex, agy: null } }), []);
  assert.deepEqual(EXTRAS, ['deepseek', 'openrouter']);
  assert.equal('mergedInto' in usageLib, false, 'Codex 칸에 합치는 길이 없다');
  assert.equal(sourceKey('probe:hermes'), null);
});

test('P314 잔액 글, 출처 열쇠, 묻는 중', () => {
  const b = balanceOf({ total: 7.25, currency: 'USD' });
  assert.equal(b.key, 'usageProbe.balance'); assert.equal(b.vars.cur, 'USD'); assert.match(b.vars.n, /^7[.,]25$/);
  assert.equal(balanceOf({ total: 'x' }), null);
  assert.equal(sourceKey('statusline'), 'usage.source.statusline');
  assert.equal(sourceKey('probe:codex'), 'usageProbe.source.probe:codex');
  assert.equal(sourceKey('weird'), null);
  assert.equal(probingOf(view, 'deepseek'), true);
  assert.equal(probingOf(view, 'openrouter'), true);
  assert.equal(probingOf(view, 'claude'), false);
  assert.equal(probingOf({ probing: ['claude'] }, 'claude'), true);
});

test('P314 두 사전에 새 열쇠가 모두 있다', () => {
  const keys = ['probing', 'extrasHead', 'balanceName', 'balance', 'name', 'hint', 'setOn', 'setOff', 'minName', 'minHint', 'minSet'];
  for (const d of [ko, en]) {
    for (const k of keys) assert.equal(typeof d.usageProbe[k], 'string', k);
    for (const s of ['probe:codex', 'probe:claude', 'probe:balance']) assert.equal(typeof d.usageProbe.source[s], 'string', s);
    for (const k of ['mergedWith', 'hermesName', 'hermesHint', 'hermesSetOn', 'hermesSetOff']) assert.equal(k in d.usageProbe, false, `P347: ${k} 없음`);
    assert.equal('probe:hermes' in d.usageProbe.source, false);
    assert.doesNotMatch(d.usageProbe.hint, /Hermes/);
  }
});
