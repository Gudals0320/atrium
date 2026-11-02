// P6a 완료 기준 1(H1): 모든 워크스페이스의 세션이 한 캔버스에 있고 영역이 보인다. P5 판이 겹치지 않게 옮겨졌다.
// 새 세션은 그 영역 안이나 바로 옆, 새 워크스페이스는 겹치지 않는 곳. 이름표를 끌면 안의 것이 함께 움직이고, 겹치게 놓으면 되돌린다. MT_E2E_OUT=p6a
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { logger, closeApp } from './harness.mjs';
import { launch, atrium, atriumJson, regions, sessionBy, rectOf, vp, fitAll, dragBy, until, sleep, shot, PROJ, R1, PLAIN_NAME } from './p6a-lib.mjs';
import { regionsOf, overlaps } from '../../../backend/src/canvas.mjs';

const log = logger('p6a-h1');
const { app, page } = await launch({ log });
await sleep(1500);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// 1) 처음 열면 모든 영역이 보인다(옮긴 뒤 뷰포트가 비어 모두 보이게 맞춘다)
const regs0 = await regions(page);
log('영역(화면)', regs0.map((r) => `${r.name}${r.warn ? '(겹침)' : ''} ${r.head}`));
const board = atriumJson('board');
const items = [...board.nodes.map((n) => ({ ws: n.workspace_key, ...n })), ...board.groups.map((g) => ({ ws: g.workspaceKey, ...g }))];
const regMap = regionsOf(board.workspaces, items);
const pairs = [...regMap]; let ov = 0;
for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) if (overlaps(pairs[i][1], pairs[j][1])) ov++;
log('판 기록의 영역 겹침 수', ov, '노드 수', board.nodes.length, '워크스페이스', board.workspaces.map((w) => w.name));
const shown = await page.evaluate(() => [...document.querySelectorAll('.react-flow__node-session')].length);
log('그려진 세션 노드', shown, '/ 세션', board.nodes.length);
await shot(page, 'h1-1-single-canvas-all-regions', log);

// 2) 새 세션은 그 워크스페이스 영역 안이나 바로 옆. 보는 화면은 옮기지 않는다
for (const n of ['h1new', 'h1r1']) if (await sessionBy(page, n)) atrium('kill', n, '--yes');
const v0 = await vp(page);
atrium('spawn', PROJ, '--kind', 'shell', '--name', 'h1new');
await until(async () => !!(await rectOf(page, 'h1new')), 20000);
await sleep(1200);
const v1 = await vp(page);
const b2 = atriumJson('board');
const it2 = [...b2.nodes.map((n) => ({ ws: n.workspace_key, ...n })), ...b2.groups.map((g) => ({ ws: g.workspaceKey, ...g }))];
const r2 = regionsOf(b2.workspaces, it2);
const nn = b2.nodes.find((n) => n.session_id === (b2.nodes.find((x) => x.session_id && false) || {}).session_id) || null; void nn;
const newRect = await rectOf(page, 'h1new');
const mtKey = b2.workspaces.find((w) => w.name === 'multitask').key;
const own = r2.get(mtKey);
let ov2 = 0; const p2 = [...r2]; for (let i = 0; i < p2.length; i++) for (let j = i + 1; j < p2.length; j++) if (overlaps(p2[i][1], p2[j][1])) ov2++;
const hitsNode = it2.some((n) => n.session_id && n.x !== newRect.x && overlaps({ ...newRect }, n, 0) && n.session_id !== (b2.nodes.find((x) => x.x === newRect.x && x.y === newRect.y) || {}).session_id);
log('새 셸 h1new 자리', newRect, 'multitask 영역', own, '영역 안', newRect.x >= own.x && newRect.y >= own.y && newRect.x + newRect.w <= own.x + own.w && newRect.y + newRect.h <= own.y + own.h, '영역 겹침', ov2, '다른 노드와 겹침', hitsNode);
log('뷰포트 전/후(같아야 함)', JSON.stringify(v0) === JSON.stringify(v1));
await fitAll(page);
await shot(page, 'h1-2-new-session-in-region', log);

// 3) 새 워크스페이스(리포 열기): 다른 영역과 겹치지 않는 곳에 빈 영역
const R2 = path.join(path.dirname(R1), 'r2');
if (!fs.existsSync(R2)) { fs.mkdirSync(R2, { recursive: true }); execFileSync('git', ['-C', R2, 'init', '-q', '-b', 'main']); }
const opened = atriumJson('ws', 'open', R2);
await sleep(1000);
const b3 = atriumJson('board');
const r3 = regionsOf(b3.workspaces, [...b3.nodes.map((n) => ({ ws: n.workspace_key, ...n })), ...b3.groups.map((g) => ({ ws: g.workspaceKey, ...g }))]);
const k3 = opened.workspace.key;
log('빈 워크스페이스 r2 영역', r3.get(k3), '다른 영역과 겹침', [...r3].filter(([k]) => k !== k3).some(([, r]) => overlaps(r, r3.get(k3))));
await fitAll(page);
await shot(page, 'h1-3-new-empty-workspace-region', log);

// 4) 이름표를 끌면 안의 것이 모두 함께 움직인다
const twoBefore = await rectOf(page, 'far');
const z = (await vp(page)).zoom;
await dragBy(page, '.mt-region[data-name="two"] .mt-region-head', 0, 160);
await sleep(1200);
const twoAfter = await rectOf(page, 'far');
const stored = atriumJson('board').nodes.find((n) => n.x === twoAfter.x && n.y === twoAfter.y);
log('two 이름표 끌기: far 노드', twoBefore, '→', twoAfter, `(화면 160px = 판 ${Math.round(160 / z)})`, '저장됨', !!stored);
await shot(page, 'h1-4-region-dragged', log);

// 5) 다른 영역 위로 끌어 놓으면 되돌린다
const leadBefore = await rectOf(page, 'lead');
const plain = (await regions(page)).find((r) => r.name === PLAIN_NAME);
const twoR = (await regions(page)).find((r) => r.name === 'two');
await dragBy(page, '.mt-region[data-name="two"] .mt-region-head', plain.rect.x - twoR.rect.x + 30, plain.rect.y - twoR.rect.y + 30);
await sleep(1500);
const farBack = await rectOf(page, 'far');
const toast = await page.evaluate(() => [...document.querySelectorAll('.mt-toast')].map((t) => t.innerText));
log('겹치게 놓기: far 노드', farBack, '되돌림', JSON.stringify(farBack) === JSON.stringify(twoAfter), '알림', toast, 'lead 그대로', JSON.stringify(leadBefore) === JSON.stringify(await rectOf(page, 'lead')));
await shot(page, 'h1-5-overlap-reverted', log);

atrium('kill', 'h1new', '--yes');
atrium('ws', 'close', k3, '--yes');
log('창 오류', errors);
await closeApp(app);
process.exit(0);
