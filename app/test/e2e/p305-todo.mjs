// P305 창 시험: "내 몫" → "할 일"(en "To do"), 카드 종류 "할 일" → "실행"(en "Action"). 위 왼쪽 알약 글, 할 일 목록의 네 종류 표, 휴대폰 시트(ko·en).
// 개발용 판에 haiku 리드(lead) 하나와 셸 둘을 띄우고, 리드가 atrium todo·ask로 카드 네 종류를 남기게 한다(P294 시험의 틀).
// 판: 따로 띄운 개발용 판(atrium-dev-p305, 48055, backend/.dev)만. 창의 원격 디버깅 포트 9536, 휴대폰 흉내 프록시 48255. 한 번에 한 창·브라우저만.
// 실행: node app/test/e2e/p305-todo.mjs <setup|seed|pc|phone|stop> [round]
// 결과는 워크트리의 experiments/p305/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'pc';
const TAG = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p305', TAG);
const BOARD = 'atrium-dev-p305', PORT = process.env.P305_PORT || '48055', DEBUG = process.env.P305_DEBUG || '9536', SIM = Number(process.env.P305_SIM || 48255);
const FOLDERS = ['C:\\Workspace\\mtask-p305-a', 'C:\\Workspace\\mtask-p305-b', 'C:\\Workspace\\mtask-p305-c'];
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p305', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p305-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p305-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const lead = () => call('session.list').find((s) => s.name === 'lead');
const cards = () => call('decision.list').cards;
const pad = (n) => String(n).padStart(2, '0');
const stamp = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
async function waitFor(fn, ms = 120000, every = 1500) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(every); } }

async function setup() {
  for (const f of FOLDERS) fs.mkdirSync(f, { recursive: true });
  log(atrium('backend', 'start'));
  if (!lead()) log(atrium('spawn', FOLDERS[0], '--name', 'lead', '--model', 'haiku'));
  for (const [i, f] of FOLDERS.slice(1).entries()) if (!call('session.list').find((s) => s.name === `sh${i + 1}`)) log(atrium('spawn', f, '--name', `sh${i + 1}`, '--kind', 'shell'));
  const ok = await waitFor(() => { const s = lead(); return s && s.state === 'ready' && s; }, 180000, 3000);
  check('리드가 떴다(ready)', !!ok, ok && ok.state);
}

async function seed() {
  const at = stamp(Date.now() + 90 * 1000);
  const cmds = [
    'atrium todo "배포 전에 로그인해 주세요" --cmd "! gcloud auth login" --cmd "gcloud config list" --why "배포 스크립트가 인증을 씁니다"',
    'atrium todo "설정 창에 새 단추가 보이는지" --check',
    `atrium todo "배포 결과 보기" --later "${at}"`,
    'atrium todo "API 키가 오면 등록" --later "사용자가 API 키를 받으면"',
    'atrium ask "이대로 마무리할까요?" --option "마무리" --option "더 고침" --option "나중에" --why "시험이 모두 통과했습니다"',
  ];
  const file = path.join(FOLDERS[0], 'p305-cmds.txt');
  fs.writeFileSync(file, cmds.join('\n') + '\n');
  const before = cards().length;
  atrium('send', '@lead', `시험입니다. ${file} 파일의 명령을 한 줄씩 그대로 셸에서 실행하고, 끝나면 "남겼습니다" 한마디만 답해 주세요.`);
  const got = await waitFor(() => { const c = cards(); return c.length >= before + cmds.length && c; }, 240000, 3000);
  check(`리드가 카드 ${cmds.length}장을 남김`, !!got, got && got.map((c) => [c.id, c.kind, c.question, c.deferred]));
  const woke = await waitFor(() => cards().some((c) => c.kind === 'later' && c.later && !c.cond && !c.deferred), 4 * 60 * 1000, 3000);
  check('날짜 나중 카드가 때가 되어 지금 목록에', !!woke);
}

// 사람이 볼 것 알약이 모두 보이게 흉내 세션(응답 필요·작업 완료·문제)을 더한다(판 데이터는 바꾸지 않는다)
async function fakeInbox(page) {
  await page.evaluate(() => {
    const st = window.__mt.getState();
    const base = [...st.sessions.values()].find((s) => s.name === 'lead');
    if (!base) return;
    const mk = (id, name, more) => window.__mt.api.emit('session.updated', { ...base, sessionId: id, name, kind: 'shell', ...more });
    mk('p305-w', 'waiter', { state: 'waiting', waitingSince: Date.now() - 60000, unseen: false });
    mk('p305-r', 'finisher', { state: 'ready', unseen: true, lastAnswer: '끝났습니다' });
    mk('p305-e', 'broken', { state: 'error', unseen: false });
  });
  await sleep(600);
}

