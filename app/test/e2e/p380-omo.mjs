// P380 창 시험: OmO 로고(왼쪽 레일·설정 › 런처 목록·노드·세션 맵 카드)와 atrium prompt --raw(슬래시 명령이 omo 입력 맨 앞에).
// 판: 따로 띄운 개발용 판(atrium-dev-p380, 48107, 이 워크트리의 backend/.dev)만. 창의 원격 디버깅 포트 9588. 한 번에 한 창만(메모리).
// 실행(워크트리 뿌리): node app/test/e2e/p380-omo.mjs <setup|shots|stop> [round]   결과는 experiments/p380/<round>/(저장소 밖)
// - setup: 판·시험 폴더(git 아님)·OmO 런처(레일 즐겨찾기)·haiku 리드 lead·리드의 omo 하위 om1(gpt-6-luna-fast, low), 리드가 atrium prompt om1 --raw "/session"
// - shots: 창을 띄워 그림을 찍고 화면 글을 읽는다(모델 턴을 쓰지 않는다)
// - stop: 세션을 끄고(om1은 /quit) 터미널 서버·백엔드를 멈춘다
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'shots';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p380', TAG);
const CONVOS = 'C:\\Workspace\\mtask-p380-projects';
const F = 'C:\\Workspace\\mtask-p380-a';
const BOARD = 'atrium-dev-p380', PORT = '48107', DEBUG = 9588;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE|ANTHROPIC_)/.test(k)) delete process.env[k];
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p380-none-', ATRIUM_USAGE_PROBE: 'off',
};
Object.assign(process.env, ENV);
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
const { boardAgent } = await import('./lib/board-agent.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger('p380-' + WHAT);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)) : '')); };
const byName = (n) => call('session.list').find((x) => x.name === n);
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip } : {}) }).then(() => log('그림 ' + name + '.png')).catch((e) => log('스크린숏 실패 ' + name + ' ' + e.message.slice(0, 80)));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
const rectOf = (pg, sel, pad = 6) => pg.evaluate(([s, p]) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, Math.round(r.x) - p), y: Math.max(0, Math.round(r.y) - p), width: Math.round(r.width) + 2 * p, height: Math.round(Math.min(r.height, 980)) + 2 * p }; }, [sel, pad]);
const until = async (fn, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(250); } return false; };
const nodeSel = (s) => '.react-flow__node[data-id="' + s.sessionId + '"]';
const escAll = async (pg) => { for (let i = 0; i < 3; i++) { await pg.keyboard.press('Escape'); await sleep(200); } };
const fit = (pg) => pg.evaluate(() => window.__mtFlow && window.__mtFlow.fitView && window.__mtFlow.fitView()).catch(() => {});
const imgsOf = (pg, sel) => pg.evaluate((s) => [...document.querySelectorAll(s + ' img.mt-kind-icon[data-kind="omo"]')].map((i) => ({ src: i.getAttribute('src'), w: i.naturalWidth, ok: i.complete && i.naturalWidth > 0 })), sel);

async function setup() {
  try { log(atrium('backend', 'start').trim().slice(0, 200)); } catch (e) { log('backend start: ' + e.message.slice(0, 200)); }
  fs.mkdirSync(F, { recursive: true }); fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p380-a\n');
  call('workspace.open', { path: F, select: true });
  call('settings.set', { key: 'language', value: 'ko' });
  const L = call('launcher.list');
  if (!L.launchers.find((l) => l.harness === 'omo')) log('OmO 런처: ' + JSON.stringify(call('launcher.create', { launcher: { name: 'OmO Codex', harness: 'omo', model: 'chatgpt-subscription/gpt-6-luna-fast', effort: 'low', favorite: true } })).slice(0, 300));
  const ag = boardAgent({ env: ENV });
  await ag.lead('lead', { cwd: F });
  if (!byName('om1')) { const r = await ag.run('lead', 'child', 'om1', '--kind', 'omo', '--model', 'chatgpt-subscription/gpt-6-luna-fast', '--effort', 'low'); log('child om1: ' + r.code + ' ' + (r.stdout + r.stderr).slice(0, 600)); }
  await until(() => (byName('om1') || {}).state === 'ready', 90000);
  check('om1 준비(omo)', (byName('om1') || {}).kind === 'omo' && (byName('om1') || {}).state === 'ready', byName('om1'));
  const r = await ag.run('lead', 'prompt', 'om1', '--raw', '/session');
  log('prompt --raw: ' + r.code + ' ' + (r.stdout + r.stderr).slice(0, 600));
  fs.writeFileSync(path.join(OUT, 'prompt-raw.txt'), r.stdout + r.stderr);
  await sleep(6000);
  const del = call('delivery.list', { session: 'om1', limit: 10 });
  fs.writeFileSync(path.join(OUT, 'deliveries-om1.json'), JSON.stringify(del, null, 2));
  check('om1에 간 글이 머리 없이 "/session"', del.some((d) => d.text === '/session'), del.map((d) => ({ text: d.text.slice(0, 80), status: d.status })));
  const items = await ag.run('lead', 'items');
  fs.writeFileSync(path.join(OUT, 'lead-items.txt'), items.stdout + items.stderr);
  check('리드의 items에 om1 일(--raw로 맡긴 일)', /om1/.test(items.stdout) && /\/session/.test(items.stdout), items.stdout.slice(0, 600));
  const scr = atrium('get', 'om1', '--lines', '40'); fs.writeFileSync(path.join(OUT, 'om1-screen.txt'), scr);
  const omoModels = await ag.run('lead', 'models'); fs.writeFileSync(path.join(OUT, 'lead-models.txt'), omoModels.stdout);
}

