// P198: 세션 맵의 rig 띠 그림(docs research harness-arch.md 17절). 배치는 lib/rig-band.js(순수 함수)이고 여기는 그리기만 한다.
// - 띠 바탕과 자리 머리(이름, keep·fresh, 런처, fresh면 일하는 수/상한), 건 행 머리(건 ID, 상태, 주기, 넘김 수, 시작·마지막 넘김, 첫 할 일 한 줄),
//   칸 표시(keep 자리의 일 있음·한 일·보고·주인 대기, 줄 선 일, 다른 칸 카드 가리킴, 맵에 없는 지난 세션), 접힌 줄 "+n 끝남", 잇는 선(갈라짐·되돌아감 호와 n/max·↑k·올림·보고).
// - 세션 카드와 칩은 맵의 Card가 그린다(lay.cards 항목). 움직임 없음.
// - 휴대폰(phone)은 선 없이 자리 사슬 칩과 표시만.
import { ageText } from './lib/mission-model.js';
import { caseHistory, caseStateKey } from './lib/rig-band.js';

const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const STATE_CLS = { open: 'working', waiting_owner: 'needs', blocked: 'error', done: 'done', cancelled: 'exited' };

// 칸 표시 글
export function markText(m, t) {
  switch (m.kind) {
    case 'holds': return t('rigBand.holds');
    case 'did': return m.result ? t('rigBand.did', { result: m.result }) : t('rigBand.didNone');
    case 'report': return t('rigBand.report', { value: m.value || '?' });
    case 'wait': return t('rigBand.wait');
    case 'queue': return m.status === 'cancelled' ? t('rigBand.queuedCancelled') : t('rigBand.queued');
    case 'ref': return t('rigBand.ref', { name: m.name });
    case 'past': return m.result ? t('rigBand.past', { name: m.name || '?', result: m.result }) : t('rigBand.pastNone', { name: m.name || '?' });
    default: return '';
  }
}
// 행 머리 한 줄(넘김 수, 시작, 마지막 넘김)
const metaOf = (c, t, now) => [t('rigMap.handoffs', { n: c.handoffs || 0 }), c.createdAt ? t('rigBand.started', { ago: ageText(now - c.createdAt, t) }) : null, c.lastHandoffAt && c.lastHandoffAt !== c.createdAt ? t('rigBand.last', { ago: ageText(now - c.lastHandoffAt, t) }) : null].filter(Boolean).join(' · ');

// 띠 바탕·자리 머리·행 머리·표시·접힌 줄(DOM). onMark(표시) → 머리 카드로, onHead(머리 상자, 요소) → 넘김 이력, onFold(ws) → 접힌 줄 펴기·접기
export function RigBandLayer({ rb, t, now, onMark, onHead, onFold, phone = false }) {
  if (!rb || !rb.list.length) return null;
  return (
    <>
      {rb.list.map((b) => (
        <div key={`rb:${b.ws}`} className={`mt-rb${phone ? ' phone' : ''}`} data-role="rb-band" data-ws={b.ws} style={{ left: b.box.x, top: b.box.y, width: b.box.w, height: b.box.h }}>
          {b.seats.map((s) => (
            <div key={s.name} className={`mt-rb-seat${s.old ? ' old' : ''}`} data-role="rb-seat" data-seat={s.name} style={{ left: s.x - b.box.x, top: s.y - b.box.y, width: s.w, height: s.h }}>
              <span className="sn">{s.name}</span>
              <span className="sm">{s.old ? <i className="old">{t('rigBand.old')}</i> : <i>{t(`rigBand.${s.mode}`)}</i>}{s.launcher ? <span>{s.launcher}</span> : null}{s.mode === 'fresh' && s.max != null ? <span data-role="rb-seat-live">{t('rigBand.live', { n: s.busy, max: s.max })}</span> : null}{s.waiting ? <span className="wq">{t('rigBand.waiting', { n: s.waiting })}</span> : null}</span>
            </div>
          ))}
        </div>
      ))}
      {rb.heads.map((h) => h.loose ? (
        <div key={`rh:${h.ws}:loose`} className="mt-rb-head loose" data-role="rb-head" data-loose="1" style={{ left: h.x, top: h.y, width: h.w, height: h.h }}><span className="l1"><b>{t('rigBand.loose')}</b></span></div>
      ) : (
        <button key={`rh:${h.ws}:${h.id}`} type="button" className={`mt-rb-head st-${STATE_CLS[caseStateKey(h.c.state)]}`} data-role="rb-head" data-case={h.id} data-ws={h.ws} data-state={h.c.state} style={{ left: h.x, top: h.y, width: h.w, height: h.h }} title={t('rigBand.headTip')}
          onClick={(e) => { e.stopPropagation(); onHead && onHead(h, e.currentTarget); }}>
          <span className="l1"><b>{t('rigMap.caseName', { id: h.id })}</b><span className="pill"><i />{t(`rigBand.state.${caseStateKey(h.c.state)}`)}</span>{h.c.cycle != null ? <span className="cyc">{t('rigBand.cycle')}</span> : null}{!phone ? <span className="meta">{metaOf(h.c, t, now)}</span> : null}{h.c.owner ? <span className="own">@{h.c.owner}</span> : null}</span>
          <span className="l2">{h.c.firstTask ? clip(h.c.firstTask, 80) : <span className="dim">{t('rigBand.noTask')}</span>}{h.c.blockedReason ? <span className="why"> · {clip(h.c.blockedReason, 80)}</span> : null}</span>
        </button>
      ))}
      {rb.marks.map((m) => (
        <button key={`rm:${m.ws}:${m.id}`} type="button" className={`mt-rb-mark k-${m.kind}${m.up ? ' up' : ''}`} data-role="rb-mark" data-kind={m.kind} data-case={m.caseId} data-target={m.target || undefined} style={{ left: m.x, top: m.y, width: m.w, height: m.h }}
          title={m.target ? t('rigBand.markTip') : undefined} disabled={!m.target} onClick={(e) => { e.stopPropagation(); if (m.target && onMark) onMark(m.target); }}>
          {m.up ? <span className="upk" aria-hidden="true">↑</span> : null}<span className="tx">{markText(m, t)}</span>
        </button>
      ))}
      {(rb.chains || []).map((c) => (
        <span key={`rc:${c.ws}:${c.caseId}:${c.unit}`} className={`mt-rb-link${c.queue ? ' queue' : ''}${c.open ? ' open' : ''}${c.up ? ' up' : ''}${c.arrow ? ' arrow' : ''}`} data-role="rb-link" data-seat={c.seat} style={{ left: c.x, top: c.y, width: c.w, height: c.h }}>{c.queue ? t('rigBand.queued') : c.seat}</span>
      ))}
      {rb.folds.map((f) => (
        <button key={`rf:${f.ws}`} type="button" className={`mt-rb-fold${f.open ? ' open' : ''}`} data-role="rb-fold" data-ws={f.ws} data-open={f.open ? '1' : undefined} style={{ left: f.x, top: f.y, width: f.w, height: f.h }} disabled={phone}
          onClick={(e) => { e.stopPropagation(); if (onFold) onFold(f.ws); }}>
          {f.open ? t('rigBand.foldHide') : f.n ? t('rigBand.foldMore', { n: f.n }) : t('rigBand.foldOther', { n: f.sessions })}
        </button>
      ))}
    </>
  );
}

