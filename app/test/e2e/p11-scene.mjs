// P11 창 시험(완료 기준 1·3): 목업 ?scene=ours와 같은 구성(lead와 하위 w1·w2의 가지 선, 기다리는 rev, 붙여 묶은 셸 dev·tests)을 P11 판에 띄우고
// 창 안쪽을 1528×960으로 찍는다(줌 75%). 배율 여럿(0.12, 0.24, 0.5, 0.75, 1)도 찍는다. 시험 claude는 haiku, 턴은 아주 짧다.
// 사용(app 폴더에서): npm run build && MT_E2E_BOARD=p11 MT_E2E_OUT=p11 node test/e2e/p11-scene.mjs [setup|shot|zooms|all]
//   setup: 세션을 띄우고 자리를 잡는다(있으면 그대로). shot: 일하는 중 상태를 만들고 75%로 찍는다. zooms: 배율 여럿
import fs from 'node:fs';
import path from 'node:path';
import { launch, closeApp, logger, sleep, until, call, state, writeJson, atrium, DIRS, OUT } from './p10-lib.mjs';

const log = logger('p11-scene');
const what = process.argv[2] || 'all';
const W = 1528, H = 960;
const BOARD = DIRS.board;
fs.mkdirSync(BOARD, { recursive: true });

// 목업 ours 장면의 월드 자리(콘솔 왼쪽 위가 0,0). 목업은 그룹 테두리가 콘솔보다 (16, 28) 위·왼쪽이고 화면 (107, 137)에 있다
const RECTS = {
  lead: { x: 0, y: 0, w: 607, h: 429 }, w1: { x: 674, y: 0, w: 607, h: 429 }, w2: { x: 674, y: 457, w: 607, h: 429 },
  rev: { x: 1314, y: 0, w: 607, h: 520 }, dev: { x: 0, y: 457, w: 304, h: 429 }, tests: { x: 304, y: 457, w: 303, h: 429 },
};
const VP75 = { x: 107 + 16 * 0.75, y: 137 + 28 * 0.75, zoom: 0.75 };
const byName = async (page, n) => (await state(page)).sessions.find((x) => x.name === n);
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); log('찍음', f); return f; };

