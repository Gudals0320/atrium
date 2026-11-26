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
// P375: 받는 쪽 거르기(P296 permOf와 같은 뜻). orch: false면 자체 오케스트레이션 세션(그 안내문에 이 약속이 없다)에는 알리지 않는다.
//   needs: 그 세션이 쓸 수 있어야 하는 동사(permOf allowed. null이면 모두). since: 그 안내가 dev에 합쳐진 때(판 기록이 없는 옛 세션의 어림)
//   한 줄은 짧게 쓴다(여럿이 한꺼번에 가면 " / "로 한 줄에 묶인다). 안내문을 바꾸면 BRIEF_LEDGER에도 한 줄(p375 시험이 지킨다)
export const BRIEF_NEWS = [
  { id: 'records', orch: false, since: Date.parse('2026-11-22T00:00:00+09:00') /* 판 기록이 없는 세션은 P317 전에 떴다: 그 전이면 모른다 */, line: '조사·감사·제안·측정·인계 결과는 커밋하지 않고 `atrium done ok "<보고>" --record <파일>`로 붙인다(문서는 지금 상태만, 날짜별 결정 로그 없음)' }, // P375: 짧게
  // P368(사용자 결정 2026-11-26): 시작할 때 한 번 찾고 막히면 다시. 자체 오케스트레이션 안내문에도 있다(KNOW_RULE_PLAIN)
  { id: 'know-start', needs: ['know'], since: Date.parse('2026-11-26T01:49:16+09:00') /* Merge p368 */, line: '시작할 때 건드릴 부분을 `atrium know`로 한 번 찾고 막히면 다시 찾는다(필요한 파일만 연다)' },
  // P368: 맡기기 전 1~3번 찾아 힌트로. 하위를 띄울 수 있는 세션만(자체 오케스트레이션 하네스에는 판이 하위를 주지 않는다)
  { id: 'know-hint', orch: false, needs: ['child'], since: Date.parse('2026-11-26T01:49:16+09:00') /* Merge p368 */, line: '하위에게 맡기기 전에 그 일이 건드릴 부분을 `atrium know`로 1~3번 찾아 지시의 힌트로 적는다' },
];
export const NEWS_IDS = BRIEF_NEWS.map((n) => n.id);
// 그 판이 모르는 새 안내(id 목록)
//   P375: 판 기록의 news 칸과 함께, 그 판의 안내문 해시가 장부(BRIEF_LEDGER)에 있으면 그 줄까지 등록된 안내도 안다고 본다
//   (안내가 등록되기 전에 그 안내가 든 안내문으로 뜬 세션: 그 뒤 안내문이 또 바뀌어도 다시 알리지 않는다)
export const newNews = (stamp, ids = NEWS_IDS) => { const had = new Set([...((stamp && stamp.news) || []), ...ledgerNews(stamp && stamp.hash)]); return ids.filter((id) => !had.has(id)); };
// P375: 그 세션이 쓸 수 있는 안내만(s: 세션, perm: permOf 결과 | null)
export function newsFits(id, s, perm = null) {
  const n = BRIEF_NEWS.find((x) => x.id === id);
  if (!n) return false;
  if (n.orch === false && s && s.orch && (s.orch.on ?? true)) return false;
  const allowed = perm && perm.allowed;
  return !(n.needs && allowed && !n.needs.every((v) => allowed.includes(v)));
}
export function newsLine(ids) {
  const list = BRIEF_NEWS.filter((n) => (ids || []).includes(n.id));
  return list.length ? `${NEWS_HEAD} ${list.map((n) => n.line).join(' / ')}(자세히는 atrium help)` : null;
}

