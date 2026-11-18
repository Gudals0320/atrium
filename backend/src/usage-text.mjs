// P211: atrium usage의 사람이 읽는 글(usage.get 값 → 줄들). 하네스 bin의 atrium 명령 묶음(childBundle)에 들어가므로 다른 모듈을 부르지 않는다
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const PROVIDERS = ['claude', 'codex', 'agy'];
const NAME = { claude: 'Claude', codex: 'Codex', agy: 'AGY' };
const WIN = { '5h': '5시간', week: '주간', day: '하루' };
const SRC = { statusline: '보드가 띄운 세션의 상태 줄', rollout: 'Codex 세션 기록' };
export function spanText(ms) {
  if (!num(ms)) return '?';
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}시간${m % 60 ? ` ${m % 60}분` : ''}`;
  return `${Math.floor(h / 24)}일${h % 24 ? ` ${h % 24}시간` : ''}`;
}
// usage.get 값 → 사람이 읽는 줄들(atrium usage)
export function usageLines(view, now = Date.now()) {
  const p = (view && view.providers) || {};
  const out = ['구독 사용량(보드가 이 PC의 로컬 출처에서 모은 마지막 값):'];
  for (const k of PROVIDERS) {
    const e = p[k];
    if (!e) { out.push(`  ${NAME[k]}: 모름(${k === 'codex' ? 'Codex 세션 기록에 사용량 줄이 아직 없다' : `보드가 띄운 ${NAME[k]} 세션의 상태 줄이 아직 알리지 않았다`})`); continue; }
    const wins = e.windows.map((w) => `${WIN[w.id] || w.id} ${Math.round(w.usedPct)}%${w.resetsAt ? (w.resetsAt > now ? `(리셋 ${spanText(w.resetsAt - now)} 뒤)` : '(리셋 지남)') : ''}`).join(' · ');
    const c = e.credits ? (e.credits.unlimited ? ' · 크레딧 무제한' : e.credits.hasCredits ? ` · 크레딧 ${e.credits.balance ?? '있음'}` : ' · 크레딧 없음') : '';
    out.push(`  ${NAME[k]}${e.plan ? `(${e.plan})` : ''}: ${wins}${c} · 받은 때 ${spanText(now - e.at)} 전 · 출처 ${SRC[e.source] || e.source}`);
  }
  out.push(view && view.alertsOn === false ? '  90% 알림: 꺼짐' : '  90% 알림: 켜짐(한 창이 90%를 넘으면 그 창이 리셋될 때까지 한 번)');
  return out;
}

