// P335 창 시험: 세션 맵 카드의 할 일 배지와 작업 완료 꼬리표를 오른쪽 위에 세로로 쌓는다(작업 완료가 위 테두리, 할 일이 그 바로 위),
// 화면 글이 맞춤·100%·멀리 배율에서 12px 이상인지, 위 카드·칸 머리와 겹치지 않는지 잰다.
// 판·모양: 실제로 쓰는 크기의 판(폴더 3·워크스페이스 11·세션 32, p153-mission.mjs의 지어낸 흉내 모양을 그대로 옮김)을 페이지 안 흉내(mission.graph)로 그리고,
//   할 일 카드도 페이지 안에서 흉내(decision.changed)로 넣는다. 실제로 띄우는 세션은 셸 하나(p335-a)뿐.
// 판: 따로 띄운 개발용 판(atrium-dev-p335, 48085, backend/.dev)만. 창의 원격 디버깅 포트 9566. 한 번에 한 창만.
// 실행: node app/test/e2e/p335-map-tags.mjs <setup|shots|stop> [round]   (round: before|after, 판정은 after만)
// 결과는 워크트리의 experiments/p335/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'shots';
const ROUND = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p335', ROUND);
const BOARD = 'atrium-dev-p335', PORT = '48085', DEBUG = '9566';
const DIR = 'C:\\Workspace\\mtask-p335-a';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p335', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p335-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger(`p335-${WHAT}-${ROUND}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }

// ---- 흉내 모양(p153-mission.mjs SHAPE_FAKE 그대로, 지어낸 이름) ----
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
const SHAPE = SHAPE_FAKE;
const MIX = { waiting: [15, 2], error: [11], done: [9] };
// 할 일 흉내(세션 이름 → 카드 수). 둘 다: researcher·scribe(작업 완료), 할 일만: deck-writer·ex-set-04, 작업 완료만: robot-worker-codex
const TODO = { researcher: 2, scribe: 1, 'deck-writer': 3, 'ex-set-04': 1 };

// ---- 페이지 안 흉내: mission.graph 답과 판의 워크스페이스·폴더(store)를 바꾼다(p153과 같음) ----
const HOOK = ([shape, mix, real, agent]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p153orig) { api.__p153orig = api.call.bind(api); window.__p153st = { workspaces: st.workspaces, groups: st.groups }; }
  const now = Date.now();
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  // 판의 실제 워크스페이스(실제 셸·haiku 세션이 든 곳)도 남긴다: 사이드바가 실제 세션 줄을 그린다(지도에는 그래프에 있는 키만 줄이 된다)
  st.workspaces = [...shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: w.kind, root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p153st.workspaces || [])];
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
      // r11(P156 계약): indep = 정한 독립(일 부모 없음, 계보만), peers = 정한 동료
      parentId: s.parent && !s.indep ? `s:${s.parent}` : null, lineageParent: s.parent ? `s:${s.parent}` : null, peers: (shape.peers || []).filter((p) => p.includes(s.name)).map((p) => `s:${p[0] === s.name ? p[1] : p[0]}`), role: null, order: null, createdAt: 1e12 + i, loops: 0, model: s.model, effort: s.effort, activeAt: now - (i + 1) * 9e5, turnAt: state === 'working' ? now - (i + 1) * 2e5 : null,
      closedKids: s.closedKids || 0, assignAt: s.assignAt || null, parentClosed: !!s.parentClosed, // P157: 솔로 판정 기록(mission.graph와 같은 필드)
      gitBranch: s.branch || null, ask, error, lastPrompt: s.task || ['Merge the workers and run the release check', 'Draft the slide notes', 'Collect the source tables', 'Review the parser diff'][i % 4], ...(s.ago ? { activeAt: now - s.ago, turnAt: state === 'working' ? now - s.ago : null } : {}) };
  });
  const edges = [];
  for (const l of shape.links) {
    const pairOf = (p) => (p[0] === l.src && p[1] === l.dst) || (p[1] === l.src && p[0] === l.dst);
    const isPeer = (shape.peers || []).some(pairOf);
    const isNone = shape.sessions.some((s) => s.indep && s.parent && pairOf([s.parent, s.name]));
    const relation = isPeer ? 'peer' : isNone ? 'none' : undefined;
    const b = { from: `s:${l.src}`, to: `s:${l.dst}`, count: l.count || 0, lastAt: now - 6e5, ...(relation ? { relation, relationSource: 'user' } : {}) };
    if (l.role) edges.push({ ...b, kind: 'role', label: l.role });
    if (l.observed) edges.push({ ...b, kind: 'prompt', label: 'report back when done' });
    if (l.spawned) edges.push({ ...b, kind: 'spawn' });
  }
  // 선 없는 정한 동료 쌍은 relation 선(P156)
  for (const p of shape.peers || []) if (!shape.links.some((l) => (l.src === p[0] && l.dst === p[1]) || (l.src === p[1] && l.dst === p[0]))) edges.push({ from: `s:${p[0]}`, to: `s:${p[1]}`, kind: 'relation', relation: 'peer', relationSource: 'user', count: 0 });
  api.call = async (m, p) => {
    if (m !== 'mission.graph') return api.__p153orig(m, p);
    return { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now };
  };
};
const UNHOOK = () => { const api = window.__mt.api; if (api.__p153orig) { api.call = api.__p153orig; const st = window.__mt.getState(); st.workspaces = window.__p153st.workspaces; st.groups = window.__p153st.groups; } };


