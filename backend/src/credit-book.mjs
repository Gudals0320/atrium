// P361: API 크레딧 장부. 판이 조직 크레딧을 지급(grant) 목록으로 쥐고, 붙여 넣은 뒤 쓴 양을 빼서 보인다.
// - 장부: Console 결제 페이지를 붙여 넣어(api-credits.mjs parseBilling, 저장 전에 미리 보기) 또는 손으로 더하고 고치고 지운다.
//   판 기록 meta apiCredits { ledger, alerted, official }. ledger { pastedAt, source, purchased{ balance, due, seenAt }, autoReload, grants[{ id, name, kind, plan, total, remaining, appliesTo, expiresAt, hasTime, grantedOn, seenAt }], plan{ name, amount, day } }
// - 쓴 양: Admin 키가 있으면 공식 비용 API(1시간 칸, 중계기 자식이 키를 풀어 묻는다)를 30분마다(펼칠 때는 10분 지났으면) 받아 "공식",
//   없거나 공식 값이 아직 없는 시간은 중계기 요청 기록 × 가격표로 판 세션 몫만 "추정". 나누는 규칙은 api-credits.mjs allocate
// - 알림: 남은 금액이 있는 지급이 만료 3일 안이면 지급마다 한 번 credits.alert를 보내고 할 일 "나중에" 카드(판 카드, 세션 없음)를 남긴다. 만료가 지나면 카드를 닫는다
// 값(키)은 다루지 않는다. 창에는 usage.get·usage.updated의 apiCredits로 간다
import crypto from 'node:crypto';
import { parseBilling, creditView, planGuess, planOfName, hourFloor, hourCeil, monthStart, dayStart, alertKey } from './api-credits.mjs';

export const BOARD_CARD_SID = 'board'; // 판이 남기는 카드(세션 없음)의 세션 칸
const OFFICIAL_EVERY_MS = 30 * 60000;
const OFFICIAL_OPEN_MS = 10 * 60000;
const OFFICIAL_FAIL_MS = 30 * 60000;
const MAX_SPAN_MS = 31 * 86400000 - 3600000;
const GRANTS_MAX = 50;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const money = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : undefined);
const clip = (s, n) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);
const err = (code, message, key, vars = {}) => Object.assign(new Error(message), { code, key, vars });

// 지급 하나 다듬기(붙여 넣기 결과·손 입력 모두). 틀리면 던진다
export function cleanGrant(g, { now = Date.now(), seenAt = now, id = null } = {}) {
  if (!g || typeof g !== 'object') throw err('bad_request', '지급 칸이 비었습니다', 'apiCredits.err.grant');
  const name = clip(g.name, 80);
  if (!name) throw err('bad_request', '지급 이름을 넣으세요', 'apiCredits.err.name');
  const total = money(g.total); const remaining = money(g.remaining);
  if (total === undefined || remaining === undefined || remaining == null) throw err('bad_request', '잔액·총액은 숫자(달러)입니다', 'apiCredits.err.amount');
  const expiresAt = g.expiresAt == null || g.expiresAt === '' ? null : Number(g.expiresAt);
  if (expiresAt != null && !num(expiresAt)) throw err('bad_request', '만료 시각을 읽지 못했습니다', 'apiCredits.err.expiry');
  const grantedOn = g.grantedOn && /^\d{4}-\d{2}-\d{2}$/.test(String(g.grantedOn)) ? String(g.grantedOn) : null;
  const plan = g.plan ? clip(g.plan, 24) : planOfName(name);
  const kind = g.kind === 'plan' || g.kind === 'promo' ? g.kind : plan ? 'plan' : 'promo';
  const appliesTo = (Array.isArray(g.appliesTo) ? g.appliesTo : String(g.appliesTo || '').split(',')).map((x) => clip(x, 60)).filter(Boolean).slice(0, 12);
  return { id: id || g.id || crypto.randomBytes(6).toString('hex'), name, kind, plan: plan || null, total: total ?? null, remaining, appliesTo, expiresAt, hasTime: !!g.hasTime, grantedOn, seenAt: num(Number(g.seenAt)) ? Number(g.seenAt) : seenAt };
}
export function cleanPlan(p) {
  if (!p) return null;
  const day = Number(p.day); const amount = money(p.amount);
  if (!(day >= 1 && day <= 31 && Number.isInteger(day))) throw err('bad_request', '결제일은 1~31입니다', 'apiCredits.err.day');
  if (amount === undefined) throw err('bad_request', '금액은 숫자(달러)입니다', 'apiCredits.err.amount');
  return { name: clip(p.name, 24) || null, amount: amount ?? null, day };
}

