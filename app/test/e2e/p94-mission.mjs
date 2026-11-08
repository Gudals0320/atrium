// P94 창 시험: 미션 맵의 역할과 관계(PC 창, PC 웹, 휴대폰). 한 번에 한 화면만 돌린다(메모리).
// 판: 따로 띄운 개발용 판(atrium-dev-p94, 47894, backend/.dev)만 쓴다. 흉내 원격(p59-lib.mjs, ts-sim-proxy.mjs) 47883.
//   워크스페이스 4개(mtask-p94-a·b·c·d), 가상 그룹 product(a, b).
//   리드 A p94-lead(haiku, 권한 질문 = 응답 필요): 하위 p94-rev(haiku, reviewer, ping = 일함), 역할 선 p94-ui(ui worker)·p94-tests(test runner, ping 도는 셸)·p94-build(build worker)·p94-copy(copy writer)
//   리드 B p94-lead2(haiku, 쉼): 하위 p94-port(haiku, porter, 다른 워크스페이스 c, ping = 일함), 역할 선 p94-notes(notes)
//   p94-rev → p94-ui(review, 나무 밖 역할 선), p94-rev → p94-old(haiku, archive, 워크스페이스 d를 잠재운다), p94-docs(연결 없음). 세션 11개(haiku 4개).
// 큰 판은 페이지 안에서 mission.graph 답에 흉내 세션 25개를 더한다(36개).
// 실행(이 변수들을 지운 셸로): sh backend/.dev/clean-env.sh node app/test/e2e/p94-mission.mjs <setup|pc|web|webkit|chromium|stop> [before|after]
// 결과는 experiments/p94/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p94');
const CONVOS = path.join(OUT, 'convos');
const DIRS = ['a', 'b', 'c', 'd'].map((k) => `C:\\Workspace\\mtask-p94-${k}`);
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_)/.test(k)) delete process.env[k]; // 실제 판의 값을 물려받지 않는다
process.env.MT_E2E_OUT = 'p94';
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const B0 = L.board({ session: 'atrium-dev-p94', port: 47894, sim: 47883, sim2: 47884 });
const ENV = {
  ATRIUM_HERDR_SESSION: B0.session, ATRIUM_PORT: String(B0.port),
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p94-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: String(B0.port),
  ATRIUM_WEB_HOSTS: `${NAME}:${B0.sim},localhost:${B0.sim}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
for (const d of DIRS) fs.mkdirSync(d, { recursive: true });
const { logger, sleep, until, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const { chromium, webkit } = await import('playwright');
// 받아 둔 Chromium(P89와 같이 ms-playwright 폴더에서 고른다)
const chromeExe = (() => { const d = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'); try { return fs.readdirSync(d).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(d, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const launchChromium = () => chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : { channel: 'chromium' }) });

const log = logger(`p94-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const sessions = () => call('session.list');
const byName = (n) => sessions().find((s) => s.name === n);
const shot = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const overlap = (ns) => { for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) { const a = ns[i], b = ns[j]; if (a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1) return `${a.name}↔${b.name}`; } return null; };

