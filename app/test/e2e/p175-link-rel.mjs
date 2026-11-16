// P175 창 시험: 판에서 두 세션을 이을 때 하위 / 동료를 고른다.
//   A → B: 손잡이를 끌어 잇고 상자에서 동료를 고름 → 역할 이름이 동료로, 판·선 이름표·세션 맵에서 동료.
//   A → C: 상자 기본(하위) 그대로 → 자동 하위, 세션 맵에서 A 아래.
//   A → B 선 기록의 토글로 하위로 바꿈 → 사람이 정한 하위.
// 판: 따로 띄운 개발용 판(atrium-dev-p175, 47944, backend/.dev)만 쓴다. 창 원격 디버깅 포트 9424. 한 번에 한 창만(메모리).
//   A·B·C 모두 claude --model haiku. 시험 폴더 C:\Workspace\mtask-p175-a(새로 만든다).
// 실행: bash backend/.dev/run-clean.sh node app/test/e2e/p175-link-rel.mjs <run|stop>
// 결과는 워크트리의 experiments/p175/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'run';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p175');
const CONVOS = path.join(OUT, 'convos');
const DIR = 'C:\\Workspace\\mtask-p175-a';
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

const log = logger(`p175-${WHAT}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 800)}` : ''}`); };
const sessions = () => call('session.list');

if (WHAT === 'stop') {
  try { for (const s of sessions()) { try { log('끄기', atrium('kill', s.sessionId, '--yes', '--delete').trim().split('\n').slice(-1)[0]); } catch (e) { log('끄기 실패', s.name, e.message.slice(0, 160)); } } } catch (e) { log('목록 실패', e.message.slice(0, 160)); }
  try { log('터미널 멈춤', atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('터미널 멈춤 실패', e.message.slice(0, 200)); }
  try { log('백엔드 멈춤', atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('백엔드 멈춤 실패', e.message.slice(0, 200)); }
  process.exit(0);
}

// ---- 세션 셋(서로 계보 없음) ----
try { sessions(); } catch { log('백엔드 띄움', atrium('backend', 'start').trim().slice(-200)); await sleep(1500); }
for (const s of sessions()) { try { atrium('kill', s.sessionId, '--yes', '--delete'); } catch {} }
const A = call('session.spawn', { cwd: DIR, name: 'p175-a', kind: 'claude', model: 'haiku' });
const B = call('session.spawn', { cwd: DIR, name: 'p175-b', kind: 'claude', model: 'haiku' });
const C = call('session.spawn', { cwd: DIR, name: 'p175-c', kind: 'claude', model: 'haiku' });
log(`A ${A.sessionId} B ${B.sessionId} C ${C.sessionId}`);
const t0 = Date.now();
for (;;) {
  const ss = sessions();
  const st = (n) => (ss.find((s) => s.name === n) || {}).state;
  if (['p175-a', 'p175-b', 'p175-c'].some((n) => st(n) === 'trust_wait')) { fs.writeFileSync(path.join(DEV, 'p175-need-trust.txt'), `trust question on ${DIR}\n`); throw new Error('신뢰 질문'); }
  if (['p175-a', 'p175-b', 'p175-c'].every((n) => st(n) === 'ready')) break;
  if (Date.now() - t0 > 120000) throw new Error('준비 안 됨');
  await sleep(1000);
}
const linkOf = (f, t) => call('link.list').find((l) => l.from === f && l.to === t) || null;

const { app, page } = await launch({ log, args: [`--remote-debugging-port=${DEBUG}`] });
const fit = async () => { await page.evaluate(() => window.__mt.getState().fitAll && window.__mt.getState().fitAll(0)); await sleep(900); };
// 손잡이를 끌어 from → to를 잇는다(p4-f2와 같은 길)
async function drag(from, to) {
  await fit();
  const side = await page.evaluate(([fa, fb]) => {
    const st = window.__mt.getState(); const id = (n) => [...st.sessions.values()].find((s) => s.name === n).sessionId;
    const a = st.nodes.get(id(fa)), b = st.nodes.get(id(fb));
    const dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
    return Math.abs(dx) - (a.w + b.w) / 2 >= Math.abs(dy) - (a.h + b.h) / 2 ? (dx >= 0 ? ['r', 'l'] : ['l', 'r']) : (dy >= 0 ? ['b', 't'] : ['t', 'b']);
  }, [from, to]);
  const hA = await page.locator(`.mt-node[data-name="${from}"] .react-flow__handle.h-${side[0]}`).boundingBox().catch(() => null);
  const hB = await page.locator(`.mt-node[data-name="${to}"] .react-flow__handle.h-${side[1]}`).boundingBox().catch(() => null);
  if (hA && hB) {
    await page.mouse.move(hA.x + hA.width / 2, hA.y + hA.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(hA.x + (hB.x - hA.x) * i / 12 + hA.width / 2, hA.y + (hB.y - hA.y) * i / 12 + hA.height / 2);
    await page.mouse.up();
  }
  const ok = await page.waitForSelector('[data-role="link-role"]', { timeout: 4000 }).then(() => true).catch(() => false);
  if (!ok) throw new Error(`손잡이 끌기로 잇는 상자가 안 떴다(${from} → ${to}, ${side.join('→')})`);
  return ok;
}
const toggleOf = (sel) => page.evaluate((s) => { const t = document.querySelector(`${s} [data-role=rel-toggle]`); return t ? { value: t.dataset.value, on: [...t.querySelectorAll('[aria-checked=true]')].map((x) => x.dataset.rel) } : null; }, sel);
// 선 이름표: 덩어리 안이나 먼 배율에서는 점으로 줄어 있어 마우스를 올려 다 보인 뒤 읽는다
const edgeOf = async (linkId) => {
  await page.hover(`.mt-edge-label[data-link="${linkId}"]`, { force: true }).catch(() => {});
  await sleep(400);
  return page.evaluate((id) => { const el = document.querySelector(`.mt-edge-label[data-link="${id}"]`); return el ? { relation: el.dataset.relation || null, kind: el.dataset.kind, level: el.dataset.level, text: el.innerText.replace(/\s+/g, ' ') } : null; }, linkId);
};
// 창 언어(en|ko)에 맞춘 기대 글
const L = { reviewer: /^(Reviewer|리뷰어)$/, peer: /^(peer|동료)$/, peerHelp: /(does not work under|하위가 아닙니다)/, peerWord: /(peer|동료)/, reviewerWord: /(Reviewer|리뷰어)/ };
async function openMap() {
  await page.click('[data-action="mission-rail"]');
  await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 });
  await sleep(1500);
}
async function closeMap() { for (let i = 0; i < 3 && (await page.$('[data-role="mission"]')); i++) { await page.keyboard.press('Escape'); await sleep(400); } }

try {
  await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
  await fit();
  await shot(page, '0-start', log);

  // 1) A → B: 동료를 고른다
  const dragged = await drag('p175-a', 'p175-b');
  check('A → B 손잡이 끌기로 잇는 상자', dragged);
  check('상자 기본은 하위', (await toggleOf('[data-role=link-role]')).value === 'sub');
  check('하위 기본 역할 이름', L.reviewer.test(await page.inputValue('[data-field=role]')), await page.inputValue('[data-field=role]'));
  await shot(page, '1-dialog-sub', log);
  await page.click('[data-role=link-role] [data-rel=peer]');
  await sleep(200);
  check('동료를 고르면 토글이 동료', (await toggleOf('[data-role=link-role]')).value === 'peer');
  check('동료를 고르면 역할 이름이 동료', L.peer.test(await page.inputValue('[data-field=role]')), await page.inputValue('[data-field=role]'));
  check('동료 안내 글', L.peerHelp.test(await page.innerText('[data-role=rel-help]')));
  await shot(page, '2-dialog-peer', log);
  await page.click('[data-action=link-submit]');
  await page.waitForSelector('[data-role="link-role"]', { state: 'detached', timeout: 8000 });
  await sleep(1200);
  const ab = linkOf(A.sessionId, B.sessionId);
  check('판: A → B 선과 동료 관계(사람)', ab && ab.relation && ab.relation.relation === 'peer' && ab.relation.source === 'user', ab && ab.relation);
  check('판: 저장한 역할은 동료', ab && ab.storedRole === '동료', ab && { role: ab.role, storedRole: ab.storedRole });
  const rows = call('relation.list').relations;
  check('판: 관계 줄 하나(peer, user)', rows.length === 1 && rows[0].relation === 'peer' && rows[0].source === 'user', rows);
  await fit();
  const eb = await edgeOf(ab.linkId);
  check('판 선 이름표: 동료', eb && eb.relation === 'peer' && L.peerWord.test(eb.text), eb);
  await shot(page, '3-board-peer', log);

  // 2) A → C: 기본(하위) 그대로
  await drag('p175-a', 'p175-c');
  check('A → C 상자 기본 하위', (await toggleOf('[data-role=link-role]')).value === 'sub');
  await page.click('[data-action=link-submit]');
  await page.waitForSelector('[data-role="link-role"]', { state: 'detached', timeout: 8000 });
  await sleep(1200);
  const ac = linkOf(A.sessionId, C.sessionId);
  check('판: A → C 자동 하위(관계 줄 없음)', ac && ac.relation && ac.relation.relation === 'sub' && ac.relation.source === 'auto' && ac.relation.up === A.sessionId, ac && ac.relation);
  check('판: 관계 줄은 여전히 하나', call('relation.list').relations.length === 1);
  await fit();
  const ec = await edgeOf(ac.linkId);
  check('판 선 이름표: 리뷰어(하위)', ec && ec.relation === 'sub' && L.reviewerWord.test(ec.text), ec);
  await shot(page, '4-board-peer-and-sub', log);

  // 3) 세션 맵: B는 A의 동료, C는 A 아래
  await openMap();
  const map = await page.evaluate(() => {
    const m = document.querySelector('[data-role="mission"]');
    return { text: m.innerText.replace(/\s+/g, ' ').slice(0, 600) };
  });
  const g = call('mission.graph');
  const node = (id) => (g.nodes || []).find((n) => n.id === `s:${id}` || n.id === id) || {};
  const nb = node(B.sessionId), nc = node(C.sessionId);
  check('세션 맵 그래프: B의 동료에 A', (nb.peers || []).some((p) => String(p).includes(A.sessionId)), { peers: nb.peers, parentId: nb.parentId });
  // 자동 하위(역할 선)는 일 부모를 만들지 않고 선의 관계로 A 아래(Level 1)에 놓인다(P156 자동 규칙 그대로)
  const ecMap = (g.edges || []).find((e) => String(e.from).includes(A.sessionId) && String(e.to).includes(C.sessionId) && e.kind === 'role');
  check('세션 맵 그래프: A → C 선은 하위(자동)', ecMap && ecMap.relation === 'sub' && ecMap.relationSource === 'auto' && String(ecMap.relationUp).includes(A.sessionId), ecMap && { relation: ecMap.relation, source: ecMap.relationSource, nc: nc.parentId });
  log('세션 맵 글', map.text);
  await shot(page, '5-map-peer-and-sub', log);
  await closeMap();

  // 4) A → B 선 기록의 토글로 하위로
  await fit();
  await page.click(`.mt-edge-label[data-link="${ab.linkId}"]`);
  await page.waitForSelector('[data-role=link-panel]', { timeout: 5000 });
  check('선 기록 토글: 동료', (await toggleOf('[data-role=link-panel]')).value === 'peer');
  await shot(page, '6-panel-peer', log);
  await page.click('[data-role=link-panel] [data-rel=sub]');
  await sleep(1500);
  const ab2 = linkOf(A.sessionId, B.sessionId);
  check('선 기록에서 하위로: 사람이 정한 하위', ab2.relation.relation === 'sub' && ab2.relation.source === 'user' && ab2.relation.up === A.sessionId, ab2.relation);
  check('선 기록 토글: 하위', (await toggleOf('[data-role=link-panel]')).value === 'sub');
  check('하위가 되면 역할 이름(동료) 보임', ab2.role === '동료', ab2.role);
  await shot(page, '7-panel-sub', log);
  await page.click('[data-role=link-panel] .mt-x'); await sleep(400);
  await openMap();
  const g2 = call('mission.graph');
  const nb2 = (g2.nodes || []).find((n) => String(n.id).includes(B.sessionId)) || {};
  check('세션 맵 그래프: B의 일 부모는 A', String(nb2.parentId || '').includes(A.sessionId), { parentId: nb2.parentId, peers: nb2.peers });
  await shot(page, '8-map-both-sub', log);
  await closeMap();
} catch (e) { check('예외', false, e.stack); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((x) => x.ok).length}/${results.length}`);
  await closeApp(app);
}
process.exit(0);
