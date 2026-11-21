// P295 창 시험: 답 실어 보내기. 개발용 판에 haiku 리드(lead)와 다른 haiku(other)를 띄워
// (1) --no-wait 결정 카드에 답 → 리드에 아무것도 안 감 → other가 리드에 atrium prompt → 한 전달에 답이 앞에 붙어 감,
// (2) 기다리는 결정 카드(턴 끝에 물음)에 답 → 곧바로 감을 보고, PC 목록(카드의 보내는 때 표시, 다음 메시지와 갈 답 줄, 노드 표식, ko·en)과
// 휴대폰 시트(ko·en) 그림을 찍는다.
// 판: 따로 띄운 개발용 판(atrium-dev-p295, 48045, backend/.dev)만. 창의 원격 디버깅 포트 9526, 휴대폰 흉내 프록시 48245. 한 번에 한 창·브라우저만.
// 실행: node app/test/e2e/p295-ride.mjs <setup|live|pc|phone|stop> [round]
// 결과는 워크트리의 experiments/p295/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'pc';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p295', TAG);
const BOARD = 'atrium-dev-p295', PORT = '48045', DEBUG = '9526', SIM = 48245;
const FOLDER = process.env.P295_FOLDER || 'C:\\Workspace\\mtask-p295-a';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p295', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p295-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p295-${WHAT}-${TAG}`);
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

const other = () => call('session.list').find((s) => s.name === 'other');
const dOf = (name) => call('delivery.list', { session: name, limit: 50 });
const idle = (name) => waitFor(() => { const s = call('session.list').find((x) => x.name === name); return s && s.state === 'ready' && s; }, 180000, 2000);
// 세션에게 파일의 명령을 그대로 치게 한다(지시 글에 @·-- 낱말을 피한다)
function runFile(name, file, cmds, reply) {
  fs.writeFileSync(file, cmds.join('\n') + '\n');
  atrium('send', '@' + name, `시험입니다. ${file} 파일의 명령을 한 줄씩 그대로 셸에서 실행하고, 끝나면 "${reply}" 한마디만 답해 주세요.`);
}
const dropAuto = () => { for (const c of cards().filter((x) => x.auto)) call('decision.ignore', { id: c.id }); };

// 판·세션 띄우기
async function setup() {
  fs.mkdirSync(FOLDER, { recursive: true });
  log(atrium('backend', 'start'));
  if (!lead()) log(atrium('spawn', FOLDER, '--name', 'lead', '--model', 'haiku'));
  if (!other()) log(atrium('spawn', FOLDER, '--name', 'other', '--model', 'haiku'));
  const a = await idle('lead'); const b = await idle('other');
  check('리드와 other가 떴다(ready)', !!a && !!b, [a && a.state, b && b.state]);
}

