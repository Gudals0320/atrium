// P169: 판이 띄운 세션의 시작 토큰. 코덱스 등 하네스 안내문이 시작하자마자 atrium help를 시키지 않고,
// 옛 이름 스킬(delegate)은 모델이 보는 스킬 목록에서 빠진다(사람이 부르면 그대로 된다). 옛 플러그인 폴더도 같은 글
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { HARNESS_PROMPT } from '../src/harness.mjs';
import { BOARD_SYSTEM_PROMPT, writeBoardPlugin } from '../src/launch.mjs';
import { Branch, boardSkill, SKILL_NAME, LEGACY_SKILL_NAME } from '../src/branch.mjs';

const HIDE = 'disable-model-invocation: true';
const front = (t) => t.split('\n---\n')[0];
const body = (t) => t.split('\n---\n').slice(1).join('\n---\n');

test('P169 하네스 안내문: "먼저 atrium help" 같은 시작 지시가 없고, help는 필요할 때만. 핵심 동사는 그대로', () => {
  assert.ok(!/먼저[^.]*atrium help/.test(HARNESS_PROMPT), '시작하자마자 help를 시키지 않는다');
  assert.match(HARNESS_PROMPT, /필요할 때만 `atrium help`/);
  for (const v of ['prompt', 'wait', 'read', 'child', 'me', 'models']) assert.ok(HARNESS_PROMPT.includes(`\`atrium ${v}`), `동사 ${v}`);
  assert.ok(!/[\r\n"]/.test(HARNESS_PROMPT), '한 줄, 큰따옴표 없이(Codex -c 값)');
  // Claude 안내문은 줄이지 않았다(이번에는 손대지 않음)
  assert.match(BOARD_SYSTEM_PROMPT, /\(사용법 `atrium help`\)/);
});

test('P169 스킬: 옛 이름 delegate만 숨김 머리글, atrium은 그대로. 본문은 같다', () => {
  const { skills } = new Branch({ store: { branchRows: () => [] }, bus: new EventEmitter() }).pluginExtra();
  assert.ok(front(skills[LEGACY_SKILL_NAME]).split('\n').includes(HIDE), 'delegate는 모델 목록에서 뺀다');
  assert.ok(!skills[SKILL_NAME].includes(HIDE), 'atrium은 모델이 부른다');
  assert.match(front(skills[LEGACY_SKILL_NAME]), /^---\nname: delegate\ndescription: .+\n/);
  assert.equal(body(skills[LEGACY_SKILL_NAME]), body(skills[SKILL_NAME]));
  assert.equal(boardSkill(LEGACY_SKILL_NAME), skills[LEGACY_SKILL_NAME]);
});

test('P169 플러그인: 새 폴더와 남은 옛 폴더(atrium-herdr)의 delegate 스킬이 같은 숨김 글', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'p169-'));
  try {
    fs.mkdirSync(path.join(d, 'atrium-herdr', 'skills', 'delegate'), { recursive: true });
    fs.writeFileSync(path.join(d, 'atrium-herdr', 'skills', 'delegate', 'SKILL.md'), '---\nname: delegate\ndescription: old\n---\n\nold');
    writeBoardPlugin({ dir: d, skills: { [SKILL_NAME]: boardSkill(), [LEGACY_SKILL_NAME]: boardSkill(LEGACY_SKILL_NAME) } });
    for (const p of ['atrium', 'atrium-herdr']) {
      const t = fs.readFileSync(path.join(d, p, 'skills', 'delegate', 'SKILL.md'), 'utf8');
      assert.equal(t, boardSkill(LEGACY_SKILL_NAME), p);
      assert.ok(front(t).includes(HIDE), p);
      assert.ok(!fs.readFileSync(path.join(d, p, 'skills', 'atrium', 'SKILL.md'), 'utf8').includes(HIDE), p);
    }
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
