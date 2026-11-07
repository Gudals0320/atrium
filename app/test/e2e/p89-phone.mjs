// P89 창 시험: 휴대폰 작업 관계도를 그래프로(노드 카드, 하위 세션 곡선, 그 밖 연결 점선, 무리 상자, 위 → 아래 나무, 옮기기·확대, 맞추기, 요약 칩 거르기).
// 흉내 원격(p59-lib.mjs, ts-sim-proxy.mjs): 브라우저 문맥(iPhone 393×852, 화면 배율 3, 손가락) → ts-sim(47893) → 백엔드(47897). Playwright WebKit과 Chromium.
// 따로 띄운 개발용 판(atrium-dev-p89, 47897, backend/.dev)만 쓴다. PC 창은 띄우지 않고 짝 맺기 코드와 설정은 이 판의 CLI로 한다.
// 판: 워크스페이스 3개(mtask-p89-a·b·c). p89-lead(haiku, 권한 질문 = 응답 필요) → p89-rev(reviewer, ping 도는 중 = 일함) → p89-help(helper),
//   p89-lead → p89-port(haiku, porter, 다른 워크스페이스). 셸은 하위 세션이 될 수 없어 역할 선으로 잇는다: p89-lead → p89-qa(tester)·p89-docs(writer),
//   p89-rev → p89-lint(linter), p89-rev → p89-sh-b(notes, 다른 워크스페이스),
//   p89-lead → p89-help(second opinion, 나무 밖), p89-run(셸, ping 도는 중), p89-sh-c(셸). 세션 10개(haiku 4개). 끝낸 셸은 판에서 빠지므로 잠듦·끝남은 큰 판 흉내에서 본다.
// 큰 판(세션 30개 안팎)은 메모리 때문에 세션을 더 띄우지 않고, 페이지 안에서 mission.graph 답에 흉내 세션 26개를 더해 그린다(그리기·옮기기·메모리만 본다).
// P89_MODE=before면 옛 화면(ATRIUM_WEB_DIST=experiments/p89/dist-before로 띄운 백엔드)의 그림만 찍는다. P89_ENGINES=webkit,chromium(기본 둘 다).
// 결과는 experiments/p89/(git 밖). 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p89-phone.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';

const MODE = process.env.P89_MODE || 'after';
const ENGINES = (process.env.P89_ENGINES || 'webkit,chromium').split(',').filter(Boolean);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p89');
const CONVOS = path.join(OUT, 'convos');
const DIRS = ['a', 'b', 'c'].map((k) => `C:\\Workspace\\mtask-p89-${k}`);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const B0 = L.board({ session: 'atrium-dev-p89', port: 47897, sim: 47893, sim2: 47894 });
export const ENV = {
  ATRIUM_HERDR_SESSION: B0.session, ATRIUM_PORT: String(B0.port),
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: 'p89',
  ATRIUM_TEST_PREFIX: 'p89-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: String(B0.port),
  ATRIUM_WEB_HOSTS: `${NAME}:${B0.sim},localhost:${B0.sim}`,
  ...(MODE === 'before' ? { ATRIUM_WEB_DIST: path.join(OUT, 'dist-before') } : {}),
};
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_)/.test(k)) delete process.env[k]; // 실제 판의 값을 물려받지 않는다
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
for (const d of DIRS) fs.mkdirSync(d, { recursive: true });
const { logger, sleep, until } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
const { chromium, webkit } = await import('playwright');

