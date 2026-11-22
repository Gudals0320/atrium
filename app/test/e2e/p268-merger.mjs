// P268 창 시험: 합치기 merger의 창 쪽. 설정 › 합치기 탭, 사람에게 묻는 카드(보이기·답하기·한 번만), 캔버스의 하위 → merger 선, merger 꼬리표. ko·en 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p268, 48018, 창 디버깅 9499)만. 시험 저장소(dev 브랜치)와 haiku 리드, 리드가 띄운 claude -w 하위 w1(설정 ask에서 done ok → 카드)은 이 시험 밖에서 만든다.
// 카드에서 켜기를 누른 뒤 이 시험이 리드의 토큰(P268_LEAD_ENV, JSON)으로 하위 w2를 띄우고, 합치기 일이 merger에게 간 동안 선을 찍는다.
// 실행: sh backend/.dev/dev.sh node app/test/e2e/p268-merger.mjs [round] (P268_REPO=시험 저장소, P268_LEAD_ENV=리드 env JSON)
// 결과는 experiments/p268/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p268', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p268' || process.env.ATRIUM_PORT !== '48018') throw new Error('개발용 판(atrium-dev-p268, 48018) 환경에서만 돈다');
const TREPO = process.env.P268_REPO;
const LEAD = JSON.parse(process.env.P268_LEAD_ENV || '{}');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p268-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const asLead = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium-child.mjs'), ...a], { encoding: 'utf8', cwd: TREPO, env: { ...process.env, ...LEAD }, timeout: 180000 });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1200) : '')); };
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(600); }
const shot = async (page, name, clip) => { await page.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip } : {}) }); log('그림 ' + name + '.png'); };
const boxOf = (page, sel, pad = 16) => page.evaluate(([s, p]) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const x = Math.max(0, r.left - p), y = Math.max(0, r.top - p); return { x, y, width: Math.min(window.innerWidth - x, r.width + 2 * p), height: Math.min(window.innerHeight - y, r.height + 2 * p) }; }, [sel, pad]);

