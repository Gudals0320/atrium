// P273 README 스크린숏: 개발용 판(atrium-dev-p273, 48023, CDP 9504)에 지어낸 데모를 꾸며 고해상도(1920×1080, DPR 2/1.5)로 찍는다.
// 사용자의 실제 판·대화·저장소·경로는 열지도 읽지도 찍지도 않는다.
//   node app/test/e2e/p273-readme-shots.mjs seed       지어낸 폴더(C:\Workspace\atrium-demo\*)와 세션·덩어리·워크트리·메모·칸반을 준비한다
//   node app/test/e2e/p273-readme-shots.mjs shoot      장면 여섯(board, session-map, dock, sidebar, remote, phone)을 experiments/p273/에 찍는다
//   node app/test/e2e/p273-readme-shots.mjs publish    1MiB 아래인지 확인해 .github/images/로 옮긴다
//   node app/test/e2e/p273-readme-shots.mjs clean      세션·터미널 서버(이 판만)·백엔드·데모 폴더·데이터 폴더를 정리한다
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const APP_ROOT = path.join(REPO, 'app');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p273');
const IMAGES = path.join(REPO, '.github', 'images');
const DEMO = 'C:\\Workspace\\atrium-demo';
const WEB = path.join(DEMO, 'web-app');
const OAUTH = path.join(DEMO, 'web-app-oauth');
const API = path.join(DEMO, 'api');
const DOCS = path.join(DEMO, 'docs-site');

const W = 1920, H = 1080;
const SESSION = process.env.MT_E2E_HERDR_SESSION || 'atrium-dev-p273';
const PORT = Number(process.env.MT_E2E_PORT || 48023);
const CDP_PORT = Number(process.env.MT_E2E_CDP_PORT || 9504);
const SIM = Number(process.env.MT_E2E_SIM_PORT || 48223);
const PC = 'pc.example.ts.net';
const PC_DISPLAY = 'workstation.example.ts.net';
const MAX_PNG = 980 * 1024; // 공개 검사 상한 1MiB 아래로 여유를 둔다

// 실제 판에서 물려받은 환경 변수를 모두 지운 뒤 이 시험 판의 값만 넣는다
for (const k of Object.keys(process.env)) {
  if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR|CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) {
    delete process.env[k];
  }
}
const ENV = {
  ATRIUM_TERMINAL_SESSION: SESSION,
  ATRIUM_HERDR_SESSION: SESSION,
  ATRIUM_PORT: String(PORT),
  ATRIUM_DATA_DIR: path.join(DEV, 'data'),
  ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'convos'),
  ATRIUM_CLAUDE_DESKTOP: 'none',
  ATRIUM_CLAUDE_SESSIONS: path.join(DEV, 'claude-sessions-empty'),
  ATRIUM_CODEX_HOME: path.join(DEV, 'codex-empty'),
  ATRIUM_AGY_HOME: path.join(DEV, 'agy-empty'),
  ATRIUM_TEST_PREFIX: 'p273-none-',
  ATRIUM_TAILSCALE: path.join(APP_ROOT, 'test', 'e2e', 'p49-fake-tailscale.mjs'),
  P49_FAKE_TS_PORT: String(PORT),
  ATRIUM_WEB_HOSTS: `${PC}:${SIM},localhost:${SIM}`,
  MT_E2E_OUT: 'p273',
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8',
};
Object.assign(process.env, ENV);
for (const d of [OUT, ENV.ATRIUM_CLAUDE_PROJECTS, ENV.ATRIUM_CLAUDE_SESSIONS, ENV.ATRIUM_CODEX_HOME, ENV.ATRIUM_AGY_HOME]) {
  fs.mkdirSync(d, { recursive: true });
}

const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
if (!/^atrium-dev-/.test(SESSION) || PORT === 47800) throw new Error('개발용 판 값만 허용');

const { _electron: electron, chromium } = await import('playwright');
const { logger, sleep, until, closeApp } = await import('./harness.mjs');
const log = logger('p273-readme');

const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const api = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=Atrium Demo', '-c', 'user.email=demo@example.com', '-c', 'init.defaultBranch=main', '-c', 'core.autocrlf=false', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();

// ---------- 지어낸 데모 저장소 ----------
const DEMO_FILES = {
  web: {
    'package.json': JSON.stringify({ name: 'web-app', version: '0.3.0', private: true, type: 'module', scripts: { dev: 'vite', test: 'node --test' } }, null, 2) + '\n',
    'README.md': '# web-app\n\nStorefront web client. Next milestone: OAuth sign-in and theme switcher.\n',
    'src/App.jsx': [
      "import { useState } from 'react';",
      "import './theme.css';",
      '',
      'export default function App() {',
      '  const [items, setItems] = useState([]);',
      '  return (',
      '    <main className="app">',
      '      <h1>Storefront</h1>',
      '      <p>{items.length} items in bag</p>',
      '    </main>',
      '  );',
      '}',
      '',
    ].join('\n'),
    'src/theme.css': ':root {\n  --bg: #ffffff;\n  --fg: #181a1f;\n  --accent: #22c55e;\n}\n\nbody { background: var(--bg); color: var(--fg); }\n',
    'src/auth.js': 'export async function signInWithOAuth(provider) {\n  return { ok: true, provider };\n}\n',
  },
  api: {
    'package.json': JSON.stringify({ name: 'api', version: '0.3.0', private: true, type: 'module', scripts: { start: 'node server.js', test: 'node --test' } }, null, 2) + '\n',
    'server.js': [
      "import fs from 'node:fs';",
      "import http from 'node:http';",
      "fs.writeFileSync('server.pid', String(process.pid));",
      'const port = 4080;',
      "http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, route: req.url })); })",
      '  .listen(port, () => console.log(`api listening on http://localhost:${port}`));',
      '',
    ].join('\n'),
    'test/health.test.js': [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      '',
      "test('GET /health returns 200 ok', () => { assert.equal(JSON.parse('{\"ok\":true}').ok, true); });",
      "test('GET /oauth/callback validates state', () => { assert.equal('state_ok'.startsWith('state_'), true); });",
      "test('rate limiter allows burst under 60 rpm', () => { assert.ok(42 < 60); });",
      '',
    ].join('\n'),
  },
  docs: {
    'package.json': JSON.stringify({ name: 'docs-site', version: '0.3.0', private: true, type: 'module', scripts: { build: 'echo "docs built in 180ms"' } }, null, 2) + '\n',
    'README.md': '# docs-site\n\nAPI reference and guides.\n',
    'guide/oauth.md': '# OAuth Setup\n\nConfigure client ID and callback URL before enabling OAuth.\n',
  },
};

