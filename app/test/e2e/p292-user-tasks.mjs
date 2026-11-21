// P292 창 시험: 사용자 몫("내 몫"). 개발용 판에 haiku 리드(lead) 하나를 띄워 atrium todo(할 일 명령 둘·확인·나중 날짜·나중 조건)와 atrium ask(결정)를 남기게 하고,
// PC 목록(네 종류 섞임, 나중 접힘·펼침, ko·en 그림)에서 복사·했음·됐다, 나중 카드가 때가 되어 뜸, 확인 결과가 리드에 한 글로 감을 본다.
// 휴대폰(WebKit 390, 웹 화면) 시트에서 같은 것(복사·했음·됐다·미루기, ko·en 그림).
// 판: 따로 띄운 개발용 판(atrium-dev-p292, 48042, backend/.dev)만. 창의 원격 디버깅 포트 9523, 휴대폰 흉내 프록시 48242. 한 번에 한 창·브라우저만.
// 실행: node app/test/e2e/p292-user-tasks.mjs <setup|seed|pc|phone|stop> [round]
// 결과는 워크트리의 experiments/p292/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'pc';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p292', TAG);
const BOARD = 'atrium-dev-p292', PORT = '48042', DEBUG = '9523', SIM = 48242;
const FOLDER = process.env.P292_FOLDER || 'C:\\Workspace\\mtask-p292-a';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p292', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p292-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p292-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const lead = () => call('session.list').find((s) => s.name === 'lead');
const cards = () => call('decision.list').cards;
const leadDeliveries = () => call('delivery.list', { session: 'lead', limit: 50 });
const pad = (n) => String(n).padStart(2, '0');
const stamp = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
async function waitFor(fn, ms = 120000, every = 1500) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(every); } }

// 판·리드 띄우기
async function setup() {
  fs.mkdirSync(FOLDER, { recursive: true });
  log(atrium('backend', 'start'));
  if (!lead()) log(atrium('spawn', FOLDER, '--name', 'lead', '--model', 'haiku'));
  const ok = await waitFor(() => { const s = lead(); return s && s.state === 'ready' && s; }, 180000, 3000);
  check('리드가 떴다(ready)', !!ok, ok && ok.state);
}

// 리드에게 사람 말투로 카드를 남기게 한다(지시 글에 @·-- 낱말을 피하려고 명령은 파일로 준다)
async function seed(set = 'pc') {
  const at = stamp(Date.now() + 2 * 60 * 1000 + 30 * 1000);
  const tag = set === 'phone' ? '휴대폰 ' : '';
  const cmds = [
    `atrium todo "${tag}배포 전에 로그인해 주세요" --cmd "! gcloud auth login" --cmd "gcloud config list" --why "배포 스크립트가 인증을 씁니다"`,
    `atrium todo "${tag}설정 창에 새 단추가 보이는지" --check`,
    `atrium todo "${tag}배포 결과 보기" --later "${at}"`,
    ...(set === 'pc' ? ['atrium todo "API 키가 오면 등록" --later "사용자가 API 키를 받으면"', 'atrium ask "이대로 마무리할까요?" --option "마무리" --option "더 고침"'] : ['atrium ask "휴대폰에서도 이대로 둘까요?" --option "둔다" --option "바꾼다"']),
  ];
  const file = path.join(FOLDER, `p292-${set}-cmds.txt`);
  fs.writeFileSync(file, cmds.join('\n') + '\n');
  for (const c of cards().filter((x) => x.auto)) call('decision.ignore', { id: c.id }); // 앞 흐름에서 리드가 남긴 자동 카드는 치운다(남은 열린 카드가 답 모으기를 막지 않게)
  const before = cards().length;
  atrium('send', '@lead', `시험입니다. ${file} 파일의 명령을 한 줄씩 그대로 셸에서 실행하고, 끝나면 "남겼습니다" 한마디만 답해 주세요.`);
  const got = await waitFor(() => { const c = cards(); return c.length >= before + cmds.length && c; }, 240000, 3000);
  check(`리드가 카드 ${cmds.length}장을 남김(${set})`, !!got, got && got.map((c) => [c.id, c.kind, c.question, c.deferred]));
  return { at };
}

