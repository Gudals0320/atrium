// P307 창 시험: 휴대폰 목표 레인(세션 맵 폴더 머리 칩 → 아래 시트 → 레인 → 체크, 할 일 시트의 목표 판 → 그 레인, 가볍게 열림이면 칩 없음)과 관리자 알림(다음 메시지와).
// 판: 따로 띄운 개발용 판(atrium-dev-p307, 48057, backend/.dev)만. 휴대폰 흉내 프록시 48307. 한 번에 브라우저 하나(WebKit, 진짜 터치).
// 장면: 폴더 a에 haiku 리드 lead1과 레인 둘(수집: 관리자 lead1, 결제: 관리자 없음) → 칩 "레인 2". 폴더 b에 셸 sh1과 레인 하나(문서) → 칩 "문서 M1 0/2".
// 실행: node app/test/e2e/p307-phone.mjs <setup|phone|stop> [round]   결과는 워크트리의 experiments/p307/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'phone';
const TAG = process.argv[3] || 'r1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p307', TAG);
const BOARD = 'atrium-dev-p307', PORT = '48057', SIM = 48307;
const FOLDERS = ['C:\\Workspace\\mtask-p307-a', 'C:\\Workspace\\mtask-p307-b'];
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p307', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p307-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p307-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const sess = (n) => call('session.list').find((s) => s.name === n);
async function waitFor(fn, ms = 120000, every = 1500) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(every); } }
const wsKey = (f) => { const wl = call('workspace.list'); return (wl.workspaces.find((w) => path.resolve(w.root || w.path || '').toLowerCase() === path.resolve(f).toLowerCase()) || {}).key; };
const lanes = () => call('plan.list', { all: true }).plans;
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));

const DOC_A = { version: 1, goal: '작은 온실의 물주기 기록을 손으로 적지 않게 한다. 센서 값이 표에 스스로 쌓이고 사람은 주말에 한 번만 훑어본다.',
  metrics: [{ name: '손으로 적는 칸', target: '0', now: '4', unit: '칸' }, { name: '하루 기록 시간', target: '2분', now: '12분' }, { name: '놓친 기록', target: '0', now: '3', unit: '회/주' }],
  focus: 'M2', milestones: [
    { code: 'M1', title: '센서 값 받기', state: 'done', items: [{ text: '센서 연결', who: 'head', done: { by: 'lead1', at: Date.now() - 864e5 } }] },
    { code: 'M2', title: '물주기 기록 자동 채우기', purpose: '센서가 보낸 값을 사람이 옮겨 적지 않고 표가 스스로 찬다', doneWhen: '일주일 기록이 손대지 않고 표에 다 남는다', state: 'open', items: [
      { text: '센서 값을 기록 표에 매핑', who: 'head', done: { by: 'lead1', at: Date.now() - 36e5 } },
      { text: '온실 PC에 수집기 설치', who: 'user', note: '설치 확인은 화요일', done: null },
      { text: '일주일 동안 기록을 손대지 않고 둔다', who: 'user', note: '주말부터', done: null },
      { text: '빠진 값 알림 초안', who: 'head', done: null },
      { text: '기록 양식 마지막 확인', who: 'user', done: null }] },
    { code: 'M3', title: '빠진 값 알림', state: 'open', items: [{ text: '알림 문구', who: 'head', done: null }, { text: '알림 받아 보기', who: 'user', done: null }] },
    { code: 'M4', title: '정리', state: 'open', items: [] }] };
const DOC_B = { version: 1, goal: '주문 메일이 빠짐없이 나간다', metrics: [], focus: 'M1', milestones: [{ code: 'M1', title: '주문 메일', state: 'open', items: [{ text: '메일 틀 만들기', who: 'head', done: null }, { text: '주문 메일 샘플 3통을 실제 메일함에서 확인', who: 'user', done: null }] }] };
const DOC_C = { version: 1, goal: '사용 설명서를 새로 쓴다', metrics: [], focus: 'M1', milestones: [{ code: 'M1', title: '목차', state: 'open', items: [{ text: '목차 초안', who: 'head', done: null }, { text: '목차 읽어 보기', who: 'user', done: null }] }] };