// 할 일 카드 흉내: 세션(fk-이름)마다 n장
const SEED_TODO = ([todo]) => {
  let id = 900;
  const cards = Object.entries(todo).flatMap(([name, n]) => Array.from({ length: n }, (_, i) => ({ id: id++, sessionId: `fk-${name}`, name, question: `Sample to-do ${i + 1} for ${name}`, kind: 'decide', options: ['A', 'B'], createdAt: Date.now() - 6e5 })));
  window.__mt.api.emit('decision.changed', { cards, held: {}, riding: {} });
  return cards.length;
};

// 꼬리표(할 일·작업 완료)·무리의 화면 자리와, 무리가 다른 카드·머리와 겹치는지
const MEASURE = (names) => {
  const out = {};
  const cards = [...document.querySelectorAll('[data-role="mission"] .mt-ta-card')];
  const heads = [...document.querySelectorAll('[data-role="mission"] .mt-sm-head, [data-role="mission"] .mt-ta-ihead, [data-role="mission"] .mt-sm-spine')];
  const R = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
  const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  for (const name of names) {
    const c = document.querySelector(`[data-role="mission"] .mt-ta-card[data-name="${name}"]`); if (!c) { out[name] = 'nocard'; continue; }
    const cr = c.getBoundingClientRect();
    const one = (el) => { if (!el || getComputedStyle(el).display === 'none') return null; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); const k = r.height / (parseFloat(cs.height) || r.height); return { ...R(r), dx: Math.round(cr.right - r.right), dy: Math.round(r.top - cr.top), cssFont: parseFloat(cs.fontSize), screenFont: Math.round(parseFloat(cs.fontSize) * k * 10) / 10 }; };
    const todo = one(c.querySelector('[data-role=map-todo]')), done = one(c.querySelector('[data-role=mm-done]'));
    const g = c.querySelector('[data-role=map-tags]');
    const gr = g && g.getBoundingClientRect();
    const over = gr && gr.width ? [...cards.filter((x) => x !== c && hit(gr, x.getBoundingClientRect())).map((x) => 'card:' + x.dataset.name), ...heads.filter((x) => hit(gr, x.getBoundingClientRect())).map((x) => 'head:' + x.className.split(' ')[0])] : [];
    out[name] = { card: R(cr), todo, done, group: gr && gr.width ? R(gr) : null, over };
  }
  const v = window.__mtTa.view();
  return { k: v && Math.round(v.k * 1000) / 1000, level: (document.querySelector('[data-role=ta-world]') || {}).className, cards: out };
};

