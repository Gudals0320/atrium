// P363 창·판 시험: SDK 세션 종류(claude -p stream-json, 판 중계기). 따로 띄운 개발용 판(atrium-dev-p363, 48105, 창 원격 디버깅 9586)만 쓴다.
// 실행: node app/test/e2e/p363-sdk.mjs <setup|key|turns|child|worktree|shots|stop>
// - key: API 키를 환경 변수 ANTHROPIC_API_KEY로 받은 이 프로세스가(사람이 고른 키 관리 도구로 띄운다) 판의 relay.setKey로 한 번 넣는다.
//   값은 읽자마자 환경에서 지우고 어디에도 쓰지 않는다.
// - turns: SDK haiku 두 턴(둘째가 첫째를 기억), 프로세스가 끝난 뒤 다시 보내 이어 감(--resume), 중계기 기록(200, entrypoint), 같은 판의 일반 claude 세션
// - child: SDK 세션이 atrium child <이름> --launcher claude-sdk로 SDK 하위를 띄우고, 하위가 atrium done ok로 닫는다
// - worktree: atrium child … --worktree(claude -p -w)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const KEY = WHAT === 'key' ? String(process.env.ANTHROPIC_API_KEY || '') : '';
delete process.env.ANTHROPIC_API_KEY;
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p363', 'shots');
const CONVOS = 'C:\\Workspace\\mtask-p363-projects';
const F = 'C:\\Workspace\\mtask-p363-a';
const F2 = 'C:\\Workspace\\mtask-p363-b'; // 일반 claude 세션(구독): git이 아닌 폴더(신뢰 질문 없음)
const BOARD = 'atrium-dev-p363', PORT = '48105', DEBUG = 9586;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p363-none-',
  ATRIUM_SDK_IDLE_MS: '20000',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger('p363-' + WHAT);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)) : '')); };
