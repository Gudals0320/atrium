// P280 창 시험: 휴대폰 세션 맵 두 열(오늘 | 이전, 탭 없음)과 휴대폰 입력 칸의 짧은 고정 안내 글.
// 판: 따로 띄운 개발용 판(atrium-dev-p280, 48030, backend/.dev)만 쓴다. 휴대폰 흉내 프록시 48031. 한 번에 브라우저 하나(메모리).
//   맵은 페이지 안에서 mission.graph 답과 판의 워크스페이스·폴더를 흉내로 바꾼다(P207과 같은 흉내). 입력 칸은 셸 하나를 띄우고 창 안에서만 Claude Code로 흉내(session.updated).
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p280-phone.mjs <setup|phone|stop> [round]
// 결과는 워크트리의 experiments/p280/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p280', TAG);
const CONVOS = 'C:\\Workspace\\mtask-p280-projects';
const F = 'C:\\Workspace\\mtask-p280-a';
const BOARD = `atrium-dev-${process.env.P280_BOARD || 'p280'}`, PORT = process.env.P280_PORT || '48030', SIM = Number(process.env.P280_SIM || 48031);
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p280-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger(`p280-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const LIVE = 'atrium-head';

// ---- 흉내 모양(지어낸 이름, P202와 같고 이전 칸에 응답 필요 garam-2·오류 c10-c) ----
const WK = (k) => ({ key: k, root: k.replace(/\/\.git$/, '') });
const SHAPE = {
  folders: [
    { id: 'gz', name: 'zeta lab', members: ['d:/w/zl-web/.git', 'd:/w/zl-api/.git'] },
    { id: 'gr', name: '연구', members: ['d:/w/res-a/.git'] },
    { id: 'ga', name: 'Alpha', members: ['d:/w/alpha-2/.git', 'd:/w/alpha-10/.git', 'd:/w/alpha-1/.git'] },
    { id: 'g10', name: 'course 10', members: ['d:/w/c10/.git'] },
    { id: 'g2', name: 'Course 2', members: ['d:/w/c2/.git'] },
    { id: 'gk', name: '가람', members: ['d:/w/garam/.git'] },
  ],
  workspaces: ['d:/w/zl-web/.git', 'd:/w/zl-api/.git', 'd:/w/res-a/.git', 'd:/w/alpha-2/.git', 'd:/w/alpha-10/.git', 'd:/w/alpha-1/.git', 'd:/w/c10/.git', 'd:/w/c2/.git', 'd:/w/garam/.git', 'd:/w/old-box'].map(WK),
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
  if (!api.__p280orig) { api.__p280orig = api.call.bind(api); window.__p280st = { workspaces: st.workspaces, groups: st.groups }; }
  const now = Date.now(), mid = new Date(now); mid.setHours(0, 0, 0, 0);
  const todayAt = Math.max(mid.getTime() + 1000, now - 60e3), oldAt = now - 3 * 86400e3;
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = [...shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: 'repo', root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p280st.workspaces || [])];
  st.groups = shape.folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  const nodes = shape.sessions.map(([name, wi, parent, today, state], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `fk-${name}`, name, agentKind: 'claude', state: state || 'sleeping', category: state === 'working' ? 'working' : 'idle', workspaceKey: shape.workspaces[wi].key,
    parentId: parent ? `s:${parent}` : null, lineageParent: parent ? `s:${parent}` : null, peers: [], createdAt: 1e12 + i, model: 'claude-opus-5-5', effort: 'high', activeAt: today ? todayAt : oldAt, turnAt: state === 'working' ? todayAt : null, lastPrompt: ['Merge the workers', 'Draft the notes', 'Collect the tables', 'Review the parser diff'][i % 4] }));
  const edges = shape.sessions.filter((s) => s[2]).map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 2, lastAt: now - 6e5 }));
  api.call = async (m, p) => (m === 'mission.graph' ? { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now } : api.__p280orig(m, p));
};

const shot = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => log(`그림 ${name}.png`));
// 셸을 일하는 중인 Claude Code로 흉내(스티어링 단추가 보이게)
const FAKE = () => { for (const s of window.__mt.getState().sessions.values()) window.__mt.api.emit('session.updated', { ...s, kind: 'claude', hooked: true, state: 'working' }); };

// 맵 읽기: 두 열, 열 머리 자리(화면), 보기
const READ = () => {
  const pm = window.__mtPm, L = pm.lay(), v = pm.view(), s = pm.size();
  const vp = document.querySelector('.mt-pmap [data-role=ta-viewport]').getBoundingClientRect();
  const sec = (k) => { const e = document.querySelector(`.mt-pmap [data-role=ln-section][data-kind=${k}]`); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left - vp.left, y: r.top - vp.top, w: r.width, h: r.height, text: e.innerText.trim() }; };
  const ex = [...L.cards.values()].filter((c) => c.x >= L.colDx);
  const eLeft = ex.length ? Math.min(...ex.map((c) => c.x)) * v.k + v.x : null;
  const tx = [...L.cards.values()].filter((c) => c.x < L.colDx);
  const tRight = tx.length ? Math.max(...tx.map((c) => c.x + c.w)) * v.k + v.x : null;
  return { ncol: L.ncol, cards: L.cards.size, tabs: document.querySelectorAll('[data-role=pm-tab], .mt-pmap-tabs').length, today: sec('today'), earlier: sec('earlier'), eLeft, tRight, view: v, size: s, vpw: vp.width, scrollX: document.documentElement.scrollWidth > innerWidth + 1, pills: [...document.querySelectorAll('[data-role=pl-attn]')].map((e) => e.dataset.id) };
};
const inView = ([id]) => { const el = document.querySelector(`.mt-pmap .mt-ta-card[data-id="${CSS.escape(id)}"]`); const vp = document.querySelector('.mt-pmap [data-role=ta-viewport]').getBoundingClientRect(); if (!el) return { found: false }; const r = el.getBoundingClientRect(); return { found: true, inside: r.left >= vp.left - 2 && r.right <= vp.right + 2 && r.top >= vp.top - 2 && r.bottom <= vp.bottom + 2 }; };
// 입력 칸 안내 글이 한 줄에 드는가(글 폭 ≤ 칸 안 폭)
const PH = ([sel]) => {
  const ta = document.querySelector(sel); if (!ta) return null;
  const cs = getComputedStyle(ta), c = document.createElement('canvas').getContext('2d');
  c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const inner = ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const w = c.measureText(ta.placeholder).width;
  return { text: ta.placeholder, w: Math.round(w), inner: Math.round(inner), one: w <= inner, h: ta.getBoundingClientRect().height };
};

async function setupBoard() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
  for (const s of call('session.list')) { try { atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log('옛 세션 끄기 실패', e.message.slice(0, 120)); } }
  fs.mkdirSync(F, { recursive: true }); fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p280-a\n');
  call('workspace.open', { path: F, select: true });
  const r = call('session.spawn', { cwd: F, kind: 'shell', name: LIVE }); log('띄움', r.sessionId);
  await until(() => call('session.list').some((x) => x.name === LIVE && /shell_/.test(x.state)), 60000, 1500).catch(() => log('셸 준비 기다림 넘김'));
  check('장면: 셸 하나', call('session.list').length === 1);
}

async function pair(pg) {
  await pg.goto(`http://localhost:${SIM}/`);
  await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
  await pg.fill('[data-field=pair-code]', call('device.code').code);
  await pg.click('[data-action=pair-submit]');
  await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
  await sleep(1200);
}

