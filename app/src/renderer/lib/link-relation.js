// P175: 선의 관계(백엔드 linkView의 relation: { relation, source, up })를 창에서 쓰는 모양으로 바꾼다
import { BOARD_ROLES } from './roles.js';
import { PEER_ROLE } from '../../../../backend/src/relations.mjs';

// 동료인 선은 역할 자리에 "동료"를 보인다(P159가 숨긴 띄울 때 역할 대신). 사람이 쓴 역할 이름(판의 기본 낱말이 아닌 것)은 그대로 보인다
export function peerView(link) {
  if (!link || !link.relation || link.relation.relation !== 'peer') return link;
  const own = link.role || link.storedRole;
  return { ...link, role: own && !BOARD_ROLES[own] ? own : PEER_ROLE, peer: true };
}

// 선의 지금 관계 → 하위 / 동료 토글 값. 하위는 이 선의 보낸 쪽이 위일 때만(독립·거꾸로 된 하위는 둘 다 꺼짐)
export function relValue(link) {
  const r = link && link.relation;
  if (!r) return null;
  if (r.relation === 'peer') return 'peer';
  if (r.relation === 'sub' && r.up === link.from) return 'sub';
  return null;
}
