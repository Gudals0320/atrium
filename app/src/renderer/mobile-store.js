// P353: 휴대폰 전용 간소 페이지의 상태. 판 store.js(세션 요약 전부, 판 배치)를 받지 않고 phone.subscribe의 작은 줄만 둔다.
// - 처음: phone.subscribe {} → 줄 모두, 할 일 카드, 워크스페이스 이름. 다시 붙을 때: phone.subscribe { since: rev, boot } → 바뀐 줄만
// - 이벤트: phone.row · phone.gone(줄), phone.cards(할 일), phone.settings(말), delivery(연 세션의 대기 글)
// - 실패(판 API, 보내기)는 noteFail로 모은다(P352 휴대폰 자동 기록이 dev에 들어오면 그쪽으로 보낸다)
import { useSyncExternalStore } from 'react';
import { api } from './api.js';
import { setLanguage } from './lib/i18n.js';
import { applySync, applyRow, applyGone } from './lib/mobile.js';
import { perfLog } from './perf.js';
import { teleSendFail } from './lib/phone-telemetry.js'; // P352: 보내기·키 보내기 실패는 상황과 함께(API 실패와 화면 오류는 api.js tap과 window가 저절로 남긴다)

const state = { loaded: false, rows: new Map(), rev: null, boot: null, cards: [], workspaces: [], current: null, me: null, deliveries: new Map(), toasts: [], fails: [], v: 0 };
const subs = new Set();
const changed = () => { state.v++; for (const fn of [...subs]) fn(); };
export const getMobile = () => state;
export function useMobile(select) { return useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn); }, () => select(state)); }

export function mtoast(text, kind = 'info') {
  const t = { id: Math.random().toString(36).slice(2), text, kind };
  state.toasts = [...state.toasts, t].slice(-3); changed();
  setTimeout(() => { state.toasts = state.toasts.filter((x) => x !== t); changed(); }, kind === 'error' ? 7000 : 3500);
}
// 실패 기록(메서드·코드만, 글 없음). 시험이 window.__mtMobile.fails로 읽는다
let failSink = null;
export function setFailSink(fn) { failSink = fn; }
export function noteFail(kind, method, e) {
  const x = { at: Date.now(), kind, method, code: (e && e.code) || 'error' };
  state.fails = [...state.fails, x].slice(-30);
  perfLog('mobile_fail', x);
  try { if (failSink) failSink(x, e); } catch {}
}
// 판 API 부르기(실패를 남긴다). 보내기·키·답(kind send|keys|todo|spawn)은 P352 기록의 send 줄로도
export function call(method, params = {}, { kind = 'api' } = {}) {
  return api.call(method, params).catch((e) => { noteFail(kind, method, e); if (kind !== 'api' && e && e.code !== 'disconnected') teleSendFail(method, e, { steer: !!params.steer }); throw e; });
}

function putSync(r) {
  const n = applySync(state.loaded ? { rows: state.rows } : null, r);
  state.rows = n.rows; state.rev = n.rev; state.boot = n.boot;
  if (r.cards) state.cards = r.cards;
  if (r.workspaces) state.workspaces = r.workspaces;
  if (r.current !== undefined) state.current = r.current;
  if (r.me) state.me = r.me;
  if (r.settings && r.settings.language) setLanguage(r.settings.language);
  state.loaded = true;
  changed();
}
// 구독: 처음이면 모두, 다시 붙으면 since 뒤의 차이만
export const phoneSubscribe = () => api.call('phone.subscribe', state.loaded && state.boot ? { since: state.rev, boot: state.boot } : {});
export function startMobileStore() {
  api.subscribe = phoneSubscribe;
  api.on('$open', (r) => { if (r && r.phone) putSync(r); });
  api.on('phone.row', (ev) => { const n = applyRow(state, ev); if (n !== state) { state.rows = n.rows; state.rev = n.rev; changed(); } });
  api.on('phone.gone', (ev) => { const n = applyGone(state, ev); state.rows = n.rows; state.rev = n.rev; changed(); });
  api.on('phone.cards', (v) => { state.cards = (v && v.cards) || []; changed(); });
  api.on('phone.settings', (v) => { if (v && v.language) setLanguage(v.language); });
  api.on('delivery', (d) => { if (!d || !d.deliveryId) return; const m = new Map(state.deliveries); m.set(d.deliveryId, { ...(m.get(d.deliveryId) || {}), ...d }); state.deliveries = m; changed(); });
  api.on('$status', () => changed());
}
// 연 세션의 대기 글(phone.session 답으로 채우고 delivery 이벤트로 바꾼다)
export function putDeliveries(list) { const m = new Map(state.deliveries); for (const d of list || []) m.set(d.deliveryId, { ...(m.get(d.deliveryId) || {}), ...d }); state.deliveries = m; changed(); }
export function setCardsLocal(cards) { state.cards = cards; changed(); }
