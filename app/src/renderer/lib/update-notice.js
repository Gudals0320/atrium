// P69: 업데이트 상태(update.status) → 창이 한 번만 띄울 알림. 새 버전은 버전마다 한 번, 바꾸기 결과는 결과마다 한 번(최근 것만)
export const RESULT_FRESH_MS = 10 * 60 * 1000; // 바꾸기 결과는 이만큼 지나기 전에만 알린다(처음 여는 웹 화면에 옛 결과를 띄우지 않게)
export function noticesFor(view, { toasted = null, resultSeen = null, now = Date.now() } = {}) {
  const out = [];
  if (!view) return out;
  const r = view.lastResult;
  if (r && r.at && String(r.at) !== String(resultSeen) && now - r.at < RESULT_FRESH_MS) out.push({ kind: 'result', key: String(r.at), ok: !!r.ok, to: (r.to && r.to.tag) || '', from: (r.from && (r.from.tag || r.from.version)) || '', error: r.error || '' });
  if (view.available && view.latest && view.latest.tag !== toasted && !(view.job && view.job.phase !== 'failed')) out.push({ kind: 'available', key: view.latest.tag, version: view.latest.tag });
  return out;
}