const NAMES = ['researcher', 'scribe', 'deck-writer', 'ex-set-04', 'robot-worker-codex'];

async function setup() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(call('session.list').map((s) => s.name));
  if (!have.has('p335-a')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p335-a').slice(0, 160));
  await sleep(2000);
  check('셸 하나가 떴다', call('session.list').some((s) => s.name === 'p335-a'));
}

async function shots() {
  call('settings.set', { key: 'missionStyle', value: 'territories' });
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  const seen = {};
  try {
    await awayWin(app);
    const [VW, VH] = (process.env.P335_VIEW || '1600x1000').split('x').map(Number);
    await page.setViewportSize({ width: VW, height: VH }).catch(() => {});
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    call('settings.set', { key: 'language', value: 'ko' }); await sleep(800);
    if (await page.$('[data-role=sidebar]')) { await page.click('[data-role=top-left] [data-action=sidebar]').catch(() => {}); await sleep(600); }
    const real = await page.evaluate(() => ([...window.__mt.getState().sessions.values()].find((s) => s.name === 'p335-a') || {}).sessionId || null);
    await page.evaluate(HOOK, [JSON.parse(JSON.stringify(SHAPE)), MIX, real, null]);
    log('할 일 흉내 ' + await page.evaluate(SEED_TODO, [TODO]));
    await page.click('[data-role=sessions-pill]'); await sleep(1500);
    await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 }); await sleep(1500);
    log('할 일 흉내(지도 연 뒤) ' + await page.evaluate(SEED_TODO, [TODO])); await sleep(600);
    const clipOf = async (ns, pad = 40) => { const rs = (await Promise.all(ns.map((n) => page.evaluate((n) => { const c = document.querySelector(`[data-role="mission"] .mt-ta-card[data-name="${n}"]`); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, n)))).filter(Boolean); if (!rs.length) return undefined; const x = Math.max(0, Math.min(...rs.map((r) => r.x)) - pad), y = Math.max(0, Math.min(...rs.map((r) => r.y)) - pad * 2); return { x, y, width: Math.min(VW - x, Math.max(...rs.map((r) => r.x + r.w)) - x + pad), height: Math.min(VH - y, Math.max(...rs.map((r) => r.y + r.h)) - y + pad) }; };
    const at = async (z) => { seen[z] = await page.evaluate(MEASURE, NAMES); log(`${z} ${JSON.stringify(seen[z])}`); };
    // 처음 연 화면(폭 맞춤, 기본 배율)
    await at('open'); await shot(page, `map-open-${ROUND}`);
    { const cl = await clipOf(['researcher', 'scribe', 'deck-writer', 'robot-worker-codex']); if (cl) await shot(page, `cards-open-${ROUND}`, { clip: cl }); }
    // 맞춤(전체)
    await page.evaluate(() => window.__mtTa.fit()); await sleep(1400);
    await at('fit'); await shot(page, `map-fit-${ROUND}`);
    for (const ns of [['researcher', 'scribe'], ['deck-writer', 'robot-worker-codex']]) { const cl = await clipOf(ns); if (cl) await shot(page, `cards-fit-${ns[0]}-${ROUND}`, { clip: cl }); }
    // 100%: 카드마다 날아가서 잰다
    seen.z100 = { cards: {} };
    for (const n of NAMES) {
      await page.evaluate((n) => { const L = window.__mtTa.lay(); const hit = [...L.cards.entries()].find(([, b]) => b.node.name === n); if (hit) window.__mtTa.flyTo(hit[0], 1); }, n); await sleep(900);
      const m = await page.evaluate(MEASURE, [n]); seen.z100.k = m.k; seen.z100.level = m.level; seen.z100.cards[n] = m.cards[n];
      const c = m.cards[n]; if (c && c.card) await shot(page, `card-100-${n}-${ROUND}`, { clip: { x: Math.max(0, c.card.x - 40), y: Math.max(0, c.card.y - 90), width: c.card.w + 80, height: c.card.h + 120 } });
    }
    log('100% ' + JSON.stringify(seen.z100));
    await shot(page, `map-100-${ROUND}`);
    // 멀리: 멀리 단계(60% 아래)의 가운데쯤 42%로 researcher에 날아간다(이름표 계단이 바뀌면 배치를 다시 센 뒤)
    await page.evaluate(() => { const L = window.__mtTa.lay(); const hit = [...L.cards.entries()].find(([, b]) => b.node.name === 'researcher'); if (hit) window.__mtTa.flyTo(hit[0], 0.42); }); await sleep(1600);
    await at('far'); await shot(page, `map-far-${ROUND}`);
    { const cl = await clipOf(['researcher', 'scribe', 'deck-writer'], 30); if (cl) await shot(page, `cards-far-${ROUND}`, { clip: cl }); }
    fs.writeFileSync(path.join(OUT, `tags-${ROUND}.json`), JSON.stringify(seen, null, 2));
    if (ROUND.startsWith('after')) judge(seen);
  } finally { await closeApp(app); }
}

