// P372 개발용 판 실시험: 판 명령 공통 도구(lib/board-agent.mjs)와 격리 확인(lib/dev-board.mjs, scripts/clean-env.sh)을 진짜 판에서 본다.
// 판: 따로 띄운 개발용 판(atrium-dev-p372, 48107, backend/.dev)만. 세션: 말을 걸지 않는 haiku 리드(lead)와 셸(sh1). 창은 띄우지 않는다.
// run: 잘못된 주체·환경(셸 세션, 실제 판 env, 잘못된 포트, 격리 빠짐)에서 아무것도 부르지 않고 멈추는지, 리드 신원으로 ask·todo가 진짜 카드를 남기는지(카드 0장이면 실패),
//      models·child가 되는지, clean-env가 격리 값이 빠진 백엔드 다시 띄우기를 거절하는지.
// 실행(워크트리 뿌리): node app/test/e2e/p372-board-agent.mjs <run|stop>   결과는 experiments/p372/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WHAT = process.argv[2] || 'run';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p372');
const A = 'C:\\Workspace\\mtask-p372-a', CONVOS = 'C:\\Workspace\\mtask-p372-projects';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR|CLAUDECODE$|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID$|CLAUDE_AGENT_SDK)/.test(k)) delete process.env[k];
const { devBoardEnv, assertIsolated } = await import('./lib/dev-board.mjs');
const { boardAgent, BoardAgentError } = await import('./lib/board-agent.mjs');
const ENV = devBoardEnv({ name: 'p372', port: 48107, root: DEV, convos: CONVOS, extra: { ATRIUM_USAGE_PROBE: 'off' } });
assertIsolated(ENV, { root: DEV, window: true });
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true }); fs.mkdirSync(A, { recursive: true });
const logFile = path.join(OUT, `p372-${WHAT}.txt`);
const log = (...a) => { const l = new Date().toISOString().slice(11, 19) + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(l); fs.appendFileSync(logFile, l + '\n'); };
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1200) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portOpen = (port) => new Promise((r) => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const codeOf = async (p) => { try { await p; return 'none'; } catch (e) { return e instanceof BoardAgentError ? e : 'other:' + e.message; } };
// 감싸개(sh scripts/clean-env.sh)로 부르기: 실제 판 env를 흉내 내어 셸에 둔다
const wrapped = (setVals, ...cmd) => spawnSync('sh', [path.join(REPO, 'scripts', 'clean-env.sh'), 'env', ...Object.entries(setVals).map(([k, v]) => `${k}=${v}`), ...cmd], { encoding: 'utf8', cwd: REPO, env: { ...process.env, ATRIUM_PORT: '47800', ATRIUM_TERMINAL_SESSION: 'atrium', ATRIUM_SESSION_ID: 'real-session-x' }, timeout: 120000 });

async function run() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  call('workspace.open', { path: A, select: true });
  const ag = boardAgent({ env: ENV });
  // 판에 리드(haiku, 말 걸지 않음)와 셸
  const lead = await ag.lead('lead', { cwd: A });
  check('리드 haiku가 ready(말을 걸지 않음)', lead && lead.state === 'ready', { state: lead.state, lastPrompt: lead.lastPrompt || null });
  if (!call('session.list').find((s) => s.name === 'sh1')) call('session.spawn', { cwd: A, kind: 'shell', name: 'sh1' });
  await sleep(3000);
  const n0 = ((call('decision.list').cards) || []).length;
  // 1) 잘못된 주체·환경
  let e = await codeOf(ag.ask('sh1', 'P372 셸에서 카드'));
  check('셸 세션으로 부르면 멈춘다(shell_session, 까닭·고치는 법)', e.code === 'shell_session' && /고치기/.test(e.message), e.message || e);
  e = await codeOf(boardAgent({ env: ENV, procEnv: { ...process.env, ATRIUM_SESSION_ID: 'real-session-x' } }).ask('lead', 'x'));
  check('실제 판 세션 env가 남으면 멈춘다(real_env)', e.code === 'real_env', e.message || e);
  e = await codeOf(boardAgent({ env: { ...ENV, ATRIUM_PORT: '48999' }, procEnv: { ...process.env, ATRIUM_PORT: '48999' } }).ask('lead', 'x'));
  check('잘못된 포트면 멈춘다(wrong_port)', e.code === 'wrong_port' && /48999/.test(e.message), e.message || e);
  e = await codeOf(boardAgent({ env: { ...ENV, ATRIUM_PORT: '47800' }, procEnv: { ...process.env, ATRIUM_PORT: '47800' } }).ask('lead', 'x'));
  check('실제 판 포트면 멈춘다(not_isolated)', e.code === 'not_isolated' && /실제 판/.test(e.message), e.message || e);
  const { ATRIUM_CLAUDE_PROJECTS, ...noConvo } = ENV;
  e = await codeOf(boardAgent({ env: noConvo, procEnv: noConvo }).ask('lead', 'x'));
  check('대화 기록 격리가 빠지면 멈춘다(not_isolated)', e.code === 'not_isolated' && /ATRIUM_CLAUDE_PROJECTS/.test(e.message), e.message || e);
  check('잘못된 경우들은 카드를 남기지 않았다', ((call('decision.list').cards) || []).length === n0, { n0, now: ((call('decision.list').cards) || []).length });
  // 2) 리드 신원으로 진짜 카드
  const c1 = await ag.ask('lead', 'P372 시험: 어느 안으로 갈까요?', { options: ['A안', 'B안'], why: '시험 카드입니다' });
  const c2 = await ag.todo('lead', 'P372 시험: npm 캐시 확인', { cmds: ['npm cache verify'] });
  const mine = await ag.expectCards(2, { session: 'lead' });
  check('리드 신원으로 ask·todo → 판에 진짜 카드 둘(주인 lead)', mine.length >= 2 && c1.name === 'lead' && c2.name === 'lead', mine.map((c) => [c.id, c.name, c.kind, c.question]));
  const m = await ag.models('lead');
  check('리드 신원으로 atrium models', m.code === 0 && /haiku/i.test(m.stdout), m.stdout.slice(0, 300) || m.stderr.slice(0, 300));
  const ch = await ag.child('lead', 'w372', '--model', 'haiku', '--no-wait');
  const w = call('session.list').find((s) => s.name === 'w372');
  check('리드 신원으로 atrium child(하위 w372, 부모 lead)', ch.code === 0 && w && w.parentSessionId === lead.sessionId, { code: ch.code, out: ch.stdout.slice(0, 200), parent: w && w.parentSessionId });
  if (w) { try { call('session.kill', { session: 'w372', confirm: true }); } catch {} }
  // 3) clean-env 감싸개: 격리 값이 빠진 다시 띄우기는 거절, 한 벌이면 돈다
  log(atrium('backend', 'stop').trim().slice(0, 200));
  await sleep(1500);
  const { ATRIUM_CLAUDE_DESKTOP, ...noDesk } = ENV;
  let r = wrapped(noDesk, 'node', 'backend/bin/atrium.mjs', '--dev', 'backend', 'start');
  await sleep(1000);
  check('clean-env: ATRIUM_CLAUDE_DESKTOP 없이 백엔드 다시 띄우기를 거절(3), 백엔드는 뜨지 않음', r.status === 3 && /ATRIUM_CLAUDE_DESKTOP/.test(r.stderr) && !(await portOpen(48107)), { status: r.status, err: r.stderr.slice(0, 300) });
  r = wrapped({}, 'node', 'backend/bin/atrium.mjs', '--dev', 'backend', 'start');
  check('clean-env: 판 값 없이(실제 판 env만 남은 셸) atrium을 거절(3)', r.status === 3 && /ATRIUM_PORT/.test(r.stderr) && !(await portOpen(48107)), { status: r.status });
  r = wrapped(ENV, 'node', 'backend/bin/atrium.mjs', '--dev', 'backend', 'start');
  check('clean-env: 한 벌이면 백엔드를 다시 띄운다(실제 판 env는 지워짐)', r.status === 0 && (await portOpen(48107)), { status: r.status, out: (r.stdout + r.stderr).slice(0, 300) });
  const after = boardAgent({ env: ENV });
  const again = await after.expectCards(2, { session: 'lead' }).catch((x) => x);
  check('다시 띄운 뒤에도 같은 판(카드 그대로)', Array.isArray(again) && again.length >= 2, Array.isArray(again) ? again.length : again.message);
  const ws = call('workspace.list');
  const wl = (Array.isArray(ws) ? ws : ws.workspaces || []).map((x) => x.name || x.key);
  check('실제 리포 이름의 워크스페이스가 열리지 않았다(시험 폴더만)', wl.every((n) => /mtask-p372/.test(String(n))), wl);
}

async function stop() {
  try { for (const s of call('session.list')) { try { call('session.kill', { session: s.sessionId, confirm: true }); } catch (e) { log('kill ' + e.message.slice(0, 120)); } } } catch (e) { log('list ' + e.message.slice(0, 160)); }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop ' + e.message.slice(0, 160)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop ' + e.message.slice(0, 160)); }
}

try {
  if (WHAT === 'run') await run(); else await stop();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  if (WHAT === 'run') fs.writeFileSync(path.join(OUT, 'p372-run.json'), JSON.stringify({ results }, null, 2));
  const bad = results.filter((x) => !x.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ' 실패: ' + bad.map((b) => b.name).join(', ') : ''}`);
  process.exit(bad.length ? 1 : 0);
}