function writeTree(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
}

function makeDemoDirs() {
  if (fs.existsSync(DEMO)) fs.rmSync(DEMO, { recursive: true, force: true });
  fs.mkdirSync(DEMO, { recursive: true });
  // 그림이 영어로 나오게 상위 폴더 CLAUDE.md에 영어 지침을 둔다
  fs.writeFileSync(path.join(DEMO, 'CLAUDE.md'), '# Demo Workspace\n\nThis is an English-language demo workspace. Write every reply, summary, and question in concise English. Keep replies to 2-3 short lines.\n');
  writeTree(WEB, DEMO_FILES.web);
  fs.mkdirSync(OAUTH, { recursive: true });
  writeTree(API, DEMO_FILES.api);
  writeTree(DOCS, DEMO_FILES.docs);
  git(API, 'init', '-q'); git(API, 'add', '.'); git(API, 'commit', '-qm', 'api: initial health and oauth routes');
  git(DOCS, 'init', '-q'); git(DOCS, 'add', '.'); git(DOCS, 'commit', '-qm', 'docs: initial oauth guide');
}

const sessionList = () => {
  const r = api('session.list');
  return Array.isArray(r) ? r : (r.sessions || []);
};
const byName = (n) => sessionList().find((s) => s.name === n) || null;
const waitSess = (name, states, ms = 180000) => until(() => {
  const s = byName(name);
  return s && (!states || states.includes(s.state)) ? s : null;
}, ms, 1000);

// ---------- seed ----------
const EN = 'Reply in concise English (2 lines max).';
async function seed() {
  makeDemoDirs();
  log('데모 폴더 생성', DEMO);
  log('백엔드 시작', atrium('backend', 'start').trim().slice(0, 200));
  api('settings.set', { key: 'language', value: 'en' });
  api('settings.set', { key: 'tray', value: false });
  api('settings.set', { key: 'workLight', value: 'on' });

  // 기존 세션이 있으면 비운다
  for (const s of sessionList()) {
    try { atrium('kill', s.sessionId, '--yes'); } catch {}
  }

  const wWeb = api('workspace.open', { path: WEB, select: true }).workspace;
  const wApi = api('workspace.open', { path: API, select: false }).workspace;
  const wDocs = api('workspace.open', { path: DOCS, select: false }).workspace;
  log('워크스페이스', wWeb.name, wApi.name, wDocs.name);

  // 1. 일반 폴더일 때 Claude Code(haiku) 세션을 띄운다(신뢰 대화상자 없이)
  api('session.spawn', { cwd: WEB, name: 'lead', model: 'haiku', permissionMode: 'acceptEdits' });
  api('session.spawn', { cwd: WEB, name: 'ui', model: 'haiku', permissionMode: 'acceptEdits' });
  api('session.spawn', { cwd: WEB, name: 'tests', model: 'haiku', permissionMode: 'acceptEdits' });
  api('session.spawn', { cwd: OAUTH, name: 'auth', model: 'haiku', permissionMode: 'acceptEdits' });
  for (const n of ['lead', 'ui', 'tests', 'auth']) {
    await waitSess(n, ['ready']);
    log('준비됨', n);
  }

  // 2. web-app을 git 저장소로, web-app-oauth를 워크트리(feature/oauth)로 만든다
  fs.writeFileSync(path.join(WEB, '.gitignore'), 'node_modules/\n');
  git(WEB, 'init', '-q'); git(WEB, 'add', '.'); git(WEB, 'commit', '-qm', 'web-app: storefront baseline');
  git(WEB, 'worktree', 'add', '-q', '-b', 'feature/oauth', OAUTH);
  log('git 저장소와 feature/oauth 워크트리 준비');

  // 3. 실제 작업을 조금 돌려 터미널 화면이 생생하게 채워지게 한다
  api('session.send', { target: 'lead', text: `Read README.md, src/App.jsx, and src/auth.js. Output a crisp 3-bullet release plan for v0.3 assigning @ui (ThemeToggle), @tests (unit tests), and @auth (PKCE verifyState). Use only Read. ${EN}` });
  api('session.send', { target: 'ui', text: `Read src/App.jsx and add a compact ThemeToggle button that switches data-theme on <html> between light and dark. Use only Read and Edit. ${EN}` });
  api('session.send', { target: 'tests', text: `Use Write to create test/theme.test.js with 2 node:test cases for light/dark theme toggle. Do not run Bash. ${EN}` });
  api('session.send', { target: 'auth', text: `Read src/auth.js and add PKCE state verification helper verifyState(expected, got). Use only Read and Edit. ${EN}` });

  // 4. api·docs-site 셸과 merger 자리 셸을 띄운다
  api('session.spawn', { cwd: API, name: 'api-server', kind: 'shell' });
  api('session.spawn', { cwd: API, name: 'api-tests', kind: 'shell' });
  api('session.spawn', { cwd: DOCS, name: 'docs-dev', kind: 'shell' });
  api('session.spawn', { cwd: WEB, name: 'merger-main', kind: 'shell' });
  for (const n of ['api-server', 'api-tests', 'docs-dev', 'merger-main']) {
    await waitSess(n, ['shell_idle', 'shell_running']);
  }
  await sleep(2500);
  atrium('input', 'api-server', 'node server.js\\r');
  atrium('input', 'api-tests', 'npm test\\r');
  atrium('input', 'docs-dev', 'npm run build\\r');
  // merger-main 셸에도 깔끔한 머지 로그를 띄워 빈 프롬프트가 보이지 않게 한다
  atrium('input', 'merger-main', 'clear; echo "Merging feature/oauth -> main (ff-only)..."; echo " src/auth.js          | 24 ++++++++++++++++++++++++"; echo " test/oauth.test.js   | 38 ++++++++++++++++++++++++++++++++++++++"; echo " 2 files changed, 62 insertions(+)"; echo ""; echo "ok 1 - verifyState accepts matching PKCE state"; echo "ok 2 - verifyState rejects mismatched state"; echo "pass 2 / fail 0 (48ms)"\\r');

  // Claude 세션들이 답을 마치길 기다린다
  for (const n of ['lead', 'ui', 'tests', 'auth']) {
    await waitSess(n, ['ready'], 180000);
    log('턴 완료', n);
  }

  // 5. 관계선, 덩어리(lead + ui + tests), 그룹(Product: web-app, Platform: api + docs-site), 메모, 칸반
  const id = (n) => byName(n).sessionId;
  api('link.create', { from: id('lead'), to: id('ui'), role: 'worker' });
  api('link.create', { from: id('lead'), to: id('tests'), role: 'worker' });
  api('link.create', { from: id('lead'), to: id('auth'), role: 'worker' });
  api('dock.layout', { members: [id('lead'), id('ui'), id('tests')], preset: 'main-left' });

  // 폴더 그룹: Platform(api + docs-site)
  try {
    const wss = api('workspace.list').workspaces || api('workspace.list');
    const wsKey = (name) => wss.find((w) => w.name === name)?.key;
    const g = api('group.create', { name: 'Platform', workspaces: [wsKey('api')] });
    if (g && g.created && wsKey('docs-site')) api('group.move', { workspace: wsKey('docs-site'), group: g.created, index: null });
  } catch (e) { log('그룹 만들기 건너뜀', e.message.slice(0, 120)); }

  const webWs = (api('workspace.list').workspaces || api('workspace.list')).find((w) => w.name === 'web-app')?.key || WEB;
  api('memo.create', { text: '## Release v0.3\n- [x] ThemeToggle in header\n- [x] PKCE state helper\n- [ ] OAuth callback tests\n- [ ] Merge feature/oauth → main', workspace: webWs });
  const kb = api('kanban.create', { title: 'Milestone v0.3', columns: ['To do', 'Doing', 'Done'], workspace: webWs });
  api('kanban.update', {
    kanban: kb.kanbanId,
    ops: [
      { op: 'addCard', column: 'To do', text: 'Run staging smoke tests' },
      { op: 'addCard', column: 'Doing', text: 'ThemeToggle component', sessionId: id('ui') },
      { op: 'addCard', column: 'Doing', text: 'Verify theme unit tests', sessionId: id('tests') },
      { op: 'addCard', column: 'Done', text: 'OAuth PKCE helper', sessionId: id('auth') },
      { op: 'addCard', column: 'Done', text: 'Release coordination', sessionId: id('lead') },
    ],
  });

  await sleep(1200);
  layout();
  log('seed 완료');
}

