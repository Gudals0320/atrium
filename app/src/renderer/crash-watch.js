// P84: 웹 화면이 죽기 전 기록과 다음 부팅의 판단(lib/crumbs.js). iPhone Safari가 판을 열자마자 페이지(WebContent)를 잃는 문제를 기기에서 잡는다.
// - 웹 화면만 한다(PC 창은 그대로). 부팅 판단은 처음 부를 때 한 번(bootState). 모듈을 읽는 순서와 상관없이 TerminalView·Canvas가 그 값을 쓴다
// - 살아 있는 동안 ALIVE_EVERY_MS마다, 가려질 때(visibilitychange)와 떠날 때(pagehide) localStorage에 적는다
// - 직전 페이지가 죽었으면 연결이 열릴 때 web.boot로 직전 상태를 보낸다(연결 기록의 boot 줄). 내용(글, 화면)은 보내지 않는다
// - 가벼운 화면: "보드로 다시 열기"(reopenBoard)는 기록을 바꾸고 페이지를 다시 읽는다
import { api } from './api.js';
import { CRUMB_KEY, ALIVE_EVERY_MS, parseCrumbs, bootDecide, crumbAlive, crumbLeave, crumbBack, chooseBoard, termBudget } from './lib/crumbs.js';

const webPage = () => typeof window !== 'undefined' && !!(window.mt ? window.mt.web : true); // web.js가 window.mt.web을 둔다. Electron은 preload가 먼저 둔다
const store = () => { try { return window.localStorage; } catch { return null; } };
const read = () => { try { return parseCrumbs(store().getItem(CRUMB_KEY)); } catch { return parseCrumbs(null); } };
const write = (s) => { try { store().setItem(CRUMB_KEY, JSON.stringify(s)); } catch {} };

let decided = null;
let leaving = false;
export function bootState() {
  if (decided) return decided;
  if (!webPage()) return (decided = { web: false, crashed: false, hidden: false, light: false, report: null });
  const d = bootDecide(read());
  write(d.state);
  // 정상 떠남은 짝 맺기·본인 확인 화면에서도 적는다(그 화면을 다시 읽는 것을 죽음으로 보지 않게)
  // 떠날 때는 pagehide 뒤에 visibilitychange(hidden)가 온다. 떠나는 동안은 살아 있다는 기록으로 정상 떠남을 덮지 않는다
  window.addEventListener('pagehide', () => { leaving = true; write(crumbLeave(read())); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) { leaving = false; write(crumbBack(read())); } });
  return (decided = { web: true, ...d });
}
export const lightMode = () => bootState().light;
const coarse = () => { try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; } };
// 이 화면의 터미널 예산(lib/crumbs.js termBudget): { max, webgl }
export const termBudgetNow = (maxControllers, webglBudget) => termBudget({ web: bootState().web, coarse: coarse(), light: lightMode(), maxControllers, webglBudget });

let sampler = () => ({});
// 살아 있는 상태를 재는 함수(main.jsx가 준다): { view, terms, px, atlas, gl }
export function setCrumbSampler(fn) { sampler = fn; }
function sample() {
  let s = {};
  try { s = sampler() || {}; } catch {}
  return { ...s, dpr: window.devicePixelRatio || 1, inB: api.inB || 0, hidden: document.visibilityState === 'hidden' };
}

let started = false;
export function startCrashWatch() {
  const b = bootState();
  if (!b.web || started) return;
  started = true;
  const alive = () => { if (!leaving) write(crumbAlive(read(), sample())); };
  alive();
  setInterval(alive, ALIVE_EVERY_MS);
  document.addEventListener('visibilitychange', alive);
  if (b.crashed) {
    let sent = false;
    const send = () => { if (sent) return; api.call('web.boot', { crashed: true, light: b.light, crash: b.report }).then(() => { sent = true; }, () => {}); };
    api.on('$open', send);
    if (api.conn && api.conn.phase === 'open') send();
  }
}
// 가벼운 화면의 "보드로 다시 열기"
export function reopenBoard() {
  write(chooseBoard(read()));
  location.reload();
}
