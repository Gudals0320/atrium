// P384: 하위 세션의 질문 창(Claude Code AskUserQuestion, OmO ask_user_question)을 사람 대신 그 일 부모에게 보낸다.
// - 길: 하위(일 부모가 판에 열려 있는 세션)가 질문(kind question)을 기다리면 판은 부모에게 질문 본문·번호 붙인 보기·추천·답하는 법을 담은 판 알림을 한 번 보낸다.
//   부모는 `atrium answer <이름> <번호|"글">`로 답하고, 판이 그 답을 질문 창에 친다(Claude는 답하기 길 planAnswer, OmO는 번호·글 키). 사람용 답하기 화면은 없다.
// - 올리기: 부모가 정해진 시간(설정 childAskEscalateMin, 기본 10분, 0이면 올리지 않음) 안에 답하지 않으면 그 질문을 사람에게 올린다(응답 필요 흐림이 풀리고 OS 알림·휴대폰 푸시).
//   그사이 부모가 atrium ask로 결정 카드를 남겼으면 사람은 그 카드로 답하므로 올리지 않고 다시 기다린다(viaCard).
// - 그동안 사람 쪽: 요약의 askRoute { parent, since, escalateAt, escalated, viaCard }를 창이 보고 응답 필요 목록에 흐리게만 보인다(알약 수·N 키·OS 알림에서 뺀다).
//   휴대폰 푸시도 보내지 않는다(web-push.mjs onState). 맨 위 세션(부모 없음)과 질문 창이 아닌 대기(권한 승인·신뢰·계획 승인)는 지금처럼 사람에게 간다.
// - 상태는 세션 runtime(rt.askRoute)에 둔다(백엔드를 다시 켜도 같은 질문에 알림을 되풀이하지 않는다). 판 요약(summary)이 sync를 불러 맞춘다.
import { deriveState, needKey } from './state.mjs';
import { clip } from './text.mjs';
import { RECOMMENDED_RE } from './omo-record.mjs';

export const ESCALATE_DEFAULT_MIN = 10;
export const ANSWER_SETTLE_MS = 8000; // 답을 친 뒤 질문이 닫히기를 기다리는 시간
export const ANSWER_STEP_MS = 400; // 키 묶음 사이(질문 창이 다음 입력을 받기까지)
export const ANSWER_SUBMIT_MS = 1500; // OmO: 친 뒤 이만큼 안 닫히면 검토 화면(Submit)이라 enter를 한 번 더
export const NOTICE_HEAD = '[Atrium 보드] 하위가 질문했다';
const Q_MAX = 600, OPT_MAX = 120, OPTS_MAX = 12, QS_MAX = 6;
const apiError = (code, message, extra = {}) => Object.assign(new Error(message), { code }, extra);
const one = (s, n) => clip(String(s ?? '').replace(/\s+/g, ' ').trim(), n);

// 부모에게 넘길 질문인가: 질문 창(kind question)을 기다린다
export function routableAsk(d) {
  return !!(d && d.state === 'waiting' && d.ask && d.ask.kind === 'question' && Array.isArray(d.ask.questions) && d.ask.questions.length);
}
export const escalateMsOf = (settings) => { const v = Number(settings && settings.childAskEscalateMin); return (Number.isFinite(v) && v >= 0 ? v : ESCALATE_DEFAULT_MIN) * 60000; };

