// P279 창 시험: 판이 띄운 dsh 세션(DeepSeek Harness, dsh-TUI)의 판 카드·세션 맵·사이드바 표시(종류 이름·아이콘·지금 모델·상태)와
//   일하는 dsh에 보낼 때의 스티어링 단추 설명. 그림만 찍고 화면 글을 읽어 확인한다.
// 판: 따로 띄운 개발용 판(atrium-dev-p279, 48029, 이 워크트리의 backend/.dev)만. 창의 원격 디버깅 포트 9510. 한 번에 한 창만(메모리).
//   판에는 미리 리드(Claude Code haiku, lead)와 dsh 하위(d1)가 떠 있어야 한다(시험 폴더 C:\\Workspace\\mtask-p229-a, 기록 docs log p279).
// 실행: node app/test/e2e/p279-dsh.mjs [round]   결과는 워크트리의 experiments/p279/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p279', TAG);
const BOARD = 'atrium-dev-p279', PORT = '48029', DEBUG = '9510';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p279-convos'), ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: path.join('p279', TAG),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger(`p279-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
const rectOf = (pg, sel) => pg.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, Math.round(r.x) - 6), y: Math.max(0, Math.round(r.y) - 6), width: Math.round(r.width) + 12, height: Math.round(Math.min(r.height, 900)) + 12 }; }, sel);

const d1 = call('session.list').find((s) => s.name === 'd1');
if (!d1) throw new Error('d1(dsh) 세션이 없다');
log('d1', JSON.stringify({ kind: d1.kind, state: d1.state, model: d1.model, effort: d1.effort }));

const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
try {
  await awayWin(app);
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  for (const lang of ['ko', 'en']) {
    call('settings.set', { key: 'language', value: lang }); await sleep(1500);
    // 판 카드
    const nodeSel = `.react-flow__node[data-id="${d1.sessionId}"]`;
    await page.waitForSelector(nodeSel, { timeout: 30000 }).catch(() => log('d1 노드를 못 찾음'));
    await shot(page, `board-${lang}`);
    const card = await rectOf(page, nodeSel);
    if (card) await shot(page, `card-d1-${lang}`, card);
    const cardText = await page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').slice(0, 400) : null; }, nodeSel);
    log(`[${lang}] 카드 글: ${cardText}`);
    const icon = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const k = e.querySelector('[data-kind], .mt-kind'); return k ? (k.getAttribute('data-kind') || k.className) : null; }, nodeSel);
    // 판 카드 머리에는 종류 꼬리표와 아이콘(모델은 카드 안 dsh-TUI 상태 줄과 세션 맵에 보인다. Claude Code 카드도 머리에 모델이 없다)
    check(`[${lang}] 판 카드: d1 카드에 dsh 종류 꼬리표·아이콘, @lead의 워커`, !!cardText && /\bdsh\b/.test(cardText) && icon === 'dsh' && /@lead/.test(cardText), { cardText, icon });
    // 사이드바
    if (!(await page.$('[data-role="sidebar"]'))) await page.keyboard.press('Control+Shift+E');
    await page.waitForSelector('[data-role="sidebar"]', { timeout: 10000 }).catch(() => log('사이드바 없음'));
    await sleep(800);
    const side = await rectOf(page, '[data-role="sidebar"]');
    if (side) await shot(page, `sidebar-${lang}`, side);
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-role="sidebar-rows"] [data-row]')].map((r) => r.innerText.replace(/\s+/g, ' ').trim().slice(0, 120)));
    log(`[${lang}] 사이드바 줄: ${JSON.stringify(rows)}`);
    check(`[${lang}] 사이드바: d1 줄`, rows.some((r) => /\bd1\b/.test(r)), rows);
    await page.keyboard.press('Control+Shift+E'); await sleep(500);
    // 세션 맵
    for (let i = 0; i < 3 && (await page.$('[data-role="mission"]')); i++) { await page.keyboard.press('Escape'); await sleep(400); }
    await page.click('[data-action="mission-rail"]').catch((e) => log('맵 단추 실패', e.message.slice(0, 80)));
    await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 }).catch(() => log('맵 카드 없음'));
    await sleep(1500);
    await page.evaluate(() => window.__mtTa && window.__mtTa.fit && window.__mtTa.fit()).catch(() => {}); await sleep(1000);
    await shot(page, `map-${lang}`);
    const mapCards = await page.evaluate(() => [...document.querySelectorAll('[data-role="mission"] .mt-ta-card')].map((c) => c.innerText.replace(/\s+/g, ' ').trim().slice(0, 160)));
    log(`[${lang}] 맵 카드: ${JSON.stringify(mapCards)}`);
    check(`[${lang}] 세션 맵: d1 카드에 종류 DeepSeek (dsh)와 지금 모델·노력`, mapCards.some((c) => /\bd1\b/.test(c) && /DeepSeek \(dsh\)/.test(c) && /deepseek-v4[^ ]*·high/.test(c)), mapCards);
    for (let i = 0; i < 3 && (await page.$('[data-role="mission"]')); i++) { await page.keyboard.press('Escape'); await sleep(400); }
  }
  // 일하는 dsh: 카드 상태와 보내기 칸의 스티어링 설명
  call('settings.set', { key: 'language', value: 'ko' }); await sleep(1200);
  atrium('send', '@d1', 'Run the shell command Start-Sleep -Seconds 12 and then reply with the single word SLEPT.');
  let st = null; for (let i = 0; i < 40; i++) { st = call('session.list').find((s) => s.name === 'd1'); if (st && st.state === 'working') break; await sleep(1000); }
  check('일하는 d1(working)', st && st.state === 'working', st && st.state);
  await sleep(1500);
  const nodeSel = `.react-flow__node[data-id="${d1.sessionId}"]`;
  const card = await rectOf(page, nodeSel);
  if (card) await shot(page, 'card-d1-working-ko', card);
  await page.click('[data-role=command]');
  await page.keyboard.type('@d1 steer test ');
  await sleep(1200);
  const steer = await page.evaluate(() => { const b = document.querySelector('[data-action=cmd-steer]'); const k = document.querySelector('[data-role=cmd-steer-key]'); return { btn: b ? { title: b.getAttribute('title'), disabled: b.disabled || b.getAttribute('aria-disabled'), off: b.getAttribute('data-off') } : null, key: k ? k.getAttribute('title') : null }; });
  log('스티어링 단추', JSON.stringify(steer));
  await shot(page, 'cmdbar-d1-working-ko');
  const bar = await rectOf(page, '.mt-bottom');
  if (bar) await shot(page, 'cmdbar-d1-working-ko-bar', bar);
  check('스티어링: dsh는 할 수 없음(대기열) 설명', /스티어링할 수 없음/.test(JSON.stringify(steer)), steer);
  await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
  for (let i = 0; i < 60; i++) { st = call('session.list').find((s) => s.name === 'd1'); if (st && st.state !== 'working') break; await sleep(1000); }
  log('끝 d1', JSON.stringify({ state: st && st.state, last: st && st.lastAnswer }));
} finally { await closeApp(app); }
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
