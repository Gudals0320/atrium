// 전달 대기열(ARCH 4절 B1). 세션마다 먼저 넣은 것부터 하나씩 보낸다. 한 세션이 응답을 기다리는 동안 다른 세션은 막지 않는다(E3 2.4).
// 상태: queued(이유) → sending → sent → confirmed | unconfirmed. 그 밖에 failed(이유), cancelled.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { toLF, promptMatches } from './text.mjs';

const FINAL = new Set(['confirmed', 'unconfirmed', 'failed', 'cancelled']);
// P223: 보내지 않고 붙잡아 두는 까닭(멈춘 rig 고리의 입구로 온 요청). 잇기에 놓인다
export const PARKED = new Set(['loop_paused']);
// P106: 터미널이 agent.prompt를 받지 않은 까닭(오류 코드) → 기다리는 이유. 같은 전달을 곧바로 다시 보내지 않고 물러난다
const REFUSED = { agent_not_found: 'no_agent', agent_not_ready: 'no_agent', agent_blocked: 'waiting', unreachable: 'terminal_down' };
// P215: 이 까닭으로 맨 앞에서 기다리는 시간은 짧은 상한(deliveryMaxWaitMs, 15분)에 넣지 않는다. 받는 세션이 턴을 도는 중(working)이거나
//   그 턴 안에서 사람의 답(권한·질문, waiting)을 기다린다: 턴이 끝나면 넣는다. 아주 긴 턴은 큰 상한(deliveryLongWaitMs, 12시간)이 끊는다
export const LONG_WAIT = new Set(['working', 'waiting']);
// P106: n번째 거부 뒤 다시 보내기까지 기다릴 시간(0.5초에서 두 배씩, 30초까지)
export function retryDelay(n, cfg = {}) {
  const base = cfg.deliveryBackoffMs ?? 500, max = cfg.deliveryBackoffMaxMs ?? 30000;
  return Math.min(max, base * 2 ** Math.max(0, n - 1));
}

// 세션 상태로 지금 보낼 수 있는지 판단한다. 보낼 수 없으면 기다리는 이유를 돌려준다.
export function blockReason(view, now, cfg) {
  if (!view || view.closed) return 'closed';
  if (!view.termConnected) return 'terminal_down';
  if (view.state === 'sleeping') return 'sleeping'; // P21(D4): 판이 깨운 뒤(ready) 보낸다. 이 이유로 기다리면 백엔드가 깨운다
  if (view.state === 'starting') return 'starting'; // 규칙 3(패널이 claude를 찾기 전도 시작 중으로 본다)
  if (!view.agentPresent) return 'no_agent'; // 규칙 1: claude가 돌고 있는 패널에만
  switch (view.state) {
    case 'waiting': return 'waiting'; // 규칙 2
    case 'starting': return 'starting'; // 규칙 3
    case 'trust_wait': return 'trust_wait'; // 규칙 3
    case 'working': if (view.bgOnly) break; return 'working'; // P240: 턴은 끝났고 뒤 일만 돌면 쉬는 것처럼 보낸다. 턴 중에는 보내지 않는다(Claude Code 자체 대기열과 섞지 않기 위해)
    case 'exited': return 'no_agent';
    default:
  }
  if (view.lastUserInputAt && now - view.lastUserInputAt < cfg.inputQuietMs) return 'user_typing'; // 규칙 4
  return null;
}

// P240: 턴은 끝났고 뒤 일(뒤 셸·뒤 하위 에이전트)만 도는 Claude Code 세션인가. 순수 함수. 전달이 쓰는 view의 bgOnly(backend.deliveryView)가 이것 하나로 정한다.
//   판(hc)은 뒤 일이 돌면 턴이 끝나도 working으로 본다(P92·P164). 카드·세션 맵 표시는 그대로 working이고, 전달만 기다리지 않고 보통 보내기로 넣는다.
//   rt: 세션 runtime, state: deriveState 결과, bg: 도는 뒤 일(backgroundOf·backgroundList, 없으면 null)
//   - 판이 띄운 Claude Code(hook)만. 다른 종류는 뒤 일 정보가 없다
//   - 마지막 Stop이 마지막 UserPromptSubmit 뒤에 왔다(turn.endedAt ≥ startedAt) + 그 뒤 주 에이전트의 도구 hook이 없다(rt.toolAt). 압축 중은 아니다
//   뒤 일이 끝나 Claude Code가 스스로 새 턴(<task-notification>)을 열면 UserPromptSubmit이 오지 않을 수 있다. 그 턴의 첫 도구 hook 전에 넣은 글은
//   Claude Code 대기 메시지가 된다(턴 중 입력, canTypeNow·_typeNow 길과 같다). 그 턴이 끝나면 UserPromptSubmit이 와서 확인된다
export function bgOnlyOf(rt, state, bg, { kind = 'claude', hooked = true } = {}) {
  if (!rt || !bg || (kind || 'claude') !== 'claude' || !hooked) return false;
  if (!state || state.state !== 'working' || state.estimate === 'compacting') return false;
  const t = rt.turn || {};
  if (!t.startedAt || !t.endedAt || t.endedAt < t.startedAt) return false;
  if (rt.toolAt && rt.toolAt > t.endedAt) return false;
  return Number(bg.n) > 0;
}

// P90: 휴대폰 입력 줄은 "일하는 중이면 바로 넣기"(typeNow)로 보낸다. PC 터미널에서 Enter를 친 것처럼 Claude Code가 자기 대기 메시지로 받아 둔다.
// 판이 띄운 Claude Code(hook 있음)가 working일 때만이다. waiting·trust_wait(권한·질문·신뢰 화면), starting, ready, 셸, 다른 종류, hook 없는 세션은 B1 그대로.
// 입력 칸에 쓰던 글이 있거나 입력 칸을 못 읽으면 넣지 않는다(_typeNow). 막힌 패널은 터미널의 prompt가 글을 넣기 전에 거부한다(agent_blocked)
export function canTypeNow(view) {
  return !!view && !view.closed && !!view.termConnected && !!view.agentPresent && view.state === 'working' && (view.kind || 'claude') === 'claude' && !!view.hooked;
}
// 바로 넣을 글: 줄바꿈은 LF(B1 5), 끝 줄바꿈은 뗀다(입력 칸에 빈 줄이 남지 않게). Enter는 agent.prompt가 마지막에 한 번 누른다
export const typedText = (text) => toLF(text).replace(/\n+$/, '');
// P182: 전달의 출처 → 행의 칸
const ORIGINS = new Set(['human', 'agent', 'board']);
function originOf(o) { const kind = o && ORIGINS.has(o.kind) ? o.kind : 'board'; return { origin: kind, fromSession: kind === 'agent' && o.session ? String(o.session) : null }; }
// P172: 세션 안 차례(작을수록 먼저). 차례 값이 없으면 넣은 시각
const order = (d) => d.seq ?? d.createdAt;

