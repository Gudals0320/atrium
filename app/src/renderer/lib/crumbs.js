// P84: 웹 화면이 죽기 전 기록(빵 부스러기)과 다음 부팅의 판단. 순수 함수만 둔다(단위 시험 test/p84-lib.test.mjs). 적고 읽는 것은 crash-watch.js다.
// - 화면이 ALIVE_EVERY_MS마다 자기 상태(화면, 붙은 터미널 수, 캔버스·아틀라스 장치 픽셀, WebGL 수, DPR, 받은 바이트)와 살아 있던 시각을 localStorage(CRUMB_KEY)에 적는다.
//   정상으로 떠나면(pagehide) clean을 적는다. bfcache에서 돌아오면(pageshow persisted) 다시 지운다.
// - 다음 부팅이 clean 없이 시작되면 직전 페이지가 죽은 것이다(iOS Safari의 WebContent가 메모리로 죽으면 pagehide가 오지 않는다).
//   가려진(백그라운드) 채 죽었으면(iOS가 뒤의 탭을 정리) 기록은 남기되 가벼운 화면 판단에는 세지 않는다.
// - CRASH_WINDOW_MS 안에 두 번 죽으면 다음 부팅은 가벼운 화면(휴대폰은 목록 화면, 터미널은 고른 하나, WebGL 없음)으로 연다.
//   가벼운 화면은 사람이 "보드로 다시 열기"를 누를 때까지 이어진다. 다시 연 보드가 정상으로 떠나기 전에 또 죽으면 한 번으로도 다시 가벼운 화면이다.
export const CRUMB_KEY = 'mt.crumbs';
export const ALIVE_EVERY_MS = 2000;
export const CRASH_WINDOW_MS = 60_000; // 이 사이에 두 번 죽으면 가벼운 화면
export const CRASH_KEEP_MS = 15 * 60_000; // 이보다 오래된 죽음은 세지 않는다

const num = (v) => (Number.isFinite(v) ? v : null);
// 적어 둔 글 → 상태. 모양이 다르면 처음 상태
export function parseCrumbs(text) {
  let j = null;
  try { j = JSON.parse(text || 'null'); } catch {}
  if (!j || typeof j !== 'object' || j.v !== 1) return { v: 1, cur: null, crashes: [], light: false, retry: null };
  return {
    v: 1,
    cur: j.cur && typeof j.cur === 'object' && Number.isFinite(j.cur.boot) ? j.cur : null,
    crashes: Array.isArray(j.crashes) ? j.crashes.filter(Number.isFinite).slice(-10) : [],
    light: j.light === true,
    retry: num(j.retry),
  };
}

// 다음 부팅의 판단. 돌려줌: { crashed, hidden, light, report(백엔드에 보낼 직전 상태, 죽지 않았으면 null), state(새로 적을 상태) }
export function bootDecide(stored, now = Date.now()) {
  const s = stored || parseCrumbs(null);
  const prev = s.cur;
  const crashed = !!prev && !prev.clean;
  const hidden = crashed && prev.hidden === true;
  const at = crashed ? num(prev.alive) ?? prev.boot : null;
  const crashes = s.crashes.filter((t) => now - t < CRASH_KEEP_MS);
  if (crashed && !hidden) crashes.push(at);
  let light = s.light;
  if (!light && crashed && !hidden) {
    if (prev.retryBoot === true) light = true; // "보드로 다시 열기"로 연 보드가 또 죽었다
    else if (crashes.length >= 2 && crashes[crashes.length - 1] - crashes[crashes.length - 2] <= CRASH_WINDOW_MS) light = true;
  }
  const report = crashed ? reportOf(prev, now, { boots: crashes.length }) : null;
  const retry = light ? null : s.retry;
  const state = { v: 1, cur: { boot: now, alive: now, clean: false, light, retryBoot: retry != null }, crashes: light ? [] : crashes.slice(-10), light, retry };
  return { crashed, hidden, light, report, state };
}

