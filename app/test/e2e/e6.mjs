// E6: 터미널 노드(xterm.js)에서 한글 IME 입력(BRIEF 위험 1). CDP 조합 이벤트(Input.imeSetComposition, Input.insertText)로
// Microsoft 한국어 IME가 내는 것과 같은 순서(조합 중 글자 → 확정)를 흉내 낸다. 실제 IME 창과 키 입력은 사람이 점검표로 본다.
// 확인: (1) 조합 중에는 제어기로 아무것도 보내지 않는다 (2) 확정된 음절만 한 번씩 보낸다 (3) Claude Code 입력칸에 그대로 보인다
//       (4) 조합 중 글자 지우기 (5) 배율이 1이 아닐 때도 같다 (6) 명령 바(일반 입력칸)도 같다. 친 글은 지우고 제출하지 않는다.
import { launch, shot, logger, sessionsOf, sleep } from './harness.mjs';

const log = logger('e6');
const { app, page } = await launch({ log });
const cdp = await page.context().newCDPSession(page);
const A = (await sessionsOf(page)).find((s) => s.name === 'a').id;
await page.evaluate(() => {
  window.__sent = [];
  const orig = window.__mt.api.call.bind(window.__mt.api);
  window.__mt.api.call = (m, p) => { if (m === 'terminal.input') window.__sent.push(p.data); return orig(m, p); };
});
const sent = () => page.evaluate(() => window.__sent.splice(0));
const peek = () => page.evaluate(() => [...window.__sent]);
const inputLine = () => page.evaluate((id) => { const t = window.__mt.terms.get(id); const b = t.buffer.active; for (let r = t.rows - 1; r >= 0; r--) { const l = b.getLine(r).translateToString(true); if (l.trimStart().startsWith('❯')) return l.trim(); } return null; }, A);
const compView = () => page.evaluate((id) => { const v = document.querySelector(`.mt-term[data-session="${id}"] .composition-view`); if (!v) return null; const r = v.getBoundingClientRect(); return { text: v.textContent, active: v.classList.contains('active'), x: Math.round(r.x), y: Math.round(r.y) }; }, A);
const comp = (text) => cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
const commit = (text) => cdp.send('Input.insertText', { text });

// 한 음절씩: 자모가 쌓이며 조합되다가 다음 음절이 시작될 때 앞 음절이 확정된다(두벌식)
async function typeHangul(steps, label) {
  for (const s of steps) {
    if (s.comp !== undefined) { await comp(s.comp); await sleep(60); }
    if (s.commit !== undefined) { await commit(s.commit); await sleep(60); }
    if (s.check) { log(`${label} 조합 중 "${s.comp}"`, { 지금까지_보낸것: await peek(), 조합창: await compView() }); }
  }
}

async function round(zoomLabel) {
  await page.click(`.mt-node[data-name="a"] .mt-term`);
  await sleep(300);
  for (let i = 0; i < 12; i++) await page.keyboard.press('Backspace'); // 남은 글 지우기
  await sleep(400);
  await sent();
  const before = await inputLine();
  // "한글": ㅎ 하 한 → (ㄱ이 오면 '한' 확정) ㄱ 그 글 → 확정
  await typeHangul([
    { comp: 'ㅎ' }, { comp: '하' }, { comp: '한', check: true }, { commit: '한' },
    { comp: 'ㄱ' }, { comp: '그' }, { comp: '글', check: true },
  ], zoomLabel);
  await shot(page, `e6-${zoomLabel}-composing`, log);
  await commit('글');
  await sleep(150);
  const s1 = await sent();
  // "가나": ㄱ 가 간 → ㅏ가 오면 받침 ㄴ이 다음 음절로 넘어가 '가' 확정, '나' 조합 → 확정
  await typeHangul([{ comp: 'ㄱ' }, { comp: '가' }, { comp: '간' }, { commit: '가' }, { comp: '나' }], zoomLabel);
  await commit('나');
  await sleep(150);
  const s2 = await sent();
  // 조합 중 지우기: 다 → 단 → (백스페이스) 다 → 확정
  await typeHangul([{ comp: 'ㄷ' }, { comp: '다' }, { comp: '단' }, { comp: '다', check: true }], zoomLabel);
  await commit('다');
  await sleep(150);
  const s3 = await sent();
  // 조합을 취소(빈 글로 끝냄)하면 아무것도 보내지 않는다
  await comp('ㅋ'); await sleep(60); await comp(''); await sleep(60);
  await cdp.send('Input.insertText', { text: '' }).catch(() => {});
  await sleep(150);
  const s4 = await sent();
  await sleep(600);
  const line = await inputLine();
  log(`${zoomLabel} 결과`, { 입력칸_전: before, 입력칸_후: line, 한글: s1, 가나: s2, 조합중지우기: s3, 조합취소: s4 });
  await shot(page, `e6-${zoomLabel}-committed`, log);
  // 지우기(제출하지 않는다)
  const n = [...s1, ...s2, ...s3].join('').length;
  for (let i = 0; i < n; i++) await page.keyboard.press('Backspace');
  await sleep(500);
  log(`${zoomLabel} 지운 뒤 입력칸`, await inputLine());
  return { s1, s2, s3, s4, line };
}

await page.evaluate((id) => window.__mt.getState().navigateTo(id, { focusTerminal: true }), A);
await sleep(2000);
const r1 = await round('zoom1');
// 배율 0.6(가까이 얼굴이지만 1이 아님)에서도
await page.evaluate(() => window.__mt.getState().setViewport({ x: 120, y: 120, zoom: 0.6 }));
await sleep(2000);
const r2 = await round('zoom06');

// 명령 바(일반 입력칸)
await page.click('[data-role=command]');
await page.fill('[data-role=command]', '');
await comp('ㅎ'); await comp('하'); await comp('한'); await commit('한'); await comp('ㄱ'); await comp('그'); await comp('글'); await commit('글');
await sleep(200);
const bar = await page.inputValue('[data-role=command]');
log('명령 바 값', bar);
await page.fill('[data-role=command]', '');

const ok = (r) => JSON.stringify(r.s1) === '["한","글"]' && JSON.stringify(r.s2) === '["가","나"]' && JSON.stringify(r.s3) === '["다"]' && r.s4.length === 0 && /한글가나다/.test(r.line || '');
log('판정', { zoom1: ok(r1), zoom06: ok(r2), commandBar: bar === '한글' });
await app.close();
