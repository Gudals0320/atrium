// P387: 스킬·안내문 글 크기 사전 검사(npm run check:skill)와 상한 한 원본(test/text-limits.mjs).
// 상한 값은 옮기기 전 시험의 식 그대로(바꾸지 않는다), 시험과 검사가 같은 값을 읽는다(시험 파일에 숫자가 남지 않는다),
// 넘으면 넘은 크기·떨어지는 시험과 줄·상한을 고칠 줄을 말한다, 비교 꼴(<·<=)의 경계, 장부(P375) 문제도 같은 글에.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LIMITS, SUBJECTS, limitOf, measureAll, sizeOf } from './text-limits.mjs';
import { skillRows, skillReport, testPattern, testFiles } from '../tools/check-skill.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(HERE, f), 'utf8');
const files = () => { const o = { 'text-limits.mjs': read('text-limits.mjs') }; for (const l of LIMITS) o[l.test] = read(l.test); return o; };

test('P387 상한 값은 옮기기 전 시험의 식 그대로', () => {
  // 옮기기 전 p8·p41·p46·p143·p204·p181·p334·p375 시험에 적혀 있던 식(값을 바꾸지 않는다)
  const before = {
    p8: 2 * 3107 + 80 + 230 + 690 + 700 + 300 + 450 + 1000 + 1000 + 300 + 700 + 250 + 450 + 300 + 400 + 150 + 400,
    p41: 10700 + 900 + 300 + 450 + 300 + 400 + 150 + 400,
    p46: 11000 + 900 + 450 + 300 + 400 + 150 + 400,
    'p143-board': 2088, 'p204-board': 2070, 'p181-board': 2070, 'p181-harness': 1217, 'p334-record': 160, 'p375-news-all': 400, 'p375-news-line': 110,
  };
  assert.deepEqual(Object.fromEntries(LIMITS.map((l) => [l.id, limitOf(l.id)])), before);
  assert.deepEqual(Object.fromEntries(LIMITS.map((l) => [l.id, l.op])), { p8: '<=', p41: '<', p46: '<', 'p143-board': '<', 'p204-board': '<=', 'p181-board': '<=', 'p181-harness': '<=', 'p334-record': '<', 'p375-news-all': '<=', 'p375-news-line': '<=' });
  for (const l of LIMITS) for (const [n, why] of l.steps) assert.ok(Number.isInteger(n) && n > 0 && /^P\d+/.test(why), `${l.id}: [${n}, ${why}]`);
  assert.throws(() => limitOf('nope'), /없는 상한/);
});

