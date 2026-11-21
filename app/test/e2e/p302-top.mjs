// P302 창 시험: 위 왼쪽 알약 차례(세션 · 작업 중 · 작업 완료 · 내 몫, 그 뒤 응답 필요 · 문제), 사이드바 단추를 왼쪽 끝에,
// 사이드바 모두 접기·모두 열기, Hermes 종류 아이콘(OMH 앱 아이콘)이 판 카드·사이드바·세션 맵·레일에.
// 판: 따로 띄운 개발용 판(atrium-dev-p302, 48052, backend/.dev)만. 창의 원격 디버깅 포트 9533. 한 번에 한 창.
// 세션: 셸 셋(하나는 아이콘 hermes 런처로 띄워 flavor hermes), 폴더(그룹) 하나에 워크스페이스 둘.
// 실행: node app/test/e2e/p302-top.mjs <setup|pc|stop> [round]   결과는 워크트리의 experiments/p302/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'pc';
const TAG = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p302', TAG);
const BOARD = 'atrium-dev-p302', PORT = process.env.P302_PORT || '48052', DEBUG = process.env.P302_DEBUG || '9533';
const FOLDERS = ['C:\\Workspace\\mtask-p302-a', 'C:\\Workspace\\mtask-p302-b', 'C:\\Workspace\\mtask-p302-c'];
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p302', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p302-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p302-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const NAMES = ['hm1', 'sh1', 'sh2'];
const sess = (n) => call('session.list').find((s) => s.name === n);
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
async function waitFor(fn, ms = 120000, every = 1500) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(every); } }

async function setup() {
  for (const f of FOLDERS) fs.mkdirSync(f, { recursive: true });
  log(atrium('backend', 'start'));
  const L = call('launcher.list');
  if (!L.launchers.find((l) => l.name === 'Hermes p302')) call('launcher.create', { launcher: { name: 'Hermes p302', harness: 'shell', icon: 'hermes' }, favorite: true });
  if (!sess('hm1')) log(atrium('spawn', FOLDERS[0], '--launcher', 'Hermes p302', '--name', 'hm1'));
  if (!sess('sh1')) log(atrium('spawn', FOLDERS[1], '--name', 'sh1', '--kind', 'shell'));
  if (!sess('sh2')) log(atrium('spawn', FOLDERS[2], '--name', 'sh2', '--kind', 'shell'));
  const hm = await waitFor(() => { const s = sess('hm1'); return s && s.state !== 'starting' && s; }, 60000, 2000);
  check('hm1이 hermes 아이콘(flavor)으로 떴다', hm && hm.flavor === 'hermes', hm && { kind: hm.kind, flavor: hm.flavor, state: hm.state });
  const wl = call('workspace.list');
  const keyOf = (f) => (wl.workspaces.find((w) => path.resolve(w.root || w.path || '').toLowerCase() === path.resolve(f).toLowerCase()) || {}).key;
  const keys = FOLDERS.slice(0, 2).map(keyOf).filter(Boolean);
  if (!(wl.groups || []).length && keys.length === 2) log(JSON.stringify(call('group.create', { name: 'p302 folder', workspaces: keys })));
  log(JSON.stringify(call('workspace.list').groups));
}

// 사람이 볼 것 알약이 모두 보이게 흉내 세션을 더한다(창 안 store만, 판 데이터는 바꾸지 않는다)
async function fakeInbox(page) {
  await page.evaluate(() => {
    const st = window.__mt.getState();
    const base = [...st.sessions.values()].find((s) => s.name === 'sh1');
    if (!base) return;
    const mk = (id, name, more) => window.__mt.api.emit('session.updated', { ...base, sessionId: id, name, kind: 'shell', flavor: null, ...more });
    mk('p302-w', 'waiter', { state: 'waiting', waitingSince: Date.now() - 60000, unseen: false });
    mk('p302-r', 'finisher', { state: 'ready', unseen: true, lastAnswer: '끝났습니다' });
    mk('p302-e', 'broken', { state: 'error', unseen: false });
    mk('p302-k1', 'worker1', { state: 'working', unseen: false, lastPrompt: '테스트 돌리기', lastActivityAt: Date.now() });
    mk('p302-k2', 'worker2', { state: 'shell_running', unseen: false, lastActivityAt: Date.now() - 5000 });
    // 내 몫 카드 둘(창 안 흉내, 판의 decision.changed와 같은 꼴)
    const hm = [...st.sessions.values()].find((s) => s.name === 'hm1') || base;
    const now = Date.now();
    window.__mt.api.emit('decision.changed', { cards: [
      { id: 90301, sessionId: hm.sessionId, name: hm.name, kind: 'decide', question: '이대로 마무리할까요?', options: ['마무리', '더 고침'], createdAt: now - 30000 },
      { id: 90302, sessionId: hm.sessionId, name: hm.name, kind: 'do', question: '배포 전에 로그인해 주세요', createdAt: now - 20000 },
    ], held: {}, riding: {} });
  });
  await sleep(700);
}