const st0 = call('merger.status');
check('판에 물음 하나(w1, 설정 ask)', st0.mode === 'ask' && st0.asks.length === 1 && st0.asks[0].child === 'w1', st0.asks);
const { app, page } = await launch({ log, args: ['--remote-debugging-port=9499'] });
try {
  await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  // 1) 묻는 카드
  await page.waitForSelector('[data-role=merger-ask]', { timeout: 20000 });
  const cards = await page.$$eval('[data-role=merger-ask]', (xs) => xs.map((x) => ({ ws: x.dataset.ws, text: x.innerText })));
  check('카드가 하나 보인다(워크스페이스마다 한 번)', cards.length === 1, cards);
  for (const l of ['en', 'ko']) {
    await lang(page, l);
    const t = await page.$eval('[data-role=merger-ask]', (x) => x.innerText);
    check(l + ' 카드 글(제목·@w1·브랜치·dev·보냄 줄)', (l === 'ko' ? /병합을 merger에게 맡길까요/.test(t) && /이번 결과는 맡긴 세션에게/.test(t) : /Let a merger session merge/.test(t) && /This result was sent/.test(t)) && /@w1/.test(t) && /worktree-w1/.test(t) && /dev/.test(t), t);
    await shot(page, 'ask-card-' + l);
    await shot(page, 'ask-card-' + l + '-clip', await boxOf(page, '[data-role=merger-asks]', 24));
  }
  // 나중에: 이 창에서만 닫힌다(판의 물음은 남는다)
  await page.click('[data-action=merger-later]');
  await sleep(400);
  check('나중에 → 카드 닫힘, 판의 물음은 남음', (await page.$$('[data-role=merger-ask]')).length === 0 && call('merger.asks').asks.length === 1);
  // 2) 설정 › 합치기 탭
  for (const l of ['en', 'ko']) {
    await lang(page, l);
    await page.keyboard.press('Escape').catch(() => {});
    const opened = await page.evaluate(() => { const b = document.querySelector('[data-action=settings-open]') || document.querySelector('[data-action=settings-rail]'); if (b) { b.click(); return true; } return false; });
    if (!opened) await page.evaluate(() => { const st = window.__mt.getState(); if (st.openDialog) st.openDialog({ kind: 'settings' }); });
    await page.waitForSelector('[data-role=settings]', { timeout: 10000 });
    await page.click('[data-role=settings-tabs] [data-tab=agents]');
    await page.waitForSelector('[data-role=merger-settings]');
    const v = await page.evaluate(() => ({ mode: document.querySelector('[data-field=setting-mergerMode]').dataset.value, kind: document.querySelector('[data-field=setting-mergerKind]').value, model: document.querySelector('[data-field=setting-mergerModel]').value, effort: document.querySelector('[data-field=setting-mergerEffort]').value }));
    check(l + ' 설정 칸 값(ask, claude, haiku, 빈 노력)', v.mode === 'ask' && v.kind === 'claude' && v.model === 'haiku' && v.effort === '', v);
    await shot(page, 'settings-' + l, await boxOf(page, '[data-role=settings]', 8));
    await page.click('[data-action=settings-close]');
    await sleep(300);
  }
  // 설정 칸 바꾸기: 노력 low → 판 값, 되돌리기
  {
    await page.evaluate(() => { const b = document.querySelector('[data-action=settings-open]') || document.querySelector('[data-action=settings-rail]'); if (b) b.click(); else window.__mt.getState().openDialog({ kind: 'settings' }); });
    await page.waitForSelector('[data-role=settings]');
    await page.click('[data-role=settings-tabs] [data-tab=agents]');
    await page.selectOption('[data-field=setting-mergerEffort]', 'low');
    await sleep(800);
    const e1 = call('settings.get').settings.mergerEffort;
    await page.selectOption('[data-field=setting-mergerEffort]', '');
    await sleep(800);
    check('노력 칸을 바꾸면 판 설정이 바뀐다', e1 === 'low' && call('settings.get').settings.mergerEffort === '', e1);
    await page.click('[data-action=settings-close]');
  }
  // 3) 카드 다시(창을 다시 읽으면 판의 물음이 다시 보인다) → 켜기
  await page.reload();
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 });
  await page.waitForSelector('[data-role=merger-ask]', { timeout: 20000 });
  check('다시 읽으면 답 없는 물음이 다시 보인다', (await page.$$('[data-role=merger-ask]')).length === 1);
  await page.click('[data-action=merger-on]');
  await page.waitForFunction(() => !document.querySelector('[data-role=merger-ask]'), null, { timeout: 10000 }).catch(() => {});
  const st1 = call('merger.status', { workspace: TREPO });
  check('켜기 → 카드 사라짐, 판이 답을 기억(enabled)', (await page.$$('[data-role=merger-ask]')).length === 0 && st1.asks.length === 0 && st1.enabled === true && Object.values(st1.answers)[0] === 'on', { asks: st1.asks, enabled: st1.enabled, answers: st1.answers });
  // 설정 탭의 프로젝트 줄(다시 묻기)
  await page.evaluate(() => { const b = document.querySelector('[data-action=settings-open]') || document.querySelector('[data-action=settings-rail]'); if (b) b.click(); else window.__mt.getState().openDialog({ kind: 'settings' }); });
  await page.waitForSelector('[data-role=settings]');
  await page.click('[data-role=settings-tabs] [data-tab=agents]');
  await page.waitForSelector('[data-role=merger-answers]', { timeout: 5000 }).catch(() => {});
  check('설정 탭에 기억한 답(켬) 줄', !!(await page.$('[data-role=merger-answers] [data-answer=on]')));
  await shot(page, 'settings-answers-ko', await boxOf(page, '[data-role=settings]', 8));
  await page.click('[data-action=settings-close]');

  // 4) 하위 w2 → merger 선
  const pr = 'Create a file named w2.txt containing the line: from w2. Then run git add w2.txt and git commit -m "w2: add w2.txt". Then run: atrium done ok "w2 added w2.txt". Do nothing else.';
  log(asLead('child', 'w2', '--worktree', 'w2', '--model', 'haiku', '--no-wait', '--prompt', pr).slice(0, 400));
  let job = null, t0 = Date.now(), seenMerger = null;
  while (Date.now() - t0 < 300000) {
    await sleep(1500);
    const st = call('merger.status');
    job = st.jobs.find((j) => j.child === 'w2' && j.mergerId) || null;
    if (job) { seenMerger = st.mergers.find((m) => m.sessionId === job.mergerId); break; }
  }
  check('w2의 done ok → 합치기 일이 merger에게(childId → mergerId)', !!job, job);
  if (job) {
    await page.evaluate((id) => { const st = window.__mt.getState(); if (st.fitAll) st.fitAll(0); }, job.mergerId);
    await page.waitForSelector('[data-role=merger-line]', { timeout: 20000 }).catch(() => {});
    const line = await page.$eval('[data-role=merger-line]', (x) => ({ edge: x.dataset.edge, state: x.dataset.state, text: x.innerText })).catch(() => null);
    check('캔버스에 하위 → merger 선과 글', !!line && line.edge === 'merge:' + job.childId + '>' + job.mergerId, line);
    const tags = await page.$$eval('[data-role=merger-tag]', (xs) => xs.length);
    check('merger 세션 꼬리표(노드·사이드바)', tags >= 1, tags);
    for (const l of ['ko', 'en']) { await lang(page, l); await shot(page, 'merger-line-' + l); }
    // 합침 뒤 선이 사라진다(일이 닫힘)
    let gone = false; const t1 = Date.now();
    while (Date.now() - t1 < 360000) { await sleep(3000); const st = call('merger.status'); if (!st.jobs.some((j) => j.unit === job.unit)) { gone = true; break; } }
    await sleep(1500);
    const left = await page.$$('[data-role=merger-line]');
    check('일이 닫히면 선이 사라진다', gone && left.length === 0, { gone, left: left.length });
    await shot(page, 'after-merge-ko');
  }
} catch (e) { check('예외 없음', false, e.stack || String(e)); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log('결과 ' + results.filter((r) => r.ok).length + '/' + results.length);
  await closeApp(app);
  process.exit(0);
}