// 판정: 세로 무리(작업 완료가 테두리, 할 일이 바로 위, 오른쪽 끝 맞춤), 화면 글 12px 이상, 다른 카드·머리와 겹치지 않음
function judge(seen) {
  for (const [z, m] of Object.entries(seen)) {
    for (const [n, v] of Object.entries(m.cards)) {
      if (!v || v === 'nocard') continue;
      const { todo, done, card } = v;
      const low = done || todo;
      const thin = card.h < 40 * (m.k || 1); // 얇은 줄(30)은 무리 전체가 테두리 위
      if (low) check(`${z} ${n}: 아래 꼬리표가 카드 위 테두리${thin ? ' 바로 위(얇은 줄)' : '에 걸침'}·오른쪽 위`, (thin ? low.y + low.h <= card.y + 0.5 : low.y < card.y && low.y + low.h > card.y && low.y + low.h - card.y <= 11 * m.k + 1.5) && low.dx >= 0 && low.dx < card.w / 3, v);
      if (todo && done) check(`${z} ${n}: 할 일이 작업 완료 바로 위, 오른쪽 끝 맞춤`, todo.y + todo.h <= done.y + 0.5 && done.y - (todo.y + todo.h) <= 8 && Math.abs(todo.dx - done.dx) <= 1, v);
      // 맞춤은 이름표 계단의 끝(18%)보다 멀면 글도 배율과 함께 작아진다(lib/mission-lineage.js LABEL.MIN·TAG.CAP): 맞춤 배율 20% 이상일 때만 12px를 본다
      if (z !== 'fit' || m.k >= 0.2) for (const x of [todo, done].filter(Boolean)) check(`${z} ${n}: 화면 글 ${x.screenFont}px ≥ 12`, x.screenFont >= 12, x);
      else log(`참고 ${z} ${n}: 배율 ${m.k}에서 화면 글 ${[todo, done].filter(Boolean).map((x) => x.screenFont).join('·')}px`);
      check(`${z} ${n}: 무리가 다른 카드·머리와 겹치지 않음`, !v.over.length, v.over);
    }
  }
}

async function stopAll() {
  try { if (call('session.list').some((s) => s.name === 'p335-a')) log(atrium('kill', 'p335-a', '--yes')); } catch (e) { log('kill ' + e.message); }
  try { log(atrium('terminal', 'stop', '--yes')); } catch (e) { log('terminal stop ' + e.message); }
  try { log(atrium('backend', 'stop')); } catch (e) { log('backend stop ' + e.message); }
}

try {
  if (WHAT === 'setup') await setup();
  else if (WHAT === 'shots') await shots();
  else if (WHAT === 'stop') await stopAll();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p335-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
