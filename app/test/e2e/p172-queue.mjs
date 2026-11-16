// P172 창 시험: 전달 대기열. (1) 일하는 세션에 글 셋 이상 → 한 상자로 묶임, 위·아래 단추와 Alt+↑·↓로 순서 바꾸기, 수정·취소, 바꾼 순서대로 들어감
// (2) 바로 보내기: 일하는 Claude Code에 지금 입력 칸으로 넣어 대기 메시지(스티어링)가 된다 (3) 휴대폰 폭(390×844) 세션 화면의 묶음.
// 판: 따로 띄운 개발용 판(atrium-dev-p172, 47941, backend/.dev)만 쓴다. 창의 원격 디버깅 포트 9421, 휴대폰 흉내 프록시 47992. 한 번에 한 창만(메모리).
//   시험 폴더 C:\Workspace\mtask-p172-a(그 폴더의 .claude/settings.local.json이 ping만 허용해 오래 도는 턴을 만든다)에 haiku 세션 p172-w를 띄운다.
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p172-queue.mjs <setup|queue|steer|phone|stop>
// 결과는 워크트리의 experiments/p172/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p172');
const CONVOS = path.join(REPO, 'experiments', 'p172', 'convos');
const DIR = 'C:\\Workspace\\mtask-p172-a';
const NAME = 'p172-w';
const PORT = '47941', SIM = 47992;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const ENV = {
  ATRIUM_TERMINAL_SESSION: 'atrium-dev-p172', ATRIUM_HERDR_SESSION: 'atrium-dev-p172', ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p172-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${L.NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p172-${WHAT}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shotTo = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) }).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
async function winSize(app, page, width, height) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(w, h); }, [width, height]).catch(() => {});
  await page.setViewportSize({ width, height }).catch(() => {});
  await sleep(700);
}
const sess = () => call('session.list').find((s) => s.name === NAME);
const stateOf = () => { const s = sess(); return s ? s.state : null; };
const active = () => call('delivery.list', { active: true }).filter((d) => d.name === NAME);
const recentOf = (id) => call('delivery.list', { limit: 30 }).find((x) => x.deliveryId === id);
async function until(fn, ms, step = 1000) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await sleep(step); } }
const PING = (n) => `Run the Bash command \`ping -n ${n} 127.0.0.1\` in the foreground (not in the background) and then reply with the single word pinged.`;
const screenText = () => { try { return atrium('screen', NAME, '--text'); } catch { return ''; } };

async function setupBoard() {
  fs.mkdirSync(path.join(DIR, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(DIR, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['Bash(ping:*)'] } }, null, 2));
  log(atrium('backend', 'start').trim().slice(0, 300));
  if (!sess()) log(atrium('--json', 'spawn', DIR, '--name', NAME, '--model', 'haiku').slice(0, 200));
  const st = await until(() => { const s = stateOf(); return s === 'ready' || s === 'trust_wait' ? s : null; }, 90000, 1500);
  log(`세션 상태 ${st}`);
  if (st === 'trust_wait') fs.writeFileSync(path.join(DEV, 'p172-need-trust.txt'), `${NAME} (${DIR}) 신뢰 질문이 떴다. 개발용 판(47941)에서 사람이 한 번 답해야 한다\n`);
  check('준비: haiku 세션이 ready', st === 'ready', st);
}

async function sendLine(pg, line) {
  await pg.click('[data-role="command"]');
  await pg.keyboard.press('Control+A'); await pg.keyboard.press('Delete');
  await pg.keyboard.insertText(line);
  await sleep(150);
  await pg.keyboard.press('Enter');
  await sleep(700);
}
async function startWork(pg, n = 60) {
  await until(() => stateOf() === 'ready', 180000, 2000);
  await sendLine(pg, `@${NAME} ${PING(n)}`);
  const w = await until(() => stateOf() === 'working', 60000);
  check('세션이 일하는 중(ping)', !!w, stateOf());
}
const GROUP = `[data-role="delivery-group"]`;
const groupRows = (pg) => pg.$$eval(`${GROUP} .mt-dq-item`, (els) => els.map((e) => ({ id: e.dataset.delivery, st: e.dataset.status, text: e.querySelector('.mt-dq-text').textContent })));
const order = () => active().filter((d) => d.status === 'queued').map((d) => d.text.replace(/^Reply with exactly: /, ''));
async function boardWin() {
  const r = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=9421', ...AWAKE] });
  await awayWin(r.app);
  await winSize(r.app, r.page, 1584, 921);
  await r.page.emulateMedia({ reducedMotion: 'reduce' });
  await sleep(2500);
  return r;
}
const groupClip = async (pg) => { const b = await pg.$eval('.mt-bottom', (el) => { const a = el.querySelector('.mt-bottom-above').getBoundingClientRect(), c = el.getBoundingClientRect(); return { x: Math.min(a.left, c.left) - 20, y: a.top - 20, w: Math.max(a.width, c.width) + 40, h: c.bottom - a.top + 30 }; }).catch(() => null); return b ? { x: Math.max(0, b.x), y: Math.max(0, b.y), width: b.w, height: b.h } : undefined; };

