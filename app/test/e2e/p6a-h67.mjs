// P6a 완료 기준 5·6(H6·H7·H8): 노드 몇 개를 골라 묶으면 배경이 깔린 그룹이 된다(풀기). 크기 단계와 "정리"(되돌리기 포함).
// 다시 띄워도 배치, 덩어리, 그룹, 영역이 남는다. @all은 캔버스 전체의 에이전트에 간다. MT_E2E_OUT=p6a
import { logger, closeApp } from './harness.mjs';
import { launch, atrium, atriumJson, sessionBy, idOf, rectOf, vp, fitAll, regions, until, sleep, shot, PLAIN_NAME } from './p6a-lib.mjs';

const log = logger('p6a-h67');
let { app, page } = await launch({ log });
await sleep(1500);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const groupsOf = (pg) => pg.evaluate(() => [...window.__mt.getState().groups.values()].map((g) => ({ id: g.groupId, name: g.name, members: g.members.map((m) => (window.__mt.getState().sessions.get(m) || {}).name).sort(), rect: [g.x, g.y, g.w, g.h] })));
const ctrlClick = async (name) => { const b = await page.locator(`.mt-node[data-name="${name}"] .mt-node-head`).boundingBox(); await page.keyboard.down('Control'); await page.mouse.click(b.x + 60, b.y + b.height / 2); await page.keyboard.up('Control'); await sleep(300); };
for (const g of await groupsOf(page)) if (g.name !== 'grp') atrium('group', 'ungroup', g.name);
for (const d of atriumJson('call', 'dock.list')) atrium('call', 'dock.remove', JSON.stringify({ dock: d.dockId }));
await sleep(800);

