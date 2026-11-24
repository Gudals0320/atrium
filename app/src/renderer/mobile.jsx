// P353: 휴대폰 전용 간소 페이지의 시작점(boot.js가 휴대폰이면 이것을, 아니면 판 화면 main.jsx를 읽는다).
// 판 화면의 무거운 모듈(캔버스, xterm, 세션 맵)은 이 묶음에 없다. "전체 맵"을 열 때만 fullmap.js를 읽는다
import './fonts.css';
import './tokens.css';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import { webGate } from './Pair.jsx';
import { webMe } from './web.js';
import { startMobileStore } from './mobile-store.js';
import { startPushClient } from './push.js';
import { setCrumbSampler, startCrashWatch } from './crash-watch.js';
import { MobileApp } from './MobileApp.jsx';
import { perfLog } from './perf.js';

window.__mt = { api, mobile: true }; // 시험이 읽는다
window.addEventListener('error', (e) => { perfLog('window_error', { message: e.message, at: e.filename + ':' + e.lineno }); });
window.addEventListener('unhandledrejection', (e) => { perfLog('unhandled', { message: String(e.reason && (e.reason.message || e.reason)) }); });

function boot() {
  startMobileStore();
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