export class DeliveryQueue extends EventEmitter {
  // view(sessionId, delivery) → { state, agentPresent, termConnected, lastUserInputAt, closed }
  // send(sessionId, text) → Promise. 터미널 오류는 code를 가진 Error로 던진다.
  // P79: inspect(sessionId, text) → { box: 'ours'|'empty'|'other'|'unknown', seen }(화면의 입력 칸), pressEnter(sessionId) → Promise.
  //   보낸 뒤 cfg.submitRetryMs 동안 제출 확인이 없으면 화면을 본다: 입력 칸에 보낸 글이 그대로면 Enter, 비었고 들어간 흔적도 없으면 한 번 다시 보낸다.
  //   다른 글이 있거나(사람이 쓰는 중) 알 수 없으면 손대지 않는다. 사람이 3초 안에 친 터미널은 기다린다(B1 규칙 4). 둘 다 없으면 전처럼 기다리기만 한다
  //   P106: hook이 없는 종류(Codex 등)도 inspect가 그 종류의 입력 칸을 읽는다(noResend면 다시 보내지 않고 Enter만). 화면을 못 읽거나(unknown) 아직 뜨는 중이면
  //   손쓰기로 세지 않고 다시 본다(submitLooks번까지). 입력 칸에 보낸 글이 남았으면 submitEnterMs 뒤에 Enter, 다시 보내기는 submitRetryMs 뒤에만
  // P128: drafts = { aside(sid, d) → { state: 'clear'|'moved'|'keep', held?, why? }, back(sid, held, d) → { result, why? } }(draft-aside.mjs draftMover).
  //   보내기 직전에 입력 칸에 쓰다 만 글이 있으면 비키고(moved), 지시가 끝나면(확인·확인 못 함·실패·취소) 되돌린다. 비우지 못하면(keep, P139) 'draft'로 기다리며 draftLookMs마다 다시 본다
  constructor({ store, cfg, view, send, inspect = null, pressEnter = null, drafts = null }) {
    super();
    this.store = store; this.cfg = cfg; this.view = view; this.send = send; this.inspect = inspect; this.pressEnter = pressEnter; this.drafts = drafts;
    this.items = new Map();
    for (const d of store.activeDeliveries()) {
      // 백엔드가 보내는 중에 꺼졌다면 들어갔는지 모른다 → sent로 보고 확인을 기다린다(C2에서 대화 기록으로 맞춘다)
      // sentAt이 없으면 확인 기한을 셀 수 없어 영영 sent로 남는다 → 복구 시각을 넣는다(이슈 #1-1)
      if (d.status === 'sending') d.status = 'sent';
      if (d.status === 'sent' && !d.sentAt) { d.sentAt = Date.now(); store.updateDelivery(d.deliveryId, { status: 'sent', reason: d.reason ?? null, sentAt: d.sentAt }); }
      if (d.seq == null) d.seq = d.createdAt; // P172: 옛 판의 전달(차례 열이 없다)은 넣은 순서
      d.acctFree = true; // P215: 꺼진 동안 무엇을 기다렸는지 모른다. 짧은 상한은 다시 뜬 때부터 센다(큰 상한은 넣은 때부터)
      if (d.status === 'queued' && PARKED.has(d.reason)) d.parked = d.reason; // P223: 멈춘 고리에 붙잡은 요청은 다시 떠도 붙잡힌 채
      if (!d.parked || !d.parkLoop) delete d.parkLoop; // P225: 붙잡힌 전달만 [잇기]의 고리(park_loop 열)를 쥔다
      this.items.set(d.deliveryId, d);
    }
  }
  start() { this.timer = setInterval(() => this.pump(), 500); }
  stop() { clearInterval(this.timer); }