// 실시험: --no-wait 답은 다음 전달에 실림, 기다리는 결정 답은 곧바로
async function live() {
  try { call('decision.flush', { sessionId: lead().sessionId }); } catch {}
  await sleep(2000); await idle('lead'); dropAuto();
  const q1 = '실시험 하나: 기다리지 않아도 되는 질문?';
  runFile('lead', path.join(FOLDER, 'p295-live-1.txt'), [`atrium ask "${q1}" --option "좋다" --option "싫다" --no-wait`], '남겼습니다');
  const c1 = await waitFor(() => cards().find((c) => c.question === q1), 180000, 2000);
  check('리드가 --no-wait 카드를 남김(timing next)', !!c1 && c1.timing === 'next' && c1.timingBy === 'agent', c1 && { timing: c1.timing, by: c1.timingBy });
  await idle('lead'); await sleep(3000); dropAuto();
  const n0 = dOf('lead').length;
  const r1 = call('decision.answer', { id: c1.id, answer: '좋다' });
  check('답 → 붙잡음(riding), 보낸 것 없음', r1.held === true && r1.riding === true && !r1.deliveryId, { held: r1.held, riding: r1.riding, deliveryId: r1.deliveryId });
  await sleep(8000);
  const n1 = dOf('lead').length;
  check('8초 동안 리드에 아무것도 안 감', n1 === n0, { n0, n1 });
  check('목록의 riding에 리드 1', (call('decision.list').riding || {})[lead().sessionId] === 1, call('decision.list').riding);
  const said = `다른 세션에서 온 글 ${TAG}-${Date.now() % 100000}입니다. 받았다고 한마디만 답하세요`;
  runFile('other', path.join(FOLDER, 'p295-live-2.txt'), [`atrium prompt lead "${said}"`], '보냈습니다');
  const got = await waitFor(() => dOf('lead').find((d) => (d.text || '').includes(said)), 240000, 2000);
  check('other의 atrium prompt 한 전달에 답이 앞에 붙어 감', !!got && got.text.startsWith(`[결정] ${q1} → 좋다\n\n`) && dOf('lead').length === n0 + 1, got && { text: got.text, status: got.status, origin: got.origin, n: dOf('lead').length - n0 });
  await waitFor(() => { const d = dOf('lead').find((x) => x.deliveryId === (got && got.deliveryId)); return d && ['confirmed', 'unconfirmed', 'failed'].includes(d.status) && d; }, 120000, 2000);
  check('그 전달이 들어감(confirmed)', dOf('lead').find((x) => x.deliveryId === (got && got.deliveryId))?.status === 'confirmed');
  check('붙잡은 답이 비었다', !(call('decision.list').riding || {})[lead().sessionId]);
  // 기다리는 결정: 턴 끝에 묻고 쉰다 → 답하면 곧바로
  await idle('lead'); await idle('other'); await sleep(3000); dropAuto();
  const q2 = '실시험 둘: 이대로 끝낼까요?';
  runFile('lead', path.join(FOLDER, 'p295-live-3.txt'), [`atrium ask "${q2}" --option "끝" --option "더"`], '남겼습니다');
  const c2 = await waitFor(() => cards().find((c) => c.question === q2), 180000, 2000);
  await idle('lead'); await sleep(3000); dropAuto();
  const c2v = cards().find((c) => c.id === (c2 && c2.id));
  check('기다리는 결정 카드는 판의 기본 now(마지막 턴에서 만들고 그 뒤 쉼)', !!c2v && c2v.timing === 'now' && c2v.timingBy === 'board', c2v && { timing: c2v.timing, by: c2v.timingBy });
  const n2 = dOf('lead').length;
  const r2 = call('decision.answer', { id: c2.id, answer: '끝' });
  const d2 = r2.deliveryId && await waitFor(() => { const d = dOf('lead').find((x) => x.deliveryId === r2.deliveryId); return d && d.status === 'confirmed' && d; }, 120000, 1500);
  check('답 → 곧바로 감(한 전달, confirmed)', !!r2.deliveryId && !!d2 && d2.text === `[결정] ${q2} → 끝` && dOf('lead').length === n2 + 1, { deliveryId: r2.deliveryId, text: d2 && d2.text });
  await idle('lead'); await sleep(2000); dropAuto();
}

// PC 그림: 리드에 보내는 때가 다른 카드 셋, other에 다음 메시지와 갈 답
async function seedShots() {
  await idle('lead'); await idle('other'); dropAuto();
  for (const c of cards()) call('decision.ignore', { id: c.id });
  try { call('decision.flush', { sessionId: lead().sessionId }); } catch {}
  try { call('decision.flush', { sessionId: other().sessionId }); } catch {}
  await idle('lead'); await idle('other'); dropAuto();
  runFile('lead', path.join(FOLDER, 'p295-shots-lead.txt'), [
    'atrium ask "그림용: 이 방향으로 갈까요?" --option "간다" --option "멈춘다" --wait',
    'atrium todo "그림용: 설정 창에 새 단추가 보이는지" --check',
    'atrium ask "그림용: 나중에 답해도 되는 이름 고르기" --option "Atrium" --option "Board" --no-wait',
  ], '남겼습니다');
  runFile('other', path.join(FOLDER, 'p295-shots-other.txt'), ['atrium ask "그림용: 다음에 알려 주세요" --no-wait'], '남겼습니다');
  const ok = await waitFor(() => { const c = cards(); return c.filter((x) => x.question.startsWith('그림용')).length >= 4 && c; }, 240000, 2000);
  check('그림용 카드 넷', !!ok, ok && ok.map((c) => [c.id, c.name, c.kind, c.timing]));
  await idle('lead'); await idle('other'); await sleep(3000); dropAuto();
  const oc = cards().find((c) => c.question === '그림용: 다음에 알려 주세요');
  const r = call('decision.answer', { id: oc.id, answer: '좋아요' });
  check('other 답 → 다음 메시지와(riding)', r.riding === true, r);
}

