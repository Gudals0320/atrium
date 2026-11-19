// P251·P253: 세션 맵의 rig 구조 지도. P254: 사용자의 시안 V7 "새 rig · 캔버스의 길 선"을 그대로 옮겼다.
// 그 워크스페이스 줄 안의 묶음 하나(자리는 mission-lineage.js lineageLayout rigBlocks, 그림은 lib/rig-map.js v7Layout, 자료는 판 API rig.map).
// - 역할 카드: 꼬리표 "역할 · <역할> · v<판>", 굵은 이름, 상태 글(쉼·일함·잠, 일함은 초록). 일하는 역할 카드는 테두리가 밝다.
// - 두 역할 사이 선 두 줄(위 줄 앞으로 가는 길, 아래 줄 돌아오는 길), 줄 글, "대기 n", 끝나지 않은 반려는 그 줄 시작에 붉은 점, 지금 오가는 쌍은 밝다.
// - 빌더: 꼬리표 "rig 빌더"(노랑 바탕), 이름, "<상태> · 올림 n". 올린 역할에서 빌더로 노랑 점선 화살표와 "올림".
// 섹터·도구·박자·사이클 띠·변경 기록 띠·머리 띠는 그리지 않는다(시안에 없다. rig 판에 있다).
// 역할·빌더 카드를 누르면 명령줄 @태그, 두 번 누르면 판의 그 세션.
import { memo } from 'react';
import { lineText, V7, BUILDER_ROLE } from './lib/rig-map.js';

// 세션 상태 → 시안의 상태 글 열쇠(rigV7.state.*)와 일함 여부
const stKey = (s) => (!s ? 'none' : s === 'trust_wait' ? 'trust_wait' : ['ready', 'working', 'sleeping', 'waiting', 'error', 'exited', 'starting', 'shell_idle', 'shell_running'].includes(s) ? s : 'ready');

// 역할 세션의 지금 값(창의 세션 값이 이긴다) → { sessionId, name, state, task }
export function liveRole(r, sid, live) {
  const cur = sid && live ? live.get(sid) : null;
  const s = r && r.session;
  if (!cur && !s) return null;
  const state = cur ? cur.state : s.asleep ? 'sleeping' : s.state;
  return { sessionId: sid || s.sessionId, name: cur ? cur.name : s.name, state, task: cur && cur.state === 'working' ? cur.lastPrompt : null };
}
const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };

function Card({ b, kind, tag, name, state, extra, lv, onTag, onGo, t, dataName }) {
  const st = stKey(state);
  const hot = st === 'working';
  return (
    <div className={`mt-rig7-card${hot ? ' hot' : ''}${kind === 'builder' ? ' builder' : ''}`} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} data-role={kind === 'builder' ? 'rm-builder' : 'rm-role'} data-name={dataName} data-state={state || 'none'}
      role="button" tabIndex={0} title={lv && lv.task ? clip(lv.task, 200) : undefined}
      onClick={() => lv && onTag(lv.name)} onDoubleClick={() => lv && onGo(lv.sessionId)} onKeyDown={(e) => { if (e.key === 'Enter' && lv) onGo(lv.sessionId); }}>
      <span>
        <span className="tg" data-role="rm-tag">{tag}</span><br />
        <b className="nm" data-role="rm-role-name">{name}</b><br />
        <span className={`st${hot ? ' work' : ''}`} data-role="rm-state">{t(`rigV7.state.${st}`)}{extra ? ` · ${extra}` : ''}</span>
      </span>
    </div>
  );
}

const Tip = ({ id, color }) => <marker id={id} orient="auto" markerWidth="5" markerHeight="5" refX="2" refY="2" overflow="visible"><path d="M0 0 L4 2 L0 4 Z" fill={color} stroke="none" /></marker>;
// 글 칸(가운데 자리 [x, y], 폭 w): 시안의 글 칸과 같은 자리
const Lab = ({ p, w, cls, role, children, ...rest }) => <span className={cls} data-role={role} style={{ left: p[0] - w / 2, top: p[1] - V7.LABH / 2, width: w }} {...rest}>{children}</span>;

