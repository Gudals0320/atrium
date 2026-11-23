// P333 창 시험: 세션 맵 카드의 할 일 배지와 작업 완료 꼬리표를 오른쪽 위 한 무리로 쌓는다(.mt-sm-tags).
// 판·세션·카드는 P331 창 시험(p331-map-todo.mjs)과 같은 꼴: haiku 둘(lead, w1)과 셸 하나(sh3), haiku가 atrium ask·todo로 진짜 카드를 남긴다.
// shots: 100%·맞춤·멀리에서 둘 다 있는 카드·하나만 있는 카드를 찍고 꼬리표 자리·크기를 잰다(전·후·v0.2.2는 app/dist를 바꿔 끼워 같은 판으로).
// 판: 따로 띄운 개발용 판(atrium-dev-p333, 48083, backend/.dev)만. 창의 원격 디버깅 포트 9564. 한 번에 한 창만.
// 실행: node app/test/e2e/p333-map-tags.mjs <setup|seed|shots|stop> [round]
// 결과는 워크트리의 experiments/p333/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'pc';
const TAG = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p333', TAG);
const BOARD = 'atrium-dev-p333', PORT = '48083', DEBUG = '9564';
const FOLDER = 'C:\\Workspace\\mtask-p333-a', SHF = 'C:\\Workspace\\mtask-p333-b';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p333', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p333-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p333-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const sess = (n) => call('session.list').find((s) => s.name === n);
const cards = () => call('decision.list').cards;
async function waitFor(fn, ms = 120000, every = 1500) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(every); } }
const idle = (name) => waitFor(() => { const s = sess(name); return s && s.state === 'ready' && s; }, 180000, 2000);
const dropAuto = () => { for (const c of cards().filter((x) => x.auto)) call('decision.ignore', { id: c.id }); };
function runFile(name, file, cmds, reply) {
  fs.writeFileSync(file, cmds.join('\n') + '\n');
  atrium('send', '@' + name, `시험입니다. ${file} 파일의 명령을 한 줄씩 그대로 셸에서 실행하고, 끝나면 "${reply}" 한마디만 답해 주세요.`);
}
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }

async function setup() {
  for (const f of [FOLDER, SHF]) fs.mkdirSync(f, { recursive: true });
  log(atrium('backend', 'start'));
  if (!sess('lead')) log(atrium('spawn', FOLDER, '--name', 'lead', '--model', 'haiku'));
  if (!sess('w1')) log(atrium('spawn', FOLDER, '--name', 'w1', '--model', 'haiku'));
  if (!sess('sh3')) log(atrium('spawn', SHF, '--name', 'sh3', '--kind', 'shell'));
  const a = await idle('lead'); const b = await idle('w1');
  check('lead·w1이 떴다(ready), sh3', !!a && !!b && !!sess('sh3'), [a && a.state, b && b.state]);
}

const Q1 = '그림용: 어느 안으로 갈까요?', Q2 = '그림용: 설정 창에 새 단추가 보이나요?', Q3 = '그림용: npm 캐시를 확인해 주세요', Q4 = '그림용: 나중에 할 일(미룸)';
async function seed() {
  for (const c of cards()) call('decision.ignore', { id: c.id });
  await idle('lead'); await idle('w1');
  runFile('lead', path.join(FOLDER, 'p333-lead.txt'), [`atrium ask "${Q1}" --option "A안" --option "B안" --why "시험 카드입니다"`, `atrium todo "${Q2}" --check`], '남겼습니다');
  runFile('w1', path.join(FOLDER, 'p333-w1.txt'), [`atrium todo "${Q3}" --cmd "npm cache verify"`, `atrium todo "${Q4}"`], '남겼습니다');
  const ok = await waitFor(() => { const c = cards(); return [Q1, Q2, Q3, Q4].every((q) => c.some((x) => x.question === q)) && c; }, 240000, 2000);
  check('카드 넷이 생겼다', !!ok, ok && ok.map((c) => [c.id, c.name, c.kind]));
  await idle('lead'); await idle('w1'); await sleep(3000); dropAuto();
  const c4 = cards().find((c) => c.question === Q4);
  if (c4) call('decision.snooze', { id: c4.id, until: Date.now() + 6 * 3600 * 1000 });
  await sleep(500);
  const now = cards();
  check('w1의 하나는 미뤘다', !!now.find((c) => c.question === Q4 && c.deferred), now.map((c) => [c.id, c.name, c.question, c.deferred]));
}

