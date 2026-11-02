// P16 창 시험(완료 기준 1·2): 기본(영어)과 한국어로 같은 판을 찍어 견주고, 영어 화면에 한글이 남지 않았는지 찾는다.
// 찍는 화면: 판 전체, 아래 바, 승인 줄이 뜬 콘솔(rev), 설정, 사이드바(보관함, missed 함), 새 세션 대화상자, 트레이 메뉴 글(JSON).
// 한글 찾기는 사용자 내용(세션 이름, 대화 제목·지시·답, 메모·칸반 글, 워크스페이스 이름, 터미널 안 글, 채팅 보기)을 뺀다:
//   화면 글의 한글 덩어리가 판 상태와 사이드바 자료(사용자 내용, label 같은 백엔드 표시 글은 뺌)에 그대로 있으면 사용자 내용으로 본다.
// 언어 바꾸기는 설정의 Language로 하고, 창을 다시 읽지 않았는지(표식이 남는지) 본다. 창을 다시 켜도 고른 언어가 남는지 본다. 끝나면 영어로 돌린다.
// 판: P16 판(p11-scene.mjs setup 뒤, rev가 Bash 권한을 묻고 기다림). 사용: node experiments/p16/tools/e2e.cjs p16-lang.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launch, closeApp, logger, sleep, until, call, writeJson, atrium, OUT } from './p10-lib.mjs';

if (process.env.MT_E2E_BOARD !== 'p16') throw new Error('P16 판에서만 돈다(experiments/p16/tools/e2e.cjs)');
const log = logger('p16-lang');
const result = { steps: [], hangul: {}, tray: {} };
const step = (name, ok, data = {}) => { result.steps.push({ name, ok: !!ok, ...data }); log(`${ok ? '통과' : '실패'}: ${name}`, JSON.stringify(data).slice(0, 600)); };
const shot = async (page, name, opts = {}) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f, ...opts }); log('찍음', f); };
const W = 1584, H = 921;

// 화면에 보이는 글(글 마디, title, placeholder, aria-label)에서 사용자 내용이 아닌 한글을 찾는다
async function hangulLeft(page, where) {
  const found = await page.evaluate(async () => {
    const st = window.__mt.getState();
    const api = window.__mt.api;
    const drop = (k, v) => (['label', 'reasonLabel', 'message', 'msg', 'labelMsg'].includes(k) ? undefined : v);
    const side = await Promise.all(['recall.list', 'archive.list', 'missed.list'].map((m) => api.call(m, {}).catch(() => null)));
    const corpus = JSON.stringify({
      sessions: [...st.sessions.values()], convos: [...st.convoNodes.values()], memos: [...st.memos.values()], kanbans: [...st.kanbans.values()],
      thread: [...st.thread.values()], workspaces: st.workspaces, groups: [...st.groups.values()], links: [...st.links.values()], deliveries: [...st.deliveries.values()], side,
    }, drop).replace(/\\n/g, ' ');
    const skip = (el) => el && el.closest && el.closest('.xterm, .mt-chat, [contenteditable], .mt-md, textarea, input, select');
    const texts = [];
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const el = n.parentElement;
      if (!el || skip(el) || !/[가-힣]/.test(n.nodeValue)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
      texts.push({ text: n.nodeValue.trim(), where: el.className && String(el.className).slice(0, 40) });
    }
    for (const el of document.querySelectorAll('[title], [placeholder], [aria-label]')) {
      if (skip(el)) continue;
      for (const a of ['title', 'placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v && /[가-힣]/.test(v)) texts.push({ text: v, where: `@${a} ${String(el.className).slice(0, 30)}` }); }
    }
    const bad = [];
    for (const t of texts) {
      const runs = t.text.match(/[가-힣]+(?: +[가-힣]+)*/g) || []; // 한글 낱말 덩어리(사이의 빈칸만 잇는다)
      const miss = runs.filter((r) => !corpus.includes(r) && !(r === '한국어'));
      if (miss.length) bad.push({ text: t.text.slice(0, 120), where: t.where, miss });
    }
    return bad;
  });
  result.hangul[where] = found;
  step(`영어 화면에 사용자 내용 밖의 한글이 없다: ${where}`, found.length === 0, { found: found.slice(0, 8) });
  return found;
}
const lang = (page) => page.evaluate(() => (window.__mt.getState().settings || {}).language);
const setLang = async (page, l) => { await call(page, 'settings.set', { key: 'language', value: l }); await until(async () => (await lang(page)) === l, 5000); await sleep(400); };
const chipText = (page) => page.$eval('[data-action="chip-arrange"]', (e) => e.textContent);
const fit = (page) => page.evaluate(() => window.__mt.getState().fitAll && window.__mt.getState().fitAll(0));
const goRev = async (page) => {
  await page.evaluate(() => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === 'rev'); if (s) window.__mt.getState().navigateTo(s.sessionId); });
  await sleep(1500);
};