// 띠 안 잇는 선(SVG 안에 넣는다). 되돌아감 호의 지금 셈·올림 수 이름표는 RigBandLabels
export function RigBandLines({ rb }) {
  if (!rb || !rb.lines.length) return null;
  return rb.lines.map((l) => <path key={l.id} className={`mt-rb-line k-${l.kind}${l.up ? ' up' : ''}${l.report ? ' report' : ''}`} data-role="rb-line" data-case={l.caseId} data-from={l.from} data-to={l.to} data-kind={l.kind} d={l.d} markerEnd={`url(#mt-rb-tip${l.up ? '-up' : ''})`} />);
}
export function RigBandDefs() {
  return (
    <>
      <marker id="mt-rb-tip" className="mt-rb-tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L10 5 L0 10 z" /></marker>
      <marker id="mt-rb-tip-up" className="mt-rb-tip up" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L10 5 L0 10 z" /></marker>
    </>
  );
}
export function RigBandLabels({ rb, t }) {
  if (!rb) return null;
  return rb.lines.filter((l) => l.count).map((l) => (
    <span key={`rl:${l.id}`} className={`mt-rb-count${l.count.n >= l.count.max ? ' full' : ''}`} data-role="rb-count" data-case={l.caseId} style={{ left: l.lx, top: l.ly }} title={t('rigBand.countTip', { n: l.count.n, max: l.count.max, up: l.count.up })}>
      {l.count.n}/{l.count.max}{l.count.up ? <small data-role="rb-count-up">{t('rigBand.up', { n: l.count.up })}</small> : null}
    </span>
  ));
}

// 행 머리 누르기 = 그 건의 넘김 이력(그래프의 건에서, 따로 부르지 않는다). hv: { c, x, y }(덮개 기준)
export function CaseHistory({ hv, t, now, onClose }) {
  const c = hv.c;
  const rows = caseHistory(c);
  return (
    <div className="mt-sm-peek mt-rb-hist" data-role="rb-history" data-case={c.id} style={{ left: hv.x, top: hv.y, width: 400 }} onClick={(e) => e.stopPropagation()}>
      <div className="pk1"><b>{t('rigMap.caseName', { id: c.id })}</b><span className="pst">{t(`rigBand.state.${caseStateKey(c.state)}`)}{c.owner ? <span className="dim"> · @{c.owner}</span> : null}</span></div>
      {c.firstTask ? <div className="pkt"><span className="lb">{t('rigBand.history')}</span>{clip(c.firstTask, 200)}</div> : null}
      <div className="hl">
        {rows.length ? rows.map((r, i) => (
          <div key={i} className={`hr k-${r.kind}${r.escalated ? ' up' : ''}`} data-role="rb-history-row">
            <span className="at">{r.at ? ageText(now - r.at, t) : ''}</span>
            {r.kind === 'report'
              ? <span className="tx">{t('rigBand.histReport', { seat: r.seat || '?', value: r.value || '?' })}{r.escalated ? <span className="upk" title={t('rigBand.upTip')}> ↑</span> : null}</span>
              : <span className="tx">{r.from ? <span className="dim">{t('rigBand.histFrom', { seat: r.from })} </span> : null}<b>{r.seat || '?'}</b>{r.queue ? ` ${t('rigBand.queued')}` : r.name ? ` @${r.name}` : ''}<span className="dim"> · {r.result || t(`rigBand.unit.${['open', 'done', 'cancelled'].includes(r.status) ? r.status : 'open'}`)}</span>{r.escalated ? <span className="upk" title={t('rigBand.upTip')}> ↑</span> : null}</span>}
          </div>
        )) : <div className="dim">{t('rigBand.noHistory')}</div>}
      </div>
      <button type="button" className="mt-btn small ghost" data-action="rb-history-close" onClick={onClose}>{t('common.close')}</button>
    </div>
  );
}
