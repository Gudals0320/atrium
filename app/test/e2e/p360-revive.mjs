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
  // 사람이 터미널에서 끝내는 것처럼 입력 칸에 Ctrl+C 두 번(SessionEnd prompt_input_exit, /exit와 같은 길). 판 전달로 /exit를 보내면 확인되지 않은 전달이 다시 열 때 또 들어간다
  if (byName('ea') && byName('ea').state !== 'exited') { call('session.keys', { session: 'ea', keys: ['ctrl+c'] }); await sleep(400); call('session.keys', { session: 'ea', keys: ['ctrl+c'] }); }
  await until(() => { const s = byName('ea'); return s && s.state === 'exited'; }, 60000, 1500).catch(() => {});
  const ea = byName('ea');
  check('(a) ea: 터미널에서 끝냄(Ctrl+C 두 번) 뒤 제자리에 끝남(exited, user)', ea && ea.state === 'exited', ea && { state: ea.state, exit: ea.exit });
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
  await until(() => { const c = closedBy('lead'); return c && c.canReopen; }, 45000, 2000).catch(() => {}); // 방금 끈 대화는 30초 동안 묶였을 수 있음으로 본다
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

// 되살린 뒤의 확인: 네 세션이 판에 있고, lead는 같은 세션 ID·하위 w1과의 역할 선(워커)을 되찾았다
function afterRevive(how) {
  const I = ids();
  for (const n of ['ea', 'kb', 'kd', 'lead']) {
    const s = byName(n);
    check(`${how}: ${n} 되살아남(같은 세션 ID, 상태 ${s && s.state})`, s && s.sessionId === I[n] && s.state !== 'exited', s && { id: s.sessionId === I[n], state: s.state });
  }
  const links = call('link.list');
  const l = links.find((x) => x.from === I.lead && x.to === I.w1);
  check(`${how}: lead → w1 역할 선(워커)이 돌아왔다`, l && l.role, l && { role: l.role });
  const w1 = byName('w1');
  check(`${how}: w1의 일 부모는 lead`, w1 && w1.parentSessionId === I.lead, w1 && { work: w1.parentSessionId });
  check(`${how}: 보관함이 비었다`, archived().length === 0, archived().map((c) => c.address));
}

