// P198 창 시험: 세션 맵 rig 띠(docs research harness-arch.md 17절). 판: 따로 띄운 개발용 판(P198_BOARD, P198_PORT, P198_DATA)만. 창 원격 디버깅 포트 P198_DEBUG. 한 번에 창 하나.
// 띠 자료는 페이지 안에서 mission.graph 답을 바꿔 넣는다: P198_GRAPH(판 mission.graph 답 JSON, 예: P197이 개발용 판에서 저장한 그래프)가 있으면 그 rig와 노드를 쓰고,
// 없으면 견본(test/fixtures/rig-band-graph.json = P197 견본)에 세션 노드를 지어 붙인다. rig 없는 워크스페이스 줄도 함께 둔다.
// real 모드: P198_RIG(판 mission.graph의 rig 칸 하나, 예: P197이 개발용 판에서 저장한 graph-*.json)를 그 워크스페이스에 넣고, 자리 세션(seats[].sessions)으로 세션 노드를 짓는다.
// 판에는 시험 폴더 워크스페이스 둘(P198_RIGWS, P198_OFFWS 이름)이 열려 있어야 한다(세션은 없어도 된다).
// 실행: node app/test/e2e/p198-rig-band.mjs <pc|phone|perf>   (실제 판 변수를 지운 셸에서) 결과는 워크트리의 experiments/p198/shots/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p198', 'shots');
const BOARD = process.env.P198_BOARD || 'atrium-dev-p198', PORT = process.env.P198_PORT || '47967', DEBUG = process.env.P198_DEBUG || '9447';
const DATA = process.env.P198_DATA || path.join(process.env.LOCALAPPDATA || '', 'atrium-dev-p198');
const RIGWS = process.env.P198_RIGWS || 'mtask-p198-band', OFFWS = process.env.P198_OFFWS || 'mtask-p198-off';
const WHAT = process.argv[2] || 'pc';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT, ATRIUM_DATA_DIR: DATA, ATRIUM_APP_USERDATA: path.join(REPO, 'backend', '.dev', 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DATA, 'no-projects'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p198-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, shot: shot0 } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV);
const RTAG = process.env.P198_RIG ? `-${path.basename(process.env.P198_RIG, '.json')}` : '';
const log = logger(`p198-rig-band-${WHAT}${RTAG}`);
const shot = (pg, n) => shot0(pg, n, log);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];

// ---- 흉내 그래프 ----
const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'app', 'test', 'fixtures', 'rig-band-graph.json'), 'utf8'));
function mockGraph(rigKey, offKey) {
  if (process.env.P198_GRAPH) {
    const g = JSON.parse(fs.readFileSync(process.env.P198_GRAPH, 'utf8'));
    return { ...g, at: Date.now() };
  }
  const now = Date.now(), base = now - 3 * 3600 * 1000; // 견본 시각(작은 수)을 세 시간 전부터로
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
  const O = [['o-lead', 'off-lead', null, 'idle'], ['o-kid', 'off-kid', null, 'working', 'o-lead'], ['o-solo', 'off-solo', null, 'idle']];
  const node = ([sid, name, seat, state, parent], ws, i) => ({ id: `s:${sid}`, kind: 'session', sessionId: sid, name, agentKind: 'claude', state, category: state, workspaceKey: ws, parentId: parent ? `s:${parent}` : null, lineageParent: parent ? `s:${parent}` : null, peers: [], createdAt: base + i * 1000, rigSeat: seat, lastPrompt: state === 'working' ? `Step ${i} of the task` : null, activeAt: now - (i + 1) * 60000, turnAt: state === 'working' ? now - 120000 : null });
  const nodes = [...S.map((s, i) => node(s, rigKey, i)), ...O.map((s, i) => node(s, offKey, i + 20))];
  const edges = [...S, ...O].filter((s) => s[4]).map((s) => ({ from: `s:${s[4]}`, to: `s:${s[0]}`, kind: 'spawn', count: 0 }));
  return { nodes, edges, counts: {}, at: now, rig: { [rigKey]: R } };
}
const HOOK = ([g]) => {
  const api = window.__mt.api;
  if (!api.__p198orig) api.__p198orig = api.call.bind(api);
  window.__p198calls = 0;
  api.call = (m, p) => { if (m === 'mission.graph') { window.__p198calls++; return Promise.resolve(JSON.parse(JSON.stringify(g))); } return api.__p198orig(m, p); };
};

