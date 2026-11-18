// P214 창 시험: 위 막대(목업 2차). 탭 줄 1행·2행·"+n"과 계단 배경, 0인 알약 숨김, 사용량 한 줄 꼴과 AGY 묶음 규칙, 검색 칸 없음과 Ctrl+F 찾기 창.
// 판: 터미널 세션 atrium-dev-p214, 포트 47988, 이 워크트리의 backend/.dev(data, app). 창의 원격 디버깅 포트 9468.
// P214_STAGE
//   shot: C:\Workspace\mtask-p214\ 아래 새 폴더만 프로젝트로 연다(묶음 둘: multitask, infra). 세션 수·응답 필요는 창 안 session.updated로,
//     사용량은 usage.updated로 흉내 낸다. 창 폭 1920·1366 × 탭 5·12 × ko·en을 찍고, Ctrl+F 찾기 창, 사용량 펼침, "+n" 목록을 본다.
//     목업 2차 그림(experiments/p213/crop)과 나란히 놓은 비교 그림을 만든다(Edge 헤드리스).
//   sheet: 찍어 둔 그림으로 비교 그림만 다시 만든다.
//   clean: 판 멈추기, 시험 폴더·판 데이터·hc 상태 폴더 지우기(shot은 빈 판에서 시작한다).
// 결과는 experiments/p214/(git 밖). 실행(워크트리 루트): P214_STAGE=shot node app/test/e2e/p214-topbar.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const STAGE = process.env.P214_STAGE || 'shot';
if (!['shot', 'clean', 'sheet'].includes(STAGE)) throw new Error('P214_STAGE=shot|clean|sheet');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p214');
const MOCK = process.env.P214_MOCK || path.join(REPO, 'experiments', 'p213', 'crop'); // 목업 2차 그림(주 체크아웃의 experiments를 줄 수 있다)
const CONVOS = path.join(OUT, 'convos');
const ROOT = 'C:\\Workspace\\mtask-p214';
const BOARD = { session: 'atrium-dev-p214', port: 47988, cdp: 9468 };
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD.session, ATRIUM_HERDR_SESSION: BOARD.session, ATRIUM_PORT: String(BOARD.port),
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: 'p214',
};
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k]; // 실제 판의 값을 물려받지 않는다
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until, closeApp, launch } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const { pathKey } = await import(pathToFileURL(path.join(REPO, 'backend', 'src', 'workspaces.mjs')).href);

const log = logger('p214-' + STAGE);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)) : '')); };
const rmrf = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { log('지우기 실패 ' + p + ': ' + e.message.slice(0, 120)); } };

