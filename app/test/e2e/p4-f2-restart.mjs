// P4 완료 기준 4(F2) 이어서: 연결이 창과 백엔드를 다시 띄워도 남는가, 그리고 연결 끊기. p4-f2.mjs 다음에 돈다. MT_E2E_OUT=p4
// 창이 띄운 백엔드는 Playwright의 창 닫기를 막으므로(harness closeApp), 백엔드는 atrium로 끄고 켠다. 실제 사용에서는 창이 백엔드를 띄운다.
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { launch, shot, logger, closeApp, REPO } from './harness.mjs';
import { linksOf, frame, runUntilReady, labelShot, until, sleep } from './p4-lib.mjs';

const log = logger('p4-f2');
const MTASK = path.join(REPO, 'backend', 'bin', 'atrium.mjs');
const atrium = (...a) => execFileSync(process.execPath, [MTASK, '--dev', ...a], { encoding: 'utf8' });
const linkBefore = JSON.parse(atrium('--json', 'links')).find((l) => l.fromName === 'lead' && l.toName === 'rev' && l.role);
log('다시 띄우기 전 연결', { id: linkBefore.linkId, role: linkBefore.role, count: linkBefore.count });
log('백엔드 끄기', atrium('backend', 'stop').trim());
log('백엔드 켜기', spawnSync(process.execPath, [MTASK, '--dev', 'backend', 'start'], { stdio: 'ignore' }).status); // 파이프를 물려주지 않게
let { app, page } = await launch({ log });
await sleep(2500);
const after = (await linksOf(page)).find((l) => l.id === linkBefore.linkId);
log('창과 백엔드를 다시 띄운 뒤 연결', after);
await labelShot(page, linkBefore.linkId, 'f2-4-after-restart', shot, log);

// 연결 끊기: 선을 누르고 "연결 끊기"
await page.click(`.mt-edge-label[data-link="${linkBefore.linkId}"]`);
await page.waitForSelector('[data-action=unlink]');
await sleep(500);
await shot(page, 'f2-5-link-panel', log);
await page.click('[data-action=unlink]');
await page.waitForSelector('[data-action=unlink-confirm]');
log('끊기 확인 문구', await page.evaluate(() => document.querySelector('[data-role="link-panel"] .mt-card-actions').innerText.replace(/\s+/g, ' ')));
await page.click('[data-action=unlink-confirm]');
await until(async () => !(await linksOf(page)).some((l) => l.id === linkBefore.linkId), 10000);
log('끊은 뒤 선이 있나', await page.evaluate((id) => !!document.querySelector(`.mt-edge-label[data-link="${id}"]`), linkBefore.linkId));
await runUntilReady(page, 'lead', log, { timeout: 120000 });
log('끊긴 알림 뒤 lead의 답', await page.evaluate(() => [...window.__mt.getState().sessions.values()].find((s) => s.name === 'lead').lastAnswer));
log('기록은 남는다', JSON.parse(atrium('--json', 'linklog', linkBefore.linkId)).events.slice(-3).map((e) => `${e.kind}${e.text ? ` ${e.text}` : ''}`));
log('lead에게 간 끊김 알림', JSON.parse(atrium('--json', 'deliveries', 'lead')).slice(0, 1).map((d) => `${d.status} ${d.text}`));
await frame(page, ['lead', 'rev'], { maxZoom: 0.5 });
await shot(page, 'f2-6-unlinked', log);
await closeApp(app);
process.exit(0);
