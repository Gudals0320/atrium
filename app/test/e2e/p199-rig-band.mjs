// P199 창 시험: rig 띠 후속(붙는 머리, 휴대폰 자리 사슬 감싸기·keep 표시 폭, 휴대폰 "+n 끝남" 펴기). 판: 따로 띄운 개발용 판(P199_BOARD, P199_PORT, P199_DATA)만. 창 원격 디버깅 포트 P199_DEBUG. 한 번에 창 하나.
// 띠 자료는 P198 창 시험(p198-rig-band.mjs)과 같이 페이지 안에서 mission.graph 답을 바꿔 넣는다: 견본(test/fixtures/rig-band-graph.json)에 세션 노드를 지어 붙이고,
// P199_RIG(판 mission.graph의 rig 칸 하나, 예: P197이 개발용 판에서 저장한 graph-*.json)가 있으면 그 rig를 쓴다(자리 세션은 seats[].sessions로 짓는다).
// 판에는 시험 폴더 워크스페이스 둘(P199_RIGWS, P199_OFFWS 이름)이 열려 있어야 한다(세션은 없어도 된다). 휴대폰은 웹(흉내 tailscale 프록시 P199_SIM)으로.
// 실행: node app/test/e2e/p199-rig-band.mjs <pc|phone>   (실제 판 변수를 지운 셸에서) 결과는 워크트리의 experiments/p199/shots/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p199', 'shots');
const BOARD = process.env.P199_BOARD || 'atrium-dev-p199', PORT = process.env.P199_PORT || '47968', DEBUG = process.env.P199_DEBUG || '9448';
const DATA = process.env.P199_DATA || path.join(process.env.LOCALAPPDATA || '', 'atrium-dev-p199');
const RIGWS = process.env.P199_RIGWS || 'mtask-p199-band', OFFWS = process.env.P199_OFFWS || 'mtask-p199-off';
const WHAT = process.argv[2] || 'pc';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT, ATRIUM_DATA_DIR: DATA, ATRIUM_APP_USERDATA: path.join(REPO, 'backend', '.dev', 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DATA, 'no-projects'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p199-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, shot: shot0 } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV);
const RTAG = process.env.P199_RIG ? `-${path.basename(process.env.P199_RIG, '.json')}` : '';
const log = logger(`p199-rig-band-${WHAT}${RTAG}`);
const shot = (pg, n) => shot0(pg, `${n}${RTAG}`, log);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];

