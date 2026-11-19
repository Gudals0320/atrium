// P204: 동료 소식. 동료(관계 peer) 세션끼리 결과를 메시지로 보고하지 않고, 판이 세션마다 한 일을 한 줄씩 남겨 두면 필요할 때 읽는다.
// 표는 store-news.mjs. 누구에게도 보내지 않고 누구도 깨우지 않는다(전달 대기열을 쓰지 않는다).
// - 턴 끝(turn): 세션의 턴이 끝날 때마다(working → ready·error, 압축만 한 턴은 빼고) 카드가 보이는 마지막 일(rt.lastPrompt) 한 줄 + 마지막 답 첫 줄.
//   판 알림([Atrium 보드] 글)으로 시작한 턴은 일로 치지 않는다: 판 알림은 rt.lastPrompt를 바꾸지 않으므로(state.mjs, backend 전달 확인),
//   마지막 일이 앞 기록과 같은 때(prompt_at이 같다)의 턴은 적지 않는다. 같은 일·같은 답도 거듭 적지 않는다.
//   hook이 없는 종류는 턴이 끝난 뒤 판이 화면에서 답을 고르므로(screenAnswer) 그 답을 answerGraceMs까지 기다린다.
// - done: atrium done으로 닫은 일(값 + 보고 첫 줄, 일의 첫 줄).
// - log: 에이전트가 atrium log "<한 줄>"로 남긴 것(NEWS_LOG_MAX자까지). 메시지가 아니다.
// - 읽기: atrium news [<이름>] [--all]. 기본은 내 동료(양쪽)가 내가 마지막으로 본 뒤 남긴 것을 오래된 것부터 NEWS_LINES줄, 읽은 자리를 옮긴다.
//   <이름>이면 판의 어느 세션이든 그 세션의 최근 것(읽기만), --all은 읽은 자리와 상관없이 동료의 최근 것(읽기만). atrium me는 읽지 않은 수만 한 줄.
import { promptTask } from './text.mjs';
import { clip } from './text.mjs';
import { findSession, shownName } from './session-label.mjs';
import { NEWS_LOG_MAX, NEWS_LINES } from './cli-contract.mjs';
import { checkAgentText } from './work-units.mjs';

