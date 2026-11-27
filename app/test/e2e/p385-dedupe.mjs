// P385 개발용 판 실시험: 자동 할 일 카드 중복 막기.
//   (1) 말을 걸지 않는 haiku 리드(ld) 아래 하위(w1)가 사람에게 묻는 글로 턴을 끝내도 자동 카드가 없다(할 일 정리도 부르지 않는다).
//   (2) 맨 위 haiku 세션(top)은 같은 글로 끝내면 지금처럼 자동 카드가 생긴다(대조). 열린 손 실행 카드와 같은 부탁으로 끝내면 새 자동 카드가 없다.
//   (3) 맨 위 omo 세션(omo-top)이 같은 질문을 글로 쓰고 ask_user_question 창도 띄우면 할 일 목록과 응답 필요를 합쳐 하나만 보인다.
// 판: atrium-dev-p385, 48106, 창 원격 디버깅 9587, backend/.dev. 결과는 experiments/p385/(저장소 밖, MT_E2E_OUT).
// 실행(워크트리 뿌리): node app/test/e2e/p385-dedupe.mjs <run|shot|stop> [omo 모델]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WHAT = process.argv[2] || 'run';
const OMO_MODEL = process.argv[3] || 'anthropic-subscription/claude-haiku-5-5'; // chatgpt-subscription/gpt-6-luna-fast는 질문 도구를 부르지 않고 글로만 물었다(2회)
const OMO = process.argv[4] || 'omo-top'; // omo 세션 이름
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const A = 'C:\\Workspace\\mtask-p385-a', CONVOS = 'C:\\Workspace\\mtask-p385-projects';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR|CLAUDECODE$|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID$|CLAUDE_AGENT_SDK)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = 'p385';
const { devBoardEnv, assertIsolated } = await import('./lib/dev-board.mjs');
const { boardAgent } = await import('./lib/board-agent.mjs');
const ENV = devBoardEnv({ name: 'p385', port: 48106, root: DEV, convos: CONVOS, extra: { ATRIUM_USAGE_PROBE: 'off' } });
assertIsolated(ENV, { root: DEV, window: true });
Object.assign(process.env, ENV);
const { launch, closeApp, OUT } = await import('./harness.mjs');
fs.mkdirSync(CONVOS, { recursive: true }); fs.mkdirSync(A, { recursive: true });
const logFile = path.join(OUT, `p385-${WHAT}.txt`);
const log = (...a) => { const l = new Date().toISOString().slice(11, 19) + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(l); fs.appendFileSync(logFile, l + '\n'); };
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1500) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sess = (name) => call('session.list').find((s) => s.name === name);
const cards = (name) => { const r = call('decision.list'); const all = Array.isArray(r) ? r : r.cards || []; return all.filter((d) => d.name === name); };
const evs = (name, kinds) => call('session.events', { session: name, limit: 300 }).filter((e) => kinds.includes(e.kind));
async function until(fn, ms, gap = 1500) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(gap); } }
// 턴 하나가 끝나고(ready, 마지막 답이 바뀜) 할 일 정리가 끝날 때까지
async function turnDone(name, before, ms = 180000) {
  const s = await until(() => { const x = sess(name); return x && x.state !== 'working' && x.state !== 'starting' && (x.lastAnswerAt || 0) > before ? x : null; }, ms);
  await sleep(4000);
  await until(() => { const b = call('bots.status'); return !b || !b.todoTidy || b.todoTidy.state !== 'working'; }, 120000, 2000);
  await sleep(2000);
  return s || sess(name);
}
const ASK_KO = ['두 길을 정리했습니다. A안은 캐시를 두고, B안은 매번 파일을 읽습니다.', '', '어느 쪽으로 할까요? 정해 주시면 진행하겠습니다.'].join('\n');
const SAY = (t) => 'This is a board test. Do not use any tools. Reply with exactly the text between the markers (without the markers) and nothing else.\n<<<\n' + t + '\n>>>';
const OMO_PROMPT = 'This is a board test. First write this exact sentence as plain text: "Which color should the test button be? Red, Blue or Green?" Then call the ask_user_question tool exactly once with one question: "Which color should the test button be?" header "Color", single select, options "Red", "Blue (Recommended)", "Green" (short descriptions), and waitForAnswer false. Then end your turn. Use no other tools.';

