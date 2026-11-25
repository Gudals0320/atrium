// P361: API 크레딧 장부의 순수 함수(파일·네트워크 없음). 장부 책(credit-book.mjs), 창 시험, 단위 시험이 함께 쓴다.
// - parseBilling: Console 결제 페이지를 복사해 붙여 넣은 글(한국어·영어, 페이지 전체 또는 표만) → 구매 크레딧 잔액·자동 충전·지급(grant) 목록
// - 가격표(PRICES, 공식 가격 페이지를 옮긴 것, PRICES_UPDATED에 옮긴 날) → 중계기 요청 기록 한 줄의 추정 금액(캐시 쓰기 5분·1시간, 캐시 읽기, Haiku 5.5 긴 프롬프트)
// - allocate: 붙여 넣은 뒤의 지출을 지급에 나눈다. 규칙(창 툴팁에도 적는다):
//     월 크레딧(요금제 지급)이 덮는 지출(SDK 세션, 공식 지출)은 월 크레딧 → 그 밖의 지급 → 구매 크레딧 순이고, 같은 무리 안에서는 먼저 만료되는 것부터.
//     덮지 않는 지출(대화형 claude, 중계기 기록 ep cli)은 월 크레딧을 건너뛴다. 지급은 그 잔액을 본 때(seenAt) 뒤, 만료 전의 지출만 받는다.
// 값은 늘 달러(소수)다. 키·토큰 값은 다루지 않는다
export const PRICES_UPDATED = '2026-11-25';
export const PRICES_URL = 'https://platform.claude.com/docs/en/about-claude/pricing';
export const EXPIRY_SOON_MS = 3 * 86400000; // 만료 알림: 남은 금액이 있는 지급이 3일 안에 끝나면
export const EPS = 0.005; // 반 센트보다 작으면 바닥

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const round2 = (v) => Math.round(v * 100) / 100;
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

