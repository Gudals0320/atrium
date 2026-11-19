// P237(rig2-design 11.18의 둘째): 보내기 칸의 "회 없이". rig 자리 세션에 보내도 회를 열지 않고 글만 넣는다(session.send talk, atrium prompt --talk와 같은 길).
// 받는 세션 가운데 rig 자리 세션이 있을 때만 보인다. 자리가 아닌 세션에는 talk가 아무것도 바꾸지 않는다(백엔드가 보통 글로 넣는다)

// recipients: lib/cmd-input.js recipients()의 답, sessions: 판의 세션 요약(name, kind, rigSeat) → 받는 rig 자리 세션의 이름 목록
export function talkSeats(recipients, sessions) {
  const list = [...(sessions || [])];
  const out = [];
  for (const r of recipients || []) {
    if (r.state === 'all') { for (const s of list) if (s.kind !== 'shell' && s.rigSeat && !out.includes(s.name)) out.push(s.name); continue; }
    if (r.state === 'unknown' || r.state === 'shell') continue;
    const s = list.find((x) => x.name === r.name);
    if (s && s.rigSeat && !out.includes(s.name)) out.push(s.name);
  }
  return out;
}
// session.send의 talk 칸(켰고 보일 때만)
export const talkParam = (on, offered) => (on && offered ? { talk: true } : {});