const log = logger(`p89-phone-${MODE}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const sessions = () => call('session.list');
const byName = (n) => sessions().find((s) => s.name === n);
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const W = 393, H = 852;
const PHONE = { viewport: { width: W, height: H }, screen: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ko-KR', userAgent: SAFARI };
const loadedOpen = (pg, ms = 60000) => pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: ms });
const splashGone = (pg) => pg.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 15000 }).catch(() => {});
const metrics = { engines: {} };

// 보낸 요청(이름만)
const WS_HOOK = () => {
  const Orig = window.WebSocket;
  window.__p89 = { sent: [] };
  class Hooked extends Orig {
    constructor(...a) {
      super(...a);
      const send = this.send.bind(this);
      this.send = (d) => { try { window.__p89.sent.push({ m: JSON.parse(d).method, t: Math.round(performance.now()) }); } catch {} return send(d); };
    }
  }
  window.WebSocket = Hooked;
};
// 손가락 흉내(WebKit은 여러 손가락을 보낼 길이 없어 그래프 칸에 touch 이벤트를 직접 보낸다). 좌표는 화면 px
const TOUCH_HOOK = () => {
  window.__p89touch = (type, pts, remain) => {
    const el = document.querySelector('[data-role=pm-stage]');
    const mk = (p) => ({ identifier: p.id, clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y, screenX: p.x, screenY: p.y, target: el });
    const ev = new Event(type, { bubbles: true, cancelable: true });
    const list = pts.map(mk);
    Object.defineProperty(ev, 'touches', { value: type === 'touchend' || type === 'touchcancel' ? (remain || []).map(mk) : list });
    Object.defineProperty(ev, 'changedTouches', { value: list });
    Object.defineProperty(ev, 'targetTouches', { value: ev.touches });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
};
// 큰 판: mission.graph 답에 흉내 세션 n개를 더한다(같은 워크스페이스들, 리드 하나에 하위 여럿과 손자, 셸, 역할 선, 여러 상태)
const BIG_HOOK = (n) => {
  const api = window.__mt.api;
  if (!api.__p89orig) api.__p89orig = api.call.bind(api);
  const add = (g) => {
    const real = g.nodes.filter((x) => x.kind === 'session');
    const keys = [...new Set(real.map((x) => x.workspaceKey))];
    const nodes = [...g.nodes], edges = [...g.edges];
    const st = ['working', 'ready', 'ready', 'waiting', 'ready', 'sleeping', 'ready', 'exited'];
    const mk = (i, o) => ({ id: `s:big${i}`, kind: 'session', sessionId: `big${i}`, name: `big-${String(i).padStart(2, '0')}`, agentKind: i % 3 === 2 ? 'shell' : 'claude', state: st[i % st.length], category: 'idle', workspaceKey: keys[i % keys.length], parentId: null, role: null, order: i, createdAt: 1e12 + i, loops: 0, ...o });
    nodes.push(mk(0, { workspaceKey: keys[0], state: 'working' }));
    for (let i = 1; i < n; i++) {
      const parent = i <= 8 ? 's:big0' : i <= 14 ? `s:big${i - 8}` : null;
      nodes.push(mk(i, parent ? { workspaceKey: i <= 14 ? keys[0] : keys[i % keys.length], parentId: parent, role: ['tester', 'reviewer', 'porter', 'writer', 'helper', 'linter'][i % 6] } : {}));
    }
    for (let i = 0; i < 4; i++) edges.push({ from: `s:big${i + 2}`, to: `s:big${i + 16}`, kind: 'role', label: `peer${i}`, active: i === 0 });
    return { ...g, nodes, edges };
  };
  api.call = (m, p) => (m === 'mission.graph' ? api.__p89orig(m, p).then(add) : api.__p89orig(m, p));
};
const sentSince = (pg, t) => pg.evaluate((t0) => window.__p89.sent.filter((x) => x.t >= t0).map((x) => x.m), t);
const nowIn = (pg) => pg.evaluate(() => Math.round(performance.now()));
const view = (pg) => pg.evaluate(() => { const p = document.querySelector('[data-role=phone]'); return p ? p.dataset.view : document.querySelector('.react-flow') ? 'board' : 'none'; });
const PROBE = `(() => {
  const st = document.querySelector('[data-role=pm-stage]');
  const sr = st ? st.getBoundingClientRect() : null;
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const nodes = [...document.querySelectorAll('[data-role=pm-node]')].map((e) => ({ name: e.dataset.name, tier: e.dataset.tier, depth: +e.dataset.depth, dim: e.classList.contains('dim'), role: (e.querySelector('[data-role=pm-role]') || {}).textContent || null, from: (e.querySelector('[data-role=pm-from]') || {}).textContent || null, ws: null, ...R(e) }));
  const groups = [...document.querySelectorAll('[data-role=pm-group]')].map((g) => ({ ws: g.dataset.ws, name: (g.querySelector('.mt-pm-gname') || {}).textContent, ...R(g) }));
  for (const n of nodes) { const g = groups.find((g) => n.x >= g.x - 1 && n.x + n.w <= g.x + g.w + 1 && n.y >= g.y - 1 && n.y + n.h <= g.y + g.h + 1); n.ws = g ? g.ws : null; }
  const edges = [...document.querySelectorAll('[data-role=pm-edge]')].map((e) => ({ kind: e.dataset.kind, from: e.dataset.from, to: e.dataset.to, cls: e.getAttribute('class') }));
  const sum = document.querySelector('[data-role=pm-sum]');
  return { nodes, groups, edges, stage: sr ? { x: Math.round(sr.left), y: Math.round(sr.top), w: Math.round(sr.width), h: Math.round(sr.height) } : null, view: window.__mtPm ? window.__mtPm.view() : null,
    sum: sum ? sum.textContent : null, legend: !!document.querySelector('[data-role=pm-legend]'), fit: !!document.querySelector('[data-action=pm-fit]'),
    page: { sw: document.documentElement.scrollWidth, iw: innerWidth, sy: scrollY, sx: scrollX, bodyPos: getComputedStyle(document.body).position, vvs: window.visualViewport ? visualViewport.scale : 1 } };
})()`;
const PROBE_OLD = `(() => ({ rows: document.querySelectorAll('[data-role=pm-row]').length }))()`;
const reopen = async (pg) => { await tapSel(pg, '[data-action=phone-mission-back]'); await sleep(600); await pg.evaluate(() => window.__mtPhone.mission()); }; // 다시 열어야 mission.graph를 다시 받는다
const tapSel = async (pg, sel) => { await pg.waitForSelector(sel, { timeout: 15000 }); await pg.tap(sel); };
const shot = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const newCode = () => call('device.code').code;
async function pair(pg, base) {
  await pg.goto(`${base}/`);
  await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
  await pg.fill('[data-field=pair-code]', newCode());
  await pg.click('[data-action=pair-submit]');
  await loadedOpen(pg); await splashGone(pg);
}
const overlap = (ns) => { for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) { const a = ns[i], b = ns[j]; if (a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1) return `${a.name}↔${b.name}`; } return null; };

// 이 시험이 띄운 브라우저의 WebKit 웹 프로세스(PID로만 읽는다)
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
const heapMB = async (pg, cdp) => { if (!cdp) return null; const m = await cdp.send('Performance.getMetrics').catch(() => null); const v = m && m.metrics.find((x) => x.name === 'JSHeapUsedSize'); return v ? Math.round(v.value / 1048576) : null; };

// ---- 판 ----
const LONG = (n) => `Use the Bash tool to run this command in the foreground, not in the background, with timeout 600000: ping -n ${n} 127.0.0.1 . Wait for it to finish. Then reply with the single word done.`;
const ASK = 'Use the Bash tool to run exactly: mkdir p89-ask-dir . Then reply with the single word done.';
const envOf = (name) => {
  const s = byName(name);
  const settings = JSON.parse(fs.readFileSync(path.join(ENV.ATRIUM_DATA_DIR, 'sessions', `${s.sessionId || s.id}.json`), 'utf8'));
  const e = { ...process.env, ...Object.fromEntries(Object.entries(settings.env || {}).filter(([k]) => k.startsWith('ATRIUM_'))) };
  if (!e.ATRIUM_SESSION_ID || !e.ATRIUM_SESSION_TOKEN) throw new Error(`${name}: 설정 파일에 세션 env가 없다`);
  return e;
};
const child = (pe, args, ms = 150000) => new Promise((resolve) => execFile(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium-child.mjs'), ...args], { encoding: 'utf8', env: pe, timeout: ms }, (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, out: `${stdout || ''}${stderr || ''}`.trim() })));
const trustStop = () => {
  const tr = sessions().find((s) => /^p89-/.test(s.name) && s.state === 'trust_wait');
  if (tr) { fs.writeFileSync(path.join(DEV, 'p89-need-trust.txt'), `${tr.name} asks the folder trust question in a test folder\n`); throw new Error('trust question (backend/.dev/p89-need-trust.txt)'); }
};
const readyOf = (n, ms = 150000) => until(() => { const s = byName(n); return s && ['ready', 'working', 'waiting', 'trust_wait'].includes(s.state) ? s : null; }, ms, 1500).catch(() => null);

async function setupBoard() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  const st0 = call('settings.get').settings;
  if (st0.remotePasskey !== false) call('settings.set', { remotePasskey: false });
  if (st0.remoteAccess === false) call('settings.set', { remoteAccess: true });
  for (const d of call('device.list').devices) call('device.revoke', { id: d.id });
  fs.mkdirSync(path.join(DIRS[0], '.claude'), { recursive: true });
  fs.writeFileSync(path.join(DIRS[0], '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['Bash(ping:*)', 'Bash(ping *)'] } }, null, 1)); // ping만 묻지 않는다(P85)
  const spawnIn = (dir, ...a) => JSON.parse(atrium('--json', 'spawn', dir, ...a));
  if (!byName('p89-lead')) spawnIn(DIRS[0], '--model', 'haiku', '--name', 'p89-lead');
  for (const [n, wi] of [['p89-run', 0], ['p89-sh-b', 1], ['p89-sh-c', 2], ['p89-qa', 0], ['p89-docs', 0], ['p89-lint', 0]]) if (!byName(n)) spawnIn(DIRS[wi], '--kind', 'shell', '--name', n);
  await readyOf('p89-lead'); trustStop();
  const leadEnv = envOf('p89-lead');
  if (!byName('p89-rev')) log('child rev', (await child(leadEnv, ['child', 'p89-rev', '--role', 'reviewer', '--model', 'haiku', '--no-wait'])).out.slice(0, 300));
  if (!byName('p89-port')) log('child port', (await child(leadEnv, ['child', 'p89-port', '--role', 'porter', '--cwd', DIRS[2].replace(/\\/g, '/'), '--model', 'haiku', '--no-wait'])).out.slice(0, 300));
  await readyOf('p89-rev'); await readyOf('p89-port'); trustStop();
  const revEnv = envOf('p89-rev');
  if (!byName('p89-help')) log('child help', (await child(revEnv, ['child', 'p89-help', '--role', 'helper', '--model', 'haiku', '--no-wait'])).out.slice(0, 300));
  await readyOf('p89-help'); trustStop();
  const linked = (a, b) => call('link.list').some((l) => l.from === byName(a).sessionId && l.to === byName(b).sessionId && l.role);
  // 셸은 하위 세션이 될 수 없어 역할 선으로 잇는다(역할 선도 나무 부모가 된다). 알림은 전달 큐로 가서 받는 쪽이 쉴 때만 들어간다
  for (const [a, b, role] of [['p89-rev', 'p89-sh-b', 'notes'], ['p89-lead', 'p89-help', 'second opinion'], ['p89-lead', 'p89-qa', 'tester'], ['p89-lead', 'p89-docs', 'writer'], ['p89-rev', 'p89-lint', 'linter']]) {
    try { if (!linked(a, b)) atrium('link', a, b, '--role', role); } catch (e) { log(`연결 ${a} → ${b} ${e.message.slice(0, 120)}`); }
  }
  await sleep(3000);
}
// 찍기 전에 일하는 것과 묻는 것을 돌린다
async function stir() {
  const run = byName('p89-run');
  if (!(run.shell && run.shell.atPrompt === false)) atrium('input', 'p89-run', 'ping -n 3000 127.0.0.1\\r');
  if (byName('p89-rev').state !== 'working') atrium('send', '@p89-rev', LONG(1500));
  if (byName('p89-lead').state !== 'waiting') atrium('send', '@p89-lead', ASK);
  await until(() => byName('p89-rev').state === 'working' && byName('p89-lead').state === 'waiting' && (byName('p89-run').shell || {}).atPrompt === false, 150000, 1500).catch(() => {});
  log(`세션 ${sessions().filter((s) => /^p89-/.test(s.name)).map((s) => `${s.name}:${s.state}${s.shell ? `/${s.shell.atPrompt === false ? 'run' : 'idle'}` : ''}${s.branch && s.branch.role ? `(${s.branch.role})` : ''}`).join(' ')}`);
}

// ---- 손가락 ----
// Chromium은 CDP로 진짜 터치를, WebKit은 그래프 칸에 touch 이벤트를 보낸다. 좌표는 화면 px
function fingers(E, pg, cdp) {
  const send = async (type, pts, remain) => {
    if (cdp) { const map = { touchstart: 'touchStart', touchmove: 'touchMove', touchend: 'touchEnd' }; await cdp.send('Input.dispatchTouchEvent', { type: map[type], touchPoints: (type === 'touchend' ? remain || [] : pts).map((p) => ({ x: p.x, y: p.y, id: p.id })) }); }
    else await pg.evaluate(([t, p, r]) => window.__p89touch(t, p, r), [type, pts, remain || []]);
  };
  const steps = async (from, to, n, extra = []) => {
    for (let i = 1; i <= n; i++) {
      const pts = from.map((f, k) => ({ id: f.id, x: f.x + ((to[k].x - f.x) * i) / n, y: f.y + ((to[k].y - f.y) * i) / n }));
      await send('touchmove', [...pts, ...extra]);
    }
  };
  return {
    async pan(x, y, dx, dy, n = 10) { const a = [{ id: 1, x, y }]; await send('touchstart', a); await steps(a, [{ id: 1, x: x + dx, y: y + dy }], n); await send('touchend', [{ id: 1, x: x + dx, y: y + dy }]); },
    async pinch(cx, cy, d0, d1, n = 10) {
      const a = [{ id: 1, x: cx - d0 / 2, y: cy }, { id: 2, x: cx + d0 / 2, y: cy }], b = [{ id: 1, x: cx - d1 / 2, y: cy }, { id: 2, x: cx + d1 / 2, y: cy }];
      if (cdp) await send('touchstart', a); else { await send('touchstart', [a[0]]); await send('touchstart', a); }
      await steps(a, b, n);
      await send('touchend', b, []);
    },
  };
}

// ---- 옛 화면(before): 그림만 ----
async function before(engine, browser, base) {
  const E = engine;
  const ctx = await browser.newContext(PHONE);
  await ctx.addInitScript(WS_HOOK);
  const pg = await ctx.newPage();
  await pair(pg, base);
  await pg.goto(`${base}/`); await loadedOpen(pg); await splashGone(pg); await sleep(2000);
  await tapSel(pg, '[data-action=phone-mission]');
  await pg.waitForFunction(() => document.querySelectorAll('[data-role=pm-row]').length >= 10, null, { timeout: 20000 }).catch(() => {});
  await sleep(2500);
  log(`[${E} before] ${JSON.stringify(await pg.evaluate(PROBE_OLD))}`);
  await shot(pg, `${E}-before-portrait`);
  await pg.setViewportSize({ width: H, height: W }); await sleep(1200);
  await shot(pg, `${E}-before-landscape`);
  await pg.setViewportSize({ width: W, height: H }); await sleep(800);
  await pg.evaluate(BIG_HOOK, 26);
  await reopen(pg);
  await pg.waitForFunction(() => document.querySelectorAll('[data-role=pm-row]').length >= 30, null, { timeout: 20000 }).catch(() => {});
  await sleep(1500);
  log(`[${E} before big] ${JSON.stringify(await pg.evaluate(PROBE_OLD))}`);
  await shot(pg, `${E}-before-big`);
  await ctx.close();
}

// ---- 새 화면: 휴대폰 한 엔진 ----
async function phone(engine, browser, base) {
  const E = engine;
  const m = metrics.engines[E] = { mem: {} };
  const ctx = await browser.newContext(PHONE);
  await ctx.addInitScript(WS_HOOK); await ctx.addInitScript(TOUCH_HOOK);
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => log(`[${E} pageerror] ${e.message}`));
  pg.on('console', (x) => { if (x.type() === 'error') log(`[${E} console.error] ${x.text().slice(0, 200)}`); });
  const cdp = E === 'chromium' ? await ctx.newCDPSession(pg) : null;
  if (cdp) await cdp.send('Performance.enable').catch(() => {});
  const F = fingers(E, pg, cdp);
  const mem = async (label) => { await sleep(1500); m.mem[label] = E === 'webkit' ? { webkitMB: webkitMB() } : { heapMB: await heapMB(pg, cdp) }; log(`[${E}] 메모리 ${label} ${JSON.stringify(m.mem[label])}`); };
  await pair(pg, base);
  await pg.goto(`${base}/`); await loadedOpen(pg); await splashGone(pg); await sleep(2500);
  await mem('list');
  // 1. 열기: mission.graph만, 대화·터미널 요청 없음
  const t0 = await nowIn(pg);
  await tapSel(pg, '[data-action=phone-mission]');
  await pg.waitForFunction(() => document.querySelectorAll('[data-role=pm-node]').length >= 10, null, { timeout: 20000 }).catch(() => {});
  await sleep(3000);
  let p = await pg.evaluate(PROBE);
  const n = (name) => p.nodes.find((x) => x.name === name) || {};
  log(`[${E}] 그래프 ${JSON.stringify({ nodes: p.nodes.map((x) => `${x.name}:${x.tier}@${x.x},${x.y}`), groups: p.groups.map((g) => `${g.name}@${g.y}+${g.h}`), edges: p.edges.map((e) => `${e.kind}:${e.from}>${e.to}`), view: p.view, stage: p.stage })}`);
  await shot(pg, `${E}-01-portrait`);
  check(`[${E}] 세션 10개가 노드 카드로, 무리 상자 3개(판 순서), 범례와 맞추기 단추`, p.nodes.length === 10 && p.groups.length === 3 && /mtask-p89-a/.test(p.groups[0].name) && /mtask-p89-c/.test(p.groups[2].name) && p.legend && p.fit, { nodes: p.nodes.length, groups: p.groups.map((g) => g.name), legend: p.legend, fit: p.fit });
  check(`[${E}] 카드는 제 무리 상자 안: lead·rev·help·qa·docs·lint·run은 a, sh-b는 b, port·sh-c는 c`, ['p89-lead', 'p89-rev', 'p89-help', 'p89-qa', 'p89-docs', 'p89-lint', 'p89-run'].every((x) => n(x).ws && n(x).ws === p.groups[0].ws) && n('p89-sh-b').ws === p.groups[1].ws && n('p89-port').ws === p.groups[2].ws && n('p89-sh-c').ws === p.groups[2].ws, p.nodes.map((x) => `${x.name}:${x.ws}`));
  check(`[${E}] 위 → 아래 나무: lead 아래 rev·qa·docs, rev 아래 help·lint`, n('p89-rev').y > n('p89-lead').y && n('p89-qa').y > n('p89-lead').y && n('p89-docs').y > n('p89-lead').y && n('p89-help').y > n('p89-rev').y && n('p89-lint').y > n('p89-rev').y, ['p89-lead', 'p89-rev', 'p89-qa', 'p89-docs', 'p89-help', 'p89-lint'].map((x) => [x, n(x).x, n(x).y]));
  const has = (kind, a, b) => p.edges.some((e) => e.kind === kind && e.from === `s:${byName(a).sessionId}` && e.to === `s:${byName(b).sessionId}`);
  check(`[${E}] 하위 세션은 곡선(tree), 다른 무리 부모(port ← lead, sh-b ← rev)와 나무 밖 연결(lead → help)은 점선`, has('tree', 'p89-lead', 'p89-rev') && has('tree', 'p89-rev', 'p89-help') && has('tree', 'p89-lead', 'p89-qa') && has('tree', 'p89-rev', 'p89-lint') && has('cross', 'p89-lead', 'p89-port') && has('cross', 'p89-rev', 'p89-sh-b') && has('link', 'p89-lead', 'p89-help'), p.edges.map((e) => e.kind));
  check(`[${E}] 역할 칩과 다른 무리 부모 표시`, n('p89-rev').role === 'reviewer' && n('p89-help').role === 'helper' && n('p89-qa').role === 'tester' && n('p89-port').role === 'porter' && /p89-lead/.test(n('p89-port').from || '') && n('p89-sh-b').role === 'notes', ['p89-rev', 'p89-help', 'p89-qa', 'p89-port', 'p89-sh-b'].map((x) => [x, n(x).role, n(x).from]));
  check(`[${E}] 강조 등급: rev·run 일함, lead 응답 필요, 나머지 쉼`, n('p89-rev').tier === 'work' && n('p89-run').tier === 'work' && n('p89-lead').tier === 'turn' && ['rest', 'review'].includes(n('p89-help').tier) && ['rest', 'review'].includes(n('p89-sh-c').tier), p.nodes.map((x) => `${x.name}:${x.tier}`));
  check(`[${E}] 카드끼리 겹치지 않는다`, !overlap(p.nodes), overlap(p.nodes));
  check(`[${E}] 처음에는 화면 폭에 맞춘다(모든 카드가 그래프 칸 폭 안)`, p.nodes.every((x) => x.x >= p.stage.x - 1 && x.x + x.w <= p.stage.x + p.stage.w + 1) && p.view && p.view.zoom >= 0.6, { view: p.view, stage: p.stage });
  check(`[${E}] 페이지가 늘어나거나 밀리지 않는다(가로 스크롤 없음, 몸통 고정)`, p.page.sw <= p.page.iw && p.page.bodyPos === 'fixed' && p.page.sy === 0, p.page);
  const fit0 = p.view;
  // 2. 옮기기, 확대, 맞추기
  const sx = p.stage.x + p.stage.w / 2, sy = p.stage.y + p.stage.h / 2;
  await F.pan(sx, sy, -60, -140); await sleep(400);
  p = await pg.evaluate(PROBE);
  const panned = p.view;
  check(`[${E}] 한 손가락으로 옮긴다(보기가 손가락만큼, 페이지는 그대로)`, Math.abs(panned.x - (fit0.x - 60)) <= 2 && Math.abs(panned.y - (fit0.y - 140)) <= 2 && panned.zoom === fit0.zoom && p.page.sy === 0 && p.page.sx === 0, { fit0, panned, page: p.page });
  await shot(pg, `${E}-02-pan`);
  await F.pinch(sx, sy, 100, 200); await sleep(400);
  p = await pg.evaluate(PROBE);
  const zoomed = p.view;
  const wx = (sx - p.stage.x - panned.x) / panned.zoom, wy = (sy - p.stage.y - panned.y) / panned.zoom; // 손가락 가운데 아래의 월드 점
  check(`[${E}] 두 손가락으로 확대(두 배, 가운데 점이 그 자리에), 페이지 배율은 그대로`, Math.abs(zoomed.zoom / panned.zoom - 2) < 0.08 && Math.abs(wx * zoomed.zoom + zoomed.x - (sx - p.stage.x)) < 4 && Math.abs(wy * zoomed.zoom + zoomed.y - (sy - p.stage.y)) < 4 && p.page.vvs === 1, { panned, zoomed, vvs: p.page.vvs });
  await shot(pg, `${E}-03-pinch`);
  await F.pinch(sx, sy, 40, 380); await F.pinch(sx, sy, 40, 380); await sleep(300);
  const zmax = (await pg.evaluate(PROBE)).view;
  await F.pinch(sx, sy, 380, 20); await F.pinch(sx, sy, 380, 20); await F.pinch(sx, sy, 380, 20); await sleep(300);
  const zmin = (await pg.evaluate(PROBE)).view;
  await F.pan(sx, sy, 3000, 3000, 6); await sleep(300);
  p = await pg.evaluate(PROBE);
  const vis = p.nodes.filter((x) => x.x + x.w > p.stage.x && x.x < p.stage.x + p.stage.w && x.y + x.h > p.stage.y && x.y < p.stage.y + p.stage.h).length;
  const gx = Math.min(...p.groups.map((g) => g.x)), gy = Math.min(...p.groups.map((g) => g.y));
  check(`[${E}] 확대·옮기기 범위: 배율 2.5에서 멈추고, 맞춘 배율 아래로 줄어도 0.25 근처에서 멈추고, 멀리 밀어도 그래프가 화면에 남는다`, Math.abs(zmax.zoom - 2.5) < 0.01 && zmin.zoom >= 0.24 && zmin.zoom <= Math.min(0.26, fit0.zoom) && gx <= p.stage.x + p.stage.w - 60 && gy <= p.stage.y + p.stage.h - 60, { zmax, zmin, gx, gy, stage: p.stage, vis });
  await tapSel(pg, '[data-action=pm-fit]'); await sleep(400);
  p = await pg.evaluate(PROBE);
  check(`[${E}] 맞추기 단추는 처음 보기로`, JSON.stringify(p.view) === JSON.stringify(fit0), { fit0, now: p.view });
  // 3. 요약 칩: 응답 필요만 또렷하게, 그 카드로 맞추기, 다시 누르면 풀기
  await tapSel(pg, '[data-action=pm-focus-turn]'); await sleep(500);
  p = await pg.evaluate(PROBE);
  const lead = n('p89-lead');
  check(`[${E}] 응답 필요 칩: lead만 또렷하고 나머지는 물러나며, lead가 화면 가운데 근처`, !lead.dim && p.nodes.filter((x) => x.name !== 'p89-lead').every((x) => x.dim) && Math.abs(lead.x + lead.w / 2 - (p.stage.x + p.stage.w / 2)) < 30 && lead.y > p.stage.y && lead.y + lead.h < p.stage.y + p.stage.h, { lead, view: p.view });
  await shot(pg, `${E}-04-focus`);
  await tapSel(pg, '[data-action=pm-focus-turn]'); await sleep(300);
  p = await pg.evaluate(PROBE);
  check(`[${E}] 칩을 다시 누르면 모두 또렷하게(보기는 그대로)`, p.nodes.every((x) => !x.dim), p.nodes.filter((x) => x.dim).map((x) => x.name));
  await tapSel(pg, '[data-action=pm-fit]'); await sleep(300);
  // 4. 옮긴 뒤 노드를 탭 → 세션 화면 → 돌아오면 같은 자리·배율
  await F.pan(sx, sy, 0, -90); await F.pinch(sx, sy, 150, 190); await sleep(400);
  p = await pg.evaluate(PROBE);
  const beforeOpen = { view: p.view, help: n('p89-help') };
  const sentAll = await sentSince(pg, t0);
  check(`[${E}] 관계도를 여는 동안·옮기는 동안 session.messages·terminal.* 요청이 없고 mission.graph를 받는다`, !sentAll.some((x) => /^session\.messages$|^terminal\./.test(x)) && sentAll.includes('mission.graph'), [...new Set(sentAll)]);
  await tapSel(pg, `[data-role=pm-node][data-name="p89-help"]`);
  await pg.waitForFunction(() => document.querySelector('[data-role=phone]').dataset.view === 'session', null, { timeout: 10000 }).catch(() => {});
  await sleep(2000);
  const head = await pg.evaluate(() => (document.querySelector('.mt-ph-shead') || {}).textContent || '');
  check(`[${E}] 노드를 탭하면 그 세션 화면`, (await view(pg)) === 'session' && /p89-help/.test(head), { view: await view(pg), head: head.slice(0, 60) });
  await tapSel(pg, '[data-action=phone-back]');
  await pg.waitForFunction(() => document.querySelector('[data-role=phone]').dataset.view === 'mission', null, { timeout: 10000 }).catch(() => {});
  await sleep(1500);
  p = await pg.evaluate(PROBE);
  check(`[${E}] 돌아오면 같은 자리·배율`, JSON.stringify(p.view) === JSON.stringify(beforeOpen.view) && Math.abs(n('p89-help').x - beforeOpen.help.x) <= 1 && Math.abs(n('p89-help').y - beforeOpen.help.y) <= 1, { before: beforeOpen, after: { view: p.view, help: n('p89-help') } });
  await shot(pg, `${E}-05-back`);
  const t2 = await nowIn(pg); // 세션 화면(터미널을 붙인다)에서 돌아온 뒤부터 다시 센다
  // 옮긴 손가락 끝에서는 노드를 열지 않는다
  const hp = n('p89-help');
  await F.pan(hp.x + hp.w / 2, hp.y + hp.h / 2, 40, 30); await sleep(800);
  check(`[${E}] 카드 위에서 시작해 옮기면 열리지 않는다`, (await view(pg)) === 'mission', await view(pg));
  await mem('mission');
  // 5. 가로
  await pg.setViewportSize({ width: H, height: W }); await sleep(1500);
  p = await pg.evaluate(PROBE);
  check(`[${E}] 가로: 다시 맞추고 카드가 모두 폭 안, 형제가 더 나란히(rev·qa·docs 같은 높이)`, p.nodes.length === 10 && p.nodes.every((x) => x.x >= p.stage.x - 1 && x.x + x.w <= p.stage.x + p.stage.w + 1) && !overlap(p.nodes) && n('p89-rev').y === n('p89-qa').y && n('p89-qa').y === n('p89-docs').y && p.page.sw <= p.page.iw, { view: p.view, stage: p.stage, ys: ['p89-rev', 'p89-qa', 'p89-docs'].map((x) => n(x).y) });
  await shot(pg, `${E}-06-landscape`);
  await F.pan(p.stage.x + p.stage.w / 2, p.stage.y + p.stage.h / 2, -80, -60); await sleep(300);
  const lv = (await pg.evaluate(PROBE)).view;
  check(`[${E}] 가로에서도 옮긴다`, lv.x !== p.view.x && lv.y !== p.view.y, { from: p.view, to: lv });
  await pg.setViewportSize({ width: W, height: H }); await sleep(1500);
  // 6. 큰 판(흉내 세션 26개를 더해 36개)
  await pg.evaluate(BIG_HOOK, 26);
  await reopen(pg);
  await pg.waitForFunction(() => document.querySelectorAll('[data-role=pm-node]').length >= 35, null, { timeout: 20000 }).catch(() => {});
  await sleep(1500); await tapSel(pg, '[data-action=pm-fit]'); await sleep(400);
  p = await pg.evaluate(PROBE);
  check(`[${E}] 큰 판(36개): 겹침 없음, 폭에 맞춤(배율 0.6 이상), 페이지는 그대로`, p.nodes.length >= 36 && !overlap(p.nodes) && p.nodes.every((x) => x.x >= p.stage.x - 1 && x.x + x.w <= p.stage.x + p.stage.w + 1) && p.view.zoom >= 0.6 && p.page.sw <= p.page.iw, { n: p.nodes.length, view: p.view, edges: p.edges.length, overlap: overlap(p.nodes) });
  check(`[${E}] 큰 판: 잠듦·끝남 카드도 그린다(물러남), 일함·응답 필요도 있다`, p.nodes.some((x) => x.tier === 'sleep') && p.nodes.some((x) => x.tier === 'done') && p.nodes.some((x) => x.tier === 'work') && p.nodes.some((x) => x.tier === 'turn'), [...new Set(p.nodes.map((x) => x.tier))]);
  await shot(pg, `${E}-07-big`);
  // 손가락 움직임 하나를 처리하는 시간(옮기기 60번, 확대 40번)
  const t1 = Date.now();
  for (let i = 0; i < 3; i++) { await F.pan(sx, sy + 120, 0, -220, 20); await F.pinch(sx, sy, 120, 220, 20); await F.pinch(sx, sy, 220, 120, 20); }
  const per = Math.round(((Date.now() - t1) / (3 * 60)) * 10) / 10;
  m.moveMs = per;
  check(`[${E}] 큰 판에서도 손가락 움직임 하나가 빠르다(시험 도구 왕복 포함 ${per}ms)`, per < 40, { per });
  await F.pinch(sx, sy, 100, 250); await sleep(300);
  await shot(pg, `${E}-08-big-zoom`);
  await mem('big');
  const sentBig = await sentSince(pg, t2);
  check(`[${E}] 돌아온 뒤 끝까지(옮기기, 가로, 큰 판) session.messages·terminal.* 요청 없음`, !sentBig.some((x) => /^session\.messages$|^terminal\./.test(x)), [...new Set(sentBig)].join(' '));
  if (E === 'webkit') check(`[${E}] WebKit 웹 프로세스 메모리가 크게 늘지 않는다(목록 → 관계도 → 큰 판, 100MB 안)`, m.mem.big.webkitMB - m.mem.list.webkitMB < 100, m.mem);
  else check(`[${E}] JS 힙이 크게 늘지 않는다(목록 → 큰 판, 30MB 안)`, m.mem.big.heapMB - m.mem.list.heapMB < 30, m.mem);
  await ctx.close();
}

let sim;
const browsers = [];
try {
  await setupBoard();
  sim = startTsSim({ listen: B0.sim, target: B0.port, name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse().map((d) => path.join(pwDir, d, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
  const BASE = `http://localhost:${B0.sim}`;
  for (const engine of ENGINES) {
    await stir();
    const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : { channel: 'chromium' }) });
    browsers.push(browser);
    try { await (MODE === 'before' ? before : phone)(engine, browser, BASE); } catch (e) { check(`[${engine}] 시험이 끝까지 돌았다`, false, e.stack || e.message); }
    await browser.close().catch(() => {});
    browsers.pop();
  }
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  if (sim) await sim.close().catch(() => {});
  fs.writeFileSync(path.join(OUT, `p89-phone-${MODE}-${ENGINES.join('+')}.json`), JSON.stringify({ results, metrics }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