// 카드의 꼬리표 둘(할 일·작업 완료)의 화면 자리·크기(카드 상자 기준)
const tagsOf = (page, name) => page.evaluate((name) => {
  const c = document.querySelector(`[data-role="mission"] .mt-ta-card[data-name="${name}"]`); if (!c) return 'nocard';
  const cr = c.getBoundingClientRect();
  const one = (el) => { if (!el || getComputedStyle(el).display === 'none') return null; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return { l: Math.round(r.left - cr.left), r: Math.round(cr.right - r.right), t: Math.round(r.top - cr.top), w: Math.round(r.width), h: Math.round(r.height * 10) / 10, font: cs.fontSize, cssH: cs.height }; };
  const todo = one(c.querySelector('[data-role=map-todo]')), done = one(c.querySelector('[data-role=mm-done]'));
  return { tier: c.dataset.tier, card: { w: Math.round(cr.width), h: Math.round(cr.height) }, todo, done, k: window.__mtTa.view() && Math.round(window.__mtTa.view().k * 1000) / 1000, far: !!document.querySelector('.mt-ta-world.lv-far') };
}, name);
const cardRect = (page, name) => page.evaluate((name) => { const c = document.querySelector(`[data-role="mission"] .mt-ta-card[data-name="${name}"]`); if (!c) return null; const r = c.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }, name);
const ROUND = process.env.P333_ROUND || 'after'; // before|after|v022|after-single|before-single: 판정은 after*만

// 하나만 있는 카드 만들기: lead는 본 것으로(작업 완료 꼬리표 없앰, 할 일 둘 남음), w1은 할 일 카드를 무시(작업 완료만)
function single() {
  log(JSON.stringify(call('session.markSeen', { session: 'lead' })));
  for (const c of cards().filter((x) => x.name === 'w1')) call('decision.ignore', { id: c.id });
  check('w1 할 일 없음', !cards().some((c) => c.name === 'w1'), cards().map((c) => [c.id, c.name]));
}

