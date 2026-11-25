// P360 창·판 시험: 끝난·닫힌·보관된 세션 되살리기(사람 길과 atrium revive), atrium fork(SDK로 갈라 열기), SDK 세션 다시 열기.
// 따로 띄운 개발용 판(atrium-dev-p360, 48105, 창 원격 디버깅 9586)만 쓴다.
// 실행: node app/test/e2e/p360-revive.mjs <setup|states|repro|human|agent|key|fork|sdkreopen|shots|stop>
// - setup: 판과 시험 폴더, 하위가 있는 lead(haiku)와 ea·kb·kd(haiku, 한 턴씩)
// - states: (a) ea는 /exit, (b) kb는 끄고 보관, (c) lead는 끄기(닫힘 목록), (d) kd는 끄고 자동 보관(archiveDays를 아주 짧게)
// - repro: 창의 사이드바에서 각 상태의 줄과 단추를 읽고 찍는다(고치기 전 dist로 돌리면 재현)
// - human: 창에서 한 번 눌러 되살린다(사이드바 줄의 다시 열기). agent: lead 토큰으로 atrium revive(에이전트 명령 그대로)
// - key: API 키를 환경 변수 ANTHROPIC_API_KEY로 받은 이 프로세스가(키 관리 도구로 띄운다) 판의 relay.setKey로 한 번 넣는다. 값은 어디에도 쓰지 않는다
// - fork: atrium fork <이름> --launcher claude-sdk(haiku 한 턴으로 원래 대화를 기억하는지), 중계기 기록. sdkreopen: 갈라 연 SDK 세션을 닫았다가 다시 연다
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const ROUND = process.argv[3] || 'new';
const KEY = WHAT === 'key' ? String(process.env.ANTHROPIC_API_KEY || '') : '';
delete process.env.ANTHROPIC_API_KEY;
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p360', 'shots');
const CONVOS = 'C:\\Workspace\\mtask-p360-projects';
const F = 'C:\\Workspace\\mtask-p360-a'; // git이 아닌 새 폴더(신뢰 질문 없음)
const BOARD = 'atrium-dev-p360', PORT = '48105', DEBUG = 9586;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p360-none-',
  ATRIUM_SDK_IDLE_MS: '15000',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger('p360-' + WHAT);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const tryCall = (m, p = {}) => { try { return { ok: true, r: call(m, p) }; } catch (e) { return { ok: false, err: String(e.stdout || e.stderr || e.message).slice(0, 600) }; } };
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)) : '')); };
const list = () => call('session.list');
const byName = (n) => list().find((x) => x.name === n);
const closed = () => call('recall.closed');
const closedBy = (n) => closed().find((x) => x.address === n || x.name === n);
const archived = () => (call('archive.list').workspaces || []).flatMap((w) => w.closed);
const relay = (limit = 100) => call('relay.status', { limit });
const save = (name, v) => fs.writeFileSync(path.join(OUT, '..', name), typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const ids = () => { try { return JSON.parse(fs.readFileSync(path.join(OUT, '..', 'ids.json'), 'utf8')); } catch { return {}; } };
const saveIds = (o) => save('ids.json', { ...ids(), ...o });
// 에이전트 명령 그대로(판이 띄운 세션의 env·토큰 파일): atrium-child.mjs <동사> … 를 그 세션으로 부른다
function agent(sessionId, ...a) {
  // Claude Code 세션의 토큰은 판이 쓴 세션 설정 파일의 env에 있다(값은 출력하지 않는다)
  let tok = '';
  try { tok = JSON.parse(fs.readFileSync(path.join(ENV.ATRIUM_DATA_DIR, 'sessions', `${sessionId}.json`), 'utf8')).env.ATRIUM_SESSION_TOKEN || ''; } catch {}
  const env = { ...process.env, ATRIUM_SESSION_ID: sessionId, ATRIUM_PROFILE: 'dev', ...(tok ? { ATRIUM_SESSION_TOKEN: tok } : {}) };
  try { return { ok: true, out: execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium-child.mjs'), ...a], { encoding: 'utf8', env, timeout: 240000 }) }; }
  catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') + (e.stdout || e.stderr ? '' : e.message) }; }
}
async function readyWait(n, ms = 120000) { await until(() => { const s = byName(n); return s && (s.state === 'ready' || s.state === 'error'); }, ms, 2000).catch(() => log(n + ' ready 기다림 넘김')); return byName(n); }
async function sendWait(name, text, ms = 180000) {
  const before = (byName(name) || {}).lastAnswerAt || 0;
  atrium('send', '@' + name, text);
  await until(() => { const s = byName(name); return s && (s.state === 'ready' || s.state === 'error') && (s.lastAnswerAt || 0) > before; }, ms, 2000).catch(() => log(name + ' 답 기다림 넘김'));
  const s = byName(name);
  return { state: s.state, answer: s.lastAnswer, error: s.error, sdk: s.sdk };
}

async function setup() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
  fs.mkdirSync(F, { recursive: true }); fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p360-a\n');
  call('workspace.open', { path: F, select: true });
  call('settings.set', { key: 'language', value: 'ko' });
  for (const [n, word] of [['lead', 'LIME-3'], ['ea', 'PEAR-5'], ['kb', 'PLUM-8'], ['kd', 'FIG-2']]) {
    if (!byName(n)) call('session.spawn', { cwd: F, model: 'haiku', name: n });
    await readyWait(n);
    // 구독 한도가 바닥이면 답은 billing_error다(대화 기록에는 사람 글이 남아 이어 가기·갈라 열기에 쓴다). 되살리기는 턴 없이도 본다
    if (!(byName(n).lastPrompt)) { const a = await sendWait(n, `Remember the code word ${word}. Reply with only: OK`, 60000); log(`${n}: 첫 턴 ${a.state} ${a.answer || (a.error && a.error.type)}`); }
  }
  const lead = byName('lead');
  if (!byName('w1')) { const r = agent(lead.sessionId, 'child', 'w1', '--model', 'haiku'); log('child w1: ' + r.out.trim().slice(0, 300)); }
  const w1 = await readyWait('w1');
  check('lead의 하위 w1(역할 선)', w1 && (w1.parentSessionId === lead.sessionId), w1 && { parent: w1.parentSessionId });
  saveIds(Object.fromEntries(['lead', 'ea', 'kb', 'kd', 'w1'].map((n) => [n, byName(n).sessionId])));
}

async function states() {
  // (a) 터미널에서 /exit(사람이 직접 끝냄: 노드는 제자리에 "직접 종료")
  if (byName('ea') && byName('ea').state !== 'exited') atrium('send', '@ea', '/exit');
  await until(() => { const s = byName('ea'); return s && s.state === 'exited'; }, 60000, 1500).catch(() => {});
  const ea = byName('ea');
  check('(a) ea: /exit 뒤 제자리에 끝남(exited, user)', ea && ea.state === 'exited', ea && { state: ea.state, exit: ea.exit });
  // (b) 끄고 보관
  if (byName('kb')) call('session.kill', { session: 'kb', confirm: true, after: 'archive' });
  // (c) 끄기(닫힘 목록): 하위가 있는 lead
  if (byName('lead')) call('session.kill', { session: 'lead', confirm: true });
  // (d) 끄고 자동 보관: 보관 기간(기본 14일)이 지난 것처럼 시험 판 DB의 닫힌 때·마지막 활동을 20일 앞으로 옮긴다(설정은 정수 일만 받는다)
  if (byName('kd')) call('session.kill', { session: 'kd', confirm: true });
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path.join(ENV.ATRIUM_DATA_DIR, 'board.db'));
  const back = 20 * 86400000;
  db.prepare("UPDATE sessions SET closed_at = closed_at - ?, runtime = json_set(runtime, '$.lastActivityAt', closed_at - ?) WHERE name = 'kd' AND closed_at IS NOT NULL AND closed_at > ?").run(back, back, Date.now() - back / 2);
  db.close();
  await sleep(1000);
  const arch = archived();
  check('(b) kb는 보관함(손)', arch.some((c) => c.address === 'kb' && c.archive && c.archive.why === 'manual'), arch.map((c) => ({ n: c.address, why: c.archive && c.archive.why })));
  check('(d) kd는 보관함(자동)', arch.some((c) => c.address === 'kd' && c.archive && c.archive.why === 'auto'), arch.map((c) => ({ n: c.address, why: c.archive && c.archive.why })));
  const lc = closedBy('lead');
  check('(c) lead는 닫힘 목록(killed, 다시 열 수 있음)', lc && lc.reason === 'killed' && lc.canReopen, lc && { reason: lc.reason, canReopen: lc.canReopen, nameFree: lc.nameFree });
  const w1 = byName('w1');
  check('w1은 살아 있고 계보 부모는 닫힌 lead', w1 && w1.lineageParentSessionId === ids().lead, w1 && { lineage: w1.lineageParentSessionId, work: w1.parentSessionId });
}

// 창의 사이드바: 워크스페이스의 닫힘 묶음을 펴고 보관함을 연다. 줄마다 단추(data-action)를 읽는다
async function sidebarRows(page) {
  if (!(await page.$('[data-role="sidebar"]'))) await page.keyboard.press('Control+Shift+E');
  await page.waitForSelector('[data-role="sidebar"]', { timeout: 10000 });
  await sleep(1500);
  const extra = await page.$('[data-role="sidebar-rows"] [data-sb="extra"]');
  if (extra && !(await page.$('[data-role="sidebar-rows"] [data-sb="closed"]'))) { await extra.click(); await sleep(800); }
  const toggle = await page.$('[data-role="archive-box"] [data-action="archive-toggle"], [data-role="archive-box"] button');
  if (toggle && !(await page.$('[data-role="archive-box"].open'))) { await toggle.click(); await sleep(1500); }
  return page.evaluate(() => {
    const out = [];
    for (const r of document.querySelectorAll('[data-role="sidebar-rows"] [data-sb="session"], [data-role="sidebar-rows"] [data-sb="closed"], [data-role="archive-box"] [data-sb="archived"]')) {
      out.push({ where: r.dataset.sb, name: r.dataset.name || (r.querySelector('.mt-sb2-name') || {}).textContent || null, acts: [...r.querySelectorAll('[data-action]')].map((b) => b.dataset.action) });
    }
    return out;
  });
}

async function repro() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
  try {
    await sleep(3000);
    const rows = await sidebarRows(page);
    save(`sidebar-${ROUND}.json`, rows);
    log('사이드바 줄: ' + JSON.stringify(rows));
    await page.screenshot({ path: path.join(OUT, `${ROUND}-sidebar.png`) });
    const sb = await page.$('[data-role="sidebar"]');
    if (sb) await sb.screenshot({ path: path.join(OUT, `${ROUND}-sidebar-only.png`) });
  } finally { await closeApp(app); }
}

async function stop() {
  for (const s of list()) { try { atrium('kill', s.name, '--yes'); } catch {} }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop: ' + e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop: ' + e.message.slice(0, 200)); }
}

const STEPS = { setup, states, repro, stop };
const run = STEPS[WHAT];
if (!run) { log('모르는 단계: ' + WHAT); process.exit(2); }
try { await run(); } catch (e) { log('ERROR ' + (e.stack || e.message).slice(0, 2000)); process.exitCode = 1; }
const failed = results.filter((r) => !r.ok);
log(`${WHAT}: ${results.length - failed.length}/${results.length} PASS`);
fs.appendFileSync(path.join(OUT, '..', 'results.jsonl'), results.map((r) => JSON.stringify({ step: WHAT, round: ROUND, ...r })).join('\n') + (results.length ? '\n' : ''));
process.exit(process.exitCode || (failed.length ? 1 : 0));
