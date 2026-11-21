// P284: 결정 카드. 여러 세션이 글을 주고받는 사이 사람이 내려야 할 결정이 대화 위로 밀려 사라지지 않게, 에이전트가 사람에게 글로 묻는 질문을 판에 따로 남긴다.
// 대상은 에이전트가 글로 묻고 사람이 확인하고 답하는 질문이다("이대로 마무리할까요?"). 권한·신뢰·모델·하네스 질문(응답 필요, 내 차례)은 아니다.
// - 에이전트: atrium ask "<질문 한 줄>" [--option "<보기>"]… [--why "<맥락 한 줄>"] → 카드 번호. 대화에도 글로 묻는다(카드는 대화를 갈음하지 않는다).
//   atrium ask --done <번호>(사람이 다른 길로 답해 끝남), atrium ask --list(자기의 열린 카드).
//   일 상위가 없는 세션(지휘 세션, 동료 등 사람과 직접 일하는 세션)만 쓴다. 하위 워커는 부모에게 atrium prompt로 묻는다(거절).
// - 사람: 판 API decision.list | decision.answer | decision.ignore. 답하면 그 세션에 보통 메시지(대기열)로 "[결정] <질문 줄임> → <답>"이 들어가고 answered.
//   무시는 세션에 아무것도 보내지 않고(세션의 턴을 쓰지 않는다) ignored.
// - 사람이 카드를 거치지 않고 그 세션에 직접 글을 보내면(명령 바·휴대폰 입력 = session.send, 터미널에 직접 친 글 = 전달과 맞지 않는 UserPromptSubmit,
//   hook 없는 종류는 쉬는 중 터미널 Enter) 그 세션의 열린 자동 카드는 answered(via session)로 닫는다. 세션에 따로 알리지 않는다. 판 알림·다른 세션의 글은 닫지 않는다.
//   P303: 손 카드(atrium ask·todo)는 닫지 않는다(에이전트가 대화로 답을 받으면 --done으로 닫는다). 만들어진 지 10초 안의 자동 카드도 남긴다(onHuman).
// - 세션이 닫히거나 보관되면 열린 카드는 closed. 바뀔 때마다 창에 decision.changed { cards }(열린 카드 모두)를 보낸다.
// - 웹 푸시: 응답 필요 알림 설정(need)을 따라 카드마다 한 번(web-push.mjs decision).
// P286: 판 자동 카드. 일 상위가 없는 세션(merger 제외)이 턴을 끝내고 쉴 때(working → ready. 오류·응답 필요로 끝난 턴은 아니다), 그 턴에 손 카드(atrium ask)를
//   만들지 않았고 열린 손 카드도 없으며 마지막 답(rt.lastAnswer, 종류 무관)이 사람에게 묻는 글로 끝나면(auto-ask.mjs findQuestion) 그 질문으로 auto 카드를 만든다.
//   한 세션에 열린 자동 카드는 하나: 다음 턴이 또 질문으로 끝나면 옛 자동 카드는 closed(via replaced)로 닫고 새로 만든다(같은 질문·보기면 그대로 둔다).
//   판 알림이 연 턴도 같다(마지막 답 기준). 설정 autoDecisions(기본 켬). 웹 푸시는 손 카드와 같다. 이벤트 decision_auto { id, replaced, … }와
//   decision_end의 auto(끝난 자동 카드)로 답함·무시 비율을 센다. hook이 없는 종류는 판이 화면에서 답을 고를 때까지(answerGraceMs) 기다린다.
// P286(사용자 2026-11-21): 답 모아 보내기. 한 세션에 열린 카드가 여럿이면 답할 때마다 보내지 않고(글 하나가 에이전트의 턴 하나) 모아 두었다가(held),
//   그 세션의 열린 카드가 모두 끝나면(답·무시·--done·바뀜) 모은 답을 한 글("[결정] q1 → a1" 줄들)로 보통 메시지(대기열)에 넣는다. 무시는 아무것도 더하지 않는다.
//   목록은 세션마다 모은 답 수와 "지금 보내기"(decision.flush)를 보인다. 자동 카드도 같다.
//   사람이 그 세션에 직접 글을 보내면 열린 카드는 지금처럼 닫히고, 모은 답은 명령 바·휴대폰 글(session.send)이면 그 글 앞에 붙여 한 전달로 보낸다
//   (결정은 앞서 물은 것이라 대화 차례대로 먼저 두고, 사람의 새 글이 끝에 와 에이전트가 가장 나중 지시로 읽는다. 턴도 하나만 쓴다).
//   스티어링 글이면 답은 스티어링이 아니라 따로 보통 메시지로 보낸다. 터미널에 직접 친 글(이미 제출됨)이면 그 뒤에 한 글로 보낸다.
// P292(사용자 2026-11-21): 사용자 몫. 결정 카드가 종류(kind) 넷을 가진 상태 있는 "사용자 몫"이 되었다(같은 표, 옛 카드는 decide).
//   (P305: 사람에게 보이는 목록 이름은 "할 일", do 종류 이름은 "실행". 저장 값은 그대로)
//   decide 결정(그대로), do 실행(글 + 사람이 복사할 명령 0개 이상. 사람: 했음·무시·미루기. 했음은 기록만, 에이전트가 --tell을 주면 답 모으기로 보낸다),
//   check 확인(사람: 됐다/안 됐다 + 한 줄 메모·무시·미루기. 결과는 늘 답 모으기로 보낸다), later 나중에(날짜·시각이면 wake_at까지 숨겼다가 띄우고 웹 푸시 한 번,
//   조건 글이면 cond로 "나중"에 두고 사람이 꺼낸다. 띄운 뒤에는 할 일과 같다).
//   모든 카드에 미루기(decision.snooze { id, until }): wake_at까지 숨겼다가 다시 띄운다. 숨긴 카드(나중)는 답 모으기의 "열린 카드"에 세지 않는다.
//   에이전트: atrium todo "<할 일>" [--cmd …]… [--check] [--later …] [--why …] [--tell] | --done <번호> | --list. 누가·상한은 atrium ask와 같다(나중에는 따로).
//   답 모으기 줄: [결정] q → a, [확인] q → 됐다/안 됐다: 메모, [실행] q → 했음.
//   사람이 세션에 직접 보낸 글이 닫는 것은 지금 보이는 자동 카드뿐이다(P303: 손 카드는 종류 무관 그대로 둔다).
//   자동 카드는 마지막 답이 명령 실행을 청하면 할 일(명령 뽑기), 확인을 청하면 확인, 그 밖의 질문은 결정(auto-ask.mjs findAsk).
// P295(사용자 2026-11-21): 답 실어 보내기. 사용자 몫 답은 세션이 그 답을 기다리며 멈춰 있을 때만 곧바로 보내고, 아니면 그 세션에 다음 글이 갈 때 실어 보내 턴을 아낀다.
//   카드마다 보내는 때(timing): now(곧바로) | next(다음 글에 실어). 정하는 차례: 사람이 답할 때 바꾼 값(answer·check·done의 timing) → 에이전트가 준 값
//   (atrium ask|todo --wait = now, --no-wait = next) → 판의 기본(timingOf: 확인·할 일 --tell은 next, 결정(손·자동)은 그 카드가 그 세션의 마지막 턴에서
//   만들어졌으면(그 뒤 새 턴이 없다 = turn.startedAt ≤ 카드 만든 때) now, 그 사이 새 턴이 있었으면 next). 답할 때 정해진 값을 카드의 timing에 남긴다.
//   보내기(settle): 보낼 것이 남은 열린 카드가 없을 때 모은 답 가운데 now가 하나라도 있으면 곧바로 한 글로(now·next 함께), 모두 next면 붙잡아 둔다(riding).
//   실어 보내기(attachFront): 전달 대기열이 그 세션에 어떤 글이든(사람·다른 세션·판 알림·스티어링) 처음 보낼 때 붙잡은 답 모두를 그 글 앞에 한 덩어리로 붙인다.
//   사람이 터미널에 직접 친 글로 턴이 열리면(onHuman terminal) 지금 턴에 넣을 수 있는 세션(steerBlock 없음)이면 스티어링(rideOnly)으로 그 턴에 넣고,
//   못 넣은 채 턴이 끝나면 취소하고 다시 붙잡는다(턴을 새로 만들지 않는다). 실어 보낸 전달이 실패·취소되면 답을 다시 붙잡는다(decision_ride_back).
//   기록(아낀 턴 세기): decision_flush { ids, deliveryId, why, now, next, origin? }. why: all(곧바로, now가 있었다) | now(사람의 지금 보내기) |
//   human_front(명령 바 글 앞, 넣을 때) | ride(다음 전달 앞, 보낼 때) | ride_steer(터미널 글로 연 턴에 스티어링) | closed(세션 닫힘, 버림) | human(옛 판).
//   ride·human_front·ride_steer 하나가 아낀 턴 하나다. decision_end에 timing(정해진 값)과 timingBy(human | agent | board)를 남긴다.
// 표는 store-decisions.mjs.
import { shownName } from './session-label.mjs';
import { findAsk } from './auto-ask.mjs';
import { firstLine } from './peer-news.mjs';
import { clip, startsAsBoardNotice } from './text.mjs';
import { checkAgentText } from './work-units.mjs';
import { steerBlock } from './delivery.mjs';
import { ASK_QUESTION_MAX, ASK_OPTION_MAX, ASK_OPTIONS_MAX, ASK_WHY_MAX, ASK_OPEN_MAX, ASK_ANSWER_MAX, TODO_CMDS_MAX, TODO_CMD_MAX, TODO_LATER_MAX, TODO_LATER_TEXT_MAX, TODO_NOTE_MAX } from './cli-contract.mjs';

