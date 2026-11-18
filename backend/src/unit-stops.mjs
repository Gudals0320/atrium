// P181: 보고 없이 멈춘 하위를 상위에게 한 번 알리기(하네스 0단계 L4, docs research harness-arch.md 3·9·12절).
// - 대상: 첫 요청 머리를 받은 열린 시도(unit_tries.header, 그 첫 요청이 들어감 confirmed). 머리 없이 도는 세션은 알리지 않는다(상위에 새 턴이 생기지 않게).
// - 받는 쪽: 그 일을 맡긴 세션(work_units.from, 일 관계의 상위).
// - 까닭(unit_tries.stop_reason과 같다): idle_no_done(done 없이 턴을 끝내고 쉼), turn_error(오류로 턴이 끝남),
//   needs_human(승인·신뢰 질문 등 사람의 답을 기다림: waiting·trust_wait), closed(세션이 닫힘). 멈출 때마다 한 번.
// - P216: exited(에이전트만 끝나고 셸 패널이 남음, 판이 끄라고 하지 않았고 사람이 끝낸 것도 아님: exit.kind other). 시도를 닫는다(work-units onExited).
//   rig 건의 일이면 일은 열린 채 남아 `atrium rig retry`로 같은 자리의 새 세션에 다시 맡긴다(알림 줄에 그 명령을 붙인다). 그 밖의 일은 취소된다.
// - 하위를 기다리며 쉬는 중간 워커(자기가 맡긴 열린 일이 있다)는 idle_no_done을 알리지 않는다. 대신 나무 전체(push-cycle cycleCheck)가
//   쉬는데 열린 시도가 남았으면 그 나무의 맨 위 일의 상위에게 한 번 알린다(tree_quiet). 나무에 다시 움직임이 생기면 다음 쉼에 다시 알린다.
// - 같은 상위로 가는 알림은 묶는다(link-notice NoticeBatcher). 보내기 전에 done이 왔거나 다시 일하기 시작했으면 그 줄은 보내지 않는다.
// - 그 하위를 atrium wait·prompt --wait로 기다리는 상위에게는 보내지 않는다(기다림이 멈춤을 돌려준다).
// - Claude hook에 기대지 않는다: 멈춤은 터미널 상태(broadcastSession → bus 'session'), 끝은 atrium done이라 Claude Code·Codex·opencode·pi가 같다.
import { NoticeBatcher, NOTICE_BATCH_MS, closeWhy } from './link-notice.mjs';
import { treeIndex, cycleCheck } from './push-cycle.mjs';
import { clip } from './text.mjs';
import { HUMAN_FROM } from './rig-templates.mjs'; // P190: 사람이 맡긴 rig 제작 일의 멈춤은 응답 필요 목록으로

export const STOP_REASONS = ['idle_no_done', 'turn_error', 'needs_human', 'closed', 'tree_quiet', 'exited'];
const WHY = {
  idle_no_done: '보고(atrium done) 없이 턴을 끝내고 쉰다',
  turn_error: '오류로 턴이 끝났다',
  needs_human: '사람의 답(승인·신뢰 질문 등)을 기다린다',
  closed: '세션이 닫혔다',
  tree_quiet: '아래 하위까지 모두 쉬는데 일이 열려 있다',
  exited: '에이전트가 끝나 셸만 남았다(종료). 일은 끝나지 않은 채 멈췄다', // P216
};
const STOPPED = new Set(['ready', 'error', 'sleeping']); // 쉼(보내기 전에 다시 일하기 시작했는지 볼 때)
const HUMAN = new Set(['waiting', 'trust_wait']);

// 알림 한 줄: @하위의 일 u…("할 일 앞부분"): 까닭
export function stopLine({ child, unitId, spec, why, detail = null }) {
  return `@${child}의 일 ${unitId}("${clip(String(spec || '').replace(/\s+/g, ' '), 50)}"): ${WHY[why] || why}${detail ? `(${detail})` : ''}.`;
}
// 상위가 받는 글(판 알림 꼴이라 상위 카드의 마지막 지시가 되지 않는다)
export function stopNoticeText(lines) {
  const ls = lines.map((l) => (typeof l === 'string' ? l : l.line));
  const head = ls.length === 1 ? [`[Atrium 보드] 맡긴 일이 멈췄다: ${ls[0]}`] : ['[Atrium 보드] 맡긴 일이 멈췄다.', ...ls.map((l) => `- ${l}`)];
  const exited = lines.some((l) => l && l.why === 'exited') ? ' 셸만 남은(종료) 세션에는 다시 시키지 않는다: rig 일은 그 줄의 `atrium rig retry`(관리자 자리·사람), 그 밖은 새 하위(`atrium child`)로 맡긴다.' : ''; // P216
  return [...head, `할 수 있는 것: 화면 보기 \`atrium read <이름>\`, 다시 시키기 \`atrium prompt <이름> "<할 일>"\`, 사람이 답해야 하면 사람에게 알린다. 이 일을 기다리며 폴링하지 않는다.${exited}`].join('\n');
}