// ---------- 붙여 넣기 읽기 ----------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const ZONES = { utc: 0, gmt: 0, z: 0, kst: 540, jst: 540, pst: -480, pdt: -420, mst: -420, mdt: -360, cst: -360, cdt: -300, est: -300, edt: -240, cet: 60, cest: 120, bst: 60 };
const MONEY_RE = /([-−–]?)\s*(?:(?:US|USD)\s*)?([-−–]?)\s*\$\s*([-−–]?)\s*(\d[\d,]*(?:\.\d+)?)/;
// "-US$4.33", "US$-4.33", "−$4.33", "$1,234.50" → 수 | null
export function moneyOf(s) {
  const m = MONEY_RE.exec(String(s || ''));
  if (!m) return null;
  const v = Number(m[4].replace(/,/g, ''));
  if (!Number.isFinite(v)) return null;
  return (m[1] || m[2] || m[3]) ? -v : v;
}
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, mo, d) => `${y}-${pad(mo)}-${pad(d)}`;
const validDay = (y, mo, d) => y >= 2000 && y < 2200 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
// 시간대 글 → 분(동쪽 +) | null
function zoneOf(s) {
  const m = /\b(?:GMT|UTC)\s*([+\-−])\s*(\d{1,2})(?::?(\d{2}))?\b/i.exec(s);
  if (m) return (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  const z = /\b(UTC|GMT|KST|JST|PST|PDT|MST|MDT|CST|CDT|EST|EDT|CET|CEST|BST)\b/i.exec(s);
  return z ? ZONES[z[1].toLowerCase()] : null;
}
// 글 안의 첫 날짜(+ 시각·시간대) → { date: 'YYYY-MM-DD', ms, hasTime, zone, end: 끝 위치 } | null.
//   시간대가 없으면 tzOffsetMin(이 PC, 분, 동쪽 +)으로 본다. 날짜만이면 그날 0시
export function dateIn(text, tzOffsetMin = 0) {
  const s = String(text || '');
  const pats = [
    // 2026년 11월 27일
    [/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/, (m) => [+m[1], +m[2], +m[3]]],
    // 2026-11-27, 2026/11/27, 2026. 11. 27.
    [/(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\.?(?!\d)/, (m) => [+m[1], +m[2], +m[3]]],
    // Nov 27, 2026 / November 27 2026
    [/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i, (m) => [+m[3], MONTHS[m[1].toLowerCase()], +m[2]]],
    // 27 Nov 2026
    [/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?,?\s+(\d{4})/i, (m) => [+m[3], MONTHS[m[2].toLowerCase()], +m[1]]],
    // 11/27/2026 (미국식)
    [/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/, (m) => [+m[3], +m[1], +m[2]]],
  ];
  let best = null;
  for (const [re, f] of pats) {
    const m = re.exec(s);
    if (!m) continue;
    const [y, mo, d] = f(m);
    if (!validDay(y, mo, d)) continue;
    if (!best || m.index < best.index) best = { index: m.index, end: m.index + m[0].length, y, mo, d };
  }
  if (!best) return null;
  // 날짜 바로 뒤(또는 앞의 "오전/오후")의 시각
  const rest = s.slice(best.end, best.end + 40);
  const tm = /^[\s,]*(?:at\s+|에\s*)?(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|a\.m\.|p\.m\.|오전|오후)?/i.exec(rest);
  let hh = 0, mm = 0, hasTime = false, end = best.end;
  if (tm) {
    hh = Number(tm[2]); mm = Number(tm[3]); hasTime = true; end = best.end + tm[0].length;
    const ap = String(tm[1] || tm[5] || '').toLowerCase().replace(/\./g, '');
    if ((ap === 'pm' || ap === '오후') && hh < 12) hh += 12;
    if ((ap === 'am' || ap === '오전') && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) { hh = 0; mm = 0; hasTime = false; end = best.end; }
  }
  const zoneText = s.slice(end, end + 24);
  const zm = /^\s*\(?\s*((?:GMT|UTC)\s*[+\-−]\s*\d{1,2}(?::?\d{2})?|UTC|GMT|KST|JST|PST|PDT|MST|MDT|CST|CDT|EST|EDT|CET|CEST|BST)\b\)?/i.exec(zoneText);
  const zone = zm ? zoneOf(zm[1]) : null;
  if (zm) end += zm[0].length;
  const off = zone ?? tzOffsetMin;
  const ms = Date.UTC(best.y, best.mo - 1, best.d, hh, mm) - off * 60000;
  return { date: ymd(best.y, best.mo, best.d), ms, hasTime, zone, index: best.index, end };
}

// 월 크레딧(요금제 지급) 이름: "API credit (Ultra)", "API 크레딧 (Max)" 꼴 → 요금제 이름 | null
export function planOfName(name) {
  const m = /\bAPI\s*(?:credits?|크레딧)\s*\(\s*([A-Za-z][A-Za-z0-9 +.-]{0,24}?)\s*\)/i.exec(String(name || ''));
  return m ? m[1].trim() : null;
}
// 적용 대상 글 → 목록
const splitTargets = (s) => String(s || '').split(/\s*(?:,|·|•|\||;|、|\t)\s*/).map((x) => x.trim()).filter((x) => x && x.length <= 60 && moneyOf(x) == null);

const LABELS = {
  balance: /^(크레딧\s*잔액|credit\s*balance|credits?\s*remaining|remaining\s*balance|잔여\s*크레딧)\s*:?$/i,
  due: /(미납\s*잔액|미결제|amount\s*due|outstanding\s*balance|balance\s*due|past\s*due|unpaid)/i,
  promo: /(프로모션\s*크레딧\s*(?:US)?\$|promotional\s*credits?|(?:US)?\$[\d,.]+\s*(?:in\s*)?promotional)/i,
  auto: /^(자동\s*충전|auto[-\s]?reload|automatic\s*reload|auto[-\s]?recharge)/i,
  on: /(켜짐|사용\s*중|활성|\bon\b|enabled|active)/i,
  off: /(꺼짐|사용\s*안\s*함|비활성|\boff\b|disabled|inactive)/i,
  header: /^(이름|name|잔액\s*\/\s*총액|balance\s*\/\s*total|remaining\s*\/\s*total|적용\s*대상|applies\s*to|eligible\s*for|만료일|expires?(\s*(on|at))?|expiration(\s*date)?|부여\s*날짜|granted(\s*(on|date))?|grant\s*date|날짜|date|유형|type|상태|status|비용|amount|cost)$/i,
};
const PAIR_RE = /^(.*?)([-−–]?\s*(?:US|USD)?\s*[-−–]?\$\s*[-−–]?\d[\d,]*(?:\.\d+)?)\s*\/\s*((?:US|USD)?\s*\$\s*\d[\d,]*(?:\.\d+)?)(.*)$/i;

// 붙여 넣은 글 → { grants, purchased, promoAvailable, autoReload, found, warnings }
//   grants: [{ name, kind: plan|promo, plan, remaining, total, appliesTo: [], expiresAt(ms), expiresText, grantedOn('YYYY-MM-DD'), hasTime }]
//   purchased: { balance, due } | null. tzOffsetMin = 이 PC의 시간대(분, 동쪽 +; 시간대 표시가 없는 날짜에 쓴다)
export function parseBilling(text, { tzOffsetMin = -new Date().getTimezoneOffset() } = {}) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/[​-‍﻿]/g, '');
  // 잔액과 "/ 총액"이 다른 줄로 갈라졌으면 잇는다
  const joined = raw.replace(/(\$\s*\d[\d,]*(?:\.\d+)?)\s*\n\s*\/\s*/g, '$1 / ');
  const lines = joined.split('\n');
  const cells = []; const lineOf = []; const perLine = [];
  lines.forEach((l, li) => { let n = 0; for (const c of l.split('\t')) { const x = c.replace(/\s+/g, ' ').trim(); if (x) { cells.push(x); lineOf.push(li); n++; } } perLine[li] = n; });
  const SECTION = /^(청구서\s*내역|청구서|결제\s*내역|invoice\s*history|invoices|billing\s*history|payment\s*history|결제\s*수단|payment\s*methods?)$/i;
  const warnings = [];
  const grants = [];
  // 1) 지급 줄: "잔액 / 총액"이 있는 칸을 닻으로
  const anchors = [];
  cells.forEach((c, i) => { const m = PAIR_RE.exec(c); if (m) anchors.push({ i, m }); });
  for (let a = 0; a < anchors.length; a++) {
    const { i, m } = anchors[a];
    const stop = a + 1 < anchors.length ? anchors[a + 1].i : cells.length;
    let name = m[1].trim();
    if (!name) { // 앞 칸이 이름(머리 칸·금액 칸은 아님)
      for (let j = i - 1; j >= Math.max(0, i - 2); j--) { const c = cells[j]; if (LABELS.header.test(c) || PAIR_RE.test(c) || dateIn(c)) break; name = c; break; }
    }
    // 다음 닻의 이름 칸은 이 줄 몫이 아니다
    const nextNameAt = a + 1 < anchors.length && !anchors[a + 1].m[1].trim() ? anchors[a + 1].i - 1 : stop;
    // 탭으로 나뉜 표 줄(칸 셋 이상)이면 그 줄만, 칸마다 한 줄이면 다음 지급이나 다음 절(청구서 내역 등) 앞까지
    let end = Math.min(stop, nextNameAt);
    if (perLine[lineOf[i]] >= 3) { let k = i + 1; while (k < end && lineOf[k] === lineOf[i]) k++; end = k; }
    else for (let k = i + 1; k < end; k++) if (SECTION.test(cells[k])) { end = k; break; }
    const tail = [m[4].trim(), ...cells.slice(i + 1, end)].filter(Boolean).join('\t');
    const remaining = moneyOf(m[2]); const total = moneyOf(m[3]);
    // 적용 대상 = 첫 날짜 앞의 글, 날짜 둘 = 만료일·부여 날짜(앞뒤를 날짜로 가린다)
    const dates = []; let rest = tail; let before = null;
    for (let k = 0; k < 3; k++) {
      const d = dateIn(rest, tzOffsetMin);
      if (!d) break;
      if (before == null) before = rest.slice(0, d.index);
      dates.push({ ...d, text: rest.slice(d.index, d.end).trim() });
      rest = rest.slice(d.end);
    }
    if (before == null) before = tail;
    if (!name) { warnings.push('no_name'); name = '?'; }
    const plan = planOfName(name);
    let exp = dates[0] || null; let granted = dates[1] || null;
    // 둘 다 있고 부여가 만료보다 늦으면 차례가 바뀐 표다(열 순서가 다른 화면)
    if (exp && granted && granted.ms > exp.ms) [exp, granted] = [granted, exp];
    if (!exp) warnings.push('no_expiry');
    grants.push({ name: name.slice(0, 80), kind: plan ? 'plan' : 'promo', plan, remaining, total, appliesTo: splitTargets(before), expiresAt: exp ? exp.ms : null, expiresText: exp ? exp.text : null, hasTime: exp ? exp.hasTime : false, grantedOn: granted ? granted.date : null });
  }
  // 2) 구매 크레딧 잔액: "크레딧 잔액" 다음(또는 같은 칸)의 금액, "미납 잔액"이 붙으면 미납
  let purchased = null;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const same = /^(크레딧\s*잔액|credit\s*balance|remaining\s*balance)\s*:?\s*(.*\$.*)$/i.exec(c);
    if (!same && !LABELS.balance.test(c)) continue;
    let v = same ? moneyOf(same[2]) : null; let at = i;
    for (let j = i + 1; v == null && j < Math.min(cells.length, i + 4); j++) { const x = moneyOf(cells[j]); if (x != null && !PAIR_RE.test(cells[j]) && !LABELS.promo.test(cells[j])) { v = x; at = j; } }
    if (v == null) continue;
    const near = cells.slice(i, Math.min(cells.length, at + 3)).join(' ');
    purchased = { balance: v, due: v < 0 || LABELS.due.test(near) };
    break;
  }
  // 3) "프로모션 크레딧 US$327.11 사용 가능" / "US$327.11 in promotional credits available"
  let promoAvailable = null;
  for (const c of cells) if (LABELS.promo.test(c) && !PAIR_RE.test(c)) { const v = moneyOf(c); if (v != null) { promoAvailable = v; break; } }
  // 4) 자동 충전
  let autoReload = null;
  for (let i = 0; i < cells.length; i++) {
    if (!LABELS.auto.test(cells[i])) continue;
    const near = [cells[i].replace(LABELS.auto, ''), cells[i + 1] || ''].join(' ');
    if (LABELS.off.test(near)) autoReload = false; else if (LABELS.on.test(near)) autoReload = true;
    if (autoReload != null) break;
  }
  if (promoAvailable != null && grants.length) {
    const live = grants.filter((g) => num(g.remaining)).reduce((x, g) => x + g.remaining, 0);
    if (Math.abs(round2(live) - round2(promoAvailable)) >= 0.01) warnings.push('promo_sum');
  }
  const found = grants.length > 0 || purchased != null;
  if (!found) warnings.push('nothing');
  return { grants, purchased, promoAvailable, autoReload, found, warnings };
}

