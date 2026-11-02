// 들어갈 때 브리핑(ARCH 4절 E2, BRIEF 4절, P3). 나올 때의 한 줄 메모는 P22에서 뺐다.
// - 오래(기본 30분) 손대지 않은 세션에 들어가면(칩·N·알림으로 가거나 노드를 누름) 브리핑을 먼저 보여준다.
//   브리핑은 백엔드 session.briefing: 대화 기록에서 뽑은 마지막 지시와 답, 지금 상태, 기다리는 질문. 모델을 부르지 않는다.
import { api } from './api.js';
import { getState, setBriefing } from './store.js';
import { briefingDue, DEFAULT_BRIEF_AFTER_MS } from './lib/attention.js';
import { perfLog } from './perf.js';

function briefAfterMs() {
  const q = new URLSearchParams(location.search).get('briefAfterSec');
  let v = q; try { v ??= localStorage.getItem('mt.briefAfterSec'); } catch {}
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n * 1000 : DEFAULT_BRIEF_AFTER_MS;
}

let current = null; // { id, at }
const entered = new Map(); // id → 이 창에서 마지막으로 들어간 시각(백엔드의 손댄 시각이 오기 전에도 같은 판단을 하게)

export async function openBriefing(id, why = 'manual') {
  try {
    const b = await api.call('session.briefing', { session: id });
    setBriefing({ sessionId: id, data: b, why });
    perfLog('briefing', { sessionId: id, why });
  } catch {}
}

export function enterSession(id) {
  if (current && current.id === id) return;
  const s = getState().sessions.get(id);
  const touchedAt = Math.max((s && s.touchedAt) || 0, entered.get(id) || 0) || null;
  if (s && briefingDue({ ...s, touchedAt }, Date.now(), briefAfterMs())) openBriefing(id, 'away');
  current = { id, at: Date.now() };
  entered.set(id, Date.now());
  api.call('session.touch', { session: id }).catch(() => {});
}

// 그 세션에 실제로 손댔다(터미널 입력, 카드 답). 들어가지 않은 채 손댔으면 들어간 것으로 본다
export function markInteracted(id) {
  if (!current || current.id !== id) enterSession(id);
}
export const currentSession = () => current && current.id;
