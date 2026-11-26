#!/usr/bin/env node
// P372 CSS 블록 자리 검사(npm run check:css): styles.css를 고친 직후, 기존 시험이 요구하는 블록 위치를 바로 본다.
// 기존 시험 몇은 styles.css의 자리로 덩어리를 찾는다(파일 끝의 마지막 reduce 블록, "/* P164" 뒤 전체 등). 끝에 덧붙이면 그 시험이 떨어졌다
// (사례 11·12: 끝에 reduce 블록을 더해 p85·p107 시험 실패, P164 블록 뒤에 animation을 더해 p164·p202 시험 실패, experiments/know-baseline/cases.md).
// 실패하면 어느 줄이 어느 블록 앞뒤로 가야 하는지 적는다. 정적 검사 뒤에 그 계약을 가진 단위 시험 파일만 돌린다(--no-tests면 건너뜀).
// 쓰기: cd app && npm run check:css   (또는 node scripts/check-css.mjs [--no-tests] [styles.css 경로])
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REDUCE = '@media (prefers-reduced-motion: reduce)';
// P85·P107 reduce 블록을 알아보는 규칙(p107-lib.test.mjs가 마지막 reduce 블록에서 찾는다)
const REDUCE_MARK = 'html[data-work-light="system"] .mt-node-run > i { animation: none;';
// 움직임 없는 꼬리: 이 머리부터 파일 끝까지 animation·transition 글자가 없어야 한다(주석 안도 센다, 시험이 그대로 읽는다)
export const STILL_TAILS = [
  { anchor: '/* P164', test: 'p164-lib.test.mjs', what: 'P164 뒤 일 표시(움직이지 않는다)' },
  { anchor: '/* P202: 세션 맵 오늘·이전 이름표', test: 'p202-lib.test.mjs', what: 'P202 오늘·이전 이름표(움직임에 기대지 않는다)' },
];
// 순서: before가 after보다 앞에 있어야 한다
export const ORDERS = [
  { before: '.mt-mm-lring { display: var(--mm-go, none)', after: '/* ---------- P349', test: 'p349-lib.test.mjs', hint: 'P349 덩어리는 P107 빛 층 규칙(.mt-mm-lring) 뒤, 파일 끝쪽에 둔다' },
  { before: 'P134', after: '.mt-mm-folder', test: 'p134-lib.test.mjs', hint: 'P134 덩어리(.mt-mm-folder 규칙)를 첫 "P134" 낱말 뒤에 둔다' },
];
// 이 검사가 지키는 계약을 가진 단위 시험(검사 뒤에 돌린다)
export const CSS_TESTS = ['p60-lib.test.mjs', 'p85-lib.test.mjs', 'p101-lib.test.mjs', 'p107-lib.test.mjs', 'p119-lib.test.mjs', 'p134-lib.test.mjs', 'p164-lib.test.mjs', 'p202-lib.test.mjs', 'p294-lib.test.mjs', 'p302-lib.test.mjs', 'p349-lib.test.mjs'];