export class UnitStops {
  // units: WorkUnits
  constructor(b, units, { batchMs = NOTICE_BATCH_MS } = {}) {
    this.b = b; this.units = units;
    // P182: 나무 전체가 쉼을 알린 표시는 시도의 열(unit_tries.quiet_at)이다. 나무에 움직임이 생기면 지운다. 백엔드가 다시 떠도 되풀이하지 않는다
    this.timer = null;
    this.batch = new NoticeBatcher({
      batchMs,
      canSend: (sid) => b.sessions.has(sid) && !(b.killing && b.killing.has(sid)),
      keep: (sid, l) => this.still(l),
      format: stopNoticeText,
      send: (sid, text, lines) => {
        const st = b.store; const d = b.queue.enqueue(sid, text); const now = Date.now();
        for (const l of lines) st.updateTry(l.tryId, { notifiedAt: now });
        st.addEvent(sid, 'unit_stop_notice', { items: lines.map((l) => ({ unitId: l.unitId, tryId: l.tryId, why: l.why })), deliveryId: d.deliveryId });
        b.log(`unit stop notice → ${units.nameOf(sid)}: ${lines.map((l) => `${l.unitId} ${l.why}`).join(', ')}`);
        return d;
      },
      onDrop: (sid, lines) => { if (b.sessions.has(sid)) b.store.addEvent(sid, 'unit_stop_notice_dropped', { items: lines.map((l) => ({ unitId: l.unitId, why: l.why })) }); },
    });
  }
  store() { return this.b.store; }
  waited(fromId, toId) { const ws = this.units.waiters.get(`${fromId}>${toId}`); return !!(ws && ws.size); }
  // 상위의 묶음에 한 줄을 더한다
  add(tr, unit, why, detail = null) {
    if (unit && unit.from === HUMAN_FROM) return !!(this.b.rigSetup && this.b.rigSetup.onStop(tr, unit, why, detail)); // P190: 상위 세션이 없다(사람)
    if (!unit || !this.b.sessions.has(unit.from)) return false;
    if (unit.from === tr.sessionId) return false; // P185: 건 주인이 자기 자리로 받은 일(자기에게 멈춤을 알리면 끝없이 돈다)
    if (why !== 'tree_quiet' && this.waited(unit.from, unit.to)) return false;
    const line = stopLine({ child: this.units.nameOf(tr.sessionId), unitId: unit.id, spec: unit.spec, why, detail });
    this.store().addEvent(tr.sessionId, 'unit_stop_seen', { unitId: unit.id, tryId: tr.id, why });
    return this.batch.add(unit.from, { key: `${tr.id}:${why}:${tr.sessionId}`, tryId: tr.id, unitId: unit.id, sessionId: tr.sessionId, why, line });
  }
  // 보낼 때 아직 알릴 것인가: done이 오지 않았고, 다시 일하기 시작하지 않았다
  still(l) {
    const st = this.store(); const tr = st.getTry(l.tryId);
    if (!tr || tr.result != null) return false;
    if (l.why === 'closed') return true;
    if (l.why === 'exited') { const u = st.getUnit(tr.unitId); if (!u || !u.caseId) return true; const last = st.lastTryOfUnit(u.id); return u.status === 'open' && (!last || last.id === tr.id); } // P216: 그새 다시 맡겼으면 보내지 않는다
    const unit = st.getUnit(tr.unitId);
    if (!unit || unit.status !== 'open') return false;
    if (l.why === 'tree_quiet') return this.treeQuiet(tr) === true;
    if (!this.b.sessions.has(tr.sessionId)) return false; // 닫혔으면 closed 줄이 따로 간다
    const state = this.units.prev.get(tr.sessionId);
    return l.why === 'needs_human' ? HUMAN.has(state) : STOPPED.has(state);
  }

