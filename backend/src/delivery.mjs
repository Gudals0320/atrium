// 전달 대기열(ARCH 4절 B1). 세션마다 먼저 넣은 것부터 하나씩 보낸다. 한 세션이 응답을 기다리는 동안 다른 세션은 막지 않는다(E3 2.4).
// 상태: queued(이유) → sending → sent → confirmed | unconfirmed. 그 밖에 failed(이유), cancelled.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { toLF, promptMatches } from './text.mjs';

const FINAL = new Set(['confirmed', 'unconfirmed', 'failed', 'cancelled']);

// 세션 상태로 지금 보낼 수 있는지 판단한다. 보낼 수 없으면 기다리는 이유를 돌려준다.
export function blockReason(view, now, cfg) {
  if (!view || view.closed) return 'closed';
  if (!view.herdrConnected) return 'herdr_down';
  if (view.state === 'sleeping') return 'sleeping'; // P21(D4): 판이 깨운 뒤(ready) 보낸다. 이 이유로 기다리면 백엔드가 깨운다
  if (view.state === 'starting') return 'starting'; // 규칙 3(패널이 claude를 찾기 전도 시작 중으로 본다)
  if (!view.agentPresent) return 'no_agent'; // 규칙 1: claude가 돌고 있는 패널에만
  switch (view.state) {
    case 'waiting': return 'waiting'; // 규칙 2
    case 'starting': return 'starting'; // 규칙 3
    case 'trust_wait': return 'trust_wait'; // 규칙 3
    case 'working': return 'working'; // 턴 중에는 보내지 않는다(Claude Code 자체 대기열과 섞지 않기 위해)
    case 'exited': return 'no_agent';
    default:
  }
  if (view.lastUserInputAt && now - view.lastUserInputAt < cfg.inputQuietMs) return 'user_typing'; // 규칙 4
  return null;
}

export class DeliveryQueue extends EventEmitter {
  // view(sessionId, delivery) → { state, agentPresent, herdrConnected, lastUserInputAt, closed }
  // send(sessionId, text) → Promise. herdr 오류는 code를 가진 Error로 던진다.
  // P79: inspect(sessionId, text) → { box: 'ours'|'empty'|'other'|'unknown', seen }(화면의 입력 칸), pressEnter(sessionId) → Promise.
  //   보낸 뒤 cfg.submitRetryMs 동안 제출 확인이 없으면 화면을 본다: 입력 칸에 보낸 글이 그대로면 Enter, 비었고 들어간 흔적도 없으면 한 번 다시 보낸다.
  //   다른 글이 있거나(사람이 쓰는 중) 알 수 없으면 손대지 않는다. 사람이 3초 안에 친 터미널은 기다린다(B1 규칙 4). 둘 다 없으면 전처럼 기다리기만 한다
  constructor({ store, cfg, view, send, inspect = null, pressEnter = null }) {
    super();
    this.store = store; this.cfg = cfg; this.view = view; this.send = send; this.inspect = inspect; this.pressEnter = pressEnter;
    this.items = new Map();
    for (const d of store.activeDeliveries()) {
      // 백엔드가 보내는 중에 꺼졌다면 들어갔는지 모른다 → sent로 보고 확인을 기다린다(C2에서 대화 기록으로 맞춘다)
      // sentAt이 없으면 확인 기한을 셀 수 없어 영영 sent로 남는다 → 복구 시각을 넣는다(이슈 #1-1)
      if (d.status === 'sending') d.status = 'sent';
      if (d.status === 'sent' && !d.sentAt) { d.sentAt = Date.now(); store.updateDelivery(d.deliveryId, { status: 'sent', reason: d.reason ?? null, sentAt: d.sentAt }); }
      this.items.set(d.deliveryId, d);
    }
  }
  start() { this.timer = setInterval(() => this.pump(), 500); }
  stop() { clearInterval(this.timer); }