async function pcShots(page, lang) {
  call('settings.set', { key: 'language', value: lang }); await sleep(900);
  await page.waitForSelector('[data-role=decisions]', { timeout: 15000 });
  const pill = await page.$eval('[data-role=decisions]', (e) => ({ n: Number(e.dataset.count), total: Number(e.dataset.total), text: e.textContent }));
  const all = cards(); const act = all.filter((c) => !c.deferred).length;
  check(`[${lang}] 알약 "${lang === 'ko' ? '내 몫' : 'For you'} n" = 지금 목록 수`, pill.n === act && pill.text.includes(lang === 'ko' ? '내 몫' : 'For you'), { pill, act });
  await page.click('[data-role=decisions]'); await sleep(700);
  const kinds = await page.$$eval('[data-role=decisions-list] [data-role=decision] [data-role=decision-kind]', (xs) => xs.map((x) => x.dataset.kind));
  check(`[${lang}] 목록에 종류 섞임(결정·할 일·확인)`, ['decide', 'do', 'check'].every((k) => kinds.includes(k)), kinds);
  const cmds = await page.$$eval('[data-role=decisions-list] [data-role=todo-cmd] code', (xs) => xs.map((x) => x.textContent));
  check(`[${lang}] 할 일 명령 둘(고정폭)과 복사 단추`, cmds.includes('! gcloud auth login') && cmds.includes('gcloud config list'), cmds);
  const later = await page.$eval('[data-role=decisions-list] [data-role=later]', (e) => ({ n: e.dataset.count, open: e.dataset.open || null, text: e.textContent }));
  check(`[${lang}] 나중 n(접힘, 때·조건 보임)`, Number(later.n) >= 2 && !later.open, later);
  const list = await page.$('[data-role=decisions-list]');
  await shot(page, `pc-list-${lang}`);
  if (list) await list.screenshot({ path: path.join(OUT, `pc-list-crop-${lang}.png`) }).catch(() => {});
  await page.click('[data-role=decisions-list] [data-action=later-toggle]'); await sleep(500);
  const rows = await page.$$eval('[data-role=decisions-list] [data-role=later-card] [data-role=later-when]', (xs) => xs.map((x) => x.textContent));
  check(`[${lang}] 나중 펼침: 때와 조건`, rows.length >= 2 && rows.some((r) => /:/.test(r)), rows);
  await page.$eval('[data-role=decisions-list] [data-role=later]', (e) => e.scrollIntoView({ block: 'end' }));
  if (list) await list.screenshot({ path: path.join(OUT, `pc-list-later-open-${lang}.png`) }).catch(() => {});
  await page.click('[data-role=decisions-list] [data-action=later-toggle]'); await sleep(300);
  await page.keyboard.press('Escape'); await sleep(300);
  const id = lead().sessionId;
  await page.evaluate((sid) => window.__mt.getState().navigateTo(sid), id); await sleep(1500);
  const marks = await page.$$eval('.mt-node-head [data-role=decision-mark]', (xs) => xs.map((x) => x.textContent));
  check(`[${lang}] 세션 카드 머리 표식 "${lang === 'ko' ? '내 몫' : 'for you'}"`, marks.length === 1 && marks[0].includes(lang === 'ko' ? '내 몫' : 'for you'), marks);
  const heads = await page.$$('.mt-node-head');
  for (const h of heads) { if (await h.$('[data-role=decision-mark]')) { await h.screenshot({ path: path.join(OUT, `pc-node-mark-${lang}.png`) }).catch(() => {}); break; } }
}

