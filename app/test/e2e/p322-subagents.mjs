// P322 창 시험: 보통 Claude Code(haiku) 세션의 이번 턴 서브에이전트 칩. 세션이 서브에이전트 셋을 도는 동안
//   판 카드 칩·서브에이전트 겉판·세션 맵 칩(PC)과 휴대폰 맵 칩을 ko·en으로 찍고, 끝난 뒤 "서브 3/3 끝" 칩을 찍는다. 진행 값의 바뀜(0/3 → 3/3)을 기록한다.
// 판: 따로 띄운 개발용 판(atrium-dev-p322, 48072, 이 워크트리의 backend/.dev)만. 창 9553, 휴대폰 흉내 프록시 48473. 한 번에 창 하나(메모리).
// 실행: node app/test/e2e/p322-subagents.mjs <setup|live|stop> [round]   결과는 experiments/p322/<round>/(저장소 밖).
//   setup: 백엔드(가짜 tailscale)를 띄우고 새 시험 폴더에 haiku 세션 sub1을 띄운다(시험 폴더의 settings.local.json은 ping만 허용)
//   live: sub1에게 서브에이전트 셋을 쓰는 작은 일을 보내고 찍는다
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'live';
const TAG = process.argv[3] || 'round-1';
const NAME = 'sub1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p322', TAG);
const F = 'C:\\Workspace\\mtask-p322-a';
const CONVOS = 'C:\\Workspace\\mtask-p322-projects';
const BOARD = 'atrium-dev-p322', PORT = '48072', DEBUG = '9553', SIM = 48473;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
const L59 = await import('./p59-lib.mjs');
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p322-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${L59.NAME}:${SIM},localhost:${SIM}`,
  MT_E2E_OUT: path.join('p322', TAG),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger(`p322-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
const rectOf = (pg, sel, pad = 6) => pg.evaluate(([s, p]) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, Math.round(r.x) - p), y: Math.max(0, Math.round(r.y) - p), width: Math.round(r.width) + p * 2, height: Math.round(Math.min(r.height, 900)) + p * 2 }; }, [sel, pad]);
const until = async (fn, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(150); } return false; };

const seen = [];
let lastSig = '';
const progOf = () => { try { const s = call('session.list').find((x) => x.name === NAME); return s ? { sid: s.sessionId, state: s.state, p: s.subs || null } : null; } catch (e) { log('목록 실패', e.message.slice(0, 80)); return null; } };
function note(x) {
  const p = x && x.p;
  const sig = p ? `${p.key} ${p.done}/${p.total} run${p.running}${p.finished ? ' finished' : ''} [${p.items.map((i) => i.state[0]).join('')}] ${p.items.map((i) => i.name).join(' | ')}` : 'none';
  if (sig !== lastSig) { lastSig = sig; seen.push({ at: new Date().toISOString(), state: x ? x.state : null, sig }); log(`진행 ${x ? x.state : '?'} ${sig}`); }
}
let ticker = null;
const inject = () => Promise.resolve();
let FAKE = null;

