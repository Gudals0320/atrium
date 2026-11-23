// P331: 세션 맵(I6, MissionLineage.jsx)의 할 일 배지(TodoBadge)와 그 자리 답하기 미니 창(TodoPop). 셈은 lib/map-todo.js.
// - 배지: 카드 왼쪽 위의 하늘색 작은 꼬리표(오른쪽 위 작업 완료 꼬리표와 짝). 둘 이상이면 수. PC 세션 맵만(휴대폰 맵·캔버스 노드는 지금 표식 그대로).
// - 미니 창: 할 일 목록 카드(Decisions.jsx DecisionRow, 목표 레인은 Plan.jsx PlanCardRow)를 그대로 그린다(같은 내용·같은 동작, 새 동작 없음).
//   여러 장이면 머리에 1/n 넘기기. 보던 카드가 목록에서 빠지면(답·했음·됐다·미루기·무시) 닫힌다. 닫기 단추·Esc·다른 곳 누르기는 MissionLineage.jsx가 맡는다.
//   창 안을 눌러도 입력칸이 아니면 초점을 옮기지 않는다(명령줄 태그 뒤 바로 칠 수 있게).
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useStore, getState, setMissionOpen } from './store.js';
import { useT } from './lib/i18n.js';
import { DecisionRow } from './Decisions.jsx';
import { usePlanCards, PlanCardRow } from './Plan.jsx';
import { planCountFor } from './lib/plans.js';
import { goSession } from './lib/go-session.js';
import { todoCount, todoItems, todoAfter, todoStep, keepsFocus } from './lib/map-todo.js';

// 작은 목록 기호(세 줄). 색만으로 가르지 않게 모양과 글을 함께 둔다(작업 완료 꼬리표의 체크와 짝)
const TodoIcon = () => <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 3h.6M4.4 3H10M2 6h.6M4.4 6H10M2 9h.6M4.4 9H10" /></svg>;

// 할 일 알약과 같은 기준의 세션별 수(미룬 카드 뺌 + 관리하는 목표 레인의 사용자 항목)
export function useTodoCount(sessionId) {
  return useStore((st) => todoCount(st.decisions, sessionId, sessionId && st.plans ? planCountFor([...st.plans.values()], sessionId) : 0));
}

export function TodoBadge({ sessionId }) {
  const t = useT();
  const n = useTodoCount(sessionId);
  if (!n) return null;
  const label = t('mapTodo.badgeTitle', { n });
  return (
    <span className="mt-sm-todo" data-role="map-todo" data-count={n} title={label} aria-label={label}>
      <TodoIcon />{t('mapTodo.badge')}{n > 1 ? <b data-role="map-todo-n">{n}</b> : null}
    </span>
  );
}

export function TodoPop({ sessionId, name, onClose, popRef, onPlace }) {
  const t = useT();
  const decisions = useStore((st) => st.decisions);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id); }, []);
  const pc = usePlanCards(now);
  const items = useMemo(() => todoItems(decisions, pc.cards, sessionId), [decisions, pc, sessionId]);
  const [key, setKey] = useState(() => (items[0] ? items[0].key : null));
  const cur = todoAfter(items, key);
  useEffect(() => { if (!cur) onClose('gone'); }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (onPlace) onPlace(); }); // 그릴 때마다 크기가 바뀔 수 있다(미루기 메뉴 등) → 자리를 다시 잡는다
  if (!cur) return null;
  const i = items.findIndex((x) => x.key === cur);
  const it = items[i];
  const go = (id) => { onClose('go'); goSession(id, { st: getState(), closeMap: () => setMissionOpen(false) }); };
  return (
    <div className="mt-sm-todopop" data-role="map-todo-pop" data-session={sessionId} data-count={items.length} data-key={cur} ref={popRef} role="dialog" aria-label={t('mapTodo.popTitle', { name })}
      onMouseDown={(e) => { if (keepsFocus(e.target && e.target.tagName)) e.preventDefault(); }}>
      <div className="mt-sm-todopop-head">
        <span className="ttl"><TodoIcon />{t('mapTodo.head')}</span>
        {items.length > 1 ? (
          <span className="pg">
            <button type="button" className="pgb" data-action="map-todo-prev" aria-label={t('mapTodo.prev')} title={t('mapTodo.prev')} onClick={() => setKey(todoStep(items, cur, -1))}>‹</button>
            <span className="mono" data-role="map-todo-page">{i + 1}/{items.length}</span>
            <button type="button" className="pgb" data-action="map-todo-next" aria-label={t('mapTodo.next')} title={t('mapTodo.next')} onClick={() => setKey(todoStep(items, cur, 1))}>›</button>
          </span>
        ) : null}
        <button type="button" className="x" data-action="map-todo-close" aria-label={t('common.close')} title={t('mapTodo.closeTitle')} onClick={() => onClose('x')}>×</button>
      </div>
      <div className="mt-sm-todopop-body">
        {it.d ? <DecisionRow key={it.key} d={it.d} onGo={go} now={now} t={t} /> : <PlanCardRow key={it.key} c={it.c} onGo={go} t={t} />}
      </div>
    </div>
  );
}
