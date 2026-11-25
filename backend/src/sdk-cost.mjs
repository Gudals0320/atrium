// P366: SDK 세션이 쓴 금액(추정). 판 중계기 요청 기록 한 줄 × 공식 가격표. 파일·네트워크 없음(P361 API 크레딧 장부를 걷고 남긴 것).
// SDK 노드와 세션 맵 카드의 금액 칩이 usage.get·usage.updated의 sdkCosts.sessions[세션 ID]를 그린다. 값은 늘 달러(소수)다. 키·토큰 값은 다루지 않는다
export const PRICES_UPDATED = '2026-11-25';
export const PRICES_URL = 'https://platform.claude.com/docs/en/about-claude/pricing';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const round6 = (v) => Math.round(v * 1e6) / 1e6;

// ---------- 가격표(달러 / 백만 토큰): [입력, 캐시 쓰기 5분, 캐시 쓰기 1시간, 캐시 읽기, 출력] ----------
// 공식 가격 페이지(PRICES_URL)를 PRICES_UPDATED에 옮겼다. 열쇠는 모델 ID에서 claude-·날짜 꼬리·[1m]을 뗀 것이고, 없으면 가장 긴 앞머리로 찾는다
export const PRICES = {
  'fable-5-2': [8, 10, 16, 0.2, 40], 'mythos-5-2': [8, 10, 16, 0.2, 40],
  'fable-5-1': [10, 12.5, 20, 0.25, 50], 'mythos-5-1': [10, 12.5, 20, 0.25, 50],
  'fable-5': [10, 12.5, 20, 1, 50], 'mythos-5': [10, 12.5, 20, 1, 50],
  'opus-5-5': [4, 5, 8, 0.2, 20],
  'opus-5': [5, 6.25, 10, 0.5, 25], 'opus-4-8': [5, 6.25, 10, 0.5, 25], 'opus-4-7': [5, 6.25, 10, 0.5, 25], 'opus-4-6': [5, 6.25, 10, 0.5, 25], 'opus-4-5': [5, 6.25, 10, 0.5, 25],
  'opus-4-1': [15, 18.75, 30, 1.5, 75], 'opus-4': [15, 18.75, 30, 1.5, 75],
  'sonnet-5-5': [2, 2.5, 4, 0.1, 10], 'sonnet-5': [2, 2.5, 4, 0.2, 10],
  'sonnet-4-6': [3, 3.75, 6, 0.3, 15], 'sonnet-4-5': [3, 3.75, 6, 0.3, 15], 'sonnet-4': [3, 3.75, 6, 0.3, 15],
  'haiku-5-5': [0.1, 0.125, 0.2, 0.01, 0.5],
  'haiku-4-5': [1, 1.25, 2, 0.1, 5],
};
// Haiku 5.5는 프롬프트(입력 + 캐시 쓰기 + 캐시 읽기)가 10만 토큰을 넘는 요청이 비싼 값이다
export const LONG_PRICES = { 'haiku-5-5': { over: 100000, p: [0.5, 0.625, 1, 0.05, 2.5] } };

export function modelKey(model) {
  let m = String(model || '').toLowerCase().trim();
  if (!m) return null;
  m = m.replace(/\[[^\]]*\]$/, '').replace(/^(anthropic\.|us\.anthropic\.)/, '').replace(/^claude-/, '').replace(/-v\d+(:\d+)?$/, '').replace(/[-@]\d{8}$/, '').replace(/\./g, '-');
  if (PRICES[m]) return m;
  // 가장 긴 앞머리(예: opus-5-5-preview → opus-5-5)
  let best = null;
  for (const k of Object.keys(PRICES)) if ((m === k || m.startsWith(k + '-')) && (!best || k.length > best.length)) best = k;
  return best;
}
export const priceOf = (model) => { const k = modelKey(model); return k ? PRICES[k] : null; };

// 중계기 요청 기록 한 줄 { model, in, out, cacheW, cacheW1h?, cacheR } → 달러 | null(가격을 모르는 모델)
export function costOf(rec) {
  if (!rec) return 0;
  const tin = Number(rec.in) || 0, out = Number(rec.out) || 0, cw = Number(rec.cacheW) || 0, cr = Number(rec.cacheR) || 0;
  const cw1h = Math.min(cw, Number(rec.cacheW1h) || 0);
  if (!tin && !out && !cw && !cr) return 0;
  const k = modelKey(rec.model);
  if (!k) return null;
  let p = PRICES[k];
  const long = LONG_PRICES[k];
  if (long && tin + cw + cr > long.over) p = long.p;
  return round6((tin * p[0] + (cw - cw1h) * p[1] + cw1h * p[2] + cr * p[3] + out * p[4]) / 1e6);
}

// 중계기 기록 줄들 → { sessions: { 세션 ID: 달러 }, unpriced: 가격을 모르는 요청 수, prices: { updated, url } }. 거절·실패(토큰 없음)는 0
export function sessionCosts(recs) {
  const sessions = {};
  let unpriced = 0;
  for (const r of recs || []) {
    if (!r || r.refused || !num(r.at) || !r.session) continue;
    const usd = costOf(r);
    if (usd === 0) continue;
    if (usd == null) { unpriced++; continue; }
    sessions[r.session] = round6((sessions[r.session] || 0) + usd);
  }
  return { sessions, unpriced, prices: { updated: PRICES_UPDATED, url: PRICES_URL } };
}