async function human() {
  // 방금 끈 세션의 대화 기록은 30초 동안 "다른 곳에서 쓰는 중일 수 있음"(convos.mjs RECENT_WRITE_MS)이라 다시 열기 단추를 숨긴다. 지나기를 기다린다
  await until(() => archived().every((c) => !(c.binding && c.binding.bound)) && closed().every((c) => !(c.binding && c.binding.bound)), 60000, 2000).catch(() => log('묶임 표시가 남음'));
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
  try {
    await page.setViewportSize?.({ width: 1500, height: 940 }).catch(() => {});
    await sleep(3000);
    const rows = await sidebarRows(page);
    save('sidebar-after.json', rows);
    const acts = (where, n) => (rows.find((r) => r.where === where && r.name === n) || {}).acts || [];
    check('사이드바: 끝난 ea 줄에 다시 열기', acts('session', 'ea').includes('reopen-session'), acts('session', 'ea'));
    check('사이드바: 닫힌 lead 줄에 늘 보이는 다시 열기와 SDK로 갈라 열기', acts('closed', 'lead').includes('reopen-closed') && acts('closed', 'lead').includes('fork-sdk'), acts('closed', 'lead'));
    check('사이드바: 보관함 kb·kd 줄에 다시 열기, SDK로 갈라 열기, 복원', ['kb', 'kd'].every((n) => ['reopen-archived', 'fork-sdk', 'restore'].every((a) => acts('archived', n).includes(a))), { kb: acts('archived', 'kb'), kd: acts('archived', 'kd') });
    const forkOff = await page.$eval('[data-role="archive-box"] [data-sb="archived"] [data-action="fork-sdk"]', (b) => ({ off: b.getAttribute('aria-disabled'), title: b.title })).catch(() => null);
    log('보관함 갈라 열기 단추: ' + JSON.stringify(forkOff));
    const sb = await page.$('[data-role="sidebar"]');
    if (sb) await sb.screenshot({ path: path.join(OUT, '1-sidebar-reopen.png') });
    // 한 번 눌러 되살리기: (a) 끝난 줄, (c) 닫힌 줄, (b)(d) 보관함 줄
    const click = async (sel) => {
      for (let i = 0; i < 20; i++) { // 가상 목록: 줄이 다시 그려지면 다시 찾는다. 펼침이 접혔으면 다시 편다
        const el = (await page.$(sel)) || (await page.$(sel.replace('[data-action="reopen-closed"]', '[data-action="reopen"]')));
        if (el && i > 0 && sel.includes('reopen-closed')) { const row = await page.$('[data-role="sidebar-rows"] [data-sb="closed"][data-name="lead"]'); if (row) { await row.hover().catch(() => {}); const b2 = await page.$('[data-role="sidebar-rows"] [data-sb="closed"][data-name="lead"] .mt-sb2-acts [data-action="reopen"]'); if (b2 && (await b2.click({ timeout: 3000 }).then(() => true, () => false))) return true; } }
        if (el) { await el.scrollIntoViewIfNeeded().catch(() => {}); const ok = await el.click({ timeout: 3000 }).then(() => true, (e) => { if (i === 0) log('누르기 실패: ' + e.message.split(/\r?\n/).slice(0, 6).join(' | ').slice(0, 600)); return false; }); if (ok) return true; }
        const extra = await page.$('[data-role="sidebar-rows"] [data-sb="extra"]');
        if (extra && !(await page.$('[data-role="sidebar-rows"] [data-sb="closed"]'))) await extra.click().catch(() => {});
        await sleep(500);
      }
      log('못 누름: ' + sel); await page.screenshot({ path: path.join(OUT, 'debug-click.png') }); return false;
    };
    await click('[data-role="sidebar-rows"] [data-sb="session"][data-name="ea"] [data-action="reopen-session"]');
    await until(() => { const s = byName('ea'); return s && s.state !== 'exited'; }, 60000, 1000).catch(() => {});
    await click('[data-role="sidebar-rows"] [data-sb="closed"][data-name="lead"] [data-action="reopen-closed"]');
    await until(() => byName('lead'), 60000, 1000).catch(() => {});
    for (const n of ['kb', 'kd']) {
      await sleep(1500);
      await click(`[data-role="archive-box"] [data-sb="archived"][data-name="${n}"] [data-action="reopen-archived"]`);
      await until(() => byName(n), 60000, 1000).catch(() => {});
    }
    await sleep(4000);
    afterRevive('창');
    const toasts = await page.$$eval('.mt-toast, [data-role="toast"]', (els) => els.map((e) => e.textContent)).catch(() => []);
    log('토스트: ' + JSON.stringify(toasts));
    await page.screenshot({ path: path.join(OUT, '2-revived-canvas.png') });
  } finally { await closeApp(app); }
}

async function agentStep() {
  const I = ids();
  const w1 = I.w1;
  const self = agent(w1, 'revive', 'w1');
  check('atrium revive: 살아 있는 세션은 거절하고 이름을 돌려준다', !self.ok && /alive/.test(self.out) && /@w1/.test(self.out), self.out.trim().slice(0, 300));
  const none = agent(w1, 'revive', 'nobody-here');
  check('atrium revive: 없는 이름은 not_found', !none.ok && /not_found/.test(none.out), none.out.trim().slice(0, 200));
  for (const n of ['ea', 'kb', 'kd', 'lead']) {
    const r = agent(w1, 'revive', n);
    log(`revive ${n}: ${r.out.trim().slice(0, 600)}`);
    check(`atrium revive ${n}`, r.ok && new RegExp(`@${n}:`).test(r.out), r.out.trim().split('\n')[0]);
    if (n === 'lead') check('atrium revive lead: 되찾은 관계에 하위 @w1', /하위 @w1/.test(r.out) && /역할 선/.test(r.out), r.out.trim().split('\n').slice(1, 3).join(' / '));
  }
  await sleep(3000);
  afterRevive('atrium revive');
  const raw = agent(w1, 'revive', 'lead', '--json');
  check('atrium revive --json: 살아 있으면 error.code alive', !raw.ok && /"alive"/.test(raw.out), raw.out.slice(0, 200));
}

async function key() {
  if (!KEY) { log('ANTHROPIC_API_KEY 없음(키 관리 도구로 띄우세요)'); process.exitCode = 2; return; }
  const { ApiClient } = await import('file:///' + path.join(REPO, 'backend', 'src', 'client.mjs').replace(/\\/g, '/'));
  const info = JSON.parse(fs.readFileSync(path.join(ENV.ATRIUM_DATA_DIR, 'backend.json'), 'utf8'));
  const c = new ApiClient(info); await c.open();
  try {
    const r = await c.call('relay.setKey', { key: KEY });
    check('relay.setKey 답에 값이 없다', r && r.keyPresent === true && !JSON.stringify(r).includes(KEY), r);
  } finally { c.close(); }
}

