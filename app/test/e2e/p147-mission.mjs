// P147 창 시험: 미션 맵 "부대" 모양. 작은 판(mix)과 큰 판(big)을 창 크기 셋(1584×921, 2560×1440, 1366×768)과 움직임 줄이기(reduce)·no-preference로 찍고,
// 누르면 그 노드로 가기, 거르기, 키보드, 가리키기, 옛 지도로 되돌리기(모양 단추)를 본다. 한 번에 한 창만 돌린다(메모리).
// 판: 따로 띄운 개발용 판(atrium-dev-p147, 47917, backend/.dev)만 쓴다. 창의 원격 디버깅 포트 9397.
//   워크스페이스 다섯(mtask-p147-a…e)에 셸 세션 하나씩. 폴더 alpha(a, b, c)·beta(d, e). 폴더 밖 워크스페이스는 흉내 판에서 어느 폴더에도 없는 키로 만든다.
//   페이지 안에서 mission.graph 답을 흉내 판으로 바꾼다(P101 요령): mix = 폴더 둘·폴더 밖, 팀 셋, 응답 필요·오류·작업 완료·작업 중·쉼을 섞은 판(세션 23개),
//   big = 세션 37개, 워크스페이스 10개, 팀 다섯.
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p147-mission.mjs <setup|shot|stop>
// 결과는 워크트리의 experiments/p147/(저장소 밖, 지휘 세션이 주 체크아웃으로 옮긴다).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p147');
const CONVOS = path.join(OUT, 'convos');
const LETTERS = ['a', 'b', 'c', 'd', 'e'];
const DIRS = LETTERS.map((k) => `C:\\Workspace\\mtask-p147-${k}`);
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k]; // 실제 판의 값을 물려받지 않는다
const ENV = {
  ATRIUM_TERMINAL_SESSION: 'atrium-dev-p147', ATRIUM_HERDR_SESSION: 'atrium-dev-p147', ATRIUM_PORT: '47917',
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p147-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p147-${WHAT}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const sessions = () => call('session.list');
const P = (k) => `p147-${k}`;

async function setupBoard() {
  for (const d of DIRS) fs.mkdirSync(d, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(sessions().map((s) => s.name));
  LETTERS.forEach((k, i) => { if (!have.has(P(k))) log(atrium('--json', 'spawn', DIRS[i], '--kind', 'shell', '--name', P(k)).slice(0, 160)); });
  await sleep(3000);
  const gs = call('group.list');
  const list = gs.groups || gs;
  const has = (n) => Array.isArray(list) && list.some((g) => g.name === n);
  if (!has('alpha')) call('group.create', { name: 'alpha', workspaces: [DIRS[0], DIRS[1], DIRS[2]] });
  if (!has('beta')) call('group.create', { name: 'beta', workspaces: [DIRS[3], DIRS[4]] });
  log('groups', JSON.stringify(call('group.list')).slice(0, 600));
}

// ---- 흉내 판(페이지 안에서 mission.graph 답을 바꾼다). keys: 글자 → 워크스페이스 키 ----
const HOOK = ([keys, which]) => {
  const api = window.__mt.api;
  if (!api.__p147orig) api.__p147orig = api.call.bind(api);
  const now = Date.now();
  let i = 0;
  const S = (name, w, o = {}) => ({ id: `s:${name}`, kind: 'session', sessionId: `fk-${name}`, name, agentKind: 'claude', state: 'ready', category: 'idle', workspaceKey: keys[w], parentId: null, role: null, order: null, createdAt: 1e12 + ++i, loops: 0, model: 'claude-opus-5-5', effort: 'high', activeAt: now - i * 5e5, turnAt: null, gitBranch: null, ...o });
  const W = { state: 'working', category: 'working' };
  const kid = (name, w, parent, o = {}) => S(name, w, { parentId: `s:${parent}`, role: 'worker', ...o });
  let fake, edges0;
  if (which === 'mix') {
    fake = [
      S('conductor', 'a', { ...W, model: 'claude-fable-5-2', turnAt: now - 5e6, lastPrompt: 'Merge the workers when they report' }),
      kid('ui', 'a', 'conductor', { ...W, turnAt: now - 2e6, gitBranch: 'worktree-ui', lastPrompt: 'Mission map spacing' }),
      kid('reviewer', 'a', 'conductor', { parentId: null, role: 'reviewer', state: 'waiting', category: 'needs_you', ask: 'Run the full test suite before merging?' }),
      kid('ui-tests', 'a', 'ui', { ...W, turnAt: now - 6e5, lastPrompt: 'npm test' }), kid('ui-docs', 'a', 'ui'),
      kid('term', 'd', 'conductor', { ...W, role: 'terminal input', turnAt: now - 9e5, lastPrompt: 'Scroll residue' }), // 다른 폴더(beta)의 하위 세션
      S('a-notes', 'a'), S('a-try', 'a', { ...W, turnAt: now - 3e5, lastPrompt: 'Try the new flag' }), S('a-old', 'a', { state: 'sleeping' }),
      S('blog', 'b', { model: 'claude-sonnet-5-5', effort: null, state: null, category: 'done', lastPrompt: 'Draft the release post' }), S('blog-copy', 'b', { state: 'sleeping' }),
      S('notes', 'c', { state: 'sleeping' }), S('notes-2', 'c'),
      S('api-lead', 'e'), kid('api-w1', 'e', 'api-lead', { ...W, turnAt: now - 4e5, lastPrompt: 'npm test' }), kid('api-w2', 'e', 'api-lead', { state: 'error', category: 'needs_you' }), kid('api-w3', 'e', 'api-lead', { parentId: null }),
      S('site', 'f', { ...W, turnAt: now - 2e5, lastPrompt: 'Deploy preview', agentKind: 'codex', model: 'gpt-5.5', effort: 'medium' }), kid('site-docs', 'f', 'site', { role: 'docs' }),
      S('scratch', 'g', { agentKind: 'shell', model: null }), S('dotfiles', 'g', { state: 'sleeping' }), S('sandbox', 'g'), S('tmp', 'g', { state: 'exited', category: 'exited' })];
    edges0 = [{ from: 's:conductor', to: 's:ui', kind: 'spawn' }, { from: 's:conductor', to: 's:reviewer', kind: 'role', label: 'reviewer' }, { from: 's:conductor', to: 's:term', kind: 'spawn' },
      { from: 's:ui', to: 's:ui-tests', kind: 'spawn' }, { from: 's:ui', to: 's:ui-docs', kind: 'spawn' },
      { from: 'human', to: 's:conductor', kind: 'bar', count: 4, label: 'Ship the mission map' }, { from: 'human', to: 's:a-try', kind: 'loop', count: 2 },
      { from: 's:api-lead', to: 's:api-w1', kind: 'spawn' }, { from: 's:api-lead', to: 's:api-w2', kind: 'spawn' }, { from: 's:api-lead', to: 's:api-w3', kind: 'prompt', label: 'look at the logs', count: 1 }, { from: 's:site', to: 's:site-docs', kind: 'spawn' },
      { from: 's:api-w1', to: 's:site-docs', kind: 'prompt', label: 'update the api docs', count: 2, lastAt: now - 6e5 }];
  } else {
    // big: 워크스페이스 10개(폴더 alpha·beta + 폴더 밖 다섯), 팀 다섯(리드 + 하위 2~5, 손자 하나), 혼자인 세션 많음, 세션 37개
    fake = [
      S('lead', 'a', { ...W, model: 'claude-fable-5-2', turnAt: now - 6e6, lastPrompt: 'Run the release' }),
      ...['w1', 'w2', 'w3', 'w4', 'w5'].map((n, j) => kid(n, 'a', 'lead', j % 2 ? { ...W, turnAt: now - j * 1e5, lastPrompt: `Task ${n}` } : {})), kid('w1-sub', 'a', 'w1', { ...W, lastPrompt: 'sub task' }),
      S('a-s1', 'a'), S('a-s2', 'a', { state: 'sleeping' }), S('a-s3', 'a', { ...W, lastPrompt: 'Watch the build' }),
      S('web', 'b', W), kid('web-1', 'b', 'web'), kid('web-2', 'b', 'web', { state: 'waiting', category: 'needs_you', ask: 'Allow npm install?' }),
      S('c-1', 'c'), S('c-2', 'c', { state: null, category: 'done' }),
      S('bot', 'd'), kid('bot-1', 'd', 'bot', W), kid('bot-2', 'd', 'bot'), kid('bot-3', 'd', 'bot', { state: 'error' }),
      S('ops', 'e', W), kid('ops-1', 'e', 'ops'),
      S('infra', 'h', W), kid('infra-1', 'h', 'infra', W), kid('infra-2', 'h', 'infra', { state: 'sleeping' }),
      ...Array.from({ length: 8 }, (_, j) => S(`lab-${j}`, 'f', j === 2 ? { ...W, lastPrompt: 'experiment' } : j % 3 ? {} : { state: 'sleeping' })),
      ...Array.from({ length: 3 }, (_, j) => S(`misc-${j}`, 'g')), S('i-1', 'i'), S('j-1', 'j', { agentKind: 'shell', model: null })];
    edges0 = [];
    for (const n of fake) if (n.parentId) edges0.push({ from: n.parentId, to: n.id, kind: 'spawn' });
    edges0.push({ from: 'human', to: 's:lead', kind: 'bar', count: 5 }, { from: 'human', to: 's:web', kind: 'bar' }, { from: 's:w2', to: 's:bot-1', kind: 'prompt', label: 'check the bot', count: 1, lastAt: now - 1e5 });
  }
  api.call = async (m, p) => {
    if (m !== 'mission.graph') return api.__p147orig(m, p);
    const nodes = [{ id: 'human', kind: 'human', name: 'you' }, ...fake];
    return { nodes, edges: edges0, counts: { all: nodes.length - 1 }, at: now };
  };
};
const UNHOOK = () => { const api = window.__mt.api; if (api.__p147orig) api.call = api.__p147orig; };

// ---- 지도 읽기 ----
const PROBE = () => {
  const m = document.querySelector('[data-role=mission]');
  if (!m) return null;
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const body = m.querySelector('.mt-mission-body'), canvas = m.querySelector('.mt-sq-canvas');
  const vb = R(body);
  const rows = [...m.querySelectorAll('[data-role=sq-row]')].map((n) => ({ name: n.dataset.name, kind: n.dataset.kind, tier: n.dataset.tier, cls: n.className, ...R(n) }));
  const seen = rows.filter((n) => n.y >= vb.y - 1 && n.y + n.h <= vb.y + vb.h + 1 && n.x >= vb.x - 1 && n.x + n.w <= vb.x + vb.w + 1);
  const folders = [...m.querySelectorAll('[data-role=sq-folder]')].map((f) => ({ id: f.dataset.id, ...R(f) }));
  const wss = [...m.querySelectorAll('[data-role=sq-ws]')].map((p) => ({ key: p.dataset.key, inf: p.classList.contains('inf'), ...R(p) }));
  const dock = [...m.querySelectorAll('[data-role=sq-dock-item]')].map((d) => ({ name: d.dataset.name, tier: d.dataset.tier }));
  const pulses = [...m.querySelectorAll('.mt-sq-pulse')];
  return {
    style: m.dataset.style || 'classic', body: vb, canvas: canvas ? { w: canvas.offsetWidth, h: canvas.offsetHeight } : null, scrollW: body.scrollWidth, clientW: body.clientWidth,
    rows, folders, wss, dock, seen: seen.length, total: rows.length, guides: m.querySelectorAll('[data-role=sq-guide]').length,
    guideRels: [...new Set([...m.querySelectorAll('[data-role=sq-guide]')].map((g) => g.dataset.rel))],
    pulses: pulses.length, pulseShown: pulses.filter((p) => getComputedStyle(p).display !== 'none').length,
    pulseAnim: pulses.length ? getComputedStyle(pulses[0]).animationName : null, crossChips: m.querySelectorAll('[data-role=sq-cross]').length, linkChips: m.querySelectorAll('[data-role=sq-link-chip]').length,
  };
};
const hit = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
const inside = (a, o) => a.x >= o.x - 1 && a.y >= o.y - 1 && a.x + a.w <= o.x + o.w + 1 && a.y + a.h <= o.y + o.h + 1;

async function openMission(pg) {
  if (await pg.$('[data-action="return-close"]')) { await pg.click('[data-action="return-close"]').catch(() => {}); await sleep(300); }
  if (await pg.$('[data-role="mission"]')) { await pg.keyboard.press('Escape'); await sleep(400); }
  await pg.click('[data-action="mission-rail"]');
  await pg.waitForSelector('[data-role="mission"] [data-role="sq-row"], [data-role="mission"] [data-role="mm-node"]', { timeout: 20000 });
  await sleep(1200);
}
const shotTo = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const summary = {};

function judge(tag, p) {
  summary[tag] = { seen: p.seen, total: p.total, canvas: p.canvas, body: { w: p.body.w, h: p.body.h }, dock: p.dock.length, folders: p.folders.length, wss: p.wss.length };
  log(`[${tag}] 한 화면 줄 ${p.seen}/${p.total}, 지도 ${p.canvas && `${p.canvas.w}x${p.canvas.h}`}, 칸 ${p.body.w}x${p.body.h}, 기다리는 일 ${p.dock.length}, 선 ${p.guides} ${p.guideRels}, 고리 ${p.pulseShown}/${p.pulses} ${p.pulseAnim}`);
  check(`[${tag}] 새 모양(부대)`, p.style === 'squads');
  let bad = null;
  const solid = p.rows.filter((r) => r.kind !== 'pill');
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) if (hit(solid[i], solid[j])) bad = `${solid[i].name}×${solid[j].name}`;
  const pills = p.rows.filter((r) => r.kind === 'pill');
  for (let i = 0; i < pills.length; i++) for (let j = i + 1; j < pills.length; j++) if (hit(pills[i], pills[j])) bad = `${pills[i].name}×${pills[j].name}`;
  check(`[${tag}] 줄끼리 겹치지 않는다`, !bad, bad || '');
  bad = null; for (const w of p.wss.filter((x) => x.inf)) if (!p.folders.some((f) => inside(w, f))) bad = w.key;
  check(`[${tag}] 폴더 안 워크스페이스 판은 폴더 틀 안(폴더 > 워크스페이스)`, !bad, bad || '');
  check(`[${tag}] 가로 스크롤 없음`, p.scrollW <= p.clientW + 1, { scrollW: p.scrollW, clientW: p.clientW });
}

async function shots() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=9397'] });
  try {
    await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sleep(2500);
    const st = await page.evaluate(() => { const s = window.__mt.getState(); return { ws: s.workspaces.map((w) => w.key), style: s.settings && s.settings.missionStyle }; });
    log('설정 missionStyle', st.style);
    const keyOf = (k) => st.ws.find((w) => w.toLowerCase().includes(`mtask-p147-${k}`)) || `x-${k}`;
    const keys = Object.fromEntries([...LETTERS, 'f', 'g', 'h', 'i', 'j'].map((k) => [k, LETTERS.includes(k) ? keyOf(k) : `c:/elsewhere/p147-${k}`]));
    for (const which of ['mix', 'big']) {
      await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
      await page.evaluate(UNHOOK);
      await page.evaluate(HOOK, [keys, which]);
      await openMission(page); await page.mouse.move(5, 900); await sleep(300);
      for (const [vw, vh] of [[1584, 921], [2560, 1440], [1366, 768]]) {
        await page.setViewportSize({ width: vw, height: vh }).catch(() => {});
        await sleep(900);
        for (const motion of ['reduce', 'no-preference']) {
          if (motion === 'no-preference' && vw !== 1584) continue;
          await page.emulateMedia({ reducedMotion: motion }); await sleep(500);
          await shotTo(page, `${which}-${vw}x${vh}-${motion}`);
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        judge(`${which}-${vw}`, await page.evaluate(PROBE));
      }
      await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {}); await sleep(800);
      const p = await page.evaluate(PROBE);
      if (which === 'mix') {
        check('[mix] 기다리는 일: 응답 필요가 먼저, 오류, 그다음 작업 완료', p.dock.map((d) => d.tier).join(',') === 'turn,alert,review' && p.dock[0].name === 'reviewer', p.dock);
        check('[mix] 관계 종류 셋이 선 모양으로(띄움·역할·시킴)', ['spawn', 'role', 'prompt'].every((r) => p.guideRels.includes(r)), p.guideRels);
        check('[mix] 다른 워크스페이스 하위(term)는 ↗ 칩', p.crossChips >= 1, p.crossChips);
        check('[mix] 나무 밖 시킴은 줄의 칩(→ / ←)', p.linkChips >= 2, p.linkChips);
        check('[mix] 작업 중 고리(workLight 켬은 reduce에서도 돈다)', p.pulses >= 5 && p.pulseShown === p.pulses && p.pulseAnim === 'mt-sq-pulse', { n: p.pulses, shown: p.pulseShown });
        const cond = p.rows.find((r) => r.name === 'conductor'), ui = p.rows.find((r) => r.name === 'ui'), uit = p.rows.find((r) => r.name === 'ui-tests');
        check('[mix] 팀 나무: 하위는 리드 아래, 손자는 한 단 더 들여쓴다', cond && ui && uit && ui.y > cond.y && uit.x > ui.x && uit.y > ui.y, { cond, ui, uit });
        const tip = await page.evaluate(() => document.querySelector('[data-role=sq-row][data-name=conductor]').title);
        check('[mix] 사람이 보낸 지시는 풍선 도움말 한 줄', /From you|사용자/.test(tip) && /Ship the mission map/.test(tip), tip.split('\n').slice(0, 4));
        // 가리키기: api-w1을 가리키면 그 팀·이은 세션(site-docs)만 또렷하고 곡선이 생긴다
        const w1 = p.rows.find((r) => r.name === 'api-w1');
        await page.mouse.move(w1.x + 40, w1.y + w1.h / 2); await sleep(400);
        const hv = await page.evaluate(() => ({ blog: document.querySelector('[data-role=sq-row][data-name=a-notes]').classList.contains('recede'), lead: document.querySelector('[data-role=sq-row][data-name=api-lead]').classList.contains('recede'), docs: document.querySelector('[data-role=sq-row][data-name=site-docs]').classList.contains('recede'), links: document.querySelectorAll('[data-role=sq-link]').length }));
        check('[mix] 가리키면 그 팀과 이은 세션만 또렷, 연결 곡선', hv.blog && !hv.lead && !hv.docs && hv.links >= 1, hv);
        await shotTo(page, 'mix-hover');
        await page.mouse.move(5, 900); await sleep(300);
        // 거르기
        await page.click('[data-filter=needs_you]'); await sleep(400);
        const dim = await page.evaluate(() => ({ rev: document.querySelector('[data-role=sq-row][data-name=reviewer]').classList.contains('fdim'), err: document.querySelector('[data-role=sq-row][data-name=api-w2]').classList.contains('fdim'), ui: document.querySelector('[data-role=sq-row][data-name=ui]').classList.contains('fdim') }));
        check('[mix] 거르기(응답 필요)는 나머지를 흐리게만', !dim.rev && !dim.err && dim.ui, dim);
        await shotTo(page, 'mix-filter-needs');
        await page.click('[data-filter=all]'); await sleep(300);
        // 접기
        await page.click('[data-role=sq-ws-head]'); await sleep(400);
        const shut = await page.evaluate(() => document.querySelector('[data-role=sq-ws]').classList.contains('shut'));
        check('[mix] 워크스페이스 머리를 누르면 접힌다', shut);
        await page.click('[data-role=sq-ws-head]'); await sleep(400);
        // 키보드: ↓ 두 번 → 둘째 줄에 초점, Enter → 덮개 닫힘(그 노드로 감)
        await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await sleep(300);
        const foc = await page.evaluate(() => { const a = document.activeElement; return a && a.dataset ? { name: a.dataset.name, role: a.dataset.role, hot: a.classList.contains('hot') } : null; });
        check('[mix] ↓로 줄을 옮긴다(초점과 강조)', foc && foc.role === 'sq-row' && foc.hot, foc);
        await shotTo(page, 'mix-keyboard');
        await page.keyboard.press('Enter'); await sleep(500);
        const closed = await page.evaluate(() => !document.querySelector('[data-role=mission]'));
        check('[mix] Enter는 덮개를 닫고 그 노드로 간다', closed);
        // 누르면 그 노드로: 기다리는 일 카드(흉내 세션이라 판 노드는 없다 → 덮개가 닫히는지만)
        await openMission(page);
        await page.click('[data-role=sq-dock-item]'); await sleep(500);
        check('[mix] 기다리는 일 카드를 누르면 덮개를 닫고 간다', await page.evaluate(() => !document.querySelector('[data-role=mission]')));
        // 옛 지도로 되돌리기(모양 단추 → 판 설정 missionStyle)
        await openMission(page);
        await page.click('[data-role=sq-style] [data-style=classic]'); await sleep(1500);
        const cls = await page.evaluate(() => ({ cards: document.querySelectorAll('[data-role=mission] .mt-mm-card').length, sq: document.querySelectorAll('[data-role=sq-row]').length }));
        const set1 = call('settings.get');
        check('[mix] 모양 단추로 옛 지도(classic)로 되돌리고 판 설정에 남는다', cls.cards > 0 && cls.sq === 0 && (set1.settings || set1).missionStyle === 'classic', { ...cls, set: (set1.settings || set1).missionStyle });
        await shotTo(page, 'mix-classic');
        await page.click('[data-role=sq-style] [data-style=squads]'); await sleep(1500);
        const back = await page.evaluate(() => document.querySelectorAll('[data-role=sq-row]').length);
        check('[mix] 다시 부대로', back > 0 && (call('settings.get').settings || {}).missionStyle === 'squads', back);
      } else {
        check('[big] 1584×921: 기둥 셋 이상, 세션 대부분이 한 화면에', p.seen >= p.total * 0.85, { seen: p.seen, total: p.total });
      }
    }
    // 실제 셸 세션 그대로(흉내 없음): 기다리는 일 없음 줄
    await page.evaluate(UNHOOK);
    await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
    await openMission(page); await page.mouse.move(5, 900); await sleep(300);
    await shotTo(page, 'real-1584x921');
    const r = await page.evaluate(PROBE);
    judge('real', r);
    check('[real] 기다리는 일이 없으면 한 줄', await page.evaluate(() => !!document.querySelector('[data-role=sq-dock-none]')));
  } finally { await closeApp(app); }
  fs.writeFileSync(path.join(OUT, 'p147-summary.json'), JSON.stringify(summary, null, 2));
}

async function stopBoard() {
  for (const s of sessions().filter((x) => /^p147-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'shot') await shots();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p147-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
