// P368: atrium know 안내를 "시작할 때 한 번 찾고 막히면 다시"로 바꾸고, 맡기는 쪽에는 "맡기기 전에 1~3번 찾아 지시의 힌트로"를 준다.
//   자체 오케스트레이션 하네스에는 맡기기 한 마디를 주지 않는다(판이 하위를 주지 않는다). 계약 번호는 그대로다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KNOW_RULE, KNOW_RULE_PLAIN, KNOW_HINT_RULE, CONTRACT_VERSION, shortHelp, VERBS } from '../src/cli-contract.mjs';
import { BOARD_SYSTEM_PROMPT } from '../src/launch.mjs';
import { HARNESS_PROMPT } from '../src/harness.mjs';
import { boardSkill } from '../src/branch.mjs';
import { orchPromptLines } from '../src/orchestration.mjs';

test('P368 know 안내: 시작할 때 한 번, 막히면 다시(두 꼴 모두). 옛 "막히거나 … 먼저" 문구는 없다', () => {
  for (const r of [KNOW_RULE, KNOW_RULE_PLAIN]) {
    assert.match(r, /시작할 때 네가 건드릴 부분을/);
    assert.match(r, /한 번 찾고, 막히면 다시 찾는다/);
    assert.ok(!r.includes('막히거나'));
  }
  assert.match(KNOW_RULE, /atrium know "<물음>"/);
  assert.ok(!/[\r\n"]/.test(KNOW_RULE_PLAIN));
  assert.ok(!/[\r\n"]/.test(KNOW_HINT_RULE));
  assert.equal(CONTRACT_VERSION, 14, '새 동사가 아니라 계약은 그대로');
  const know = VERBS.find((v) => v.name === 'know');
  assert.match(know.does, /시작할 때 건드릴 부분을 한 번 찾고 막히면 다시/);
  assert.match(know.does, /1~3번/);
});

test('P368 맡기는 쪽: 판 안내문은 맡기기 줄 안에, 하네스 안내문·짧은 help·스킬에 있고 자체 오케스트레이션에는 없다', () => {
  assert.match(KNOW_HINT_RULE, /하위에게 맡기기 전에 그 일이 건드릴 부분을 `atrium know`로 1~3번 찾고, 쓸 만한 위치를 지시의 힌트로 적는다/);
  const lines = BOARD_SYSTEM_PROMPT.split('\n');
  assert.equal(lines.length, 9, '판 안내문 줄 수는 그대로');
  assert.ok(lines[0].includes(KNOW_RULE));
  assert.ok(lines[1].startsWith('다른 에이전트에게 일을 맡길 때는') && lines[1].includes(KNOW_HINT_RULE), '맡기기 안내 줄 안');
  assert.ok(HARNESS_PROMPT.includes(KNOW_RULE_PLAIN) && HARNESS_PROMPT.includes(KNOW_HINT_RULE));
  assert.ok(shortHelp().includes(KNOW_HINT_RULE));
  const orchHelp = shortHelp({ orchestrates: true, scope: 'root', allowed: ['prompt', 'done', 'know'] });
  assert.ok(orchHelp.includes(KNOW_RULE) && !orchHelp.includes(KNOW_HINT_RULE), '자체 오케스트레이션 help는 맡기기 한 마디 없이');
  for (const scope of ['sub', 'free']) {
    const t = orchPromptLines(scope).join(' ');
    assert.ok(t.includes(KNOW_RULE_PLAIN) && !t.includes(KNOW_HINT_RULE), `자체 오케스트레이션 안내문(${scope})은 시작할 때 찾기만`);
  }
  const skill = boardSkill();
  assert.match(skill, /맡기기 전에 그 일이 건드릴 부분\(.*\)을 기억 대신 `atrium know "<물음>"`\(위치와 짧은 발췌\)로 1~3번 찾고, 쓸 만한 위치를 지시의 힌트\(포인터\)로 적는다/);
});
