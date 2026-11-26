// P372 판 명령을 쓰는 공통 시험 도구: 개발용 판의 에이전트 세션(말을 걸지 않는 haiku 리드) 신원으로 atrium 에이전트 명령(ask·todo·models·child·prompt 등)을 부른다.
// 왜: 판의 셸 세션은 판 하위 명령을 못 쓴다(셸에는 판 env·PATH의 atrium이 없고, 토큰을 줘도 백엔드가 not_board_session으로 거절한다, branch.mjs auth).
//   셸 칸에 'atrium ask'를 치게 한 시험 도구(P353)를 후속 워커가 베껴 카드 0장으로 측정을 넘기거나(P355) 헤맸다(P356·P357·P359·P360, 사례는 experiments/know-baseline/cases.md 9·14·15·18·20·22번).
// 옳은 길: 부르는 세션의 판 API 토큰 HMAC(branch.mjs token: sha256(apiToken, 'branch:'+세션 ID))을 ATRIUM_SESSION_TOKEN으로, 세션 ID를 ATRIUM_SESSION_ID로 주고 backend/bin/atrium-child.mjs를 부른다.
//   백엔드는 부르는 세션을 부모·주인으로 본다(branch.mjs 머리 주석). 세션은 판에서 띄운 claude(haiku)여야 하고 말을 걸 필요는 없다.
// 시작할 때(세션마다 한 번) 부르는 주체와 환경을 본다. 틀리면 까닭과 고치는 법을 담은 BoardAgentError(code)를 던지고 아무것도 부르지 않는다:
//   real_env: 셸에 실제 판·다른 판 env가 남음(ATRIUM_SESSION_ID 등) / not_isolated: 판 값이 시험 판이 아님(lib/dev-board.mjs) /
//   no_board·wrong_port·wrong_board: 판이 안 떠 있거나 포트·터미널 세션이 데이터 폴더의 판과 다름 / no_session·shell_session·closed_session: 부르는 세션.
// ask·todo는 판의 카드 목록에서 그 카드를 다시 찾는다(없으면 no_card). expectCards는 카드가 모자라면 던진다(카드 0장인 채 측정을 성공으로 넘기지 않는다).
// 쓰기:
//   import { boardAgent } from './lib/board-agent.mjs';
//   const ag = boardAgent({ env: ENV });                          // ENV: 판 값 한 벌(lib/dev-board.mjs devBoardEnv)
//   await ag.lead('lead', { cwd: FOLDER });                       // haiku를 띄워 ready까지(말을 걸지 않는다)
//   const c = await ag.ask('lead', '어느 안으로 갈까요?', { options: ['A', 'B'] });
//   await ag.todo('lead', 'npm 캐시 확인', { cmds: ['npm cache verify'] });
//   await ag.expectCards(2, { session: 'lead' });
//   const r = await ag.run('lead', 'models');                     // { code, stdout, stderr }
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isolationProblems, isolationMessage, stripBoardEnv, sessionOf } from './dev-board.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CHILD = path.join(REPO, 'backend', 'bin', 'atrium-child.mjs');
const ATRIUM = path.join(REPO, 'backend', 'bin', 'atrium.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 실제 판 세션이 셸에 남기는 값(이것이 남은 채 부르면 실제 판으로 갈 수 있다)
const REAL_MARKS = ['ATRIUM_SESSION_ID', 'ATRIUM_SESSION_TOKEN', 'MTASK_SESSION_ID', 'MTASK_SESSION_TOKEN'];
const CHECK_KEYS = ['ATRIUM_TERMINAL_SESSION', 'ATRIUM_HERDR_SESSION', 'ATRIUM_PORT', 'ATRIUM_DATA_DIR'];

// 세션 토큰(동기): 데이터 폴더 backend.json의 판 API 토큰으로 HMAC. 판이 안 떠 있으면 던진다. 세션 설정 파일에 토큰이 없는 세션(되살린 세션 등)도 이 값이 맞다
export function sessionToken(env, sessionId) {
  let i = null; try { i = JSON.parse(fs.readFileSync(path.join(env.ATRIUM_DATA_DIR, 'backend.json'), 'utf8')); } catch {}
  if (!i || !i.token) throw new BoardAgentError('no_board', `판이 떠 있지 않다: ${path.join(env.ATRIUM_DATA_DIR || '?', 'backend.json')} 없음`, '판 값을 준 셸에서 atrium --dev backend start');
  return crypto.createHmac('sha256', i.token).update('branch:' + sessionId).digest('hex');
}

export class BoardAgentError extends Error {
  constructor(code, why, fix) { super(`board-agent(${code}): ${why}${fix ? `\n  고치기: ${fix}` : ''}`); this.code = code; this.why = why; this.fix = fix; }
}
const fail = (code, why, fix) => { throw new BoardAgentError(code, why, fix); };

function execAsync(file, args, opts) {
  return new Promise((resolve) => execFile(file, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...opts }, (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: stdout || '', stderr: stderr || '' })));
}

