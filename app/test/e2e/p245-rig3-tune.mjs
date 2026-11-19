// P245 창 시험: rig 3 판의 역할 줄 정의서 판·조정 수, 조정 기록 펼치기, 손 박자 뒤 꼭지의 "역할이 바꾼 것", 사람의 [되돌리기]. ko·en 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p245, 48004, 창 9484)만. 시험 폴더 C:\Workspace\mtask-p245-rig(역할 data·ideas·verify, haiku), rig는 켜져 있고
// 조정이 하나 이상 반영된 뒤에 돈다. 실행: sh backend/.dev/dev.sh node app/test/e2e/p245-rig-tune.mjs [round]   결과는 backend/.dev/p245-exp/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const WS = process.env.P245_WS || 'C:/Workspace/mtask-p245-rig';
const ROLE = process.env.P245_ROLE || 'ideas';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'backend', '.dev', 'p245-exp', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p245' || process.env.ATRIUM_PORT !== '48004') throw new Error('개발용 판(atrium-dev-p245, 48004) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, until } = await import('./harness.mjs');
const log = logger('p245-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1500)) : '')); };
const ko = (await import('../../src/renderer/locales/ko.js')).default;
const en = (await import('../../src/renderer/locales/en.js')).default;
const st0 = call('rig.status', { workspace: WS });
const KEY = st0.workspace;
if (st0.state !== 'on') throw new Error('rig가 켜진 판에서 돈다');
const tuneOf = (st, r) => st.rig3.roles.find((x) => x.name === r).tune;
if (!tuneOf(st0, ROLE) || !tuneOf(st0, ROLE).tunes) throw new Error(ROLE + '에 반영된 조정이 있어야 한다');
async function regionMenu(page, action, sel) {
  await page.click('.mt-region[data-ws="' + KEY + '"] .mt-region-name', { button: 'right' });
  await page.waitForSelector('[data-role=region-menu] [data-action=' + action + ']', { timeout: 8000 });
  await page.click('[data-role=region-menu] [data-action=' + action + ']');
  await page.waitForSelector(sel, { timeout: 10000 });
}
async function shotEl(page, sel, name) { await page.locator(sel).first().screenshot({ path: path.join(OUT, name + '.png') }); log('스크린숏 ' + name + '.png'); }
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(400); }
const fill = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.split('{' + k + '}').join(String(x)), s);
const tuneSec = (txt) => { const m = /## 요령[^\n]*\n([\s\S]*?)(?=\n## |$)/.exec(txt); return m ? m[1].trim() : null; };
const docOf = (r) => fs.readFileSync(path.join(WS, '.atrium', 'roles', r + '.md'), 'utf8');

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9484'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1100 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await lang(page, 'ko');
  await regionMenu(page, 'rig-panel', '[data-role=rig-panel]');
  await page.waitForSelector('[data-role=rig-tune-cell]', { timeout: 10000 });
  const t0 = tuneOf(call('rig.status', { workspace: WS }), ROLE);
  const badge = await page.evaluate((r) => { const b = document.querySelector('tr[data-role-name="' + r + '"] [data-action=rig-tune-toggle]'); return b ? { text: b.textContent, n: b.dataset.tuneN, k: b.dataset.tunes } : null; }, ROLE);
  check('역할 줄의 정의서 판·조정 수(ko)가 판과 같다', badge && badge.n === String(t0.n) && badge.k === String(t0.tunes) && badge.text.startsWith(fill(ko.rigTune.badge, { n: t0.n, k: t0.tunes })), { badge, t0 });
  await page.click('tr[data-role-name="' + ROLE + '"] [data-action=rig-tune-toggle]');
  await page.waitForSelector('[data-role=rig-tune-log] li', { timeout: 10000 });
  const info = call('rig.role', { workspace: WS, role: ROLE });
  const ui = await page.evaluate(() => ({ text: document.querySelector('[data-role=rig-tune-text]').textContent, kinds: [...document.querySelectorAll('[data-role=rig-tune-log] li')].map((l) => l.dataset.tuneKind), undo: [...document.querySelectorAll('[data-action=rig-tune-undo]')].map((b) => b.dataset.undo) }));
  check('펼친 요령 칸이 정의서와 같다', ui.text.trim() === String(info.tune).trim(), ui.text);
  check('조정 기록(새 것부터)과 [되돌리기]', ['tune', 'rollback'].includes(ui.kinds[0]) && ui.kinds.length === info.log.length && ui.undo.length >= 1, ui);
  await shotEl(page, '[data-role=rig-panel]', '01-rig3-tune-ko');
  // 손 박자 → 앞 사이클 꼭지(AI 글 + 판의 숫자)에 "역할이 바꾼 것"
  const c0 = call('rig.status', { workspace: WS }).rig3.cycle.n;
  await page.click('[data-action=rig-beat]');
  await until(() => call('rig.status', { workspace: WS }).rig3.cycle.entries.some((e) => e.n === c0), 120000, 1000);
  const entry = call('rig.status', { workspace: WS }).rig3.cycle.entries.find((e) => e.n === c0);
  check('꼭지의 "역할이 바꾼 것"에 조정·되돌림(판 번호, 근거)이 판의 글로 든다', new RegExp('\\*\\*역할이 바꾼 것\\*\\*[\\s\\S]*- ' + ROLE + ' 요령 칸( 판 \\d+→\\d+ \\(\\+\\d+ −\\d+\\): .* — 근거 \\[|을 사람이 판 \\d+의 것으로 되돌림 → 판 \\d+)').test(entry.text), entry.text.slice(0, 1500));
  fs.writeFileSync(path.join(OUT, 'entry-' + c0 + '.md'), entry.text);
  await sleep(1500);
  await shotEl(page, '[data-role=rig-panel]', '02-rig3-entry-ko');
  // 사람의 되돌리기: ROLE의 마지막 조정 앞 판으로. 다른 역할의 정의서는 그대로
  const others = Object.fromEntries(['data', 'ideas', 'verify'].filter((r) => r !== ROLE).map((r) => [r, tuneSec(docOf(r))]));
  const want = Number(ui.undo[0]);
  const nBefore = call('rig.status', { workspace: WS }).version;
  await page.click('[data-action=rig-tune-undo][data-undo="' + want + '"]');
  await until(() => call('rig.status', { workspace: WS }).version > nBefore, 15000, 500);
  const oldBody = (() => { const x = call('rig.role', { workspace: WS, role: ROLE }); return x; })();
  check('되돌린 뒤 ' + ROLE + ' 요령 칸이 바뀌고 정의서 판이 새 판이다', String(oldBody.tune).trim() !== String(info.tune).trim() && oldBody.n === call('rig.status', { workspace: WS }).version, { before: info.tune, after: oldBody.tune, n: oldBody.n });
  check('다른 역할의 정의서 요령 칸은 그대로', Object.entries(others).every(([r, t]) => tuneSec(docOf(r)) === t), others);
  const ev = call('rig.events', { workspace: WS, limit: 2000 }); // 꼬리 읽기는 limit+1을 읽고 앞 limit줄을 돌려줘 가장 새 줄이 빠질 수 있다(rig 2 장부 읽기, 기록 참고)
  const rb = (ev.rows || ev).filter((r) => r.kind === 'role_rollback').at(-1);
  check('장부 role_rollback(사람, 판 ' + want + ')', !!rb && rb.actor === 'human' && rb.value === String(want) && rb.seat === ROLE, rb);
  await page.waitForSelector('[data-role=rig-tune-log] li[data-tune-kind=rollback]', { timeout: 10000 }).catch(() => {});
  await sleep(800);
  await shotEl(page, '[data-role=rig-panel]', '03-rig3-rollback-ko');
  await lang(page, 'en');
  await sleep(800);
  const col = await page.evaluate(() => [...document.querySelectorAll('[data-role=rig-roles] th')].map((x) => x.textContent).at(-1));
  check('사전(en)', col === en.rigTune.col, col);
  await shotEl(page, '[data-role=rig-panel]', '04-rig3-tune-en');
  await lang(page, 'ko');
} finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await closeApp(app).catch(() => {});
}
log('결과 ' + results.filter((r) => r.ok).length + '/' + results.length);
process.exit(results.every((r) => r.ok) ? 0 : 1);
