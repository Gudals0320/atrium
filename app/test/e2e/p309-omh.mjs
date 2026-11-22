// P309 창 시험: omh(OMH Native)를 hermes 계열로 띄운 카드(런처·하위), 명령 런처 편집 틀의 하네스 계열·오케스트레이션 칸,
//   판 셸 카드에서 omh를 쳤을 때 같은 카드가 OMH 에이전트 카드로 바뀌는 것과 OMH 바탕색(OSC 11) 전·후.
//   모델 턴을 쓰지 않는다(OMH를 열고 /quit로 닫기만). 그림을 찍고 화면 글을 읽어 확인한다.
// 판: 따로 띄운 개발용 판(atrium-dev-p309, 48059, 이 워크트리의 backend/.dev)만. 창의 원격 디버깅 포트 9540. 한 번에 한 창만(메모리).
//   판에는 미리 셸 sh1·sh2(프롬프트), OMH 런처(명령 omh)로 띄운 om1, Claude 리드 ld의 OMH 하위 om2가 떠 있어야 한다(기록 docs log p309).
//   OMH가 바꾼 터미널 바탕은 OMH가 끝나도 그 카드 xterm에 남으므로 후(판 기본)는 sh1, 전(그 한 번만 바탕색 켬)은 sh2에서 찍는다.
// 실행: node app/test/e2e/p309-omh.mjs [round]   결과는 워크트리의 experiments/p309/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p309', TAG);
const BOARD = 'atrium-dev-p309', PORT = '48059', DEBUG = '9540';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'no-projects'), ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: path.join('p309', TAG),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger(`p309-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
const rectOf = (pg, sel) => pg.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, Math.round(r.x) - 6), y: Math.max(0, Math.round(r.y) - 6), width: Math.round(r.width) + 12, height: Math.round(Math.min(r.height, 900)) + 12 }; }, sel);
const until = async (fn, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(250); } return false; };
const sessionOf = (name) => call('session.list').find((s) => s.name === name);
const nodeSel = (s) => `.react-flow__node[data-id="${s.sessionId}"]`;
const cardInfo = (pg, sel) => pg.evaluate((x) => { const e = document.querySelector(x); if (!e) return null; const k = e.querySelector('[data-kind]'); const xt = e.querySelector('.xterm-viewport, .xterm-screen'); return { text: e.innerText.replace(/\s+/g, ' ').slice(0, 260), kind: k ? k.getAttribute('data-kind') : null, bg: xt ? getComputedStyle(xt).backgroundColor : null }; }, sel);
// 카드 터미널에 사람처럼 친다(카드를 눌러 초점, 글자, Enter)
async function typeInCard(pg, s, text) {
  const sel = nodeSel(s);
  await pg.click(`${sel} .xterm-screen`).catch((e) => log('카드 누르기 실패', e.message.slice(0, 80)));
  await sleep(400);
  await pg.keyboard.type(text, { delay: 15 }); await sleep(200); await pg.keyboard.press('Enter');
}
async function zoomTo(pg, s) { await pg.evaluate((id) => window.__mt && window.__mt.focusSession && window.__mt.focusSession(id), s.sessionId).catch(() => {}); await sleep(800); }

const pre = call('session.list');
for (const n of ['sh1', 'sh2', 'om1', 'om2']) if (!pre.find((s) => s.name === n)) throw new Error(`${n} 세션이 없다`);
let L = call('launcher.list', {});
const omhL = L.launchers.find((l) => l.name === 'OMH');
if (!omhL) throw new Error('OMH 런처가 없다');

const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
try {
  await awayWin(app);
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  for (const lang of ['ko', 'en']) {
    call('settings.set', { key: 'language', value: lang }); await sleep(1500);
    // 1) 런처·하위로 띄운 OMH 카드(배경 끄기 뒤)
    for (const n of ['om1', 'om2']) {
      const s = sessionOf(n);
      await page.waitForSelector(nodeSel(s), { timeout: 30000 }).catch(() => log(`${n} 노드를 못 찾음`));
      for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await sleep(200); }
      await page.evaluate(() => window.__mtFlow && window.__mtFlow.fitView && window.__mtFlow.fitView()).catch(() => {}); await sleep(800);
      await page.click(nodeSel(s)).catch(() => {}); await sleep(1200); // 카드를 크게(가까이 얼굴, 터미널을 붙인다)
      if (await page.$(`${nodeSel(s)} .xterm-screen`)) { await page.click(`${nodeSel(s)} .xterm-screen`).catch(() => {}); await sleep(1500); }
      const r = await rectOf(page, nodeSel(s)); if (r) await shot(page, `card-${n}-${lang}`, r);
      const info = await cardInfo(page, nodeSel(s));
      log(`[${lang}] ${n}: ${JSON.stringify(info)} state=${s.state} kind=${s.kind} flavor=${s.flavor}`);
      check(`[${lang}] ${n} 카드: 종류 hermes·표시 OMH(아이콘 omh)·준비 완료·오케스트레이션 표`, s.kind === 'hermes' && s.flavor === 'omh' && info && info.kind === 'omh' && s.state === 'ready' && /OMH/.test(info.text) && /(오케스트레이션|Orchestrat)/i.test(info.text), info);
    }
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await sleep(200); }
    await page.evaluate(() => window.__mtFlow && window.__mtFlow.fitView && window.__mtFlow.fitView()).catch(() => {}); await sleep(800);
    await shot(page, `board-${lang}`);
    // 2) 명령 런처 편집 틀: 하네스 계열(자동 → Hermes 계열)·오케스트레이션
    await page.click('[data-action=settings-open]');
    await until(() => page.$('[data-role=settings]'));
    await page.click('[data-role=settings] [data-tab=launchers]');
    await until(() => page.$('[data-role=launchers-list]'));
    await sleep(600);
    await shot(page, `launchers-${lang}`, await rectOf(page, '[data-role=settings]'));
    const ok = await page.click(`[data-role=launcher-row][data-launcher="${omhL.id}"] [data-action=launcher-edit]`).then(() => true).catch((e) => { log('편집 단추 실패', e.message.slice(0, 80)); return false; });
    await until(() => page.$('[data-role=launcher-form]'));
    await sleep(800);
    const form = await page.evaluate(() => { const f = document.querySelector('[data-role=launcher-form]'); if (!f) return null; const sel = f.querySelector('[data-field=launcher-family]'); return { harness: f.getAttribute('data-harness'), family: sel ? sel.value : null, options: sel ? [...sel.options].map((o) => o.textContent) : [], note: (f.querySelector('[data-role=launcher-family-note]') || {}).innerText || null, orch: !!(f.querySelector('[data-field=launcher-orchestrates]') || {}).checked, fallback: !!(f.querySelector('[data-field=launcher-reportFallback]') || {}).checked, preview: (f.querySelector('[data-role=launcher-form-preview]') || {}).innerText || '' }; });
    log(`[${lang}] 편집 틀(${ok}): ${JSON.stringify(form)}`);
    await shot(page, `launcher-form-${lang}`, await rectOf(page, '[data-role=settings]'));
    check(`[${lang}] 명령 런처 편집 틀: 하네스 계열 자동(Hermes)·오케스트레이션 켬·마지막 답 물러섬·미리보기 omh`, form && form.harness === 'command' && form.family === '' && form.options.length === 4 && /Hermes/.test(form.options[0]) && form.orch && form.fallback && /omh/.test(form.preview), form);
    // 계열을 셸 명령으로 바꾸면 오케스트레이션 칸이 사라진다(저장하지 않는다)
    await page.selectOption('[data-field=launcher-family]', 'shell');
    await sleep(600);
    const asShell = await page.evaluate(() => ({ orch: !!document.querySelector('[data-role=launcher-orch]'), note: (document.querySelector('[data-role=launcher-family-note]') || {}).innerText || '' }));
    await shot(page, `launcher-form-shell-${lang}`, await rectOf(page, '[data-role=settings]'));
    check(`[${lang}] 계열 셸 명령: 오케스트레이션 칸 없음`, !asShell.orch, asShell);
    await page.click('[data-action=launcher-cancel]').catch(() => {});
    for (let i = 0; i < 3 && (await page.$('[data-role=settings]')); i++) { await page.keyboard.press('Escape'); await sleep(400); }
    // 3) 셸 카드에서 omh: 바탕색 켠 채(전) → /quit → 판 기본(후, OMH_TUI_WALLPAPER=0)
    for (const phase of ['after', 'before']) {
      const shName = phase === 'after' ? 'sh1' : 'sh2';
      let sh = sessionOf(shName);
      if (sh.kind !== 'shell') { log('sh1이 셸이 아니다', sh.kind); }
      await zoomTo(page, sh);
      const r0 = await rectOf(page, nodeSel(sh)); if (r0) await shot(page, `shell-prompt-${phase}-${lang}`, r0);
      // 전: 그 한 번만 바탕색을 켠다(cmd /c의 env, PowerShell 세션에는 남지 않는다). 후: 판이 준 env(OMH_TUI_WALLPAPER=0) 그대로
      if (phase === 'after') {
        await typeInCard(page, sh, 'echo "wp=$($env:OMH_TUI_WALLPAPER)"'); await sleep(1500);
        const scr = atrium('screen', shName, '--text');
        check(`[${lang}] 판 셸 터미널 env: OMH_TUI_WALLPAPER=0`, /wp=0\s*$/m.test(scr), scr.trim().split('\n').slice(-3).join(' | '));
      }
      await typeInCard(page, sh, phase === 'before' ? 'cmd /c "set OMH_TUI_WALLPAPER=1&& omh --new"' : 'omh --new');
      const promoted = await until(() => { sh = sessionOf(shName); return sh.kind === 'hermes' && sh.state === 'ready'; }, 60000);
      await sleep(2500);
      const info = await cardInfo(page, nodeSel(sh));
      const r = await rectOf(page, nodeSel(sh)); if (r) await shot(page, `shell-omh-${phase}-${lang}`, r);
      log(`[${lang}] ${shName} ${phase}: ${JSON.stringify(info)} kind=${sh.kind} flavor=${sh.flavor} fromShell=${sh.fromShell} state=${sh.state}`);
      check(`[${lang}] 셸에서 연 omh(${phase}): 같은 카드가 OMH 에이전트(hermes·준비 완료·셸에서 표)`, promoted && sh.flavor === 'omh' && sh.fromShell && info && info.kind === 'omh', { kind: sh.kind, flavor: sh.flavor, state: sh.state, info });
      await typeInCard(page, sh, '/quit');
      const back = await until(() => { sh = sessionOf(shName); return sh.kind === 'shell'; }, 30000);
      await sleep(1500);
      check(`[${lang}] /quit 뒤(${phase}): 셸 카드로 돌아옴(${sh.state}), OMH 표시 지움`, back && sh.state === 'shell_idle' && !sh.flavor, { kind: sh.kind, state: sh.state, flavor: sh.flavor });
      if (phase === 'before') { const rb = await rectOf(page, nodeSel(sh)); if (rb) await shot(page, `shell-back-${lang}`, rb); }
    }
  }
} finally {
  call('settings.set', { key: 'language', value: 'ko' });
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
  await closeApp(app).catch(() => {});
}