// env: 판 값 한 벌. call(method, params): 판 API(기본은 atrium CLI --dev --json call). procEnv: 이 스크립트의 환경(검사 대상, 기본 process.env).
// tokenOf(sessionId): 세션 토큰(기본은 데이터 폴더 backend.json의 판 API 토큰으로 HMAC). home: 실제 홈(격리 검사, 시험용)
export function boardAgent({ env, call = null, procEnv = process.env, tokenOf = null, home, timeoutMs = 120000 } = {}) {
  if (!env) fail('no_env', '판 값(env)을 주지 않았다', 'boardAgent({ env: devBoardEnv({ name, port, root, convos }) })');
  const base = { ...stripBoardEnv(procEnv), ...env };
  const api = call || (async (method, params = {}) => {
    const r = await execAsync(process.execPath, [ATRIUM, '--dev', '--json', 'call', method, JSON.stringify(params)], { env: base, timeout: timeoutMs });
    if (r.code !== 0) throw new Error(`판 API ${method} 실패(${r.code}): ${(r.stderr || r.stdout).slice(0, 400)}`);
    return JSON.parse(r.stdout);
  });
  const info = () => { try { return JSON.parse(fs.readFileSync(path.join(env.ATRIUM_DATA_DIR, 'backend.json'), 'utf8')); } catch { return null; } };
  const token = tokenOf || ((sid) => sessionToken(env, sid));
  const sessions = async () => { const r = await api('session.list'); return Array.isArray(r) ? r : r.sessions || []; };
  const ok = new Map(); // 확인한 세션: 이름 → 세션

  // 환경 검사(부르는 주체와 상관없이 한 번)
  function checkEnv() {
    const left = REAL_MARKS.filter((k) => procEnv[k]);
    if (left.length) fail('real_env', `이 스크립트의 셸에 실제 판(또는 다른 판) 세션 env가 남았다: ${left.join(', ')}. 그대로면 atrium 명령이 그 판·그 세션으로 갈 수 있다`, 'sh scripts/clean-env.sh … 로 부르거나 스크립트 머리에서 /^(ATRIUM_|MTASK_|HERDR_|HC_)/ 값을 지운 뒤 판 값을 넣는다');
    const diff = CHECK_KEYS.filter((k) => procEnv[k] != null && env[k] != null && String(procEnv[k]) !== String(env[k]));
    if (diff.length) fail('real_env', `셸의 판 값이 시험 판 값과 다르다: ${diff.map((k) => `${k}=${procEnv[k]}(시험 판 ${env[k]})`).join(', ')}`, '실제 판 env를 지운 셸(scripts/clean-env.sh)에서 부른다');
    const probs = isolationProblems(env, { home });
    if (probs.length) { const e = new BoardAgentError('not_isolated', isolationMessage(probs, '판 명령 시험'), null); e.problems = probs; throw e; }
    if (!tokenOf) {
      const i = info();
      if (!i) fail('no_board', `판이 떠 있지 않다: ${path.join(env.ATRIUM_DATA_DIR, 'backend.json')} 없음`, '판 값을 준 셸에서 atrium --dev backend start(창 시험이면 창을 먼저 띄운다)');
      if (String(i.port) !== String(env.ATRIUM_PORT)) fail('wrong_port', `ATRIUM_PORT=${env.ATRIUM_PORT}인데 데이터 폴더의 판은 ${i.port}에서 돈다`, '지시가 준 포트와 데이터 폴더를 짝으로 준다(다른 워커의 판 포트는 쓰지 않는다)');
      if (i.terminalSession && sessionOf(env) && i.terminalSession !== sessionOf(env)) fail('wrong_board', `터미널 세션 ${sessionOf(env)}인데 데이터 폴더의 판은 ${i.terminalSession}이다`, 'ATRIUM_TERMINAL_SESSION과 ATRIUM_DATA_DIR을 같은 판 것으로 준다');
    }
  }
  let envChecked = false;

  // 부르는 세션 검사: 판에 있고, 에이전트(셸 아님)이고, 닫히지 않았다
  async function caller(who) {
    if (!envChecked) { checkEnv(); envChecked = true; }
    if (ok.has(who)) return ok.get(who);
    let list;
    try { list = await sessions(); } catch (e) { fail('wrong_port', `판(${env.ATRIUM_PORT})이 답하지 않는다: ${e.message.slice(0, 200)}`, '판이 떠 있는지(atrium --dev backend status), 포트가 맞는지 본다'); }
    const s = list.find((x) => x.name === who || x.sessionId === who);
    if (!s) fail('no_session', `부르는 세션 ${who}가 이 판(${sessionOf(env)})에 없다`, 'ag.lead(이름, { cwd })로 haiku 리드를 먼저 띄운다');
    if ((s.kind || 'claude') === 'shell') fail('shell_session', `부르는 세션 ${s.name}은 셸이다. 셸 세션은 판 하위 명령(ask·todo·models·child)을 못 쓴다(셸 칸에 치면 atrium이 없거나 판 env가 없고, 토큰을 줘도 not_board_session)`, 'haiku 세션을 리드로 띄워(ag.lead) 그 이름으로 부른다. 카드 주인이 셸이어야 하는 그림은 페이지 안 흉내로 넣는다');
    if (s.closedAt || ['closed', 'exited', 'ended'].includes(s.state)) fail('closed_session', `부르는 세션 ${s.name}이 닫혔다(${s.state})`, '다시 띄운다(ag.lead)');
    ok.set(who, s); ok.set(s.sessionId, s);
    return s;
  }

  // 그 세션으로 atrium-child.mjs <동사> … → { code, stdout, stderr }
  async function run(who, ...args) {
    const s = await caller(who);
    return execAsync(process.execPath, [CHILD, ...args], { env: { ...base, ATRIUM_SESSION_ID: s.sessionId, ATRIUM_SESSION_TOKEN: token(s.sessionId) }, timeout: timeoutMs });
  }
  async function json(who, ...args) {
    const r = await run(who, ...args, '--json');
    let x = null; try { x = JSON.parse(r.stdout); } catch {}
    if (r.code !== 0 || !x || x.error) fail('verb_failed', `atrium ${args[0]}(${who}) 실패(${r.code}): ${(x && x.error ? `${x.error.code} ${x.error.message}` : r.stderr || r.stdout).slice(0, 400)}`, x && x.error && x.error.code === 'not_board_session' ? '셸 세션이 아니라 haiku 리드로 부른다' : null);
    return x;
  }
  const cards = async () => { const r = await api('decision.list'); return (r && r.cards) || []; };
  async function findCard(id, ms = 5000) {
    const t0 = Date.now();
    for (;;) { const c = (await cards()).find((d) => String(d.id) === String(id)); if (c) return c; if (Date.now() - t0 > ms) return null; await sleep(200); }
  }
  async function made(x, what, who) {
    const id = x && (x.id ?? (x.card && x.card.id));
    const c = id != null ? await findCard(id) : null;
    if (!c) fail('no_card', `${what}(${who})가 카드를 남기지 않았다(판의 카드 목록에 #${id ?? '?'} 없음)`, '부르는 세션·판 값을 확인한다. 카드 0장인 채 측정·그림을 성공으로 넘기지 않는다');
    return c;
  }

  return {
    env, call: api, run, json, caller, cards,
    // 결정 카드: options·why, 기다림은 늘 --no-wait(시험 스크립트가 막히지 않게)
    async ask(who, question, { options = [], why } = {}) {
      const x = await json(who, 'ask', question, ...options.flatMap((o) => ['--option', o]), ...(why ? ['--why', why] : []), '--no-wait');
      return made(x, 'atrium ask', who);
    },
    // 사람 몫 카드: cmds·check·later·why·tell
    async todo(who, text, { cmds = [], check = false, later, why, tell = false } = {}) {
      const x = await json(who, 'todo', text, ...cmds.flatMap((c) => ['--cmd', c]), ...(check ? ['--check'] : []), ...(later ? ['--later', later] : []), ...(why ? ['--why', why] : []), ...(tell ? ['--tell'] : []), '--no-wait');
      return made(x, 'atrium todo', who);
    },
    models: (who) => run(who, 'models'),
    child: (who, name, ...more) => run(who, 'child', name, ...more),
    prompt: (who, to, text, ...more) => run(who, 'prompt', to, text, ...more),
    // 판 카드가 n장 이상인지(session: 그 세션 것만). 모자라면 던진다
    async expectCards(n = 1, { session, ms = 5000 } = {}) {
      const t0 = Date.now();
      for (;;) {
        const all = await cards();
        const mine = session ? all.filter((c) => c.name === session || c.sessionId === session) : all;
        if (mine.length >= n) return mine;
        if (Date.now() - t0 > ms) fail('no_card', `판 카드가 ${mine.length}장이다(${n}장 이상이어야 한다${session ? `, ${session}의 것` : ''})`, '카드를 만든 명령의 출력을 본다. 카드 0장인 채 측정·그림을 성공으로 넘기지 않는다');
        await sleep(300);
      }
    },
    // 리드: 판에 haiku 세션을 띄워 ready까지 기다린다(말을 걸지 않는다). 이미 있으면 그대로
    async lead(name, { cwd, model = 'haiku', readyMs = 180000 } = {}) {
      let s = (await sessions()).find((x) => x.name === name);
      if (s && (s.kind || 'claude') === 'shell') fail('shell_session', `${name}은 이미 셸 세션이다`, '다른 이름으로 haiku 리드를 띄운다');
      if (!s) { if (!cwd) fail('no_cwd', 'lead: 띄울 폴더(cwd)를 준다', 'C:\\Workspace\\mtask-<작업>-a처럼 새로 만든 폴더'); await api('session.spawn', { cwd, name, model }); }
      const t0 = Date.now();
      for (;;) {
        s = (await sessions()).find((x) => x.name === name);
        if (s && s.state === 'ready') return s;
        if (s && s.state === 'trust_wait') fail('needs_trust', `${name}이 신뢰 질문에서 멈췄다`, '신뢰된 폴더(C:\\Workspace 아래 git이 아닌 새 폴더)에 띄운다. 신뢰는 대신 답하지 않는다');
        if (Date.now() - t0 > readyMs) fail('not_ready', `${name}이 ${readyMs / 1000}초 안에 ready가 되지 않았다(${s ? s.state : '없음'})`, '판 화면(atrium --dev get <이름>)을 본다');
        await sleep(1500);
      }
    },
  };
}
