// P348 실시험: 전환 구분(잠재우기·깨우기를 여러 번 해도 폭주 배지·카드 없음), 곧바로 배지(코어 둘 CPU 자식), 측정 간격·비용, 창 그림(ko).
// 판: 따로 띄운 개발용 판(atrium-dev-p348, 48094, 창 원격 디버깅 9575, backend/.dev)만 쓴다. 시험 폴더 C:\Workspace\mtask-p348-a(claude haiku 둘: p348-a1, p348-a2),
//   C:\Workspace\mtask-p348-b(셸 p348-sh). 가짜 자식 busy2.js(일꾼 스레드 셋이 바쁜 고리, 150초 뒤 스스로 끝남)는 셸 세션에서 띄운다. stop에서 남은 것을 PID로 정리한다.
// 실행: node app/test/e2e/p348-guard.mjs <setup|cycles <n>|busy|shots|status|stop>
// 결과(기록·그림)는 워크트리의 experiments/p348/(저장소 밖): samples-*.jsonl(측정마다 세션 줄), results.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'status';
const ARG = process.argv[3] || '';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p348');
const CONVOS = path.join(REPO, 'experiments', 'p348', 'convos');
const DIRS = { a: 'C:\\Workspace\\mtask-p348-a', b: 'C:\\Workspace\\mtask-p348-b' };
const BOARD = 'atrium-dev-p348', PORT = '48094', DEBUG = 9575;
const AGENTS = ['p348-a1', 'p348-a2'];
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p348-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p348-${WHAT}${ARG ? '-' + ARG : ''}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${JSON.stringify(detail).slice(0, 1500)}` : ''}`); };
const sess = (name) => call('session.list').find((s) => s.name === name) || null;
const rowOf = (r, name) => ((r && r.sessions) || []).find((x) => x.name === name) || null;
const cards = () => (call('decision.list').cards || []).filter((c) => c.kind === 'guard');
const alerts = () => call('guard.report', { days: 1 });

// 측정마다(새 at) 세션 줄을 남긴다. 판의 마지막 측정(resources.get, fresh 아님)을 1초마다 본다
function recorder(file) {
  let stop = false, lastAt = 0, n = 0;
  const rows = [];
  const loop = (async () => {
    while (!stop) {
      try {
        const c0 = Date.now();
        const r = call('resources.get');
        const callMs = Date.now() - c0;
        if (r && r.at !== lastAt) {
          lastAt = r.at; n++;
          const cores = (r.cpu && r.cpu.cores) || 1;
          const line = { at: r.at, callMs, via: r.via, readMs: r.readMs, ms: r.ms, intervalMs: r.intervalMs, rows: (r.sessions || []).map((x) => ({ name: x.name, state: x.state, transit: x.transit || null, transitAt: x.transitAt || null, hold: x.hold || null, core: x.cpuPct == null ? null : Math.round(x.cpuPct * cores), memMB: x.memMB, guard: x.guard ? { kind: x.guard.kind, reasons: x.guard.reasons } : null })) };
          rows.push(line);
          fs.appendFileSync(path.join(OUT, file), JSON.stringify(line) + '\n');
        }
      } catch (e) { log('recorder ' + String(e.message).split('\n')[0]); }
      await sleep(1000);
    }
  })();
  return { rows, end: async () => { stop = true; await loop; return n; } };
}
const until = async (f, ms, step = 1000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = f(); if (v) return v; await sleep(step); } return null; };

const BUSY2 = "const { Worker } = require('node:worker_threads'); const ms = 150000; console.log('busy2 pid', process.pid, Date.now()); for (let k = 0; k < 3; k++) new Worker('const end = Date.now() + ' + ms + '; while (Date.now() < end) { for (let i = 0; i < 1e6; i++); }', { eval: true }); setTimeout(() => process.exit(0), ms + 500);\n";

