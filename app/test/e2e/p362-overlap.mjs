// P362 창 시험: 새 세션 겹침과 손 크기 노드의 자리. 같은 순서로 세 장면을 띄우고(셸 세션에 하위 기록을 줘서 판 배치 코드를 그대로 탄다)
// 겹친 노드를 빨간 테두리로 표시해 장면마다 찍는다. 고치기 전 그림은 고치기 전 백엔드 코드로 같은 스크립트를 돌린다(round before).
//   a) 띄우기 겹침: 리드·동료·하위를 띄우고 사람이 하위 하나를 끌어 옮긴(핀) 뒤 다른 리드의 하위를 띄운다(옛 코드는 밀린 뿌리가 핀 위에 섰다)
//   b) 손 크기: 리드를 테두리 끌기로 넓히고 하위를 하나 더 띄운다(옛 코드는 넓어진 리드가 하위 열을 덮고, 덮인 하위가 줄 밖으로 빠졌다)
//   c) 손 크기 노드가 밀기와 정리를 따르고 핀 노드는 그대로: 하위 하나를 키우고(손 크기) 셸 하나를 끌어 옮긴 뒤(핀) 앞 하위를 키우고, 정리한다
// 판: 따로 띄운 개발용 판(atrium-dev-p362, 48107, backend/.dev/data-<round>)만. 창의 원격 디버깅 포트 9588. 한 번에 한 창.
// 실행: node app/test/e2e/p362-overlap.mjs <run|stop> <before|after>. 결과는 experiments/p362/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'run';
const ROUND = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p362', ROUND);
const BOARD = 'atrium-dev-p362', PORT = '48107', DEBUG = '9588';
const DIRS = { a: 'C:\\Workspace\\mtask-p362-a', b: 'C:\\Workspace\\mtask-p362-b', c: 'C:\\Workspace\\mtask-p362-c' };
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, `data-${ROUND}`), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p362', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p362-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger(`p362-${WHAT}-${ROUND}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }

// ---- 판 조작(API) ----
const ids = new Map(); // 이름 → 세션 ID
let order = 0;
function spawn(scene, name, { parent = null, peer = false } = {}) {
  const pid = parent ? ids.get(parent) : null;
  const r = call('session.spawn', { cwd: DIRS[scene], kind: 'shell', name, ...(pid ? { parentSessionId: pid, branch: { role: 'worker', depth: 2, by: pid, at: Date.now(), order: ++order, ...(peer ? { relation: 'peer' } : {}) } } : {}) });
  ids.set(name, r.sessionId);
  if (peer) call('relation.set', { a: pid, b: r.sessionId, relation: 'peer' }); // atrium child --peer처럼 띄운 뒤 동료로
  return r.sessionId;
}
const nodes = () => call('board.get', {}).nodes;
const nodeOf = (name) => nodes().find((n) => n.session_id === ids.get(name));
const setNode = (name, rect, cause) => { const n = nodeOf(name); call('board.setNode', { session: ids.get(name), x: Math.round(rect.x ?? n.x), y: Math.round(rect.y ?? n.y), w: Math.round(rect.w ?? n.w), h: Math.round(rect.h ?? n.h), z: 0, cause }); };
const ov = (a, c) => a.x < c.x + c.w - 1 && c.x < a.x + a.w - 1 && a.y < c.y + c.h - 1 && c.y < a.y + a.h - 1;
// 장면의 겹친 노드 쌍(이름)
function clashes(scene) {
  const mine = [...ids].filter(([n]) => n.startsWith(scene + '-'));
  const byId = new Map(nodes().map((n) => [n.session_id, n]));
  const out = [];
  for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) { const a = byId.get(mine[i][1]), c = byId.get(mine[j][1]); if (a && c && ov(a, c)) out.push(`${mine[i][0]}|${mine[j][0]}`); }
  return out;
}
const rects = (scene) => Object.fromEntries([...ids].filter(([n]) => n.startsWith(scene + '-')).map(([n, id]) => { const r = nodes().find((x) => x.session_id === id); return [n, r ? [r.x, r.y, r.w, r.h] : null]; }));