async function queue() {
  const { app, page } = await boardWin();
  try {
    await startWork(page, 70);
    const texts = ['Q1-172', 'Q2-172', 'Q3-172', 'Q4-172'];
    for (const x of texts) await sendLine(page, `@${NAME} Reply with exactly: ${x}`);
    await page.waitForSelector(GROUP, { timeout: 10000 }).catch(() => {});
    await sleep(800);
    const rows = await groupRows(page);
    const head = await page.$eval(`${GROUP} .mt-dq-head`, (e) => e.textContent).catch(() => null);
    check('일하는 세션의 대기 글 넷이 한 상자(@이름·상태·대기 4개)에 보낸 순서대로', (await page.$$(GROUP)).length === 1 && rows.length === 4 && rows.every((r) => r.st === 'queued') && rows.map((r) => r.text.replace(/^Reply with exactly: /, '')).join() === texts.join() && /4/.test(head || ''), { head, rows });
    const btns = await page.$$eval(`${GROUP} .mt-dq-item:nth-child(2) button`, (bs) => bs.map((b) => b.dataset.action));
    check('대기 글마다 위·아래·바로 보내기·수정·취소', ['delivery-up', 'delivery-down', 'delivery-now', 'delivery-edit', 'delivery-cancel'].every((a) => btns.includes(a)), btns);
    await shotTo(page, 'q1-grouped');
    await shotTo(page, 'q1-grouped-zoom', await groupClip(page));
    const id = (x) => rows.find((r) => r.text.includes(x)).id;
    // Q3 위로(단추) → Q1 Q3 Q2 Q4
    await page.click(`[data-delivery="${id('Q3')}"] [data-action="delivery-up"]`);
    await sleep(800);
    check('위 단추: Q3가 Q2 앞으로(백엔드 차례)', order().join() === 'Q1-172,Q3-172,Q2-172,Q4-172', order());
    // Q1에 초점 두고 Alt+↓ → Q3 Q1 Q2 Q4
    await page.focus(`[data-delivery="${id('Q1')}"]`);
    await page.keyboard.press('Alt+ArrowDown');
    await sleep(800);
    const o2 = order();
    const ui2 = (await groupRows(page)).map((r) => r.text.replace(/^Reply with exactly: /, '')).join();
    check('Alt+↓: Q1이 한 칸 뒤로, 창도 같은 차례', o2.join() === 'Q3-172,Q1-172,Q2-172,Q4-172' && ui2 === o2.join(), { o2, ui2 });
    // Q2 수정 → E2
    await page.click(`[data-delivery="${id('Q2')}"] [data-action="delivery-edit"]`);
    await page.waitForSelector('[data-role="delivery-edit-input"]', { timeout: 5000 });
    await page.$eval('[data-role="delivery-edit-input"]', (el) => { el.focus(); el.setSelectionRange(0, el.value.length); });
    await page.keyboard.insertText('Reply with exactly: E2-172');
    await shotTo(page, 'q2-editing', await groupClip(page));
    await page.keyboard.press('Enter');
    await sleep(800);
    // Q4 취소
    await page.click(`[data-delivery="${id('Q4')}"] [data-action="delivery-cancel"]`);
    await sleep(1000);
    const o3 = order();
    check('수정한 글(E2)은 그 자리, 취소한 Q4는 빠진다', o3.join() === 'Q3-172,Q1-172,E2-172', o3);
    await shotTo(page, 'q3-reordered', await groupClip(page));
    await shotTo(page, 'q3-reordered-full');
    // 바꾼 차례대로 들어간다
    const ids = { Q3: id('Q3'), Q1: id('Q1'), E2: id('Q2') };
    const fin = await until(() => { const r = Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, recentOf(v)])); return Object.values(r).every((x) => x && ['confirmed', 'unconfirmed', 'failed'].includes(x.status)) ? r : null; }, 300000, 3000);
    const conf = fin ? Object.entries(fin).sort((a, b) => (a[1].confirmedAt || 0) - (b[1].confirmedAt || 0)).map(([k, v]) => `${k}:${v.status}`) : null;
    check('바꾼 차례(Q3 → Q1 → E2)대로 들어갔다(제출 확인)', conf && conf.join() === 'Q3:confirmed,Q1:confirmed,E2:confirmed', conf);
    const scr = screenText();
    const pos = ['Q3-172', 'Q1-172', 'E2-172'].map((x) => scr.indexOf(x));
    check('세션 화면에도 Q3 → Q1 → E2 차례, Q2(고치기 전 글)·Q4(취소)는 없다', pos.every((p) => p >= 0) && pos[0] < pos[1] && pos[1] < pos[2] && !/Q2-172|Q4-172/.test(scr), { pos, lines: scr.split('\n').filter((l) => /-172/.test(l)).slice(-8) });
    fs.writeFileSync(path.join(OUT, 'q-screen.txt'), scr);
    await shotTo(page, 'q4-delivered');
  } finally { await closeApp(app); }
}

