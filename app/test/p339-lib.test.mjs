// P339: 축소할수록 폴더 묶음·워크스페이스·워크트리 이름표와 세션 노드 머리줄만 다시 키운다(판 하나의 --lbl 띠 값, 멈춘 뒤 한 번).
//   터미널 글자, 요약·본문 글은 판 단위 고정(P324) 그대로
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { labelScale, LABEL_BASE_PX, LABEL_SCREEN_PX, LABEL_MAX, LABEL_STEPS } from '../src/renderer/lib/view-settle.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('곡선: 배율 0.92 이상은 1, 그 아래는 화면 12px 아래로 내려가지 않게 키운다(상한까지)', () => {
  for (const z of [1, 1.5, 4, 0.95, 12 / 13]) assert.equal(labelScale(z), 1, String(z));
  for (const z of [0.9, 0.8, 0.6, 0.5, 0.4, 0.3, 0.25, 0.22, 0.21]) {
    const s = labelScale(z);
    assert.ok(s > 1, String(z));
    const screen = LABEL_BASE_PX * s * z;
    assert.ok(screen >= LABEL_SCREEN_PX - 1e-9, `${z}: 화면 ${screen}`); // 하한
    assert.ok(screen < LABEL_SCREEN_PX * 2 ** (1 / LABEL_STEPS) + 1e-9, `${z}: 화면 ${screen}`); // 띠 하나 넘게 키우지 않는다
  }
  // 줄어들수록 배수는 줄지 않는다
  let prev = 0;
  for (let z = 1.2; z >= 0.1; z -= 0.01) { const s = labelScale(z); assert.ok(s >= prev - 1e-12, String(z)); prev = s; }
});

test('상한: 배율 0.2(틀 얼굴 경계)에서 화면 약 12.4px, 더 줄여도 상한 그대로', () => {
  assert.ok(Math.abs(LABEL_MAX - 2 ** 2.25) < 1e-9);
  assert.equal(labelScale(0.2), LABEL_MAX);
  assert.equal(labelScale(0.1), LABEL_MAX);
  assert.equal(labelScale(0.01), LABEL_MAX);
  assert.ok(Math.abs(LABEL_BASE_PX * LABEL_MAX * 0.2 - 12.37) < 0.01);
  // 상한에서 커진 이름표가 이웃을 덮지 않는다: 영역 이름표(13px, 높이 2.1em)는 영역 사이 틈(240px) 안, 노드 머리줄(2.15em)은 기본 노드(810px) 높이의 1/5 아래
  assert.ok(13 * LABEL_MAX * 2.1 < 240 * 0.6);
  assert.ok(13 * LABEL_MAX * 2.15 < 810 / 5);
});

test('띠: 값은 2^(k/4)뿐이고 배율 1~0.2 사이에 열 가지 안팎', () => {
  const seen = new Set();
  for (let z = 1; z >= 0.2; z -= 0.001) seen.add(labelScale(z));
  for (const s of seen) { const k = Math.log2(s) * LABEL_STEPS; assert.ok(Math.abs(k - Math.round(k)) < 1e-9, String(s)); }
  assert.ok(seen.size <= 10, String(seen.size));
  assert.equal(labelScale(NaN), 1);
  assert.equal(labelScale(0), 1);
});

test('--lbl은 판 하나에만 쓰고, 쓰는 규칙은 세 이름표(폴더 묶음·워크스페이스·워크트리)와 노드 머리줄뿐이다', () => {
  const cv = read('../src/renderer/Canvas.jsx');
  assert.match(cv, /const l = labelScale\(z\);/);
  assert.match(cv, /if \(l !== lbl\) \{ lbl = l; el\.style\.setProperty\('--lbl'/);
  // CSS: var(--lbl)을 쓰는 규칙의 선택자는 노드 머리줄뿐
  const css = read('../src/renderer/styles.css');
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[2].includes('var(--lbl'));
  assert.ok(rules.length >= 1);
  for (const m of rules) assert.match(m[1].trim(), /^\.mt-node(\.face-close)? \.mt-node-head$|^\.mt-node-head$/, m[1]);
  // JS 인라인: Regions(영역·워크트리·묶음 이름표)와 ConvoNode(워크트리 대화 상자 이름표)만
  const files = ['Regions.jsx', 'ConvoNode.jsx', 'SessionNode.jsx', 'Docks.jsx', 'Memo.jsx', 'Kanban.jsx', 'TerminalView.jsx', 'MissionLineage.jsx'];
  const users = files.filter((f) => read('../src/renderer/' + f).includes('var(--lbl'));
  assert.deepEqual(users.sort(), ['ConvoNode.jsx', 'Regions.jsx']);
  const rg = read('../src/renderer/Regions.jsx');
  assert.match(rg, /const REGION_HEAD_STYLE = headAt\(13\)/);
  assert.match(rg, /const WT_HEAD_STYLE = headAt\(12\)/);
  assert.match(rg, /const GROUP_HEAD_STYLE = groupHeadAt\(12\)/);
  // 터미널 칸에는 쓰지 않는다
  assert.ok(!/\.mt-term[^{]*\{[^}]*--lbl/.test(css));
});

test('터미널 얼굴 머리줄은 커진 만큼 터미널 칸에 겹쳐 터미널 칸 크기가 그대로다(바탕 높이 2.15em × 13px)', () => {
  const css = read('../src/renderer/styles.css');
  assert.match(css, /\.mt-node\.face-close \.mt-node-head \{ position: relative; z-index: 3; margin-bottom: calc\(27\.95px - 2\.15em\); \}/);
  assert.match(css, /\.mt-node-head \{ display: flex;[^}]*height: 2\.15em;/);
  assert.ok(Math.abs(13 * 2.15 - 27.95) < 1e-9);
});