function layout() {
  const b = api('board.get');
  const id = (n) => { const s = byName(n); if (!s) throw new Error(`세션 없음: ${n}`); return s.sessionId; };
  const dock = (b.docks || []).find((d) => d.members.includes(id('lead')));
  // web-app: 1920×1080 화면 비율에 맞춰 넉넉하고 균형 있게 배치
  if (dock) api('dock.update', { dock: dock.dockId, x: 0, y: 0, w: 1460, h: 860 });
  api('board.setNode', { session: id('auth'), x: 1560, y: 30, w: 640, h: 380 });
  api('board.setNode', { session: id('merger-main'), x: 1560, y: 500, w: 640, h: 360 });
  const memo = (b.memos || [])[0], kb = (b.kanbans || [])[0];
  if (memo) api('memo.update', { memo: memo.memoId, x: 0, y: 920, w: 420, h: 270 });
  if (kb) api('kanban.update', { kanban: kb.kanbanId, x: 460, y: 920, w: 860, h: 270 });
  // api: 오른쪽 열
  api('board.setNode', { session: id('api-server'), x: 2520, y: 0, w: 640, h: 410 });
  api('board.setNode', { session: id('api-tests'), x: 2520, y: 450, w: 640, h: 410 });
  // docs-site: 그 오른쪽 아래
  api('board.setNode', { session: id('docs-dev'), x: 2520, y: 950, w: 640, h: 240 });
  log('배치 완료');
}

// ---------- 창 안 흉내 자료(상태·사용량·자원·세션 맵·merger) ----------
function makeFakeUsage() {
  const now = Date.now();
  return {
    providers: {
      claude: {
        provider: 'claude', source: 'statusline', plan: 'Max', model: null, at: now,
        windows: [
          { id: '5h', minutes: 300, usedPct: 32, resetsAt: now + 2.4 * 3600e3 },
          { id: 'week', minutes: 10080, usedPct: 54, resetsAt: now + 3.2 * 86400e3 },
        ],
        credits: null,
      },
      codex: {
        provider: 'codex', source: 'rollout', plan: 'Pro', model: null, at: now,
        windows: [
          { id: '5h', minutes: 300, usedPct: 100, resetsAt: now + 1.5 * 3600e3 },
          { id: 'week', minutes: 10080, usedPct: 68, resetsAt: now + 4 * 86400e3 },
        ],
        credits: { hasCredits: true, unlimited: false, balance: '4280.00' },
      },
      agy: {
        provider: 'agy', source: 'statusline', plan: null, model: null, at: now,
        windows: [
          { id: 'gemini-5h', minutes: 300, usedPct: 18, resetsAt: now + 3.1 * 3600e3 },
          { id: 'gemini-weekly', minutes: 10080, usedPct: 26, resetsAt: now + 5 * 86400e3 },
        ],
        credits: null,
      },
    },
    alertsOn: true,
    at: now,
  };
}

