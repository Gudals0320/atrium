#!/usr/bin/env node
// P387 스킬·안내문 글 크기 사전 검사(cd backend && npm run check:skill): 스킬 글(branch.mjs SKILL_BODY)·판 안내문(launch.mjs BOARD_SYSTEM_PROMPT)·
// 하네스 안내문(harness.mjs HARNESS_PROMPT)·일 기록 한 줄·새 안내 줄을 고친 직후, 전체 시험(몇 분) 전에 몇 초 안에 상한을 본다.
// 상한은 시험과 같은 원본(backend/test/text-limits.mjs)에서 읽는다. 상한마다 지금·상한·남은 크기, 넘으면 넘은 크기·시험 이름과 줄·상한을 고칠 줄을 적는다.
// 판 안내문 해시 장부(P375 BRIEF_LEDGER, p375 시험)도 함께 본다: 안내문을 바꾸고 장부 줄을 잊은 것도 같은 때 떨어졌다.
// 정적 검사 뒤에 그 상한을 가진 시험(test() 제목으로 고른 것)만 돌린다(--no-tests면 건너뜀).
// 쓰기: cd backend && npm run check:skill   (또는 node tools/check-skill.mjs [--no-tests])
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LIMITS, SUBJECTS, limitOf, measureAll, sizeOf } from '../test/text-limits.mjs';
import { ledgerProblems } from '../src/verbs-notice.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMITS_FILE = path.join(ROOT, 'test', 'text-limits.mjs');
const rel = (f) => path.relative(path.resolve(ROOT, '..'), f).split(path.sep).join('/');
const lineOf = (text, needle, from = 0) => { const i = text.indexOf(needle, from); return i < 0 ? 0 : text.slice(0, i).split('\n').length; };

// 상한 하나마다 한 줄 → [{ id, test, testLine, name, subject, unit, op, limit, size, left, over, stepsLine }]
// texts: 재는 글({ subject: 글 }), files: { 파일 이름: 글 }(시험 파일과 text-limits.mjs, 줄 번호를 셀 때만)
export function skillRows(texts = measureAll(), files = readFiles()) {
  const lim = files['text-limits.mjs'] || '';
  return LIMITS.map((l) => {
    const limit = limitOf(l.id), size = sizeOf(l.subject, texts[l.subject] ?? '');
    const max = l.op === '<' ? limit - 1 : limit; // 받는 가장 큰 크기
    const at = lim.indexOf(`{ id: '${l.id}'`);
    return {
      id: l.id, test: l.test, name: l.name, subject: l.subject, unit: SUBJECTS[l.subject].unit, op: l.op, limit, size,
      left: max - size, over: Math.max(0, size - max),
      testLine: lineOf(files[l.test] || '', `limitOf('${l.id}')`),
      stepsLine: at < 0 ? 0 : lineOf(lim, '] },', at), // 이 줄 앞에 [크기, '단위: 까닭']을 더한다
    };
  });
}

function readFiles() {
  const out = { 'text-limits.mjs': fs.readFileSync(LIMITS_FILE, 'utf8') };
  for (const l of LIMITS) if (!out[l.test]) out[l.test] = fs.readFileSync(path.join(ROOT, 'test', l.test), 'utf8');
  return out;
}

// 표(사람이 읽는 글). 넘은 상한은 고칠 곳과 함께
export function skillReport(rows, ledger = []) {
  const out = [];
  const bad = rows.filter((r) => r.over > 0);
  const wide = (s) => [...String(s)].reduce((a, c) => a + (c.codePointAt(0) >= 0x1100 ? 2 : 1), 0); // 한글은 두 칸
  const pad = (s, n) => String(s) + ' '.repeat(Math.max(1, n - wide(s))), lpad = (s, n) => ' '.repeat(Math.max(1, n - wide(s))) + String(s);
  out.push(`check:skill — 스킬·안내문 글 크기(상한 원본 ${rel(LIMITS_FILE)})`);
  out.push(`  ${pad('상한', 16)}${pad('시험', 22)}${pad('재는 것', 14)}${lpad('지금', 7)}${lpad('상한', 9)}${lpad('남음', 7)}`);
  for (const r of rows) {
    out.push(`  ${pad(r.id, 16)}${pad(`${r.test}:${r.testLine}`, 22)}${pad(`${r.subject} ${r.unit}`, 14)}${lpad(r.size, 7)}${lpad(r.op + r.limit, 9)}${lpad(r.over ? `-${r.over}` : r.left, 7)}${r.over ? '  넘음' : ''}`);
  }
  for (const r of bad) {
    const s = SUBJECTS[r.subject];
    const same = rows.filter((x) => x !== r && SUBJECTS[x.subject].src === s.src && x.over > 0).map((x) => x.id);
    out.push(`  - ${r.id} 실패: ${s.what} ${r.size}${r.unit}, 상한 ${r.op} ${r.limit}${r.unit} → ${r.over}${r.unit} 넘음`);
    out.push(`    떨어지는 시험: backend/test/${r.test}:${r.testLine} '${r.name}…'`);
    out.push(`    고치기: 글을 ${r.over}${r.unit} 넘게 줄이거나(${s.src}), 꼭 늘려야 하면 ${rel(LIMITS_FILE)}:${r.stepsLine}(${r.id} steps 끝) 앞에 [${Math.ceil(r.over / 50) * 50}, '<단위>: <까닭>'] 한 줄을 더한다${same.length ? `. 같은 글을 재는 ${same.join('·')}도 함께 넘었다(한 번에 올린다)` : ''}`);
  }
  if (ledger.length) {
    out.push(`  - 장부(p375 'P375 장부 지킴') 실패 ${ledger.length}건:`);
    for (const p of ledger) out.push(`    ${p}`);
  }
  out.push(bad.length || ledger.length
    ? `check:skill 실패: 상한 ${bad.length}건 넘음${ledger.length ? `, 장부 ${ledger.length}건` : ''}`
    : `check:skill 정적 검사 통과(상한 ${rows.length}개, 가장 빠듯한 것 ${[...rows].sort((a, b) => a.left - b.left)[0].id} 남음 ${[...rows].sort((a, b) => a.left - b.left)[0].left})`);
  return out.join('\n');
}

// 그 상한을 가진 시험만 고르는 이름 무늬(node --test-name-pattern)
export const testPattern = () => [...new Set([...LIMITS.map((l) => l.name), 'P375 장부 지킴'])].map((n) => '^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
export const testFiles = () => [...new Set([...LIMITS.map((l) => l.test), 'p375.test.mjs'])];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rows = skillRows();
  const ledger = ledgerProblems();
  const text = skillReport(rows, ledger);
  const failed = rows.some((r) => r.over > 0) || ledger.length > 0;
  (failed ? console.error : console.log)(text);
  if (failed) process.exit(1);
  if (args.includes('--no-tests')) process.exit(0);
  const files = testFiles();
  const r = spawnSync(process.execPath, [path.join(ROOT, '..', 'scripts', 'test-tmp.mjs'), '--test-reporter=dot', `--test-name-pattern=${testPattern()}`, ...files.map((f) => path.join('test', f))], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) { console.error('check:skill: 상한을 가진 시험이 떨어졌다(위 출력). 크기 말고 글 내용(낱말·문장) 검사가 떨어진 것이다'); process.exit(r.status || 1); }
  console.log(`check:skill 통과(시험 파일 ${files.length}개에서 상한·장부 시험만)`);
}