  enqueue(sessionId, text) {
    const d = { deliveryId: 'd' + crypto.randomBytes(5).toString('hex'), sessionId, text: toLF(text), status: 'queued', reason: null, createdAt: Date.now(), attempts: 0 };
    this.store.insertDelivery(d);
    this.items.set(d.deliveryId, d);
    this._emit(d);
    setImmediate(() => this.pump());
    return d;
  }
  cancel(id) {
    const d = this.items.get(id) || this.store.getDelivery(id);
    if (!d) throw Object.assign(new Error('no such delivery'), { code: 'not_found' });
    if (d.status !== 'queued') throw Object.assign(new Error(`cannot cancel: ${d.status}`), { code: 'not_cancellable' });
    this._set(d, 'cancelled', 'user');
    return d;
  }
  cancelSession(sessionId, reason) { for (const d of this.items.values()) if (d.sessionId === sessionId && d.status === 'queued') this._set(d, 'cancelled', reason); }
  pending(sessionId) { let n = 0; for (const d of this.items.values()) if (d.sessionId === sessionId) n++; return n; }
  list(sessionId) { return [...this.items.values()].filter((d) => !sessionId || d.sessionId === sessionId); }

  // B1 규칙 6: hook UserPromptSubmit이 오면 맞춰 보고 "제출 확인"
  onUserPromptSubmit(sessionId, prompt) {
    const d = this._head(sessionId);
    if (!d || (d.status !== 'sending' && d.status !== 'sent')) return null;
    if (promptMatches(d.text, prompt)) { this._set(d, 'confirmed', null, { confirmedAt: Date.now() }); setImmediate(() => this.pump()); return d; }
    d.mismatchSeen = true;
    return null;
  }
  // hook이 없는 세션(판에 올린 에이전트, Claude Code가 아닌 종류)은 보낸 뒤 herdr가 working이 되면 제출 확인으로 친다(P4)
  onAgentWorking(sessionId) {
    const d = this._head(sessionId);
    if (d && d.status === 'sending') { d.workingSeen = true; return null; } // agent.prompt 응답보다 working이 먼저 왔다
    if (!d || d.status !== 'sent') return null;
    this._set(d, 'confirmed', 'herdr working', { confirmedAt: Date.now() });
    setImmediate(() => this.pump());
    return d;
  }
  // 백엔드가 꺼진 동안 제출된 지시(대화 기록)로 확인한다(C2)
  reconcile(sessionId, submittedPrompts) {
    const d = this._head(sessionId);
    if (!d || d.status !== 'sent') return;
    if (submittedPrompts.some((p) => promptMatches(d.text, p))) this._set(d, 'confirmed', 'transcript', { confirmedAt: Date.now() });
  }

  _head(sessionId) {
    let head = null;
    for (const d of this.items.values()) if (d.sessionId === sessionId && (!head || d.createdAt < head.createdAt)) head = d;
    return head;
  }

  pump() {
    const now = Date.now();
    const sessions = new Set([...this.items.values()].map((d) => d.sessionId));
    for (const sid of sessions) {
      const d = this._head(sid);
      if (!d || d.status === 'sending') continue;
      if (d.status === 'sent') {
        if (!d.sentAt) d.sentAt = now; // 다른 길로 sentAt 없는 sent가 생겨도 여기서부터 기한을 센다
        if (d.recovering) continue;
        const last = d.triedAt || d.sentAt;
        // P79: 제출 확인이 늦으면 화면을 보고 Enter나 다시 보내기(최대 submitRetries번)
        if (this.inspect && (d.recoveries || 0) < this._retries() && now - last > this._retryMs()) {
          const v = this.view(sid, d) || {};
          if (v.closed) { this._set(d, 'failed', 'session closed'); continue; }
          if (v.lastUserInputAt && now - v.lastUserInputAt < this.cfg.inputQuietMs) continue; // 사람이 치는 중이면 기다린다(규칙 4)
          if (v.state === 'working' || v.state === 'waiting') continue; // 이미 돌기 시작했거나 질문 중: 확인(hook)을 더 기다린다
          this._recover(d);
          continue;
        }
        if (now - last > this.cfg.submitConfirmMs) this._set(d, 'unconfirmed', d.recoveries ? `no UserPromptSubmit hook (${d.recoverNote || 'tried'})` : 'no UserPromptSubmit hook');
        continue;
      }
      if (now - d.createdAt > this.cfg.deliveryMaxWaitMs) { this._set(d, 'failed', `timeout (${d.reason || 'queued'})`); continue; }
      const reason = blockReason(this.view(sid, d), now, this.cfg);
      if (reason === 'closed') { this._set(d, 'failed', 'session closed'); continue; }
      if (reason) { if (d.reason !== reason) this._set(d, 'queued', reason); continue; }
      this._deliver(d);
    }
  }

