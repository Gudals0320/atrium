// P325 단위 시험(창 순수 함수): 워크트리 치우기 확인 상자의 기본값과 막기
import test from 'node:test';
import assert from 'node:assert/strict';
import { discardChoices, discardBlock, canDiscard } from '../src/renderer/lib/quick-worktree.js';

test('P325 확인 상자 값: 앞선 커밋·변경이 있으면 경고와 브랜치 남기기 켬, 변경이 있으면 force 칸', () => {
  assert.deepEqual(discardChoices({ branch: 'worktree-a', ahead: 0, dirty: 0 }), { risky: false, keepBranch: false, hasBranch: true, needForce: false });
  assert.deepEqual(discardChoices({ branch: 'worktree-a', ahead: 2, dirty: 0 }), { risky: true, keepBranch: true, hasBranch: true, needForce: false });
  assert.deepEqual(discardChoices({ branch: 'worktree-a', ahead: 0, dirty: 3 }), { risky: true, keepBranch: true, hasBranch: true, needForce: true });
  assert.equal(discardChoices({ branch: null, ahead: null, dirty: 0 }).hasBranch, false);
  assert.equal(discardChoices(null).risky, false);
});

test('P325 치우기 단추 막기: 읽는 중, 워크트리 아님, 병합 대상과 같은 브랜치, 변경 있는데 force 끔', () => {
  const v = { worktree: true, path: '/r/.claude/worktrees/a', branch: 'worktree-a', target: 'dev', ahead: 1, dirty: 0 };
  assert.equal(discardBlock(null), 'loading');
  assert.equal(discardBlock({ ...v, worktree: false, path: null }), 'not_worktree');
  assert.equal(discardBlock({ ...v, branch: 'dev' }), 'same_branch');
  assert.equal(discardBlock({ ...v, dirty: 2 }), 'force');
  assert.equal(discardBlock({ ...v, dirty: 2 }, true), null);
  assert.equal(discardBlock(v), null);
});

test('P325 메뉴: 워크트리 브랜치에서 일하는 에이전트 세션만(merger·셸 제외)', () => {
  const s = { sessionId: 'a', kind: 'claude', git: { isWorktree: true, branch: 'worktree-a' } };
  assert.equal(canDiscard(s), true);
  assert.equal(canDiscard({ ...s, kind: 'shell' }), false);
  assert.equal(canDiscard({ ...s, git: { isWorktree: false, branch: 'dev' } }), false);
  assert.equal(canDiscard(s, new Set(['a'])), false);
});