async function closeMission(pg) { for (let i = 0; i < 3 && (await pg.$('[data-role="mission"]')); i++) { await pg.keyboard.press('Escape'); await sleep(400); } }
async function openMission(pg) {
  await closeMission(pg);
  await pg.click('[data-action="mission-rail"]');
  await pg.waitForSelector('[data-role="mission"] .mt-rb', { timeout: 20000 });
  await sleep(1500);
}
const keysOf = (pg) => pg.evaluate(([a, b]) => { const ws = window.__mt.getState().workspaces || []; const k = (n) => (ws.find((w) => w.name === n) || {}).key; return [k(a), k(b)]; }, [RIGWS, OFFWS]);
const box = (pg, sel) => pg.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top }; }, sel);
const setLang = async (pg, lang) => { await pg.evaluate((l) => window.__mt.api.call('settings.set', { key: 'language', value: l }), lang); await sleep(1200); };
// 띠 왼쪽 위로 확대(배율 k)
const zoomBand = (pg, k = 0.85) => pg.evaluate((kk) => { const L = window.__mtTa.lay(), b = L.rb.list[0].box; window.__mtTa.set({ k: kk, x: window.__mtTa.rail + 30 - (b.x - 20) * kk, y: window.__mtTa.top + 20 - (b.y - 10) * kk }); }, k);

