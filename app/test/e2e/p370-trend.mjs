// P370 실시험: 메모리 알약 펼침 맨 위의 추이 그림(직전 30분). 세션 몇 개를 실제로 돌려 고리를 채우고(경보·잠재우기 표시 포함) 창 그림을 찍는다.
// 판: 따로 띄운 개발용 판(atrium-dev-p370, 48105, 창 원격 디버깅 9586, backend/.dev)만 쓴다. 시험 폴더 C:\Workspace\mtask-p370-b(git도 .claude/settings.json도 없는 새 폴더라
//   신뢰 창 없이 뜬다, P363): claude haiku 둘(p370-b1, p370-b2, 잠재우기용)과 셸 p370-sh. 가짜 일꾼 busy.js(일꾼 스레드 셋이 바쁜 고리, 인자 초 뒤 스스로 끝남)는
//   셸에 제어기 입력(atrium input)으로 띄운다(셸 패널은 늘 무거움 표시). stop에서 남은 것을 PID로 정리한다. 신뢰 창은 누구도 대신 받지 않는다.
// 실행: node app/test/e2e/p370-trend.mjs <setup|drive [분]|shots|empty|status|stop>
// 결과(기록·그림)는 워크트리의 experiments/p370/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'status';
const ARG = process.argv[3] || '';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p370');
const CONVOS = path.join(REPO, 'experiments', 'p370', 'convos');
const DIRS = { a: 'C:\\Workspace\\mtask-p370-a', b: 'C:\\Workspace\\mtask-p370-b' };
const BOARD = 'atrium-dev-p370', PORT = '48105', DEBUG = 9586;
const AGENTS = ['p370-b1', 'p370-b2'];
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p370-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p370-${WHAT}${ARG ? '-' + ARG : ''}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${JSON.stringify(detail).slice(0, 1500)}` : ''}`); };
const sess = (name) => call('session.list').find((s) => s.name === name) || null;
const until = async (f, ms, step = 1000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { let v = null; try { v = f(); } catch {} if (v) return v; await sleep(step); } return null; };

const BUSY = "const { Worker } = require('node:worker_threads'); const ms = (Number(process.argv[2]) || 90) * 1000; console.log('busy pid', process.pid); for (let k = 0; k < 3; k++) new Worker('const end = Date.now() + ' + ms + '; while (Date.now() < end) { for (let i = 0; i < 1e6; i++); }', { eval: true }); setTimeout(() => process.exit(0), ms + 500);\n";

async function setup() {
  fs.mkdirSync(DIRS.b, { recursive: true });
  fs.writeFileSync(path.join(DIRS.b, 'busy.js'), BUSY);
  log(atrium('backend', 'start').trim().slice(0, 300));
  for (const [key, value] of [['language', 'ko'], ['guardDetect', true], ['guardLowerPriority', true], ['guardBgCpuMin', 1], ['mergerMode', 'off'], ['todoTidyMode', 'off'], ['sleepAfterMin', 0], ['sessionSleepAfterMin', 0]]) { try { call('settings.set', { key, value }); } catch (e) { log(`set ${key}: ${String(e.message).split('\n')[0]}`); } }
  for (const n of AGENTS) if (!sess(n)) log(atrium('--json', 'spawn', DIRS.b, '--kind', 'claude', '--model', 'haiku', '--name', n).slice(0, 300));
  if (!sess('p370-sh')) log(atrium('--json', 'spawn', DIRS.b, '--kind', 'shell', '--name', 'p370-sh').slice(0, 200));
  for (const n of AGENTS) { await until(() => ['ready', 'trust_wait'].includes((sess(n) || {}).state), 120000, 2000); log(`${n} ${(sess(n) || {}).state}`); }
  if (AGENTS.some((n) => (sess(n) || {}).state !== 'ready')) { log('NOT READY (trust?) — stop here and ask'); return; }
  for (const n of AGENTS) call('session.send', { target: n, text: 'Reply with the single word: ok' });
  for (const n of AGENTS) { await sleep(3000); await until(() => (sess(n) || {}).state === 'ready', 120000, 2000); log(`${n} after say ${(sess(n) || {}).state}`); }
}

