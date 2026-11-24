// P353: 휴대폰 전용 간소 페이지의 시작점(boot.js가 휴대폰이면 이것을, 아니면 판 화면 main.jsx를 읽는다).
// 판 화면의 무거운 모듈(캔버스, xterm, 판 store)은 이 묶음에 없다. P356: 맵 탭은 열 때만 MobileMap.jsx 조각과 mobilemap.css를 읽는다
import './fonts.css';
import './tokens.css';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import { webGate } from './Pair.jsx';
import { webMe } from './web.js';
import { startMobileStore } from './mobile-store.js';
import { startPushClient } from './push.js';
import { setCrumbSampler, startCrashWatch, bootState, crumbSteps } from './crash-watch.js';
import { startPhoneTelemetry } from './lib/phone-telemetry.js'; // P352: 휴대폰 이상 동작 기록(화면 오류, 실패한 API, 보내기 실패, 다시 붙기, 받은 크기)
import { getMobile } from './mobile-store.js';
import { MobileApp } from './MobileApp.jsx';
import { perfLog } from './perf.js';

window.__mt = { api, mobile: true }; // 시험이 읽는다
window.addEventListener('error', (e) => { perfLog('window_error', { message: e.message, at: e.filename + ':' + e.lineno }); });
window.addEventListener('unhandledrejection', (e) => { perfLog('unhandled', { message: String(e.reason && (e.reason.message || e.reason)) }); });

function boot() {
  startMobileStore();
  // 첫 연결의 받은 크기부터 세도록 연결 전에 켠다. 화면·연 세션 이름은 휴대폰 페이지 것으로
  startPhoneTelemetry({ api, boot: bootState(), steps: crumbSteps,
    context: () => { const el = document.querySelector('[data-role=mp]'); const id = history.state && history.state.mtMobile; const s = id ? getMobile().rows.get(id) : null; return { view: el ? 'mobile-' + el.dataset.view : 'loading', session: s ? s.name : null }; },
    versions: () => ({ app: api.info && api.info.appVersion }) });
  createRoot(document.getElementById('root')).render(<MobileApp />);
  api.connect();
  startPushClient();
  setCrumbSampler(() => ({ view: document.querySelector('[data-role=mp]') ? 'mobile-' + document.querySelector('[data-role=mp]').dataset.view : 'mobile' }));
  startCrashWatch();
}
// 짝 맺기·다시 확인 화면(Pair.jsx)은 판 화면의 CSS로 그린다. 그 화면이 뜰 때만 renderer.css를 잠깐 읽고, 들어가면 뗀다
async function gate() {
  let link = null;
  const me = await webMe().catch(() => undefined);
  if (me === null) { link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'renderer.css'; document.head.appendChild(link); }
  await webGate();
  if (link) link.remove();
}
gate().then(boot);
