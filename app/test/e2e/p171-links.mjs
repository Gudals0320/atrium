// P171 창 시험: 일시 연결. 세션 셋(A가 B를 띄움, C는 따로)에서
//   A가 atrium read C → 선 없음, A가 atrium prompt C → 일시 선(옅은 점선)이 보였다가 턴이 끝나고 여운(2분) 뒤 사라짐,
//   A가 atrium prompt B → 영구 선, 다시 A → C 일시 선을 선 메뉴 "연결 유지"로 영구로.
// 판: 따로 띄운 개발용 판(atrium-dev-p171, 47940, backend/.dev)만 쓴다. 창 원격 디버깅 포트 9420. 한 번에 한 창만(메모리).
//   A·B·C 모두 claude --model haiku(시험이 A의 세션 토큰으로 atrium을 부른다). 시험 폴더 C:\Workspace\mtask-p171-a(새로 만든다).
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p171-links.mjs <run|stop>
// 결과는 워크트리의 experiments/p171/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'run';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p171');
const CONVOS = path.join(OUT, 'convos');
const DIR = 'C:\\Workspace\\mtask-p171-a';
const BOARD = 'atrium-dev-p171', PORT = '47940', DEBUG = '9420';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: 'p171',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true }); fs.mkdirSync(DIR, { recursive: true });
const { logger, sleep, launch, closeApp, shot } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
if (ENV.ATRIUM_PORT !== '47940' || ENV.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p171') throw new Error('P171 판(atrium-dev-p171, 47940)만');

const log = logger(`p171-${WHAT}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
// A(부르는 쪽)로 atrium prompt|read|wait: 판이 데이터 폴더에 둔 A의 토큰을 읽는다
// 셸 세션에는 토큰 파일이 없어 판의 세션 토큰(branch.mjs token: apiToken의 HMAC)을 시험 판 board.db에서 만든다
const tokenOf = async (aId) => {
  const { DatabaseSync } = await import('node:sqlite');
  const crypto = await import('node:crypto');
  const db = new DatabaseSync(path.join(DEV, 'data', 'board.db'), { readOnly: true });
  const api = JSON.parse(db.prepare("SELECT value FROM meta WHERE key = 'apiToken'").get().value); db.close();
  return crypto.createHmac('sha256', api).update(`branch:${aId}`).digest('hex');
};
let A_TOKEN = null;
const asA = (aId, ...a) => { try { return asA0(aId, ...a); } catch (e) { throw new Error(`asA ${a.join(' ')}: code ${e.status} out ${String(e.stdout || '').slice(0, 600)} err ${String(e.stderr || '').slice(0, 600)}`); } };
const asA0 = (aId, ...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium-child.mjs'), ...a], { encoding: 'utf8', env: { ...process.env, ATRIUM_PROFILE: 'dev', ATRIUM_SESSION_ID: aId, ATRIUM_SESSION_TOKEN: A_TOKEN }, timeout: 240000 });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 800)}` : ''}`); };
const sessions = () => call('session.list');
const byName = (n) => sessions().find((s) => s.name === n);

if (WHAT === 'stop') {
  try { for (const s of sessions()) { try { log('끄기', atrium('kill', s.sessionId, '--yes', '--delete').trim().split('\n').slice(-1)[0]); } catch (e) { log('끄기 실패', s.name, e.message.slice(0, 160)); } } } catch (e) { log('목록 실패', e.message.slice(0, 160)); }
  try { log('터미널 멈춤', atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('터미널 멈춤 실패', e.message.slice(0, 200)); }
  try { log('백엔드 멈춤', atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('백엔드 멈춤 실패', e.message.slice(0, 200)); }
  process.exit(0);
}

// ---- 세션 셋 ----
// 창의 원격 디버깅 포트를 물려받지 않게 백엔드를 CLI로 먼저 띄운다(P81)
try { sessions(); } catch { log('백엔드 띄움', atrium('backend', 'start').trim().slice(-200)); await sleep(1500); }
for (const s of sessions()) { try { atrium('kill', s.sessionId, '--yes', '--delete'); } catch {} }
const A = call('session.spawn', { cwd: DIR, name: 'p171-a', kind: 'claude', model: 'haiku' }); // 부르는 쪽도 에이전트여야 한다(not_board_session)
const B = call('session.spawn', { cwd: DIR, name: 'p171-b', kind: 'claude', model: 'haiku', parentSessionId: A.sessionId });
const C = call('session.spawn', { cwd: DIR, name: 'p171-c', kind: 'claude', model: 'haiku' });
A_TOKEN = await tokenOf(A.sessionId);
log(`A ${A.sessionId} B ${B.sessionId} C ${C.sessionId}`);
const t0 = Date.now();
for (;;) {
  const ss = sessions();
  const st = (n) => (ss.find((s) => s.name === n) || {}).state;
  if (['trust_wait'].includes(st('p171-b')) || ['trust_wait'].includes(st('p171-c'))) { fs.writeFileSync(path.join(DEV, 'p171-need-trust.txt'), `trust question on ${DIR}\n`); throw new Error('신뢰 질문'); }
  if (['p171-a', 'p171-b', 'p171-c'].every((n) => st(n) === 'ready')) break;
  if (Date.now() - t0 > 120000) throw new Error(`준비 안 됨 b=${st('p171-b')} c=${st('p171-c')}`);
  await sleep(1000);
}
const linkAC = () => call('link.list').find((l) => l.from === A.sessionId && l.to === C.sessionId) || null;
const linkAB = () => call('link.list').find((l) => l.from === A.sessionId && l.to === B.sessionId) || null;

const { app, page } = await launch({ log, args: [`--remote-debugging-port=${DEBUG}`] });
const uiLink = (from, to) => page.evaluate(([f, t]) => { const l = [...window.__mt.getState().links.values()].find((x) => x.from === f && x.to === t); if (!l) return null; const el = document.querySelector(`.react-flow__edge [class*="mt-edge"]`) && document.querySelector(`[data-link="${l.linkId}"]`); const path = [...document.querySelectorAll('path.mt-edge')].find((p) => p.closest(`[data-id="${l.linkId}"]`)); return { linkId: l.linkId, transient: !!l.transient, label: !!el, labelTransient: el ? el.dataset.transient || null : null, pathClass: path ? path.getAttribute('class') : null, dash: path ? getComputedStyle(path).strokeDasharray : null, opacity: path ? getComputedStyle(path).opacity : null }; }, [from, to]);
try {
  await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
  await page.evaluate(() => window.__mt.getState().fitAll && window.__mt.getState().fitAll(0)); await sleep(1200);
  await shot(page, '0-start', log);

  // 1) read → 선 없음
  const r = JSON.parse(asA(A.sessionId, 'read', 'p171-c', '--json'));
  check('read 답', r && r.name === 'p171-c', r.source);
  await sleep(800);
  check('read 뒤 A→C 선 없음(판)', !linkAC());
  check('read 뒤 A→C 선 없음(창)', !(await uiLink(A.sessionId, C.sessionId)));
  await shot(page, '1-after-read', log);

  // 2) prompt C(관계 없음) → 일시 선
  asA(A.sessionId, 'prompt', 'p171-c', 'Reply with just the word OK. Do not use tools.', '--json');
  await page.waitForFunction((x) => [...window.__mt.getState().links.values()].some((l) => l.from === x.a && l.to === x.c), { a: A.sessionId, c: C.sessionId }, { timeout: 20000 });
  await sleep(600);
  let u = await uiLink(A.sessionId, C.sessionId);
  check('prompt C 뒤 일시 선(창)', u && u.transient && /transient/.test(u.pathClass || ''), u);
  await page.evaluate(() => window.__mt.getState().fitAll && window.__mt.getState().fitAll(0)); await sleep(800);
  await shot(page, '2-temp-line', log);
  const w = JSON.parse(asA(A.sessionId, 'wait', 'p171-c', '--json'));
  check('C 턴 끝', w.status === 'done', w.status);
  await sleep(2000);
  const lc = linkAC();
  check('턴 끝 뒤 여운(2분 안)', lc && lc.transient && lc.tempUntil && lc.tempUntil - Date.now() <= 120000 && lc.tempUntil > Date.now(), lc && { tempUntil: lc.tempUntil - Date.now() });
  await shot(page, '3-linger', log);
  // 여운 2분 + 쓸기 15초
  const gone = await page.waitForFunction((x) => ![...window.__mt.getState().links.values()].some((l) => l.from === x.a && l.to === x.c), { a: A.sessionId, c: C.sessionId }, { timeout: 200000, polling: 1000 }).then(() => true).catch(() => false);
  check('여운 뒤 일시 선이 창에서 사라짐', gone);
  check('여운 뒤 판의 연결 목록에도 없음', !linkAC());
  await shot(page, '4-temp-gone', log);

  // 3) prompt B(A가 띄움) → 영구 선
  const pb = JSON.parse(asA(A.sessionId, 'prompt', 'p171-b', 'Reply with just the word OK. Do not use tools.', '--wait', '--json'));
  check('B 턴 끝', pb.turn && pb.turn.status === 'done', pb.turn && pb.turn.status);
  await sleep(1000);
  u = await uiLink(A.sessionId, B.sessionId);
  check('prompt B 뒤 영구 선(창)', u && !u.transient && !/transient/.test(u.pathClass || ''), u);
  await shot(page, '5-permanent-line', log);

  // 4) 다시 C로 일시 선 → 선 메뉴 "연결 유지"
  asA(A.sessionId, 'prompt', 'p171-c', 'Reply with just the word OK again. Do not use tools.', '--json');
  await page.waitForFunction((x) => [...window.__mt.getState().links.values()].some((l) => l.from === x.a && l.to === x.c && l.transient), { a: A.sessionId, c: C.sessionId }, { timeout: 20000 });
  u = await uiLink(A.sessionId, C.sessionId);
  await page.evaluate((id) => window.__mt.getState().openDialog ? window.__mt.getState().openDialog({ kind: 'link', linkId: id }) : null, u.linkId);
  let panel = await page.waitForSelector('[data-role=link-panel]', { timeout: 5000 }).then(() => true).catch(() => false);
  if (!panel) { await page.click(`[data-link="${u.linkId}"]`).catch(() => {}); panel = await page.waitForSelector('[data-role=link-panel]', { timeout: 5000 }).then(() => true).catch(() => false); }
  check('선 메뉴가 열림', panel);
  check('선 메뉴의 일시 안내와 연결 유지 단추', await page.locator('[data-role=link-temp-note]').count() === 1 && await page.locator('[data-action=link-keep]').count() === 1);
  await shot(page, '6-panel-keep', log);
  await page.click('[data-action=link-keep]');
  await sleep(1000);
  const lk = linkAC();
  check('연결 유지 뒤 영구', lk && !lk.transient && lk.tempUntil == null, lk && { transient: lk.transient });
  check('연결 유지 뒤 단추 사라짐', await page.locator('[data-action=link-keep]').count() === 0);
  await shot(page, '7-kept', log);
  asA(A.sessionId, 'wait', 'p171-c', '--json');
} catch (e) { check('예외', false, e.stack); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((x) => x.ok).length}/${results.length}`);
  await closeApp(app);
}
process.exit(0);
