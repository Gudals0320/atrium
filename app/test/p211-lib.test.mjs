// P211 단위 시험: 구독 사용량 화면의 순수 함수. 알약 색 기준(60 미만 초록, 60~84 노랑, 85 이상 빨강), 구독마다 가장 높은 창,
// 리셋이 지난 창, 호출자 → 구독(연결·API 환경 변수는 구독이 아님), 남은 양, 시간 글, 크레딧, 알림 글
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelOf, livePct, topOf, pillOf, remainingOf, providerOfLauncher, spanOf, windowKey, creditOf, alertText, windowLabel } from '../src/renderer/lib/usage.js';
import { translate } from '../src/renderer/lib/i18n.js';

const NOW = Date.parse('2026-11-18T00:00:00Z');
const view = { providers: {
  claude: { provider: 'claude', at: NOW, windows: [{ id: '5h', usedPct: 34, resetsAt: NOW + 3600000 }, { id: 'week', usedPct: 81.4, resetsAt: NOW + 86400000 }] },
  codex: { provider: 'codex', at: NOW, windows: [{ id: '5h', usedPct: 92, resetsAt: NOW - 1 }, { id: 'week', usedPct: 59.6, resetsAt: NOW + 86400000 }] },
  agy: null,
} };

test('P211 알약 색 기준: 60 미만 초록, 60~84 노랑, 85 이상 빨강(반올림), 모르면 none', () => {
  assert.equal(levelOf(0), 'ok'); assert.equal(levelOf(59.4), 'ok'); assert.equal(levelOf(59.5), 'warn');
  assert.equal(levelOf(60), 'warn'); assert.equal(levelOf(84), 'warn'); assert.equal(levelOf(84.6), 'high'); assert.equal(levelOf(85), 'high'); assert.equal(levelOf(100), 'high');
  assert.equal(levelOf(null), 'none'); assert.equal(levelOf(undefined), 'none');
});

test('P211 알약: 구독마다 가장 높은 창(리셋이 지난 창은 0%), 전체 색은 가장 높은 값', () => {
  assert.equal(livePct({ usedPct: 92, resetsAt: NOW - 1 }, NOW), 0);
  assert.equal(livePct({ usedPct: 92, resetsAt: null }, NOW), 92);
  assert.deepEqual(topOf(view.providers.claude, NOW).w.id, 'week');
  const p = pillOf(view, NOW);
  assert.deepEqual(p.parts.map((x) => [x.provider, x.pct, x.level, x.window]), [['claude', 81, 'warn', 'week'], ['codex', 60, 'warn', 'week']]);
  assert.equal(p.level, 'warn'); assert.equal(p.known, 2);
  assert.equal(pillOf({ providers: { claude: { windows: [{ id: '5h', usedPct: 90 }] } } }, NOW).level, 'high');
  assert.deepEqual(pillOf(null, NOW), { parts: [], level: 'none', known: 0 });
});

test('P211 호출자 옆 남은 양: 구독을 쓰는 호출자만(API 환경 변수는 아님, P255: 옛 연결 칸은 보지 않는다), 100 − 가장 높은 창', () => {
  assert.equal(providerOfLauncher({ harness: 'claude' }), 'claude');
  assert.equal(providerOfLauncher({ harness: 'codex' }), 'codex');
  assert.equal(providerOfLauncher({ harness: 'agy' }), 'agy');
  assert.equal(providerOfLauncher({ harness: 'claude', connection: 'deepseek' }), 'claude');
  assert.equal(providerOfLauncher({ harness: 'claude', preview: { env: ['ANTHROPIC_BASE_URL'] } }), null);
  assert.equal(providerOfLauncher({ harness: 'codex', env: { OPENAI_API_KEY: 'x' } }), null);
  assert.equal(providerOfLauncher({ harness: 'pi' }), null); assert.equal(providerOfLauncher({ harness: 'shell' }), null); assert.equal(providerOfLauncher(null), null);
  assert.deepEqual(remainingOf(view, 'claude', NOW), { pct: 19, level: 'warn', window: 'week' });
  assert.equal(remainingOf(view, 'agy', NOW), null);
});

test('P211 시간·창·크레딧·알림 글(두 사전)', () => {
  assert.deepEqual(spanOf(5 * 60000), { key: 'usage.spanMin', vars: { m: 5 } });
  assert.deepEqual(spanOf(90 * 60000), { key: 'usage.spanHourMin', vars: { h: 1, m: 30 } });
  assert.deepEqual(spanOf(2 * 3600000), { key: 'usage.spanHour', vars: { h: 2 } });
  assert.deepEqual(spanOf(3 * 86400000 + 4 * 3600000), { key: 'usage.spanDayHour', vars: { d: 3, h: 4 } });
  assert.deepEqual(spanOf(3 * 86400000), { key: 'usage.spanDay', vars: { d: 3 } });
  assert.equal(windowKey('5h'), 'usage.win.5h'); assert.equal(windowKey('gemini'), null);
  const tk = (k, v) => translate('ko', k, v), te = (k, v) => translate('en', k, v);
  assert.equal(windowLabel('gemini-5h', tk), 'Gemini 5시간'); assert.equal(windowLabel('gemini-weekly', te), 'Gemini Weekly');
  assert.equal(windowLabel('3p-weekly', tk), '3p 주간'); assert.equal(windowLabel('gemini-argon-wtu-weekly', te), 'Gemini argon-wtu Weekly');
  assert.equal(windowLabel('week', tk), '주간'); assert.equal(windowLabel('odd', tk), 'odd');
  assert.equal(translate('ko', 'usage.win.week'), '주간'); assert.equal(translate('en', 'usage.win.week'), 'Weekly');
  assert.equal(creditOf(null), null);
  assert.deepEqual(creditOf({ unlimited: true }), { key: 'usage.creditUnlimited', vars: {} });
  assert.deepEqual(creditOf({ hasCredits: false }), { key: 'usage.creditNone', vars: {} });
  assert.equal(creditOf({ hasCredits: true, balance: '12.5' }).key, 'usage.credit');
  const a = alertText({ provider: 'codex', window: 'week', usedPct: 91.2, resetsAt: NOW + 7200000 }, NOW);
  assert.equal(translate('ko', a.title.key, a.title.vars), 'Codex 사용량 91%');
  assert.equal(translate('en', a.title.key, a.title.vars), 'Codex usage 91%');
  assert.deepEqual(a.reset, { key: 'usage.spanHour', vars: { h: 2 } });
  assert.equal(translate('ko', 'usage.left', { pct: 19 }), '19% 남음');
});

// 2026-11-18 사용자 요청: 레일의 즐겨찾기 호출자 단추는 로고만 보인다(구독 남은 양 숫자를 붙이지 않는다)
test('레일 호출자 단추에는 남은 양이 없다', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/renderer/Chrome.jsx', import.meta.url), 'utf8');
  const tool = src.slice(src.indexOf('function LauncherTool('), src.indexOf('function Favorites('));
  assert.ok(tool.length > 0);
  assert.ok(!/UsageLeft|useUsageLeft/.test(tool), '레일 단추에 UsageLeft가 없다');
});
