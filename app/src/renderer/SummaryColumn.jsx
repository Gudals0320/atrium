// P179: 지도 오른쪽 요약 열. 옛 열 지도(Mission.jsx ClassicMission, P95~P151)의 요약 열을 꺼내 세션 맵(MissionLineage.jsx)과 같이 쓴다.
// 묶음은 lib/mission-model.js summaryColumn: 응답 필요(노란 머리, 질문·오류 글) · 작업 중(늘 둔다, 비면 "없음") · 작업 완료(보라 머리) ·
// 쉼 · 끝남(이름을 " · "로 이은 짧은 글, 머리에 절전·종료 수, 많으면 "+n개 더"). 맨 아래 바닥 줄: 작업 중·세션·팀 수와 선 읽는 법 한 줄.
// 줄의 둘째 글(textOf)과 누르기(onGo)·올리기(onHot)는 쓰는 지도가 정한다. 모양은 styles.css .mt-mm-sum·.mt-mm-sec·.mt-mm-si·.mt-mm-rest·.mt-mm-foot
// P186: rigCases(lib/rig-map.js caseGroups, rig가 없는 판은 null) = rig 건 묶음. 막힌 건 · 열린 건 · 최근 끝난 건. 누르면 지금 일이 있는 자리의 카드로(onGo)
// P198: onCase(c)가 있으면 건 누르기는 그 건의 띠 행 머리로(세션 맵). 없으면 전처럼 지금 일이 있는 카드로(onGo)
export function SummaryColumn({ sum, t, nameOf, tierOf, textOf, noOf = () => null, hot = null, onGo, onHot, teams = 0, hint, itemTip, role = 'mm-summary', className = '', style, children, rigCases = null, onCase = null }) {
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
  // P186: 건 한 줄. a = 건 ID와 주인, b = 일이 있는 자리·넘김 수(열림), 까닭(막힘), 끝남·넘김 수(끝남)
  const caseItem = (c) => {
    const st = c.state === 'blocked' || c.state === 'waiting_owner' ? 'alert' : c.state === 'open' ? 'work' : 'done';
    const b = c.state === 'blocked' ? t('rigMap.caseBlocked', { reason: c.reason || '?' })
      : c.state === 'waiting_owner' ? [t('rigMore.caseWaitingOwner'), t('rigMap.handoffs', { n: c.handoffs })].join(' · ') // P194
      : c.state === 'open' ? [c.seats.length ? t('rigMap.caseAt', { seats: c.seats.join(', ') }) : t('rigMap.caseQueued'), t('rigMap.handoffs', { n: c.handoffs })].join(' · ')
        : [t(c.state === 'cancelled' ? 'rigMap.caseCancelled' : 'rigMap.caseDone'), t('rigMap.handoffs', { n: c.handoffs })].join(' · ');
    const lim = c.state !== 'done' && c.state !== 'cancelled' ? c.lines.filter((l) => l.passed > 0).map((l) => `${l.on} ${l.passed}/${l.max}`).join(' · ') : '';
    return (
      <button key={`${c.ws}|${c.id}`} type="button" className={`mt-mm-si mt-mm-case t-${st}${c.go && hot === c.go ? ' hot' : ''}`} data-role="mm-sum-case" data-case={c.id} data-state={c.state} data-go={c.go || undefined} title={t(onCase ? 'rigBand.caseTip' : 'rigMap.caseTip')}
        disabled={!c.go && !onCase} onClick={() => (onCase ? onCase(c) : c.go && onGo(c.go))} onMouseEnter={enter(c.go)} onMouseLeave={leave} onFocus={enter(c.go)} onBlur={leave}>
        <span className="a"><i className="dot" aria-hidden="true" /><span className="nm">{t('rigMap.caseName', { id: c.id })}</span><span className="mt-mm-own">@{c.owner}</span></span>
        <span className="b">{b}{lim ? <span className="mt-mm-lim"> · {lim}</span> : null}</span>
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
      {rigCases ? (
        <section className="mt-mm-sec mt-mm-cases" data-role="mm-sum-cases">
          <h4 className="mt-mm-sech">{t('rigMap.cases')}<i>{rigCases.open.length + rigCases.blocked.length}</i>{rigCases.done.length ? <span className="mt-mm-split">{t('rigMap.recentDone', { n: rigCases.done.length })}</span> : null}</h4>
          {rigCases.blocked.map(caseItem)}{rigCases.open.map(caseItem)}{rigCases.done.map(caseItem)}
          {!rigCases.total ? <div className="mt-mm-none">{t('rigMap.noCases')}</div> : null}
        </section>
      ) : null}
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
