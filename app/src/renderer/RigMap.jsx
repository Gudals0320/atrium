// P251·P253: 세션 맵의 rig 구조 지도. P254: 사용자의 시안 V7 "새 rig · 캔버스의 길 선"의 배치(역할 한 줄, 이웃한 쌍만 방향별 두 줄, 빌더는 오른쪽 끝 역할 아래).
// 그 워크스페이스 줄 안의 묶음 하나(자리는 mission-lineage.js lineageLayout rigBlocks, 배치는 lib/rig-map.js v7Layout + rigMapOpts, 자료는 판 API rig.map).
// P261: 카드와 선을 세션 맵의 보통 세션 카드·선과 한 가족으로(사용자 2026-11-20 "다른 일반 세션들과 디자인 통일성이 없다. 글씨 크기도 좀 너무 크고").
// - 역할·빌더 카드는 보통 세션 카드(MissionLineage.jsx Card)를 그대로 그린다: MissionLineage.jsx가 세계에 바로 놓는다(rigCards, 미리 보기·태그·판으로 가기도 보통 카드와 같다). 이 파일은 선·글만.
//   카드 크기는 보통 카드 체계(폭 = 판 카드 폭, 높이 = rigCardH, 역할마다 같다), 세계 배율 1(옛 시안 1.5배 확대는 걷었다). rig 표시는 카드 첫 줄 꼬리표(역할 · <역할> · v<판>, rig 빌더)뿐.
// - 이웃한 두 역할 사이 선 두 줄(위 줄 앞으로 가는 길, 아래 줄 돌아오는 길): 세션 맵 나무 선과 같은 굵기·화살촉(.mt-ta-edge k-rig, .mt-sm-tip), 일하는 역할에 닿은 쌍은 밝다(lit).
//   줄 글·"대기 n"은 세션 맵 선 이름표(.mt-ta-elab)와 같은 작은 칩, 끝나지 않은 반려는 그 줄 시작에 작은 붉은 점. 이웃하지 않은 쌍은 그리지 않는다(캔버스와 rig 판에 있다).
// - 올림: 올린 역할에서 빌더로 노랑 점선과 "올림" 칩(노랑은 올림에만).
// 섹터·도구·박자·사이클 띠·변경 기록 띠·머리 띠는 그리지 않는다(rig 판에 있다).
import { memo } from 'react';
import { lineText, pairLit, RIG_MAP, BUILDER_ROLE } from './lib/rig-map.js';

// 역할 세션의 지금 값(창의 세션 값이 이긴다) → { sessionId, name, state, task }
export function liveRole(r, sid, live) {
  const cur = sid && live ? live.get(sid) : null;
  const s = r && r.session;
  if (!cur && !s) return null;
  const state = cur ? cur.state : s.asleep ? 'sleeping' : s.state;
  return { sessionId: sid || s.sessionId, name: cur ? cur.name : s.name, state, task: cur && cur.state === 'working' ? cur.lastPrompt : null };
}

// 세션 맵 선과 같은 화살촉(MissionLineage.jsx mt-sm-tip-*): 줄 끝에 끝이 닿는 채운 삼각형
const Tip = ({ id, k }) => <marker id={id} className={`mt-sm-tip ${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L10 5 L0 10 z" /></marker>;
// 글 칩(가운데 자리 [x, y]): 세션 맵 선 이름표(.mt-ta-elab, translate -50%)
const Lab = ({ p, cls, role, children, ...rest }) => <span className={`mt-ta-elab ${cls}`} data-role={role} style={{ left: p[0], top: p[1] }} {...rest}>{children}</span>;

// m = 지도 자료, g = v7Layout 배치, x·y = 세계 자리, working(역할 이름) → 일하나
export const RigMap = memo(function RigMap({ m, g, x, y, working, t }) {
  if (!m || !g) return null;
  const tid = `rm7-${String(m.workspace).replace(/[^A-Za-z0-9]/g, '')}`;
  const pairs = g.pairs.map((p) => ({ ...p, lit: pairLit(p.a, p.b, working) }));
  return (
    <div className={`mt-rig7-map${g.dim ? ' dim' : ''}`} style={{ left: x, top: y, width: g.w, height: g.h }} data-role="rig-map" data-ws={m.workspace} data-status={m.status}>
      <svg className="mt-rig7-svg" width={g.w} height={g.h} aria-hidden="true">
        <defs><Tip id={`${tid}-d`} k="k-rig" /><Tip id={`${tid}-l`} k="k-rig lit" /><Tip id={`${tid}-r`} k="k-raise" /></defs>
        {pairs.map((p) => { const cls = `mt-ta-edge k-rig${p.lit ? ' lit' : ''}`, tip = `url(#${tid}-${p.lit ? 'l' : 'd'})`; return <g key={p.key} data-role="rm-pair" data-a={p.a} data-b={p.b} data-lit={p.lit ? '1' : '0'}>
          {p.lines.top ? <path className={cls} data-role="rm-line" data-line="top" data-from={p.a} data-to={p.b} d={p.top.d} markerEnd={tip} /> : null}
          {p.lines.bottom ? <path className={cls} data-role="rm-line" data-line="bottom" data-from={p.b} data-to={p.a} d={p.bottom.d} markerEnd={tip} /> : null}
          {p.lines.top && p.lines.top.open ? <circle className="mt-rig7-open" data-role="rm-open-return" data-line="top" cx={p.dotTop[0]} cy={p.dotTop[1]} r={RIG_MAP.DOT / 2} /> : null}
          {p.lines.bottom && p.lines.bottom.open ? <circle className="mt-rig7-open" data-role="rm-open-return" data-line="bottom" cx={p.dotBot[0]} cy={p.dotBot[1]} r={RIG_MAP.DOT / 2} /> : null}
        </g>; })}
        {g.raises.map((r) => <path key={r.role} className="mt-ta-edge k-raise" data-role="rm-raise" data-from={r.role} d={r.d} markerEnd={`url(#${tid}-r)`} />)}
      </svg>
      {g.order.length ? null : <span className="mt-rig7-none">{t('rigMap2.noRoles')}</span>}
      {pairs.map((p) => <span key={'l' + p.key}>
        {p.lines.top ? <Lab p={p.topLab} cls={`k-rig${p.lit ? ' lit' : ''}`} role="rm-line-label" data-line="top" data-a={p.a} data-b={p.b}>{lineText(p.lines.top, 'top')}</Lab> : null}
        {p.lines.bottom ? <Lab p={p.botLab} cls={`k-rig${p.lit ? ' lit' : ''}`} role="rm-line-label" data-line="bottom" data-a={p.a} data-b={p.b}>{lineText(p.lines.bottom, 'bottom')}</Lab> : null}
        {p.lines.waiting ? <Lab p={p.lines.bottom ? p.wait : p.botLab} cls="k-rig wait" role="rm-wait" data-a={p.a} data-b={p.b}>{t('rigV7.wait', { n: p.lines.waiting })}</Lab> : null}
      </span>)}
      {g.raises.map((r) => <span key={'r' + r.role} className="mt-ta-elab k-raise mt-rig7-raise-chip" data-role="rm-raise-label" style={{ left: r.lab[0], top: r.lab[1] }}>{t('rigMap.raiseEdge')}</span>)}
    </div>
  );
});
export { BUILDER_ROLE };