async function steer() {
  const { app, page } = await boardWin();
  try {
    await startWork(page, 60);
    for (const x of ['S1-172', 'S2-172']) await sendLine(page, `@${NAME} Reply with exactly: ${x}`);
    await page.waitForSelector(GROUP, { timeout: 10000 });
    await sleep(800);
    const rows = await groupRows(page);
    const s2 = rows.find((r) => r.text.includes('S2')).id, s1 = rows.find((r) => r.text.includes('S1')).id;
    const tip = await page.$eval(`[data-delivery="${s2}"] .mt-dq-nowwrap`, (e) => ({ title: e.title, key: e.dataset.steer, disabled: e.querySelector('button').disabled }));
    check('일하는 Claude Code: 바로 보내기 켜짐(steer)과 풀이', tip.key === 'steer' && !tip.disabled && tip.title.length > 10, tip);
    await shotTo(page, 's1-before', await groupClip(page));
    await page.click(`[data-delivery="${s2}"] [data-action="delivery-now"]`);
    const sent = await until(() => { const r = recentOf(s2); return r && ['sent', 'confirmed'].includes(r.status) ? r : null; }, 20000, 500);
    const st = stateOf();
    check('바로 보낸 S2가 세션이 일하는 중에 들어갔다(대기 메시지)', !!sent && st === 'working', { sent: sent && { status: sent.status, reason: sent.reason }, st });
    await sleep(1500);
    const scr = screenText();
    fs.writeFileSync(path.join(OUT, 's-screen-steer.txt'), scr);
    check('Claude Code 화면에 S2가 보인다(일하는 중의 대기 메시지)', /S2-172/.test(scr), scr.split('\n').filter((l) => /S2-172|ping|queued|Queued|⎿|>/.test(l)).slice(-10));
    const rows2 = await groupRows(page);
    check('바로 보낸 글은 대기 묶음에서 빠지고 S1만 남는다', rows2.length === 1 && rows2[0].id === s1, rows2);
    await shotTo(page, 's2-steered');
    await shotTo(page, 's2-steered-zoom', await groupClip(page));
    const fin = await until(() => { const a = recentOf(s2), b = recentOf(s1); return a && b && ['confirmed', 'unconfirmed', 'failed'].includes(a.status) && ['confirmed', 'unconfirmed', 'failed'].includes(b.status) ? { a, b } : null; }, 240000, 3000);
    check('S2는 "바로 보냄"으로 확인, S1은 턴 뒤 차례대로', fin && fin.a.status === 'confirmed' && /^now/.test(fin.a.reason || '') && fin.b.status === 'confirmed', fin && { s2: [fin.a.status, fin.a.reason], s1: [fin.b.status, fin.b.reason] });
    const evr = call('session.events', { session: NAME, since: Date.now() - 600000, limit: 500 }); const ev = Array.isArray(evr) ? evr : evr.events || [];
    check('판 기록에 delivery_now', Array.isArray(ev) ? ev.some((e) => e.kind === 'delivery_now') : null, Array.isArray(ev) ? ev.filter((e) => e.kind === 'delivery_now').slice(-1) : ev);
    // 쉬는 세션: 대기 글이 없으니 시험 대신 단추 상태만(흉내로 codex 일하는 중 = 꺼짐)
    await until(() => stateOf() === 'ready', 120000, 2000);
    await page.evaluate(() => { const st = window.__mt.getState(); const s = [...st.sessions.values()].find((x) => x.name === 'p172-w'); window.__mt.api.emit('session.updated', { ...s, kind: 'codex', hooked: false, state: 'working' }); });
    await startWorkFake(page);
    await shotTo(page, 's3-kind-busy', await groupClip(page));
  } finally { await closeApp(app); }
}
// 흉내: codex가 일하는 중이면 바로 보내기가 꺼지고 까닭이 풍선 도움말에. 실제 세션은 ready라 대기 글은 창 안 흉내 전달로 만든다
async function startWorkFake(pg) {
  const r = await pg.evaluate(() => {
    const st = window.__mt.getState(); const s = [...st.sessions.values()].find((x) => x.name === 'p172-w');
    const now = Date.now();
    for (const [i, t] of ['K1-172 (fake)', 'K2-172 (fake)'].entries()) window.__mt.api.emit('delivery', { deliveryId: `dfake${i}`, sessionId: s.sessionId, status: 'queued', reason: 'working', createdAt: now + i, seq: now + i, text: t, name: s.name, chars: t.length });
    return true;
  });
  await sleep(700);
  const tip = await pg.$eval(`[data-delivery="dfake1"] .mt-dq-nowwrap`, (e) => ({ title: e.title, key: e.dataset.steer, disabled: e.querySelector('button').disabled })).catch((e) => ({ err: e.message }));
  check('일하는 중 입력을 못 받는 종류(codex 흉내): 바로 보내기 꺼짐, 까닭은 풍선 도움말', r && tip.key === 'kindBusy' && tip.disabled && /input|입력/.test(tip.title), tip);
}

