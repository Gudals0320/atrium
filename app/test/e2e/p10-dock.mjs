// P10 창 시험(완료 기준 2): 덩어리(붙여 묶기) 안의 노드를 누르거나 사이드바·검색으로 가면 덩어리 전체가 화면에 들어오고, 초점은 그 노드에 있다.
// 덩어리가 너무 커서(가로 여섯) 다 넣으면 누른 노드가 가까이 얼굴이 못 될 때는 누른 노드를 가까이 얼굴로 두고 덩어리 쪽으로 옮긴다(lib/nav.js).
// p10-discover.mjs 뒤의 판(cli 워크스페이스에 셸 sh1~sh3 덩어리)에서 돈다. 셸만 쓴다(토큰을 쓰지 않는다).
// 사용: MT_E2E_OUT=p10 node test/e2e/p10-dock.mjs
import { launch, closeApp, shot, logger, sleep, until, call, state, openSidebar, writeJson, viewport, atrium, DIRS } from './p10-lib.mjs';

const log = logger('p10-dock');
const result = { steps: [] };
const step = (name, ok, data = {}) => { result.steps.push({ name, ok, ...data }); log(`${ok ? '통과' : '실패'}: ${name}`, data); };
// 지금 화면(판 좌표)에 노드들이 다 들어 있는가
async function inView(page, names) {
  const v = await viewport(page);
  const s = await state(page);
  const x0 = -v.x / v.zoom, y0 = -v.y / v.zoom, x1 = x0 + v.width / v.zoom, y1 = y0 + v.height / v.zoom;
  const out = names.map((n) => { const r = s.nodes[n]; return { n, ok: r.x >= x0 - 1 && r.y >= y0 - 1 && r.x + r.w <= x1 + 1 && r.y + r.h <= y1 + 1, px: Math.round(r.w * v.zoom) }; });
  return { all: out.every((o) => o.ok), out, zoom: +v.zoom.toFixed(3), focus: s.focus };
}
// P13: 배율 0.25로 멀리 보되 셸 덩어리를 화면 가운데에 둔다. 고정 자리({ x: 900, y: 600 })는 판의 배치(영역 수, 대화 노드)에 따라 노드가 화면 밖으로 나가 누르지 못한다
const awayFrom = (page) => page.evaluate(() => {
  const s = window.__mt.getState();
  const rs = [...s.sessions.values()].filter((x) => /^sh\d$/.test(x.name)).map((x) => s.nodes.get(x.sessionId)).filter(Boolean);
  if (!rs.length) return s.setViewport({ x: 900, y: 600, zoom: 0.25 });
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)), x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
  const el = document.querySelector('.mt-canvas');
  s.setViewport({ x: el.clientWidth / 2 - ((x0 + x1) / 2) * 0.25, y: el.clientHeight / 2 - ((y0 + y1) / 2) * 0.25, zoom: 0.25 });
});
// 노드를 누른다: 가운데(본문). 머리줄을 누르면 고르기만 하고 터미널에 초점을 주지 않는다(29d518f, P26에서도 지킴).
// 멀리서 누르므로 본문은 터미널이 아니라 요약·아이콘 얼굴이다. 아래쪽 칩 줄·명령 바에 가리지 않게 본문 위쪽을 누른다
const clickNode = async (page, name) => {
  const el = await page.$(`.mt-node[data-name="${name}"] .mt-node-body`) || await page.$(`.mt-node[data-name="${name}"]`);
  const box = await el.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + Math.min(24, box.height / 3));
};
const faceOf = (page, name) => page.$eval(`.mt-node[data-name="${name}"]`, (e) => e.dataset.face);

