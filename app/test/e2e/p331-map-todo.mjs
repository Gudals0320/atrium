// P331 창 시험: 세션 맵 할 일 배지(카드 왼쪽 위)와 그 자리 답하기 미니 창.
// 개발용 판에 haiku 둘(lead, w1)과 셸 하나(sh3)를 띄우고, haiku가 atrium ask·todo로 진짜 카드를 남긴다(흉내 없음).
// lead: 결정(보기 둘) + 확인 = 배지 2, w1: 할 일 둘 중 하나를 미룸 = 배지 1, sh3: 없음.
// 확인: 배지 수·미룬 카드 뺌, 한 번 누르기 = 명령줄 태그 + 미니 창(1/n), 초점은 명령줄(바로 칠 수 있다), 넘기기, Esc·다른 곳 누르기로 닫힘,
// 확대하면 창이 카드를 따라감, 보기를 눌러 답하면 창이 닫히고 배지가 줄어듦, 두 번 누르기는 지금처럼 판의 그 세션으로.
// 판: 따로 띄운 개발용 판(atrium-dev-p331, 48081, backend/.dev)만. 창의 원격 디버깅 포트 9562. 한 번에 한 창만.
// 실행: node app/test/e2e/p331-map-todo.mjs <setup|seed|pc|stop> [round]
// 결과는 워크트리의 experiments/p331/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'pc';
const TAG = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p331', TAG);
const BOARD = 'atrium-dev-p331', PORT = '48081', DEBUG = '9562';
const FOLDER = 'C:\\Workspace\\mtask-p331-a', SHF = 'C:\\Workspace\\mtask-p331-b';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p331', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p331-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p331-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const sess = (n) => call('session.list').find((s) => s.name === n);
const cards = () => call('decision.list').cards;
async function waitFor(fn, ms = 120000, every = 1500) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(every); } }
const idle = (name) => waitFor(() => { const s = sess(name); return s && s.state === 'ready' && s; }, 180000, 2000);
const dropAuto = () => { for (const c of cards().filter((x) => x.auto)) call('decision.ignore', { id: c.id }); };
function runFile(name, file, cmds, reply) {
  fs.writeFileSync(file, cmds.join('\n') + '\n');
  atrium('send', '@' + name, `시험입니다. ${file} 파일의 명령을 한 줄씩 그대로 셸에서 실행하고, 끝나면 "${reply}" 한마디만 답해 주세요.`);
}
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }

async function setup() {
  for (const f of [FOLDER, SHF]) fs.mkdirSync(f, { recursive: true });
  log(atrium('backend', 'start'));
  if (!sess('lead')) log(atrium('spawn', FOLDER, '--name', 'lead', '--model', 'haiku'));
  if (!sess('w1')) log(atrium('spawn', FOLDER, '--name', 'w1', '--model', 'haiku'));
  if (!sess('sh3')) log(atrium('spawn', SHF, '--name', 'sh3', '--kind', 'shell'));
  const a = await idle('lead'); const b = await idle('w1');
  check('lead·w1이 떴다(ready), sh3', !!a && !!b && !!sess('sh3'), [a && a.state, b && b.state]);
}

const Q1 = '그림용: 어느 안으로 갈까요?', Q2 = '그림용: 설정 창에 새 단추가 보이나요?', Q3 = '그림용: npm 캐시를 확인해 주세요', Q4 = '그림용: 나중에 할 일(미룸)';
async function seed() {
  for (const c of cards()) call('decision.ignore', { id: c.id });
  await idle('lead'); await idle('w1');
  runFile('lead', path.join(FOLDER, 'p331-lead.txt'), [`atrium ask "${Q1}" --option "A안" --option "B안" --why "시험 카드입니다"`, `atrium todo "${Q2}" --check`], '남겼습니다');
  runFile('w1', path.join(FOLDER, 'p331-w1.txt'), [`atrium todo "${Q3}" --cmd "npm cache verify"`, `atrium todo "${Q4}"`], '남겼습니다');
  const ok = await waitFor(() => { const c = cards(); return [Q1, Q2, Q3, Q4].every((q) => c.some((x) => x.question === q)) && c; }, 240000, 2000);
  check('카드 넷이 생겼다', !!ok, ok && ok.map((c) => [c.id, c.name, c.kind]));
  await idle('lead'); await idle('w1'); await sleep(3000); dropAuto();
  const c4 = cards().find((c) => c.question === Q4);
  if (c4) call('decision.snooze', { id: c4.id, until: Date.now() + 6 * 3600 * 1000 });
  await sleep(500);
  const now = cards();
  check('w1의 하나는 미뤘다', !!now.find((c) => c.question === Q4 && c.deferred), now.map((c) => [c.id, c.name, c.question, c.deferred]));
}

