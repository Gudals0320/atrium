// P28 창 시험: 화면 다듬기. 판: herdr 세션 atrium-dev-p28, 포트 47847, 이 워크트리의 backend/.dev(experiments/p28/tools/env.cjs).
// 시험 폴더는 새로 만든 C:\Workspace\mtask-p28-ws\demo 하나, 세션은 셸 노드만(claude를 띄우지 않는다).
// 사용: node experiments/p28/tools/e2e.cjs p28-polish.mjs [before]
//   before: 바꾸기 전 스크린숏만(멀리·아이콘 얼굴, 가까이 얼굴 색, 명령 입력). 결과 이름 앞에 p28-before-
// 차례: 1 처음 화면(2초 넘게, 중간 장면) → 2 멀리·아이콘 얼굴(셸 노드 여덟에 상태를 창 안에서만 덮어 그린 장면) → 3 캔버스·콘솔 색
//       → 4 명령 입력 너비(기본 창, 최소 창) → 5 Delete 두 번(하나, 여럿; Enter 전에는 지우지 않음, Esc는 취소) → 6 설정 탭(최소 창, 영어·한국어, 스크롤 없음)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { APP_ROOT, REPO, OUT, sleep, until, logger, closeApp } from './harness.mjs';
import { assertTestBoard } from './p9-guard.mjs';

if (process.env.MT_E2E_OUT !== 'p28') throw new Error('MT_E2E_OUT=p28을 명령줄에서 준다');
const BEFORE = process.argv[2] === 'before';
const PRE = BEFORE ? 'p28-before-' : 'p28-';
const T = createRequire(import.meta.url)(path.join(REPO, 'experiments', 'p28', 'tools', 'env.cjs'));
const DIR = T.DIR;
const ENV = Object.fromEntries(Object.entries(T.P28_ENV).filter(([k]) => k.startsWith('ATRIUM_')));
assertTestBoard(ENV, { root: T.DEV });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DIR, { recursive: true });

const log = logger(BEFORE ? 'p28-before' : 'p28-polish');
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)));
const env = { ...cleanEnv(), ...ENV, MT_HERDR_SESSION: ENV.ATRIUM_HERDR_SESSION };
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env, timeout: 180000 });
const call = (page, m, p = {}) => page.evaluate(([mm, pp]) => window.__mt.api.call(mm, pp), [m, p]);
const sess = (page, name) => page.evaluate((n) => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === n); return s ? { id: s.sessionId, state: s.state } : null; }, name);

const results = [];
const step = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); log(`${ok ? '통과' : '실패'} ${name}`, detail ?? ''); };
const shot = async (page, name) => { const f = path.join(OUT, `${PRE}${name}.png`); await page.screenshot({ path: f }); log('스크린숏', path.relative(REPO, f)); };
const size = async (app, w, h) => { await app.evaluate(({ BrowserWindow }, [ww, hh]) => BrowserWindow.getAllWindows()[0].setContentSize(ww, hh), [w, h]); await sleep(700); };

