// P269 창 시험: rig를 걷어 낸 판이 옛 판 데이터(잠든 rig 역할 세션·빌더, bypassPermissions, 설정 파일의 rig 거절 규칙)로 처음 뜨면
//   그 세션들을 보통 세션으로 한 번 바꾸고, 캔버스·세션 맵·사이드바·영역 메뉴에 rig 흔적이 없다. 그림 ko.
// 판: 따로 띄운 개발용 판(atrium-dev-p269, 48019, backend/.dev)만. 창의 원격 디버깅 포트 9500. 한 번에 한 창만(메모리).
//   seed는 판이 꺼진 채 backend/.dev/data/board.db에 옛 판을 흉내 낸다(시험 폴더 C:\Workspace\mtask-p269-a, 지어낸 세션 ID·이름, 대화는 띄우지 않는다).
// 실행: node app/test/e2e/p269-retire.mjs <seed|check|pc|stop>. 결과는 워크트리의 experiments/p269/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'check';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p269');
const CONVOS = path.join(REPO, 'experiments', 'p269', 'convos');
const DIR = 'C:\\Workspace\\mtask-p269-a';
const BOARD = 'atrium-dev-p269', PORT = '48019', DEBUG = '9500';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p269-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger(`p269-${WHAT}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const flag = (args, f) => { const i = (args || []).indexOf(f); return i < 0 ? null : args[i + 1]; };
const ROLES = [['p269-data', 'data'], ['p269-ideas', 'ideas'], ['p269-builder', '@builder']];

// 옛 판 흉내: 판이 꺼진 채 DB에 잠든 역할 세션 셋(rig_role 열, bypassPermissions, rig 설정 파일)과 .atrium/rig.json
async function seed() {
  fs.mkdirSync(path.join(DIR, '.atrium'), { recursive: true });
  fs.writeFileSync(path.join(DIR, '.atrium', 'rig.json'), JSON.stringify({ version: 3, name: 'old', roles: { data: { owns: ['data/'] }, ideas: { owns: ['ideas/'] } } }, null, 2));
  const { Store } = await import(toUrl(path.join(REPO, 'backend', 'src', 'store.mjs')));
  const { workspaceOf } = await import(toUrl(path.join(REPO, 'backend', 'src', 'git.mjs')));
  const { writeSessionSettings, buildResumeArgv } = await import(toUrl(path.join(REPO, 'backend', 'src', 'launch.mjs')));
  const { newRuntime } = await import(toUrl(path.join(REPO, 'backend', 'src', 'state.mjs')));
  const dataDir = ENV.ATRIUM_DATA_DIR;
  const st = new Store(path.join(dataDir, 'board.db'));
  const ws = await workspaceOf(DIR);
  if (!st.getWorkspace(ws.key)) st.insertWorkspace({ ...ws, createdAt: Date.now() });
  const have = st.db.prepare('PRAGMA table_info(sessions)').all().some((c) => c.name === 'rig_role');
  if (!have) st.db.exec('ALTER TABLE sessions ADD COLUMN rig_role TEXT');
  const deny = ['Edit(/c/workspace/mtask-p269-a/.atrium/rig.json)', ...['cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe'].map((x) => `Bash(${x}:*)`)];
  for (const [name, role] of ROLES) {
    const sessionId = crypto.randomUUID();
    const settingsPath = writeSessionSettings({ file: path.join(dataDir, 'sessions', `${sessionId}.json`), hookUrl: `http://127.0.0.1:${PORT}/hooks/claude`, token: 'x'.repeat(48), sessionId, amp: { deny, hooks: { PreToolUse: { timeout: 10 } }, permissions: { disableAutoMode: 'disable' } } });
    const rt = newRuntime({ kind: 'claude', hooked: true });
    rt.sleep = { at: Date.now() - 60000, by: 'rig', scope: 'session', convId: sessionId };
    const resumeArgv = buildResumeArgv({ claudeCommand: 'claude', sessionId, settingsPath, permissionMode: 'bypassPermissions', model: 'haiku', effort: null, extraArgs: [] });
    st.insertSession({ sessionId, name, cwd: DIR, paneId: null, termWorkspaceId: null, agentName: name, model: 'haiku', effort: null, permissionMode: 'bypassPermissions', settingsPath, hookToken: 'x'.repeat(48), resumeArgv, createdAt: Date.now(), touchedAt: Date.now(), runtime: rt, kind: 'claude', origin: 'board', parentSessionId: null, workspaceKey: ws.key, flavor: null, extraArgs: [], startCommand: '', harnessPlan: null });
    st.db.prepare('UPDATE sessions SET rig_role = ? WHERE session_id = ?').run(role, sessionId);
    log(`seed ${name} (${role}) ${sessionId}`);
  }
  st.close();
}