const badgeOf = (page, name) => page.evaluate((name) => { const c = document.querySelector(`[data-role="mission"] .mt-ta-card[data-name="${name}"]`); if (!c) return 'nocard'; const b = c.querySelector('[data-role=map-todo]'); if (!b) return null; const r = b.getBoundingClientRect(), cr = c.getBoundingClientRect(); return { n: Number(b.dataset.count), text: b.textContent, title: b.title, aria: b.getAttribute('aria-label'), left: Math.round(r.left - cr.left), top: Math.round(r.top - cr.top), bg: getComputedStyle(b).backgroundColor, inlineMark: !!c.querySelector('[data-role=decision-mark]') }; }, name);
const popInfo = (page) => page.evaluate(() => { const p = document.querySelector('[data-role=map-todo-pop]'); if (!p) return null; const r = p.getBoundingClientRect(); const ae = document.activeElement; return { session: p.dataset.session, count: Number(p.dataset.count), page: (p.querySelector('[data-role=map-todo-page]') || {}).textContent || null, side: p.dataset.side, vis: getComputedStyle(p).visibility, q: (p.querySelector('[data-role=decision-question]') || {}).textContent, opts: p.querySelectorAll('[data-action=decision-option]').length, ok: !!p.querySelector('[data-action=check-ok]'), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), focusInPop: p.contains(ae), active: ae ? (ae.tagName + '.' + (ae.className || '')).slice(0, 60) : null }; });
const cardRect = (page, name) => page.evaluate((name) => { const c = document.querySelector(`[data-role="mission"] .mt-ta-card[data-name="${name}"]`); if (!c) return null; const r = c.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }, name);
const barText = (page) => page.evaluate(() => { const ae = document.activeElement; const ta = ae && ae.matches && ae.matches('textarea.mt-cmd-input') ? ae : [...document.querySelectorAll('textarea.mt-cmd-input')].find((x) => x.offsetParent); return ta ? { v: ta.value, focused: document.activeElement === ta } : null; });

