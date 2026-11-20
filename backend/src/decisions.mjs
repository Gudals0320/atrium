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
// 표는 store-decisions.mjs.
import { shownName } from './session-label.mjs';
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
  constructor(b, branch) { this.b = b; this.branch = branch; }
  store() { return this.b.store; }
  // 일 상위(하위 관계의 부모)가 있으면 그 세션 ID
  workParent(s) { try { return this.branch && this.branch.relIndex ? this.branch.relIndex().workParentOf(s.sessionId) || null : null; } catch { return null; } }
  nameOf(id, fallback = null) { const s = this.b.sessions.get(id); return s ? shownName(s) || s.name : fallback || '?'; }
  view(d) { const s = this.b.sessions.get(d.sessionId); return { ...d, name: s ? shownName(s) || s.name : d.name, workspaceKey: s ? s.workspaceKey || null : null }; }
  openAll() { return this.store().openDecisions().filter((d) => this.b.sessions.has(d.sessionId)).map((d) => this.view(d)); }
  changed() { try { this.b.api.broadcast('decision.changed', { cards: this.openAll() }); } catch (e) { this.b.log('decision broadcast error', e && e.stack); } }

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
    try { if (this.b.web && this.b.web.push && this.b.web.push.decision) this.b.web.push.decision({ id: d.id, sessionId: caller.sessionId, name: shownName(caller) || caller.name, workspaceKey: caller.workspaceKey || null }); } catch (e) { this.b.log('decision push error', e && e.stack); }
    return { id: d.id, open: open.length + 1, max: ASK_OPEN_MAX, card: d };
  }
  doneVerb(caller, ref) {
    const id = Number(String(ref).replace(/^#/, ''));
    if (!Number.isInteger(id) || id <= 0) throw apiError('bad_request', '닫을 카드 번호를 준다: atrium ask --done <번호>(목록: atrium ask --list)');
    const d = this.store().getDecision(id);
    if (!d || d.sessionId !== caller.sessionId) throw apiError('not_found', `너의 결정 카드 #${id}가 없다. 목록: atrium ask --list`);
    if (d.state !== 'open') return { id, closed: false, state: d.state, card: d };
    const r = this.store().endDecision(id, { state: 'closed', via: 'agent' });
    this.b.store.addEvent(caller.sessionId, 'decision_end', { id, state: 'closed', via: 'agent' });
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
    const q = this.b.queue.enqueue(s.sessionId, answerText(d.question, text), { origin: { kind: 'human' } }); // B1 대기열 규칙 그대로
    try { if (this.b.touch) this.b.touch(s); } catch {}
    this.b.store.addEvent(s.sessionId, 'decision_end', { id: d.id, state: 'answered', via, deliveryId: q.deliveryId, option: d.options.includes(text) });
    this.changed();
    return { id: d.id, state: 'answered', deliveryId: q.deliveryId, card: r };
  }
  // 무시: 세션에 아무것도 보내지 않는다
  ignore(p = {}, c = null) {
    const d = this.card(p.id);
    const via = this.viaOf(c);
    const r = this.store().endDecision(d.id, { state: 'ignored', via });
    this.b.store.addEvent(d.sessionId, 'decision_end', { id: d.id, state: 'ignored', via });
    this.changed();
    return { id: d.id, state: 'ignored', card: r };
  }
  handlers() {
    return {
      'decision.list': () => ({ cards: this.openAll() }),
      'decision.answer': (p, c) => this.answer(p, c),
      'decision.ignore': (p, c) => this.ignore(p, c),
    };
  }

  // ---------- 닫기 ----------
  // 사람이 카드를 거치지 않고 그 세션에 직접 글을 보냈다(where: bar | terminal). 열린 카드는 answered(via session)
  onHuman(sessionId, where = 'session') {
    const open = this.store().openDecisions(sessionId);
    if (!open.length) return 0;
    const at = Date.now();
    let n = 0;
    for (const d of open) if (this.store().endDecision(d.id, { state: 'answered', via: 'session', at })) n++;
    if (n) { this.b.store.addEvent(sessionId, 'decision_end', { ids: open.map((d) => d.id), state: 'answered', via: 'session', where }); this.changed(); }
    return n;
  }
  // 세션이 닫히거나 보관됐다
  onClosed(s) {
    const open = this.store().openDecisions(s.sessionId);
    if (!open.length) return 0;
    for (const d of open) this.store().endDecision(d.id, { state: 'closed', via: 'closed' });
    this.b.store.addEvent(s.sessionId, 'decision_end', { ids: open.map((d) => d.id), state: 'closed', via: 'closed' });
    this.changed();
    return open.length;
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
