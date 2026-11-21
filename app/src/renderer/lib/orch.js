// P296: 자체 오케스트레이션 세션(안에서 DAG·팀·하위 에이전트를 스스로 돌리는 하네스)의 창 쪽 순수 함수.
// - 런처 칸 orchestrates(없으면 하네스의 기본 orchDefault, 예: hermes)를 런처 창에서 켜고 끈다.
// - 판 카드 머리·세션 맵 카드에 작은 표("오케스트레이션")를 달고, 안에서 일하는 중(바쁨 신호)이면 그 까닭을 붙인다.
// 판단은 backend/src/orchestration.mjs(launcherOrch)와 같다

// 이 하네스(런처 칸 harness)에 자체 오케스트레이션 칸이 있는가(셸·직접 명령은 에이전트가 아니다)
export const orchApplies = (harness) => !!harness && harness !== 'shell' && harness !== 'command';
// 하네스 표(launcher.list의 harnesses)의 기본값
export function orchDefault(harnesses, harness) {
  const h = (harnesses || []).find((x) => x.id === harness);
  return !!(h && h.orchDefault);
}
// P298: 하네스 표의 보고 물러섬 기본값(hermes는 last_answer) | null
export function fallbackDefault(harnesses, harness) {
  const h = (harnesses || []).find((x) => x.id === harness);
  return (h && h.fallbackDefault) || null;
}
// P298: 런처의 실제 보고 물러섬(켜짐). 칸이 last_answer면 켜짐, none이면 꺼짐, 없으면 하네스 기본
export function launcherFallback(harnesses, l) {
  if (!l) return false;
  if (l.reportFallback === 'last_answer') return true;
  if (l.reportFallback === 'none') return false;
  return fallbackDefault(harnesses, l.harness) === 'last_answer';
}
// P298: 체크 칸 → 저장할 값. 하네스 기본이 켜짐이면 끌 때 none, 기본이 꺼짐이면 켤 때 last_answer(같으면 칸을 두지 않는다)
export function fallbackValue(harnesses, harness, on) {
  const def = fallbackDefault(harnesses, harness) === 'last_answer';
  return on === def ? '' : on ? 'last_answer' : 'none';
}
// 런처의 실제 성질
export function launcherOrchestrates(harnesses, l) {
  if (!l || !orchApplies(l.harness)) return false;
  return typeof l.orchestrates === 'boolean' ? l.orchestrates : orchDefault(harnesses, l.harness);
}
// 저장할 칸(런처 창 → launcher.create·update). 고른 값이 하네스 기본과 같고 전에 칸이 없었으면 두지 않는다. 보고 물러섬·바쁨 신호는 그대로 넘긴다
export function orchBody(harnesses, d) {
  if (!d || !orchApplies(d.harness)) return {};
  const on = launcherOrchestrates(harnesses, d);
  const keep = typeof d.orchestrates === 'boolean' || on !== orchDefault(harnesses, d.harness);
  return { ...(keep ? { orchestrates: on } : {}), ...(on && d.reportFallback ? { reportFallback: d.reportFallback } : { reportFallback: '' }), ...(d.busy ? { busy: d.busy } : {}) };
}
// 세션 요약의 orch | null
export const sessionOrch = (s) => (s && s.orch && s.orch.on ? s.orch : null);
// 안의 일 까닭 글
export function innerWhyText(why, t) {
  const list = (why || []).map((w) => (String(w).startsWith('reader:') ? t('orch.why.reader', { name: String(w).slice(7) }) : t(`orch.why.${w}`)));
  return list.length ? list.join(', ') : t('orch.why.hold');
}
// 카드 표 → { text, busy, title } | null
export function orchTag(s, t) {
  const o = sessionOrch(s);
  if (!o) return null;
  const busy = !!(o.inner && o.inner.busy);
  const title = [o.scope === 'sub' ? t('orch.titleSub') : t('orch.titleFree'), busy ? t('orch.innerTitle', { why: innerWhyText(o.inner.why, t) }) : null].filter(Boolean).join('\n');
  return { text: busy ? t('orch.tagBusy') : t('orch.tag'), busy, title };
}