// 만료 알림 카드 글(판 설정 언어)
export function expiryCardText(g, lang = 'en', tz = undefined) {
  const d = new Date(g.expiresAt);
  const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  void tz;
  const amt = `$${(Math.round(g.left * 100) / 100).toFixed(2)}`;
  return lang === 'ko' ? { question: `${g.name} ${amt}이 ${when}에 만료`, cond: '만료 전에 SDK 세션으로 쓰거나 그냥 둔다' } : { question: `${g.name} ${amt} expires ${when}`, cond: 'use it with SDK sessions before it expires, or let it go' };
}

export class CreditBook {
  // b: 백엔드(store, api, decisions, log, features), relay: AuthRelay
  constructor(b, { relay, now = () => Date.now(), onChange = () => {} } = {}) {
    Object.assign(this, { b, relay, now, onChange });
    const saved = b.store ? b.store.getMeta('apiCredits') : null;
    this.ledger = saved && saved.ledger ? saved.ledger : null;
    this.alerted = (saved && saved.alerted) || {};
    this.official = (saved && saved.official) || null;
    this.inflight = null; this.lastTry = 0; this.lastOk = true;
    this.timer = null; this.cache = null;
  }
  save() { if (this.b.store) this.b.store.setMeta('apiCredits', { ledger: this.ledger, alerted: this.alerted, official: this.official }); }
  lang() { try { return ((this.b.features && this.b.features.settings && this.b.features.settings.get()) || {}).language || 'en'; } catch { return 'en'; } }
  // 보이는 값. 중계기 기록이 그대로면 담아 둔 값
  view() {
    const recs = this.relay ? this.relay.allRequests() : [];
    const now = this.now();
    const key = `${recs.length}|${Math.floor(now / 60000)}|${this.rev || 0}`;
    if (this.cache && this.cache.key === key) return this.cache.v;
    const v = creditView({ ledger: this.ledger, relayRecs: recs, official: this.official, now, alerted: this.alerted, adminKey: this.relay ? this.relay.adminPresent() : false });
    this.cache = { key, v };
    return v;
  }
  changed() { this.rev = (this.rev || 0) + 1; this.save(); try { this.onChange(); } catch {} this.checkAlerts(); }
  // 중계기 요청이 기록됐다: 모아서 3초에 한 번 알린다
  relayChanged() {
    if (this.relayTimer) return;
    this.relayTimer = setTimeout(() => { this.relayTimer = null; this.cache = null; try { this.onChange(); } catch {} this.checkAlerts(); }, 3000);
    if (this.relayTimer.unref) this.relayTimer.unref();
  }
  // 붙여 넣기 미리 보기(저장하지 않는다)
  preview(text) {
    const s = String(text || '');
    if (s.length > 400000) throw err('too_long', '붙여 넣은 글이 너무 깁니다', 'apiCredits.err.tooLong');
    const r = parseBilling(s);
    return { ...r, planGuess: planGuess(r.grants), at: this.now() };
  }
  // 미리 본 결과를 장부로(지금까지의 지급은 바꾼다). plan을 따로 주지 않았으면 있던 요금제, 없으면 추정
  saveParsed(p = {}) {
    const now = this.now();
    const grants = (Array.isArray(p.grants) ? p.grants : []).slice(0, GRANTS_MAX).map((g) => cleanGrant(g, { now, seenAt: now, id: null }));
    const purchased = p.purchased && num(money(p.purchased.balance)) ? { balance: money(p.purchased.balance), due: !!p.purchased.due || money(p.purchased.balance) < 0, seenAt: now } : (this.ledger && this.ledger.purchased) || null;
    if (!grants.length && !purchased) throw err('bad_request', '읽은 지급·잔액이 없습니다', 'apiCredits.err.nothing');
    const plan = p.plan !== undefined ? cleanPlan(p.plan) : (this.ledger && this.ledger.plan) || (() => { const g = planGuess(grants); return g && g.day ? cleanPlan(g) : null; })();
    this.ledger = { pastedAt: now, source: 'paste', purchased, autoReload: typeof p.autoReload === 'boolean' ? p.autoReload : null, grants, plan };
    this.official = null; // 범위가 바뀌었다
    this.changed();
    this.refreshOfficial({ force: true }).catch(() => {});
    return this.view();
  }
  ensureLedger() { if (!this.ledger) this.ledger = { pastedAt: this.now(), source: 'manual', purchased: null, autoReload: null, grants: [], plan: null }; return this.ledger; }
  // 손으로: op add | update | remove
  grantOp({ op, grant = null, id = null } = {}) {
    const now = this.now();
    const l = this.ensureLedger();
    if (op === 'add') { if (l.grants.length >= GRANTS_MAX) throw err('too_many', '지급이 너무 많습니다', 'apiCredits.err.tooMany'); l.grants.push(cleanGrant(grant, { now, seenAt: now })); }
    else if (op === 'update') {
      const i = l.grants.findIndex((g) => g.id === id);
      if (i < 0) throw err('not_found', '그 지급이 없습니다', 'apiCredits.err.notFound');
      const old = l.grants[i];
      const next = cleanGrant({ ...old, ...grant, seenAt: undefined }, { now, seenAt: now, id: old.id });
      // 잔액을 고쳤으면 그때 본 잔액이다. 이름·날짜만 고쳤으면 본 때는 그대로
      if (next.remaining === old.remaining) next.seenAt = old.seenAt;
      l.grants[i] = next;
    } else if (op === 'remove') {
      const n = l.grants.length; l.grants = l.grants.filter((g) => g.id !== id);
      if (l.grants.length === n) throw err('not_found', '그 지급이 없습니다', 'apiCredits.err.notFound');
    } else throw err('bad_request', 'op는 add | update | remove', 'apiCredits.err.op');
    this.changed();
    return this.view();
  }
  setPurchased({ balance = null } = {}) {
    const l = this.ensureLedger();
    const v = money(balance);
    if (v === undefined) throw err('bad_request', '금액은 숫자(달러)입니다', 'apiCredits.err.amount');
    l.purchased = v == null ? null : { balance: v, due: v < 0, seenAt: this.now() };
    this.changed();
    return this.view();
  }
  setPlan(plan) { const l = this.ensureLedger(); l.plan = plan ? cleanPlan(plan) : null; this.changed(); return this.view(); }
  clear() { this.ledger = null; this.official = null; this.changed(); return this.view(); }