export const ANSWER_HEAD = '[결정]';
export const KINDS = ['decide', 'do', 'check', 'later']; // P292
export const HEADS = { decide: '[결정]', do: '[실행]', check: '[확인]', later: '[실행]' }; // P292: 답 모으기 줄 머리. P305: 할 일 → 실행(목록 이름 "할 일"과 겹쳐서)
const OLD_HEADS = ['[할 일]']; // P305 전의 머리(그 뒤에도 사람 글이 아니다)
export const DID = '했음';
export const CHECK_OK = '됐다';
export const CHECK_FAIL = '안 됐다';
export const TIMINGS = ['now', 'next']; // P295: 보내는 때
// P303: 자동 카드가 만들어진 뒤 이만큼 안에 온 사람의 직접 글은 그 카드를 보기 전에 보낸 것으로 보고 닫지 않는다
export const AUTO_FRESH_MS = 10_000;
// P295: 에이전트 인자(wait·noWait 또는 timing) → now | next | null
export function timingArg(o = {}) {
  if (o.timing != null && o.timing !== false) { const t = String(o.timing); if (!TIMINGS.includes(t)) throw apiError('bad_request', `보내는 때는 now 또는 next다: ${t}`); return t; }
  if (o.noWait && o.wait) throw apiError('bad_request', '--wait와 --no-wait는 함께 쓰지 않는다.');
  return o.noWait ? 'next' : o.wait ? 'now' : null;
}
const SNOOZE_MAX_MS = 400 * 24 * 3600 * 1000; // 미루기·나중 날짜는 400일까지
const WAKE_TICK_MAX_MS = 3600 * 1000; // 깨우기 타이머는 길어도 한 시간마다 다시 잰다
// P292: --later 글 → { wakeAt } (날짜 "YYYY-MM-DD"는 그날 9시, "YYYY-MM-DD HH:MM"은 그때, 이 PC 시간대) | { cond } (그 밖의 글은 조건)
export function parseLater(text, now = Date.now()) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!m) return { cond: s };
  const [y, mo, d, h = '9', mi = '0'] = m.slice(1);
  const t = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0);
  if (t.getFullYear() !== Number(y) || t.getMonth() !== Number(mo) - 1 || t.getDate() !== Number(d) || Number(h) > 23 || Number(mi) > 59) return { bad: s };
  if (t.getTime() - now > SNOOZE_MAX_MS) return { far: s };
  return { wakeAt: t.getTime() };
}
const QUESTION_SHORT = 80; // 세션에 들어가는 답 글의 질문 줄임
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// 세션에 들어가는 답 글: "[결정] <질문 줄임> → <답>"
export function answerText(question, answer, kind = 'decide') { return `${HEADS[kind] || ANSWER_HEAD} ${clip(oneLine(question), QUESTION_SHORT)} → ${String(answer ?? '').trim()}`; } // P292: 종류마다 머리