// ---- 판 ----
const LONG = (n) => `Use the Bash tool to run this command in the foreground, not in the background, with timeout 600000: ping -n ${n} 127.0.0.1 . Wait for it to finish. Then reply with the single word done.`;
const ASK = 'Use the Bash tool to run exactly: mkdir p94-ask-dir . Then reply with the single word done.';
const envOf = (name) => {
  const s = byName(name);
  const settings = JSON.parse(fs.readFileSync(path.join(ENV.ATRIUM_DATA_DIR, 'sessions', `${s.sessionId || s.id}.json`), 'utf8'));
  const e = { ...process.env, ...Object.fromEntries(Object.entries(settings.env || {}).filter(([k]) => k.startsWith('ATRIUM_'))) };
  if (!e.ATRIUM_SESSION_ID || !e.ATRIUM_SESSION_TOKEN) throw new Error(`${name}: 설정 파일에 세션 env가 없다`);
  return e;
};
const child = (pe, args, ms = 150000) => new Promise((resolve) => execFile(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium-child.mjs'), ...args], { encoding: 'utf8', env: pe, timeout: ms }, (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, out: `${stdout || ''}${stderr || ''}`.trim() })));
const trustStop = () => {
  const tr = sessions().find((s) => /^p94-/.test(s.name) && s.state === 'trust_wait');
  if (tr) { fs.writeFileSync(path.join(DEV, 'p94-need-trust.txt'), `${tr.name} asks the folder trust question in a test folder\n`); throw new Error('trust question (backend/.dev/p94-need-trust.txt)'); }
};
const readyOf = (n, ms = 150000) => until(() => { const s = byName(n); return s && ['ready', 'working', 'waiting', 'trust_wait'].includes(s.state) ? s : null; }, ms, 1500).catch(() => null);

async function setupBoard() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  const st0 = call('settings.get').settings;
  if (st0.remotePasskey !== false) call('settings.set', { remotePasskey: false });
  if (st0.remoteAccess === false) call('settings.set', { remoteAccess: true });
  for (const d of [DIRS[0], DIRS[1], DIRS[2]]) {
    fs.mkdirSync(path.join(d, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(d, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['Bash(ping:*)', 'Bash(ping *)'] } }, null, 1)); // ping만 묻지 않는다(P85)
  }
  const spawnIn = (dir, ...a) => JSON.parse(atrium('--json', 'spawn', dir, ...a));
  if (!byName('p94-lead')) spawnIn(DIRS[0], '--model', 'haiku', '--name', 'p94-lead');
  if (!byName('p94-lead2')) spawnIn(DIRS[1], '--model', 'haiku', '--name', 'p94-lead2');
  if (!byName('p94-old')) spawnIn(DIRS[3], '--model', 'haiku', '--name', 'p94-old'); // 셸은 잠들지 않으므로 haiku(잠재우면 메모리도 돌려준다)
  for (const [n, wi] of [['p94-ui', 0], ['p94-tests', 0], ['p94-build', 0], ['p94-copy', 0], ['p94-notes', 1], ['p94-docs', 2]]) if (!byName(n)) spawnIn(DIRS[wi], '--kind', 'shell', '--name', n);
  await readyOf('p94-lead'); await readyOf('p94-lead2'); await readyOf('p94-old'); trustStop();
  if (!byName('p94-rev')) log('child rev', (await child(envOf('p94-lead'), ['child', 'p94-rev', '--role', 'reviewer', '--model', 'haiku', '--no-wait'])).out.slice(0, 300));
  if (!byName('p94-port')) log('child port', (await child(envOf('p94-lead2'), ['child', 'p94-port', '--role', 'porter', '--cwd', DIRS[2].replace(/\\/g, '/'), '--model', 'haiku', '--no-wait'])).out.slice(0, 300));
  await readyOf('p94-rev'); await readyOf('p94-port'); trustStop();
  const linked = (a, b) => call('link.list').some((l) => l.from === byName(a).sessionId && l.to === byName(b).sessionId && l.role);
  for (const [a, b, role] of [['p94-lead', 'p94-ui', 'ui worker'], ['p94-lead', 'p94-tests', 'test runner'], ['p94-lead', 'p94-build', 'build worker'], ['p94-lead', 'p94-copy', 'copy writer'], ['p94-lead2', 'p94-notes', 'notes'], ['p94-rev', 'p94-ui', 'review'], ['p94-rev', 'p94-old', 'archive']]) {
    try { if (!linked(a, b)) atrium('link', a, b, '--role', role); } catch (e) { log(`연결 ${a} → ${b} ${e.message.slice(0, 120)}`); }
  }
  // 가상 그룹 product(a, b)
  try {
    const gs = call('group.list');
    const list = gs.groups || gs;
    if (!(Array.isArray(list) && list.some((g) => g.name === 'product'))) call('group.create', { name: 'product', workspaces: [DIRS[0], DIRS[1]] });
  } catch (e) { log(`가상 그룹 ${e.message.slice(0, 160)}`); }
  await sleep(3000);
  // 워크스페이스 d를 잠재운다(p94-old가 잠듦)
  try { if (byName('p94-old').state !== 'sleeping') log('sleep d', atrium('sleep', DIRS[3]).slice(0, 200)); } catch (e) { log(`잠재우기 ${e.message.slice(0, 160)}`); }
  await sleep(2000);
}
// 찍기 전에 일하는 것과 묻는 것을 돌린다
async function stir() {
  const tests = byName('p94-tests');
  if (!(tests.shell && tests.shell.atPrompt === false)) atrium('input', 'p94-tests', 'ping -n 3000 127.0.0.1\\r');
  if (byName('p94-rev').state !== 'working') atrium('send', '@p94-rev', LONG(400));
  if (byName('p94-port').state !== 'working') atrium('send', '@p94-port', LONG(400));
  if (byName('p94-lead').state !== 'waiting') atrium('send', '@p94-lead', ASK);
  await until(() => byName('p94-rev').state === 'working' && byName('p94-port').state === 'working' && byName('p94-lead').state === 'waiting' && (byName('p94-tests').shell || {}).atPrompt === false, 150000, 1500).catch(() => {});
  log(`세션 ${sessions().filter((s) => /^p94-/.test(s.name)).map((s) => `${s.name}:${s.state}${s.shell ? `/${s.shell.atPrompt === false ? 'run' : 'idle'}` : ''}${s.branch && s.branch.role ? `(${s.branch.role})` : ''}`).join(' ')}`);
}