async function shots() {
  const s = byName('om1'); const ld = byName('lead');
  if (!s || !ld) throw new Error('setup을 먼저 한다(om1·lead 없음)');
  const omoL = call('launcher.list').launchers.find((l) => l.harness === 'omo');
  const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=' + DEBUG, ...AWAKE] });
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    for (const lang of ['ko', 'en']) {
      call('settings.set', { key: 'language', value: lang }); await sleep(1500);
      await escAll(page); await fit(page); await sleep(1200);
      await shot(page, 'board-' + lang);
      // 왼쪽 레일(즐겨찾기 런처)
      const rail = await imgsOf(page, '[data-role="rail-left"]');
      await shot(page, 'rail-' + lang, await rectOf(page, '[data-role="rail-left"]'));
      check('[' + lang + '] 레일 OmO 단추가 로고 그림(omo.svg)', rail.length >= 1 && rail.every((x) => x.ok && /assets\/kinds\/omo\.svg$/.test(x.src)), rail);
      // 노드(om1)
      await page.waitForSelector(nodeSel(s), { timeout: 30000 }).catch(() => log('om1 노드를 못 찾음'));
      await page.click(nodeSel(s)).catch(() => {}); await sleep(1500);
      const nd = await imgsOf(page, nodeSel(s));
      await shot(page, 'node-om1-' + lang, await rectOf(page, nodeSel(s)));
      check('[' + lang + '] om1 노드 표지가 로고 그림', nd.length >= 1 && nd.every((x) => x.ok), nd);
      // 창의 터미널은 WebGL이라 글을 DOM에서 읽지 못한다: 판의 화면 꼬리(get)와 전달 기록으로 본다
      const got = JSON.parse(atrium('--json', 'get', 'om1'));
      const tail = (got.screenTail || []).join('\n');
      fs.writeFileSync(path.join(OUT, 'om1-tail-' + lang + '.txt'), tail);
      const sent = (got.deliveries || []).map((d) => d.text);
      check('[' + lang + '] om1에 들어간 글은 "/session" 하나(판 머리 없음)이고 omo가 슬래시 명령으로 받았다(Session Info 화면)', sent.length === 1 && sent[0] === '/session' && /Tokens|Session Info|Messages/.test(tail), { sent, tail: tail.slice(-300) });
      // 설정 › 런처 목록
      await escAll(page);
      await page.click('[data-action=settings-open]');
      await until(() => page.$('[data-role=settings]'));
      await page.click('[data-role=settings] [data-tab=launchers]').catch(() => {});
      await until(() => page.$('[data-role=launchers-list]'));
      await sleep(800);
      await shot(page, 'launchers-' + lang, await rectOf(page, '[data-role=settings]'));
      const li = await imgsOf(page, '[data-role=launcher-row][data-launcher="' + (omoL && omoL.id) + '"]');
      check('[' + lang + '] 런처 목록 OmO 줄이 로고 그림', li.length >= 1 && li.every((x) => x.ok), li);
      for (let i = 0; i < 3 && (await page.$('[data-role=settings]')); i++) { await page.keyboard.press('Escape'); await sleep(400); }
      // 세션 맵 카드
      await page.click('[data-role=sessions-pill]').catch(() => {}); await sleep(1500);
      await page.waitForSelector('[data-role="mission"]', { timeout: 20000 }).catch(() => log('세션 맵 못 엶'));
      await sleep(2200);
      const mp = await imgsOf(page, '[data-role="mission"]');
      await shot(page, 'map-' + lang);
      const card = await page.evaluate((id) => { const e = document.querySelector('[data-role="mission"] [data-id="' + id + '"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 }; }, s.sessionId);
      if (card) await shot(page, 'map-card-om1-' + lang, card);
      // 세션 맵 카드(창)는 모든 종류를 글자 표지(C, Cx, Om)로 쓴다(로고 그림 없음). 휴대폰 세션 맵(PhoneMission)은 로고 그림
      const marks = await page.evaluate(() => [...document.querySelectorAll('[data-role="mission"] [data-role="ta-meta"] .hb')].map((e) => e.textContent));
      check('[' + lang + '] 세션 맵 카드: 모든 종류가 글자 표지(로고 그림 없음) — 지휘 세션에 물을 것', mp.length === 0 && marks.includes('Om') && marks.includes('C'), { imgs: mp, marks });
      if (await page.$('[data-role="mission"]')) { await page.click('[data-action=mission-close]').catch(() => {}); await sleep(700); }
    }
  } finally {
    call('settings.set', { key: 'language', value: 'ko' });
    await closeApp(app).catch(() => {});
  }
}

async function stop() {
  const om = byName('om1');
  if (om) { try { atrium('input', 'om1', '/quit'); await sleep(500); atrium('input', 'om1', '\r'); await sleep(3000); } catch (e) { log('om1 /quit: ' + e.message.slice(0, 120)); } }
  for (const n of ['om1', 'lead']) { try { log(atrium('kill', n, '--yes').trim().slice(0, 160)); } catch (e) { log('kill ' + n + ': ' + e.message.slice(0, 160)); } }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop: ' + e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop: ' + e.message.slice(0, 200)); }
}

try {
  if (WHAT === 'setup') await setup(); else if (WHAT === 'shots') await shots(); else if (WHAT === 'stop') await stop(); else throw new Error('setup|shots|stop');
} finally {
  const bad = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, WHAT + '-results.json'), JSON.stringify(results, null, 2));
  log('결과 ' + (results.length - bad.length) + '/' + results.length + ' 통과' + (bad.length ? ' 실패: ' + bad.map((b) => b.name).join(', ') : ''));
}
