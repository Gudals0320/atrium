// P317: 판 명령이 늘었다는 한 줄 알림. 판 안내문은 띄울 때 한 번만 넣으므로, 그 뒤 계약에 새 동사(예: ask·todo·plan)가 생기면
//   오래 도는 세션은 그것을 모른다. 그래서 세션마다 띄울 때 받은 안내문 판(계약 번호, 동사 목록, 안내문 해시)을 판 저장소(sessions.brief)에 남기고,
//   판이 그 세션에 넣는 다음 전달(사람 글·다른 세션 글·판 알림·스티어링 무엇이든, 처음 보낼 때 = delivery.mjs attachFront)의 앞에
//   "[Atrium 보드] 판 명령이 늘었다: …(자세히는 atrium help)" 한 줄을 한 번 붙인다. 안내문 전체는 다시 넣지 않는다(토큰).
// - 새 동사 = 지금 계약의 동사 − 그 세션이 받은 판의 동사. 그 세션이 쓸 수 있는 동사(P296 permOf: 자체 오케스트레이션 하위·독립)만 알린다.
//   관계가 바뀌어 쓸 수 있게 된 옛 동사는 알리지 않는다(판 명령이 는 것이 아니다. atrium help가 보인다).
// - 붙였으면(또는 알릴 새 동사가 없이 판만 달랐으면) 그 세션의 판을 지금 것으로 올린다. 실은 전달이 실패·취소되면 되돌린다(다음 전달에 다시).
// - 이어 가기·깨우기·다시 띄우기로 안내문을 다시 넣을 때(Claude Code launchOf, 하네스 startHarness)는 알리지 않고 올린다.
// - 판 기록이 없는 옛 세션(P317 전에 띄움)은 마지막으로 띄운 때로 받은 동사를 어림한다(VERB_SINCE: 그 동사가 dev에 합쳐진 때. 그보다 먼저 뜬 세션은 모른다).
// - 대상: 판이 띄운(origin board) 에이전트 세션(Claude Code, Codex, dsh, Hermes 등). 셸과 판이 띄우지 않은 세션(가져온 세션)은 안내문을 받지 않았으니 알리지 않는다.
import crypto from 'node:crypto';
import { CONTRACT_VERSION, VERB_NAMES, VERBS } from './cli-contract.mjs';
import { BOARD_SYSTEM_PROMPT } from './launch.mjs';
import { HARNESS_PROMPT } from './harness.mjs';
import { orchPromptLines } from './orchestration.mjs';

// P334: 동사가 아닌 새 안내(안내문에 더한 약속). 판 기록(stamp.news)에 없으면 다음 전달 앞에 한 줄로 한 번 알린다.
//   news 칸이 없는 판(P334 전의 판이 남긴 기록)은 아무것도 모른다고 본다. 판 기록이 없는 옛 세션(P317 전)은 띄운 때로 어림한다(since)
export const NEWS_HEAD = '[Atrium 보드] 판 안내가 늘었다:';
export const BRIEF_NEWS = [
  { id: 'records', since: Date.parse('2026-11-22T00:00:00+09:00') /* 판 기록이 없는 세션은 P317 전에 떴다: 그 전이면 모른다 */, line: '저장소 문서는 지금 상태만 고친다. 조사·감사·제안·측정·인계 결과는 커밋하지 않고 `atrium done ok "<보고>" --record <파일>`로 붙인다(보드가 .atrium/records/에 둔다). 날짜별 결정 로그는 만들지 않는다' },
];
export const NEWS_IDS = BRIEF_NEWS.map((n) => n.id);
// 그 판이 모르는 새 안내(id 목록)
export const newNews = (stamp, ids = NEWS_IDS) => { const had = new Set((stamp && stamp.news) || []); return ids.filter((id) => !had.has(id)); };
export function newsLine(ids) {
  const list = BRIEF_NEWS.filter((n) => (ids || []).includes(n.id));
  return list.length ? `${NEWS_HEAD} ${list.map((n) => n.line).join(' / ')}(자세히는 atrium help)` : null;
}

