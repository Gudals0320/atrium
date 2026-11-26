// P386: 설정 › 보관 및 Git 저장소의 워크트리 위치 칸(찾기 목록, 두 사전), 빠른 워크트리 창의 자리 줄
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';
import { itemOf, searchItems } from '../src/renderer/lib/settings-nav.js';
import { boardWtBase, repoIdOf } from '../src/renderer/lib/quick-worktree.js';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const src = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const tr = (d) => (k) => k.split('.').reduce((o, x) => (o == null ? o : o[x]), d) ?? k;

test('P386 워크트리 위치 칸: 보관 및 Git 저장소 쪽에 있고 찾기로 나온다(ko·en)', () => {
  const it = itemOf('worktreeRoot');
  assert.equal(it.page, 'recall');
  assert.deepEqual(searchItems('워크트리 위치', tr(ko)).map((x) => x.id), ['worktreeRoot']);
  assert.equal(searchItems('worktree location', tr(en))[0].id, 'worktreeRoot');
  const s = src('Settings.jsx');
  assert.match(s, /'worktreeRoot' in settings && <WtRootSetting/);
  assert.match(s, /data-field="setting-worktreeRoot"/);
});

test('P386 두 사전: p386 글이 같은 키와 같은 자리 표시를 가진다', () => {
  assert.deepEqual(Object.keys(ko.p386), Object.keys(en.p386));
  for (const k of Object.keys(ko.p386)) assert.deepEqual((ko.p386[k].match(/\{\w+\}/g) || []), (en.p386[k].match(/\{\w+\}/g) || []), k);
});

test('P386 빠른 워크트리 창: 다른 하네스는 판이 준 boardBase + 이름, Claude Code는 .claude/worktrees/<이름> 그대로', () => {
  const q = src('QuickWorktree.jsx');
  assert.match(q, /boardBase && curL && curL\.harness !== 'claude' \? boardBase \+ nm : wtRel\(nm\)/);
  assert.equal(boardWtBase('C:/Work/app', 'E:/worktrees'), 'E:/worktrees/C_Work_app/');
  assert.equal(repoIdOf('C:/Work/app'), 'C_Work_app');
});