  // opts.typeNow(P90): 세션이 일하는 중이면 기다리지 않고 바로 넣는다(canTypeNow). 저장하지 않으므로 백엔드가 다시 뜨면 B1 그대로 보낸다
  // P182: opts.origin = { kind: human | agent | board, session?: 보낸 세션 ID }. 주지 않으면 board(판 알림·루프 등). deliveries.origin·from_session에 남는다
  enqueue(sessionId, text, opts = {}) {
    const d = { deliveryId: 'd' + crypto.randomBytes(5).toString('hex'), sessionId, text: opts.typeNow ? typedText(text) : toLF(text), status: 'queued', reason: null, createdAt: Date.now(), attempts: 0, ...originOf(opts.origin) };
    d.seq = d.createdAt; // P172: 세션 안 차례. 순서 바꾸기·바로 보내기가 고친다(작을수록 먼저)
    if (opts.typeNow) d.typeNow = true;
    if (this._ofSession(sessionId).length) d.acctFree = true; // P215: 앞 전달 뒤에서 기다리는 시간은 짧은 상한에 넣지 않는다(맨 앞이 된 뒤 그 까닭으로 센다)
    if (opts.typeNow && opts.aside) d.typeAside = true; // P143(atrium prompt --now): 입력 칸에 쓰다 만 글이 있으면 비키고(P128·P139) 바로 넣는다. 휴대폰 입력 줄(P90)은 그대로 기다린다
    this.store.insertDelivery(d);
    this.items.set(d.deliveryId, d);
    this._emit(d);
    this.poke(sessionId); // P106: 사람이 다시 보내면 물러나 있던 앞 전달도 바로 다시 본다
    setImmediate(() => this.pump());
    return d;
  }
  // P223: 멈춘 고리의 입구로 온 요청을 붙잡아 둔다(까닭 loop_paused). 대기 중(queued)으로 남지만 보내지 않고, 그 세션의 다른 전달의 차례도 막지 않는다
  //   (고치는 중 붙잡기 P158과 같은 꼴, 다만 맨 앞을 쥐지 않는다). 잇기가 unpark로 넣거나(rig-loops) dropPark로 끝낸다. 사람은 취소할 수 있다
  park(sessionId, text, reason = 'loop_paused', opts = {}) {
    const d = { deliveryId: 'd' + crypto.randomBytes(5).toString('hex'), sessionId, text: toLF(text), status: 'queued', reason, createdAt: Date.now(), attempts: 0, ...originOf(opts.origin) };
    d.seq = d.createdAt; d.parked = reason;
    if (opts.loop) d.parkLoop = { loop: String(opts.loop), workspace: opts.workspace || null }; // 창의 [잇기] 단추
    this.store.insertDelivery(d);
    if (d.parkLoop && this.store.setDeliveryParkLoop) this.store.setDeliveryParkLoop(d.deliveryId, d.parkLoop); // P225: 전달 표에 남겨 판이 다시 떠도 [잇기]가 보인다
    this.items.set(d.deliveryId, d);
    this._emit(d);
    return d;
  }
  // 붙잡은 전달을 놓는다. text를 주면 그 글로 바꾼다(잇기가 일 머리를 붙인 글). 붙잡은 동안은 기다린 시간에 넣지 않는다 → 전달 | null(이미 붙잡힌 것이 아님)
  unpark(id, text = null) {
    const d = this.items.get(id);
    if (!d || !d.parked || d.status !== 'queued') return null;
    d.parked = null; this._unparkRow(d);
    if (text != null) { d.text = toLF(text); if (this.store.updateDeliveryText) this.store.updateDeliveryText(d.deliveryId, d.text); }
    const now = Date.now();
    d.pausedMs = (d.pausedMs || 0) + Math.max(0, now - d.createdAt); d.freeMs = 0; d.acctAt = now; d.acctFree = this._ofSession(d.sessionId).some((x) => x !== d);
    d.seq = now; if (this.store.updateDeliverySeq) this.store.updateDeliverySeq(d.deliveryId, d.seq); // 잇기 때 차례(그동안 들어간 전달 뒤)
    this._set(d, 'queued', null);
    this.poke(d.sessionId);
    setImmediate(() => this.pump());
    return d;
  }
  // P225: 붙잡힘이 풀리면 전달 표의 park_loop도 지운다
  _unparkRow(d) { if (d.parkLoop) { delete d.parkLoop; if (this.store.setDeliveryParkLoop) this.store.setDeliveryParkLoop(d.deliveryId, null); } }
  // 붙잡은 전달을 넣지 않고 끝낸다(입구 세션이 없어 회를 열지 못했거나, 일이 그 세션의 줄에 섰다) → 전달 | null
  dropPark(id, status = 'cancelled', reason = 'loop_dropped') {
    const d = this.items.get(id);
    if (!d || !d.parked || d.status !== 'queued') return null;
    d.parked = null; this._unparkRow(d);
    this._set(d, status, reason);
    return d;
  }
  // P182: rig의 deliver 훅이 사람의 글을 거절했다. 넣지 않고 실패한 전달 한 줄로 남긴다(창은 전달 실패와 같은 길로 까닭을 보인다)
  refuse(sessionId, text, reason, opts = {}) {
    const d = { deliveryId: 'd' + crypto.randomBytes(5).toString('hex'), sessionId, text: toLF(text), status: 'failed', reason, createdAt: Date.now(), attempts: 0, ...originOf(opts.origin) };
    d.seq = d.createdAt;
    this.store.insertDelivery(d);
    this._emit(d);
    return d;
  }
  // P106: 막혀 물러난 전달(앞 시도를 터미널이 받지 않음)은 시도 중(sending)이어도 취소한다. 처음 보내는 짧은 순간(sending, 거부 없음)은 취소하지 않는다
  cancel(id) {
    const d = this.items.get(id) || this.store.getDelivery(id);
    if (!d) throw Object.assign(new Error('no such delivery'), { code: 'not_found' });
    if (d.status !== 'queued' && !(d.status === 'sending' && d.refusals)) throw Object.assign(new Error(`cannot cancel: ${d.status}`), { code: 'not_cancellable' });
    if (d.parked) { d.parked = null; this._unparkRow(d); } // P225
    this._set(d, 'cancelled', 'user');
    return d;
  }
  // P106: 사람의 취소(atrium cancel, 판 UI). 보내는 중이면 그 시도가 끝나기를 잠깐(cancelWaitMs) 기다린다. 터미널이 받지 않았으면 대기열로 돌아와 취소된다
  async cancelWait(id) {
    const d = this.items.get(id);
    if (d && d.status === 'sending' && d.inflight) await Promise.race([d.inflight, new Promise((r) => { const t = setTimeout(r, this.cfg.cancelWaitMs ?? 3000); if (t.unref) t.unref(); })]);
    return this.cancel(id);
  }
  // P158: 판 칩의 "수정". 대기 중(queued)인 전달을 붙잡아 고치는 동안 보내지 않는다(그 세션의 뒤 전달도 차례를 지켜 기다린다).
  //   붙잡기는 메모리에만 둔다(백엔드가 다시 뜨면 놓인 채로 B1 그대로 보낸다). 창이 닫혀 놓지 못해도 editHoldMs(10분) 뒤 저절로 놓는다.
  //   보내는 중이면 cancelWait처럼 그 시도를 잠깐 기다린다. 이미 들어갔으면 already_sent를 던진다
  async holdWait(id) {
    const d = this.items.get(id);
    if (d && d.status === 'sending' && d.inflight) await Promise.race([d.inflight, new Promise((r) => { const t = setTimeout(r, this.cfg.cancelWaitMs ?? 3000); if (t.unref) t.unref(); })]);
    return this.hold(id);
  }
  hold(id) {
    const d = this._editable(id);
    d.editing = true; d.editingAt = Date.now();
    if (d.reason !== 'editing') { d.reasonBeforeEdit = d.reason; this._set(d, 'queued', 'editing'); }
    return { deliveryId: d.deliveryId, sessionId: d.sessionId, status: d.status, reason: d.reason, text: d.text };
  }
  // 고친 글로 바꾸고 놓는다. 차례(createdAt)는 그대로다. 붙잡지 않은 대기 중 전달도 바꿀 수 있다
  update(id, text) {
    const d = this._editable(id);
    const t = d.typeNow ? typedText(String(text ?? '')) : toLF(String(text ?? ''));
    if (!t.trim()) throw Object.assign(new Error('empty text'), { code: 'empty' });
    d.text = t;
    if (this.store.updateDeliveryText) this.store.updateDeliveryText(d.deliveryId, t);
    d.mismatchSeen = false; d.checkedAt = 0;
    this._release(d);
    return { deliveryId: d.deliveryId, sessionId: d.sessionId, status: d.status, reason: d.reason, text: d.text };
  }
  // 고치지 않고 놓는다(Esc). 이미 끝났거나 놓였으면 조용히 지금 상태를 돌려준다
  release(id) {
    const d = this.items.get(id) || this.store.getDelivery(id);
    if (!d) throw Object.assign(new Error('no such delivery'), { code: 'not_found' });
    if (d.editing) this._release(d);
    return { deliveryId: d.deliveryId, sessionId: d.sessionId, status: d.status, reason: d.reason };
  }
  _editable(id) {
    const d = this.items.get(id) || this.store.getDelivery(id);
    if (!d) throw Object.assign(new Error('no such delivery'), { code: 'not_found' });
    if (d.parked) throw Object.assign(new Error('held by a paused rig loop'), { code: 'loop_paused' }); // P223: 고리 잇기를 기다린다(취소는 된다)
    if (d.status === 'queued' && this.items.has(d.deliveryId)) return d;
    if (['sending', 'sent', 'confirmed', 'unconfirmed'].includes(d.status)) throw Object.assign(new Error(`already sent: ${d.status}`), { code: 'already_sent' });
    throw Object.assign(new Error(`cannot edit: ${d.status}`), { code: 'not_editable' });
  }
  _release(d) {
    if (!d.editing) return;
    d.pausedMs = (d.pausedMs || 0) + (Date.now() - d.editingAt); // 고치는 동안은 기다린 시간(deliveryMaxWaitMs)에 넣지 않는다
    d.editing = false; d.editingAt = 0; d.retryAt = 0;
    const back = d.reasonBeforeEdit ?? null; d.reasonBeforeEdit = undefined;
    if (d.status === 'queued' && d.reason === 'editing') this._set(d, 'queued', back);
    setImmediate(() => this.pump());
  }
  // P106: 에이전트 상태가 바뀌었다(터미널 이벤트) → 물러나 있던 전달을 바로 다시 본다
  poke(sessionId) {
    const d = this._head(sessionId);
    if (d && d.status === 'queued' && d.retryAt) { d.retryAt = 0; setImmediate(() => this.pump()); }
  }
  // P106: 오래(deliveryStuckMs) 터미널이 받지 않는 맨 앞 전달. 세션 노드와 atrium children이 그 까닭을 보인다
  stuckOf(sessionId, now = Date.now()) {
    const d = this._head(sessionId);
    if (!d || !d.refusedSince || (d.status !== 'queued' && d.status !== 'sending')) return null;
    if (now - d.refusedSince < this._stuckMs()) return null;
    return { deliveryId: d.deliveryId, reason: d.reason, code: d.refusedCode || null, attempts: d.attempts || 0, since: d.refusedSince, retryAt: d.retryAt || null };
  }
  cancelSession(sessionId, reason) { for (const d of this.items.values()) if (d.sessionId === sessionId && d.status === 'queued') this._set(d, 'cancelled', reason); }
  pending(sessionId) { let n = 0; for (const d of this.items.values()) if (d.sessionId === sessionId) n++; return n; }
  list(sessionId) { return [...this.items.values()].filter((d) => !sessionId || d.sessionId === sessionId).sort((a, b) => order(a) - order(b)); }