export const NOTICE_HEAD = '[Atrium 보드] 판 명령이 늘었다:';
// 알림에 쓰는 동사의 한 줄 뜻(계약의 does는 길다). 없는 동사는 does의 첫 마디
export const VERB_BRIEF = {
  prompt: '다른 세션에게 일·글 보내기', wait: '그 세션의 턴 끝 기다리기', read: '그 세션 화면 읽기', me: '나의 지금 연결',
  child: '하위 워커·동료 띄우기', relate: '관계 바꾸기', log: '동료 소식에 한 줄 남기기', news: '동료 소식 읽기',
  children: '하위 세션 상태', 'child-kill': '하위 세션 끄기', 'child-wait': '하위 세션 준비 기다리기', wake: '잠든 세션 깨우기', models: '띄울 수 있는 모델',
  done: '맡은 일 닫기(ok|failed)', item: '나의 지금 일', items: '내가 맡긴 일들', guide: '자세한 사용법',
  docs: '문서 점검 결과·문서 시작(init)·켜기·끄기', usage: '구독 사용량',
  ask: '사람이 정할 질문을 결정 카드로 남기기',
  todo: '사람에게 넘기는 일·명령·확인·미룬 일을 할 일 카드로 남기기',
  plan: '리포의 목표·마일스톤 레인',
};
// 동사가 dev에 합쳐진 때(판 기록이 없는 옛 세션의 어림. 여기 없는 동사는 그보다 오래되어 안다고 본다)
export const VERB_SINCE = {
  relate: Date.parse('2026-11-15T15:22:58+09:00'), // P156
  done: Date.parse('2026-11-17T03:38:20+09:00'), item: Date.parse('2026-11-17T03:38:20+09:00'), items: Date.parse('2026-11-17T03:38:20+09:00'), // P180
  guide: Date.parse('2026-11-17T05:00:08+09:00'), // P182
  log: Date.parse('2026-11-18T00:39:11+09:00'), news: Date.parse('2026-11-18T00:39:11+09:00'), // P204
  usage: Date.parse('2026-11-18T11:20:34+09:00'), // P211
  docs: Date.parse('2026-11-20T10:28:11+09:00'), // P257
  ask: Date.parse('2026-11-21T00:53:27+09:00'), // P284
  todo: Date.parse('2026-11-21T11:55:07+09:00'), // P292
  plan: Date.parse('2026-11-21T21:58:40+09:00'), // P304
};

