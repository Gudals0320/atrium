// P195 단위 시험: 프로젝트 열기의 "Git 저장소로 시작"(사용자 요청 2026-11-17) — git init과 빈 첫 커밋, 이미 저장소면 거절, 이름·메일이 없으면 커밋만 건너뜀.
// 사용자 git 설정을 읽지 않도록 시험마다 전역 설정 파일을 따로 준다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { initRepo, gitStateAt, identityMissing } from '../src/ws-git-init.mjs';
import { workspaceOf } from '../src/git.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p195g-'));
const ENV_DROP = ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'EMAIL'];
const gitWith = (globalFile) => (cwd, args) => new Promise((res) => {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: globalFile, GIT_CONFIG_NOSYSTEM: '1' };
  for (const k of ENV_DROP) delete env[k];
  execFile('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, env }, (e, out, err) => res({ ok: !e, out: String(out || ''), err: String(err || (e && e.message) || '') }));
});

test('P195 Git 저장소로 시작: git init과 빈 첫 커밋, 처음부터 저장소 키, 이미 저장소면 거절', async () => {
  const dir = tmp();
  const gcfg = path.join(dir, 'gitconfig'); fs.writeFileSync(gcfg, '[user]\n\tname = t\n\temail = t@example.invalid\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = master\n');
  const proj = path.join(dir, 'proj'); fs.mkdirSync(proj);
  try {
    const run = gitWith(gcfg);
    assert.equal(await gitStateAt(proj, { run }), 'norepo');
    const r = await initRepo(proj, { run });
    assert.deepEqual(r, { init: true, commit: true });
    assert.equal(await gitStateAt(proj, { run }), 'ok', 'HEAD가 있다(워크트리를 바로 만든다)');
    assert.equal((await run(proj, ['log', '--format=%s'])).out.trim(), 'Initial commit');
    assert.equal((await run(proj, ['branch', '--show-current'])).out.trim(), 'main', '첫 가지는 main(init.defaultBranch가 master여도, 2026-11-19 사용자 요청)');
    const ws = await workspaceOf(proj);
    assert.equal(ws.kind, 'repo', '키를 init 뒤에 잡으므로 처음부터 저장소 키');
    await assert.rejects(initRepo(proj, { run }), (e) => e.code === 'bad_request' && e.key === 'wsGitInRepo');
    const sub = path.join(proj, 'sub'); fs.mkdirSync(sub);
    await assert.rejects(initRepo(sub, { run }), (e) => e.key === 'wsGitInRepo', '저장소 안 폴더도 거절');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('P195 Git 저장소로 시작: 이름·메일이 없으면 init은 두고 커밋을 건너뛰어 까닭(identity)을 돌려준다. 설정은 바꾸지 않는다', async () => {
  const dir = tmp();
  const gcfg = path.join(dir, 'gitconfig'); fs.writeFileSync(gcfg, '[user]\n\tuseConfigOnly = true\n');
  const proj = path.join(dir, 'proj'); fs.mkdirSync(proj);
  try {
    const run = gitWith(gcfg);
    const before = fs.readFileSync(gcfg, 'utf8');
    const r = await initRepo(proj, { run });
    assert.equal(r.init, true); assert.equal(r.commit, false); assert.equal(r.why, 'identity', JSON.stringify(r));
    assert.equal(await gitStateAt(proj, { run }), 'nocommit', 'init은 남았다');
    assert.equal((await run(proj, ['symbolic-ref', '--short', 'HEAD'])).out.trim(), 'main', '커밋 전에도 첫 가지는 main');
    assert.equal(fs.readFileSync(gcfg, 'utf8'), before, '전역 설정을 바꾸지 않았다');
    assert.equal((await run(proj, ['config', '--local', '--get', 'user.email'])).ok, false, '저장소 설정에도 이름·메일을 넣지 않았다');
    assert.equal(identityMissing('*** Please tell me who you are.'), true);
    assert.equal(identityMissing('fatal: something else'), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