// P375: 판 안내문 해시 장부. 판·하네스·자체 오케스트레이션 안내문(briefVariants)의 글이 바뀌면 p375 시험이 끝에 새 줄을 요구한다:
//   { by, hashes: 지금 해시들, news: [BRIEF_NEWS에 더한 id] | verbs: [새 동사] | quiet: '알릴 것 없음 까닭 한 줄' }.
//   그 해시로 띄운 세션은 그 줄까지 등록된 안내를 안다고 본다(ledgerNews). 해시는 그 단위를 합친 dev의 글로 셌다
export const BRIEF_LEDGER = [
  { by: 'P334', hashes: { board: '94d7de42891f', harness: 'e5eed74ad557', 'orch-sub': 'ae502ba767a0', 'orch-sub-plain': '127950d5cff3', 'orch-free': 'c1f387cae658', 'orch-free-plain': '5bac1b96e522' }, news: ['records'] }, // Merge p334 2026-11-23 16:57
  { by: 'P360', hashes: { board: 'db7919dc871a', harness: '6c29dfb1c977', 'orch-sub': 'ae502ba767a0', 'orch-sub-plain': '127950d5cff3', 'orch-free': 'c1f387cae658', 'orch-free-plain': '5bac1b96e522' }, verbs: ['revive', 'fork'] }, // REVIVE_RULE_SHORT(동사 알림이 뜻을 함께 싣는다)
  { by: 'P364', hashes: { board: 'e1683b74c263', harness: '6d5dbb6491fc', 'orch-sub': 'ca7bf130ab11', 'orch-sub-plain': '44c77e5be734', 'orch-free': 'b251b8f6ea19', 'orch-free-plain': '9357f1b0d2a4' }, verbs: ['know'] }, // KNOW_RULE(막히면 먼저 찾기. P368이 바꿨다)
  { by: 'P368', hashes: { board: '063492902ffc', harness: '6360c236dfc6', 'orch-sub': '146181d817c1', 'orch-sub-plain': '28d35f3580d9', 'orch-free': '30dc13fa5f8f', 'orch-free-plain': '3dd2642fa9f3' }, news: ['know-start', 'know-hint'] }, // KNOW_RULE 바꿈, KNOW_HINT_RULE
];
// P375: 장부 지킴(p375 시험). 지금 안내문 해시가 끝 줄과 다르거나 줄이 어긋나면 고칠 것을 말하는 글 목록([]면 됨)
export function ledgerProblems(current = briefHashes(), ledger = BRIEF_LEDGER, { news = BRIEF_NEWS, verbs = VERB_NAMES } = {}) {
  const out = [];
  const last = ledger[ledger.length - 1] || { hashes: {} };
  const changed = Object.keys(current).filter((k) => !last.hashes || last.hashes[k] !== current[k]);
  if (changed.length) out.push(`판 안내문이 바뀌었다(${changed.map((k) => `${k} ${(last.hashes && last.hashes[k]) || '없음'}→${current[k]}`).join(', ')}). `
    + 'backend/src/verbs-notice.mjs: 오래 도는 세션이 알아야 할 새 약속이면 BRIEF_NEWS에 { id, since: dev에 합친 때, line: 짧은 한 줄, 거르기 orch·needs }를 더하고, '
    + `BRIEF_LEDGER 끝에 { by: '<단위>', hashes: ${JSON.stringify(current)}, news: ['<그 id>'] }를 더한다. 새 동사 때문이면 news 대신 verbs: ['<동사>'], `
    + "알릴 것이 없으면(글 다듬기 등) quiet: '<알릴 것 없음 까닭 한 줄>'");
  const seen = new Set();
  ledger.forEach((e, i) => {
    const at = `BRIEF_LEDGER[${i}](${e.by || '?'})`;
    if (!e.by) out.push(`${at}: by(단위 번호)가 없다`);
    if (!e.hashes || Object.keys(current).some((k) => !e.hashes[k])) out.push(`${at}: hashes에 안내문 꼴 ${Object.keys(current).join('·')}의 해시가 모두 있어야 한다`);
    const n = (e.news || []).length, v = (e.verbs || []).length, q = String(e.quiet || '').trim().length;
    if (!n && !v && !q) out.push(`${at}: news(BRIEF_NEWS id)·verbs(새 동사)·quiet(알릴 것 없음 까닭 한 줄) 가운데 하나가 있어야 한다`);
    for (const id of e.news || []) {
      if (!news.some((x) => x.id === id)) out.push(`${at}: news '${id}'가 BRIEF_NEWS에 없다`);
      if (seen.has(id)) out.push(`${at}: news '${id}'는 앞 줄에 이미 있다(새 안내는 새 id로)`);
      seen.add(id);
    }
    for (const vb of e.verbs || []) if (!verbs.includes(vb)) out.push(`${at}: verbs '${vb}'가 계약(VERB_NAMES)에 없다`);
  });
  for (const x of news) if (!seen.has(x.id)) out.push(`BRIEF_NEWS '${x.id}'가 장부(BRIEF_LEDGER)의 어느 줄에도 없다(안내문을 바꾼 줄의 news에 적는다)`);
  return out;
}
// 그 해시가 든 마지막 장부 줄까지 등록된 안내(id 목록). 모르는 해시면 []
export function ledgerNews(hash, ledger = BRIEF_LEDGER) {
  if (!hash) return [];
  let at = -1;
  ledger.forEach((e, i) => { if (e.hashes && Object.values(e.hashes).includes(hash)) at = i; });
  return at < 0 ? [] : ledger.slice(0, at + 1).flatMap((e) => e.news || []);
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
  revive: '닫힌·보관된·끝난 세션을 같은 대화로 되살리기(사람이 시킬 때만)', fork: '세션의 대화를 이어받는 새 세션(SDK면 API 크레딧, 사람이 시킬 때만)', // P360
  know: '이 리포의 예전 기록·문서·주석·판 일에서 찾기', // P364. P375: 언제 찾는지는 새 안내(know-start)가 함께 간다
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
  revive: Date.parse('2026-11-25T12:00:00+09:00'), fork: Date.parse('2026-11-25T12:00:00+09:00'), // P360
  know: Date.parse('2026-11-26T00:00:00+09:00'), // P364(일을 시작한 때. 띄울 때 판 기록이 있는 세션은 이 값을 쓰지 않는다)
};