const boxes = (page) => page.evaluate(() => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; };
  const tl = document.querySelector('[data-role=top-left]'), tr = document.querySelector('[data-role=top-right]');
  const roles = (el) => el ? [...el.querySelectorAll('[data-role]')].map((x) => x.dataset.role).filter((r) => !/-list$/.test(r)) : [];
  return { win: innerWidth, tl: R(tl), tr: R(tr), tlRoles: roles(tl), trRoles: roles(tr), fit: tl && tl.dataset.fit, ws: !!document.querySelector('[data-role=workspaces]') };
});

async function pc() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    await fakeInbox(page);
    const sideOpen = () => page.evaluate(() => !!document.querySelector('[data-role=sidebar]'));
    if (await sideOpen()) { await page.click('[data-role=top-left] [data-action=sidebar]'); await sleep(600); }
    for (const lang of ['ko', 'en']) {
      call('settings.set', { key: 'language', value: lang }); await sleep(900);
      for (const [w, h, tag] of [[1600, 1000, 'wide'], [1280, 800, 'mid'], [900, 640, 'narrow']]) {
        await page.setViewportSize({ width: w, height: h }).catch(() => {}); await sleep(900);
        const b = await boxes(page);
        log(`[${lang} ${tag}] ${JSON.stringify(b)}`);
        if (TAG !== 'before') {
          check(`[${lang} ${tag}] 워크스페이스 알약 줄 없음`, !b.ws);
          check(`[${lang} ${tag}] 왼쪽 = 응답 필요·할 일·작업 완료·문제·세션`, ['inbox', 'decisions', 'review', 'problems', 'sessions-pill'].every((r) => b.tlRoles.includes(r)), b.tlRoles);
          check(`[${lang} ${tag}] 오른쪽 = 연결·메모리·변경·설정(사람이 볼 것 없음)`, b.trRoles.includes('conn') && !['inbox', 'decisions', 'review', 'problems'].some((r) => b.trRoles.includes(r)), b.trRoles);
          check(`[${lang} ${tag}] 왼쪽 무리가 오른쪽 무리를 덮지 않음`, b.tl && b.tr && (b.tl.right + 8 <= b.tr.x || b.tl.y >= b.tr.y + b.tr.h + 4), { tl: b.tl, tr: b.tr, fit: b.fit });
        }
        await shot(page, `pc-top-${tag}-${lang}`, { clip: { x: 0, y: 0, width: w, height: 70 } });
        if (tag === 'wide') await shot(page, `pc-${tag}-${lang}`);
      }
      // 사이드바를 연 채 좁은 창(판 칸이 더 좁다)
      await page.setViewportSize({ width: 1100, height: 760 }).catch(() => {});
      await page.click('[data-role=top-left] [data-action=sidebar]'); await sleep(1000);
      { const b = await boxes(page); log(`[${lang} sidebar-narrow] ${JSON.stringify(b)}`);
        if (TAG !== 'before') check(`[${lang} sidebar-narrow] 사이드바가 열려도 두 무리가 겹치지 않음`, b.tl && b.tr && (b.tl.right + 8 <= b.tr.x || b.tl.y >= b.tr.y + b.tr.h + 4), { tl: b.tl, tr: b.tr, fit: b.fit });
        await shot(page, `pc-top-sidebar-narrow-${lang}`, { clip: { x: 0, y: 0, width: 1100, height: 110 } }); }
      await page.click('[data-role=top-left] [data-action=sidebar]'); await sleep(600);
      await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {}); await sleep(600);
      // 할 일 펼침(왼쪽에서 펼친다)
      const pillText = await page.$eval('[data-role=decisions]', (e) => e.textContent.replace(/\s+/g, ' ').trim());
      const word = lang === 'ko' ? '할 일' : 'To do';
      check(`[${lang}] 위 왼쪽 알약 "${word} n"`, new RegExp('^' + word + ' \\d+$').test(pillText), pillText);
      await page.click('[data-role=decisions]'); await sleep(700);
      const kinds = await page.$$eval('[data-role=decision-kind]', (xs) => xs.map((x) => [x.dataset.kind, x.textContent]));
      const want = lang === 'ko' ? { decide: '결정', do: '실행', check: '확인', later: '나중에' } : { decide: 'Decide', do: 'Action', check: 'Check', later: 'Later' };
      check(`[${lang}] 목록의 종류 표 넷(${Object.values(want).join('·')})`, Object.keys(want).every((k) => kinds.some(([kk, t]) => kk === k && t === want[k])), kinds);
      const head = await page.$eval('.mt-dropdown-head', (e) => e.textContent.trim()).catch(() => null);
      check(`[${lang}] 목록 머리 "${word}"`, head === word, head);
      await shot(page, `pc-decisions-open-${lang}`);
      await shot(page, `pc-decisions-list-${lang}`, { clip: { x: 0, y: 0, width: 760, height: 900 } });
      await page.keyboard.press('Escape'); await sleep(300);
    }
    call('settings.set', { key: 'language', value: 'ko' }); await sleep(700);
  } finally { await closeApp(app); }
}