// ---- H6: 골라 묶기 ----
await page.click('.mt-wsbtn[data-name="multitask"]');
await sleep(900);
const before = { sh1: await rectOf(page, 'sh1'), sh2: await rectOf(page, 'sh2') };
await ctrlClick('sh1'); await ctrlClick('sh2');
const bar = await page.evaluate(() => (document.querySelector('[data-role=selection]') || {}).innerText);
log('고른 노드 막대', bar && bar.replace(/\s+/g, ' '));
await shot(page, 'h6-1-selected-two', log);
await page.click('[data-action=group-selected]');
await sleep(1500);
let gs = await groupsOf(page);
const g1 = gs.find((g) => g.members.join() === 'sh1,sh2');
log('묶기 뒤 그룹', gs, '노드 자리 그대로', JSON.stringify(before.sh1) === JSON.stringify(await rectOf(page, 'sh1')) && JSON.stringify(before.sh2) === JSON.stringify(await rectOf(page, 'sh2')));
const bg = await page.evaluate((id) => { const e = document.querySelector(`.mt-group[data-group="${id}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), name: e.dataset.name }; }, g1 && g1.id);
log('그룹 배경(화면)', bg);
await shot(page, 'h6-2-grouped-background', log);
// 다른 워크스페이스를 섞어 고르면 묶기 단추가 꺼진다
await fitAll(page);
await page.click('.react-flow__pane', { position: { x: 5, y: 5 } });
await ctrlClick('sh1'); await ctrlClick('r1sh');
const disabled = await page.evaluate(() => { const b = document.querySelector('[data-action=group-selected]'); return b ? { disabled: b.disabled, title: b.title } : null; });
log('다른 워크스페이스를 섞어 고르면 묶기', disabled);
await shot(page, 'h6-3-mixed-workspace-disabled', log);
await page.keyboard.press('Escape');
await page.evaluate(() => window.__mt.getState().clearSelection());
// 풀기(그룹 머리줄)
await page.click('.mt-wsbtn[data-name="multitask"]');
await sleep(900);
await page.click(`.mt-group[data-group="${g1.id}"] [data-action=ungroup]`);
await sleep(1200);
gs = await groupsOf(page);
log('풀기 뒤 그룹', gs.map((g) => g.name), '노드 자리 그대로', JSON.stringify(before.sh1) === JSON.stringify(await rectOf(page, 'sh1')));
await shot(page, 'h6-4-ungrouped', log);

// ---- H7: 크기 단계 ----
await page.click('.mt-node[data-name="sh2"] [data-action=node-menu]');
await page.click('.mt-node[data-name="sh2"] [data-size=small]');
await sleep(1200);
log('sh2 작게', await rectOf(page, 'sh2'));
await shot(page, 'h7-1-size-small', log);
await page.click('.mt-node[data-name="sh2"] [data-action=node-menu]');
await page.click('.mt-node[data-name="sh2"] [data-size=normal]');
await sleep(1000);
log('sh2 보통', await rectOf(page, 'sh2'));

// ---- H7: 정리(연결을 따라) ----
await page.click(`.mt-wsbtn[data-name="${PLAIN_NAME}"]`);
await sleep(900);
const pre = { lead: await rectOf(page, 'lead'), rev: await rectOf(page, 'rev'), help: await rectOf(page, 'help') };
await shot(page, 'h7-2-before-arrange', log);
await page.click(`.mt-region[data-name="${PLAIN_NAME}"] [data-action=arrange]`);
await sleep(1500);
const post = { lead: await rectOf(page, 'lead'), rev: await rectOf(page, 'rev'), help: await rectOf(page, 'help') };
log('정리 전', pre); log('정리 뒤', post, 'lead 왼쪽·크게', post.lead.x < post.rev.x && post.lead.w > pre.lead.w);
await page.click(`.mt-wsbtn[data-name="${PLAIN_NAME}"]`);
await sleep(900);
const regs = await regions(page);
log('정리 뒤 영역 겹침', regs.filter((r) => r.warn).map((r) => r.name));
await shot(page, 'h7-3-after-arrange', log);
await page.click(`.mt-region[data-name="${PLAIN_NAME}"] [data-action=arrange-undo]`);
await sleep(1500);
const back = { lead: await rectOf(page, 'lead'), rev: await rectOf(page, 'rev'), help: await rectOf(page, 'help') };
log('되돌리기 뒤 같은가', JSON.stringify(back) === JSON.stringify(pre));
await page.click(`.mt-wsbtn[data-name="${PLAIN_NAME}"]`);
await sleep(900);
await shot(page, 'h7-4-arrange-undone', log);

// ---- 다시 띄워도 남는가(배치, 덩어리, 그룹, 영역) ----
atrium('dock', 'sh2', 'sh1', '--side', 'right');
atrium('group', 'pick', 'far', '--name', 'farg');
atrium('size', 'r1sh', 'small');
await sleep(1500);
const snap = async (pg) => pg.evaluate(() => { const st = window.__mt.getState(); const nm = (id) => (st.sessions.get(id) || {}).name; return { nodes: [...st.nodes].map(([id, r]) => `${nm(id)}:${r.x},${r.y},${r.w}x${r.h}${r.size ? ':' + r.size : ''}`).sort(), docks: [...st.docks.values()].map((d) => `${d.dir}:${d.members.map(nm).join('|')}`).sort(), groups: [...st.groups.values()].map((g) => `${g.name}:${g.members.map(nm).sort().join('|')}`).sort(), workspaces: st.workspaces.map((w) => `${w.name}@${w.x},${w.y}`), regions: [...document.querySelectorAll('.mt-region')].map((e) => e.dataset.name).sort(), viewport: st.vpNow }; });
const s0 = await snap(page);
log('다시 띄우기 전', s0);
await shot(page, 'h8-0-before-restart', log);
await closeApp(app);
atrium('backend', 'stop');
await sleep(1000);
({ app, page } = await launch({ log })); // 창이 백엔드를 다시 띄운다
await sleep(2500);
const s1 = await snap(page);
log('다시 띄운 뒤', s1);
for (const k of ['nodes', 'docks', 'groups', 'workspaces', 'regions']) log(`  같은가 ${k}`, JSON.stringify(s0[k]) === JSON.stringify(s1[k]));
log('  뷰포트 남음', JSON.stringify(s0.viewport), JSON.stringify(s1.viewport));
await shot(page, 'h8-1-after-restart', log);

// ---- H8: @all은 캔버스 전체의 에이전트 세션(셸 빼고) ----
await page.click('[data-role=command]');
await page.keyboard.type('@al');
await sleep(300);
const menu = await page.evaluate(() => [...document.querySelectorAll('.mt-mention-item')].map((e) => e.innerText));
log('@ 메뉴', menu);
await page.keyboard.press('Escape');
await page.fill('[data-role=command]', '@all Reply with exactly: p6a-all');
await page.keyboard.press('Enter');
await sleep(1500);
const ds = await page.evaluate(() => [...window.__mt.getState().deliveries.values()].slice(-12).filter((d) => (d.text || '').includes('p6a-all') || true).map((d) => ({ name: d.name, status: d.status })));
log('@all 전달', ds);
const sess = await page.evaluate(() => [...window.__mt.getState().sessions.values()].map((s) => ({ name: s.name, kind: s.kind, ws: s.workspaceKey })));
log('세션', sess);
await until(async () => { const x = atriumJson('deliveries'); return x.filter((d) => d.text.includes('p6a-all')).every((d) => ['confirmed', 'failed', 'unconfirmed'].includes(d.status)); }, 120000, 2000).catch(() => {});
const fin = atriumJson('deliveries').filter((d) => d.text.includes('p6a-all')).map((d) => `${d.name}:${d.status}`);
log('@all 결과', fin);
await shot(page, 'h8-2-all-whole-canvas', log);
log('창 오류', errors);
await closeApp(app);
process.exit(0);