const TASK_MAX = 120;
const ANSWER_MAX = 200;
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
// 글의 첫 줄(빈 줄과 코드 블록 울타리 줄은 건너뛴다. 개발용 판 시험에서 답이 코드 블록이면 첫 줄이 울타리였다)
const FENCE = /^(`{3,}|~{3,})[\w-]*$/;
export function firstLine(s, max = ANSWER_MAX) {
  if (typeof s !== 'string') return null;
  const l = s.split('\n').map((x) => x.trim()).find((x) => x && !FENCE.test(x));
  return l ? clip(l, max) : null;
}

export class PeerNews {
  // b: 백엔드(sessions, store, bus, hooked, log). branch: Branch(relIndex, rowOf)
  constructor(b, branch, { answerGraceMs = 5000 } = {}) {
    this.b = b; this.branch = branch; this.answerGraceMs = answerGraceMs;
    this.prev = new Map(); // 세션 ID → 마지막으로 본 상태(턴 끝 판정)
    this.pending = new Map(); // 세션 ID → 화면 답을 기다리는 턴 끝 { timer, off }
  }
  store() { return this.b.store; }
  nameOf(id, fallback = null) { const s = this.b.sessions.get(id); if (s) return shownName(s) || s.name; const r = this.branch && this.branch.rowOf ? this.branch.rowOf(id) : null; return (r && r.name) || fallback || '?'; }
  peerIds(caller) { return this.branch.relIndex().peersOf(caller.sessionId).map((p) => p.id); }

  // ---------- 자동 기록 ----------
  onSession(s, sum) {
    if ((s.kind || 'claude') === 'shell') return;
    const sid = s.sessionId;
    const prev = this.prev.get(sid);
    this.prev.set(sid, sum.state);
    if (prev !== 'working' || (sum.state !== 'ready' && sum.state !== 'error')) return;
    if (sum.work && sum.work.turnless && sum.work.endedAt === s.rt.term.at) return; // P173: 압축만 하고 끝났다
    this.turnEnded(s);
  }
  turnEnded(s) {
    const rt = s.rt; const sid = s.sessionId;
    if (!rt.lastPromptAt) return;
    const task = firstLine(promptTask(rt.lastPrompt), TASK_MAX);
    if (!task) return;
    const last = this.store().lastNewsOf(sid, 'turn');
    if (last && last.promptAt === rt.lastPromptAt) return; // 판 알림이 연 턴(마지막 일이 그대로다)
    const write = () => {
      this.clearPending(sid);
      const answer = (rt.lastAnswerAt || 0) >= rt.lastPromptAt ? firstLine(rt.lastAnswer) : null;
      const text = answer || '(답 없음)';
      const l2 = this.store().lastNewsOf(sid, 'turn');
      if (l2 && l2.task === task && l2.text === text) return; // 같은 글은 거듭 적지 않는다
      this.add(s, { kind: 'turn', task, text, promptAt: rt.lastPromptAt });
    };
    if (!this.b.hooked(s) && (rt.lastAnswerAt || 0) < rt.lastPromptAt) {
      // 화면 답을 기다린다(hook이 없는 종류)
      this.clearPending(sid);
      const on = (x) => { if (x === s) write(); };
      this.b.bus.on('screenAnswer', on);
      const timer = setTimeout(write, this.answerGraceMs);
      if (timer.unref) timer.unref();
      this.pending.set(sid, { timer, off: () => this.b.bus.off('screenAnswer', on) });
      return;
    }
    write();
  }
  clearPending(sid) { const p = this.pending.get(sid); if (!p) return; clearTimeout(p.timer); p.off(); this.pending.delete(sid); }
  onDone(caller, unit, result, text) {
    try { this.add(caller, { kind: 'done', task: unit ? firstLine(unit.spec, TASK_MAX) : null, text: firstLine(text) || '(보고 없음)', result }); }
    catch (e) { this.b.log('peer news done error', e.stack); }
  }
  onClosed(s) { this.clearPending(s.sessionId); this.prev.delete(s.sessionId); }
  add(s, n) { return this.store().addNews({ sessionId: s.sessionId, name: shownName(s) || s.name, at: Date.now(), ...n }); }

  // ---------- atrium log "<한 줄>" ----------
  logVerb(caller, o = {}) {
    const text = String(o.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) throw apiError('bad_request', '남길 한 줄을 준다: atrium log "<한 줄>"');
    if (text.length > NEWS_LOG_MAX) throw apiError('too_long', `한 줄이 너무 길다(${text.length}자, ${NEWS_LOG_MAX}자까지). 줄여서 다시 남긴다. 긴 글은 파일에 쓰고 그 경로를 적는다.`);
    checkAgentText(text, '남길 글');
    const r = this.add(caller, { kind: 'log', text });
    return { id: r.id, at: r.at, chars: text.length };
  }

  // ---------- atrium news [<이름>] [--all] ----------
  rowOut(r) { return { id: r.id, name: this.nameOf(r.sessionId, r.name), at: r.at, kind: r.kind, task: r.task, text: r.text, result: r.result }; }
  resolve(caller, ref) {
    const r = String(ref).trim().replace(/^@/, '');
    if (!r) throw apiError('bad_request', '세션 이름을 준다: atrium news <이름>');
    const open = [...this.b.sessions.values()];
    const t = findSession(open, r) || open.find((x) => x.agentName === r) || (this.store().closedSessions ? findSession(this.store().closedSessions(), r) : null);
    if (!t) throw apiError('not_found', `보드에서 세션을 찾을 수 없다: ${r}. 지금 연결: atrium me`);
    return t;
  }
  newsVerb(caller, o = {}) {
    const st = this.store();
    if (o.name) {
      const t = this.resolve(caller, o.name);
      const rows = st.newsRecent([t.sessionId], NEWS_LINES);
      return { name: shownName(t) || t.name, rows: rows.map((r) => this.rowOut(r)), more: 0, unread: null, peers: null };
    }
    const ids = this.peerIds(caller);
    const peers = ids.map((id) => this.nameOf(id));
    const seen = st.newsSeen(caller.sessionId);
    const unreadAll = st.newsCounts(ids, seen).reduce((a, c) => a + c.n, 0);
    if (o.all) {
      const rows = st.newsRecent(ids, NEWS_LINES);
      return { name: null, rows: rows.map((r) => this.rowOut(r)), more: 0, unread: unreadAll, peers };
    }
    const rows = st.newsAfter(ids, seen, NEWS_LINES);
    if (rows.length) st.setNewsSeen(caller.sessionId, rows[rows.length - 1].id);
    return { name: null, rows: rows.map((r) => this.rowOut(r)), more: unreadAll - rows.length, unread: unreadAll, peers };
  }
  // atrium me의 한 줄: 읽지 않은 동료 소식(없으면 null)
  meLine(caller) {
    const ids = this.peerIds(caller);
    const by = this.store().newsCounts(ids, this.store().newsSeen(caller.sessionId)).filter((c) => c.n > 0).map((c) => ({ name: this.nameOf(c.sessionId), n: c.n }));
    if (!by.length) return null;
    return { unread: by.reduce((a, c) => a + c.n, 0), by };
  }
}
