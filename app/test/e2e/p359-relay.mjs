// P359 창·판 시험: API 런처 "Claude Code (API)"와 판 중계기. 따로 띄운 개발용 판(atrium-dev-p359, 48104, 창 원격 디버깅 9585)만 쓴다.
// 실행: node app/test/e2e/p359-relay.mjs <setup|key|turns|shots|stoptest|stop>
// - key: API 키를 환경 변수 ANTHROPIC_API_KEY로 받은 이 프로세스가(사람이 고른 키 관리 도구로 띄운다) 판의 relay.setKey로 한 번 넣는다.
//   값은 읽자마자 환경에서 지우고 어디에도 쓰지 않는다. 판에 남는 것은 OS 보호 저장소 암호문뿐이다.
// - turns: API 세션(haiku)과 일반 세션(haiku)에 한 턴씩, sonnet·opus API 세션에 한 턴씩, /status 화면, 프로세스의 바깥 연결
// - stoptest: 중계기를 끄면 API 세션만 오류
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
// 키는 읽자마자 환경에서 뺀다(뒤에 띄우는 어떤 자식에게도 가지 않게)
const KEY = WHAT === 'key' ? String(process.env.ANTHROPIC_API_KEY || '') : '';
delete process.env.ANTHROPIC_API_KEY;
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p359', 'shots');
const CONVOS = 'C:\\Workspace\\mtask-p359-projects';
const F = 'C:\\Workspace\\mtask-p359-a';
const BOARD = 'atrium-dev-p359', PORT = '48104', DEBUG = 9585;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p359-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger('p359-' + WHAT);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)) : '')); };
const list = () => call('session.list');
const byName = (n) => list().find((x) => x.name === n);
const relay = (limit = 100) => call('relay.status', { limit });
const ready = (n, ms = 120000) => until(() => { const s = byName(n); return s && s.state === 'ready'; }, ms, 2000);
const save = (name, v) => fs.writeFileSync(path.join(OUT, '..', name), typeof v === 'string' ? v : JSON.stringify(v, null, 2));

async function setup() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
  fs.mkdirSync(F, { recursive: true }); fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p359-a\n');
  call('workspace.open', { path: F, select: true });
  call('settings.set', { key: 'language', value: 'ko' });
  const st = relay();
  check('처음: 키 없음, 중계기 꺼짐', !st.keyPresent && !st.running, st);
  const ls = call('launcher.list');
  const api = (ls.launchers || []).find((l) => l.id === 'claude-api');
  check('API 런처가 목록에 있다(레일 밖)', api && !api.favorite && api.env.ANTHROPIC_BASE_URL === '{{authRelay}}', api && { name: api.name, model: api.model, env: api.env });
  let refused = null;
  try { call('session.spawn', { cwd: F, launcher: 'claude-api', name: 'nokey' }); } catch (e) { refused = String(e.stdout || e.message).slice(0, 400); }
  check('키가 없으면 API 세션을 띄우지 않는다', refused && /auth_relay_no_key|API 키/.test(refused) && !byName('nokey'), refused);
}

async function key() {
  if (!KEY) { log('ANTHROPIC_API_KEY 없음(키 관리 도구로 띄우세요)'); process.exitCode = 2; return; }
  const { ApiClient } = await import('file:///' + path.join(REPO, 'backend', 'src', 'client.mjs').replace(/\\/g, '/'));
  const info = JSON.parse(fs.readFileSync(path.join(ENV.ATRIUM_DATA_DIR, 'backend.json'), 'utf8'));
  const c = new ApiClient(info); await c.open();
  try {
    const r = await c.call('relay.setKey', { key: KEY });
    check('relay.setKey 답에 값이 없다', r && r.keyPresent === true && !JSON.stringify(r).includes(KEY), r);
    const st = await c.call('relay.status', {});
    check('relay.status에 값이 없다', !JSON.stringify(st).includes(KEY), { keyPresent: st.keyPresent });
  } finally { c.close(); }
  const ct = fs.readFileSync(path.join(ENV.ATRIUM_DATA_DIR, 'auth-relay', 'key.bin'), 'utf8');
  check('디스크에는 암호문만', !ct.includes(KEY) && ct.length > 100, { len: ct.length });
  // 판 데이터 폴더 전체에 평문이 없다
  const hits = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { try { if (fs.statSync(p).size < 50e6 && fs.readFileSync(p).includes(Buffer.from(KEY))) hits.push(path.relative(DEV, p)); } catch {} } } };
  walk(DEV);
  check('개발용 판 폴더(데이터·로그·창) 어디에도 평문 키 없음', hits.length === 0, hits);
}

