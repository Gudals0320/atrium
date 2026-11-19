// P240 창 시험: 턴은 끝났고 뒤 셸만 도는 Claude Code 세션(판 상태 working, "백그라운드 1")에 보내기 칸으로 보낸 글은
// 전송 대기 없이 바로 들어가고(카드에 전송 대기 칩이 남지 않는다), 앞에서 셸이 도는 턴 중에는 지금처럼 기다린다. ko 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p240, 48005, 창 9485)만. 시험 폴더 C:\Workspace\mtask-p240-a(ping만 허용), 세션 bgt(haiku).
// 실행: sh backend/.dev/envp.sh node app/test/e2e/p240-bg-send.mjs [round]   결과는 experiments/p240/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p240', TAG);
const NAME = 'bgt';
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p240' || process.env.ATRIUM_PORT !== '48005') throw new Error('개발용 판(atrium-dev-p240, 48005) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, until } = await import('./harness.mjs');
const log = logger(`p240-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const get = () => { const j = JSON.parse(atrium('--json', 'get', NAME)); return j.session || j; };
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1500)}` : ''}`); };
const ko = (await import('../../src/renderer/locales/ko.js')).default;
const idle = () => until(() => { const s = get(); return s.state === 'ready'; }, 120000, 1000);

// 보내기 칸으로 보내고 그 세션의 전달 칩·상태를 0.1초마다 적는다
async function sendBar(page, text, ms) {
  await page.focus('[data-role=command]');
  await page.fill('[data-role=command]', `@${NAME} ${text}`);
  await sleep(200);
  await page.keyboard.press('Enter');
  const t0 = Date.now(), seen = [];
  while (Date.now() - t0 < ms) {
    seen.push(await page.evaluate((n) => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === n); const node = document.querySelector(`.react-flow__node[data-id="${s && s.sessionId}"]`); return { t: 0, state: s && s.state, delivering: s && s.delivering, badge: !!(node && node.querySelector('.mt-badge.deliver')), queuedText: !!(node && node.textContent.includes('전송 대기')) }; }, NAME).then((x) => ({ ...x, t: Date.now() - t0 })));
    await sleep(100);
  }
  return seen;
}
async function nodeShot(page, file) {
  const id = get().sessionId;
  const el = await page.$(`.react-flow__node[data-id="${id}"]`);
  if (el) await el.screenshot({ path: path.join(OUT, file) }); else await page.screenshot({ path: path.join(OUT, file) });
}

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9485'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  call('settings.set', { key: 'language', value: 'ko' });
  await page.waitForFunction(() => document.documentElement.lang === 'ko', null, { timeout: 10000 }).catch(() => {});
  await idle();
  // 1. 뒤 셸을 띄우고 턴을 끝낸다
  atrium('send', `@${NAME}`, 'Use the Bash tool with run_in_background set to true to run exactly: ping -n 60 127.0.0.1 . Do not wait for it or check its output. Right after starting it, end your turn by replying only: started');
  await until(() => { const s = get(); return s.turn && s.turn.endedAt && s.lastAnswer && /started/i.test(s.lastAnswer) && s.background && s.background.n > 0 && s.state === 'working'; }, 120000, 1000);
  const s1 = get();
  check('턴은 끝났고 뒤 셸만 돈다: 판 상태 working, 뒤 일 표시 그대로', s1.state === 'working' && s1.background.n > 0, { state: s1.state, bg: s1.background && s1.background.n });
  await sleep(800);
  await nodeShot(page, '01-bg-only-before-ko.png');
  const seen = await sendBar(page, 'Reply with only the word PONG.', 4000);
  fs.writeFileSync(path.join(OUT, 'bg-only-trace.json'), JSON.stringify(seen, null, 1));
  const queuedAt = seen.filter((x) => x.queuedText).map((x) => x.t);
  const badgeMs = seen.filter((x) => x.badge).length * 100;
  check('뒤 셸만 돌 때 보낸 글: 카드에 "전송 대기 중" 글이 없다', queuedAt.length === 0, { queuedAt });
  check('전달 칩은 길어야 한 번 잠깐(보내는 중) 뜨고 사라진다(≤1.5초)', badgeMs <= 1500 && !seen[seen.length - 1].badge, { badgeMs, last: seen[seen.length - 1] });
  const dl = call('delivery.list', { session: NAME }) || [];
  log('deliveries ' + JSON.stringify(dl.slice(0, 2).map((d) => ({ status: d.status, reason: d.reason, wait: (d.sentAt || 0) - d.createdAt }))));
  await nodeShot(page, '02-bg-only-after-send-ko.png');
  await idle();
  // 2. 앞 셸이 도는 턴 중에는 기다린다(전송 대기 칩이 보인다)
  atrium('send', `@${NAME}`, 'Run this shell command in the foreground (NOT in background) and wait for it to finish: ping -n 20 127.0.0.1 . Then reply only: fg done');
  await until(() => { const ev = atrium('events', NAME, '--limit', '6'); return /PreToolUse/.test(ev); }, 60000, 1000);
  const seen2 = await sendBar(page, 'Reply with only the word SECOND.', 3000);
  fs.writeFileSync(path.join(OUT, 'foreground-trace.json'), JSON.stringify(seen2, null, 1));
  check('앞 셸이 도는 턴 중에는 전송 대기(칩이 남는다)', seen2.slice(-5).every((x) => x.badge), seen2.slice(-1)[0]);
  await page.waitForSelector('.mt-badge.deliver', { timeout: 5000 }).catch(() => {});
  await nodeShot(page, '03-foreground-waits-ko.png');
  await idle();
  await until(() => !page.isClosed(), 1000).catch(() => {});
} catch (e) { check('시험 오류', false, e.stack); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
  await closeApp(app);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