// 장면의 셸 노드 여덟(4×2). 상태·종류·글은 창 안에서만 덮는다(백엔드 판 기록은 셸 그대로). 얼굴의 생김새만 보는 장면이다
const SCENE = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];
const MOCK = {
  a1: { kind: 'claude', state: 'working', lastPrompt: 'Refactor the session store and add tests', lastAnswer: 'Working on store.js — 3 of 5 steps done' },
  a2: { kind: 'claude', state: 'waiting', ask: { since: Date.now() - 95000, question: 'Allow edit to backend/src/store.mjs?', toolUseId: 'p28-ask' }, lastPrompt: 'Fix the flaky reconnect test', lastAnswer: 'I found the race in reconnect()' },
  a3: { kind: 'claude', state: 'ready', unseen: true, lastPrompt: 'Summarize the PR comments', lastAnswer: 'Three comments asked for clearer names; one asked for a test' },
  a4: { kind: 'claude', state: 'ready', lastActivityAt: Date.now() - 3 * 3600 * 1000, lastPrompt: 'Write the release notes', lastAnswer: 'Done. Release notes are in docs/release.md' },
  a5: { kind: 'claude', state: 'sleeping', sleep: { at: Date.now() - 50 * 60000, memMB: 412 }, lastPrompt: 'Look into the font loading delay', lastAnswer: 'Fonts load in 120ms; the delay is the backend handshake' },
  a6: { kind: 'codex', state: 'working', lastPrompt: 'Port the tray menu to the new API', lastAnswer: 'Updating tray.mjs' },
  a7: { kind: 'shell', state: 'shell_running', shell: { command: 'npm test' } },
  a8: { kind: 'claude', state: 'error', lastPrompt: 'Deploy the preview build', lastAnswer: 'API error: overloaded' },
};
const applyMock = (page) => page.evaluate((mock) => {
  const st = window.__mt.getState();
  const next = new Map(st.sessions);
  for (const s of st.sessions.values()) if (mock[s.name]) next.set(s.sessionId, { ...s, ...mock[s.name], lastActivityAt: mock[s.name].lastActivityAt || Date.now() });
  st.sessions = next;
  window.__mt.setDebugThrow(null); // 다시 그리게 한다
}, MOCK);
async function view(page, zoom) {
  await page.evaluate((z) => {
    const st = window.__mt.getState();
    const ids = [...st.sessions.values()].filter((s) => /^a\d$/.test(s.name)).map((s) => s.sessionId);
    const rs = ids.map((id) => st.nodes.get(id)).filter(Boolean);
    const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)), x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
    const el = document.querySelector('.mt-canvas');
    st.setViewport({ x: el.clientWidth / 2 - ((x0 + x1) / 2) * z, y: el.clientHeight / 2 - ((y0 + y1) / 2) * z, zoom: z });
  }, zoom);
  await sleep(900);
}
async function viewNode(page, n, px) {
  await page.evaluate(([nn, w]) => {
    const st = window.__mt.getState();
    const s = [...st.sessions.values()].find((x) => x.name === nn);
    const r = st.nodes.get(s.sessionId);
    const el = document.querySelector('.mt-canvas');
    const zoom = w / r.w;
    st.setViewport({ x: el.clientWidth / 2 - (r.x + r.w / 2) * zoom, y: el.clientHeight / 2 - (r.y + r.h / 2) * zoom, zoom });
  }, [n, px]);
  await sleep(900);
}
// 터미널에 들어가지 않고 고른다(Ctrl+누르기). 그 전에 초점을 뺀다
async function pick(page, names) {
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await page.evaluate(() => window.__mt.getState().clearSelection()); await sleep(200);
  for (const n of names) {
    const head = page.locator(`.mt-node[data-name="${n}"] .mt-node-name`).first();
    await head.click({ modifiers: ['Control'] });
    await sleep(250);
  }
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  return page.evaluate(() => window.__mt.getState().selected.map((id) => window.__mt.getState().sessions.get(id).name));
}
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), cx: Math.round(r.left + r.width / 2) }; }, sel);
const overlap = (a, b) => !!(a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b);