// 큰 판: mission.graph 답에 흉내 세션 n개를 더한다(리드 셋, 워커·리뷰어, 손자, 셸, 역할 선, 지시 선, 여러 상태)
const BIG_HOOK = (n) => {
  const api = window.__mt.api;
  if (!api.__p94orig) api.__p94orig = api.call.bind(api);
  const add = (g) => {
    const real = g.nodes.filter((x) => x.kind === 'session');
    const keys = [...new Set(real.map((x) => x.workspaceKey))];
    const nodes = [...g.nodes], edges = [...g.edges];
    const st = ['working', 'ready', 'working', 'waiting', 'ready', 'sleeping', 'ready', 'exited'];
    const roles = ['worker', 'reviewer', 'tests', 'docs', 'worker', 'perf probe'];
    const mk = (i, o) => ({ id: `s:big${i}`, kind: 'session', sessionId: `big${i}`, name: `big-${String(i).padStart(2, '0')}`, agentKind: i % 4 === 3 ? 'shell' : i % 5 === 1 ? 'codex' : 'claude', state: st[i % st.length], category: 'idle', workspaceKey: keys[i % keys.length], parentId: null, role: null, order: i, createdAt: 1e12 + i, loops: 0, ...o });
    const cat = (s) => (s === 'waiting' ? 'needs_you' : s === 'working' ? 'working' : s === 'exited' ? 'exited' : 'idle');
    for (let i = 0; i < n; i++) {
      const lead = i === 0 || i === 10;
      const parent = i >= 1 && i <= 7 ? 's:big0' : i >= 11 && i <= 15 ? 's:big10' : i >= 16 && i <= 18 ? 's:big1' : null;
      const ws = i <= 9 ? keys[0] : i <= 18 ? keys[1 % keys.length] : keys[i % keys.length];
      const node = mk(i, { workspaceKey: ws, parentId: parent, role: parent ? roles[i % roles.length] : null, state: lead ? 'ready' : st[i % st.length] });
      node.category = cat(node.state);
      nodes.push(node);
      if (parent) edges.push({ from: parent, to: node.id, kind: 'spawn', label: null, active: false });
    }
    edges.push({ from: 's:big0', to: 's:big12', kind: 'prompt', label: 'merge the api change first', count: 3, active: true });
    edges.push({ from: 's:big2', to: 's:big3', kind: 'role', label: 'review', active: false });
    edges.push({ from: 's:big10', to: 's:big22', kind: 'role', label: 'docs', active: false });
    return { ...g, nodes, edges };
  };
  api.call = (m, p) => (m === 'mission.graph' ? api.__p94orig(m, p).then(add) : api.__p94orig(m, p));
};

