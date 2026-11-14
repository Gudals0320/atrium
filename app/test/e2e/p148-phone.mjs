// P148 창 시험: 휴대폰 미션 맵 "부대" 모양(PhoneSquads.jsx). PC 창은 띄우지 않고 흉내 원격(p59-lib.mjs, ts-sim-proxy.mjs)으로 휴대폰 브라우저를 붙인다.
// - 엔진: WebKit(iPhone 393×852, 화면 배율 3) 한 번, Chromium(Android 412×915, 화면 배율 2.625). 둘 다 세로와 가로로 돌린다.
// - 판: 따로 띄운 개발용 판(atrium-dev-p148, 47918, backend/.dev)만 쓴다. 흉내 원격 47958. 셸 세션 셋(mtask-p148-a·b·c), 폴더 alpha(a, b).
// - 흉내 판: 페이지 안에서 mission.graph 답을 바꾼다(P101·P147 요령). mix = 팀 셋·응답 필요·오류·작업 완료·쉼을 섞은 판(세션 23개 + 실제 셋),
//   big = 세션 37개 + 실제 셋. 실제 셸 세션은 흉내 판 끝에 그대로 넣어 누르면 세션 화면이 열리는지 본다.
// - 그림 앞뒤: before = 판 설정 missionStyle classic(옛 휴대폰 지도), after = 부대.
// 실행(실제 판의 변수를 지운 셸로): sh backend/.dev/clean-env.sh node app/test/e2e/p148-phone.mjs <setup|shot|stop>  (P148_ENGINES=webkit,chromium)
// 결과는 주 체크아웃의 experiments/p148/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'shot';
const ENGINES = (process.env.P148_ENGINES || 'chromium,webkit').split(',').filter(Boolean);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const MAIN = /[\\/]\.claude[\\/]worktrees[\\/]/.test(REPO) ? path.resolve(REPO, '..', '..', '..') : REPO;
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(MAIN, 'experiments', 'p148');
const CONVOS = path.join(OUT, 'convos');
const LETTERS = ['a', 'b', 'c'];
const DIRS = LETTERS.map((k) => `C:\\Workspace\\mtask-p148-${k}`);
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k]; // 실제 판의 값을 물려받지 않는다
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const B0 = L.board({ session: 'atrium-dev-p148', port: 47918, sim: 47958, sim2: 47959 });
const ENV = {
  ATRIUM_TERMINAL_SESSION: B0.session, ATRIUM_HERDR_SESSION: B0.session, ATRIUM_PORT: String(B0.port),
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p148-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: String(B0.port),
  ATRIUM_WEB_HOSTS: `${NAME}:${B0.sim},localhost:${B0.sim}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const { chromium, webkit } = await import('playwright');

const log = logger(`p148-${WHAT}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const sessions = () => call('session.list');
const P = (k) => `p148-${k}`;
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const DEVICES = {
  webkit: { w: 393, h: 852, ctx: { deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ko-KR', userAgent: SAFARI } },
  chromium: { w: 412, h: 915, ctx: { deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: 'en-US', userAgent: ANDROID } },
};

async function setupBoard() {
  for (const d of DIRS) fs.mkdirSync(d, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const st0 = call('settings.get').settings;
  for (const d of call('device.list').devices) call('device.revoke', { id: d.id });
  if (st0.remotePasskey !== false) call('settings.set', { remotePasskey: false });
  if (st0.remoteAccess === false) call('settings.set', { remoteAccess: true });
  const have = new Set(sessions().map((s) => s.name));
  LETTERS.forEach((k, i) => { if (!have.has(P(k))) log(atrium('--json', 'spawn', DIRS[i], '--kind', 'shell', '--name', P(k)).slice(0, 160)); });
  await sleep(3000);
  const gs = call('group.list');
  const list = gs.groups || gs;
  if (!(Array.isArray(list) && list.some((g) => g.name === 'alpha'))) call('group.create', { name: 'alpha', workspaces: [DIRS[0], DIRS[1]] });
  log('groups', JSON.stringify(call('group.list')).slice(0, 400));
}

// ---- 흉내 판(P147과 같은 판 + 실제 셸 세션) ----
const HOOK = ([keys, which, real]) => {
  const api = window.__mt.api;
  if (!api.__p148orig) api.__p148orig = api.call.bind(api);
  const now = Date.now();
  let i = 0;
  const S = (name, w, o = {}) => ({ id: `s:${name}`, kind: 'session', sessionId: `fk-${name}`, name, agentKind: 'claude', state: 'ready', category: 'idle', workspaceKey: keys[w], parentId: null, role: null, order: null, createdAt: 1e12 + ++i, loops: 0, model: 'claude-opus-5-5', effort: 'high', activeAt: now - i * 5e5, turnAt: null, gitBranch: null, ...o });
  const W = { state: 'working', category: 'working' };
  const kid = (name, w, parent, o = {}) => S(name, w, { parentId: `s:${parent}`, role: 'worker', ...o });
  let fake, edges0;
  if (which === 'mix') {
    fake = [
      S('conductor', 'a', { ...W, model: 'claude-fable-5-2', turnAt: now - 5e6, lastPrompt: 'Merge the workers when they report' }),
      kid('ui', 'a', 'conductor', { ...W, turnAt: now - 2e6, gitBranch: 'worktree-ui', lastPrompt: 'Mission map spacing' }),
      kid('reviewer', 'a', 'conductor', { parentId: null, role: 'reviewer', state: 'waiting', category: 'needs_you', ask: 'Run the full test suite before merging?' }),
      kid('ui-tests', 'a', 'ui', { ...W, turnAt: now - 6e5, lastPrompt: 'npm test' }), kid('ui-docs', 'a', 'ui'),
      kid('term', 'c', 'conductor', { ...W, role: 'terminal input', turnAt: now - 9e5, lastPrompt: 'Scroll residue' }),
      S('a-notes', 'a'), S('a-try', 'a', { ...W, turnAt: now - 3e5, lastPrompt: 'Try the new flag' }), S('a-old', 'a', { state: 'sleeping' }),
      S('blog', 'b', { model: 'claude-sonnet-5-5', effort: null, state: null, category: 'done', lastPrompt: 'Draft the release post' }), S('blog-copy', 'b', { state: 'sleeping' }),
      S('notes', 'c', { state: 'sleeping' }), S('notes-2', 'c'),
      S('api-lead', 'e'), kid('api-w1', 'e', 'api-lead', { ...W, turnAt: now - 4e5, lastPrompt: 'npm test' }), kid('api-w2', 'e', 'api-lead', { state: 'error', category: 'needs_you' }), kid('api-w3', 'e', 'api-lead', { parentId: null }),
      S('site', 'f', { ...W, turnAt: now - 2e5, lastPrompt: 'Deploy preview', agentKind: 'codex', model: 'gpt-5.5', effort: 'medium' }), kid('site-docs', 'f', 'site', { role: 'docs' }),
      S('scratch', 'g', { agentKind: 'shell', model: null }), S('dotfiles', 'g', { state: 'sleeping' }), S('sandbox', 'g'), S('tmp', 'g', { state: 'exited', category: 'exited' })];
    edges0 = [{ from: 's:conductor', to: 's:ui', kind: 'spawn' }, { from: 's:conductor', to: 's:reviewer', kind: 'role', label: 'reviewer' }, { from: 's:conductor', to: 's:term', kind: 'spawn' },
      { from: 's:ui', to: 's:ui-tests', kind: 'spawn' }, { from: 's:ui', to: 's:ui-docs', kind: 'spawn' },
      { from: 'human', to: 's:conductor', kind: 'bar', count: 4, label: 'Ship the mission map' },
      { from: 's:api-lead', to: 's:api-w1', kind: 'spawn' }, { from: 's:api-lead', to: 's:api-w2', kind: 'spawn' }, { from: 's:api-lead', to: 's:api-w3', kind: 'prompt', label: 'look at the logs', count: 1 }, { from: 's:site', to: 's:site-docs', kind: 'spawn' },
      { from: 's:api-w1', to: 's:site-docs', kind: 'prompt', label: 'update the api docs', count: 2, lastAt: now - 6e5 }];
  } else {
    fake = [
      S('lead', 'a', { ...W, model: 'claude-fable-5-2', turnAt: now - 6e6, lastPrompt: 'Run the release' }),
      ...['w1', 'w2', 'w3', 'w4', 'w5'].map((n, j) => kid(n, 'a', 'lead', j % 2 ? { ...W, turnAt: now - j * 1e5, lastPrompt: `Task ${n}` } : {})), kid('w1-sub', 'a', 'w1', { ...W, lastPrompt: 'sub task' }),
      S('a-s1', 'a'), S('a-s2', 'a', { state: 'sleeping' }), S('a-s3', 'a', { ...W, lastPrompt: 'Watch the build' }),
      S('web', 'b', W), kid('web-1', 'b', 'web'), kid('web-2', 'b', 'web', { state: 'waiting', category: 'needs_you', ask: 'Allow npm install?' }),
      S('c-1', 'c'), S('c-2', 'c', { state: null, category: 'done' }),
      S('bot', 'd'), kid('bot-1', 'd', 'bot', W), kid('bot-2', 'd', 'bot'), kid('bot-3', 'd', 'bot', { state: 'error' }),
      S('ops', 'e', W), kid('ops-1', 'e', 'ops'),
      S('infra', 'h', W), kid('infra-1', 'h', 'infra', W), kid('infra-2', 'h', 'infra', { state: 'sleeping' }),
      ...Array.from({ length: 8 }, (_, j) => S(`lab-${j}`, 'f', j === 2 ? { ...W, lastPrompt: 'experiment' } : j % 3 ? {} : { state: 'sleeping' })),
      ...Array.from({ length: 3 }, (_, j) => S(`misc-${j}`, 'g')), S('i-1', 'i'), S('j-1', 'j', { agentKind: 'shell', model: null })];
    edges0 = [];
    for (const n of fake) if (n.parentId) edges0.push({ from: n.parentId, to: n.id, kind: 'spawn' });
    edges0.push({ from: 'human', to: 's:lead', kind: 'bar', count: 5 }, { from: 's:w2', to: 's:bot-1', kind: 'prompt', label: 'check the bot', count: 1, lastAt: now - 1e5 });
  }
  // 실제 셸 세션(누르면 세션 화면): 그 워크스페이스 판에 혼자인 줄로
  for (const r of real) fake.push({ id: `s:${r.name}`, kind: 'session', sessionId: r.sessionId, name: r.name, agentKind: 'shell', state: 'ready', category: 'idle', workspaceKey: r.ws, parentId: null, role: null, order: null, createdAt: 2e12 + ++i, loops: 0, model: null, effort: null, activeAt: now, turnAt: null, gitBranch: null });
  api.call = async (m, p) => {
    if (m !== 'mission.graph') return api.__p148orig(m, p);
    const nodes = [{ id: 'human', kind: 'human', name: 'you' }, ...fake];
    return { nodes, edges: edges0, counts: { all: nodes.length - 1 }, at: now };
  };
};

// ---- 지도 읽기 ----
const PROBE = () => {
  const m = document.querySelector('[data-role=phone-mission]');
  if (!m) return null;
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const sc = m.querySelector('[data-role=pm-stage]');
  const rows = [...m.querySelectorAll('[data-role=sq-row]')].map((n) => ({ name: n.dataset.name, kind: n.dataset.kind, tier: n.dataset.tier, fdim: n.classList.contains('fdim'), ...R(n) }));
  const wss = [...m.querySelectorAll('[data-role=sq-ws]')].map((p) => ({ key: p.dataset.key, inf: p.classList.contains('inf'), shut: p.classList.contains('shut'), ...R(p) }));
  const folders = [...m.querySelectorAll('[data-role=sq-folder]')].map((f) => R(f));
  const dock = [...m.querySelectorAll('[data-role=sq-dock-item]')].map((d) => ({ name: d.dataset.name, tier: d.dataset.tier, ...R(d) }));
  const heads = [...m.querySelectorAll('[data-role=sq-ws-head]')].map(R);
  const canvas = m.querySelector('[data-role=pm-world]');
  return {
    style: m.dataset.style || 'classic', vw: innerWidth, vh: innerHeight, page: { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight },
    stage: sc ? { ...R(sc), sw: sc.scrollWidth, cw: sc.clientWidth, sh: sc.scrollHeight, top: sc.scrollTop } : null, canvas: canvas ? R(canvas) : null,
    rows, wss, folders, dock, heads, guides: m.querySelectorAll('[data-role=sq-guide]').length, cross: m.querySelectorAll('[data-role=sq-cross]').length,
    calm: !!m.querySelector('[data-role=sq-dock-none]'), webgl: document.querySelectorAll('canvas').length, crash: window.__mt && window.__mt.crash ? window.__mt.crash() : null,
  };
};
const hit = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
const shot = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const loadedOpen = (pg, ms = 60000) => pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: ms });
const splashGone = (pg) => pg.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 15000 }).catch(() => {});
const view = (pg) => pg.evaluate(() => (document.querySelector('[data-role=phone]') || { dataset: {} }).dataset.view || null);

