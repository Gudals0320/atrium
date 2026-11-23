// P341 창 시험: 폭주 감시와 우선순위 낮추기(실제 개발용 판).
// 판: 따로 띄운 개발용 판(atrium-dev-p341, 48091, 창 원격 디버깅 9572, backend/.dev)만 쓴다. 시험 폴더 C:\Workspace\mtask-p341-a(claude haiku 세션 p341-agent),
//   C:\Workspace\mtask-p341-b(셸 세션 p341-sh). 시험 폴더의 .claude/settings.local.json은 node 명령만 허용한다(에이전트가 가짜 자식을 뒤에서 띄우게).
// 가짜 자식(스스로 끝남): busy.js(코어 하나를 바쁜 고리로, 8분 뒤 끝), grow.js(5초마다 40MB씩 늘려 600MB까지, 8분 뒤 끝). 직접 띄운 것은 stop에서 PID로 정리한다.
// 실행: node app/test/e2e/p341-guard.mjs <setup|bg busy|bg grow|shellbusy|status|shots <tag>|ui <action> <tag>|settings|stop>
// 결과(그림·기록)는 워크트리의 experiments/p341/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'status';
const ARG = process.argv[3] || '';
const ARG2 = process.argv[4] || '';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p341');
const CONVOS = path.join(REPO, 'experiments', 'p341', 'convos');
const DIRS = { a: 'C:\\Workspace\\mtask-p341-a', b: 'C:\\Workspace\\mtask-p341-b' };
const BOARD = 'atrium-dev-p341', PORT = '48091', DEBUG = 9572;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p341-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p341-${WHAT}${ARG ? '-' + ARG : ''}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const ps = (cmd) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8', timeout: 30000 }).trim();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${JSON.stringify(detail).slice(0, 1500)}` : ''}`); };
const sess = (name) => call('session.list').find((s) => s.name === name) || null;
const res = () => call('resources.get', { fresh: true });
const rowOf = (r, name) => (r.sessions || []).find((x) => x.name === name) || null;
const cards = () => (call('decision.list').cards || []).filter((c) => c.kind === 'guard');

const BUSY = "const end = Date.now() + 8 * 60000; console.log('busy pid', process.pid); while (Date.now() < end) { for (let i = 0; i < 1e6; i++); } process.exit(0);\n";
// 바쁜 MCP 서버(쉬는 세션 아래에서 CPU를 쓰는 자식): 최소 JSON-RPC로 답하고, 일꾼 스레드가 8분 동안 바쁜 고리를 돈다. 입력이 닫히면(claude가 끝나면) 끝난다
const BUSY_MCP = "const { Worker } = require('node:worker_threads'); new Worker('const end = Date.now() + 8 * 60000; while (Date.now() < end) { for (let i = 0; i < 1e6; i++); }', { eval: true }); const rl = require('node:readline').createInterface({ input: process.stdin }); const say = (o) => process.stdout.write(JSON.stringify(o) + '\\n'); rl.on('line', (l) => { let m; try { m = JSON.parse(l); } catch { return; } if (m.id == null) return; if (m.method === 'initialize') say({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: (m.params && m.params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'p341busy', version: '1.0.0' } } }); else if (m.method === 'tools/list') say({ jsonrpc: '2.0', id: m.id, result: { tools: [] } }); else say({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'no' } }); }); rl.on('close', () => process.exit(0));\n";
const GROW = "const keep = []; console.log('grow pid', process.pid); const t = setInterval(() => { if (keep.length < 15) { const b = Buffer.alloc(40 * 1048576, 1); keep.push(b); } }, 5000); setTimeout(() => { clearInterval(t); process.exit(0); }, 8 * 60000);\n";

