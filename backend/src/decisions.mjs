// P284: 결정 카드. 여러 세션이 글을 주고받는 사이 사람이 내려야 할 결정이 대화 위로 밀려 사라지지 않게, 에이전트가 사람에게 글로 묻는 질문을 판에 따로 남긴다.
// 대상은 에이전트가 글로 묻고 사람이 확인하고 답하는 질문이다("이대로 마무리할까요?"). 권한·신뢰·모델·하네스 질문(응답 필요, 내 차례)은 아니다.
// - 에이전트: atrium ask "<질문 한 줄>" [--option "<보기>"]… [--why "<맥락 한 줄>"] → 카드 번호. 대화에도 글로 묻는다(카드는 대화를 갈음하지 않는다).
//   atrium ask --done <번호>(사람이 다른 길로 답해 끝남), atrium ask --list(자기의 열린 카드).
//   일 상위가 없는 세션(지휘 세션, 동료 등 사람과 직접 일하는 세션)만 쓴다. 하위 워커는 부모에게 atrium prompt로 묻는다(거절).
// - 사람: 판 API decision.list | decision.answer | decision.ignore. 답하면 그 세션에 보통 메시지(대기열)로 "[결정] <질문 줄임> → <답>"이 들어가고 answered.
//   무시는 세션에 아무것도 보내지 않고(세션의 턴을 쓰지 않는다) ignored.
// - 사람이 카드를 거치지 않고 그 세션에 직접 글을 보내면(명령 바·휴대폰 입력 = session.send, 터미널에 직접 친 글 = 전달과 맞지 않는 UserPromptSubmit,
//   hook 없는 종류는 쉬는 중 터미널 Enter) 그 세션의 열린 카드는 answered(via session)로 닫는다. 세션에 따로 알리지 않는다. 판 알림·다른 세션의 글은 닫지 않는다.
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
// 표는 store-decisions.mjs.
import { shownName } from './session-label.mjs';
import { findQuestion } from './auto-ask.mjs';
import { firstLine } from './peer-news.mjs';
import { clip, startsAsBoardNotice } from './text.mjs';
import { checkAgentText } from './work-units.mjs';
import { ASK_QUESTION_MAX, ASK_OPTION_MAX, ASK_OPTIONS_MAX, ASK_WHY_MAX, ASK_OPEN_MAX, ASK_ANSWER_MAX } from './cli-contract.mjs';

export const ANSWER_HEAD = '[결정]';
const QUESTION_SHORT = 80; // 세션에 들어가는 답 글의 질문 줄임
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// 세션에 들어가는 답 글: "[결정] <질문 줄임> → <답>"
export function answerText(question, answer) { return `${ANSWER_HEAD} ${clip(oneLine(question), QUESTION_SHORT)} → ${String(answer ?? '').trim()}`; }

export class Decisions {
  // b: 백엔드(sessions, store, queue, api, web, log, touch?). branch: Branch(relIndex)
  constructor(b, branch, { answerGraceMs = 5000 } = {}) {
    this.b = b; this.branch = branch; this.answerGraceMs = answerGraceMs;
    this.prev = new Map(); // P286: 세션 ID → 마지막으로 본 상태(턴 끝 판정)
    this.pending = new Map(); // P286: 세션 ID → 화면 답을 기다리는 턴 끝 { timer, off }
    this.autoSetting = null; // 시험이 바꾼다(없으면 판 설정 autoDecisions)
  }
  store() { return this.b.store; }
  // 일 상위(하위 관계의 부모)가 있으면 그 세션 ID
  workParent(s) { try { return this.branch && this.branch.relIndex ? this.branch.relIndex().workParentOf(s.sessionId) || null : null; } catch { return null; } }
  nameOf(id, fallback = null) { const s = this.b.sessions.get(id); return s ? shownName(s) || s.name : fallback || '?'; }
  heldCounts() { const m = {}; for (const d of this.store().heldAnswers()) if (this.b.sessions.has(d.sessionId)) m[d.sessionId] = (m[d.sessionId] || 0) + 1; return m; }
  view(d) { const s = this.b.sessions.get(d.sessionId); return { ...d, name: s ? shownName(s) || s.name : d.name, workspaceKey: s ? s.workspaceKey || null : null }; }
  openAll() { return this.store().openDecisions().filter((d) => this.b.sessions.has(d.sessionId)).map((d) => this.view(d)); }
  changed() { try { this.b.api.broadcast('decision.changed', { cards: this.openAll(), held: this.heldCounts() }); } catch (e) { this.b.log('decision broadcast error', e && e.stack); } }