// 그 세션 종류가 띄울 때 받는 판 안내문(backend.mjs pluginFor·harnessLaunchOf·orchPrompt와 같은 글). scope: 오케스트레이션 세션의 권한 범위(sub | free)
export function boardPromptOf(s, scope = null) {
  const claude = ((s && s.kind) || 'claude') === 'claude';
  if (s && s.orch) { const l = orchPromptLines(scope || 'free'); return claude ? l.join('\n') : l.join(' '); }
  return claude ? BOARD_SYSTEM_PROMPT : HARNESS_PROMPT;
}
export const promptHash = (text) => crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 12);
// 지금 판(띄울 때 남기는 값) → { contract, verbs, hash, at, why }
export function stampOf({ text = '', verbs = VERB_NAMES, at = Date.now(), why = 'launch' } = {}) {
  return { contract: CONTRACT_VERSION, verbs: [...verbs], hash: promptHash(text), at, why, news: [...NEWS_IDS] }; // P334: news
}
// 판 기록이 없는 옛 세션: 마지막으로 띄운 때(at)까지 합쳐진 동사만 안다고 본다
export function assumedStamp(at, verbs = VERB_NAMES) {
  const t = Number(at) || 0;
  return { contract: null, verbs: verbs.filter((v) => !VERB_SINCE[v] || VERB_SINCE[v] <= t), hash: null, at: t, why: 'assumed', news: BRIEF_NEWS.filter((n) => n.since <= t).map((n) => n.id) }; // P334
}
// 같은 판인가(계약 번호·동사·안내문 해시)
export function sameStamp(a, b) {
  if (!a || !b) return false;
  return a.contract === b.contract && a.hash === b.hash && [...(a.verbs || [])].sort().join(',') === [...(b.verbs || [])].sort().join(',');
}
// 그 세션이 모르는 새 동사(지금 계약 순서). allowed: 그 세션이 쓸 수 있는 동사(null = 모두)
export function newVerbs(stamp, { verbs = VERB_NAMES, allowed = null } = {}) {
  const had = new Set((stamp && stamp.verbs) || []);
  return verbs.filter((v) => v !== 'help' && !had.has(v) && (!allowed || allowed.includes(v)));
}
export function verbBrief(v, all = null) {
  if (VERB_BRIEF[v]) return VERB_BRIEF[v];
  const d = all && all.find((x) => x.name === v);
  return d ? String(d.does).split(/[.(]/)[0].trim().slice(0, 60) : '';
}
// 알림 한 줄
export function noticeLine(list, all = null) {
  if (!list || !list.length) return null;
  return `${NOTICE_HEAD} ${list.map((v) => { const b = verbBrief(v, all); return b ? `atrium ${v}(${b})` : `atrium ${v}`; }).join(', ')}(자세히는 atrium help)`;
}

export class BriefNotices {
  // b: 백엔드(sessions, store, log, queue?). promptOf(s) → 그 세션 종류의 판 안내문 글. permOf(s) → { allowed } | null
  constructor(b, { promptOf = () => '', permOf = () => null, now = null } = {}) {
    this.b = b; this.promptOf = promptOf; this.permOf = permOf; this.now = now || (() => Date.now());
    this.rides = new Map(); // 전달 ID → { sessionId, prev(올리기 전 판 | null), cur }
    this.wireQueue(b.queue);
  }
  wireQueue(q) {
    if (!q || typeof q.on !== 'function' || this.wiredQueue === q) return;
    this.wiredQueue = q;
    q.on('delivery', (e) => { try { this.onDelivery(e); } catch (err) { this.b.log && this.b.log('verbs notice ride error', err && err.stack); } });
  }
  // 안내문을 받는 세션인가(판이 띄운 에이전트 세션)
  eligible(s) { return !!s && (s.kind || 'claude') !== 'shell' && (s.origin || 'board') === 'board' && !s.closedAt; }
  current(s) { let text = ''; try { text = this.promptOf(s) || ''; } catch {} return stampOf({ text, at: this.now() }); }
  // 그 세션이 받았다고 보는 판(기록, 없으면 마지막으로 띄운 때로 어림)
  known(s) {
    if (s.briefStamp) return s.briefStamp;
    const plan = s.harnessPlan || {};
    return assumedStamp(Math.max(Number(s.createdAt) || 0, Number(plan.launchedAt) || 0, Number(s.rt && s.rt.launchedAt) || 0));
  }
  save(s, stamp) {
    s.briefStamp = stamp;
    try { this.b.store.updateSession(s.sessionId, { briefStamp: stamp }); } catch (e) { this.b.log && this.b.log(`brief stamp save failed ${s.name}: ${e.message}`); }
  }
  // 안내문을 (다시) 넣어 띄울 때: 알리지 않고 지금 판으로 올린다. why: start | resume | wake 등
  stamp(s, why = 'launch') {
    if (!this.eligible(s)) return null;
    const cur = { ...this.current(s), why };
    const before = s.briefStamp || null;
    this.save(s, cur);
    if (!sameStamp(before, cur)) try { this.b.store.addEvent(s.sessionId, 'brief_stamp', { why, contract: cur.contract, hash: cur.hash, ...(before ? { from: { contract: before.contract, hash: before.hash } } : {}) }); } catch {}
    return cur;
  }
  // 전달 대기열이 그 세션에 글을 처음 보내기 직전(decisions.mjs attachFront가 부른다) → 앞에 붙일 한 줄 | null
  attach(sessionId, deliveryId = null) {
    const s = this.b.sessions && this.b.sessions.get(sessionId);
    if (!this.eligible(s)) return null;
    const old = this.known(s);
    const cur = { ...this.current(s), why: 'notice' };
    if (sameStamp(old, cur)) return null;
    let perm = null; try { perm = this.permOf(s); } catch {}
    const list = newVerbs(old, { verbs: cur.verbs, allowed: perm && perm.allowed ? perm.allowed : null });
    const news = newNews(old); // P334: 동사가 아닌 새 안내
    const prev = s.briefStamp || null;
    this.save(s, list.length || news.length ? cur : { ...cur, why: 'quiet' });
    if (!list.length && !news.length) { try { this.b.store.addEvent(s.sessionId, 'brief_stamp', { why: 'quiet', contract: cur.contract, hash: cur.hash }); } catch {} return null; }
    if (deliveryId) this.rides.set(deliveryId, { sessionId, prev, cur: s.briefStamp });
    try { this.b.store.addEvent(s.sessionId, 'verbs_notice', { deliveryId, verbs: list, ...(news.length ? { news } : {}), contract: cur.contract, from: old.contract ?? null, assumed: old.why === 'assumed' }); } catch {}
    this.b.log && this.b.log(`verbs notice ${s.name} ${deliveryId || ''}: ${[...list, ...news].join(', ')}`);
    return [noticeLine(list, VERBS), newsLine(news)].filter(Boolean).join('\n');
  }
  // 알림을 실은 전달이 실패·취소되면 판을 되돌린다(그새 다시 올리지 않았을 때만)
  onDelivery(e) {
    if (!e || !this.rides.has(e.deliveryId)) return;
    if (e.status === 'confirmed' || e.status === 'unconfirmed') { this.rides.delete(e.deliveryId); return; }
    if (e.status !== 'failed' && e.status !== 'cancelled') return;
    const r = this.rides.get(e.deliveryId); this.rides.delete(e.deliveryId);
    const s = this.b.sessions && this.b.sessions.get(r.sessionId);
    if (!s || s.briefStamp !== r.cur) return;
    s.briefStamp = r.prev;
    try { this.b.store.updateSession(s.sessionId, { briefStamp: r.prev }); this.b.store.addEvent(s.sessionId, 'verbs_notice_back', { deliveryId: e.deliveryId, status: e.status }); } catch {}
  }
}