// 그 세션 종류가 띄울 때 받는 판 안내문(backend.mjs pluginFor·harnessLaunchOf·orchPrompt와 같은 글). scope: 오케스트레이션 세션의 권한 범위(sub | free)
export function boardPromptOf(s, scope = null) {
  const claude = ((s && s.kind) || 'claude') === 'claude';
  if (s && s.orch) { const l = orchPromptLines(scope || 'free'); return claude ? l.join('\n') : l.join(' '); }
  return claude ? BOARD_SYSTEM_PROMPT : HARNESS_PROMPT;
}
// P375: 판이 세션에 넣는 안내문의 모든 꼴(장부 해시의 이름). claude 오케스트레이션은 줄바꿈, 그 밖은 띄어쓰기로 잇는다
export function briefVariants() {
  return {
    board: boardPromptOf({ kind: 'claude' }), harness: boardPromptOf({ kind: 'codex' }),
    'orch-sub': boardPromptOf({ kind: 'claude', orch: { on: true } }, 'sub'), 'orch-sub-plain': boardPromptOf({ kind: 'hermes', orch: { on: true } }, 'sub'),
    'orch-free': boardPromptOf({ kind: 'claude', orch: { on: true } }, 'free'), 'orch-free-plain': boardPromptOf({ kind: 'hermes', orch: { on: true } }, 'free'),
  };
}
export const briefHashes = () => Object.fromEntries(Object.entries(briefVariants()).map(([k, t]) => [k, promptHash(t)]));
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
    const news = newNews(old).filter((id) => newsFits(id, s, perm)); // P334: 동사가 아닌 새 안내. P375: 쓸 수 있는 것만
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
