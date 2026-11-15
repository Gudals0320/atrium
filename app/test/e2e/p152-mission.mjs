// P152 창 시험: 미션 맵 A "Territories"(영토 지도, 무한 캔버스).
// 판: 따로 띄운 개발용 판(atrium-dev-p152, 47921, backend/.dev)만 쓴다. 창의 원격 디버깅 포트 9401, 휴대폰 흉내 프록시 47993. 한 번에 한 창·브라우저만(메모리).
//   워크스페이스 여섯(mtask-p152-a…f)에 셸 세션 하나씩. 폴더 atrium(a, b, c)·tools(d, e)·lab(f). g…j는 흉내 판에서 어느 폴더에도 없는 키.
//   페이지 안에서 mission.graph 답을 실제 판 모양 흉내(세션 28·워크스페이스 10·폴더 3, 워크스페이스를 넘는 팀, 역할 연결·지시 선)로 바꾸고
//   응답 필요·오류·작업 중·작업 완료·쉼·잠듦·끝남을 섞는다. a-shell 카드는 실제 셸 세션(p152-a)이라 "Open on board"와 휴대폰 열기가 실제로 간다.
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p152-mission.mjs <setup|pc|perf|phone|webkit|mock|stop> [after]
// 결과는 주 체크아웃의 experiments/p152/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const MAIN = /[\\/]\.claude[\\/]worktrees[\\/]/.test(REPO) ? path.resolve(REPO, '..', '..', '..') : REPO;
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(MAIN, 'experiments', 'p152');
const CONVOS = path.join(OUT, 'convos');
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];
const DIRS = LETTERS.map((k) => `C:\\Workspace\\mtask-p152-${k}`);
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const SIM = 47993;
const ENV = {
  ATRIUM_TERMINAL_SESSION: 'atrium-dev-p152', ATRIUM_HERDR_SESSION: 'atrium-dev-p152', ATRIUM_PORT: '47921',
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p152-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: '47921',
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

// 받아 둔 Chromium(헤드리스 셸이 없을 때)
const chromeExe = (() => { const d = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'); try { return fs.readdirSync(d).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(d, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const chromiumOpts = () => ({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
const log = logger(`p152-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const sessions = () => call('session.list');
const P = (k) => `p152-${k}`;
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];

async function setupBoard() {
  for (const d of DIRS) fs.mkdirSync(d, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(sessions().map((s) => s.name));
  LETTERS.forEach((k, i) => { if (!have.has(P(k))) log(atrium('--json', 'spawn', DIRS[i], '--kind', 'shell', '--name', P(k)).slice(0, 160)); });
  await sleep(3000);
  const gs = call('group.list');
  const list = gs.groups || gs;
  const has = (n) => Array.isArray(list) && list.some((g) => g.name === n);
  if (!has('atrium')) call('group.create', { name: 'atrium', workspaces: [DIRS[0], DIRS[1], DIRS[2]] });
  if (!has('tools')) call('group.create', { name: 'tools', workspaces: [DIRS[3], DIRS[4]] });
  if (!has('lab')) call('group.create', { name: 'lab', workspaces: [DIRS[5]] });
  log('groups', JSON.stringify(call('group.list')).slice(0, 600));
}

// ---- 흉내 판: mission.graph 답을 바꾼다. keys: 글자 → 워크스페이스 키, real: a-shell에 쓸 실제 세션 id, big: 큰 판(세션 120) ----
const HOOK = ([keys, real, big]) => {
  const api = window.__mt.api;
  if (!api.__p152orig) api.__p152orig = api.call.bind(api);
  const now = Date.now();
  let i = 0;
  const S = (name, w, o = {}) => ({ id: `s:${name}`, kind: 'session', sessionId: `fk-${name}`, name, agentKind: 'claude', state: 'ready', category: 'idle', workspaceKey: keys[w], parentId: null, role: null, order: null, createdAt: 1e12 + ++i, loops: 0, model: 'claude-opus-5-5', effort: 'high', activeAt: now - i * 7e5, turnAt: null, gitBranch: null, ...o });
  const W = { state: 'working', category: 'working' };
  const DONE = { state: 'ready', category: 'done' };
  const kid = (name, w, parent, o = {}) => S(name, w, { parentId: `s:${parent}`, role: 'worker', ...o });
  let fake = [
    // a (9): 지휘 세션과 워커 넷(작업 중·응답 필요·작업 완료·다른 워크스페이스), 워커의 리뷰어, 쉼·잠듦·셸·끝남
    S('multitask-1', 'a', { ...W, model: 'claude-fable-5-2', effort: 'high', turnAt: now - 5e6, lastPrompt: 'Merge the workers when they report and run the release check' }),
    kid('p149', 'a', 'multitask-1', { ...W, turnAt: now - 2e6, gitBranch: 'worktree-p149', lastPrompt: 'Polish the classic mission map without removing any information from the cards' }),
    kid('p150', 'a', 'multitask-1', { state: 'waiting', category: 'needs_you', ask: 'Allow npm ci in the worktree?', gitBranch: 'worktree-p150', lastPrompt: 'Phone layout check' }),
    kid('p151', 'a', 'multitask-1', { ...DONE, gitBranch: 'worktree-p151', lastPrompt: 'Fix the sidebar fold arrow and add a unit test' }),
    kid('p149-review', 'a', 'p149', { ...W, role: 'reviewer', model: 'claude-sonnet-5-5', effort: 'medium', turnAt: now - 4e5, lastPrompt: 'Review the mission map diff for overflow' }),
    S('docs', 'a', { lastPrompt: 'Rewrite the install section' }), S('a-old', 'a', { state: 'sleeping', lastPrompt: 'Old experiment with the dock' }),
    S('a-shell', 'a', { agentKind: 'shell', model: null, effort: null, sessionId: real || 'fk-a-shell' }), S('a-gone', 'a', { state: 'exited', category: 'exited', lastPrompt: 'Clean the temp folders' }),
    // b (5): 쉬는 리드와 하위 둘(오류, 작업 중), 잠듦, a 팀의 다른 워크스페이스 워커
    S('web', 'b', { lastPrompt: 'Split the landing page work' }), kid('web-api', 'b', 'web', { state: 'error', category: 'needs_you', lastPrompt: 'Start the dev server', error: 'API Error: 529 overloaded. The server is busy, retry later.' }),
    kid('web-ui', 'b', 'web', { ...W, role: 'frontend', model: 'claude-haiku-5-5', effort: null, turnAt: now - 3e5, lastPrompt: 'Make the hero section responsive' }), S('b-notes', 'b', { state: 'sleeping' }),
    kid('docs-sync', 'b', 'multitask-1', { ...W, turnAt: now - 7e5, lastPrompt: 'Update the API reference pages from the merged branch' }),
    // c (3): 일하는 리드, 쉬는 하위, 작업 완료 하위
    S('bot', 'c', { ...W, turnAt: now - 9e5, lastPrompt: 'Ship the bot release notes' }), kid('bot-1', 'c', 'bot', { lastPrompt: 'Collect the changelog lines' }), kid('bot-2', 'c', 'bot', { ...DONE, lastPrompt: 'Tag the release' }),
    // d (3), e (2): 폴더 tools의 혼자인 세션. f (2): 폴더 lab
    S('d-1', 'd', { ...W, turnAt: now - 1e5, lastPrompt: 'Profile the build' }), S('d-2', 'd', { state: 'sleeping', lastPrompt: 'Benchmark the cache' }), S('d-3', 'd'),
    S('e-1', 'e', { ...DONE, lastPrompt: 'Upgrade the lint config' }), S('e-2', 'e'),
    S('f-1', 'f', { ...W, model: 'gpt-5.5', effort: 'high', agentKind: 'codex', turnAt: now - 6e5, lastPrompt: 'Port the parser to the new API' }), S('f-2', 'f', { state: 'sleeping' }),
    // g…j: 폴더 밖
    S('g-1', 'g'), S('h-1', 'h', { agentKind: 'shell', model: null, effort: null, state: 'working', category: 'working' }),
    S('i-1', 'i', { state: 'waiting', category: 'needs_you', ask: 'Which branch should I rebase onto?' }),
    S('j-1', 'j', { state: 'sleeping', lastPrompt: 'Summarize the meeting notes' })];
  if (big) { // 큰 판: 세션 120(작업 중 24)
    for (let n = 0; n < 92; n++) { const w = 'abcdefghij'[n % 10]; fake.push(n % 7 === 0 ? kid(`x${n}`, w, 'bot', { ...W, turnAt: now - n * 1e4, lastPrompt: `Task number ${n}` }) : S(`x${n}`, w, n % 4 === 0 ? { ...W, turnAt: now - n * 1e4, lastPrompt: `Task number ${n}` } : { lastPrompt: `Old task ${n}` })); }
  }
  const edges0 = [];
  for (const n of fake) if (n.parentId) edges0.push({ from: n.parentId, to: n.id, kind: 'spawn' });
  edges0.push({ from: 'human', to: 's:multitask-1', kind: 'bar', count: 6, label: 'Ship the polish' }, { from: 's:p149', to: 's:p151', kind: 'prompt', label: 'share the fold helper', count: 1, lastAt: now - 3e5 },
    { from: 's:web', to: 's:web-ui', kind: 'role', label: 'frontend' }, { from: 's:bot', to: 's:bot-1', kind: 'prompt', label: 'collect lines', count: 2 });
  api.call = async (m, p) => {
    if (m !== 'mission.graph') return api.__p152orig(m, p);
    const nodes = [{ id: 'human', kind: 'human', name: 'you' }, ...fake];
    return { nodes, edges: edges0, counts: { all: nodes.length - 1 }, at: now };
  };
};
const UNHOOK = () => { const api = window.__mt.api; if (api.__p152orig) api.call = api.__p152orig; };

// ---- 지도 읽기 ----
const PROBE = () => {
  const m = document.querySelector('[data-role=mission]');
  if (!m) return null;
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const vp = m.querySelector('[data-role=ta-viewport]'), world = m.querySelector('[data-role=ta-world]');
  const cards = [...m.querySelectorAll('.mt-ta-card')].map((c) => {
    const r = R(c);
    const full = c.querySelector('.mt-ta-full');
    const lines = [...c.querySelectorAll('.mt-ta-full > span')].filter((x) => x.offsetParent).map((x) => ({ cls: x.className, over: x.scrollHeight > x.clientHeight + 2 }));
    const overflowBox = full && full.offsetParent ? full.scrollHeight > full.clientHeight + 2 : false;
    return { id: c.dataset.id, name: c.dataset.name, tier: c.dataset.tier, text: c.innerText.replace(/\s+/g, ' ').trim(), title: c.title, ...r, overflowBox, clampOver: lines.filter((l) => l.over).map((l) => l.cls) };
  });
  return {
    win: { w: innerWidth, h: innerHeight }, vp: R(vp), level: m.dataset.level, cls: world && world.className, view: window.__mtTa && window.__mtTa.view(),
    cards, terrs: [...m.querySelectorAll('[data-role=ta-terr]')].map((x) => ({ id: x.dataset.id, ...R(x) })), isles: [...m.querySelectorAll('[data-role=ta-isle]')].map((x) => ({ key: x.dataset.key, ...R(x) })),
    rings: [...m.querySelectorAll('[data-role=ta-ring]')].map((x) => ({ lead: x.dataset.lead, text: x.innerText, ...R(x) })), edges: m.querySelectorAll('[data-role=ta-edge]').length, labels: [...m.querySelectorAll('[data-role=ta-edge-label]')].filter((x) => x.offsetParent).length,
    lights: m.querySelectorAll('[data-role=ta-light]').length, ringShown: [...m.querySelectorAll('[data-role=ta-light] .mt-mm-lring')].filter((x) => getComputedStyle(x).display !== 'none').length,
    attn: [...m.querySelectorAll('[data-role=ta-attn-item]')].map((x) => x.innerText.replace(/\s+/g, ' ')), summary: (m.querySelector('[data-role=ta-summary]') || {}).innerText || '', zoomText: (m.querySelector('[data-role=ta-zoom]') || {}).innerText || '',
    hud: ['ta-top', 'ta-legend', 'ta-dock', 'ta-inspect'].map((r) => { const e = m.querySelector(`[data-role=${r}]`); return e ? { r, ...R(e) } : null; }).filter(Boolean),
  };
};
const apart = (a, b) => a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1;

async function openMission(pg) {
  if (await pg.$('[data-action="return-close"]')) { await pg.click('[data-action="return-close"]').catch(() => {}); await sleep(300); }
  if (await pg.$('[data-role="mission"]')) { await pg.keyboard.press('Escape'); await sleep(400); }
  await pg.click('[data-action="mission-rail"]');
  await pg.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 });
  await sleep(1200);
}
const shotTo = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) }).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const SIZES = [[2576, 1408], [1584, 921], [1366, 768]];
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
const view = (pg) => pg.evaluate(() => window.__mtTa.view());
const level = (pg, l) => pg.click(`[data-action=ta-level-${l}]`).then(() => sleep(700));
async function keysOf(page) {
  const st = await page.evaluate(() => { const s = window.__mt.getState(); return { ws: s.workspaces.map((w) => w.key), sess: [...s.sessions.values()].map((x) => ({ id: x.sessionId, name: x.name })) }; });
  const keyOf = (k) => st.ws.find((w) => w.toLowerCase().includes(`mtask-p152-${k}`)) || `x-${k}`;
  const keys = Object.fromEntries([...LETTERS, 'g', 'h', 'i', 'j'].map((k) => [k, LETTERS.includes(k) ? keyOf(k) : `c:/elsewhere/p152-${k}`]));
  const real = (st.sess.find((s) => s.name === 'p152-a') || {}).id || null;
  return { keys, real };
}

async function pc() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=9401', ...AWAKE] });
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sleep(2500);
    const { keys, real } = await keysOf(page);
    log('real a-shell', real);
    await page.evaluate(UNHOOK);
    await page.evaluate(HOOK, [keys, real, false]);
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h }).catch(() => {});
      await sleep(600);
      await openMission(page);
      let p = await page.evaluate(PROBE);
      check(`[${w}] 처음은 맞춤(전체가 보기 칸 안)`, p.cards.every((c) => c.x >= p.vp.x - 2 && c.y >= p.vp.y - 2 && c.x + c.w <= p.vp.x + p.vp.w + 2 && c.y + c.h <= p.vp.y + p.vp.h + 2), { view: p.view, level: p.level });
      check(`[${w}] 카드 28, 영토 3, 섬 10, 무리`, p.cards.length === 28 && p.terrs.length === 3 && p.isles.length === 10 && p.rings.length >= 3, { cards: p.cards.length, terrs: p.terrs.length, isles: p.isles.length, rings: p.rings.length });
      let bad = null; for (let i = 0; i < p.cards.length; i++) for (let j = i + 1; j < p.cards.length; j++) if (!apart(p.cards[i], p.cards[j])) bad = `${p.cards[i].name}×${p.cards[j].name}`;
      check(`[${w}] 카드끼리 겹치지 않는다`, !bad, bad || '');
      for (const motion of ['reduce', 'no-preference']) { await page.emulateMedia({ reducedMotion: motion }); await sleep(500); await shotTo(page, `pc-${w}-fit-${motion}`); }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const l of ['far', 'mid', 'near']) {
        await level(page, l);
        p = await page.evaluate(PROBE);
        check(`[${w}] ${l} 단계 단추 → 단계 ${l}`, p.level === l && p.cls.includes(`lv-${l}`), { level: p.level, cls: p.cls, zoom: p.zoomText });
        await shotTo(page, `pc-${w}-${l}`);
        if (l === 'mid') {
          const shown = p.cards.filter((c) => c.x > p.vp.x && c.y > p.vp.y && c.x + c.w < p.vp.x + p.vp.w && c.y + c.h < p.vp.y + p.vp.h);
          const over = shown.filter((c) => c.overflowBox).map((c) => c.name);
          check(`[${w}] 보통: 카드 사실이 카드 밖으로 넘치지 않는다`, !over.length, over);
          check(`[${w}] 보통: 선 이름표가 보인다`, p.labels > 0, p.labels);
        }
        if (l === 'far') check(`[${w}] 멀리: 선 이름표 숨김`, p.labels === 0, p.labels);
      }
      // 카드 하나 크게(보통 단계): 작업 중 p149, 오류 web-api, 응답 필요 p150, 작업 완료 p151, 잠듦 a-old
      await page.evaluate(() => window.__mtTa.set({ k: 1, x: 0, y: 0 }));
      for (const nm of ['p149', 'web-api', 'p150', 'p151', 'a-old', 'docs-sync']) {
        await page.evaluate((n) => { const L = window.__mtTa.lay(); const id = `s:${n}`; window.__mtTa.flyTo(id, 1); }, nm); await sleep(700);
        const c = (await page.evaluate(PROBE)).cards.find((x) => x.name === nm);
        if (c) { await page.emulateMedia({ reducedMotion: 'no-preference' }); await sleep(300); await shotTo(page, `card-${nm}-${w}`, { x: Math.max(0, c.x - 24), y: Math.max(0, c.y - 24), width: c.w + 48, height: c.h + 48 }); await page.emulateMedia({ reducedMotion: 'reduce' }); }
      }
      if (w === 1584) await interactions(page, real);
    }
    await page.evaluate(UNHOOK);
  } finally { await closeApp(app); }
}

async function interactions(page, real) {
  const vpBox = await page.evaluate(() => { const r = document.querySelector('[data-role=ta-viewport]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.click('[data-action=ta-fit]'); await sleep(700);
  let p = await page.evaluate(PROBE);
  // 카드 사실(보통 단계에서 텍스트로)
  const card = (n) => p.cards.find((x) => x.name === n);
  const c1 = card('p149');
  check('작업 중 카드 풍선 도움말에 역할·하네스·모델·지금 일', c1 && /worker/.test(c1.title) && /Claude Code/.test(c1.title) && /opus 5\.5·high/.test(c1.title) && /Now: Polish the classic/.test(c1.title), c1 && c1.title);
  const ce = card('web-api');
  check('오류 카드에 오류 글', ce && /529 overloaded/.test(ce.title), ce && ce.title);
  check('작업 중 카드 모두 빛 층', p.lights === p.cards.filter((c) => c.tier === 'work').length && p.lights >= 8, { lights: p.lights });
  check('워크스페이스를 넘는 팀 머리 글', p.rings.some((r) => /multitask-1/.test(r.text) && /elsewhere/.test(r.text)), p.rings.map((r) => r.text));
  check('요약 글(폴더·워크스페이스·세션)', /3 folders · 10 workspaces · 28 sessions/.test(p.summary), p.summary);
  check('나를 기다리는 것: 응답 필요·오류만', p.attn.length === 3 && p.attn.every((t) => /p150|i-1|web-api/.test(t)), p.attn);
  // 빈 곳 누르기: 닫히지 않는다
  const empty = { x: vpBox.x + 30, y: vpBox.y + vpBox.h - 200 };
  await page.mouse.click(empty.x, empty.y); await sleep(400);
  check('빈 곳을 눌러도 닫히지 않는다', !!(await page.$('[data-role=mission]')));
  // 끌기
  let v0 = await view(page);
  await page.mouse.move(vpBox.x + 400, vpBox.y + 400); await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(vpBox.x + 400 + i * 10, vpBox.y + 400 + i * 5); await sleep(16); }
  await page.mouse.up(); await sleep(300);
  let v1 = await view(page);
  check('끌기: 시점이 손을 따라 옮겨진다', Math.abs(v1.x - v0.x - 200) < 3 && Math.abs(v1.y - v0.y - 100) < 3 && v1.k === v0.k, { v0, v1 });
  check('끈 뒤에도 열려 있다(끌기가 누르기로 읽히지 않는다)', !!(await page.$('[data-role=mission]')) && !(await page.$('[data-role=ta-inspect]')));
  // 휠: 마우스 아래 세계 점이 그대로
  const mx = vpBox.x + 700, my = vpBox.y + 380;
  v0 = await view(page);
  await page.mouse.move(mx, my); await page.mouse.wheel(0, -300); await sleep(400);
  v1 = await view(page);
  const wx0 = (mx - vpBox.x - v0.x) / v0.k, wx1 = (mx - vpBox.x - v1.x) / v1.k, wy0 = (my - vpBox.y - v0.y) / v0.k, wy1 = (my - vpBox.y - v1.y) / v1.k;
  check('휠: 확대하고 마우스 아래 점이 그대로', v1.k > v0.k && Math.abs(wx0 - wx1) < 1 && Math.abs(wy0 - wy1) < 1, { v0, v1, d: [wx0 - wx1, wy0 - wy1] });
  // 키: + − 0, 화살표
  await page.keyboard.press('0'); await sleep(700);
  const vf = await view(page);
  await page.keyboard.press('+'); await sleep(700);
  const vp2 = await view(page);
  await page.keyboard.press('ArrowLeft'); await sleep(700);
  const va = await view(page);
  check('키 + 확대, ← 끌기, 0 맞춤', vp2.k > vf.k * 1.2 && va.x > vp2.x + 100, { vf, vp2, va });
  await page.keyboard.press('0'); await sleep(700);
  const vf2 = await view(page);
  check('맞춤은 늘 같은 시점', Math.abs(vf2.k - vf.k) < 1e-6 && Math.abs(vf2.x - vf.x) < 1, { vf, vf2 });
  // 나를 기다리는 것: 날아가 고른다
  await page.click('[data-role=ta-attn-item][data-id="s:web-api"]'); await sleep(900);
  p = await page.evaluate(PROBE);
  const t = p.cards.find((x) => x.name === 'web-api');
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  check('나를 기다리는 것 → 그 카드가 가운데, 고름, 보통 단계', Math.abs(cx - (p.vp.x + p.vp.w / 2)) < 40 && !!(await page.$('[data-role=ta-inspect][data-id="s:web-api"]')) && p.level !== 'far', { cx, cy, vp: p.vp, level: p.level });
  await shotTo(page, 'pc-1584-attn-fly');
  const insp = await page.evaluate(() => document.querySelector('[data-role=ta-inspect]').innerText.replace(/\s+/g, ' '));
  check('살펴보기 띠: 경로·역할·하네스·모델·상태·일', /atrium \/ /.test(insp) && /worker/.test(insp) && /Claude Code/.test(insp) && /Error/.test(insp) && /Start the dev server/.test(insp) && /Open on board/.test(insp) && /Message/.test(insp), insp);
  // 카드 누르기: 고르기(닫히지 않는다), 다시 누르면 풂
  await page.evaluate(() => window.__mtTa.flyTo('s:docs', 1)); await sleep(800);
  await page.click('.mt-ta-card[data-id="s:docs"]'); await sleep(400);
  check('카드 누르기 → 살펴보기 띠', !!(await page.$('[data-role=ta-inspect][data-id="s:docs"]')) && !!(await page.$('[data-role=mission]')));
  await shotTo(page, 'pc-1584-select');
  // 키보드로 카드 다니기(↓)
  await page.focus('.mt-ta-card[data-id="s:docs"]'); await page.keyboard.press('ArrowDown'); await sleep(800);
  const foc = await page.evaluate(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.id);
  check('카드에 초점이 있으면 ↓가 다음 카드로', foc && foc !== 's:docs', foc);
  // 빈 곳 누르기 → 고름만 푼다
  await page.mouse.click(vpBox.x + 20, vpBox.y + vpBox.h - 20); await sleep(300);
  check('빈 곳 누르기 → 고름만 풀림, 덮개 그대로', !(await page.$('[data-role=ta-inspect]')) && !!(await page.$('[data-role=mission]')));
  // Message → 명령 바에 @이름
  await page.evaluate(() => window.__mtTa.flyTo('s:docs', 1)); await sleep(700);
  await page.click('.mt-ta-card[data-id="s:docs"]'); await sleep(300);
  await page.click('[data-action=ta-message]'); await sleep(800);
  const cmd = await page.evaluate(() => (document.querySelector('[data-role=command]') || {}).value || '');
  check('Message → 덮개 닫고 명령 바에 @docs', !(await page.$('[data-role=mission]')) && /^@docs /.test(cmd), cmd);
  await page.evaluate(() => { const el = document.querySelector('[data-role=command]'); if (el) { el.blur(); } });
  // Open on board(실제 셸 세션 p152-a = a-shell 카드)
  await openMission(page);
  await page.evaluate(() => window.__mtTa.flyTo('s:a-shell', 1)); await sleep(800);
  await page.click('.mt-ta-card[data-id="s:a-shell"]'); await sleep(300);
  await page.click('[data-action=ta-open]'); await sleep(1500);
  const sel = await page.evaluate(() => { const st = window.__mt.getState(); return { open: st.missionOpen, focus: st.focus || null, sel: st.selected || null }; });
  check('Open on board → 덮개 닫고 그 노드로', !sel.open && !(await page.$('[data-role=mission]')), { sel, real });
  await shotTo(page, 'pc-1584-open-on-board');
  // Esc·M
  await openMission(page);
  await page.keyboard.press('Escape'); await sleep(400);
  const escClosed = !(await page.$('[data-role=mission]'));
  await page.keyboard.press('m'); await sleep(800);
  const mOpen = !!(await page.$('[data-role=mission]'));
  await page.keyboard.press('m'); await sleep(400);
  check('Esc 닫힘, M 열고 닫음', escClosed && mOpen && !(await page.$('[data-role=mission]')), { escClosed, mOpen });
  // 숨은 설정: classic이면 옛 열 지도
  call('settings.set', { key: 'missionStyle', value: 'classic' }); await sleep(1200);
  await page.click('[data-action="mission-rail"]'); await sleep(1500);
  const classic = await page.evaluate(() => ({ terr: !!document.querySelector('.mt-ta'), classic: !!document.querySelector('.mt-mission-body'), filters: document.querySelectorAll('[data-filter]').length }));
  await shotTo(page, 'pc-1584-classic');
  // 옛 지도도 빈 곳을 눌러 닫히지 않는다
  await page.mouse.click(300, 600); await sleep(400);
  const stillClassic = !!(await page.$('[data-role=mission]'));
  await page.keyboard.press('Escape'); await sleep(400);
  call('settings.set', { key: 'missionStyle', value: 'territories' }); await sleep(800);
  check('숨은 설정 missionStyle=classic → 옛 열 지도(빈 곳 눌러도 열린 채), 되돌리면 영토 지도', !classic.terr && classic.classic && classic.filters > 0 && stillClassic, { classic, stillClassic });
}

// ---- 성능: 끌기·휠 프레임(창, 작업 중 빛 켬). 큰 판(세션 120)도 ----
const FRAMES = () => new Promise((res) => { const out = []; let last = performance.now(); const t0 = last; const f = (t) => { out.push(t - last); last = t; if (t - t0 < 2400) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); });
const stat = (a) => { const s = [...a].sort((x, y) => x - y); const q = (p) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10; return { n: a.length, p50: q(0.5), p95: q(0.95), max: Math.round(s[s.length - 1] * 10) / 10, over20: a.filter((x) => x > 20).length }; };
async function perf() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=9401', ...AWAKE] });
  const res = {};
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
    await sleep(2500);
    const { keys, real } = await keysOf(page);
    for (const big of [false, true]) {
      await page.evaluate(UNHOOK); await page.evaluate(HOOK, [keys, real, big]);
      for (const light of ['on', 'off']) {
        call('settings.set', { key: 'workLight', value: light }); await sleep(800);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await openMission(page);
        const vb = await page.evaluate(() => { const r = document.querySelector('[data-role=ta-viewport]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
        for (const lvl of ['far', 'mid']) {
          await level(page, lvl);
          // 끌기 2.4초
          const fr = page.evaluate(FRAMES);
          await page.mouse.move(vb.x + 300, vb.y + 300); await page.mouse.down();
          for (let i = 0; i < 140; i++) { await page.mouse.move(vb.x + 300 + Math.sin(i / 10) * 250, vb.y + 300 + Math.cos(i / 12) * 150); await sleep(14); }
          await page.mouse.up();
          const drag = stat(await fr);
          // 휠 2.4초
          const fw = page.evaluate(FRAMES);
          await page.mouse.move(vb.x + vb.w / 2, vb.y + vb.h / 2);
          for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, i % 20 < 10 ? -40 : 40); await sleep(35); }
          const wheel = stat(await fw);
          const key = `${big ? 'big120' : 'real28'}-${light}-${lvl}`;
          res[key] = { drag, wheel, lights: await page.evaluate(() => document.querySelectorAll('[data-role=ta-light]').length) };
          log(`[perf] ${key} ${JSON.stringify(res[key])}`);
        }
        await page.keyboard.press('Escape'); await sleep(400);
      }
    }
    call('settings.set', { key: 'workLight', value: 'on' });
    for (const [k, v] of Object.entries(res)) check(`[perf] ${k}: 끌기 p95 ≤ 25ms`, v.drag.p95 <= 25, v);
    await page.evaluate(UNHOOK);
  } finally { await closeApp(app); }
  fs.writeFileSync(path.join(OUT, `p152-perf-${TAG}.json`), JSON.stringify(res, null, 2));
}

// ---- 휴대폰(웹, 흉내 프록시로 짝 맺기) ----
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const PHONES = { iphone: { viewport: { width: 393, height: 852 }, screen: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US', userAgent: SAFARI },
  android: { viewport: { width: 412, height: 915 }, screen: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: 'en-US', userAgent: ANDROID } };
const loadedOpen = (pg, ms = 60000) => pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: ms });
async function pair(pg, base) {
  await pg.goto(`${base}/`);
  await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
  await pg.fill('[data-field=pair-code]', call('device.code').code);
  await pg.click('[data-action=pair-submit]');
  await loadedOpen(pg);
  await pg.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 15000 }).catch(() => {});
}
async function startSim() {
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: 47921, name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  return sim;
}
async function phone(engine) {
  const { chromium, webkit } = await import('playwright');
  const sim = await startSim();
  const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch(chromiumOpts());
  const list = engine === 'webkit' ? ['iphone'] : ['iphone', 'android'];
  try {
    for (const dev of list) {
      for (const motion of engine === 'webkit' ? ['no-preference'] : ['reduce', 'no-preference']) {
        const ctx = await browser.newContext({ ...PHONES[dev], reducedMotion: motion });
        const pg = await ctx.newPage();
        pg.on('pageerror', (e) => log(`[${engine}/${dev} pageerror] ${e.message}`));
        await pair(pg, `http://localhost:${SIM}`);
        const { keys, real } = await keysOf(pg);
        await pg.evaluate(HOOK, [keys, real, false]);
        await pg.evaluate(() => window.__mtPhone.mission());
        await pg.waitForSelector('[data-role=pt-tile]', { timeout: 20000 });
        await sleep(1500);
        const tag = `${engine}-${dev}-${motion}`;
        await pg.screenshot({ path: path.join(OUT, `phone-${tag}.png`) });
        const info = await pg.evaluate(() => ({ tiles: document.querySelectorAll('[data-role=pt-tile]').length, terrs: document.querySelectorAll('[data-role=pt-terr]').length, isles: document.querySelectorAll('[data-role=pt-isle]').length, lights: document.querySelectorAll('[data-role=pt-light]').length,
          sheet: [...document.querySelectorAll('[data-role=pt-card]')].map((c) => c.innerText.replace(/\s+/g, ' ').slice(0, 260)), zoom: (document.querySelector('[data-role=pt-zoom]') || {}).innerText, scrollX: document.documentElement.scrollWidth > innerWidth + 1, view: window.__mtPm.view() }));
        log(`[${tag}] ${JSON.stringify(info).slice(0, 900)}`);
        if (motion === (engine === 'webkit' ? 'no-preference' : 'reduce')) {
          check(`[${tag}] 타일 28, 영토 3, 섬 10, 작업 중 타일 빛`, info.tiles === 28 && info.terrs === 3 && info.isles === 10 && info.lights >= 8, info);
          check(`[${tag}] 시트: 응답 필요·오류 카드 셋이 먼저, 사실(역할·하네스·모델·일·오류)`, info.sheet.length >= 3 && /p150|i-1|web-api/.test(info.sheet[0]) && info.sheet.some((s) => /529 overloaded/.test(s)), info.sheet.slice(0, 4));
          check(`[${tag}] 가로 넘침 없음`, !info.scrollX);
          // 작은 타일 누르기 → 그 섬으로 확대
          const v0 = info.view;
          const tile = await pg.$('[data-role=pt-tile][data-id="s:a-shell"]');
          const b = await tile.boundingBox();
          await pg.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await sleep(700);
          const v1 = await pg.evaluate(() => window.__mtPm.view());
          check(`[${tag}] 작은 타일 누르기 → 섬으로 확대(세션을 열지 않음)`, v1.zoom > v0.zoom * 1.3 && !(await pg.$('[data-role=phone][data-view=session]')), { v0, v1 });
          await pg.screenshot({ path: path.join(OUT, `phone-${tag}-isle.png`) });
          // 커진 타일 누르기 → 세션 열기(실제 셸 p152-a)
          const b2 = await (await pg.$('[data-role=pt-tile][data-id="s:a-shell"]')).boundingBox();
          await pg.touchscreen.tap(b2.x + b2.width / 2, b2.y + b2.height / 2); await sleep(1500);
          const opened = await pg.evaluate(() => (document.querySelector('[data-role=phone]') || {}).dataset?.view);
          check(`[${tag}] 커진 타일 누르기 → 세션 화면`, opened === 'session', { opened, w: b2.width });
          await pg.screenshot({ path: path.join(OUT, `phone-${tag}-session.png`) });
          await pg.goBack().catch(() => {}); await sleep(1000);
          // 손가락 끌기
          await pg.evaluate(() => window.__mtPm.fit()); await sleep(300);
          const s0 = await pg.evaluate(() => window.__mtPm.view());
          const cdp = engine === 'webkit' ? null : await ctx.newCDPSession(pg);
          if (cdp) {
            const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
            await T('touchStart', [[200, 250]]); for (let i = 1; i <= 10; i++) { await T('touchMove', [[200 + i * 6, 250 + i * 4]]); await sleep(16); } await T('touchEnd', []);
            await sleep(300);
            const s1 = await pg.evaluate(() => window.__mtPm.view());
            check(`[${tag}] 한 손가락 끌기`, Math.abs(s1.x - s0.x - 60) < 4 && Math.abs(s1.y - s0.y - 40) < 4, { s0, s1 });
            await T('touchStart', [[150, 250], [250, 250]]); for (let i = 1; i <= 10; i++) { await T('touchMove', [[150 - i * 5, 250], [250 + i * 5, 250]]); await sleep(16); } await T('touchEnd', []);
            await sleep(300);
            const s2 = await pg.evaluate(() => window.__mtPm.view());
            check(`[${tag}] 두 손가락 확대`, s2.zoom > s1.zoom * 1.5, { s1, s2 });
          }
          // 시트의 카드 누르기 → 세션(가짜 세션이라 열리지 않으면 목록 그대로: 실제 셸만 확인했다)
        }
        await ctx.close();
      }
    }
  } finally { await browser.close(); await sim.close?.(); }
}