async function setup() {
  for (const d of Object.values(DIRS)) fs.mkdirSync(path.join(d, '.claude'), { recursive: true });
  for (const d of Object.values(DIRS)) { fs.writeFileSync(path.join(d, 'busy.js'), BUSY); fs.writeFileSync(path.join(d, 'grow.js'), GROW); }
  fs.writeFileSync(path.join(DIRS.a, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['Bash(node busy.js)', 'Bash(node grow.js)', 'Bash(node:*)'] } }, null, 2));
  log(atrium('backend', 'start').trim().slice(0, 300));
  for (const [key, value] of [['language', 'en'], ['guardCpuMin', 1], ['guardGrowMin', 1], ['guardDetect', true], ['guardLowerPriority', true], ['mergerMode', 'off'], ['todoTidyMode', 'off'], ['sleepAfterMin', 0], ['sessionSleepAfterMin', 0]]) call('settings.set', { key, value });
  if (!sess('p341-agent')) log(atrium('--json', 'spawn', DIRS.a, '--kind', 'claude', '--model', 'haiku', '--name', 'p341-agent').slice(0, 300));
  if (!sess('p341-sh')) log(atrium('--json', 'spawn', DIRS.b, '--kind', 'shell', '--name', 'p341-sh').slice(0, 200));
  for (let i = 0; i < 60; i++) { const s = sess('p341-agent'); if (s && s.state === 'ready') break; await sleep(2000); }
  log('agent state ' + (sess('p341-agent') || {}).state);
}
// 에이전트에게 가짜 자식을 뒤에서 띄우게 하고 턴을 끝내게 한다(쉬는 세션 아래 자식)
async function bg(which) {
  const f = which === 'grow' ? 'grow.js' : 'busy.js';
  call('session.send', { target: 'p341-agent', text: `Run exactly this command with the Bash tool in the background (run_in_background: true): node ${f}\nDo not wait for it, do not read its output, and do not run anything else. Then reply with the single word: started` });
  for (let i = 0; i < 90; i++) { await sleep(2000); const s = sess('p341-agent'); if (i > 3 && s && (s.state === 'ready' || (s.background && s.background.n > 0 && s.turn && s.turn.endedAt >= s.turn.startedAt))) break; }
  const r = res(); const row = rowOf(r, 'p341-agent');
  log('agent row ' + JSON.stringify(row));
}
// 바쁜 MCP 서버를 쓰는 새 claude 세션(쉬는 중인데 자식이 CPU를 쓴다). 폴더 c(.mcp.json + 프로젝트 MCP 자동 허용)
async function mcpSession() {
  const d = 'C:\\Workspace\\mtask-p341-c';
  fs.mkdirSync(path.join(d, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(d, 'busy-mcp.js'), BUSY_MCP);
  // 프로젝트 .mcp.json은 승인 질문이 뜬다(대신 답하지 않는다). 시험 세션을 띄울 때 --mcp-config로 직접 넘긴다
  try { fs.rmSync(path.join(d, '.mcp.json'), { force: true }); } catch {}
  const cfgFile = path.join(d, 'busy-mcp.json');
  fs.writeFileSync(cfgFile, JSON.stringify({ mcpServers: { p341busy: { command: 'node', args: [path.join(d, 'busy-mcp.js')] } } }, null, 2));
  if (!sess('p341-mcp')) log(atrium('--json', 'spawn', d, '--kind', 'claude', '--model', 'haiku', '--name', 'p341-mcp', '--launcher', 'claude', '--args', `--mcp-config ${cfgFile}`).slice(0, 400));
  for (let i = 0; i < 60; i++) { const s = sess('p341-mcp'); if (s && s.state === 'ready') break; await sleep(2000); }
  await sleep(5000);
  log('mcp row ' + JSON.stringify(rowOf(res(), 'p341-mcp')));
}
async function shellBusy() {
  const s = sess('p341-sh');
  call('session.send', { target: 'p341-sh', text: 'node busy.js' });
  await sleep(3000);
  log('shell row ' + JSON.stringify(rowOf(res(), 'p341-sh')));
}
function prios(r) {
  const out = {};
  for (const row of r.sessions || []) {
    if (!row.shellPid) continue;
    const txt = ps(`$ErrorActionPreference='SilentlyContinue'; $all = Get-CimInstance Win32_Process; function kids($p){ $all | ? { $_.ParentProcessId -eq $p } | % { $_; kids $_.ProcessId } }; @((Get-CimInstance Win32_Process -Filter 'ProcessId=${row.shellPid}')) + @(kids ${row.shellPid}) | % { $g = Get-Process -Id $_.ProcessId; '{0} {1} {2}' -f $_.ProcessId, $_.Name, $g.PriorityClass }`);
    out[row.name] = txt.split(/\r?\n/).filter(Boolean);
  }
  return out;
}
function status() {
  const r = res();
  log('guard status ' + JSON.stringify(r.guard));
  for (const row of r.sessions) log(`row ${row.name} state=${row.state} mem=${row.memMB} cpu=${row.cpuPct} guard=${JSON.stringify(row.guard || null)} topCpu=${JSON.stringify(row.topCpu)}`);
  log('cards ' + JSON.stringify(cards()));
  log('prios ' + JSON.stringify(prios(r)));
  return r;
}
async function withWindow(fn) {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, '--force-device-scale-factor=1'] });
  try { await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {}); await sleep(2500); await fn(page); } finally { await closeApp(app); }
}
const shotTo = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });
const boxOf = (pg, sel, pad = 8) => pg.$eval(sel, (e, p) => { const b = e.getBoundingClientRect(); return { x: Math.max(0, b.x - p), y: Math.max(0, b.y - p), width: Math.min(innerWidth - Math.max(0, b.x - p), b.width + 2 * p), height: Math.min(innerHeight - Math.max(0, b.y - p), b.height + 2 * p) }; }, pad);
async function focusAgent(pg) {
  const id = sess(process.env.P341_TARGET || 'p341-agent').sessionId;
  await pg.evaluate((sid) => { const st = window.__mt.getState(); if (st.navigateTo) st.navigateTo(sid, {}); }, id);
  await sleep(1500);
  return id;
}
async function openTodo(pg) {
  for (let i = 0; i < 20 && !(await pg.$('[data-role="decisions"]')); i++) await sleep(500);
  if (!(await pg.$('[data-role="decisions-list"]'))) await pg.click('[data-role="decisions"]', { timeout: 5000 });
  await pg.waitForSelector('[data-role="decisions-list"]', { timeout: 8000 });
  await sleep(500);
}
async function shots(tag) {
  await withWindow(async (pg) => {
    for (const lang of ['en', 'ko']) {
      call('settings.set', { key: 'language', value: lang }); await sleep(1200);
      const id = await focusAgent(pg);
      const node = `.react-flow__node-session[data-id="${id}"]`;
      const badge = await pg.$(`${node} [data-role="guard-badge"]`);
      check(`${tag} ${lang}: canvas node badge`, !!badge, badge ? await badge.innerText() : null);
      if (await pg.$(node)) await shotTo(pg, `${tag}-node-${lang}`, await boxOf(pg, node, 12));
      await openTodo(pg);
      const card = await pg.$('[data-role="decision"][data-kind="guard"]');
      check(`${tag} ${lang}: to-do card`, !!card, card ? (await card.innerText()).replace(/\s+/g, ' ') : null);
      await shotTo(pg, `${tag}-todo-${lang}`, await boxOf(pg, '[data-role="decisions-list"]', 6));
      await pg.click('[data-role="decisions"]').catch(() => {}); await sleep(300);
      await pg.click('[data-role="resources"]'); await sleep(700);
      const hl = await pg.$('[data-role="resources-list"] [data-guard]');
      check(`${tag} ${lang}: memory pill row highlighted`, !!hl);
      await shotTo(pg, `${tag}-pill-${lang}`, await boxOf(pg, '[data-role="resources-list"]', 6));
      await pg.click('[data-role="resources"]').catch(() => {}); await sleep(300);
      // 세션 맵
      await pg.keyboard.press('Escape').catch(() => {});
      await pg.click('[data-action="chip-mission"]').catch(() => {});
      await sleep(3000);
      const mb = await pg.$('[data-role="map-tags"] [data-role="guard-badge"]');
      check(`${tag} ${lang}: session map badge`, !!mb, mb ? await mb.innerText() : null);
      if (mb) { const slot = await pg.$('[data-role="ta-slot"]:has([data-role="guard-badge"])'); await shotTo(pg, `${tag}-map-${lang}`, slot ? await boxOf(pg, '[data-role="ta-slot"]:has([data-role="guard-badge"])', 40) : null); }
      else await shotTo(pg, `${tag}-map-${lang}-full`);
      await pg.click('[data-action="mission-close"]').catch(() => {}); await sleep(600);
    }
    call('settings.set', { key: 'language', value: 'en' });
  });
}
// 카드의 단추를 창에서 누른다(kill은 두 번: 확인)
async function ui(action, tag) {
  await withWindow(async (pg) => {
    await focusAgent(pg);
    await openTodo(pg);
    const sel = `[data-role="decision"][data-kind="guard"] [data-action="guard-${action}"]`;
    const btn = await pg.$(sel);
    check(`ui ${action}: button shown`, !!btn);
    if (!btn) { await shotTo(pg, `${tag}-no-${action}`); return; }
    await btn.click();
    if (action === 'kill') { await sleep(300); await shotTo(pg, `${tag}-kill-confirm`, await boxOf(pg, '[data-role="decisions-list"]', 6)); await pg.click(sel); }
    await sleep(2500);
    if (await pg.$('[data-role="decisions-list"]')) await shotTo(pg, `${tag}-after-${action}`, await boxOf(pg, '[data-role="decisions-list"]', 6));
    const id = await focusAgent(pg);
    const node = `.react-flow__node-session[data-id="${id}"]`;
    if (await pg.$(node)) await shotTo(pg, `${tag}-node-after-${action}`, await boxOf(pg, node, 12));
  });
}
async function settingsShots() {
  await withWindow(async (pg) => {
    for (const lang of ['en', 'ko']) {
      call('settings.set', { key: 'language', value: lang }); await sleep(1000);
      await pg.click('[data-role="top-right"] [data-action="settings-open"]');
      await pg.waitForSelector('[data-role="settings-tabs"]', { timeout: 8000 });
      await pg.click('[data-role="settings-tabs"] [data-tab="resources"]'); await sleep(500);
      await pg.click('[data-action="guard-advanced"]'); await sleep(400);
      const rows = await pg.$$eval('[data-role="resources-settings"] [data-set-id]', (els) => els.map((e) => e.dataset.setId));
      check(`settings ${lang}: resources page rows`, rows.includes('guardLowerPriority') && rows.includes('guardCpuPct'), rows);
      await shotTo(pg, `settings-resources-${lang}`, await boxOf(pg, '[data-role="settings"]', 4));
      await pg.click('[data-action="settings-close"]'); await sleep(400);
    }
    call('settings.set', { key: 'language', value: 'en' });
  });
}
async function stop() {
  // 직접 띄운 가짜 자식(busy.js·grow.js)은 명령줄로 찾되 PID로 끈다(이 시험 폴더의 것만)
  const left = ps("Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ? { $_.CommandLine -match '(busy|grow)\\.js' } | % { '{0}|{1}' -f $_.ProcessId, $_.CommandLine }");
  log('fake children left: ' + JSON.stringify(left));
  for (const n of ['p341-agent', 'p341-sh', 'p341-mcp']) { try { const s = sess(n); if (s) log(atrium('kill', s.sessionId, '--yes').trim()); } catch (e) { log('kill', e.message.split('\n')[0]); } }
  try { log(atrium('terminal', 'stop', '--yes').trim()); } catch (e) { log('terminal stop', e.message.split('\n')[0]); }
  try { log(atrium('backend', 'stop').trim()); } catch (e) { log('backend stop', e.message.split('\n')[0]); }
}