// 질문 하나 → 글 줄(번호 붙인 보기, 추천, 여러 개 고르기)
function questionLines(q, i, n) {
  const opts = (q.options || []).slice(0, OPTS_MAX).map((o) => one(typeof o === 'string' ? o : (o && o.label) || '', OPT_MAX));
  const rec = q.recommended ? opts.findIndex((o) => o === one(q.recommended, OPT_MAX)) : opts.findIndex((o) => RECOMMENDED_RE.test(o));
  const L = [`${n > 1 ? `질문 ${i + 1}/${n}` : '질문'}: ${one(q.question || q.header, Q_MAX)}`];
  opts.forEach((o, k) => L.push(`  ${k + 1}. ${o}`));
  if ((q.options || []).length > OPTS_MAX) L.push(`  (보기 ${q.options.length - OPTS_MAX}개 더)`);
  if (rec >= 0) L.push(`  추천: ${rec + 1}`);
  if (q.multiSelect) L.push('  여러 개 고르기: 번호를 쉼표로 잇는다(예: 1,3)');
  return L;
}
// 부모가 받는 글(판 알림 꼴). minutes: 올리기까지 분(0이면 올리지 않음)
export function askNoticeText({ child, unitId = null, spec = null, ask, minutes = ESCALATE_DEFAULT_MIN }) {
  const qs = (ask.questions || []).slice(0, QS_MAX);
  const head = `${NOTICE_HEAD}: @${child}${unitId ? `(일 ${unitId}${spec ? ` "${one(spec, 50)}"` : ''})` : ''}이 질문 창을 띄웠다. 사람 대신 네가 답한다.`;
  const lines = [head, ...qs.flatMap((q, i) => questionLines(q, i, qs.length))];
  const many = qs.length > 1;
  lines.push(`답하기: \`atrium answer ${child} <번호>\` 또는 보기 밖의 답은 \`atrium answer ${child} "<글>"\`${many ? `(질문이 ${qs.length}개면 차례로: atrium answer ${child} 2 1)` : ''}.`);
  lines.push('일상적인 구현·설계 질문이면 네가 정해 답한다. 기능을 없앰, 입력이나 기본값을 바꿈, 범위나 비용이 바뀜, 되돌리기 어려움, BRIEF 결정과 다름이면 `atrium ask`로 사람에게 묻고 그 답으로 atrium answer 한다.'
    + (minutes > 0 ? ` ${minutes}분 안에 답하지 않으면 보드가 이 질문을 사람에게 올린다.` : ''));
  return lines.join('\n');
}

// 답 글들 → planAnswer 입력(Claude) 또는 질문마다의 답(OmO). answers: ['2'] | ['Blue'] | ['1,3'] | ['2', '1']
export function parseAnswers(ask, answers) {
  const qs = ask.questions || [];
  const list = (Array.isArray(answers) ? answers : [answers]).map((a) => String(a ?? '').trim()).filter((a) => a !== '');
  if (!list.length) throw apiError('bad_request', '답을 준다: atrium answer <이름> <번호> 또는 "<글>"');
  if (list.length !== qs.length) throw apiError('bad_request', `질문이 ${qs.length}개다. 답을 ${qs.length}개 차례로 준다(지금 ${list.length}개).`);
  return qs.map((q, i) => {
    const a = list[i]; const n = (q.options || []).length;
    if (/^\d+(\s*,\s*\d+)*$/.test(a)) {
      const picks = [...new Set(a.split(',').map((x) => Number(x.trim())))];
      for (const p of picks) if (!(p >= 1 && p <= n)) throw apiError('bad_request', `질문 ${i + 1}의 보기는 1~${n}번이다(받은 값 ${p}). 보기 밖의 답은 글로 준다.`);
      if (picks.length > 1 && !q.multiSelect) throw apiError('bad_request', `질문 ${i + 1}은 하나만 고른다.`);
      return { picks, label: picks.map((p) => `${p}. ${q.options[p - 1]}`).join(', ') };
    }
    if (a.length > 2000) throw apiError('bad_request', '글 답은 2000자까지');
    return { text: a.replace(/\s+/g, ' '), label: `글: ${one(a, 80)}` };
  });
}
// Claude Code(답하기 길 planAnswer) 입력. 질문 하나·하나 고르기면 번호(글이면 "Type something" = 보기 수 + 1), 여러 개 고르기면 picks, 질문 여럿이면 질문마다 번호
export function claudeAnswerInput(ask, parsed) {
  const qs = ask.questions || [];
  if (qs.length === 1 && !qs[0].multiSelect) {
    const p = parsed[0];
    return p.text != null ? { choice: qs[0].options.length + 1, text: p.text } : { choice: p.picks[0] };
  }
  if (parsed.some((p) => p.text != null)) throw apiError('answer_in_terminal', '이 질문 창(질문 여럿이거나 여러 개 고르기)은 글 답을 받지 않는다. 보기 번호로 답한다.');
  if (qs.length === 1) return { picks: parsed[0].picks };
  if (parsed.some((p) => p.picks.length > 1)) throw apiError('answer_in_terminal', '질문이 여럿인 창에서 여러 개 고르기는 판이 칠 수 없다. 사람에게 올린다(atrium ask).');
  return { picks: parsed.map((p) => p.picks[0]) };
}
// OmO 질문 창에 칠 키 묶음(질문마다): 번호면 그 숫자 키(여러 개 고르기면 숫자마다 뒤에 enter), 글이면 글을 치고 enter
export function omoAnswerSteps(ask, parsed) {
  const qs = ask.questions || [];
  return parsed.flatMap((p, i) => {
    if (p.text != null) return [{ text: p.text }, { keys: ['enter'] }];
    if (qs[i] && qs[i].multiSelect) return [{ keys: p.picks.map(String) }, { keys: ['enter'] }];
    return [{ keys: [String(p.picks[0])] }];
  });
}

