// P256 창 시험: 휴대폰은 세션 맵으로 연다(목록 화면 없음, 머리줄에 로고·연결·사용량·알림·새 세션), 세션 맵 위 검은 구간 없음(맵 칸이 머리 아래에서 바로),
// 사용량 알약 대표(기본 Claude, 펼침에서 고르면 바뀌고 기억, 자료가 없으면 다음).
// 판: 따로 띄운 개발용 판(atrium-dev-p256, 48006, backend/.dev)만 쓴다. 휴대폰 흉내 프록시 48066. 한 번에 브라우저 하나(메모리).
//   맵 모양은 P207 흉내(mission.graph 답과 워크스페이스·폴더를 페이지 안에서 바꾼다), 사용량은 usage.updated 흉내.
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p256-phone.mjs <setup|phone|stop> [round]
// 결과는 워크트리의 experiments/p256/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p256', TAG);
const CONVOS = path.join(REPO, 'experiments', 'p256', 'convos');
const BOARD = 'atrium-dev-p256', PORT = '48006', SIM = 48066;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p256-none-',
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
const log = logger(`p256-${WHAT}-${TAG}`);
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
  const NOWV = Date.now();
  const Wd = (id, usedPct) => ({ id, usedPct, resetsAt: NOWV + 3 * 3600e3 });
  const USAGE = { alertsOn: true, providers: {
    claude: { provider: 'claude', at: NOWV, plan: 'Max', source: 'statusline', windows: [Wd('5h', 30), Wd('week', 41)] },
    codex: { provider: 'codex', at: NOWV, plan: 'Pro', source: 'session', windows: [Wd('5h', 92), Wd('week', 50)] },
    agy: { provider: 'agy', at: NOWV, source: 'statusline', windows: [Wd('gemini-5h', 12), Wd('gemini-weekly', 20)] },
  } };
  const pill = () => { const b = document.querySelector('.mt-ph-head [data-role=usage]'); const p = b && b.querySelector('[data-role=usage-rep-part]'); return b ? { text: b.innerText.replace(/\s+/g, ' ').trim(), provider: p && p.dataset.provider, pct: p && Number(p.dataset.pct), picked: p && p.dataset.picked, level: b.dataset.level, saved: localStorage.getItem('atrium.usage.rep') } : null; };
  try {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      for (const lang of ['ko', 'en']) {
        call('settings.set', { key: 'language', value: lang });
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: lang === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce' });
        const pg = await ctx.newPage();
        const errs = [];
        globalThis.__p256pg = pg;
        pg.on('pageerror', (e) => { errs.push(e.message); log(`[phone pageerror] ${e.message}`); });
        await pg.goto(`http://localhost:${SIM}/`);
        await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
        await pg.fill('[data-field=pair-code]', call('device.code').code);
        await pg.click('[data-action=pair-submit]');
        const loaded = () => pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
        await loaded();
        await pg.evaluate(() => { for (const k of ['atrium.phoneMap.view', 'atrium.phoneMap.tab', 'atrium.usage.rep']) localStorage.removeItem(k); });
        await pg.reload(); await loaded(); await sleep(1500);
        await pg.waitForFunction(() => !/보드를 준비|Connecting to the backend/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {}); await sleep(800);
        // 1) 처음 연 화면: 아무것도 누르지 않아도 세션 맵, 목록 화면·목록 단추 없음, 머리줄에 옮긴 길
        let r = await pg.evaluate(() => {
          const ph = document.querySelector('[data-role=phone]'), head = document.querySelector('.mt-phone .mt-ph-head');
          const kids = head ? [...head.children].filter((k) => k.getBoundingClientRect().width > 0).map((k) => { const b = k.getBoundingClientRect(); return { cls: k.className, l: Math.round(b.left), r: Math.round(b.right) }; }) : [];
          return { view: ph && ph.dataset.view, mission: !!document.querySelector('[data-role=phone-mission]'), list: !!document.querySelector('[data-role=phone-list]'), back: !!document.querySelector('[data-action=phone-mission-back]'), listBtn: !!document.querySelector('[data-action=phone-mission]'),
            brand: !!head.querySelector('.mt-ph-brand'), conn: !!head.querySelector('[data-role=phone-conn]'), usage: !!head.querySelector('[data-role=usage]'), push: !!head.querySelector('[data-action=phone-push], [data-role=phone-push], .mt-ph-push'), neu: !!head.querySelector('[data-action=phone-new]'), kids, inside: kids.every((k) => k.l >= 0 && k.r <= innerWidth), empty: (document.querySelector('[data-role=pm-empty]') || {}).innerText || null, path: location.pathname, hist: history.state };
        });
        check(`[${lang}] 처음 연 화면이 세션 맵(목록 화면·목록 단추·목록으로 돌아가기 없음)`, r.view === 'mission' && r.mission && !r.list && !r.back && !r.listBtn, r);
        check(`[${lang}] 머리줄: 로고·연결·사용량·새 세션이 한 줄 화면 안`, r.brand && r.conn && r.neu && r.inside, r);
        check(`[${lang}] 빈 판 안내는 위쪽 + 단추를 가리킨다`, !r.empty || r.empty.includes('+'), r.empty);
        await shot(pg, `first-empty-${lang}`);
        // 새 세션: + 단추 → 새 세션 시트
        await pg.tap('[data-action=phone-new]'); await sleep(500);
        const spawn = await pg.evaluate(() => !!document.querySelector('[data-role=phone-spawn]'));
        check(`[${lang}] + 단추가 새 세션 시트를 연다`, spawn);
        await shot(pg, `new-session-${lang}`);
        if (spawn) { await pg.tap('[data-action=phone-spawn-close]'); await sleep(400); }
        // 2) 흉내 모양으로 맵을 다시 받는다(링크 바뀜 사건이 다시 받게 한다)
        await pg.evaluate(HOOK, [SHAPE]);
        await pg.evaluate(() => window.__mt.api.emit('link.removed', { linkId: 'p256-none' }));
        await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 }); await sleep(1200);
        await pg.evaluate(() => window.__mt.api.emit('usage.updated', null));
        await pg.evaluate((u) => window.__mt.api.emit('usage.updated', u), USAGE); await sleep(400);
        await pg.evaluate(() => window.__mtPm.fit()); await sleep(600);
        r = await pg.evaluate(() => {
          const q = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, h: b.height, bottom: b.bottom }; };
          const stage = q('.mt-pmap [data-role=pm-stage]'), vp = q('.mt-pmap [data-role=ta-viewport]'), bg = q('.mt-pmap .mt-ta-bg'), pills = q('[data-role=pl-pills]'), tabs = q('[data-role=pm-tabs]');
          const vpTop = getComputedStyle(document.querySelector('.mt-pmap [data-role=ta-viewport]')).top;
          return { stage, vp, bg, pills, tabs, vpTop, size: window.__mtPm.size(), view: window.__mtPm.view(), cards: window.__mtPm.lay().cards.size };
        });
        check(`[${lang}] 검은 구간 없음: 캔버스(점 바탕)가 맵 칸 위 끝에서 시작하고 칸 높이를 다 쓴다`, r.vpTop === '0px' && Math.abs(r.vp.top - r.stage.top) < 0.5 && Math.abs(r.bg.top - r.stage.top) < 0.5 && Math.abs(r.vp.h - r.stage.h) < 0.5 && Math.abs(r.size.h - r.stage.h) < 1 && Math.abs(r.stage.top - r.pills.bottom) < 1.5, r);
        const top = await pg.evaluate(() => { const L = window.__mtPm.lay(), v = window.__mtPm.view(); return { worldTop: L.bounds.y * v.k + v.y, k: v.k }; });
        check(`[${lang}] 맞춤은 맵 위에 붙인다(세계 위 끝이 칸 위에서 12px)`, Math.abs(top.worldTop - 12) < 1, top);
        await shot(pg, `map-full-${lang}`);
        // 3) 사용량 대표: 기본 Claude(가장 높은 Codex 92가 아니라)
        let p = await pg.evaluate(pill);
        check(`[${lang}] 사용량 알약 기본 대표는 Claude(41%), 점·테두리 색은 가장 높은 값`, p && p.provider === 'claude' && p.pct === 41 && p.picked === '1' && p.level === 'high' && p.saved === null, p);
        await pg.tap('.mt-ph-head [data-role=usage]'); await sleep(400);
        let d = await pg.evaluate(() => [...document.querySelectorAll('[data-role=usage-list] [data-role=usage-provider]')].map((e) => ({ k: e.dataset.provider, rep: e.dataset.rep || null, role: e.getAttribute('role'), pressed: e.getAttribute('aria-pressed') })));
        const hint = await pg.evaluate(() => (document.querySelector('[data-role=usage-pick-hint]') || {}).innerText || null);
        check(`[${lang}] 펼침: 구독 셋을 누를 수 있고 Claude에 대표 표시, 고르기 안내`, d.length === 3 && d.every((x) => x.role === 'button') && d.filter((x) => x.rep).map((x) => x.k).join() === 'claude' && !!hint, { d, hint });
        await shot(pg, `usage-open-${lang}`);
        await pg.tap('[data-role=usage-list] [data-role=usage-provider][data-provider=codex]'); await sleep(400);
        p = await pg.evaluate(pill);
        d = await pg.evaluate(() => [...document.querySelectorAll('[data-role=usage-list] [data-role=usage-provider]')].filter((e) => e.dataset.rep).map((e) => e.dataset.provider));
        check(`[${lang}] Codex를 누르면 대표가 Codex(92%), 기기에 기억`, p.provider === 'codex' && p.pct === 92 && p.picked === '1' && p.saved === 'codex' && d.join() === 'codex', { p, d });
        await shot(pg, `usage-picked-${lang}`);
        // 기억: 다시 열어도 Codex
        await pg.reload(); await loaded(); await sleep(1000);
        await pg.evaluate((u) => window.__mt.api.emit('usage.updated', u), USAGE); await sleep(400);
        p = await pg.evaluate(pill);
        check(`[${lang}] 다시 열어도 대표는 Codex`, p.provider === 'codex' && p.pct === 92, p);
        // 자료 없음 → 다음(Codex 다음은 AGY)
        await pg.evaluate((u) => window.__mt.api.emit('usage.updated', { ...u, providers: { ...u.providers, codex: null } }), USAGE); await sleep(400);
        p = await pg.evaluate(pill);
        check(`[${lang}] 대표(Codex) 자료가 없으면 다음 구독(AGY 가장 높은 창 20%), 고른 것은 그대로 기억`, p.provider === 'agy' && p.pct === 20 && p.picked === '0' && p.saved === 'codex', p);
        await shot(pg, `usage-fallback-${lang}`);
        // 4) 세션 화면의 뒤로는 맵으로(세션 하나를 흉내로 넣어 연다)
        await pg.evaluate(() => { const st = window.__mt.getState(); const s = { sessionId: 'p256-fake', name: 'p256-fake', kind: 'shell', state: 'sleeping', workspaceKey: null }; window.__mt.api.emit('session.updated', s); });
        await sleep(400);
        const opened = await pg.evaluate(() => { window.__mtPhone.open('p256-fake'); return true; }); await sleep(800);
        const sv = await pg.evaluate(() => ({ view: document.querySelector('[data-role=phone]').dataset.view, back: (document.querySelector('[data-action=phone-back]') || {}).innerText || null }));
        if (sv.view === 'session') { await pg.tap('[data-action=phone-back]'); await sleep(800); }
        const after = await pg.evaluate(() => document.querySelector('[data-role=phone]').dataset.view);
        check(`[${lang}] 세션 화면의 뒤로 단추는 맵(글 "${lang === 'ko' ? '맵' : 'Map'}")으로 돌아간다`, opened && sv.view === 'session' && after === 'mission', { sv, after });
        await pg.evaluate(() => window.__mt.api.emit('session.removed', { sessionId: 'p256-fake' })).catch(() => {});
        check(`[${lang}] 페이지 오류 없음`, errs.length === 0, errs);
        await ctx.close();
      }
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
  if (globalThis.__p256pg) await globalThis.__p256pg.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p256-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