  // B1 규칙 6: hook UserPromptSubmit이 오면 맞춰 보고 "제출 확인"
  onUserPromptSubmit(sessionId, prompt) {
    const d = this._head(sessionId);
    if (!d || (d.status !== 'sending' && d.status !== 'sent')) return null;
    if (promptMatches(d.text, prompt)) { this._set(d, 'confirmed', d.typed ? 'typed' : null, { confirmedAt: Date.now() }); setImmediate(() => this.pump()); return d; }
    d.mismatchSeen = true;
    return null;
  }
  // hook이 없는 세션(판에 올린 에이전트, Claude Code가 아닌 종류)은 보낸 뒤 터미널 상태가 working이 되면 제출 확인으로 친다(P4)
  onAgentWorking(sessionId) {
    const d = this._head(sessionId);
    if (d && d.status === 'sending') { d.workingSeen = true; return null; } // agent.prompt 응답보다 working이 먼저 왔다
    if (!d || d.status !== 'sent') return null;
    if (this._screenConfirms(d)) { d.workingSeen = true; this._checkScreen(d); return null; } // P184: Codex는 화면으로 본 뒤에만
    this._set(d, 'confirmed', 'term working', { confirmedAt: Date.now() });
    setImmediate(() => this.pump());
    return d;
  }
  // P184: Codex(hook 없음)는 터미널 working만으로 제출 확인하지 않는다. 시작 화면 동안 넣은 첫 요청이 입력 칸에만 남았는데
  //   Codex의 MCP 서버 시작 표시가 working으로 읽혀 확인으로 적혔다(P181). 입력 칸에 보낸 글이 없고(빈 칸 또는 다른 글) 그 위 대화에
  //   보낸 글이 보일 때만 확인한다(이유 'screen'). 입력 칸에 남아 있으면 확인하지 않고, 쉬게 되면 P79·P106 손쓰기가 Enter를 누른다.
  //   Claude Code(hook)·opencode·pi·그 밖의 종류는 그대로다
  _screenConfirms(d) {
    if (!this.inspect) return false;
    const v = this.view(d.sessionId, d) || {};
    return v.kind === 'codex' && !v.hooked;
  }
  _screenMs() { return this.cfg.screenCheckMs ?? 1500; }
  // P184: 그 세션의 맨 앞 전달이 Codex 입력 칸에 남아 아직 제출되지 않았다(마지막으로 본 화면). 그동안 끝난 "턴"(MCP 시작)은 답이 아니다
  unsubmitted(sessionId) {
    const d = this._head(sessionId);
    return !!d && d.status === 'sent' && d.screenWhy === 'in_box';
  }
  async _checkScreen(d) {
    if (d.screenChecking) return;
    d.screenChecking = true; d.screenAt = Date.now();
    try {
      const look = await this.inspect(d.sessionId, d.text).catch(() => null);
      if (d.status !== 'sent' || !this.items.has(d.deliveryId)) return;
      const box = look ? look.box : 'unknown';
      if ((box === 'empty' || box === 'other') && look.seen) {
        this._set(d, 'confirmed', 'screen', { confirmedAt: Date.now() });
        setImmediate(() => this.pump());
        return;
      }
      // 확인하지 못한 까닭(입력 칸에 남음 ours, 못 읽음 unknown, 대화에 보이지 않음)이 바뀔 때만 알린다(판 기록)
      const why = box === 'ours' ? 'in_box' : box === 'unknown' ? 'unknown' : 'not_seen';
      if (d.screenWhy !== why) { d.screenWhy = why; this.emit('screen_check', { deliveryId: d.deliveryId, sessionId: d.sessionId, box, why, working: !!d.workingSeen }); }
    } finally { d.screenChecking = false; }
  }
  // 백엔드가 꺼진 동안 제출된 지시(대화 기록)로 확인한다(C2)
  reconcile(sessionId, submittedPrompts) {
    const d = this._head(sessionId);
    if (!d || d.status !== 'sent') return;
    if (submittedPrompts.some((p) => promptMatches(d.text, p))) this._set(d, 'confirmed', 'transcript', { confirmedAt: Date.now() });
  }

  _head(sessionId) {
    let head = null;
    for (const d of this.items.values()) if (d.sessionId === sessionId && !d.parked && (!head || order(d) < order(head))) head = d; // P223: 붙잡은 요청은 차례를 쥐지 않는다
    return head;
  }
  // P172: 한 세션의 아직 끝나지 않은 전달(차례대로). P223: 붙잡은 요청은 빼고
  _ofSession(sessionId) { return [...this.items.values()].filter((d) => d.sessionId === sessionId && !d.parked).sort((a, b) => order(a) - order(b)); }

