// P225(rig2-design 11.8의 1·2): 응답 필요 목록의 "무인 자리 승인: <자리>". 판이 워크스페이스 목록에 승인 전 unattended 자리(rigPermits)를 싣는다.
//   승인은 이 PC의 창만 한다(rig.permit). 원격 보기(웹·보기 전용)에서는 항목만 보이고 단추를 숨긴다.
// workspaces: 판의 워크스페이스 목록 → [{ ws, seat, key }] (워크스페이스 차례, 자리 차례)
export function permitNeeds(workspaces) {
  const out = [];
  for (const w of workspaces || []) for (const seat of (w && Array.isArray(w.rigPermits) ? w.rigPermits : [])) out.push({ ws: w.key, seat: String(seat), key: `${w.key}|${seat}` });
  return out;
}