// 실제 판 rig 칸 → 흉내 그래프(자리 세션 = 노드, 바쁨이면 working, 아니면 idle). 자리 없는 도우미(keep 주인의 하위)와 rig 없는 줄을 함께 둔다
const LIVE = ['open', 'waiting_owner', 'blocked'];
function realGraph(file, rigKey, offKey) {
  const R = JSON.parse(fs.readFileSync(file, 'utf8'));
  const now = Date.now();
  const nodes = [], edges = [];
  let i = 0, owner = null;
  for (const st of R.seats) for (const x of st.sessions || []) {
    const id = `s:${x.sessionId}`;
    if (st.session === 'keep' && !owner) owner = id;
    nodes.push({ id, kind: 'session', sessionId: x.sessionId, name: x.name, agentKind: 'claude', state: x.busy ? 'working' : 'idle', category: x.busy ? 'working' : 'idle', workspaceKey: rigKey, parentId: null, lineageParent: null, peers: [], createdAt: now - 3600000 + i++ * 1000, rigSeat: st.name, activeAt: now - 60000 * i, turnAt: x.busy ? now - 90000 : null, lastPrompt: x.busy ? 'Work on the assigned unit' : null });
  }
  const keepSeat = (n) => R.seats.some((st) => st.name === n.rigSeat && st.session === 'keep');
  for (const n of nodes) if (owner && n.id !== owner && !keepSeat(n)) { n.parentId = owner; n.lineageParent = owner; edges.push({ from: owner, to: n.id, kind: 'spawn', count: 0 }); }
  const extra = (sid, name, ws, state, parent) => { nodes.push({ id: `s:${sid}`, kind: 'session', sessionId: sid, name, agentKind: 'claude', state, category: state, workspaceKey: ws, parentId: parent, lineageParent: parent, peers: [], createdAt: now - 1000 * i++, rigSeat: null, activeAt: now - 600000 }); if (parent) edges.push({ from: parent, to: `s:${sid}`, kind: 'spawn', count: 0 }); };
  if (owner) extra('h', 'helper', rigKey, 'idle', owner);
  extra('o-lead', 'off-lead', offKey, 'idle', null); extra('o-kid', 'off-kid', offKey, 'working', 's:o-lead'); extra('o-solo', 'off-solo', offKey, 'idle', null);
  return { nodes, edges, counts: {}, at: now, rig: { [rigKey]: R } };
}
async function real() {
  const tag = path.basename(process.env.P198_RIG, '.json');
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); }).catch(() => {});
    await page.setViewportSize({ width: 2205, height: 1291 }).catch(() => {});
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { try { localStorage.setItem('atrium.sessionMap.summary', '1'); } catch { /* */ } });
    await setLang(page, 'en');
    const [rigKey, offKey] = await keysOf(page);
    const g = realGraph(process.env.P198_RIG, rigKey, offKey), R = g.rig[rigKey];
    await page.evaluate(HOOK, [g]);
    await openMission(page);
    await page.evaluate(() => window.__mtTa.fit()); await sleep(900);
    await shot(page, `real-${tag}-fit-en`);
    await zoomBand(page, 0.8); await sleep(900);
    await shot(page, `real-${tag}-zoom-en`);
    const f = await page.evaluate(() => {
      const L = window.__mtTa.lay(), q = (s) => [...document.querySelectorAll(s)];
      return { seats: q('[data-role=rb-seat]').map((x) => x.dataset.seat + (x.classList.contains('old') ? '(old)' : '')), heads: q('[data-role=rb-head][data-case]').map((x) => x.dataset.case), counts: q('[data-role=rb-count]').map((x) => x.textContent),
        marks: q('[data-role=rb-mark]').map((x) => x.dataset.kind), fold: (document.querySelector('[data-role=rb-fold]') || {}).textContent || null, cards: L.cards.size, folded: [...L.cards.values()].filter((c) => c.folded).map((c) => c.node.name), lines: q('[data-role=rb-line]').length };
    });
    log(JSON.stringify(f));
    const closed = R.cases.filter((c) => !LIVE.includes(c.state));
    const shownClosed = Math.min(3, closed.length), more = Math.max(0, R.doneCount - shownClosed);
    check(`[${tag}] 자리 머리 = 판의 seats 차례(옛 자리 표시)`, f.seats.join() === R.seats.map((x) => x.name + (x.old ? '(old)' : '')).join(), f.seats);
    check(`[${tag}] 행 = 끝나지 않은 건 + 끝난 최근 3`, f.heads.length === R.cases.length - closed.length + shownClosed, { heads: f.heads.length, cases: R.cases.length });
    check(`[${tag}] 접힌 줄 수 = doneCount − 그린 끝난 건(${more})`, more ? (f.fold || '').includes(`+${more}`) : !f.fold || /more seat/.test(f.fold), f.fold);
    check(`[${tag}] 모든 세션 노드가 카드 항목`, f.cards === g.nodes.length, { cards: f.cards, nodes: g.nodes.length });
    const back = R.cases.some((c) => LIVE.includes(c.state) && c.units.some((u) => { const p = c.units.find((v) => v.unit === (u.via || {}).prevUnit); return p && R.seats.findIndex((x) => x.name === u.seat) < R.seats.findIndex((x) => x.name === p.seat) && (c.lines || []).some((l) => String(l.index) === String(u.via.line) && l.max != null); }));
    if (back) check(`[${tag}] 되돌아감 호에 지금 셈(n/max, 올림 ↑k)`, f.counts.length >= 1, f.counts);
    const c0 = R.cases[0];
    const hb = await box(page, `[data-role=rb-head][data-case="${c0.id}"]`);
    if (hb) { await page.mouse.click(hb.l + 30, hb.y); await sleep(700); }
    const hist = await page.evaluate(() => { const h = document.querySelector('[data-role=rb-history]'); return h ? h.querySelectorAll('[data-role=rb-history-row]').length : -1; });
    await shot(page, `real-${tag}-history`);
    check(`[${tag}] 행 머리 → 넘김 이력(일 + 보고 = ${c0.units.length + (c0.reports || []).length})`, hist === c0.units.length + (c0.reports || []).length, hist);
    await page.keyboard.press('Escape'); await sleep(300);
    await page.evaluate(() => window.__mtTa.fit()); await sleep(600);
    await page.click(`[data-role=mm-sum-case][data-case="${c0.id}"]`); await sleep(1300);
    const hc = await page.evaluate((id) => { const el = document.querySelector(`[data-role=rb-head][data-case="${id}"]`); const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, blink: el.classList.contains('blink') }; }, c0.id);
    check(`[${tag}] 요약 열 건 → 행 머리(반짝임)`, hc.t > 80 && hc.b < 1291 - 100 && hc.blink, hc);
    const target = f.folded[0] || null;
    if (target) {
      const sid = g.nodes.find((n) => n.name === target).sessionId;
      await page.evaluate(() => window.__mtTa.fit()); await sleep(600);
      await page.evaluate((s) => window.__mt.getState().mapFocus.session(s), sid); await sleep(1400);
      const sf = await page.evaluate((s) => { const el = document.querySelector(`.mt-ta-slot[data-id="s:${s}"]`); return el ? { blink: el.classList.contains('blink'), chip: el.dataset.chip } : null; }, sid);
      await shot(page, `real-${tag}-sidebar`);
      check(`[${tag}] 사이드바 누르기(접힌 ${target}) → 줄을 펴고 칩 반짝임`, !!sf && sf.blink, sf);
      await page.click('[data-role=rb-fold]'); await sleep(600);
    }
    await setLang(page, 'ko');
    await page.evaluate(() => window.__mtTa.fit()); await sleep(900);
    await shot(page, `real-${tag}-fit-ko`);
    await zoomBand(page, 0.8); await sleep(900);
    await shot(page, `real-${tag}-zoom-ko`);
    await setLang(page, 'en');
    await closeMission(page);
  } finally {
    await closeApp(app);
  }
}

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
    await page.evaluate(() => window.__mtTa.fit()); await sleep(900);
    await shot(page, 'pc-fit-en');
    const facts = await page.evaluate((off) => {
      const L = window.__mtTa.lay();
      const q = (s) => [...document.querySelectorAll(s)];
      return {
        seats: q('[data-role=rb-seat]').map((x) => `${x.dataset.seat}${x.classList.contains('old') ? '(old)' : ''}`),
        heads: q('[data-role=rb-head][data-case]').map((x) => `${x.dataset.case}:${x.dataset.state}`),
        counts: q('[data-role=rb-count]').map((x) => x.textContent),
        marks: q('[data-role=rb-mark]').map((x) => `${x.dataset.case}:${x.dataset.kind}`),
        folds: q('[data-role=rb-fold]').map((x) => x.textContent),
        lines: q('[data-role=rb-line]').length,
        chips: q('.mt-ta-slot[data-chip]').map((x) => x.querySelector('.mt-ta-card').dataset.name),
        bandCards: q('.mt-ta-slot[data-band]').length,
        folded: [...L.cards.values()].filter((c) => c.folded).map((c) => c.node.name),
        offBand: q(`.mt-ta-slot[data-ws="${off}"][data-band]`).length,
        bands: L.rb.list.map((b) => b.ws),
        flows: q('[data-role=ln-flow], [data-role=ln-flow-label]').length,
        sumCases: q('[data-role=mm-sum-case]').map((x) => x.dataset.case),
        k: window.__mtTa.view().k,
      };
    }, offKey);
    log(JSON.stringify(facts));
    check('자리 머리: 판이 준 열 차례, 옛 자리(tester) 표시', facts.seats.join() === 'main,worker,reviewer,docs,manager,tester(old)', facts.seats);
    check('행 머리 차례: 주인 대기 → 열림(최근 넘김) → 주기 → 취소', facts.heads.join() === 'c-wait:waiting_owner,c-open:open,c-cycle:open,c-cancel:cancelled', facts.heads);
    check('되돌아감 호 지금 셈 2/2와 올림 ↑1(마지막 호에만)', facts.counts.length >= 1 && facts.counts.some((x) => x.startsWith('2/2') && x.includes('↑1')), facts.counts);
    check('칸 표시: 보고·주인 대기(c-wait), 줄 선 일(c-open), keep 일 있음(c-cycle)', ['c-wait:report', 'c-wait:wait', 'c-open:queue', 'c-cycle:holds'].every((x) => facts.marks.includes(x)), facts.marks);
    check('접힌 줄 "+3 closed cases"와 그 안 세션은 그리지 않는 카드 항목(worker-0)', facts.folds.some((x) => /\+3/.test(x)) && facts.folded.includes('worker-0') && !facts.chips.includes('worker-0'), { folds: facts.folds, folded: facts.folded });
    check('칩은 쉼·잠듦만(worker-1·reviewer-1·reviewer-2·tester-1), 일하는 세션은 카드', ['worker-1', 'reviewer-1'].every((x) => facts.chips.includes(x)) && !facts.chips.includes('worker-2') && !facts.chips.includes('docs-1'), facts.chips);
    check('rig 없는 워크스페이스에는 띠가 없고, P186 흐름 줄이 없다', facts.offBand === 0 && facts.bands.length === 1 && facts.flows === 0, facts);
    check('잇는 선이 그려진다(갈라짐·호·보고)', facts.lines >= 6, facts.lines);
    await zoomBand(page, 0.85); await sleep(900);
    await shot(page, 'pc-zoom-en');
    // 띠 아래 나무 뿌리(helper)와 옅은 선
    const be = await page.evaluate(() => { const p = document.querySelector('.mt-ta-edge.band'); return p ? p.getAttribute('d') : null; });
    check('띠 세션의 자리 없는 하위(helper)로 가는 옅은 선', !!be, be);
    // ---- 한국어 ----
    await setLang(page, 'ko');
    await page.evaluate(() => window.__mtTa.fit()); await sleep(900);
    await shot(page, 'pc-fit-ko');
    await zoomBand(page, 0.85); await sleep(900);
    await shot(page, 'pc-zoom-ko');
    const ko = await page.evaluate(() => ({ fold: (document.querySelector('[data-role=rb-fold]') || {}).textContent, head: (document.querySelector('[data-role=rb-head][data-case=c-wait] .pill') || {}).textContent, mark: (document.querySelector('[data-role=rb-mark][data-kind=queue]') || {}).textContent }));
    check('한국어: 접힌 줄·상태·줄 선 일', /끝남/.test(ko.fold || '') && /주인/.test(ko.head || '') && /줄/.test(ko.mark || ''), ko);
    await setLang(page, 'en');
    // ---- 행 머리 누르기 = 넘김 이력 ----
    await zoomBand(page, 0.85); await sleep(700);
    const hb = await box(page, '[data-role=rb-head][data-case=c-open]');
    await page.mouse.click(hb.l + 30, hb.y); await sleep(700);
    const hist = await page.evaluate(() => { const h = document.querySelector('[data-role=rb-history]'); return h ? { rows: h.querySelectorAll('[data-role=rb-history-row]').length, text: h.innerText.slice(0, 400) } : null; });
    await shot(page, 'pc-history');
    check('행 머리 누르기 → 넘김 이력(일 5개)', !!hist && hist.rows === 5, hist);
    await page.keyboard.press('Escape'); await sleep(300);
    check('Esc는 넘김 이력만 닫는다', !(await page.$('[data-role=rb-history]')) && !!(await page.$('[data-role=mission]')));
    // ---- 요약 열 건 누르기 = 그 행 머리로 ----
    await page.evaluate(() => window.__mtTa.fit()); await sleep(700);
    await page.click('[data-role=mm-sum-case][data-case=c-cycle]'); await sleep(1300);
    const hc = await page.evaluate(() => { const el = document.querySelector('[data-role=rb-head][data-case=c-cycle]'); const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, b: r.bottom, w: innerWidth, h: innerHeight, blink: el.classList.contains('blink'), k: window.__mtTa.view().k }; });
    await shot(page, 'pc-sum-case');
    check('요약 열 건 누르기 → 그 행 머리가 화면 안에(반짝임)', hc.t > 80 && hc.b < hc.h - 100 && hc.l >= 0 && hc.blink, hc);
    // ---- 사이드바 누르기(접힌 줄 안 세션) = 줄을 펴고 그 칩으로 ----
    await page.evaluate(() => window.__mtTa.fit()); await sleep(700);
    const ok = await page.evaluate(() => window.__mt.getState().mapFocus.session('s-old')); await sleep(1400);
    const sf = await page.evaluate(() => { const el = document.querySelector('.mt-ta-slot[data-id="s:s-old"]'); const f = document.querySelector('[data-role=rb-fold]'); if (!el) return { el: false, open: f && f.dataset.open }; const r = el.getBoundingClientRect(); return { el: true, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: innerWidth, h: innerHeight, blink: el.classList.contains('blink'), chip: el.dataset.chip, open: f && f.dataset.open, mission: !!document.querySelector('[data-role=mission]') }; });
    await shot(page, 'pc-sidebar-folded');
    check('사이드바 누르기(접힌 세션) → 접힌 줄을 펴고 그 칩이 가운데에서 반짝임, 판으로 뛰지 않음', ok && sf.el && sf.open === '1' && sf.blink && sf.chip === '1' && sf.mission && Math.abs(sf.cx - (2205 - 300) / 2) < 300, sf);
    // 접힌 줄을 다시 접기
    await page.click('[data-role=rb-fold]'); await sleep(800);
    check('접힌 줄 단추로 다시 접는다', await page.evaluate(() => { const f = document.querySelector('[data-role=rb-fold]'); return !!f && !f.dataset.open && !document.querySelector('.mt-ta-slot[data-id="s:s-old"]'); }));
    // 띠 카드 사이드바 누르기(worker-2) = 그 카드로
    const ok2 = await page.evaluate(() => window.__mt.getState().mapFocus.session('s-w2')); await sleep(1300);
    const w2 = await page.evaluate(() => { const el = document.querySelector('.mt-ta-slot[data-id="s:s-w2"]'); return { blink: el.classList.contains('blink') }; });
    check('사이드바 누르기(띠 카드) → 그 카드 반짝임', ok2 && w2.blink, w2);
    // 표시 누르기(주인 대기) → main 머리 카드로
    await zoomBand(page, 0.85); await sleep(700);
    await page.click('[data-role=rb-mark][data-kind=wait]'); await sleep(1300);
    check('표시 누르기 → keep 머리 카드(main) 반짝임', await page.evaluate(() => document.querySelector('.mt-ta-slot[data-id="s:s-main"]').classList.contains('blink')));
    // ---- Alt 끌기: 띠 카드는 끌기가 아니고, 띠는 놓을 곳이 아니다 ----
    await zoomBand(page, 0.7); await sleep(700);
    const c2 = await box(page, '.mt-ta-slot[data-id="s:s-w2"] .mt-ta-card');
    const v0 = await page.evaluate(() => window.__mtTa.view());
    await page.keyboard.down('Alt'); await page.mouse.move(c2.x, c2.y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(c2.x + i * 20, c2.y + i * 25); await sleep(30); }
    const d1 = await page.evaluate(() => ({ drop: !document.querySelector('.mt-sm-drop').hidden, moving: !!document.querySelector('.mt-ta-slot.moving') }));
    await page.mouse.up(); await page.keyboard.up('Alt'); await sleep(500);
    const v1 = await page.evaluate(() => window.__mtTa.view());
    check('Alt+띠 카드 끌기 = 관계 끌기 아님(시점 이동)', !d1.drop && !d1.moving && (v1.x !== v0.x || v1.y !== v0.y), { d1, v0, v1 });
    // 나무 카드(helper)를 Alt로 끌어 띠 위에 놓기 = 놓을 곳 없음
    const hp = await box(page, '.mt-ta-slot[data-id="s:s-h"] .mt-ta-card');
    const bb = await box(page, '.mt-rb');
    let d2 = null;
    if (hp && bb) {
      await page.keyboard.down('Alt'); await page.mouse.move(hp.x, hp.y); await page.mouse.down();
      const tx = bb.l + 80, ty = bb.t + 120;
      for (let i = 1; i <= 10; i++) { await page.mouse.move(hp.x + (tx - hp.x) * i / 10, hp.y + (ty - hp.y) * i / 10); await sleep(30); }
      d2 = await page.evaluate(() => ({ drop: !document.querySelector('.mt-sm-drop').hidden, moving: !!document.querySelector('.mt-ta-slot.moving') }));
      await page.keyboard.press('Escape'); await page.mouse.up(); await page.keyboard.up('Alt'); await sleep(500);
    }
    check('나무 카드를 Alt로 끌어 띠 위에 = 놓을 곳 없음', !!d2 && d2.moving && !d2.drop, d2);
    // ---- rig.cases 이벤트 → 다시 읽기 ----
    const n0 = await page.evaluate(() => window.__p198calls);
    await page.evaluate((k) => window.__mt.api.emit('rig.cases', { workspace: k }), rigKey); await sleep(1500);
    const n1 = await page.evaluate(() => window.__p198calls);
    check('rig.cases 이벤트를 받으면 맵이 그래프를 다시 읽는다', n1 > n0, { n0, n1 });
    // ---- rig 없는 워크스페이스 ----
    await page.evaluate((k) => window.__mt.getState().mapFocus.ws(k), offKey); await sleep(1000);
    await shot(page, 'pc-off');
    const off = await page.evaluate((k) => ({ cards: document.querySelectorAll(`.mt-ta-slot[data-ws="${k}"]`).length, band: document.querySelectorAll(`.mt-ta-slot[data-ws="${k}"][data-band]`).length }), offKey);
    check('rig 없는 워크스페이스 줄은 전과 같은 나무(띠 없음)', off.cards === 3 && off.band === 0, off);
    await closeMission(page);
  } finally {
    await closeApp(app);
  }
}