export const RigMap = memo(function RigMap({ m, g, x, y, scale = 1, live, sid, t, onTag, onGo }) {
  if (!m || !g) return null;
  const byName = new Map((m.roles || []).map((r) => [r.name, r]));
  const tid = `rm7-${String(m.workspace).replace(/[^A-Za-z0-9]/g, '')}`;
  const nRaise = (m.raises || []).length;
  const bl = m.builder ? liveRole({ session: m.builder }, sid.get(BUILDER_ROLE) || m.builder.sessionId, live) : null;
  return (
    <div className={`mt-rig7-map${g.dim ? ' dim' : ''}`} style={{ left: x, top: y, width: g.w, height: g.h, transform: scale !== 1 ? `scale(${scale})` : undefined }} data-role="rig-map" data-ws={m.workspace} data-status={m.status}>
      <svg className="mt-rig7-svg" width={g.w} height={g.h} aria-hidden="true">
        <defs><Tip id={`${tid}-d`} color={V7.C.dim} /><Tip id={`${tid}-l`} color={V7.C.lit} /><Tip id={`${tid}-r`} color={V7.C.raise} /></defs>
        {g.pairs.map((p) => { const c = p.lines.lit ? V7.C.lit : V7.C.dim, tip = `url(#${tid}-${p.lines.lit ? 'l' : 'd'})`; return <g key={p.key} data-role="rm-pair" data-a={p.a} data-b={p.b} data-lit={p.lines.lit ? '1' : '0'} data-kind={p.straight ? 'straight' : 'lane'}>
          {p.lines.top ? <path data-role="rm-line" data-line="top" data-from={p.a} data-to={p.b} d={p.top.d} fill="none" stroke={c} strokeWidth={V7.W1} strokeLinecap="round" strokeLinejoin="round" markerEnd={tip} /> : null}
          {p.lines.bottom ? <path data-role="rm-line" data-line="bottom" data-from={p.b} data-to={p.a} d={p.bottom.d} fill="none" stroke={c} strokeWidth={V7.W2} strokeLinecap="round" strokeLinejoin="round" markerEnd={tip} /> : null}
          {p.lines.top && p.lines.top.open ? <circle data-role="rm-open-return" data-line="top" cx={p.dotTop[0]} cy={p.dotTop[1]} r={V7.DOT / 2} fill={V7.C.red} /> : null}
          {p.lines.bottom && p.lines.bottom.open ? <circle data-role="rm-open-return" data-line="bottom" cx={p.dotBot[0]} cy={p.dotBot[1]} r={V7.DOT / 2} fill={V7.C.red} /> : null}
        </g>; })}
        {g.raises.map((r) => <path key={r.role} data-role="rm-raise" data-from={r.role} d={r.d} fill="none" stroke={V7.C.raise} strokeWidth={V7.RAISEW} strokeDasharray={V7.RAISEDASH.join(' ')} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#${tid}-r)`} />)}
      </svg>
      {g.pairs.map((p) => <span key={'l' + p.key}>
        {p.lines.top ? <Lab p={p.topLab} w={V7.LABW} cls={`mt-rig7-lab${p.lines.lit ? ' lit' : ''}`} role="rm-line-label" data-line="top" data-a={p.a} data-b={p.b}>{lineText(p.lines.top, 'top')}</Lab> : null}
        {p.lines.bottom ? <Lab p={p.botLab} w={V7.LABW} cls={`mt-rig7-lab${p.lines.lit ? ' lit' : ''}`} role="rm-line-label" data-line="bottom" data-a={p.a} data-b={p.b}>{lineText(p.lines.bottom, 'bottom')}</Lab> : null}
        {p.lines.waiting ? <Lab p={p.lines.bottom ? p.wait : p.botLab} w={V7.WAITW} cls={`mt-rig7-wait${p.lines.lit ? ' lit' : ''}`} role="rm-wait" data-a={p.a} data-b={p.b}>{t('rigV7.wait', { n: p.lines.waiting })}</Lab> : null}
      </span>)}
      {g.raises.map((r) => <span key={'r' + r.role} className="mt-rig7-raise-lab" data-role="rm-raise-label" style={{ left: r.lab[0], top: r.lab[1] - V7.LABH / 2, width: V7.RAISELW }}>{t('rigMap.raiseEdge')}</span>)}
      {g.order.map((n) => { const r = byName.get(n), lv = liveRole(r, sid.get(n), live); return <Card key={n} b={g.roles.get(n)} kind="role" dataName={n} tag={r && r.docN != null ? t('rigV7.tagRoleV', { name: n, n: r.docN }) : t('rigMap.tagRole', { name: n })} name={n} state={lv ? lv.state : null} lv={lv} onTag={onTag} onGo={onGo} t={t} />; })}
      {g.order.length ? <Card b={g.builder} kind="builder" dataName={BUILDER_ROLE} tag={t('rigMap.tagBuilder')} name={t('rigV7.builderName')} state={bl ? bl.state : null} extra={nRaise ? t('rigMap.raises', { n: nRaise }) : null} lv={bl} onTag={onTag} onGo={onGo} t={t} /> : <span className="mt-rig7-none">{t('rigMap2.noRoles')}</span>}
    </div>
  );
});
export { BUILDER_ROLE };