// claude 프로세스(명령줄에 세션 ID)와 그 바깥 연결
function claudeConns(ids) {
  const ps = `$ids=@('${ids.join("','")}'); Get-CimInstance Win32_Process -Filter "Name='claude.exe' or Name='node.exe'" | Where-Object { $c=$_.CommandLine; $ids | Where-Object { $c -like "*$_*" } } | ForEach-Object { $p=$_.ProcessId; $sid=($ids | Where-Object { $c -like "*$_*" })[0]; Get-NetTCPConnection -OwningProcess $p -State Established -ErrorAction SilentlyContinue | ForEach-Object { "$sid $p $($_.RemoteAddress):$($_.RemotePort)" } }`;
  try { return execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', ps], { encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PSMODULEPATH')), timeout: 60000 }).trim().split(/\r?\n/).filter(Boolean); } catch (e) { return ['error ' + e.message.slice(0, 100)]; }
}

async function turn(name, text = 'Reply with only the word OK.') {
  const before = (byName(name) || {}).lastAnswerAt || 0;
  atrium('send', '@' + name, text);
  await until(() => { const s = byName(name); return s && s.state === 'ready' && (s.lastAnswerAt || 0) > before; }, 180000, 3000).catch(() => log(name + ' 답 기다림 넘김'));
  const s = byName(name);
  return { state: s.state, answer: s.lastAnswer, error: s.error };
}

async function viaAgent() {
  // 판의 에이전트(구독 haiku sub1)가 atrium models, atrium child --launcher를 부른다(에이전트가 보는 그대로)
  const a = await turn('sub1', 'Run the shell command `atrium models` and reply with only the output line that mentions "Claude Code (API)".');
  save('agent-models.txt', a.answer || '');
  check('atrium models에 API 런처', /Claude Code \(API\)/.test(a.answer || ''), (a.answer || '').slice(0, 400));
  const b = await turn('sub1', 'Run the shell command `atrium child apich --launcher claude-api` (no prompt) and reply with only its last output line.');
  save('agent-child.txt', b.answer || '');
  await until(() => !!byName('apich'), 60000, 2000).catch(() => {});
  const s = byName('apich');
  check('atrium child --launcher claude-api로 띄운다(billing api)', s && s.billing === 'api', { found: !!s, billing: s && s.billing, answer: (b.answer || '').slice(0, 300) });
}