const { app, page } = await launch({ log });
try {
  // 사이드바를 닫고 시작(캔버스가 넓다)
  if (await page.$('[data-role="sidebar"]')) await page.click('[data-action="sidebar"]');
  let s = await state(page);
  const dock3 = s.docks.find((d) => d.members.join() === 'sh1,sh2,sh3');
  step('셸 셋이 가로 덩어리', !!dock3, { docks: s.docks });

  // 1) 멀리서 덩어리 가운데 노드(sh2)를 누른다
  await awayFrom(page); await sleep(500);
  await page.evaluate(() => window.__mt.getState().fitAll(0)); await sleep(500);
  await clickNode(page, 'sh2'); await sleep(1200);
  let v = await inView(page, ['sh1', 'sh2', 'sh3']);
  step('누른 노드(sh2)로 가면 덩어리 전체(sh1~sh3)가 화면에 든다, 초점은 sh2', v.all && v.focus === 'sh2', v);
  step('누른 노드는 가까이 얼굴(터미널)', (await faceOf(page, 'sh2')) === 'close', { face: await faceOf(page, 'sh2') });
  await shot(page, 'p10-2-1-click-in-dock', log);
  // 키가 그 노드의 터미널로 간다(셸에 글을 넣고 화면에 보이는지)
  await sleep(800);
  await page.keyboard.press('Escape');
  await page.keyboard.type('echo p10-dock-focus');
  // 터미널은 캔버스(WebGL)에 그리므로 글을 DOM에서 읽지 않고, 판이 읽은 셸의 마지막 프롬프트 줄(G2)로 본다
  let typed = false;
  await until(async () => { typed = atrium('ls').split(/\r?\n/).some((l) => /\bsh2\b/.test(l) && l.includes('p10-dock-focus')); return typed; }, 10000, 1000).catch(() => {});
  step('터미널 입력이 누른 노드(sh2)로 간다', typed, {});
  await page.keyboard.press('Escape'); // 친 글을 지운다(PowerShell PSReadLine: Esc는 줄 지우기)

  // 2) 사이드바에서 sh3로
  await awayFrom(page); await sleep(400);
  await openSidebar(page); await sleep(800);
  await page.click(`[data-sb="session"][data-name="sh3"]`); await sleep(1200);
  v = await inView(page, ['sh1', 'sh2', 'sh3']);
  step('사이드바로 sh3에 가도 덩어리 전체, 초점 sh3', v.all && v.focus === 'sh3', v);
  await shot(page, 'p10-2-2-sidebar-to-dock', log);
  await page.click('[data-action="sidebar"]'); await sleep(400);

  // 3) 검색(Ctrl+F)으로 sh1
  await awayFrom(page); await sleep(400);
  await page.keyboard.press('Control+f'); await sleep(300);
  await page.keyboard.type('sh1'); await sleep(600);
  await page.keyboard.press('Enter'); await sleep(1200);
  v = await inView(page, ['sh1', 'sh2', 'sh3']);
  step('검색으로 sh1에 가도 덩어리 전체, 초점 sh1', v.all && v.focus === 'sh1', v);

  // 4) 덩어리를 가로 여섯으로 키운다 → 다 넣으면 노드가 작아 가까이 얼굴이 못 된다
  for (const n of ['sh4', 'sh5', 'sh6']) if (!(await state(page)).sessions.some((x) => x.name === n)) await call(page, 'session.spawn', { cwd: DIRS.cli, kind: 'shell', name: n });
  await until(async () => (await state(page)).sessions.filter((x) => /^sh[456]$/.test(x.name)).length === 3, 30000, 500);
  s = await state(page);
  let last = 'sh3';
  // P17: at 'dock'은 덩어리 전체 오른쪽 새 칸(옛 한 줄 끝에 붙이기). 주지 않으면 덩어리 안 대상(sh3)을 반으로 나눈다
  for (const n of ['sh4', 'sh5', 'sh6']) { if (!s.docks.some((d) => d.members.includes(n))) await call(page, 'dock.attach', { session: n, to: last, side: 'right', at: 'dock' }); last = n; }
  await sleep(1500);
  s = await state(page);
  step('덩어리가 가로 여섯', s.docks.some((d) => d.members.length === 6), { docks: s.docks });
  await awayFrom(page); await sleep(400);
  await clickNode(page, 'sh1'); await sleep(1200);
  v = await inView(page, ['sh1']);
  const all6 = await inView(page, ['sh1', 'sh2', 'sh3', 'sh4', 'sh5', 'sh6']);
  const shown = all6.out.filter((o) => o.ok).map((o) => o.n);
  step('큰 덩어리: 누른 노드(sh1)는 가까이 얼굴로 화면 안에, 덩어리 쪽 이웃도 보인다', v.all && v.out[0].px >= 360 && v.focus === 'sh1' && shown.length >= 2, { ...v, shown });
  await shot(page, 'p10-2-3-big-dock-node-close', log);
  await awayFrom(page); await sleep(400);
  await page.evaluate(() => window.__mt.getState().fitAll(0)); await sleep(500);
  await clickNode(page, 'sh6'); await sleep(1200);
  v = await inView(page, ['sh6']);
  step('맨 오른쪽 노드(sh6)도 같다', v.all && v.out[0].px >= 360 && v.focus === 'sh6', v);
  // 되돌림: 여섯 중 셋을 떼어 다음 시험이 같은 판을 쓴다
  for (const n of ['sh6', 'sh5', 'sh4']) await call(page, 'session.kill', { session: n, confirm: true });
  await sleep(1500);
} finally { await closeApp(app); }
result.ok = result.steps.every((x) => x.ok);
writeJson('p10-dock.json', result);
log(result.ok ? '모두 통과' : `실패 ${result.steps.filter((x) => !x.ok).map((x) => x.name).join(', ')}`);
process.exit(result.ok ? 0 : 1);