async function setup() {
  for (const f of FOLDERS) { fs.mkdirSync(f, { recursive: true }); fs.writeFileSync(path.join(f, 'README.md'), '# ' + path.basename(f) + '\n'); }
  log(atrium('backend', 'start').slice(0, 300));
  await sleep(1500);
  if (!sess('lead1')) log(atrium('spawn', FOLDERS[0], '--name', 'lead1', '--model', 'haiku'));
  if (!sess('sh1')) log(atrium('spawn', FOLDERS[1], '--name', 'sh1', '--kind', 'shell'));
  const s = await waitFor(() => { const x = sess('lead1'); return x && !['starting'].includes(x.state) && x; }, 120000, 2000);
  check('lead1이 떴다', s && s.state !== 'trust_wait', s && s.state);
  if (s && s.state === 'trust_wait') fs.writeFileSync(path.join(DEV, 'p307-need-trust.txt'), `lead1: ${FOLDERS[0]} 신뢰 질문\n`);
  const ka = wsKey(FOLDERS[0]), kb = wsKey(FOLDERS[1]);
  for (const [k, n, d] of [[ka, '수집', DOC_A], [ka, '결제', DOC_B], [kb, '문서', DOC_C]]) if (!lanes().find((l) => l.name === n)) log(JSON.stringify(call('plan.import', { workspace: k, new: n, doc: JSON.stringify(d) })).slice(0, 200));
  const A = lanes().find((l) => l.name === '수집');
  call('plan.owner', { planId: A.planId, session: 'lead1' });
  call('settings.set', { key: 'planNotify', value: 'next' });
  log(lanes().map((l) => `#${l.no} ${l.name} ${l.status} ${l.owner ? l.owner.name : '-'} ${l.summary.focus ? l.summary.focus.code + ' ' + l.summary.focus.done + '/' + l.summary.focus.total : ''}`).join('\n'));
  check('장면: 레인 셋(수집 관리자 lead1)', lanes().length === 3 && lanes().find((l) => l.name === '수집').owner.name === 'lead1');
}

