// P367 창·판 시험: SDK 세션의 백그라운드 일 지키기와 노드 얼굴. 따로 띄운 개발용 판(atrium-dev-p367, 48110, 창 원격 디버깅 9591)만 쓴다.
// 실행: node app/test/e2e/p367-sdk.mjs <setup|key|probe|repro|face|shots|stop>
// - key: API 키를 환경 변수 ANTHROPIC_API_KEY로 받은 이 프로세스가(사람이 고른 키 관리 도구로 띄운다) 판의 relay.setKey로 한 번 넣는다. 값은 읽자마자 지운다.
// - probe: 판 밖에서 claude -p stream-json을 판 중계기로 직접 돌려 stream 줄과 hook 몸을 모두 적는다(백그라운드 서브에이전트·셸이 어떤 신호를 남기는지)
// - repro: 판의 SDK 세션(haiku)에게 백그라운드 서브에이전트·셸을 띄우고 턴을 끝내게 한 뒤, 프로세스가 그 일이 끝날 때까지 살고 결과로 다시 턴을 도는지 본다
// - face: 도구 몇 번을 쓰는 짧은 턴(노드 얼굴 그림용)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const KEY = WHAT === 'key' ? String(process.env.ANTHROPIC_API_KEY || '') : '';
delete process.env.ANTHROPIC_API_KEY;
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p367', 'shots');
const CONVOS = 'C:\\Workspace\\mtask-p367-projects';
const F = 'C:\\Workspace\\mtask-p367-a';
const BOARD = 'atrium-dev-p367', PORT = '48110', DEBUG = 9591;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p367-none-',
  ATRIUM_SDK_IDLE_MS: process.env.P367_IDLE_MS || '20000', ATRIUM_USAGE_PROBE: 'off',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger('p367-' + WHAT);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)) : '')); };