// ---- 지도 읽기(PC) ----
const PC_PROBE = `(() => {
  const m = document.querySelector('[data-role=mission]');
  if (!m) return null;
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const nodes = [...m.querySelectorAll('[data-role=mm-node][data-kind=session]')].map((e) => ({ name: e.dataset.name, rank: e.dataset.rank || null, family: e.dataset.family || null, roleText: (e.querySelector('[data-role=mm-role]') || {}).textContent || null, team: (e.querySelector('[data-role=mm-team]') || {}).textContent || null, recede: e.classList.contains('recede'), hot: e.classList.contains('hot'), ...R(e) }));
  const edges = [...m.querySelectorAll('[data-role=mm-edge]')].map((e) => ({ kind: e.dataset.kind, rel: e.dataset.rel || null, from: e.dataset.from, to: e.dataset.to, cross: e.dataset.cross === '1', recede: e.classList.contains('recede'), hot: e.classList.contains('hot') }));
  const labels = [...m.querySelectorAll('[data-role=mm-label]')].map((e) => ({ text: e.textContent, rel: e.dataset.rel || null }));
  const groups = [...m.querySelectorAll('[data-role=mm-group]')].map((g) => ({ key: g.dataset.key, name: (g.querySelector('[data-role=mm-group-name]') || {}).textContent, vg: (g.querySelector('[data-role=mm-vgroup]') || {}).textContent || null, ...R(g) }));
  const bands = [...m.querySelectorAll('[data-role=mm-band]')].map((b) => ({ name: b.textContent, ...R(b) }));
  const teams = [...m.querySelectorAll('[data-role=mm-team-box]')].map((b) => ({ lead: b.dataset.lead, ...R(b) }));
  return { nodes, edges, labels, groups, bands, teams, legend: !!m.querySelector('[data-role=mm-legend]'), legendText: (m.querySelector('[data-role=mm-legend]') || {}).textContent || '' };
})()`;

async function openMission(pg) {
  if (await pg.$('[data-role="mission"]')) { await pg.keyboard.press('Escape'); await sleep(400); }
  await pg.click('[data-action="mission-rail"]');
  await pg.waitForSelector('[data-role="mission"] [data-role="mm-group"]', { timeout: 20000 });
  await sleep(1800);
}