// 시간표대로 세션을 움직인다(창 없이). 경보: 셸에서 busy.js(곧바로 무거움 배지). 잠재우기: b2를 손으로(guard.act sleep) 재우고 깨운다. 마지막에 b1을 재운다.
async function drive(min) {
  const t0 = Date.now();
  const at = async (m) => { const w = t0 + m * 60000 - Date.now(); if (w > 0) await sleep(w); };
  const say = (n, text) => { try { call('session.send', { target: n, text }); log(`say ${n}: ${text}`); } catch (e) { log(`say ${n} ${String(e.message).split('\n')[0]}`); } };
  const act = (n, action) => { try { const s = sess(n); log(`${action} ${n}: ${JSON.stringify(call('guard.act', { session: s.sessionId, action }))}`); } catch (e) { log(`${action} ${n} ${String(e.message).split('\n')[0]}`); } };
  const trend = () => { try { const v = call('resources.trend'); log(`trend points=${v.points.length} marks=${JSON.stringify(v.marks.map((k) => [k.type, k.kind || k.by, k.name]))}`); return v; } catch (e) { log('trend ' + e.message); return null; } };
  const busy = (sec) => { try { atrium('input', 'p370-sh', `node busy.js ${sec}\\r`); log(`shell busy ${sec}s`); } catch (e) { log('input ' + String(e.message).split('\n')[0]); } };
  await at(2); busy(120);
  await at(6); trend();
  await at(8); act('p370-b2', 'sleep');
  await at(11); try { call('session.wake', { session: sess('p370-b2').sessionId }); log('wake b2'); } catch (e) { log('wake ' + e.message); }
  await at(13); trend();
  await at(15); busy(70);
  await at(min - 6); act('p370-b1', 'sleep');
  await at(min); const v = trend();
  check('drive: points cover most of the window', v && v.points.length >= Math.min(55, min * 2 - 4), v && v.points.length);
  check('drive: alert and sleep marks', v && v.marks.some((k) => k.type === 'alert') && v.marks.some((k) => k.type === 'sleep'), v && v.marks);
  fs.writeFileSync(path.join(OUT, 'trend.json'), JSON.stringify(v, null, 1));
}

