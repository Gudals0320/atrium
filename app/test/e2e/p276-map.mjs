// P276 창 시험: 세션 맵에서 merger를 head → 하위 갈림 줄기 위에 얹는다(합치는 중·쉬는 merger·실패·head 둘, PC ko·en, 휴대폰). 그림만 찍고 배치를 읽어 확인한다.
// 판: 따로 띄운 개발용 판(atrium-dev-p276, 48026, backend/.dev)만. 창의 원격 디버깅 포트 9507, 휴대폰 흉내 프록시 48226. 한 번에 한 창·브라우저만(메모리).
//   셸 세션 하나(p276-a, 시험 폴더 C:\Workspace\mtask-p276-a)만 실제로 띄운다. 맵은 페이지 안에서 mission.graph·merger.status 답과 워크스페이스·폴더를 흉내로 바꾼다(지어낸 이름).
// 실행: node app/test/e2e/p276-map.mjs <setup|pc|phone|stop> [round]
// 결과는 워크트리의 experiments/p276/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p276', TAG);
const CONVOS = path.join(REPO, 'experiments', 'p276', 'convos');
const DIR = 'C:\\Workspace\\mtask-p276-a';
const BOARD = 'atrium-dev-p276', PORT = '48026', DEBUG = '9507', SIM = 48226;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p276-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger(`p276-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];

// ---- 흉내 모양(지어낸 이름) ----
const W = (k) => ({ key: k, root: k.replace(/\/\.git$/, '') });
const WS = ['d:/w/studio/.git', 'd:/w/lib/.git'];
// [이름, 워크스페이스 번호, 부모, 상태]
const BASE = [
  ['lead', 0, null, 'ready'], ['w-api', 0, 'lead', 'sleeping'], ['w-ui', 0, 'lead', 'working'], ['w-docs', 0, 'lead', 'sleeping'], ['w-test', 0, 'lead', 'working'], ['w-bench', 0, 'lead', 'sleeping'],
  ['notes', 0, null, 'ready'], ['merger-studio', 0, null, 'working'],
];
const TWO = [
  ['lead', 0, null, 'ready'], ['w-api', 0, 'lead', 'sleeping'], ['w-ui', 0, 'lead', 'sleeping'],
  ['lead-2', 0, null, 'ready'], ['w-port', 0, 'lead-2', 'sleeping'], ['w-parse', 0, 'lead-2', 'working'], ['w-fmt', 0, 'lead-2', 'sleeping'],
  ['notes', 0, null, 'ready'], ['merger-studio', 0, null, 'working'],
  ['lib-head', 1, null, 'ready'], ['w-check', 1, 'lib-head', 'sleeping'], ['merger-lib', 1, null, 'ready'],
];
const job = (child, parent, merger, state, at) => ({ unit: 'u-' + child, state, childId: 'fk-' + child, parentId: 'fk-' + parent, mergerId: 'fk-' + merger, child, parent, merger, branch: 'worktree-' + child, target: 'dev', workspace: 'd:/w/studio', createdAt: at });
const MV = (jobs, ms = ['merger-studio']) => ({ mode: 'on', answers: {}, asks: [], mergers: ms.map((m) => ({ key: m, workspace: 'd:/w/studio', target: 'dev', name: m, sessionId: 'fk-' + m, open: true, jobs: 1, jobsMax: 5 })), jobs, jobsMax: 5 });
const T0 = 1e12;
const SCENES = {
  merging: { s: BASE, mv: MV([job('w-ui', 'lead', 'merger-studio', 'merging', T0 + 5), job('w-docs', 'lead', 'merger-studio', 'queued', T0 + 6)]) },
  idle: { s: BASE.map((x) => (x[0] === 'merger-studio' ? [x[0], x[1], x[2], 'sleeping'] : x)), mv: MV([]) },
  failed: { s: BASE.map((x) => (x[0] === 'merger-studio' ? [x[0], x[1], x[2], 'ready'] : x)), mv: MV([job('w-ui', 'lead', 'merger-studio', 'failed', T0 + 7)]) },
  two: { s: TWO, mv: MV([job('w-ui', 'lead', 'merger-studio', 'queued', T0 + 1), job('w-parse', 'lead-2', 'merger-studio', 'merging', T0 + 2), job('w-fmt', 'lead-2', 'merger-studio', 'queued', T0 + 3), job('w-check', 'lib-head', 'merger-lib', 'queued', T0 + 4)], ['merger-studio', 'merger-lib']) },
};
// 페이지 안 흉내: mission.graph·merger.status 답과 판의 워크스페이스·폴더(store)를 바꾸고 다시 읽게 한다
const HOOK = ([ws, sessions, mv]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p276orig) { api.__p276orig = api.call.bind(api); window.__p276st = { workspaces: st.workspaces, groups: st.groups }; }
  const now = Date.now(), at = now - 60e3;
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = [...ws.map((k, i) => ({ key: k, name: nameOf(k.replace(/\/\.git$/, '')), kind: 'repo', root: k.replace(/\/\.git$/, ''), createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p276st.workspaces || [])];
  st.groups = [{ id: 'gd', name: 'studio', members: [...ws] }];
  const nodes = sessions.map(([name, wi, parent, state], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `fk-${name}`, name, agentKind: 'claude', state, category: state === 'working' ? 'working' : 'idle', workspaceKey: ws[wi],
    parentId: parent ? `s:${parent}` : null, lineageParent: parent ? `s:${parent}` : null, peers: [], createdAt: 1e12 + i, model: /^merger/.test(name) ? 'claude-sonnet-5-5' : 'claude-opus-5-5', effort: 'medium', activeAt: at, turnAt: state === 'working' ? at : null,
    gitBranch: /^w-/.test(name) ? 'worktree-' + name : null, lastPrompt: /^merger/.test(name) ? 'Merge @w-ui (worktree-w-ui → dev)' : ['Read the work file and do it', 'Draft the notes', 'Collect the tables'][i % 3] }));
  const edges = sessions.filter((s) => s[2]).map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 2, lastAt: now - 6e5 }));
  api.call = async (m, p) => (m === 'mission.graph' ? { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now } : m === 'merger.status' ? mv : api.__p276orig(m, p));
  api.emit('merger.updated'); api.emit('relation.updated');
};
const UNHOOK = () => { const api = window.__mt.api; if (api.__p276orig) { api.call = api.__p276orig; const st = window.__mt.getState(); st.workspaces = window.__p276st.workspaces; st.groups = window.__p276st.groups; api.emit('merger.updated'); } };
const shotTo = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const BEFORE = TAG === 'before';

async function setupBoard() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(call('session.list').map((s) => s.name));
  if (!have.has('p276-a')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p276-a').slice(0, 160));
  await sleep(2000);
}
async function closeMission(pg) { for (let i = 0; i < 3 && (await pg.$('[data-role="mission"]')); i++) { await pg.keyboard.press('Escape'); await sleep(400); } }
async function openMission(pg) {
  await closeMission(pg);
  await pg.click('[data-action="mission-rail"]');
  await pg.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 });
  await sleep(1500);
}
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }

// 지금 맵 읽기: merger 카드 자리, merger 선, 밝은 가지, 카드를 지나는 선
const READ = (sel) => {
  const L = (sel === 'pm' ? window.__mtPm : window.__mtTa).lay();
  const hit = (pts, b) => { for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; if (Math.max(ax, bx) > b.x + 0.5 && Math.min(ax, bx) < b.x + b.w - 0.5 && Math.max(ay, by) > b.y + 0.5 && Math.min(ay, by) < b.y + b.h - 0.5) return true; } return false; };
  const nm = (id) => (L.cards.get(id) || {}).node?.name || id;
  const mergers = [...L.cards.entries()].filter(([, c]) => c.merger).map(([id, c]) => { const h = c.merger.head && L.cards.get(c.merger.head); return { name: nm(id), head: c.merger.head ? nm(c.merger.head) : null, state: c.merger.state, idle: c.merger.idle, solo: !!c.solo, sameX: !!h && h.x === c.x, above: !!h && c.y + c.h <= h.y && c.y + c.h >= h.y - 80 }; });
  const lines = L.edges.filter((e) => e.merger).map((e) => ({ from: nm(e.from), to: nm(e.to), state: e.state, idle: !!e.idle, n: e.pts.length }));
  const bright = L.edges.filter((e) => e.merging || e.mergeFailed).map((e) => ({ to: nm(e.to), merging: !!e.merging, failed: !!e.mergeFailed }));
  const all = L.edges.filter((e) => [...L.cards.entries()].some(([id, c]) => id !== e.from && id !== e.to && hit(e.pts, c))).map((e) => e.id);
  const cs = [...L.cards.values()]; let overlap = 0;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const a = cs[i], b = cs[j]; if (!(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)) overlap++; }
  const dom = { lines: document.querySelectorAll('.mt-ta-edge.k-merge').length, active: document.querySelectorAll('.mt-ta-edge.k-merge.active').length, failed: document.querySelectorAll('.mt-ta-edge.k-merge.st-failed').length, idle: document.querySelectorAll('.mt-ta-edge.k-merge.idle').length, tags: [...document.querySelectorAll('[data-role=ta-merger-tag]')].map((x) => x.textContent), branch: document.querySelectorAll('.mt-ta-edge.merging').length, branchFailed: document.querySelectorAll('.mt-ta-edge.merge-failed').length };
  return { mergers, lines, bright, all, overlap, dom };
};
const zoomRow = async (page, re, k) => { await page.evaluate(([src, kk]) => { const L = window.__mtTa.lay(), row = L.rows.find((x) => new RegExp(src).test(x.key)); window.__mtTa.set({ k: kk, x: window.__mtTa.rail + 20 - (row.x - 10) * kk, y: window.__mtTa.top + 10 - row.y * kk }); }, [re, k]); await sleep(1100); };
const scene = async (pg, name) => { const sc = SCENES[name]; await pg.evaluate(HOOK, [WS, sc.s, sc.mv]); await sleep(1800); };
function judge(tag, name, r) {
  const m = (n) => r.mergers.find((x) => x.name === n) || {};
  const ok0 = !r.all.length && !r.overlap;
  if (name === 'merging') check(`[${tag}] 합치는 중: lead 위·같은 칸, 흐르는 선, w-ui 가지 밝게, 꼬리표`, ok0 && m('merger-studio').head === 'lead' && m('merger-studio').sameX && m('merger-studio').above && !m('merger-studio').solo && r.dom.active === 1 && r.bright.some((b) => b.to === 'w-ui' && b.merging) && !r.bright.some((b) => b.to === 'w-docs') && r.dom.tags.length === 1, r);
  if (name === 'idle') check(`[${tag}] 쉬는 merger: 마지막 부모(lead) 위에 흐리게`, ok0 && m('merger-studio').head === 'lead' && m('merger-studio').idle && r.dom.idle === 1 && r.dom.active === 0, r);
  if (name === 'failed') check(`[${tag}] 실패: 빨강 선과 실패 가지`, ok0 && m('merger-studio').head === 'lead' && r.dom.failed === 1 && r.dom.branchFailed === 1, r);
  if (name === 'two') check(`[${tag}] head 둘: 일이 많은 lead-2 위, 다른 워크스페이스 merger는 그 head 위`, ok0 && m('merger-studio').head === 'lead-2' && m('merger-lib').head === 'lib-head' && m('merger-lib').sameX && r.dom.lines === 2, r);
}

async function pc() {
  call('settings.set', { key: 'missionStyle', value: 'territories' });
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.evaluate(() => { try { localStorage.removeItem('atrium.merger.lastParent'); } catch {} });
    for (const lang of ['ko', 'en']) {
      call('settings.set', { key: 'language', value: lang }); await sleep(800);
      await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
      await scene(page, 'merging');
      await openMission(page);
      for (const name of ['merging', 'idle', 'failed', 'two']) {
        if (lang === 'en' && name !== 'merging') continue;
        await scene(page, name);
        await page.evaluate(() => window.__mtTa.fit()); await sleep(1000);
        await shotTo(page, `pc-${name}-fit-${lang}`);
        await zoomRow(page, 'studio', 0.62); await shotTo(page, `pc-${name}-${lang}`);
        if (name === 'two') { await zoomRow(page, 'lib', 0.62); await shotTo(page, `pc-${name}-lib-${lang}`); }
        const r = await page.evaluate(READ, 'ta');
        log(`[${lang} ${name}] ${JSON.stringify(r).slice(0, 1800)}`);
        if (!BEFORE) judge(lang, name, r);
      }
      await closeMission(page);
    }
    await page.evaluate(UNHOOK);
  } finally { await closeApp(app); }
}
async function phone() {
  const pw = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  try {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      for (const lang of ['ko', 'en']) {
        call('settings.set', { key: 'language', value: lang });
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: lang === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce' });
        const pg = await ctx.newPage();
        pg.on('pageerror', (e) => log(`[phone pageerror] ${e.message}`));
        await pg.goto(`http://localhost:${SIM}/`);
        await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
        await pg.fill('[data-field=pair-code]', call('device.code').code);
        await pg.click('[data-action=pair-submit]');
        await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
        await sleep(1200);
        await scene(pg, 'merging');
        await pg.evaluate(() => { try { localStorage.removeItem('atrium.phoneMap.view'); } catch {} window.__mtPhone.mission(); });
        await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 }); await sleep(1500);
        await pg.evaluate(() => window.__mtPm.fit()); await sleep(700);
        await pg.screenshot({ path: path.join(OUT, `phone-${lang}.png`) }); log(`그림 phone-${lang}.png`);
        const r = await pg.evaluate(READ, 'pm');
        log(`[phone ${lang}] ${JSON.stringify(r).slice(0, 1800)}`);
        if (!BEFORE) judge('phone ' + lang, 'merging', r);
        if (lang === 'ko') { await scene(pg, 'failed'); await pg.evaluate(() => window.__mtPm.fit()); await sleep(700); await pg.screenshot({ path: path.join(OUT, 'phone-failed-ko.png') }); log('그림 phone-failed-ko.png'); if (!BEFORE) judge('phone ko', 'failed', await pg.evaluate(READ, 'pm')); }
        await ctx.close();
      }
    } finally { await browser.close(); }
  } finally { sim.close && sim.close(); }
}


async function stopBoard() {
  for (const s of call('session.list').filter((x) => /^p276-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'pc') await pc();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p276-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
