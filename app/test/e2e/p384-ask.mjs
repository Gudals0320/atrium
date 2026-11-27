// P384 개발용 판 실시험: 하위의 질문 창은 사람 대신 일 부모(리드)가 받는다.
//   run: haiku 리드 ld 아래 OmO 하위 o1이 ask_user_question을 내면 ld에게 판 알림이 가고, ld(실제 haiku)가 atrium answer로 답해 o1이 이어 간다. 그동안 창의 응답 필요 목록은 흐린 줄. 리드 응답 시간을 잰다
//   claude: 같은 ld 아래 Claude Code(haiku) 하위 c1이 AskUserQuestion을 내면 같은 길
//   esc: 답하지 말라고 한 리드 ld2 아래 o2의 질문이 설정 시간(1분) 뒤 사람에게 올라온다(흐림이 풀린 줄, child_ask_escalated)
//   text: ld2 신원으로 o3의 질문에 글 답(atrium answer o3 "<글>")을 넣어 OmO 질문 창이 글 답을 받는지
//   shot: 창 그림만, stop: 정리
// 판: atrium-dev-p384, 48108, 창 원격 디버깅 9589, backend/.dev. 실행(워크트리 뿌리): node app/test/e2e/p384-ask.mjs <run|claude|esc|text|shot|stop>   결과는 experiments/p384/(저장소 밖)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WHAT = process.argv[2] || 'run';
const MODEL = process.argv[3] || 'anthropic-subscription/claude-haiku-5-5'; // 이 PC의 OmO ChatGPT 자격은 만료(P381)
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const A = 'C:\\Workspace\\mtask-p384-a', CONVOS = 'C:\\Workspace\\mtask-p384-projects';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR|CLAUDECODE$|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID$|CLAUDE_AGENT_SDK)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = 'p384';
const { devBoardEnv, assertIsolated } = await import('./lib/dev-board.mjs');
const { boardAgent } = await import('./lib/board-agent.mjs');
const ENV = devBoardEnv({ name: 'p384', port: 48108, root: DEV, convos: CONVOS, extra: { ATRIUM_USAGE_PROBE: 'off' } });
assertIsolated(ENV, { root: DEV, window: true });
Object.assign(process.env, ENV);
const { launch, closeApp, OUT } = await import('./harness.mjs');
fs.mkdirSync(CONVOS, { recursive: true }); fs.mkdirSync(A, { recursive: true });
const logFile = path.join(OUT, `p384-${WHAT}.txt`);
const log = (...a) => { const l = new Date().toISOString().slice(11, 19) + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(l); fs.appendFileSync(logFile, l + '\n'); };
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ stage: WHAT, name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1500) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sess = (name) => call('session.list').find((s) => s.name === name);
const events = (name, kind) => call('session.events', { session: name, limit: 400 }).filter((e) => !kind || e.kind === kind);
async function until(fn, ms, gap = 1500) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(gap); } }
const OMO_ASK = (q, opts) => `Call the ask_user_question tool exactly once with one question: "${q}" header "Pick", single select, options ${opts.map((o) => '"' + o + '"').join(', ')} (short descriptions). Wait for the answer. After the answer, reply with only the chosen answer and stop. Use no other tools.`;
const CLAUDE_ASK = 'Use the AskUserQuestion tool exactly once with one question: "Which size should the test button be?" header "Size", options "Small", "Medium (Recommended)", "Large". After the answer, reply with only the chosen size word and stop. Use no other tools.';
const ag = boardAgent({ env: ENV });
const saveResults = () => { const f = path.join(OUT, 'p384-results.json'); let all = []; try { all = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {} fs.writeFileSync(f, JSON.stringify([...all.filter((r) => r.stage !== WHAT), ...results], null, 2)); log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`); };

async function start() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  call('workspace.open', { path: A, select: true });
}
// 하위가 질문 창을 띄우고 askRoute(부모 처리 중)가 붙기를 기다린다
async function routed(name, ms = 300000) {
  return until(() => { const s = sess(name); return s && s.state === 'waiting' && s.ask && s.ask.kind === 'question' && s.askRoute ? s : null; }, ms);
}
async function shotInbox(file) {
  const { app, page } = await launch({ log, env: ENV, args: ['--remote-debugging-port=9589'] });
  try {
    await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
    await sleep(2500);
    const inbox = page.locator('[data-role="inbox"]').first();
    const pill = (await inbox.count()) ? { count: await inbox.getAttribute('data-count'), cls: await inbox.getAttribute('class') } : null;
    if (pill) { await inbox.click().catch(() => {}); await sleep(1000); }
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-role="inbox-list"] .mt-chip')].map((e) => ({ name: e.getAttribute('data-name'), held: e.getAttribute('data-held'), text: e.innerText.replace(/\s+/g, ' ').slice(0, 160), opacity: getComputedStyle(e).opacity })));
    await page.screenshot({ path: path.join(OUT, file) });
    const notify = await page.evaluate(() => (window.__mt && window.__mt.notifyLog) || null).catch(() => null);
    await page.keyboard.press('Escape').catch(() => {});
    return { pill, rows, notify };
  } finally { await closeApp(app); }
}

async function run() {
  await start();
  call('settings.set', { key: 'childAskEscalateMin', value: 10 });
  const ld = await ag.lead('ld', { cwd: A });
  check('리드 haiku ready', ld && ld.state === 'ready');
  const r = await ag.child('ld', 'o1', '--kind', 'omo', '--model', MODEL, '--effort', 'low', '--prompt', OMO_ASK('Which color should the test button be?', ['Red', 'Blue (Recommended)', 'Green']));
  log('child o1', r.code, (r.stdout || r.stderr).slice(0, 400));
  const w = await routed('o1');
  check('o1 질문 창 → 부모 처리 중(askRoute parent ld, 올리기 전)', !!w && w.askRoute.parent === 'ld' && !w.askRoute.escalated, w && { state: w.state, askRoute: w.askRoute, q: w.ask.questions && w.ask.questions[0] });
  const tNotice = Date.now();
  const note = await until(() => call('delivery.list', { session: 'ld', limit: 20 }).find((d) => /하위가 질문했다: @o1/.test(d.text || '')), 60000, 1000);
  check('ld에게 간 글: 질문·번호 보기·추천·atrium answer·기준·10분', !!note && /질문: Which color/.test(note.text) && /\n  2\. Blue \(Recommended\)/.test(note.text) && /추천: 2/.test(note.text) && /atrium answer o1 <번호>/.test(note.text) && /BRIEF 결정과 다름/.test(note.text) && /10분 안에/.test(note.text), note && note.text);
  if (note) fs.writeFileSync(path.join(OUT, 'p384-notice.txt'), note.text);
  const stops = call('delivery.list', { session: 'ld', limit: 20 }).filter((d) => /맡긴 일이 멈췄다/.test(d.text || '') && /needs|사람의 답/.test(d.text));
  check('겹치는 멈춤 알림(needs_human) 없음', !stops.length, stops.map((d) => d.text.slice(0, 200)));
  // 리드가 답하기 전에 창 그림(흐린 줄). 리드가 빨리 답하면 이미 풀렸을 수 있다
  const shot = await shotInbox('1-inbox-held.png');
  log('inbox', shot);
  if (shot.rows.some((x) => x.name === 'o1')) check('창: o1은 흐린 줄(부모 처리 중), 알약 수 0', shot.rows.some((x) => x.name === 'o1' && x.held === 'parent' && Number(x.opacity) < 0.8) && shot.pill && shot.pill.count === '0' && !/hot/.test(shot.pill.cls), shot);
  else log('창 그림 전에 리드가 답했다(흐린 줄 그림은 esc 단계에서)');
  // 리드(haiku)가 스스로 atrium answer로 답한다
  const ans = await until(() => events('o1', 'answer').find((e) => e.data && e.data.by === 'parent'), 300000, 2000);
  check('ld가 atrium answer로 답함(answer by parent)', !!ans, ans && ans.data);
  const notice = events('o1', 'child_ask_notice')[0];
  const t0 = notice ? notice.t : tNotice;
  const lat = ans ? ans.t - t0 : null;
  log('리드 응답 시간(알림 → 답) ms', lat);
  const fin = await until(() => { const s = sess('o1'); return s && s.state !== 'waiting' ? s : null; }, 60000);
  check('o1 질문 닫힘(child_ask_end how parent), 이어 감', !!fin && events('o1', 'child_ask_end').some((e) => e.data.how === 'parent'), fin && { state: fin.state, ends: events('o1', 'child_ask_end').map((e) => e.data) });
  const done = await until(() => { const s = sess('o1'); return s && ['ready', 'error'].includes(s.state) ? s : null; }, 180000);
  log('o1 끝', done && { state: done.state, lastAnswer: done.lastAnswer });
  fs.writeFileSync(path.join(OUT, 'p384-latency.json'), JSON.stringify({ o1: lat }, null, 2));
  saveResults();
}

async function claude() {
  await start();
  if (!sess('ld')) await ag.lead('ld', { cwd: A });
  const r = await ag.child('ld', 'c1', '--model', 'haiku', '--prompt', CLAUDE_ASK);
  log('child c1', r.code, (r.stdout || r.stderr).slice(0, 300));
  const w = await routed('c1', 240000);
  check('c1(Claude Code) AskUserQuestion → 부모 처리 중', !!w && w.askRoute.parent === 'ld', w && { state: w.state, ask: w.ask && w.ask.kind, askRoute: w.askRoute });
  const ans = await until(() => events('c1', 'answer').find((e) => e.data && e.data.by === 'parent'), 300000, 2000);
  check('ld가 c1 질문에 atrium answer', !!ans, ans && ans.data);
  const n = events('c1', 'child_ask_notice')[0];
  const lat = ans && n ? ans.t - n.t : null;
  log('리드 응답 시간 c1 ms', lat);
  const fin = await until(() => { const s = sess('c1'); return s && s.state === 'ready' ? s : null; }, 180000);
  check('c1 이어 가서 끝남', !!fin, fin && { lastAnswer: fin.lastAnswer });
  let lt = {}; try { lt = JSON.parse(fs.readFileSync(path.join(OUT, 'p384-latency.json'), 'utf8')); } catch {}
  fs.writeFileSync(path.join(OUT, 'p384-latency.json'), JSON.stringify({ ...lt, c1: lat }, null, 2));
  saveResults();
}

async function esc() {
  await start();
  call('settings.set', { key: 'childAskEscalateMin', value: 1 });
  if (!sess('ld2')) await ag.lead('ld2', { cwd: A });
  call('session.send', { target: 'ld2', text: 'Test rule for this session: when a board notice about a sub-session question arrives, do not run any command and do not answer it. Just reply with the single word noted and end your turn. Reply now with noted.' });
  await until(() => { const s = sess('ld2'); return s && s.state === 'ready' && s.lastAnswer ? s : null; }, 120000);
  const r = await ag.child('ld2', 'o2', '--kind', 'omo', '--model', MODEL, '--effort', 'low', '--prompt', OMO_ASK('Which shape should the test icon be?', ['Circle', 'Square (Recommended)', 'Triangle']));
  log('child o2', r.code, (r.stdout || r.stderr).slice(0, 300));
  const w = await routed('o2');
  check('o2 부모 처리 중, 1분 뒤 올리기', !!w && w.askRoute.parent === 'ld2' && w.askRoute.escalateAt - w.askRoute.since <= 61000, w && w.askRoute);
  const before = await shotInbox('2-inbox-held.png');
  check('창(올리기 전): o2 흐린 줄 "부모 처리 중 · @ld2", 알약 수 0, OS 알림 없음', before.rows.some((x) => x.name === 'o2' && x.held === 'parent' && /@ld2/.test(x.text)) && before.pill && before.pill.count === '0', before);
  const up = await until(() => { const s = sess('o2'); return s && s.askRoute && s.askRoute.escalated ? s : null; }, 150000, 3000);
  check('시간 뒤 사람에게 올림(child_ask_escalated, askRoute.escalated)', !!up && events('o2', 'child_ask_escalated').length === 1, up && up.askRoute);
  const after = await shotInbox('3-inbox-escalated.png');
  check('창(올린 뒤): o2는 보통 응답 필요 줄, 알약 수 1(hot)', after.rows.some((x) => x.name === 'o2' && !x.held) && after.pill && after.pill.count === '1' && /hot/.test(after.pill.cls), after);
  const d = call('delivery.list', { session: 'ld2', limit: 20 }).filter((x) => /하위가 질문했다: @o2/.test(x.text || ''));
  check('ld2에게는 알림 한 번', d.length === 1, d.length);
  saveResults();
}

async function text() {
  await start();
  call('settings.set', { key: 'childAskEscalateMin', value: 10 });
  if (!sess('ld2')) await ag.lead('ld2', { cwd: A });
  const r = await ag.child('ld2', 'o3', '--kind', 'omo', '--model', MODEL, '--effort', 'low', '--prompt', OMO_ASK('Which label should the test button have?', ['OK', 'Go (Recommended)', 'Start']));
  log('child o3', r.code, (r.stdout || r.stderr).slice(0, 300));
  const w = await routed('o3');
  check('o3 부모 처리 중', !!w);
  const x = await ag.run('ld2', 'answer', 'o3', 'Launch now', '--json');
  let j = null; try { j = JSON.parse(x.stdout); } catch {}
  log('answer', x.code, x.stdout.slice(0, 400), x.stderr.slice(0, 300));
  check('atrium answer o3 "Launch now": 질문 창 닫힘', j && j.answered === true, j);
  const fin = await until(() => { const s = sess('o3'); return s && s.state === 'ready' ? s : null; }, 180000);
  check('o3 마지막 답에 글 답', !!fin && /launch now/i.test(fin.lastAnswer || ''), fin && fin.lastAnswer);
  const bad = await ag.run('ld', 'answer', 'o3', '1', '--json');
  check('부모 아닌 세션(ld)의 answer는 거절(not_parent 또는 질문 없음)', bad.code !== 0, bad.stdout.slice(0, 300));
  saveResults();
}

async function stop() {
  for (const n of ['o1', 'o2', 'o3', 'c1', 'ld', 'ld2']) { try { log(atrium('kill', n, '--yes').trim().slice(0, 200)); } catch (e) { log('kill', n, e.message.slice(0, 200)); } }
  await sleep(3000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop', e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop', e.message.slice(0, 200)); }
  const hc = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'herdr-core', 'atrium-dev-p384');
  const omoDir = path.join(os.homedir(), '.omo', 'agent', 'sessions', '--C--Workspace-mtask-p384-a--');
  for (const d of [hc, omoDir, A, CONVOS]) { try { fs.rmSync(d, { recursive: true, force: true }); log('지움', d); } catch (e) { log('못 지움', d, e.message); } }
}

const F = { run, claude, esc, text, stop, shot: async () => { await start(); log(await shotInbox('0-shot.png')); } };
await (F[WHAT] || run)().catch((e) => { log('ERROR', e.stack || e.message); process.exitCode = 1; });
process.exit();