// ---------- 다음 지급 ----------
// 요금제 { name, amount, day(결제일 1~31) } → { date: 'YYYY-MM-DD', at(그날 0시, 이 PC), amount, name } | null. 오늘이 결제일이면 오늘
const daysIn = (y, m0) => new Date(y, m0 + 1, 0).getDate();
export function nextGrantOf(plan, now = Date.now()) {
  if (!plan || !num(Number(plan.day)) || !(plan.day >= 1 && plan.day <= 31)) return null;
  const n = new Date(now);
  let y = n.getFullYear(), m = n.getMonth();
  let d = Math.min(plan.day, daysIn(y, m));
  if (d < n.getDate()) { m++; if (m > 11) { m = 0; y++; } d = Math.min(plan.day, daysIn(y, m)); }
  const at = new Date(y, m, d).getTime();
  return { date: ymd(y, m + 1, d), at, amount: num(Number(plan.amount)) ? Number(plan.amount) : null, name: plan.name || null };
}
// 붙여 넣은 지급에서 요금제 추정(가장 최근 요금제 지급의 이름·총액·부여 날짜의 일)
export function planGuess(grants) {
  const p = (grants || []).filter((g) => g.kind === 'plan' && g.grantedOn).sort((a, b) => String(b.grantedOn).localeCompare(String(a.grantedOn)))[0];
  if (!p) return null;
  return { name: p.plan || null, amount: num(p.total) ? p.total : null, day: Number(String(p.grantedOn).slice(8, 10)) || null };
}