// ---- 시안과 나란히: 시안 Main.dc.html·A-phone.dc.html을 이 시험의 작은 그리기로 펴서 찍고, 앱 그림 옆에 붙인다 ----
async function mock() {
  const { chromium } = await import('playwright');
  const dir = path.join(MAIN, 'experiments', 'mm-concepts', 'project');
  const render = (file, W, H) => {
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    const tpl = html.split('</helmet>')[1].split('</x-dc>')[0];
    const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
    const C = new Function(`class DCLogic { constructor(p){ this.props = p || {}; } setState(o){ this.state = Object.assign({}, this.state, o); } }\n${src}\nreturn Component;`)();
    const c = new C({ light: 'on' });
    const vals = c.renderVals();
    const get = (scope, k) => k.split('.').reduce((o, x) => (o == null ? o : o[x]), scope);
    const fill = (s, scope) => s.replace(/\{\{\s*([\w$.]+)\s*\}\}/g, (_, k) => { const v = get(scope, k); return typeof v === 'function' || v == null ? '' : String(v); });
    // 짝 맞춘 sc-for·sc-if 펴기(안쪽부터)
    const expand = (s, scope) => {
      let out = '', i = 0;
      const re = /<sc-(for|if)\b([^>]*)>/g;
      for (;;) {
        re.lastIndex = i;
        const m = re.exec(s);
        if (!m) { out += fill(s.slice(i), scope); break; }
        out += fill(s.slice(i, m.index), scope);
        const tag = m[1];
        let depth = 1, j = m.index + m[0].length;
        const open = new RegExp(`<sc-${tag}\\b`, 'g'), close = new RegExp(`</sc-${tag}>`, 'g');
        let end = -1;
        while (depth) { open.lastIndex = j; close.lastIndex = j; const o = open.exec(s), c2 = close.exec(s); if (!c2) break; if (o && o.index < c2.index) { depth++; j = o.index + 4; } else { depth--; j = c2.index + c2[0].length; if (!depth) end = c2.index; } }
        const body = s.slice(m.index + m[0].length, end);
        const attr = m[2];
        if (tag === 'for') { const list = get(scope, (attr.match(/list="\{\{\s*([\w$.]+)\s*\}\}"/) || [])[1]) || []; const as = (attr.match(/as="(\w+)"/) || [])[1]; for (const it of list) out += expand(body, { ...scope, [as]: it }); }
        else { const v = get(scope, (attr.match(/value="\{\{\s*([\w$.]+)\s*\}\}"/) || [])[1]); if (v) out += expand(body, scope); }
        i = j;
      }
      return out;
    };
    const body = expand(tpl, vals).replace(/\son[A-Z]\w*="[^"]*"/g, '');
    return `<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body style="margin:0;width:${W}px;height:${H}px">${body}</body></html>`;
  };
  const browser = await chromium.launch(chromiumOpts());
  try {
    const shoot = async (file, W, H, out) => { const pg = await browser.newPage({ viewport: { width: W, height: H } }); await pg.setContent(render(file, W, H)); await sleep(800); await pg.screenshot({ path: path.join(OUT, out) }); await pg.close(); };
    await shoot('Main.dc.html', 1600, 1000, 'mock-A-desktop.png');
    await shoot('A-phone.dc.html', 390, 844, 'mock-A-phone.png');
    const side = async (a, b, out, W, H, lab) => {
      const pg = await browser.newPage({ viewport: { width: W * 2 + 30, height: H + 40 } });
      const uri = (f) => `data:image/png;base64,${fs.readFileSync(path.join(OUT, f)).toString('base64')}`; // setContent 쪽은 file:// 그림을 읽지 못한다
      await pg.setContent(`<body style="margin:0;background:#222;color:#ddd;font:14px sans-serif;display:flex;gap:30px"><div><div>${lab[0]}</div><img src="${uri(a)}" style="width:${W}px"></div><div><div>${lab[1]}</div><img src="${uri(b)}" style="width:${W}px"></div></body>`);
      await sleep(600); await pg.screenshot({ path: path.join(OUT, out), fullPage: true }); await pg.close();
    };
    if (fs.existsSync(path.join(OUT, 'pc-1584-fit-no-preference.png'))) await side('mock-A-desktop.png', 'pc-1584-fit-no-preference.png', 'compare-desktop-fit.png', 1000, 620, ['mockup A (Main.dc.html)', 'app (1584×921, fit)']);
    if (fs.existsSync(path.join(OUT, 'pc-1584-mid.png'))) await side('mock-A-desktop.png', 'pc-1584-mid.png', 'compare-desktop-mid.png', 1000, 620, ['mockup A', 'app (1584×921, mid)']);
    if (fs.existsSync(path.join(OUT, 'phone-chromium-iphone-no-preference.png'))) await side('mock-A-phone.png', 'phone-chromium-iphone-no-preference.png', 'compare-phone.png', 390, 850, ['mockup A-phone', 'app (iPhone)']);
  } finally { await browser.close(); }
}

async function stopBoard() {
  for (const s of sessions().filter((x) => /^p152-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'pc') await pc();
  else if (WHAT === 'perf') await perf();
  else if (WHAT === 'phone') await phone('chromium');
  else if (WHAT === 'webkit') await phone('webkit');
  else if (WHAT === 'mock') await mock();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p152-${WHAT}-${TAG}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
