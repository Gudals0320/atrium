// P330 창 시험: 설정 › 런처의 하네스 계약 안내(모델 이름을 얻는 곳·노력 값·승인 칸 인자), 겹치는 추가 인자와 "칸으로 옮기기",
//   명령 한 줄 런처의 "하네스 런처로 바꾸기" 권함, 점검(--version·--help만) 결과. ko·en 그림. 저장하지 않는다(취소로 닫는다).
// 판: 따로 띄운 개발용 판(atrium-dev-p330, 48080, 이 워크트리의 backend/.dev)만. 창의 원격 디버깅 포트 9561. 한 번에 한 창만(메모리).
// 실행: node app/test/e2e/p330-launchers.mjs [round]   결과는 워크트리의 experiments/p330/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p330', TAG);
const BOARD = 'atrium-dev-p330', PORT = '48080', DEBUG = '9561';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'projects'), ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: path.join('p330', TAG),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger('p330-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1200)) : '')); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip } : {}) }).then(() => log('그림 ' + name + '.png')).catch((e) => log('스크린숏 실패 ' + name + ' ' + e.message.slice(0, 80)));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
const rectOf = (pg, sel) => pg.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, Math.round(r.x) - 6), y: Math.max(0, Math.round(r.y) - 6), width: Math.round(r.width) + 12, height: Math.round(r.height) + 12 }; }, sel);
const until = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(150); } return false; };