const boxes = (page) => page.evaluate(() => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; };
  const tl = document.querySelector('[data-role=top-left]'), tr = document.querySelector('[data-role=top-right]');
  const roles = (el) => el ? [...el.querySelectorAll('[data-role]')].map((x) => x.dataset.role).filter((r) => !/-list$/.test(r)) : [];
  const btn = document.querySelector('[data-role=top-left] [data-action=sidebar]');
  const sb = document.querySelector('[data-role=sidebar]');
  const texts = tl ? [...tl.querySelectorAll('.mt-cp')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()) : [];
  return { win: innerWidth, tl: R(tl), tr: R(tr), tlRoles: roles(tl), texts, fit: tl && tl.dataset.fit, btn: R(btn), sidebar: R(sb) };
});

async function hermesIcons(page) {
  return page.evaluate(() => [...document.querySelectorAll('[data-kind=hermes]')].map((e) => {
    const r = e.getBoundingClientRect();
    const where = e.closest('[data-role=sidebar]') ? 'sidebar' : e.closest('[data-role=mission]') ? 'map' : e.closest('.mt-rail') ? 'rail' : e.closest('.react-flow__node') ? 'card' : 'other';
    return { where, tag: e.tagName, src: e.getAttribute('src'), w: Math.round(r.width), ok: e.tagName !== 'IMG' || (e.complete && e.naturalWidth > 0) };
  }));
}

