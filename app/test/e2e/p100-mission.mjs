// P100 창 시험: 미션 맵을 워크스페이스 판으로 다시 그림(PC 창 1920×1080·2560×1440, PC 웹, 휴대폰 WebKit·Chromium 세로·가로). 한 번에 한 화면만 돌린다(메모리).
// 판: 따로 띄운 개발용 판(atrium-dev-p100, 47899, backend/.dev)만 쓴다. 흉내 원격(p59-lib.mjs, ts-sim-proxy.mjs) 47879.
//   판 A(실제 판 모양, 실제 세션 13개, 워크스페이스 9개 mtask-p100-a…j(h 없음), 가상 그룹 product(a, b)):
//     리드 p100-lead(a, haiku, 권한 질문 = 응답 필요) → 하위 p100-rev(haiku, reviewer, ping = 일함), 역할 선 p100-ui(셸)·p100-tests(ping 도는 셸)
//     리드 p100-lead2(b, haiku, 쉼) → 하위 p100-port(c, haiku, porter, 일함 = 다른 워크스페이스), 역할 선 p100-notes(b, 셸)
//     p100-rev → p100-ui(나무 밖), p100-rev → p100-old(d, archive, 다른 워크스페이스)
//     잠듦: p100-old(d)·p100-e(e)·p100-i(i)는 한 번 답한 뒤 워크스페이스를 잠재운다. 끝남(결과, 안 읽음): p100-g(g)·p100-lead2. 셸은 exit하면 판에서 사라지므로 끝남(exited) 모양은 흉내 판에서 본다.
//     쉼: p100-f(f, 셸), 연결 없음: p100-docs(j, 셸)
//   판 B(실제 판 모양의 흉내, 23개·워크스페이스 11개), 작은 판(3개), 큰 판(36개)은 페이지 안에서 mission.graph 답을 바꾼다.
// 실행(실제 판의 변수를 지운 셸로): sh backend/.dev/clean-env.sh node app/test/e2e/p100-mission.mjs <setup|stir|pc|pc2560|web|webkit|chromium|stop> [before|after]
// 결과는 주 체크아웃의 experiments/p100/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const MAIN = /[\\/]\.claude[\\/]worktrees[\\/]/.test(REPO) ? path.resolve(REPO, '..', '..', '..') : REPO; // 워크트리면 주 체크아웃
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(MAIN, 'experiments', 'p100');
const CONVOS = path.join(OUT, 'convos');
const KEYS = 'abcdefghij'.split('');
const DIR = Object.fromEntries(KEYS.map((k) => [k, `C:\\Workspace\\mtask-p100-${k}`]));
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_)/.test(k)) delete process.env[k]; // 실제 판의 값을 물려받지 않는다
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const B0 = L.board({ session: 'atrium-dev-p100', port: 47899, sim: 47879, sim2: 47878 });
const CDP = 9379; // 창의 원격 디버깅 포트(이 판 몫)
const ENV = {
  ATRIUM_HERDR_SESSION: B0.session, ATRIUM_PORT: String(B0.port),
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p100-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: String(B0.port),
  ATRIUM_WEB_HOSTS: `${NAME}:${B0.sim},localhost:${B0.sim}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
for (const d of Object.values(DIR)) fs.mkdirSync(d, { recursive: true });
const { logger, sleep, until, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const { chromium, webkit, _electron: electron } = await import('playwright');
const chromeExe = (() => { const d = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'); try { return fs.readdirSync(d).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(d, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const launchChromium = () => chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : { channel: 'chromium' }) });

const log = logger(`p100-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const sessions = () => call('session.list');
const byName = (n) => sessions().find((s) => s.name === n);
const shot = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const hitR = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
const overlap = (ns) => { for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) if (hitR(ns[i], ns[j])) return `${ns[i].name || ns[i].key}↔${ns[j].name || ns[j].key}`; return null; };
const AFTER = TAG === 'after';