async function fork() {
  const I = ids();
  const before = byName('lead');
  const txBefore = (() => { try { return fs.statSync(path.join(process.env.USERPROFILE, '.claude', 'projects', 'C--Workspace-mtask-p360-a', `${I.lead}.jsonl`)).size; } catch { return null; } })();
  const r = agent(I.w1, 'fork', 'lead', '--launcher', 'claude-sdk');
  log('fork: ' + r.out.trim());
  check('atrium fork lead --launcher claude-sdk', r.ok && /갈라 열었다/.test(r.out) && /API 크레딧/.test(r.out) && /토큰/.test(r.out) && /캐시에 새로 쓴다/.test(r.out), r.out.trim().split('\n')[0]);
  const f = byName('lead-fork');
  check('갈라 연 세션: SDK(billing sdk), 패널 없음, 원래 세션 계보 표, 독립', f && f.billing === 'sdk' && !f.paneId && f.forkFrom && f.forkFrom.sessionId === I.lead && !f.parentSessionId, f && { billing: f.billing, model: f.model, effort: f.effort, forkFrom: f.forkFrom, parent: f.parentSessionId });
  saveIds({ fork: f && f.sessionId });
  const a = await sendWait('lead-fork', 'Earlier in this conversation I asked you to remember a code word. Reply with only that word.', 180000);
  check('갈라 연 SDK 세션이 원래 대화를 기억한다(LIME-3)', /LIME-3/.test(a.answer || ''), a);
  const rec = (relay(200).recent || []).filter((x) => f && x.session === f.sessionId && /\/v1\/messages/.test(x.path || ''));
  save('relay-fork.json', rec);
  check('중계기 기록: 갈라 연 세션의 /v1/messages 200, entrypoint sdk-cli', rec.length >= 1 && rec.every((x) => x.status === 200 && x.ep === 'sdk-cli'), rec.map((x) => ({ status: x.status, ep: x.ep, model: x.model, in: x.in, out: x.out, cacheW: x.cacheW, cacheR: x.cacheR })));
  const ev = call('session.events', { session: 'lead-fork' }).filter((e) => e.kind === 'sdk_start');
  const argv = ev[0] && ev[0].data.args;
  check('첫 프로세스: --resume <lead> --fork-session --session-id <새 ID>', argv && argv.includes('--fork-session') && argv[argv.indexOf('--resume') + 1] === I.lead.toLowerCase() && argv[argv.indexOf('--session-id') + 1] === f.sessionId, argv && argv.slice(5, 12));
  const after = byName('lead');
  const txAfter = (() => { try { return fs.statSync(path.join(process.env.USERPROFILE, '.claude', 'projects', 'C--Workspace-mtask-p360-a', `${I.lead}.jsonl`)).size; } catch { return null; } })();
  check('원래 세션 lead는 그대로(같은 상태, 대화 기록 크기 그대로)', after && after.sessionId === I.lead && after.state === before.state && txAfter === txBefore, { before: before.state, after: after && after.state, txBefore, txAfter });
}

async function sdkreopen() {
  const I = ids();
  await until(() => { const s = byName('lead-fork'); return s && s.sdk && !s.sdk.alive; }, 60000, 2000).catch(() => {});
  call('session.kill', { session: 'lead-fork', confirm: true });
  check('갈라 연 SDK 세션을 닫았다', !byName('lead-fork') && !!closedBy('lead-fork'));
  const r = agent(I.w1, 'revive', 'lead-fork');
  log('revive lead-fork: ' + r.out.trim());
  const s = byName('lead-fork');
  check('닫은 SDK 세션도 atrium revive로 다시 열린다(같은 세션 ID, SDK)', r.ok && s && s.sessionId === I.fork && s.billing === 'sdk' && !s.paneId, s && { id: s.sessionId === I.fork, billing: s.billing });
  const a = await sendWait('lead-fork', 'Say the same code word again, only the word.', 180000);
  check('다시 연 SDK 세션이 --resume으로 대화를 잇는다', /LIME-3/.test(a.answer || '') && a.sdk && a.sdk.resume === true, a);
}