// 세션 맵(PC & 휴대폰)용 지어낸 그래프: Today/Earlier 두 열, 다단계 트리, 동료 사슬, 다중 하네스, 절전 얇은 줄
// 카드 상세(모델·노력·하네스·프롬프트)가 fit 배율에서도 또렷하게 읽히도록 알맞은 밀도로 구성한다
function makeSessionMapShape() {
  const W = (k) => ({ key: k, root: k.replace(/\/\.git$/, '') });
  const folders = [
    { id: 'f-product', name: 'Product', members: ['d:/demo/web-app/.git', 'd:/demo/api/.git'] },
    { id: 'f-platform', name: 'Platform', members: ['d:/demo/docs-site/.git'] },
    { id: 'f-infra', name: 'Infra', members: ['d:/demo/deploy/.git'] },
  ];
  const workspaces = [
    'd:/demo/web-app/.git', 'd:/demo/api/.git',
    'd:/demo/docs-site/.git', 'd:/demo/deploy/.git',
  ].map(W);
  // [name, wsIdx, parent, today, state, kind, model, effort, role, peers, prompt, unseen, ask]
  const sessions = [
    ['lead', 0, null, 1, 'ready', 'claude', 'claude-opus-5-5', 'high', 'lead', [], 'Coordinate OAuth + dark theme release', true],
    ['ui', 0, 'lead', 1, 'working', 'claude', 'claude-sonnet-5-5', 'medium', 'worker', ['api-dev'], 'Add ThemeToggle and dark CSS tokens'],
    ['tests', 0, 'lead', 1, 'waiting', 'codex', 'gpt-5.4', 'high', 'worker', ['ui'], 'Run OAuth + theme test suite', false, 'Bash: npm test -- --grep oauth'],
    ['auth', 0, 'lead', 1, 'working', 'claude', 'claude-sonnet-5-5', 'high', 'worker', [], 'Implement PKCE state helper on feature/oauth'],
    ['style-pass', 0, 'lead', 1, 'sleeping', 'claude', 'claude-haiku-5-5', 'low', 'worker', [], 'Audit focus rings'],
    ['a11y-check', 0, 'lead', 1, 'sleeping', 'codex', 'gpt-5.4-mini', 'low', 'worker', [], 'Verify aria labels'],
    ['perf-trace', 0, 'lead', 1, 'sleeping', 'agy', 'gemini-3-pro', 'medium', 'worker', [], 'Capture scroll frame timings'],

    ['api-dev', 1, null, 1, 'working', 'codex', 'gpt-5.4', 'high', 'peer', ['ui', 'qa'], 'Add /oauth/callback token exchange endpoint'],
    ['qa', 1, null, 1, 'ready', 'agy', 'gemini-3-pro', 'high', 'peer', ['api-dev'], 'Verify rate limiter and error payloads', true],

    // Earlier (오른쪽 열 / 휴대폰 이전 탭)
    ['docs-lead', 2, null, 0, 'ready', 'claude', 'claude-sonnet-5-5', 'medium', 'lead', [], 'Update OAuth quickstart and API guide'],
    ['docs-api', 2, 'docs-lead', 0, 'sleeping', 'pi', 'claude-sonnet-5-5', 'medium', 'worker', [], 'Document /oauth/callback schema'],
    ['ci-lead', 3, null, 0, 'sleeping', 'claude', 'claude-sonnet-5-5', 'medium', 'lead', [], 'Trim Windows build cache steps'],
    ['ci-win', 3, 'ci-lead', 0, 'sleeping', 'claude', 'claude-haiku-5-5', 'low', 'worker', [], 'Measure artifact upload time'],
    ['ci-lint', 3, 'ci-lead', 0, 'sleeping', 'codex', 'gpt-5.4-mini', 'low', 'worker', [], 'Check release workflow YAML'],
  ];
  const pm = new Map(sessions.map((s) => [s[0], new Set(s[9] || [])]));
  for (const [n, ps] of pm) for (const p of ps) if (pm.has(p)) pm.get(p).add(n);
  for (const s of sessions) s[9] = [...pm.get(s[0])];
  return { folders, workspaces, sessions };
}

const HOOK_MAP = ([shape]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p273orig) {
    api.__p273orig = api.call.bind(api);
    window.__p273st = { workspaces: st.workspaces, groups: st.groups };
  }
  const now = Date.now();
  const mid = new Date(now); mid.setHours(0, 0, 0, 0);
  const todayAt = Math.max(mid.getTime() + 1000, now - 45e3);
  const oldAt = now - 2 * 86400e3;
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: 'repo', root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] }));
  st.groups = shape.folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  const nodes = shape.sessions.map(([name, wi, parent, today, state, kind, model, effort, role, peers, prompt, unseen, ask], i) => ({
    id: `s:${name}`,
    kind: 'session',
    sessionId: `fk-${name}`,
    name,
    agentKind: kind,
    state,
    category: state === 'working' || state === 'shell_running' ? 'working' : state === 'waiting' ? 'waiting' : 'idle',
    workspaceKey: shape.workspaces[wi].key,
    parentId: parent ? `s:${parent}` : null,
    lineageParent: parent ? `s:${parent}` : null,
    role: role || null,
    peers: (peers || []).map((p) => `s:${p}`),
    createdAt: 1e12 + i * 1000,
    model: model || null,
    effort: effort || null,
    activeAt: today ? todayAt - i * 12000 : oldAt - i * 300000,
    turnAt: state === 'working' ? now - (i * 23 + 38) * 1000 : null,
    lastPrompt: prompt,
    unseen: !!unseen,
    ask: typeof ask === 'string' ? ask : null,
    gitBranch: name === 'auth' ? 'feature/oauth' : null,
  }));
  const edges = shape.sessions
    .filter((s) => s[2])
    .map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 1, lastAt: now - 3e5 }));
  api.call = async (m, p) => (m === 'mission.graph'
    ? { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now }
    : api.__p273orig(m, p));
};

const UNHOOK_MAP = () => {
  const api = window.__mt.api;
  if (api.__p273orig) {
    api.call = api.__p273orig;
    delete api.__p273orig;
    const st = window.__mt.getState();
    st.workspaces = window.__p273st.workspaces;
    st.groups = window.__p273st.groups;
  }
};