export class Decisions {
  // b: 백엔드(sessions, store, queue, api, web, log, touch?). branch: Branch(relIndex)
  constructor(b, branch, { answerGraceMs = 5000, now = null } = {}) {
    this.b = b; this.branch = branch; this.answerGraceMs = answerGraceMs;
    this.now = now || (() => Date.now()); // P292: 시험이 가짜 시계로 바꾼다
    this.wakeTimer = null; // P292: 숨긴 카드를 띄울 타이머
    try { this.scheduleWake(); } catch {}
    this.prev = new Map(); // P286: 세션 ID → 마지막으로 본 상태(턴 끝 판정)
    this.pending = new Map(); // P286: 세션 ID → 화면 답을 기다리는 턴 끝 { timer, off }
    this.autoSetting = null; // 시험이 바꾼다(없으면 판 설정 autoDecisions)
    this.rides = new Map(); // P295: 전달 ID → 그 전달에 실은 카드 ID들(실패·취소되면 다시 붙잡는다)
    this.wireQueue(b.queue);
  }
  // P295: 전달 대기열에 실어 보내기 손을 단다(처음 보낼 때 앞에 붙임, 실패·취소되면 되돌림)
  wireQueue(q) {
    if (!q || typeof q.on !== 'function' || this.wiredQueue === q) return;
    this.wiredQueue = q;
    q.attachFront = (d) => this.attachFront(d);
    q.on('delivery', (e) => { try { this.onDelivery(e); } catch (err) { this.b.log('decision ride error', err && err.stack); } });
  }
  store() { return this.b.store; }
  // 일 상위(하위 관계의 부모)가 있으면 그 세션 ID
  workParent(s) { try { return this.branch && this.branch.relIndex ? this.branch.relIndex().workParentOf(s.sessionId) || null : null; } catch { return null; } }
  nameOf(id, fallback = null) { const s = this.b.sessions.get(id); return s ? shownName(s) || s.name : fallback || '?'; }
  // P292: 숨긴 카드(나중: 조건, 또는 아직 때가 안 된 날짜·미루기)
  isDeferred(d, now = this.now()) { return !!(d.cond || (d.wakeAt != null && d.wakeAt > now)); }
  activeOpen(sessionId) { const now = this.now(); return this.store().openDecisions(sessionId).filter((d) => !this.isDeferred(d, now)); }
  // P292: 끝나면 세션에 보낼 것이 있는 카드(결정·확인·--tell 할 일). 기록만 하는 할 일은 며칠씩 남을 수 있어 모은 답을 막지 않는다
  sends(d) { return d.kind === 'decide' || d.kind === 'check' || !!d.tell; }
  heldCounts() { const m = {}; for (const d of this.store().heldAnswers()) if (this.b.sessions.has(d.sessionId)) m[d.sessionId] = (m[d.sessionId] || 0) + 1; return m; }
  // P295: 다음 글에 실려 갈 답 수(모은 답 가운데 보낼 것이 남은 열린 카드가 없는 세션 = 모두 next라 붙잡아 둔 세션)
  ridingCounts() { const m = {}; for (const [sid, n] of Object.entries(this.heldCounts())) if (!this.activeOpen(sid).some((d) => this.sends(d))) m[sid] = n; return m; }
  // P295: 판의 기본 보내는 때. 확인·할 일은 next. 결정은 그 카드가 그 세션의 마지막 턴에서 만들어졌으면(그 뒤 새 턴이 없다) now, 그 사이 새 턴이 있었으면 next
  defaultTiming(d, s = this.b.sessions.get(d.sessionId)) {
    if (d.kind !== 'decide') return 'next';
    const start = s && s.rt && s.rt.turn ? s.rt.turn.startedAt || 0 : 0;
    if (!start) return 'now';
    return start <= d.createdAt ? 'now' : 'next';
  }
  // P295: 지금 정해진 보내는 때(에이전트가 준 값, 없으면 판의 기본) → { timing, by }
  timingOf(d, s) { return d.timing ? { timing: d.timing, by: 'agent' } : { timing: this.defaultTiming(d, s), by: 'board' }; }
  // P295: 답할 때 정하는 값(사람이 바꾼 값이 먼저)
  pickTiming(d, p, s) {
    if (p && p.timing != null) { if (!TIMINGS.includes(p.timing)) throw apiError('bad_request', '보내는 때는 now 또는 next입니다.'); return { timing: p.timing, by: 'human' }; }
    return this.timingOf(d, s);
  }
  view(d) { const s = this.b.sessions.get(d.sessionId); return { ...d, name: s ? shownName(s) || s.name : d.name, workspaceKey: s ? s.workspaceKey || null : null, deferred: this.isDeferred(d), timing: d.state === 'open' ? this.timingOf(d, s).timing : d.timing, timingBy: d.state === 'open' ? this.timingOf(d, s).by : null }; } // P292: deferred(나중 줄). P295: 보내는 때(지금 정해진 값)
  openAll() { return this.store().openDecisions().filter((d) => this.b.sessions.has(d.sessionId)).map((d) => this.view(d)); }
  changed() { try { this.b.api.broadcast('decision.changed', { cards: this.openAll(), held: this.heldCounts(), riding: this.ridingCounts() }); } catch (e) { this.b.log('decision broadcast error', e && e.stack); } }

