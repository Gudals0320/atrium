// P370: 메모리 알약 펼침 맨 위의 추이 그림(직전 약 30분). 판 세션 합 메모리와 합 CPU를 축을 나눈 작은 두 칸으로(겹친 두 축 없음),
//   지금 값과 구간 최고를 글로, 폭주 감시 경보·잠재우기를 아래 표시 줄의 점으로. 가리키거나(마우스) 초점을 두고 ←→로 옮기면 그 때·값·표시(세션 이름).
//   값은 판 API resources.trend(백엔드 resource-trend.mjs, 메모리에만 둔 30초 칸 60개). 펼침이 열린 동안만 받는다(이 컴포넌트는 열릴 때만 그린다).
//   움직임 없음(사용자 PC는 움직임 줄이기). 모형과 셈은 lib/trend.js
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useT, fmtTime as fmtT } from './lib/i18n.js';
import { fmtMB } from './sleep.js';
import { fmtPct } from './lib/p255.js';
import { trendModel, nearestPoint, marksNear, markLine, markClass, legendKinds, orDash } from './lib/trend.js';

export const TREND_REFRESH_MS = 10_000; // 열린 동안 다시 받는 간격(칸은 30초, 마지막 칸이 차 가는 것을 보이게)
const W = 372, H = 34, LANE = 14;
const fmt = { mem: fmtMB, pct: fmtPct };
const fmtTime = (at) => fmtT(at, { hour: '2-digit', minute: '2-digit' });
const COLOR = { sleep: 'var(--st-sleeping)', suspect: 'var(--bad)', heavy: 'var(--warn)' };
const markColor = (k) => COLOR[markClass(k)];
const mb = (v) => orDash(v, fmtMB), pct = (v) => orDash(v, fmtPct); // 모르는 값은 줄표

function Plot({ lane, model, hoverX, role }) {
  const sys = lane.sys;
  return (
    <svg className="mt-trend-plot" data-role={role} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true">
      <line className="mt-trend-base" x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} />
      {model.marks.map((k, i) => <line key={'m' + i} className="mt-trend-tick" x1={k.x} x2={k.x} y1="0" y2={H} style={{ stroke: markColor(k) }} />)}
      {sys ? sys.paths.map((d, i) => <path key={'s' + i} className="mt-trend-sys" d={d} />) : null}
      {sys ? sys.dots.map((p, i) => <circle key={'sd' + i} className="mt-trend-sysdot" cx={p.x} cy={p.y} r="1.5" />) : null}
      {lane.areas.map((d, i) => <path key={'a' + i} className="mt-trend-area" d={d} />)}
      {lane.paths.map((d, i) => <path key={'p' + i} className="mt-trend-line" d={d} />)}
      {lane.dots.map((p, i) => <circle key={'d' + i} className="mt-trend-dot" cx={p.x} cy={p.y} r="3" />)}
      {lane.end ? <circle className="mt-trend-end" cx={lane.end.x} cy={lane.end.y} r="3" /> : null}
      {hoverX != null ? <line className="mt-trend-cross" x1={hoverX} x2={hoverX} y1="0" y2={H} /> : null}
    </svg>
  );
}