// 한 언어의 화면 묶음을 찍는다(영어면 한글도 찾는다)
async function screens(app, page, l) {
  const check = l === 'en' ? (w) => hangulLeft(page, w) : async () => {};
  await page.evaluate(() => { if (document.querySelector('[data-role="sidebar"]')) document.querySelector('[data-action="sidebar"]').click(); });
  await fit(page); await sleep(1200);
  await shot(page, `p16-${l}-1-board`); await check('board');
  await shot(page, `p16-${l}-2-bottom`, { clip: { x: 0, y: H - 150, width: W, height: 150 } });
  // 위 알약의 펼침 목록
  await page.click('[data-role="inbox"]'); await sleep(300); await check('inbox-list'); await shot(page, `p16-${l}-3-inbox`, { clip: { x: W - 760, y: 0, width: 760, height: 260 } }); await page.click('[data-role="inbox"]');
  // 승인 줄
  await goRev(page);
  const ap = await page.$('.mt-node[data-name="rev"] [data-role="approval"]');
  step(`${l}: rev의 승인 줄이 보인다`, !!ap);
  const node = await page.$('.mt-node[data-name="rev"]');
  if (node) await node.screenshot({ path: path.join(OUT, `p16-${l}-4-approval.png`) });
  await check('approval-console');
  // 노드 X(닫기 확인) 뒤 취소
  if (await page.$('.mt-node[data-name="rev"] [data-action="kill"]')) {
    await page.click('.mt-node[data-name="rev"] [data-action="kill"]');
    await page.waitForFunction(() => { const k = document.querySelector('.mt-node[data-name="rev"] [data-role="kill-confirm"]'); return k && k.getAttribute('data-loading') === '0'; }, null, { timeout: 10000 }).catch(() => {});
    await check('close-confirm'); if (node) await node.screenshot({ path: path.join(OUT, `p16-${l}-5-close-confirm.png`) });
    await page.click('.mt-node[data-name="rev"] [data-action="close-cancel"]').catch(() => {});
  }
  // 설정
  await page.click('[data-action="settings-open"]'); await page.waitForSelector('[data-role="settings"]'); await sleep(400);
  await shot(page, `p16-${l}-6-settings`); await check('settings');
  await page.click('[data-role="settings"] [data-action="settings-close"]').catch(() => {}); await sleep(300);
  // 새 세션 대화상자
  await page.click('[data-action="chip-spawn"]'); await sleep(600);
  await shot(page, `p16-${l}-7-spawn`); await check('spawn-dialog');
  await page.click('[data-role="spawn"] button.ghost').catch(() => {}); await sleep(200);
  // 사이드바: 보관함, missed 함
  await page.click('[data-action="sidebar"]'); await page.waitForSelector('[data-role="sidebar"]'); await sleep(800);
  await shot(page, `p16-${l}-8-sidebar`); await check('sidebar');
  await page.click('[data-role="archive-box"] [data-action="archive-box"]').catch(() => {}); await sleep(800);
  await page.evaluate(() => { const el = document.querySelector('[data-role="archive-box"]'); if (el) el.scrollIntoView({ block: 'start' }); }); await sleep(300);
  await shot(page, `p16-${l}-9-archive`); await check('archive-box');
  await page.click('[data-role="missed-box"] .mt-sb-archive-head').catch(() => {}); await sleep(1000);
  await page.evaluate(() => { const el = document.querySelector('[data-role="missed-box"]'); if (el) el.scrollIntoView({ block: 'start' }); }); await sleep(300);
  await shot(page, `p16-${l}-10-missed`); await check('missed-box');
  await page.click('[data-action="sidebar"]'); await sleep(400);
  // 그 밖의 창: 미션 맵, 검색, Thread, 루프 목록, 바뀐 것
  // 키를 누르지 않는다: 초점이 터미널에 있으면 Esc가 승인 줄의 거부가 된다
  await page.click('[data-action="mission-rail"]'); await sleep(800); await check('mission-map'); await shot(page, `p16-${l}-11-mission`); await page.click('[data-action="mission-close"]').catch(() => {}); await sleep(300);
  await page.click('[data-action="search"]'); await sleep(300); await page.fill('[data-role="search"] input, .mt-search input', 're').catch(() => {}); await sleep(800); await check('search'); await shot(page, `p16-${l}-12-search`); await page.press('[data-role="search"] input', 'Escape').catch(() => {}); // 초점이 검색칸에 있을 때만 Esc await sleep(200);
  await page.click('[data-action="thread-toggle"]').catch(() => {}); await sleep(600); await check('thread'); await shot(page, `p16-${l}-13-thread`); await page.click('[data-action="thread-toggle"]').catch(() => {});
  await page.click('[data-action="loops-open"]').catch(() => {}); await sleep(400); await check('loops'); await page.click('[data-action="loops-open"]').catch(() => {});
  await page.click('[data-action="chip-changes"]').catch(() => {}); await sleep(800); await check('changes'); await shot(page, `p16-${l}-14-changes`); await page.click('[data-action="return-close"]').catch(() => {});
  // 트레이 메뉴 글
  await until(async () => (await app.evaluate(() => global.__mtTray.state())).lang === l, 5000).catch(() => {});
  const tray = await app.evaluate(() => global.__mtTray.state());
  result.tray[l] = { menu: tray.menu, tooltip: tray.tooltip, lang: tray.lang };
  fs.writeFileSync(path.join(OUT, `p16-${l}-tray.txt`), [`tooltip: ${tray.tooltip}`, ...tray.menu].join('\n'));
  if (l === 'en') step('영어: 트레이 메뉴와 툴팁에 한글이 없다(세션 이름 빼고)', tray.lang === 'en' && ![tray.tooltip, ...tray.menu].some((x) => /[가-힣]/.test(x.replace(/@\S+/g, ''))), result.tray.en);
  else step('한국어: 트레이 메뉴가 한국어', tray.lang === 'ko' && tray.menu.includes('열기'), result.tray.ko);
}