async function checkBoard() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(2500);
  const list = call('session.list');
  for (const [name] of ROLES) {
    const s = list.find((x) => x.name === name);
    if (!s) { check(`${name} 판에 있다`, false); continue; }
    const g = call('session.get', { session: s.sessionId });
    const j = JSON.parse(fs.readFileSync(g.settingsPath, 'utf8'));
    const p = j.permissions || {};
    check(`${name}: 권한 모드 보통(manual)`, g.permissionMode === 'manual', g.permissionMode);
    check(`${name}: 이어 가기 명령에 bypass 없음`, flag(g.resumeArgv, '--permission-mode') === 'manual' && !(g.resumeArgv || []).includes('bypassPermissions'), g.resumeArgv);
    check(`${name}: 설정 파일에 rig 거절 규칙·auto 끄기 없음, 판 hook은 보통 시간 제한`, !p.deny && p.disableAutoMode === undefined && Object.values(j.hooks).every((l) => l.every((x) => x.hooks.every((h) => h.timeout === 2))), p);
    check(`${name}: 세션 요약에 rigRole 칸 없음`, !('rigRole' in s), Object.keys(s).filter((k) => /rig/i.test(k)));
  }
  let rigApi = null; try { call('rig.status', { workspace: DIR }); rigApi = 'ok'; } catch (e) { rigApi = String(e.message).slice(0, 160); }
  check('판 API rig.status가 없다', rigApi !== 'ok', rigApi);
  const log2 = fs.readFileSync(path.join(ENV.ATRIUM_DATA_DIR, 'logs', 'backend.log'), 'utf8').split('\n').filter((l) => /old rig roles/.test(l));
  check('판 기록에 옛 역할 세션 바꾸기 한 줄', log2.length === 1, log2);
  fs.writeFileSync(path.join(OUT, 'check.json'), JSON.stringify(results, null, 2));
}

async function pc() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
  try {
    call('settings.set', { key: 'language', value: 'ko' }); await sleep(1200);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    await sleep(2500);
    const dom = () => page.evaluate(() => ({ rig: document.querySelectorAll('[class*="mt-rig"], [class*="rig7"], [data-role^="rm-"], [data-role="rig-status"], [data-role="pl-rig"], .react-flow__edge-path.rig, .mt-badge.rig').length, txt: /\brig\b/i.test(document.body.innerText) }));
    await page.screenshot({ path: path.join(OUT, 'canvas-ko.png') }); log('그림 canvas-ko.png');
    let d = await dom(); check('캔버스·사이드바에 rig 흔적 없음', !d.rig && !d.txt, d);
    // 영역 메뉴(이름표 오른쪽 클릭)
    const head = await page.$('[data-role="region-head"], .mt-region-head');
    if (head) { await head.click({ button: 'right' }).catch(() => {}); await sleep(600); await page.screenshot({ path: path.join(OUT, 'region-menu-ko.png') }); d = await dom(); check('영역 메뉴에 rig 줄 없음', !(await page.$('[data-role="rig-status"], [data-action="rig-panel"], [data-action="rig-builder"]')) && !d.txt, d); await page.keyboard.press('Escape'); }
    else log('영역 이름표를 찾지 못했다(메뉴 그림 없음)');
    await page.click('[data-action="mission-rail"]').catch(() => {});
    await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 }).catch(() => {});
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, 'map-ko.png') }); log('그림 map-ko.png');
    d = await dom();
    const cards = await page.evaluate(() => [...document.querySelectorAll('[data-role="mission"] .mt-ta-card')].map((e) => e.dataset.name));
    check('세션 맵: 옛 역할 세션이 보통 카드로 보이고 rig 묶음·꼬리표 없음', !d.rig && !d.txt && ['p269-data', 'p269-ideas', 'p269-builder'].every((n) => cards.includes(n)), { d, cards });
    fs.writeFileSync(path.join(OUT, 'pc.json'), JSON.stringify(results, null, 2));
  } finally { await closeApp(app); }
}

async function stopBoard() {
  for (const s of call('session.list').filter((x) => /^p269-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(1500);
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'seed') await seed();
  else if (WHAT === 'check') await checkBoard();
  else if (WHAT === 'pc') await pc();
  else if (WHAT === 'stop') await stopBoard();
} finally {
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length}`);
  if (bad.length) process.exitCode = 1;
}