  // 공식 비용(Admin 키가 있을 때). force가 아니면 간격을 지킨다
  officialRange(now = this.now()) {
    const l = this.ledger;
    const to = hourFloor(now) + 3600000;
    let from = hourFloor(Math.min(monthStart(now), dayStart(now), l && l.pastedAt ? l.pastedAt : now));
    if (to - from > MAX_SPAN_MS) from = hourCeil(to - MAX_SPAN_MS);
    return { from, to };
  }
  async refreshOfficial({ force = false, open = false } = {}) {
    if (!this.relay || !this.relay.adminPresent()) { if (this.official) { this.official = null; this.changed(); } return null; }
    if (this.inflight) return this.inflight;
    const now = this.now();
    const wait = !this.lastOk ? OFFICIAL_FAIL_MS : open ? OFFICIAL_OPEN_MS : OFFICIAL_EVERY_MS;
    if (!force && this.lastTry && now - this.lastTry < wait) return null;
    this.lastTry = now;
    const { from, to } = this.officialRange(now);
    this.inflight = this.relay.queryCost({ from, to }).then((r) => {
      const refreshed = num(r.refreshedAt) ? r.refreshedAt : null;
      this.official = { at: this.now(), from, to, rows: r.rows, refreshedAt: refreshed, coveredUntil: refreshed ? Math.min(hourFloor(refreshed), to) : from, error: null };
      this.lastOk = true;
      if (this.b.log) this.b.log(`api credits: official cost ${r.rows.length} rows, ${r.pages} pages`);
      this.changed();
      return this.official;
    }).catch((e) => {
      this.lastOk = false;
      const why = (e && e.vars && e.vars.why) || (e && e.code) || 'error';
      this.official = { at: this.now(), from, to, rows: this.official && this.official.rows ? this.official.rows : null, refreshedAt: this.official ? this.official.refreshedAt : null, coveredUntil: this.official ? this.official.coveredUntil : from, error: String(why).slice(0, 60) };
      if (this.b.log) this.b.log(`api credits: official cost failed (${why})`);
      this.changed();
      return null;
    }).finally(() => { this.inflight = null; });
    return this.inflight;
  }
  start(everyMs = 5 * 60000) {
    this.checkAlerts();
    this.timer = setInterval(() => { this.cache = null; this.refreshOfficial().catch(() => {}); this.checkAlerts(); }, everyMs);
    if (this.timer.unref) this.timer.unref();
  }
  stop() { clearInterval(this.timer); this.timer = null; clearTimeout(this.relayTimer); this.relayTimer = null; }