function judge(tag, p) {
  check(`[${tag}] 부대 모양`, p.style === 'squads', p.style);
  let bad = null;
  const solid = p.rows.filter((r) => r.kind !== 'pill');
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) if (hit(solid[i], solid[j])) bad = `${solid[i].name}×${solid[j].name}`;
  const pills = p.rows.filter((r) => r.kind === 'pill');
  for (let i = 0; i < pills.length; i++) for (let j = i + 1; j < pills.length; j++) if (hit(pills[i], pills[j])) bad = `${pills[i].name}×${pills[j].name}`;
  check(`[${tag}] 줄끼리 겹치지 않는다`, !bad, bad || '');
  const xs = new Set(p.wss.filter((w) => !w.inf).map((w) => w.x)), wsOne = p.wss.every((w, i) => i === 0 || w.y > p.wss[i - 1].y);
  check(`[${tag}] 한 열(워크스페이스 판이 위 → 아래로 한 줄)`, wsOne && xs.size <= 1, { xs: [...xs], n: p.wss.length });
  check(`[${tag}] 가로 스크롤 없음(페이지·지도 칸)`, p.page.sw <= p.vw + 1 && p.stage.sw <= p.stage.cw + 1 && p.rows.every((r) => r.x >= -1 && r.x + r.w <= p.vw + 1), { page: p.page.sw, vw: p.vw, stage: [p.stage.sw, p.stage.cw] });
  const small = p.rows.filter((r) => r.h < (r.kind === 'pill' ? 36 : 44) - 0.5);
  check(`[${tag}] 손가락 크기(줄 44px, 알약 36px, 워크스페이스 머리 36px 이상)`, small.length === 0 && p.heads.every((h) => h.h >= 36), small.slice(0, 3));
  check(`[${tag}] WebGL·캔버스 없음, 죽음 기록 없음`, p.webgl === 0 && !(p.crash && p.crash.count), { canvas: p.webgl, crash: p.crash });
}

