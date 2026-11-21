// P306 창 시험: 목표 레인의 PC 창(영역 머리 레인 칩, 목표 판의 탭·체크, 관리자 카드 칩, 할 일 목록의 실행 카드)과 관리자 알림(다음 메시지와).
// 판: 따로 띄운 개발용 판(atrium-dev-p306, 48056, backend/.dev)만. 창의 원격 디버깅 포트 9537. 한 번에 한 창.
// 세션: haiku 리드 둘(lead1·lead2)이 같은 폴더(워크스페이스)에 레인 하나씩(atrium plan new …), 둘째 폴더에는 셸 하나와 관리자 없는 레인 넷(접힌 칩).
// 실행: node app/test/e2e/p306-plan.mjs <setup|lanes|pc|stop> [round]   결과는 워크트리의 experiments/p306/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'pc';
const TAG = process.argv[3] || 'r1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p306', TAG);
const BOARD = 'atrium-dev-p306', PORT = process.env.P306_PORT || '48056', DEBUG = process.env.P306_DEBUG || '9537';
const FOLDERS = ['C:\\Workspace\\mtask-p306-a', 'C:\\Workspace\\mtask-p306-b'];
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p306', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p306-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p306-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const NAMES = ['lead1', 'lead2', 'sh1'];
const sess = (n) => call('session.list').find((s) => s.name === n);
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
async function waitFor(fn, ms = 120000, every = 1500) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(every); } }
const wsKey = (f) => { const wl = call('workspace.list'); return (wl.workspaces.find((w) => path.resolve(w.root || w.path || '').toLowerCase() === path.resolve(f).toLowerCase()) || {}).key; };
const lanes = () => call('plan.list', { all: true }).plans;