async function withWindow(fn) {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, '--force-device-scale-factor=1'] });
  try { await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {}); await sleep(2500); await fn(page); } finally { await closeApp(app); }
}
const shotTo = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });
const boxOf = (pg, sel, pad = 8) => pg.$eval(sel, (e, p) => { const b = e.getBoundingClientRect(); return { x: Math.max(0, b.x - p), y: Math.max(0, b.y - p), width: Math.min(innerWidth - Math.max(0, b.x - p), b.width + 2 * p), height: Math.min(innerHeight - Math.max(0, b.y - p), b.height + 2 * p) }; }, pad);
async function openPill(pg) {
  await pg.waitForSelector('[data-role="resources"]', { timeout: 15000 });
  await pg.click('[data-role="resources"]'); await sleep(1200);
  return pg.$('[data-role="resources-list"]');
}
async function hoverMark(pg, sel) {
  const b = await pg.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await pg.mouse.move(b.x, b.y); await sleep(400);
}
async function shots(lang = 'ko') {
  call('settings.set', { key: 'language', value: lang });
  await withWindow(async (pg) => {
    const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 800)));
    check(`shots ${lang}: pill list opens`, !!(await openPill(pg)));
    const trendEl = await pg.$('[data-role="res-trend"]');
    check(`shots ${lang}: trend on top of the list`, !!trendEl && await pg.$eval('[data-role="resources-list"]', (e) => { const tr = e.querySelector('[data-role="res-trend"]'); const top = e.querySelector('[data-role="res-top"]'); return !!(tr && top && (tr.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING)); }));
    const info = await pg.$eval('[data-role="res-trend"]', (e) => ({ points: e.dataset.points, marks: e.dataset.marks, mem: e.querySelector('[data-role="res-trend-mem-head"]')?.textContent, cpu: e.querySelector('[data-role="res-trend-cpu-head"]')?.textContent, paths: e.querySelectorAll('.mt-trend-line').length }));
    log('trend ' + JSON.stringify(info));
    check(`shots ${lang}: two lanes with lines`, info.paths >= 2, info);
    await shotTo(pg, `trend-${lang}`, await boxOf(pg, '[data-role="resources-list"]', 6));
    await shotTo(pg, `trend-${lang}-close`, await boxOf(pg, '[data-role="res-trend"]', 6));
    // 표시(경보·잠재우기)를 가리킨다
    const marks = await pg.$$eval('[data-role="res-trend-mark"]', (els) => els.map((e) => ({ type: e.dataset.type, kind: e.dataset.kind, name: e.dataset.name })));
    log('marks ' + JSON.stringify(marks));
    const pickSel = (pred) => { const i = marks.findIndex(pred); return i < 0 ? null : `[data-role="res-trend-mark"]:nth-of-type(${i + 1})`; };
    for (const [nm, pred] of [['suspect', (k) => k.kind === 'suspect'], ['heavy', (k) => k.kind === 'heavy'], ['sleep', (k) => k.type === 'sleep']]) {
      const sel = pickSel(pred);
      if (!sel) { log(`no ${nm} mark`); continue; }
      await hoverMark(pg, sel);
      const tip = await pg.$eval('[data-role="res-trend-tip"]', (e) => e.innerText).catch(() => null);
      check(`shots ${lang}: hover ${nm} mark shows time, values and session`, !!tip && /@p370-/.test(tip), tip);
      await shotTo(pg, `trend-${lang}-hover-${nm}`, await boxOf(pg, '[data-role="res-trend"]', 6));
    }
    // 가운데 가리키기(표시 없는 자리)
    const box = await boxOf(pg, '[data-role="res-trend-box"]', 0);
    await pg.mouse.move(box.x + box.width * 0.3, box.y + 20); await sleep(300);
    await shotTo(pg, `trend-${lang}-hover-plain`, await boxOf(pg, '[data-role="res-trend"]', 6));
    // 키보드: 초점 + ←
    await pg.mouse.move(5, 500); await pg.focus('[data-role="res-trend-box"]'); await pg.keyboard.press('ArrowLeft'); await sleep(200);
    check(`shots ${lang}: keyboard shows a tip`, !!(await pg.$('[data-role="res-trend-tip"]')));
    check(`shots ${lang}: no page errors`, !errs.length, errs);
  });
}
// 비교안: PC 메모리를 같은 축(0..PC 전체)에 옅은 선으로 그렸다면(그려 보고 정함, 제품에는 넣지 않음)
async function variant() {
  await withWindow(async (pg) => {
    await openPill(pg);
    const v = call('resources.trend');
    const info = await pg.evaluate((v) => {
      const svg = document.querySelector('[data-role="res-trend-mem"]'); if (!svg) return 'no svg';
      const W = 372, H = 34, pad = 4, span = v.windowMs - v.bucketMs, total = v.totalMemMB;
      const x = (at) => pad + ((at - v.from) / span) * (W - pad * 2);
      const y = (mb) => 3 + (1 - mb / total) * (H - 4);
      const pts = v.points.filter((p) => p.sysMemPct != null);
      const ns = 'http://www.w3.org/2000/svg';
      for (const el of svg.querySelectorAll('.mt-trend-line, .mt-trend-area, .mt-trend-end, .mt-trend-dot')) el.remove();
      const mk = (d, cls) => { const e = document.createElementNS(ns, 'path'); e.setAttribute('d', d); e.setAttribute('class', cls); svg.appendChild(e); return d.length; };
      const a = mk(pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)} ${y((p.sysMemPct / 100) * total).toFixed(1)}`).join(' '), 'mt-trend-sys');
      const b = mk(v.points.filter((p) => p.memMB != null).map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)} ${y(p.memMB).toFixed(1)}`).join(' '), 'mt-trend-line');
      return { a, b, total, n: pts.length };
    }, v);
    log('variant ' + JSON.stringify(info));
    await pg.mouse.move(5, 500); await sleep(300);
    await shotTo(pg, 'variant-pcmem-same-axis', await boxOf(pg, '[data-role="res-trend"]', 6));
  });
}
async function empty() {
  // 백엔드를 다시 켜면 고리가 빈다(메모리에만). 창을 먼저 띄우고 백엔드를 다시 켠 뒤, 첫 측정(3초 뒤) 전에 펼친다
  await withWindow(async (pg) => {
    try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('stop ' + String(e.message).split('\n')[0]); }
    await sleep(1000);
    const t0 = Date.now();
    log(atrium('backend', 'start').trim().slice(0, 200));
    let v = null;
    await until(() => { v = call('resources.trend'); return v; }, 10000, 200);
    log(`trend after restart: points=${v && v.points.length} in ${Date.now() - t0}ms`);
    await until(() => true, 0);
    await pg.waitForFunction(() => { const st = window.__mt && window.__mt.getState(); return st && st.conn === 'open'; }, null, { timeout: 15000 }).catch(() => {});
    await pg.click('[data-role="resources"]').catch(() => {}); await sleep(300);
    // 백엔드는 다시 켠 뒤 3초에 첫 측정을 하고 창은 다시 붙는 데 약 3초가 걸려, 보통 점 하나와 "모으는 중"이 보인다(완전히 빈 그림은 단위 시험 p370-lib)
    const e = await pg.$('[data-role="res-trend-empty"]');
    const from = await pg.$eval('[data-role="res-trend-from"]', (x) => x.textContent).catch(() => null);
    check('empty: collecting state right after a backend restart', !!e || /모으는 중|Collecting/.test(from || ''), { points: v && v.points.length, empty: !!e, from });
    await shotTo(pg, 'trend-ko-empty', await boxOf(pg, '[data-role="resources-list"]', 6));
    await pg.click('[data-role="resources"]').catch(() => {});
    await sleep(36000); // 첫 칸 하나·둘
    await pg.click('[data-role="resources"]').catch(() => {}); await sleep(800);
    await shotTo(pg, 'trend-ko-first-point', await boxOf(pg, '[data-role="res-trend"]', 6));
  });
}
function status() {
  const r = call('resources.get', { fresh: true });
  for (const x of r.sessions) log(`row ${x.name} state=${x.state} mem=${x.memMB} cpu=${x.cpuPct} guard=${JSON.stringify(x.guard || null)}`);
  const v = call('resources.trend');
  log(`trend points=${v.points.length} marks=${JSON.stringify(v.marks)}`);
}
function leftovers() {
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ? { $_.CommandLine -match 'busy\\.js' } | % { '{0}' -f $_.ProcessId }"], { encoding: 'utf8' }).trim();
  return out ? out.split(/\s+/).map(Number) : [];
}
async function stop() {
  const left = leftovers();
  log('fake workers left: ' + JSON.stringify(left));
  for (const pid of left) { try { process.kill(pid); log(`killed ${pid}`); } catch (e) { log(`kill ${pid}: ${e.message}`); } }
  for (const n of ['p370-a1', 'p370-a2', ...AGENTS, 'p370-sh']) { try { const s = sess(n); if (s) log(atrium('kill', s.sessionId, '--yes').trim()); } catch (e) { log('kill', String(e.message).split('\n')[0]); } }
  try { log(atrium('terminal', 'stop', '--yes').trim()); } catch (e) { log('terminal stop', String(e.message).split('\n')[0]); }
  try { log(atrium('backend', 'stop').trim()); } catch (e) { log('backend stop', String(e.message).split('\n')[0]); }
}

if (WHAT === 'setup') await setup();
else if (WHAT === 'drive') await drive(Number(ARG) || 28);
else if (WHAT === 'shots') await shots(ARG || 'ko');
else if (WHAT === 'empty') await empty();
else if (WHAT === 'variant') await variant();
else if (WHAT === 'status') status();
else if (WHAT === 'stop') await stop();
fs.appendFileSync(path.join(OUT, 'results.jsonl'), results.map((r) => JSON.stringify({ what: WHAT, arg: ARG, ...r })).join('\n') + (results.length ? '\n' : ''));
log(`done ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