if (STAGE === 'sheet') { await sheets(); process.exit(0); }
if (STAGE === 'clean') {
  try { log('터미널 멈춤', atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('터미널 멈춤 실패', e.message.slice(0, 200)); }
  try { log('백엔드 멈춤', atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('백엔드 멈춤 실패', e.message.slice(0, 200)); }
  rmrf(ROOT);
  // 판 데이터와 창 프로필, 이 판의 hc 상태 폴더(다음 실행이 빈 판에서 시작하게)
  rmrf(path.join(DEV, 'data')); rmrf(path.join(DEV, 'app'));
  if (process.env.LOCALAPPDATA) rmrf(path.join(process.env.LOCALAPPDATA, 'herdr-core', BOARD.session));
  process.exit(0);
}

// 탭 열둘(목업 2차의 붐빔과 같은 이름과 수). 묶음 둘은 저절로 만든 폴더 묶음(뿌리에 README.md, 구성 둘)
const TABS = [
  { name: 'multitask', group: ['app', 'docs'], n: [5, 4] },
  { name: 'lms-web', n: 2 }, { name: 'scratch', n: 0 }, { name: 'atrium-docs', n: 1 }, { name: 'payments-service-backend', n: 3, need: 1 },
  { name: 'infra', group: ['net', 'k8s'], n: [2, 2] }, { name: 'notes', n: 0 }, { name: 'experiments-2026-november', n: 1 },
  { name: 'collector', n: 2, need: 1 }, { name: 'api', n: 1 }, { name: 'design-system-tokens', n: 0 }, { name: 'q', n: 1 },
];
const dirsOf = (t) => (t.group ? t.group.map((g) => path.join(ROOT, t.name, g)) : [path.join(ROOT, t.name)]);
for (const t of TABS) {
  for (const d of dirsOf(t)) fs.mkdirSync(d, { recursive: true });
  if (t.group) fs.writeFileSync(path.join(ROOT, t.name, 'README.md'), '# p214 test project root\n');
}
const fakeSessions = (upto) => {
  const out = []; let i = 0;
  TABS.slice(0, upto).forEach((t) => {
    const ds = dirsOf(t), ns = t.group ? t.n : [t.n];
    ds.forEach((d, j) => { for (let k = 0; k < ns[j]; k++) out.push({ sessionId: 'fake-' + (++i), name: t.name + '-' + (k + 1), workspaceKey: pathKey(d), kind: 'shell', state: t.need && k < t.need ? 'waiting' : 'shell_idle', createdAt: Date.now() - 60000, lastActivityAt: Date.now() }); });
  });
  return out;
};
const NOW = Date.now();
const USAGE = { alertsOn: true, providers: {
  claude: { provider: 'claude', source: 'statusline', at: NOW - 60000, plan: null, model: 'Haiku 5.5', credits: null, windows: [{ id: '5h', minutes: 300, usedPct: 34, resetsAt: NOW + 7800000 }, { id: 'week', minutes: 10080, usedPct: 89, resetsAt: NOW + 67440000 }] },
  codex: { provider: 'codex', source: 'rollout', at: NOW, plan: 'plus', model: null, credits: { hasCredits: true, unlimited: false, balance: '44209' }, windows: [{ id: '5h', minutes: 300, usedPct: 42, resetsAt: NOW + 12660000 }, { id: 'week', minutes: 10080, usedPct: 88, resetsAt: NOW + 92640000 }] },
  agy: { provider: 'agy', source: 'statusline', at: NOW - 60000, plan: 'Google AI Pro', model: 'Gemini 4 Hydrogen', credits: null, windows: [
    { id: 'gemini-5h', minutes: 300, usedPct: 41, resetsAt: NOW + 10740000 }, { id: 'gemini-weekly', minutes: 10080, usedPct: 13, resetsAt: NOW + 594000000 },
    { id: '3p-5h', minutes: 300, usedPct: 0, resetsAt: NOW + 17880000 }, { id: '3p-weekly', minutes: 10080, usedPct: 97, resetsAt: NOW + 601200000 },
    { id: 'gemini-argon-wtu-weekly', minutes: 10080, usedPct: 0, resetsAt: NOW + 601200000 },
  ] },
} };

const openTabs = async (from, to) => { for (const t of TABS.slice(from, to)) for (const d of dirsOf(t)) { atrium('ws', 'open', d); await sleep(150); } };
const groupsReady = async (names) => until(() => { const r = call('workspace.list'); const g = (r.groups || []).filter((x) => x.auto); return names.every((n) => g.some((x) => new RegExp('mtask-p214/' + n + '$', 'i').test(x.root))) && g; }, 60000, 1500).catch(() => null);

atrium('backend', 'start');
call('settings.set', { key: 'language', value: 'ko' });
await openTabs(0, 5);
log('묶음', await groupsReady(['multitask']));
atrium('ws', 'select', pathKey(dirsOf(TABS[0])[0]));

const { app, page } = await launch({ log, args: ['--remote-debugging-port=' + BOARD.cdp, '--force-device-scale-factor=1'] });
let code = 1;
const metrics = [];
try {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // 사용자 PC는 움직임 줄이기
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => {});
  const feed = async (upto) => { await page.evaluate(({ list, usage }) => { for (const s of list) window.__mt.api.emit('session.updated', s); window.__mt.api.emit('usage.updated', usage); }, { list: fakeSessions(upto), usage: USAGE }); await sleep(800); };
  // 창 안쪽 폭을 맞춘다. 화면보다 크면 확대 배율로 CSS 폭을 맞춘다(그림은 CSS 크기로 찍는다)
  const size = async (w, h) => {
    await app.evaluate(({ BrowserWindow }, s) => { const b = BrowserWindow.getAllWindows()[0]; b.webContents.setZoomFactor(1); b.setContentSize(s.w, s.h); }, { w, h });
    await sleep(400);
    const iw = await page.evaluate(() => window.innerWidth);
    if (iw < w) { await app.evaluate(({ BrowserWindow }, f) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(f), iw / w); await sleep(400); }
    await sleep(600);
    return page.evaluate(() => [window.innerWidth, window.innerHeight]);
  };
  const lang = async (l) => { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x || (window.__mt.getState().settings || {}).language === x, l, { timeout: 15000 }).catch(() => {}); await sleep(800); };
  const measure = () => page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), b: Math.round(b.bottom), r: Math.round(b.right) }; };
    const seg = q('[data-role=workspaces]'), shape = q('[data-role=ws-shape]');
    const visible = [...seg.querySelectorAll('[data-ws-tab]')].filter((e) => !e.classList.contains('mt-ws-hid'));
    const tops = new Set(visible.map((e) => Math.round(e.getBoundingClientRect().top)));
    const more = q('[data-action=ws-more]:not(.mt-ws-hid)');
    const tl = r(q('[data-role=top-left]')), tr = r(q('[data-role=top-right]'));
    return {
      w: window.innerWidth, cover: Math.max(tl.b, tr.b), tl, tr, seg: r(seg), rows: tops.size, tabs: visible.length, more: more ? more.textContent : null,
      shapeRows: shape ? shape.dataset.rows : null, shapeD: shape ? shape.querySelector('path').getAttribute('d') : null, segShape: seg.classList.contains('shape'),
      usage: r(q('[data-role=usage]')), turn: !!q('[data-role=inbox]'), review: !!q('[data-role=review]'), search: !!q('[data-action=search]'),
      usageText: (q('[data-role=usage]') || {}).innerText, usageWins: [...document.querySelectorAll('[data-role=usage] [data-window]')].map((e) => e.dataset.window),
      overlap: tl.r > tr.x - 4 && tl.y < tr.b,
    };
  });
  const crop = async (name, h = 130) => { const w = await page.evaluate(() => window.innerWidth); await page.screenshot({ path: path.join(OUT, name + '.png'), clip: { x: 0, y: 0, width: w, height: h }, scale: 'css' }); };
  const scene = async (l, w, n) => {
    const [iw] = await size(w, w === 1920 ? 1080 : 768);
    const m = await measure();
    m.lang = l; m.n = n; m.iw = iw;
    metrics.push(m);
    log('장면', l, w, n, { cover: m.cover, rows: m.rows, tabs: m.tabs, more: m.more, shapeRows: m.shapeRows, usageW: m.usage && m.usage.w, tl: m.tl, tr: m.tr });
    await crop('top-' + l + '-' + w + '-' + n);
    check(l + ' ' + w + ' 탭 ' + n + ': 오른쪽 묶음은 첫 줄(top 17), 왼쪽 묶음과 겹치지 않는다', m.tr.y === 17 && !m.overlap, { tr: m.tr, tl: m.tl });
    check(l + ' ' + w + ' 탭 ' + n + ': 덮는 높이 ' + (m.rows > 1 ? 84 : 54) + 'px(' + m.rows + '행)', m.cover === (m.rows > 1 ? 84 : 54) && m.rows <= 2, { cover: m.cover, rows: m.rows });
    check(l + ' ' + w + ' 탭 ' + n + ': 2행이면 계단 배경, 1행이면 알약', m.rows > 1 ? m.segShape && !!m.shapeD : !m.segShape && !m.shapeD, { rows: m.rows, shapeRows: m.shapeRows });
    check(l + ' ' + w + ' 탭 ' + n + ': 검색 칸 없음, 0인 작업 완료 숨김, 응답 필요 보임', !m.search && !m.review && m.turn, { search: m.search, review: m.review, turn: m.turn });
    return m;
  };

  await feed(5);
  for (const l of ['ko', 'en']) { await lang(l); for (const w of [1920, 1366]) await scene(l, w, 5); }
  await openTabs(5, 12);
  log('묶음', await groupsReady(['multitask', 'infra']));
  await sleep(1500);
  await feed(12);
  for (const l of ['ko', 'en']) { await lang(l); for (const w of [1920, 1366]) await scene(l, w, 12); }
  const m1366 = metrics.find((m) => m.lang === 'en' && m.w === 1366 && m.n === 12);
  const m1920 = metrics.find((m) => m.lang === 'ko' && m.w === 1920 && m.n === 12);
  check('1920 탭 12: 2행, "+n" 없음', m1920 && m1920.rows === 2 && !m1920.more, m1920 && { rows: m1920.rows, more: m1920.more });
  check('1366 탭 12: 2행 + "+n"', m1366 && m1366.rows === 2 && /^\+\d+$/.test(m1366.more || ''), m1366 && { rows: m1366.rows, more: m1366.more });
  const t5 = metrics.filter((m) => m.n === 5 && m.w === 1920);
  check('1920 탭 5: 1행 알약', t5.every((m) => m.rows === 1), t5.map((m) => m.rows));
  // 사용량 알약: 한 줄 꼴, AGY는 Gemini 5시간·주간만
  check('사용량 알약: 구독마다 보이는 창만(AGY는 gemini-5h·gemini-weekly)', m1920 && JSON.stringify(m1920.usageWins) === JSON.stringify(['5h', 'week', '5h', 'week', 'gemini-5h', 'gemini-weekly']), m1920 && { wins: m1920.usageWins, text: m1920.usageText });

  // 이후는 ko 1366 탭 12
  await lang('ko'); await size(1366, 768);
  // 움직임 줄이기와 아닌 것이 같은 모양
  const dReduce = (await measure()).shapeD;
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await sleep(500);
  const dFull = (await measure()).shapeD;
  await page.emulateMedia({ reducedMotion: 'reduce' }); await sleep(300);
  check('움직임 줄이기에서도 같은 모양', !!dReduce && dReduce === dFull, { same: dReduce === dFull });
  // 숨은 칩은 초점을 받지 않는다
  const hidTab = await page.evaluate(() => [...document.querySelectorAll('[data-role=workspaces] .mt-ws-hid[data-ws-tab]')].map((e) => e.tabIndex));
  check('숨은 칩은 tabIndex -1', hidTab.length > 0 && hidTab.every((x) => x === -1), hidTab);
  // "+n" 목록
  await page.click('[data-action=ws-more]:not(.mt-ws-hid)'); await sleep(400);
  const menu = await page.evaluate(() => { const m = document.querySelector('[data-role=ws-more-menu]'); return m ? [...m.querySelectorAll('[role=menuitem]')].map((e) => e.dataset.name) : null; });
  const moreN = Number(((await measure()).more || '+0').slice(1));
  check('"+n"을 누르면 나머지 탭 목록', menu && menu.length === moreN, { menu, moreN });
  await page.screenshot({ path: path.join(OUT, 'more-ko-1366.png'), clip: { x: 0, y: 0, width: 1366, height: 420 }, scale: 'css' });
  const pickName = menu && menu[menu.length - 1];
  if (pickName) {
    await page.click('[data-role=ws-more-menu] [role=menuitem][data-name="' + pickName + '"]'); await sleep(900);
    const after = await page.evaluate((n) => { const on = document.querySelector('[data-role=workspaces] .mt-wsbtn.on'); return on ? { name: on.dataset.name, hid: on.classList.contains('mt-ws-hid') } : null; }, pickName);
    check('목록에서 고르면 그 탭이 켜지고 줄에 보인다', after && after.name === pickName && !after.hid, after);
    atrium('ws', 'select', pathKey(dirsOf(TABS[0])[0])); await sleep(900);
  }
  // Ctrl+F 찾기 창
  await page.mouse.click(700, 500); await sleep(200);
  await page.keyboard.press('Control+f'); await sleep(500);
  const sOpen = await page.evaluate(() => { const s = document.querySelector('[data-role=search]'); if (!s) return null; const b = s.getBoundingClientRect(); return { top: Math.round(b.top), focus: document.activeElement && document.activeElement.closest('[data-role=search]') ? true : false }; });
  check('Ctrl+F로 떠 있는 찾기 창이 열리고 입력칸에 초점, 위 막대 밑', sOpen && sOpen.focus && sOpen.top >= 84, sOpen);
  await page.keyboard.type('notes'); await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'search-ko-1366.png'), scale: 'css' });
  await page.keyboard.press('Escape'); await sleep(500);
  check('Esc로 닫힌다', !(await page.evaluate(() => !!document.querySelector('[data-role=search]'))));
  await page.keyboard.press('Control+f'); await sleep(400);
  await page.mouse.click(1200, 600); await sleep(500);
  check('바깥을 누르면 닫힌다', !(await page.evaluate(() => !!document.querySelector('[data-role=search]'))));
  // 사용량 펼침(AGY 줄 둘)
  await size(1920, 1080);
  await page.evaluate((u) => window.__mt.api.emit('usage.updated', u), USAGE); await sleep(300); // 판이 그새 보낸 값(빈 시험 판)을 덮는다
  await page.click('[data-role=usage]'); await sleep(500);
  const pop = await page.evaluate(() => { const l = document.querySelector('[data-role=usage-list]'); if (!l) return null; const b = l.getBoundingClientRect(); const agy = l.querySelector('[data-provider=agy]'); return { box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }, agy: agy ? [...agy.querySelectorAll('[data-window]')].map((e) => e.dataset.window + ':' + e.querySelector('.mt-usage-wname').textContent) : null, what: !!(agy && agy.querySelector('[data-role=usage-what]')), more: /더 보기|3p|argon/.test(l.innerText), claude: [...l.querySelectorAll('[data-provider=claude] [data-window]')].map((e) => e.dataset.window) }; });
  check('펼침: AGY는 Gemini 5시간·주간 두 줄(3p·세부·더 보기 없음)', pop && JSON.stringify(pop.agy) === JSON.stringify(['gemini-5h:5시간', 'gemini-weekly:주간']) && pop.what && !pop.more, pop);
  if (pop) await page.screenshot({ path: path.join(OUT, 'usage-pop-ko-1920.png'), clip: { x: pop.box.x - 280, y: 0, width: pop.box.w + 300, height: pop.box.y + pop.box.h + 12 }, scale: 'css' });
  await page.keyboard.press('Escape'); await sleep(300);
  // 0인 응답 필요는 숨고, 생기면 나타난다
  await page.evaluate(() => { for (const s of window.__mt.getState().sessions.values()) if (s.state === 'waiting') window.__mt.api.emit('session.updated', { ...s, state: 'shell_idle' }); }); await sleep(600);
  const turn0 = await page.evaluate(() => !!document.querySelector('[data-role=inbox]'));
  await page.evaluate(() => { const s = [...window.__mt.getState().sessions.values()][0]; window.__mt.api.emit('session.updated', { ...s, state: 'waiting', unseen: false }); const r = [...window.__mt.getState().sessions.values()][1]; window.__mt.api.emit('session.updated', { ...r, unseen: true }); }); await sleep(600);
  const turn1 = await page.evaluate(() => ({ turn: !!document.querySelector('[data-role=inbox]'), review: !!document.querySelector('[data-role=review]') }));
  check('0인 응답 필요는 숨고 값이 생기면 나타난다(작업 완료도)', !turn0 && turn1.turn && turn1.review, { turn0, turn1 });
  await page.screenshot({ path: path.join(OUT, 'pills-back-ko-1920.png'), clip: { x: 0, y: 0, width: 1920, height: 130 }, scale: 'css' });
  code = results.every((r) => r.ok) ? 0 : 1;
} catch (e) { log('오류', e.stack); }
await closeApp(app);
fs.writeFileSync(path.join(OUT, 'p214-metrics.json'), JSON.stringify(metrics, null, 2));
fs.writeFileSync(path.join(OUT, 'p214-results.json'), JSON.stringify(results, null, 2));