const list = () => call('session.list');
const byName = (n) => list().find((x) => x.name === n);
const relay = (limit = 100) => call('relay.status', { limit });
const save = (name, v) => fs.writeFileSync(path.join(OUT, '..', name), typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const git = (...a) => execFileSync('git', ['-C', F, ...a], { encoding: 'utf8' });

async function setup() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
  fs.mkdirSync(F, { recursive: true });
  if (!fs.existsSync(path.join(F, '.git'))) { fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p363-a\n'); git('init', '-q', '-b', 'main'); git('add', '-A'); git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'init'); }
  call('workspace.open', { path: F, select: true });
  call('settings.set', { key: 'language', value: 'ko' });
  const st = relay();
  check('처음: 키 없음, 중계기 꺼짐', !st.keyPresent && !st.running, st);
  const ls = call('launcher.list');
  const sdk = (ls.launchers || []).find((l) => l.id === 'claude-sdk');
  check('SDK 런처가 목록에 있다(레일 밖), 대화형 API 런처는 없다', sdk && !sdk.favorite && sdk.harness === 'claude-sdk' && !(ls.launchers || []).some((l) => l.id === 'claude-api'), sdk && { name: sdk.name, model: sdk.model, preview: sdk.preview });
  let refused = null;
  try { call('session.spawn', { cwd: F, launcher: 'claude-sdk', name: 'nokey' }); } catch (e) { refused = String(e.stdout || e.message).slice(0, 400); }
  check('키가 없으면 SDK 세션을 띄우지 않는다', refused && /auth_relay_no_key|API 키/.test(refused) && !byName('nokey'), refused);
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

async function sendWait(name, text, ms = 180000) {
  const before = (byName(name) || {}).lastAnswerAt || 0;
  atrium('send', '@' + name, text);
  await until(() => { const s = byName(name); return s && (s.state === 'ready' || s.state === 'error') && (s.lastAnswerAt || 0) > before; }, ms, 2000).catch(() => log(name + ' 답 기다림 넘김'));
  const s = byName(name);
  return { state: s.state, answer: s.lastAnswer, error: s.error, sdk: s.sdk };
}

async function turns() {
  if (process.argv[3] === 'sub') return subOnly();
  if (!byName('sdk1')) call('session.spawn', { cwd: F, launcher: 'claude-sdk', model: 'haiku', effort: 'low', name: 'sdk1' });
  const s0 = byName('sdk1');
  check('SDK 세션: billing sdk, 패널 없음, 바로 쉼(ready)', s0.billing === 'sdk' && !s0.paneId && s0.state === 'ready', { billing: s0.billing, paneId: s0.paneId, state: s0.state });
  const a = await sendWait('sdk1', 'Remember the code word MANGO-7. Reply with only: OK');
  check('첫 턴: 답이 온다', a.state === 'ready' && /OK/i.test(a.answer || ''), a);
  const b = await sendWait('sdk1', 'What code word did I ask you to remember? Reply with only the word.');
  check('둘째 턴이 첫째를 기억한다', /MANGO-7/.test(b.answer || ''), b);
  check('턴 사이에는 같은 프로세스', b.sdk && b.sdk.alive && b.sdk.resume === false, b.sdk);
  await until(() => { const s = byName('sdk1'); return s && s.sdk && !s.sdk.alive; }, 60000, 2000).catch(() => {});
  const idle = byName('sdk1');
  check('쉬면 프로세스가 끝난다(상태는 ready)', idle.sdk && !idle.sdk.alive && idle.state === 'ready', { sdk: idle.sdk, state: idle.state });
  const c = await sendWait('sdk1', 'Say the code word again, only the word.');
  check('프로세스가 끝난 뒤 다시 보내면 --resume으로 이어 간다', /MANGO-7/.test(c.answer || '') && c.sdk && c.sdk.resume === true, c);
  const rec = relay(100).recent || [];
  const mine = rec.filter((r) => r.session === s0.sessionId && /\/v1\/messages/.test(r.path || ''));
  save('relay-recent.json', rec);
  check('중계기 기록: SDK 세션의 /v1/messages 200, entrypoint sdk-cli', mine.length >= 3 && mine.every((r) => r.status === 200) && mine.every((r) => r.ep === 'sdk-cli'), mine.map((r) => ({ status: r.status, ep: r.ep, model: r.model, in: r.in, out: r.out, cacheW: r.cacheW, cacheR: r.cacheR })));
  await subOnly();
}
async function subOnly() {
  // 같은 판의 일반 claude 세션(구독)은 그대로: 터미널에서 돌고 중계기를 지나지 않는다
  const old = byName('sub1'); if (old && old.state === 'trust_wait') { try { atrium('kill', 'sub1', '--yes'); } catch {} await sleep(1500); }
  fs.mkdirSync(F2, { recursive: true }); fs.writeFileSync(path.join(F2, 'README.md'), '# mtask-p363-b\n');
  call('workspace.open', { path: F2 });
  if (!byName('sub1')) call('session.spawn', { cwd: F2, model: 'haiku', name: 'sub1' });
  await until(() => { const s = byName('sub1'); return s && s.state === 'ready'; }, 120000, 2000).catch(() => {});
  const d = await sendWait('sub1', 'Reply with only the word OK.');
  const sub = byName('sub1');
  const subReq = (relay(100).recent || []).filter((r) => r.session === sub.sessionId);
  check('일반 claude 세션은 터미널에서 답하고 중계기를 지나지 않는다', !!sub.paneId && !sub.billing && /OK/i.test(d.answer || '') && subReq.length === 0, { paneId: sub.paneId, billing: sub.billing, answer: d.answer, relay: subReq.length });
}

async function child() {
  const before = (byName('sdk1') || {}).lastAnswerAt || 0;
  const cmd = `atrium child c1 --launcher claude-sdk --model haiku --effort low --prompt 'Run this shell command and nothing else: atrium done ok "c1 says hello from SDK"'`;
  if (!byName('c1')) atrium('send', '@sdk1', 'Run this exact shell command with the Bash tool, then reply with only its last output line:\n' + cmd);
  await until(() => byName('c1'), 120000, 2000).catch(() => {});
  const c1 = byName('c1');
  check('SDK 세션 안에서 atrium child --launcher claude-sdk로 SDK 하위를 띄운다', c1 && c1.billing === 'sdk' && !c1.paneId && c1.model === 'haiku', c1 && { billing: c1.billing, model: c1.model, effort: c1.effort, parent: c1.parentSessionId });
  // 하위가 done ok로 닫으면 판이 그 보고를 부모(sdk1)에게 판 알림으로 가져다준다(판 알림은 lastPrompt가 아니라 대화 기록으로 본다)
  const report = () => (call('delivery.list', { session: byName('sdk1').sessionId, all: true, limit: 30 }) || []).find((d) => d.origin === 'board' && d.status === 'confirmed' && /닫았다: ok/.test(d.text || '') && /\nc1 says hello from SDK/.test(d.text || ''));
  await until(() => report(), 240000, 3000).catch(() => {});
  const rep = report();
  check('하위가 atrium done ok로 닫고 보고가 부모 SDK 세션에 판 알림으로 닿는다', !!rep, rep ? String(rep.text).slice(0, 400) : { c1: byName('c1') && byName('c1').lastAnswer, before });
  await until(() => { const x = byName('sdk1'); return x && x.state === 'ready'; }, 120000, 2000).catch(() => {});
  const ev = (relay(200).recent || []).filter((r) => c1 && r.session === c1.sessionId && /\/v1\//.test(r.path || ''));
  check('하위의 요청도 중계기(entrypoint sdk-cli)', ev.length >= 1 && ev.every((r) => r.ep === 'sdk-cli' && r.status === 200), ev.length);
}

async function worktree() {
  if (!byName('w1')) atrium('send', '@sdk1', "Run this exact shell command with the Bash tool, then reply with only its last output line:\natrium child w1 --launcher claude-sdk --model haiku --effort low --worktree p363w --prompt 'Run: git branch --show-current and then run: atrium done ok \"w1 on branch <that output>\"'");
  await until(() => byName('w1'), 120000, 2000).catch(() => {});
  const report = () => (call('delivery.list', { session: byName('sdk1').sessionId, all: true, limit: 30 }) || []).find((d) => d.origin === 'board' && d.status === 'confirmed' && /@w1/.test(d.text || '') && /닫았다: ok/.test(d.text || ''));
  await until(() => report() || (byName('w1') && byName('w1').state === 'error'), 240000, 3000).catch(() => {});
  const w = byName('w1'); const p = { lastPrompt: (report() || {}).text || '' };
  save('worktree.json', { w1: w && { state: w.state, error: w.error, cwdNow: w.cwdNow, git: w.git }, parentPrompt: p.lastPrompt });
  check('SDK 하위 --worktree(claude -p -w): 워크트리 브랜치에서 돌고 done', w && w.git && w.git.branch === 'worktree-p363w' && w.git.isWorktree && !!report(), w && { state: w.state, error: w.error, cwdNow: w.cwdNow, branch: w.git && w.git.branch, parentPrompt: (p.lastPrompt || '').slice(0, 300) });
}

async function shots() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
  try {
    await page.setViewportSize?.({ width: 1500, height: 940 }).catch(() => {});
    await sleep(3000);
    // SDK 노드: 고르고 가까이(대화 보기 + 입력칸)
    const sid = byName('sdk1').sessionId;
    await page.evaluate((id) => { const st = window.__mt; if (st && st.focusSession) st.focusSession(id); }, sid).catch(() => {});
    await page.click(`[data-session="${sid}"] .mt-node-head, [data-session="${sid}"]`).catch(() => {});
    await sleep(2500);
    const face = await page.$eval(`[data-session="${sid}"]`, (e) => ({ face: e.dataset.face, sdkFace: !!e.querySelector('[data-role=sdk-face]'), input: !!e.querySelector('[data-role=sdk-text]'), tag: !!e.querySelector('[data-role=sdk-tag]'), term: !!e.querySelector('[data-role=term-slot]') })).catch((e) => ({ err: String(e).slice(0, 200) }));
    check('SDK 노드: SDK 표시, 터미널 대신 대화 보기와 입력칸', face.tag && !face.term && (face.face !== 'close' || (face.sdkFace && face.input)), face);
    await page.screenshot({ path: path.join(OUT, '1-canvas.png') });
    const node = await page.$(`[data-session="${sid}"]`);
    if (node) await node.screenshot({ path: path.join(OUT, '2-sdk-node.png') });
    // 세션 맵 카드
    await page.click('[data-role=sessions-pill]').catch(() => {});
    await sleep(2000);
    const mapTags = await page.$$eval('[data-role=ta-sdk]', (els) => els.length);
    check('세션 맵 카드에 SDK 표시', mapTags >= 1, { mapTags });
    await page.screenshot({ path: path.join(OUT, '3-session-map.png') });
    await page.keyboard.press('Escape'); await sleep(800);
    // 설정 › 런처
    if (!(await page.$('[data-role="settings"]'))) await page.click('[data-role="top-right"] [data-action="settings-open"]');
    await page.waitForSelector('[data-role="settings-tabs"]', { timeout: 8000 });
    await page.click('[data-role="settings-tabs"] [data-tab="launchers"]').catch(() => {});
    await sleep(1200);
    const row = await page.$eval('[data-launcher=claude-sdk]', (e) => e.textContent).catch(() => '');
    check('런처 목록에 Claude Code SDK와 SDK 표시', /Claude Code SDK/.test(row) && /SDK/.test(row), row.slice(0, 200));
    const s = await page.$('[data-role="settings"]');
    if (s) await s.screenshot({ path: path.join(OUT, '4-settings-launchers.png') });
  } finally { await closeApp(app); }
}

async function stop() {
  for (const s of list()) { try { atrium('kill', s.name, '--yes'); } catch {} }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop: ' + e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop: ' + e.message.slice(0, 200)); }
}

const run = { setup, key, turns, child, worktree, shots, stop }[WHAT];
if (!run) { log('모르는 단계: ' + WHAT); process.exit(2); }
try { await run(); } catch (e) { log('ERROR ' + (e.stack || e.message).slice(0, 2000)); process.exitCode = 1; }
const failed = results.filter((r) => !r.ok);
log(`${WHAT}: ${results.length - failed.length}/${results.length} PASS`);
fs.appendFileSync(path.join(OUT, '..', 'results.jsonl'), results.map((r) => JSON.stringify({ step: WHAT, ...r })).join('\n') + (results.length ? '\n' : ''));
process.exit(process.exitCode || (failed.length ? 1 : 0));