async function shots() {
  // 그림용 상태: ea 끝남, kd 닫힘, kb 보관. lead와 lead-fork는 살아 있다
  if (byName('ea') && byName('ea').state !== 'exited') { call('session.keys', { session: 'ea', keys: ['ctrl+c'] }); await sleep(400); call('session.keys', { session: 'ea', keys: ['ctrl+c'] }); }
  if (byName('kb')) call('session.kill', { session: 'kb', confirm: true, after: 'archive' });
  if (byName('kd')) call('session.kill', { session: 'kd', confirm: true });
  await until(() => archived().every((c) => !(c.binding && c.binding.bound)) && closed().every((c) => !(c.binding && c.binding.bound)), 60000, 2000).catch(() => {});
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
  try {
    await page.setViewportSize?.({ width: 1500, height: 940 }).catch(() => {});
    await sleep(3500);
    const I = ids();
    const rows = await sidebarRows(page);
    const fk = rows.filter((r) => r.acts.includes('fork-sdk')).length;
    const on = await page.$$eval('[data-action="fork-sdk"]', (bs) => bs.map((b) => b.getAttribute('aria-disabled'))).catch(() => []);
    check('사이드바: 닫힘·보관함 줄에 다시 열기와 SDK로 갈라 열기(키가 있어 흐리지 않음)', fk >= 2 && on.every((x) => x === 'false'), { rows, on });
    const sb = await page.$('[data-role="sidebar"]');
    if (sb) await sb.screenshot({ path: path.join(OUT, '1-sidebar-reopen-fork.png') });
    const closedRow = await page.$('[data-role="sidebar-rows"] [data-sb="closed"]');
    if (closedRow) { await closedRow.hover().catch(() => {}); await sleep(400); if (sb) await sb.screenshot({ path: path.join(OUT, '2-sidebar-closed-hover.png') }); }
    await page.keyboard.press('Control+Shift+E').catch(() => {}); await sleep(800);
    // 노드 메뉴의 SDK로 갈라 열기(lead)
    await page.evaluate((id) => { const st = window.__mt && window.__mt.getState(); if (st && st.navigateTo) st.navigateTo(id, { viewOnly: true }); }, I.lead).catch(() => {});
    await sleep(2500);
    await page.click(`[data-session="${I.lead}"] [data-action="node-menu"]`).catch((e) => log('menu: ' + e.message.slice(0, 120)));
    await sleep(800);
    const row = await page.$eval('[data-role="node-menu"] [data-role="fork-sdk-row"]', (e) => ({ text: e.textContent, off: e.querySelector('button').getAttribute('aria-disabled'), title: e.querySelector('button').title })).catch(() => null);
    check('노드 메뉴에 SDK로 갈라 열기(키가 있으면 흐리지 않음)', row && /SDK/.test(row.text) && row.off === 'false', row);
    const menu = await page.$('[data-role="node-menu"]');
    if (menu) await menu.screenshot({ path: path.join(OUT, '3-node-menu-fork.png') });
    await page.screenshot({ path: path.join(OUT, '3b-node-menu-full.png') });
    await page.keyboard.press('Escape'); await page.click(`[data-session="${I.lead}"] [data-action="node-menu"]`).catch(() => {}); await sleep(500);
    // 갈라 연 노드와 계보 선: 둘이 보이게 맞춘다
    if (I.fork && byName('lead-fork')) {
      await page.evaluate((id) => { const st = window.__mt && window.__mt.getState(); if (st && st.navigateTo) st.navigateTo(id, { viewOnly: true }); }, I.fork).catch(() => {});
      await sleep(1500);
      await page.mouse.move(900, 450); await page.mouse.wheel(0, 500); // 조금 멀리(원래 노드와 선이 함께 보이게)
      await sleep(2500);
      const line = await page.$$eval('[data-role="fork-line"]', (els) => els.map((e) => e.textContent)).catch(() => []);
      const edge = await page.$$eval('.mt-edge.fork', (els) => els.length).catch(() => 0);
      const tag = await page.$eval(`[data-session="${I.fork}"] [data-role="sdk-tag"]`, () => true).catch(() => false);
      check('갈라 연 노드: SDK 표시와 옅은 "갈라 옴" 계보 선', tag && edge >= 1, { tag, edge, line });
      await page.screenshot({ path: path.join(OUT, '4-fork-node-line.png') });
    }
  } finally { await closeApp(app); }
}

