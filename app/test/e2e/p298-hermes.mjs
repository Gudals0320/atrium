// P298 창 시험: 판이 띄운 Hermes 세션(hermes --tui, 화면 상태 줄로 ready를 안다)의 판 카드·세션 맵 표시와 Hermes 런처(설정 › 런처 목록·편집 틀).
//   모델 턴을 쓰지 않는다(프롬프트를 보내지 않는다). 그림만 찍고 화면 글을 읽어 확인한다.
// 판: 따로 띄운 개발용 판(atrium-dev-p298, 48048, 이 워크트리의 backend/.dev)만. 창의 원격 디버깅 포트 9529. 한 번에 한 창만(메모리).
//   판에는 미리 Hermes 독립 세션(hm1)과 Codex 리드(ld)의 Hermes 하위(hm2)가 떠 있어야 한다(기록 docs log p298).
// 실행: node app/test/e2e/p298-hermes.mjs [round]   결과는 워크트리의 experiments/p298/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p298', TAG);
const BOARD = 'atrium-dev-p298', PORT = '48048', DEBUG = '9529';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'projects'), ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: path.join('p298', TAG),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger(`p298-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
const rectOf = (pg, sel) => pg.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, Math.round(r.x) - 6), y: Math.max(0, Math.round(r.y) - 6), width: Math.round(r.width) + 12, height: Math.round(Math.min(r.height, 900)) + 12 }; }, sel);
const until = async (fn, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(150); } return false; };

const list = call('session.list');
const hm1 = list.find((s) => s.name === 'hm1'), hm2 = list.find((s) => s.name === 'hm2');
if (!hm1 || !hm2) throw new Error('hm1·hm2(hermes) 세션이 없다');
log('hm', JSON.stringify([hm1, hm2].map((s) => ({ name: s.name, kind: s.kind, state: s.state, model: s.model }))));
check('판 상태: hm1·hm2 ready(화면 상태 줄)', hm1.state === 'ready' && hm2.state === 'ready', [hm1.state, hm2.state]);
// Hermes 런처(기본 목록에는 없다. 시험이 만든다)
let L = call('launcher.list', {});
const hl = L.launchers.find((l) => l.name === 'Hermes p298') || call('launcher.create', { launcher: { name: 'Hermes p298', harness: 'hermes', args: '--yolo' }, favorite: true }).launcher;
L = call('launcher.list', {});

const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
try {
  await awayWin(app);
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  for (const lang of ['ko', 'en']) {
    call('settings.set', { key: 'language', value: lang }); await sleep(1500);
    for (const s of [hm1, hm2]) {
      const sel = `.react-flow__node[data-id="${s.sessionId}"]`;
      await page.waitForSelector(sel, { timeout: 30000 }).catch(() => log(`${s.name} 노드를 못 찾음`));
      const card = await rectOf(page, sel);
      if (card) await shot(page, `card-${s.name}-${lang}`, card);
      const info = await page.evaluate((x) => { const e = document.querySelector(x); if (!e) return null; const k = e.querySelector('[data-kind]'); return { text: e.innerText.replace(/\s+/g, ' ').slice(0, 300), kind: k ? k.getAttribute('data-kind') : null }; }, sel);
      log(`[${lang}] ${s.name} 카드: ${JSON.stringify(info)}`);
      check(`[${lang}] 판 카드 ${s.name}: hermes 종류 아이콘`, info && info.kind === 'hermes', info);
    }
    await shot(page, `board-${lang}`);
    // 세션 맵
    for (let i = 0; i < 3 && (await page.$('[data-role="mission"]')); i++) { await page.keyboard.press('Escape'); await sleep(400); }
    await page.click('[data-action="mission-rail"]').catch((e) => log('맵 단추 실패', e.message.slice(0, 80)));
    await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 }).catch(() => log('맵 카드 없음'));
    await sleep(1500);
    await page.evaluate(() => window.__mtTa && window.__mtTa.fit && window.__mtTa.fit()).catch(() => {}); await sleep(1000);
    await shot(page, `map-${lang}`);
    const mapCards = await page.evaluate(() => [...document.querySelectorAll('[data-role="mission"] .mt-ta-card')].map((c) => c.innerText.replace(/\s+/g, ' ').trim().slice(0, 200)));
    log(`[${lang}] 맵 카드: ${JSON.stringify(mapCards)}`);
    check(`[${lang}] 세션 맵: hm1·hm2 카드에 Hermes와 지금 모델`, ['hm1', 'hm2'].every((n) => mapCards.some((c) => new RegExp(`\\b${n}\\b`).test(c) && /Hermes/.test(c))), mapCards);
    for (let i = 0; i < 3 && (await page.$('[data-role="mission"]')); i++) { await page.keyboard.press('Escape'); await sleep(400); }
    // 런처 목록·편집 틀
    await page.click('[data-action=settings-open]');
    await until(() => page.$('[data-role=settings]'));
    await page.click('[data-role=settings] [data-tab=launchers]');
    await until(() => page.$('[data-role=launchers-list]'));
    await sleep(600);
    const row = await page.evaluate((id) => { const r = document.querySelector(`[data-role=launcher-row][data-launcher="${id}"]`); return r ? { text: r.innerText.replace(/\s+/g, ' '), orch: !!r.querySelector('[data-role=launcher-orch-tag]') } : null; }, hl.id);
    check(`[${lang}] 런처 목록: Hermes 런처 줄에 자체 오케스트레이션 표시`, row && row.orch, row);
    await shot(page, `launchers-${lang}`, await rectOf(page, '[data-role=settings]'));
    await page.click(`[data-role=launcher-row][data-launcher="${hl.id}"] [data-action=launcher-edit]`);
    await until(() => page.$('[data-role=launcher-form]'));
    await sleep(600);
    const form = await page.evaluate(() => { const h = document.querySelector('[data-field=launcher-harness]'); const p = document.querySelector('[data-role=launcher-form-preview]'); return { harness: h ? h.options[h.selectedIndex].textContent : null, opts: h ? [...h.options].map((o) => o.value) : [], preview: p ? p.innerText : null, orch: !!document.querySelector('[data-field=launcher-orchestrates]:checked'), fallback: !!document.querySelector('[data-field=launcher-reportFallback]:checked') }; });
    log(`[${lang}] 편집 틀: ${JSON.stringify(form)}`);
    check(`[${lang}] 편집 틀: 하네스 Hermes, 미리보기 hermes(판이 --tui를 더한다), 오케스트레이션·마지막 답 물러섬 켜짐(종류 기본)`, form.harness === 'Hermes' && form.opts.includes('hermes') && /hermes --yolo/.test(form.preview || '') && form.orch && form.fallback, form);
    await shot(page, `launcher-form-${lang}`, await rectOf(page, '[data-role=settings]'));
    await page.click('[data-action=launcher-cancel]').catch(() => {});
    for (let i = 0; i < 3 && (await page.$('[data-role=settings]')); i++) { await page.keyboard.press('Escape'); await sleep(400); }
  }
} finally { await closeApp(app); }
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
