// P381 개발용 판 실시험: 실제 omo 세션(시험 폴더, 짧게)이 ask_user_question으로 질문 하나를 내면
//   판의 응답 필요(본문·선택지·추천), 부모의 멈춤 알림(질문 실림), atrium read --json의 record를 보고, 터미널에서 답한 뒤 닫히는지 본다. 창 그림도 찍는다.
// 판: atrium-dev-p381, 48108, 창 원격 디버깅 9589, backend/.dev. 세션: 말을 걸지 않는 haiku 리드(ld)와 리드가 띄운 omo 하위(o1).
// 실행(워크트리 뿌리): node app/test/e2e/p381-omo.mjs <run|stop>   결과는 experiments/p381/(저장소 밖)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WHAT = process.argv[2] || 'run';
const NAME = process.argv[3] || 'o1';
const MODEL = process.argv[4] || 'chatgpt-subscription/gpt-6-luna-fast'; // omo 모델(제공자/ID). Codex 구독 자격이 막히면 anthropic-subscription/claude-haiku-5-5 // 하위 omo 세션 이름(앞 회의 일이 닫혔으면 새 이름으로)
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const A = 'C:\\Workspace\\mtask-p381-a', CONVOS = 'C:\\Workspace\\mtask-p381-projects';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR|CLAUDECODE$|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID$|CLAUDE_AGENT_SDK)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = 'p381';
const { devBoardEnv, assertIsolated } = await import('./lib/dev-board.mjs');
const { boardAgent } = await import('./lib/board-agent.mjs');
const ENV = devBoardEnv({ name: 'p381', port: 48108, root: DEV, convos: CONVOS, extra: { ATRIUM_USAGE_PROBE: 'off' } });
assertIsolated(ENV, { root: DEV, window: true });
Object.assign(process.env, ENV);
const { launch, closeApp, OUT } = await import('./harness.mjs');
fs.mkdirSync(CONVOS, { recursive: true }); fs.mkdirSync(A, { recursive: true });
const logFile = path.join(OUT, `p381-${WHAT}.txt`);
const log = (...a) => { const l = new Date().toISOString().slice(11, 19) + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(l); fs.appendFileSync(logFile, l + '\n'); };
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1500) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sess = (name) => call('session.list').find((s) => s.name === name);
async function until(fn, ms, gap = 1500) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(gap); } }
const PROMPT = 'Call the ask_user_question tool exactly once with one question: "Which color should the test button be?" header "Color", single select, options "Red", "Blue (Recommended)", "Green" (short descriptions). Wait for the answer. After the answer, reply with only the chosen color word and stop. Use no other tools.';