  // 그 세션의 상태가 바뀌었다(WorkUnits.onSession이 부른다). tr: 그 세션의 열린 시도(머리), prev → state
  onState(s, sum, prev, tr) {
    const state = sum.state;
    if (prev !== state) this.scheduleTree();
    if (!tr || !tr.header || prev == null || prev === state) return null;
    const st = this.store();
    const d = tr.deliveryId ? st.getDelivery(tr.deliveryId) : null;
    if (!d || d.status !== 'confirmed') return null; // 머리를 받기 전(신뢰 질문 등은 atrium child 응답이 말한다)
    let why = null;
    if (prev === 'working' && (state === 'ready' || state === 'error')) {
      const turnless = sum.work && sum.work.turnless && s.rt && s.rt.term && sum.work.endedAt === s.rt.term.at; // P173: 압축만 하고 끝남(턴이 아니다)
      if (turnless) return null;
      if (state === 'error') why = 'turn_error';
      else if (st.openUnitsFromCount(s.sessionId) === 0) why = 'idle_no_done'; // 하위를 기다리며 쉬는 중간 워커는 나무 전체로 본다
    } else if (HUMAN.has(state) && !HUMAN.has(prev)) why = 'needs_human';
    if (!why) return null;
    const unit = st.getUnit(tr.unitId);
    this.add(tr, unit, why);
    return why;
  }
  // 세션이 닫혔다(열린 시도가 있었으면). → 알림을 건 상위 ID | null
  onClosed(s, tr, unit, reason, { byParent = false } = {}) {
    this.scheduleTree();
    if (!tr || !tr.header || byParent || !unit) return null;
    return this.add(tr, unit, 'closed', reason ? closeWhy(reason) : null) && unit.from !== HUMAN_FROM ? unit.from : null;
  }

  // P216: 에이전트가 끝나 셸만 남았다(work-units onExited가 시도를 닫은 뒤). detail: 다시 맡기는 길 → 알림을 건 상위 ID | null
  onExited(tr, unit, detail = null) {
    this.scheduleTree();
    if (!tr || !unit) return null;
    return this.add(tr, unit, 'exited', detail) && unit.from !== HUMAN_FROM ? unit.from : null;
  }

  // ---------- 나무 전체가 쉬는가(중간 워커) ----------
  scheduleTree() {
    if (this.timer || typeof this.b.pushTree !== 'function') return;
    this.timer = setImmediate(() => { this.timer = null; try { this.checkTrees(); } catch (e) { this.b.log('unit tree check error', e.stack); } });
  }
  // 맨 위 시도(자기가 맡긴 열린 일이 있고, 그 일을 맡긴 세션은 열린 시도가 없다)의 나무가 쉬는가 → true | false | null(맨 위 시도가 아님)
  treeQuiet(tr, tree = null) {
    const st = this.store(); const b = this.b;
    if (!tr || tr.endedAt || !tr.header || !b.sessions.has(tr.sessionId)) return null;
    if (!st.openUnitsFromCount(tr.sessionId)) return null;
    const d = tr.deliveryId ? st.getDelivery(tr.deliveryId) : null;
    if (!d || d.status !== 'confirmed') return null;
    return cycleCheck(tr.sessionId, tree || treeIndex(b.pushTree())).ok;
  }
  checkTrees() {
    const st = this.store(); const b = this.b;
    const tries = st.openTries().filter((t) => t.header && b.sessions.has(t.sessionId));
    const open = new Set(tries.map((t) => t.sessionId));
    let tree = null;
    for (const tr of tries) {
      const unit = st.getUnit(tr.unitId);
      if (!unit || !b.sessions.has(unit.from) || open.has(unit.from)) continue; // 위 세션도 열린 시도를 가졌으면 그 나무의 맨 위가 아니다
      tree = tree || treeIndex(b.pushTree());
      const q = this.treeQuiet(tr, tree);
      if (q !== true) { if (tr.quietAt) st.updateTry(tr.id, { quietAt: null }); continue; }
      if (tr.quietAt) continue;
      st.updateTry(tr.id, { stopReason: 'tree_quiet', quietAt: Date.now() });
      this.add(tr, unit, 'tree_quiet');
    }
  }
  stop() { this.batch.stop(); if (this.timer) clearImmediate(this.timer); this.timer = null; }
}