  // 만료 알림: 지급마다 한 번. 할 일 "나중에" 카드(판 카드)와 credits.alert. 만료가 지났거나 다 쓴 지급의 카드는 닫는다
  checkAlerts() {
    let v; try { v = this.view(); } catch { return []; }
    const out = [];
    const dec = this.b.decisions;
    for (const e of v.expiring || []) {
      if (this.alerted[e.key]) continue;
      const g = v.grants.find((x) => x.id === e.id);
      const text = expiryCardText({ ...e, name: g ? g.name : e.name }, this.lang());
      let cardId = null;
      if (dec && dec.store) {
        try {
          const card = dec.store().addDecision({ sessionId: BOARD_CARD_SID, name: 'Atrium', question: text.question, options: [], createdAt: this.now(), kind: 'later', later: text.cond, cond: text.cond });
          cardId = card.id;
          this.b.store.addEvent(null, 'decision_todo', { id: card.id, kind: 'later', by: 'board', credit: true });
          dec.changed();
        } catch (x) { if (this.b.log) this.b.log(`api credits: card failed ${x.message}`); }
      }
      this.alerted[e.key] = { at: this.now(), cardId, expiresAt: e.expiresAt };
      const a = { kind: 'expiring', key: e.key, name: g ? g.name : e.name, left: e.left, expiresAt: e.expiresAt, cardId, text: text.question };
      out.push(a);
      try { this.b.api.broadcast('credits.alert', a); } catch {}
      if (this.b.log) this.b.log(`api credits: expiring alert ${e.key}`);
    }
    // 끝난 알림의 카드 닫기, 오래된 열쇠 지우기
    const now = this.now();
    let dirty = out.length > 0;
    for (const [k, a] of Object.entries(this.alerted)) {
      const g = (v.grants || []).find((x) => alertKey(x) === k);
      const over = !g || g.expired || g.left <= 0.005;
      if (over && a && a.cardId && !a.closed && dec && dec.store) {
        try { if (dec.store().endDecision(a.cardId, { state: 'closed', via: 'credit_over' })) dec.changed(); } catch {}
        a.closed = true; dirty = true;
      }
      if (a && a.expiresAt && now - a.expiresAt > 30 * 86400000) { delete this.alerted[k]; dirty = true; }
    }
    if (dirty) this.save();
    return out;
  }
  // SDK 세션을 띄우기 전: 구매 잔액 0 이하이고 월·프로모션 크레딧도 바닥이면 경고 글 열쇠
  spawnWarning() {
    const v = this.view();
    if (!v.ledger || !v.exhausted) return null;
    const p = v.totals && v.totals.purchased != null ? v.totals.purchased : 0;
    return { key: 'apiCredits.exhaustedWarn', vars: { purchased: `${p < 0 ? '-' : ''}$${Math.abs(p).toFixed(2)}` } };
  }
}