async function shots() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  const seen = {};
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    call('settings.set', { key: 'language', value: 'ko' }); await sleep(800);
    const side = await page.evaluate(() => !!document.querySelector('[data-role=sidebar]'));
    if (side) { await page.click('[data-role=top-left] [data-action=sidebar]').catch(() => {}); await sleep(600); }
    // 세션 맵 열기(v0.2.2 빌드는 위 알약 대신 레일 단추)
    const pill = await page.$('[data-role=sessions-pill]') || await page.$('[data-action=mission-rail]') || await page.$('[data-action=chip-mission]');
    await pill.click(); await sleep(1500);
    await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 }); await sleep(1200);
    const names = ['lead', 'w1', 'sh3'];
    const clipOf = async (ns, pad = 40) => { const rs = (await Promise.all(ns.map((n) => cardRect(page, n)))).filter(Boolean); if (!rs.length) return undefined; const x = Math.max(0, Math.min(...rs.map((r) => r.x)) - pad), y = Math.max(0, Math.min(...rs.map((r) => r.y)) - pad); return { x, y, width: Math.min(1600 - x, Math.max(...rs.map((r) => r.x + r.w)) - x + pad), height: Math.min(1000 - y, Math.max(...rs.map((r) => r.y + r.h)) - y + pad) }; };
    // 100%
    await page.evaluate(() => { const L = window.__mtTa.lay(); const hit = [...L.cards.entries()].find(([, b]) => b.node.name === 'lead'); window.__mtTa.flyTo(hit[0], 1); }); await sleep(1000);
    seen.z100 = {}; for (const n of names) seen.z100[n] = await tagsOf(page, n);
    log('100% ' + JSON.stringify(seen.z100));
    await shot(page, `map-100-${ROUND}`);
    for (const n of ['lead', 'w1']) { const c = await cardRect(page, n); if (c) await shot(page, `card-100-${n}-${ROUND}`, { clip: { x: Math.max(0, c.x - 30), y: Math.max(0, c.y - 30), width: c.w + 60, height: c.h + 50 } }); }
    // 맞춤
    await page.evaluate(() => window.__mtTa.fit()); await sleep(1200);
    seen.fit = {}; for (const n of names) seen.fit[n] = await tagsOf(page, n);
    log('fit ' + JSON.stringify(seen.fit));
    await shot(page, `map-fit-${ROUND}`);
    const cf = await clipOf(['lead', 'w1']); if (cf) await shot(page, `cards-fit-${ROUND}`, { clip: cf });
    // 멀리: 빈 자리에서 휠로 줄인다(lv-far가 될 때까지)
    const vb = await (await page.$('[data-role=ta-viewport]')).boundingBox();
    await page.mouse.move(vb.x + vb.width * 0.4, vb.y + vb.height * 0.5);
    for (let i = 0; i < 14 && !(await page.evaluate(() => !!document.querySelector('.mt-ta-world.lv-far'))); i++) { await page.mouse.wheel(0, 300); await sleep(250); }
    await sleep(900);
    seen.far = {}; for (const n of names) seen.far[n] = await tagsOf(page, n);
    log('far ' + JSON.stringify(seen.far));
    await shot(page, `map-far-${ROUND}`);
    const cfar = await clipOf(['lead', 'w1'], 60); if (cfar) await shot(page, `cards-far-${ROUND}`, { clip: cfar });
    fs.writeFileSync(path.join(OUT, `tags-${ROUND}.json`), JSON.stringify(seen, null, 2));
    if (ROUND.startsWith('after')) {
      // 판정: 둘 다 있는 카드는 [할 일][작업 완료] 오른쪽 위, 하나만 있으면 그것이 오른쪽 끝(카드 오른쪽 18px), 겹치지 않음, 위 테두리에 걸침
      for (const [z, m] of Object.entries(seen)) {
        for (const [n, v] of Object.entries(m)) {
          if (!v || v === 'nocard') continue;
          const { todo, done } = v;
          if (todo && done) {
            check(`${z} ${n}: 할 일이 작업 완료 왼쪽에 붙고 겹치지 않음`, todo.l + todo.w <= done.l + 1 && done.l - (todo.l + todo.w) <= 8 * (z === 'far' ? 4 : 1) && Math.abs(todo.t - done.t) <= 2, v);
          }
          const right = done || todo;
          if (right) check(`${z} ${n}: 맨 오른쪽 꼬리표가 카드 오른쪽 위(위 테두리에 걸침)`, right.r >= 0 && right.t < 0 && right.t + right.h > 0, v);
          if (todo && z !== 'far') check(`${z} ${n}: 할 일 배지가 오른쪽 위(왼쪽 아님)`, todo.r < v.card.w / 2, v); // 배지 오른쪽 끝이 카드 오른쪽 절반에
          if (z === 'z100') for (const x of [todo, done].filter(Boolean)) check(`100% ${n}: 꼬리표 높이 ${x.cssH}·글 ${x.font}`, parseFloat(x.cssH) >= 18 && parseFloat(x.font) >= 11.5, x);
        }
      }
      if (ROUND === 'after') check('둘 다 있는 카드를 보았다', Object.values(seen.z100).some((v) => v && v.todo && v.done), seen.z100);
      if (ROUND === 'after-single') {
        const l = seen.z100.lead, w = seen.z100.w1;
        check('하나만: lead는 할 일만(맨 오른쪽, 카드 오른쪽 18px 안팎)', l && l.todo && !l.done && Math.abs(l.todo.r - 18) <= 3, l);
        check('하나만: w1은 작업 완료만(맨 오른쪽)', w && w.done && !w.todo && Math.abs(w.done.r - 18) <= 3, w);
      }
    }
  } finally { await closeApp(app); }
}

async function stopAll() {
  for (const n of ['lead', 'w1', 'sh3']) { try { if (sess(n)) log(atrium('kill', n, '--yes')); } catch (e) { log('kill ' + e.message); } }
  try { log(atrium('terminal', 'stop', '--yes')); } catch (e) { log('terminal stop ' + e.message); }
  try { log(atrium('backend', 'stop')); } catch (e) { log('backend stop ' + e.message); }
}

try {
  if (WHAT === 'setup') await setup();
  else if (WHAT === 'seed') await seed();
  else if (WHAT === 'shots') await shots();
  else if (WHAT === 'single') single();
  else if (WHAT === 'stop') await stopAll();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p333-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