async function setup() {
  for (const f of FOLDERS) fs.mkdirSync(f, { recursive: true });
  log(atrium('backend', 'start'));
  for (const n of ['lead1', 'lead2']) if (!sess(n)) log(atrium('spawn', FOLDERS[0], '--name', n, '--model', 'haiku'));
  if (!sess('sh1')) log(atrium('spawn', FOLDERS[1], '--name', 'sh1', '--kind', 'shell'));
  for (const n of ['lead1', 'lead2']) {
    const s = await waitFor(() => { const x = sess(n); return x && !['starting'].includes(x.state) && x; }, 120000, 2000);
    check(`${n}이 떴다`, s && s.state !== 'trust_wait', s && s.state);
    if (s && s.state === 'trust_wait') fs.writeFileSync(path.join(DEV, 'p306-need-trust.txt'), `${n}: ${FOLDERS[0]} 신뢰 질문\n`);
  }
}
// 리드에게 레인을 만들게 시킨다(--로 시작하는 낱말이 있어 session.send로 보낸다)
const LEAD_CMDS = {
  lead1: ['atrium plan new 수집', 'atrium plan goal "작은 온실의 물주기 기록을 손으로 적지 않게 한다"', 'atrium plan metric "손으로 적는 칸" --target 0 --now 4 --unit 칸', 'atrium plan metric "하루 기록 시간" --target 2분 --now 12분',
    'atrium plan ms M1 "센서 값 받기"', 'atrium plan ms M2 "물주기 기록 자동 채우기" --purpose "센서가 보낸 값을 사람이 옮겨 적지 않고 표가 스스로 찬다" --done-when "일주일 기록이 손대지 않고 표에 다 남는다"', 'atrium plan ms M3 "빠진 값 알림"',
    'atrium plan item M1 "센서 연결"', 'atrium plan check M1.1', 'atrium plan ms M1 --done',
    'atrium plan item M2 "센서 값을 기록 표에 매핑"', 'atrium plan item M2 "온실 PC에 수집기 설치" --who user --note "설치 확인은 화요일"', 'atrium plan item M2 "일주일 동안 기록을 손대지 않고 둔다" --who user --note "주말부터"',
    'atrium plan item M2 "빠진 값 알림 초안"', 'atrium plan item M2 "기록 양식 마지막 확인" --who user', 'atrium plan check M2.1', 'atrium plan focus M2'],
  lead2: ['atrium plan new 결제', 'atrium plan goal "주문 메일이 빠짐없이 나간다"', 'atrium plan ms M1 "주문 메일"', 'atrium plan ms M2 "반품 안내"',
    'atrium plan item M1 "메일 틀 만들기"', 'atrium plan item M1 "주문 메일 샘플 3통을 실제 메일함에서 확인" --who user', 'atrium plan item M1 "반품 안내 문구 읽어 보기" --who user', 'atrium plan item M1 "결제 화면 문구 고르기" --who user', 'atrium plan check M1.1'],
};
async function makeLanes() {
  for (const n of ['lead1', 'lead2']) {
    const text = 'Run these shell commands one at a time, exactly as written, in order. Do nothing else. When all are done, reply with one line: done.\n' + LEAD_CMDS[n].join('\n');
    log(JSON.stringify(call('session.send', { target: [n], text })).slice(0, 300));
  }
  const ok = await waitFor(() => { const ls = lanes(); const a = ls.find((l) => l.name === '수집'), b = ls.find((l) => l.name === '결제'); return a && b && a.summary && a.summary.focus && a.summary.focus.code === 'M2' && a.summary.focus.total === 5 && b.summary.focus && b.summary.focus.total === 4 && b.summary.focus.done === 1 && { a, b }; }, 420000, 5000);
  check('리드 둘이 같은 워크스페이스에 레인을 하나씩 만들었다', ok, ok ? { a: [ok.a.owner && ok.a.owner.name, ok.a.summary.focus], b: [ok.b.owner && ok.b.owner.name, ok.b.summary.focus] } : lanes().map((l) => [l.name, l.summary && l.summary.focus]));
  // 둘째 워크스페이스: 관리자 없는 레인 넷(칩 접기)
  const kb = wsKey(FOLDERS[1]);
  const doc = (n, user) => ({ version: 1, goal: n + ' 목표', metrics: [], focus: 'M1', milestones: [{ code: 'M1', title: n + ' 첫 단계', purpose: null, doneWhen: null, state: 'open', items: [{ text: '준비', who: 'head', done: null }, ...Array.from({ length: user }, (_, i) => ({ text: n + ' 확인 ' + (i + 1), who: 'user', done: null }))] }] });
  for (const [n, u] of [['문서', 1], ['배포', 0], ['검색', 0], ['로그', 0]]) if (!lanes().find((l) => l.name === n)) log(JSON.stringify(call('plan.import', { workspace: kb, new: n, doc: JSON.stringify(doc(n, u)) })).slice(0, 200));
  const lg = lanes().find((l) => l.name === '로그'); if (lg && lg.status !== 'paused') call('plan.status', { planId: lg.planId, status: 'paused' });
  // 리드가 일을 끝내고 쉴 때까지
  await waitFor(() => ['lead1', 'lead2'].every((n) => { const s = sess(n); return s && ['ready', 'idle'].includes(s.state); }), 180000, 3000);
  log(lanes().map((l) => `#${l.no} ${l.name} ${l.status} ${l.owner ? l.owner.name : '-'} ${l.summary.focus ? l.summary.focus.code + ' ' + l.summary.focus.done + '/' + l.summary.focus.total : ''}`).join('\n'));
}