const { app, page } = await launch({ log });
try {
  await app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(w, h); }, [W, H]);
  await sleep(600);
  if (await page.$('[data-role="sidebar"]')) await page.click('[data-action="sidebar"]');

  if (what === 'setup' || what === 'all') {
    let s = await state(page);
    const has = (n) => s.sessions.some((x) => x.name === n);
    if (!has('dev')) await call(page, 'session.spawn', { cwd: BOARD, kind: 'shell', name: 'dev' });
    if (!has('tests')) await call(page, 'session.spawn', { cwd: BOARD, kind: 'shell', name: 'tests' });
    if (!has('rev')) await call(page, 'session.spawn', { cwd: BOARD, name: 'rev', model: 'haiku', prompt: 'Use the Bash tool to run exactly this command and nothing else: npm test -- pay' });
    if (!has('lead')) {
      await call(page, 'session.spawn', { cwd: BOARD, name: 'lead', model: 'haiku',
        prompt: 'Use the Bash tool to run these two commands one after another, then reply with one short sentence. Command 1: atrium child w1 --model haiku --prompt "Reply with one short Korean sentence saying the retry policy is merged." Command 2: atrium child w2 --model haiku --prompt "Reply with the single word ok."' });
    }
    // lead의 Bash 권한 요청은 판에서 허용한다(승인 줄과 같은 session.answer)
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      s = await state(page);
      if (s.sessions.some((x) => x.name === 'w1') && s.sessions.some((x) => x.name === 'w2')) break;
      const lead = s.sessions.find((x) => x.name === 'lead');
      if (lead && lead.state === 'waiting') { try { log('lead 허용', atrium('answer', 'lead', '1').trim()); } catch (e) { log('lead answer', e.message.split('\n')[0]); } }
      await sleep(2500);
    }
    await until(async () => { const ss = (await state(page)).sessions; return ['w1', 'w2'].every((n) => ss.some((x) => x.name === n && x.state === 'ready')); }, 180000, 2000);
    await until(async () => { const r = await byName(page, 'rev'); return r && r.state === 'waiting'; }, 120000, 2000);
    s = await state(page);
    const id = (n) => s.sessions.find((x) => x.name === n).id;
    if (!s.docks.some((d) => d.members.includes('dev'))) await call(page, 'dock.create', { members: [id('dev'), id('tests')], dir: 'row' });
    await sleep(800);
    for (const [n, r] of Object.entries(RECTS)) await call(page, 'board.setNode', { session: id(n), ...r, cause: 'p11-scene' });
    // dev 셸은 명령을 돌리는 중(실행 중), tests는 쉰다
    atrium('input', 'dev', 'ping -n 900 127.0.0.1\\r');
    await sleep(1500);
    writeJson('p11-scene-setup.json', await state(page));
  }

  if (what === 'shot' || what === 'all') {
    // rev가 기다리지 않으면 다시 묻게 한다(p11-turn.mjs 뒤)
    const r0 = await byName(page, 'rev');
    if (r0 && r0.state !== 'waiting') {
      try { atrium('send', '@rev', 'Use the Bash tool to run exactly this command and nothing else: npm test -- pay'); } catch (e) { log('send rev', e.message.split('\n')[0]); }
      await until(async () => { const r = await byName(page, 'rev'); return r && r.state === 'waiting'; }, 120000, 1500);
    }
    // lead와 w2를 일하는 중으로(짧은 글을 길게 쓰게 한다). 도구는 쓰지 않는다
    try { atrium('send', '@lead', '@w2', 'Without using any tools, write about 600 words on retry policies with exponential backoff.'); } catch (e) { log('send', e.message.split('\n')[0]); }
    await until(async () => { const ss = (await state(page)).sessions; return ['lead', 'w2'].every((n) => ss.some((x) => x.name === n && x.state === 'working')); }, 60000, 500);
    await page.evaluate((vp) => window.__mt.getState().setViewport(vp), VP75);
    await sleep(2500);
    await shot(page, 'p11-ours-075');
    writeJson('p11-scene-shot.json', await state(page));
    // 보고용 잰 값(화면 px): 목업 board.css의 값과 견준다
    const m = await page.evaluate(() => {
      const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, border: `${cs.borderTopWidth} ${cs.borderTopColor}`, font: `${cs.fontSize} ${cs.fontWeight} ${cs.fontFamily.split(',')[0]}` }; };
      return {
        topLeft: box('[data-role="top-left"]'), sidebarBtn: box('[data-action="sidebar"]'), seg: box('[data-role="workspaces"]'), wsOn: box('.mt-wsbtn.on'), search: box('[data-action="search"]'),
        topRight: box('[data-role="top-right"]'), turn: box('[data-role="inbox"]'),
        railL: box('[data-role="rail-left"]'), toolOn: box('.mt-tool.on'), railR: box('[data-role="rail-right"]'),
        chips: box('[data-role="chips"]'), chip: box('.mt-qchip'), cmd: box('.mt-cmd'), mark: box('.mt-mark'), zoom: box('[data-role="zoom"]'),
        lead: box('.mt-node[data-name="lead"]'), leadHead: box('.mt-node[data-name="lead"] .mt-node-head'), leadName: box('.mt-node[data-name="lead"] .mt-node-name'), leadPill: box('.mt-node[data-name="lead"] .mt-node-head .mt-pill'),
        revPill: box('.mt-node[data-name="rev"] .mt-node-head .mt-pill'), rev: box('.mt-node[data-name="rev"]'), w1: box('.mt-node[data-name="w1"]'),
        revBar: box('.mt-node[data-name="rev"] .mt-answer-bar'), revYes: box('.mt-node[data-name="rev"] .mt-a-yes'),
        regionBox: box('.mt-region-box'), regionHead: box('.mt-region-head'), regionName: box('.mt-region-name'),
        term: (() => { const t = document.querySelector('.mt-node[data-name="lead"] .xterm'); if (!t) return null; const cs = getComputedStyle(t.querySelector('.xterm-rows') || t); return { font: `${cs.fontSize} ${cs.fontFamily.split(',')[0]}`, lh: cs.lineHeight }; })(),
        fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i),
      };
    });
    writeJson('p11-measure-075.json', m);
    log('잰 값', m);
  }

  if (what === 'zooms' || what === 'all') {
    // 장면 가운데를 화면 가운데에 두고 배율만 바꾼다
    const cx = 960, cy = 443;
    for (const z of [0.12, 0.24, 0.5, 0.75, 1]) {
      await page.evaluate(([cx, cy, z, w, h]) => window.__mt.getState().setViewport({ x: w / 2 - cx * z, y: h / 2 - cy * z, zoom: z }), [cx, cy, z, W, H]);
      await sleep(2200);
      const faces = await page.$$eval('.mt-node[data-session]', (els) => els.map((e) => `${e.dataset.name}:${e.dataset.face}`).join(' '));
      log(`배율 ${z}`, faces);
      await shot(page, `p11-zoom-${String(z).replace('.', '')}`);
    }
  }
} finally { await closeApp(app); }
process.exit(0);
