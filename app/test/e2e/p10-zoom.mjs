// P10 창 시험(완료 기준 3): 아주 멀리서(노드가 화면 140px 아래) 노드는 종류 아이콘과 상태 색만 보이고 글이 깨지지 않는다.
// 기다리는 노드는 그래도 눈에 띈다(깜빡이는 테두리, 노드보다 넓은 말풍선). 멀리 얼굴(140~200px)은 이름 줄을 자르고 상태 필이 노드 안에 있다.
// 판: p10-discover.mjs 뒤(셸 sh1~sh3 덩어리) + 이 시험이 띄우는 claude w1(haiku, AskUserQuestion으로 묻고 기다림). 끝나면 w1을 끈다.
// 사용: MT_E2E_OUT=p10 node test/e2e/p10-zoom.mjs
import { launch, closeApp, shot, logger, sleep, until, call, state, writeJson, DIRS } from './p10-lib.mjs';

const log = logger('p10-zoom');
const result = { steps: [], zooms: [] };
const step = (name, ok, data = {}) => { result.steps.push({ name, ok, ...data }); log(`${ok ? '통과' : '실패'}: ${name}`, data); };

const { app, page } = await launch({ log });
try {
  if (await page.$('[data-role="sidebar"]')) await page.click('[data-action="sidebar"]');
  let s = await state(page);
  if (!s.sessions.some((x) => x.name === 'w1')) {
    await call(page, 'session.spawn', { cwd: DIRS.cli, name: 'w1', model: 'haiku', prompt: 'Use the AskUserQuestion tool once to ask me: Which color for the p10 test? Options: Red, Blue. Do nothing else.' });
  }
  await until(async () => (await state(page)).sessions.some((x) => x.name === 'w1' && x.state === 'waiting'), 180000, 1000);
  step('w1이 질문을 하고 기다린다', true, {});
  s = await state(page);
  const names = Object.keys(s.nodes);
  const xs = names.map((n) => s.nodes[n]);
  const cx = (Math.min(...xs.map((r) => r.x)) + Math.max(...xs.map((r) => r.x + r.w))) / 2;
  const cy = (Math.min(...xs.map((r) => r.y)) + Math.max(...xs.map((r) => r.y + r.h))) / 2;
  for (const z of [0.6, 0.35, 0.24, 0.17, 0.12, 0.07]) {
    await page.evaluate(([cx, cy, z]) => { const el = document.querySelector('.mt-canvas'); window.__mt.getState().setViewport({ x: el.clientWidth / 2 - cx * z, y: el.clientHeight / 2 - cy * z, zoom: z }); }, [cx, cy, z]);
    await sleep(900);
    const info = await page.$$eval('.mt-node[data-session]', (els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      const pill = e.querySelector('.mt-far-name .mt-pill');
      const pr = pill && pill.getBoundingClientRect();
      return {
        name: e.dataset.name, face: e.dataset.face, px: Math.round(r.width),
        head: !!e.querySelector('.mt-node-head'), icon: !!e.querySelector('[data-role="icon-face"]'), farText: !!e.querySelector('.mt-far'),
        pillInside: pr ? pr.right <= r.right + 1 && pr.left >= r.left - 1 : null,
        blink: getComputedStyle(e).animationName, callout: (() => { const c = e.querySelector('[data-role="ask-callout"]'); if (!c) return null; const cr = c.getBoundingClientRect(); return { w: Math.round(cr.width), h: Math.round(cr.height) }; })(),
      };
    }));
    result.zooms.push({ zoom: z, nodes: info });
    await shot(page, `p10-3-zoom-${String(z).replace('.', '_')}`, log);
  }
  const at = (z) => result.zooms.find((x) => x.zoom === z).nodes;
  const icons = [0.17, 0.12, 0.07].flatMap(at);
  step('화면 140px 아래(배율 0.17·0.12·0.07)는 모두 아이콘 얼굴: 머리줄과 글 없이 아이콘', icons.every((n) => n.px >= 140 || (n.face === 'icon' && n.icon && !n.head && !n.farText)), { faces: icons.map((n) => `${n.name}:${n.face}:${n.px}`) });
  const fars = [0.24].flatMap(at).filter((n) => n.face === 'far');
  step('멀리 얼굴(배율 0.24): 이름 줄의 상태 필이 노드 안에 있다', fars.length > 0 && fars.every((n) => n.pillInside !== false), { fars: fars.map((n) => `${n.name}:${n.px}:${n.pillInside}`) });
  const w1 = [0.24, 0.17, 0.12, 0.07].map((z) => ({ z, n: at(z).find((n) => n.name === 'w1') }));
  step('기다리는 노드는 어느 배율에서도 깜빡이는 테두리', w1.every(({ n }) => n.blink === 'mt-wait'), { w1: w1.map(({ z, n }) => `${z}:${n.face}:${n.blink}`) });
  step('아이콘 얼굴의 기다리는 노드는 말풍선이 노드보다 넓다(화면 220px)', w1.filter(({ n }) => n.face === 'icon').every(({ n }) => n.callout && n.callout.w >= 200 && n.callout.w > n.px), { callouts: w1.map(({ z, n }) => `${z}:${n.px}:${n.callout && n.callout.w}`) });
} finally {
  try { await call(page, 'session.kill', { session: 'w1', confirm: true }); } catch (e) { log('w1 끄기:', e.message); }
  await sleep(3000);
  await closeApp(app);
}
result.ok = result.steps.every((x) => x.ok);
writeJson('p10-zoom.json', result);
log(result.ok ? '모두 통과' : `실패 ${result.steps.filter((x) => !x.ok).map((x) => x.name).join(', ')}`);
process.exit(result.ok ? 0 : 1);