// ---------- 나누기 ----------
// ledger.grants[{ id, kind, remaining, expiresAt, seenAt }], ledger.purchased{ balance, seenAt }, items[{ at, end?, usd, covered }]
//   → { grants: { id: { spent, left } }, purchasedSpent, purchasedLeft, unplaced }
//   items는 시각 차례로 나눈다. 시간 칸(공식 1시간 칸)이 붙여 넣은 때에 걸치면 걸친 비율만 셈한다
export function allocate(ledger, items, now = Date.now()) {
  const out = { grants: {}, purchasedSpent: 0, purchasedLeft: null, unplaced: 0 };
  const gs = ((ledger && ledger.grants) || []).map((g) => ({ ...g, left: num(g.remaining) ? Math.max(0, g.remaining) : 0, spent: 0 }));
  const pur = ledger && ledger.purchased && num(ledger.purchased.balance) ? { ...ledger.purchased, left: ledger.purchased.balance } : null;
  const since = ledger ? ledger.pastedAt : null;
  const endOf = (x) => (num(x.end) && x.end > x.at ? x.end : x.at);
  // since 뒤 몫(0~1): 점 항목은 0 또는 1, 시간 칸은 걸친 비율
  const share = (x) => { if (!num(since)) return 1; const e = endOf(x); if (e <= x.at) return x.at >= since ? 1 : 0; return Math.max(0, Math.min(1, (e - since) / (e - x.at))); };
  const seen = (x, t) => !num(t) || endOf(x) > t; // 그 잔액을 본 뒤의 지출인가
  const rank = (g) => (g.kind === 'plan' ? 0 : 1);
  const list = [...(items || [])].filter((x) => x && num(x.usd) && x.usd > 0 && num(x.at)).sort((a, b) => a.at - b.at);
  for (const x of list) {
    let amt = x.usd * share(x);
    if (amt <= 0) continue;
    const covered = x.covered !== false;
    const cands = gs.filter((g) => (covered || g.kind !== 'plan') && g.left > 0 && !(num(g.expiresAt) && x.at >= g.expiresAt) && seen(x, g.seenAt))
      .sort((a, b) => rank(a) - rank(b) || (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
    for (const g of cands) { const take = Math.min(g.left, amt); g.left -= take; g.spent += take; amt -= take; if (amt <= 1e-12) break; }
    if (amt > 1e-12) { if (pur && seen(x, pur.seenAt)) { pur.left -= amt; out.purchasedSpent += amt; } else out.unplaced += amt; }
  }
  for (const g of gs) out.grants[g.id] = { spent: round6(g.spent), left: round6(Math.max(0, g.left)) };
  out.purchasedSpent = round6(out.purchasedSpent);
  out.purchasedLeft = pur ? round6(pur.left) : null;
  out.unplaced = round6(out.unplaced);
  void now;
  return out;
}

// 중계기 기록 줄 → 지출 항목 { at, usd, covered, session, model } (가격 모름은 usd null). 실패한 요청(토큰 없음)은 0
export function relayItems(recs) {
  const out = [];
  for (const r of recs || []) {
    if (!r || r.refused || !num(r.at)) continue;
    const usd = costOf(r);
    if (usd === 0) continue;
    out.push({ at: r.at, usd, covered: r.ep !== 'cli', session: r.session || null, model: r.model || null, src: 'relay' });
  }
  return out;
}
// 이 PC의 오늘 0시·이번 달 1일 0시
export function dayStart(now = Date.now()) { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
export function monthStart(now = Date.now()) { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }
export const hourFloor = (t) => Math.floor(t / 3600000) * 3600000;
export const hourCeil = (t) => Math.ceil(t / 3600000) * 3600000;

// 공식 비용 칸 { s, e(ms), usd }과 중계기 항목을 합친다: [from, coveredUntil) 시간은 공식 칸, 그 밖은 중계기 추정
export function mergeItems({ official = null, relay = [] }) {
  if (!official || !Array.isArray(official.rows)) return relay;
  const from = official.from, until = official.coveredUntil;
  const off = official.rows.filter((r) => num(r.s) && r.s >= from && r.s < until).map((r) => ({ at: r.s, end: r.e, usd: r.usd, covered: true, src: 'official' }));
  const rel = relay.filter((x) => !(x.at >= from && x.at < until));
  return [...off, ...rel];
}

// 장부 + 지출 → 보이는 값(창·CLI·휴대폰)
export function creditView({ ledger, relayRecs = [], official = null, now = Date.now(), alerted = {}, adminKey = false }) {
  const relay = relayItems(relayRecs);
  const unpriced = relay.filter((x) => x.usd == null).length;
  const priced = relay.filter((x) => x.usd != null);
  const sessions = {};
  for (const x of priced) if (x.session) sessions[x.session] = round6((sessions[x.session] || 0) + x.usd);
  const items = mergeItems({ official, relay: priced });
  const basis = official && Array.isArray(official.rows) ? 'official' : 'estimate';
  const sumSince = (t) => round2(items.reduce((a, x) => { if (x.at >= t) return a + x.usd; const end = num(x.end) ? x.end : x.at; return end > t ? a + x.usd * ((end - t) / (end - x.at)) : a; }, 0));
  const spend = { today: sumSince(dayStart(now)), month: sumSince(monthStart(now)) };
  const base = { basis, basisAt: basis === 'official' ? official.refreshedAt || official.at || null : now, officialAt: official ? official.at || null : null, officialError: official && official.error ? official.error : null, adminKey: !!adminKey, prices: { updated: PRICES_UPDATED, url: PRICES_URL }, unpriced, sessions, spend, at: now };
  if (!ledger) return { ...base, ledger: false, grants: [], totals: null, nextGrant: null, plan: null, expiring: [], exhausted: false };
  const pastedAt = ledger.pastedAt || null;
  const al = allocate(ledger, items, now);
  const grants = (ledger.grants || []).map((g) => {
    const a = al.grants[g.id] || { spent: 0, left: num(g.remaining) ? g.remaining : 0 };
    const expired = num(g.expiresAt) && g.expiresAt <= now;
    return { id: g.id, name: g.name, kind: g.kind, plan: g.plan || null, total: num(g.total) ? g.total : null, remaining: g.remaining, left: expired ? 0 : round2(a.left), spent: round2(a.spent), appliesTo: g.appliesTo || [], expiresAt: g.expiresAt ?? null, hasTime: !!g.hasTime, grantedOn: g.grantedOn || null, seenAt: g.seenAt || pastedAt, expired, soon: !expired && a.left > EPS && num(g.expiresAt) && g.expiresAt - now <= EXPIRY_SOON_MS };
  }).sort((a, b) => (a.expired ? 1 : 0) - (b.expired ? 1 : 0) || (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
  const live = grants.filter((g) => !g.expired);
  const planLeft = round2(live.filter((g) => g.kind === 'plan').reduce((a, g) => a + g.left, 0));
  const promoLeft = round2(live.filter((g) => g.kind !== 'plan').reduce((a, g) => a + g.left, 0));
  const purchased = ledger.purchased && num(ledger.purchased.balance) ? { balance: round2(al.purchasedLeft ?? ledger.purchased.balance), seen: ledger.purchased.balance, spent: round2(al.purchasedSpent), due: (al.purchasedLeft ?? ledger.purchased.balance) < 0 || !!ledger.purchased.due } : null;
  const usable = round2(planLeft + promoLeft + (purchased ? Math.max(0, purchased.balance) : 0));
  const nextGrant = nextGrantOf(ledger.plan, now);
  const expiring = grants.filter((g) => g.soon).map((g) => ({ id: g.id, key: alertKey(g), name: g.name, left: g.left, expiresAt: g.expiresAt, alerted: !!alerted[alertKey(g)] }));
  const exhausted = planLeft + promoLeft <= EPS && (!purchased || purchased.balance <= EPS);
  return { ...base, ledger: true, pastedAt, source: ledger.source || 'paste', autoReload: ledger.autoReload ?? null, grants, totals: { plan: planLeft, promo: promoLeft, purchased: purchased ? purchased.balance : null, usable }, purchased, unplaced: round2(al.unplaced), nextGrant, plan: ledger.plan || null, expiring, exhausted };
}
// 알림 열쇠: 이름과 만료 시각(같은 페이지를 다시 붙여 넣어 지급 id가 바뀌어도 다시 알리지 않는다)
export const alertKey = (g) => `${g.name}|${g.expiresAt}`;

// 휴대폰·작은 화면용 줄인 값
export function slimView(v) {
  if (!v) return null;
  return { ledger: !!v.ledger, basis: v.basis, basisAt: v.basisAt, totals: v.totals || null, spend: v.spend, nextGrant: v.nextGrant || null, exhausted: !!v.exhausted, at: v.at, grants: (v.grants || []).filter((g) => !g.expired).map((g) => ({ id: g.id, name: g.name, kind: g.kind, total: g.total, left: g.left, expiresAt: g.expiresAt, grantedOn: g.grantedOn, soon: g.soon })) };
}