// 목업 2차와 나란히(Edge 헤드리스): 탭 5 ↔ (가) 한 줄 꼴, 탭 12 ↔ 붐빔 한 줄 꼴
async function sheets() {
try {
  const { chromium } = await import('playwright');
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1960, height: 1000 } });
  const url = (f) => (fs.existsSync(f) ? 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') : ''); // setContent 쪽은 file:// 그림을 읽지 못한다
  for (const l of ['ko', 'en']) {
    const rows = [];
    for (const w of [1920, 1366]) for (const [n, mk] of [[5, 'ga'], [12, 'busy']]) {
      const mine = path.join(OUT, 'top-' + l + '-' + w + '-' + n + '.png'), mock = path.join(MOCK, 'topbar2-' + mk + '-line-' + w + '.png');
      rows.push('<h3>' + w + 'px · tabs ' + n + ' (' + l + ')</h3><div class=pair><figure><figcaption>P214 app</figcaption><img src="' + url(mine) + '"></figure><figure><figcaption>mock 2 (' + mk + ', line)</figcaption><img src="' + (fs.existsSync(mock) ? url(mock) : '') + '"></figure></div>');
    }
    await p.setContent('<html><body style="background:#111;color:#ddd;font:13px sans-serif;margin:12px"><style>.pair{display:grid;gap:6px}figure{margin:0}img{max-width:1920px;width:100%;display:block;border:1px solid #333}figcaption{color:#aaa;margin:2px 0}</style>' + rows.join('') + '</body></html>');
    await p.waitForLoadState('load'); await sleep(500);
    await p.screenshot({ path: path.join(OUT, 'sheet-' + l + '.png'), fullPage: true });
    log('비교 그림', 'experiments/p214/sheet-' + l + '.png');
  }
  await b.close();
} catch (e) { log('비교 그림 실패', e.message.slice(0, 300)); }
}
await sheets();
log('결과', results.filter((r) => r.ok).length + '/' + results.length);
process.exit(code);