  // P172: 순서 바꾸기. ids = 그 세션의 대기 중(queued) 전달을 바랄 차례대로. 보내는 중·보낸 전달은 맨 앞 그대로 두고,
  //   대기 중 전달끼리 차례 값을 맞바꾼다(뒤에 들어온 전달은 여전히 맨 뒤). ids에 빠진 대기 중 전달은 원래 자리 순서대로 뒤에 붙인다.
  //   붙잡은(고치는 중) 전달도 자리만 옮긴다(보내지 않는 규칙은 그대로). 바뀐 전달마다 delivery 이벤트(다른 창도 그 차례를 받는다)
  reorder(ids) {
    const list = (Array.isArray(ids) ? ids : []).map(String);
    if (!list.length) throw Object.assign(new Error('no deliveries'), { code: 'bad_request' });
    const first = this.items.get(list[0]) || this.store.getDelivery(list[0]);
    if (!first) throw Object.assign(new Error('no such delivery'), { code: 'not_found' });
    const sid = first.sessionId;
    for (const id of list) {
      const d = this.items.get(id) || this.store.getDelivery(id);
      if (!d) throw Object.assign(new Error('no such delivery'), { code: 'not_found' });
      if (d.sessionId !== sid) throw Object.assign(new Error('deliveries of different sessions'), { code: 'bad_request' });
    }
    const queued = this._ofSession(sid).filter((d) => d.status === 'queued');
    const byId = new Map(queued.map((d) => [d.deliveryId, d]));
    const wanted = [...new Set(list)].filter((id) => byId.has(id)).map((id) => byId.get(id)); // 그새 보내진 전달은 빼고 남은 것끼리
    const next = [...wanted, ...queued.filter((d) => !wanted.includes(d))];
    const slots = queued.map(order); // 있던 차례 값들을 새 순서로 나눠 준다
    next.forEach((d, i) => {
      if (d.seq === slots[i]) return;
      d.seq = slots[i];
      if (this.store.updateDeliverySeq) this.store.updateDeliverySeq(d.deliveryId, d.seq);
      d.retryAt = 0; // 새 맨 앞은 물러남 없이 곧바로 본다
      this._emit(d);
    });
    setImmediate(() => this.pump());
    return { sessionId: sid, order: this._ofSession(sid).map((d) => ({ deliveryId: d.deliveryId, status: d.status, seq: d.seq })) };
  }

  // P172: 바로 보내기(스티어링). 대기 중 전달을 그 세션의 대기 중 맨 앞으로 옮기고 --now(P143)와 같은 길로 보낸다:
  //   받는 쪽이 일하는 중인 판의 Claude Code면 입력 칸에 넣어 Claude Code의 대기 메시지가 되고(typeNow + aside), 쉬면 곧바로, 잠들었으면 깨운 뒤 보낸다.
  //   일하는 중 입력을 받지 못하는 종류(hook 없는 세션, codex 등)가 일하는 중이면 cannot_steer로 거절한다(창은 단추를 끄고 까닭을 보인다).
  //   보내는 중·보낸 전달(확인을 기다림)은 앞에 둔다(확인이 섞이지 않게). 붙잡은(고치는 중) 전달은 바로 보내지 않는다(editing)
  sendNow(id) {
    const d = this.items.get(id) || this.store.getDelivery(id);
    if (!d) throw Object.assign(new Error('no such delivery'), { code: 'not_found' });
    if (d.editing) throw Object.assign(new Error('being edited'), { code: 'editing' });
    this._editable(id);
    const v = this.view(d.sessionId, d);
    if (v && v.state === 'working' && !canTypeNow(v)) throw Object.assign(new Error('this session cannot take input while working'), { code: 'cannot_steer' });
    const all = this._ofSession(d.sessionId).filter((x) => x !== d);
    const busy = all.filter((x) => x.status !== 'queued'), queued = all.filter((x) => x.status === 'queued');
    const lo = busy.length ? Math.max(...busy.map(order)) : null, hi = queued.length ? Math.min(...queued.map(order)) : null;
    const seq = hi == null ? (lo == null ? order(d) : Math.max(order(d), lo + 1)) : lo == null ? Math.min(order(d), hi - 1) : (lo + hi) / 2;
    if (seq !== d.seq) { d.seq = seq; if (this.store.updateDeliverySeq) this.store.updateDeliverySeq(d.deliveryId, seq); }
    if (!d.typeNow) {
      d.typeNow = true;
      const t = typedText(d.text);
      if (t !== d.text && t.trim()) { d.text = t; if (this.store.updateDeliveryText) this.store.updateDeliveryText(d.deliveryId, t); }
    }
    d.typeAside = true; d.sentNow = true; d.retryAt = 0; d.checkedAt = 0; d.draftLookAt = 0;
    this.emit('now', { deliveryId: d.deliveryId, sessionId: d.sessionId, state: v ? v.state : null });
    this._emit(d);
    setImmediate(() => this.pump());
    return { deliveryId: d.deliveryId, sessionId: d.sessionId, status: d.status, reason: d.reason, seq: d.seq, how: v && v.state === 'working' && !v.bgOnly ? 'type' : 'send' }; // P240: 뒤 일만 돌면 보통 보내기
  }

  // P215: 기다린 시간 나누기. 지난 pump부터 지금까지를 지난번에 본 까닭으로 센다: 앞 전달 뒤에 줄 섰거나 LONG_WAIT면 freeMs(짧은 상한에서 뺀다).
  //   고치는 중(붙잡음)은 pausedMs가 따로 센다. sent 뒤(확인 기다림)는 세지 않는다
  _account(now) {
    for (const d of this.items.values()) {
      const last = d.acctAt ?? d.createdAt;
      d.acctAt = now;
      if (d.status !== 'queued' || d.editing || d.parked) continue;
      if (d.acctFree) d.freeMs = (d.freeMs || 0) + Math.max(0, now - last);
      d.acctFree = this._head(d.sessionId) !== d || LONG_WAIT.has(d.reason);
    }
  }
  // P215: 기다림 상한. 짧은 상한(15분)은 LONG_WAIT·줄 선 시간을 빼고, 큰 상한(12시간)은 붙잡은 시간만 빼고 센다
  _overdue(d, now) {
    const waited = now - d.createdAt - (d.pausedMs || 0);
    if (waited > (this.cfg.deliveryLongWaitMs ?? 12 * 3600000)) return true;
    return waited - (d.freeMs || 0) > this.cfg.deliveryMaxWaitMs;
  }

