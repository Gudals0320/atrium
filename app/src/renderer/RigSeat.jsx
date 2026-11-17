// P186: 노드 메뉴의 "자리 정하기"(판의 ⋯ 메뉴, 세션 맵 카드의 오른쪽 누르기 메뉴가 같이 쓴다).
// rig가 켜진 워크스페이스의 에이전트 세션만, 이 PC의 창만(원격 기기에는 없다). 고를 자리는 판 API rig.status의 seats, 정하기·떼기는 rig.seat(판 API 토큰).
// 조건과 줄은 lib/rig-map.js seatMenu(단위 시험 test/p186-lib.test.mjs). keep 자리를 다른 세션이 쥐었으면 그 단추는 막고 누가 쥐었는지 보인다.
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useStore, toast } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { seatMenu } from './lib/rig-map.js';

// 원격 기기(웹 화면)인가. web.js가 window.mt.web을 둔다
// P191: __mtViewOnly는 창 시험이 PC 창에서 원격의 보기만 화면을 흉내 낼 때 쓴다(할 수 있는 것을 줄이기만 한다)
export const remoteView = () => typeof window !== 'undefined' && (!!(window.mt && window.mt.web) || !!window.__mtViewOnly);

export function SeatPicker({ s, onDone }) {
  const t = useT();
  const sessions = useStore((st) => st.sessions);
  const [st, setSt] = useState(null);
  const remote = remoteView();
  const key = s && s.workspaceKey;
  useEffect(() => {
    if (remote || !key) return undefined;
    let live = true;
    api.call('rig.status', { workspace: key }).then((r) => { if (live) setSt(r); }, () => { if (live) setSt(null); });
    return () => { live = false; };
  }, [key, remote]);
  const m = seatMenu(st, s, [...sessions.values()], { remote });
  if (!m) return null;
  const set = (seat) => api.call('rig.seat', { session: s.sessionId, seat }).then((r) => {
    toast(seat ? t('rigMap.seatSet', { name: s.name, seat }) : t('rigMap.seatCleared', { name: s.name }));
    if (onDone) onDone(r);
  }, (e) => toast(t('rigMap.seatFail', { error: errText(e) }), 'error'));
  return (
    <div className="mt-menu-row mt-seat-pick" data-role="seat-menu" data-current={m.current || undefined}>
      <span className="dim">{t('rigMap.seatMenu')}</span>
      {m.seats.map((x) => (
        <button key={x.name} type="button" className={`mt-btn small${x.current ? ' on' : ''}`} data-action="seat-set" data-seat={x.name} disabled={x.current || !!x.taken}
          title={x.current ? t('rigMap.seatNow') : x.taken ? t('rigMap.seatTaken', { name: x.taken }) : t(`rigMap.mode.${x.mode}`)} onClick={() => set(x.name)}>
          {x.name}<span className="mt-seat-mode">{x.mode}</span>
        </button>
      ))}
      {m.clear ? <button type="button" className="mt-btn small ghost" data-action="seat-clear" onClick={() => set(null)}>{t('rigMap.seatClear')}</button> : null}
    </div>
  );
}
