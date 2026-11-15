// P153 창 시험: 세션 맵(영토 지도) 다듬기(라운드마다 그림). P152 창 시험(p152-mission.mjs, 단계 단추·살펴보기 띠·미니맵을 보던 것)을 갈음한다: 아직 유효한 검사(휴대폰 끌기·핀치·탭, 숨은 설정 classic)는 여기로 옮겼다.
// 판: 따로 띄운 개발용 판(atrium-dev-p153, 47922, backend/.dev)만 쓴다. 창의 원격 디버깅 포트 9402, 휴대폰 흉내 프록시 47994. 한 번에 한 창·브라우저만(메모리).
//   셸 세션 하나(p153-a, 시험 폴더 C:\Workspace\mtask-p153-a)만 실제로 띄운다. 지도는 페이지 안에서 mission.graph 답과 판의 워크스페이스·폴더를 흉내로 바꾼다.
//   흉내 모양: 아래 SHAPE(지어낸 이름, 폴더 3·워크스페이스 11·세션 32·연결 36. 역할·주고받은 연결로만 이어진 무리, 닫힌 부모, 다른 워크스페이스의 부모, 큰 무리).
//   P153_SHAPE=<json 경로>를 주면 그 파일의 모양(같은 형식 { folders, workspaces, sessions, links })을 쓴다(git 밖 파일).
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p153-mission.mjs <setup|pc|phone|mock|stop> [round]
// 결과는 워크트리의 experiments/p153/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const MAIN = /[\\/]\.claude[\\/]worktrees[\\/]/.test(REPO) ? path.resolve(REPO, '..', '..', '..') : REPO;
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p153', TAG);
const CONVOS = path.join(REPO, 'experiments', 'p153', 'convos');
const DIR = 'C:\\Workspace\\mtask-p153-a';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const SIM = 47994;
const ENV = {
  ATRIUM_TERMINAL_SESSION: 'atrium-dev-p153', ATRIUM_HERDR_SESSION: 'atrium-dev-p153', ATRIUM_PORT: '47922',
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p153-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: '47922',
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
const SHAPE_FILE = process.env.P153_SHAPE || '';
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const chromeExe = (() => { const d = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'); try { return fs.readdirSync(d).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(d, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const chromiumOpts = () => ({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
const log = logger(`p153-${WHAT}-${TAG.replace(/[\/]/g, "-")}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];

// ---- 흉내 모양(지어낸 이름). 실제 판과 같은 짜임: 폴더 3, 워크스페이스 11(폴더 밖 4), 세션 32, 연결 36 ----
const ws = (key, kind = 'repo') => ({ key, kind, root: key.replace(/\/\.git$/, '') });
const ss = (name, workspace, o = {}) => ({ name, workspace, parent: null, parentClosed: false, kind: 'claude', asleep: true, term: null, model: 'claude-opus-5-5', effort: null, ...o });
const ln = (src, dst, o = {}) => ({ src, dst, role: null, spawned: false, observed: true, count: 5, ...o });
const SHAPE_FAKE = {
  folders: [
    { id: 'g1', name: 'Market', members: ['d:/work/market/web', 'd:/work/market/quant/.git'] },
    { id: 'g2', name: 'Hub', members: ['d:/hub/core/.git'] },
    { id: 'g3', name: 'Campus', members: ['c:/work/library/.git', 'd:/work/campus', 'c:/work/lab/robot/.git', 'd:/work/campus/pbl/.git'] },
  ],
  workspaces: [ws('c:/work/atrium/.git'), ws('d:/work/campus', 'folder'), ws('d:/work/market/web', 'folder'), ws('d:/hub/core/.git'), ws('d:/work/garden/.git'), ws('c:/work/library/.git'), ws('c:/work/notes/.git'),
    ws('c:/work/lab/robot/.git'), ws('d:/work/campus/pbl/.git'), ws('d:/work/campus/exam/.git'), ws('d:/work/market/quant/.git')],
  sessions: [
    ss('conductor', 'c:/work/atrium/.git', { asleep: false, term: 'working', effort: 'xhigh' }), ss('c1', 'd:/work/campus'), ss('m1', 'd:/work/market/web'),
    ss('hub-head', 'd:/hub/core/.git', { parentClosed: true, effort: 'xhigh' }), ss('g1', 'd:/work/garden/.git'), ss('lib-1', 'c:/work/library/.git', { effort: 'xhigh' }),
    ss('notes-2', 'c:/work/notes/.git', { model: 'claude-fable-5-1', effort: 'high' }), ss('atrium-old', 'c:/work/atrium/.git'), ss('robot-1', 'c:/work/lab/robot/.git', { effort: 'xhigh' }),
    ss('robot-worker-codex', 'c:/work/lab/robot/.git', { kind: 'codex', asleep: false, term: 'idle', model: 'gpt-6.1-sol' }), ss('scribe', 'c:/work/library/.git', { kind: 'codex', asleep: false, term: 'done', model: 'gpt-6-astra' }),
    ss('exam-init', 'd:/work/campus/exam/.git', { kind: 'codex', asleep: false, term: 'idle', model: 'gpt-6.1-sol' }), ss('reviewer', 'c:/work/notes/.git'),
    ss('deck-lead', 'd:/work/campus/pbl/.git'), ss('deck-writer', 'd:/work/campus/pbl/.git'), ss('deck-reader', 'd:/work/campus/pbl/.git', { kind: 'codex', asleep: false, term: 'idle', model: 'gpt-6-astra' }),
    ss('deck-reader-2', 'd:/work/campus/pbl/.git', { kind: 'codex', asleep: false, term: 'idle', model: 'gpt-6-astra' }), ss('exam-lead', 'd:/work/campus/exam/.git'),
    ...['ex-notes', 'ex-set-03', 'ex-set-04', 'ex-set-05', 'ex-qa-a', 'ex-qa-b', 'ex-qa-c'].map((n) => ss(n, 'd:/work/campus/exam/.git', { parent: 'exam-lead' })),
    ss('media', 'd:/work/garden/.git', { parent: 'g1' }), ss('trial', 'd:/work/garden/.git', { parent: 'g1' }),
    ss('researcher', 'd:/work/market/quant/.git', { parent: 'm1', asleep: false, term: 'done' }),
    ...['coin-feed', 'level-sets', 'signal-scan', 'band-model'].map((n) => ss(n, 'd:/work/market/quant/.git', { parent: 'researcher', asleep: false, term: 'working' })),
  ],
  links: [
    ln('robot-1', 'robot-worker-codex', { role: 'worker-1-codex' }), ln('robot-worker-codex', 'robot-1'), ln('lib-1', 'scribe', { role: 'writer' }),
    ln('deck-writer', 'deck-reader', { role: 'reader1' }), ln('deck-writer', 'deck-reader-2', { role: 'reader' }), ln('deck-lead', 'deck-writer', { role: 'writer' }), ln('deck-lead', 'deck-reader'), ln('deck-lead', 'deck-reader-2'),
    ...['ex-notes', 'ex-set-03', 'ex-set-04', 'ex-set-05'].flatMap((n) => [ln('exam-lead', n, { role: 'worker', spawned: true }), ln(n, 'exam-lead')]),
    ...['a', 'b', 'c'].flatMap((x) => [ln('exam-lead', `ex-qa-${x}`, { role: `Q&A worker ${x.toUpperCase()}`, spawned: true }), ln(`ex-qa-${x}`, 'exam-lead')]),
    ln('g1', 'media', { role: 'worker', spawned: true }), ln('g1', 'trial', { role: 'worker', spawned: true, observed: false }), ln('m1', 'researcher', { role: 'researcher', spawned: true }), ln('researcher', 'm1'),
    ln('trial', 'g1'), ...['coin-feed', 'level-sets', 'signal-scan', 'band-model'].flatMap((n) => [ln('researcher', n, { role: 'worker', spawned: true }), ln(n, 'researcher')]), ln('media', 'g1'),
  ],
};
const SHAPE = SHAPE_FILE ? JSON.parse(fs.readFileSync(SHAPE_FILE, 'utf8')) : SHAPE_FAKE;
// 상태 섞기(차례로): 응답 필요 둘, 오류 하나, 작업 완료 하나 더(차례는 모양의 세션 차례 기준)
const MIX = { waiting: [15, 2], error: [11], done: [9] };

// ---- 페이지 안 흉내: mission.graph 답과 판의 워크스페이스·폴더(store)를 바꾼다. real: 실제 셸 세션 id(첫 세션 카드에 쓴다) ----
const HOOK = ([shape, mix, real, agent]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p153orig) { api.__p153orig = api.call.bind(api); window.__p153st = { workspaces: st.workspaces, groups: st.groups }; }
  const now = Date.now();
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: w.kind, root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] }));
  st.groups = shape.folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  const asks = ['Allow npm ci in the worktree?', 'Which section should the summary cover?'];
  const nodes = shape.sessions.map((s, i) => {
    let state = s.asleep ? 'sleeping' : s.term === 'working' ? 'working' : 'ready', category = state === 'working' ? 'working' : 'idle', ask = null, error = null;
    if (!s.asleep && s.term === 'done') category = 'done';
    if (mix.waiting.includes(i)) { state = 'waiting'; category = 'needs_you'; ask = asks[mix.waiting.indexOf(i) % 2]; }
    if (mix.error.includes(i)) { state = 'error'; category = 'needs_you'; error = 'API Error: 529 overloaded. The server is busy, retry later.'; }
    if (mix.done.includes(i)) { state = 'ready'; category = 'done'; }
    if (s.st) { [state, category] = { needs: ['waiting', 'needs_you'], error: ['error', 'needs_you'], working: ['working', 'working'], done: ['ready', 'done'], ready: ['ready', 'idle'], sleeping: ['sleeping', 'idle'], exited: ['exited', 'exited'] }[s.st]; ask = s.st === 'needs' ? s.task : null; error = s.err || null; }
    const nm = i === 1 && agent ? agent.name : s.name;
    if (i === 1 && agent) { for (const l of shape.links) { if (l.src === s.name) l.src = nm; if (l.dst === s.name) l.dst = nm; } for (const x of shape.sessions) if (x.parent === s.name) x.parent = nm; }
    return { id: `s:${nm}`, kind: 'session', sessionId: i === 0 && real ? real : i === 1 && agent ? agent.id : `fk-${s.name}`, name: nm, agentKind: s.kind || 'claude', state, category, workspaceKey: s.workspace,
      parentId: s.parent ? `s:${s.parent}` : null, role: null, order: null, createdAt: 1e12 + i, loops: 0, model: s.model, effort: s.effort, activeAt: now - (i + 1) * 9e5, turnAt: state === 'working' ? now - (i + 1) * 2e5 : null,
      gitBranch: s.branch || null, ask, error, lastPrompt: s.task || ['Merge the workers and run the release check', 'Draft the slide notes', 'Collect the source tables', 'Review the parser diff'][i % 4], ...(s.ago ? { activeAt: now - s.ago, turnAt: state === 'working' ? now - s.ago : null } : {}) };
  });
  const edges = [];
  for (const l of shape.links) {
    const b = { from: `s:${l.src}`, to: `s:${l.dst}`, count: l.count || 0, lastAt: now - 6e5 };
    if (l.role) edges.push({ ...b, kind: 'role', label: l.role });
    if (l.observed) edges.push({ ...b, kind: 'prompt', label: 'report back when done' });
    if (l.spawned) edges.push({ ...b, kind: 'spawn' });
  }
  api.call = async (m, p) => {
    if (m !== 'mission.graph') return api.__p153orig(m, p);
    return { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now };
  };
};
const UNHOOK = () => { const api = window.__mt.api; if (api.__p153orig) { api.call = api.__p153orig; const st = window.__mt.getState(); st.workspaces = window.__p153st.workspaces; st.groups = window.__p153st.groups; } };

// ---- 지도 읽기 ----
const PROBE = () => {
  const m = document.querySelector('[data-role=mission]');
  if (!m) return null;
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const vp = m.querySelector('[data-role=ta-viewport]');
  return {
    vp: R(vp), level: m.dataset.level, view: window.__mtTa && window.__mtTa.view(),
    cards: [...m.querySelectorAll('.mt-ta-card')].map((c) => ({ id: c.dataset.id, name: c.dataset.name, tier: c.dataset.tier, ...R(c) })),
    terrs: [...m.querySelectorAll('[data-role=ta-terr]')].map((x) => ({ id: x.dataset.id, ...R(x) })), isles: [...m.querySelectorAll('[data-role=ta-isle]')].map((x) => ({ key: x.dataset.key, ...R(x) })),
    rings: [...m.querySelectorAll('[data-role=ta-ring]')].map((x) => ({ lead: x.dataset.lead, text: x.innerText, ...R(x) })),
  };
};
// 명령줄에 초점이 있으면 첫 Esc는 초점만 푼다(명령줄 동작). 닫힐 때까지 몇 번
async function closeMission(pg) { for (let i = 0; i < 3 && (await pg.$('[data-role="mission"]')); i++) { await pg.keyboard.press('Escape'); await sleep(400); } }
async function openMission(pg) {
  if (await pg.$('[data-action="return-close"]')) { await pg.click('[data-action="return-close"]').catch(() => {}); await sleep(300); }
  await closeMission(pg);
  await pg.click('[data-action="mission-rail"]');
  await pg.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 });
  await sleep(1200);
}
const shotTo = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) }).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
const realAgentOf = (pg) => pg.evaluate(() => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === 'p153-haiku'); return s ? { id: s.sessionId, name: s.name } : null; });
const realId = (pg) => pg.evaluate(() => ([...window.__mt.getState().sessions.values()].find((s) => s.name === 'p153-a') || {}).sessionId || null);

async function setupBoard() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(call('session.list').map((s) => s.name));
  if (!have.has('p153-a')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p153-a').slice(0, 160));
  await sleep(2000);
}

async function pc() {
  call('settings.set', { key: 'missionStyle', value: 'territories' }); // 앞 시험이 classic에서 멈췄어도
  const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=9402', ...AWAKE] });
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
    await sleep(2500);
    const real = await realId(page), agent = SHAPE_FILE ? null : await realAgentOf(page);
    await page.evaluate(HOOK, [JSON.parse(JSON.stringify(SHAPE)), MIX, real, agent]);
    for (const [w, h] of [[2576, 1408], [1584, 921], [1366, 768]]) {
      await page.setViewportSize({ width: w, height: h }).catch(() => {});
      await sleep(600);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await openMission(page);
      const p = await page.evaluate(PROBE);
      check(`[${w}] 카드 ${SHAPE.sessions.length}, 영토 ${SHAPE.folders.length}, 섬 ${SHAPE.workspaces.length}`, p.cards.length === SHAPE.sessions.length && p.terrs.length === SHAPE.folders.length && p.isles.length === SHAPE.workspaces.length, { cards: p.cards.length, terrs: p.terrs.length, isles: p.isles.length, view: p.view });
      await shotTo(page, `pc-${w}-fit`);
      // 처음 연 화면에서 읽히는가: 화면 위 이름·상태 글 크기, 카드가 위 줄·명령줄에 가리지 않는가
      const rd = await page.evaluate(() => { const v = window.__mtTa.view(); const top = document.querySelector('[data-role=ta-top]').getBoundingClientRect().bottom, bar = document.querySelector('[data-role=bottom] .mt-cmd').getBoundingClientRect().top; const cs = [...document.querySelectorAll('.mt-ta-card')]; const c = cs[0]; const fs2 = (sel) => parseFloat(getComputedStyle(c.querySelector(sel)).fontSize) * v.k; const vis = cs.map((x) => x.getBoundingClientRect()).filter((r) => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth); return { k: v.k, name: fs2('.mt-ta-tile .tn'), status: fs2('.mt-ta-tile .ts'), covered: vis.filter((r) => r.top < top || r.bottom > bar).length, shown: vis.length, all: cs.length }; });
      check(`[${w}] 처음 화면: 이름 ≥ 12px, 상태 ≥ 10px, 위 줄·명령줄에 가린 카드 없음`, rd.name >= 12 && rd.status >= 10 && rd.covered === 0, rd);
      // 처음 화면 타일 이름이 잘렸는가(말줄임), 타일 내용이 카드 밖으로 넘치는가
      const nm = await page.evaluate(() => [...document.querySelectorAll('.mt-ta-card')].map((c) => { const tn = c.querySelector('.mt-ta-tile .tn'), tile = c.querySelector('.mt-ta-tile'); return { name: c.dataset.name, cut: tn.scrollHeight > tn.clientHeight * 1.25, over: tile.scrollHeight > tile.clientHeight + 2 }; }));
      const cut = nm.filter((x) => x.cut).map((x) => x.name), over = nm.filter((x) => x.over).map((x) => x.name);
      log(`[${w}] 잘린 이름 ${cut.length}: ${cut.join(', ')}`);
      check(`[${w}] 처음 화면: 타일 내용이 카드 안, 잘린 이름은 아주 긴 것만(20자 이상)`, !over.length && cut.every((n) => n.length >= 20), { cut, over });
      // 보통 단계(85%)에서 카드 내용(일 세 줄·오류 두 줄까지)이 잘리지 않는가
      await page.evaluate(() => { const v = window.__mtTa.view(); window.__mtTa.set({ k: 0.85, x: v.x, y: v.y }); }); await sleep(500);
      const clip = await page.evaluate(() => [...document.querySelectorAll('.mt-ta-card')].map((c) => { const f = c.querySelector('.mt-ta-full'); const sub = [...f.querySelectorAll('.c3, .cerr')].filter((x) => x.scrollHeight > x.clientHeight + 1).map((x) => x.className); return { name: c.dataset.name, box: f.scrollHeight > f.clientHeight + 1, sub }; }).filter((x) => x.box || x.sub.length));
      check(`[${w}] 보통: 카드 내용(일·오류 글)이 잘리지 않는다`, !clip.length, clip);
      await page.evaluate(() => window.__mtTa.fit()); await sleep(300);
      if (w === 1584) { await page.emulateMedia({ reducedMotion: 'reduce' }); await sleep(400); await shotTo(page, `pc-${w}-fit-reduce`); await page.emulateMedia({ reducedMotion: 'no-preference' }); }
      // 보통 단계(85%): 첫 영토의 왼쪽 위부터, 그리고 무리마다 무리 가운데로
      const at = (box, k) => page.evaluate(([b, kk]) => { const vp = document.querySelector('[data-role=ta-viewport]').getBoundingClientRect(); window.__mtTa.set({ k: kk, x: vp.width / 2 - (b.x + b.w / 2) * kk, y: (vp.height + 96 - 110) / 2 - (b.y + b.h / 2) * kk }); }, [box, k]);
      const boxes = await page.evaluate(() => { const L = window.__mtTa.lay(); return { first: L.terrs[0] || L.isles[0], rings: L.rings.map((r) => ({ lead: r.lead, x: r.x, y: r.y, w: r.w, h: r.h })) }; });
      const vpw = w, vph = h;
      await at({ x: boxes.first.x - 20, y: boxes.first.y - 20, w: vpw / 0.85, h: (vph - 220) / 0.85 }, 0.85); await sleep(800);
      await shotTo(page, `pc-${w}-mid`);
      for (const [i, r] of boxes.rings.slice(0, 6).entries()) { await at(r, Math.min(0.85, (vpw - 80) / r.w, (vph - 260) / r.h)); await sleep(700); await shotTo(page, `pc-${w}-team-${i}`); }
    }
    if (!SHAPE_FILE) await act(page, real, agent);
    await page.evaluate(UNHOOK);
  } finally { await closeApp(app); }
}

// ---- 누르기 = 태그, 친 글자 = 명령줄, 더블클릭 = 판으로, 섬 머리 끌기 = 폴더 옮기기 ----
async function act(page, real, agent) {
  const cmd = () => page.evaluate(() => (document.querySelector('[data-role=command]') || {}).value || '');
  const fly = (n) => page.evaluate((x) => window.__mtTa.flyTo(`s:${x}`, 0.9), n).then(() => sleep(800));
  await openMission(page);
  await page.evaluate(() => { const el = document.querySelector('[data-role=command]'); if (el) { el.value = ''; } });
  check('세션 맵 동안 명령줄이 보인다', await page.evaluate(() => { const b = document.querySelector('[data-role=bottom]'); return !!b && !b.dataset.hidden && b.dataset.mission === '1' && getComputedStyle(b.querySelector('.mt-cmd')).opacity === '1'; }));
  await fly('deck-lead'); await page.click('.mt-ta-card[data-name="deck-lead"]'); await sleep(300);
  await fly('deck-writer'); await page.click('.mt-ta-card[data-name="deck-writer"]'); await sleep(300);
  let c = await cmd();
  check('카드 둘 누르기 → 명령줄에 @태그 둘, 세션 맵은 열린 채', /^@deck-lead @deck-writer\s*$/.test(c) && !!(await page.$('[data-role=mission]')), c);
  const tagged = await page.evaluate(() => [...document.querySelectorAll('.mt-ta-slot.tagged .mt-ta-card')].map((x) => x.dataset.name));
  check('태그된 카드는 표시', tagged.length === 2, tagged);
  await shotTo(page, 'pc-1584-tagged');
  await page.click('.mt-ta-card[data-name="deck-writer"]'); await sleep(300);
  c = await cmd();
  check('다시 누르면 태그가 빠진다', /^@deck-lead\s*$/.test(c), c);
  // 지도 빈 곳을 누르고(초점이 지도에) 글자를 치면 명령줄로
  const vp = await page.evaluate(() => { const r = document.querySelector('[data-role=ta-viewport]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.click(vp.x + 30, vp.y + vp.h / 2); await sleep(200);
  await page.keyboard.type('hello there'); await sleep(300);
  c = await cmd();
  const focus = await page.evaluate(() => document.activeElement && document.activeElement.dataset.role);
  check('지도에서 친 글자 → 명령줄', /^@deck-lead hello there$/.test(c) && focus === 'command', { c, focus });
  await shotTo(page, 'pc-1584-typed');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Escape'); await sleep(300);
  await page.evaluate(() => { const el = document.querySelector('[data-role=command]'); if (el) { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); } });
  // 더블클릭 → 세션 맵을 닫고 판의 그 세션(실제 셸 = 첫 세션 카드)
  await openMission(page);
  const first = SHAPE.sessions[0].name;
  await fly(first);
  await page.dblclick(`.mt-ta-card[data-name="${first}"]`); await sleep(1200);
  check('더블클릭 → 세션 맵 닫고 판으로', !(await page.$('[data-role=mission]')), { real });
  // 섬 머리 끌기: 첫 워크스페이스(폴더 밖) 섬을 Hub 영토 위에 놓으면 group.move가 불린다(흉내 키라 판은 not_found로 답할 수 있다: 부른 것만 본다)
  await openMission(page);
  await page.evaluate(() => { const api = window.__mt.api; window.__p153moves = []; const orig = api.call; api.call = (m, p) => { if (m === 'group.move') { window.__p153moves.push(p); return Promise.resolve({ groups: [] }); } return orig(m, p); }; window.__p153unmove = () => { api.call = orig; }; });
  await page.evaluate(() => window.__mtTa.fit());
  await sleep(500);
  const geo = await page.evaluate(() => { const L = window.__mtTa.lay(); const i = L.isles.find((x) => x.loose); const hub = L.terrs.find((t) => t.name === 'Hub'); const h = document.querySelector(`.mt-ta-ihead[data-key="${CSS.escape(i.key)}"]`).getBoundingClientRect(); const t = document.querySelector(`.mt-ta-terr[data-id="${hub.id}"]`).getBoundingClientRect(); return { key: i.key, hub: hub.id, from: { x: h.left + 30, y: h.top + h.height / 2 }, to: { x: t.left + t.width / 2, y: t.top + t.height * 0.7 } }; });
  await page.mouse.move(geo.from.x, geo.from.y); await page.mouse.down();
  for (let i = 1; i <= 15; i++) { await page.mouse.move(geo.from.x + (geo.to.x - geo.from.x) * i / 15, geo.from.y + (geo.to.y - geo.from.y) * i / 15); await sleep(16); }
  const hot = await page.evaluate(() => [...document.querySelectorAll('.mt-ta-terr.drop')].map((x) => x.dataset.id));
  await shotTo(page, 'pc-1584-isle-drag');
  await page.mouse.up(); await sleep(400);
  const moves = await page.evaluate(() => window.__p153moves);
  check('섬 머리를 끌어 영토에 놓으면 그 폴더로(group.move), 끄는 동안 영토 강조', hot.includes(geo.hub) && moves.length === 1 && moves[0].workspace === geo.key && moves[0].group === geo.hub, { hot, moves, geo });
  // Esc로 취소
  await page.mouse.move(geo.from.x, geo.from.y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(geo.from.x + 20 * i, geo.from.y + 10 * i); await sleep(16); }
  await page.keyboard.press('Escape'); await page.mouse.up(); await sleep(300);
  check('끄는 중 Esc = 취소(옮기지 않고 세션 맵은 열린 채)', (await page.evaluate(() => window.__p153moves.length)) === 1 && !!(await page.$('[data-role=mission]')));
  await page.evaluate(() => window.__p153unmove());
  await page.keyboard.press('Escape'); await sleep(300);
  // 실제 세션(p153-haiku)으로 끝까지: 태그 → 친 글자 → Enter → 전달, 세션 맵은 열린 채, 받는 세션 칩은 정상
  if (agent) {
    await openMission(page);
    await page.evaluate(() => { const el = document.querySelector('[data-role=command]'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); });
    await fly(agent.name); await page.click(`.mt-ta-card[data-name="${agent.name}"]`); await sleep(300);
    const chip = await page.evaluate(() => [...document.querySelectorAll('[data-role=cmd-to] .mt-cmd-to-chip')].map((x) => ({ to: x.dataset.to, state: x.dataset.state })));
    await page.mouse.click(vp.x + 30, vp.y + vp.h / 2); await sleep(200);
    await page.keyboard.type('Reply with the single word ok.'); await sleep(200);
    await shotTo(page, 'pc-1584-real-tagged');
    await page.keyboard.press('Enter'); await sleep(2500);
    const d = await page.evaluate((n) => [...window.__mt.getState().deliveries.values()].filter((x) => x.name === n).map((x) => x.status), agent.name);
    const open = !!(await page.$('[data-role=mission]'));
    const left = await cmd();
    await shotTo(page, 'pc-1584-real-sent');
    check('실제 세션: 태그 칩 정상 → 친 글 → Enter → 전달, 세션 맵은 열린 채, 입력칸 비움', chip.length === 1 && chip[0].state === 'ok' && d.length >= 1 && !d.includes('failed') && open && left === '', { chip, d, open, left });
    await page.keyboard.press('Escape'); await sleep(300);
  }
  // (P152 창 시험에서 옮긴 검사) 숨은 설정 missionStyle=classic → 옛 열 지도(M으로 열고 닫힘, 빈 곳 눌러도 열린 채), 되돌리면 세션 맵
  await closeMission(page);
  call('settings.set', { key: 'missionStyle', value: 'classic' }); await sleep(1200);
  await page.click('[data-action="mission-rail"]'); await sleep(1500);
  const classic = await page.evaluate(() => ({ terr: !!document.querySelector('.mt-ta'), classic: !!document.querySelector('.mt-mission-body') }));
  await page.mouse.click(300, 600); await sleep(300);
  const still = !!(await page.$('[data-role=mission]'));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('m'); await sleep(400);
  const mClosed = !(await page.$('[data-role=mission]'));
  await closeMission(page);
  call('settings.set', { key: 'missionStyle', value: 'territories' }); await sleep(800);
  await openMission(page);
  const back = await page.evaluate(() => !!document.querySelector('.mt-ta'));
  await page.keyboard.press('Escape'); await sleep(300);
  check('숨은 설정 classic → 옛 지도(빈 곳 눌러도 열린 채, M 닫힘), 되돌리면 세션 맵', !classic.terr && classic.classic && still && mClosed && back, { classic, still, mClosed, back });
}

// ---- 성능: 끌기·휠 프레임(P152 perf와 같은 재기). 지어낸 모양 32세션과 그 넷 겹(128세션), 작업 중 빛 켬·끔, 멀리(맞춤)·보통 ----
const FRAMES = () => new Promise((res) => { const out = []; let last = performance.now(); const t0 = last; const f = (t) => { out.push(t - last); last = t; if (t - t0 < 2400) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); });
const stat = (a) => { const s = [...a].sort((x, y) => x - y); const q = (p) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10; return { n: a.length, p50: q(0.5), p95: q(0.95), max: Math.round(s[s.length - 1] * 10) / 10, over20: a.filter((x) => x > 20).length }; };
const bigShape = (sh, n) => { const out = { folders: [], workspaces: [], sessions: [], links: [] }; for (let i = 0; i < n; i++) { const k = (x) => (x ? `${x}#${i}` : x); out.folders.push(...sh.folders.map((f) => ({ id: `${f.id}-${i}`, name: `${f.name} ${i}`, members: f.members.map(k) }))); out.workspaces.push(...sh.workspaces.map((w) => ({ ...w, key: k(w.key) }))); out.sessions.push(...sh.sessions.map((x) => ({ ...x, name: `${x.name}-${i}`, workspace: k(x.workspace), parent: x.parent ? `${x.parent}-${i}` : null }))); out.links.push(...sh.links.map((l) => ({ ...l, src: `${l.src}-${i}`, dst: `${l.dst}-${i}` }))); } return out; };
async function perf() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=9402', ...AWAKE] });
  const res = {};
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
    await sleep(2500);
    for (const [tag, sh] of [['s32', SHAPE], ['s128', bigShape(SHAPE, 4)]]) {
      await page.evaluate(UNHOOK); await page.evaluate(HOOK, [JSON.parse(JSON.stringify(sh)), MIX, null, null]);
      for (const light of ['on', 'off']) {
        call('settings.set', { key: 'workLight', value: light }); await sleep(800);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await openMission(page);
        const vb = await page.evaluate(() => { const r = document.querySelector('[data-role=ta-viewport]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
        for (const lvl of ['fit', 'mid']) {
          if (lvl === 'mid') await page.evaluate(() => { const v = window.__mtTa.view(), vp = document.querySelector('[data-role=ta-viewport]').getBoundingClientRect(), k = 0.85; const cx = (vp.width / 2 - v.x) / v.k, cy = (vp.height / 2 - v.y) / v.k; window.__mtTa.set({ k, x: vp.width / 2 - cx * k, y: vp.height / 2 - cy * k }); });
          await sleep(500);
          const fr = page.evaluate(FRAMES);
          await page.mouse.move(vb.x + 300, vb.y + 300); await page.mouse.down();
          for (let i = 0; i < 140; i++) { await page.mouse.move(vb.x + 300 + Math.sin(i / 10) * 250, vb.y + 300 + Math.cos(i / 12) * 150); await sleep(14); }
          await page.mouse.up();
          const drag = stat(await fr);
          const fw = page.evaluate(FRAMES);
          await page.mouse.move(vb.x + vb.w / 2, vb.y + vb.h / 2);
          for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, i % 20 < 10 ? -40 : 40); await sleep(35); }
          const wheel = stat(await fw);
          const key = `${tag}-${light}-${lvl}`;
          res[key] = { drag, wheel, lights: await page.evaluate(() => document.querySelectorAll('[data-role=ta-light]').length) };
          log(`[perf] ${key} ${JSON.stringify(res[key])}`);
        }
        await page.keyboard.press('Escape'); await sleep(400);
      }
    }
    call('settings.set', { key: 'workLight', value: 'on' });
    for (const [k, v] of Object.entries(res)) if (v && v.drag) check(`[perf] ${k}: 끌기 p95 ≤ 25ms, 휠 p95 ≤ 25ms`, v.drag.p95 <= 25 && v.wheel.p95 <= 25, v);
    await page.evaluate(UNHOOK);
  } finally { await closeApp(app); }
  fs.writeFileSync(path.join(OUT, 'p153-perf.json'), JSON.stringify(res, null, 2));
}

// ---- 휴대폰(웹, 흉내 프록시로 짝 맺기) ----
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE = { viewport: { width: 393, height: 852 }, screen: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US', userAgent: SAFARI };
async function phone() {
  const { chromium } = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: 47922, name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const browser = await chromium.launch(chromiumOpts());
  try {
    const ctx = await browser.newContext({ ...IPHONE, reducedMotion: 'no-preference' });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => log(`[phone pageerror] ${e.message}`));
    await pg.goto(`http://localhost:${SIM}/`);
    await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
    await pg.fill('[data-field=pair-code]', call('device.code').code);
    await pg.click('[data-action=pair-submit]');
    await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
    await sleep(1500);
    const real = await realId(pg);
    await pg.evaluate(HOOK, [SHAPE, MIX, real]);
    await pg.evaluate(() => window.__mtPhone.mission());
    await pg.waitForSelector('[data-role=pt-tile]', { timeout: 20000 });
    await sleep(1500);
    await pg.screenshot({ path: path.join(OUT, 'phone-iphone.png') });
    // (P152 휴대폰 창 시험에서 옮긴 검사) 이름 타일·빛·시트, 가로 넘침, 지도 칸 위 띠와 겹치지 않음, 한 번 누르면 열림, 끌기·두 손가락 확대
    const info = await pg.evaluate(() => {
      const st = document.querySelector('[data-role=pm-stage]').getBoundingClientRect(), row = document.querySelector('.mt-pt-zoomrow').getBoundingClientRect();
      const tiles = [...document.querySelectorAll('[data-role=pt-tile]')];
      const fs = tiles.length ? parseFloat(getComputedStyle(tiles[0].querySelector('.tn')).fontSize) * window.__mtPm.view().zoom : 0;
      const under = tiles.map((x) => x.getBoundingClientRect()).filter((r) => r.top < row.bottom && r.bottom > row.top && r.right > row.left && r.left < row.right && r.top > st.top).length;
      return { tiles: tiles.length, named: tiles.filter((x) => x.innerText.trim()).length, lights: document.querySelectorAll('[data-role=pt-light]').length, sheet: document.querySelectorAll('[data-role=pt-card]').length, scrollX: document.documentElement.scrollWidth > innerWidth + 1, nameFont: fs, underZoom: under, view: window.__mtPm.view() };
    });
    check('휴대폰: 타일마다 이름, 작업 중 빛, 시트, 가로 넘침 없음, 처음 이름 글 ≥ 10.5px, 줌 단추 밑 타일 없음', info.tiles === SHAPE.sessions.length && info.named === info.tiles && info.lights >= 1 && info.sheet >= 3 && !info.scrollX && info.nameFont >= 10.5 && info.underZoom === 0, info);
    const cdp = await ctx.newCDPSession(pg);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    const s0 = await pg.evaluate(() => window.__mtPm.view());
    await T('touchStart', [[200, 300]]); for (let i = 1; i <= 10; i++) { await T('touchMove', [[200 + i * 3, 300 + i * 5]]); await sleep(16); } await T('touchEnd', []);
    await sleep(300);
    const s1 = await pg.evaluate(() => window.__mtPm.view());
    check('휴대폰: 한 손가락 끌기', Math.abs(s1.x - s0.x - 30) < 4 && Math.abs(s1.y - s0.y - 50) < 4, { s0, s1 });
    await T('touchStart', [[150, 300], [250, 300]]); for (let i = 1; i <= 10; i++) { await T('touchMove', [[150 - i * 5, 300], [250 + i * 5, 300]]); await sleep(16); } await T('touchEnd', []);
    await sleep(300);
    const s2 = await pg.evaluate(() => window.__mtPm.view());
    check('휴대폰: 두 손가락 확대', s2.zoom > s1.zoom * 1.5, { s1, s2 });
    await pg.evaluate(() => window.__mtPm.fit()); await sleep(300);
    // 첫 세션 타일은 실제 셸(p153-a): 한 번 누르면 바로 그 세션 화면
    const first = SHAPE.sessions[0].name;
    const tb = await (await pg.$(`[data-role=pt-tile][data-id="s:${first}"]`)).boundingBox();
    await pg.touchscreen.tap(tb.x + tb.width / 2, tb.y + tb.height / 2); await sleep(1500);
    const opened = await pg.evaluate(() => (document.querySelector('[data-role=phone]') || {}).dataset?.view);
    check('휴대폰: 타일 한 번 누르면 그 세션 화면(맞춤 배율에서도)', opened === 'session', { opened, w: tb.width });
    await pg.screenshot({ path: path.join(OUT, 'phone-iphone-session.png') });
    await ctx.close();
  } finally { await browser.close(); await sim.close?.(); }
}

// ---- 시안 그림(실험 폴더의 Main.dc.html·A-phone.dc.html을 펴서 찍는다) ----
async function mock(withApp = false) {
  const { chromium } = await import('playwright');
  const dir = path.join(MAIN, 'experiments', 'mm-concepts', 'project');
  const render = (file, W, H, fit = false) => {
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    const tpl = html.split('</helmet>')[1].split('</x-dc>')[0];
    const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
    const C = new Function(`class DCLogic { constructor(p){ this.props = p || {}; } setState(o){ this.state = Object.assign({}, this.state, o); } }\n${src}\nreturn Component;`)();
    const c = new C({ light: 'on' });
    if (fit) { c.renderVals(); c.fit(); }
    const vals = c.renderVals();
    const get = (scope, k) => k.split('.').reduce((o, x) => (o == null ? o : o[x]), scope);
    const fill = (s, scope) => s.replace(/\{\{\s*([\w$.]+)\s*\}\}/g, (_, k) => { const v = get(scope, k); return typeof v === 'function' || v == null ? '' : String(v); });
    const expand = (s, scope) => {
      let out = '', i = 0;
      const re = /<sc-(for|if)\b([^>]*)>/g;
      for (;;) {
        re.lastIndex = i;
        const m = re.exec(s);
        if (!m) { out += fill(s.slice(i), scope); break; }
        out += fill(s.slice(i, m.index), scope);
        const tag = m[1];
        let depth = 1, j = m.index + m[0].length, end = -1;
        const open = new RegExp(`<sc-${tag}\\b`, 'g'), close = new RegExp(`</sc-${tag}>`, 'g');
        while (depth) { open.lastIndex = j; close.lastIndex = j; const o = open.exec(s), c2 = close.exec(s); if (!c2) break; if (o && o.index < c2.index) { depth++; j = o.index + 4; } else { depth--; j = c2.index + c2[0].length; if (!depth) end = c2.index; } }
        const body = s.slice(m.index + m[0].length, end);
        const attr = m[2];
        if (tag === 'for') { const list = get(scope, (attr.match(/list="\{\{\s*([\w$.]+)\s*\}\}"/) || [])[1]) || []; const as = (attr.match(/as="(\w+)"/) || [])[1]; for (const it of list) out += expand(body, { ...scope, [as]: it }); }
        else { const v = get(scope, (attr.match(/value="\{\{\s*([\w$.]+)\s*\}\}"/) || [])[1]); if (v) out += expand(body, scope); }
        i = j;
      }
      return out;
    };
    const body = expand(tpl, vals).replace(/\son[A-Z]\w*="[^"]*"/g, '');
    return `<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body style="margin:0;width:${W}px;height:${H}px">${body}</body></html>`;
  };
  const browser = await chromium.launch(chromiumOpts());
  try {
    const shoot = async (file, W, H, out, fit = false) => { const pg = await browser.newPage({ viewport: { width: W, height: H } }); await pg.setContent(render(file, W, H, fit)); await sleep(800); await pg.screenshot({ path: path.join(OUT, out) }); await pg.close(); };
    await shoot('Main.dc.html', 1584, 921, 'mock-desktop.png');
    await shoot('A-phone.dc.html', 393, 852, 'mock-phone.png');
    if (withApp) {
      await shoot('Main.dc.html', 1600, 1000, 'mock-1600-start.png');
      await shoot('Main.dc.html', 1600, 1000, 'mock-1600-fit.png', true);
      const side = async (a, b, out, lab) => {
        const pg = await browser.newPage({ viewport: { width: 1600 * 2 + 30, height: 1040 } });
        const uri = (x) => `data:image/png;base64,${fs.readFileSync(path.join(OUT, x)).toString('base64')}`;
        await pg.setContent(`<body style="margin:0;background:#222;color:#ddd;font:16px sans-serif;display:flex;gap:30px"><div><div>${lab[0]}</div><img src="${uri(a)}" width=1600></div><div><div>${lab[1]}</div><img src="${uri(b)}" width=1600></div></body>`);
        await sleep(600); await pg.screenshot({ path: path.join(OUT, out), fullPage: true }); await pg.close();
      };
      await side('mock-1600-start.png', 'app-1600-start.png', 'compare-start-74.png', ['mockup A (Main.dc.html), 74%', 'app, same data, same window, 74%']);
      await side('mock-1600-fit.png', 'app-1600-fit.png', 'compare-fit.png', ['mockup A, Fit', 'app, same data, Fit']);
    }
  } finally { await browser.close(); }
}

// 시안 데이터(Main.dc.html mmData)를 앱 흉내 모양으로 바꿔 같은 창(지도 칸 1600×1000)·같은 배율로 찍는다
async function compareApp() {
  const dir = path.join(MAIN, 'experiments', 'mm-concepts', 'project');
  const html = fs.readFileSync(path.join(dir, 'Main.dc.html'), 'utf8');
  const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
  const C = new Function(`class DCLogic { constructor(p){ this.props = p || {}; } setState(o){ this.state = Object.assign({}, this.state, o); } }\n${src}\nreturn Component;`)();
  const D = new C({ light: 'on' }).mmData();
  const key = (id) => `c:/mock/${id}/.git`;
  const H = { cc: 'claude', cx: 'codex', sh: 'shell', pi: 'pi', oc: 'opencode' };
  const MODEL = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5', 'gpt-6': 'gpt-6' };
  const ago = (a) => { const m = String(a).match(/(\d+)([mhd])/); return m ? Number(m[1]) * { m: 6e4, h: 36e5, d: 864e5 }[m[2]] : null; };
  const shape = {
    folders: D.FOLDERS.map((n, i) => ({ id: `g${i + 1}`, name: n, members: D.WS.filter((w) => w.folder === n).map((w) => key(w.id)) })),
    workspaces: D.WS.map((w) => ({ key: key(w.id), kind: 'repo', root: `c:/mock/${w.id}` })),
    sessions: D.S.map((x) => { const [m, e] = String(x.model).split(' · '); const mk = Object.keys(MODEL).find((k) => m.startsWith(k)); return { name: x.id, workspace: key(x.ws), parent: x.parent || null, kind: H[x.h], st: x.st, task: x.task, err: x.err || null, ago: ago(x.ago), branch: x.branch || null, model: x.h === 'sh' ? null : mk ? MODEL[mk] : null, effort: e || null }; }),
    links: D.S.filter((x) => x.parent).map((x) => ({ src: x.parent, dst: x.id, role: x.rel === 'spawn' || x.rel === 'cross' ? (x.role === 'worker' ? null : x.role) : x.rel === 'role' ? x.role : null, spawned: x.rel === 'spawn' || x.rel === 'cross', observed: x.rel === 'prompt' })),
  };
  for (const x of shape.sessions) if (shape.links.some((l) => l.dst === x.name && !l.spawned)) x.parent = null; // 역할·시킴 하위는 부모(띄움)가 아니다
  const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=9402', ...AWAKE] });
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1600, height: 1060 }).catch(() => {});
    await sleep(2500);
    await page.evaluate(HOOK, [shape, { waiting: [], error: [], done: [] }, null, null]);
    await openMission(page);
    await shotTo(page, 'app-1600-fit', { x: 0, y: 60, width: 1600, height: 1000 });
    await page.evaluate(() => { const L = window.__mtTa.lay(), b = L.bounds, k = 0.74; window.__mtTa.set({ k, x: 40 - b.x * k, y: 110 - (b.y + 60) * k }); });
    await sleep(600);
    await shotTo(page, 'app-1600-start', { x: 0, y: 60, width: 1600, height: 1000 });
    await page.evaluate(UNHOOK);
  } finally { await closeApp(app); }
}

async function stopBoard() {
  for (const s of call('session.list').filter((x) => /^p153-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'pc') await pc();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'mock') await mock();
  else if (WHAT === 'perf') await perf();
  else if (WHAT === 'compare') { await compareApp(); await mock(true); }
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p153-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
