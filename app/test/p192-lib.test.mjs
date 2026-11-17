// P192 창 단위 시험: AGY 종류 아이콘(기호, 색 변수, 로고 그림 없음)과 호출자 아이콘 목록, 잠재우기 문구의 종류 목록
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kindOf, KINDS, SHAPES, logoFor } from '../src/renderer/lib/kinds.js';
import { ICONS, launcherIcon } from '../src/renderer/lib/launchers.js';

test('P192 AGY 종류: 이름 AGY, 기호 AG, 둥근 사각, 색 변수(tokens.css), 로고 그림 없음', () => {
  const k = kindOf('agy');
  assert.equal(k, KINDS.agy);
  assert.equal(k.label, 'AGY'); assert.equal(k.mark, 'AG');
  assert.ok(SHAPES[k.shape]);
  assert.equal(logoFor(k, 'ready'), null);
  const css = fs.readFileSync(new URL('../src/renderer/tokens.css', import.meta.url), 'utf8');
  assert.match(css, /--kind-agy:\s*#[0-9a-f]{6}/i); assert.match(css, /--kind-agy-ink:\s*#[0-9a-f]{6}/i);
});

test('P192 호출자 아이콘: agy를 고를 수 있고, 아이콘이 없는 AGY 호출자는 agy를 그린다', () => {
  assert.ok(ICONS.includes('agy'));
  assert.equal(launcherIcon({ harness: 'agy', icon: '' }), 'agy');
});

test('P192 사전: 잠재우기 문구의 종류 목록에 AGY(영어·한국어)', async () => {
  const en = (await import('../src/renderer/locales/en.js')).default;
  const ko = (await import('../src/renderer/locales/ko.js')).default;
  const all = (o) => JSON.stringify(o);
  assert.match(all(en), /opencode, pi, AGY\)/); assert.match(all(ko), /opencode, pi, AGY\)/);
  assert.match(all(en), /opencode, pi and AGY sessions sleep/); assert.match(all(ko), /pi, AGY 세션만/);
});