async function phone() {
  const pw = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: L.NAME, login: L.LOGIN, keepOrigin: true }); sim.cfg.ip = L.LAPTOP_A;
  await sim.ready;
  const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
  const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
  try {
    for (const locale of ['ko-KR', 'en-US']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale, reducedMotion: 'reduce', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
      const pg = await ctx.newPage();
      pg.on('pageerror', (e) => log(`[phone pageerror] ${e.message}`));
      await pg.goto(`http://localhost:${SIM}/`);
      await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
      await pg.fill('[data-field=pair-code]', call('device.code').code);
      await pg.click('[data-action=pair-submit]');
      await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
      await sleep(1200);
      const id = sess().sessionId;
      await pg.evaluate((i) => window.__mtPhone.open(i), id);
      await pg.waitForSelector('[data-role="phone-session"]', { timeout: 10000 });
      if (locale === 'ko-KR') {
        await until(() => stateOf() === 'ready', 180000, 2000);
        call('session.send', { target: [NAME], text: PING(40) });
        await until(() => stateOf() === 'working', 60000);
        for (const x of ['P1-172', 'P2-172', 'P3-172']) call('session.send', { target: [NAME], text: `Reply with exactly: ${x}` });
      }
      await pg.waitForSelector('[data-role="phone-queue"] [data-role="delivery-group"]', { timeout: 15000 }).catch(() => {});
      await sleep(2000);
      const info = await pg.evaluate(() => {
        const q = document.querySelector('[data-role="phone-queue"]'); if (!q) return null;
        const r = q.getBoundingClientRect();
        const rows = [...q.querySelectorAll('.mt-dq-item')].map((e) => ({ text: e.querySelector('.mt-dq-text').textContent, btns: [...e.querySelectorAll('button')].map((b) => ({ a: b.dataset.action, h: Math.round(b.getBoundingClientRect().height), r: Math.round(b.getBoundingClientRect().right) })) }));
        return { box: { l: r.left, r: r.right, t: r.top, b: r.bottom }, rows, scrollX: document.documentElement.scrollWidth > window.innerWidth };
      });
      check(`[휴대폰 ${locale}] 세션 화면 입력 줄 위에 대기 묶음(글 셋, 본문 채움), 단추 34px, 가로 넘침 없음`, info && info.rows.length === 3 && info.rows.every((r) => /P\d-172/.test(r.text)) && info.rows.every((r) => r.btns.every((b) => b.h >= 34 && b.r <= 390)) && !info.scrollX, info);
      await pg.screenshot({ path: path.join(OUT, `phone-${locale}.png`) });
      if (locale === 'ko-KR') {
        // 휴대폰에서 순서 바꾸기(맨 아래 P3 위로)
        const p3 = await pg.$$eval('[data-role="phone-queue"] .mt-dq-item', (els) => els.find((e) => /P3-172/.test(e.textContent)).dataset.delivery);
        await pg.tap(`[data-delivery="${p3}"] [data-action="delivery-up"]`);
        await sleep(1000);
        check('[휴대폰] 위 단추로 P3가 P2 앞으로', order().join() === 'P1-172,P3-172,P2-172', order());
        await pg.screenshot({ path: path.join(OUT, 'phone-ko-reordered.png') });
      }
      await ctx.close();
    }
    await until(() => !active().length, 240000, 3000);
  } finally { await browser.close(); sim.close && sim.close(); }
}

async function stopBoard() {
  for (const s of call('session.list').filter((x) => /^p172-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'queue') await queue();
  else if (WHAT === 'steer') await steer();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p172-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