const list = () => call('session.list');
const byName = (n) => list().find((x) => x.name === n);
const save = (name, v) => fs.writeFileSync(path.join(OUT, '..', name), typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const git = (...a) => execFileSync('git', ['-C', F, ...a], { encoding: 'utf8' });

async function setup() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
  fs.mkdirSync(F, { recursive: true });
  if (!fs.existsSync(path.join(F, '.git'))) { fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p367-a\n\nA small test folder.\n'); fs.writeFileSync(path.join(F, 'notes.txt'), 'alpha\nbeta\ngamma\n'); git('init', '-q', '-b', 'main'); git('add', '-A'); git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'init'); }
  call('workspace.open', { path: F, select: true });
  call('settings.set', { key: 'language', value: 'ko' });
  const st = call('relay.status', {});
  log('relay: ' + JSON.stringify({ keyPresent: st.keyPresent, running: st.running }));
}

async function key() {
  if (!KEY) { log('ANTHROPIC_API_KEY 없음(키 관리 도구로 띄우세요)'); process.exitCode = 2; return; }
  const { ApiClient } = await import('file:///' + path.join(REPO, 'backend', 'src', 'client.mjs').replace(/\\/g, '/'));
  const info = JSON.parse(fs.readFileSync(path.join(ENV.ATRIUM_DATA_DIR, 'backend.json'), 'utf8'));
  const c = new ApiClient(info); await c.open();
  try { const r = await c.call('relay.setKey', { key: KEY }); check('relay.setKey 답에 값이 없다', r && r.keyPresent === true && !JSON.stringify(r).includes(KEY), { keyPresent: r && r.keyPresent }); }
  finally { c.close(); }
}

// 판 밖 claude -p 탐침: 중계기 주소는 개발용 판 데이터 폴더의 relay.json(비밀 앞머리)과 relay.status 포트
async function probe() {
  const st = call('relay.status', {});
  if (!st.running && !byName('relaykick')) { try { call('session.spawn', { cwd: F, launcher: 'claude-sdk', model: 'haiku', effort: 'low', name: 'relaykick' }); } catch (e) { log('relaykick: ' + String(e.message).slice(0, 200)); } await sleep(1500); } // SDK 세션을 띄우면 판이 중계기를 켠다
  const st2 = call('relay.status', {});
  const secret = JSON.parse(fs.readFileSync(path.join(ENV.ATRIUM_DATA_DIR, 'auth-relay', 'relay.json'), 'utf8')).secret;
  if (!st2.port) throw new Error('relay not running: ' + JSON.stringify(st2).slice(0, 200));
  const sid = process.argv[3] || crypto.randomUUID();
  const dir = path.join(REPO, 'experiments', 'p367', 'probe'); fs.mkdirSync(dir, { recursive: true });
  const hooks = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { const j = JSON.parse(b); hooks.push({ at: Date.now(), ev: j.hook_event_name, body: j }); fs.appendFileSync(path.join(dir, 'hooks.jsonl'), JSON.stringify({ at: Date.now(), ev: j.hook_event_name, body: j }) + '\n'); } catch {} res.end('{}'); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const hp = srv.address().port;
  const EVS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop', 'SessionEnd', 'Notification'];
  const settings = { hooks: Object.fromEntries(EVS.map((e) => [e, [{ hooks: [{ type: 'http', url: `http://127.0.0.1:${hp}/h`, timeout: 10 }] }]])) };
  const sf = path.join(dir, 'settings.json'); fs.writeFileSync(sf, JSON.stringify(settings));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC_|ATRIUM_|CLAUDE)/i.test(k)));
  env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${st2.port}/${secret}/${sid}`;
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--session-id', sid, '--model', 'haiku', '--effort', 'low', '--permission-mode', 'bypassPermissions', '--settings', sf, '--no-chrome'];
  const t0 = Date.now();
  const ch = spawn('claude', args, { cwd: F, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false });
  log('probe pid ' + ch.pid + ' sid ' + sid);
  const lines = []; let buf = '';
  ch.stdout.setEncoding('utf8');
  ch.stdout.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; let j; try { j = JSON.parse(l); } catch { j = { raw: l }; } lines.push({ t: Date.now() - t0, j }); fs.appendFileSync(path.join(dir, 'stream.jsonl'), JSON.stringify({ t: Date.now() - t0, j }) + '\n'); log(`+${((Date.now() - t0) / 1000).toFixed(1)}s ${j.type}${j.subtype ? '/' + j.subtype : ''}`); } });
  ch.stderr.on('data', (c) => fs.appendFileSync(path.join(dir, 'stderr.txt'), c));
  const prompt = process.env.P367_PROMPT || 'Do exactly this, nothing more: (1) Use the Agent tool with run_in_background true, subagent_type general-purpose, description "wait-agent", prompt "Run the shell command: sleep 40 && echo AGENT-DONE . Then reply with only AGENT-DONE." (2) Use the Bash tool with run_in_background true to run: sleep 25 && echo SHELL-DONE (3) Then immediately end your turn replying only: STARTED. When the background results arrive later, reply only with the word RESULTS followed by what they printed.';
  ch.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } }) + '\n');
  const waitMs = Number(process.env.P367_PROBE_MS || 150000);
  await new Promise((r) => { const t = setTimeout(r, waitMs); ch.on('exit', () => { clearTimeout(t); r(); }); });
  log('closing stdin');
  try { ch.stdin.end(); } catch {}
  await new Promise((r) => { const t = setTimeout(() => { try { execFileSync('taskkill', ['/PID', String(ch.pid), '/T', '/F']); } catch {} r(); }, 15000); ch.on('exit', () => { clearTimeout(t); r(); }); });
  srv.close();
  const results_ = lines.filter((x) => x.j.type === 'result').map((x) => ({ t: x.t, text: String(x.j.result || '').slice(0, 200), usage: x.j.usage, cost: x.j.total_cost_usd }));
  const stops = hooks.filter((h) => h.ev === 'Stop').map((h) => ({ t: h.at - t0, bg: h.body.background_tasks }));
  save('probe-summary.json', { sid, results: results_, stops, types: [...new Set(lines.map((x) => x.j.type + (x.j.subtype ? '/' + x.j.subtype : '')))], hookEvents: hooks.map((h) => `${((h.at - t0) / 1000).toFixed(1)} ${h.ev}`) });
  log('results ' + JSON.stringify(results_).slice(0, 800));
  log('stops ' + JSON.stringify(stops).slice(0, 1500));
}

async function sendWait(name, text, ms = 180000) {
  const before = (byName(name) || {}).lastAnswerAt || 0;
  atrium('send', '@' + name, text);
  await until(() => { const s = byName(name); return s && (s.state === 'ready' || s.state === 'error') && (s.lastAnswerAt || 0) > before; }, ms, 2000).catch(() => log(name + ' 답 기다림 넘김'));
  const s = byName(name);
  return { state: s.state, answer: s.lastAnswer, error: s.error, sdk: s.sdk, background: s.background };
}

const BG_PROMPT = 'Do exactly this, nothing more: (1) Use the Agent tool with run_in_background true, subagent_type general-purpose, description "wait-agent", prompt "Run the shell command: sleep 45 && echo AGENT-DONE . Then reply with only AGENT-DONE." (2) Use the Bash tool with run_in_background true to run: sleep 30 && echo SHELL-DONE (3) Then immediately end your turn replying only: STARTED. When the background results arrive later, reply only with the word RESULTS followed by what they printed.';

// 판 SDK 세션: 백그라운드 일을 띄우고 턴을 끝낸다. 쉼(20초)보다 길게 도는 일이 끝나 결과로 다시 턴을 도는지
async function repro() {
  const name = process.argv[3] || 'bg1';
  if (!byName(name)) call('session.spawn', { cwd: F, launcher: 'claude-sdk', model: 'haiku', effort: 'low', name });
  const t0 = Date.now();
  const a = await sendWait(name, BG_PROMPT, 120000);
  log('first turn: ' + JSON.stringify({ state: a.state, answer: String(a.answer || '').slice(0, 120), sdk: a.sdk, bg: a.background }));
  const timeline = [];
  const deadline = Date.now() + 150000;
  let got = null;
  while (Date.now() < deadline) {
    const s = byName(name);
    timeline.push({ t: Math.round((Date.now() - t0) / 1000), state: s.state, alive: s.sdk && s.sdk.alive, pid: s.sdk && s.sdk.pid, answer: String(s.lastAnswer || '').slice(0, 80), bgN: s.background ? s.background.n : 0, face: s.sdkFace && { now: s.sdkFace.now, bg: s.sdkFace.bg && s.sdkFace.bg.n, turns: s.sdkFace.usage && s.sdkFace.usage.turns } });
    if (/RESULTS\s*AGENT-DONE/.test(s.lastAnswer || '')) { got = s; break; }
    await sleep(2000);
  }
  save(`repro-${name}.json`, timeline);
  const pids = new Set(timeline.map((x) => x.pid).filter(Boolean));
  check('백그라운드 일이 끝날 때까지 프로세스가 산다(같은 pid)', pids.size === 1 && timeline.every((x) => x.alive), { pids: [...pids], dead: timeline.filter((x) => !x.alive).map((x) => x.t) });
  check('쉬는 동안 판이 백그라운드 일을 안다(세션 요약 background)', timeline.some((x) => x.state === 'ready' && x.bgN >= 1), timeline.map((x) => `${x.t}:${x.state}:${x.bgN}`).join(' '));
  check('끝난 백그라운드 일의 결과로 다시 턴을 돌고 판이 그 답을 본다', !!got, got ? String(got.lastAnswer).slice(0, 200) : timeline.slice(-3));
  if (got) {
    await until(() => { const s = byName(name); return s && s.sdk && !s.sdk.alive; }, 90000, 3000).catch(() => {});
    const s = byName(name);
    check('일이 다 끝나면 쉼 뒤 프로세스가 끝난다', s.sdk && !s.sdk.alive && s.state === 'ready', { sdk: s.sdk, state: s.state });
  }
}

async function face() {
  const name = process.argv[3] || 'face1';
  if (!byName(name)) call('session.spawn', { cwd: F, launcher: 'claude-sdk', model: 'haiku', effort: 'low', name });
  const r = await sendWait(name, 'Read README.md and notes.txt, run `git log --oneline -3` with Bash, then add a line "delta" to the end of notes.txt with the Edit tool. Then answer with a short markdown summary: a heading "## Summary", a bullet list of what you did, and a small table with columns File | Lines.', 180000);
  log('face turn: ' + JSON.stringify({ state: r.state, answer: String(r.answer || '').slice(0, 300) }));
  const s = byName(name);
  check('턴 금액·토큰이 세션 요약에 있다', s.sdkFace && s.sdkFace.usage && s.sdkFace.usage.total.cost > 0, s.sdkFace);
}

async function shots() {
  const name = process.argv[3] || 'face1';
  const sid = byName(name).sessionId;
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
  const sel = `[data-session="${sid}"]`;
  const nodeShot = async (file) => { const el = await page.$(sel); if (el) await el.screenshot({ path: path.join(OUT, file) }); };
  const faceInfo = () => page.$eval(sel, (e) => ({ face: e.dataset.face, tools: e.querySelectorAll('[data-role=sdk-tools]').length, now: (e.querySelector('[data-role=sdk-now]') || {}).textContent || null, usage: (e.querySelector('[data-role=sdk-usage]') || {}).textContent || null, md: e.querySelectorAll('.mt-sdk-md table, .mt-sdk-md h2, .mt-sdk-md ul').length })).catch((e) => ({ err: String(e).slice(0, 200) }));
  try {
    await sleep(3000);
    await page.evaluate((id) => window.__mt.getState().navigateTo(id), sid);
    await sleep(2500);
    const info = await faceInfo();
    check('SDK 노드 얼굴(쉼): 도구 줄, 토큰·금액 줄, 마크다운 답', info.face === 'close' && info.tools >= 1 && /\$/.test(info.usage || '') && info.md >= 1, info);
    await page.screenshot({ path: path.join(OUT, '1-canvas.png') });
    await nodeShot('2-sdk-node.png');
    // 도구 묶음 펼치기 → 도구 하나 펼치기
    await page.click(`${sel} [data-action=sdk-tools-toggle]`).catch(() => {});
    await sleep(500);
    await page.click(`${sel} [data-role=sdk-tools] [data-action=sdk-tool-toggle]`).catch(() => {});
    await sleep(600);
    const open = await page.$$eval(`${sel} [data-role=sdk-tool-detail]`, (els) => els.length).catch(() => 0);
    check('도구 줄을 누르면 입력·결과 앞부분이 펼쳐진다', open >= 1, { open });
    await nodeShot('3-sdk-node-open.png');
    // 일하는 중: 앞에서 도는 명령 하나(지금 하는 일 줄과 경과)
    atrium('send', '@' + name, 'Use the Bash tool in the foreground (not background) to run exactly: ping -n 25 127.0.0.1 > NUL && echo PINGED . Then reply with only: DONE');
    await until(async () => { const i = await faceInfo(); return i.now && /Bash/.test(i.now); }, 60000, 1000).catch(() => {});
    await sleep(2500);
    const w = await faceInfo();
    check('일하는 중: 지금 하는 일 한 줄(도구와 요점, 경과)', /Bash: ping/.test(w.now || '') && /\d+s/.test(w.now || ''), w);
    await nodeShot('4-sdk-node-working.png');
    // 세션 맵 카드
    await page.click('[data-role=sessions-pill]').catch(() => {});
    await sleep(2000);
    const mapNow = await page.$$eval('[data-role=ta-sdk-now]', (els) => els.map((e) => e.textContent)).catch(() => []);
    check('세션 맵 카드에 지금 하는 일 한 줄', mapNow.some((x) => /Bash: ping/.test(x)), mapNow);
    await page.screenshot({ path: path.join(OUT, '5-session-map.png') });
    await page.keyboard.press('Escape'); await sleep(800);
    // 축소(요약·틀 단계): 지금 하는 일 한 줄만
    const n = await page.evaluate((id) => window.__mt.getState().nodes.get(id) || null, sid).catch(() => null);
    log('node rect ' + JSON.stringify(n));
    for (const [zoom, file, face] of [[0.16, '6-far-face.png', 'far'], [0.13, '6-far-face.png', 'far'], [0.11, '6-far-face.png', 'far'], [0.07, '7-frame-face.png', 'icon']]) {
      if (face === 'far' && results.some((r) => r.ok && /축소\(far\)/.test(r.name))) continue;
      if (n) await page.evaluate(([r, z]) => window.__mt.getState().setViewport({ x: 750 - (r.x + r.w / 2) * z, y: 470 - (r.y + r.h / 2) * z, zoom: z }), [n, zoom]);
      await page.mouse.click(1200, 160).catch(() => {}); // 빈 판을 눌러 고름을 푼다(고른 노드는 가까이 얼굴을 붙든다)
      await sleep(2500);
      const f = await page.$eval(sel, (e) => ({ face: e.dataset.face, now: (e.querySelector('[data-role=sdk-now]') || {}).textContent || null })).catch((e) => ({ err: String(e).slice(0, 120) }));
      check(`축소(${face}): 지금 하는 일 한 줄`, f.face === face && /Bash|ping/.test(f.now || ''), f);
      await page.screenshot({ path: path.join(OUT, file) });
    }
    await until(() => { const s = byName(name); return s && s.state === 'ready'; }, 90000, 2000).catch(() => {});
  } finally { await closeApp(app); }
}

async function stop() {
  for (const s of list()) { try { atrium('kill', s.name, '--yes'); } catch {} }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop: ' + e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop: ' + e.message.slice(0, 200)); }
}

const run = { setup, key, probe, repro, face, shots, stop }[WHAT];
if (!run) { log('모르는 단계: ' + WHAT); process.exit(2); }
try { await run(); } catch (e) { log('ERROR ' + (e.stack || e.message).slice(0, 2000)); process.exitCode = 1; }
const failed = results.filter((r) => !r.ok);
log(`${WHAT}: ${results.length - failed.length}/${results.length} PASS`);
fs.appendFileSync(path.join(OUT, '..', 'results.jsonl'), results.map((r) => JSON.stringify({ step: WHAT, ...r })).join('\n') + (results.length ? '\n' : ''));
process.exit(process.exitCode || (failed.length ? 1 : 0));