if (WHAT === 'setup') await setup();
else if (WHAT === 'bg') await bg(ARG);
else if (WHAT === 'shellbusy') await shellBusy();
else if (WHAT === 'mcp') await mcpSession();
else if (WHAT === 'shellwin') await withWindow(async (pg) => { const id = sess('p341-sh').sessionId; await pg.evaluate((sid) => { const st = window.__mt.getState(); if (st.navigateTo) st.navigateTo(sid, { focusTerminal: true }); }, id); await sleep(2000); await pg.keyboard.type('node busy.js'); await pg.keyboard.press('Enter'); await sleep(3000); log('shell row ' + JSON.stringify(rowOf(res(), 'p341-sh'))); });
else if (WHAT === 'say') { call('session.send', { target: ARG, text: 'Reply with the single word: ok' }); for (let i = 0; i < 60; i++) { await sleep(2000); const s = sess(ARG); if (i > 2 && s && s.state === 'ready') break; } log('state ' + sess(ARG).state); }
else if (WHAT === 'kill') { const s = sess(ARG); if (s) log(atrium('kill', s.sessionId, '--yes').trim()); }
else if (WHAT === 'status') status();
else if (WHAT === 'shots') await shots(ARG || 'live');
else if (WHAT === 'ui') await ui(ARG, ARG2 || ARG);
else if (WHAT === 'settings') await settingsShots();
else if (WHAT === 'stop') await stop();
else if (WHAT === 'report') log(atrium('resources', '--days', '1'));
else if (WHAT === 'peek') await withWindow(async (pg) => { await focusAgent(pg); await shotTo(pg, `peek-${ARG || 'x'}`); log(await pg.evaluate(() => [...document.querySelectorAll('[data-role]')].slice(0, 40).map((e) => e.dataset.role).join(','))); });
else if (WHAT === 'backend') log(atrium('backend', ARG || 'start').trim().slice(0, 400)); // 이 판(48091)의 백엔드만
else if (WHAT === 'terminal') log(atrium('terminal', 'stop', '--yes').trim().slice(0, 400));
fs.appendFileSync(path.join(OUT, 'results.jsonl'), results.map((r) => JSON.stringify({ what: WHAT, arg: ARG, ...r })).join('\n') + (results.length ? '\n' : ''));
log(`done ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