function sceneA() {
  // 무작위 시험 씨앗 163(backend/test/p362-fuzz.mjs)과 같은 차례. 자리는 첫 리드 자리를 원점(40, 112)으로 본 값
  spawn('a', 'a-s0');
  const o = nodeOf('a-s0');
  const dx = o.x - 40, dy = o.y - 112;
  spawn('a', 'a-s1', { parent: 'a-s0', peer: true });
  spawn('a', 'a-s2', { parent: 'a-s0' });
  spawn('a', 'a-s3', { parent: 'a-s1' });
  spawn('a', 'a-s4', { parent: 'a-s1' });
  spawn('a', 'a-s5');
  spawn('a', 'a-s6');
  spawn('a', 'a-s7', { parent: 'a-s3' });
  setNode('a-s4', { x: 681 + dx, y: 4610 + dy }, 'drag'); // 사람이 끌어 옮긴다(핀)
  const pin = nodeOf('a-s4');
  check(`[a] 띄우기 전 겹침 없음`, !clashes('a').length, clashes('a'));
  spawn('a', 'a-s9', { parent: 'a-s6' });
  const after = nodeOf('a-s4');
  check(`[a] 새 하위를 띄운 뒤 겹침 없음`, !clashes('a').length, { clashes: clashes('a'), rects: rects('a') });
  check(`[a] 핀 노드는 그대로`, pin.x === after.x && pin.y === after.y, { before: [pin.x, pin.y], after: [after.x, after.y] });
}
function sceneB() {
  spawn('b', 'b-L');
  for (let i = 0; i < 3; i++) spawn('b', `b-k${i}`, { parent: 'b-L' });
  const L = nodeOf('b-L');
  setNode('b-L', { w: L.w + 700, h: L.h + 200 }, 'resize'); // 창의 테두리 끌기(손 크기)
  spawn('b', 'b-k3', { parent: 'b-L' });
  const L2 = nodeOf('b-L');
  check(`[b] 리드를 넓힌 뒤 겹침 없음`, !clashes('b').length, { clashes: clashes('b'), rects: rects('b') });
  check(`[b] 하위는 모두 리드 오른쪽(줄)`, ['b-k0', 'b-k1', 'b-k2', 'b-k3'].every((n) => nodeOf(n).x >= L2.x + L2.w), rects('b'));
  check(`[b] 리드는 손 크기, 핀 아님`, !!L2.hand && L2.w === L.w + 700, { hand: L2.hand });
}
function sceneC() {
  spawn('c', 'c-M');
  for (let i = 0; i < 3; i++) spawn('c', `c-m${i}`, { parent: 'c-M' });
  spawn('c', 'c-pin');
  const m1 = nodeOf('c-m1');
  setNode('c-m1', { w: m1.w + 500, h: m1.h + 300 }, 'resize'); // 손 크기
  const big = nodeOf('c-m1');
  const p = nodeOf('c-pin');
  setNode('c-pin', { x: p.x + p.w + 400, y: p.y }, 'drag'); // 핀
  const pin = nodeOf('c-pin');
  return { big, pin, before: nodeOf('c-m1') };
}
function sceneC2(c) {
  const m0 = nodeOf('c-m0');
  setNode('c-m0', { w: m0.w + 400, h: m0.h + 500 }, 'resize'); // 앞 하위가 커진다 → 뒤 하위(손 크기)가 밀린다
  const m1 = nodeOf('c-m1');
  check(`[c] 손 크기 노드도 밀린다`, m1.y > c.before.y, { before: c.before.y, after: m1.y });
  check(`[c] 손 크기는 그대로`, m1.w === c.big.w && m1.h === c.big.h, { w: m1.w, h: m1.h });
  const pin = nodeOf('c-pin');
  check(`[c] 핀 노드는 그대로`, pin.x === c.pin.x && pin.y === c.pin.y);
  check(`[c] 겹침 없음`, !clashes('c').length, clashes('c'));
}
function sceneC3(c) {
  const ws = call('workspace.list', {}).workspaces.find((w) => path.resolve(w.root || '') === path.resolve(DIRS.c));
  call('board.arrange', { workspace: ws.key, apply: true });
  const m1 = nodeOf('c-m1');
  check(`[c] 정리는 손 크기를 지킨다`, m1.w === c.big.w && m1.h === c.big.h, { w: m1.w, h: m1.h });
  check(`[c] 정리 뒤 겹침 없음`, !clashes('c').length, clashes('c'));
}

// 장면 하나를 화면에 맞추고 겹친 노드를 빨갛게 둘러 찍는다
async function shotScene(page, scene, name) {
  const want = [...ids].filter(([n]) => n.startsWith(scene + '-')).map(([, id]) => id);
  const bad = new Set(clashes(scene).flatMap((x) => x.split('|')).map((n) => ids.get(n)));
  await page.evaluate(({ want, bad }) => {
    document.querySelectorAll('.p362-bad').forEach((e) => e.classList.remove('p362-bad'));
    if (!document.getElementById('p362-css')) { const st = document.createElement('style'); st.id = 'p362-css'; st.textContent = '.p362-bad { outline: 6px solid #e5484d !important; outline-offset: -3px; } .mt-dq, .mt-cmd, .mt-chips, [data-role=usage-credit-pill] { visibility: hidden !important; }'; document.head.appendChild(st); }
    for (const id of bad) { const e = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`); if (e) e.classList.add('p362-bad'); }
    window.__mtFlow.fitView({ nodes: want.map((id) => ({ id })), padding: 0.12, duration: 0 });
  }, { want, bad: [...bad] });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  log(`그림 ${name}.png 겹침 ${bad.size ? [...bad].length : 0}`);
}

async function run() {
  for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  call('settings.set', { key: 'usageProbe', value: false });
  sceneA();
  sceneB();
  const c = sceneC();
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    await shotScene(page, 'a', `p362-${ROUND}-a-spawn`);
    await shotScene(page, 'b', `p362-${ROUND}-b-handsize-lead`);
    await shotScene(page, 'c', `p362-${ROUND}-c1-handsize-pin`);
    sceneC2(c); await sleep(1500);
    await shotScene(page, 'c', `p362-${ROUND}-c2-pushed`);
    sceneC3(c); await sleep(1500);
    await shotScene(page, 'c', `p362-${ROUND}-c3-arranged`);
  } finally { await closeApp(app); }
  fs.writeFileSync(path.join(OUT, 'rects.json'), JSON.stringify({ a: rects('a'), b: rects('b'), c: rects('c') }, null, 1));
}

async function stopAll() {
  for (const s of call('session.list')) if (/^[abc]-/.test(s.name)) try { atrium('kill', s.name, '--yes'); } catch (e) { log('kill ' + e.message.slice(0, 120)); }
  try { log(atrium('terminal', 'stop', '--yes')); } catch (e) { log('terminal stop ' + e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop')); } catch (e) { log('backend stop ' + e.message.slice(0, 200)); }
}

try {
  if (WHAT === 'run') await run();
  else if (WHAT === 'stop') await stopAll();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p362-${WHAT}-results.json`), JSON.stringify(results, null, 1));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
}