async function pcFlow(page, app, at) {
  call('settings.set', { key: 'language', value: 'ko' }); await sleep(800);
  await page.click('[data-role=decisions]'); await sleep(600);
  // 복사(사용자 클립보드는 앞뒤로 되돌린다)
  const saved = await app.evaluate(({ clipboard }) => clipboard.readText()).catch(() => '');
  await page.click('[data-role=decisions-list] [data-action=todo-copy][data-cmd="gcloud config list"]'); await sleep(400);
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText()).catch((e) => 'ERR ' + e.message);
  await app.evaluate(({ clipboard }, s) => clipboard.writeText(s), saved).catch(() => {});
  check('복사 단추 → 명령이 클립보드에', clip === 'gcloud config list', clip);
  // 했음(기록만)
  const n0 = leadDeliveries().length;
  const doCard = cards().find((c) => c.kind === 'do' && !c.deferred);
  await page.click(`[data-role=decisions-list] [data-role=decision][data-id="${doCard.id}"] [data-action=todo-done]`); await sleep(1200);
  check('했음 → 카드 닫힘, 리드에 보낸 것 없음', !cards().some((c) => c.id === doCard.id) && leadDeliveries().length === n0, { n0, n: leadDeliveries().length });
  // 됐다 + 메모 → 결정이 열려 있어 모은다
  const chk = cards().find((c) => c.kind === 'check');
  await page.fill(`[data-role=decisions-list] [data-role=decision][data-id="${chk.id}"] [data-field=check-note]`, '단추가 보입니다');
  await page.click(`[data-role=decisions-list] [data-role=decision][data-id="${chk.id}"] [data-action=check-ok]`); await sleep(1200);
  const held = call('decision.list').held || {};
  check('됐다 → 결정이 열려 있어 모음(held 1)', held[lead().sessionId] === 1 && leadDeliveries().length === n0, held);
  await page.waitForSelector('[data-role=decisions-list] [data-role=decision-held]', { timeout: 5000 }).catch(() => {});
  const list = await page.$('[data-role=decisions-list]');
  if (list) await list.screenshot({ path: path.join(OUT, 'pc-after-check-ko.png') }).catch(() => {});
  // 결정에 답 → 한 글(두 줄)
  const dec = cards().find((c) => c.kind === 'decide');
  await page.click(`[data-role=decisions-list] [data-role=decision][data-id="${dec.id}"] [data-action=decision-option][data-option="마무리"]`); await sleep(1500);
  const d = leadDeliveries();
  const sent = d.find((x) => (x.text || '').startsWith('[확인]'));
  check('결정 답 → 리드에 한 글([확인] 줄 + [결정] 줄)', d.length === n0 + 1 && sent && /^\[확인\] .*새 단추가 보이는지 → 됐다: 단추가 보입니다\n\[결정\] 이대로 마무리할까요\? → 마무리$/.test(sent.text), sent && sent.text);
  const conf = await waitFor(() => { const x = leadDeliveries().find((y) => sent && y.deliveryId === sent.deliveryId); return x && x.status === 'confirmed' && x; }, 120000);
  check('리드에 들어감(제출 확인)', !!conf);
  // 나중 카드가 때가 되어 뜸
  const lat = cards().find((c) => c.kind === 'later' && c.wakeAt);
  const before = await page.$eval('[data-role=decisions]', (e) => Number(e.dataset.count)).catch(() => 0);
  log(`나중 카드 #${lat && lat.id} 때 ${at}, 기다림`);
  const woke = await waitFor(() => { const c = cards().find((x) => lat && x.id === lat.id); return c && !c.deferred && c; }, 5 * 60 * 1000, 3000);
  await sleep(1500);
  const after = await page.$eval('[data-role=decisions]', (e) => Number(e.dataset.count)).catch(() => 0);
  const inList = await page.$(`[data-role=decisions-list] [data-role=decision][data-id="${lat && lat.id}"]`);
  check('나중 카드가 때가 되어 지금 목록에 뜸(알약 수가 늘어남. 리드의 턴 끝 자동 카드가 함께 늘 수 있다)', !!woke && after >= before + 1 && !!inList, { before, after, woke: !!woke });
  if (list) await list.screenshot({ path: path.join(OUT, 'pc-later-woke-ko.png') }).catch(() => {});
  const pushes = call('push.decisions', { n: 50 }).decisions.filter((x) => x.kind === 'decision');
  log(`푸시 판단 ${JSON.stringify(pushes.slice(-3))}`);
  await page.keyboard.press('Escape');
}