// PC 창과 PC 웹이 같이 쓰는 지도 시험
async function desk(pg, E) {
  await openMission(pg);
  let p = await pg.evaluate(PC_PROBE);
  log(`[${E}] 지도 ${JSON.stringify({ nodes: p.nodes.map((n) => `${n.name}:${n.rank}/${n.family}`), edges: p.edges.map((e) => `${e.rel || e.kind}`), groups: p.groups.map((g) => `${g.name}${g.vg ? `[${g.vg}]` : ''}`), bands: p.bands.map((b) => b.name) })}`);
  await shot(pg, `${E}-${TAG}-01-map`);
  if (TAG === 'after') {
    const n = (name) => p.nodes.find((x) => x.name === name) || {};
    check(`[${E}] 세션 11개, 무리 4개`, p.nodes.length === 11 && p.groups.length === 4, { nodes: p.nodes.length, groups: p.groups.map((g) => g.name) });
    check(`[${E}] 리드 둘은 lead, 하위가 있는 rev는 sub(review), 받는 쪽은 worker, 연결 없는 docs는 solo`, n('p94-lead').rank === 'lead' && n('p94-lead2').rank === 'lead' && n('p94-rev').rank === 'sub' && n('p94-rev').family === 'review' && n('p94-ui').rank === 'worker' && n('p94-tests').family === 'test' && n('p94-port').rank === 'worker' && n('p94-docs').rank === 'solo', p.nodes.map((x) => `${x.name}:${x.rank}/${x.family}`));
    check(`[${E}] 노드에 역할 이름이 읽힌다(리드, reviewer, porter, test runner)`, /리드|Lead/i.test(n('p94-lead').roleText || '') && /reviewer/.test(n('p94-rev').roleText || '') && /porter/.test(n('p94-port').roleText || '') && /test runner/.test(n('p94-tests').roleText || ''), p.nodes.map((x) => `${x.name}:${x.roleText}`));
    check(`[${E}] 리드 카드에 팀 요약(워커 수, 일함, 응답 필요)`, /6/.test(n('p94-lead').team || '') && /2/.test(n('p94-lead2').team || ''), { lead: n('p94-lead').team, lead2: n('p94-lead2').team });
    const rels = new Set(p.edges.map((e) => e.rel));
    check(`[${E}] 선 종류가 모양으로 나뉜다: 띄움(spawn), 역할 연결(role), 다른 워크스페이스(cross)`, rels.has('spawn') && rels.has('role') && p.edges.some((e) => e.cross), [...rels]);
    check(`[${E}] 가상 그룹 product가 a·b 무리를 묶는다`, p.bands.some((b) => /product/.test(b.name)) && p.groups.filter((g) => /product/.test(g.vg || '')).length === 2, { bands: p.bands, groups: p.groups.map((g) => [g.name, g.vg]) });
    check(`[${E}] 범례(리드·워커와 선 종류)`, p.legend && /리드|Lead/i.test(p.legendText), p.legendText);
    check(`[${E}] 카드끼리 겹치지 않는다`, !overlap(p.nodes), overlap(p.nodes));
    check(`[${E}] 리드 → 워커 순서(워커가 리드 오른쪽)`, n('p94-rev').x > n('p94-lead').x && n('p94-ui').x > n('p94-lead').x && n('p94-port').x > n('p94-lead2').x, ['p94-lead', 'p94-rev', 'p94-ui', 'p94-lead2', 'p94-port'].map((x) => [x, n(x).x]));
    // 가리키면 그 노드의 관계만 또렷
    const lead2 = n('p94-lead2');
    await pg.mouse.move(lead2.x + lead2.w / 2, lead2.y + lead2.h / 2); await sleep(500);
    p = await pg.evaluate(PC_PROBE);
    const m = (name) => p.nodes.find((x) => x.name === name) || {};
    check(`[${E}] lead2를 가리키면 lead2·port·notes는 또렷하고 lead A 팀은 물러난다`, !m('p94-lead2').recede && !m('p94-port').recede && !m('p94-notes').recede && m('p94-lead').recede && m('p94-rev').recede && p.edges.some((e) => e.hot) && p.edges.filter((e) => !e.hot).every((e) => e.recede), p.nodes.map((x) => `${x.name}:${x.recede ? 'r' : x.hot ? 'h' : '-'}`));
    check(`[${E}] 팀 상자(점선)가 lead2의 팀을 두른다`, p.teams.length >= 1, p.teams);
    await shot(pg, `${E}-${TAG}-02-hover-lead2`);
    const rev = m('p94-rev');
    await pg.mouse.move(rev.x + rev.w / 2, rev.y + rev.h / 2); await sleep(500);
    p = await pg.evaluate(PC_PROBE);
    const q = (name) => p.nodes.find((x) => x.name === name) || {};
    check(`[${E}] rev를 가리키면 부모 lead, 역할 선의 ui·old는 또렷하고 lead2는 물러난다`, !q('p94-rev').recede && !q('p94-lead').recede && !q('p94-ui').recede && !q('p94-old').recede && q('p94-lead2').recede, p.nodes.map((x) => `${x.name}:${x.recede ? 'r' : '-'}`));
    await shot(pg, `${E}-${TAG}-03-hover-rev`);
    await pg.mouse.move(5, 300); await sleep(400);
    p = await pg.evaluate(PC_PROBE);
    check(`[${E}] 빈 곳으로 빼면 모두 또렷`, p.nodes.every((x) => !x.recede), p.nodes.filter((x) => x.recede).map((x) => x.name));
  }
  // 큰 판
  await pg.evaluate(BIG_HOOK, 25);
  await openMission(pg);
  p = await pg.evaluate(PC_PROBE);
  await shot(pg, `${E}-${TAG}-04-big`);
  if (TAG === 'after') {
    check(`[${E}] 큰 판(36개): 겹침 없음, 리드 넷 이상`, p.nodes.length === 36 && !overlap(p.nodes) && p.nodes.filter((x) => x.rank === 'lead').length >= 4, { n: p.nodes.length, leads: p.nodes.filter((x) => x.rank === 'lead').map((x) => x.name), overlap: overlap(p.nodes) });
    const b0 = p.nodes.find((x) => x.name === 'big-00');
    if (b0) { await pg.mouse.move(b0.x + b0.w / 2, b0.y + b0.h / 2); await sleep(500); await shot(pg, `${E}-${TAG}-05-big-hover`); }
  }
  await pg.keyboard.press('Escape');
}

// ---- PC 창(Electron) ----
async function pc() {
  const { app, page } = await launch({ log, env: { ...ENV } });
  try {
    await page.setViewportSize({ width: 1600, height: 960 }).catch(() => {});
    await sleep(3000);
    await desk(page, 'pc');
  } finally { await closeApp(app); }
}

