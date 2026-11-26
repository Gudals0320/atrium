// P46: atrium 스킬의 워커 이름 짓기 안내(번호 이름 대신 맡긴 일에 맞는 이름, 판의 이름 규칙, 겹치면 다시 짓기)
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardSkill, delegateSkill, CHILD_NAME_RE } from '../src/branch.mjs';

test('P46: 스킬 글 — 이름은 맡긴 일·역할을 말하고, 번호 이름은 하찮은 일에만, 예는 몇 개만', () => {
  const s = boardSkill();
  assert.match(s, /무슨 일을 맡은 워커인지 알 수 있게 네가 생각해서 짓는다/);
  assert.match(s, /w1·ds1 같은 번호 이름은 일이 정말 하찮을 때만/);
  assert.match(s, /예를 외우지 말고 이번 일에 맞게 짓는다/);
  const ex = s.match(/\(예: ([^)]+)\)\. w1/);
  assert.ok(ex, '예시 줄');
  const names = ex[1].split(', ');
  assert.ok(names.length >= 3 && names.length <= 6, `예시 ${names.length}개`);
  for (const n of names) assert.ok(CHILD_NAME_RE.test(n), `예시도 판의 이름 규칙에 맞는다: ${n}`);
  assert.ok(!/예: w1/.test(s), '번호 이름을 예로 들지 않는다');
  // 판의 이름 규칙은 그대로, 겹치면 다시 짓는다
  assert.match(s, /영문 소문자로 시작, 소문자·숫자·-·_ 만, 32자까지, 판 전체에서 하나/);
  assert.match(s, /`name_taken`\)이 오면 다른 이름으로 다시 짓는다/);
  assert.equal(delegateSkill().split('\n---\n')[1], s.split('\n---\n')[1], '옛 이름 스킬도 같은 글');
  assert.ok(Buffer.byteLength(s) < 11000 + 900 + 450 + 300 + 400, `스킬 글 ${Buffer.byteLength(s)}바이트`); // P380: 슬래시 명령 --raw·OmO 계획 검토자 두 줄로 400바이트. P364: 힌트는 atrium know로 찾기 한 마디로 300바이트. P360: 되살리기·갈라 열기 한 줄로 450바이트. P304: 목표·마일스톤 레인 절로 900바이트를 더 둔다. P295: 보내는 때 두 줄로 300바이트를 더 둔다. P292: 사용자 몫 절(사람에게 넘기기)로 1000바이트를 더 둔다. P284: 결정 카드 절(사람에게 묻기)로 1000바이트를 더 둔다. P267: merger 문구(판 스킬 9절)로 400바이트를 더 둔다. P248: 대기열·스티어링 한 줄로 300바이트를 더 둔다(전 8000). P156: 관계 고르기 절. P204: 동료에게 보낼 때(다섯 경우)와 동료 소식
});