let { app, page } = await launch({ log });
try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 921)); await sleep(500);
  result.initialLanguage = await lang(page);
  log('처음 언어', result.initialLanguage);
  await setLang(page, 'en');
  await until(async () => { const s = await page.evaluate(() => [...window.__mt.getState().sessions.values()].find((x) => x.name === 'rev')); return s && s.state === 'waiting'; }, 120000, 1500)
    .catch(() => log('rev가 기다리지 않는다(p11-scene setup, p11-turn 1단계 먼저)'));
  step('기본 영어: 아래 바 칩과 명령 입력 안내', (await chipText(page)) === 'Arrange' && /@name to direct · Enter to send · Shift\+Enter newline · Ctrl\+K/.test(await page.$eval('[data-role="command"]', (e) => e.placeholder).catch(() => '')), {
    chips: await page.$$eval('[data-role="chips"] .mt-qchip', (es) => es.map((e) => e.textContent)),
    pills: await page.$$eval('[data-role="top-right"] .mt-cp', (es) => es.map((e) => e.innerText.replace(/\s+/g, ' ').trim())),
  });
  await screens(app, page, 'en');

  // 설정의 Language로 한국어: 창을 다시 읽지 않고 곧바로
  await page.evaluate(() => { window.__p16mark = 1; });
  await page.click('[data-action="settings-open"]'); await page.waitForSelector('[data-role="settings"] [data-field="setting-language"]');
  const t0 = Date.now();
  await page.click('[data-field="setting-language"] [data-lang="ko"]');
  await page.waitForFunction(() => document.querySelector('[data-role="settings"] h3') && /설정/.test(document.querySelector('[data-role="settings"] h3').textContent), null, { timeout: 3000 });
  const ms = Date.now() - t0;
  await page.click('[data-role="settings"] [data-action="settings-close"]').catch(() => {}); await sleep(300);
  const kept = await page.evaluate(() => window.__p16mark === 1);
  await until(async () => (await lang(page)) === 'ko', 5000).catch(() => {});
  step('설정에서 한국어를 고르면 다시 읽지 않고 곧바로 바뀐다(칩, 판 설정)', kept && (await chipText(page)) === '정리' && (await lang(page)) === 'ko', { ms, kept, chip: await chipText(page), setting: await lang(page) });
  await screens(app, page, 'ko');

  // 다시 켜도 한국어가 남는다
  await closeApp(app); await sleep(1500);
  ({ app, page } = await launch({ log }));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 921));
  await until(async () => (await lang(page)) === 'ko', 15000).catch(() => {});
  await sleep(800);
  step('창을 다시 켜도 고른 언어(한국어)가 남는다', (await lang(page)) === 'ko' && (await chipText(page)) === '정리', { setting: await lang(page), chip: await chipText(page) });
  await setLang(page, 'en');
  step('영어로 돌린다', (await chipText(page)) === 'Arrange');
} catch (e) {
  log('오류', e.stack);
  result.error = String(e && e.message);
  await shot(page, 'p16-error').catch(() => {});
} finally {
  writeJson('p16-lang.json', result);
  await closeApp(app);
}
const failed = result.steps.filter((s) => !s.ok);
log(`끝: 통과 ${result.steps.length - failed.length}/${result.steps.length}${result.error ? ` 오류 ${result.error}` : ''}`);
process.exit(failed.length || result.error ? 1 : 0);