async function setup() {
  for (const d of Object.values(DIRS)) fs.mkdirSync(path.join(d, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(DIRS.b, 'busy2.js'), BUSY2);
  log(atrium('backend', 'start').trim().slice(0, 300));
  for (const [key, value] of [['language', 'ko'], ['guardDetect', true], ['guardLowerPriority', true], ['mergerMode', 'off'], ['todoTidyMode', 'off'], ['sleepAfterMin', 0], ['sessionSleepAfterMin', 0]]) { try { call('settings.set', { key, value }); } catch (e) { log(`set ${key}: ${String(e.message).split('\n')[0]}`); } }
  for (const n of AGENTS) if (!sess(n)) log(atrium('--json', 'spawn', DIRS.a, '--kind', 'claude', '--model', 'haiku', '--name', n).slice(0, 300));
  if (!sess('p348-sh')) log(atrium('--json', 'spawn', DIRS.b, '--kind', 'shell', '--name', 'p348-sh').slice(0, 200));
  for (const n of AGENTS) { await until(() => (sess(n) || {}).state === 'ready', 120000, 2000); log(`${n} ${(sess(n) || {}).state}`); }
  // 잠재우기에는 대화가 있어야 한다(sleep_no_convo)
  for (const n of AGENTS) call('session.send', { target: n, text: 'Reply with the single word: ok' });
  for (const n of AGENTS) { await sleep(3000); await until(() => (sess(n) || {}).state === 'ready', 120000, 2000); log(`${n} after say ${(sess(n) || {}).state}`); }
  const r = call('resources.get', { fresh: true });
  check('setup: native helper sampling', r.via === 'native' && r.intervalMs === 5000, { via: r.via, intervalMs: r.intervalMs, readMs: r.readMs, ms: r.ms });
}

// 리포 a를 잠재우고 깨우기를 n번. 그동안 폭주 배지·카드·경보 기록이 없어야 한다
async function cycles(n) {
  // P348_LOW=1: 기준을 낮춰(CPU 10% · 배수 2 = 코어 하나의 20%) 깨운 직후의 튐이 쉼 없이는 걸리는 상황을 만든다
  const low = process.env.P348_LOW === '1';
  if (low) { call('settings.set', { key: 'guardCpuPct', value: 10 }); call('settings.set', { key: 'guardInstantX', value: 2 }); }
  const instantAt = low ? 20 : 180; // 기준 × 배수(코어 하나 대비 %)
  const ws = (call('workspace.list').workspaces || []).find((w) => /mtask-p348-a/i.test(w.key || w.name));
  if (!ws) throw new Error('no workspace a');
  const rep0 = alerts();
  const rec = recorder(`samples-cycles.jsonl`);
  const times = [];
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    try { call('workspace.sleep', { workspace: ws.key }); } catch (e) { log('sleep ' + String(e.message).split('\n')[0]); }
    const slept = await until(() => AGENTS.every((a) => (sess(a) || {}).state === 'sleeping'), 120000);
    const t1 = Date.now();
    await sleep(6000);
    try { call('workspace.wake', { workspace: ws.key }); } catch (e) { log('wake ' + String(e.message).split('\n')[0]); }
    const woke = await until(() => AGENTS.every((a) => (sess(a) || {}).state === 'ready'), 180000);
    const t2 = Date.now();
    times.push({ i, sleepMs: t1 - t0, wakeMs: t2 - t1 - 6000, slept: !!slept, woke: !!woke });
    log(`cycle ${i}: sleep ${t1 - t0}ms wake ${t2 - t1 - 6000}ms`);
    await sleep(i === n - 1 ? 75000 : 20000); // 마지막에는 쉼 시간이 지나도록
  }
  const samples = await rec.end();
  const rep1 = alerts();
  const guarded = rec.rows.flatMap((s) => s.rows.filter((x) => AGENTS.includes(x.name) && x.guard).map((x) => ({ at: s.at, ...x })));
  const held = rec.rows.reduce((a, s) => a + s.rows.filter((x) => AGENTS.includes(x.name) && x.hold).length, 0);
  const heldOver = rec.rows.reduce((a, s) => a + s.rows.filter((x) => AGENTS.includes(x.name) && x.hold && (x.core || 0) >= instantAt).length, 0); // 쉬지 않았다면 곧바로 배지가 섰을 줄
  const gaps = rec.rows.slice(1).map((s, i) => s.at - rec.rows[i].at).sort((a, b) => a - b);
  const calls = rec.rows.map((s) => s.callMs).sort((a, b) => a - b);
  if (low) { call('settings.set', { key: 'guardCpuPct', value: 90 }); call('settings.set', { key: 'guardInstantX', value: 2 }); }
  const peak = rec.rows.reduce((m, s) => { for (const x of s.rows) if (AGENTS.includes(x.name)) { m.core = Math.max(m.core, x.core || 0); m.mem = Math.max(m.mem, x.memMB || 0); } return m; }, { core: 0, mem: 0 });
  // 쉼 시간 재기: 전환이 끝난 뒤(hold 'after' 또는 끝) 코어 하나 대비 CPU가 20% 아래로 처음 내려간 때까지
  const settle = [];
  for (const a of AGENTS) {
    let endAt = null;
    for (const s of rec.rows) { const x = s.rows.find((r) => r.name === a); if (!x) continue; if (x.transit) endAt = null; else if (endAt == null && x.transitAt && s.at - x.transitAt < 120000) { endAt = x.transitAt; const quiet = rec.rows.find((q) => q.at > x.transitAt && (q.rows.find((r) => r.name === a) || {}).core < 20); if (quiet) settle.push({ name: a, transitAt: x.transitAt, quietAfterMs: quiet.at - x.transitAt }); } }
  }
  fs.writeFileSync(path.join(OUT, `cycles${low ? '-low' : ''}.json`), JSON.stringify({ low, instantAt, heldOver, gapMed: gaps[Math.floor(gaps.length / 2)], gapMax: gaps[gaps.length - 1], callMed: calls[Math.floor(calls.length / 2)], callMax: calls[calls.length - 1], times, samples, held, peak, settle, alertsBefore: rep0.alerts, alertsAfter: rep1.alerts, guarded: guarded.slice(0, 20) }, null, 1));
  check(`cycles x${n}: all slept and woke`, times.every((t) => t.slept && t.woke), times);
  check(`cycles x${n}: no guard badge on the agents during or after`, guarded.length === 0, guarded.slice(0, 5));
  check(`cycles x${n}: no new resource_alert`, rep1.alerts === rep0.alerts, { before: rep0.alerts, after: rep1.alerts });
  check(`cycles x${n}: no guard card`, cards().length === 0);
  check(`cycles x${n}: transitions were seen and held`, held > 0, { held, heldOver, instantAt, samples, peak });
  log('settle ' + JSON.stringify(settle));
}

