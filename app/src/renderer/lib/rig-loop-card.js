// P230(rig2-design 11.12의 4): rig 판의 고리 카드(판 API rig.loops의 고리 하나 → 카드 자료)와 지금 돌리기(rig.run) 답 → 알림.
// 단위 시험 test/p230-lib.test.mjs

// 지금 돌리기를 보일 고리: rig 2 정의(loops 칸)의 every 고리만(요청 고리는 요청이, loops 없는 정의의 cycles는 판의 느린 고리가 연다)
export const canRunNow = (l) => !!l && !l.implicit && !!l.trigger && l.trigger.type === 'every';

// 고리 → { name, kind, state, trigger: { key, vars }, nextAt, last, canRun, held }
export function loopCardView(l) {
  const tr = (l && l.trigger) || {};
  const trigger = tr.type === 'request' ? { key: 'rigP230.trigRequest', vars: { entry: l.entry } }
    : tr.type === 'every' ? { key: 'rigP230.trigEvery', vars: { every: tr.every, entry: l.entry } }
      : { key: 'rigP230.trigEvent', vars: {} };
  const state = ['running', 'waiting', 'paused', 'idle'].includes(l && l.state) ? l.state : 'idle';
  return {
    name: l.name, kind: l.kind === 'improve' ? 'improve' : 'work', state, trigger,
    nextAt: tr.type === 'every' ? l.nextAt ?? null : null,
    last: l.lastRun ? { name: l.lastRun.name || l.lastRun.id, state: l.lastRun.state } : null,
    canRun: canRunNow(l), held: l.held || 0,
  };
}

// rig.run 답 → { key, vars, kind }(알림)
export function runToast(r) {
  if (!r) return { key: 'rigP230.runFail', vars: { error: '?' }, kind: 'error' };
  if (r.ran) return { key: 'rigP230.ran', vars: { name: r.name || r.case || '' }, kind: 'info' };
  const why = ['running', 'paused', 'no_session', 'spawn_failed'].includes(r.skipped) ? r.skipped : 'running';
  return { key: `rigP230.skip.${why}`, vars: { list: (r.live || []).join(', ') }, kind: 'error' };
}