async function pc() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    await fakeInbox(page);
    const sideOpen = () => page.evaluate(() => !!document.querySelector('[data-role=sidebar]'));
    const toggleSide = async (want) => { if ((await sideOpen()) !== want) { await page.click('[data-role=top-left] [data-action=sidebar]'); await sleep(900); } };
    await toggleSide(false);
    for (const lang of ['ko', 'en']) {
      call('settings.set', { key: 'language', value: lang }); await sleep(900);
      await fakeInbox(page);
      for (const [w, h, tag] of [[1600, 1000, 'wide'], [1100, 760, 'mid'], [820, 640, 'narrow']]) {
        await page.setViewportSize({ width: w, height: h }).catch(() => {}); await sleep(1000);
        const b = await boxes(page);
        log(`[${lang} ${tag}] ${JSON.stringify(b)}`);
        if (TAG !== 'before') {
          const want = ['sessions-pill', 'working', 'review', 'decisions', 'inbox', 'problems'];
          check(`[${lang} ${tag}] 왼쪽 차례 세션·작업 중·작업 완료·내 몫·응답 필요·문제`, JSON.stringify(b.tlRoles.filter((r) => want.includes(r))) === JSON.stringify(want), b.tlRoles);
          check(`[${lang} ${tag}] 사이드바 단추가 창 왼쪽 끝(x=0)`, b.btn && b.btn.x === 0, b.btn);
          check(`[${lang} ${tag}] 왼쪽 무리가 오른쪽 무리를 덮지 않음`, b.tl && b.tr && (b.tl.right + 8 <= b.tr.x || b.tl.y >= b.tr.y + b.tr.h + 4), { tl: b.tl, tr: b.tr, fit: b.fit });
          if (tag === 'wide') check(`[${lang}] 글은 이름 수 꼴`, lang === 'ko' ? b.texts.some((x) => /^세션 \d+$/.test(x)) && b.texts.some((x) => x === '작업 중 2') : b.texts.some((x) => /^Sessions \d+$/.test(x)) && b.texts.some((x) => x === 'Working 2'), b.texts);
        }
        await shot(page, `top-${tag}-${lang}`, { clip: { x: 0, y: 0, width: w, height: 70 } });
        if (tag === 'wide') await shot(page, `board-${lang}`);
      }
      // 작업 중 목록 펼침
      await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {}); await sleep(700);
      if (TAG !== 'before') { await page.click('[data-role=working]'); await sleep(600); await shot(page, `working-open-${lang}`, { clip: { x: 0, y: 0, width: 800, height: 300 } }); await page.keyboard.press('Escape'); await sleep(300); }
      // 사이드바를 연 채(판 칸 왼쪽 끝에 붙은 단추)
      await page.setViewportSize({ width: 1400, height: 900 }).catch(() => {}); await sleep(500);
      await toggleSide(true);
      await page.evaluate(() => { const i = document.querySelector('[data-action=unfold-all]'); if (i) i.click(); });
      await sleep(600);
      { const b = await boxes(page); log(`[${lang} sidebar] ${JSON.stringify(b)}`);
        if (TAG !== 'before') check(`[${lang} sidebar] 사이드바를 열면 단추가 사이드바 오른쪽 끝에 붙는다`, b.btn && b.sidebar && Math.abs(b.btn.x - b.sidebar.right) <= 1, { btn: b.btn, sidebar: b.sidebar });
        await shot(page, `sidebar-open-${lang}`);
        await shot(page, `sidebar-top-${lang}`, { clip: { x: 0, y: 0, width: Math.min(1400, (b.sidebar ? b.sidebar.right : 400) + 640), height: 120 } }); }
      // 사이드바를 연 좁은 창(판 칸이 좁아 왼쪽 무리가 아래 줄로)
      await page.setViewportSize({ width: 1000, height: 760 }).catch(() => {}); await sleep(900);
      { const b = await boxes(page); log(`[${lang} sidebar-narrow] ${JSON.stringify(b)}`);
        if (TAG !== 'before') check(`[${lang} sidebar-narrow] 두 무리가 겹치지 않음`, b.tl && b.tr && (b.tl.right + 8 <= b.tr.x || b.tl.y >= b.tr.y + b.tr.h + 4), { tl: b.tl, tr: b.tr, fit: b.fit });
        await shot(page, `top-sidebar-narrow-${lang}`, { clip: { x: 0, y: 0, width: 1000, height: 110 } }); }
      await page.setViewportSize({ width: 1400, height: 900 }).catch(() => {}); await sleep(600);
      if (TAG !== 'before') {
        const sbw = await page.evaluate(() => Math.round(document.querySelector('[data-role=sidebar]').getBoundingClientRect().right));
        const sbClip = { x: 0, y: 0, width: sbw, height: 520 };
        await shot(page, `sidebar-head-${lang}`, sbClip);
        await page.click('[data-role=sidebar] [data-action=fold-all]'); await sleep(700);
        const f = await page.evaluate(() => ({ store: JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' && 'collapsed' in v && 'width' in v; } catch { return false; } })) || '{}').collapsed, rows: [...document.querySelectorAll('[data-role=sidebar] [data-sb]')].map((e) => e.dataset.sb), ws: window.__mt.getState().workspaces.map((w) => w.key), groups: (window.__mt.getState().groups || []).map((g) => g.id) }));
        check(`[${lang}] 모두 접기: 폴더·워크스페이스 전부 접힘 기억`, f.store && f.ws.every((k) => f.store[k] === true) && f.groups.every((g) => f.store[`g:${g}`] === true), f);
        await shot(page, `sidebar-folded-${lang}`, sbClip);
        await page.click('[data-role=sidebar] [data-action=unfold-all]'); await sleep(700);
        const u = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' && 'collapsed' in v && 'width' in v; } catch { return false; } })) || '{}').collapsed);
        check(`[${lang}] 모두 열기: 전부 펼침 기억`, f.ws.every((k) => u[k] === false) && f.groups.every((g) => u[`g:${g}`] === false), u);
        await shot(page, `sidebar-unfolded-${lang}`, sbClip);
      }
      const icons = await hermesIcons(page);
      log(`[${lang}] hermes icons ${JSON.stringify(icons)}`);
      if (TAG !== 'before') {
        // 사이드바 줄에는 어느 종류도 아이콘이 없다(종류 글만). 판 카드 머리와 레일 즐겨찾기 단추를 본다
        check(`[${lang}] Hermes 아이콘: 판 카드·레일에 OMH 그림(로드됨)`, ['card', 'rail'].every((w) => icons.some((i) => i.where === w && i.tag === 'IMG' && /hermes\.png$/.test(i.src) && i.ok)), icons);
      }
      await toggleSide(false);
      // 세션 맵
      await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {}); await sleep(500);
      await page.click('[data-role=sessions-pill]'); await sleep(2500);
      // 세션 맵 카드의 종류 칸은 모든 종류가 글자 표(C, Cx, H)와 이름이다(그림 없음)
      const mi = await page.evaluate(() => [...document.querySelectorAll('[data-role=mission] [data-role=ta-meta]')].map((e) => e.textContent));
      if (TAG !== 'before') check(`[${lang}] 세션 맵 카드에 Hermes 종류(글자 표 H · Hermes)`, mi.some((x) => /HHermes/.test(x)), mi);
      await shot(page, `map-${lang}`);
      await page.click('[data-role=sessions-pill]'); await sleep(800);
      // 카드 가까이: hm1로 가서 찍는다
      const hm = await page.evaluate(() => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === 'hm1'); return s && s.sessionId; });
      if (hm) { await page.evaluate((id) => window.__mt.getState().navigateTo(id), hm); await sleep(1500); await shot(page, `card-hermes-${lang}`); }
      await page.keyboard.press('Escape').catch(() => {}); await sleep(300);
    }
    call('settings.set', { key: 'language', value: 'ko' }); await sleep(500);
  } finally { await closeApp(app); }
}

async function stopAll() {
  for (const n of NAMES) { try { if (sess(n)) log(atrium('kill', n, '--yes')); } catch (e) { log('kill ' + e.message); } }
  try { log(atrium('terminal', 'stop', '--yes')); } catch (e) { log('terminal stop ' + e.message); }
  try { log(atrium('backend', 'stop')); } catch (e) { log('backend stop ' + e.message); }
}

try {
  if (WHAT === 'setup') await setup();
  else if (WHAT === 'pc') await pc();
  else if (WHAT === 'stop') await stopAll();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p302-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