async function phone() {
  const pw = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  try {
    const browser = await pw.webkit.launch({ headless: true });
    try {
      for (const lang of ['ko', 'en']) {
        call('settings.set', { key: 'language', value: lang });
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: lang === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce' });
        const pg = await ctx.newPage();
        pg.on('pageerror', (e) => log(`[phone pageerror] ${e.message}`));
        await pg.goto(`http://localhost:${SIM}/`);
        await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
        await pg.fill('[data-field=pair-code]', call('device.code').code);
        await pg.click('[data-action=pair-submit]');
        await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
        await sleep(1500);
        await pg.waitForSelector('[data-role=pl-decisions]', { timeout: 20000 }); await sleep(600);
        await pg.tap('[data-role=pl-decisions]'); await sleep(700);
        const m = await pg.evaluate(() => {
          const R = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; };
          const rows = [...document.querySelectorAll('[data-role=decisions-sheet] [data-role=decision]')].map((e) => ({ kind: e.dataset.kind, label: (e.querySelector('[data-role=decision-kind]') || {}).textContent, ...R(e) }));
          const pill = document.querySelector('[data-role=pl-decisions]').textContent; const sheetHead = (document.querySelector('.mt-dc-sheet-head b') || {}).textContent;
          const btns = [...document.querySelectorAll('[data-role=decisions-sheet] [data-role=decision] button.mt-btn, [data-role=decisions-sheet] [data-role=decision] input')].map((e) => Math.round(e.getBoundingClientRect().height));
          const vh = innerHeight;
          const seen = rows.filter((r) => r.bottom <= vh).length;
          const sameRow = (kind, a, b) => { const c = document.querySelector(`[data-role=decisions-sheet] [data-role=decision][data-kind=${kind}]`); const x = c && c.querySelector(a), y = c && c.querySelector(b); return !!(x && y) && Math.abs(x.getBoundingClientRect().top - y.getBoundingClientRect().top) < 2; };
          const rowsOf = { checkSnoozeWithFail: sameRow('check', '[data-action=check-fail]', '[data-action=snooze]'), checkSnoozeWithMemo: sameRow('check', '[data-field=check-note]', '[data-action=snooze]'), decideSnoozeWithSend: sameRow('decide', '[data-action=decision-send]', '[data-action=snooze]') };
          return { pill, sheetHead, vh, rows, seen, minBtn: Math.min(...btns), maxBtn: Math.max(...btns), rowsOf };
        });
        log(`[phone ${lang}] ${JSON.stringify(m)}`);
        if (TAG !== 'before') {
          const want = lang === 'ko' ? { decide: '결정', do: '실행', check: '확인', later: '나중에' } : { decide: 'Decide', do: 'Action', check: 'Check', later: 'Later' };
          const word = lang === 'ko' ? '할 일' : 'To do';
          check(`[phone ${lang}] 알약·시트 머리 "${word}"`, m.pill.includes(word) && m.sheetHead === word, { pill: m.pill, head: m.sheetHead });
          check(`[phone ${lang}] 종류 표 글`, m.rows.every((r) => r.label === want[r.kind]), m.rows.map((r) => [r.kind, r.label]));
          check(`[phone ${lang}] 카드 네 종류가 지금 목록에`, ['decide', 'do', 'check', 'later'].every((k) => m.rows.some((r) => r.kind === k)), m.rows.map((r) => r.kind));
          check(`[phone ${lang}] 한 화면에 카드 셋 이상이 다 보임`, m.seen >= 3, m);
          check(`[phone ${lang}] 누를 것 높이 36px 이상`, m.minBtn >= 36, m);
          check(`[phone ${lang}] 결정 카드: 미루기·무시가 보내기 줄에`, m.rowsOf.decideSnoozeWithSend, m.rowsOf);
          check(`[phone ${lang}] 확인 카드: 미루기·무시가 됐다·안 됐다 줄(들면) 또는 메모 줄에`, m.rowsOf.checkSnoozeWithFail || m.rowsOf.checkSnoozeWithMemo, m.rowsOf);
        }
        await shot(pg, `phone-sheet-${lang}`);
        await pg.$eval('[data-role=decisions-sheet] .mt-dc-sheet-body', (e) => { e.scrollTop = e.scrollHeight; }); await sleep(300);
        await shot(pg, `phone-sheet-end-${lang}`);
        await ctx.close();
      }
    } finally { await browser.close(); }
  } finally { sim.close && sim.close(); }
}

async function stopAll() {
  for (const n of ['lead', 'sh1', 'sh2']) { try { if (call('session.list').find((s) => s.name === n)) log(atrium('kill', n, '--yes')); } catch (e) { log('kill ' + e.message); } }
  try { log(atrium('terminal', 'stop', '--yes')); } catch (e) { log('terminal stop ' + e.message); }
  try { log(atrium('backend', 'stop')); } catch (e) { log('backend stop ' + e.message); }
}

try {
  if (WHAT === 'setup') await setup();
  else if (WHAT === 'seed') await seed();
  else if (WHAT === 'pc') await pc();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'stop') await stopAll();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p305-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