// ---- 흉내 그래프(P198과 같다) ----
const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'app', 'test', 'fixtures', 'rig-band-graph.json'), 'utf8'));
function mockGraph(rigKey, offKey) {
  const now = Date.now(), base = now - 3 * 3600 * 1000;
  const O = [['o-lead', 'off-lead', null, 'idle'], ['o-kid', 'off-kid', null, 'working', 'o-lead'], ['o-solo', 'off-solo', null, 'idle']];
  const node = ([sid, name, seat, state, parent], ws, i) => ({ id: `s:${sid}`, kind: 'session', sessionId: sid, name, agentKind: 'claude', state, category: state, workspaceKey: ws, parentId: parent ? `s:${parent}` : null, lineageParent: parent ? `s:${parent}` : null, peers: [], createdAt: base + i * 1000, rigSeat: seat, lastPrompt: state === 'working' ? `Step ${i} of the task` : null, activeAt: now - (i + 1) * 60000, turnAt: state === 'working' ? now - 120000 : null });
  if (process.env.P199_RIG) {
    // 판 그래프의 rig 칸: 자리 세션으로 노드를 짓는다(바쁨 = working), keep 주인 아래 helper
    const raw = JSON.parse(fs.readFileSync(process.env.P199_RIG, 'utf8'));
    const R = raw.seats ? raw : Object.values(raw.rig || raw)[0];
    const S = [];
    const names = new Map();
    for (const c of R.cases || []) for (const u of c.units || []) if (u.sessionId && u.name) names.set(u.sessionId, u.name);
    for (const s of R.seats || []) for (const x of s.sessions || []) S.push([x.sessionId, names.get(x.sessionId) || `${s.name}-${S.length}`, s.name, x.busy ? 'working' : 'idle', s.session === 'keep' ? null : '__keep']);
    const keep = S.find((s) => !s[4]);
    for (const s of S) if (s[4] === '__keep') s[4] = keep ? keep[0] : null;
    if (keep) S.push(['s-h', 'helper', null, 'idle', keep[0]]);
    const nodes = [...S.map((s, i) => node(s, rigKey, i)), ...O.map((s, i) => node(s, offKey, i + 20))];
    const edges = [...S, ...O].filter((s) => s[4]).map((s) => ({ from: `s:${s[4]}`, to: `s:${s[0]}`, kind: 'spawn', count: 0 }));
    return { nodes, edges, counts: {}, at: now, rig: { [rigKey]: R } };
  }
  const T = (x) => (x == null ? x : base + Number(x) * 1000);
  const R = JSON.parse(JSON.stringify(FIX));
  delete R._about;
  for (const c of R.cases) {
    for (const k of ['createdAt', 'closedAt', 'lastHandoffAt']) c[k] = T(c[k]);
    for (const u of c.units) { u.createdAt = T(u.createdAt); u.closedAt = T(u.closedAt); }
    for (const r of c.reports || []) r.at = T(r.at);
  }
  const S = [
    ['s-main', 'main', 'main', 'idle'], ['s-mgr', 'manager', 'manager', 'working'], ['s-t1', 'tester-1', 'tester', 'idle', 's-main'], ['s-old', 'worker-0', 'worker', 'sleeping', 's-main'],
    ['s-w1', 'worker-1', 'worker', 'idle', 's-main'], ['s-r1', 'reviewer-1', 'reviewer', 'sleeping', 's-main'], ['s-r2', 'reviewer-2', 'reviewer', 'idle', 's-main'],
    ['s-d1', 'docs-1', 'docs', 'working', 's-main'], ['s-w2', 'worker-2', 'worker', 'working', 's-main'], ['s-h', 'helper', null, 'idle', 's-main'],
  ];
  const nodes = [...S.map((s, i) => node(s, rigKey, i)), ...O.map((s, i) => node(s, offKey, i + 20))];
  const edges = [...S, ...O].filter((s) => s[4]).map((s) => ({ from: `s:${s[4]}`, to: `s:${s[0]}`, kind: 'spawn', count: 0 }));
  return { nodes, edges, counts: {}, at: now, rig: { [rigKey]: R } };
}
const HOOK = ([g]) => {
  const api = window.__mt.api;
  if (!api.__p199orig) api.__p199orig = api.call.bind(api);
  api.call = (m, p) => (m === 'mission.graph' ? Promise.resolve(JSON.parse(JSON.stringify(g))) : api.__p199orig(m, p));
};

async function closeMission(pg) { for (let i = 0; i < 3 && (await pg.$('[data-role="mission"]')); i++) { await pg.keyboard.press('Escape'); await sleep(400); } }
async function openMission(pg) {
  await closeMission(pg);
  await pg.click('[data-action="mission-rail"]');
  await pg.waitForSelector('[data-role="mission"] .mt-rb', { timeout: 20000 });
  await sleep(1500);
}
const keysOf = (pg) => pg.evaluate(([a, b]) => { const ws = window.__mt.getState().workspaces || []; const k = (n) => (ws.find((w) => w.name === n) || {}).key; return [k(a), k(b)]; }, [RIGWS, OFFWS]);
const setLang = async (pg, lang) => { await pg.evaluate((l) => window.__mt.api.call('settings.set', { key: 'language', value: l }), lang); await sleep(1200); };