async function pc() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    call('settings.set', { key: 'language', value: 'ko' }); await sleep(800);
    const side = await page.evaluate(() => !!document.querySelector('[data-role=sidebar]'));
    if (side) { await page.click('[data-role=top-left] [data-action=sidebar]').catch(() => {}); await sleep(600); }
    await page.click('[data-role=sessions-pill]'); await sleep(1500);
    await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 }); await sleep(1200);
    // 보기 배율을 보통(100%)으로, lead 카드가 가운데쯤
    await page.evaluate(() => { const L = window.__mtTa.lay(); const hit = [...L.cards.entries()].find(([, b]) => b.node.name === 'lead'); window.__mtTa.flyTo(hit[0], 1); });
    await sleep(900);

    // 1) 배지
    const bl = await badgeOf(page, 'lead'), bw = await badgeOf(page, 'w1'), bs = await badgeOf(page, 'sh3');
    check('lead 배지 2(수 보임, 제목 "할 일 2")', bl && bl.n === 2 && /2/.test(bl.text) && bl.title === '할 일 2' && bl.aria === '할 일 2', bl);
    check('배지는 카드 왼쪽 위(작업 완료 꼬리표 자리의 반대)', bl && bl.left < 40 && bl.top < 0, bl);
    check('이름 옆 할 일 표식은 배지로 갈음(PC 맵)', bl && !bl.inlineMark, bl);
    check('w1 배지 1(미룬 카드 뺌, 수 안 보임)', bw && bw.n === 1 && !/\d/.test(bw.text), bw);
    check('sh3 배지 없음', bs === null, bs);
    await shot(page, 'badges-ko');
    const lc = await cardRect(page, 'lead');
    if (lc) await shot(page, 'badges-zoom-ko', { clip: { x: Math.max(0, lc.x - 40), y: Math.max(0, lc.y - 40), width: Math.min(900, lc.w * 2 + 120), height: lc.h + 120 } });

    // 2) 한 번 누르기 = 태그 + 미니 창
    await page.click('[data-role="mission"] .mt-ta-card[data-name="lead"]'); await sleep(500);
    let p = await popInfo(page);
    const bar1 = await barText(page);
    check('누르면 명령줄에 @lead 태그', bar1 && /@lead\b/.test(bar1.v), bar1);
    check('미니 창이 뜬다(lead, 2장, 1/2, 보기 단추 둘)', p && p.count === 2 && p.page === '1/2' && p.opts === 2 && p.q === `${Q1}`, p);
    check('창은 카드 위·아래·옆(보이는 자리)', p && p.vis === 'visible' && ['top', 'bottom', 'right', 'left'].includes(p.side), p);
    check('초점은 창 안이 아니다', p && !p.focusInPop, p);
    await page.keyboard.type('hi'); await sleep(250);
    const bar2 = await barText(page);
    check('창을 연 뒤 바로 친 글자가 명령줄에 들어간다', bar2 && bar2.focused && /@lead\s+hi$/.test(bar2.v), bar2);
    await shot(page, 'pop-decide-ko');
    // 넘기기(누른 뒤에도 명령줄 초점 유지)
    await page.click('[data-role=map-todo-pop] [data-action=map-todo-next]'); await sleep(300);
    p = await popInfo(page); const bar3 = await barText(page);
    check('다음으로 넘기면 2/2 확인 카드', p && p.page === '2/2' && p.ok, p);
    check('창 단추를 눌러도 명령줄 초점 유지', bar3 && bar3.focused, bar3);
    await shot(page, 'pop-check-ko');
    // 확대하면 창이 카드를 따라간다
    const before = { p: await popInfo(page), c: await cardRect(page, 'lead') };
    const vp = await page.$('[data-role=ta-viewport]'); const vb = await vp.boundingBox();
    await page.mouse.move(vb.x + vb.width * 0.3, vb.y + vb.height * 0.6);
    await page.mouse.wheel(0, 240); await sleep(500);
    const after = { p: await popInfo(page), c: await cardRect(page, 'lead') };
    const rel = (o) => o.p && o.c && (o.p.side === 'top' ? o.c.y - (o.p.y + o.p.h) : o.p.side === 'bottom' ? o.p.y - (o.c.y + o.c.h) : o.p.side === 'right' ? o.p.x - (o.c.x + o.c.w) : o.c.x - (o.p.x + o.p.w));
    check('확대해도 창이 열린 채 카드 옆을 따라간다(간격 10px 안팎)', after.p && after.c && (before.c.w !== after.c.w) && Math.abs(rel(after) - 10) <= 3, { before, after, gapBefore: rel(before), gapAfter: rel(after) });
    // Esc → 창만 닫힘(맵은 그대로)
    await page.keyboard.press('Escape'); await sleep(300);
    check('Esc: 창만 닫힌다(세션 맵은 그대로)', !(await popInfo(page)) && (await page.evaluate(() => !!window.__mt.getState().missionOpen)));
    // 다른 세션(w1) → 다른 곳 누르기로 닫힘
    await page.evaluate(() => { const L = window.__mtTa.lay(); const hit = [...L.cards.entries()].find(([, b]) => b.node.name === 'lead'); window.__mtTa.flyTo(hit[0], 1); }); await sleep(800);
    await page.click('[data-role="mission"] .mt-ta-card[data-name="w1"]'); await sleep(400);
    p = await popInfo(page);
    check('w1을 누르면 w1 창(1장, 넘기기 없음, 할 일 카드)', p && p.count === 1 && p.page === null && p.q === `${Q3}`, p);
    await shot(page, 'pop-do-ko');
    await page.mouse.click(vb.x + 30, vb.y + vb.height - 160); await sleep(400);
    check('빈 곳을 누르면 닫힌다', !(await popInfo(page)));
    // 셸(sh3)은 할 일이 없으니 창이 없다
    await page.click('[data-role="mission"] .mt-ta-card[data-name="sh3"]').catch(() => {}); await sleep(300);
    check('할 일 없는 세션은 창이 뜨지 않는다', !(await popInfo(page)));
    // 3) 답하기: lead 창의 보기 A안 → 창 닫힘, 배지 1
    const bar4 = await barText(page);
    if (bar4 && /@lead\b/.test(bar4.v)) { await page.click('[data-role="mission"] .mt-ta-card[data-name="lead"]'); await sleep(300); } // 태그를 뺐다가
    await page.click('[data-role="mission"] .mt-ta-card[data-name="lead"]'); await sleep(400);
    p = await popInfo(page);
    check('다시 누르면 lead 창(태그 넣는 누르기)', p && p.session && p.count === 2, p);
    await page.click('[data-role=map-todo-pop] [data-action=decision-option][data-option="A안"]');
    await sleep(1200);
    check('보기를 눌러 답하면 창이 닫힌다', !(await popInfo(page)));
    const bl2 = await badgeOf(page, 'lead');
    check('lead 배지가 1로 줄었다', bl2 && bl2.n === 1, bl2);
    check('판에서 그 카드가 닫혔다', !cards().some((c) => c.question === Q1));
    await shot(page, 'after-answer-ko');
    // 4) 두 번 누르기는 지금처럼 판의 그 세션으로
    await page.dblclick('[data-role="mission"] .mt-ta-card[data-name="w1"]'); await sleep(1200);
    check('두 번 누르기: 세션 맵이 닫히고 판으로', !(await page.evaluate(() => !!window.__mt.getState().missionOpen)) && !(await popInfo(page)));
  } finally { await closeApp(app); }
}

async function stopAll() {
  for (const n of ['lead', 'w1', 'sh3']) { try { if (sess(n)) log(atrium('kill', n, '--yes')); } catch (e) { log('kill ' + e.message); } }
  try { log(atrium('terminal', 'stop', '--yes')); } catch (e) { log('terminal stop ' + e.message); }
  try { log(atrium('backend', 'stop')); } catch (e) { log('backend stop ' + e.message); }
}

try {
  if (WHAT === 'setup') await setup();
  else if (WHAT === 'seed') await seed();
  else if (WHAT === 'pc') await pc();
  else if (WHAT === 'stop') await stopAll();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p331-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
