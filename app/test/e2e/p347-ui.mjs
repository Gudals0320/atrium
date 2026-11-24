// P347 창 시험: 화면 정리 다섯 가지의 전·후 그림과 판정.
// 1) 설정 › 알림·사용량과 사용량 알약 펼침에 Hermes 줄이 없다(흉내 값에 hermes가 있어도), 2) 명령 줄 위 알약과 위 오른쪽에 "변경 내역"이 없다(복귀 요약 창도),
// 3) 위 오른쪽 세션 맵 단추에 점과 "세션 맵" 글이 함께 보인다(좁은 창에서도), 4) 세션 맵 오른쪽 아래가 선 모양 견본 범례다(수 줄 없음), 5) 쉼 · 끝남 묶음이 없다.
// 판: 따로 띄운 개발용 판(atrium-dev-p347, 48093, backend/.dev)만. 창의 원격 디버깅 포트 9574. 한 번에 한 창.
// 세션: 셸 하나(p347-a). 세션 맵은 페이지 안 흉내(mission.graph, p335와 같은 지어낸 모양), 사용량은 흉내(usage.updated).
// 실행: node app/test/e2e/p347-ui.mjs <setup|shots|stop> [round]   (round: before|after, 판정은 after만). 결과는 experiments/p347/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'shots';
const ROUND = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p347', ROUND);
const BOARD = 'atrium-dev-p347', PORT = '48093', DEBUG = '9574';
const DIR = 'C:\\Workspace\\mtask-p347-a';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p347', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p347-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger(`p347-${WHAT}-${ROUND}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const judge = ROUND.startsWith('after');
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
const SHAPE = JSON.parse(JSON.stringify(SHAPE_FAKE));
// 쉼 · 끝남 묶음이 보이게 끝난 세션 둘을 더한다
SHAPE.sessions.push(ss('old-runner', 'c:/work/notes/.git', { st: 'exited' }), ss('old-probe', 'd:/work/garden/.git', { st: 'exited' }));
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



// 사용량 흉내: Claude·Codex와 Hermes(Codex와 같은 계정·다른 계정 둘), DeepSeek 잔액
const FAKE_USAGE = (sep) => {
  const now = Date.now(), w = (id, p) => ({ id, usedPct: p, resetsAt: now + 3600000 * (id === '5h' ? 2 : 50) });
  return { providers: {
    claude: { provider: 'claude', source: 'statusline', at: now - 60000, windows: [w('5h', 32), w('week', 58)] },
    codex: { provider: 'codex', source: 'rollout', at: now - 90000, plan: 'pro', windows: [w('5h', 12), w('week', 40)] },
    hermes: { provider: 'hermes', source: 'probe:hermes', at: now - 30000, hermesProvider: sep ? 'anthropic' : 'openai-codex', plan: sep ? 'Max' : 'pro', sameAs: sep ? null : 'codex', windows: [w('5h', 41)] },
    deepseek: { provider: 'deepseek', source: 'probe:balance', at: now - 30000, windows: [], balance: { total: 7.25, currency: 'USD' } },
  }, probing: [] };
};
const topClip = (W) => ({ x: Math.max(0, W - 760), y: 0, width: Math.min(760, W), height: 64 });

async function setup() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  call('settings.set', { key: 'usageProbe', value: false }); // 시험 판이 실제 하네스에 사용량을 묻지 않게
  const have = new Set(call('session.list').map((s) => s.name));
  if (!have.has('p347-a')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p347-a').slice(0, 160));
  await sleep(2000);
  check('셸 하나가 떴다', call('session.list').some((s) => s.name === 'p347-a'));
}