async function pc() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    const sideOpen = () => page.evaluate(() => !!document.querySelector('[data-role=sidebar]'));
    if (await sideOpen()) { await page.click('[data-role=top-left] [data-action=sidebar]'); await sleep(800); }
    const ka = wsKey(FOLDERS[0]);
    const L = lanes(); const A = L.find((l) => l.name === '수집'), B = L.find((l) => l.name === '결제');
    // 다시 돌릴 때: 시작 상태로 되돌린다(알림은 꺼 두고)
    call('settings.set', { key: 'planNotify', value: 'off' });
    call('plan.op', { planId: A.planId, op: { op: 'uncheck', ids: ['M2.2', 'M2.3', 'M2.4', 'M2.5'] } });
    call('plan.op', { planId: B.planId, op: { op: 'uncheck', ids: ['M1.2'] } });
    call('settings.set', { key: 'planNotify', value: 'next' });
    for (const lang of ['ko', 'en']) {
      call('settings.set', { key: 'language', value: lang }); await sleep(1000);
      await page.evaluate(() => window.__mt.getState().fitAll(0)); await sleep(1200);
      // 1. 영역 머리 칩
      const chips = await page.evaluate(() => [...document.querySelectorAll('[data-role=plan-chips]')].map((e) => ({ ws: e.dataset.ws, folded: e.dataset.folded || null, chips: [...e.querySelectorAll('[data-role=plan-chip],[data-role=plan-chip-fold]')].map((c) => ({ text: c.textContent, user: c.dataset.userLeft || null, all: c.dataset.all || null, status: c.dataset.status || null })) })));
      const ca = chips.find((c) => c.ws === ka);
      check(`[${lang}] 영역 머리에 레인마다 칩(수집 M2 1/5, 결제 M1 1/4, 사용자 점)`, ca && ca.chips.length === 2 && ca.chips.some((c) => c.text === '수집 M2 1/5' && c.user === '3') && ca.chips.some((c) => c.text === '결제 M1 1/4' && c.user === '3'), chips);
      const cb = chips.find((c) => c.ws !== ka);
      check(`[${lang}] 레인이 넷이면 "레인 4"로 접힌다`, cb && cb.folded === '1' && cb.chips.length === 1 && /4/.test(cb.chips[0].text), cb);
      await shot(page, `board-${lang}`);
      await page.evaluate((k) => window.__mt.getState().fitWorkspace(k), ka); await sleep(1200);
      const head = await page.evaluate((k) => { const e = document.querySelector(`.mt-region[data-ws="${k}"] .mt-region-head`); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, ka);
      await shot(page, `chips-${lang}`, { clip: { x: Math.max(0, head.x - 10), y: Math.max(0, head.y - 10), width: Math.min(1100, 1600 - head.x + 10), height: 80 } });
      // 접힌 칩 목록
      await page.evaluate(() => window.__mt.getState().fitAll(0)); await sleep(900);
      await page.click('[data-role=plan-chip-fold]'); await sleep(500);
      const menu = await page.evaluate(() => [...document.querySelectorAll('[data-role=plan-lane-menu] [data-action=plan-lane-open]')].map((e) => e.textContent));
      check(`[${lang}] 접힌 칩을 누르면 레인 목록(멈춤은 흐리게)`, menu.length === 4, menu);
      await shot(page, `fold-menu-${lang}`);
      await page.keyboard.press('Escape'); await sleep(300);
      // 2. 목표 판(탭)
      await page.evaluate((k) => window.__mt.getState().fitWorkspace(k), ka); await sleep(1000);
      await page.click(`[data-role=plan-chip][data-plan="${A.planId}"]`); await sleep(1200);
      const panel = await page.evaluate(() => { const p = document.querySelector('[data-role=plan-panel]'); if (!p) return null; const r = p.getBoundingClientRect(); return { w: Math.round(r.width), tabs: [...p.querySelectorAll('[data-action=plan-tab]')].map((e) => e.textContent), goal: p.querySelector('[data-role=plan-goal]').textContent, steps: [...p.querySelectorAll('[data-action=plan-step]')].map((e) => e.textContent), items: [...p.querySelectorAll('[data-role=plan-item]')].map((e) => e.dataset.item + ':' + e.dataset.who + (e.dataset.done ? ':done' : '')), owner: (p.querySelector('[data-role=plan-owner]') || {}).textContent }; });
      check(`[${lang}] 목표 판: 520px, 탭 둘, 목표 문장, 계단, focus 항목, 관리자`, panel && panel.w === 520 && panel.tabs.length === 2 && /물주기/.test(panel.goal) && panel.steps.length === 3 && panel.items.length === 5 && /lead1/.test(panel.owner), panel);
      await shot(page, `panel-${lang}`);
      await page.click(`[data-action=plan-tab][data-plan="${B.planId}"]`); await sleep(900);
      const tabB = await page.evaluate(() => document.querySelector('[data-role=plan-panel]').dataset.plan);
      check(`[${lang}] 탭을 누르면 다른 레인`, String(tabB) === String(B.planId), tabB);
      await shot(page, `panel-tab-${lang}`);
      await page.click('[data-action=plan-close]'); await sleep(400);
      // 3. 관리자 카드 칩
      const mgr = await page.evaluate(() => [...document.querySelectorAll('[data-role=plan-manager]')].map((e) => ({ text: e.textContent, node: (e.closest('.mt-node-head') || {}).textContent.slice(0, 40) })));
      check(`[${lang}] 관리자 세션 카드 머리에 자기 레인 칩`, mgr.length === 2 && mgr.some((m) => /수집/.test(m.text) && /lead1/.test(m.node)) && mgr.some((m) => /결제/.test(m.text) && /lead2/.test(m.node)), mgr);
      await page.evaluate((id) => window.__mt.getState().navigateTo(id), sess('lead1').sessionId); await sleep(1500);
      const nodeBox = await page.evaluate(() => { const m = [...document.querySelectorAll('[data-role=plan-manager]')].find((x) => /수집/.test(x.textContent)); const h = m && m.closest('.mt-node-head'); const r = (h || m).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      await shot(page, `manager-chip-${lang}`, { clip: { x: Math.max(0, nodeBox.x - 12), y: Math.max(0, nodeBox.y - 12), width: Math.min(1000, nodeBox.w + 24), height: nodeBox.h + 80 } });
      await page.evaluate(() => window.__mt.getState().fitAll(0)); await sleep(900);
      // 4. 할 일 목록
      await page.click('[data-role=decisions]'); await sleep(800);
      const list = await page.evaluate(() => ({ n: document.querySelector('[data-role=decisions]').dataset.count, cards: [...document.querySelectorAll('[data-role=plan-card]')].map((e) => e.dataset.item + '@' + e.querySelector('[data-role=plan-card-ms]').textContent), more: [...document.querySelectorAll('[data-role=plan-card-more]')].map((e) => e.textContent) }));
      check(`[${lang}] 할 일 목록에 두 레인의 실행 카드(레인당 2장 + n개 더)`, list.cards.filter((c) => /수집/.test(c)).length === 2 && list.cards.filter((c) => /결제/.test(c)).length === 2 && list.more.length >= 2 && Number(list.n) >= 7, list);
      await shot(page, `todo-${lang}`);
      await page.keyboard.press('Escape'); await sleep(300);
    }
    // 5. 사람이 판에서 체크(수집 M2.2) + 할 일에서 했음(결제 M1.2)
    const T0 = Date.now();
    await page.evaluate((k) => window.__mt.getState().fitWorkspace(k), ka); await sleep(900);
    await page.click(`[data-role=plan-chip][data-plan="${A.planId}"]`); await sleep(1000);
    await page.click('[data-role=plan-panel] [data-item="M2.2"] [data-action=plan-check]'); await sleep(1200);
    await shot(page, 'panel-checked-en');
    await page.click('[data-action=plan-close]'); await sleep(300);
    await page.click('[data-role=decisions]'); await sleep(700);
    await page.click(`[data-role=plan-card][data-plan="${B.planId}"][data-item="M1.2"] [data-action=plan-card-done]`); await sleep(1200);
    const after = { a: call('plan.get', { planId: A.planId, log: 5 }), b: call('plan.get', { planId: B.planId, log: 5 }) };
    const done = (v, id) => { for (const m of v.doc.milestones) for (const x of m.items) if (x.id === id) return x.done; return null; };
    check('판의 체크와 할 일의 했음이 같은 항목을 체크(via pc·foryou)', done(after.a, 'M2.2') && done(after.a, 'M2.2').via === 'pc' && done(after.b, 'M1.2') && done(after.b, 'M1.2').via === 'foryou', { a: done(after.a, 'M2.2'), b: done(after.b, 'M1.2') });
    const cardsNow = await page.evaluate(() => [...document.querySelectorAll('[data-role=plan-card]')].map((e) => e.dataset.item + '@' + e.dataset.plan));
    check('체크한 항목은 할 일 목록에서 사라진다', !cardsNow.includes(`M2.2@${A.planId}`) && !cardsNow.includes(`M1.2@${B.planId}`), cardsNow);
    await shot(page, 'todo-after-en');
    await page.keyboard.press('Escape');
    // 6. 알림: 곧바로 가지 않고, 다음 메시지(사람의 명령 바 글)와 함께 그 레인의 관리자에게만
    const dl = () => call('delivery.list', { limit: 40 }).filter((d) => (d.createdAt || 0) >= T0); // 이번 돌림에 만든 전달만
    const sent0 = dl().filter((d) => /\[목표\]/.test(d.text || ''));
    check('바뀐 뒤 곧바로 보내지 않는다(다음 메시지와)', sent0.length === 0, sent0.map((d) => d.text));
    const l1 = sess('lead1'), l2 = sess('lead2');
    call('session.send', { target: ['lead1'], text: 'Reply with one short line: ok.' });
    call('session.send', { target: ['lead2'], text: 'Reply with one short line: ok.' });
    await sleep(3000);
    const ds = dl();
    const to = (s) => ds.filter((d) => d.sessionId === s.sessionId && /Reply with one short line/.test(d.text || '')).map((d) => d.text);
    log(JSON.stringify({ l1: to(l1), l2: to(l2) }));
    check('lead1의 다음 메시지 앞에 [목표] 수집 줄만', to(l1).some((x) => /^\[목표\] 수집 M2\.2 체크\(사용자\) · M2 2\/5\n\nReply/.test(x)) && !to(l1).some((x) => /결제/.test(x)), to(l1));
    check('lead2의 다음 메시지 앞에 [목표] 결제 줄만', to(l2).some((x) => /^\[목표\] 결제 M1\.2 체크\(사용자\) · M1 2\/4\n\nReply/.test(x)) && !to(l2).some((x) => /수집/.test(x)), to(l2));
    // 7. 마일스톤 끝: 수집 M2를 모두 체크하면 곧바로 한 번
    await waitFor(() => ['lead1'].every((n) => { const s = sess(n); return s && ['ready', 'idle'].includes(s.state); }), 120000, 3000);
    call('plan.op', { planId: A.planId, op: { op: 'check', ids: ['M2.3', 'M2.4', 'M2.5'] } });
    const nowLines = () => dl().filter((d) => d.sessionId === l1.sessionId && /^\[목표\] 수집 [^\n]*· M2 5\/5$/.test(d.text || ''));
    const now1 = await waitFor(() => nowLines().length, 15000, 1500);
    if (now1) check('마일스톤이 모두 체크되면 곧바로 한 번 보낸다', nowLines().length === 1, nowLines().map((d) => d.text));
    else log('M2는 앞 돌림에서 이미 곧바로 알렸다(마일스톤마다 한 번): 곧바로 보내지 않음');
    // 다시 풀고 체크해도 곧바로 다시 보내지 않는다
    call('plan.op', { planId: A.planId, op: { op: 'uncheck', ids: ['M2.5'] } });
    call('plan.op', { planId: A.planId, op: { op: 'check', ids: ['M2.5'] } });
    await sleep(5000);
    check('모두 체크 곧바로 알림은 마일스톤마다 한 번(풀고 다시 체크해도 더 가지 않음)', nowLines().length <= 1, nowLines().map((d) => d.text));    await sleep(1500);
    await page.evaluate((k) => window.__mt.getState().fitWorkspace(k), ka); await sleep(900);
    await shot(page, 'chips-allchecked-en');
  } finally {
    try { await app.close(); } catch {}
  }
}

async function stopAll() {
  for (const n of NAMES) { try { if (sess(n)) log(atrium('kill', n, '--yes')); } catch (e) { log('kill ' + e.message); } }
  try { log(atrium('terminal', 'stop', '--yes')); } catch (e) { log('terminal stop ' + e.message); }
  try { log(atrium('backend', 'stop')); } catch (e) { log('backend stop ' + e.message); }
}

try {
  if (WHAT === 'setup') await setup();
  else if (WHAT === 'lanes') await makeLanes();
  else if (WHAT === 'pc') await pc();
  else if (WHAT === 'stop') await stopAll();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p306-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