// 보드 위 세션 상태·사용량·CPU·merger 선을 깔끔하게 겹쳐 보이게 한다
async function applyBoardOverlay(page, { withMerger = true } = {}) {
  const usage = makeFakeUsage();
  await page.evaluate(([u, wm]) => {
    const st = window.__mt.getState();
    const now = Date.now();
    const byName = new Map([...st.sessions.values()].map((s) => [s.name, s]));
    const patch = (name, extra) => {
      const s = byName.get(name);
      if (!s) return null;
      const next = { ...s, ...extra };
      window.__mt.api.emit('session.updated', next);
      return next;
    };
    const lead = patch('lead', { state: 'ready', unseen: true, modelNow: 'claude-opus-5-5', effortNow: 'high', lastActivityAt: now - 25000 });
    const ui = patch('ui', { state: 'working', unseen: false, modelNow: 'claude-sonnet-5-5', effortNow: 'medium', lastActivityAt: now - 4000, turnStartedAt: now - 42000 });
    const tests = patch('tests', {
      state: 'waiting', unseen: false, kind: 'codex', modelNow: 'gpt-5.4', effortNow: 'high', lastActivityAt: now - 75000,
      ask: { kind: 'permission', tool: 'Bash', summary: 'npm test -- --grep theme', since: now - 75000 },
    });
    const auth = patch('auth', { state: 'ready', unseen: true, modelNow: 'claude-sonnet-5-5', effortNow: 'high', branch: 'feature/oauth', lastActivityAt: now - 12000 });
    const merger = patch('merger-main', { kind: 'claude', state: 'working', unseen: false, modelNow: 'claude-haiku-5-5', effortNow: 'low', lastActivityAt: now - 3000, turnStartedAt: now - 14000 });
    patch('docs-dev', { kind: 'claude', state: 'working', unseen: false, modelNow: 'claude-sonnet-5-5', lastActivityAt: now - 9000, turnStartedAt: now - 68000 });

    // 자원(메모리 + CPU): 기존 resources 모양을 유지해 덮어쓴다
    const memMap = { lead: 412, ui: 468, tests: 345, auth: 388, 'merger-main': 294, 'api-server': 48, 'api-tests': 22, 'docs-dev': 310 };
    const cpuMap = { lead: 0.4, ui: 6.2, tests: 0.2, auth: 0.3, 'merger-main': 4.1, 'api-server': 1.2, 'api-tests': 0.0, 'docs-dev': 3.5 };
    const resSess = [...st.sessions.values()].map((s) => ({
      sessionId: s.sessionId, name: s.name, memMB: memMap[s.name] ?? 64, claudeMB: memMap[s.name] ?? 64, procs: 2, cpuPct: cpuMap[s.name] ?? 0.2,
    }));
    const sessionsMB = resSess.reduce((a, b) => a + b.memMB, 0);
    window.__mt.api.emit('resources', {
      ...(st.resources || {}),
      sessionCount: resSess.length,
      sessionsMB,
      sessions: resSess,
      controllers: { count: 5, memMB: 54 },
      terminalServer: { memMB: 38 },
      backend: { memMB: 82 },
      running: 3,
      waiting: 1,
      cpu: { sessionsPct: 15.9, systemPct: 24.3 },
      ms: 14,
      at: now,
    });
    window.__mt.api.emit('usage.updated', u);

    // merger 선 & 꼬리표(auth → merger-main)
    if (wm && auth && merger) {
      const mView = {
        mode: 'on',
        answers: { [auth.workspaceKey]: 'on' },
        asks: [],
        mergers: [{ sessionId: merger.sessionId, name: merger.name, open: true, workspace: auth.workspaceKey, target: 'main' }],
        jobs: [{
          unit: 'u-demo-oauth',
          workspace: auth.workspaceKey,
          childId: auth.sessionId,
          child: auth.name,
          mergerId: merger.sessionId,
          merger: merger.name,
          branch: 'feature/oauth',
          target: 'main',
          state: 'merging',
          createdAt: now - 14000,
        }],
        jobsMax: 5,
      };
      if (!window.__mt.api.__p273mOrig) {
        window.__mt.api.__p273mOrig = window.__mt.api.call.bind(window.__mt.api);
      }
      const orig = window.__mt.api.__p273mOrig;
      window.__mt.api.call = async (m, p) => (m === 'merger.status' ? mView : orig(m, p));
      window.__mt.api.emit('merger.updated', mView);
    }
    return { lead: !!lead, ui: !!ui, tests: !!tests, auth: !!auth, merger: !!merger };
  }, [usage, withMerger]);
  await sleep(600);
}

// CDP로 논리 해상도(1920×1080)와 배율(2 → 넘으면 1.5)을 맞춰 선명하게 찍는다
async function setMetrics(cdp, w, h, dpr) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: dpr, mobile: false, screenWidth: w, screenHeight: h,
  });
  await sleep(700);
}

async function crispShot(page, cdp, name, { w = W, h = H, clip = null, dpr = 2 } = {}) {
  const file = path.join(OUT, `${name}.png`);
  await setMetrics(cdp, w, h, dpr);
  await page.screenshot({ path: file, ...(clip ? { clip } : {}) });
  let size = fs.statSync(file).size;
  if (size > MAX_PNG && dpr > 1.5) {
    log(`${name}.png가 ${(size / 1024).toFixed(0)} KiB → DPR 1.5로 다시 찍음`);
    await setMetrics(cdp, w, h, 1.5);
    await page.screenshot({ path: file, ...(clip ? { clip } : {}) });
    size = fs.statSync(file).size;
  }
  log('스크린숏', path.relative(REPO, file), `${(size / 1024).toFixed(0)} KiB`);
  return file;
}

// ---------- shoot ----------
// 헤드리스 Chromium으로 1920×1080 고배율(DPR 2, 980KiB 넘으면 1.5)로 모든 장면을 찍는다.
// PC 모니터 해상도·창 크기 제한 없이 선명하고 메모리를 덜 쓴다.
async function openPairedDesktop(browser, base, { width = W, height = H, dpr = 2, hideRtt = true, name = 'Atrium Window' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, locale: 'en-US' });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
  pg.on('console', (m) => { if (m.type() === 'error') log(`[console.error] ${m.text().slice(0, 300)}`); });
  await pg.goto(`${base}/`);
  await pg.waitForSelector('[data-role=pair]', { timeout: 25000 });
  const code = api('device.code').code;
  await pg.fill('[data-field=pair-name]', name);
  await pg.fill('[data-field=pair-code]', code);
  await pg.click('[data-action=pair-submit]');
  await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
  await pg.waitForSelector('.react-flow', { timeout: 30000 });
  await pg.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => {});
  await pg.addStyleTag({ content: `[data-role="dev-badge"]${hideRtt ? ',[data-role="rtt"]' : ''}{display:none!important}` });
  await pg.evaluate(() => window.__mt.pinBottom && window.__mt.pinBottom(false));
  await sleep(1200);
  return { ctx, pg };
}

