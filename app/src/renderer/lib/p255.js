// P255: 위 오른쪽 칩들의 순수 함수(작업 완료 모두 읽기, 메모리 칩의 CPU, Codex 크레딧 표기). 단위 시험 app/test/p255-lib.test.mjs
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// 모두 읽기: 목록(세션 요약) 가운데 아직 안 본 끝난 턴이 있는 세션 ID(겹침 없이, 목록 차례). 빈 목록이면 []
export function seenTargets(list) {
  const out = [];
  for (const s of list || []) if (s && s.sessionId && (s.unseen || s.unseenSub) && !out.includes(s.sessionId)) out.push(s.sessionId);
  return out;
}

// CPU 사용률 글: 10% 미만은 소수 한 자리, 그 위는 정수. 모르면 '?'
export const fmtPct = (x) => (!num(x) ? '?' : x < 10 ? `${x.toFixed(1)}%` : `${Math.round(x)}%`);
// 자원 표본(resources) → { sessions, system, known }(sessions: 판이 띄운 세션들, system: PC 전체). 옛 백엔드(cpu 없음)면 known false
export function cpuLine(r) {
  const c = r && r.cpu;
  if (!c) return { sessions: '?', system: '?', known: false };
  return { sessions: fmtPct(c.sessionsPct), system: fmtPct(c.systemPct), known: num(c.sessionsPct) || num(c.systemPct) };
}

// Codex 크레딧 표기. 실제 rollout(2026-11 기록, 약 2,700줄): 한도 창(primary 5시간·secondary 주간) 하나가 used_percent 100이면
// 그 동안 credits.balance가 줄어든다(크레딧으로 쓰는 중). rate_limit_reached_type·spend_control_reached는 늘 null이라 보지 않는다.
// 판정: 리셋이 지나지 않은 창 하나라도 100% 이상이고 credits가 있으면(has_credits 또는 unlimited) 크레딧 모드.
// → null(퍼센트 그대로) | { kind: 'unlimited' } | { kind: 'balance', n: 글 }. now: 리셋 지난 창은 0%로 본다
export function creditMode(entry, now = Date.now()) {
  if (!entry || !Array.isArray(entry.windows) || !entry.credits) return null;
  const full = entry.windows.some((w) => w && num(w.usedPct) && w.usedPct >= 100 && !(w.resetsAt && w.resetsAt <= now));
  if (!full) return null;
  const c = entry.credits;
  if (c.unlimited) return { kind: 'unlimited' };
  if (!c.hasCredits) return null;
  if (c.balance == null || c.balance === '') return null;
  const n = Number(c.balance);
  if (!Number.isFinite(n)) return null;
  return { kind: 'balance', n: Math.floor(n).toLocaleString('en-US') };
}
// 크레딧 모드 → 사전 열쇠와 값 | null
export function creditPillText(m) {
  if (!m) return null;
  return m.kind === 'unlimited' ? { key: 'p255.creditUnlimited', vars: {} } : { key: 'p255.credit', vars: { n: m.n } };
}
