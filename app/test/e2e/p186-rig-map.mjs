// P186 창 시험: 세션 맵의 rig 자리 이름표, 흐름 줄(n/max), 요약 열 건 목록, 끝난 fresh 세션 얇은 줄, 노드 메뉴 자리 정하기(세션 맵·판), 미리 보기 훅·도구 줄,
// rig 없는 워크스페이스. 판: 따로 띄운 개발용 판(P186_BOARD, P186_PORT, P186_DATA)만. 창 원격 디버깅 포트 P186_DEBUG. 한 번에 창 하나.
// 판에는 미리 rig가 켜진 시험 폴더(main keep · worker fresh · reviewer fresh, 반려 한 번 뒤 worker-2가 열린 일을 쥔 상태)와 rig 없는 시험 폴더가 있어야 한다.
// 실행: node app/test/e2e/p186-rig-map.mjs   (실제 판 변수를 지운 셸에서) 결과는 워크트리의 experiments/p186/shots/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p186', 'shots');
const BOARD = process.env.P186_BOARD || 'atrium-dev-p186', PORT = process.env.P186_PORT || '47955', DEBUG = process.env.P186_DEBUG || '9435';
const DATA = process.env.P186_DATA || path.join(process.env.LOCALAPPDATA || '', 'atrium-dev-p186');
const RIGWS = process.env.P186_RIGWS || 'mtask-p186-a', OFFWS = process.env.P186_OFFWS || 'mtask-p186-off';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT, ATRIUM_DATA_DIR: DATA, ATRIUM_APP_USERDATA: path.join(REPO, 'backend', '.dev', 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(REPO, 'backend', '.dev', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p186-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, shot: shot0 } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV);
const log = logger('p186-rig-map');
const shot = (pg, n) => shot0(pg, n, log);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];