async function shoot() {
  const only = (process.argv[3] || '').split(',').filter(Boolean);
  const want = (n) => !only.length || only.includes(n);
  log('백엔드 확인', atrium('backend', 'start').trim().slice(0, 200));
  await sleep(1200);

  api('settings.set', { key: 'language', value: 'en' });
  api('settings.set', { key: 'workLight', value: 'on' });
  api('settings.set', { key: 'missionStyle', value: 'territories' });
  api('settings.set', { key: 'remotePasskey', value: false });
  api('settings.set', { key: 'remoteAccess', value: true });
  for (const d of (api('device.list').devices || [])) api('device.revoke', { id: d.id });

  const { startTsSim } = await import(pathToFileURL(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')).href);
  const sim = startTsSim({ listen: SIM, target: PORT, name: PC, login: 'me@example.com', keepOrigin: true });
  sim.cfg.ip = '100.64.0.2';
  await sim.ready;

  const base = `http://${PC}:${SIM}`;
  const browser = await chromium.launch({
    headless: true,
    ...(chromeExe ? { executablePath: chromeExe } : {}),
    args: [`--host-resolver-rules=MAP ${PC} 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${base}`],
  });

  try {
    const needPc = ['board', 'dock', 'sidebar', 'session-map'].some(want);
    if (needPc) {
      const { ctx, pg: page } = await openPairedDesktop(browser, base, { width: W, height: H, dpr: 2, hideRtt: true, name: 'PC window' });
      const cdp = await ctx.newCDPSession(page);
      const shotCrisp = async (name) => {
        // 백엔드에서 실제 usage.updated가 끼어들어 가짜 사용량을 덮지 않도록 찍기 직전 한 번 더 고정한다
        await page.evaluate((u) => window.__mt.api.emit('usage.updated', u), makeFakeUsage());
        await sleep(150);
        const file = path.join(OUT, `${name}.png`);
        await page.screenshot({ path: file });
        let size = fs.statSync(file).size;
        if (size > MAX_PNG) {
          log(`${name}.png ${(size / 1024).toFixed(0)} KiB → DPR 1.5로 다시 찍음`);
          await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1.5, mobile: false });
          await sleep(500);
          await page.screenshot({ path: file });
          size = fs.statSync(file).size;
          await cdp.send('Emulation.clearDeviceMetricsOverride');
          await sleep(400);
        }
        log('스크린숏', path.relative(REPO, file), `${(size / 1024).toFixed(0)} KiB`);
      };
      const clear = async () => {
        await page.keyboard.press('Escape').catch(() => {});
        await page.evaluate(() => { const s = window.__mt.getState(); s.clearSelection && s.clearSelection(); });
        await sleep(300);
      };
      const rest = async () => { await page.mouse.move(W / 2, 110); await sleep(500); };
      const rectOf = (names) => page.evaluate((ns) => {
        const s = window.__mt.getState();
        const ids = [...s.sessions.values()].filter((x) => ns.includes(x.name)).map((x) => x.sessionId);
        const rs = ids.map((id) => s.nodes.get(id)).filter(Boolean);
        if (!rs.length) return null;
        const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
        return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
      }, names);
      const goRect = async (r, pad = 40) => {
        await page.evaluate((rr) => window.__mt.getState().navigateToRect(rr, 0), { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 });
        await sleep(1400);
      };

      try {
        // 1. board.png — 전체 무한 캔버스
        if (want('board')) {
          await clear();
          await page.evaluate(() => window.__mt.getState().fitAll(0));
          await sleep(1500);
          await applyBoardOverlay(page, { withMerger: true });
          await rest();
          await shotCrisp('board');
        }

        // 2. sidebar.png — dock보다 먼저 찍어 취소된 전달 칩이 아래에 남지 않게 한다
        if (want('sidebar')) {
          await clear();
          await page.evaluate(() => window.__mt.getState().fitAll(0));
          await sleep(1000);
          await applyBoardOverlay(page, { withMerger: true });
          await page.evaluate(() => { try { localStorage.removeItem('mt.sidebar'); } catch {} });
          if (!(await page.$('[data-role="sidebar"]'))) await page.keyboard.press('Control+Shift+E');
          await page.waitForSelector('[data-role="sidebar"]', { timeout: 10000 });
          await sleep(800);
          await applyBoardOverlay(page, { withMerger: true });
          const platFold = await page.$('[data-sb="group"] [data-action="fold"]');
          if (platFold) await platFold.click();
          await sleep(500);
          await page.keyboard.press('Control+f');
          await sleep(400);
          await page.fill('[data-field="search"]', 'theme');
          await until(() => page.evaluate(() => document.querySelectorAll('.mt-search-item:not(.empty)').length >= 2), 8000, 200).catch(() => {});
          await sleep(500);
          await rest();
          await shotCrisp('sidebar');
          await page.keyboard.press('Escape');
          await sleep(300);
          if (await page.$('[data-role="sidebar"]')) await page.keyboard.press('Control+Shift+E');
          await sleep(400);
        }

        // 3. dock.png — 덩어리 가까이 보기(선명한 라이브 터미널 + 배치 틀 막대) + 아래 명령줄(전달 대기열과 스티어링)
        if (want('dock')) {
          await clear();
          const r = await rectOf(['lead', 'ui', 'tests']);
          if (r) await goRect(r, 70);
          await applyBoardOverlay(page, { withMerger: true });
          const head = await page.evaluate(() => {
            const s = window.__mt.getState();
            const id = [...s.sessions.values()].find((x) => x.name === 'lead')?.sessionId;
            const e = id && document.querySelector(`.react-flow__node[data-id="${id}"] .mt-node-head, .react-flow__node[data-id="${id}"] header`);
            if (!e) return null;
            const b = e.getBoundingClientRect();
            return { x: b.left + b.width * 0.55, y: b.top + b.height / 2 };
          });
          if (head) await page.mouse.click(head.x, head.y);
          await sleep(600);
          await page.evaluate(() => {
            window.__mt.pinBottom && window.__mt.pinBottom(true);
            const s = window.__mt.getState();
            const ui = [...s.sessions.values()].find((x) => x.name === 'ui');
            if (ui) {
              const now = Date.now();
              window.__mt.api.emit('delivery', {
                deliveryId: 'dl-demo-1', sessionId: ui.sessionId, name: 'ui',
                status: 'queued', reason: 'working', seq: 1, createdAt: now - 18000,
                text: 'Add keyboard shortcut Alt+T to toggle the theme and persist to localStorage',
              });
              window.__mt.api.emit('delivery', {
                deliveryId: 'dl-demo-2', sessionId: ui.sessionId, name: 'ui',
                status: 'queued', reason: 'working', seq: 2, createdAt: now - 6000,
                text: 'Update the header snapshot once the toggle button is wired',
              });
            }
          });
          await sleep(400);
          await page.focus('[data-role="command"]').catch(() => {});
          await page.fill('[data-role="command"]', '@ui Keep the existing accent token for dark mode — only swap surface and text colors.').catch(() => {});
          await sleep(400);
          const steerBtn = await page.$('[data-action="cmd-steer"]');
          if (steerBtn) await steerBtn.click().catch(() => {});
          await sleep(500);
          await shotCrisp('dock');
          await page.fill('[data-role="command"]', '').catch(() => {});
          await page.evaluate(() => {
            window.__mt.pinBottom && window.__mt.pinBottom(false);
            const st = window.__mt.getState();
            st.deliveries = new Map();
          });
          await clear();
        }

        // 4. session-map.png — Tab 세션 맵(lv-mid 64% 배율로 모델·노력·하네스·브랜치·요약이 다 읽히게)
        if (want('session-map')) {
          await clear();
          const shape = makeSessionMapShape();
          await page.evaluate(HOOK_MAP, [shape]);
          await page.click('[data-action="mission-rail"]');
          await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 });
          await sleep(1000);
          await page.evaluate(() => {
            if (!window.__mtTa) return;
            const L = window.__mtTa.lay();
            const k = 0.64;
            const b = L.bounds;
            const availW = innerWidth - (window.__mtTa.sumW || 260) - 48;
            const x = Math.max(24, Math.round((availW - b.w * k) / 2 - b.x * k));
            const y = Math.round(68 - b.y * k);
            window.__mtTa.set({ k, x, y });
          });
          await sleep(800);
          const hideTabs = await page.addStyleTag({ content: '[data-role="workspaces"]{visibility:hidden!important}' });
          const leadCard = await page.$('[data-role="mission"] .mt-ta-card[data-id="s:lead"]');
          if (leadCard) await leadCard.click().catch(() => {});
          await sleep(500);
          await rest();
          await shotCrisp('session-map');
          await hideTabs.evaluate((el) => el.remove()).catch(() => {});
          await page.keyboard.press('Escape');
          await sleep(400);
          await page.evaluate(UNHOOK_MAP);
        }
      } finally {
        await ctx.close();
      }
    }

    // 5. remote.png — 노트북 브라우저 틀
    if (want('remote')) {
      const { ctx: bctx, pg: web } = await openPairedDesktop(browser, base, { width: 1760, height: 960, dpr: 1.5, hideRtt: false, name: 'Chrome on laptop' });
      await web.evaluate(() => { const s = window.__mt.getState(); s.fitAll && s.fitAll(0); });
      await sleep(1600);
      await applyBoardOverlay(web, { withMerger: true });
      await web.mouse.move(880, 120);
      await sleep(600);
      const inner = path.join(OUT, 'remote-inner.png');
      await web.screenshot({ path: inner });
      await frameLaptop(browser, inner, `https://${PC_DISPLAY}/`, path.join(OUT, 'remote.png'));
      await bctx.close();
    }

    // 6. phone.png — 세로 휴대폰 세션 맵
    if (want('phone')) {
      const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
      const pctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        screen: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: SAFARI,
        locale: 'en-US',
      });
      const pg = await pctx.newPage();
      pg.on('pageerror', (e) => log(`[phone pageerror] ${e.message}`));
      await pg.goto(`http://localhost:${SIM}/`);
      await pg.waitForSelector('[data-role=pair]', { timeout: 25000 });
      const code = api('device.code').code;
      await pg.fill('[data-field=pair-name]', 'iPhone');
      await pg.fill('[data-field=pair-code]', code);
      await pg.click('[data-action=pair-submit]');
      await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
      await pg.addStyleTag({ content: '[data-role="dev-badge"]{display:none!important}' });
      await pg.evaluate(() => { for (const k of ['atrium.phoneMap.view', 'atrium.phoneMap.tab', 'atrium.usage.rep']) localStorage.removeItem(k); });
      await pg.reload();
      await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
      await pg.addStyleTag({ content: '[data-role="dev-badge"]{display:none!important}' });
      await sleep(1000);
      // Safari "Add to Home Screen" 안내 배너가 있으면 닫아 깔끔한 PWA 화면으로 찍는다
      const tipX = await pg.$('.mt-ph-tip-x');
      if (tipX) { await tipX.click().catch(() => {}); await sleep(300); }
      const shape = makeSessionMapShape();
      await pg.evaluate(HOOK_MAP, [shape]);
      await pg.evaluate(() => window.__mtPhone && window.__mtPhone.mission());
      await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 });
      await sleep(1000);
      await pg.evaluate((u) => window.__mt.api.emit('usage.updated', u), makeFakeUsage());
      await sleep(500);
      await pg.evaluate(() => window.__mtPm && window.__mtPm.fit());
      await sleep(800);
      const rawPhone = path.join(OUT, 'phone-inner.png');
      await pg.screenshot({ path: rawPhone });
      await framePhone(browser, rawPhone, path.join(OUT, 'phone.png'));
      await pctx.close();
    }
  } finally {
    await browser.close().catch(() => {});
    sim.close && sim.close();
  }
}