async function run() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  call('workspace.open', { path: A, select: true });
  const ag = boardAgent({ env: ENV });
  const ld = await ag.lead('ld', { cwd: A });
  check('리드 haiku ready', ld && ld.state === 'ready');

  // (1) 하위 세션
  if (!sess('w1')) { const r = await ag.child('ld', 'w1', '--model', 'haiku', '--prompt', SAY(ASK_KO)); log('child w1', r.code, (r.stdout || r.stderr).slice(0, 600)); }
  const w1 = await turnDone('w1', 0);
  check('w1 턴 끝, 마지막 답이 사람에게 묻는 글', w1 && /어느 쪽으로 할까요/.test(w1.lastAnswer || ''), w1 && { state: w1.state, lastAnswer: (w1.lastAnswer || '').slice(0, 200) });
  check('하위 w1: 자동 할 일 카드 0장', cards('w1').length === 0, cards('w1'));
  check('하위 w1: 할 일 정리를 부르지 않았다(decision_tidy·decision_auto 없음)', evs('w1', ['decision_tidy', 'decision_auto']).length === 0, evs('w1', ['decision_tidy', 'decision_auto']));

  // (2) 맨 위 Claude Code 세션: 대조(지금처럼 만든다), 열린 손 실행 카드와 같은 부탁(만들지 않는다)
  if (!sess('top')) call('session.spawn', { cwd: A, name: 'top', model: 'haiku' });
  await until(() => { const s = sess('top'); return s && s.state === 'ready' ? s : null; }, 180000);
  let t0 = Date.now();
  call('session.send', { target: 'top', text: SAY(ASK_KO) });
  await turnDone('top', t0);
  const c1 = cards('top');
  check('맨 위 top: 같은 글이면 자동 카드가 생긴다(대조, 지금 그대로)', c1.length >= 1 && c1.every((d) => d.auto), c1.map((d) => ({ id: d.id, kind: d.kind, q: d.question, auto: d.auto })));
  for (const d of c1) call('decision.ignore', { id: d.id });
  const hand = await ag.todo('top', '키를 넣고 npm run setup 실행', { cmds: ['npm run setup'] });
  log('hand todo', hand && hand.id);
  t0 = Date.now();
  call('session.send', { target: 'top', text: SAY('설정 파일을 만들었습니다.\n\n키를 넣고 npm run setup 을 실행해 주세요.') });
  await turnDone('top', t0);
  const c2 = cards('top');
  const dup2 = evs('top', ['decision_dup']);
  check('맨 위 top: 열린 손 실행 카드와 같은 부탁이면 새 자동 카드 없음(손 카드 하나만)', c2.length === 1 && !c2[0].auto, { cards: c2.map((d) => ({ id: d.id, kind: d.kind, q: d.question, auto: d.auto })), dup: dup2.map((e) => e.data), tidy: evs('top', ['decision_tidy']).slice(-1).map((e) => e.data) });

  await omoPhase(OMO_PROMPT);
  fs.writeFileSync(path.join(OUT, 'p385-run.json'), JSON.stringify({ results }, null, 2));
  log(`결과 ${results.filter((x) => x.ok).length}/${results.length}`);
}
// (3) 맨 위 omo 세션: 글의 질문 + ask_user_question 창
async function omoPhase(prompt) {
  if (!sess(OMO)) call('session.spawn', { cwd: A, name: OMO, kind: 'omo', model: OMO_MODEL });
  await until(() => { const s = sess(OMO); return s && s.state === 'ready' ? s : null; }, 180000);
  for (const d of cards(OMO)) call('decision.ignore', { id: d.id });
  call('session.send', { target: OMO, text: prompt });
  const q = await until(() => { const s = sess(OMO); return s && s.ask && s.ask.kind === 'question' ? s : null; }, 240000);
  check(`${OMO} 질문 창이 떴다(응답 필요 본문)`, !!q, q ? { state: q.state, ask: q.ask && q.ask.questions } : sess(OMO) && { state: sess(OMO).state, last: (sess(OMO).lastAnswer || '').slice(0, 300) });
  await sleep(12000);
  await until(() => { const b = call('bots.status'); return !b || !b.todoTidy || b.todoTidy.state !== 'working'; }, 120000, 2000);
  await sleep(3000);
  const o = sess(OMO);
  const c3 = cards(OMO);
  const shown = (o && o.state === 'waiting' && o.ask ? 1 : 0) + c3.length;
  check(`맨 위 ${OMO}: 질문 창과 같은 질문이 할 일 카드로 또 뜨지 않는다(합쳐 하나)`, !!q && c3.length === 0, { state: o && o.state, ask: o && o.ask && o.ask.questions && o.ask.questions.map((x) => x.question), cards: c3.map((d) => ({ id: d.id, q: d.question, auto: d.auto, via: d.via })), shown, lastAnswer: o && (o.lastAnswer || '').slice(0, 300) });
  log(`${OMO} events`, evs(OMO, ['decision_tidy', 'decision_auto', 'decision_dup', 'decision_end', 'record_ask']).map((e) => ({ kind: e.kind, data: e.data })));
}
const OMO_AGAIN = 'Board test, step 2. You MUST call the ask_user_question tool now; plain text alone is not enough. In the same reply, write the sentence "Which size should the test button be? Small, Medium or Large?" and call ask_user_question once with question "Which size should the test button be?", header "Size", single select, options "Small", "Medium (Recommended)", "Large", waitForAnswer false. Then stop. Use no other tools.';
async function omoOnly() { await omoPhase(OMO_AGAIN); fs.writeFileSync(path.join(OUT, 'p385-omo.json'), JSON.stringify({ results }, null, 2)); log(`결과 ${results.filter((x) => x.ok).length}/${results.length}`); }