// 고정 머리 막대 읽기: 붙는 머리 켜짐, 보이는 칸 이름(화면 x), 띠 자리 머리 화면 x
const bar = (pg) => pg.evaluate(() => {
  const cs = document.querySelector('[data-role=ln-cols]');
  const vis = (el) => { const st = getComputedStyle(el); return st.visibility !== 'hidden' && st.display !== 'none' && !el.closest('[hidden]'); };
  const rx = (el) => Math.round(el.getBoundingClientRect().left);
  return {
    sticky: cs.dataset.sticky || null,
    tree: [...cs.querySelectorAll(':scope > .colh')].filter(vis).map((el) => `${el.dataset.col}:${el.textContent}`),
    rig: [...cs.querySelectorAll('.rbst .colh')].filter(vis).map((el) => ({ seat: el.dataset.seat, x: rx(el), text: el.textContent })),
    seats: [...document.querySelectorAll('[data-role=rb-seat]')].map((el) => ({ seat: el.dataset.seat, x: rx(el), top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom })),
    barBottom: cs.getBoundingClientRect().bottom,
  };
});
// 띠의 한 지점(세계 y)을 고정 머리 막대 아래 변에 맞춘다(배율 k, 띠 왼쪽이 화면 왼쪽 30px)
const scrollBand = (pg, frac, k = 0.85) => pg.evaluate(([f, kk]) => { const L = window.__mtTa.lay(), b = L.rb.list[0].box; const wy = typeof f === 'number' ? b.y + b.h * f : b.y - 10; window.__mtTa.set({ k: kk, x: window.__mtTa.rail + 30 - (b.x - 20) * kk, y: window.__mtTa.top + (typeof f === 'number' ? 0 : 20) - wy * kk }); }, [frac, k]);

async function pc() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); }).catch(() => {});
    await page.setViewportSize({ width: 2205, height: 1291 }).catch(() => {});
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { try { localStorage.setItem('atrium.sessionMap.summary', '1'); } catch { /* */ } });
    await setLang(page, 'en');
    await sleep(1500);
    const [rigKey, offKey] = await keysOf(page);
    log(`keys ${rigKey} ${offKey}`);
    await page.evaluate(HOOK, [mockGraph(rigKey, offKey)]);
    await openMission(page);
    for (const lang of ['en', 'ko']) {
      await setLang(page, lang);
      // 1) 띠 머리가 보인다 → 나무 칸 이름, 붙는 머리 없음
      await scrollBand(page, null); await sleep(700);
      const a = await bar(page);
      await shot(page, `pc-head-visible-${lang}`);
      check(`[${lang}] 띠 자리 머리가 보이면 고정 막대는 나무 칸 이름(붙는 머리 없음)`, !a.sticky && a.rig.length === 0 && a.tree.some((x) => x.startsWith('lv0')) && a.seats.every((s) => s.top >= a.barBottom - 1), a);
      // 2) 띠 머리가 위로 지나갔다(띠 가운데가 막대 선) → 띠의 자리 이름을 띠 열 x에
      await scrollBand(page, 0.5); await sleep(700);
      const b = await bar(page);
      await shot(page, `pc-sticky-${lang}`);
      const sameX = b.rig.length === b.seats.length && b.rig.every((r, i) => r.seat === b.seats[i].seat && Math.abs(r.x - b.seats[i].x) <= 2);
      check(`[${lang}] 띠 자리 머리가 위로 지나가면 막대에 자리 이름이 띠 열 x에(나무 칸 이름 숨김)`, b.sticky === rigKey && sameX && !b.tree.some((x) => x.startsWith('lv')) && b.seats.every((s) => s.bottom <= b.barBottom + 1), b);
      if (lang === 'ko') check('[ko] 붙는 머리의 keep·fresh·옛 자리 낱말이 한국어', b.rig.some((r) => /유지|새로|옛/.test(r.text)) || b.rig.some((r) => /[가-힣]/.test(r.text)), b.rig.map((r) => r.text));
      // 3) 시점을 옆으로 옮겨도 x가 따라간다
      await page.evaluate(() => { const v = window.__mtTa.view(); window.__mtTa.set({ ...v, x: v.x - 140 }); }); await sleep(400);
      const c = await bar(page);
      check(`[${lang}] 옆으로 옮기면 붙는 머리 x도 따라간다`, c.sticky === rigKey && c.rig.every((r, i) => Math.abs(r.x - c.seats[i].x) <= 2), c.rig.slice(0, 3));
      // 4) 띠가 다 위로 지나가면 다시 나무 칸 이름
      await scrollBand(page, 1.15); await sleep(600);
      const d = await bar(page);
      check(`[${lang}] 띠가 다 지나가면 나무 칸 이름으로 돌아온다`, !d.sticky && d.rig.length === 0 && d.tree.some((x) => x.startsWith('lv0')), d);
    }
    await setLang(page, 'en');
    await closeMission(page);
  } finally {
    await closeApp(app);
  }
}