  pump() {
    const now = Date.now();
    this._account(now);
    const sessions = new Set([...this.items.values()].map((d) => d.sessionId));
    for (const sid of sessions) {
      const d = this._head(sid);
      if (!d || d.status === 'sending') continue;
      if (d.status === 'sent') {
        if (!d.sentAt) d.sentAt = now; // 다른 길로 sentAt 없는 sent가 생겨도 여기서부터 기한을 센다
        if (d.recovering || d.screenChecking) continue;
        // P184: Codex는 보낸 뒤 screenCheckMs마다 화면을 보고 제출을 확인한다(working이 오면 곧바로도 본다)
        if (this._screenConfirms(d) && now - (d.screenAt || d.sentAt) >= this._screenMs()) { this._checkScreen(d); continue; }
        const last = d.triedAt || d.sentAt;
        // P79: 제출 확인이 늦으면 화면을 보고 Enter나 다시 보내기(최대 submitRetries번). P106: 첫 번 보기는 submitEnterMs 뒤(입력 칸에 남은 글에 Enter)
        if (this.inspect && (d.recoveries || 0) < this._retries(d) && now - last > (d.recoveries ? this._retryMs() : this._enterMs())) {
          const v = this.view(sid, d) || {};
          if (v.closed) { this._set(d, 'failed', 'session closed'); continue; }
          if (v.lastUserInputAt && now - v.lastUserInputAt < this.cfg.inputQuietMs) continue; // 사람이 치는 중이면 기다린다(규칙 4)
          if ((v.state === 'working' && !v.bgOnly) || v.state === 'waiting') continue; // P240: 뒤 일만 도는 세션은 쉬는 세션처럼 손쓴다. 이미 돌기 시작했거나 질문 중: 확인(hook)을 더 기다린다
          // P106: 아직 뜨는 중(starting·trust_wait)이면 입력 칸이 생길 때까지 기다린다. 그동안 확인 못 함으로 끝내지 않는다(최대 deliveryMaxWaitMs)
          if (['starting', 'trust_wait', 'sleeping'].includes(v.state) && now - d.sentAt < this.cfg.deliveryMaxWaitMs) continue;
          this._recover(d);
          continue;
        }
        if (now - last > this.cfg.submitConfirmMs) this._set(d, 'unconfirmed', d.recoveries ? `no UserPromptSubmit hook (${d.recoverNote || 'tried'})` : 'no UserPromptSubmit hook');
        continue;
      }
      // P158: 고치는 중이면 보내지 않는다(이 세션의 뒤 전달도 기다린다). 오래 놓지 않으면 저절로 놓는다
      if (d.editing) { if (now - d.editingAt > (this.cfg.editHoldMs ?? 600000)) this._release(d); continue; }
      if (this._overdue(d, now)) { this._set(d, 'failed', `timeout (${d.reason || 'queued'})`); continue; }
      const view = this.view(sid, d);
      const reason = blockReason(view, now, this.cfg);
      d.acctFree = LONG_WAIT.has(reason); // P215: 이번에 본 까닭으로 다음 pump까지를 센다
      if (reason === 'closed') { this._set(d, 'failed', 'session closed'); continue; }
      if (reason === 'working' && d.typeNow && this.inspect) { const v = this.view(sid, d); if (canTypeNow(v)) { this._typeNow(d, v, now); continue; } }
      if (reason) { if (d.reason !== reason) this._set(d, 'queued', reason); continue; }
      if (d.retryAt && now < d.retryAt) { this._noteStuck(d, now); continue; } // P106: 터미널이 앞 시도를 받지 않았다. 물러난 시간이 지날 때까지(또는 poke) 기다린다
      if (d.draftLookAt && now < d.draftLookAt) continue; // P128: 쓰다 만 글을 비키지 못했다. 잠시 뒤 다시 본다(사람이 보내거나 지우면 그때 보낸다)
      d.bgOnly = !!(view && view.bgOnly && view.state === 'working'); // P240: 뒤 일만 도는 세션에 보통 보내기로 넣는다(다시 보내기는 하지 않는다)
      if (d.bgOnly) this.emit('bg_only', { deliveryId: d.deliveryId, sessionId: sid });
      this._deliver(d);
    }
  }

  // P90: 일하는 중에 바로 넣기. 입력 칸을 읽어 비었을 때만(사람이 쓰던 글을 덮지 않는다) 넣는다. 화면 읽기는 typeCheckMs마다 한 번
  async _typeNow(d, v, now) {
    if (d.checking || now - (d.checkedAt || 0) < (this.cfg.typeCheckMs ?? 1500)) return;
    if (v.lastUserInputAt && now - v.lastUserInputAt < this.cfg.inputQuietMs) { if (d.reason !== 'user_typing') this._set(d, 'queued', 'user_typing'); return; } // 규칙 4
    d.checking = true; d.checkedAt = now;
    try {
      const look = await this.inspect(d.sessionId, d.text).catch(() => null);
      if (d.status !== 'queued' || d.editing || !this.items.has(d.deliveryId) || this._head(d.sessionId) !== d) return; // P158: 그새 붙잡혔다
      const box = look ? look.box : 'unknown';
      const v2 = this.view(d.sessionId, d) || {};
      // P143: --now의 전달은 쓰다 만 글(other)을 비키고 넣는다. 비키지 못하면(keep) _aside가 'draft'로 대기열에 돌려 둔다
      const aside = box === 'other' && d.typeAside && !!this.drafts;
      if ((box !== 'empty' && !aside) || !canTypeNow(v2) || (v2.lastUserInputAt && Date.now() - v2.lastUserInputAt < this.cfg.inputQuietMs)) {
        const why = box === 'other' || box === 'ours' ? 'draft' : 'working'; // 입력 칸에 글이 있다 / 못 읽었거나 상태가 바뀌었다
        if (d.reason !== why) this._set(d, 'queued', why);
        return;
      }
      await this._deliver(d, true, aside);
    } finally { d.checking = false; }
  }

  async _deliver(d, typed = false, aside = !typed) {
    d.workingSeen = false; // 앞 시도(실패) 중의 working 신호를 이 시도의 확인으로 쓰지 않는다(이슈 #1-3)
    d.typed = typed; // P90: Claude Code 대기 메시지로 넣었다(전달 기록의 이유 'typed')
    // P106: 앞 시도를 터미널이 받지 않았으면(물러남 중) 다시 보내기는 조용히 한다. 시도 수만 세고 이벤트는 쓰지 않는다(처음 한 번과 까닭이 바뀔 때만)
    const quiet = !!d.refusals || d.reason === 'draft'; // P128: 쓰다 만 글 때문에 기다리며 다시 보는 시도도 조용히 한다
    if (quiet) { d.status = 'sending'; d.attempts = (d.attempts || 0) + 1; d.updatedAt = Date.now(); this.store.updateDelivery(d.deliveryId, { status: 'sending', reason: d.reason, attempt: true }); }
    else this._set(d, 'sending', typed ? 'typed' : null, { attempt: true });
    let done;
    d.inflight = new Promise((r) => { done = r; });
    try {
      if (this.drafts && aside && !(await this._aside(d))) return; // P128: 쓰다 만 글을 비키지 못했거나 그새 사람이 쳤다(대기열로 돌아갔다)
      await this.send(d.sessionId, d.text);
      if (d.status === 'sending') { this._clearRefusal(d); this._set(d, 'sent', typed ? 'typed' : null, { sentAt: Date.now() }); }
      else if (d.status === 'cancelled') this.emit('late', { deliveryId: d.deliveryId, sessionId: d.sessionId }); // P106: 취소한 뒤에 이 시도가 들어갔다(cancelWaitMs보다 오래 걸린 시도)
      if (d.workingSeen && d.status === 'sent') { if (this._screenConfirms(d)) this._checkScreen(d); else this._set(d, 'confirmed', 'term working', { confirmedAt: Date.now() }); }
    } catch (e) {
      // 그사이 hook 등으로 confirmed가 되었거나 상태가 바뀌었으면 늦은 오류로 되돌리지 않는다(이슈 #1-2)
      if (d.status !== 'sending' || !this.items.has(d.deliveryId)) return;
      const why = REFUSED[e.code]; // 막힌 패널은 터미널이 거부한다(agent_blocked, E0 3.2)
      if (why && d.held) await this._putBack(d); // P128: 받지 않았으면 비켜 둔 글부터 되돌린다(물러나 있는 동안 사람이 볼 수 있게)
      if (why) this._refused(d, why, e.code, quiet);
      else this._set(d, 'failed', `${e.code || 'error'}: ${e.detail || e.message}`);
    } finally { d.inflight = null; done(); }
  }
  // P106: 터미널이 받지 않았다. 대기열로 되돌리고 retryDelay만큼 물러난다. 같은 까닭이 이어지면 이벤트 없이 저장만 한다
  _refused(d, why, code, quiet) {
    const now = Date.now();
    d.refusals = (d.refusals || 0) + 1;
    if (!d.refusedSince) d.refusedSince = now;
    const changed = !quiet || d.reason !== why || d.refusedCode !== code;
    d.refusedCode = code;
    const wait = retryDelay(d.refusals, this.cfg);
    d.retryAt = now + wait;
    if (!changed) { d.status = 'queued'; d.updatedAt = now; this.store.updateDelivery(d.deliveryId, { status: 'queued', reason: why }); return; }
    this._set(d, 'queued', why);
    this.emit('refused', { deliveryId: d.deliveryId, sessionId: d.sessionId, code, reason: why, n: d.refusals, waitMs: wait });
  }
  _clearRefusal(d) { d.refusals = 0; d.retryAt = 0; d.refusedSince = null; d.refusedCode = null; d.stuckNoted = false; }
  // P106: 오래 받지 않으면 한 번 알린다(백엔드가 판 이벤트 delivery_stuck을 남기고 세션 노드를 다시 그린다)
  _noteStuck(d, now) {
    if (d.stuckNoted || !d.refusedSince || now - d.refusedSince < this._stuckMs()) return;
    d.stuckNoted = true;
    this.emit('stuck', { deliveryId: d.deliveryId, sessionId: d.sessionId, reason: d.reason, code: d.refusedCode, attempts: d.attempts || 0, since: d.refusedSince });
  }

