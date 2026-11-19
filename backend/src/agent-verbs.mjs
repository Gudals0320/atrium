// P116: 에이전트끼리 일 시키기(atrium prompt | wait | read, ARCH 4절 F1·K). 판이 띄운 세션이 세션 토큰으로 /branch/prompt, /branch/turn, /branch/read를 부른다.
// 터미널 백엔드와 상관없다. 판은 자기 전달 대기열(B1)과 세션 상태, 어댑터의 readScreen만 쓴다.
// - prompt: 판의 전달 규칙(B1 대기열: claude가 도는 패널, 응답 필요·막힘·시작 중이면 기다림, 사람이 3초 안에 친 터미널은 기다림, 제출 확인)으로 넣는다.
//   잠든 세션(D4·P111)은 대기열에 넣으면 판이 깨운 뒤 넣는다. --wait면 그 글로 시작한 턴이 끝날 때까지 기다려 마지막 답을 돌려준다.
// - wait: 받는 세션의 지금 턴(또는 대기열에 든 글로 시작할 턴)이 끝날 때까지. 판의 상태(working → ready·error)로 보고, 끝나면 마지막 답을 준다
//   (Claude Code는 Stop hook의 답, 다른 종류는 턴이 끝날 때 화면에서 고른 답, F5). 사람의 답을 기다리면(waiting) 바로 돌려준다.
// - read: 받는 세션 화면의 최근 줄(recent_unwrapped). 패널이 없으면(잠듦) 마지막 답.
// - 연결과 오간 기록(F1·F2): 판을 거치므로 보낸 세션 → 받는 세션의 연결, 지시(prompt), 받은 답(reply), 기다린 결과(wait_result)를 판이 바로 남긴다.
//   받는 쪽 상태 변화(target_working·target_done)는 backend.onLinkTargetState가 openPromptFrom으로 붙인다.
// - 이름: 같은 판의 세션 이름(@ 없이도, 판의 이름과 주소). 없으면 not_found와 비슷한 이름(candidates), 닫힌 세션이면 closed.
import { deriveState } from './state.mjs';
import { findSession, shownName } from './session-label.mjs';
import { screenAnswerText, tailText } from './links.mjs';
import { clip } from './text.mjs';
import { checkAgentText } from './work-units.mjs'; // P180
import { talkText } from './rig-loops.mjs'; // P237: 회 밖 글의 판 알림 머리

export const WAIT_DEFAULT_MS = 100000; // 한 번에 기다리는 기본(Claude Code Bash 도구의 기본 시간 제한 2분 안쪽). 더 길면 --timeout
export const WAIT_MAX_MS = 60 * 60 * 1000;
export const PROMPT_SETTLE_MS = 30000; // --wait 없는 prompt가 글이 들어가기(제출 확인)를 기다리는 시간. 잠든 세션을 깨우는 시간을 담는다
export const READ_LINES = 80;
export const READ_MAX_LINES = 2000;
const TEXT_MAX = 100000; // 보낼 글의 길이(판 대기열과 터미널에 한 번에 넣는 글)
const ANSWER_MAX = 16000; // 돌려주는 마지막 답의 길이
const TURN_GRACE_MS = 10000; // 글이 들어간 뒤 그 턴의 시작(UserPromptSubmit·working)이 보이기까지 기다리는 시간
const ANSWER_GRACE_MS = 5000; // 턴이 끝난 뒤 답(Stop hook, 화면 답)이 오기까지 기다리는 시간
// 오래 걸릴 수 있는 대기 이유(--wait 없는 prompt는 이 이유면 바로 돌려준다): 받는 쪽이 일하는 중, 사람의 답을 기다림, 사람이 치는 중
const LONG_REASONS = new Set(['working', 'waiting', 'trust_wait', 'user_typing', 'draft']);
const FINAL = new Set(['confirmed', 'unconfirmed', 'failed', 'cancelled']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const clamp = (n, lo, hi, dflt) => { const v = Number(n); return Number.isFinite(v) && v > 0 ? Math.min(Math.max(Math.round(v), lo), hi) : dflt; };
// 부른 명령이 답을 받기 전에 끊겼는가(셸 도구의 시간 제한 등). 끊겼으면 기다리기를 그만둔다
function watchGone(res) {
  if (!res || typeof res.once !== 'function') return () => false;
  let gone = false;
  res.once('close', () => { if (!res.writableFinished) gone = true; });
  return () => gone;
}

// 두 글의 편집 거리(비슷한 이름 찾기)
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// 찾지 못한 이름과 비슷한 판의 이름(대소문자 무시: 서로 포함하면 먼저, 다음은 편집 거리가 짧은 것). 최대 max개
export function similarNames(ref, names, max = 3) {
  const q = String(ref || '').toLowerCase();
  if (!q) return [];
  const out = [];
  for (const n of new Set(names.filter(Boolean))) {
    const k = String(n).toLowerCase();
    let score = null;
    if (k.includes(q) || q.includes(k)) score = Math.abs(k.length - q.length) / 100;
    else { const d = lev(q, k); if (d <= Math.max(2, Math.floor(q.length / 3))) score = 1 + d; }
    if (score != null) out.push([score, n]);
  }
  return out.sort((a, b) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1]))).slice(0, max).map((x) => x[1]);
}