async function pc() {
  const at = process.env.P292_AT || null;
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    for (const lang of ['ko', 'en']) await pcShots(page, lang);
    if (WHAT === 'pc') await pcFlow(page, app, at);
    call('settings.set', { key: 'language', value: 'ko' });
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
      for (const pass of ['ko', 'en', 'flow']) {
        const lang = pass === 'flow' ? 'ko' : pass;
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
        if (pass !== 'flow') {
        const pill = await pg.$eval('[data-role=pl-decisions]', (e) => ({ n: e.dataset.count, text: e.textContent }));
        check(`[phone ${lang}] 알약 "${lang === 'ko' ? '내 몫' : 'For you'}"`, pill.text.includes(lang === 'ko' ? '내 몫' : 'For you') && Number(pill.n) === cards().filter((c) => !c.deferred).length, pill);
        await shot(pg, `phone-map-${lang}`);
        await pg.tap('[data-role=pl-decisions]'); await sleep(700);
        const kinds = await pg.$$eval('[data-role=decisions-sheet] [data-role=decision] [data-role=decision-kind]', (xs) => xs.map((x) => x.dataset.kind));
        check(`[phone ${lang}] 시트에 종류 섞임과 나중 n`, ['do', 'check', 'decide'].every((k) => kinds.includes(k)) && !!(await pg.$('[data-role=decisions-sheet] [data-role=later]')), kinds);
        await shot(pg, `phone-sheet-${lang}`);
        await pg.tap('[data-role=decisions-sheet] [data-action=later-toggle]'); await sleep(400);
        await pg.$eval('[data-role=decisions-sheet] [data-role=later]', (e) => e.scrollIntoView({ block: 'end' }));
        await sleep(300);
        await shot(pg, `phone-sheet-later-${lang}`);
        }
        if (pass === 'flow') {
          await pg.tap('[data-role=pl-decisions]'); await sleep(700);
          // 복사(웹 화면: 보안 출처가 아니어도 textarea 길로)·했음·됐다·미루기
          await pg.$eval('[data-role=decisions-sheet] [data-role=later]', (e) => e.scrollIntoView({ block: 'start' }));
          const doC = cards().find((c) => c.kind === 'do' && !c.deferred && c.question.startsWith('휴대폰'));
          const n0 = leadDeliveries().length;
          await pg.tap(`[data-role=decisions-sheet] [data-role=decision][data-id="${doC.id}"] [data-action=todo-copy]`); await sleep(500);
          const note1 = await pg.$$eval('[data-role=sheet-note]', (xs) => xs.map((x) => x.textContent));
          const toasts1 = await pg.$$eval('.mt-toast', (xs) => xs.length);
          check('[phone] 복사 → 시트 머리에 짧은 알림 하나(판 알림 줄은 없음)', note1.length === 1 && note1[0] === '복사함' && toasts1 === 0, { note1, toasts1 });
          await pg.tap(`[data-role=decisions-sheet] [data-role=decision][data-id="${doC.id}"] [data-action=todo-done]`); await sleep(1200);
          check('[phone] 했음 → 닫힘, 보낸 것 없음', !cards().some((c) => c.id === doC.id) && leadDeliveries().length === n0);
          const note2 = await pg.$$eval('[data-role=sheet-note]', (xs) => xs.map((x) => x.textContent));
          check('[phone] 새 알림이 옛 알림을 바꿈(하나만)', note2.length === 1 && note2[0] === '했음 기록' && (await pg.$$eval('.mt-toast', (xs) => xs.length)) === 0, note2);
          const chk = cards().find((c) => c.kind === 'check' && !c.deferred && c.question.startsWith('휴대폰'));
          await pg.fill(`[data-role=decisions-sheet] [data-role=decision][data-id="${chk.id}"] [data-field=check-note]`, '휴대폰에서 봄');
          await pg.tap(`[data-role=decisions-sheet] [data-role=decision][data-id="${chk.id}"] [data-action=check-fail]`); await sleep(1200);
          const dec = cards().find((c) => c.kind === 'decide' && !c.deferred && c.question.startsWith('휴대폰'));
          await pg.tap(`[data-role=decisions-sheet] [data-role=decision][data-id="${dec.id}"] [data-action=snooze]`); await sleep(300);
          const head = await pg.$eval('[data-role=decisions-sheet] .mt-dc-sheet-head', (e) => e.getBoundingClientRect().bottom);
          const noteBox = await pg.$eval('[data-role=sheet-note]', (e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }).catch(() => null);
          check('[phone] 알림은 시트 머리 안(카드를 가리지 않음)', !!noteBox && noteBox.bottom <= head + 1, { head, noteBox });
          await shot(pg, 'phone-snooze-menu-ko');
          await pg.tap(`[data-role=decisions-sheet] [data-role=decision][data-id="${dec.id}"] [data-action=snooze-hour]`); await sleep(1500);
          const d = leadDeliveries();
          const sent = d.find((x) => (x.text || '').includes('휴대폰에서 봄'));
          check('[phone] 안 됐다 → 결정을 미루자 남은 열린 카드가 없어 리드에 한 글', !!sent && /^\[확인\] 휴대폰 .* → 안 됐다: 휴대폰에서 봄$/.test(sent.text), sent && sent.text);
          check('[phone] 미룬 결정은 나중 줄에', !!cards().find((c) => c.id === dec.id && c.deferred));
          await shot(pg, 'phone-after-ko');
        }
        await ctx.close();
      }
    } finally { await browser.close(); }
  } finally { sim.close && sim.close(); }
}

async function stopAll() {
  try { if (lead()) log(atrium('kill', 'lead', '--yes')); } catch (e) { log('kill ' + e.message); }
  try { log(atrium('terminal', 'stop', '--yes')); } catch (e) { log('terminal stop ' + e.message); }
  try { log(atrium('backend', 'stop')); } catch (e) { log('backend stop ' + e.message); }
}

try {
  if (WHAT === 'setup') await setup();
  else if (WHAT === 'seed') { const r = await seed(process.argv[4] || 'pc'); log(`P292_AT=${r.at}`); }
  else if (WHAT === 'pc' || WHAT === 'pc-shots') await pc();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'stop') await stopAll();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p292-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
