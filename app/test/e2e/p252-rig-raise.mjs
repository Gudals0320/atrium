// P252 창 시험: 지도·rig 판의 주기를 사람 말로(ko·en), rig 판의 올림 줄에서 사람이 답해 닫기(지도 "올림 n"·캔버스 점선이 사라짐).
// 판: 따로 띄운 개발용 판(atrium-dev-p252, 48004, 창 9484)만. 시험 폴더 C:\Workspace\mtask-p252-rig(역할 ideas·verify, 박자 1d 07:00, 도구 check 6h).
// 준비(역할 둘이 올리고 빌더가 raise-1에 답함, 하나는 기다림)는 이 시험 밖에서 한다(작업 기록). 실행: sh backend/.dev/dev.sh node app/test/e2e/p252-rig-raise.mjs [round]
// 결과는 experiments/p252/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p252', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p252' || process.env.ATRIUM_PORT !== '48004') throw new Error('개발용 판(atrium-dev-p252, 48004) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p252-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : '')); };
const WS = 'C:/Workspace/mtask-p252-rig';
const KEY = call('rig.status', { workspace: WS }).workspace;
const WANT = {
  ko: { beat: '매일 07:00', tool: '6시간마다', raises: '올림 1', next: '(매일 07:00', toolLine: 'check: 6시간마다, 다음' },
  en: { beat: 'every day 07:00', tool: 'every 6 hours', raises: 'raised 1', next: '(every day 07:00', toolLine: 'check: every 6 hours, next' },
};
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(500); }
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); log('스크린숏 ' + name + '.png'); };
async function openMap(page) {
  await page.click('[data-action="mission-rail"]');
  await page.waitForSelector('[data-role="rig-map"]', { timeout: 20000 }); await sleep(800);
  const m = await page.evaluate((k) => { const it = window.__mtTa.lay().rig.items.find((x) => x.key === k); return { x: it.x, y: it.y, w: it.w, h: it.h }; }, KEY);
  await page.evaluate((m) => { const vw = window.innerWidth - window.__mtTa.sumW(), vh = window.innerHeight; const k = Math.min((vw - 260) / m.w, (vh - 220) / m.h); window.__mtTa.set({ k, x: 220 - m.x * k, y: 100 - m.y * k }); }, m);
  await sleep(900);
}
const mapText = (page) => page.evaluate(() => ({
  beat: [...document.querySelectorAll('[data-role=rm-beat]')].map((e) => e.textContent.trim()),
  tool: [...document.querySelectorAll('[data-role=rm-tool-every]')].map((e) => e.textContent.trim()),
  raises: (document.querySelector('[data-role=rm-raises]') || {}).textContent || null,
  raiseLines: [...document.querySelectorAll('[data-role=rm-line][data-kind=raise]')].length,
}));
const canvasRaise = async (page) => {
  const ids = await page.evaluate((k) => [...window.__mt.getState().sessions.values()].filter((s) => s.workspaceKey === k && s.rigRole).map((s) => s.sessionId), KEY);
  await page.evaluate((ids) => window.__mtFlow.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.08, duration: 0 }), ids);
  await sleep(1200);
  return page.evaluate(() => [...document.querySelectorAll('[data-role=rig-raise-label]')].map((e) => e.textContent));
};

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9484'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await page.waitForFunction((k) => window.__mt.getState().rigMaps.has(k), KEY, { timeout: 20000 });
  const before = call('rig.map', { workspace: WS }).maps[0].raises.map((x) => x.id);
  const RID = before[0];
  check('준비: 기다리는 올림은 하나(raise-1은 빌더가 답해 닫음)', before.length === 1 && RID !== 'raise-1', before);
  for (const l of ['ko', 'en']) {
    const w = WANT[l];
    await lang(page, l);
    const cv = await canvasRaise(page);
    check('캔버스(' + l + '): 올림 점선은 기다리는 올림 하나', cv.length === 1, cv);
    await shot(page, '01-canvas-' + l);
    await openMap(page);
    const mt = await mapText(page);
    check('지도(' + l + '): 박자 "' + w.beat + '", 도구 "' + w.tool + '", 빌더 카드 "' + w.raises + '"', mt.beat.includes(w.beat) && mt.tool.includes(w.tool) && mt.raises === w.raises && mt.raiseLines === 1, mt);
    await shot(page, '02-map-' + l);
    // 머리 띠를 누르면 rig 판
    await page.click('[data-role=rm-head]');
    await page.waitForSelector('[data-role=rig-panel]', { timeout: 10000 }); await sleep(700);
    const pn = await page.evaluate(() => ({ next: (document.querySelector('[data-role=rig-next-beat]') || {}).textContent || '', tools: (document.querySelector('[data-role=rig-clock-tools]') || {}).textContent || '', raises: [...document.querySelectorAll('[data-role=rig-raises] [data-raise]')].map((e) => [e.dataset.raise, e.dataset.raiseRole, e.textContent]) }));
    check('rig 판(' + l + '): 다음 박자·도구 주기 사람 말, 기다리는 올림 줄 ' + RID, pn.next.includes(w.next) && pn.tools.includes(w.toolLine) && pn.raises.length === 1 && pn.raises[0][0] === RID, pn);
    await page.click(`[data-raise=${RID}] [data-action=rig-raise-answer]`);
    await page.fill('[data-role=rig-raise-text]', l === 'ko' ? '칸 이름은 이번 사이클에는 정하지 않는다' : 'Card fields stay open for this cycle');
    await page.evaluate(() => document.querySelector('[data-role=rig-raises]').scrollIntoView({ block: 'center' }));
    await sleep(400);
    await shot(page, '03-panel-answer-' + l);
    if (l === 'ko') { await page.click(`[data-raise=${RID}] .mt-card-actions .mt-btn.ghost`); await sleep(300); await page.click('[data-action=rig-panel-close]'); await sleep(500); await page.keyboard.press('Escape'); await sleep(500); continue; }
    // en: 보내 닫는다
    await page.click('[data-action=rig-raise-send]');
    await page.waitForFunction(() => !document.querySelector('[data-role=rig-raises]'), null, { timeout: 10000 }).catch(() => {});
    await sleep(600);
    const gone = !(await page.$('[data-role=rig-raises]'));
    const ev = call('rig.events', { workspace: WS, kinds: 'raise_answer' }).rows.map((r) => [r.ref, r.value, r.actor]);
    check('rig 판(en): 답하고 닫기 → 올림 줄이 사라지고 장부 raise_answer(human)', gone && ev.some((r) => r[0] === RID && r[1] === 'human' && r[2] === 'human'), { gone, ev });
    await shot(page, '04-panel-answered-en');
    await page.click('[data-action=rig-panel-close]'); await sleep(500); await page.keyboard.press('Escape'); await sleep(800);
    await openMap(page);
    const mt2 = await mapText(page);
    check('지도(en): 답한 뒤 빌더 카드 "올림 n"과 올림 선이 사라짐', !mt2.raises && mt2.raiseLines === 0, mt2);
    await shot(page, '05-map-after-en');
    await page.keyboard.press('Escape'); await sleep(600);
    const cv2 = await canvasRaise(page);
    check('캔버스(en): 답한 뒤 올림 점선 없음', cv2.length === 0, cv2);
    await shot(page, '06-canvas-after-en');
  }
} catch (e) { check('예외 없이 끝남', false, e.stack || String(e)); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log('결과 ' + results.filter((r) => r.ok).length + '/' + results.length);
  await closeApp(app);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