async function closeMission(pg) { for (let i = 0; i < 3 && (await pg.$('[data-role="mission"]')); i++) { await pg.keyboard.press('Escape'); await sleep(400); } }
async function openMission(pg) {
  await closeMission(pg);
  await pg.click('[data-action="mission-rail"]');
  await pg.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 });
  await sleep(1500);
}
const cardOf = (pg, name) => pg.evaluate((n) => { const el = document.querySelector(`.mt-ta-card[data-name="${n}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { id: el.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, name);

const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
try {
  await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); }).catch(() => {});
  await page.setViewportSize({ width: 2205, height: 1291 }).catch(() => {});
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { try { localStorage.setItem('atrium.sessionMap.summary', '1'); } catch { /* */ } });
  await sleep(2500);
  await openMission(page);
  await page.evaluate(() => window.__mtTa.fit()); await sleep(900);
  await shot(page, 'pc-fit');
  const facts = await page.evaluate(() => {
    const lay = window.__mtTa.lay();
    return {
      seats: [...document.querySelectorAll('.mt-ta-slot[data-seat]')].map((x) => `${x.querySelector('.mt-ta-card').dataset.name}:${x.dataset.seat}`),
      thin: [...document.querySelectorAll('.mt-ta-slot.thin')].map((x) => x.querySelector('.mt-ta-card').dataset.name),
      flows: [...document.querySelectorAll('[data-role=ln-flow-label]')].map((x) => x.textContent),
      cases: [...document.querySelectorAll('[data-role=mm-sum-case]')].map((x) => ({ state: x.dataset.state, text: x.innerText.replace(/\s+/g, ' '), go: x.dataset.go })),
      casesSec: !!document.querySelector('[data-role=mm-sum-cases]'),
      rows: lay.rows.map((r) => r.name), k: window.__mtTa.view().k,
    };
  });
  log(JSON.stringify(facts));
  check('자리 이름표(main·worker·reviewer)', ['main:main'].every((x) => facts.seats.includes(x)) && facts.seats.some((x) => x.endsWith(':worker')) && facts.seats.some((x) => x.endsWith(':reviewer')), facts.seats);
  check('끝난 fresh 세션은 얇은 줄(worker-1)', facts.thin.includes('worker-1'), facts.thin);
  check('흐름 줄 이름표와 반려 1/2', facts.flows.includes('rejected 1/2') && facts.flows.includes('assign'), facts.flows);
  check('요약 열 건 목록(열린 건)', facts.casesSec && facts.cases.some((c) => c.state === 'open'), facts.cases);
  // 확대: main 카드 근처
  const main = await page.evaluate(() => [...window.__mtTa.lay().cards.entries()].find(([, b]) => b.node.name === 'main')[0]);
  await page.evaluate((id) => { const lay = window.__mtTa.lay(), b = lay.cards.get(id), v = window.__mtTa.view(); window.__mtTa.set({ k: 0.9, x: window.__mtTa.rail + 40 - (b.x - 60) * 0.9, y: window.__mtTa.top + 30 - (b.y - 120) * 0.9 }); }, main); await sleep(900);
  await shot(page, 'pc-zoom');
  // 건 줄 누르기 → 지금 일이 있는 카드로
  const go = facts.cases.find((c) => c.state === 'open');
  if (go) {
    await page.evaluate(() => window.__mtTa.fit()); await sleep(700);
    await page.click(`[data-role=mm-sum-case][data-state=open]`); await sleep(1100);
    const centered = await page.evaluate((id) => { const el = document.querySelector(`.mt-ta-slot[data-id="${id}"]`); const r = el.getBoundingClientRect(); return { cx: r.left + r.width / 2, w: innerWidth, blink: el.classList.contains('blink') }; }, go.go);
    await shot(page, 'pc-case-click');
    check('건 줄 누르기 → 그 카드가 가운데로(반짝임)', go.go && Math.abs(centered.cx - (2205 - 300) / 2) < 260, { go: go.go, centered });
  }
  // 미리 보기: worker-2(훅·도구 기록)
  await page.evaluate(() => window.__mtTa.fit()); await sleep(600);
  await page.evaluate((id) => window.__mtTa.flyTo(id, 0.9), main); await sleep(900);
  for (const nm of ['worker-2', 'reviewer-1']) {
    const c = await cardOf(page, nm);
    if (!c) { check(`미리 보기 ${nm}: 카드`, false); continue; }
    await page.mouse.move(c.x, c.y); await sleep(1600);
    const pk = await page.evaluate(() => { const p = document.querySelector('[data-role=ln-peek]'); return p ? { rig: p.querySelector('[data-role=ln-peek-rig]') ? p.querySelector('[data-role=ln-peek-rig]').innerText : null, seat: p.querySelector('.pk2').innerText } : null; });
    await shot(page, `pc-peek-${nm}`);
    // worker는 rig 도구(count)를 돌렸다. reviewer는 도구를 쓰지 않았고, 넘김 deliver 훅은 띄우기 전이라 세션 없이 기록된다(P185) → 줄 없음
    check(`미리 보기 ${nm}: 자리${nm.startsWith('worker') ? '와 훅·도구 줄' : '(훅·도구 기록 없음 = 줄 없음)'}`, !!pk && /seat|자리/.test(pk.seat) && (nm.startsWith('worker') ? !!pk.rig : !pk.rig), pk);
    await page.mouse.move(5, 400); await sleep(400);
  }
  // 노드 메뉴(세션 맵): worker-2 오른쪽 누르기
  let c = await cardOf(page, 'worker-2');
  await page.mouse.click(c.x, c.y, { button: 'right' }); await sleep(1200);
  const menu = await page.evaluate(() => { const m = document.querySelector('[data-role=ln-node-menu]'); return m ? { seats: [...m.querySelectorAll('[data-action=seat-set]')].map((b) => `${b.dataset.seat}${b.disabled ? '(x)' : ''}`), clear: !!m.querySelector('[data-action=seat-clear]') } : null; });
  await shot(page, 'pc-node-menu');
  check('세션 맵 노드 메뉴: 자리 정하기(main은 다른 세션이 쥠, worker는 지금 자리), 없애기', !!menu && menu.seats.includes('main(x)') && menu.seats.includes('worker(x)') && menu.seats.includes('reviewer') && menu.clear, menu);
  await page.keyboard.press('Escape'); await sleep(300);
  check('Esc는 노드 메뉴만 닫는다', !(await page.$('[data-role=ln-node-menu]')) && !!(await page.$('[data-role=mission]')));
  // rig 없는 워크스페이스의 카드는 메뉴 없음
  const offKey = await page.evaluate((n) => (window.__mtTa.lay().rows.find((r) => r.name === n) || {}).key, OFFWS);
  await page.evaluate((k) => window.__mt.getState().mapFocus.ws(k), offKey); await sleep(900);
  await shot(page, 'pc-off');
  c = await cardOf(page, 'off-sh');
  if (c) { await page.mouse.click(c.x, c.y, { button: 'right' }); await sleep(600); }
  check('rig 없는 워크스페이스: 이름표·흐름 줄·메뉴 없음', !!c && !(await page.$('[data-role=ln-node-menu]')) && !(await page.$(`.mt-ta-slot[data-ws="${offKey}"][data-seat]`)), { c: !!c });
  await closeMission(page);
  // 판의 ⋯ 메뉴: worker-2
  const sid = await page.evaluate(() => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === 'worker-2'); return s && s.sessionId; });
  await page.evaluate((s) => window.__mt.getState().navigateTo(s, { instant: true }), sid); await sleep(1500);
  const btn = await page.$(`.react-flow__node[data-id="${sid}"] [data-action=node-menu]`) || await page.$(`[data-id="${sid}"] [data-action=node-menu]`);
  if (btn) { await btn.click(); await sleep(1200); }
  const nm = await page.evaluate(() => { const m = document.querySelector('[data-role=node-menu]'); return m ? [...m.querySelectorAll('[data-action=seat-set]')].map((b) => `${b.dataset.seat}${b.disabled ? '(x)' : ''}`) : null; });
  await shot(page, 'canvas-node-menu');
  check('판 노드 메뉴: 자리 정하기 줄', !!nm && nm.includes('reviewer'), { btn: !!btn, nm });
} finally {
  await closeApp(app);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`끝: ${results.filter((r) => r.ok).length}/${results.length}`);
  process.exit(0);
}
