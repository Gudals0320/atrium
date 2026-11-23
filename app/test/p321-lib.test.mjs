// P321 단위 시험(창): 빠른 워크트리 세션의 head 판정, 빈 곳 메뉴 항목, 병합 맡기기 보이기, 이름 칸 검사(lib/quick-worktree.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { headCandidates, pickHead, nextHead, paneMenuItems, canAskMerge, mergerIdsOf, nameIssue, autoName, nameFromPrompt, wtBranch, wtRel } from '../src/renderer/lib/quick-worktree.js';

const S = (name, o = {}) => ({ sessionId: name, name, workspaceKey: 'r', kind: 'claude', state: 'ready', parentSessionId: null, git: { isRepo: true, isWorktree: false, branch: 'dev' }, branch: { children: 0 }, touchedAt: 0, ...o });

test('P321 head 판정: 일 상위 없음·merger 아님·셸 아님·리포 뿌리, 하위가 많은 것, 같으면 최근에 사람이 만진 것', () => {
  const list = [
    S('worker', { parentSessionId: 'lead' }),
    S('merger-r-dev'),
    S('sh1', { kind: 'shell' }),
    S('wt', { git: { isWorktree: true, branch: 'worktree-wt' } }),
    S('other', { workspaceKey: 'x', branch: { children: 9 } }),
    S('notes', { touchedAt: 50 }),
    S('lead', { branch: { children: 2 }, touchedAt: 10 }),
    S('gone', { state: 'exited', branch: { children: 5 } }),
  ];
  const mergerIds = mergerIdsOf({ mergers: [{ sessionId: 'merger-r-dev' }, { sessionId: null }] });
  assert.deepEqual(headCandidates(list, 'r', { mergerIds }).map((s) => s.name), ['lead', 'notes']);
  assert.equal(pickHead(list, 'r', { mergerIds }).name, 'lead');
  assert.equal(pickHead([S('a', { touchedAt: 1 }), S('b', { touchedAt: 5 })], 'r').name, 'b', '같은 하위 수면 최근');
  assert.equal(pickHead([], 'r'), null);
  const c = headCandidates(list, 'r', { mergerIds });
  assert.equal(nextHead(c, 'lead').name, 'notes');
  assert.equal(nextHead(c, 'notes').name, 'lead', '끝이면 처음');
  assert.equal(nextHead([], 'x'), null);
});

test('P321 빈 곳 메뉴: 리포 영역 안·폴더 영역 안(워크트리 흐림)·영역 밖', () => {
  assert.deepEqual(paneMenuItems(null), { head: null, items: [{ action: 'ws-open' }] });
  const repo = paneMenuItems({ key: 'r', kind: 'repo', name: 'shop-app' });
  assert.equal(repo.head, 'shop-app');
  assert.deepEqual(repo.items.map((i) => i.action || 'sep'), ['worktree', 'spawn', 'sep', 'arrange', 'fit']);
  assert.equal(repo.items[0].disabled, false);
  const folder = paneMenuItems({ key: 'f', kind: 'folder', name: 'notes', label: 'a/notes' });
  assert.equal(folder.head, 'a/notes'); assert.equal(folder.items[0].disabled, true);
});

test('P321 병합 맡기기를 보일 세션: 워크트리 브랜치에서 일하는 에이전트(셸·merger·리포 뿌리 아님)', () => {
  const ids = new Set(['m']);
  assert.equal(canAskMerge(S('wt', { git: { isWorktree: true, branch: 'worktree-wt' } }), ids), true);
  assert.equal(canAskMerge(S('m', { git: { isWorktree: true, branch: 'x' } }), ids), false);
  assert.equal(canAskMerge(S('sh', { kind: 'shell', git: { isWorktree: true, branch: 'x' } }), ids), false);
  assert.equal(canAskMerge(S('root'), ids), false);
  assert.equal(canAskMerge(S('det', { git: { isWorktree: true, branch: null } }), ids), false);
  assert.equal(canAskMerge(null, ids), false);
});

test('P321 이름 칸: 규칙, 겹침, 자동 이름과 미리 보기', () => {
  assert.equal(nameIssue('wt-1123-a', ['lead']), null);
  assert.equal(nameIssue('Lead', ['lead']), 'bad');
  assert.equal(nameIssue('lead', ['Lead']), 'taken');
  assert.equal(nameIssue('', []), 'bad');
  assert.equal(autoName(new Date(2026, 0, 5), []), 'wt-0105-a');
  assert.equal(nameFromPrompt('search UI 시안'), 'search-ui');
  assert.equal(wtBranch('a'), 'worktree-a'); assert.equal(wtRel('a'), '.claude/worktrees/a');
});
