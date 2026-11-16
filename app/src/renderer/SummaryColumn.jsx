// P179: 지도 오른쪽 요약 열. 옛 열 지도(Mission.jsx ClassicMission, P95~P151)의 요약 열을 꺼내 세션 맵(MissionLineage.jsx)과 같이 쓴다.
// 묶음은 lib/mission-model.js summaryColumn: 응답 필요(노란 머리, 질문·오류 글) · 작업 중(늘 둔다, 비면 "없음") · 작업 완료(보라 머리) ·
// 쉼 · 끝남(이름을 " · "로 이은 짧은 글, 머리에 절전·종료 수, 많으면 "+n개 더"). 맨 아래 바닥 줄: 작업 중·세션·팀 수와 선 읽는 법 한 줄.
// 줄의 둘째 글(textOf)과 누르기(onGo)·올리기(onHot)는 쓰는 지도가 정한다. 모양은 styles.css .mt-mm-sum·.mt-mm-sec·.mt-mm-si·.mt-mm-rest·.mt-mm-foot
export function SummaryColumn({ sum, t, nameOf, tierOf, textOf, noOf = () => null, hot = null, onGo, onHot, teams = 0, hint, itemTip, role = 'mm-summary', className = '', style, children }) {
  const enter = (id) => () => onHot(id);
  const leave = () => onHot(null);
  const item = (id, key) => {
    const tier = tierOf(id), no = noOf(id), text = textOf(id, key), name = nameOf(id);
    return (
      <button key={id} type="button" className={`mt-mm-si t-${tier}${hot === id ? ' hot' : ''}`} data-role="mm-sum-item" data-id={id} data-name={name} title={itemTip}
        onClick={() => onGo(id)} onMouseEnter={enter(id)} onMouseLeave={leave} onFocus={enter(id)} onBlur={leave}>
        <span className="a"><i className="dot" aria-hidden="true" />{no ? <span className="mt-mm-no">{no}</span> : null}<span className="nm">{name}</span></span>
        {text ? <span className="b">{text}</span> : null}
      </button>
    );
  };
  const split = sum.restSplit || {};
  // 쉼 · 끝남 머리 옆의 작은 구분: 절전·종료가 있을 때만
  const splitText = [split.sleep ? t('mmSum.splitSleep', { n: split.sleep }) : null, split.done ? t('mmSum.splitDone', { n: split.done }) : null].filter(Boolean).join(' · ');
  const rest = sum.restShown || sum.rest;
  return (
    <aside className={`mt-mm-sum ${className}`.trim()} data-role={role} style={style} aria-label={t('mmSum.title')}>
      {children}
      {sum.turn.length > 0 && <section className="mt-mm-sec turn" data-role="mm-sum-turn"><h4 className="mt-mm-sech">{t('mmMap.sumTurn')}<i>{sum.turn.length}</i></h4>{sum.turn.map((id) => item(id, 'turn'))}</section>}
      <section className="mt-mm-sec" data-role="mm-sum-work"><h4 className="mt-mm-sech">{t('mmMap.sumWork')}<i>{sum.work.length}</i></h4>{sum.work.length ? sum.work.map((id) => item(id, 'work')) : <div className="mt-mm-none">{t('mmMap.sumNone')}</div>}</section>
      {sum.review.length > 0 && <section className="mt-mm-sec" data-role="mm-sum-review"><h4 className="mt-mm-sech">{t('mmMap.sumReview')}<i>{sum.review.length}</i></h4>{sum.review.map((id) => item(id, 'review'))}</section>}
      {sum.rest.length > 0 && (
        <section className="mt-mm-sec" data-role="mm-sum-rest">
          <h4 className="mt-mm-sech">{t('mmMap.sumRest')}<i>{sum.rest.length}</i>{splitText ? <span className="mt-mm-split" data-role="mm-sum-split">{splitText}</span> : null}</h4>
          <div className="mt-mm-rest">
            {rest.map((id, i) => <span key={id}>{i ? <span className="mt-mm-sep"> · </span> : null}<button type="button" className={`mt-mm-rn t-${tierOf(id)}${hot === id ? ' hot' : ''}`} data-role="mm-sum-rest-item" data-id={id} title={itemTip} onClick={() => onGo(id)} onMouseEnter={enter(id)} onMouseLeave={leave} onFocus={enter(id)} onBlur={leave}>{nameOf(id)}</button></span>)}
            {sum.rest.length > rest.length ? <span className="mt-mm-sep" data-role="mm-sum-rest-more"> {t('mmMap.restHidden', { n: sum.rest.length - rest.length })}</span> : null}
          </div>
        </section>
      )}
      <div className="mt-mm-foot" data-role="mm-sum-foot">
        <div>{[t('mmFoot.work', { n: sum.counts.work }), t('mmFoot.sessions', { n: sum.counts.all }), t('mmFoot.teams', { n: teams })].join(' · ')}</div>{/* P141(#17): 수마다 복수형 */}
        {hint ? <div className="mt-mm-hint">{hint}</div> : null}
      </div>
    </aside>
  );
}