async function pcShots(stage) {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    for (const lang of ['ko', 'en']) {
      call('settings.set', { key: 'language', value: lang }); await sleep(1500);
      await inject(page);
      const x = progOf(); note(x);
      if (!x) { log('세션 없음'); continue; }
      const sel = `.react-flow__node[data-id="${x.sid}"]`;
      await page.waitForSelector(sel, { timeout: 30000 }).catch(() => log('노드를 못 찾음'));
      const ok = await until(() => page.$(`${sel} [data-role=progress-chip]`), 15000);
      if (FAKE) await inject(page);
      const chip = await page.evaluate((s) => { const e = document.querySelector(s); return e ? { text: e.textContent, done: e.dataset.done, total: e.dataset.total, finished: e.dataset.finished, title: e.title } : null; }, `${sel} [data-role=progress-chip]`);
      check(`[${lang}·${stage}] 판 카드 머리에 안 진행 칩`, ok && chip, chip);
      const head = await rectOf(page, `${sel} .mt-node-head`, 4) || await rectOf(page, sel);
      if (head) await shot(page, `card-${stage}-${lang}`, { ...head, height: Math.min(head.height, 60) });
      if (chip) {
        if (FAKE) await inject(page);
        await page.click(`${sel} [data-role=progress-chip]`);
        const popOk = await until(() => page.$('[data-role=progress-pop]'), 3000);
        const rows = await page.evaluate(() => [...document.querySelectorAll('[data-role=progress-row]')].map((r) => r.innerText.replace(/\s+/g, ' ')));
        check(`[${lang}·${stage}] 칩을 누르면 갈래 목록(이름·상태·걸린 시간)`, popOk && rows.length === Number(chip.total), rows);
        const pr = await rectOf(page, '[data-role=progress-pop]', 8);
        const hr = head || pr;
        if (pr) await shot(page, `pop-${stage}-${lang}`, { x: Math.min(hr.x, pr.x), y: Math.min(hr.y, pr.y), width: Math.max(hr.x + hr.width, pr.x + pr.width) - Math.min(hr.x, pr.x), height: Math.max(hr.y + hr.height, pr.y + pr.height) - Math.min(hr.y, pr.y) });
        await page.keyboard.press('Escape'); await sleep(300);
        check(`[${lang}·${stage}] Esc로 겉판이 닫힌다`, !(await page.$('[data-role=progress-pop]')));
      }
      // 세션 맵
      for (let i = 0; i < 3 && (await page.$('[data-role="mission"]')); i++) { await page.keyboard.press('Escape'); await sleep(400); }
      await page.click('[data-action="mission-rail"]').catch((e) => log('맵 단추 실패', e.message.slice(0, 80)));
      await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 }).catch(() => log('맵 카드 없음'));
      await sleep(1500); await inject(page);
      const mc = await page.evaluate(() => { const e = document.querySelector('[data-role="mission"] [data-role=ta-progress]'); return e ? { text: e.textContent, finished: e.dataset.finished } : null; });
      check(`[${lang}·${stage}] 세션 맵 카드에 같은 칩`, mc && chip && mc.text === chip.text, { mc, chip: chip && chip.text });
      const card = await page.evaluate((id) => { const e = document.querySelector(`[data-role="mission"] .mt-ta-card[data-name="${id}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - 30), y: Math.max(0, r.y - 30), width: r.width + 60, height: r.height + 60 }; }, NAME);
      if (card) await shot(page, `map-${stage}-${lang}`, card);
      await shot(page, `mapfull-${stage}-${lang}`);
      for (let i = 0; i < 3 && (await page.$('[data-role="mission"]')); i++) { await page.keyboard.press('Escape'); await sleep(400); }
    }
  } finally { await closeApp(app); }
}

async function phoneShots(stage, langs = ['ko', 'en']) {
  const pw = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: L59.NAME, login: L59.LOGIN, keepOrigin: true }); sim.cfg.ip = L59.LAPTOP_A;
  await sim.ready;
  const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
  const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
  try {
    for (const lang of langs) {
      call('settings.set', { key: 'language', value: lang });
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: lang === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce' });
      const pg = await ctx.newPage();
      pg.on('pageerror', (e) => log(`[phone pageerror] ${e.message}`));
      await pg.goto(`http://localhost:${SIM}/`);
      await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
      await pg.fill('[data-field=pair-code]', call('device.code').code);
      await pg.click('[data-action=pair-submit]');
      await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
      await sleep(2500); await inject(pg);
      const ok = await until(() => pg.$('[data-role=ta-progress]'), 15000);
      const tile = await pg.evaluate(() => { const e = document.querySelector('[data-role=ta-progress-tile]'); if (!e) return null; const r = e.getBoundingClientRect(); return { text: e.textContent, shown: r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' }; });
      check(`[${lang}·${stage}] 휴대폰 맵 타일(멀리 단계)에 짧은 칩이 보인다`, tile && tile.shown, tile);
      const t = await pg.evaluate(() => { const e = document.querySelector('[data-role=ta-progress]'); return e ? { text: e.textContent, finished: e.dataset.finished } : null; });
      check(`[${lang}·${stage}] 휴대폰 맵 카드에 칩`, ok && t, t);
      const x = progOf();
      const card = x ? await pg.evaluate((id) => { const e = document.querySelector(`.mt-ta-card[data-name="${id}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: Math.min(390, r.width + 32), height: r.height + 32 }; }, NAME) : null;
      if (card) await shot(pg, `phone-card-${stage}-${lang}`, card);
      await shot(pg, `phone-${stage}-${lang}`);
      await ctx.close();
    }
  } finally { await browser.close().catch(() => {}); try { sim.close && sim.close(); } catch {} }
}


const TASK = 'Harmless UI test; edit and create nothing. In ONE message, use your Agent tool three times in parallel (subagent_type general-purpose, model haiku, foreground). '
  + 'First: description "Find payment paths", prompt "Run the shell command: ping -n 100 127.0.0.1 . Then reply only: done." '
  + 'Second: description "List refund tests", prompt "Run the shell command: ping -n 110 127.0.0.1 . Then reply only: done." '
  + 'Third: description "Check log format", prompt "Run the shell command: ping -n 15 127.0.0.1 . Then reply only: done." '
  + 'Wait for all three, then reply only: all done.';

async function setupBoard() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
  for (const s of call('session.list')) { try { atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log('옛 세션 끄기 실패', e.message.slice(0, 120)); } }
  fs.mkdirSync(path.join(F, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p322-a\n');
  fs.writeFileSync(path.join(F, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['Bash(ping:*)', 'PowerShell(ping:*)'] } }, null, 2));
  call('workspace.open', { path: F, select: true });
  const r = call('session.spawn', { cwd: F, kind: 'claude', name: NAME, model: 'haiku' }); log('띄움', r.sessionId);
  const ok = await until(() => { const s = call('session.list').find((x) => x.name === NAME); return s && s.state === 'ready'; }, 120000);
  const s = call('session.list').find((x) => x.name === NAME);
  check('장면: haiku 세션 하나가 쉰다', ok, s && { state: s.state, trust: s.trust });
}

async function live() {
  ticker = setInterval(() => note(progOf()), 1500);
  note(progOf());
  call('session.send', { target: [NAME], text: TASK });
  log('보냄');
  let x = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 5 * 60e3) { x = progOf(); note(x); if (x && x.p && !x.p.finished && x.p.total >= 3) break; await sleep(1500); }
  if (!(x && x.p && !x.p.finished)) throw new Error('도는 서브에이전트가 나타나지 않았다');
  check('세션이 서브에이전트를 셋 띄우자 칩 진행이 나타났다', x.p.total === 3, x.p);
  await pcShots('run');
  x = progOf(); note(x);
  if (x && x.p && !x.p.finished) await phoneShots('run');
  log('끝을 기다린다');
  const t1 = Date.now();
  while (Date.now() - t1 < 10 * 60e3) { x = progOf(); note(x); if (!x || !x.p || x.p.finished) break; await sleep(1500); }
  check('도는 서브에이전트를 본 뒤 끝난 진행(3/3 끝)이 남는다', x && x.p && x.p.finished && x.p.done === 3 && x.p.total === 3, x && x.p);
  await until(async () => { const y = progOf(); note(y); return y && y.state !== 'working'; }, 120000);
  x = progOf(); note(x);
  check('턴이 끝나도 다음 턴까지 끝 칩이 남는다', x && x.p && x.p.finished, x && { state: x.state, p: x.p && x.p.done });
  if (x && x.p && x.p.finished) { await pcShots('done'); await phoneShots('done', ['ko']); }
  check('진행이 0에서 끝까지 바뀌었다', seen.filter((s) => s.sig !== 'none').length >= 2, seen.map((s) => s.sig));
  // 다음 턴: 서브에이전트 없이 → 칩이 지워진다
  call('session.send', { target: [NAME], text: 'Reply only: ok' });
  const gone = await until(async () => { const y = progOf(); note(y); return y && !y.p; }, 120000);
  check('다음 턴이 시작되면 칩이 지워진다', gone, progOf());
}

async function stopBoard() {
  try { for (const s of call('session.list')) atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log(`kill ${e.message.slice(0, 120)}`); }
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'live') await live();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) { log('오류', e.stack || e.message); check('시험이 끝까지 돌았다', false, e.message); }
finally {
  if (ticker) clearInterval(ticker);
  fs.writeFileSync(path.join(OUT, `progress-log-${WHAT}.json`), JSON.stringify(seen, null, 2));
  fs.writeFileSync(path.join(OUT, `results-${WHAT}.json`), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
  process.exit(0);
}