// ---- 휴대폰 ----
const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
async function withSim(fn) {
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  try { return await fn(); } finally { sim.close && sim.close(); }
}
async function pair(pg) {
  await pg.goto(`http://localhost:${SIM}/`);
  await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
  await pg.fill('[data-field=pair-code]', call('device.code').code);
  await pg.click('[data-action=pair-submit]');
  await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
  await sleep(800);
}
const fastCrash = (up = 3000) => { const t = Date.now() - 20000; return JSON.stringify({ v: 1, cur: { boot: t, alive: t + up, clean: false, light: false, retryBoot: false, mode: 'board', level: 0, view: 'map', phone: true }, crashes: [], light: false, retry: null, level: 0, ok: false, sent: null, by: 'touch' }); };
async function openMap(ctx, { crumbs = null } = {}) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.addInitScript((c) => { try { localStorage.removeItem('mt.crumbs'); if (c) localStorage.setItem('mt.crumbs', c); localStorage.removeItem('atrium.phoneMap.view'); localStorage.setItem('mt.phoneInstallTip', '0'); } catch {} }, crumbs);
  await pg.goto(`http://localhost:${SIM}/`);
  await pg.waitForFunction(() => document.querySelector('.mt-pmap .mt-ta-card') && window.__mtPm && window.__mtPm.lay(), null, { timeout: 60000 });
  await sleep(1500);
  return { pg, errs };
}
// 워크스페이스 줄 머리가 화면 폭에 차게 보기를 옮긴다
async function zoomRow(pg, key) {
  return pg.evaluate((k) => {
    const L = window.__mtPm.lay(), s = window.__mtPm.size(), r = L.rows.find((x) => x.key === k);
    if (!r) return null;
    const kk = Math.min(1.2, (s.w - 12) / r.w);
    window.__mtPm.set({ k: kk, x: 6 - r.x * kk, y: 16 - r.y * kk });
    return { k: kk };
  }, key);
}
const chipsOf = (pg) => pg.evaluate(() => [...document.querySelectorAll('[data-role=pp-chip]')].map((e) => ({ ws: e.dataset.ws, n: e.dataset.count, folded: e.dataset.folded || null, user: e.dataset.userLeft || null, text: e.textContent })));
const sheetOf = (pg) => pg.evaluate(() => { const s = document.querySelector('[data-role=pp-sheet]'); if (!s) return null; const p = s.querySelector('.mt-pp-panel').getBoundingClientRect();
  return { mode: s.dataset.mode, plan: s.dataset.plan || null, h: Math.round(p.height), vh: innerHeight, rows: [...s.querySelectorAll('[data-action=pp-lane]')].map((e) => e.textContent), goal: (s.querySelector('[data-role=pp-goal]') || {}).textContent || null,
    goalLines: (() => { const g = s.querySelector('[data-role=pp-goal]'); return g ? Math.round(g.getBoundingClientRect().height / parseFloat(getComputedStyle(g).lineHeight)) : null; })(),
    metrics: s.querySelectorAll('[data-role=pp-metric]').length, metricsScroll: (() => { const m = s.querySelector('[data-role=pp-metrics]'); return m ? m.scrollWidth > m.clientWidth : null; })(),
    steps: [...s.querySelectorAll('[data-action=pp-step]')].map((e) => e.textContent), items: [...s.querySelectorAll('[data-role=pp-item]')].map((e) => e.dataset.item + ':' + e.dataset.who + (e.dataset.done ? ':done' : '')),
    box: (() => { const c = s.querySelector('[data-action=pp-check]'); if (!c) return null; const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(), overflowX: document.documentElement.scrollWidth > innerWidth }; });

async function phone() {
  const pw = await import('playwright');
  const ka = wsKey(FOLDERS[0]), kb = wsKey(FOLDERS[1]);
  const A = lanes().find((l) => l.name === '수집'), B = lanes().find((l) => l.name === '결제');
  const reset = () => { call('settings.set', { key: 'planNotify', value: 'off' }); call('plan.op', { planId: A.planId, op: { op: 'uncheck', ids: ['M2.2', 'M2.3', 'M2.4', 'M2.5'] } }); call('plan.op', { planId: A.planId, op: { op: 'focus', code: 'M2' } }); call('plan.op', { planId: A.planId, op: { op: 'metricNow', metric: '손으로 적는 칸', now: '4' } }); call('settings.set', { key: 'planNotify', value: 'next' }); };
  await withSim(async () => {
    const browser = await pw.webkit.launch({ headless: true });
    try {
      let first = true;
      for (const [W, H] of [[390, 844], [320, 568]]) for (const lang of ['ko', 'en']) {
        reset();
        call('settings.set', { key: 'language', value: lang });
        const tag = `${lang}-${W}`;
        const ctx = await browser.newContext({ viewport: { width: W, height: H }, screen: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: lang === 'ko' ? 'ko-KR' : 'en-US' });
        const p0 = await ctx.newPage(); await pair(p0); await p0.close();
        // 0) 가볍게 열림(빠른 죽음 뒤)에서는 칩이 없다
        if (W === 390) {
          const { pg, errs } = await openMap(ctx, { crumbs: fastCrash() });
          const lite = await pg.evaluate(() => !!document.querySelector('[data-role=pm-lite]'));
          const n = (await chipsOf(pg)).length;
          check(`[${tag}] 가볍게 열림이면 폴더 머리 칩 없음`, lite && n === 0 && !errs.length, { lite, n, errs });
          await pg.click('[data-action=pm-lite-all]').catch(() => {}); await sleep(1200);
          check(`[${tag}] 전부 보기 뒤에는 칩`, (await chipsOf(pg)).length === 2);
          await pg.goto('about:blank'); await pg.close();
        }
        const { pg, errs } = await openMap(ctx);
        // 1) 폴더 머리 칩
        const chips = await chipsOf(pg);
        const ca = chips.find((c) => c.ws === ka), cb = chips.find((c) => c.ws === kb);
        check(`[${tag}] 폴더 머리 칩: 레인 둘이면 "레인 2"(사용자 점), 하나면 "문서 M1 0/2"`, ca && ca.folded === '1' && ca.n === '2' && /2/.test(ca.text) && ca.user === '4' && cb && !cb.folded && cb.text === '문서 M1 0/2' && cb.user === '1', chips);
        await zoomRow(pg, ka); await sleep(700);
        const head = await pg.evaluate((k) => { const e = document.querySelector(`[data-role=ta-isle][data-key="${k}"] [data-role=pm-whead]`); const r = e.getBoundingClientRect(); const c = e.querySelector('[data-role=pp-chip]').getBoundingClientRect(); return { r: [r.x, r.y, r.width, r.height], c: [c.x, c.y, c.width, c.height], inside: c.right <= innerWidth + 1 }; }, ka);
        check(`[${tag}] 칩은 폴더 머리 오른쪽 끝(화면 안)`, head.inside && head.c[0] + head.c[2] >= head.r[0] + head.r[2] - 30, head);
        await shot(pg, `${tag}-1-map`, { clip: { x: 0, y: 0, width: W, height: Math.min(H, 420) } });
        // 2) 칩 누르기(진짜 터치) → 레인 목록
        await pg.tap(`[data-role=pp-chip][data-ws="${ka}"]`); await sleep(700);
        let sh = await sheetOf(pg);
        check(`[${tag}] 칩을 누르면 아래 시트(약 86vh)에 레인 목록 둘`, sh && sh.mode === 'list' && sh.rows.length === 2 && Math.abs(sh.h - sh.vh * 0.86) < 4 && !sh.overflowX, sh);
        await shot(pg, `${tag}-2-list`);
        // 3) 레인 → 목표, 측정값 가로 넘김, 계단, focus 체크리스트(36px)
        await pg.tap(`[data-action=pp-lane][data-plan="${A.planId}"]`); await sleep(900);
        sh = await sheetOf(pg);
        check(`[${tag}] 레인 시트: 목표 두 줄 말줄임, 측정값 셋(가로 넘김), 계단 넷, M2 항목 다섯, 누를 칸 36px`, sh && sh.mode === 'lane' && String(sh.plan) === String(A.planId) && sh.goalLines <= 2 && sh.metrics === 3 && sh.metricsScroll && sh.steps.length === 4 && sh.items.length === 5 && sh.box && sh.box[0] === 36 && sh.box[1] === 36 && !sh.overflowX, sh);
        await shot(pg, `${tag}-3-lane`);
        // 사용자 것만
        await pg.tap('[data-action=pp-user-only]'); await sleep(400);
        const uo = (await sheetOf(pg)).items;
        check(`[${tag}] 사용자 것만: 사용자 항목 셋`, uo.length === 3 && uo.every((x) => /:user/.test(x)), uo);
        if (first) await shot(pg, `${tag}-3b-user-only`);
        await pg.tap('[data-action=pp-user-only]'); await sleep(300);
        // 4) 체크
        const T0 = Date.now();
        await pg.tap('[data-role=pp-item][data-item="M2.3"] [data-action=pp-check]'); await sleep(1200);
        sh = await sheetOf(pg);
        const v = call('plan.get', { planId: A.planId });
        const d = v.doc.milestones.find((m) => m.code === 'M2').items.find((x) => x.id === 'M2.3').done;
        check(`[${tag}] 체크: 시트와 판이 같은 항목(사람, via remote)`, sh.items.includes('M2.3:user:done') && d && d.by === 'user' && d.via === 'remote', { items: sh.items, d });
        await pg.evaluate(() => { const b = document.querySelector('[data-role=pp-body], .mt-pp-body'); if (b) b.scrollTop = 0; });
        await shot(pg, `${tag}-4-checked`);
        // 칩도 바뀐다(사용자 남음 4 → 3)
        const ca2 = (await chipsOf(pg)).find((c) => c.ws === ka);
        check(`[${tag}] 체크 뒤 폴더 머리 칩의 사용자 수가 준다`, ca2 && ca2.user === '3', ca2);
        // focus 바꾸기와 측정값 지금 값(한 번만)
        if (first) {
          await pg.tap('[data-action=pp-step][data-ms="M3"]'); await sleep(400);
          await pg.tap('[data-action=pp-focus]'); await sleep(900);
          const f = call('plan.get', { planId: A.planId }).doc.focus;
          check(`[${tag}] 지금으로: focus M3`, f === 'M3', f);
          call('settings.set', { key: 'planNotify', value: 'off' }); call('plan.op', { planId: A.planId, op: { op: 'focus', code: 'M2' } }); call('settings.set', { key: 'planNotify', value: 'next' });
          await sleep(600);
          await pg.tap('[data-role=pp-metric] [data-action=pp-metric-now]'); await sleep(300);
          await pg.fill('[data-field=pp-metric-now]', '2'); await pg.press('[data-field=pp-metric-now]', 'Enter'); await sleep(900);
          const mv = call('plan.get', { planId: A.planId }).doc.metrics[0].now;
          check(`[${tag}] 측정값 지금 값 고치기`, mv === '2', mv);
          // 알림: 곧바로 가지 않고 lead1의 다음 메시지 앞에
          const dl = () => call('delivery.list', { limit: 40 }).filter((x) => (x.createdAt || 0) >= T0);
          check('바뀐 뒤 곧바로 보내지 않는다(다음 메시지와)', !dl().some((x) => /\[목표\]/.test(x.text || '')), dl().map((x) => x.text));
          call('session.send', { target: ['lead1'], text: 'Reply with one short line: ok.' });
          await sleep(3000);
          const to = dl().filter((x) => /Reply with one short line/.test(x.text || '')).map((x) => x.text);
          check('lead1의 다음 메시지 앞에 [목표] 수집 줄(휴대폰 체크·지금 값)', to.some((x) => /^\[목표\] 수집 [^\n]*M2\.3 체크[^\n]*손으로 적는 칸 지금 2\(사용자\)[^\n]*\n\nReply/.test(x)), to);
        }
        // 5) 닫고 할 일 시트 → 목표 판 → 그 레인
        await pg.tap('[data-action=pp-close]'); await sleep(400);
        check(`[${tag}] 닫기`, !(await sheetOf(pg)));
        await pg.tap('[data-role=pl-decisions]'); await sleep(800);
        const cardB = `[data-role=plan-card][data-plan="${B.planId}"]`;
        await pg.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), cardB);
        await sleep(300);
        await shot(pg, `${tag}-5-todo`);
        await pg.tap(`${cardB} [data-action=plan-card-board]`); await sleep(900);
        sh = await sheetOf(pg);
        const under = await pg.evaluate(() => !!document.querySelector('[data-role=decisions-sheet]'));
        check(`[${tag}] 할 일 시트의 목표 판 → 이 시트의 그 레인(결제), 할 일 시트는 아래에 남는다`, sh && sh.mode === 'lane' && String(sh.plan) === String(B.planId) && under, { sh, under });
        await shot(pg, `${tag}-6-todo-board`);
        await pg.tap('[data-action=pp-back]'); await sleep(500);
        check(`[${tag}] 뒤로: 레인 목록`, (await sheetOf(pg)).mode === 'list');
        await pg.tap('[data-action=pp-close]'); await sleep(300);
        check(`[${tag}] 페이지 오류 없음`, !errs.length, errs);
        await pg.close(); await ctx.close();
        first = false;
      }
    } finally { await browser.close(); }
  });
  reset();
}

async function stopAll() {
  for (const n of ['lead1', 'sh1']) { try { if (sess(n)) log(atrium('kill', n, '--yes', '--delete')); } catch (e) { log('kill ' + e.message.slice(0, 120)); } }
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log('terminal stop ' + e.message.slice(0, 120)); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log('backend stop ' + e.message.slice(0, 120)); }
}

try {
  if (WHAT === 'setup') await setup();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'stop') await stopAll();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p307-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