async function turns() {
  const have = new Set(list().map((x) => x.name));
  if (!have.has('api1')) call('session.spawn', { cwd: F, launcher: 'claude-api', model: 'haiku', name: 'api1' });
  if (!have.has('sub1')) call('session.spawn', { cwd: F, launcher: 'claude', model: 'haiku', name: 'sub1' });
  await ready('api1'); await ready('sub1');
  const ids = { api1: byName('api1').sessionId, sub1: byName('sub1').sessionId };
  check('API 세션은 billing api, 일반 세션은 없음', byName('api1').billing === 'api' && !byName('sub1').billing, { api1: byName('api1').billing, sub1: byName('sub1').billing });
  const a = await turn('api1');
  const recA = relay().recent.filter((r) => r.session === ids.api1);
  check('API haiku 한 턴: 답이 오고 중계기 기록에 200·토큰 수', a.answer && recA.some((r) => r.status === 200 && r.out > 0), { answer: a.answer, recs: recA.map((r) => ({ path: r.path, status: r.status, model: r.model, in: r.in, out: r.out, cacheW: r.cacheW, cacheR: r.cacheR })) });
  const n0 = relay().requests;
  const b = await turn('sub1');
  const recB = relay().recent.filter((r) => r.session === ids.sub1);
  check('일반 claude 세션은 중계기를 지나지 않는다(그 세션 ID의 기록 0)', b.answer && recB.length === 0, { answer: b.answer, relayed: recB.length, otherRelayed: relay().requests - n0 });
  await viaAgent();
  // /status 화면
  atrium('input', 'api1', '/status\\r'); await sleep(5000);
  const scr = atrium('screen', 'api1', '--text');
  save('status-screen.txt', scr);
  atrium('input', 'api1', '\\e'); await sleep(1500);
  log('/status 화면 저장: experiments/p359/status-screen.txt');
  // 바깥 연결(중계기를 우회하는 연결이 있는지): claude 프로세스의 TCP 연결
  const conns = claudeConns([ids.api1, ids.sub1]);
  save('conns.txt', conns.join('\n'));
  log('연결: ' + conns.join(' | '));
  // sonnet·opus 한 턴씩
  for (const [n, m] of [['api2', 'sonnet'], ['api3', 'opus']]) {
    if (!byName(n)) call('session.spawn', { cwd: F, launcher: 'claude-api', model: m, name: n });
    await ready(n);
    const r = await turn(n);
    const sid = byName(n).sessionId;
    const recs = relay().recent.filter((x) => x.session === sid);
    check(`API ${m} 한 턴`, r.answer && recs.some((x) => x.status === 200), { answer: r.answer, recs: recs.map((x) => ({ status: x.status, model: x.model, in: x.in, out: x.out, cacheW: x.cacheW, cacheR: x.cacheR, err: x.errType || x.err })) });
  }
  const all = relay(100).recent;
  save('relay-recent.json', all);
  const sum = all.reduce((s, r) => ({ n: s.n + (r.path && r.path.startsWith('/v1/messages') ? 1 : 0), in: s.in + (r.in || 0), out: s.out + (r.out || 0), cacheW: s.cacheW + (r.cacheW || 0), cacheR: s.cacheR + (r.cacheR || 0) }), { n: 0, in: 0, out: 0, cacheW: 0, cacheR: 0 });
  log('API 호출 합: ' + JSON.stringify(sum));
}

async function shots() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
  try {
    await page.setViewportSize?.({ width: 1500, height: 940 }).catch(() => {});
    await sleep(3000);
    // 노드의 API 표시
    const badges = await page.$$eval('[data-role=api-badge]', (els) => els.length);
    check('캔버스 노드에 API 표시(API 세션 수만큼)', badges >= 1, { badges });
    await page.screenshot({ path: path.join(OUT, '1-canvas.png') });
    // 세션 맵 카드
    await page.click('[data-role=sessions-pill]').catch(() => {});
    await sleep(2000);
    const mapTags = await page.$$eval('[data-role=ta-api]', (els) => els.length);
    check('세션 맵 카드에 API 표시', mapTags >= 1, { mapTags });
    await page.screenshot({ path: path.join(OUT, '2-session-map.png') });
    await page.keyboard.press('Escape'); await sleep(500);
    await page.click('[data-role=sessions-pill]').catch(() => {});
    await sleep(800);
    // 설정 › 런처: API 키 칸과 런처 목록
    if (!(await page.$('[data-role="settings"]'))) await page.click('[data-role="top-right"] [data-action="settings-open"]');
    await page.waitForSelector('[data-role="settings-tabs"]', { timeout: 8000 });
    await page.click('[data-role="settings-tabs"] [data-tab="launchers"]');
    await page.waitForSelector('[data-role=api-key-panel]', { timeout: 8000 });
    await sleep(800);
    const panel = await page.$eval('[data-role=api-key-panel]', (e) => ({ text: e.textContent, inputs: e.querySelectorAll('input').length, present: e.querySelector('[data-role=api-key-state]').dataset.present }));
    check('설정 › 런처: 키 있음, 값은 보이지 않음(입력 칸 없음, 지우기만)', panel.present === '1' && panel.inputs === 0, panel);
    const row = await page.$eval('[data-launcher=claude-api]', (e) => e.textContent).catch(() => '');
    check('런처 목록에 Claude Code (API)와 API 표시', /Claude Code \(API\)/.test(row) && /API/.test(row), row.slice(0, 200));
    const s = await page.$('[data-role="settings"]');
    await s.screenshot({ path: path.join(OUT, '3-settings-launchers.png') });
    // 창 상태(store)에 키가 없다: 창이 받은 답 어디에도 값이 없으니 relay.status만 본다
    const st = await page.evaluate(() => window.__mt.api.call('relay.status', {}));
    check('창이 받는 relay.status: 있음/없음·포트·요청 수만', st && 'keyPresent' in st && !('key' in st), Object.keys(st));
  } finally { await closeApp(app); }
}

