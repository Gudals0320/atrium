// P271 창 시험(이슈 #19): Codex 세션에 보내기 칸으로 짧은 한 줄(한 번에 제출), 일하는 Codex에 스티어링과 대기열 "바로 보내기",
// 보내지 못한 전달이 보내기 칸·대기열에 보이는가. 판: 따로 띄운 개발용 판(atrium-dev-p271, 48021, 창 9502)만.
// 시험 폴더 C:\Workspace\mtask-p271-cx(git 아님: Codex 신뢰 질문 없음), 세션 cx1·cx3(Codex, --effort low)을 미리 띄워 둔다.
// 실행: (판 환경으로) node app/test/e2e/p271-codex.mjs [round]   결과는 experiments/p271/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p271', TAG);
const K = Math.random().toString(36).slice(2, 6).toUpperCase();
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p271' || process.env.ATRIUM_PORT !== '48021') throw new Error('개발용 판(atrium-dev-p271, 48021) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, until } = await import('./harness.mjs');
const log = logger(`p271-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const state = (name) => { const j = JSON.parse(atrium('--json', 'get', name)); return (j.session || j).state; };
const dl = (name) => { const r = call('delivery.list', { session: name, limit: 20 }); return Array.isArray(r) ? r : []; };
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 800)}` : ''}`); };
const screenOf = (name) => atrium('screen', name, '--text');
const count = (s, needle) => s.split(needle).length - 1;

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
async function typeBar(page, name, text) { await page.focus('[data-role=command]'); await page.fill('[data-role=command]', `@${name} ${text}`); await sleep(300); }
async function longTurn(name, topic) {
  atrium('send', `@${name}`, `Write a detailed 900-word story about ${topic}, in English, directly in your reply. Do not use any tools.`);
  await until(() => state(name) === 'working', 30000, 500);
  await sleep(1500);
}
const idle = (name) => until(() => state(name) === 'ready', 180000, 1000);

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9502'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  call('settings.set', { key: 'language', value: 'ko' });
  await page.waitForFunction(() => document.documentElement.lang === 'ko', null, { timeout: 10000 }).catch(() => {});
  await idle('cx1');
  // 1. 쉬는 Codex에 보내기 칸으로 짧은 한 줄: 한 번에 제출, 한 번만
  const q1 = `${K} 더하기는 몇 글자야? 한 줄로`;
  await typeBar(page, 'cx1', q1);
  await page.keyboard.press('Enter');
  await until(() => dl('cx1').some((d) => (d.text || '').includes(K) && d.status === 'confirmed'), 30000, 300).catch(() => {});
  const d1 = dl('cx1').find((d) => (d.text || '').includes(K));
  check('보내기 칸의 짧은 한 줄이 Codex에 제출 확인됨(시도 1번)', d1 && d1.status === 'confirmed' && d1.attempts === 1, d1 && { status: d1.status, reason: d1.reason, attempts: d1.attempts });
  await sleep(400); await barShot(page, 'ko-01-short-confirmed.png');
  await idle('cx1');
  check('Codex 대화에 그 글이 한 번만 보인다', count(screenOf('cx1'), q1) === 1);
  // 2. 일하는 Codex에 스티어링(보내기 칸): 스티어링 단추가 켜지고 지금 턴에 들어간다
  await longTurn('cx1', 'a mountain baker');
  await typeBar(page, 'cx1', `STEER${K}: make the baker left-handed and say so.`);
  const btn = await page.$('[data-action=cmd-steer]');
  check('일하는 Codex에도 스티어링 단추가 보인다', !!btn);
  await page.click('[data-action=cmd-steer]');
  await barShot(page, 'ko-02-steer-on.png');
  await page.keyboard.press('Enter');
  await until(() => dl('cx1').some((d) => (d.text || '').includes('STEER' + K) && d.status === 'confirmed'), 30000, 300).catch(() => {});
  const d2 = dl('cx1').find((d) => (d.text || '').includes('STEER' + K));
  check('스티어링 글이 일하는 중에 들어가 화면으로 확인됨(typed)', d2 && d2.status === 'confirmed' && /typed|screen/.test(d2.reason || ''), d2 && { status: d2.status, reason: d2.reason });
  check('그때 Codex는 아직 일하는 중', state('cx1') === 'working');
  await sleep(300); await barShot(page, 'ko-03-steer-typed.png');
  // 3. 대기열의 바로 보내기: 일하는 Codex의 대기 글에 단추가 켜져 있고 누르면 지금 턴에
  await typeBar(page, 'cx1', `NOW${K}: also give the baker a dog.`);
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-role=delivery-group] [data-action=delivery-now]', { timeout: 10000 }).catch(() => {});
  const nowBtn = await page.$('[data-role=delivery-group] [data-action=delivery-now]');
  const nowInfo = nowBtn && await page.evaluate((b) => ({ disabled: b.disabled, title: b.parentElement.getAttribute('title'), steer: b.parentElement.dataset.steer }), nowBtn);
  check('일하는 Codex의 대기 글에 바로 보내기가 켜져 있다(steer)', nowInfo && !nowInfo.disabled && nowInfo.steer === 'steer', nowInfo);
  await barShot(page, 'ko-04-queue-now.png');
  if (nowBtn) await nowBtn.click();
  await until(() => dl('cx1').some((d) => (d.text || '').includes('NOW' + K) && d.status === 'confirmed'), 30000, 300).catch(() => {});
  const d3 = dl('cx1').find((d) => (d.text || '').includes('NOW' + K));
  check('바로 보낸 글이 지금 턴에 들어갔다(now_typed)', d3 && d3.status === 'confirmed' && d3.reason === 'now_typed', d3 && { status: d3.status, reason: d3.reason });
  await sleep(300); await barShot(page, 'ko-05-now-sent.png');
  await idle('cx1');
  const scr = screenOf('cx1');
  fs.writeFileSync(path.join(OUT, 'cx1-screen.txt'), scr);
  // 화면은 보이는 만큼만 읽는다(긴 답이 위로 밀어낸다). 두 번 들어갔는지는 전달 기록과 Codex 기록(rollout의 사용자 글, 기록 파일에 적음)으로 본다
  check('턴이 끝난 뒤 화면에 스티어링·바로 보낸 글이 두 번 보이지 않는다', count(scr, 'STEER' + K) <= 1 && count(scr, 'NOW' + K) <= 1, { steer: count(scr, 'STEER' + K), now: count(scr, 'NOW' + K) });
  const again = dl('cx1').filter((d) => /STEER|NOW/.test(d.text || '') && (d.text || '').includes(K));
  check('같은 글의 전달은 하나씩이고 모두 확인됨', again.length === 2 && again.every((d) => d.status === 'confirmed' && d.attempts === 1), again.map((d) => ({ status: d.status, attempts: d.attempts })));
  // 4. 보내지 못한 전달이 보이는가: 일하는 cx3에 대기 글을 넣고 세션을 닫는다 → 실패(세션 닫힘)가 보내기 칸 위에 보인다
  await longTurn('cx3', 'a river ferry');
  await typeBar(page, 'cx3', `FAIL${K}: this one cannot be delivered.`);
  await page.keyboard.press('Enter');
  await sleep(1500);
  atrium('kill', 'cx3', '--yes');
  await until(() => page.evaluate(() => !!document.querySelector('.mt-delivery.ds-failed, .mt-delivery.ds-unconfirmed')), 20000, 300).catch(() => {});
  const failChip = await page.evaluate(() => { const e = document.querySelector('.mt-delivery.ds-failed, .mt-delivery.ds-unconfirmed'); return e ? e.innerText.replace(/\s+/g, ' ') : null; });
  check('보내지 못한 전달이 보내기 칸 위에 실패로 보인다', !!failChip, failChip);
  await barShot(page, 'ko-06-failed.png');
  // en 그림: 대기열 바로 보내기 단추 설명
  call('settings.set', { key: 'language', value: 'en' });
  await page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 10000 }).catch(() => {});
  await longTurn('cx1', 'a lighthouse keeper');
  await typeBar(page, 'cx1', `EN${K}: keep it short.`);
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-role=delivery-group] [data-action=delivery-now]', { timeout: 10000 }).catch(() => {});
  const enTitle = await page.evaluate(() => { const b = document.querySelector('[data-role=delivery-group] [data-action=delivery-now]'); return b ? b.parentElement.getAttribute('title') : null; });
  check('en: 바로 보내기 설명이 Codex를 말한다', /Codex/.test(enTitle || ''), enTitle);
  await barShot(page, 'en-04-queue-now.png');
  await idle('cx1');
  call('settings.set', { key: 'language', value: 'ko' });
} catch (e) { check('시험 오류', false, e.stack); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
  await closeApp(app);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