test('P387 한 원본: 시험은 limitOf로 읽고 숫자가 시험 파일에 남지 않는다. 검사가 고르는 제목이 그 시험에 있다', () => {
  for (const l of LIMITS) {
    const s = read(l.test);
    assert.match(s, /import \{ limitOf \} from '\.\/text-limits\.mjs'/, l.test);
    assert.ok(s.includes(`limitOf('${l.id}')`), `${l.test}가 limitOf('${l.id}')로 읽는다`);
    assert.ok(s.includes(`test('${l.name}`), `${l.test}에 '${l.name}…' 시험이 있다`);
    assert.ok(SUBJECTS[l.subject], l.subject);
  }
  for (const [f, old] of [['p8.test.mjs', '2 * 3107 +'], ['p41.test.mjs', '10700 +'], ['p46.test.mjs', '11000 +'], ['p143.test.mjs', '< 2088'], ['p204.test.mjs', '<= 2070'], ['p181.test.mjs', '= 2070;'], ['p334.test.mjs', '< 160'], ['p375.test.mjs', '<= 400']]) {
    assert.ok(!read(f).includes(old), `${f}에 옛 상한 식 "${old}"가 남지 않는다`);
  }
  const re = new RegExp(testPattern());
  for (const l of LIMITS) assert.ok(re.test(l.name + ' 뒤 글'), l.name);
  assert.ok(re.test('P375 장부 지킴: …') && !re.test('P41 모델 오류: …'));
  assert.ok(testFiles().includes('p375.test.mjs') && testFiles().includes('p8.test.mjs'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8')).scripts['check:skill'], 'node tools/check-skill.mjs');
});

test('P387 지금 글: 모든 상한 안, 남은 크기와 시험 줄, 스킬 파일과 boardSkill은 같은 글', () => {
  const t = measureAll();
  assert.equal(t['skill-file'], t.skill);
  const rows = skillRows(t, files());
  assert.equal(rows.length, LIMITS.length);
  for (const r of rows) {
    assert.equal(r.over, 0, `${r.id} ${r.size}${r.unit}`);
    assert.ok(r.left >= 0 && r.testLine > 0 && r.stepsLine > 0, r.id);
    assert.ok(read(r.test).split('\n')[r.testLine - 1].includes(`limitOf('${r.id}')`), `${r.id} 시험 줄`);
    assert.equal(read('text-limits.mjs').split('\n')[r.stepsLine - 1].trim(), '] },', `${r.id} steps 끝 줄`);
  }
  const txt = skillReport(rows);
  assert.match(txt, /check:skill 정적 검사 통과\(상한 10개/);
  assert.match(txt, /p41 +p41\.test\.mjs:\d+ +skill B +\d+ +<13600 +\d+/);
});

test('P387 넘으면: 넘은 크기, 떨어지는 시험과 줄, 고칠 줄(steps 끝), 같은 글을 재는 상한 함께', () => {
  const t = measureAll();
  const rows0 = skillRows(t, files());
  const p41 = rows0.find((r) => r.id === 'p41'), p8 = rows0.find((r) => r.id === 'p8');
  const add = 'x'.repeat(p41.left + 1); // p41·p46만 1바이트 넘게(p8은 더 넉넉하다)
  assert.ok(p8.left > p41.left, '보기의 전제: p8이 더 넉넉하다');
  const rows = skillRows({ ...t, skill: t.skill + add, 'skill-file': t['skill-file'] + add }, files());
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.p41.over, 1); assert.equal(by.p46.over, 1); assert.equal(by.p8.over, 0); assert.equal(by['p204-board'].over, 0);
  const txt = skillReport(rows);
  assert.match(txt, /- p41 실패: atrium 스킬 글\(boardSkill\(\)\) \d+B, 상한 < 13600B → 1B 넘음/);
  assert.ok(txt.includes(`떨어지는 시험: backend/test/p41.test.mjs:${by.p41.testLine} 'P41 스킬 글과 짧은 안내…'`));
  assert.ok(txt.includes(`backend/test/text-limits.mjs:${by.p41.stepsLine}(p41 steps 끝)`));
  assert.match(txt, /backend\/src\/branch\.mjs SKILL_BODY/);
  assert.match(txt, /같은 글을 재는 p46도 함께 넘었다/);
  assert.match(txt, /\[50, '<단위>: <까닭>'\]/);
  assert.match(txt, /check:skill 실패: 상한 2건 넘음$/);
  assert.ok(!txt.includes('- p8 실패'));
});

test('P387 비교 꼴 경계: <=는 상한과 같으면 통과, <는 같으면 1 넘음. 자 단위는 글자 수, B는 바이트', () => {
  const t = measureAll();
  const at = (id, size) => skillRows({ ...t, board: 'a'.repeat(size), skill: '가'.repeat(Math.floor(size / 3)) + 'a'.repeat(size % 3) }, files()).find((r) => r.id === id);
  assert.equal(at('p204-board', 2070).over, 0); assert.equal(at('p204-board', 2070).left, 0);
  assert.equal(at('p204-board', 2071).over, 1);
  assert.equal(at('p143-board', 2087).over, 0); assert.equal(at('p143-board', 2088).over, 1);
  assert.equal(at('p41', 13599).over, 0); assert.equal(at('p41', 13600).over, 1);
  assert.equal(sizeOf('skill', '가'), 3); assert.equal(sizeOf('board', '가'), 1);
});

test('P387 장부(P375) 문제도 같은 보고에: 상한이 다 안이어도 실패', () => {
  const rows = skillRows(measureAll(), files());
  const txt = skillReport(rows, ['판 안내문이 바뀌었다(board a→b). backend/src/verbs-notice.mjs: …']);
  assert.match(txt, /장부\(p375 'P375 장부 지킴'\) 실패 1건/);
  assert.match(txt, /판 안내문이 바뀌었다/);
  assert.match(txt, /check:skill 실패: 상한 0건 넘음, 장부 1건$/);
});

test('P387 CLI: --no-tests는 정적 검사만, 지금 dev는 통과(exit 0)', () => {
  const out = execFileSync(process.execPath, [path.join(HERE, '..', 'tools', 'check-skill.mjs'), '--no-tests'], { cwd: path.join(HERE, '..'), encoding: 'utf8' });
  assert.match(out, /check:skill — 스킬·안내문 글 크기\(상한 원본 backend\/test\/text-limits\.mjs\)/);
  assert.match(out, /check:skill 정적 검사 통과/);
  assert.doesNotMatch(out, /통과\(시험 파일/);
});