async function stoptest() {
  const st = call('relay.stop');
  check('relay.stop: 중계기 꺼짐', !st.running, st);
  const a = await turn('api1', 'Reply with only the word OK again.');
  const s = byName('api1');
  const scr = atrium('screen', 'api1', '--text');
  save('stop-api1-screen.txt', scr);
  check('중계기가 꺼지면 API 세션은 오류(화면에 연결 오류)', /API Error|Unable to connect|ECONNREFUSED|connection|Retrying/i.test(scr), { state: s.state, answer: (a.answer || '').slice(0, 120), tail: scr.split('\n').filter(Boolean).slice(-6).join(' / ').slice(0, 400) });
  atrium('input', 'api1', '\\e'); await sleep(1000);
  const b = await turn('sub1', 'Reply with only the word OK again.');
  check('일반 세션은 그대로 답한다', b.answer && /OK/i.test(b.answer), b.answer);
}

async function nokey() {
  const r = call('relay.removeKey');
  check('relay.removeKey: 키 없음, 파일 지움, 중계기 꺼짐', r.keyPresent === false && !fs.existsSync(path.join(ENV.ATRIUM_DATA_DIR, 'auth-relay', 'key.bin')) && !relay().running, r);
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
  try {
    await sleep(2500);
    if (!(await page.$('[data-role="settings"]'))) await page.click('[data-role="top-right"] [data-action="settings-open"]');
    await page.waitForSelector('[data-role="settings-tabs"]', { timeout: 8000 });
    await page.click('[data-role="settings-tabs"] [data-tab="launchers"]');
    await page.waitForSelector('[data-role=api-key-input]', { timeout: 8000 });
    const type = await page.$eval('[data-role=api-key-input]', (e) => e.type);
    check('키가 없으면 비밀번호 칸과 저장 단추', type === 'password', type);
    await (await page.$('[data-role=api-key-panel]')).screenshot({ path: path.join(OUT, '4-api-key-empty.png') });
    let err = null;
    try { await page.evaluate(() => window.__mt.api.call('session.spawn', { cwd: 'C:\\Workspace\\mtask-p359-a', launcher: 'claude-api', name: 'nokey2' })); } catch (e) { err = String(e.message || e); }
    check('키가 없으면 API 런처가 까닭을 보이고 띄우지 않는다', err && !byName('nokey2'), err);
  } finally { await closeApp(app); }
}

async function stop() {
  for (const s of list()) { try { atrium('kill', s.name, '--yes'); } catch {} }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop: ' + e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop: ' + e.message.slice(0, 200)); }
}

const run = { setup, key, viaAgent, turns, shots, stoptest, nokey, stop }[WHAT];
if (!run) { log('모르는 단계: ' + WHAT); process.exit(2); }
try { await run(); } catch (e) { log('ERROR ' + (e.stack || e.message).slice(0, 2000)); process.exitCode = 1; }
const failed = results.filter((r) => !r.ok);
log(`${WHAT}: ${results.length - failed.length}/${results.length} PASS`);
fs.appendFileSync(path.join(OUT, '..', 'results.jsonl'), results.map((r) => JSON.stringify({ step: WHAT, ...r })).join('\n') + (results.length ? '\n' : ''));
process.exit(process.exitCode || (failed.length ? 1 : 0));