async function shot() {
  const { app, page } = await launch({ log, env: ENV, args: ['--remote-debugging-port=9587'] });
  try {
    await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
    await sleep(2500);
    await page.screenshot({ path: path.join(OUT, '1-board.png') });
    const inbox = page.locator('[data-role="inbox"]').first();
    if (await inbox.count()) { await inbox.click().catch(() => {}); await sleep(1200); await page.screenshot({ path: path.join(OUT, '2-inbox.png') }); await page.keyboard.press('Escape').catch(() => {}); }
    const todo = page.locator('[data-role="decisions-pill"], [data-role="decisions"], [data-role="todo-pill"]').first();
    if (await todo.count()) { await todo.click().catch(() => {}); await sleep(1200); await page.screenshot({ path: path.join(OUT, '3-todo.png') }); }
  } finally { await closeApp(app).catch(() => {}); }
}

async function stop() {
  for (const n of [OMO, 'omo-top', 'top', 'w1', 'ld']) { try { if (sess(n)) { if (/omo/.test(n)) { try { call('session.send', { target: n, text: '/quit' }); await sleep(4000); } catch {} } if (sess(n)) atrium('kill', n, '--yes'); } } catch (e) { log('kill', n, String(e.message).slice(0, 200)); } }
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop', String(e.message).slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop', String(e.message).slice(0, 200)); }
}

// 판을 다시 띄운 뒤(기록 읽기 고침) 열린 omo 질문을 다시 본다: read --json이 기록을 읽고, 응답 필요가 기록의 질문이며 할 일 카드는 없다
async function recheck() {
  const ag = boardAgent({ env: ENV });
  const rd = await ag.json('ld', 'read', OMO);
  check(`read ${OMO} --json: 기록의 열린 질문(기다리지 않는 질문)`, rd.record && rd.record.question && rd.record.question.async === true, rd.record && { state: rd.record.state, question: rd.record.question });
  await sleep(1500);
  const o = sess(OMO);
  check(`${OMO} 응답 필요가 기록의 질문(kind question)이고 할 일 카드 0장(합쳐 하나)`, o && o.state === 'waiting' && o.ask && o.ask.kind === 'question' && cards(OMO).length === 0, { state: o && o.state, ask: o && o.ask && { kind: o.ask.kind, q: o.ask.questions && o.ask.questions.map((x) => x.question), async: o.ask.async, waitingHuman: o.ask.waitingHuman }, cards: cards(OMO) });
  fs.writeFileSync(path.join(OUT, 'p385-recheck.json'), JSON.stringify({ results }, null, 2));
}
if (WHAT === 'run') await run(); else if (WHAT === 'omo') await omoOnly(); else if (WHAT === 'recheck') await recheck(); else if (WHAT === 'shot') await shot(); else if (WHAT === 'stop') await stop();