  // ---------- atrium ask ----------
  // o: { question, options: [], why, done: <번호>, list: true }
  askVerb(caller, o = {}) {
    if (o.list) return { cards: this.store().openDecisions(caller.sessionId).filter((d) => d.kind === 'decide').map((d) => ({ ...d, deferred: this.isDeferred(d) })), max: ASK_OPEN_MAX };
    if (o.done != null && o.done !== false) return this.doneVerb(caller, o.done);
    this.leadOnly(caller, 'ask');
    const question = oneLine(o.question);
    if (!question) throw apiError('bad_request', '질문 한 줄을 준다: atrium ask "<질문>" [--option "<보기>"]… [--why "<맥락>"]');
    if (question.length > ASK_QUESTION_MAX) throw apiError('too_long', `질문이 너무 길다(${question.length}자, ${ASK_QUESTION_MAX}자까지). 한 줄로 줄이고 맥락은 --why에 쓴다.`);
    checkAgentText(question, '질문');
    const options = (Array.isArray(o.options) ? o.options : o.options == null ? [] : [o.options]).map(oneLine).filter(Boolean);
    if (options.length > ASK_OPTIONS_MAX) throw apiError('too_long', `보기가 너무 많다(${options.length}개, ${ASK_OPTIONS_MAX}개까지).`);
    const longOpt = options.find((x) => x.length > ASK_OPTION_MAX);
    if (longOpt) throw apiError('too_long', `보기가 너무 길다(${longOpt.length}자, ${ASK_OPTION_MAX}자까지): ${clip(longOpt, 40)}`);
    if (new Set(options).size !== options.length) throw apiError('bad_request', '같은 보기가 두 번 있다.');
    const why = this.whyOf(o.why);
    const timing = timingArg(o); // P295: --wait(now) | --no-wait(next)
    return this.create(caller, { kind: 'decide', question, options, why, timing }, 'ask');
  }
  // P292: 하위 워커는 거절(사람에게 넘길 것은 부모에게)
  leadOnly(caller, verb) {
    const pid = this.workParent(caller);
    if (!pid) return;
    const pname = this.nameOf(pid);
    if (verb === 'todo') throw apiError('sub_worker', `하위 워커는 사용자 몫 카드를 남기지 않는다. 사람이 할 일은 부모에게 넘긴다: atrium prompt ${pname} "<사람이 할 일>"`, { parent: pname });
    throw apiError('sub_worker', `하위 워커는 결정 카드를 남기지 않는다. 사람에게 물을 것은 부모에게 묻는다: atrium prompt ${pname} "<질문>"`, { parent: pname });
  }
  whyOf(w) {
    const why = w == null ? null : oneLine(w) || null;
    if (why && why.length > ASK_WHY_MAX) throw apiError('too_long', `맥락이 너무 길다(${why.length}자, ${ASK_WHY_MAX}자까지). 긴 글은 파일에 쓰고 그 경로를 적는다.`);
    return why;
  }
  // P292: 카드 한 장 만들기(상한: 나중에 아닌 열린 카드 ASK_OPEN_MAX, 나중에 TODO_LATER_MAX)
  create(caller, c, verb) {
    const open = this.store().openDecisions(caller.sessionId);
    const later = c.kind === 'later';
    const mine = open.filter((d) => (d.kind === 'later') === later);
    const max = later ? TODO_LATER_MAX : ASK_OPEN_MAX;
    if (mine.length >= max) {
      const how = verb === 'ask' ? 'atrium ask --done <번호>로 닫는다(목록: atrium ask --list)' : 'atrium todo --done <번호>로 닫는다(목록: atrium todo --list)';
      throw apiError('too_many', `열린 ${later ? '나중에 카드' : verb === 'ask' ? '결정 카드' : '카드(결정·실행·확인 합쳐)'}가 이미 ${mine.length}장이다(${max}장까지). 사람이 끝냈거나 쓸모없어진 카드를 ${how}.`, { open: mine.map((d) => d.id) });
    }
    const d = this.store().addDecision({ sessionId: caller.sessionId, name: shownName(caller) || caller.name, question: c.question, options: c.options || [], why: c.why || null, createdAt: this.now(), kind: c.kind, cmds: c.cmds || [], tell: !!c.tell, later: c.later || null, wakeAt: c.wakeAt ?? null, cond: c.cond ?? null, timing: c.timing || null }); // P295: timing
    if (verb === 'ask') this.b.store.addEvent(caller.sessionId, 'decision_ask', { id: d.id, chars: c.question.length, options: (c.options || []).length, timing: d.timing }); // P295
    else this.b.store.addEvent(caller.sessionId, 'decision_todo', { id: d.id, kind: d.kind, chars: c.question.length, cmds: d.cmds.length, tell: d.tell, later: d.wakeAt ? 'date' : d.cond ? 'cond' : null, timing: d.timing }); // P295
    this.b.log(`atrium ${verb} ${caller.name} #${d.id}${d.kind !== 'decide' ? ` (${d.kind})` : ''}`);
    this.changed();
    if (!this.isDeferred(d)) this.push(caller, d);
    else this.scheduleWake();
    return { id: d.id, kind: d.kind, open: mine.length + 1, max, card: d };
  }