// 셸 세션에서 코어 둘을 쓰는 자식(150초 뒤 끝남): 지속 기준(3분) 전에 곧바로 배지가 서는가
async function busy() {
  const rec = recorder('samples-busy.jsonl');
  const t0 = Date.now();
  call('terminal.input', { session: 'p348-sh', data: 'node busy2.js\r' });
  const hit = await until(() => { const r = call('resources.get'); const x = rowOf(r, 'p348-sh'); return x && x.guard ? { at: r.at, guard: x.guard, core: Math.round((x.cpuPct || 0) * ((r.cpu && r.cpu.cores) || 1)) } : null; }, 60000, 500);
  const ms = hit ? hit.at - t0 : null;
  check('busy: badge before the 3 min duration rule', !!hit && ms < 30000, { ms, hit });
  check('busy: the badge is the instant kind', !!hit && hit.guard.reasons.some((r) => r.type === 'cpu' && r.instant), hit && hit.guard);
  await sleep(6000);
  await rec.end();
  fs.writeFileSync(path.join(OUT, 'busy.json'), JSON.stringify({ t0, ms, hit }, null, 1));
  return hit;
}
async function withWindow(fn) {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, '--force-device-scale-factor=1'] });
  try { await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {}); await sleep(2500); await fn(page); } finally { await closeApp(app); }
}
const shotTo = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });
const boxOf = (pg, sel, pad = 8) => pg.$eval(sel, (e, p) => { const b = e.getBoundingClientRect(); return { x: Math.max(0, b.x - p), y: Math.max(0, b.y - p), width: Math.min(innerWidth - Math.max(0, b.x - p), b.width + 2 * p), height: Math.min(innerHeight - Math.max(0, b.y - p), b.height + 2 * p) }; }, pad);
// 창(ko): 셸에서 busy2를 띄우고 곧바로 배지(노드 머리·메모리 알약 목록 맨 위)를 찍는다
async function shots() {
  call('settings.set', { key: 'language', value: 'ko' });
  await withWindow(async (pg) => {
    const id = sess('p348-sh').sessionId;
    // 셸 터미널에 직접 친다(셸 세션에는 판의 글 보내기가 없다)
    await pg.evaluate((sid) => { const st = window.__mt.getState(); if (st.navigateTo) st.navigateTo(sid, { focusTerminal: true }); }, id); await sleep(2000);
    const rec = recorder('samples-busy.jsonl');
    await pg.keyboard.type('node busy2.js'); await pg.keyboard.press('Enter');
    const t0 = Date.now();
    const hit = await until(() => { const r = call('resources.get'); const x = rowOf(r, 'p348-sh'); return x && x.guard ? { at: r.at, guard: x.guard, core: Math.round((x.cpuPct || 0) * ((r.cpu && r.cpu.cores) || 1)) } : null; }, 60000, 500);
    const ms = hit ? hit.at - t0 : null;
    check('busy: badge before the 3 min duration rule', !!hit && ms < 30000, { ms, hit });
    check('busy: the badge is the instant kind', !!hit && hit.guard.reasons.some((r) => r.type === 'cpu' && r.instant), hit && hit.guard);
    check('busy: no card for the instant badge', cards().length === 0);
    fs.writeFileSync(path.join(OUT, 'busy.json'), JSON.stringify({ t0, ms, hit }, null, 1));
    await sleep(1500);
    await pg.evaluate((sid) => { const st = window.__mt.getState(); if (st.navigateTo) st.navigateTo(sid, {}); }, id); await sleep(1500);
    const node = `.react-flow__node-session[data-id="${id}"]`;
    const badge = await pg.$(`${node} [data-role="guard-badge"]`);
    check('shots ko: instant badge on the node', !!badge, badge ? await badge.innerText() : null);
    if (await pg.$(node)) await shotTo(pg, 'instant-node-ko', await boxOf(pg, node, 12));
    await pg.keyboard.press('Escape').catch(() => {});
    if (!(await pg.waitForSelector('[data-role="resources"]', { timeout: 5000 }).catch(() => null))) {
      await shotTo(pg, 'debug-no-pill');
      log('top-right: ' + await pg.evaluate(() => { const t = document.querySelector('[data-role="top-right"]'); return t ? [...t.querySelectorAll('[data-role],[data-action]')].map((e) => e.dataset.role || e.dataset.action).join(',') : 'none'; }));
    }
    await pg.click('[data-role="resources"]'); await sleep(800);
    if (!(await pg.$('[data-role="resources-list"]'))) { await shotTo(pg, 'debug-no-pill-list'); await pg.click('[data-role="resources"]'); await sleep(800); }
    const order = await pg.$$eval('[data-role="res-top"] [data-role="res-row"]', (els) => els.map((e) => ({ name: e.dataset.name, guard: e.dataset.guard || null })));
    check('shots ko: list on top, guarded session first', order.length >= 3 && order[0].name === 'p348-sh' && order[0].guard, order);
    const before = await pg.$eval('[data-role="resources-list"]', (e) => { const top = e.querySelector('[data-role="res-top"]'); const sum = e.querySelector('[data-role="res-cpu"]'); return !!(top && sum && (top.compareDocumentPosition(sum) & Node.DOCUMENT_POSITION_FOLLOWING)); });
    check('shots ko: list above the board/PC totals', before);
    const every = await pg.$eval('[data-role="res-every"]', (e) => e.textContent).catch(() => null);
    check('shots ko: interval shown', every === '5초마다', every);
    await shotTo(pg, 'pill-list-ko', await boxOf(pg, '[data-role="resources-list"]', 6));
    // 측정마다 살아 있음: 6초 뒤 다시
    const cpu1 = await pg.$eval('[data-role="res-top"] [data-role="res-row-cpu"]', (e) => e.textContent).catch(() => null);
    await sleep(6500);
    const cpu2 = await pg.$eval('[data-role="res-top"] [data-role="res-row-cpu"]', (e) => e.textContent).catch(() => null);
    log(`list cpu ${cpu1} → ${cpu2}`);
    await shotTo(pg, 'pill-list-ko-2', await boxOf(pg, '[data-role="resources-list"]', 6));
    // 세션 이름을 누르면 그 세션으로
    await pg.click('[data-role="res-top"] [data-role="res-row"][data-name="p348-a1"]'); await sleep(1500);
    const sel = await pg.evaluate(() => { const st = window.__mt.getState(); return st.selected || st.focusId || null; }).catch(() => null);
    log('after click selected ' + JSON.stringify(sel));
    // 설정 › 자원 › 기준값의 새 칸
    await pg.click('[data-role="top-right"] [data-action="settings-open"]').catch(() => {});
    if (await pg.waitForSelector('[data-role="settings-tabs"]', { timeout: 8000 }).catch(() => null)) {
      await pg.click('[data-role="settings-tabs"] [data-tab="resources"]'); await sleep(500);
      await pg.click('[data-action="guard-advanced"]'); await sleep(400);
      const f = await pg.$('[data-field="setting-guardInstantX"]');
      check('shots ko: settings field guardInstantX', !!f);
      await shotTo(pg, 'settings-resources-ko', await boxOf(pg, '[data-role="settings"]', 4));
    }
    await rec.end();
  });
}
function status() {
  const r = call('resources.get', { fresh: true });
  log(`via=${r.via} readMs=${r.readMs} ms=${r.ms} intervalMs=${r.intervalMs}`);
  for (const x of r.sessions) log(`row ${x.name} state=${x.state} transit=${x.transit || '-'} mem=${x.memMB} cpu=${x.cpuPct} guard=${JSON.stringify(x.guard || null)}`);
  log('cards ' + JSON.stringify(cards()));
}
function leftovers() {
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ? { $_.CommandLine -match 'busy2\\.js' } | % { '{0}' -f $_.ProcessId }"], { encoding: 'utf8' }).trim();
  return out ? out.split(/\s+/).map(Number) : [];
}
async function stop() {
  const left = leftovers();
  log('fake children left: ' + JSON.stringify(left));
  for (const pid of left) { try { process.kill(pid); log(`killed ${pid}`); } catch (e) { log(`kill ${pid}: ${e.message}`); } }
  for (const n of [...AGENTS, 'p348-sh']) { try { const s = sess(n); if (s) log(atrium('kill', s.sessionId, '--yes').trim()); } catch (e) { log('kill', String(e.message).split('\n')[0]); } }
  try { log(atrium('terminal', 'stop', '--yes').trim()); } catch (e) { log('terminal stop', String(e.message).split('\n')[0]); }
  try { log(atrium('backend', 'stop').trim()); } catch (e) { log('backend stop', String(e.message).split('\n')[0]); }
}

