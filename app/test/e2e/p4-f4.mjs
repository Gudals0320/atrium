// P4 완료 기준 6(F4): 세션이 하네스의 방식으로 워크트리에서 일하면 노드에 워크트리 경로와 브랜치가 보이고, 같은 저장소의 세션끼리 관계가 보인다.
// 판은 워크트리를 만들지 않는다. 세션(haiku)이 직접 `git worktree add`로 만들고 그 안으로 들어간다.
// 워크트리는 개발용 시험 폴더(backend/.dev/proj, 저장소에서 무시됨) 안, 브랜치는 mtask-test/로 시작한다. 시험 뒤 시험 도구가 지운다. MT_E2E_OUT=p4
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, shot, logger, sleep, waitState, REPO, closeApp } from './harness.mjs';
import { frame, runUntilReady, sendBar, labelShot, sid } from './p4-lib.mjs';

const W = 'wt';
const BRANCH = 'mtask-test/p4-wt';
const log = logger('p4-f4');
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8' });
const { app, page } = await launch({ log });
if (!(await sid(page, W))) { log(atrium('spawn', path.join(REPO, 'backend', '.dev', 'proj'), '--name', W, '--model', 'haiku').split('\n')[0]); }
await waitState(page, W, 'ready', 90000);
const g0 = await page.evaluate((n) => [...window.__mt.getState().sessions.values()].find((s) => s.name === n).git, W);
log('시작할 때 git', g0);

const cwdNow = await page.evaluate((n) => [...window.__mt.getState().sessions.values()].find((s) => s.name === n).cwdNow, W);
if (/wt-p4$/.test(cwdNow || '')) log('이미 워크트리 안에서 일한다(앞 실행). 지시는 다시 보내지 않는다', cwdNow);
else {
  const task = `Create a git worktree inside the current folder: run \`git worktree add ./wt-p4 -b ${BRANCH}\`. Then cd into ./wt-p4, run \`git status --short --branch\`, and keep working inside ./wt-p4. Reply with the branch name only.`;
  await sendBar(page, `@${W} ${task}`);
  log(`@${W}에게 보냄: ${task}`);
  await runUntilReady(page, W, log, { timeout: 240000 });
  await sleep(3000);
}
const s = await page.evaluate((n) => [...window.__mt.getState().sessions.values()].find((x) => x.name === n), W);
log('끝난 뒤', { cwdNow: s.cwdNow, git: s.git, lastAnswer: s.lastAnswer });
log('판 이벤트(git)', atrium('events', W, '--limit', '80').split('\n').filter((l) => / git /.test(l)));
log('노드 git 줄', await page.evaluate((n) => { const e = document.querySelector(`.mt-node[data-name="${n}"] [data-role="git"]`); return e && { text: e.innerText.replace(/\s+/g, ' '), title: e.title, worktree: e.dataset.worktree }; }, W));
const repo = await page.evaluate(() => [...document.querySelectorAll('[data-repo-edge]')].map((e) => ({ id: e.dataset.repoEdge, text: e.textContent })));
log('같은 저장소 선', repo);
await frame(page, [W], { maxZoom: 0.9 });
await shot(page, 'f4-1-worktree-node', log);
if (repo[0]) {
  const [, from] = repo[0].id.split(':');
  const fromName = await page.evaluate((id) => window.__mt.getState().sessions.get(id).name, from);
  await frame(page, [W, fromName], { maxZoom: 0.5 });
  await shot(page, 'f4-2-same-repo-line', log);
  await labelShot(page, repo[0].id, 'f4-3-same-repo-label', shot, log);
}
log('git worktree list', execFileSync('git', ['-C', REPO, 'worktree', 'list'], { encoding: 'utf8' }).trim());
await closeApp(app);
process.exit(0);