  // P184: Codex 입력 칸에 보낸 글이 남아 있으면 Enter를 더 여러 번 누른다(codexEnterRetries). 부하가 크면 Codex가 시작 직후 한동안
  //   Enter를 줄바꿈으로 받았다(입력 칸 아래 빈 줄만 늘고 30초쯤 뒤에야 제출됨). Enter는 글을 두 번 넣지 않는다
  _retries(d) {
    const n = this.cfg.submitRetries ?? 2;
    return d && d.lastBox === 'ours' && this._screenConfirms(d) ? Math.max(n, this.cfg.codexEnterRetries ?? 8) : n;
  }
  _retryMs() { return this.cfg.submitRetryMs ?? 6000; }
  _enterMs() { return Math.min(this.cfg.submitEnterMs ?? 3000, this._retryMs()); }
  _looks() { return this.cfg.submitLooks ?? 8; }
  _stuckMs() { return this.cfg.deliveryStuckMs ?? 20000; }
  // P79: 보낸 글이 제출되지 않았을 때 한 번 손쓰기. 같은 글이 두 번 들어가지 않게 다시 보내기는 한 번뿐이고,
  //   입력 칸이 비었어도 화면에 보낸 글이 보이거나(이미 들어감) 다른 hook·working을 봤으면 다시 보내지 않는다
  async _recover(d) {
    d.recovering = true;
    let action = 'none', box = null, peek = null, noise = null;
    try {
      const look = await this.inspect(d.sessionId, d.text).catch(() => null);
      if (d.status !== 'sent') return; // 그사이 확인됐다
      box = look ? look.box : 'unknown';
      peek = look && look.peek != null ? look.peek : null;
      // P106: 입력 칸을 아직 못 읽거나(뜨는 중, 다른 화면) 보낸 글이 아닌 것이 보인다(갓 뜬 화면은 붙여 넣은 글을 늦게 그린다). 손쓰기로 세지 않고 다시 본다(submitLooks번까지).
      //   다른 글에는 끝내 손대지 않는다(사람이 쓰는 글일 수 있다)
      // P126: 다른 글이 같은 모양으로 세 번 이어 보이면 늦게 그려지는 화면이 아니다. 더 기다리지 않는다(보낸 쪽이 오래 기다리지 않게)
      d.sameOther = box === 'other' && peek != null && peek === d.lastPeek ? (d.sameOther || 0) + 1 : 0;
      d.lastPeek = box === 'other' ? peek : null;
      const settled = box === 'other' && d.sameOther >= 2;
      if ((box === 'unknown' || box === 'other') && look && (d.looks || 0) < this._looks() && !settled) { d.looks = (d.looks || 0) + 1; d.lastBox = box; action = 'wait'; return; }
      const canResend = !!look && !look.noResend && !look.seen && !d.resent && !d.mismatchSeen && !d.workingSeen && !d.bgOnly; // P240: 뒤 일만 돌 때 넣은 글은 Claude Code 대기 메시지가 됐을 수 있어 다시 보내지 않는다(Enter만)
      // Enter만 이르게(submitEnterMs). 비었으면 다시 보내기는 submitRetryMs가 지난 뒤, 그리고 앞 번에도 비어 있었을 때만(hook이나 그리기가 늦을 수 있다)
      if (box === 'empty' && canResend && (Date.now() - d.sentAt < this._retryMs() || d.lastBox !== 'empty') && (d.looks || 0) < this._looks()) { d.looks = (d.looks || 0) + 1; d.lastBox = box; action = 'wait'; return; }
      d.lastBox = box;
      d.recoveries = (d.recoveries || 0) + 1;
      if (look && look.noise) noise = look.noise;
      // P126: 입력 칸 앞에 마우스 보고 글(noise)이 붙어 있어도 나머지가 보낸 글이면 Enter를 누른다. 그 글은 판의 휠이 남긴 것이라 보낸 글과 함께 제출된다
      //   (사람의 글이 아니고, 지우려면 하네스마다 다른 커서 키가 필요해 사람의 글까지 지울 수 있다. 지시가 제출되지 않는 것보다 낫다)
      if (box === 'ours' && this.pressEnter) { await this.pressEnter(d.sessionId); action = 'enter'; }
      else if (box === 'empty' && canResend) { d.resent = true; await this.send(d.sessionId, d.text); action = 'resend'; }
      else if (box === 'other') {
        // P126: 입력 칸에 보낸 글이 아닌 글이 끝까지 남았다(사람이 쓰던 글, 하네스가 보낸 글 앞에 붙인 글 등). 판은 지우지 않는다(사람의 글일 수 있다).
        //   조용히 확인 기한을 기다리지 않고 곧바로 "제출 안 됨"으로 끝내 보낸 쪽(atrium prompt, 판 칩)에 까닭을 보인다
        d.recoveries = this._retries(d); action = 'give_up';
        d.recoverNote = `${action} · ${box}`;
        this._set(d, 'unconfirmed', 'input_box_other');
        this.emit('not_submitted', { deliveryId: d.deliveryId, sessionId: d.sessionId, box, ...(peek ? { peek } : {}) });
        return;
      } else d.recoveries = this._retries(d); // 알 수 없음, 이미 들어갔을 수 있음, 다시 보내지 않는 종류: 더 손대지 않는다
      d.recoverNote = `${action}${box ? ' · ' + box : ''}${noise ? ' · noise' : ''}`;
    } catch (e) {
      action = 'error'; d.recoverNote = `error · ${e.code || e.message}`;
    } finally {
      d.triedAt = Date.now();
      d.recovering = false;
      this.emit('recover', { deliveryId: d.deliveryId, sessionId: d.sessionId, action, box, n: d.recoveries || 0, ...(peek && box !== 'ours' ? { peek } : {}), ...(noise ? { noise } : {}) }); // P106: peek(보낸 글이 아닐 때 입력 칸의 앞 60자, 판 기록에만)
    }
  }