// 휴대폰 폭: 휴대폰 화면은 웹에서만 뜬다(P166과 같은 길). 흉내 tailscale 프록시(SIM) → 기기 짝짓기 → 390×844 터치 흉내 Chromium.
// 백엔드는 ATRIUM_TAILSCALE(p49-fake-tailscale.mjs)·P49_FAKE_TS_PORT·ATRIUM_WEB_HOSTS(pc.example.ts.net:SIM)로 띄워 둔다
const SIM = Number(process.env.P198_SIM || 47988);
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
    await shot(page, 'phone-fit');
    const p = await page.evaluate(() => {
      const L = window.__mtPm.lay(), b = L.rb.list[0];
      const q = (s) => [...document.querySelectorAll(s)];
      return {
        phone: !!b && b.phone, heads: q('.mt-pmap [data-role=rb-head][data-case]').map((x) => x.dataset.case), links: q('.mt-pmap [data-role=rb-link]').length, queue: q('.mt-pmap .mt-rb-link.queue').length,
        lines: q('.mt-pmap [data-role=rb-line]').length, cards: q('.mt-pmap .mt-ta-slot[data-band]').map((x) => x.querySelector('.mt-ta-card').dataset.name),
        scrollX: document.documentElement.scrollWidth > innerWidth + 1, pills: q('[data-role=pl-case]').map((x) => x.dataset.case),
      };
    });
    check('휴대폰 갈래: 건 블록 4, 자리 사슬 칩, 줄 선 일 점선 칩, 흐름 선 없음, 지금 일하는 카드(worker-2·docs-1)와 keep 카드(main·manager)만, 가로 넘침 없음', p.phone && p.heads.length === 4 && p.links >= 8 && p.queue >= 1 && p.lines === 0 && ['main', 'manager', 'worker-2', 'docs-1'].every((x) => p.cards.includes(x)) && !p.cards.includes('worker-1') && !p.scrollX, p);
    // 첫 건 블록 확대
    await page.evaluate(() => { const L = window.__mtPm.lay(), h = L.rb.list[0].box, k = 1.1; window.__mtPm.set({ k, x: 6 - h.x * k, y: 10 - h.y * k }); }); await sleep(800);
    await shot(page, 'phone-zoom');
    await page.evaluate(() => { const L = window.__mtPm.lay(), h = L.rb.list[0].heads[1], k = 1.1; window.__mtPm.set({ k, x: 6 - h.x * k, y: 10 - h.y * k }); }); await sleep(800);
    await shot(page, 'phone-zoom-open');
    await setLang(page, 'ko'); await sleep(800);
    await shot(page, 'phone-zoom-ko');
    await setLang(page, 'en');
    await ctx.close();
  } finally {
    await browser.close();
    await sim.close?.();
  }
}