async function canvasshot() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
  try {
    await page.setViewportSize?.({ width: 1500, height: 940 }).catch(() => {});
    await sleep(3500);
    const fit = page.getByRole('button', { name: '전체 보기' });
    await fit.click({ timeout: 5000 }).catch((e) => log('전체 보기: ' + e.message.slice(0, 100)));
    await sleep(2500);
    const edge = await page.$$eval('.mt-edge.fork', (els) => els.length).catch(() => 0);
    const line = await page.$$eval('[data-role="fork-line"]', (els) => els.map((e) => e.textContent)).catch(() => []);
    const I = ids();
    const geo = await page.evaluate(({ lead, w1, fork }) => {
      const r = (id) => { const e = document.querySelector(`.react-flow__node[data-id="${id}"]`); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
      const p = document.querySelector('.mt-edge.fork'); const d = p ? p.getAttribute('d') : null;
      const g = p ? p.closest('g.react-flow__edge') : null;
      const pt = p ? (() => { const a = p.getPointAtLength(0), z = p.getPointAtLength(p.getTotalLength()); const m = p.getScreenCTM(); const f = (q) => ({ x: Math.round(q.x * m.a + m.e), y: Math.round(q.y * m.d + m.f) }); return { start: f(a), end: f(z) }; })() : null;
      return { lead: r(lead), w1: r(w1), fork: r(fork), d, pt, edgeId: g ? g.getAttribute('data-id') || g.getAttribute('data-testid') : null };
    }, { lead: I.lead, w1: I.w1, fork: I.fork }).catch((e) => ({ err: String(e).slice(0, 200) }));
    log('선 좌표: ' + JSON.stringify(geo));
    const inside = (p, r) => p && r && p.x >= r.x - 12 && p.x <= r.x + r.w + 12 && p.y >= r.y - 12 && p.y <= r.y + r.h + 12;
    check('계보 선은 lead에서 시작해 lead-fork에 닿는다', geo.pt && inside(geo.pt.start, geo.lead) && inside(geo.pt.end, geo.fork), geo);
    check('전체 보기: 원래 노드와 갈라 연 노드 사이 "갈라 옴" 선', edge >= 1, { edge, line });
    const ends = await page.$$eval('[data-role="fork-end"]', (els) => els.length).catch(() => 0);
    check('계보 선 양 끝 점', ends === 2, { ends });
    await page.screenshot({ path: path.join(OUT, '5-fork-line-overview.png') });
    // 사이드바: 닫힌 세션만 있는 묶음은 머리줄 하나("닫힌 세션 n"가 두 번 나오지 않는다), 보관함 복원 단추의 제목
    if (!(await page.$('[data-role="sidebar"]'))) await page.keyboard.press('Control+Shift+E');
    await page.waitForSelector('[data-role="sidebar"]', { timeout: 10000 }).catch(() => {});
    await sleep(1200);
    const extra = await page.$('[data-role="sidebar-rows"] [data-sb="extra"]');
    if (extra && !(await page.$('[data-role="sidebar-rows"] [data-sb="closed"]'))) { await extra.click(); await sleep(800); }
    const toggle = await page.$('[data-role="archive-box"] button');
    if (toggle && !(await page.$('[data-role="archive-box"].open'))) { await toggle.click(); await sleep(1500); }
    const side = await page.evaluate(() => ({ secs: [...document.querySelectorAll('[data-role="sidebar-rows"] .mt-sb2-row.sec')].map((e) => e.textContent), extra: [...document.querySelectorAll('[data-role="sidebar-rows"] [data-sb="extra"]')].map((e) => e.textContent), restore: [...document.querySelectorAll('[data-role="archive-box"] [data-action="restore"]')].map((b) => b.title) }));
    check('사이드바: 닫힌 세션 묶음 이름은 한 번(같은 글의 아래 머리줄 없음)', side.extra.length >= 1 && side.secs.length === 0, side);
    check('보관함 복원 단추 제목: 시작하지 않고 닫힌 목록으로', side.restore.length >= 1 && side.restore.every((x) => /시작하지 않고 닫힌 세션 목록/.test(x)), side.restore);
    const sb = await page.$('[data-role="sidebar"]');
    if (sb) await sb.screenshot({ path: path.join(OUT, '6-sidebar-after-fixes.png') });
  } finally { await closeApp(app); }
}

async function stop() {
  for (const s of list()) { try { atrium('kill', s.name, '--yes'); } catch {} }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop: ' + e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop: ' + e.message.slice(0, 200)); }
}

const STEPS = { setup, states, repro, human, agent: agentStep, key, fork, sdkreopen, shots, canvasshot, stop };
const run = STEPS[WHAT];
if (!run) { log('모르는 단계: ' + WHAT); process.exit(2); }
try { await run(); } catch (e) { log('ERROR ' + (e.stack || e.message).slice(0, 2000)); process.exitCode = 1; }
const failed = results.filter((r) => !r.ok);
log(`${WHAT}: ${results.length - failed.length}/${results.length} PASS`);
fs.appendFileSync(path.join(OUT, '..', 'results.jsonl'), results.map((r) => JSON.stringify({ step: WHAT, round: ROUND, ...r })).join('\n') + (results.length ? '\n' : ''));
process.exit(process.exitCode || (failed.length ? 1 : 0));