// 휴대폰 폭(P198과 같은 길): 흉내 tailscale 프록시(SIM) → 기기 짝짓기 → 390×844 터치 흉내 Chromium.
// 백엔드는 ATRIUM_TAILSCALE(p49-fake-tailscale.mjs)·P49_FAKE_TS_PORT·ATRIUM_WEB_HOSTS(pc.example.ts.net:SIM)로 띄워 둔다
const SIM = Number(process.env.P199_SIM || 47989);
async function phone() {
  const { execFileSync } = await import('node:child_process');
  const pw = await import('playwright');
  const L = await import('./p59-lib.mjs');
  const toUrl = (p) => 'file:///' + p.split(path.sep).join('/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const call = (m, p = {}) => JSON.parse(execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', '--json', 'call', m, JSON.stringify(p)], { encoding: 'utf8', env: process.env, timeout: 120000 }));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: L.NAME, login: L.LOGIN, keepOrigin: true }); sim.cfg.ip = L.LAPTOP_A;
  await sim.ready;
  const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const exe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
  const browser = await pw.chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
    await page.goto(`http://localhost:${SIM}/`);
    await page.waitForSelector('[data-role=pair]', { timeout: 30000 });
    await page.fill('[data-field=pair-code]', call('device.code').code);
    await page.click('[data-action=pair-submit]');
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
    await sleep(1200);
    await setLang(page, 'en');
    const [rigKey, offKey] = await keysOf(page);
    await page.evaluate(HOOK, [mockGraph(rigKey, offKey)]);
    await page.evaluate(() => window.__mtPhone.mission());
    await page.waitForSelector('.mt-pmap .mt-rb', { timeout: 20000 });
    await sleep(1500);
    // 띠(카드 폭)가 화면 폭에 드는 배율로 c-open 머리에 맞춘다(P198 그림과 같은 1.1 이상이면 그것)
    const goCase = (id) => page.evaluate((cid) => { const L = window.__mtPm.lay(), b = L.rb.list[0], h = b.heads.find((x) => x.id === cid) || b.heads[0]; const k = Math.min(1.1, (innerWidth - 12) / b.box.w); window.__mtPm.set({ k, x: 6 - b.box.x * k, y: 10 - h.y * k }); return k; }, id);
    const inScreen = (cid) => page.evaluate((c) => {
      const W = innerWidth, q = (s) => [...document.querySelectorAll(s)];
      const r = (el) => el.getBoundingClientRect();
      const links = q(`.mt-pmap [data-role=rb-link]`).filter((el) => !c || el.closest('[data-role=pm-stage]')).map((el) => ({ seat: el.dataset.seat, l: Math.round(r(el).left), r: Math.round(r(el).right), t: Math.round(r(el).top), wrap: el.classList.contains('wrap') }));
      const marks = q('.mt-pmap [data-role=rb-mark]').map((el) => ({ kind: el.dataset.kind, case: el.dataset.case, l: Math.round(r(el).left), r: Math.round(r(el).right) }));
      const band = r(document.querySelector('.mt-pmap [data-role=rb-band]'));
      return { W, links, marks, band: { l: Math.round(band.left), r: Math.round(band.right) }, scrollX: document.documentElement.scrollWidth > W + 1 };
    }, cid);
    const k = await goCase('c-open'); await sleep(800);
    const lay = await page.evaluate(() => { const b = window.__mtPm.lay().rb.list[0]; return { open: b.chains.filter((c) => c.caseId === 'c-open').map((c) => ({ seat: c.seat, x: c.x, y: c.y, w: c.w, wrap: !!c.wrap })), box: b.box }; });
    const s1 = await inScreen();
    await shot(page, 'phone-wrap-en');
    const rows = new Set(lay.open.map((c) => c.y)).size;
    check('휴대폰: c-open 자리 사슬이 띠(카드) 폭 안에서 꺾인다(줄 둘 이상, 꺾은 줄은 들여 시작)', rows >= 2 && lay.open.every((c) => c.x + c.w <= lay.box.x + lay.box.w + 0.5) && lay.open.some((c) => c.wrap), { k, rows, lay });
    check('휴대폰: 이 배율에서 사슬 칩과 keep 표시("일 있음")가 화면 폭 안, 가로 넘침 없음', s1.links.every((x) => x.r <= s1.W && x.l >= 0) && s1.marks.every((m) => m.r <= s1.W) && s1.marks.some((m) => m.kind === 'holds') && !s1.scrollX, s1);
    await setLang(page, 'ko'); await sleep(600);
    await shot(page, 'phone-wrap-ko');
    // "+n 끝남" 펴기: 접힌 줄로 가서 누른다
    const fy = await page.evaluate(() => { const b = window.__mtPm.lay().rb.list[0], f = b.fold; const k = Math.min(1.1, (innerWidth - 12) / b.box.w); window.__mtPm.set({ k, x: 6 - b.box.x * k, y: 300 - f.y * k }); return !!f; });
    await sleep(800);
    const f0 = await page.evaluate(() => { const el = document.querySelector('.mt-pmap [data-role=rb-fold]'); return el ? { text: el.textContent, open: el.dataset.open || null, disabled: el.disabled } : null; });
    await shot(page, 'phone-fold-closed-ko');
    await page.tap('.mt-pmap [data-role=rb-fold]'); await sleep(1200);
    const f1 = await page.evaluate(() => {
      const el = document.querySelector('.mt-pmap [data-role=rb-fold]'), b = window.__mtPm.lay().rb.list[0];
      const old = document.querySelector('.mt-pmap .mt-ta-slot[data-id="s:s-old"]');
      return { text: el && el.textContent, open: el && el.dataset.open, chip: old ? old.dataset.chip : null, oldVis: !!old, hidden: b.heads.filter((h) => h.hidden).map((h) => h.id), h: b.box.h, peek: !!document.querySelector('[data-role=pm-peek], .mt-sm-peek') };
    });
    await page.evaluate(() => { const b = window.__mtPm.lay().rb.list[0], f = b.fold; const k = Math.min(1.1, (innerWidth - 12) / b.box.w); window.__mtPm.set({ k, x: 6 - b.box.x * k, y: 200 - f.y * k }); }); await sleep(700);
    await shot(page, 'phone-fold-open-ko');
    await setLang(page, 'en'); await sleep(600);
    await shot(page, 'phone-fold-open-en');
    check('휴대폰 "+n 끝남": 눌린다(사용 안 함 아님), 누르면 펴지고 건 없는 세션(worker-0)이 칩으로 보인다', fy && f0 && !f0.disabled && !f0.open && /끝남/.test(f0.text) && f1.open === '1' && f1.oldVis, { f0, f1 });
    await page.tap('.mt-pmap [data-role=rb-fold]'); await sleep(1000);
    const f2 = await page.evaluate(() => { const el = document.querySelector('.mt-pmap [data-role=rb-fold]'); return { open: el && el.dataset.open || null, oldVis: !!document.querySelector('.mt-pmap .mt-ta-slot[data-id="s:s-old"]') }; });
    check('휴대폰 "+n 끝남": 다시 누르면 접힌다', !f2.open && !f2.oldVis, f2);
    await ctx.close();
  } finally {
    await browser.close();
    await sim.close?.();
  }
}

try {
  if (WHAT === 'pc') await pc();
  else if (WHAT === 'phone') await phone();
} finally {
  fs.writeFileSync(path.join(OUT, `results-${WHAT}${RTAG}.json`), JSON.stringify(results, null, 2));
  log(`끝: ${results.filter((r) => r.ok).length}/${results.length}`);
  process.exit(0);
}
