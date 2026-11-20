// P195 단위 시험(창): 프로젝트 열기의 "Git 저장소로 시작" 확인란(사용자 요청 2026-11-17). lib/ws-git.js, 두 사전, 대화상자.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitBoxView, openParams, gitResultNote } from '../src/renderer/lib/ws-git.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

test('P195 Git 저장소로 시작: 확인란 막기, 보낼 값, 결과 알림', () => {
  assert.deepEqual(gitBoxView('norepo'), { disabled: false, reasonKey: null });
  assert.deepEqual(gitBoxView(null), { disabled: false, reasonKey: null });
  assert.deepEqual(gitBoxView('ok'), { disabled: true, reasonKey: 'wsGit.inRepo' });
  assert.deepEqual(gitBoxView('nocommit'), { disabled: true, reasonKey: 'wsGit.inRepo' });
  assert.equal(gitBoxView('missing').disabled, true);
  assert.deepEqual(openParams(' C:/x ', true, 'norepo'), { path: 'C:/x', gitInit: true });
  assert.deepEqual(openParams('C:/x', false, 'norepo'), { path: 'C:/x' }, '기본 끔');
  assert.deepEqual(openParams('C:/x', true, 'ok'), { path: 'C:/x' }, '저장소 안이면 보내지 않는다');
  assert.equal(gitResultNote(null), null);
  assert.deepEqual(gitResultNote({ init: true, commit: true }), { key: 'wsGit.done', kind: 'info' });
  assert.deepEqual(gitResultNote({ init: true, commit: false, why: 'identity' }), { key: 'wsGit.noIdentity', kind: 'error' });
  assert.deepEqual(gitResultNote({ init: true, commit: false, why: 'error' }), { key: 'wsGit.commitFail', kind: 'error' });
});

test('P195 Git 저장소로 시작: 두 사전과 대화상자', () => {
  assert.equal(ko.wsGit.label, 'Git 저장소로 시작 (git init + 빈 첫 커밋)');
  assert.equal(en.wsGit.label, 'Start as a Git repository (git init + empty first commit)');
  for (const k of ['hint', 'inRepo', 'noFolder', 'done', 'noIdentity', 'commitFail']) { assert.ok(ko.wsGit[k], k); assert.ok(en.wsGit[k], k); }
  assert.match(ko.wsGit.noIdentity, /git config --global user\.name/); assert.match(ko.wsGit.noIdentity, /워크트리는 첫 커밋/);
  assert.match(en.wsGit.noIdentity, /git config --global user\.email/);
  assert.ok(ko.backend.wsGitInRepo && en.backend.wsGitInRepo && ko.backend.wsGitInitFail && en.backend.wsGitInitFail);
  const src = read('Workspaces.jsx');
  assert.match(src, /api\.call\('workspace\.gitState', \{ path: p \}\)/);
  assert.match(src, /api\.call\('workspace\.open', openParams\(dir, gitInit, gitState\)\)/);
  assert.match(src, /data-field="git-init"/);
  assert.match(src, /useState\(false\); \/\/ P195: Git 저장소로 시작\(기본 끔\)/);
});