async function phone() {
  const pw = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const T = { ko: { today: '오늘', earlier: '이전', msg: '메시지', steer: '지금 일에 넣기' }, en: { today: 'Today', earlier: 'Earlier', msg: 'Message', steer: 'Into this turn' } };
  const sid = call('session.list').find((x) => x.name === LIVE).sessionId;
  try {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      for (const lang of ['ko', 'en']) for (const [w, h] of [[390, 844], [320, 640]]) {
        call('settings.set', { key: 'language', value: lang });
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: lang === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce' });
        const pg = await ctx.newPage();
        const errs = [];
        globalThis.__p280pg = pg;
        pg.on('pageerror', (e) => { errs.push(e.message); log(`[phone pageerror] ${e.message}`); });
        await pair(pg);
        const tag = `${lang}-${w}`;
        // 1) 세션 화면 입력 칸: 빈 칸(보통), 스티어링 켬
        await pg.evaluate(FAKE); await sleep(300);
        await pg.evaluate((id) => window.__mtPhone.open(id), sid);
        await pg.waitForSelector('[data-field=phone-text]', { timeout: 20000 }); await sleep(900);
        await pg.evaluate(FAKE); await sleep(400);
        let p = await pg.evaluate(PH, ['[data-field=phone-text]']);
        check(`[${tag}] 입력 칸 안내 글 = 짧은 고정 글(이름 없음), 한 줄`, p && p.text === T[lang].msg && !p.text.includes(LIVE) && p.one, p);
        await shot(pg, `input-${tag}`);
        await pg.click('[data-action=phone-steer]'); await sleep(400);
        p = await pg.evaluate(PH, ['[data-field=phone-text]']);
        check(`[${tag}] 스티어링 켬 안내 글 = 짧은 고정 글, 한 줄`, p && p.text === T[lang].steer && p.one, p);
        await shot(pg, `input-steer-${tag}`);
        await pg.click('[data-action=phone-steer]'); await sleep(200);
        // 2) 세션 맵: 처음 보기(맞춤), 오른쪽으로 끈 뒤, 맞추기 뒤
        await pg.evaluate(() => { try { localStorage.removeItem('atrium.phoneMap.view'); } catch {} });
        await pg.click('[data-action=phone-back]'); await sleep(600);
        await pg.evaluate(HOOK, [SHAPE]);
        await pg.evaluate(() => window.__mtPhone.mission());
        await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 }); await sleep(1400);
        let r = await pg.evaluate(READ);
        const fitV = await pg.evaluate(() => window.__mtPm.fitView());
        check(`[${tag}] 탭 없음, 두 열(모든 카드 26), 열 머리 오늘·이전`, r.tabs === 0 && r.ncol === 2 && r.cards === 26 && r.today && r.today.text === T[lang].today && r.earlier && r.earlier.text === T[lang].earlier && !r.scrollX, r);
        check(`[${tag}] 처음 보기 = 맞춤(오늘 칸 폭, 위에 붙임)`, Math.abs(r.view.k - fitV.k) < 1e-3 && Math.abs(r.view.x - fitV.x) < 1 && Math.abs(r.view.y - fitV.y) < 1 && r.tRight <= r.vpw - 20 && r.tRight > r.vpw * 0.75, { view: r.view, fitV, tRight: r.tRight, vpw: r.vpw });
        check(`[${tag}] 처음 보기에 이전 칸 머리와 카드 가장자리가 오른쪽 끝에 보인다`, r.earlier.x < r.vpw - 20 && r.earlier.x > r.vpw - 90 && r.eLeft < r.vpw - 20 && r.eLeft > r.vpw - 60, { earlier: r.earlier, eLeft: r.eLeft, vpw: r.vpw });
        await shot(pg, `map-open-${tag}`);
        // 손가락으로 오른쪽(이전 칸) 쪽으로 끈다: 오른쪽에서 왼쪽으로 쓸기(마우스 포인터도 같은 길)
        const vpBox = await (await pg.$('.mt-pmap [data-role=ta-viewport]')).boundingBox();
        { const y0 = vpBox.y + vpBox.height * 0.5, dist = r.earlier.x - 12; await pg.mouse.move(vpBox.x + vpBox.width - 20, y0); await pg.mouse.down(); for (let s = 1; s <= 12; s++) await pg.mouse.move(vpBox.x + vpBox.width - 20 - s * (dist / 12), y0); await pg.mouse.up(); await sleep(400); }
        r = await pg.evaluate(READ);
        check(`[${tag}] 오른쪽으로 끌면 이전 칸(머리·카드)이 화면에`, r.earlier.x < r.vpw * 0.3 && r.earlier.x > -40 && r.eLeft < r.vpw * 0.35 && r.eLeft > 0, { earlier: r.earlier, eLeft: r.eLeft, vpw: r.vpw });
        await shot(pg, `map-dragged-${tag}`);
        await pg.click('[data-action=ta-fit]'); await sleep(900);
        r = await pg.evaluate(READ);
        check(`[${tag}] 맞추기 = 처음 보기와 같다(이전 머리가 오른쪽 끝)`, Math.abs(r.view.k - fitV.k) < 1e-3 && Math.abs(r.view.x - fitV.x) < 1 && r.earlier.x > r.vpw - 90, { view: r.view, fitV });
        await shot(pg, `map-fit-${tag}`);
        // 알약으로 이전 칸 카드(응답 필요 garam-2)에 간다
        check(`[${tag}] 위 알약에 이전 칸 세션도`, r.pills.includes('s:garam-2') && r.pills.includes('s:c10-c'), r.pills);
        await pg.click('[data-role=pl-attn][data-id="s:garam-2"]'); await sleep(1300);
        const iv = await pg.evaluate(inView, ['s:garam-2']), last = await pg.evaluate(() => window.__mtPm.last());
        check(`[${tag}] 알약으로 이전 칸 카드에 가면 그 카드가 화면 안`, last === 's:garam-2' && iv.found && iv.inside, { last, iv });
        if (w === 390) await shot(pg, `map-go-earlier-${tag}`);
        await pg.click('[data-role=pl-count][data-tier=work]'); await sleep(1300);
        const last2 = await pg.evaluate(() => window.__mtPm.last()), iv2 = await pg.evaluate(inView, [last2]);
        check(`[${tag}] 작업 중 알약은 오늘 칸 카드로`, /^s:zl-(lead|ui)$/.test(last2) && iv2.found && iv2.inside, { last2, iv2 });
        check(`[${tag}] 페이지 오류 없음`, errs.length === 0, errs);
        await ctx.close();
      }
      // 한 칸뿐이면 지금처럼 한 열(머리 없음)
      call('settings.set', { key: 'language', value: 'ko' });
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: 'ko-KR', reducedMotion: 'reduce' });
      const pg = await ctx.newPage();
      await pair(pg);
      const one = { ...SHAPE, sessions: SHAPE.sessions.map((s) => [s[0], s[1], s[2], 0, s[4] === 'working' ? 'ready' : s[4]]) };
      await pg.evaluate(() => { try { localStorage.removeItem('atrium.phoneMap.view'); } catch {} });
      await pg.evaluate(HOOK, [one]);
      await pg.evaluate(() => window.__mtPhone.mission());
      await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 }); await sleep(1200);
      const r = await pg.evaluate(() => ({ ncol: window.__mtPm.lay().ncol, cards: window.__mtPm.lay().cards.size, secs: document.querySelectorAll('.mt-pmap [data-role=ln-section]').length }));
      check('[ko] 한 칸뿐이면 한 열(머리 없음), 모든 카드', r.ncol === 1 && r.cards === SHAPE.sessions.length && r.secs === 0, r);
      await shot(pg, 'map-one-section-ko-390');
      await ctx.close();
    } finally { await browser.close(); }
    // WebKit(iPhone Safari 엔진): 320 폭에서 입력 칸 안내 글이 한 줄인지
    try {
      const wk = await pw.webkit.launch({ headless: true });
      try {
        for (const lang of ['ko', 'en']) {
          call('settings.set', { key: 'language', value: lang });
          const ctx = await wk.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: lang === 'ko' ? 'ko-KR' : 'en-US' });
          const pg = await ctx.newPage();
          await pair(pg);
          await pg.evaluate(FAKE); await pg.evaluate((id) => window.__mtPhone.open(id), sid);
          await pg.waitForSelector('[data-field=phone-text]', { timeout: 20000 }); await sleep(900); await pg.evaluate(FAKE); await sleep(400);
          const a = await pg.evaluate(PH, ['[data-field=phone-text]']);
          await shot(pg, `webkit-input-${lang}-320`);
          await pg.click('[data-action=phone-steer]'); await sleep(400);
          const b = await pg.evaluate(PH, ['[data-field=phone-text]']);
          await shot(pg, `webkit-input-steer-${lang}-320`);
          check(`[webkit ${lang}-320] 안내 글 두 가지 모두 한 줄(칸 높이 한 줄)`, a && b && a.one && b.one && a.h < 50 && b.h < 50, { a, b });
          await ctx.close();
        }
      } finally { await wk.close(); }
    } catch (e) { check('WebKit 시험을 띄웠다', false, e.message.slice(0, 300)); }
  } finally { sim.close && sim.close(); }
}

async function stopBoard() {
  try { for (const s of call('session.list')) atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log(`kill ${e.message.slice(0, 120)}`); }
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  if (globalThis.__p280pg) await globalThis.__p280pg.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p280-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