if (WHAT === 'setup') await setup();
else if (WHAT === 'cycles') await cycles(Number(ARG) || 3);
else if (WHAT === 'busy') await busy();
else if (WHAT === 'shots') await shots();
else if (WHAT === 'status') status();
else if (WHAT === 'pill') await withWindow(async (pg) => { const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 1500))); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 1500)); }); pg.on('crash', () => errs.push('CRASH')); await sleep(3000); await shotTo(pg, 'pill-before'); await pg.click('[data-role="resources"]'); await sleep(1500); log('errors ' + JSON.stringify(errs)); log('body ' + await pg.evaluate(() => document.body.innerHTML.length + ' ' + (document.querySelector('[data-role="resources-list"]') ? 'list' : 'nolist') + ' ' + document.title).catch((e) => 'eval failed ' + e.message)); await shotTo(pg, 'pill-debug'); });
else if (WHAT === 'peek') await withWindow(async (pg) => { await sleep(4000); await shotTo(pg, 'peek'); log(await pg.evaluate(() => { const t = document.querySelector('[data-role="top-right"]'); return (t ? [...t.querySelectorAll('[data-role],[data-action]')].map((e) => e.dataset.role || e.dataset.action).join(',') : 'no top-right') + ' | res=' + !!(window.__mt && window.__mt.getState().resources); })); });
else if (WHAT === 'backend') { try { log(atrium('backend', 'stop').trim().slice(0, 300)); } catch (e) { log('stop ' + String(e.message).split('\n')[0]); } await sleep(1500); log(atrium('backend', 'start').trim().slice(0, 300)); } // 이 판(48094)의 백엔드만 다시
else if (WHAT === 'stop') await stop();
fs.appendFileSync(path.join(OUT, 'results.jsonl'), results.map((r) => JSON.stringify({ what: WHAT, arg: ARG, ...r })).join('\n') + (results.length ? '\n' : ''));
log(`done ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
