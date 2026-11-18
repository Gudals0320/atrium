// P207 창 시험: 휴대폰 세션 맵 탭(오늘 | 이전). 고른 칸만 그리고, 다른 칸의 응답 필요·오류는 탭에 수로, 다른 칸 카드로 가는 알약은 탭을 바꾼 뒤 간다.
// 판: 따로 띄운 개발용 판(atrium-dev-p207, 47979, backend/.dev)만 쓴다. 휴대폰 흉내 프록시 47981. 한 번에 브라우저 하나(메모리).
//   맵은 페이지 안에서 mission.graph 답과 판의 워크스페이스·폴더를 흉내로 바꾼다(P202와 같은 흉내, 이전 칸에 응답 필요·오류 세션을 더함).
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p207-phone-tabs.mjs <setup|phone|stop> [round]
// 결과는 워크트리의 experiments/p207/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p207', TAG);
const CONVOS = path.join(REPO, 'experiments', 'p207', 'convos');
// P210: 다른 워커의 판에서 돌릴 때 P207_BOARD(atrium-dev-<이름>), P207_PORT, P207_SIM으로 덮는다
const BOARD = `atrium-dev-${process.env.P207_BOARD || 'p207'}`, PORT = process.env.P207_PORT || '47979', SIM = Number(process.env.P207_SIM || 47981);
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p207-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger(`p207-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };

// ---- 흉내 모양(지어낸 이름, P202와 같고 이전 칸에 응답 필요 garam-2·오류 c10-c) ----
const W = (k) => ({ key: k, root: k.replace(/\/\.git$/, '') });
const SHAPE = {
  folders: [
    { id: 'gz', name: 'zeta lab', members: ['d:/w/zl-web/.git', 'd:/w/zl-api/.git'] },
    { id: 'gr', name: '연구', members: ['d:/w/res-a/.git'] },
    { id: 'ga', name: 'Alpha', members: ['d:/w/alpha-2/.git', 'd:/w/alpha-10/.git', 'd:/w/alpha-1/.git'] },
    { id: 'g10', name: 'course 10', members: ['d:/w/c10/.git'] },
    { id: 'g2', name: 'Course 2', members: ['d:/w/c2/.git'] },
    { id: 'gk', name: '가람', members: ['d:/w/garam/.git'] },
  ],
  workspaces: ['d:/w/zl-web/.git', 'd:/w/zl-api/.git', 'd:/w/res-a/.git', 'd:/w/alpha-2/.git', 'd:/w/alpha-10/.git', 'd:/w/alpha-1/.git', 'd:/w/c10/.git', 'd:/w/c2/.git', 'd:/w/garam/.git', 'd:/w/old-box'].map(W),
  // [이름, 워크스페이스 번호, 부모, 오늘?, 상태]
  sessions: [
    ['zl-lead', 0, null, 1, 'working'], ['zl-ui', 0, 'zl-lead', 1, 'working'], ['zl-test', 0, 'zl-lead', 0], ['zl-api', 1, null, 0], ['zl-api-2', 1, null, 0],
    ['res-head', 2, null, 1, 'ready'], ['res-read', 2, 'res-head', 0], ['res-notes', 2, 'res-head', 0],
    ['a1-solo', 5, null, 0], ['a2-lead', 3, null, 0], ['a2-kid', 3, 'a2-lead', 0], ['a2-kid2', 3, 'a2-lead', 0], ['a10', 4, null, 0], ['a10-b', 4, null, 0],
    ['c10-lead', 6, null, 0], ['c10-a', 6, 'c10-lead', 0], ['c10-b', 6, 'c10-lead', 0], ['c10-c', 6, 'c10-b', 0, 'error'],
    ['c2-x', 7, null, 0], ['c2-y', 7, null, 0], ['garam-1', 8, null, 0], ['garam-2', 8, 'garam-1', 0, 'waiting'], ['garam-3', 8, 'garam-1', 0], ['garam-4', 8, 'garam-1', 0],
    ['box-1', 9, null, 0], ['zl-helper', 7, 'zl-lead', 0],
  ],
};
const HOOK = ([shape]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p207orig) { api.__p207orig = api.call.bind(api); window.__p207st = { workspaces: st.workspaces, groups: st.groups }; }
  const now = Date.now(), mid = new Date(now); mid.setHours(0, 0, 0, 0);
  const todayAt = Math.max(mid.getTime() + 1000, now - 60e3), oldAt = now - 3 * 86400e3;
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = [...shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: 'repo', root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p207st.workspaces || [])];
  st.groups = shape.folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  const nodes = shape.sessions.map(([name, wi, parent, today, state], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `fk-${name}`, name, agentKind: 'claude', state: state || 'sleeping', category: state === 'working' ? 'working' : 'idle', workspaceKey: shape.workspaces[wi].key,
    parentId: parent ? `s:${parent}` : null, lineageParent: parent ? `s:${parent}` : null, peers: [], createdAt: 1e12 + i, model: 'claude-opus-5-5', effort: 'high', activeAt: today ? todayAt : oldAt, turnAt: state === 'working' ? todayAt : null, lastPrompt: ['Merge the workers', 'Draft the notes', 'Collect the tables', 'Review the parser diff'][i % 4] }));
  const edges = shape.sessions.filter((s) => s[2]).map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 2, lastAt: now - 6e5 }));
  api.call = async (m, p) => (m === 'mission.graph' ? { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now } : api.__p207orig(m, p));
};
const shot = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => log(`그림 ${name}.png`));

// 지금 탭 막대와 맵 읽기
const READ = () => {
  const pm = window.__mtPm, L = pm.lay(), v = pm.view(), s = pm.size();
  const tabs = [...document.querySelectorAll('[data-role=pm-tab]')].map((e) => { const r = e.getBoundingClientRect(); return { tab: e.dataset.tab, on: e.dataset.on === '1', sel: e.getAttribute('aria-selected'), text: e.innerText.replace(/\s+/g, ' ').trim(), attn: (e.querySelector('[data-role=pm-tab-attn]') || {}).innerText || null, x: r.left, y: r.top, w: r.width, h: r.height }; });
  const ws = new Set([...L.cards.values()].map((b) => b.ws));
  const bands = L.bands.map((b) => b.id);
  const secs = document.querySelectorAll('.mt-pmap [data-role=ln-section]').length;
  const pills = [...document.querySelectorAll('[data-role=pl-attn]')].map((e) => e.dataset.id);
  const pillsBox = document.querySelector('[data-role=pl-pills]').getBoundingClientRect();
  return { pick: pm.tab(), info: pm.tabs(), tabs, bands, cards: L.cards.size, ws: [...ws], secs, pills, pillsTop: pillsBox.top, view: v, size: s, scrollX: document.documentElement.scrollWidth > innerWidth + 1 };
};
const inView = ([id]) => { const el = document.querySelector(`.mt-pmap .mt-ta-slot[data-id="${CSS.escape(id)}"]`) || document.querySelector(`.mt-pmap .mt-ta-card[data-id="${CSS.escape(id)}"]`); const vp = document.querySelector('.mt-pmap [data-role=ta-viewport]').getBoundingClientRect(); if (!el) return { found: false }; const r = el.getBoundingClientRect(); return { found: true, inside: r.left >= vp.left - 2 && r.right <= vp.right + 2 && r.top >= vp.top - 2 && r.bottom <= vp.bottom + 2, r: { x: r.left, y: r.top, w: r.width, h: r.height } }; };

async function setupBoard() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
}

async function phone() {
  const pw = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const T = { ko: { today: '오늘', earlier: '이전' }, en: { today: 'Today', earlier: 'Earlier' } };
  try {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      for (const lang of ['ko', 'en']) {
        call('settings.set', { key: 'language', value: lang });
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: lang === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce' });
        const pg = await ctx.newPage();
        const errs = [];
        globalThis.__p207pg = pg;
        pg.on('pageerror', (e) => { errs.push(e.message); log(`[phone pageerror] ${e.message}`); });
        await pg.goto(`http://localhost:${SIM}/`);
        await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
        await pg.fill('[data-field=pair-code]', call('device.code').code);
        await pg.click('[data-action=pair-submit]');
        await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
        await sleep(1200);
        const openMap = async () => {
          if (await pg.$('[data-action=phone-mission-back]')) { await pg.click('[data-action=phone-mission-back]'); await sleep(600); } // 다시 연 페이지가 맵을 바로 열었으면 흉내 전에 닫는다
          await pg.evaluate(HOOK, [SHAPE]);
          await pg.evaluate(() => window.__mtPhone.mission());
          try { await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 }); } catch (e) { await pg.screenshot({ path: path.join(OUT, `error-${lang}.png`) }).catch(() => {}); log(`맵 못 엶: ${(await pg.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => '?')).replace(/\s+/g, ' ')}`); throw e; }
          await sleep(1200);
        };
        await pg.evaluate(() => { try { localStorage.removeItem('atrium.phoneMap.view'); localStorage.removeItem('atrium.phoneMap.tab'); } catch {} });
        await openMap();
        // 1) 기본: 오늘 탭
        let r = await pg.evaluate(READ);
        const tabOf = (x, k) => x.tabs.find((t) => t.tab === k) || {};
        check(`[${lang}] 탭 두 개(오늘 n | 이전 n), 기본은 오늘, 수 = 칸 세션 수`, r.pick === 'today' && r.tabs.length === 2 && tabOf(r, 'today').on && tabOf(r, 'today').sel === 'true' && tabOf(r, 'today').text.startsWith(T[lang].today) && tabOf(r, 'today').text.includes(String(r.info.today.n)) && tabOf(r, 'earlier').text.includes(String(r.info.earlier.n)) && r.info.today.n === 8 && r.info.earlier.n === 18, r);
        check(`[${lang}] 오늘 탭은 오늘 폴더만 그리고 구분 줄이 없다`, JSON.stringify(r.bands) === JSON.stringify(['gz', 'gr']) && r.cards === 8 && r.secs === 0 && !r.scrollX, r);
        check(`[${lang}] 다른 칸(이전) 탭에 응답 필요·오류 수 2, 고른 탭에는 없음`, tabOf(r, 'earlier').attn === '2' && tabOf(r, 'today').attn === null, r.tabs);
        check(`[${lang}] 탭 막대는 알약 줄 위, 화면 안`, r.tabs.every((t) => t.y < r.pillsTop && t.x >= 0 && t.x + t.w <= 390 && t.h >= 36), r.tabs);
        check(`[${lang}] 위 기다리는 세션 알약은 다른 칸 세션도 보인다`, r.pills.includes('s:garam-2') && r.pills.includes('s:c10-c'), r.pills);
        await pg.evaluate(() => window.__mtPm.fit()); await sleep(500);
        await shot(pg, `today-${lang}`);
        const todayView = (await pg.evaluate(READ)).view;
        // 2) 이전 탭 누르기 → 이전 폴더만, 처음이라 맞춤
        await pg.tap('[data-role=pm-tab][data-tab=earlier]'); await sleep(900);
        r = await pg.evaluate(READ);
        const fitE = await pg.evaluate(() => window.__mtPm.fitView());
        check(`[${lang}] 이전 탭: 이전 폴더만, 처음 연 탭은 맞춤`, r.pick === 'earlier' && JSON.stringify(r.bands) === JSON.stringify(['ga', 'g2', 'g10', 'gk', null]) && r.cards === 18 && r.secs === 0 && Math.abs(r.view.k - fitE.k) < 1e-3 && Math.abs(r.view.y - fitE.y) < 1, { r, fitE });
        check(`[${lang}] 이전 탭을 고르면 이전 탭 주의 표시는 사라지고 오늘 탭에는 없음`, tabOf(r, 'earlier').attn === null && tabOf(r, 'today').attn === null, r.tabs);
        await shot(pg, `earlier-${lang}`);
        // 탭마다 시점: 이전 탭에서 옮긴 뒤 오늘 → 오늘의 마지막 시점, 다시 이전 → 옮긴 시점
        await pg.evaluate(() => { const v = window.__mtPm.view(); window.__mtPm.set({ k: 0.8, x: v.x - 40, y: -600 }); }); await sleep(500);
        const eView = (await pg.evaluate(READ)).view;
        await pg.tap('[data-role=pm-tab][data-tab=today]'); await sleep(900);
        r = await pg.evaluate(READ);
        check(`[${lang}] 오늘 탭으로 돌아오면 오늘의 마지막 시점`, r.pick === 'today' && Math.abs(r.view.k - todayView.k) < 1e-3 && Math.abs(r.view.y - todayView.y) < 2, { now: r.view, todayView });
        check(`[${lang}] 오늘 탭에서 이전 탭 주의 표시 다시 보임`, tabOf(r, 'earlier').attn === '2', r.tabs);
        await shot(pg, `attn-badge-${lang}`);
        await pg.tap('[data-role=pm-tab][data-tab=earlier]'); await sleep(900);
        r = await pg.evaluate(READ);
        check(`[${lang}] 이전 탭으로 가면 그 탭의 마지막 시점`, Math.abs(r.view.k - eView.k) < 1e-3 && Math.abs(r.view.y - eView.y) < 2, { now: r.view, eView });
        // 3) 기억: 다시 열면 고른 탭(이전)
        await pg.reload(); await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 }); await sleep(1000);
        await openMap();
        r = await pg.evaluate(READ);
        check(`[${lang}] 다시 열면 기억한 탭(이전)과 그 시점`, r.pick === 'earlier' && Math.abs(r.view.y - eView.y) < 2, { pick: r.pick, view: r.view, eView });
        // 4) 다른 칸 카드로 가기: 오늘 탭으로 바꾼 뒤 알약 garam-2(이전 칸)를 누른다 → 이전 탭으로 바뀌고 그 카드로
        await pg.tap('[data-role=pm-tab][data-tab=today]'); await sleep(900);
        await pg.tap('[data-role=pl-attn][data-id="s:garam-2"]'); await sleep(1300);
        r = await pg.evaluate(READ);
        let iv = await pg.evaluate(inView, ['s:garam-2']);
        const last = await pg.evaluate(() => window.__mtPm.last());
        check(`[${lang}] 알약으로 다른 칸 카드에 가면 탭이 이전으로 바뀌고 그 카드가 화면 안`, r.pick === 'earlier' && last === 's:garam-2' && iv.found && iv.inside, { pick: r.pick, last, iv });
        await shot(pg, `go-other-${lang}`);
        // 반대로: 이전 탭에서 작업 중 알약(오늘 칸 zl-lead·zl-ui) → 오늘 탭
        await pg.tap('[data-role=pl-count][data-tier=work]'); await sleep(1300);
        r = await pg.evaluate(READ);
        const last2 = await pg.evaluate(() => window.__mtPm.last());
        iv = await pg.evaluate(inView, [last2]);
        check(`[${lang}] 작업 중 알약도 다른 칸(오늘) 카드로 탭을 바꿔 간다`, r.pick === 'today' && /^s:zl-(lead|ui)$/.test(last2) && iv.found && iv.inside, { pick: r.pick, last2, iv });
        check(`[${lang}] 페이지 오류 없음`, errs.length === 0, errs);
        await ctx.close();
      }
      // 5) 한 칸뿐이면 탭 없음(모두 이전 = 오늘 활동 없음)
      call('settings.set', { key: 'language', value: 'ko' });
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: 'ko-KR', reducedMotion: 'reduce' });
      const pg = await ctx.newPage();
      await pg.goto(`http://localhost:${SIM}/`);
      await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
      await pg.fill('[data-field=pair-code]', call('device.code').code);
      await pg.click('[data-action=pair-submit]');
      await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
      await sleep(1000);
      const one = { ...SHAPE, sessions: SHAPE.sessions.map((s) => [s[0], s[1], s[2], 0, s[4] === 'working' ? 'ready' : s[4]]) };
      await pg.evaluate(HOOK, [one]);
      await pg.evaluate(() => window.__mtPhone.mission());
      await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 }); await sleep(1200);
      const r = await pg.evaluate(() => ({ tabs: document.querySelectorAll('[data-role=pm-tab]').length, cards: window.__mtPm.lay().cards.size, secs: document.querySelectorAll('.mt-pmap [data-role=ln-section]').length }));
      check('[ko] 한 칸뿐이면 탭이 없고 모든 카드', r.tabs === 0 && r.cards === SHAPE.sessions.length && r.secs === 0, r);
      await shot(pg, 'one-section-ko');
      await ctx.close();
    } finally { await browser.close(); }
  } finally { sim.close && sim.close(); }
}

async function stopBoard() {
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  if (globalThis.__p207pg) await globalThis.__p207pg.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p207-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