async function launch({ splash = false } = {}) {
  const t0 = Date.now();
  const app = await electron.launch({ args: ['.', '--dev'], cwd: APP_ROOT, env, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') log(`[console.error] ${m.text().slice(0, 300)}`); });
  let sp = null;
  if (splash) {
    // 처음 화면: 판을 받은 때와 처음 화면이 사라진 때(창 안 시계, performance.now)를 잰다. 중간 장면을 몇 장 찍는다
    const frames = [];
    const seen = await until(() => page.evaluate(() => !!document.querySelector('[data-role="splash"]')).catch(() => false), 20000, 30);
    const seenAt = await page.evaluate(() => performance.now());
    for (const at of [300, 800, 1300, 1800]) {
      const now = await page.evaluate(() => performance.now());
      if (now < at) await sleep(at - now);
      const st = await page.evaluate(() => { const s = document.querySelector('[data-role="splash"]'); const lit = s && s.querySelector('.mt-splash-lit'); return { now: Math.round(performance.now()), there: !!s, loaded: window.__mt && window.__mt.getState().boardLoaded, clip: lit ? getComputedStyle(lit).webkitMaskPosition || getComputedStyle(lit).maskPosition : null, op: lit ? getComputedStyle(lit).opacity : null, imgs: s ? s.querySelectorAll('img').length : 0 }; });
      frames.push(st);
      if (st.there) await shot(page, `01-splash-${at}`);
    }
    const loadedAt = await until(() => page.evaluate(() => (window.__mt && window.__mt.getState().boardLoaded ? performance.now() : null)), 90000, 20).catch(() => null);
    const goneAt = await until(() => page.evaluate(() => (document.querySelector('[data-role="splash"]') ? null : performance.now())), 20000, 20).catch(() => null);
    sp = { seen: !!seen, seenAt: Math.round(seenAt), loadedAt: Math.round(loadedAt), goneAt: Math.round(goneAt), frames, launchMs: Date.now() - t0 };
  }
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await size(app, 1584, 921);
  return { app, page, sp };
}

try { log('앞 판 백엔드 끄기(지금 코드로 띄우게)', atrium('backend', 'stop').trim()); } catch (e) { log('백엔드 끄기 실패', e.message); }
// 백엔드를 먼저 띄워 둔다(처음 화면이 판을 빨리 받아도 2초 보이는지 본다)
try { log('백엔드 띄우기', atrium('backend', 'start').trim().split('\n')[0]); } catch (e) { log('백엔드 띄우기 실패', e.message); }
let { app, page, sp } = await launch({ splash: !BEFORE });
try {
  await call(page, 'settings.set', { key: 'language', value: 'en' });
  await call(page, 'settings.set', { key: 'sleepAfterMin', value: 0 });
  await call(page, 'workspace.open', { path: DIR });
  if (sp) {
    step('1 처음 화면이 2초 넘게 보이고(판을 먼저 받아도) 애니메이션이 돈다', sp.seen && sp.goneAt && sp.loadedAt && sp.goneAt - sp.seenAt >= 2000 && sp.loadedAt < sp.goneAt && sp.frames.filter((f) => f.there).length >= 3 && new Set(sp.frames.map((f) => f.clip)).size >= 3, sp);
  }

  // 0. 셸 노드 여덟(장면)과 Delete 시험용 셋. 4×2 격자
  for (const n of [...SCENE, 'd1', 'd2', 'd3']) if (!(await sess(page, n))) atrium('spawn', DIR, '--name', n, '--kind', 'shell');
  await until(async () => { for (const n of [...SCENE, 'd1', 'd2', 'd3']) if (!(await sess(page, n))) return false; return true; }, 60000, 300);
  for (const [i, n] of SCENE.entries()) {
    const s = await sess(page, n);
    await call(page, 'board.setNode', { session: s.id, x: (i % 4) * 860, y: Math.floor(i / 4) * 600, w: 720, h: 460, cause: 'p28 test' });
  }
  for (const [i, n] of ['d1', 'd2', 'd3'].entries()) {
    const s = await sess(page, n);
    await call(page, 'board.setNode', { session: s.id, x: i * 860, y: 1500, w: 720, h: 460, cause: 'p28 test' });
  }
  await sleep(1500);
  // 셸에 글을 조금 띄워 둔다(가까이 얼굴의 콘솔 색)
  try { atrium('input', 'a7', 'echo P28 console colors && dir\\r'); } catch (e) { log('셸 보내기', e.message.split('\n')[0]); }

  // 2. 멀리·아이콘 얼굴
  await applyMock(page);
  await view(page, 0.24); await applyMock(page); await sleep(500);
  const far = await page.evaluate(() => [...document.querySelectorAll('.mt-node')].filter((n) => /^a\d$/.test(n.dataset.name)).map((n) => ({ name: n.dataset.name, face: n.dataset.face, opacity: getComputedStyle(n).opacity, filter: getComputedStyle(n).filter })));
  await shot(page, '02-far');
  await view(page, 0.15); await applyMock(page); await sleep(500);
  const icon = await page.evaluate(() => [...document.querySelectorAll('.mt-node')].filter((n) => /^a\d$/.test(n.dataset.name)).map((n) => { const k = n.querySelector('.mt-kind-icon'); const nm = n.querySelector('[data-role="icon-name"]'); return { name: n.dataset.name, face: n.dataset.face, opacity: getComputedStyle(n).opacity, iconOpacity: k ? getComputedStyle(k).opacity : null, nameColor: nm ? getComputedStyle(nm).color : null }; }));
  await shot(page, '03-icon');
  await view(page, 0.09); await applyMock(page); await sleep(500);
  await shot(page, '03b-icon-small');
  if (!BEFORE) {
    const solid = (xs) => xs.every((x) => Number(x.opacity) === 1 && (!x.filter || x.filter === 'none'));
    step('2a 멀리 얼굴: 쉬는(a4)·잠든(a5) 노드도 노드 전체를 흐리게 하지 않는다', far.every((x) => x.face === 'far') && solid(far), far);
    step('2b 아이콘 얼굴: 노드·로고를 흐리게 하지 않는다', icon.every((x) => x.face === 'icon' && Number(x.opacity) === 1 && (x.iconOpacity == null || Number(x.iconOpacity) === 1)), icon);
  } else log('멀리', far), log('아이콘', icon);

  // 3. 캔버스·콘솔 색(가까이 얼굴)
  await page.evaluate(() => window.__mt.getState().setViewport({ x: 0, y: 0, zoom: 1 }));
  await viewNode(page, 'a7', 900);
  await sleep(1200);
  const colors = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); const g = (k) => cs.getPropertyValue(k).trim(); return { canvas: g('--canvas'), dot: g('--canvas-dot'), conBg: g('--con-bg'), conHead: g('--con-head'), termBg: g('--term-bg'), termText: g('--term-text'), panel: g('--panel'), chrome: g('--chrome-bg') }; });
  log('색', colors);
  await shot(page, '04-colors');
  if (!BEFORE) {
    const lum = (hex) => { const v = hex.replace('#', ''); const c = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const ratio = +contrast(colors.termText, colors.termBg).toFixed(2);
    step('3 캔버스는 검정에 가깝고(#0f0f0b보다 어둡다) 콘솔 바탕·머리는 조금 어둡다, 터미널 글 대비 유지', lum(colors.canvas) < lum('#0f0f0b') && lum(colors.conBg) < lum('#171912') && lum(colors.conHead) <= lum('#0d0c0a') && colors.panel === '#161412' && colors.chrome === '#151510' && ratio >= 14, { ...colors, ratio });
  }

  // 4. 명령 입력 너비
  await view(page, 0.24);
  for (const [w, h] of [[1584, 921], [900, 600]]) {
    await size(app, w, h);
    const r = { cmd: await rect(page, '.mt-cmd'), chips: await rect(page, '[data-role="chips"]'), zoom: await rect(page, '[data-role="zoom"]'), left: await rect(page, '[data-role="rail-left"]'), right: await rect(page, '[data-role="rail-right"]'), stage: await rect(page, '.mt-stage') };
    await shot(page, `05-command-${w}`);
    if (!BEFORE) step(`4 명령 입력 너비(${w}×${h}): 화면의 절반 넘게, 칩 줄과 가운데가 같고 줌 알약·레일과 겹치지 않는다`, r.cmd.w >= Math.min(560, r.stage.w - 330) && (w < 1200 || r.cmd.w >= r.stage.w * 0.5) && Math.abs(r.cmd.cx - r.chips.cx) <= 2 && !overlap(r.cmd, r.zoom) && !overlap(r.cmd, r.left) && !overlap(r.cmd, r.right), r);
    else log(`명령 입력 ${w}`, r);
  }
  await size(app, 1584, 921);
  if (BEFORE) throw Object.assign(new Error('before 끝'), { done: true });

  // 5. Delete 두 번
  // 하나는 머리줄의 X가 보이는 배율(0.7 이상)에서 노드 안 확인으로 본다
  await viewNode(page, 'd1', 640);
  const armed = () => page.evaluate(() => { const a = document.activeElement; return { focus: a ? a.dataset.action || a.tagName : null, armed: [...document.querySelectorAll('[data-action="close-delete"].armed')].length, confirms: document.querySelectorAll('[data-role="kill-confirm"]').length, dialog: !!document.querySelector('[data-role="close-dialog"]') }; });
  // 하나
  let sel = await pick(page, ['d1']);
  await page.keyboard.press('Delete');
  await page.waitForSelector('.mt-node[data-name="d1"] [data-role="kill-confirm"]', { timeout: 5000 });
  const a0 = await armed();
  await page.keyboard.press('Delete');
  await sleep(600);
  const a1 = await armed();
  await shot(page, '06-delete-armed-one');
  await sleep(800);
  const stillOne = !!(await sess(page, 'd1'));
  step('5a 하나: Delete → 닫기 확인, 한 번 더 Delete → 삭제 단추에 초점과 표시, 아직 지우지 않는다', sel.length === 1 && a0.confirms === 1 && a0.armed === 0 && a1.focus === 'close-delete' && a1.armed === 1 && stillOne, { sel, a0, a1, stillOne });
  await page.keyboard.press('Escape');
  await sleep(500);
  const a2 = await armed();
  step('5b Esc는 취소(확인이 닫히고 세션은 그대로)', a2.confirms === 0 && !!(await sess(page, 'd1')), a2);
  sel = await pick(page, ['d1']);
  await page.keyboard.press('Delete');
  await page.waitForSelector('.mt-node[data-name="d1"] [data-role="kill-confirm"]', { timeout: 5000 });
  await page.keyboard.press('Delete');
  await sleep(300);
  await page.keyboard.press('Enter');
  const goneOne = await until(async () => !(await sess(page, 'd1')), 30000, 300);
  step('5c 하나: Delete, Delete, Enter → 삭제', !!goneOne, { sel });
  // 여럿(창 가운데 확인창)
  await viewNode(page, 'd2', 420);
  sel = await pick(page, ['d2', 'd3']);
  await page.keyboard.press('Delete');
  await page.waitForSelector('[data-role="close-dialog"]', { timeout: 5000 });
  const m0 = await armed();
  await page.keyboard.press('Delete');
  await sleep(500);
  const m1 = await armed();
  await shot(page, '07-delete-armed-many');
  await sleep(800);
  const stillMany = !!(await sess(page, 'd2')) && !!(await sess(page, 'd3'));
  step('5d 여럿: 한 확인창, 한 번 더 Delete → 삭제 단추에 초점과 표시, 아직 지우지 않는다', sel.length === 2 && m0.dialog && m0.armed === 0 && m1.focus === 'close-delete' && m1.armed === 1 && stillMany, { sel, m0, m1, stillMany });
  await page.keyboard.press('Escape');
  await sleep(500);
  const m2 = await armed();
  step('5e 여럿: Esc는 취소', !m2.dialog && !!(await sess(page, 'd2')) && !!(await sess(page, 'd3')), m2);
  sel = await pick(page, ['d2', 'd3']);
  await page.keyboard.press('Delete');
  await page.waitForSelector('[data-role="close-dialog"]', { timeout: 5000 });
  await page.keyboard.press('Delete');
  await sleep(300);
  await page.keyboard.press('Enter');
  const goneMany = await until(async () => !(await sess(page, 'd2')) && !(await sess(page, 'd3')), 30000, 300);
  step('5f 여럿: Delete, Delete, Enter → 모두 삭제', !!goneMany, { sel });

  // 6. 설정 탭: 최소 창, 영어·한국어. 대화상자와 그 안 어디에도 스크롤이 없다
  const scrolls = () => page.evaluate(() => {
    const m = document.querySelector('[data-role="settings"]');
    const over = [m, ...m.querySelectorAll('*')].filter((e) => { const cs = getComputedStyle(e); return (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(cs.overflowY)) || (e.scrollWidth > e.clientWidth + 1 && /(auto|scroll)/.test(cs.overflowX)); }).map((e) => `${e.className || e.tagName} ${e.scrollHeight}/${e.clientHeight}`);
    const r = m.getBoundingClientRect();
    const body = m.querySelector('.mt-set-body').getBoundingClientRect();
    // 본문 칸(overflow hidden) 밖으로 나가 잘린 것: 입력, 이름, 풀이, 단락
    const clipped = [...m.querySelectorAll('.mt-set-body input, .mt-set-body select, .mt-set-body button, .mt-set-name, .mt-set-hint, .mt-set-note, .mt-set-sub')].filter((e) => { const q = e.getBoundingClientRect(); return q.width && (q.right > body.right + 1 || q.bottom > body.bottom + 1 || q.left < body.left - 1); }).map((e) => e.dataset.field || e.textContent.slice(0, 24));
    const out = r.bottom > innerHeight || r.right > innerWidth || r.top < 0;
    return { over, clipped, out, mh: Math.round(r.height), vh: innerHeight, mw: Math.round(r.width), brand: !!m.querySelector('.mt-modal-brand, img:not(.mt-ln-ico img)') }; // P33: 호출자 탭의 하네스 로고는 텍스트 로고가 아니다
  });
  const allOk = [];
  for (const lang of ['en', 'ko']) {
    await call(page, 'settings.set', { key: 'language', value: lang });
    for (const [w, h] of [[900, 600], [1584, 921]]) {
      await size(app, w, h);
      await page.click('[data-role="top-right"] [data-action="settings-open"]');
      await page.waitForSelector('[data-role="settings"] [data-role="settings-tabs"]', { timeout: 5000 });
      const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-role="settings-tabs"] [data-tab]')].map((b) => b.dataset.tab));
      for (const tab of tabs) {
        await page.click(`[data-role="settings-tabs"] [data-tab="${tab}"]`);
        await sleep(250);
        const s = await scrolls();
        allOk.push({ lang, w, tab, ...s });
        if (w === 900) await shot(page, `08-settings-${lang}-${tab}`);
      }
      await page.click('[data-action="settings-close"]');
      await sleep(300);
    }
  }
  const bad = allOk.filter((x) => x.over.length || x.clipped.length || x.out || x.brand);
  step('6 설정: 탭마다 스크롤·잘림 없음(최소 창·기본 창, 영어·한국어), 텍스트 로고 없음', allOk.length >= 24 && !bad.length, { count: allOk.length, tabs: [...new Set(allOk.map((x) => x.tab))], bad, sample: allOk.filter((x) => x.w === 900).map((x) => `${x.lang}/${x.tab} ${x.mh}/${x.vh}`) });
  await size(app, 1584, 921);
} catch (e) {
  if (!e.done) { log('오류', e.stack || e.message); results.push({ name: '시험 오류', ok: false, detail: e.message }); }
} finally {
  // 시험 세션 정리(셸): 장면 노드와 남은 d*
  for (const n of [...SCENE, 'd1', 'd2', 'd3']) { try { if (await sess(page, n)) atrium('kill', n, '--yes'); } catch (e) { log('kill', n, e.message.split('\n')[0]); } }
  await closeApp(app);
}
fs.writeFileSync(path.join(OUT, `${BEFORE ? 'p28-before' : 'p28-polish'}.json`), JSON.stringify(results, null, 2));
const pass = results.filter((r) => r.ok).length;
log(`결과 ${pass}/${results.length}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
