// P248: 보내기 칸과 휴대폰 입력 줄의 스티어링 선택(사용자 결정 2026-11-19).
// 사람이 보낸 글은 기본이 대기열이다(받는 세션이 지금 턴을 끝낸 뒤 들어간다). 스티어링을 고르면 일하는 중인 판의 Claude Code 입력 칸에 넣어
// Claude Code의 대기 메시지가 된다(다음 도구 호출 사이에 읽는다, 쓰다 만 글은 비킨다). P271: Codex는 입력 칸에 넣고 Enter를 쳐 지금 턴에 끼워 넣는다
// (쓰다 만 글이 있으면 비키지 않고 기다린다). 쉬는 세션에는 보통 보내기와 같다.
// 일하는 중 입력을 받지 못하는 세션(다른 종류, hook 없는 세션)은 스티어링할 수 없다(백엔드가 대기열로 보내고 까닭을 돌려준다).
// 판단은 backend/src/delivery.mjs steerBlock과 같다(종류로만, 상태와 상관없다)

// 세션 요약(kind, hooked) → 스티어링할 수 없는 까닭 | null. kind: 다른 종류(opencode 등), no_hook: hook이 없는 Claude Code
// P271(이슈 #19): Codex는 받는다(일하는 중 입력 칸의 글에 Enter를 치면 지금 턴에 끼워 넣는다)
// P296: 자체 오케스트레이션 세션은 대기열만(orchestrates)
// P383: OmO(omo)는 자체 오케스트레이션이어도 스티어링을 받는다(일하는 중 Enter = 스티어링 대기열, 지금 턴의 도구 호출 뒤에 들어간다). 백엔드 STEER_ORCH_KINDS와 같다
export const STEER_ORCH_KINDS = new Set(['omo']);
export function steerBlock(s) {
  if (!s) return 'kind';
  const kind = s.kind || 'claude';
  if (s.orch && s.orch.on && !STEER_ORCH_KINDS.has(kind)) return 'orchestrates';
  if (kind === 'codex' || kind === 'omo') return null;
  if (kind !== 'claude') return 'kind';
  return s.hooked === false ? 'no_hook' : null;
}

// P379: 휴대폰 스티어링 단추를 눌렀는데 그 세션이 스티어링을 받지 않을 때의 짧은 글. 보내기는 막지 않는다(대기열로 일이 끝난 뒤 들어간다)
export const steerOffText = (t, why) => t('p379.phoneSteerOff', { why: t(`cmdSteer.why_${why}`) });

// recipients: lib/cmd-input.js recipients()의 답, sessions: 판의 세션 요약 → { can: 이름[], cannot: { name, why }[] }
//   @all은 판의 에이전트 세션 모두. 없는 이름·셸은 세지 않는다(보내기가 거절한다)
export function steerTargets(recipients, sessions) {
  const list = [...(sessions || [])];
  const can = [], cannot = [];
  const put = (s) => {
    if (!s || s.kind === 'shell' || can.includes(s.name) || cannot.some((x) => x.name === s.name)) return;
    const why = steerBlock(s);
    if (why) cannot.push({ name: s.name, why }); else can.push(s.name);
  };
  for (const r of recipients || []) {
    if (r.state === 'all') { for (const s of list) put(s); continue; }
    if (r.state === 'unknown' || r.state === 'shell') continue;
    put(list.find((x) => x.name === r.name));
  }
  return { can, cannot };
}

// session.send의 steer 칸(켰고 스티어링할 수 있는 받는 세션이 하나라도 있을 때만)
export const steerParam = (on, targets) => (on && targets && targets.can.length ? { steer: true } : {});

// session.send 답의 전달 가운데 스티어링을 고르고도 대기열로 간 것 → [{ name, why }]
export function steerFellBack(deliveries) {
  return (deliveries || []).filter((d) => d && d.steer && d.steer.ok === false).map((d) => ({ name: d.name, why: d.steer.why }));
}