  _set(d, status, reason, extra = {}) {
    if (status === 'confirmed' && d.held) reason = 'draft_moved';
    else if (d.sentNow && (status === 'sent' || status === 'confirmed') && (reason == null || reason === 'typed' || reason === 'term working' || reason === 'screen' || reason === 'transcript')) reason = d.typed ? 'now_typed' : 'now'; // P172: 바로 보낸 글(전달 기록의 "바로 보냄") // P128: 쓰다 만 글을 잠시 비키고 보냈다(되돌린 뒤 draft_restored 등으로 바꾼다)
    d.status = status; d.reason = reason ?? null;
    if (extra.sentAt) d.sentAt = extra.sentAt;
    if (extra.confirmedAt) d.confirmedAt = extra.confirmedAt;
    if (extra.attempt) d.attempts = (d.attempts || 0) + 1;
    d.updatedAt = Date.now();
    this.store.updateDelivery(d.deliveryId, { status, reason, ...extra });
    if (FINAL.has(status)) this.items.delete(d.deliveryId);
    this._emit(d);
    if (FINAL.has(status) && d.held) this._putBack(d).catch(() => {}); // P128: 지시가 끝났다. 비켜 둔 글을 입력 칸에 되돌린다
  }

  // P128: 보내기 직전에 입력 칸의 쓰다 만 글을 비킨다. → true(보낸다) | false(보내지 않고 대기열로 돌아갔다)
  async _aside(d) {
    const started = Date.now();
    let a;
    try { a = await this.drafts.aside(d.sessionId, d); } catch (e) { a = { state: 'clear', why: `error ${e.code || e.message}` }; }
    if (!a || a.state === 'clear') {
      d.draftLookAt = 0;
      // P135: 비키지 않고 보낸 까닭도 남긴다(입력 칸을 못 읽어 그대로 보냈는지 나중에 볼 수 있게). 손대지 않는 종류와 빈 칸으로 읽은 흔한 경우는 남기지 않는다
      //   (전달 기록에 draft 이벤트가 없으면 입력 칸을 빈 칸으로 읽고 보낸 것이다)
      if (a && a.why && a.why !== 'kind' && a.why !== 'empty') this.emit('draft', { deliveryId: d.deliveryId, sessionId: d.sessionId, phase: 'clear', why: a.why, ...(a.error ? { error: a.error } : {}) });
      return true;
    }
    if (a.state === 'moved') {
      d.held = a.held; d.draftLookAt = 0;
      this.emit('draft', { deliveryId: d.deliveryId, sessionId: d.sessionId, phase: 'aside', how: a.held.how, kind: a.held.kind, chars: a.held.text.length, rows: a.held.rows || null, from: a.held.from || null, ...(a.held.key ? { key: a.held.key } : {}), ...(a.held.exact === false ? { exact: false } : {}) });
      // 비키는 동안 사람이 쳤으면 보내지 않는다(그 글과 지시가 섞인다). 비켜 둔 글을 되돌리고 사람이 멈추기를 기다린다(규칙 4)
      const v = this.view(d.sessionId, d) || {};
      if (v.lastUserInputAt && v.lastUserInputAt >= started) { await this._putBack(d); this._backToQueue(d, 'user_typing'); return false; }
      if (d.status !== 'sending') { await this._putBack(d); return false; } // 그새 취소됐다
      return true;
    }
    // keep(P139): 입력 칸을 비우지 못했다(비우기가 먹히지 않았거나 그새 칸이 바뀌었다). 지시가 사람의 글과 함께 제출되지 않게 기다리고 다시 본다
    d.draftLookAt = Date.now() + (this.cfg.draftLookMs ?? 2000);
    if (d.draftWhy !== a.why) { d.draftWhy = a.why; this.emit('draft', { deliveryId: d.deliveryId, sessionId: d.sessionId, phase: 'keep', why: a.why, chars: a.text ? a.text.length : null, ...(a.error ? { error: a.error } : {}) }); }
    this._backToQueue(d, 'draft');
    return false;
  }
  _backToQueue(d, reason) {
    if (d.status !== 'sending') return;
    if (d.reason === reason) { d.status = 'queued'; d.updatedAt = Date.now(); this.store.updateDelivery(d.deliveryId, { status: 'queued', reason }); return; }
    this._set(d, 'queued', reason);
  }
  // P128: 비켜 둔 글을 입력 칸에 되돌린다(Enter 없음). 되돌리지 못하면 그 글을 판 기록(draft 이벤트 text)에 남긴다
  async _putBack(d) {
    const held = d.held;
    if (!held) return null;
    d.held = null;
    let r;
    try { r = await this.drafts.back(d.sessionId, held, d); } catch (e) { r = { result: held.how === 'stash' ? 'stashed' : 'held', why: `error ${e.code || e.message}` }; }
    r = r || { result: 'held' };
    this.emit('draft', { deliveryId: d.deliveryId, sessionId: d.sessionId, phase: 'back', result: r.result, by: r.by || null, why: r.why || null, how: held.how, kind: held.kind, status: d.status, chars: held.text.length, ...(r.partial ? { partial: true } : {}), ...(r.result === 'restored' && !r.partial ? {} : { text: held.text }) }); // P139: 화면에 보이던 대로 되돌린 글도 판 기록에 남긴다
    if (d.status === 'confirmed' && d.reason === 'draft_moved') {
      d.reason = r.result === 'restored' ? (r.partial ? 'draft_partial' : 'draft_restored') : r.result === 'stashed' ? 'draft_stashed' : 'draft_held';
      d.updatedAt = Date.now();
      this.store.updateDelivery(d.deliveryId, { status: d.status, reason: d.reason });
      this._emit(d);
    }
    return r;
  }
  _emit(d) { this.emit('delivery', { deliveryId: d.deliveryId, sessionId: d.sessionId, status: d.status, reason: d.reason, createdAt: d.createdAt, sentAt: d.sentAt || null, confirmedAt: d.confirmedAt || null, attempts: d.attempts || 0, chars: d.text.length, seq: d.seq ?? d.createdAt, editing: !!d.editing, ...(d.parked ? { parked: d.parked, ...(d.parkLoop ? { parkLoop: d.parkLoop } : {}) } : {}) }); } // P223: parked(멈춘 고리에 붙잡음)
}
