// P175 창 확인: atrium child --peer로 띄운 세션의 첫 자리와 크기가 정리(P177)와 같다(짝과 같은 크기, 짝 나무 바로 아래). 다른 노드는 옮기지 않는다.
//   lead(haiku)가 하위 w1을 띄우고 정리한 뒤, 동료 p1을 --peer로 띄운다 → 자리·크기 확인 → 다시 정리해도 p1이 그대로인지.
// 판: 따로 띄운 개발용 판(atrium-dev-p175, 47944, backend/.dev)만. 창 원격 디버깅 포트 9424. 시험 폴더 C:\Workspace\mtask-p175-b(새로 만든다).
// 실행: bash backend/.dev/run-clean.sh node app/test/e2e/p175-peer-place.mjs <run|stop>. 결과 experiments/p175/peer-*(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'run';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p175');
const CONVOS = path.join(OUT, 'convos');
const DIR = 'C:\\Workspace\\mtask-p175-b';
const BOARD = 'atrium-dev-p175', PORT = '47944', DEBUG = '9424';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: 'p175',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true }); fs.mkdirSync(DIR, { recursive: true });
const { logger, sleep, launch, closeApp, shot } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
if (ENV.ATRIUM_PORT !== '47944' || ENV.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p175') throw new Error('P175 판(atrium-dev-p175, 47944)만');

const log = logger(`p175-peer-${WHAT}`);
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
const nodes = () => Object.fromEntries(call('board.get').nodes.map((n) => [n.session_id, { x: n.x, y: n.y, w: n.w, h: n.h, size: n.size }]));

if (WHAT === 'stop') {
  try { for (const s of sessions()) { try { atrium('kill', s.sessionId, '--yes', '--delete'); log('끄기', s.name); } catch (e) { log('끄기 실패', s.name, e.message.slice(0, 160)); } } } catch (e) { log('목록 실패', e.message.slice(0, 160)); }
  try { log('터미널 멈춤', atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('터미널 멈춤 실패', e.message.slice(0, 200)); }
  try { log('백엔드 멈춤', atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('백엔드 멈춤 실패', e.message.slice(0, 200)); }
  process.exit(0);
}

try { sessions(); } catch { log('백엔드 띄움', atrium('backend', 'start').trim().slice(-200)); await sleep(1500); }
for (const s of sessions()) { try { atrium('kill', s.sessionId, '--yes', '--delete'); } catch {} }
const L = call('session.spawn', { cwd: DIR, name: 'p175-lead', kind: 'claude', model: 'haiku' });
const TOK = await tokenOf(L.sessionId);
const waitReady = async (names) => {
  const t0 = Date.now();
  for (;;) {
    const ss = sessions(); const st = (n) => (ss.find((s) => s.name === n) || {}).state;
    if (names.some((n) => st(n) === 'trust_wait')) { fs.writeFileSync(path.join(DEV, 'p175-need-trust.txt'), `trust question on ${DIR}\n`); throw new Error('신뢰 질문'); }
    if (names.every((n) => st(n) === 'ready')) return;
    if (Date.now() - t0 > 150000) throw new Error(`준비 안 됨 ${names.map((n) => `${n}=${st(n)}`).join(' ')}`);
    await sleep(1000);
  }
};
await waitReady(['p175-lead']);
log('w1', asLead(L.sessionId, TOK, 'child', 'p175-w1', '--model', 'haiku', '--no-wait').trim().slice(0, 200));
await waitReady(['p175-lead', 'p175-w1']);
log('정리', atrium('arrange', 'mtask-p175-b', '--apply').trim().slice(0, 300));
await sleep(800);

const { app, page } = await launch({ log, args: [`--remote-debugging-port=${DEBUG}`] });
try {
  await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
  const fit = async () => { await page.evaluate(() => window.__mt.getState().fitAll && window.__mt.getState().fitAll(0)); await sleep(900); };
  await fit();
  await shot(page, 'peer-0-before', log);
  const before = nodes();
  log('p1', asLead(L.sessionId, TOK, 'child', 'p175-p1', '--peer', '--model', 'haiku', '--no-wait').trim().slice(0, 200));
  await waitReady(['p175-lead', 'p175-w1', 'p175-p1']);
  const lead = byName('p175-lead'), w1 = byName('p175-w1'), p1 = byName('p175-p1');
  const now = nodes();
  const nl = now[lead.sessionId], nw = now[w1.sessionId], np = now[p1.sessionId];
  check('동료 크기 = 짝(lead) 크기 단계', np && np.size === nl.size && np.w === nl.w && np.h === nl.h, { lead: nl, p1: np });
  check('동료는 짝과 같은 열', np.x === nl.x, { lead: nl.x, p1: np.x });
  check('동료는 짝의 나무 아래', np.y >= Math.max(nl.y + nl.h, nw.y + nw.h), { p1: np.y, treeBottom: Math.max(nl.y + nl.h, nw.y + nw.h) });
  check('다른 노드는 그대로', [lead, w1].every((s) => JSON.stringify(before[s.sessionId]) === JSON.stringify(now[s.sessionId])), { before: [before[lead.sessionId], before[w1.sessionId]], now: [nl, nw] });
  await fit();
  await shot(page, 'peer-1-spawned', log);
  log('다시 정리', atrium('arrange', 'mtask-p175-b', '--apply').trim().slice(0, 300));
  await sleep(1000);
  const after = nodes()[p1.sessionId];
  check('다시 정리해도 동료 자리·크기 그대로', JSON.stringify(after) === JSON.stringify(np), { spawned: np, arranged: after });
  await fit();
  await shot(page, 'peer-2-arranged', log);
} catch (e) { check('예외', false, e.stack); }
finally {
  fs.writeFileSync(path.join(OUT, 'peer-results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((x) => x.ok).length}/${results.length}`);
  await closeApp(app);
}
process.exit(0);