// 그림용 런처(없으면 만든다. 이름은 지어냈다)
const ensure = (l) => { const L = call('launcher.list', {}); const f = L.launchers.find((x) => x.name === l.name); return f || call('launcher.create', { launcher: l, favorite: false }).launcher; };
const want = {
  cx: ensure({ name: 'Codex fast', harness: 'codex', model: 'gpt-6-astra', args: '--approve-for-me -c model_reasoning_effort="high"' }),
  gem: ensure({ name: 'Gem', harness: 'agy', permissionMode: 'bypassPermissions', args: '--model gemini-4-hydrogen --effort high' }),
  ds: ensure({ name: 'DS2', harness: 'command', command: 'dsh-tui' }),
  hm: ensure({ name: 'Herm2', harness: 'command', command: 'omh' }),
  bad: ensure({ name: 'p330-bad', harness: 'codex', model: 'gpt-6-luna', args: '--full-auto --wat' }),
  hr: ensure({ name: 'Herm reason', harness: 'hermes', args: '--reasoning high' }),
  tier: ensure({ name: 'p330-agy-a', harness: 'agy', model: 'gemini-3.8-flash-medium', effort: 'low', permissionMode: 'bypassPermissions' }),
};
const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=' + DEBUG, ...AWAKE] });
const formInfo = () => page.evaluate(() => {
  const v = (f) => { const e = document.querySelector('[data-field=' + f + ']'); return e ? e.value : null; };
  const txt = (s) => [...document.querySelectorAll(s)].map((e) => e.innerText.replace(/\s+/g, ' ').trim());
  return { harness: v('launcher-harness'), model: v('launcher-model'), effort: v('launcher-effort'), perm: v('launcher-permissionMode'), args: v('launcher-args'), start: v('launcher-startCommand'), command: v('launcher-command'),
    hint: txt('[data-role=launcher-contract] li'), overlap: txt('[data-role=launcher-overlap] li'), move: !!document.querySelector('[data-action=launcher-move-args]'), convert: txt('[data-role=launcher-convert-note]'),
    check: [...document.querySelectorAll('[data-role=launcher-check-result] li')].map((e) => ({ t: e.innerText.trim(), tone: e.dataset.tone })), preview: txt('[data-role=launcher-form-preview]')[0] || '' };
});
const openEdit = async (id) => {
  await page.click('[data-role=launcher-row][data-launcher="' + id + '"] [data-action=launcher-edit]');
  await until(() => page.$('[data-role=launcher-form]'));
  await until(async () => (await formInfo()).preview && !/…$/.test((await formInfo()).preview), 4000);
  await sleep(700);
};
const cancel = async () => { await page.click('[data-action=launcher-cancel]').catch(() => {}); await until(() => page.$('[data-role=launchers-list]')); await sleep(300); };
try {
  await awayWin(app);
  await page.setViewportSize({ width: 1600, height: 1040 }).catch(() => {});
  for (const lang of ['ko', 'en']) {
    call('settings.set', { key: 'language', value: lang }); await sleep(1500);
    for (let i = 0; i < 3 && (await page.$('[data-role=settings]')); i++) { await page.keyboard.press('Escape'); await sleep(300); }
    await page.click('[data-action=settings-open]');
    await until(() => page.$('[data-role=settings]'));
    await page.click('[data-role=settings] [data-tab=launchers]');
    await until(() => page.$('[data-role=launchers-list]'));
    await sleep(800);
    const flags = await page.evaluate(() => [...document.querySelectorAll('[data-role=launcher-row]')].filter((r) => r.querySelector('[data-role=launcher-contract-flag]')).map((r) => r.dataset.name));
    check('[' + lang + '] 목록: 계약과 맞지 않는 런처 줄에 ! 표시', ['Codex fast', 'Gem', 'DS2', 'Herm2', 'Herm reason'].every((n) => flags.includes(n)), flags);
    await shot(page, 'list-' + lang, await rectOf(page, '[data-role=settings]'));
    const S = () => rectOf(page, '[data-role=settings]');
    // Codex: 겹침 → 옮기기 → 점검
    await openEdit(want.cx.id);
    let f = await formInfo();
    check('[' + lang + '] Codex: 칸 안내 셋(모델 -m, 노력 -c model_reasoning_effort, 승인)', f.hint.length === 3 && /-m/.test(f.hint[0]) && /model_reasoning_effort/.test(f.hint[1]), f.hint);
    check('[' + lang + '] Codex: 겹치는 추가 인자 둘과 옮기기 단추', f.overlap.length === 2 && f.move, f.overlap);
    await shot(page, 'codex-before-' + lang, await S());
    await page.click('[data-action=launcher-move-args]'); await sleep(1200);
    f = await formInfo();
    check('[' + lang + '] Codex 옮긴 뒤: 노력 high, 승인 auto, 추가 인자 비움', f.effort === 'high' && f.perm === 'auto' && f.args === '' && f.overlap.length === 0, { effort: f.effort, perm: f.perm, args: f.args, preview: f.preview });
    await page.click('[data-action=launcher-check]');
    await until(() => page.$('[data-role=launcher-check-result]'), 20000); await sleep(400);
    f = await formInfo();
    check('[' + lang + '] Codex 점검: 판 줄과 판이 붙일 인자(-c, -m, resume, --approve-for-me) 모두 있음', f.check.length >= 5 && f.check.slice(1).every((c) => c.tone === 'ok'), f.check);
    await shot(page, 'codex-after-check-' + lang, await S());
    await cancel();
    // AGY: 모델·노력 겹침
    await openEdit(want.gem.id);
    await shot(page, 'agy-before-' + lang, await S());
    await page.click('[data-action=launcher-move-args]'); await sleep(1200);
    f = await formInfo();
    check('[' + lang + '] AGY 옮긴 뒤: 모델 gemini-4-hydrogen, 노력 high, 추가 인자 비움', f.model === 'gemini-4-hydrogen' && f.effort === 'high' && f.args === '', { model: f.model, effort: f.effort, args: f.args, preview: f.preview });
    await shot(page, 'agy-after-' + lang, await S());
    await cancel();
    // AGY 단계 붙은 ID + 노력
    await openEdit(want.tier.id);
    f = await formInfo();
    check('[' + lang + '] AGY 단계 붙은 모델 + 노력: 보드가 단계를 떼고 넘긴다는 줄, 미리보기 gemini-3.8-flash', f.overlap.some((t) => /gemini-3\.8-flash\b/.test(t)) && /--model gemini-3\.8-flash --effort low/.test(f.preview), { overlap: f.overlap, preview: f.preview });
    await shot(page, 'agy-tier-' + lang, await S());
    await cancel();
    // 명령 한 줄 → 하네스 런처로 바꾸기(dsh-tui, omh)
    for (const [k, h, st] of [['ds', 'dsh', ''], ['hm', 'hermes', 'omh']]) {
      await openEdit(want[k].id);
      f = await formInfo();
      check('[' + lang + '] ' + want[k].name + ': 바꾸기 권함', f.convert.length === 1, f.convert);
      await shot(page, 'convert-' + k + '-before-' + lang, await S());
      await page.click('[data-action=launcher-convert]'); await sleep(1400);
      f = await formInfo();
      check('[' + lang + '] ' + want[k].name + ' 바꾼 뒤: 하네스 ' + h + (st ? ', 실행 명령 ' + st : ''), f.harness === h && (f.start || '') === st && f.convert.length === 0, { harness: f.harness, start: f.start, preview: f.preview, hint: f.hint });
      await shot(page, 'convert-' + k + '-after-' + lang, await S());
      await cancel();
    }
    // 받지 않는 인자·없는 인자: Codex --full-auto(0.167 도움말에 없음), 모르는 --wat
    await openEdit(want.bad.id);
    await page.click('[data-action=launcher-check]');
    await until(() => page.$('[data-role=launcher-check-result]'), 20000); await sleep(400);
    f = await formInfo();
    check('[' + lang + '] 점검: 없는 인자는 빨간 줄(--full-auto, --wat), 모르는 인자 경고', f.check.some((c) => c.tone === 'bad' && /--full-auto/.test(c.t)) && f.overlap.some((t) => /--wat/.test(t)), { check: f.check, overlap: f.overlap });
    await shot(page, 'check-bad-' + lang, await S());
    await cancel();
    // Hermes TUI의 --reasoning
    await openEdit(want.hr.id);
    f = await formInfo();
    check('[' + lang + '] Hermes --reasoning: 받지 않는 인자 줄과 옮기기', f.overlap.some((t) => /reasoning/.test(t)) && f.move, f.overlap);
    await shot(page, 'hermes-reasoning-' + lang, await S());
    await cancel();
    for (let i = 0; i < 3 && (await page.$('[data-role=settings]')); i++) { await page.keyboard.press('Escape'); await sleep(300); }
  }
} finally { await closeApp(app); }
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
log('결과 ' + results.filter((r) => r.ok).length + '/' + results.length);
