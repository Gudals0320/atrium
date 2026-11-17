// P200 창 확인: 새 하위 세션 자리. 부모(haiku) 하나에 하위 둘(haiku)을 띄우고, 줄 끝 바로 아래를 긴 메모(다른 것)로 막은 뒤 하위 둘을 더 띄운다.
//   고치기 전: 셋째는 메모 아래로 멀리 내려간다. 고친 뒤: 부모 오른쪽 새 열(부모 위 끝 높이)에 서고, 넷째는 그 아래. 다른 노드와 메모는 옮기지 않는다.
// 판: 따로 띄운 개발용 판(atrium-dev-p200, 47969, backend/.dev)만. 창 원격 디버깅 포트 9449. 시험 폴더 C:\Workspace\mtask-p200-a(새로 만든다, git 저장소가 아니다: 신뢰 질문 없음).
// 부모는 haiku(첫 요청 없음, atrium child는 판이 띄운 에이전트에서만), 하위도 haiku(첫 요청 없음). 워크트리 상자 테두리 크기는 단위 시험(backend/test/p200.test.mjs)이 본다.
// 실행: bash backend/.dev/clean-env.sh node app/test/e2e/p200-child-place.mjs <before|after|stop>. 결과 experiments/p200/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'after';
if (!['before', 'after', 'stop'].includes(WHAT)) throw new Error('before|after|stop');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p200');
const CONVOS = path.join(OUT, 'convos');
const DIR = 'C:\\Workspace\\mtask-p200-a';
const BOARD = 'atrium-dev-p200', PORT = '47969', DEBUG = '9449';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: 'p200',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true }); fs.mkdirSync(DIR, { recursive: true });
const { logger, sleep, launch, closeApp, shot } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
if (ENV.ATRIUM_PORT !== '47969' || ENV.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p200') throw new Error('P200 판(atrium-dev-p200, 47969)만');

const log = logger(`p200-place-${WHAT}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${JSON.stringify(detail).slice(0, 800)}` : ''}`); };
const sessions = () => call('session.list');
const byName = (n) => sessions().find((s) => s.name === n);
const tokenOf = async (aId) => {
  const { DatabaseSync } = await import('node:sqlite');
  const crypto = await import('node:crypto');
  const db = new DatabaseSync(path.join(DEV, 'data', 'board.db'), { readOnly: true });
  const api = JSON.parse(db.prepare("SELECT value FROM meta WHERE key = 'apiToken'").get().value); db.close();
  return crypto.createHmac('sha256', api).update(`branch:${aId}`).digest('hex');
};
const asLead = (id, tok, ...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium-child.mjs'), ...a], { encoding: 'utf8', env: { ...process.env, ATRIUM_PROFILE: 'dev', ATRIUM_SESSION_ID: id, ATRIUM_SESSION_TOKEN: tok }, timeout: 240000 });
const board = () => call('board.get');
const nodes = () => Object.fromEntries(board().nodes.map((n) => [n.session_id, { x: n.x, y: n.y, w: n.w, h: n.h }]));
const killAll = () => { for (const s of sessions()) { try { atrium('kill', s.sessionId, '--yes', '--delete'); log('끄기', s.name); } catch (e) { log('끄기 실패', s.name, e.message.slice(0, 160)); } } };

if (WHAT === 'stop') {
  try { killAll(); } catch (e) { log('목록 실패', e.message.slice(0, 160)); }
  try { log('터미널 멈춤', atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('터미널 멈춤 실패', e.message.slice(0, 200)); }
  try { log('백엔드 멈춤', atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('백엔드 멈춤 실패', e.message.slice(0, 200)); }
  process.exit(0);
}

// 고치기 전·뒤는 백엔드 코드가 다르다: 단계마다 백엔드를 새로 띄운다
try { sessions(); killAll(); log('백엔드 멈춤', atrium('backend', 'stop').trim().slice(0, 200)); await sleep(1000); } catch {}
log('백엔드 띄움', atrium('backend', 'start').trim().slice(-200)); await sleep(1500);
for (const m of board().memos || []) { try { call('memo.delete', { memo: m.memoId, confirm: true }); } catch {} }
const L = call('session.spawn', { cwd: DIR, name: 'p200-lead', kind: 'claude', model: 'haiku' }); // atrium child는 판이 띄운 에이전트에서만. 첫 요청은 보내지 않는다
const TOK = await tokenOf(L.sessionId);
for (const t0 = Date.now(); ;) {
  const st = (byName('p200-lead') || {}).state;
  if (st === 'trust_wait') { fs.writeFileSync(path.join(DEV, 'p200-need-trust.txt'), `trust question on ${DIR}
`); throw new Error('신뢰 질문'); }
  if (st === 'ready') break;
  if (Date.now() - t0 > 150000) throw new Error(`lead 준비 안 됨: ${st}`);
  await sleep(1000);
}
const child = (n) => log(n, asLead(L.sessionId, TOK, 'child', n, '--model', 'haiku', '--no-wait').trim().slice(0, 200));
child('p200-w1'); await sleep(800);
child('p200-w2'); await sleep(800);
let N = nodes();
const nl = N[L.sessionId], n2 = N[byName('p200-w2').sessionId];
// 줄 끝 바로 아래를 긴 메모로 막는다(다른 나무 대신. 메모도 줄이 피하는 것이다)
const memo = call('memo.create', { workspace: L.workspaceKey, x: n2.x - 120, y: n2.y + n2.h + 80, w: 2000, h: 4000, text: 'blocker (P200 test)' });
log('메모', { x: memo.x, y: memo.y, w: memo.w, h: memo.h });
await sleep(500);
const before = nodes();
child('p200-w3'); await sleep(800);
child('p200-w4'); await sleep(800);
N = nodes();
const n3 = N[byName('p200-w3').sessionId], n4 = N[byName('p200-w4').sessionId];
const out = { lead: nl, w2: n2, memo: { x: memo.x, y: memo.y, w: memo.w, h: memo.h }, w3: n3, w4: n4, w3BelowLeadBottom: n3.y - (nl.y + nl.h), w4BelowLeadBottom: n4.y - (nl.y + nl.h) };
log('자리', out);
fs.writeFileSync(path.join(OUT, `place-${WHAT}.json`), JSON.stringify(out, null, 2));
const memoNow = (board().memos || []).find((m) => m.memoId === memo.memoId);
check('메모는 그대로', memoNow && memoNow.x === memo.x && memoNow.y === memo.y, memoNow);
check('먼저 있던 노드는 그대로', Object.keys(before).every((id) => JSON.stringify(before[id]) === JSON.stringify(N[id])));
if (WHAT === 'after') {
  check('w3: 메모 아래로 가지 않고 메모 오른쪽 새 열, 부모 위 끝', n3.x >= memo.x + memo.w && n3.y === nl.y, n3);
  check('w4: 새 열에서 w3 아래', n4.x === n3.x && n4.y === n3.y + n3.h + 80, n4);
} else {
  check('(고치기 전) w3는 메모 아래', n3.y >= memo.y + memo.h, n3);
}
const { app, page } = await launch({ log, env: ENV, args: [`--remote-debugging-port=${DEBUG}`] });
try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 921));
  await sleep(800);
  await page.evaluate(() => window.__mt.getState().fitAll && window.__mt.getState().fitAll(0));
  await sleep(1500);
  await shot(page, `place-${WHAT}`, log);
} catch (e) { check('예외', false, e.stack); }
finally {
  fs.writeFileSync(path.join(OUT, `place-${WHAT}-results.json`), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((x) => x.ok).length}/${results.length}`);
  await closeApp(app);
}
process.exit(0);