async function engineRun(engine, base) {
  const D = DEVICES[engine];
  const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, ...(chromeExe() ? { executablePath: chromeExe() } : { channel: 'chromium' }) });
  try {
    const ctx = await browser.newContext({ viewport: { width: D.w, height: D.h }, screen: { width: D.w, height: D.h }, ...D.ctx });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => check(`[${engine}] 페이지 오류 없음`, false, e.message));
    await pg.goto(`${base}/`);
    await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
    await pg.fill('[data-field=pair-code]', call('device.code').code);
    await pg.click('[data-action=pair-submit]');
    await loadedOpen(pg); await splashGone(pg); await sleep(2000);
    await pg.emulateMedia({ reducedMotion: 'reduce' });
    const st = await pg.evaluate(() => { const s = window.__mt.getState(); return { ws: s.workspaces.map((w) => w.key), ss: [...s.sessions.values()].map((x) => ({ name: x.name, sessionId: x.sessionId, ws: x.workspaceKey || x.cwd })) }; });
    const keyOf = (k) => st.ws.find((w) => w.toLowerCase().includes(`mtask-p148-${k}`)) || `x-${k}`;
    const keys = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((k) => [k, LETTERS.includes(k) ? keyOf(k) : `c:/elsewhere/p148-${k}`]));
    const real = LETTERS.map((k) => { const s = st.ss.find((x) => x.name === P(k)); return s ? { name: s.name, sessionId: s.sessionId, ws: keyOf(k) } : null; }).filter(Boolean);
    log(`[${engine}] 실제 세션 ${real.map((r) => r.name).join(', ')}`);
    const reopen = async () => {
      if ((await view(pg)) === 'mission') { await pg.tap('[data-action=phone-mission-back]'); await sleep(500); }
      await pg.tap('[data-action=phone-mission]');
      await pg.waitForSelector('[data-role=phone-mission] [data-role=sq-row], [data-role=phone-mission] [data-role=pm-node]', { timeout: 20000 });
      await sleep(1500);
    };
    const style = async (v) => { call('settings.set', { key: 'missionStyle', value: v }); await pg.waitForFunction((x) => (window.__mt.getState().settings || {}).missionStyle === x, v, { timeout: 10000 }); await sleep(800); };
    const orient = async (land) => { await pg.setViewportSize(land ? { width: D.h, height: D.w } : { width: D.w, height: D.h }); await sleep(900); };
    const boards = engine === 'webkit' ? ['mix'] : ['mix', 'big'];
    for (const which of boards) {
      await pg.evaluate(HOOK, [keys, which, real]);
      for (const land of [false, true]) {
        await orient(land);
        const tag = `${engine}-${which}-${land ? 'land' : 'port'}`;
        // 앞(옛 휴대폰 지도) → 뒤(부대)
        await style('classic'); await reopen();
        await shot(pg, `${tag}-before`);
        const old = await pg.evaluate(() => ({ nodes: document.querySelectorAll('[data-role=pm-node]').length, sq: document.querySelectorAll('[data-role=sq-row]').length, sw: !!document.querySelector('.mt-pm-switch [data-role=sq-style]') }));
        check(`[${tag}] classic이면 옛 휴대폰 지도(모양 단추 있음)`, old.nodes > 0 && old.sq === 0 && old.sw, old);
        await style('squads'); await reopen();
        await shot(pg, `${tag}-after`);
        const p = await pg.evaluate(PROBE);
        judge(tag, p);
        if (which === 'mix') {
          check(`[${tag}] 기다리는 일: 응답 필요 → 오류 → 작업 완료`, p.dock.map((d) => d.tier).join(',') === 'turn,alert,review' && p.dock[0].name === 'reviewer', p.dock.map((d) => `${d.name}:${d.tier}`));
          check(`[${tag}] 기다리는 일이 지도보다 위`, p.dock.every((d) => d.y < Math.min(...p.rows.map((r) => r.y))), null);
          check(`[${tag}] 나무 선·다른 워크스페이스 ↗ 칩`, p.guides >= 5 && p.cross >= 1, { guides: p.guides, cross: p.cross });
          const cond = p.rows.find((r) => r.name === 'conductor'), ui = p.rows.find((r) => r.name === 'ui'), uit = p.rows.find((r) => r.name === 'ui-tests');
          check(`[${tag}] 팀 나무: 하위는 리드 아래, 손자는 한 단 더 들여쓰기`, cond && ui && uit && ui.y > cond.y && uit.x > ui.x && uit.y > ui.y, { cond, ui, uit });
        }
        if (which === 'big' && !land) {
          const n = p.rows.length;
          check(`[${tag}] 큰 판(세션 ${n}개)도 그린다`, n >= 38, n);
          const t0 = Date.now();
          for (let k = 0; k < 6; k++) { await pg.evaluate(() => { const s = document.querySelector('[data-role=pm-stage]'); s.scrollTop += 600; }); await sleep(120); }
          const p2 = await pg.evaluate(PROBE);
          check(`[${tag}] 세로 스크롤(지도 칸)이 내려간다`, p2.stage.top > 600, { top: p2.stage.top, sh: p2.stage.sh, ms: Date.now() - t0 });
          await shot(pg, `${tag}-scrolled`);
        }
      }
      await orient(false);
      if (which === 'mix') {
        // 거르기: 응답 필요만 또렷
        await pg.tap('[data-filter=needs_you]'); await sleep(400);
        let p = await pg.evaluate(PROBE);
        const f = (nm) => (p.rows.find((r) => r.name === nm) || {}).fdim;
        check(`[${engine}] 거르기(응답 필요)는 나머지를 흐리게만`, f('reviewer') === false && f('api-w2') === false && f('ui') === true, { rev: f('reviewer'), err: f('api-w2'), ui: f('ui') });
        await shot(pg, `${engine}-mix-filter-needs`);
        await pg.tap('[data-filter=needs_you]'); await sleep(300);
        p = await pg.evaluate(PROBE);
        check(`[${engine}] 다시 누르면 거르기를 푼다`, p.rows.every((r) => !r.fdim));
        // 접기
        const h0 = (await pg.evaluate(PROBE)).stage.sh;
        await pg.tap('[data-role=sq-ws-head]'); await sleep(400);
        p = await pg.evaluate(PROBE);
        check(`[${engine}] 워크스페이스 머리를 누르면 접힌다`, p.wss[0].shut && p.stage.sh < h0, { shut: p.wss[0].shut, h0, h1: p.stage.sh });
        await shot(pg, `${engine}-mix-folded`);
        await pg.tap('[data-role=sq-ws-head]'); await sleep(400);
        // 기다리는 일 카드를 누르면(흉내 세션이라 세션이 없다) 목록으로 가지 않고 지도에 남는다(죽지 않는다)
      }
      // 누르면 그 세션으로, 돌아오면 같은 스크롤 자리
      if (real.length) {
        // 줄을 화면 아래쪽으로 데려온 뒤의 자리를 잰다(누르기 전에 Playwright가 다시 스크롤하지 않게)
        const sel = `[data-role=sq-row][data-name="${real[real.length - 1].name}"]`;
        await pg.waitForSelector(sel, { timeout: 5000 });
        await pg.evaluate((q) => document.querySelector(q).scrollIntoView({ block: 'end' }), sel);
        await sleep(400);
        const top0 = await pg.evaluate(() => document.querySelector('[data-role=pm-stage]').scrollTop);
        await pg.tap(sel); await sleep(1500);
        const v1 = await view(pg);
        const head = await pg.evaluate(() => (document.querySelector('.mt-ph-shead b, .mt-ph-shead .mt-ph-title') || {}).textContent || null);
        check(`[${engine}-${which}] 줄을 누르면 그 세션 화면`, v1 === 'session', { v1, head });
        await shot(pg, `${engine}-${which}-session`);
        await pg.goBack();
        const trace = [];
        for (let k = 0; k < 8; k++) { trace.push(await pg.evaluate(() => { const s = document.querySelector('[data-role=pm-stage]'); return s ? `${s.scrollTop}/${s.scrollHeight}/${s.clientHeight}/${document.querySelectorAll('[data-role=sq-row]').length}` : '-'; })); await sleep(200); }
        log(`[${engine}-${which}] 돌아온 뒤 스크롤 ${trace.join(' ')}`);
        const back = await pg.evaluate(() => ({ v: (document.querySelector('[data-role=phone]') || { dataset: {} }).dataset.view, top: (document.querySelector('[data-role=pm-stage]') || {}).scrollTop }));
        check(`[${engine}-${which}] 뒤로 가면 지도, 같은 스크롤 자리`, back.v === 'mission' && Math.abs(back.top - top0) <= 2, { top0, ...back });
      }
    }
    // 실제 판(흉내 없음): 기다리는 일 없음 한 줄. 모양 단추로 옛 지도 ↔ 부대(판 설정에 남는다)
    await pg.evaluate(() => { const api = window.__mt.api; if (api.__p148orig) api.call = api.__p148orig; });
    await reopen();
    const pr = await pg.evaluate(PROBE);
    judge(`${engine}-real`, pr);
    check(`[${engine}-real] 기다리는 일이 없으면 한 줄`, pr.calm);
    await shot(pg, `${engine}-real`);
    await pg.tap('.mt-psq-foot [data-style=classic]'); await sleep(1500);
    const s1 = (call('settings.get').settings || {}).missionStyle;
    const c1 = await pg.evaluate(() => document.querySelectorAll('[data-role=pm-node]').length);
    check(`[${engine}] 바닥의 모양 단추로 옛 지도, 판 설정에 남는다`, s1 === 'classic' && c1 > 0, { s1, c1 });
    await pg.tap('.mt-pm-switch [data-style=squads]'); await sleep(1500);
    const s2 = (call('settings.get').settings || {}).missionStyle;
    check(`[${engine}] 옛 지도의 모양 단추로 다시 부대`, s2 === 'squads' && (await pg.evaluate(() => document.querySelectorAll('[data-role=sq-row]').length)) > 0, s2);
    // 목록으로 돌아가는 길(P87)
    await pg.tap('[data-action=phone-mission-back]'); await sleep(800);
    check(`[${engine}] 뒤로 단추는 세션 목록`, (await view(pg)) === 'list');
    await ctx.close();
  } finally { await browser.close().catch(() => {}); }
}
const chromeExe = () => { const d = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'); try { return fs.readdirSync(d).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(d, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } };

async function stopBoard() {
  for (const s of sessions().filter((x) => /^p148-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

let sim = null;
try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'stop') await stopBoard();
  else {
    const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
    sim = startTsSim({ listen: B0.sim, target: B0.port, name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
    await sim.ready;
    for (const e of ENGINES) { try { await engineRun(e, `http://localhost:${B0.sim}`); } catch (err) { check(`[${e}] 끝까지 돌았다`, false, err.stack || err.message); } }
  }
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  if (sim) await sim.close().catch(() => {});
  fs.writeFileSync(path.join(OUT, `p148-${WHAT}-${ENGINES.join('+')}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
