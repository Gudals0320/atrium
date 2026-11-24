// P349 단위 시험: PC 세션 맵의 작업 중 빛 비용 줄이기(styles.css P349 덩어리, MissionLineage.jsx paint).
// - 세션 맵을 움직이는 동안(data-moving) 도는 고리(.mt-mm-lring)를 숨기고, 빛 층의 따로 합성 층(will-change)도 내린다.
// - 가만히일 때만 빛 층을 따로 층으로 올린다(빛이 도는 조건일 때만: 켬, 또는 Windows 설정 따름이고 움직임 줄이기가 아님. 끔·가벼운 판은 아니다).
// - 휴대폰 맵은 그대로(holdLights, phone.css)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
const block = css.slice(css.indexOf('/* ---------- P349'));
// 주석을 뺀 규칙들: [선택자, 선언, 미디어 조건]
function rules(text) {
  const out = [];
  const s = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /@media\s*([^{]+)\{((?:[^{}]*\{[^{}]*\})*)\s*\}|([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) { for (const r of rules(m[2])) out.push({ ...r, media: m[1].trim() }); continue; }
    for (const sel of m[3].split(',')) out.push({ sel: sel.trim(), decl: m[4].trim(), media: null });
  }
  return out;
}
const R = rules(block);

test('P349 덩어리가 styles.css 끝에 있고 P107 빛 층 규칙 뒤다', () => {
  assert.ok(css.indexOf('/* ---------- P349') > css.indexOf('.mt-mm-lring { display: var(--mm-go, none)'));
  assert.ok(R.length >= 3, JSON.stringify(R));
});

test('움직이는 동안: 세션 맵의 도는 고리를 숨긴다', () => {
  const hide = R.filter((r) => /\.mt-mm-lring$/.test(r.sel) && /display:\s*none/.test(r.decl));
  assert.equal(hide.length, 1);
  assert.match(hide[0].sel, /^\[data-role="mission"\]\[data-moving="1"\] \.mt-mm-lring$/);
  assert.equal(hide[0].media, null, '빛 설정·움직임 줄이기와 상관없이');
});

test('가만히일 때만 빛 층을 따로 합성 층으로: 움직이는 동안·끔·가벼운 판·system의 움직임 줄이기는 아니다', () => {
  const will = R.filter((r) => /will-change:\s*transform/.test(r.decl));
  assert.equal(will.length, 2, JSON.stringify(will));
  for (const r of will) {
    assert.match(r.sel, /\.mt-mm-light$/);
    assert.match(r.sel, /\[data-role="mission"\]:not\(\[data-moving="1"\]\)/, '움직이는 동안은 내린다');
    assert.match(r.sel, /html:not\(\.mt-lite\)/, '가벼운 판은 아니다');
  }
  const on = will.find((r) => r.media === null);
  assert.ok(on, '켬(기본)은 늘');
  assert.match(on.sel, /:not\(\[data-work-light="off"\]\):not\(\[data-work-light="system"\]\)/);
  const sys = will.find((r) => r.media);
  assert.match(sys.media, /prefers-reduced-motion:\s*no-preference/, 'system은 움직임 줄이기가 아닐 때만');
  assert.match(sys.sel, /\[data-work-light="system"\]/);
  // 끔일 때 맞는 규칙이 없다
  assert.ok(!will.some((r) => /\[data-work-light="off"\](?!\))/.test(r.sel.replace(/:not\([^)]*\)/g, ''))));
});

test('세션 맵(PC)은 움직이는 동안 data-moving을 달고 160ms 뒤 뗀다(빛은 CSS가, holdLights 없음). 휴대폰은 그대로', () => {
  const s = fs.readFileSync(path.join(SRC, 'MissionLineage.jsx'), 'utf8') + fs.readFileSync(path.join(SRC, 'MapCard.jsx'), 'utf8'); /* P356: 카드는 MapCard.jsx로 옮겼다 */
  assert.match(s, /root\.dataset\.moving = '1'/);
  assert.match(s, /delete root\.dataset\.moving;[^}]*\}, 160\)/);
  assert.doesNotMatch(s, /holdLights\(|import \{ holdLights/);
  const ph = fs.readFileSync(path.join(SRC, 'PhoneMap.jsx'), 'utf8');
  assert.match(ph, /holdLights\(vp, true\)/);
  assert.doesNotMatch(ph, /data-role="mission"/, '휴대폰 맵에는 PC 규칙이 닿지 않는다');
});

test('빛 고리가 다시 보이면 박자를 맞추는 고리(onLightStart)는 빛 층에 그대로 있다', () => {
  const m = fs.readFileSync(path.join(SRC, 'Mission.jsx'), 'utf8') + fs.readFileSync(path.join(SRC, 'MapCard.jsx'), 'utf8'); /* P356: 카드는 MapCard.jsx로 옮겼다 */
  assert.match(m, /className="mt-mm-light"[^>]*onAnimationStart=\{onLightStart\}/);
});