export class ChildAsks {
  // b: 백엔드(sessions, store, queue, workParentOf, broadcastSession, answer, adapter, web, features, log)
  constructor(b, { settleMs = ANSWER_SETTLE_MS, stepMs = ANSWER_STEP_MS, submitMs = ANSWER_SUBMIT_MS, now = () => Date.now() } = {}) {
    this.b = b; this.settleMs = settleMs; this.stepMs = stepMs; this.submitMs = submitMs; this.now = now;
    this.timers = new Map(); // 세션 ID → 올리기 시계
  }
  settings() { try { return this.b.features && this.b.features.settings ? this.b.features.settings.get() : {}; } catch { return {}; } }
  escalateMs() { return escalateMsOf(this.settings()); }
  parentOf(s) {
    const pid = this.b.workParentOf ? this.b.workParentOf(s.sessionId) : null;
    const p = pid ? this.b.sessions.get(pid) : null;
    return p && (p.kind || 'claude') !== 'shell' && pid !== s.sessionId ? p : null;
  }
  // 판 요약이 부른다: 지금 상태(d)에 맞춰 길을 열고 닫는다 → 요약 칸 askRoute | null
  sync(s, d = deriveState(s.rt)) {
    const rt = s.rt; const cur = rt.askRoute || null;
    const parent = routableAsk(d) ? this.parentOf(s) : null;
    const key = parent ? needKey(d) : null;
    if (!key) {
      if (cur) {
        const lost = !parent && routableAsk(d) && needKey(d) === cur.key && !cur.escalated; // 부모가 닫혔다(같은 질문이 남았다) → 이제 사람에게
        this.end(s, cur, lost ? 'parent_gone' : 'gone');
        if (lost) setImmediate(() => { try { if (this.b.web && this.b.web.push && this.b.web.push.need && this.b.sessions.has(s.sessionId)) this.b.web.push.need(this.b.summary(s)); } catch {} });
      }
      return null;
    }
    if (cur && cur.key === key && cur.parentId === parent.sessionId) { this.arm(s); return this.view(s); }
    if (cur) this.end(s, cur, 'replaced');
    const ms = this.escalateMs(); const at = this.now();
    rt.askRoute = { key, parentId: parent.sessionId, since: at, escalateAt: ms > 0 ? at + ms : null, escalated: null, viaCard: null, notified: null, minutes: Math.round(ms / 60000) };
    try { this.b.store.addEvent(s.sessionId, 'child_ask_routed', { key, parent: parent.name, parentId: parent.sessionId, escalateAt: rt.askRoute.escalateAt }); } catch {}
    this.b.log && this.b.log(`child ask → ${parent.name}: ${s.name} ${key}`);
    setImmediate(() => { try { this.notify(s.sessionId, key, d.ask); } catch (e) { this.b.log && this.b.log('child ask notify error', e.stack); } });
    this.arm(s);
    return this.view(s);
  }
  // 요약 칸(창이 본다)
  view(s) {
    const r = s.rt && s.rt.askRoute;
    if (!r) return null;
    const p = this.b.sessions.get(r.parentId);
    return { parent: p ? p.name : null, parentId: r.parentId, since: r.since, escalateAt: r.escalateAt, escalated: r.escalated, viaCard: r.viaCard };
  }
  // 사람 쪽에서 빼는 중인가(부모가 처리 중, 아직 올리지 않음)
  held(s) { const r = s && s.rt && s.rt.askRoute; return !!(r && !r.escalated); }
  routedKey(sid) { const s = this.b.sessions.get(sid); const r = s && s.rt && s.rt.askRoute; return r ? r.key : null; }
  end(s, r, how) {
    this.disarm(s.sessionId);
    s.rt.askRoute = null;
    try { this.b.store.addEvent(s.sessionId, 'child_ask_end', { key: r.key, how: r.answeredBy ? 'parent' : how, escalated: r.escalated || null, ms: this.now() - r.since }); } catch {}
  }
  // 부모에게 알림 한 번(부모가 그 하위를 atrium wait로 기다리면 기다림이 질문을 돌려주므로 보내지 않는다)
  notify(sid, key, ask) {
    const s = this.b.sessions.get(sid); const r = s && s.rt.askRoute;
    if (!r || r.key !== key || r.notified) return null;
    const p = this.b.sessions.get(r.parentId);
    if (!p) return null;
    const U = this.b.branch && this.b.branch.units;
    const ws = U && U.waiters ? U.waiters.get(`${r.parentId}>${sid}`) : null;
    if (ws && ws.size) { r.notified = { at: this.now(), via: 'wait' }; this.b.store.addEvent(sid, 'child_ask_notice', { parent: p.name, via: 'wait' }); return null; }
    const tr = this.b.store.openTryOf ? this.b.store.openTryOf(sid) : null;
    const unit = tr ? this.b.store.getUnit(tr.unitId) : null;
    const text = askNoticeText({ child: s.name, unitId: unit && unit.from === r.parentId ? unit.id : null, spec: unit ? unit.spec : null, ask, minutes: r.minutes });
    const d = this.b.queue.enqueue(r.parentId, text);
    r.notified = { at: this.now(), deliveryId: d.deliveryId };
    this.b.store.addEvent(sid, 'child_ask_notice', { parent: p.name, deliveryId: d.deliveryId });
    this.b.store.addEvent(r.parentId, 'child_ask_notice_in', { child: s.name, deliveryId: d.deliveryId });
    this.b.store.saveRuntime(sid, s.rt);
    return d;
  }
  // ---------- 올리기 ----------
  arm(s) {
    const r = s.rt.askRoute;
    if (!r || r.escalated || !r.escalateAt || this.timers.has(s.sessionId)) return;
    const t = setTimeout(() => { this.timers.delete(s.sessionId); try { this.escalate(s.sessionId); } catch (e) { this.b.log && this.b.log('child ask escalate error', e.stack); } }, Math.max(0, r.escalateAt - this.now()));
    t.unref?.();
    this.timers.set(s.sessionId, t);
  }
  disarm(sid) { const t = this.timers.get(sid); if (t) clearTimeout(t); this.timers.delete(sid); }
  escalate(sid) {
    const s = this.b.sessions.get(sid); const r = s && s.rt.askRoute;
    if (!r || r.escalated) return null;
    const d = deriveState(s.rt);
    if (needKey(d) !== r.key) { this.end(s, r, 'gone'); return null; }
    // 부모가 그사이 atrium ask로 결정 카드를 남겼으면 사람은 그 카드로 답한다: 올리지 않고 같은 시간만큼 더 기다린다
    const cards = this.b.store.decisionsSince ? this.b.store.decisionsSince(r.parentId, r.since).filter((c) => c.state === 'open') : [];
    if (cards.length) {
      r.viaCard = cards[cards.length - 1].id; r.escalateAt = this.now() + this.escalateMs();
      this.b.store.addEvent(sid, 'child_ask_via_card', { card: r.viaCard });
      this.b.broadcastSession(s, { cause: 'child_ask:card' });
      this.arm(s);
      return 'card';
    }
    r.escalated = this.now();
    this.b.store.addEvent(sid, 'child_ask_escalated', { key: r.key, ms: r.escalated - r.since });
    this.b.log && this.b.log(`child ask escalated to human: ${s.name} ${r.key}`);
    this.b.broadcastSession(s, { cause: 'child_ask:escalated' });
    try { if (this.b.web && this.b.web.push && this.b.web.push.need) this.b.web.push.need(this.b.summary(s)); } catch (e) { this.b.log && this.b.log('child ask push error', e.stack); }
    return 'human';
  }
  // ---------- atrium answer <이름> <번호|"글">… ----------
  async answerVerb(caller, o = {}) {
    const b = this.b;
    const t = b.branch.verbs.target(caller, o.name);
    const pid = b.workParentOf(t.sessionId);
    if (pid !== caller.sessionId) throw apiError('not_parent', `@${t.name}의 일 부모가 아니라 답할 수 없다(일 부모: ${pid && b.sessions.get(pid) ? '@' + b.sessions.get(pid).name : '없음'}). 부모가 아니면 사람에게 알린다.`);
    const d = deriveState(t.rt);
    if (!routableAsk(d)) throw apiError('no_question', `@${t.name}는 지금 질문 창을 기다리지 않는다(상태 ${d.state}${d.ask ? `, ${d.ask.kind}` : ''}). 권한 승인·신뢰 질문은 사람이 답한다.`);
    const ask = d.ask; const key = needKey(d);
    const parsed = parseAnswers(ask, o.answers);
    const label = parsed.map((p) => p.label).join(' / ');
    const r = t.rt.askRoute;
    if (r && r.key === key) r.answeredBy = caller.sessionId;
    let sent;
    if (b.hooked(t)) {
      const input = claudeAnswerInput(ask, parsed);
      sent = await b.answer({ session: t.sessionId, toolUseId: ask.toolUseId, since: ask.since, ...input });
      if (!sent || !sent.sent) { if (r) r.answeredBy = null; throw apiError('not_sent', `@${t.name}의 질문 창에 답을 넣지 못했다(${(sent && sent.reason) || '?'}). 화면 보기: atrium read ${t.name}`); }
    } else {
      if (!t.paneId) throw apiError('sleeping', `@${t.name}는 터미널이 닫혀 있다`);
      const steps = omoAnswerSteps(ask, parsed);
      for (let i = 0; i < steps.length; i++) {
        if (i) await new Promise((res) => setTimeout(res, this.stepMs));
        const st = steps[i];
        if (st.keys) await b.adapter.paneKeys(t.paneId, st.keys); else await b.adapter.sendText(t.paneId, st.text);
      }
      sent = { sent: true, steps: steps.map((x) => (x.keys ? x.keys.join('+') : `text(${x.text.length})`)) };
      // OmO 질문 창: 숫자 하나는 곧바로 낸다. 글 답·질문 여럿·여러 개 고르기는 "Review your answers → Submit" 화면에서 enter를 한 번 더 받는다(실측 omo 5.1.8x)
      const t1 = this.now();
      while (this.now() - t1 < this.submitMs) { if (t.kind === 'omo' && b.refreshOmoRecord) { try { b.refreshOmoRecord(t); } catch {} } if (needKey(deriveState(t.rt)) !== key) break; await new Promise((res) => setTimeout(res, 250)); }
      if (needKey(deriveState(t.rt)) === key) { await b.adapter.paneKeys(t.paneId, ['enter']); sent.steps.push('enter(submit)'); }
    }
    // 질문이 닫혔는지(기록·hook이 그 질문을 닫음 = 다른 상태나 다른 질문)
    const t0 = this.now(); let closed = false;
    while (this.now() - t0 < this.settleMs) {
      if (t.kind === 'omo' && b.refreshOmoRecord) { try { b.refreshOmoRecord(t); } catch {} }
      if (needKey(deriveState(t.rt)) !== key) { closed = true; break; }
      await new Promise((res) => setTimeout(res, 250));
    }
    if (closed) b.broadcastSession(t, { cause: 'child_ask:answered' });
    b.store.addEvent(t.sessionId, 'answer', { by: 'parent', parent: caller.name, kind: 'question', tool: ask.tool || null, toolUseId: ask.toolUseId || null, label, steps: sent.steps || null, closed });
    b.store.addEvent(caller.sessionId, 'atrium_answer', { target: t.name, sessionId: t.sessionId, label, closed });
    b.log && b.log(`atrium answer ${caller.name} → ${t.name}: ${label} (${closed ? 'closed' : 'still open'})`);
    return { name: t.name, answered: closed, label, state: deriveState(t.rt).state, next: { read: `atrium read ${t.name}` } };
  }
  stop() { for (const t of this.timers.values()) clearTimeout(t); this.timers.clear(); }
}
