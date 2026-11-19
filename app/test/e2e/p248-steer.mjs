// P248 창 시험: 보내기 칸의 대기열(기본)과 스티어링 선택. 긴 턴(앞 셸 ping)을 도는 haiku 세션에
// 그냥 보낸 글은 전송 대기(턴이 끝난 뒤 들어간다), 스티어링으로 보낸 글은 그 턴 안에 Claude Code 대기 메시지로 들어가 그 턴의 답에 읽힌다.
// 그림(ko·en): 보내기 칸의 스티어링 단추, 전달 표시. 판: 따로 띄운 개발용 판(atrium-dev-p248, 48005, 창 9485)만.
// 시험 폴더 C:\Workspace\mtask-p248-a(ping만 허용), 세션 stt(haiku).
// 실행: sh backend/.dev/envp.sh node app/test/e2e/p248-steer.mjs [round]   결과는 experiments/p248/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p248', TAG);
const NAME = 'stt';
const K = Math.random().toString(36).slice(2, 6).toUpperCase(); // 라운드마다 고유 표지(앞 라운드의 전달·답과 섞이지 않게)
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p248' || process.env.ATRIUM_PORT !== '48005') throw new Error('개발용 판(atrium-dev-p248, 48005) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, until } = await import('./harness.mjs');
const log = logger(`p248-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const get = () => { const j = JSON.parse(atrium('--json', 'get', NAME)); return j.session || j; };
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1500)}` : ''}`); };
const idle = () => until(() => get().state === 'ready', 180000, 1000);
const answers = () => { try { return atrium('last', NAME); } catch { return ''; } };
const dl = () => { const r = call('delivery.list', { session: NAME }); return Array.isArray(r) ? r : (r && r.deliveries) || []; };

// 아래 바(입력과 전달 칩)만 찍는다
async function barShot(page, file) {
  const box = await page.evaluate(() => {
    const els = ['.mt-bottom .mt-cmd', '.mt-bottom-above'].map((s) => document.querySelector(s)).filter(Boolean);
    const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    if (!rs.length) return null;
    const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top)), r2 = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom));
    return { x: Math.max(0, x - 12), y: Math.max(0, y - 12), width: r2 - x + 24, height: b - y + 24 };
  });
  await page.screenshot({ path: path.join(OUT, file), ...(box ? { clip: box } : {}) });
}
async function typeBar(page, text) {
  await page.focus('[data-role=command]');
  await page.fill('[data-role=command]', `@${NAME} ${text}`);
  await sleep(300);
}
async function longTurn(sec) {
  atrium('send', `@${NAME}`, `Run this shell command in the foreground (NOT in background) and wait for it to finish: ping -n ${sec} 127.0.0.1 . When it finishes, reply with one short line that starts with LONG DONE. If you received any extra instruction while it ran, follow it in that same reply.`);
  await until(() => /PreToolUse/.test(atrium('events', NAME, '--limit', '6')), 90000, 1000);
  await sleep(1500);
}

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9485'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  call('settings.set', { key: 'language', value: 'ko' });
  await page.waitForFunction(() => document.documentElement.lang === 'ko', null, { timeout: 10000 }).catch(() => {});
  await idle();
  // 1. 긴 턴 중 그냥 보내기 = 대기열
  await longTurn(40);
  check('긴 턴을 도는 중(working)', get().state === 'working', get().state);
  await typeBar(page, `Reply with only the word QUEUEA${K}.`);
  const steerBtn = await page.$('[data-action=cmd-steer]');
  check('보내기 칸에 스티어링 단추가 보인다(꺼짐이 기본)', !!steerBtn && (await steerBtn.getAttribute('aria-pressed')) === 'false');
  await page.keyboard.press('Enter');
  await sleep(3000);
  const qa = dl().find((d) => new RegExp('QUEUEA' + K).test(d.text || ''));
  check('그냥 보낸 글은 전송 대기(이전 요청 처리 중)', qa && qa.status === 'queued' && qa.reason === 'working', qa && { status: qa.status, reason: qa.reason });
  await barShot(page, 'ko-01-queued.png');
  // 2. 스티어링으로 보내기 = 지금 턴의 Claude Code 대기 메시지
  await typeBar(page, `Extra instruction for the current task: put the word STEERB${K} at the end of your LONG DONE line.`);
  await page.click('[data-action=cmd-steer]');
  check('스티어링 단추를 누르면 켜진다', (await page.getAttribute('[data-action=cmd-steer]', 'aria-pressed')) === 'true');
  await barShot(page, 'ko-02-steer-on.png');
  await page.keyboard.press('Enter');
  const isB = (d) => new RegExp('STEERB' + K).test(d.text || '');
  await until(() => dl().some((d) => isB(d) && d.reason === 'typed' && ['sent', 'confirmed'].includes(d.status)), 20000, 300).catch(() => {});
  const sb = dl().find(isB);
  check('스티어링 글은 일하는 중에 입력란에 들어갔다(typed), 대기열 글보다 먼저', sb && ['sent', 'confirmed'].includes(sb.status) && get().state === 'working', sb && { status: sb.status, reason: sb.reason, state: get().state });
  check('보낸 뒤 입력이 비면 스티어링 단추도 숨는다', !(await page.$('[data-action=cmd-steer]')));
  await sleep(400);
  await barShot(page, 'ko-03-steer-typed.png');
  const qa2 = dl().find((d) => d.deliveryId === (qa && qa.deliveryId));
  check('대기열 글은 아직 기다린다', qa2 && qa2.status === 'queued', qa2 && qa2.status);
  // 그 턴의 답에 STEERB(턴 안에 읽혔다), 그 뒤 대기열 글이 들어가 QUEUEA
  await until(() => new RegExp('STEERB' + K).test(answers()) || new RegExp('QUEUEA' + K).test(answers()), 180000, 1500).catch(() => {});
  const a1 = answers();
  fs.writeFileSync(path.join(OUT, 'answer-1.txt'), a1);
  check('스티어링 글은 그 턴 안에 읽혔다(LONG DONE 답에 STEERB)', /LONG DONE/.test(a1) && new RegExp('STEERB' + K).test(a1), a1.slice(0, 300));
  await until(() => new RegExp('QUEUEA' + K).test(answers()), 180000, 1500).catch(() => {});
  const a2 = answers();
  fs.writeFileSync(path.join(OUT, 'answer-2.txt'), a2);
  check('대기열 글은 턴이 끝난 뒤 들어갔다(QUEUEA)', new RegExp('QUEUEA' + K).test(a2), a2.slice(0, 200));
  await idle();
  // 3. en 그림: 스티어링 단추와 전달 표시
  call('settings.set', { key: 'language', value: 'en' });
  await page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 10000 }).catch(() => {});
  await longTurn(20);
  await typeBar(page, `Extra instruction for the current task: put the word STEERC${K} at the end of your LONG DONE line.`);
  check('다음 글에는 스티어링이 다시 꺼져 있다(기본 대기열)', (await page.getAttribute('[data-action=cmd-steer]', 'aria-pressed', { timeout: 5000 })) === 'false');
  await page.click('[data-action=cmd-steer]');
  await barShot(page, 'en-02-steer-on.png');
  await page.keyboard.press('Control+Enter'); // Ctrl+Enter도 스티어링(단추가 켜진 채)
  await until(() => dl().some((d) => d.reason === 'typed' && new RegExp('STEERC' + K).test(d.text || d.preview || '') ), 20000, 500).catch(() => {});
  await sleep(400);
  await barShot(page, 'en-03-steer-typed.png');
  await until(() => new RegExp('STEERC' + K).test(answers()), 180000, 1500).catch(() => {});
  check('en: 스티어링 글이 그 턴 안에 읽혔다(STEERC)', new RegExp('STEERC' + K).test(answers()), answers().slice(0, 200));
  await idle();
  // 4. Ctrl+Enter만으로 스티어링(단추를 켜지 않음)
  call('settings.set', { key: 'language', value: 'ko' });
  await longTurn(20);
  await typeBar(page, `Extra instruction for the current task: put the word STEERD${K} at the end of your LONG DONE line.`);
  await page.keyboard.press('Control+Enter');
  await until(() => dl().some((d) => d.reason === 'typed' && new RegExp('STEERD' + K).test(d.text || d.preview || '')), 20000, 500).catch(() => {});
  await until(() => new RegExp('STEERD' + K).test(answers()), 180000, 1500).catch(() => {});
  check('Ctrl+Enter = 스티어링으로 보내기(STEERD가 그 턴에)', new RegExp('STEERD' + K).test(answers()), answers().slice(0, 200));
  await idle();
  fs.writeFileSync(path.join(OUT, 'deliveries.json'), JSON.stringify(dl().map((d) => ({ status: d.status, reason: d.reason, createdAt: d.createdAt, sentAt: d.sentAt, confirmedAt: d.confirmedAt })), null, 1));
} catch (e) { check('시험 오류', false, e.stack); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
  await closeApp(app);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