// 화면 글: 줄 끝 공백을 떼고, 빈 줄이 이어지면 하나로, 앞뒤 빈 줄을 빼고 끝 n줄
export function compactLines(text, n) {
  const out = [];
  for (const l of String(text ?? '').split(/\r?\n/).map((x) => x.replace(/\s+$/, ''))) {
    if (!l && (!out.length || !out[out.length - 1])) continue;
    out.push(l);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  const tail = out.slice(-n);
  while (tail.length && !tail[0]) tail.shift();
  return tail.join('\n');
}

// 다음에 칠 명령(사람과 모델이 그대로 친다). 이름은 판의 주소(바뀌지 않는다)
export const verbLines = (name) => ({ prompt: `atrium prompt ${name} "<할 일>" --wait`, wait: `atrium wait ${name}`, read: `atrium read ${name}` });

export class AgentVerbs {
  // b: 백엔드(sessions, store, queue, summary, hooked, ensureLink, linkEvent, adapter, sleeper, log). branch: Branch(잠듦 판정)
  constructor(b, branch, { pollMs = 200, settleMs = PROMPT_SETTLE_MS, turnGraceMs = TURN_GRACE_MS, answerGraceMs = ANSWER_GRACE_MS } = {}) {
    this.b = b; this.branch = branch; this.pollMs = pollMs; this.settleMs = settleMs; this.turnGraceMs = turnGraceMs; this.answerGraceMs = answerGraceMs;
    this.sent = new Map(); // `${보낸 세션}>${받는 세션}` → 마지막으로 보낸 전달 ID(atrium wait가 그 글의 턴을 기다린다)
    this.pendingLinks = new Map(); // 전달 ID → { linkId, to, text }(들어가면 받는 쪽 openPromptFrom으로)
    // P180: 판이 붙잡아 둔 일을 나중에 넣을 때도 atrium prompt처럼 연결과 기다림을 잇는다
    if (branch && branch.units) branch.units.onDispatch = (unit, d) => {
      const from = b.sessions.get(unit.from); const t = b.sessions.get(unit.to);
      if (!from || !t) return;
      const l = this.link(from, t);
      b.linkEvent(l, 'prompt', unit.spec, { via: 'atrium', deliveryId: d.deliveryId, tag: 'assign', unitId: unit.id, later: true });
      this.pendingLinks.set(d.deliveryId, { linkId: l.linkId, to: t.sessionId, text: unit.spec });
      this.noteSent(from, t, d.deliveryId);
    };
  }
  units() { return this.branch && this.branch.units ? this.branch.units : null; }
  // 보낸 세션의 마지막 글(atrium prompt, atrium child --prompt의 첫 요청, atrium wake --prompt). atrium wait가 그 글의 턴을 기다린다
  noteSent(caller, t, deliveryId) {
    this.sent.set(`${caller.sessionId}>${t.sessionId}`, deliveryId);
    if (this.sent.size > 2000) this.sent.delete(this.sent.keys().next().value);
  }
  // 전달이 끝났다(Branch.onDeliveryEnd가 부른다). 들어갔으면 받는 쪽의 지금 지시로 두고(target_working·target_done이 이 연결에 붙는다), 못 들어갔으면 그 사실을 남긴다
  onDeliveryEnd(d) {
    const p = this.pendingLinks.get(d.deliveryId);
    if (!p) return;
    this.pendingLinks.delete(d.deliveryId);
    const b = this.b;
    const l = b.store.getLink(p.linkId);
    const t = b.sessions.get(p.to);
    if (!l) return;
    if (d.status !== 'confirmed' || !t) { b.linkEvent(l, 'prompt_result', null, { via: 'atrium', deliveryId: d.deliveryId, ok: false, status: d.status, reason: d.reason || null }, { quiet: true }); return; }
    const working = deriveState(t.rt).state === 'working'; // hook 없는 종류는 터미널 상태 working이 곧 제출 확인이다(그 상태 이벤트는 이미 지나갔다)
    t.openPromptFrom = { linkId: l.linkId, at: Date.now(), text: p.text, submitted: true, working };
    b.linkEvent(l, 'target_submitted', null, { via: 'atrium', deliveryId: d.deliveryId, matches: true }, { quiet: true });
    if (working) b.linkEvent(l, 'target_working', null, { from: 'ready' }, { quiet: true });
  }

  // ---------- 이름 풀기 ----------
  target(caller, ref) {
    const b = this.b;
    const r = String(ref ?? '').trim().replace(/^@/, '');
    if (!r) throw apiError('bad_request', '받을 세션 이름을 주세요. 예: atrium prompt w1 "<할 일>"');
    const open = [...b.sessions.values()];
    const t = findSession(open, r) || open.find((x) => x.agentName === r || x.paneId === r) || null;
    if (!t) {
      const closed = b.store.closedSessions ? findSession(b.store.closedSessions(), r) : null;
      if (closed) throw apiError('closed', `@${shownName(closed) || r}는 닫힌 세션이다(보드에서 끝났거나 꺼졌다). 보낼 수 없다. 지금 연결: atrium me`);
      const off = this.rigSeatMiss(caller, r); // P195: 꺼졌거나 잘못된 rig의 자리 이름이면 비슷한 이름 대신 그 까닭
      if (off) throw off;
      const names = open.filter((x) => x !== caller && (x.kind || 'claude') !== 'shell').flatMap((x) => [shownName(x), x.name]);
      const near = similarNames(r, names);
      throw apiError('not_found', `보드(${b.cfg.terminalSession})에서 세션을 찾을 수 없다: ${r}.${near.length ? ` 비슷한 이름: ${near.map((n) => '@' + n).join(', ')}.` : ''} 이름은 보드의 세션 이름이다(@ 없이도 된다). 지금 연결: atrium me`, { candidates: near });
    }
    if (t === caller) throw apiError('self', '자기 자신에게는 보낼 수 없다. 다른 세션의 이름을 준다.');
    if ((t.kind || 'claude') === 'shell') throw apiError('not_agent', `@${shownName(t)}는 일반 셸이다. atrium prompt|wait|read는 에이전트 세션에만 된다.`);
    return t;
  }

  // P195: 보내는 세션의 워크스페이스 rig 정의에 그 이름의 자리가 있는데 rig가 꺼졌거나 잘못되어 자리가 살아 있지 않다 → 오류(rig_off) | null
  //   (rig-try 보고: 꺼진 rig에서 atrium prompt worker가 not_found와 엉뚱한 비슷한 이름을 돌려줬다)
  rigSeatMiss(caller, ref) {
    const rig = this.b.rig;
    const key = caller && caller.workspaceKey;
    if (!rig || !key || !rig.seatNamesLoose) return null;
    const seat = rig.seatNamesLoose(key).find((n) => n === String(ref).toLowerCase());
    if (!seat) return null;
    const r = rig.read(key);
    const on = rig.enabled(key);
    if (on && r.def) return null; // 켜졌고 쓸 정의가 있다(잘못된 새 정의면 마지막 맞은 것): 자리 세션의 보내기는 rig 흐름이 다룬다
    const state = !on ? 'rig가 꺼져 있다' : `rig 정의가 잘못되어 쓰이지 않는다(까닭: ${r.invalid || '?'})`;
    const why = !on && r.invalid ? ` 정의도 잘못되어 있다(까닭: ${r.invalid}).` : '';
    return apiError('rig_off', `${state}.${why} ${seat}는 이 워크스페이스 rig의 자리 이름이라 지금 받을 세션이 없다. rig 켜기와 고치기는 사람이 보드에서 한다(에이전트는 켜지 못한다). 지금 rig 상태: atrium guide`, { seat, rig: on ? 'invalid' : 'off' });
  }

  asleep(t) { return this.branch.asleep(t); }
  state(t) { return this.b.sessions.has(t.sessionId) ? this.b.summary(t).state : 'closed'; }
  head(t) { return { name: shownName(t), address: t.name, agentName: t.agentName, kind: t.kind || 'claude' }; }
  answerOf(t) {
    const rt = t.rt || {};
    if (!rt.lastAnswer) return null;
    const text = String(rt.lastAnswer);
    return { text: text.length > ANSWER_MAX ? text.slice(0, ANSWER_MAX) : text, clipped: text.length > ANSWER_MAX, source: rt.answerSource || (this.b.hooked(t) ? 'hook' : 'screen'), at: rt.lastAnswerAt || null };
  }
  // P171: 보내기(prompt)의 연결. 일 관계(계보·역할 선·명시한 하위·동료)가 있는 쌍이면 영구, 없거나 독립이면 일시 연결(temp-links.mjs)
  link(caller, t) {
    const rel = this.branch && this.branch.relationBetween ? this.branch.relationBetween(caller.sessionId, t.sessionId) : null;
    const work = !!rel && rel.relation !== 'none';
    return this.b.ensureLink(caller.sessionId, t.sessionId, work ? { observed: true } : { observed: true, transient: true });
  }
  // P171: 읽기·기다리기는 선을 새로 만들지 않는다. 열린 연결(어느 방향이든 보낸 쪽 → 받는 쪽 먼저)이 있을 때만 기록을 붙인다
  openLink(caller, t) {
    const s = this.b.store;
    for (const [x, y] of [[caller.sessionId, t.sessionId], [t.sessionId, caller.sessionId]]) { const l = s.linkByPair(x, y); if (l && !l.removedAt) return l; }
    return null;
  }

  // ---------- atrium prompt <이름> "<글>" [--wait | --now] [--timeout ms] ----------
  // P143: --now면 받는 쪽이 판이 띄운 Claude Code(hook 있음)이고 일하는 중일 때 기다리지 않고 Claude Code의 대기 메시지로 바로 넣는다(P90 typeNow 길).
  //   그 밖(쉬는 중, 다른 종류, 응답 필요, 시작 중, 잠듦)은 B1 그대로다. 턴을 새로 만들지 않아 짝지을 답이 없으므로 --wait와 함께 쓰지 않는다
  // P248: --steer(steer)는 --now의 뜻이 보이는 이름이다(같은 길). 기본은 대기열
  async prompt(caller, o = {}, res = null) {
    const b = this.b;
    if (o.steer) o = { ...o, now: true };
    if (o.now && o.wait) throw apiError('bad_request', '--steer·--now와 --wait는 함께 쓸 수 없다. --now는 받는 쪽의 지금 턴에 대기 메시지로 넣어 그 글로 시작하는 턴이 없다(짝지을 답이 없다). 답을 받으려면 --wait만, 일하는 중에도 바로 알리려면 --now만 준다.');
    // P220(rig 2 R3): rig 제작 세션(빌더)은 그 워크스페이스의 자리 세션에 글을 보내지 않는다(rig-setup.mjs guardPrompt)
    if (b.rigSetup) b.rigSetup.guardPrompt(caller, o.name, this);
    // P185: rig 자리 세션의 보내기는 정의가 정한다(assign 줄 → 일, may → 글만, 그 밖 거절 rig_refused). 자리 없는 세션·꺼진 rig는 null(옛 그대로)
    const flow = this.branch && this.branch.flow ? this.branch.flow : null;
    const fp = flow ? flow.planPrompt(caller, o, this) : null;
    // P194: --case는 rig 자리 세션이 자리에 일을 맡길 때만(이을 건을 고른다)
    if (o.caseId != null && String(o.caseId).trim() && !(fp && fp.kind === 'unit')) throw apiError('bad_request', '--case는 rig 자리 세션이 자리에 일을 맡길 때만 쓴다(이을 건을 고른다). 이 보내기는 건의 일을 만들지 않는다.');
    // P237(rig2-design 11.18의 둘째): --talk는 rig 밖 세션이 rig 자리에 회 없이 글만 넣는 길이다. 같은 rig의 자리끼리는 정의의 흐름으로 보낸다
    if (o.talk && fp && !fp.outside) throw apiError('bad_request', '--talk는 rig 밖 세션이 rig 자리에 회 없이 글만 넣는 길이다. 같은 rig의 자리끼리는 정의의 흐름(flow·may)으로 보낸다(--talk 없이).');
    let t = fp ? fp.t : this.target(caller, o.name);
    let text = o.text == null ? '' : String(o.text);
    if (!text.trim()) throw apiError('bad_request', '보낼 글을 주세요: atrium prompt <이름> "<할 일>"');
    if (text.length > TEXT_MAX) throw apiError('bad_request', `글이 너무 길다(${text.length}자, ${TEXT_MAX}자까지). 파일에 쓰고 그 경로를 보낸다.`);
    checkAgentText(text); // P180: 판 알림 머리로 시작할 수 없다
    // P237: 받는 쪽이 켜진 rig의 자리면 회를 열지 않고 일도 만들지 않는다(열린 시도가 있으면 rig_run_open). rig 밖 세션이면 null(보통 prompt)
    const tk = o.talk && !fp && flow && flow.loops ? flow.loops.talkCheck(t) : null;
    // P182: 받는 쪽 워크스페이스 rig의 deliver 훅(큐에 넣기 전). 거절이면 넣지 않고 종료 코드 1과 까닭. 앞머리(일 머리)는 고친 글 앞에 붙는다
    // P185: 아직 앉은 세션이 없는 자리로 보내면 훅 입력의 session은 그 자리(이름 = 자리, id 없음)이고, 거절이면 띄우지 않는다
    if (b.rig) {
      const target = t || { workspaceKey: fp.ctx.key, name: fp.seatName, kind: null, model: null, cwd: fp.ctx.r.root };
      const h = await b.rig.deliver({ target, workspaceKey: target.workspaceKey, from: { kind: 'agent', session: caller }, text });
      if (h.action === 'reject') throw apiError('rig_rejected', `rig의 deliver 훅이 글을 거절했다(${t ? `@${shownName(t)}` : `${fp.seatName} 자리`}에게 넣지 않았다): ${h.reason}`);
      text = h.text;
    }
    // P180: 일 하위에게 가는 글은 일 단위(머리를 붙인다). 자기에게서 열린 시도를 가진 하위에게는 이어지는 지시(보통 글). --now·동료·독립은 옛 그대로
    const U = this.units();
    let plan, made = null, caseInfo = null;
    if (fp && fp.kind === 'unit') {
      // P185: 자리로 맡기기. 보낸 세션이 쥔 건을 잇거나 새 건을 연다. keep은 앉은 세션(없으면 띄움), fresh는 새 세션(max_live면 자리 줄)
      const c = flow.caseFor(caller, fp.ctx.key, { caseId: o.caseId != null && String(o.caseId).trim() ? String(o.caseId).trim() : null, spec: text }); // P194: --case. P221: 새 회면 글의 첫 줄이 회 이름
      const a = await flow.assign({ ctx: fp.ctx, c, by: caller, seatName: fp.seatName, t: fp.t, spec: text, origin: 'prompt' });
      caseInfo = { caseId: c.id, seat: fp.seatName };
      if (a.seatWait) {
        b.store.addEvent(caller.sessionId, 'atrium_prompt', { target: fp.seatName, sessionId: null, deliveryId: null, unitId: a.unit.id, held: true, seatWait: true, chars: text.length, wait: !!o.wait });
        return { name: fp.seatName, address: null, agentName: null, kind: null, deliveryId: null, woke: false, tag: 'assign', unit: { id: a.unit.id, kind: 'new', held: true, seatWait: true, ahead: a.ahead, ...caseInfo }, state: null, delivery: { status: 'queued', reason: 'seat_full' }, turn: null, next: null };
      }
      t = a.t; made = a.made; plan = { kind: 'unit' };
    } else if (fp && fp.kind === 'followup') plan = { kind: 'followup', tryRow: fp.tryRow, unit: fp.unit };
    else if (fp) plan = { kind: 'plain' };
    else if (tk) plan = { kind: 'plain' }; // P237: 회 없이 글만(done이 필요 없다)
    else plan = U ? U.plan(caller, t, { now: !!o.now }) : { kind: 'plain' };
    // P221(rig 2 R2): rig 밖 세션이 request 고리의 입구 자리 세션에 보낸 글은 새 회를 연다(입구 세션이 그 고리의 회를 쥐었으면 이어지는 지시, 고리가 멈췄으면 요청이 줄에 선다)
    if (!fp && !tk && !o.now && flow && flow.loops && plan.kind !== 'followup' && t.rigSeat && !(caller.rigSeat && caller.workspaceKey === t.workspaceKey)) {
      const rq = flow.loops.onRequest(t, { kind: 'agent', session: caller }, text);
      if (rq && rq.held) {
        const pd = rq.d ? rq.d.deliveryId : null; // P223: 대기열에 붙잡은 전달
        b.store.addEvent(caller.sessionId, 'atrium_prompt', { target: t.name, sessionId: t.sessionId, deliveryId: pd, held: true, loopPaused: rq.loop, chars: text.length });
        return { ...this.head(t), deliveryId: pd, woke: false, tag: null, unit: null, loop: { name: rq.loop, paused: true, held: rq.id }, delivery: { status: 'queued', reason: 'loop_paused' }, state: null, turn: null, next: null };
      }
      if (rq) { made = rq.made; plan = { kind: 'unit' }; caseInfo = { caseId: rq.caseId, seat: t.rigSeat, loop: rq.loop, name: rq.name }; }
    }
    const woke = this.asleep(t);
    if (!made && plan.kind === 'unit') made = U.create(caller, t, text, 'prompt');
    if (made && made.held) return this.heldPrompt(caller, t, made, o, res, woke, caseInfo);
    const d = made ? made.d : b.queue.enqueue(t.sessionId, tk ? talkText(text) : text, { ...(o.now ? { typeNow: true, aside: true } : {}), origin: { kind: 'agent', session: caller.sessionId } }); // B1 규칙(대기열이 줄바꿈을 LF로 맞춘다). 잠든 세션이면 대기열이 판의 깨우기를 부른다
    if (tk) { d.talk = true; flow.loops.noteTalk(t, tk, { kind: 'agent', session: caller }, d.deliveryId); } // P237: 회 밖 글(받는 자리의 권한 판정이 회의 글로 보지 않는다)
    if (plan.kind === 'followup') U.noteFollowup(plan.tryRow, caller, d.deliveryId, { now: !!o.now });
    const unitOut = made ? { id: made.unit.id, kind: 'new', held: false, ...(caseInfo || {}) } : plan.kind === 'followup' ? { id: plan.unit.id, kind: 'followup' } : null;
    const l = this.link(caller, t);
    // P156: 두 세션의 일 관계로 본 꼬리표(assign 위 → 하위 지시, report 하위 → 위 보고, share 동료끼리). 선·Thread가 보고와 공유를 가른다
    const tag = this.branch && this.branch.promptTagOf ? this.branch.promptTagOf(caller.sessionId, t.sessionId) : null;
    b.linkEvent(l, 'prompt', text, { via: 'atrium', deliveryId: d.deliveryId, wait: !!o.wait, ...(o.now ? { now: true } : {}), ...(tk ? { talk: true } : {}), ...(tag ? { tag } : {}), ...(unitOut ? { unitId: unitOut.id, unitKind: unitOut.kind } : {}) });
    // 받는 쪽 상태(일하는 중, 끝남)는 이 글이 실제로 들어갈 때 이 지시의 기록에 붙인다(onDeliveryEnd). 대기열에 여럿이 쌓여도 들어간 순서대로 붙는다
    this.pendingLinks.set(d.deliveryId, { linkId: l.linkId, to: t.sessionId, text });
    this.noteSent(caller, t, d.deliveryId);
    b.store.addEvent(caller.sessionId, 'atrium_prompt', { target: t.name, sessionId: t.sessionId, deliveryId: d.deliveryId, chars: text.length, wait: !!o.wait, ...(o.now ? { now: true } : {}), ...(tk ? { talk: true } : {}), woke });
    if (woke && b.sleeper && b.sleeper.wakeFor) b.sleeper.wakeFor(t, `atrium:${caller.name}`).catch(() => {}); // 대기열도 깨우지만 여기서 먼저 부른다(같은 깨우기로 묶인다)
    b.log(`atrium prompt ${caller.name} → ${t.name} (${d.deliveryId}${o.wait ? ', wait' : ''}${o.now ? ', now' : ''}${tk ? ', talk' : ''}${woke ? ', woke' : ''})`);
    const out = { ...this.head(t), deliveryId: d.deliveryId, woke, tag, unit: unitOut, ...(tk ? { talk: { seat: tk.seat, loop: tk.loop } } : {}), next: verbLines(t.name) };
    if (o.wait) {
      const turn = await this.waitTurn(caller, t, { deliveryId: d.deliveryId, timeoutMs: o.timeoutMs, res });
      const row = b.store.getDelivery(d.deliveryId) || {};
      return { ...out, state: turn.state, delivery: { status: row.status || d.status, reason: row.reason ?? null }, turn };
    }
    const row = await this.settle(d.deliveryId, res);
    // P143: how — typed(일하는 중이라 Claude Code 대기 메시지로 넣음) | queue(판 대기열: 바로 들어갔거나 차례를 기다림). --now일 때만
    const how = o.now ? (d.typed && row.status !== 'queued' ? 'typed' : 'queue') : undefined;
    return { ...out, state: this.state(t), delivery: { status: row.status, reason: row.reason ?? null, ...(how ? { how } : {}) }, turn: null };
  }
  // P180: 판이 붙잡아 둔 일(받는 세션에 다른 위 세션의 열린 시도가 있다). 앞 시도가 끝나면 판이 머리를 붙여 넣는다.
  //   --wait면 넣을 때까지 기다린 뒤 그 턴(또는 done)을 기다린다
  async heldPrompt(caller, t, made, o, res, woke, caseInfo = null) {
    const b = this.b;
    const tag = this.branch && this.branch.promptTagOf ? this.branch.promptTagOf(caller.sessionId, t.sessionId) : null;
    b.store.addEvent(caller.sessionId, 'atrium_prompt', { target: t.name, sessionId: t.sessionId, deliveryId: null, unitId: made.unit.id, held: true, chars: made.unit.spec.length, wait: !!o.wait });
    const unit = { id: made.unit.id, kind: 'new', held: true, ahead: made.ahead, ...(caseInfo || {}) };
    const out = { ...this.head(t), deliveryId: null, woke, tag, unit, next: verbLines(t.name) };
    if (!o.wait) return { ...out, state: this.state(t), delivery: { status: 'queued', reason: 'unit_wait' }, turn: null };
    const t0 = Date.now(); const gone = watchGone(res);
    const limit = clamp(o.timeoutMs, 1000, WAIT_MAX_MS, WAIT_DEFAULT_MS);
    let tr = null;
    while (!gone() && Date.now() - t0 < limit && b.sessions.has(t.sessionId)) {
      tr = b.store.lastTryOfUnit(made.unit.id);
      if (tr) break;
      await sleep(this.pollMs);
    }
    if (!tr) return { ...out, state: this.state(t), delivery: { status: 'queued', reason: 'unit_wait' }, turn: { status: b.sessions.has(t.sessionId) ? 'timeout' : 'closed', state: this.state(t), ms: Date.now() - t0, answer: null, ask: null, error: null, delivery: null, unit: null, next: verbLines(t.name) } };
    const turn = await this.waitTurn(caller, t, { deliveryId: tr.deliveryId, timeoutMs: Math.max(1000, limit - (Date.now() - t0)), res });
    const row = b.store.getDelivery(tr.deliveryId) || {};
    return { ...out, deliveryId: tr.deliveryId, state: turn.state, delivery: { status: row.status || 'queued', reason: row.reason ?? null }, turn };
  }
  // 글이 들어가기(confirmed)나 끝내 못 들어가기를 잠깐 기다린다. 받는 쪽이 일하는 중이거나 사람의 답을 기다리면 바로 돌려준다(대기열이 나중에 넣는다)
  async settle(deliveryId, res) {
    const b = this.b; const t0 = Date.now();
    const gone = watchGone(res);
    let row = b.store.getDelivery(deliveryId) || { status: 'queued', reason: null };
    while (Date.now() - t0 < this.settleMs && !gone()) {
      row = b.store.getDelivery(deliveryId) || row;
      if (FINAL.has(row.status)) break;
      if (row.status === 'queued' && LONG_REASONS.has(row.reason) && Date.now() - t0 > 600) break;
      await sleep(this.pollMs);
    }
    return row;
  }

  // ---------- atrium wait <이름> [--timeout ms] ----------
  async wait(caller, o = {}, res = null) {
    const t = this.target(caller, o.name);
    const deliveryId = this.sent.get(`${caller.sessionId}>${t.sessionId}`) || null;
    const row = deliveryId ? this.b.store.getDelivery(deliveryId) : null;
    // 너의 마지막 글이 아직 대기열에 있거나, 들어간 뒤 그 턴이 마지막 턴이면(끝났어도) 그 글의 턴이다. 그 뒤에 다른 턴이 시작했으면 지금 턴을 본다
    const last = t.rt.turn || {};
    const mine = row && (!FINAL.has(row.status) || (row.status === 'confirmed' && !(last.startedAt && last.startedAt > (row.confirmedAt || 0) + 5000))) ? deliveryId : null;
    // P180: 너에게서 열린 시도가 없으면, 마지막으로 done이 닫은 시도의 값(대기열 것이 아직 안 들어갔으면 기다림이 가져가고 취소, 들어갔으면 "이미 전함")
    const U = this.units();
    const open = U ? this.b.store.openTryOf(t.sessionId) : null;
    const mineOpen = open && (this.b.store.getUnit(open.unitId) || {}).from === caller.sessionId;
    const claimed = U && !mineOpen ? U.claimForWait(caller, t, { after: row ? row.createdAt || 0 : 0 }) : null;
    const turn = await this.waitTurn(caller, t, { deliveryId: mine, timeoutMs: o.timeoutMs, res, prior: claimed });
    return { ...this.head(t), ...turn };
  }
  // 받는 세션의 턴이 끝날 때까지. → { status, state, ms, answer, ask, error, delivery, next }
  // status: done(턴이 끝났다) | idle(기다릴 턴이 없었다) | waiting(사람의 답을 기다린다) | timeout | failed·unconfirmed(글이 들어가지 않았다) | closed | exited | sleeping | error(턴이 오류로 끝났다)
  // P180: unit — 그 하위가 done으로 닫은 일의 값 { id, result, text, alreadyDelivered, … }. 기다리는 동안 done이 오면 기다림이 받고(대기열로 보내지 않는다) 바로 돌아온다(status done)
  async waitTurn(caller, t, { deliveryId = null, timeoutMs = null, res = null, prior = null } = {}) {
    const b = this.b; const t0 = Date.now();
    const limit = clamp(timeoutMs, 1000, WAIT_MAX_MS, WAIT_DEFAULT_MS);
    const gone = watchGone(res);
    const U = this.units();
    const waiter = U ? U.addWaiter(caller.sessionId, t.sessionId) : null;
    try { return await this.waitLoop(caller, t, { deliveryId, limit, gone, t0, waiter, prior }); }
    finally {
      if (waiter) U.removeWaiter(caller.sessionId, t.sessionId, waiter);
      if (waiter && waiter.got && gone()) U.requeue(waiter.got.tryId); // 받은 기다림의 명령이 끊겼다(셸 시간 제한 등) → 대기열로 한 번
    }
  }
  async waitLoop(caller, t, { deliveryId, limit, gone, t0, waiter, prior }) {
    const b = this.b;
    // want: 기다리는 턴의 시작 하한. 너의 글이 들어갔으면 그 때, 아니면 처음 본 일하는 턴의 시작. 없으면 기다릴 턴이 없다(idle)
    let want = null, readySince = null, status = null;
    const sum = () => (b.sessions.has(t.sessionId) ? b.summary(t) : null);
    const turnOf = () => t.rt.turn || {};
    let s = sum();
    for (;;) {
      if (waiter && waiter.got) { s = sum(); status = 'done'; break; } // P180: done이 왔다(끊긴 명령보다 먼저 본다)
      if (gone()) { status = 'aborted'; break; }
      s = sum();
      if (!s) { status = 'closed'; break; }
      const st = s.state;
      const d = deliveryId ? b.store.getDelivery(deliveryId) : null;
      if (d && (d.status === 'failed' || d.status === 'cancelled')) { status = 'failed'; break; }
      if (st === 'exited') { status = 'exited'; break; }
      const pend = b.queue.list(t.sessionId).filter((x) => !FINAL.has(x.status));
      if (st === 'waiting' || st === 'trust_wait' || pend.some((x) => x.status === 'queued' && (x.reason === 'waiting' || x.reason === 'trust_wait'))) { status = 'waiting'; break; }
      if (Date.now() - t0 >= limit) { status = 'timeout'; break; }
      if (d && d.status === 'confirmed' && !want) want = (d.confirmedAt || d.updatedAt || Date.now()) - 3000;
      if (st === 'working' || st === 'starting') { want ||= (turnOf().startedAt || Date.now()) - 1; readySince = null; await sleep(this.pollMs); continue; }
      if (pend.length) { readySince = null; await sleep(this.pollMs); continue; } // 대기열에 든 글(잠든 세션이면 판이 깨운 뒤 넣는다)
      if (st === 'sleeping') { status = 'sleeping'; break; }
      // 여기서부터 ready·error(또는 셸로 돌아감): 기다린 턴이 끝났는지
      readySince ||= Date.now();
      if (d && d.status === 'unconfirmed') { status = 'unconfirmed'; break; }
      if (!want) { status = 'idle'; break; }
      const turn = turnOf();
      const started = !!turn.startedAt && turn.startedAt >= want;
      // 들어간 글의 턴 시작(UserPromptSubmit·working)이 아직 보이지 않는다
      if (!started && Date.now() - readySince < this.turnGraceMs) { await sleep(this.pollMs); continue; }
      // 일이 멈췄는데 턴 끝(Stop hook)이 아직이다. hook을 잃었으면 30초 뒤 있는 것으로 돌려준다
      if (started && !(turn.endedAt >= turn.startedAt) && Date.now() - readySince < 30000) { await sleep(this.pollMs); continue; }
      // 답이 턴 끝보다 늦게 온다(화면 답은 턴이 끝난 뒤 판이 화면에서 읽는다)
      if (started && turn.endedAt && (t.rt.lastAnswerAt || 0) < turn.endedAt && Date.now() - readySince < this.answerGraceMs) { await sleep(this.pollMs); continue; }
      status = st === 'error' ? 'error' : 'done';
      break;
    }
    const ms = Date.now() - t0;
    const row = deliveryId ? b.store.getDelivery(deliveryId) : null;
    const st = s ? s.state : 'closed';
    // P180: 기다리는 동안 받은 done 값(이 기다림이 가져갔다), 없으면 앞서 가져온 값
    const got = waiter && waiter.got ? waiter.got : null;
    const unit = got ? { ...this.units().view(b.store.getTry(got.tryId)), claimedBy: 'wait', alreadyDelivered: false } : prior || null;
    const answer = got ? { text: clip(got.text, ANSWER_MAX), clipped: got.text.length > ANSWER_MAX, source: 'done', at: Date.now() } : ['done', 'idle', 'error', 'sleeping', 'unconfirmed'].includes(status) ? this.answerOf(t) : null;
    const out = { status, state: st, ms, answer, unit, ask: status === 'waiting' && s && s.ask ? { kind: s.ask.kind || null, summary: clip(s.ask.summary || s.ask.question || s.ask.kind || '', 300) } : null,
      error: status === 'error' && s && s.error ? { type: s.error.type || null, message: clip(s.error.message, 300) } : null,
      delivery: row ? { deliveryId, status: row.status, reason: row.reason ?? null } : null, next: verbLines(t.name) };
    if (status !== 'aborted' && b.sessions.has(caller.sessionId)) {
      const l = this.openLink(caller, t);
      if (l) {
        b.linkEvent(l, 'wait_result', null, { via: 'atrium', status, state: st, ms, deliveryId, ...(unit ? { unitId: unit.id, alreadyDelivered: unit.alreadyDelivered } : {}) }, { quiet: true });
        if (answer && !got && (status === 'done' || status === 'error')) b.linkEvent(l, 'reply', answer.text, { via: 'atrium', source: answer.source, verb: 'wait' }); // done 값은 done이 이미 답으로 적었다
      }
      b.store.addEvent(caller.sessionId, 'atrium_wait', { target: t.name, sessionId: t.sessionId, status, ms, deliveryId });
    }
    return out;
  }

  // ---------- atrium read <이름> [--lines n] ----------
  async read(caller, o = {}) {
    const b = this.b;
    const t = this.target(caller, o.name);
    const lines = clamp(o.lines, 1, READ_MAX_LINES, READ_LINES);
    const st = this.state(t);
    let text = null, why = null;
    if (!t.paneId || st === 'sleeping') why = 'sleeping';
    else {
      // 화면의 빈 줄(입력 칸 위의 빈 화면 등)은 줄 수에 넣지 않는다: 더 넉넉히 읽고 빈 줄을 줄인 뒤 끝 lines줄
      try { text = compactLines(await b.adapter.readScreen(t.paneId, { source: 'recent_unwrapped', lines: Math.min(lines + 200, READ_MAX_LINES) }), lines); }
      catch (e) { why = e.code || 'read_failed'; }
    }
    const answer = this.answerOf(t);
    const out = { ...this.head(t), state: st, lines, source: text != null ? 'screen' : 'answer', text, why, answer, next: verbLines(t.name) };
    const l = this.openLink(caller, t);
    if (l) b.linkEvent(l, 'reply', text != null ? screenAnswerText(text, 40, { kind: t.kind }) : answer ? answer.text : null, { via: 'atrium', verb: 'read', source: out.source, ...(text != null ? { screenTail: tailText(text, 60) } : {}) });
    b.store.addEvent(caller.sessionId, 'atrium_read', { target: t.name, sessionId: t.sessionId, lines, source: out.source, why });
    return out;
  }
}
