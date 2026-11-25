// P211: atrium usage의 사람이 읽는 글(usage.get 값 → 줄들). 하네스 bin의 atrium 명령 묶음(childBundle)에 들어가므로 다른 모듈을 부르지 않는다
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const PROVIDERS = ['claude', 'codex', 'agy'];
const NAME = { claude: 'Claude', codex: 'Codex', agy: 'AGY' };
const WIN = { '5h': '5시간', week: '주간', day: '하루' };
const SRC = { statusline: '보드가 띄운 세션의 상태 줄', rollout: 'Codex 세션 기록', 'probe:codex': 'codex app-server에 직접 물음', 'probe:claude': 'claude /usage에 직접 물음', 'probe:balance': '잔액 API(secret-run)' };
// P314: 알약 밖(펼침 아래쪽) 줄
const EXTRA_NAME = { deepseek: 'DeepSeek 잔액', openrouter: 'OpenRouter 잔액' };
const winText = (id) => { const m = /^week:(.+)$/.exec(String(id)); return m ? `주간(${m[1]})` : WIN[id] || id; };
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
    const wins = e.windows.map((w) => `${winText(w.id)} ${Math.round(w.usedPct)}%${w.resetsAt ? (w.resetsAt > now ? `(리셋 ${spanText(w.resetsAt - now)} 뒤)` : '(리셋 지남)') : ''}`).join(' · ');
    const c = e.credits ? (e.credits.unlimited ? ' · 크레딧 무제한' : e.credits.hasCredits ? ` · 크레딧 ${Number.isFinite(Number(e.credits.balance)) ? Math.round(Number(e.credits.balance) * 100) / 100 : e.credits.balance ?? '있음'}` : ' · 크레딧 없음') : '';
    out.push(`  ${NAME[k]}${e.plan ? `(${e.plan})` : ''}: ${wins}${c} · 받은 때 ${spanText(now - e.at)} 전 · 출처 ${SRC[e.source] || e.source}`);
  }
  for (const k of Object.keys(EXTRA_NAME)) {
    const e = p[k];
    if (!e) continue;
    if (e.balance) { out.push(`  ${EXTRA_NAME[k]}: ${e.balance.total}${e.balance.currency ? ` ${e.balance.currency}` : ''} · 받은 때 ${spanText(now - e.at)} 전`); continue; }
    const wins = (e.windows || []).map((w) => `${winText(w.id)} ${Math.round(w.usedPct)}%${w.resetsAt && w.resetsAt > now ? `(리셋 ${spanText(w.resetsAt - now)} 뒤)` : ''}`).join(' · ');
    out.push(`  ${EXTRA_NAME[k]}: ${wins} · 받은 때 ${spanText(now - e.at)} 전`);
  }
  out.push(view && view.alertsOn === false ? '  90% 알림: 꺼짐' : '  90% 알림: 켜짐(한 창이 90%를 넘으면 그 창이 리셋될 때까지 한 번)');
  if (view && view.apiCredits) out.push(...creditLines(view.apiCredits, now));
  return out;
}

// P361: API 크레딧 장부(usage.get의 apiCredits) → 줄들
const usd = (v) => (num(v) ? `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}` : '?');
const two = (n) => String(n).padStart(2, '0');
const whenText = (t) => { const d = new Date(t); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`; };
export function creditLines(c, now = Date.now()) {
  const out = [];
  const basis = c.basis === 'official' ? `공식(조직 비용 API, ${c.basisAt ? `${spanText(now - c.basisAt)} 전까지 반영` : '반영 시각 모름'})` : `추정(보드 중계기 기록 × 가격표 ${c.prices ? c.prices.updated : '?'}, 보드 세션 몫만)`;
  if (!c.ledger) {
    out.push('API 크레딧: 장부 없음(설정 › 런처 › API 크레딧에 Console 결제 페이지를 붙여 넣는다)');
    if (c.spend) out.push(`  지출 오늘 ${usd(c.spend.today)} · 이번 달 ${usd(c.spend.month)} · ${basis}`);
    return out;
  }
  const t = c.totals || {};
  out.push(`API 크레딧(붙여 넣은 때 ${c.pastedAt ? `${spanText(now - c.pastedAt)} 전` : '?'}, 뺀 지출 ${basis}):`);
  out.push(`  쓸 수 있음 ${usd(t.usable)} = 월 크레딧 ${usd(t.plan)} + 프로모션 ${usd(t.promo)}${t.purchased != null ? ` + 구매 ${usd(Math.max(0, t.purchased))}` : ''}${t.purchased != null ? ` · 구매 잔액 ${usd(t.purchased)}${t.purchased < 0 ? '(미납)' : ''}` : ''}${c.autoReload === false ? ' · 자동 충전 꺼짐' : c.autoReload ? ' · 자동 충전 켜짐' : ''}`);
  for (const g of c.grants || []) {
    const left = g.expired ? '만료됨' : `${usd(g.left)} / ${usd(g.total)}`;
    const exp = g.expiresAt ? `만료 ${whenText(g.expiresAt)}${!g.expired ? `(${spanText(g.expiresAt - now)} 남음)` : ''}` : '만료일 모름';
    out.push(`  - ${g.name}${g.kind === 'plan' ? '[월]' : '[프로모션]'}: ${left} · ${exp}${g.grantedOn ? ` · 부여 ${g.grantedOn}` : ''}${g.spent ? ` · 붙여 넣은 뒤 ${usd(g.spent)} 씀` : ''}${g.appliesTo && g.appliesTo.length ? ` · 적용 ${g.appliesTo.join(', ')}` : ''}${g.soon ? ' · 곧 만료' : ''}`);
  }
  if (c.nextGrant) out.push(`  다음 지급 예정: ${c.nextGrant.date}${c.nextGrant.amount != null ? ` ${usd(c.nextGrant.amount)}` : ''}${c.nextGrant.name ? `(${c.nextGrant.name})` : ''}`);
  if (c.spend) out.push(`  지출 오늘 ${usd(c.spend.today)} · 이번 달 ${usd(c.spend.month)}`);
  if (c.unpriced) out.push(`  가격을 모르는 모델 요청 ${c.unpriced}건은 빼지 못했다`);
  if (c.officialError) out.push(`  공식 비용을 받지 못했다(${c.officialError}), 추정으로 보인다`);
  if (c.exhausted) out.push('  주의: 월·프로모션 크레딧이 바닥이고 구매 잔액이 0 이하다. SDK 세션은 미납으로 쌓인다');
  out.push('  나누기: 월 크레딧이 덮는 지출(SDK 세션)은 월 크레딧 → 프로모션 → 구매 순, 같은 무리는 먼저 만료되는 것부터. 대화형은 월 크레딧을 건너뛴다');
  return out;
}