async function pcShots(page, lang) {
  call('settings.set', { key: 'language', value: lang }); await sleep(900);
  await page.waitForSelector('[data-role=decisions]', { timeout: 15000 });
  await page.click('[data-role=decisions]'); await sleep(800);
  const tags = await page.$$eval('[data-role=decisions-list] [data-action=decision-timing]', (xs) => xs.map((x) => ({ t: x.dataset.timing, text: x.textContent })));
  check(`[${lang}] 카드의 보내는 때 표시(바로 감·다음 메시지와)`, tags.some((x) => x.t === 'now') && tags.some((x) => x.t === 'next'), tags);
  const held = await page.$$eval('[data-role=decisions-list] [data-role=decision-held]', (xs) => xs.map((x) => ({ riding: x.dataset.riding || null, text: x.textContent })));
  check(`[${lang}] 다음 메시지와 갈 답 줄(@other)`, held.some((h) => h.riding === '1' && h.text.includes('@other') && h.text.includes(lang === 'ko' ? '다음 메시지와 함께 갈 답 1' : 'going with the next message')), held);
  await shot(page, `pc-list-${lang}`);
  // 사람이 바꿈: 첫 next 표시를 눌러 now로
  const flip = await page.$('[data-role=decisions-list] [data-action=decision-timing][data-timing=next]');
  if (flip) { await flip.click(); await sleep(300); }
  const after = await page.$$eval('[data-role=decisions-list] [data-action=decision-timing].picked', (xs) => xs.map((x) => x.dataset.timing));
  check(`[${lang}] 표시를 누르면 바뀜(next → now)`, after.includes('now'), after);
  await shot(page, `pc-list-flipped-${lang}`);
  await page.keyboard.press('Escape'); await sleep(400);
  const mark = await page.$$eval('[data-role=decision-ride]', (xs) => xs.map((x) => x.textContent));
  check(`[${lang}] 세션 카드 머리에 "실어 보낼 답 n"`, mark.some((m) => m.includes(lang === 'ko' ? '실어 보낼 답 1' : '+1 with next')), mark);
  await shot(page, `pc-board-${lang}`);
}

async function pc() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    for (const lang of ['ko', 'en']) await pcShots(page, lang);
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
        const tags = await pg.$$eval('[data-role=decisions-sheet] [data-action=decision-timing]', (xs) => xs.map((x) => x.dataset.timing));
        const held = await pg.$$eval('[data-role=decisions-sheet] [data-role=decision-held][data-riding="1"]', (xs) => xs.map((x) => x.textContent));
        check(`[phone ${lang}] 시트의 보내는 때 표시와 다음 메시지와 갈 답 줄`, tags.includes('now') && tags.includes('next') && held.length === 1, { tags, held });
        await shot(pg, `phone-sheet-${lang}`);
        await ctx.close();
      }
    } finally { await browser.close(); }
  } finally { sim.close && sim.close(); }
  call('settings.set', { key: 'language', value: 'ko' });
}

async function stopAll() {
  for (const n of ['lead', 'other']) try { if (call('session.list').find((s) => s.name === n)) log(atrium('kill', n, '--yes')); } catch (e) { log('kill ' + e.message); }
  try { log(atrium('terminal', 'stop', '--yes')); } catch (e) { log('terminal stop ' + e.message); }
  try { log(atrium('backend', 'stop')); } catch (e) { log('backend stop ' + e.message); }
}

try {
  if (WHAT === 'setup') await setup();
  else if (WHAT === 'restart') { try { log(atrium('backend', 'stop')); } catch (e) { log('backend stop ' + e.message); } await sleep(2000); await setup(); }
  else if (WHAT === 'live') await live();
  else if (WHAT === 'seed') await seedShots();
  else if (WHAT === 'pc') await pc();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'stop') await stopAll();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p295-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