// 백엔드(web.boot, backend/src/web-crash.mjs crashInfo)에 보낼 직전 상태. 숫자와 짧은 코드만
export function reportOf(prev, now, { boots = 0 } = {}) {
  if (!prev) return null;
  const alive = num(prev.alive) ?? prev.boot;
  const r = { ago: Math.max(0, now - alive), up: Math.max(0, alive - prev.boot), boots };
  for (const k of ['terms', 'px', 'atlas', 'gl', 'dpr', 'inB']) if (Number.isFinite(prev[k])) r[k] = prev[k];
  if (prev.view) r.view = prev.view;
  if (prev.hidden === true) r.hidden = true;
  if (prev.light === true) r.light = true;
  if (prev.retryBoot === true) r.retry = true;
  return r;
}

export const RETRY_OK_MS = 3 * 60_000; // 다시 연 보드가 이만큼 살아 있으면 다시 열기를 마친 것으로 본다
// 살아 있다는 기록. sample: { view, terms, px, atlas, gl, dpr, inB, hidden }
export function crumbAlive(s, sample, now = Date.now()) {
  if (!s.cur) return s;
  const done = s.cur.retryBoot && now - s.cur.boot >= RETRY_OK_MS;
  return { ...s, cur: { ...s.cur, ...sample, alive: now, clean: false, ...(done ? { retryBoot: false } : {}) }, ...(done ? { retry: null } : {}) };
}
// 정상으로 떠남(pagehide). 다시 연 보드가 정상으로 떠났으면 다시 열기를 마친 것으로 본다
export function crumbLeave(s, now = Date.now()) {
  if (!s.cur) return s;
  return { ...s, cur: { ...s.cur, alive: now, clean: true }, ...(s.cur.retryBoot ? { retry: null } : {}) };
}
// bfcache에서 돌아옴(pageshow persisted): 다시 살아 있는 페이지
export const crumbBack = (s, now = Date.now()) => (s.cur ? { ...s, cur: { ...s.cur, alive: now, clean: false } } : s);
// 가벼운 화면에서 "보드로 다시 열기"(곧 다시 읽는다)
export const chooseBoard = (s, now = Date.now()) => ({ ...s, light: false, crashes: [], retry: now, cur: s.cur ? { ...s.cur, alive: now, clean: true } : null });

// 휴대폰 웹의 터미널 예산(P84). 손가락 포인터의 웹 화면(휴대폰, 태블릿)은 WebGL을 쓰지 않고(DOM으로 그린다) 동시에 붙는 터미널을 줄인다.
// PC 창(Electron)과 마우스 브라우저는 그대로다. 가벼운 화면은 터미널 하나
// 마우스 웹 화면(노트북 브라우저)은 WebGL을 쓰되 터미널 캔버스 한 장의 장치 픽셀 상한(maxPx)을 낮춘다(넘으면 늘여 보인다, lib/term-sharp.js).
// 휴대폰 보드 화면(화면 배율 3, PC 크기 175칸 패널)은 배율 1에서 캔버스 한 장이 9.4M px, 배율 2에서 상한 12M px까지 갔다(docs/log/p84-phone-crash.md)
export const PHONE_MAX_TERMS = 3;
export const WEB_SHARP_MAX_PX = 4e6;
export function termBudget({ web, coarse, light = false, maxControllers, webglBudget }) {
  if (light) return { max: Math.min(maxControllers, 1), webgl: 0, maxPx: WEB_SHARP_MAX_PX };
  if (web && coarse) return { max: Math.min(maxControllers, PHONE_MAX_TERMS), webgl: 0, maxPx: WEB_SHARP_MAX_PX };
  if (web) return { max: maxControllers, webgl: webglBudget, maxPx: WEB_SHARP_MAX_PX };
  return { max: maxControllers, webgl: webglBudget, maxPx: null };
}
