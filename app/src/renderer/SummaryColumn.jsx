// P179: 지도 오른쪽 요약 열. 옛 열 지도(Mission.jsx ClassicMission, P95~P151)의 요약 열을 꺼내 세션 맵(MissionLineage.jsx)과 같이 쓴다.
// 묶음은 lib/mission-model.js summaryColumn: 응답 필요(노란 머리, 질문·오류 글) · 작업 중(늘 둔다, 비면 "없음") · 작업 완료(보라 머리) ·
// P347: 쉼 · 끝남 묶음(이름 목록)과 바닥 줄의 수(작업 중·세션·팀, 위 알약에 있다)는 걷었다. 맨 아래는 선 모양 견본 범례(legend) 또는 선 읽는 법 한 줄(hint).
// 줄의 둘째 글(textOf)과 누르기(onGo)·올리기(onHot)는 쓰는 지도가 정한다. 모양은 styles.css .mt-mm-sum·.mt-mm-sec·.mt-mm-si·.mt-mm-foot·.mt-mm-legend
// legend: [{ k: 선 종류(spawn·role·prompt·cross·peer·lineage, 세션 맵 선 .mt-ta-edge.k-*와 같은 모양), label }], legendTip: 범례 전체 풀이(title)
export function SummaryColumn({ sum, t, nameOf, tierOf, textOf, noOf = () => null, hot = null, onGo, onHot, hint, legend = null, legendTip, itemTip, role = 'mm-summary', className = '', style, children }) {
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
  return (
    <aside className={`mt-mm-sum ${className}`.trim()} data-role={role} style={style} aria-label={t('mmSum.title')}>
      {children}
      {sum.turn.length > 0 && <section className="mt-mm-sec turn" data-role="mm-sum-turn"><h4 className="mt-mm-sech">{t('mmMap.sumTurn')}<i>{sum.turn.length}</i></h4>{sum.turn.map((id) => item(id, 'turn'))}</section>}
      <section className="mt-mm-sec" data-role="mm-sum-work"><h4 className="mt-mm-sech">{t('mmMap.sumWork')}<i>{sum.work.length}</i></h4>{sum.work.length ? sum.work.map((id) => item(id, 'work')) : <div className="mt-mm-none">{t('mmMap.sumNone')}</div>}</section>
      {sum.review.length > 0 && <section className="mt-mm-sec" data-role="mm-sum-review"><h4 className="mt-mm-sech">{t('mmMap.sumReview')}<i>{sum.review.length}</i></h4>{sum.review.map((id) => item(id, 'review'))}</section>}
      {legend && legend.length ? (
        <div className="mt-mm-foot mt-mm-legend" data-role="mm-sum-foot" title={legendTip}>
          <div className="mt-mm-legend-list" data-role="mm-legend">
            {legend.map(({ k, label }) => (
              <span key={k} className="mt-mm-li" data-role="mm-legend-item" data-kind={k}>
                <svg className="mt-mm-sw" width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
                  <path className={`mt-ta-edge k-${k}`} d="M3 5 H23" />
                  {k === 'peer' ? <><circle className="mt-mm-sw-dot" cx="3" cy="5" r="2.4" /><circle className="mt-mm-sw-dot" cx="23" cy="5" r="2.4" /></> : null}
                </svg>
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : hint ? <div className="mt-mm-foot" data-role="mm-sum-foot"><div className="mt-mm-hint">{hint}</div></div> : null}
    </aside>
  );
}