  async _deliver(d) {
    d.workingSeen = false; // 앞 시도(실패) 중의 working 신호를 이 시도의 확인으로 쓰지 않는다(이슈 #1-3)
    this._set(d, 'sending', null, { attempt: true });
    try {
      await this.send(d.sessionId, d.text);
      if (d.status === 'sending') this._set(d, 'sent', null, { sentAt: Date.now() });
      if (d.workingSeen && d.status === 'sent') this._set(d, 'confirmed', 'herdr working', { confirmedAt: Date.now() });
    } catch (e) {
      // 그사이 hook 등으로 confirmed가 되었거나 상태가 바뀌었으면 늦은 오류로 되돌리지 않는다(이슈 #1-2)
      if (d.status !== 'sending' || !this.items.has(d.deliveryId)) return;
      if (e.code === 'agent_blocked') this._set(d, 'queued', 'waiting'); // 막힌 패널은 herdr가 거부한다(E0 3.2)
      else if (e.code === 'agent_not_found' || e.code === 'agent_not_ready') this._set(d, 'queued', 'no_agent');
      else if (e.code === 'unreachable') this._set(d, 'queued', 'herdr_down');
      else this._set(d, 'failed', `${e.code || 'error'}: ${e.herdrMessage || e.message}`);
    }
  }

  _retries() { return this.cfg.submitRetries ?? 2; }
  _retryMs() { return this.cfg.submitRetryMs ?? 6000; }
  // P79: 보낸 글이 제출되지 않았을 때 한 번 손쓰기. 같은 글이 두 번 들어가지 않게 다시 보내기는 한 번뿐이고,
  //   입력 칸이 비었어도 화면에 보낸 글이 보이거나(이미 들어감) 다른 hook·working을 봤으면 다시 보내지 않는다
  async _recover(d) {
    d.recovering = true;
    let action = 'none', box = null;
    try {
      const look = await this.inspect(d.sessionId, d.text).catch(() => null);
      if (d.status !== 'sent') return; // 그사이 확인됐다
      box = look ? look.box : 'unknown';
      d.recoveries = (d.recoveries || 0) + 1;
      if (box === 'ours' && this.pressEnter) { await this.pressEnter(d.sessionId); action = 'enter'; }
      else if (box === 'empty' && !look.seen && !d.resent && !d.mismatchSeen && !d.workingSeen) { d.resent = true; await this.send(d.sessionId, d.text); action = 'resend'; }
      else d.recoveries = this._retries(); // 다른 글, 알 수 없음, 이미 들어갔을 수 있음: 더 손대지 않는다
      d.recoverNote = `${action}${box ? ' · ' + box : ''}`;
    } catch (e) {
      action = 'error'; d.recoverNote = `error · ${e.code || e.message}`;
    } finally {
      d.triedAt = Date.now();
      d.recovering = false;
      this.emit('recover', { deliveryId: d.deliveryId, sessionId: d.sessionId, action, box, n: d.recoveries || 0 });
    }
  }

  _set(d, status, reason, extra = {}) {
    d.status = status; d.reason = reason ?? null;
    if (extra.sentAt) d.sentAt = extra.sentAt;
    if (extra.confirmedAt) d.confirmedAt = extra.confirmedAt;
    if (extra.attempt) d.attempts = (d.attempts || 0) + 1;
    d.updatedAt = Date.now();
    this.store.updateDelivery(d.deliveryId, { status, reason, ...extra });
    if (FINAL.has(status)) this.items.delete(d.deliveryId);
    this._emit(d);
  }
  _emit(d) { this.emit('delivery', { deliveryId: d.deliveryId, sessionId: d.sessionId, status: d.status, reason: d.reason, createdAt: d.createdAt, sentAt: d.sentAt || null, confirmedAt: d.confirmedAt || null, attempts: d.attempts || 0, chars: d.text.length }); }
}