// ---- 판 A ----
const LONG = (n) => `Use the Bash tool to run this command in the foreground, not in the background, with timeout 600000: ping -n ${n} 127.0.0.1 . Wait for it to finish. Then reply with the single word done.`;
const ASK = 'Use the Bash tool to run exactly: mkdir p100-ask-dir . Then reply with the single word done.';
const envOf = (name) => {
  const s = byName(name);
  const settings = JSON.parse(fs.readFileSync(path.join(ENV.ATRIUM_DATA_DIR, 'sessions', `${s.sessionId || s.id}.json`), 'utf8'));
  const e = { ...process.env, ...Object.fromEntries(Object.entries(settings.env || {}).filter(([k]) => k.startsWith('ATRIUM_'))) };
  if (!e.ATRIUM_SESSION_ID || !e.ATRIUM_SESSION_TOKEN) throw new Error(`${name}: 설정 파일에 세션 env가 없다`);
  return e;
};
const child = (pe, args, ms = 150000) => new Promise((resolve) => execFile(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium-child.mjs'), ...args], { encoding: 'utf8', env: pe, timeout: ms }, (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, out: `${stdout || ''}${stderr || ''}`.trim() })));
const trustStop = () => {
  const tr = sessions().find((s) => /^p100-/.test(s.name) && s.state === 'trust_wait');
  if (tr) { fs.writeFileSync(path.join(DEV, 'p100-need-trust.txt'), `${tr.name} asks the folder trust question in a test folder\n`); throw new Error('trust question (backend/.dev/p100-need-trust.txt)'); }
};
const readyOf = (n, ms = 150000) => until(() => { const s = byName(n); return s && ['ready', 'working', 'waiting', 'trust_wait'].includes(s.state) ? s : null; }, ms, 1500).catch(() => null);
const answerOnce = async (n) => {
  if (byName(n).lastAnswer) return;
  atrium('send', `@${n}`, 'Reply with the single word ok.');
  await until(() => { const s = byName(n); return s && s.state === 'ready' && s.lastAnswer ? s : null; }, 120000, 2000).catch(() => {});
};

async function setupBoard() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  const st0 = call('settings.get').settings;
  if (st0.remotePasskey !== false) call('settings.set', { remotePasskey: false });
  if (st0.remoteAccess === false) call('settings.set', { remoteAccess: true });
  for (const k of ['a', 'b', 'c']) {
    fs.mkdirSync(path.join(DIR[k], '.claude'), { recursive: true });
    fs.writeFileSync(path.join(DIR[k], '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['Bash(ping:*)', 'Bash(ping *)'] } }, null, 1)); // ping만 묻지 않는다(P85)
  }
  const spawnIn = (dir, ...a) => JSON.parse(atrium('--json', 'spawn', dir, ...a));
  // 잠들 세션(한 번 답한 뒤 워크스페이스를 잠재운다): 하나씩(메모리)
  for (const [n, k] of [['p100-old', 'd'], ['p100-e', 'e'], ['p100-i', 'i']]) {
    const s = byName(n);
    if (s && s.state === 'sleeping') continue;
    if (!s) spawnIn(DIR[k], '--model', 'haiku', '--name', n);
    await readyOf(n); trustStop();
    await answerOnce(n);
    try { log(`sleep ${k}`, atrium('sleep', DIR[k]).slice(0, 160)); } catch (e) { log(`잠재우기 ${n} ${e.message.slice(0, 160)}`); }
  }
  if (!byName('p100-lead')) spawnIn(DIR.a, '--model', 'haiku', '--name', 'p100-lead');
  if (!byName('p100-lead2')) spawnIn(DIR.b, '--model', 'haiku', '--name', 'p100-lead2');
  if (!byName('p100-g')) spawnIn(DIR.g, '--model', 'haiku', '--name', 'p100-g');
  for (const [n, k] of [['p100-ui', 'a'], ['p100-tests', 'a'], ['p100-notes', 'b'], ['p100-f', 'f'], ['p100-docs', 'j']]) if (!byName(n)) spawnIn(DIR[k], '--kind', 'shell', '--name', n);
  await readyOf('p100-lead'); await readyOf('p100-lead2'); await readyOf('p100-g'); trustStop();
  if (!byName('p100-rev')) log('child rev', (await child(envOf('p100-lead'), ['child', 'p100-rev', '--role', 'reviewer', '--model', 'haiku', '--no-wait'])).out.slice(0, 300));
  if (!byName('p100-port')) log('child port', (await child(envOf('p100-lead2'), ['child', 'p100-port', '--role', 'porter', '--cwd', DIR.c.replace(/\\/g, '/'), '--model', 'haiku', '--no-wait'])).out.slice(0, 300));
  await readyOf('p100-rev'); await readyOf('p100-port'); trustStop();
  const linked = (a, b) => call('link.list').some((l) => l.from === byName(a).sessionId && l.to === byName(b).sessionId && l.role);
  for (const [a, b, role] of [['p100-lead', 'p100-ui', 'ui worker'], ['p100-lead', 'p100-tests', 'test runner'], ['p100-lead2', 'p100-notes', 'notes'], ['p100-rev', 'p100-ui', 'review'], ['p100-rev', 'p100-old', 'archive']]) {
    try { if (!linked(a, b)) atrium('link', a, b, '--role', role); } catch (e) { log(`연결 ${a} → ${b} ${e.message.slice(0, 120)}`); }
  }
  try {
    const gs = call('group.list');
    const list = gs.groups || gs;
    if (!(Array.isArray(list) && list.some((g) => g.name === 'product'))) call('group.create', { name: 'product', workspaces: [DIR.a, DIR.b] });
  } catch (e) { log(`가상 그룹 ${e.message.slice(0, 160)}`); }
  await answerOnce('p100-g'); // 결과(안 읽음)
  await sleep(3000);
}
// 찍기 전에 일하는 것과 묻는 것을 돌린다
async function stir() {
  const tests = byName('p100-tests');
  if (!(tests.shell && tests.shell.atPrompt === false)) atrium('input', 'p100-tests', 'ping -n 3000 127.0.0.1\\r');
  if (byName('p100-rev').state !== 'working') atrium('send', '@p100-rev', LONG(400));
  if (byName('p100-port').state !== 'working') atrium('send', '@p100-port', LONG(400));
  if (byName('p100-lead').state !== 'waiting') atrium('send', '@p100-lead', ASK);
  await until(() => byName('p100-rev').state === 'working' && byName('p100-port').state === 'working' && byName('p100-lead').state === 'waiting' && (byName('p100-tests').shell || {}).atPrompt === false, 150000, 1500).catch(() => {});
  log(`세션 ${sessions().filter((s) => /^p100-/.test(s.name)).map((s) => `${s.name}:${s.state}${s.unseen ? '*' : ''}${s.shell ? `/${s.shell.atPrompt === false ? 'run' : 'idle'}` : ''}${s.branch && s.branch.role ? `(${s.branch.role})` : ''}`).join(' ')}`);
}

// ---- 흉내 판(페이지 안에서 mission.graph 답을 바꾼다) ----
// mode 'real': 사용자 판 모양(워크스페이스 11개, 23개), 'small': 세션 셋, 'big': 판 A + 흉내 세션 22개(36개)
const HOOK = ([mode, n]) => {
  const api = window.__mt.api;
  if (!api.__p100orig) api.__p100orig = api.call.bind(api);
  const now = Date.now();
  const W = (x) => `C:/Workspace/fake-${x}/.git`;
  const S = (i, name, w, o = {}) => ({ id: `s:fk${i}`, kind: 'session', sessionId: `fk${i}`, name, agentKind: 'claude', state: 'ready', category: 'idle', workspaceKey: W(w), parentId: null, role: null, order: null, createdAt: 1e12 + i, loops: 0, model: 'claude-opus-5-5', effort: 'high', activeAt: now - (i + 1) * 7e5, turnAt: null, gitBranch: null, ...o });
  const real = () => {
    const nodes = [{ id: 'human', kind: 'human', name: 'you' },
      S(0, 'conductor', 'multitask', { state: 'working', category: 'working', model: 'claude-fable-5-1', turnAt: now - 72e5, lastPrompt: 'Merge P100 when the worker reports' }),
      S(1, 'p96', 'multitask', { parentId: 's:fk0', role: 'codex child', agentKind: 'codex', model: 'gpt-6', effort: 'xhigh', state: 'working', category: 'working', turnAt: now - 246e4, gitBranch: 'worktree-p96', lastPrompt: 'Spawn a Codex child from the skill' }),
      S(2, 'p97', 'multitask', { parentId: 's:fk0', role: 'launchers', effort: 'xhigh', state: 'working', category: 'working', turnAt: now - 228e4, gitBranch: 'worktree-p97', lastPrompt: 'Launcher name field and rail' }),
      S(3, 'p98', 'multitask', { parentId: 's:fk0', role: 'top bar', effort: 'xhigh', category: 'done', gitBranch: 'worktree-p98' }),
      S(4, 'p99', 'multitask', { parentId: 's:fk0', role: 'arrange links', effort: 'xhigh', state: 'working', category: 'working', turnAt: now - 132e4, gitBranch: 'worktree-p99', lastPrompt: 'Place linked workspaces side by side' }),
      S(5, 'p100', 'multitask', { parentId: 's:fk0', role: 'mission map', effort: 'xhigh', state: 'working', category: 'working', turnAt: now - 108e4, gitBranch: 'worktree-p100', lastPrompt: 'Rework the mission map' }),
      S(6, 'reviewer', 'multitask', { parentId: 's:fk0', role: 'reviewer' }),
      S(7, 'p95', 'multitask', { parentId: 's:fk0', role: 'mission map v2', state: 'exited', category: 'exited', gitBranch: 'worktree-p95' }),
      S(8, 'blog-lead', 'blog', { model: 'claude-sonnet-5-5' }), S(9, 'writer', 'blog', { parentId: 's:fk8', role: 'writer', model: 'claude-sonnet-5-5', state: 'working', category: 'working', turnAt: now - 54e4, lastPrompt: 'Draft the release post' }),
      S(10, 'artex-port', 'artex-ko', { parentId: 's:fk8', role: 'porter', state: 'waiting', category: 'needs_you', ask: 'Overwrite the Korean glossary?' }),
      S(11, 'artex', 'artex-ko', { state: 'sleeping' }), S(12, 'artex-copy', 'artex-ko', { category: 'done' }),
      S(13, 'notes', 'notes', { state: 'waiting', category: 'needs_you', ask: 'Delete this file?' }),
      S(14, 'scraper', 'scraper', { model: 'claude-haiku-4-5', state: 'working', category: 'working', turnAt: now - 3e5, lastPrompt: 'npm test' }),
      S(15, 'scraper-sh', 'scraper', { agentKind: 'shell', model: null, effort: null, state: 'working', category: 'working' }),
      S(16, 'infra', 'infra', { agentKind: 'shell', model: null, effort: null }), S(17, 'dotfiles', 'dotfiles', { state: 'sleeping' }),
      S(18, 'paper', 'research', { state: 'sleeping' }), S(19, 'paper-codex', 'research', { agentKind: 'codex', model: 'gpt-6' }),
      S(20, 'api', 'api', { state: 'sleeping' }), S(21, 'site', 'site', { agentKind: 'shell', model: null, effort: null }), S(22, 'landing', 'landing', { state: 'exited', category: 'exited' })];
    const edges = [{ from: 's:fk0', to: 's:fk1', kind: 'spawn' }, { from: 's:fk0', to: 's:fk2', kind: 'spawn' }, { from: 's:fk0', to: 's:fk3', kind: 'spawn' }, { from: 's:fk0', to: 's:fk4', kind: 'spawn' }, { from: 's:fk0', to: 's:fk5', kind: 'spawn' }, { from: 's:fk0', to: 's:fk6', kind: 'role', label: 'reviewer' }, { from: 's:fk0', to: 's:fk7', kind: 'spawn' },
      { from: 's:fk8', to: 's:fk9', kind: 'spawn' }, { from: 's:fk8', to: 's:fk10', kind: 'spawn' }, { from: 's:fk6', to: 's:fk3', kind: 'role', label: 'review' }, { from: 'human', to: 's:fk0', kind: 'bar', count: 4 }];
    return { nodes, edges, counts: { all: nodes.length - 1 }, at: now };
  };
  const small = () => ({ nodes: [{ id: 'human', kind: 'human' }, S(0, 'lead', 'app', { state: 'working', category: 'working', turnAt: now - 84e4, lastPrompt: 'Split the export into steps' }), S(1, 'worker', 'app', { parentId: 's:fk0', role: 'worker', effort: 'xhigh', state: 'working', category: 'working', turnAt: now - 54e4, gitBranch: 'worktree-export', lastPrompt: 'Export invoices as CSV' }), S(2, 'reviewer', 'app', { parentId: 's:fk0', role: 'reviewer' })],
    edges: [{ from: 's:fk0', to: 's:fk1', kind: 'spawn' }, { from: 's:fk0', to: 's:fk2', kind: 'role', label: 'reviewer' }], counts: {}, at: now });
  const big = (g) => {
    const realN = g.nodes.filter((x) => x.kind === 'session');
    const keys = [...new Set(realN.map((x) => x.workspaceKey))];
    const nodes = [...g.nodes], edges = [...g.edges];
    const st = ['working', 'ready', 'working', 'waiting', 'ready', 'sleeping', 'ready', 'exited'];
    const roles = ['worker', 'reviewer', 'tests', 'docs', 'worker', 'perf probe'];
    const cat = (s) => (s === 'waiting' ? 'needs_you' : s === 'working' ? 'working' : s === 'exited' ? 'exited' : 'idle');
    for (let i = 0; i < n; i++) {
      const lead = i === 0 || i === 10;
      const parent = i >= 1 && i <= 8 ? 's:big0' : i >= 11 && i <= 15 ? 's:big10' : null;
      const ws = i <= 9 ? W('big') : i <= 15 ? W('big2') : keys[i % keys.length];
      const state = lead ? 'ready' : st[i % st.length];
      nodes.push({ id: `s:big${i}`, kind: 'session', sessionId: `big${i}`, name: `big-${String(i).padStart(2, '0')}`, agentKind: i % 4 === 3 ? 'shell' : i % 5 === 1 ? 'codex' : 'claude', state, category: cat(state), workspaceKey: ws, parentId: parent, role: parent ? roles[i % roles.length] : null, order: i, createdAt: 1e12 + i, loops: 0, model: i % 4 === 3 ? null : 'claude-haiku-4-5', activeAt: now - i * 6e5, turnAt: state === 'working' ? now - i * 6e4 : null });
      if (parent) edges.push({ from: parent, to: `s:big${i}`, kind: 'spawn', label: null, active: false });
    }
    edges.push({ from: 's:big0', to: 's:big12', kind: 'prompt', label: 'merge the api change first', count: 3, active: true });
    return { ...g, nodes, edges };
  };
  api.call = (m, p) => (m === 'mission.graph' ? (mode === 'real' ? Promise.resolve(real()) : mode === 'small' ? Promise.resolve(small()) : api.__p100orig(m, p).then(big)) : api.__p100orig(m, p));
};
const UNHOOK = () => { const api = window.__mt.api; if (api.__p100orig) api.call = api.__p100orig; };

// ---- 지도 읽기(PC) ----
const PC_PROBE = `(() => {
  const m = document.querySelector('[data-role=mission]');
  if (!m) return null;
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const cs = (e) => getComputedStyle(e);
  const canvas = m.querySelector('[data-role=mm-canvas]');
  const zoom = canvas ? Number(canvas.dataset.zoom || 1) : 1;
  const nodes = [...m.querySelectorAll('[data-role=mm-node][data-kind=session]')].map((e) => { const s = cs(e), nm = e.querySelector('.mt-mm-name, .nm'); return { name: e.dataset.name, ws: e.dataset.ws, rank: e.dataset.rank || null, family: e.dataset.family || null, tier: e.dataset.tier || null, shape: e.dataset.shape || null, border: parseFloat(s.borderTopWidth) || 0, borderColor: s.borderTopColor, radius: parseFloat(s.borderTopLeftRadius) || 0, titlePx: nm ? Math.round(parseFloat(cs(nm).fontSize) * zoom * 10) / 10 : null, roleText: (e.querySelector('[data-role=mm-role]') || {}).textContent || null, team: (e.querySelector('[data-role=mm-team]') || {}).textContent || null, meta: (e.querySelector('[data-role=mm-meta]') || {}).textContent || null, recede: e.classList.contains('recede'), fdim: e.classList.contains('fdim'), ...R(e) }; });
  const edges = [...m.querySelectorAll('[data-role=mm-edge]')].map((e) => ({ kind: e.dataset.kind, rel: e.dataset.rel || null, from: e.dataset.from, to: e.dataset.to, cross: e.dataset.cross === '1', tree: e.dataset.tree === '1', recede: e.classList.contains('recede'), hot: e.classList.contains('hot') }));
  const groups = [...m.querySelectorAll('[data-role=mm-group]')].map((g) => ({ key: g.dataset.key, name: (g.querySelector('[data-role=mm-group-name]') || {}).textContent, vg: g.dataset.vg || null, count: Number((g.querySelector('[data-role=mm-group-count]') || {}).textContent || 0), bg: cs(g).backgroundColor, border: parseFloat(cs(g).borderTopWidth) || 0, ...R(g) }));
  const frames = [...m.querySelectorAll('[data-role=mm-frame]')].map((f) => ({ name: (f.querySelector('[data-role=mm-vgroup]') || {}).textContent, ...R(f) }));
  const sum = m.querySelector('[data-role=mm-summary]');
  const sec = (k) => (sum && sum.querySelector('[data-role=mm-sum-' + k + ']')) ? [...sum.querySelectorAll('[data-role=mm-sum-' + k + '] [data-role=mm-sum-item], [data-role=mm-sum-' + k + '] [data-role=mm-sum-rest-item]')].map((e) => e.dataset.name || e.textContent) : [];
  const body = m.querySelector('.mt-mission-body');
  return { nodes, edges, groups, frames, zoom, summary: sum ? { turn: sec('turn'), work: sec('work'), review: sec('review'), rest: sec('rest'), foot: (sum.querySelector('[data-role=mm-sum-foot]') || {}).textContent || '' } : null,
    labels: m.querySelectorAll('[data-role=mm-label]').length, legend: !!m.querySelector('[data-role=mm-legend]'),
    body: body ? { ...R(body), cw: body.clientWidth, ch: body.clientHeight, sh: body.scrollHeight, sw: body.scrollWidth } : null, canvas: canvas ? R(canvas) : null };
})()`;

async function openMission(pg) {
  if (await pg.$('[data-role="mission"]')) { await pg.keyboard.press('Escape'); await sleep(400); }
  await pg.click('[data-action="mission-rail"]');
  await pg.waitForSelector('[data-role="mission"] [data-role="mm-node"], [data-role="mission"] [data-role="mm-group"]', { timeout: 20000 });
  await sleep(1800);
}
const hoverNode = async (pg, n) => { await pg.mouse.move(n.x + Math.min(n.w / 2, 40), n.y + n.h / 2); await sleep(500); };
const inPanel = (p, n) => { const g = p.groups.find((x) => x.key === n.ws); return g && n.x >= g.x - 1 && n.y >= g.y + 20 && n.x + n.w <= g.x + g.w + 1 && n.y + n.h <= g.y + g.h + 1; };
const touching = (a, b) => { const gx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), gy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h); return (gx <= 40 && gx >= -1 && gy < 0) || (gy <= 70 && gy >= -1 && gx < 0); };
const shapeOk = (n) => n.border > 0.5 && !/rgba\(0, 0, 0, 0\)|transparent/.test(n.borderColor);
// 흉내 판 공통 검사: 모든 세션에 테두리 있는 모양, 판 안, 겹침 없음, 지도가 칸을 채운다, 제목 크기
function boardChecks(p, E, label, n, { fill = true } = {}) {
  check(`[${E}] ${label}: 세션 ${n}개 모두 테두리 있는 모양(카드·알약·동그라미), 자기 워크스페이스 판 안, 겹침 없음`, p.nodes.length === n && p.nodes.every(shapeOk) && p.nodes.every((x) => inPanel(p, x)) && !overlap(p.nodes) && !overlap(p.groups),
    { n: p.nodes.length, noShape: p.nodes.filter((x) => !shapeOk(x)).map((x) => x.name), outside: p.nodes.filter((x) => !inPanel(p, x)).map((x) => x.name), overlap: overlap(p.nodes), panels: overlap(p.groups) });
  const cards = p.nodes.filter((x) => x.shape === 'card');
  check(`[${E}] ${label}: 카드 제목이 화면에서 16px 이상`, cards.length && cards.every((x) => x.titlePx >= 15.9), cards.map((x) => `${x.name}:${x.titlePx}`).slice(0, 8));
  if (fill && n > 3) { const c = p.canvas, b = p.body; check(`[${E}] ${label}: 지도가 칸을 넉넉히 채운다(폭 85% 넘게 또는 높이 75% 넘게)`, c.w >= b.cw * 0.85 || c.h >= b.ch * 0.75, { canvas: c, body: b, zoom: p.zoom }); }
  if (fill && n <= 3) { const c = p.canvas, b = p.body, l = c.x - b.x, r = b.x + b.cw - (c.x + c.w); check(`[${E}] ${label}: 작은 판은 배율 1로 가운데`, p.zoom === 1 && Math.abs(l - r) < 40, { canvas: c, body: b, zoom: p.zoom, l, r }); }
}

// PC 창과 PC 웹이 같이 쓰는 지도 시험
async function desk(pg, E, { quick = false } = {}) {
  await openMission(pg);
  await pg.mouse.move(Math.max(5, (await pg.viewportSize()).width - 80), 82); await sleep(300); // 머리줄 빈 곳(처음 그림은 가리키지 않은 모습)
  let p = await pg.evaluate(PC_PROBE);
  log(`[${E}] 지도 ${JSON.stringify({ zoom: p.zoom, nodes: p.nodes.map((n) => `${n.name}:${n.rank}/${n.tier}/${n.shape}@${n.ws && n.ws.slice(-14)}`), groups: p.groups.map((g) => `${g.name}${g.vg ? `[${g.vg}]` : ''}`), frames: p.frames.map((f) => f.name), summary: p.summary })}`);
  await shot(pg, `${E}-${TAG}-01-map`);
  if (AFTER) {
    const n = (name) => p.nodes.find((x) => x.name === name) || {};
    const G = (name) => p.groups.find((g) => (g.name || '').endsWith(name)) || {};
    check(`[${E}] 세션 13개가 모두 보인다`, p.nodes.length === 13, p.nodes.map((x) => `${x.name}:${x.shape}`));
    boardChecks(p, E, '판 A', 13);
    check(`[${E}] 잠든 세션(old·e·i)·쉬는 셸은 테두리 있는 알약, 끝남(결과 g·lead2)은 카드`, ['p100-old', 'p100-e', 'p100-i'].every((k) => n(k).tier === 'sleep' && n(k).shape === 'pill') && n('p100-f').shape === 'pill' && n('p100-g').tier === 'review' && n('p100-g').shape === 'card' && n('p100-lead2').shape === 'card', ['p100-old', 'p100-e', 'p100-i', 'p100-f', 'p100-g', 'p100-lead2'].map((k) => `${k}:${n(k).tier}/${n(k).shape}/${n(k).border}`));
    check(`[${E}] 워크스페이스 판 9개(바탕 면과 테두리), 판 머리줄의 수`, p.groups.length === 9 && p.groups.every((g) => g.border > 0.5 && !/rgba\(0, 0, 0, 0\)/.test(g.bg)) && G('mtask-p100-a').count === 4 && G('mtask-p100-c').count === 1, p.groups.map((g) => `${g.name}:${g.count}`));
    check(`[${E}] 역할: 리드 둘은 lead, rev는 sub(review), port는 worker, docs는 solo`, n('p100-lead').rank === 'lead' && n('p100-lead2').rank === 'lead' && n('p100-rev').rank === 'sub' && n('p100-rev').family === 'review' && n('p100-port').rank === 'worker' && n('p100-docs').rank === 'solo', p.nodes.map((x) => `${x.name}:${x.rank}/${x.family}`));
    check(`[${E}] 역할 이름이 읽힌다(reviewer, porter, test runner, ui worker)`, /reviewer/.test(n('p100-rev').roleText || '') && /porter/.test(n('p100-port').roleText || '') && /test runner/.test(n('p100-tests').roleText || '') && /ui worker/.test(n('p100-ui').roleText || ''), p.nodes.map((x) => `${x.name}:${x.roleText}`));
    check(`[${E}] 리드 → 하위는 왼쪽 → 오른쪽(판 안), 다른 워크스페이스 하위 port는 자기 판(c)`, n('p100-rev').x > n('p100-lead').x && n('p100-ui').x > n('p100-lead').x && n('p100-notes').x > n('p100-lead2').x && /mtask-p100-c/.test(n('p100-port').ws || ''), ['p100-lead', 'p100-rev', 'p100-lead2', 'p100-port'].map((x) => [x, n(x).x, n(x).ws]));
    const bandOver = (g) => p.frames.some((f) => /product/i.test(f.name) && f.x <= g.x + 2 && f.x + f.w >= g.x + g.w - 2 && f.y + f.h <= g.y + 2 && g.y - (f.y + f.h) <= 16);
    check(`[${E}] 이어진 판은 이웃: b(lead2) — c(port), 가상 그룹 product 띠가 a·b 바로 위`, touching(G('mtask-p100-b'), G('mtask-p100-c')) && p.frames.length >= 1 && ['mtask-p100-a', 'mtask-p100-b'].every((k) => bandOver(G(k))), { b: G('mtask-p100-b'), c: G('mtask-p100-c'), frames: p.frames });
    const rels = new Set(p.edges.map((e) => e.rel));
    check(`[${E}] 선 종류: 하위 세션(spawn)·역할 연결(role)·다른 워크스페이스(cross), 선 이름표·범례 없음`, rels.has('spawn') && rels.has('role') && p.edges.some((e) => e.cross) && p.labels === 0 && !p.legend, [...rels]);
    const s = p.summary || {};
    check(`[${E}] 요약 열: 응답 필요 1(lead), 작업 중 3(rev·tests·port), 결과(g), 쉼·잠듦·끝남 목록, 아래 줄에 세션 13`, s.turn && s.turn.length === 1 && s.turn[0] === 'p100-lead' && s.work.length === 3 && ['p100-rev', 'p100-tests', 'p100-port'].every((x) => s.work.includes(x)) && s.review.includes('p100-g') && s.rest.length >= 6 && /13/.test(s.foot), s);
    // 가리키면 그 노드의 관계만 또렷
    await hoverNode(pg, n('p100-lead2'));
    p = await pg.evaluate(PC_PROBE);
    const m = (name) => p.nodes.find((x) => x.name === name) || {};
    check(`[${E}] lead2를 가리키면 lead2·port·notes는 또렷하고 lead 팀은 물러난다`, !m('p100-lead2').recede && !m('p100-port').recede && !m('p100-notes').recede && m('p100-lead').recede && m('p100-rev').recede && p.edges.some((e) => e.hot) && p.edges.filter((e) => !e.hot).every((e) => e.recede), p.nodes.map((x) => `${x.name}:${x.recede ? 'r' : '-'}`));
    await shot(pg, `${E}-${TAG}-02-hover-lead2`);
    await hoverNode(pg, m('p100-rev'));
    p = await pg.evaluate(PC_PROBE);
    const q = (name) => p.nodes.find((x) => x.name === name) || {};
    check(`[${E}] rev를 가리키면 부모 lead, 역할 선의 ui·old는 또렷하고 lead2는 물러난다`, !q('p100-rev').recede && !q('p100-lead').recede && !q('p100-ui').recede && !q('p100-old').recede && q('p100-lead2').recede, p.nodes.map((x) => `${x.name}:${x.recede ? 'r' : '-'}`));
    await shot(pg, `${E}-${TAG}-03-hover-rev`);
    await pg.mouse.move(5, 500); await sleep(400);
    p = await pg.evaluate(PC_PROBE);
    check(`[${E}] 빈 곳으로 빼면 모두 또렷`, p.nodes.every((x) => !x.recede), p.nodes.filter((x) => x.recede).map((x) => x.name));
    const before = Object.fromEntries(p.nodes.map((x) => [x.name, [x.x, x.y]]));
    await pg.click('[data-filter=working]'); await sleep(500);
    p = await pg.evaluate(PC_PROBE);
    const still = p.nodes.every((x) => before[x.name] && before[x.name][0] === x.x && before[x.name][1] === x.y);
    check(`[${E}] 거르기(작업 중)는 맞지 않는 세션을 흐리게만 하고 자리는 그대로`, still && p.nodes.filter((x) => !x.fdim).every((x) => x.tier === 'work') && p.nodes.some((x) => x.fdim), p.nodes.map((x) => `${x.name}:${x.fdim ? 'd' : '-'}`));
    await shot(pg, `${E}-${TAG}-04-filter-working`);
    await pg.click('[data-filter=all]'); await sleep(300);
  }
  // 판 B: 사용자 판 모양(23개, 워크스페이스 11개)
  for (const [mode, label, cnt] of [['real', '05-real', 23], ['small', '06-small', 3], ['big', '07-big', 36]]) {
    if (quick && mode !== 'real') continue;
    await pg.evaluate(UNHOOK);
    await pg.evaluate(HOOK, [mode, 23]);
    await openMission(pg);
    await pg.mouse.move(Math.max(5, (await pg.viewportSize()).width - 80), 82); await sleep(300);
    p = await pg.evaluate(PC_PROBE);
    await shot(pg, `${E}-${TAG}-${label}`);
    log(`[${E}] ${mode}: ${JSON.stringify({ zoom: p.zoom, n: p.nodes.length, canvas: p.canvas, body: p.body })}`);
    if (AFTER) {
      boardChecks(p, E, mode, cnt, { fill: mode !== 'big' });
      if (mode === 'real') check(`[${E}] 실제 판 모양: 판이 여러 열, 한 화면에 든다(스크롤 없음), writing 같은 이어진 판은 이웃`, new Set(p.groups.map((g) => g.x)).size >= 3 && p.body.sh <= p.body.ch + 2 && touching(p.groups.find((g) => /blog/.test(g.name)), p.groups.find((g) => /artex-ko/.test(g.name))), { cols: new Set(p.groups.map((g) => g.x)).size, body: p.body });
      if (mode === 'big') { const b0 = p.nodes.find((x) => x.name === 'big-00'); if (b0) { await hoverNode(pg, b0); await shot(pg, `${E}-${TAG}-08-big-hover`); } }
    }
  }
  await pg.evaluate(UNHOOK);
  await pg.keyboard.press('Escape');
}

// ---- PC 창(Electron) ----
async function pc(w, h, E) {
  const app = await electron.launch({ args: ['.', '--dev', `--remote-debugging-port=${CDP}`], cwd: path.join(REPO, 'app'), env: Object.fromEntries(Object.entries({ ...process.env, ...ENV }).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|ELECTRON_RUN_AS_NODE)/.test(k))), timeout: 60000 });
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
    await page.evaluate(() => window.__mt.pinBottom && window.__mt.pinBottom(true));
    await page.setViewportSize({ width: w, height: h }).catch(() => {});
    await sleep(3000);
    await desk(page, E, { quick: E === 'pc2560' && !AFTER });
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
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'ko-KR' });
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
  const nodes = [...document.querySelectorAll('[data-role=pm-node]')].map((e) => { const s = getComputedStyle(e); return { name: e.dataset.name, tier: e.dataset.tier, rank: e.dataset.rank || null, family: e.dataset.family || null, shape: e.dataset.shape || null, border: parseFloat(s.borderTopWidth) || 0, borderColor: s.borderTopColor, role: (e.querySelector('[data-role=pm-role]') || {}).textContent || null, team: (e.querySelector('[data-role=pm-team]') || {}).textContent || null, meta: (e.querySelector('[data-role=pm-meta]') || {}).textContent || null, dim: e.classList.contains('dim'), ...R(e) }; });
  const edges = [...document.querySelectorAll('[data-role=pm-edge]')].map((e) => ({ kind: e.dataset.kind, rel: e.dataset.rel || null }));
  const groups = [...document.querySelectorAll('[data-role=pm-group]')].map((g) => ({ ws: g.dataset.ws, key: g.dataset.ws, name: (g.querySelector('.mt-pm-gname') || {}).textContent, vg: g.dataset.vg || null, border: parseFloat(getComputedStyle(g).borderTopWidth) || 0, ...R(g) }));
  const frames = [...document.querySelectorAll('[data-role=pm-frame]')].map((f) => ({ name: (f.querySelector('[data-role=pm-vgroup]') || {}).textContent, ...R(f) }));
  const world = document.querySelector('[data-role=pm-world]');
  return { nodes, edges, groups, frames, stage: st ? R(st) : null, world: world ? R(world) : null, legend: !!document.querySelector('[data-role=pm-legend]'), view: window.__mtPm ? window.__mtPm.view() : null, page: { sw: document.documentElement.scrollWidth, iw: innerWidth } };
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
const WS_HOOK = () => {
  const Orig = window.WebSocket;
  window.__p100 = { sent: [] };
  class Hooked extends Orig { constructor(...a) { super(...a); const send = this.send.bind(this); this.send = (d) => { try { window.__p100.sent.push({ m: JSON.parse(d).method, t: Math.round(performance.now()) }); } catch {} return send(d); }; } }
  window.WebSocket = Hooked;
};
const TOUCH_HOOK = () => {
  window.__p100touch = (type, pts, remain) => {
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
function fingers(pg, cdp) {
  const send = async (type, pts, remain) => {
    if (cdp) { const map = { touchstart: 'touchStart', touchmove: 'touchMove', touchend: 'touchEnd' }; await cdp.send('Input.dispatchTouchEvent', { type: map[type], touchPoints: (type === 'touchend' ? remain || [] : pts).map((p) => ({ x: p.x, y: p.y, id: p.id })) }); }
    else await pg.evaluate(([t, p, r]) => window.__p100touch(t, p, r), [type, pts, remain || []]);
  };
  const steps = async (from, to, n) => { for (let i = 1; i <= n; i++) await send('touchmove', from.map((f, k) => ({ id: f.id, x: f.x + ((to[k].x - f.x) * i) / n, y: f.y + ((to[k].y - f.y) * i) / n }))); };
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
const viewOf = (pg) => pg.evaluate(() => { const p = document.querySelector('[data-role=phone]'); return p ? p.dataset.view : 'none'; });
const tapSel = async (pg, sel) => { await pg.waitForSelector(sel, { timeout: 15000 }); await pg.tap(sel); };
const sentSince = (pg, t) => pg.evaluate((t0) => (window.__p100 ? window.__p100.sent : []).filter((x) => x.t >= t0).map((x) => x.m), t);
const nowIn = (pg) => pg.evaluate(() => Math.round(performance.now()));
// 손가락 조작(P89에서 지킨 것): 옮기기, 두 손가락 확대, 맞추기, 요약 칩, 탭 → 세션 → 돌아오면 같은 보기, 대화·터미널 요청 없음
async function gestures(pg, cdp, E, t0) {
  const F = fingers(pg, cdp);
  let p = await pg.evaluate(PH_PROBE);
  const fit0 = p.view;
  const sx = p.stage.x + p.stage.w / 2, sy = p.stage.y + p.stage.h / 2;
  await F.pan(sx, sy, -40, -140); await sleep(400);
  const panned = (await pg.evaluate(PH_PROBE)).view;
  check(`[${E}] 한 손가락으로 옮긴다(보기가 손가락만큼)`, Math.abs(panned.x - (fit0.x - 40)) <= 2 && Math.abs(panned.y - (fit0.y - 140)) <= 2 && panned.zoom === fit0.zoom, { fit0, panned });
  await F.pinch(sx, sy, 100, 200); await sleep(400);
  p = await pg.evaluate(PH_PROBE);
  const wx = (sx - p.stage.x - panned.x) / panned.zoom;
  check(`[${E}] 두 손가락으로 확대(두 배, 가운데 점이 그 자리에)`, Math.abs(p.view.zoom / panned.zoom - 2) < 0.08 && Math.abs(wx * p.view.zoom + p.view.x - (sx - p.stage.x)) < 4, { panned, zoomed: p.view });
  await tapSel(pg, '[data-action=pm-fit]'); await sleep(400);
  check(`[${E}] 맞추기 단추는 처음 보기로`, JSON.stringify((await pg.evaluate(PH_PROBE)).view) === JSON.stringify(fit0), fit0);
  await tapSel(pg, '[data-action=pm-focus-turn]'); await sleep(500);
  p = await pg.evaluate(PH_PROBE);
  const lead = p.nodes.find((x) => x.name === 'p100-lead') || {};
  check(`[${E}] 응답 필요 칩: lead만 또렷하고 나머지는 물러나며 화면 안`, !lead.dim && p.nodes.filter((x) => x.name !== 'p100-lead').every((x) => x.dim) && lead.y > p.stage.y && lead.y + lead.h < p.stage.y + p.stage.h, { lead, view: p.view });
  await shot(pg, `${E}-${TAG}-05-focus-turn`);
  await tapSel(pg, '[data-action=pm-focus-turn]'); await sleep(300);
  check(`[${E}] 칩을 다시 누르면 모두 또렷하게`, (await pg.evaluate(PH_PROBE)).nodes.every((x) => !x.dim));
  await tapSel(pg, '[data-action=pm-fit]'); await sleep(300);
  p = await pg.evaluate(PH_PROBE);
  const ui0 = p.nodes.find((x) => x.name === 'p100-ui');
  if (ui0 && ui0.y + ui0.h > p.stage.y + p.stage.h - 60) { await F.pan(sx, sy, 0, -(ui0.y - p.stage.y - 120)); await sleep(400); }
  p = await pg.evaluate(PH_PROBE);
  const before = { view: p.view, ui: p.nodes.find((x) => x.name === 'p100-ui') };
  const sent = await sentSince(pg, t0);
  check(`[${E}] 관계도를 여는 동안·옮기는 동안 session.messages·terminal.* 요청이 없고 mission.graph를 받는다`, !sent.some((x) => /^session\.messages$|^terminal\./.test(x)) && sent.includes('mission.graph'), [...new Set(sent)]);
  await tapSel(pg, '[data-role=pm-node][data-name="p100-ui"]');
  await pg.waitForFunction(() => document.querySelector('[data-role=phone]').dataset.view === 'session', null, { timeout: 10000 }).catch(() => {});
  await sleep(1500);
  check(`[${E}] 알약(쉬는 셸)을 탭하면 그 세션 화면`, (await viewOf(pg)) === 'session');
  await tapSel(pg, '[data-action=phone-back]');
  await pg.waitForFunction(() => document.querySelector('[data-role=phone]').dataset.view === 'mission', null, { timeout: 10000 }).catch(() => {});
  await sleep(1200);
  p = await pg.evaluate(PH_PROBE);
  const ui = p.nodes.find((x) => x.name === 'p100-ui') || {};
  check(`[${E}] 돌아오면 같은 자리·배율`, JSON.stringify(p.view) === JSON.stringify(before.view) && Math.abs(ui.x - before.ui.x) <= 1 && Math.abs(ui.y - before.ui.y) <= 1, { before, after: { view: p.view, ui } });
  await F.pan(ui.x + ui.w / 2, ui.y + ui.h / 2, 40, 30); await sleep(700);
  check(`[${E}] 카드 위에서 시작해 옮기면 열리지 않는다`, (await viewOf(pg)) === 'mission', await viewOf(pg));
  await tapSel(pg, '[data-action=pm-fit]'); await sleep(300);
}
const longestColumn = (ns) => { const m = new Map(); for (const x of ns) m.set(Math.round(x.x / 20), (m.get(Math.round(x.x / 20)) || 0) + 1); return Math.max(0, ...m.values()); };
const phoneShape = (p, E, label, n) => check(`[${E}] ${label}: 세션 ${n}개 모두 테두리 있는 모양, 판(테두리) ${p.groups.length}개, 겹침 없음, 가로 스크롤 없음`, p.nodes.length === n && p.nodes.every(shapeOk) && p.groups.every((g) => g.border > 0.5) && !overlap(p.nodes) && !overlap(p.groups) && p.page.sw <= p.page.iw, { n: p.nodes.length, noShape: p.nodes.filter((x) => !shapeOk(x)).map((x) => x.name), overlap: overlap(p.nodes), page: p.page });
async function phone(E) {
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: B0.sim, target: B0.port, name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const browser = E === 'webkit' ? await webkit.launch({ headless: true }) : await launchChromium();
  const mem = {};
  try {
    for (const d of call('device.list').devices) call('device.revoke', { id: d.id });
    const ctx = await browser.newContext(PHONE);
    await ctx.addInitScript(WS_HOOK); await ctx.addInitScript(TOUCH_HOOK);
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => log(`[${E} pageerror] ${e.message}`));
    const cdp = E === 'chromium' ? await ctx.newCDPSession(pg) : null;
    if (cdp) await cdp.send('Performance.enable').catch(() => {});
    const readMem = async (label) => { await sleep(1500); if (E === 'webkit') mem[label] = { webkitMB: webkitMB() }; else { const m = await cdp.send('Performance.getMetrics').catch(() => null); const v = m && m.metrics.find((x) => x.name === 'JSHeapUsedSize'); mem[label] = { heapMB: v ? Math.round(v.value / 1048576) : null }; } log(`[${E}] 메모리 ${label} ${JSON.stringify(mem[label])}`); };
    await pair(pg, `http://localhost:${B0.sim}`);
    await sleep(2500);
    await readMem('list');
    const t0 = await nowIn(pg);
    await pg.tap('[data-action=phone-mission]');
    await pg.waitForFunction(() => document.querySelectorAll('[data-role=pm-node]').length >= 12, null, { timeout: 20000 }).catch(() => {});
    await sleep(2500);
    let p = await pg.evaluate(PH_PROBE);
    log(`[${E}] 그래프 ${JSON.stringify({ nodes: p.nodes.map((x) => `${x.name}:${x.rank}/${x.tier}/${x.shape}`), groups: p.groups.map((g) => `${g.name}${g.vg ? `[${g.vg}]` : ''}`), frames: p.frames.map((f) => f.name), edges: p.edges.map((e) => e.rel || e.kind), view: p.view })}`);
    await shot(pg, `${E}-${TAG}-01-portrait`);
    if (AFTER) {
      const n = (name) => p.nodes.find((x) => x.name === name) || {};
      phoneShape(p, E, '판 A', 13);
      check(`[${E}] 잠든 세션은 테두리 있는 알약(글이 떠 있지 않다)`, ['p100-old', 'p100-e', 'p100-i'].every((k) => n(k).shape === 'pill' && n(k).tier === 'sleep' && n(k).border >= 1), ['p100-old', 'p100-e', 'p100-i'].map((k) => `${k}:${n(k).shape}/${n(k).border}`));
      check(`[${E}] PC와 같은 역할 분류: 리드 둘, reviewer는 review, docs는 solo`, n('p100-lead').rank === 'lead' && n('p100-lead2').rank === 'lead' && n('p100-rev').family === 'review' && n('p100-rev').rank === 'sub' && n('p100-docs').rank === 'solo', p.nodes.map((x) => `${x.name}:${x.rank}/${x.family}`));
      check(`[${E}] 리드 → 하위는 왼쪽 → 오른쪽(PC와 같다)`, n('p100-rev').x > n('p100-lead').x && n('p100-notes').x > n('p100-lead2').x, ['p100-lead', 'p100-rev', 'p100-lead2', 'p100-notes'].map((x) => [x, n(x).x]));
      check(`[${E}] 가상 그룹 띠(product), 판 9개`, p.frames.length >= 1 && p.frames.every((f) => /product/i.test(f.name)) && p.groups.length === 9, { frames: p.frames, groups: p.groups.length });
      check(`[${E}] 범례 없음, 배율 1 근처(읽힌다)`, !p.legend && p.view && p.view.zoom >= 0.95, { legend: p.legend, view: p.view });
    }
    if (AFTER) await gestures(pg, cdp, E, t0);
    await readMem('mission');
    await pg.setViewportSize({ width: H, height: W }); await sleep(1500);
    p = await pg.evaluate(PH_PROBE);
    await shot(pg, `${E}-${TAG}-02-landscape`);
    if (AFTER) check(`[${E}] 가로 화면: 칸이 넷(판이 세 x 넘게), 겹침 없음`, new Set(p.groups.map((g) => Math.round(g.x / 20))).size >= 3 && !overlap(p.nodes), [...new Set(p.groups.map((g) => g.x))]);
    await pg.setViewportSize({ width: W, height: H }); await sleep(1200);
    for (const [mode, label, cnt] of [['real', '03-real', 23], ['big', '04-big', 36], ['small', '06-small', 3]]) {
      await pg.evaluate(UNHOOK);
      await pg.evaluate(HOOK, [mode, 23]);
      await pg.tap('[data-action=phone-mission-back]'); await sleep(600); await pg.evaluate(() => window.__mtPhone.mission());
      await pg.waitForFunction((c) => document.querySelectorAll('[data-role=pm-node]').length >= c, cnt, { timeout: 20000 }).catch(() => {});
      await sleep(1800);
      p = await pg.evaluate(PH_PROBE);
      await shot(pg, `${E}-${TAG}-${label}`);
      if (AFTER) {
        phoneShape(p, E, mode, cnt);
        if (mode === 'real') check(`[${E}] 실제 판 모양(23개, 워크스페이스 11개): 세로 한 줄이 아니다(가장 긴 기둥이 전체의 2/3 아래)`, longestColumn(p.nodes) <= Math.ceil(p.nodes.length * 2 / 3) && new Set(p.groups.map((g) => g.x)).size >= 2, { longest: longestColumn(p.nodes), world: p.world, stage: p.stage });
        if (mode === 'big') {
          const F = fingers(pg, cdp), t1 = Date.now();
          await F.pan(p.stage.x + p.stage.w / 2, p.stage.y + p.stage.h / 2, 0, -200, 40);
          const per = Math.round(((Date.now() - t1) / 42) * 10) / 10;
          check(`[${E}] 큰 판에서도 손가락 움직임 하나가 빠르다(${per}ms)`, per < 40, { per });
          const sx = p.stage.x + p.stage.w / 2, sy = p.stage.y + p.stage.h / 2;
          if (cdp) for (let i = 0; i < 20; i++) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy + 100, id: 1 }] });
            for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy + 100 - k * (i % 2 ? -20 : 20), id: 1 }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          }
          await readMem('big');
        }
      }
      if (mode === 'big' && !AFTER) await readMem('big');
    }
    if (E === 'webkit') check(`[${E}] WebKit 웹 프로세스 메모리(목록 → 관계도 → 큰 판)가 P89 수준(늘어남 100MB 안)`, !AFTER || mem.big.webkitMB - mem.list.webkitMB < 100, mem);
    fs.writeFileSync(path.join(OUT, `p100-mem-${E}-${TAG}.json`), JSON.stringify(mem, null, 1));
    await pg.evaluate(UNHOOK);
    await ctx.close();
  } finally { await browser.close().catch(() => {}); await sim.close().catch(() => {}); }
}

async function stopBoard() {
  for (const s of sessions().filter((x) => /^p100-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(2000);
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') { await setupBoard(); await stir(); }
  else if (WHAT === 'stir') await stir();
  else if (WHAT === 'pc') { await stir(); await pc(1920, 1080, 'pc'); }
  else if (WHAT === 'pc2560') { await stir(); await pc(2560, 1440, 'pc2560'); }
  else if (WHAT === 'web') { await stir(); await web(); }
  else if (WHAT === 'webkit' || WHAT === 'chromium') { await stir(); await phone(WHAT); }
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p100-${WHAT}-${TAG}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