// ---- PC 웹(Chromium, 흉내 원격) ----
async function web() {
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: B0.sim, target: B0.port, name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const browser = await launchChromium();
  try {
    for (const d of call('device.list').devices) call('device.revoke', { id: d.id });
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 960 }, locale: 'ko-KR' });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => log(`[web pageerror] ${e.message}`));
    await pair(pg, `http://localhost:${B0.sim}`);
    await sleep(2500);
    await desk(pg, 'web');
    await ctx.close();
  } finally { await browser.close().catch(() => {}); await sim.close().catch(() => {}); }
}
const loadedOpen = (pg, ms = 60000) => pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: ms });
const splashGone = (pg) => pg.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 15000 }).catch(() => {});
async function pair(pg, base) {
  await pg.goto(`${base}/`);
  await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
  await pg.fill('[data-field=pair-code]', call('device.code').code);
  await pg.click('[data-action=pair-submit]');
  await loadedOpen(pg); await splashGone(pg);
}

// ---- 휴대폰(WebKit, Chromium) ----
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const W = 393, H = 852;
const PHONE = { viewport: { width: W, height: H }, screen: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ko-KR', userAgent: SAFARI };
const PH_PROBE = `(() => {
  const st = document.querySelector('[data-role=pm-stage]');
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const nodes = [...document.querySelectorAll('[data-role=pm-node]')].map((e) => ({ name: e.dataset.name, tier: e.dataset.tier, rank: e.dataset.rank || null, family: e.dataset.family || null, role: (e.querySelector('[data-role=pm-role]') || {}).textContent || null, team: (e.querySelector('[data-role=pm-team]') || {}).textContent || null, dim: e.classList.contains('dim'), ...R(e) }));
  const edges = [...document.querySelectorAll('[data-role=pm-edge]')].map((e) => ({ kind: e.dataset.kind, rel: e.dataset.rel || null }));
  const groups = [...document.querySelectorAll('[data-role=pm-group]')].map((g) => ({ ws: g.dataset.ws, name: (g.querySelector('.mt-pm-gname') || {}).textContent, vg: (g.querySelector('[data-role=pm-vgroup]') || {}).textContent || null, ...R(g) }));
  return { nodes, edges, groups, stage: st ? R(st) : null, legend: (document.querySelector('[data-role=pm-legend]') || {}).textContent || '', view: window.__mtPm ? window.__mtPm.view() : null, page: { sw: document.documentElement.scrollWidth, iw: innerWidth } };
})()`;
function childTree(rootPid) {
  const ps = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize | ConvertTo-Json -Compress';
  const all = JSON.parse(execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 60000 }));
  const kids = new Map();
  for (const p of all) { if (!kids.has(p.ParentProcessId)) kids.set(p.ParentProcessId, []); kids.get(p.ParentProcessId).push(p); }
  const out = [];
  const walk = (pid) => { for (const c of kids.get(pid) || []) { out.push({ pid: c.ProcessId, name: c.Name, ws: Number(c.WorkingSetSize) || 0 }); walk(c.ProcessId); } };
  walk(rootPid);
  return out;
}
const webkitMB = () => Math.round(childTree(process.pid).filter((p) => /WebKitWebProcess/i.test(p.name)).reduce((a, p) => a + p.ws, 0) / 1048576);
async function phone(E) {
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: B0.sim, target: B0.port, name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const browser = E === 'webkit' ? await webkit.launch({ headless: true }) : await launchChromium();
  const mem = {};
  try {
    for (const d of call('device.list').devices) call('device.revoke', { id: d.id });
    const ctx = await browser.newContext(PHONE);
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => log(`[${E} pageerror] ${e.message}`));
    const cdp = E === 'chromium' ? await ctx.newCDPSession(pg) : null;
    if (cdp) await cdp.send('Performance.enable').catch(() => {});
    const readMem = async (label) => { await sleep(1500); if (E === 'webkit') mem[label] = { webkitMB: webkitMB() }; else { const m = await cdp.send('Performance.getMetrics').catch(() => null); const v = m && m.metrics.find((x) => x.name === 'JSHeapUsedSize'); mem[label] = { heapMB: v ? Math.round(v.value / 1048576) : null }; } log(`[${E}] 메모리 ${label} ${JSON.stringify(mem[label])}`); };
    await pair(pg, `http://localhost:${B0.sim}`);
    await sleep(2500);
    await readMem('list');
    await pg.tap('[data-action=phone-mission]');
    await pg.waitForFunction(() => document.querySelectorAll('[data-role=pm-node], [data-role=pm-row]').length >= 10, null, { timeout: 20000 }).catch(() => {});
    await sleep(2500);
    let p = await pg.evaluate(PH_PROBE);
    log(`[${E}] 그래프 ${JSON.stringify({ nodes: p.nodes.map((x) => `${x.name}:${x.rank}/${x.family}/${x.tier}`), groups: p.groups.map((g) => `${g.name}${g.vg ? `[${g.vg}]` : ''}`), edges: p.edges.map((e) => e.rel || e.kind) })}`);
    await shot(pg, `${E}-${TAG}-01-portrait`);
    if (TAG === 'after') {
      const n = (name) => p.nodes.find((x) => x.name === name) || {};
      check(`[${E}] 세션 11개, 무리 4개`, p.nodes.length === 11 && p.groups.length === 4, { nodes: p.nodes.length, groups: p.groups.map((g) => g.name) });
      check(`[${E}] PC와 같은 역할 분류: 리드 둘, reviewer는 review, docs는 solo`, n('p94-lead').rank === 'lead' && n('p94-lead2').rank === 'lead' && n('p94-rev').family === 'review' && n('p94-rev').rank === 'sub' && n('p94-docs').rank === 'solo', p.nodes.map((x) => `${x.name}:${x.rank}/${x.family}`));
      check(`[${E}] 리드 카드에 팀 요약(응답 필요인 리드는 묻는 글이 먼저)`, (n('p94-lead').tier === 'turn' || /6/.test(n('p94-lead').team || '')) && /2/.test(n('p94-lead2').team || ''), { lead: [n('p94-lead').tier, n('p94-lead').team], lead2: n('p94-lead2').team });
      check(`[${E}] 가상 그룹 이름표(product)가 a·b 무리에`, p.groups.filter((g) => /product/.test(g.vg || '')).length === 2, p.groups.map((g) => [g.name, g.vg]));
      check(`[${E}] 범례에 리드·선 종류`, /리드|Lead/i.test(p.legend), p.legend);
      check(`[${E}] 카드끼리 겹치지 않고 페이지 가로 스크롤 없음`, !overlap(p.nodes) && p.page.sw <= p.page.iw, { overlap: overlap(p.nodes), page: p.page });
    }
    await readMem('mission');
    await pg.setViewportSize({ width: H, height: W }); await sleep(1500);
    await shot(pg, `${E}-${TAG}-02-landscape`);
    await pg.setViewportSize({ width: W, height: H }); await sleep(1200);
    await pg.evaluate(BIG_HOOK, 25);
    await pg.tap('[data-action=phone-mission-back]'); await sleep(600); await pg.evaluate(() => window.__mtPhone.mission());
    await pg.waitForFunction(() => document.querySelectorAll('[data-role=pm-node], [data-role=pm-row]').length >= 30, null, { timeout: 20000 }).catch(() => {});
    await sleep(2000);
    p = await pg.evaluate(PH_PROBE);
    await shot(pg, `${E}-${TAG}-03-big`);
    if (TAG === 'after') check(`[${E}] 큰 판(36개): 겹침 없음`, p.nodes.length === 36 && !overlap(p.nodes), { n: p.nodes.length, overlap: overlap(p.nodes) });
    // 옮기기·확대 몇 번(P89 손가락 셈 그대로)
    const sx = p.stage.x + p.stage.w / 2, sy = p.stage.y + p.stage.h / 2;
    if (cdp) {
      for (let i = 0; i < 20; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy + 100, id: 1 }] });
        for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy + 100 - k * (i % 2 ? -20 : 20), id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
    }
    await readMem('big');
    if (E === 'webkit') check(`[${E}] WebKit 웹 프로세스 메모리(목록 → 관계도 → 큰 판)가 P89 수준(늘어남 100MB 안)`, TAG !== 'after' || mem.big.webkitMB - mem.list.webkitMB < 100, mem);
    fs.writeFileSync(path.join(OUT, `p94-mem-${E}-${TAG}.json`), JSON.stringify(mem, null, 1));
    await ctx.close();
  } finally { await browser.close().catch(() => {}); await sim.close().catch(() => {}); }
}

async function stopBoard() {
  for (const s of sessions().filter((x) => /^p94-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(2000);
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') { await setupBoard(); await stir(); }
  else if (WHAT === 'stir') await stir();
  else if (WHAT === 'pc') { await stir(); await pc(); }
  else if (WHAT === 'web') { await stir(); await web(); }
  else if (WHAT === 'webkit' || WHAT === 'chromium') { await stir(); await phone(WHAT); }
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p94-${WHAT}-${TAG}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
