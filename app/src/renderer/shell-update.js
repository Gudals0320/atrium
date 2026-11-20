// P282: 원격 웹 화면이 판의 새 화면 코드를 스스로 받는다(판단은 lib/shell-reload.js).
// web.js가 /web/me를 받을 때마다(다시 붙을 때, 화면이 다시 보일 때) shellSeen(me.build)를 부른다. Electron 창은 부르지 않는다(지금 업데이트 흐름 그대로)
// - 다시 부르기 전에: 보내지 않은 입력 글을 sessionStorage에 두고(Phone.jsx가 되살린다), 'mt-before-reload' 사건으로 맵 시점 같은 것을 저장하게 하고,
//   서비스 워커도 registration.update()로 새 버전을 받게 한다(늦으면 기다리지 않는다). 지금 보던 화면(세션)은 history.state라 다시 불러와도 남는다
/* global __SHELL_BUILD__ */
import { shellReloadPlan, reloadReady, packDraft, takeDraft, SHELL_TRY_KEY, DRAFT_KEY, validMark } from './lib/shell-reload.js';

export const SHELL_MINE = typeof __SHELL_BUILD__ === 'string' && validMark(__SHELL_BUILD__) ? __SHELL_BUILD__ : null;
const ss = () => { try { return sessionStorage; } catch { return null; } };
const read = (k) => { try { return ss() && ss().getItem(k); } catch { return null; } };
const put = (k, v) => { try { if (ss()) { if (v == null) ss().removeItem(k); else ss().setItem(k, v); } } catch {} };

let draftFn = null; // () => { sessionId, text } | null
export function setDraftSource(fn) { draftFn = fn; return () => { if (draftFn === fn) draftFn = null; }; }
// 이 세션의 저장된 글을 꺼낸다(꺼내면 지운다. 다른 세션 것이면 그대로 둔다)
export function takeSavedDraft(sessionId) { const t = takeDraft(read(DRAFT_KEY), sessionId); if (t) put(DRAFT_KEY, null); return t; }

const st = { pending: null, reloading: false, seen: null, log: [] };
function typingNow() {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName || '').toLowerCase();
  if (tag !== 'textarea' && !(tag === 'input' && /^(text|search|url|email|tel|password|)$/i.test(el.type || ''))) return false;
  return !!String(el.value || '').trim();
}
let armed = false;
function arm() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const poke = () => setTimeout(tryNow, 0);
  document.addEventListener('focusout', poke, true);
  document.addEventListener('input', poke, true);
  document.addEventListener('visibilitychange', poke);
  window.addEventListener('pagehide', poke);
}
function tryNow() {
  if (!st.pending || st.reloading) return;
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  if (!reloadReady({ hidden, typing: typingNow() })) return;
  go(st.pending);
}
async function swUpdate(ms) {
  try {
    const sw = typeof navigator !== 'undefined' && navigator.serviceWorker;
    if (!sw) return;
    const reg = await Promise.race([sw.getRegistration(), new Promise((r) => setTimeout(() => r(null), ms))]);
    if (reg && reg.update) await Promise.race([reg.update().catch(() => {}), new Promise((r) => setTimeout(r, ms))]);
  } catch {}
}
async function go(server) {
  st.reloading = true; st.pending = null;
  put(SHELL_TRY_KEY, server);
  try { const d = draftFn && draftFn(); const v = d && packDraft(d.sessionId, d.text); if (v) put(DRAFT_KEY, v); } catch {}
  try { window.dispatchEvent(new Event('mt-before-reload')); } catch {}
  st.log.push({ at: Date.now(), from: SHELL_MINE, to: server });
  await swUpdate(2500);
  if (typeof window !== 'undefined' && window.__mtShellNoReload) { st.reloading = false; return; } // 시험: 다시 부르지 않고 무엇을 했는지만
  location.reload();
}
export function shellSeen(server) {
  st.seen = server || null;
  const plan = shellReloadPlan({ mine: SHELL_MINE, server, tried: read(SHELL_TRY_KEY) });
  if (plan !== 'reload' || st.reloading) return plan;
  st.pending = server;
  arm(); tryNow();
  return plan;
}
if (typeof window !== 'undefined') window.__mtShell = { mine: SHELL_MINE, state: () => ({ pending: st.pending, reloading: st.reloading, seen: st.seen, tried: read(SHELL_TRY_KEY), log: [...st.log] }), seen: shellSeen };
