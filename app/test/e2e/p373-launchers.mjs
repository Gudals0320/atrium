// P373 창·판 시험: 따로 띄운 개발용 판(atrium-dev-p373, 48105, 창 원격 디버깅 9586)만 쓴다.
// 실행: node app/test/e2e/p373-launchers.mjs <quiet|shots|stop>
// - quiet: haiku 리드(말을 걸지 않음)가 결정·확인 카드를 남기고, 사람이 그 리드 터미널에 직접 글을 친다(atrium input).
//   카드는 "터미널에서 답함"으로 닫히고, 전달 목록(delivery.list)·터미널 화면에 "[Atrium 보드] 카드 …를 … 닫았다" 줄이 없는지 본다
// - shots: 설정 › 런처(위 새 런처 단추, 일반 하네스 목록 아래 "부가 연결" 절: SDK 런처·SDK 키 칸)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'shots';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p373', 'shots');
const CONVOS = 'C:\\Workspace\\mtask-p373-projects';
const F = 'C:\\Workspace\\mtask-p373-a';
const BOARD = 'atrium-dev-p373', PORT = '48105', DEBUG = 9586;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE|ANTHROPIC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p373-none-',
  ATRIUM_USAGE_PROBE: 'off', // 시험 판이 사용자 구독 사용량을 직접 묻지 않게
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
const { boardAgent } = await import('./lib/board-agent.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger('p373-' + WHAT);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)) : '')); };
const list = () => call('session.list');
const byName = (n) => list().find((x) => x.name === n);
const NOTE_RE = /사람이 터미널에 친 글로 답한 것으로 닫았다|--reopen/;

async function quiet() {
  try { log(atrium('backend', 'start').trim().slice(0, 200)); } catch (e) { log('backend start: ' + e.message.slice(0, 200)); }
  fs.mkdirSync(F, { recursive: true }); fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p373-a\n');
  call('workspace.open', { path: F, select: true });
  call('settings.set', { key: 'language', value: 'ko' });
  call('settings.set', { key: 'autoDecisions', value: false }); // 리드의 답이 자동 카드를 만들지 않게(이 시험은 손 카드만 본다)
  const ag = boardAgent({ env: ENV });
  const lead = await ag.lead('lead', { cwd: F });
  const q = await ag.ask('lead', '이 방향으로 구현할까요?', { options: ['예', '아니오'] });
  const c = await ag.todo('lead', '첫 화면이 뜨는지 확인', { check: true });
  check('손 결정·확인 카드 두 장', q && c, { q: q && q.id, c: c && c.id });
  await sleep(11000); // 만들어진 지 10초(AUTO_FRESH_MS) 안의 카드는 남기므로
  const before = call('delivery.list', { session: 'lead', limit: 50 }).length;
  // 사람이 리드 터미널에 직접 친다(판 전달이 아니다)
  atrium('input', 'lead', '예, 그대로 진행해 주세요. 답은 한 줄로만 해 주세요.');
  await sleep(600);
  atrium('input', 'lead', '\\r');
  let st = null;
  for (let i = 0; i < 60; i++) { await sleep(1000); st = call('decision.list'); if ((st.recent || []).length >= 2) break; }
  check('두 카드가 "터미널에서 답함"으로 닫힘(recent)', (st.recent || []).map((d) => d.id).sort().join() === [q.id, c.id].sort().join(), (st.recent || []).map((d) => ({ id: d.id, via: d.via, state: d.state })));
  // 리드의 턴이 끝날 때까지
  for (let i = 0; i < 90; i++) { await sleep(1000); const s = byName('lead'); if (s && s.state === 'ready') break; }
  await sleep(2000);
  const dl = call('delivery.list', { session: 'lead', limit: 50 });
  const bad = dl.filter((d) => NOTE_RE.test(d.text || ''));
  check('전달 목록(delivery.list)에 카드를 닫았다는 판 한 줄 없음, 새 전달도 없음', bad.length === 0 && dl.length === before, { before, after: dl.length, texts: dl.map((d) => (d.text || '').slice(0, 120)) });
  let screen = ''; try { screen = atrium('screen', 'lead', '--text'); } catch (e) { screen = e.message; }
  check('리드 터미널 화면에 판 한 줄 없음', !NOTE_RE.test(screen), screen.split('\n').filter((l) => l.trim()).slice(-14).join('\n'));
  fs.writeFileSync(path.join(OUT, 'quiet-deliveries.json'), JSON.stringify({ before, after: dl.length, deliveries: dl, recent: st.recent }, null, 2));
  fs.writeFileSync(path.join(OUT, 'quiet-screen.txt'), screen);
}

async function shots() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
  try {
    await sleep(2500);
    if (!(await page.$('[data-role="settings"]'))) await page.click('[data-role="top-right"] [data-action="settings-open"]');
    await page.waitForSelector('[data-role="settings-tabs"]', { timeout: 8000 });
    await page.click('[data-role="settings-tabs"] [data-tab="launchers"]').catch(() => {});
    await page.waitForSelector('[data-role=launchers-extra]', { timeout: 8000 });
    await sleep(600);
    const v = await page.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
      const rows = document.querySelector('.mt-ln-rows');
      const extra = document.querySelector('[data-role=launchers-extra]');
      return {
        newBtn: box('[data-action=launcher-new]'), rowsBox: box('.mt-ln-rows'), main: box('[data-role=launchers-main]'), extra: box('[data-role=launchers-extra]'),
        title: (extra.querySelector('.mt-set-sub') || {}).textContent,
        extraNames: [...extra.querySelectorAll('[data-role=launcher-row]')].map((e) => e.dataset.name),
        mainNames: [...document.querySelectorAll('[data-role=launchers-main] [data-role=launcher-row]')].map((e) => e.dataset.name),
        key: !!extra.querySelector('[data-role=api-key-panel]'), keyOutside: document.querySelectorAll('[data-role=api-key-panel]').length,
        scroll: rows ? rows.scrollHeight > rows.clientHeight : null, win: [innerWidth, innerHeight],
      };
    });
    check('새 런처 단추가 목록 위에서 바로 보인다', v.newBtn && v.rowsBox && v.newBtn.bottom <= v.rowsBox.top && v.newBtn.bottom < v.win[1], v);
    check('부가 연결 절: 일반 목록 아래, 제목 "부가 연결", SDK 런처와 SDK 키 칸이 그 안에 하나', v.extra.top >= v.main.bottom && v.title === '부가 연결' && v.extraNames.includes('Claude Code SDK') && !v.mainNames.includes('Claude Code SDK') && v.key && v.keyOutside === 1, v);
    await (await page.$('[data-role=settings]') || page).screenshot({ path: path.join(OUT, '1-launchers-top.png') });
    await page.$eval('[data-role=launchers-extra]', (e) => e.scrollIntoView({ block: 'end' }));
    await sleep(400);
    await (await page.$('[data-role=settings]') || page).screenshot({ path: path.join(OUT, '2-launchers-extra.png') });
    // 영어
    call('settings.set', { key: 'language', value: 'en' }); await sleep(1200);
    await page.$eval('.mt-ln-rows', (e) => { e.scrollTop = 0; });
    await sleep(300);
    const en = await page.$eval('[data-role=launchers-extra] .mt-set-sub', (e) => e.textContent).catch(() => null);
    check('영어 제목 "Add-on connections"', /add-on connections/i.test(en || ''), en);
    await (await page.$('[data-role=settings]') || page).screenshot({ path: path.join(OUT, '3-launchers-en.png') });
    call('settings.set', { key: 'language', value: 'ko' });
  } finally { await closeApp(app); }
}

async function stop() {
  for (const s of list()) { try { atrium('kill', s.name, '--yes'); } catch {} }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop: ' + e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop: ' + e.message.slice(0, 200)); }
}

const run = { quiet, shots, stop }[WHAT];
if (!run) { log('모르는 단계: ' + WHAT); process.exit(2); }
try { await run(); } catch (e) { check('예외 없이 끝남', false, e.stack || String(e)); }
const fails = results.filter((r) => !r.ok);
log(`결과: ${results.length - fails.length}/${results.length} 통과`);
process.exit(fails.length ? 1 : 0);