export function ResTrend({ cores = 1 }) {
  const t = useT();
  const [data, setData] = useState(null); // null: 아직, false: 받지 못함(옛 백엔드)
  const [hover, setHover] = useState(null); // { px, i, marks }
  const box = useRef(null);
  useEffect(() => {
    let live = true;
    const get = () => api.call('resources.trend').then((d) => { if (live) setData(d || false); }).catch(() => { if (live) setData((v) => v || false); });
    get();
    const id = setInterval(get, TREND_REFRESH_MS);
    return () => { live = false; clearInterval(id); };
  }, []);
  const model = useMemo(() => (data ? trendModel(data, { w: W, h: H }) : null), [data]);
  if (data === false) return null;
  const mins = model ? Math.round((model.to - model.from + model.bucketMs) / 60000) : 30;
  if (!model || model.empty) {
    return (
      <div className="mt-trend" data-role="res-trend" data-empty="1">
        <div className="mt-trend-empty" data-role="res-trend-empty">{t('p370.empty', { min: mins })}</div>
      </div>
    );
  }
  const pick = (px) => {
    const near = marksNear(model, px, 8);
    const at = near.length ? near[0].x : px; // 표시 가까이면 그 표시에 붙인다(그 칸의 값과 함께)
    const i = nearestPoint(model, at);
    if (i < 0) return setHover(null);
    setHover({ px: near.length ? near[0].x : model.x(model.points[i].at), i, marks: near });
  };
  const onMove = (e) => {
    const svg = box.current && box.current.querySelector('svg');
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    pick(((e.clientX - r.left) / r.width) * W);
  };
  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault(); e.stopPropagation();
    const n = model.points.length;
    const i = hover ? Math.max(0, Math.min(n - 1, hover.i + (e.key === 'ArrowLeft' ? -1 : 1))) : n - 1;
    const p = model.points[i];
    const near = marksNear(model, model.x(p.at), (model.w / Math.max(1, (model.to - model.from) / model.bucketMs)) / 2);
    setHover({ px: model.x(p.at), i, marks: near });
  };
  const hp = hover ? model.points[hover.i] : null;
  const kinds = legendKinds(model.marks);
  const tipLeft = hover ? (hover.px > W / 2 ? null : `calc(${(hover.px / W) * 100}% + 10px)`) : null;
  const tipRight = hover && hover.px > W / 2 ? `calc(${100 - (hover.px / W) * 100}% + 10px)` : null; // 가는 선을 가리지 않게 옆으로
  return (
    <div className="mt-trend" data-role="res-trend" data-points={model.points.length} data-marks={model.marks.length}>
      <div className="mt-trend-head" data-role="res-trend-mem-head">
        <span className="mt-trend-name">{t('p370.mem')}</span>
        <b className="mono">{mb(model.mem.now)}</b>
        {model.mem.peak != null ? <span className="dim" title={model.mem.peakAt ? fmtTime(model.mem.peakAt) : undefined}>{t('p370.peak', { v: fmtMB(model.mem.peak) })}</span> : null}
        {model.sysMemPct != null ? <span className="dim mt-trend-right" data-role="res-trend-pcmem" title={t('p370.pcMemTitle', { total: model.totalMemMB ? fmtMB(model.totalMemMB) : '?' })}>{t('p370.pc', { v: fmtPct(model.sysMemPct) })}</span> : null}
      </div>
      <div ref={box} className="mt-trend-box" tabIndex={0} role="img" aria-label={t('p370.aria', { min: mins, mem: mb(model.mem.now), memPeak: mb(model.mem.peak), cpu: pct(model.cpu.now), cpuPeak: pct(model.cpu.peak), n: model.marks.length })}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)} data-role="res-trend-box">
        <Plot lane={model.mem} model={model} hoverX={hover ? hover.px : null} role="res-trend-mem" />
        <div className="mt-trend-head" data-role="res-trend-cpu-head">
          <span className="mt-trend-name" title={t('p370.cpuTitle')}>{t('p370.cpu')}</span>
          <b className="mono">{pct(model.cpu.now)}</b>
          {model.cpu.peak != null ? <span className="dim" title={model.cpu.peakAt ? fmtTime(model.cpu.peakAt) : undefined}>{t('p370.peak', { v: fmtPct(model.cpu.peak) })}</span> : null}
          {model.cpu.sys.now != null ? <span className="dim mt-trend-right" data-role="res-trend-pccpu" title={t('p370.pcCpuTitle')}><i className="mt-trend-key sys" aria-hidden="true" />{t('p370.pc', { v: fmtPct(model.cpu.sys.now) })}</span> : null}
        </div>
        <Plot lane={model.cpu} model={model} hoverX={hover ? hover.px : null} role="res-trend-cpu" />
        <svg className="mt-trend-lane" viewBox={`0 0 ${W} ${LANE}`} width="100%" height={LANE} preserveAspectRatio="none" data-role="res-trend-lane" aria-hidden="true">
          {model.marks.map((k, i) => (
            <circle key={i} className={`mt-trend-mark ${markClass(k)}`} cx={k.x} cy={LANE / 2} r="4" data-role="res-trend-mark" data-type={k.type} data-kind={k.kind || undefined} data-name={k.name} data-at={k.at} />
          ))}
          {hover ? <line className="mt-trend-cross" x1={hover.px} x2={hover.px} y1="0" y2={LANE} /> : null}
        </svg>
        {hp ? (
          <div className="mt-trend-tip" data-role="res-trend-tip" style={{ left: tipLeft ?? undefined, right: tipRight ?? undefined }}>
            <div className="dim">{fmtTime(hp.at)}{hp.n ? <span> · {t('p370.tipAvg', { n: hp.n })}</span> : null}</div>
            <div><b className="mono">{mb(hp.memMB)}</b> <span className="dim">{t('p370.mem')}</span></div>
            <div><b className="mono">{pct(hp.cpuPct)}</b> <span className="dim">{t('p370.tipCpu', { max: pct(hp.cpuMax), pc: pct(hp.sysCpuPct) })}</span></div>
            {hover.marks.map((k, i) => { const l = markLine(k, fmt, cores); const what = (l.what || []).map((w) => t(`p370.what.${w}`)).join(' + '); return <div key={i} className="mt-trend-tipmark" data-role="res-trend-tipmark"><i className={`mt-trend-key ${markClass(k)}`} aria-hidden="true" />{fmtTime(k.at)} {t(l.key, { ...l.vars, what: what || '?' })}</div>; })}
          </div>
        ) : null}
      </div>
      <div className="mt-trend-foot dim">
        <span data-role="res-trend-from">{model.points.length < 3 ? t('p370.collecting') : t('p370.ago', { min: mins })}</span>
        {kinds.length ? <span className="mt-trend-legend" data-role="res-trend-legend">{kinds.map((k) => <span key={k}><i className={`mt-trend-key ${k}`} aria-hidden="true" />{t(`p370.legend.${k}`)}</span>)}</span> : null}
        <span>{t('p370.now')}</span>
      </div>
    </div>
  );
}