async function run() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  call('workspace.open', { path: A, select: true });
  const ag = boardAgent({ env: ENV });
  const ld = await ag.lead('ld', { cwd: A });
  check('리드 haiku ready', ld && ld.state === 'ready');
  if (!sess(NAME)) { const r = await ag.child('ld', NAME, '--kind', 'omo', '--model', MODEL, '--effort', 'low', '--prompt', PROMPT); log('child', r.code, (r.stdout || r.stderr).slice(0, 600)); }
  else { // 앞 회에서 제공자 오류로 턴이 끝났으면 입력 칸을 비우고 같은 지시를 다시 준다(리드가 보낸다)
    call('session.keys', { session: NAME, keys: ['backspace', 'backspace', 'backspace'] });
    const r = await ag.prompt('ld', NAME, PROMPT); log('prompt again', r.code, (r.stdout || r.stderr).slice(0, 300));
  }
  const w = await until(() => { const s = sess(NAME); return s && s.state === 'waiting' && s.ask && s.ask.kind === 'question' ? s : null; }, 240000);
  const cur = w || sess(NAME);
  check(`${NAME} 응답 필요가 기록의 질문(kind question, 본문·선택지·추천)`, !!w && /color/i.test(w.ask.questions[0].question) && w.ask.questions[0].options.length === 3 && /Recommended/.test(w.ask.questions[0].recommended || ''), cur && { state: cur.state, termStatus: cur.termStatus, ask: cur.ask });
  const ev = call('session.events', { session: NAME, limit: 200 }).filter((e) => e.kind === 'record_ask');
  check(`${NAME} 판 이벤트 record_ask(열림)`, ev.some((e) => e.data && e.data.id), ev.map((e) => e.data));
  // 리드에게 간 멈춤 알림(묶음 시간 뒤)
  const note = await until(() => call('delivery.list', { session: 'ld', limit: 20 }).find((d) => /맡긴 일이 멈췄다/.test(d.text || '') && d.text.includes(`@${NAME}의 일`)), 90000);
  check('리드 멈춤 알림에 질문 본문·보기·추천', !!note && /질문: .*color/i.test(note.text) && /보기: Red \/ Blue \(Recommended\) \/ Green/.test(note.text) && /추천: Blue/.test(note.text), note && note.text);
  const rd = await ag.json('ld', 'read', NAME);
  check(`atrium read ${NAME} --json: record.question·상태`, rd.record && rd.record.ok === true && rd.record.question && /color/i.test(rd.record.question.questions[0].question) && rd.record.state === 'waiting_human', rd.record);
  const wt = await ag.json('ld', 'wait', NAME, '--timeout', '3000');
  check('atrium wait o1: waiting과 질문', wt.status === 'waiting' && wt.ask && wt.ask.questions && wt.ask.questions[0].options.length === 3, wt.ask);
  fs.writeFileSync(path.join(OUT, 'p381-read-waiting.json'), JSON.stringify({ read: { ...rd, text: undefined }, wait: wt }, null, 2));
  // 창 그림(응답 필요)
  const { app, page } = await launch({ log, env: ENV, args: ['--remote-debugging-port=9589'] });
  try {
    await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
    await sleep(2500);
    await page.screenshot({ path: path.join(OUT, '1-board-waiting.png') });
    const inbox = page.locator('[data-role="inbox"]').first();
    if (await inbox.count()) { await inbox.click().catch(() => {}); await sleep(1200); await page.screenshot({ path: path.join(OUT, '2-inbox-question.png') }); }
    const txt = await page.evaluate(() => document.body.innerText);
    check('창에 질문 본문이 보인다', /Which color should the test button be\?/.test(txt));
    // 터미널에서 답하기(사람 대신: 휴대폰 키 줄과 같은 session.keys). 숫자 2 = Blue
    call('session.keys', { session: NAME, keys: ['2'] });
    let done = await until(() => { const s = sess(NAME); return s && s.state !== 'waiting' ? s : null; }, 20000, 1000);
    if (!done) { call('session.keys', { session: NAME, keys: ['enter'] }); done = await until(() => { const s = sess(NAME); return s && s.state !== 'waiting' ? s : null; }, 30000, 1000); }
    check('답한 뒤 응답 필요가 풀린다', !!done, done && { state: done.state, ask: done.ask });
    const fin = await until(() => { const s = sess(NAME); return s && s.state === 'ready' ? s : null; }, 120000);
    check(`${NAME} 턴 끝(ready)·마지막 답`, !!fin, fin && { state: fin.state, lastAnswer: fin.lastAnswer });
    await sleep(2000);
    await page.keyboard.press('Escape').catch(() => {});
    await page.screenshot({ path: path.join(OUT, '3-board-answered.png') });
  } finally { await closeApp(app); }
  const rd2 = await ag.json('ld', 'read', NAME);
  check('answered 뒤 read --json: 열린 질문 없음, 마지막 질문 answered', rd2.record && rd2.record.question === null && rd2.record.lastQuestion && rd2.record.lastQuestion.status === 'answered', rd2.record);
  fs.writeFileSync(path.join(OUT, 'p381-read-answered.json'), JSON.stringify({ ...rd2, text: undefined }, null, 2));
  const ev2 = call('session.events', { session: NAME, limit: 300 }).filter((e) => e.kind === 'record_ask').map((e) => e.data);
  check('record_ask 닫힘 이벤트', ev2.some((d) => d.closed), ev2);
  const notes = call('delivery.list', { session: 'ld', limit: 30 }).filter((d) => /맡긴 일이 멈췄다/.test(d.text || ''));
  log('리드 멈춤 알림 수', notes.length, notes.map((d) => d.text.slice(0, 300)));
  fs.writeFileSync(path.join(OUT, 'p381-results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
}

async function stop() {
  for (const n of ['o1', 'o2', 'o3', 'ld']) { try { log(atrium('kill', n, '--yes').trim().slice(0, 200)); } catch (e) { log('kill', n, e.message.slice(0, 200)); } }
  await sleep(3000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop', e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop', e.message.slice(0, 200)); }
  const hc = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'herdr-core', 'atrium-dev-p381');
  const omoDir = path.join(os.homedir(), '.omo', 'agent', 'sessions', '--C--Workspace-mtask-p381-a--');
  for (const d of [hc, omoDir, A, CONVOS]) { try { fs.rmSync(d, { recursive: true, force: true }); log('지움', d); } catch (e) { log('못 지움', d, e.message); } }
}

await (WHAT === 'stop' ? stop() : run()).catch((e) => { log('ERROR', e.stack || e.message); process.exitCode = 1; });
process.exit();