// 끌기·확대 성능(P153 perf와 같은 재기: 끌기·휠 프레임 p95 ≤ 25ms). 띠가 있는 그래프, 맞춤(멀리)과 보통 배율
const FRAMES = () => new Promise((res) => { const out = []; let last = performance.now(); const t0 = last; const f = (t) => { out.push(t - last); last = t; if (t - t0 < 2400) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); });
const stat = (a) => { const s = [...a].sort((x, y) => x - y); const q = (p) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10; return { n: a.length, p50: q(0.5), p95: q(0.95), max: Math.round(s[s.length - 1] * 10) / 10, over20: a.filter((x) => x > 20).length }; };
async function perf() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  const res = {};
  try {
    await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); }).catch(() => {});
    await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sleep(2000);
    const [rigKey, offKey] = await keysOf(page);
    // 건을 늘린 그래프(열린 건 20개)
    const g = mockGraph(rigKey, offKey);
    const R = g.rig[rigKey];
    const extra = Array.from({ length: 20 }, (_, i) => ({ ...JSON.parse(JSON.stringify(R.cases[1])), id: `c-x${i}`, lastHandoffAt: R.cases[1].lastHandoffAt - i * 1000 }));
    R.cases = [...R.cases, ...extra];
    await page.evaluate(HOOK, [g]);
    await openMission(page);
    const vb = await page.evaluate(() => { const r = document.querySelector('[data-role=ta-viewport]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    for (const lvl of ['fit', 'mid']) {
      await page.evaluate(() => window.__mtTa.fit()); await sleep(700);
      if (lvl === 'mid') await zoomBand(page, 0.85);
      await sleep(600);
      const fr = page.evaluate(FRAMES);
      await page.mouse.move(vb.x + 300, vb.y + 300); await page.mouse.down();
      for (let i = 0; i < 140; i++) { await page.mouse.move(vb.x + 300 + Math.sin(i / 10) * 250, vb.y + 300 + Math.cos(i / 12) * 150); await sleep(14); }
      await page.mouse.up();
      const drag = stat(await fr);
      const fw = page.evaluate(FRAMES);
      await page.mouse.move(vb.x + vb.w / 2, vb.y + vb.h / 2);
      for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, i % 20 < 10 ? -40 : 40); await sleep(35); }
      const wheel = stat(await fw);
      res[lvl] = { drag, wheel, cards: await page.evaluate(() => document.querySelectorAll('.mt-ta-slot').length) };
      log(`[perf] ${lvl} ${JSON.stringify(res[lvl])}`);
      check(`[perf] ${lvl}: 끌기 p95 ≤ 25ms, 휠 p95 ≤ 25ms`, drag.p95 <= 25 && wheel.p95 <= 25, res[lvl]);
    }
    await closeMission(page);
  } finally {
    await closeApp(app);
    fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(res, null, 2));
  }
}

try {
  if (WHAT === 'pc') await pc();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'perf') await perf();
  else if (WHAT === 'real') await real();
} finally {
  fs.writeFileSync(path.join(OUT, `results-${WHAT}${RTAG}.json`), JSON.stringify(results, null, 2));
  log(`끝: ${results.filter((r) => r.ok).length}/${results.length}`);
  process.exit(0);
}