const lineAt = (s, i) => s.slice(0, i).split('\n').length;
const noComments = (s) => s.replace(/\/\*[^]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')); // 자리(줄 번호)는 그대로

// → [{ rule, line, msg }]
export function cssProblems(css) {
  const out = [];
  const add = (rule, line, msg) => out.push({ rule, line, msg });
  // 1) 마지막 reduce 블록은 P85·P107 것(p85·p107 시험)
  const body = noComments(css);
  const mark = body.indexOf(REDUCE_MARK);
  if (mark < 0) add('reduce-last', 0, `P107 reduce 규칙(${REDUCE_MARK} …)을 찾지 못했다. p107 시험은 마지막 reduce 블록에서 이 줄을 찾는다`);
  else {
    const own = body.lastIndexOf(REDUCE, mark);
    for (let i = body.indexOf(REDUCE, mark); i >= 0; i = body.indexOf(REDUCE, i + 1)) {
      add('reduce-last', lineAt(css, i), `줄 ${lineAt(css, i)}의 "${REDUCE}"가 P85·P107 reduce 블록(줄 ${lineAt(css, own)}) 뒤에 있다. p85·p107 시험은 파일의 마지막 reduce 블록을 P85·P107 것으로 읽는다.\n    고치기: 새 블록을 따로 만들지 말고 움직임을 "@media (prefers-reduced-motion: no-preference) { … }" 안에 둔다(멈춤이 기본, P354 시선 태그 줄 ${lineAt(css, Math.max(0, css.indexOf('mt-gaze-in')))} 참고). 꼭 reduce 규칙이어야 하면 줄 ${lineAt(css, own)}의 블록보다 앞에 둔다`);
    }
  }
  // 2) 움직임 없는 꼬리
  const tails = STILL_TAILS.map((t) => ({ ...t, at: css.indexOf(t.anchor) }));
  for (const t of tails) if (t.at < 0) add('still-tail', 0, `"${t.anchor}" 머리를 찾지 못했다(${t.test}가 이 머리부터 끝까지 읽는다). 머리 주석을 지우거나 바꾸지 않는다`);
  const first = tails.filter((t) => t.at >= 0).sort((a, b) => a.at - b.at)[0];
  if (first) {
    const re = /animation|transition/g; let m;
    const seen = new Set();
    while ((m = re.exec(css))) {
      if (m.index < first.at) continue;
      const ln = lineAt(css, m.index); if (seen.has(ln)) continue; seen.add(ln);
      const hit = tails.filter((t) => t.at >= 0 && m.index > t.at).map((t) => t.test).join('·');
      const text = css.split('\n')[ln - 1].trim().slice(0, 90);
      add('still-tail', ln, `줄 ${ln}("${text}")에 ${m[0]}이 있다. "${first.anchor}" 블록(줄 ${lineAt(css, first.at)}) 뒤에는 animation·transition 글자(주석 포함)가 없어야 한다(${hit}: ${first.what}).\n    고치기: 이 규칙과 그 @keyframes를 "${first.anchor}" 블록 바로 앞(줄 ${lineAt(css, first.at)} 위)으로 옮긴다. 움직임이 없는 규칙은 파일 끝에 더해도 된다`);
    }
  }
  // 3) 순서
  for (const o of ORDERS) {
    const a = css.indexOf(o.before), b = css.indexOf(o.after, Math.max(0, a));
    if (a < 0 || css.indexOf(o.after) < 0) { add('order', 0, `"${a < 0 ? o.before : o.after}"를 찾지 못했다(${o.test})`); continue; }
    if (b < 0) add('order', lineAt(css, css.indexOf(o.after)), `"${o.after}"(줄 ${lineAt(css, css.indexOf(o.after))})가 "${o.before}"(줄 ${lineAt(css, a)})보다 앞에 있다(${o.test}).\n    고치기: ${o.hint}`);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--')) || path.join(ROOT, 'src', 'renderer', 'styles.css');
  const probs = cssProblems(fs.readFileSync(file, 'utf8'));
  if (probs.length) {
    console.error(`check:css 실패: ${path.relative(process.cwd(), file) || file}의 블록 자리 ${probs.length}건`);
    for (const p of probs) console.error(`  - [${p.rule}] ${p.msg}`);
    process.exit(1);
  }
  console.log(`check:css 정적 검사 통과(마지막 reduce 블록, 움직임 없는 꼬리 ${STILL_TAILS.length}, 순서 ${ORDERS.length})`);
  if (args.includes('--no-tests')) process.exit(0);
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=dot', ...CSS_TESTS.map((f) => path.join('test', f))], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) { console.error('check:css: CSS 계약을 가진 단위 시험이 떨어졌다(위 출력). 블록 자리 말고 규칙 내용이 바뀐 것이다'); process.exit(r.status || 1); }
  console.log(`check:css 통과(단위 시험 ${CSS_TESTS.length}개 파일)`);
}