  // ---------- P292: atrium todo ----------
  // o: { text, cmds: [], check, later, why, tell, done: <번호>, list }
  todoVerb(caller, o = {}) {
    if (o.list) {
      const now = this.now();
      const cards = this.store().openDecisions(caller.sessionId).map((d) => ({ ...d, deferred: this.isDeferred(d, now) }));
      return { cards, open: cards.filter((d) => !d.deferred).length, later: cards.filter((d) => d.deferred).length, max: ASK_OPEN_MAX, laterMax: TODO_LATER_MAX };
    }
    if (o.done != null && o.done !== false) return this.doneVerb(caller, o.done, 'todo');
    this.leadOnly(caller, 'todo');
    const question = oneLine(o.text ?? o.question);
    if (!question) throw apiError('bad_request', '할 일 한 줄을 준다: atrium todo "<할 일>" [--cmd "<명령>"]… [--check] [--later "<날짜 또는 조건>"] [--why "<맥락>"] [--tell]');
    if (question.length > ASK_QUESTION_MAX) throw apiError('too_long', `할 일이 너무 길다(${question.length}자, ${ASK_QUESTION_MAX}자까지). 한 줄로 줄이고 맥락은 --why에 쓴다.`);
    checkAgentText(question, '할 일');
    const cmds = (Array.isArray(o.cmds) ? o.cmds : o.cmds == null ? [] : [o.cmds]).map((x) => String(x ?? '').trim()).filter(Boolean);
    if (cmds.length > TODO_CMDS_MAX) throw apiError('too_long', `명령이 너무 많다(${cmds.length}개, ${TODO_CMDS_MAX}개까지).`);
    const longCmd = cmds.find((x) => x.length > TODO_CMD_MAX);
    if (longCmd) throw apiError('too_long', `명령이 너무 길다(${longCmd.length}자, ${TODO_CMD_MAX}자까지). 긴 스크립트는 파일에 쓰고 그 파일을 부르는 명령을 준다.`);
    const why = this.whyOf(o.why);
    if (o.check && o.later != null && o.later !== false) throw apiError('bad_request', '--check와 --later는 함께 쓰지 않는다(나중에 할 확인은 --later로 남기고, 때가 되면 사람이 했음으로 닫는다).');
    let kind = o.check ? 'check' : 'do'; let wakeAt = null; let cond = null; let later = null;
    if (o.later != null && o.later !== false) {
      if (o.later === true) throw apiError('bad_request', '언제·어떤 조건에 할지 준다: --later "YYYY-MM-DD[ HH:MM]" 또는 --later "<조건 글>"');
      const p = parseLater(o.later, this.now());
      if (!p) throw apiError('bad_request', '언제·어떤 조건에 할지 준다: --later "YYYY-MM-DD[ HH:MM]" 또는 --later "<조건 글>"');
      if (p.bad) throw apiError('bad_request', `날짜가 틀렸다: ${p.bad} (YYYY-MM-DD 또는 YYYY-MM-DD HH:MM)`);
      if (p.far) throw apiError('bad_request', `날짜가 너무 멀다: ${p.far} (400일 안)`);
      later = oneLine(o.later);
      if (later.length > TODO_LATER_TEXT_MAX) throw apiError('too_long', `조건 글이 너무 길다(${later.length}자, ${TODO_LATER_TEXT_MAX}자까지).`);
      if (p.cond) checkAgentText(p.cond, '조건');
      kind = 'later'; wakeAt = p.wakeAt ?? null; cond = p.cond ?? null;
    }
    const timing = timingArg(o); // P295: --wait(now) | --no-wait(next)
    return this.create(caller, { kind, question, cmds, why, tell: !!o.tell && kind !== 'check', later, wakeAt, cond, timing }, 'todo');
  }
  push(s, d, { wake = false } = {}) { try { if (this.b.web && this.b.web.push && this.b.web.push.decision) this.b.web.push.decision({ id: d.id, sessionId: s.sessionId, name: shownName(s) || s.name, workspaceKey: s.workspaceKey || null, ...(wake ? { wake: this.now() } : {}) }); } catch (e) { this.b.log('decision push error', e && e.stack); } } // P292: 숨겼다 띄운 카드는 한 번 더(wake)
  doneVerb(caller, ref, verb = 'ask') {
    const id = Number(String(ref).replace(/^#/, ''));
    if (!Number.isInteger(id) || id <= 0) throw apiError('bad_request', `닫을 카드 번호를 준다: atrium ${verb} --done <번호>(목록: atrium ${verb} --list)`);
    const d = this.store().getDecision(id);
    if (!d || d.sessionId !== caller.sessionId) throw apiError('not_found', `너의 카드 #${id}가 없다. 목록: atrium ${verb} --list`);
    if (d.state !== 'open') return { id, closed: false, state: d.state, card: d };
    const r = this.store().endDecision(id, { state: 'closed', via: 'agent' });
    this.b.store.addEvent(caller.sessionId, 'decision_end', { id, state: 'closed', via: 'agent', auto: d.auto, kind: d.kind });
    this.settle(caller.sessionId);
    this.changed();
    this.scheduleWake();
    return { id, closed: true, state: 'closed', card: r };
  }

  // ---------- 사람(판 API) ----------
  card(id) {
    const d = this.store().getDecision(id);
    if (!d) throw apiError('not_found', `결정 카드를 찾을 수 없습니다: ${id}`);
    if (d.state !== 'open') throw Object.assign(apiError('already_closed', '이미 끝난 결정 카드입니다.'), { state: d.state });
    return d;
  }
  viaOf(c) { return c && (c.remote || (c.auth && c.auth.device)) ? 'remote' : 'pc'; }
  // 답하기: 보기(option) 또는 한 줄 답(text). 세션에 보통 메시지(대기열)로 넣고 answered
  answer(p = {}, c = null) {
    const d = this.card(p.id);
    if (d.kind !== 'decide') throw apiError('wrong_kind', '결정 카드가 아닙니다(실행은 했음, 확인은 됐다·안 됐다).', { kind: d.kind });
    const s = this.b.sessions.get(d.sessionId);
    if (!s) throw apiError('closed', '그 세션은 닫혔습니다.');
    const text = String(p.answer ?? '').trim();
    if (!text) throw apiError('bad_request', '답을 입력하세요.');
    if (text.length > ASK_ANSWER_MAX) throw apiError('too_long', `답이 너무 깁니다(${text.length}자, ${ASK_ANSWER_MAX}자까지).`);
    const via = this.viaOf(c);
    const tm = this.pickTiming(d, p, s); // P295: 보내는 때
    const r = this.store().endDecision(d.id, { state: 'answered', answer: text, via, at: this.now() });
    if (!r) throw apiError('already_closed', '이미 끝난 결정 카드입니다.');
    this.store().setTiming(d.id, tm.timing);
    this.store().setHeld(d.id, true); // P286: 모아 두고, 그 세션의 열린 카드가 없으면 곧바로 보낸다(P295: 모은 답에 now가 있을 때만)
    try { if (this.b.touch) this.b.touch(s); } catch {}
    this.b.store.addEvent(s.sessionId, 'decision_end', { id: d.id, state: 'answered', via, option: d.options.includes(text), auto: d.auto, timing: tm.timing, timingBy: tm.by });
    const f = this.settle(s.sessionId);
    this.changed();
    const waiting = f ? 0 : this.store().heldAnswers(s.sessionId).length;
    return { id: d.id, state: 'answered', deliveryId: f ? f.deliveryId : null, held: !f, waiting, riding: !f && !!this.ridingCounts()[s.sessionId], timing: tm.timing, open: this.store().openDecisions(s.sessionId).length, card: this.store().getDecision(d.id) }; // P295: riding(다음 글에 실려 감)
  }
  // 무시: 세션에 아무것도 보내지 않는다
  ignore(p = {}, c = null) {
    const d = this.card(p.id);
    const via = this.viaOf(c);
    const r = this.store().endDecision(d.id, { state: 'ignored', via });
    this.b.store.addEvent(d.sessionId, 'decision_end', { id: d.id, state: 'ignored', via, auto: d.auto, kind: d.kind });
    const f = this.settle(d.sessionId);
    this.changed();
    this.scheduleWake();
    return { id: d.id, state: 'ignored', deliveryId: f ? f.deliveryId : null, card: r };
  }
  // P292: 끝난 카드를 (보낼 것이면) 모으고 마무리 → 응답
  finish(d, s, answer, send, extra = {}) {
    if (send) this.store().setHeld(d.id, true); // P295: 보내는 때는 부른 쪽이 이미 남겼다
    try { if (this.b.touch && s) this.b.touch(s); } catch {}
    const f = this.settle(d.sessionId);
    this.changed();
    this.scheduleWake();
    const waiting = f ? 0 : this.store().heldAnswers(d.sessionId).length;
    return { id: d.id, state: 'answered', kind: d.kind, answer, sent: send, deliveryId: f ? f.deliveryId : null, held: send && !f, waiting, riding: send && !f && !!this.ridingCounts()[d.sessionId], open: this.activeOpen(d.sessionId).length, card: this.store().getDecision(d.id), ...extra };
  }
  // P292: 할 일(나중에 포함) 했음. 기록만, 에이전트가 --tell을 줬으면 답 모으기로 보낸다
  did(p = {}, c = null) {
    const d = this.card(p.id);
    if (d.kind !== 'do' && d.kind !== 'later') throw apiError('wrong_kind', '실행 카드가 아닙니다.', { kind: d.kind });
    const s = this.b.sessions.get(d.sessionId);
    if (!s) throw apiError('closed', '그 세션은 닫혔습니다.');
    const via = this.viaOf(c);
    const tm = d.tell ? this.pickTiming(d, p, s) : null; // P295
    if (!this.store().endDecision(d.id, { state: 'answered', answer: DID, via, at: this.now() })) throw apiError('already_closed', '이미 끝난 카드입니다.');
    if (tm) this.store().setTiming(d.id, tm.timing);
    this.b.store.addEvent(s.sessionId, 'decision_end', { id: d.id, state: 'answered', via, auto: d.auto, kind: d.kind, tell: d.tell, ...(tm ? { timing: tm.timing, timingBy: tm.by } : {}) });
    return this.finish(d, s, DID, d.tell, tm ? { timing: tm.timing } : {});
  }
  // P292: 확인 결과(됐다/안 됐다 + 한 줄 메모). 늘 답 모으기로 보낸다
  checked(p = {}, c = null) {
    const d = this.card(p.id);
    if (d.kind !== 'check') throw apiError('wrong_kind', '확인 카드가 아닙니다.', { kind: d.kind });
    const s = this.b.sessions.get(d.sessionId);
    if (!s) throw apiError('closed', '그 세션은 닫혔습니다.');
    if (typeof p.ok !== 'boolean') throw apiError('bad_request', '됐는지(ok: true|false)를 줍니다.');
    const note = oneLine(p.note);
    if (note.length > TODO_NOTE_MAX) throw apiError('too_long', `메모가 너무 깁니다(${note.length}자, ${TODO_NOTE_MAX}자까지).`);
    const answer = `${p.ok ? CHECK_OK : CHECK_FAIL}${note ? `: ${note}` : ''}`;
    const via = this.viaOf(c);
    const tm = this.pickTiming(d, p, s); // P295
    if (!this.store().endDecision(d.id, { state: 'answered', answer, via, at: this.now() })) throw apiError('already_closed', '이미 끝난 카드입니다.');
    this.store().setTiming(d.id, tm.timing);
    this.b.store.addEvent(s.sessionId, 'decision_end', { id: d.id, state: 'answered', via, auto: d.auto, kind: 'check', ok: p.ok, note: !!note, timing: tm.timing, timingBy: tm.by });
    return this.finish(d, s, answer, true, { timing: tm.timing });
  }
  // P292: 미루기(until: ms). 그때까지 숨긴다. 숨긴 카드는 답 모으기의 열린 카드가 아니라 남은 답을 곧바로 보낼 수 있다
  snooze(p = {}, c = null) {
    const d = this.card(p.id);
    const until = Number(p.until);
    const now = this.now();
    if (!Number.isFinite(until) || until <= now) throw apiError('bad_request', '미룰 때(지금보다 뒤)를 줍니다.');
    if (until - now > SNOOZE_MAX_MS) throw apiError('bad_request', '400일 안으로 미룹니다.');
    const r = this.store().setDefer(d.id, { wakeAt: Math.round(until), cond: null });
    this.b.store.addEvent(d.sessionId, 'decision_snooze', { id: d.id, kind: d.kind, auto: d.auto, ms: Math.round(until - now), via: this.viaOf(c) });
    const f = this.settle(d.sessionId);
    this.changed();
    this.scheduleWake();
    return { id: d.id, until: r.wakeAt, deliveryId: f ? f.deliveryId : null, card: { ...r, deferred: true } };
  }
  // P292: 꺼내기(나중 줄의 카드를 지금 목록으로)
  raise(p = {}, c = null) {
    const d = this.card(p.id);
    const r = this.store().setDefer(d.id, { wakeAt: null, cond: null });
    this.b.store.addEvent(d.sessionId, 'decision_raise', { id: d.id, kind: d.kind, via: this.viaOf(c) });
    this.changed();
    this.scheduleWake();
    return { id: d.id, card: { ...r, deferred: false } };
  }
  // P292: 때가 된 숨긴 카드를 띄운다(웹 푸시 한 번) → 띄운 수
  wakeDue() {
    const due = this.store().dueDecisions(this.now());
    for (const d of due) {
      this.store().setDefer(d.id, { wakeAt: null, cond: null });
      this.b.store.addEvent(d.sessionId, 'decision_wake', { id: d.id, kind: d.kind });
      const s = this.b.sessions.get(d.sessionId);
      if (s) this.push(s, d, { wake: true });
    }
    if (due.length) this.changed();
    this.scheduleWake();
    return due.length;
  }
  scheduleWake() {
    if (this.wakeTimer) { clearTimeout(this.wakeTimer); this.wakeTimer = null; }
    const w = this.store() && this.store().nextWake ? this.store().nextWake() : null;
    if (w == null) return;
    const ms = Math.max(0, Math.min(w - this.now(), WAKE_TICK_MAX_MS));
    this.wakeTimer = setTimeout(() => { this.wakeTimer = null; try { this.wakeDue(); } catch (e) { this.b.log('decision wake error', e && e.stack); } }, ms + 50);
    if (this.wakeTimer.unref) this.wakeTimer.unref();
  }
  stop() { if (this.wakeTimer) clearTimeout(this.wakeTimer); this.wakeTimer = null; }
  // P286: 그 세션의 열린 카드가 모두 끝났고 모은 답이 있으면 한 글로 보낸다 → 보낸 것 | null
  settle(sessionId, why = 'all') {
    if (this.activeOpen(sessionId).some((d) => this.sends(d))) return null; // P292: 숨긴 카드(나중)와 기록만 하는 할 일은 세지 않는다
    if (!this.store().heldAnswers(sessionId).some((d) => (d.timing || 'now') === 'now')) return null; // P295: 모두 next면 붙잡아 둔다(다음 글에 실려 간다). 옛 답(timing 없음)은 now
    return this.flush(sessionId, why);
  }
  // 모은 답을 꺼낸다(보낸 것으로 친다) → { ids, text } | null
  takeHeld(sessionId) {
    const held = this.store().heldAnswers(sessionId);
    if (!held.length) return null;
    for (const d of held) this.store().setHeld(d.id, false);
    const nNow = held.filter((d) => (d.timing || 'now') === 'now').length; // P295: 기록용(now·next 수)
    return { ids: held.map((d) => d.id), text: held.map((d) => answerText(d.question, d.answer, d.kind)).join('\n'), now: nNow, next: held.length - nNow }; // P292: 종류마다 머리
  }
  // 모은 답을 한 글로 보통 메시지(대기열)에 넣는다 → { deliveryId, ids } | null
  flush(sessionId, why = 'now') {
    const s = this.b.sessions.get(sessionId);
    if (!s) return null;
    const h = this.takeHeld(sessionId);
    if (!h) return null;
    const q = this.b.queue.enqueue(sessionId, h.text, { origin: { kind: 'human' } }); // B1 대기열 규칙 그대로(스티어링이 아니다)
    this.rides.set(q.deliveryId, h.ids); // P295: 실패·취소되면 다시 붙잡는다
    this.b.store.addEvent(sessionId, 'decision_flush', { ids: h.ids, deliveryId: q.deliveryId, why, now: h.now, next: h.next });
    return { deliveryId: q.deliveryId, ids: h.ids };
  }
  // 판 API decision.flush { sessionId }: 모은 답을 지금 보낸다(남은 열린 카드는 그대로)
  flushNow(p = {}) {
    const sid = p.sessionId || p.session;
    const s = sid ? this.b.sessions.get(sid) : null;
    if (!s) throw apiError('not_found', '세션을 찾을 수 없습니다.');
    const f = this.flush(s.sessionId, 'now');
    if (!f) throw apiError('nothing_held', '보낼 답이 없습니다.');
    this.changed();
    return { sessionId: s.sessionId, ...f };
  }
  handlers() {
    return {
      'decision.list': () => ({ cards: this.openAll(), held: this.heldCounts(), riding: this.ridingCounts() }), // P295: riding
      'decision.flush': (p) => this.flushNow(p), // P286
      'decision.answer': (p, c) => this.answer(p, c),
      'decision.ignore': (p, c) => this.ignore(p, c),
      'decision.done': (p, c) => this.did(p, c), // P292: 할 일 했음
      'decision.check': (p, c) => this.checked(p, c), // P292: 확인 됐다/안 됐다
      'decision.snooze': (p, c) => this.snooze(p, c), // P292: 미루기
      'decision.raise': (p, c) => this.raise(p, c), // P292: 나중에서 꺼내기
    };
  }

  // ---------- 닫기 ----------
  // 사람이 카드를 거치지 않고 그 세션에 직접 글을 보냈다(where: bar | terminal). 열린 자동 카드는 answered(via session)
  // P303: 손 카드(atrium ask·todo, 종류 무관)는 닫지 않는다. 사람의 글이 그 질문의 답인지 판은 모른다(카드를 올린 1초 뒤 다른 요청을 보낸 일이 있다).
  //   대화로 답을 받은 에이전트가 atrium ask|todo --done으로 닫는다. 자동 카드는 마지막 질문을 떠 둔 것이라 다음 대화가 갈음해 닫되,
  //   만들어진 지 AUTO_FRESH_MS 안이면 사람이 카드를 보기 전에 보낸 글로 보고 남긴다. 남긴 카드는 decision_kept { hand, fresh, where }로 센다.
  onHuman(sessionId, where = 'session') {
    const at = this.now();
    const active = this.activeOpen(sessionId);
    const open = active.filter((d) => d.auto && at - d.createdAt >= AUTO_FRESH_MS);
    const hand = active.filter((d) => !d.auto).map((d) => d.id);
    const fresh = active.filter((d) => d.auto && at - d.createdAt < AUTO_FRESH_MS).map((d) => d.id);
    if (hand.length || fresh.length) this.b.store.addEvent(sessionId, 'decision_kept', { hand, fresh, where });
    if (!open.length && !this.store().heldAnswers(sessionId).length) return 0;
    let n = 0;
    for (const d of open) if (this.store().endDecision(d.id, { state: 'answered', via: 'session', at })) n++;
    if (n) this.b.store.addEvent(sessionId, 'decision_end', { ids: open.map((d) => d.id), autoIds: open.map((d) => d.id), state: 'answered', via: 'session', where });
    // P295: 명령 바·휴대폰 글(bar)이면 모은 답은 그 글에 실려 간다(보통 글은 넣을 때 takeHeld, 스티어링 글은 보낼 때 attachFront). 따로 보내지 않는다.
    //   터미널에 직접 친 글(terminal)로 턴이 열렸으면 지금 턴에 넣을 수 있는 세션만 스티어링(rideOnly)으로 그 턴에 넣고, 못 넣으면 다음 판 전달을 기다린다
    const f = where === 'terminal' ? this.rideSteer(sessionId) : null;
    if (n || f) this.changed();
    return n;
  }
  // P295: 모은 답을 지금 턴에 스티어링으로 넣는다(rideOnly: 못 넣고 턴이 끝나면 취소되고 다시 붙잡는다) → { deliveryId, ids } | null
  rideSteer(sessionId) {
    const s = this.b.sessions.get(sessionId);
    if (!s || !this.store().heldAnswers(sessionId).length) return null;
    let hooked = true; try { hooked = this.b.hooked ? this.b.hooked(s) : true; } catch {}
    if (steerBlock(s, hooked)) return null; // 일하는 중 입력을 받지 않는 세션: 다음 판 전달을 기다린다
    const h = this.takeHeld(sessionId);
    if (!h) return null;
    const q = this.b.queue.enqueue(sessionId, h.text, { typeNow: true, aside: true, rideOnly: true, origin: { kind: 'human' } });
    q.frontDone = true; // 이 글이 곧 모은 답이다
    this.rides.set(q.deliveryId, h.ids);
    this.b.store.addEvent(sessionId, 'decision_flush', { ids: h.ids, deliveryId: q.deliveryId, why: 'ride_steer', now: h.now, next: h.next });
    return { deliveryId: q.deliveryId, ids: h.ids };
  }
  // P295: 전달 대기열이 그 세션에 글을 처음 보내기 직전(delivery.mjs _deliver). 붙잡은 답이 있으면 그 글 앞에 붙일 글 | null
  attachFront(d) {
    if (!d || !this.b.sessions.has(d.sessionId)) return null;
    const h = this.takeHeld(d.sessionId);
    if (!h) return null;
    this.rides.set(d.deliveryId, [...(this.rides.get(d.deliveryId) || []), ...h.ids]);
    this.b.store.addEvent(d.sessionId, 'decision_flush', { ids: h.ids, deliveryId: d.deliveryId, why: 'ride', now: h.now, next: h.next, origin: d.origin || null, steer: !!d.typeNow });
    this.b.log(`decision ride ${this.nameOf(d.sessionId)} ${d.deliveryId}: ${h.ids.length} answer(s) in front (${d.origin || 'board'}${d.typeNow ? ', steer' : ''})`);
    this.changed();
    return h.text;
  }
  // P295: 답을 실은 전달이 끝났다. 실패·취소면 답을 다시 붙잡는다(다음 글에 실려 가거나 사람이 지금 보내기)
  onDelivery(e) {
    if (!e || !this.rides.has(e.deliveryId)) return;
    if (e.status === 'confirmed' || e.status === 'unconfirmed') { this.rides.delete(e.deliveryId); return; }
    if (e.status !== 'failed' && e.status !== 'cancelled') return;
    const ids = this.rides.get(e.deliveryId); this.rides.delete(e.deliveryId);
    if (!this.b.sessions.has(e.sessionId)) return;
    const back = [];
    for (const id of ids) { const d = this.store().getDecision(id); if (d && d.state === 'answered' && !d.held) { this.store().setHeld(id, true); back.push(id); } }
    if (!back.length) return;
    this.b.store.addEvent(e.sessionId, 'decision_ride_back', { ids: back, deliveryId: e.deliveryId, status: e.status, reason: e.reason || null });
    this.changed();
  }
  // 세션이 닫히거나 보관됐다
  onClosed(s) {
    const held = this.store().heldAnswers(s.sessionId);
    if (held.length) { for (const d of held) this.store().setHeld(d.id, false); this.b.store.addEvent(s.sessionId, 'decision_flush', { ids: held.map((d) => d.id), deliveryId: null, why: 'closed' }); this.changed(); } // P286: 닫힌 세션에는 보내지 않는다
    const open = this.store().openDecisions(s.sessionId);
    if (!open.length) return 0;
    for (const d of open) this.store().endDecision(d.id, { state: 'closed', via: 'closed' });
    this.b.store.addEvent(s.sessionId, 'decision_end', { ids: open.map((d) => d.id), autoIds: open.filter((d) => d.auto).map((d) => d.id), state: 'closed', via: 'closed' });
    this.changed();
    this.scheduleWake();
    return open.length;
  }

  // ---------- P286: 판 자동 카드 ----------
  autoOn() {
    if (this.autoSetting) return !!this.autoSetting();
    try { const f = this.b.features; if (f && f.settings) return f.settings.get().autoDecisions !== false; } catch {}
    return true;
  }
  // 자동 카드를 만들 수 있는 세션인가: 셸이 아니고, 일 상위가 없고, merger가 아니다
  autoEligible(s) {
    if (!s || (s.kind || 'claude') === 'shell') return false;
    if (this.workParent(s)) return false;
    try { if (this.b.merger && this.b.merger.isMerger(s)) return false; } catch {}
    return true;
  }
  // 상태가 바뀔 때(bus 'session'). working → ready만 턴 끝으로 본다(오류·응답 필요·압축만 한 턴은 아니다)
  onSession(s, sum) {
    if ((s.kind || 'claude') === 'shell') return;
    const sid = s.sessionId;
    const prev = this.prev.get(sid);
    this.prev.set(sid, sum.state);
    if (prev && prev !== 'working' && sum.state === 'working' && this.activeOpen(sid).some((d) => d.kind === 'decide' && !d.timing)) this.changed(); // P295: 새 턴이 열리면 결정 카드의 기본 보내는 때(now → next)가 바뀐다
    if (prev !== 'working' || sum.state !== 'ready') return;
    if (sum.work && sum.work.turnless && sum.work.endedAt === s.rt.term.at) return; // P173: 압축만 하고 끝났다
    this.turnEnded(s);
  }
  turnEnded(s) {
    if (!this.autoOn() || !this.autoEligible(s)) return;
    const rt = s.rt; const sid = s.sessionId;
    const since = (rt.turn && rt.turn.startedAt) || (rt.lastWork && rt.lastWork.since) || 0;
    const run = () => {
      this.clearPending(sid);
      if (!this.b.sessions.has(sid)) return;
      if (!since || (rt.lastAnswerAt || 0) < since) return; // 이 턴의 답이 없다
      try { this.autoAsk(s, rt.lastAnswer, since); } catch (e) { this.b.log('decision auto error', e && e.stack); }
    };
    if (!this.b.hooked(s) && (rt.lastAnswerAt || 0) < since) {
      // hook이 없는 종류: 판이 화면에서 답을 고를 때까지 기다린다(peer-news.mjs와 같다)
      this.clearPending(sid);
      const on = (x) => { if (x === s) run(); };
      this.b.bus.on('screenAnswer', on);
      const timer = setTimeout(run, this.answerGraceMs);
      if (timer.unref) timer.unref();
      this.pending.set(sid, { timer, off: () => this.b.bus.off('screenAnswer', on) });
      return;
    }
    run();
  }
  clearPending(sid) { const p = this.pending.get(sid); if (!p) return; clearTimeout(p.timer); p.off(); this.pending.delete(sid); }
  // 마지막 답에서 질문을 찾아 자동 카드를 만든다 → 만든 카드 | null
  autoAsk(s, text, since = 0) {
    const sid = s.sessionId;
    const open = this.store().openDecisions(sid);
    const now = this.now();
    const active = open.filter((d) => !this.isDeferred(d, now));
    if (active.some((d) => !d.auto && (d.kind === 'decide' || d.kind === 'check'))) return null; // 열린 손 결정·확인 카드가 있다(P292: 할 일·나중에는 오래 남으니 막지 않는다)
    if (this.store().decisionsSince(sid, since).some((d) => !d.auto)) return null; // 이 턴에 손 카드를 만들었다
    const f = findAsk(typeof text === 'string' ? text : ''); // P292: 할 일·확인·결정
    if (!f || startsAsBoardNotice(f.question)) return null;
    const question = clip(oneLine(f.question), ASK_QUESTION_MAX);
    const options = f.options.map((x) => clip(oneLine(x), ASK_OPTION_MAX)).slice(0, ASK_OPTIONS_MAX);
    const cmds = (f.cmds || []).map((x) => clip(String(x), TODO_CMD_MAX)).slice(0, TODO_CMDS_MAX);
    const old = active.filter((d) => d.auto); // 사람이 미룬 자동 카드는 바꾸지 않는다
    if (old.length === 1 && old[0].question === question && old[0].kind === f.kind && JSON.stringify(old[0].options) === JSON.stringify(options) && JSON.stringify(old[0].cmds) === JSON.stringify(cmds)) return null; // 같은 질문이 그대로 열려 있다
    const at = this.now(); // P303: 자동 카드의 만든 때는 판의 시계(onHuman의 AUTO_FRESH_MS와 같은 시계)
    for (const d of old) {
      this.store().endDecision(d.id, { state: 'closed', via: 'replaced', at });
      this.b.store.addEvent(sid, 'decision_end', { id: d.id, state: 'closed', via: 'replaced', auto: true });
    }
    if (open.filter((d) => d.kind !== 'later').length - old.length >= ASK_OPEN_MAX) { if (old.length) { this.settle(sid, 'replaced'); this.changed(); } return null; }
    const head = (() => { const l = firstLine(text, 200); return l ? clip(l.replace(/^#+\s*/, '').replace(/\*\*|__|`/g, '').trim(), 120) : null; })();
    const plainOpt = options.map((o) => o.replace(/…$/, ''));
    const why = head && head !== question && !question.includes(head) && !head.includes(question) && !/^\s*(\d{1,2}[.)]|[-*+])\s/.test(head) && !plainOpt.some((o) => head.includes(o) || o.includes(head)) ? clip(oneLine(head), ASK_WHY_MAX) : null; // 첫 줄이 목록·보기와 겹치면 비운다
    const d = this.store().addDecision({ sessionId: sid, name: shownName(s) || s.name, question, options, why, createdAt: at, auto: true, kind: f.kind, cmds });
    this.b.store.addEvent(sid, 'decision_auto', { id: d.id, replaced: old.map((x) => x.id), chars: question.length, options: options.length, kind: s.kind || 'claude', card: f.kind, cmds: cmds.length, source: s.rt.answerSource || null });
    this.b.log(`decision auto ${s.name} #${d.id}${old.length ? ` (replaced #${old.map((x) => x.id).join(',')})` : ''}`);
    this.changed();
    this.push(s, d);
    return d;
  }
}
// 터미널에 직접 친 글인가(UserPromptSubmit이 판의 전달과 맞지 않았다). 판 알림 머리와 Claude Code가 스스로 여는 턴의 글은 뺀다
export function humanPrompt(prompt) {
  const p = String(prompt ?? '').trim();
  if (!p) return false;
  if (startsAsBoardNotice(p)) return false;
  if ([...Object.values(HEADS), ...OLD_HEADS].some((h) => p.startsWith(h))) return false; // P292: [결정]·[확인]·[실행](옛 [할 일])
  if (p.startsWith('<')) return false; // <task-notification> 등
  return true;
}
