// P5 완료 기준 1(G1): 세션이 시작 폴더의 리포지토리별 워크스페이스로 나뉘고 위쪽 줄에 세는 값과 함께 보인다.
// 워크트리에서 띄운 세션은 본 저장소의 워크스페이스, git이 아닌 폴더도 워크스페이스. 다른 저장소로 cd해도 워크스페이스는 그대로이고 표시만 바뀐다.
// "+ 리포 열기"로 빈 워크스페이스를 만들고 닫는다. 신뢰 대화상자는 수락하지 않는다(다른 저장소의 claude는 신뢰 대기 카드까지만). MT_E2E_OUT=p5
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { shot, logger, closeApp } from './harness.mjs';
import { launch, view, wsBar, clickWs, sessionBy, spawnDialog, nodeText, atrium, herdr, until, sleep, P5, PROJ, R1, R1WT } from './p5-lib.mjs';

const log = logger('p5-g1');
const { app, page } = await launch({ log });
await sleep(1200);
log('처음 워크스페이스 줄', await wsBar(page));

// 1) 다른 저장소(r1)와 그 워크트리(r1-wt)에서 셸을 띄운다 → 둘 다 r1 워크스페이스
const def = await spawnDialog(page, { cwd: R1, name: 'r1sh', kind: 'shell' }, log);
log('기본 폴더는 지금 워크스페이스의 저장소 루트', def);
await spawnDialog(page, { cwd: R1WT, name: 'wtsh', kind: 'shell' }, log);
await sleep(2500);
for (const n of ['r1sh', 'wtsh']) { const s = await sessionBy(page, n); log(n, { kind: s.kind, state: s.state, workspaceKey: s.workspaceKey, git: s.git && { branch: s.git.branch, isWorktree: s.git.isWorktree, root: s.git.root } }); }
log('워크스페이스 줄(r1이 생김, 지금 판은 그대로)', await wsBar(page), (await view(page)).current);
await clickWs(page, 'r1');
await sleep(1500);
log('r1 판', await view(page));
await shot(page, 'g1-1-r1-worktree-same-ws', log);

// 2) 다른 저장소의 claude: git 최상위라 신뢰 대화상자가 뜬다. 수락하지 않고 신뢰 대기 카드까지만 본다
atrium('spawn', R1, '--name', 'r1c', '--model', 'haiku');
await until(async () => { const s = await sessionBy(page, 'r1c'); return s && s.state === 'trust_wait'; }, 60000);
await sleep(1500);
log('r1c', (await sessionBy(page, 'r1c')).state, await nodeText(page, 'r1c'));
log('워크스페이스 줄(내 차례 1)', await wsBar(page));
await page.evaluate(() => window.__mt.getState().fitAll(0));
await sleep(1000);
await shot(page, 'g1-2-r1-trust-wait-card', log);
log('끄기(신뢰 대화상자에는 esc로 끝냄)', atrium('kill', 'r1c', '--yes').replace(/\s+/g, ' ').slice(0, 300));
await until(async () => !(await sessionBy(page, 'r1c')), 30000);

// 3) git이 아닌 폴더는 그 폴더가 워크스페이스(이전 판의 c). 줄의 순서는 처음 생긴 순서
log('워크스페이스(atrium)', atrium('ws'));

// 4) 다른 저장소로 cd: multitask 워크스페이스에서 띄운 셸이 proj/inner(따로 git init한 저장소)로 cd → 워크스페이스는 그대로, 표시만
await clickWs(page, 'multitask');
await spawnDialog(page, { cwd: PROJ, name: 'cdsh', kind: 'shell' }, log);
await sleep(2500);
const cd = await sessionBy(page, 'cdsh');
herdr('pane.send_text', { pane_id: cd.paneId, text: 'cd inner' }); herdr('pane.send_keys', { pane_id: cd.paneId, keys: ['enter'] });
log('cdsh에 "cd inner" 입력');
await until(async () => { const s = await sessionBy(page, 'cdsh'); return s && s.elsewhere; }, 40000, 1000);
const after = await sessionBy(page, 'cdsh');
log('cd 뒤', { workspaceKeyBefore: cd.workspaceKey, workspaceKeyAfter: after.workspaceKey, cwdNow: after.cwdNow, elsewhere: after.elsewhere, git: after.git && after.git.root });
log('노드', await nodeText(page, 'cdsh'));
log('지금 판(cdsh는 그대로 multitask 판)', await view(page));
await page.evaluate((id) => window.__mt.getState().navigateTo(id), after.sessionId);
await sleep(1500);
await shot(page, 'g1-3-cd-elsewhere-badge', log);
// claude도 같다: a에게 inner로 cd하게 한다(Claude Code는 셸에서 cd한 폴더를 hook cwd로 알린다)
atrium('send', '@a', 'Run exactly this one shell command and nothing else: cd inner && git rev-parse --show-toplevel. Then reply with exactly: moved');
log('a에게 cd inner를 시킴');
for (let i = 0; i < 90; i++) {
  const s = await sessionBy(page, 'a');
  if (s.state === 'waiting' && s.ask && s.ask.kind === 'permission') { log('a 권한 요청', s.ask.summary); atrium('answer', 'a', '1'); await sleep(1500); continue; }
  if (s.elsewhere && s.state === 'ready') break;
  await sleep(1000);
}
const a = await sessionBy(page, 'a');
log('a', { state: a.state, workspaceKey: a.workspaceKey, cwdNow: a.cwdNow, elsewhere: a.elsewhere, lastAnswer: a.lastAnswer });
log('워크스페이스 줄(그대로)', await wsBar(page));
await page.evaluate((id) => window.__mt.getState().navigateTo(id), a.sessionId);
await sleep(1500);
await shot(page, 'g1-4-claude-cd-elsewhere', log);

// 5) "+ 리포 열기"로 빈 워크스페이스(r2)를 만들고 닫는다
const r2 = path.join(P5, 'repos', 'r2');
if (!fs.existsSync(r2)) { fs.mkdirSync(r2, { recursive: true }); execFileSync('git', ['-C', r2, 'init', '-q', '-b', 'main']); }
await page.click('[data-action=ws-open]');
await page.fill('[data-role=ws-open] [data-field=path]', r2);
await page.click('[data-action=ws-open-submit]');
await sleep(1500);
log('리포 열기 뒤', await wsBar(page), (await view(page)).current);
await shot(page, 'g1-5-open-empty-repo', log);
await page.click('.mt-wsbtn[data-name="r2"] [data-action=ws-close]');
await page.waitForSelector('[data-role=ws-close]');
await sleep(500);
log('닫기 확인 문구', await page.evaluate(() => document.querySelector('[data-role=ws-close]').innerText.replace(/\s+/g, ' ')));
await page.click('[data-action=ws-close-confirm]');
await sleep(1000);
log('닫은 뒤', await wsBar(page), (await view(page)).current);
// 세션이 있는 워크스페이스는 닫지 않는다
try { atrium('ws', 'close', 'r1', '--yes'); log('r1 닫힘(안 됨)'); } catch (e) { log('세션이 있는 r1 닫기 거부', String(e.stderr || e.message).split('\n').find((l) => /not_empty|세션이/.test(l))); }
await shot(page, 'g1-6-after-close', log);
await closeApp(app);
process.exit(0);