async function shots() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    for (const lang of ['ko', 'en']) {
      call('settings.set', { key: 'language', value: lang });
      await page.waitForFunction((l) => document.documentElement.lang === l, lang, { timeout: 10000 }).catch(() => {}); await sleep(800);
      await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {}); await sleep(600);
      // 위 오른쪽(세션 맵 단추)
      await shot(page, `top-${lang}`, { clip: topClip(1600) });
      const top = await page.evaluate(() => { const c = document.querySelector('[data-role=conn]'); return { conn: c && c.innerText.trim(), dotOnly: !!(c && c.classList.contains('dot-only')), dot: !!(c && c.querySelector('.mt-dot')), changes: !!document.querySelector('[data-action=changes]'), order: [...document.querySelectorAll('[data-role=top-right] > *')].map((e) => e.dataset.role || e.dataset.action || e.className) }; });
      log(`[${lang}] 위 오른쪽 ${JSON.stringify(top)}`);
      if (judge) {
        check(`[${lang}] 세션 맵 단추: 점과 "${lang === 'ko' ? '세션 맵' : 'Session map'}" 글이 함께 보인다`, top.dot && top.conn === (lang === 'ko' ? '세션 맵' : 'Session map') && !top.dotOnly, top);
        check(`[${lang}] 위 오른쪽에 변경 내역 단추가 없다`, !top.changes, top.order);
      }
      // 좁은 창(접기 단계)
      await page.setViewportSize({ width: 900, height: 1000 }).catch(() => {}); await sleep(1500);
      await shot(page, `top-narrow-${lang}`, { clip: { x: 0, y: 0, width: 900, height: 110 } });
      const narrow = await page.evaluate(() => { const c = document.querySelector('[data-role=conn]'); const tr = document.querySelector('[data-role=top-right]'), tl = document.querySelector('[data-role=top-left]'); const r = (e) => e && e.getBoundingClientRect(); const a = r(tl), b = r(tr), cb = r(c); return { fit: tl && tl.dataset.fit, trCompact: tr && tr.classList.contains('compact'), conn: c && c.innerText.trim(), connVisible: !!(cb && cb.width > 0), overlap: !!(a && b && a.right > b.left && a.bottom > b.top && a.top < b.bottom), connW: cb && Math.round(cb.width) }; });
      log(`[${lang}] 좁은 창 ${JSON.stringify(narrow)}`);
      if (judge) check(`[${lang}] 좁은 창(900): 세션 맵 글이 남고 두 무리가 겹치지 않는다`, narrow.connVisible && /세션 맵|Session map/.test(narrow.conn || '') && !narrow.overlap, narrow);
      await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {}); await sleep(1200);
      // 명령 줄 위 알약
      await page.mouse.move(800, 985); await sleep(900);
      await page.evaluate(() => { const st = window.__mt.getState(); if (st.bottomShow) st.bottomShow(); });
      await sleep(500);
      await shot(page, `chips-${lang}`, { clip: { x: 0, y: 820, width: 1600, height: 180 } });
      const chips = await page.evaluate(() => [...document.querySelectorAll('[data-role=chips] [data-action]')].map((b) => b.dataset.action));
      log(`[${lang}] 알약 ${JSON.stringify(chips)}`);
      if (judge) check(`[${lang}] 명령 줄 위 알약에 변경 내역이 없다`, chips.length && !chips.includes('chip-changes'), chips);
      // 복귀 요약(변경 내역 창)
      const hasShow = await page.evaluate(() => typeof window.__mt.getState().showChanges === 'function');
      if (hasShow) { await page.evaluate(() => window.__mt.getState().showChanges(600)); await sleep(1200); await shot(page, `return-${lang}`); await page.click('[data-action=return-close]').catch(() => {}); await sleep(300); }
      if (judge) check(`[${lang}] 복귀 요약 창 코드가 없다(showChanges, return-summary)`, !hasShow && !(await page.$('[data-role=return-summary]')), { hasShow });
      // 사용량 알약 펼침(흉내: Hermes 같은 계정 → 다른 계정)
      for (const sep of [false, true]) {
        await page.evaluate((x) => window.__mt.api.emit('usage.updated', x), FAKE_USAGE(sep)); await sleep(300);
        await page.click('[data-role=usage]').catch((e) => log('usage 누르기 ' + e.message.slice(0, 80)));
        await page.waitForSelector('[data-role=usage-list]', { timeout: 8000 }).catch(() => {});
        // 펼치면 판이 실제 값(usage.refresh)을 다시 보낸다: 그 뒤에 흉내를 한 번 더 넣는다
        await sleep(900); await page.evaluate((x) => window.__mt.api.emit('usage.updated', x), FAKE_USAGE(sep)); await sleep(500);
        const box = await page.locator('[data-role=usage-list]').boundingBox().catch(() => null);
        const tr = await page.locator('[data-role=top-right]').boundingBox().catch(() => null);
        if (box && tr) await shot(page, `usage-${sep ? 'sep' : 'same'}-${lang}`, { clip: { x: Math.min(box.x, tr.x) - 10, y: 0, width: Math.max(box.x + box.width, tr.x + tr.width) - Math.min(box.x, tr.x) + 20, height: box.y + box.height + 20 } });
        const u = await page.evaluate(() => ({ text: (document.querySelector('[data-role=usage-list]') || {}).innerText || '', extras: [...document.querySelectorAll('[data-role=usage-extra]')].map((e) => e.dataset.provider), merged: !!document.querySelector('[data-role=usage-merged]') }));
        log(`[${lang}] 사용량(${sep ? '다른 계정' : '같은 계정'}) ${JSON.stringify(u).slice(0, 600)}`);
        if (judge) check(`[${lang}] 사용량 펼침에 Hermes 줄이 없다(${sep ? '다른 계정' : '같은 계정'} 흉내)`, !/Hermes/.test(u.text) && !u.extras.includes('hermes') && !u.merged && u.extras.includes('deepseek'), u);
        await page.keyboard.press('Escape'); await sleep(400);
      }
      // 설정 › 알림·사용량
      await page.click('[data-action=settings-open]');
      await page.click('[data-role=settings-tabs] [data-tab=alerts]').catch((e) => log('알림 탭 ' + e.message.slice(0, 80)));
      await page.waitForSelector('[data-role=usage-probe-setting]', { timeout: 10000 }).catch(() => {}); await sleep(600);
      await shot(page, `settings-alerts-${lang}`);
      const s = await page.evaluate(() => ({ hermesRow: !!document.querySelector('[data-role=usage-hermes-setting]'), text: (document.querySelector('[data-role=settings]') || document.body).innerText.includes('Hermes') }));
      log(`[${lang}] 설정 ${JSON.stringify(s)}`);
      if (judge) check(`[${lang}] 설정 › 알림·사용량에 Hermes 사용량 줄이 없다`, !s.hermesRow && !s.text, s);
      await page.keyboard.press('Escape'); await sleep(500);
      if (await page.$('[data-role=settings]')) { await page.keyboard.press('Escape'); await sleep(400); }
      // 세션 맵(오른쪽 요약 열: 범례, 쉼 · 끝남 없음)
      const real = await page.evaluate(() => ([...window.__mt.getState().sessions.values()].find((s) => s.name === 'p347-a') || {}).sessionId || null);
      await page.evaluate(HOOK, [JSON.parse(JSON.stringify(SHAPE)), MIX, real, null]);
      await page.click('[data-role=conn]'); await sleep(1500);
      await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 }).catch(() => log('지도 카드 없음')); await sleep(1500);
      await shot(page, `map-${lang}`);
      const sb = await page.locator('[data-role=ln-summary]').boundingBox().catch(() => null);
      if (sb) await shot(page, `map-summary-${lang}`, { clip: { x: sb.x - 4, y: sb.y, width: sb.width + 8, height: sb.height } });
      const m = await page.evaluate(() => { const s = document.querySelector('[data-role=ln-summary]'); if (!s) return null; const foot = s.querySelector('[data-role=mm-sum-foot]'); const lg = s.querySelector('[data-role=mm-legend]'); return { rest: !!s.querySelector('[data-role=mm-sum-rest]'), foot: foot ? foot.innerText : null, legend: lg ? [...lg.querySelectorAll('[data-role=mm-legend-item]')].map((i) => ({ k: i.dataset.kind, text: i.innerText.trim(), swatch: !!i.querySelector('svg') })) : null, legendH: lg ? Math.round(lg.getBoundingClientRect().height) : null }; });
      log(`[${lang}] 요약 열 ${JSON.stringify(m)}`);
      if (judge && m) {
        check(`[${lang}] 쉼 · 끝남 묶음과 이름 목록이 없다`, !m.rest, m);
        check(`[${lang}] 오른쪽 아래가 선 모양 견본 범례 여섯 항목(수 줄·긴 문단 없음)`, m.legend && m.legend.length === 6 && m.legend.every((x) => x.swatch && x.text && x.text.length <= 16) && !/\d/.test(m.foot || ''), m);
      }
      await page.click('[data-action=mission-close]').catch(() => {}); await sleep(600);
      await page.evaluate(UNHOOK);
    }
  } finally { await closeApp(app); }
}

async function stopAll() {
  try { if (call('session.list').some((s) => s.name === 'p347-a')) log(atrium('kill', 'p347-a', '--yes')); } catch (e) { log('kill ' + e.message); }
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
  fs.writeFileSync(path.join(OUT, `p347-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