async function frameLaptop(browser, innerPng, url, out) {
  const b64 = fs.readFileSync(innerPng).toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#0a0c0b;font-family:"Segoe UI",system-ui,sans-serif}
  .stage{height:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
  .win{width:1760px;border-radius:14px;overflow:hidden;box-shadow:0 32px 88px rgba(0,0,0,.65),0 0 0 1px #2a2f2c;background:#1a1d1c}
  .bar{height:44px;display:flex;align-items:center;gap:14px;padding:0 16px;background:#1a1d1c;border-bottom:1px solid #282d2a}
  .dots{display:flex;gap:8px}.dots i{width:11px;height:11px;border-radius:50%;background:#3a3f3c;display:block}
  .nav{color:#7d847f;font-size:15px;letter-spacing:6px}
  .url{flex:1;height:28px;border-radius:14px;background:#111413;color:#c9d1cc;display:flex;align-items:center;padding:0 14px;font-size:13px;gap:8px}
  .url b{color:#7fd6a4;font-weight:500}
  .lock{width:11px;height:11px;border:2px solid #7fd6a4;border-radius:3px;box-sizing:border-box}
  img{display:block;width:1760px}
  </style></head><body><div class="stage"><div class="win"><div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="nav">‹ › ⟳</div>
  <div class="url"><span class="lock"></span><span><b>https://</b>${url.replace(/^https:\/\//, '')}</span></div></div>
  <img src="data:image/png;base64,${b64}"></div></div></body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 1840, height: 1060 }, deviceScaleFactor: 1.5 });
  const pg = await ctx.newPage();
  await pg.setContent(html);
  await pg.waitForFunction(() => document.images[0] && document.images[0].complete);
  await pg.screenshot({ path: out });
  let size = fs.statSync(out).size;
  if (size > MAX_PNG) {
    await ctx.close();
    const ctx1 = await browser.newContext({ viewport: { width: 1840, height: 1060 }, deviceScaleFactor: 1 });
    const pg1 = await ctx1.newPage();
    await pg1.setContent(html);
    await pg1.waitForFunction(() => document.images[0] && document.images[0].complete);
    await pg1.screenshot({ path: out });
    size = fs.statSync(out).size;
    await ctx1.close();
  } else {
    await ctx.close();
  }
  log('스크린숏', path.relative(REPO, out), `${(size / 1024).toFixed(0)} KiB`);
}

async function framePhone(browser, innerPng, out) {
  const b64 = fs.readFileSync(innerPng).toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#0a0c0b}
  .stage{height:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
  .phone{width:390px;border-radius:42px;padding:12px;background:#191c1b;box-shadow:0 28px 80px rgba(0,0,0,.7),0 0 0 1px #303633}
  .screen{border-radius:32px;overflow:hidden;background:#0e100f}
  img{display:block;width:390px}
  </style></head><body><div class="stage"><div class="phone"><div class="screen"><img src="data:image/png;base64,${b64}"></div></div></div></body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 468, height: 920 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  await pg.setContent(html);
  await pg.waitForFunction(() => document.images[0] && document.images[0].complete);
  await pg.screenshot({ path: out });
  await ctx.close();
  log('스크린숏', path.relative(REPO, out), `${(fs.statSync(out).size / 1024).toFixed(0)} KiB`);
}

// ---------- publish ----------
export const README_IMAGES = ['board', 'session-map', 'dock', 'sidebar', 'remote', 'phone'];
function publish() {
  for (const n of README_IMAGES) {
    const src = path.join(OUT, `${n}.png`);
    if (!fs.existsSync(src)) throw new Error(`없음: ${path.relative(REPO, src)}. 먼저 shoot`);
    const size = fs.statSync(src).size;
    if (size >= 1024 * 1024) throw new Error(`${n}.png가 1MiB를 넘는다(${size})`);
    fs.copyFileSync(src, path.join(IMAGES, `${n}.png`));
    log('옮김', `.github/images/${n}.png`, `${(size / 1024).toFixed(0)} KiB`);
  }
}

// ---------- clean ----------
async function clean() {
  // 백엔드가 꺼져 있어도 이전 판의 터미널 서버(atrium-dev-p273)가 CWD를 잡고 있을 수 있으므로 잠깐 켜서 깨끗이 내린다
  const hasDb = fs.existsSync(path.join(ENV.ATRIUM_DATA_DIR, 'board.db'));
  if (hasDb) {
    try { atrium('backend', 'start'); await sleep(1000); } catch {}
  }
  try { api('settings.set', { key: 'tray', value: false }); } catch {}
  try {
    for (const s of sessionList()) {
      if (s.kind === 'shell') { try { atrium('input', s.sessionId, '\\x03'); } catch {} }
    }
    await sleep(400);
    for (const s of sessionList()) {
      try { atrium('kill', s.sessionId, '--yes'); log('끔', s.name); } catch {}
    }
  } catch {}
  await sleep(1000);
  try { log('터미널 멈춤', atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('터미널 멈춤', e.message.slice(0, 140)); }
  try { log('백엔드 멈춤', atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('백엔드 멈춤', e.message.slice(0, 140)); }
  const pidFile = path.join(API, 'server.pid');
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid); log('데모 서버 PID 끔', pid); } catch {} }
  }
  await sleep(1000);
  if (fs.existsSync(DEMO)) { fs.rmSync(DEMO, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); log('지움', DEMO); }
  for (const d of [ENV.ATRIUM_DATA_DIR, ENV.ATRIUM_APP_USERDATA, ENV.ATRIUM_CLAUDE_PROJECTS, ENV.ATRIUM_CLAUDE_SESSIONS, ENV.ATRIUM_CODEX_HOME, ENV.ATRIUM_AGY_HOME]) {
    if (fs.existsSync(d)) { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); log('지움', path.relative(REPO, d)); }
  }
  const hcDir = path.join(process.env.LOCALAPPDATA || '', 'herdr-core', SESSION);
  if (process.env.LOCALAPPDATA && /^atrium-dev-/.test(SESSION) && fs.existsSync(hcDir)) {
    fs.rmSync(hcDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    log('hc 상태 폴더 지움', SESSION);
  }
}

const cmd = process.argv[2];
let code = 1;
try {
  if (cmd === 'seed') await seed();
  else if (cmd === 'shoot') await shoot();
  else if (cmd === 'run') { await clean(); await seed(); await shoot(); }
  else if (cmd === 'layout') layout();
  else if (cmd === 'publish') publish();
  else if (cmd === 'clean') await clean();
  else throw new Error('사용: p273-readme-shots.mjs run|seed|shoot|layout|publish|clean');
  code = 0;
} catch (e) {
  log('오류', e.stack || e.message);
}
process.exit(code);