  // ---------- atrium ask ----------
  // o: { question, options: [], why, done: <번호>, list: true }
  askVerb(caller, o = {}) {
    if (o.list) return { cards: this.store().openDecisions(caller.sessionId), max: ASK_OPEN_MAX };
    if (o.done != null && o.done !== false) return this.doneVerb(caller, o.done);
    const pid = this.workParent(caller);
    if (pid) {
      const pname = this.nameOf(pid);
      throw apiError('sub_worker', `하위 워커는 결정 카드를 남기지 않는다. 사람에게 물을 것은 부모에게 묻는다: atrium prompt ${pname} "<질문>"`, { parent: pname });
    }
    const question = oneLine(o.question);
    if (!question) throw apiError('bad_request', '질문 한 줄을 준다: atrium ask "<질문>" [--option "<보기>"]… [--why "<맥락>"]');
    if (question.length > ASK_QUESTION_MAX) throw apiError('too_long', `질문이 너무 길다(${question.length}자, ${ASK_QUESTION_MAX}자까지). 한 줄로 줄이고 맥락은 --why에 쓴다.`);
    checkAgentText(question, '질문');
    const options = (Array.isArray(o.options) ? o.options : o.options == null ? [] : [o.options]).map(oneLine).filter(Boolean);
    if (options.length > ASK_OPTIONS_MAX) throw apiError('too_long', `보기가 너무 많다(${options.length}개, ${ASK_OPTIONS_MAX}개까지).`);
    const longOpt = options.find((x) => x.length > ASK_OPTION_MAX);
    if (longOpt) throw apiError('too_long', `보기가 너무 길다(${longOpt.length}자, ${ASK_OPTION_MAX}자까지): ${clip(longOpt, 40)}`);
    if (new Set(options).size !== options.length) throw apiError('bad_request', '같은 보기가 두 번 있다.');
    const why = o.why == null ? null : oneLine(o.why) || null;
    if (why && why.length > ASK_WHY_MAX) throw apiError('too_long', `맥락이 너무 길다(${why.length}자, ${ASK_WHY_MAX}자까지). 긴 글은 파일에 쓰고 그 경로를 적는다.`);
    const open = this.store().openDecisions(caller.sessionId);
    if (open.length >= ASK_OPEN_MAX) throw apiError('too_many', `열린 결정 카드가 이미 ${open.length}장이다(${ASK_OPEN_MAX}장까지). 사람이 답했거나 쓸모없어진 카드를 atrium ask --done <번호>로 닫는다(목록: atrium ask --list).`, { open: open.map((d) => d.id) });
    const d = this.store().addDecision({ sessionId: caller.sessionId, name: shownName(caller) || caller.name, question, options, why, createdAt: Date.now() });
    this.b.store.addEvent(caller.sessionId, 'decision_ask', { id: d.id, chars: question.length, options: options.length });
    this.b.log(`atrium ask ${caller.name} #${d.id}`);
    this.changed();
    this.push(caller, d);
    return { id: d.id, open: open.length + 1, max: ASK_OPEN_MAX, card: d };
  }
  push(s, d) { try { if (this.b.web && this.b.web.push && this.b.web.push.decision) this.b.web.push.decision({ id: d.id, sessionId: s.sessionId, name: shownName(s) || s.name, workspaceKey: s.workspaceKey || null }); } catch (e) { this.b.log('decision push error', e && e.stack); } }
  doneVerb(caller, ref) {
    const id = Number(String(ref).replace(/^#/, ''));
    if (!Number.isInteger(id) || id <= 0) throw apiError('bad_request', '닫을 카드 번호를 준다: atrium ask --done <번호>(목록: atrium ask --list)');
    const d = this.store().getDecision(id);
    if (!d || d.sessionId !== caller.sessionId) throw apiError('not_found', `너의 결정 카드 #${id}가 없다. 목록: atrium ask --list`);
    if (d.state !== 'open') return { id, closed: false, state: d.state, card: d };
    const r = this.store().endDecision(id, { state: 'closed', via: 'agent' });
    this.b.store.addEvent(caller.sessionId, 'decision_end', { id, state: 'closed', via: 'agent', auto: d.auto });
    this.settle(caller.sessionId);
    this.changed();
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
    const s = this.b.sessions.get(d.sessionId);
    if (!s) throw apiError('closed', '그 세션은 닫혔습니다.');
    const text = String(p.answer ?? '').trim();
    if (!text) throw apiError('bad_request', '답을 입력하세요.');
    if (text.length > ASK_ANSWER_MAX) throw apiError('too_long', `답이 너무 깁니다(${text.length}자, ${ASK_ANSWER_MAX}자까지).`);
    const via = this.viaOf(c);
    const r = this.store().endDecision(d.id, { state: 'answered', answer: text, via });
    if (!r) throw apiError('already_closed', '이미 끝난 결정 카드입니다.');
    this.store().setHeld(d.id, true); // P286: 모아 두고, 그 세션의 열린 카드가 없으면 곧바로 보낸다
    try { if (this.b.touch) this.b.touch(s); } catch {}
    this.b.store.addEvent(s.sessionId, 'decision_end', { id: d.id, state: 'answered', via, option: d.options.includes(text), auto: d.auto });
    const f = this.settle(s.sessionId);
    this.changed();
    const waiting = f ? 0 : this.store().heldAnswers(s.sessionId).length;
    return { id: d.id, state: 'answered', deliveryId: f ? f.deliveryId : null, held: !f, waiting, open: this.store().openDecisions(s.sessionId).length, card: this.store().getDecision(d.id) };
  }
  // 무시: 세션에 아무것도 보내지 않는다
  ignore(p = {}, c = null) {
    const d = this.card(p.id);
    const via = this.viaOf(c);
    const r = this.store().endDecision(d.id, { state: 'ignored', via });
    this.b.store.addEvent(d.sessionId, 'decision_end', { id: d.id, state: 'ignored', via, auto: d.auto });
    const f = this.settle(d.sessionId);
    this.changed();
    return { id: d.id, state: 'ignored', deliveryId: f ? f.deliveryId : null, card: r };
  }
  // P286: 그 세션의 열린 카드가 모두 끝났고 모은 답이 있으면 한 글로 보낸다 → 보낸 것 | null
  settle(sessionId, why = 'all') {
    if (this.store().openDecisions(sessionId).length) return null;
    return this.flush(sessionId, why);
  }
  // 모은 답을 꺼낸다(보낸 것으로 친다) → { ids, text } | null
  takeHeld(sessionId) {
    const held = this.store().heldAnswers(sessionId);
    if (!held.length) return null;
    for (const d of held) this.store().setHeld(d.id, false);
    return { ids: held.map((d) => d.id), text: held.map((d) => answerText(d.question, d.answer)).join('\n') };
  }
  // 모은 답을 한 글로 보통 메시지(대기열)에 넣는다 → { deliveryId, ids } | null
  flush(sessionId, why = 'now') {
    const s = this.b.sessions.get(sessionId);
    if (!s) return null;
    const h = this.takeHeld(sessionId);
    if (!h) return null;
    const q = this.b.queue.enqueue(sessionId, h.text, { origin: { kind: 'human' } }); // B1 대기열 규칙 그대로(스티어링이 아니다)
    this.b.store.addEvent(sessionId, 'decision_flush', { ids: h.ids, deliveryId: q.deliveryId, why });
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
      'decision.list': () => ({ cards: this.openAll(), held: this.heldCounts() }),
      'decision.flush': (p) => this.flushNow(p), // P286
      'decision.answer': (p, c) => this.answer(p, c),
      'decision.ignore': (p, c) => this.ignore(p, c),
    };
  }

  // ---------- 닫기 ----------
  // 사람이 카드를 거치지 않고 그 세션에 직접 글을 보냈다(where: bar | terminal). 열린 카드는 answered(via session)
  onHuman(sessionId, where = 'session') {
    const open = this.store().openDecisions(sessionId);
    if (!open.length && !this.store().heldAnswers(sessionId).length) return 0;
    const at = Date.now();
    let n = 0;
    for (const d of open) if (this.store().endDecision(d.id, { state: 'answered', via: 'session', at })) n++;
    if (n) this.b.store.addEvent(sessionId, 'decision_end', { ids: open.map((d) => d.id), autoIds: open.filter((d) => d.auto).map((d) => d.id), state: 'answered', via: 'session', where });
    const f = this.flush(sessionId, 'human'); // P286: 명령 바 글이면 이미 앞에 붙였다(takeHeld). 남은 것(터미널에 직접 친 글)은 그 뒤에 한 글로
    if (n || f) this.changed();
    return n;
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
    if (open.some((d) => !d.auto)) return null; // 열린 손 카드가 있다
    if (this.store().decisionsSince(sid, since).some((d) => !d.auto)) return null; // 이 턴에 손 카드를 만들었다
    const f = findQuestion(typeof text === 'string' ? text : '');
    if (!f || startsAsBoardNotice(f.question)) return null;
    const question = clip(oneLine(f.question), ASK_QUESTION_MAX);
    const options = f.options.map((x) => clip(oneLine(x), ASK_OPTION_MAX)).slice(0, ASK_OPTIONS_MAX);
    const old = open.filter((d) => d.auto);
    if (old.length === 1 && old[0].question === question && JSON.stringify(old[0].options) === JSON.stringify(options)) return null; // 같은 질문이 그대로 열려 있다
    const at = Date.now();
    for (const d of old) {
      this.store().endDecision(d.id, { state: 'closed', via: 'replaced', at });
      this.b.store.addEvent(sid, 'decision_end', { id: d.id, state: 'closed', via: 'replaced', auto: true });
    }
    if (open.length - old.length >= ASK_OPEN_MAX) { if (old.length) { this.settle(sid, 'replaced'); this.changed(); } return null; }
    const head = firstLine(text, 120);
    const why = head && head !== question && !question.includes(head) && !head.includes(question) ? clip(oneLine(head), ASK_WHY_MAX) : null;
    const d = this.store().addDecision({ sessionId: sid, name: shownName(s) || s.name, question, options, why, createdAt: at, auto: true });
    this.b.store.addEvent(sid, 'decision_auto', { id: d.id, replaced: old.map((x) => x.id), chars: question.length, options: options.length, kind: s.kind || 'claude', source: s.rt.answerSource || null });
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
  if (p.startsWith(ANSWER_HEAD)) return false;
  if (p.startsWith('<')) return false; // <task-notification> 등
  return true;
}
