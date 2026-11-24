// P356: 세션 맵 카드(PC 세션 맵 MissionLineage.jsx, 옛 휴대폰 맵 PhoneMap.jsx, 휴대폰 페이지 맵 탭 MobileMap.jsx가 같이 쓴다).
// 카드 사실(cardFacts)과 카드(Card)를 판 store·명령줄·결정 목록 없이 읽히는 가벼운 모듈로 뗐다(휴대폰 페이지 묶음이 판 화면 모듈을 들이지 않게).
// - 판 store에 기대는 표식(결정 표식, 레인 칩, 일 기록 단추, 폭주 배지, 할 일 배지)은 parts로 받는다. PC는 MissionLineage.jsx가 모두 넘기고, 휴대폰 맵 탭은 할 일 배지만 넘긴다
// - 카드를 그릴 때 세는 성능 기록(perf-trace noteMap)도 판 화면만 setCardDrawHook으로 단다
import { memo, useRef } from 'react';
import { kindOf } from './lib/kinds.js';
import { bgShow, bgText, bgKindsText } from './lib/bg-work.js'; // P164
import { orchTag, sessionProgress, progressChip } from './lib/orch.js'; // P296. P300
import { STATE_LABEL, shellProgram, shellStateText } from './lib/labels.js'; // P309
import { roleText, modelText, ageText } from './lib/mission-model.js';
import { useRowFit } from './lib/row-fit.js'; // P307
import { onLightStart } from './lib/work-light.js';

const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
export const BgIcon = () => <svg className="mt-bg-ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="2.5" width="8" height="8" rx="1.5" /><path d="M10.5 13.5h-6a2 2 0 0 1-2-2v-6" /></svg>;
export function BgBadge({ f, role }) { return f.bg ? <span className="mt-bg-badge" data-role={role} data-bg-n={f.bg.n} data-bg-kinds={f.bg.kinds.join(',')} title={f.bgKinds}><BgIcon />{f.bgText}</span> : null; }
export const branchOfLive = (live) => (live && live.git && live.git.isWorktree && live.git.branch) || null;
export const ST = { turn: 'needs', alert: 'error', work: 'working', review: 'done', rest: 'ready', sleep: 'sleeping', done: 'exited' };
export const IDLE = new Set(['rest', 'sleep', 'done']);
let drawHook = null;
export const setCardDrawHook = (fn) => { drawHook = fn; };
const NONE = () => null;
const NO_PARTS = {};

// P107: 테두리를 따라 도는 빛 층(Mission.jsx에서 옮김)
export function MissionLight({ role }) {
  return (
    <span className="mt-mm-light" data-role={role} aria-hidden="true" onAnimationStart={onLightStart}>
      <i className="mt-mm-lring"><i className="mt-mm-lspin" /></i>
    </span>
  );
}

// P119: 작업 완료 카드의 끝 표식(위 가장자리 꼬리표 안의 체크). 색만으로 가르지 않게 모양과 글을 함께 둔다(휴대폰 PhoneMission.jsx도 같은 모양)
export const DoneMark = () => <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3 5 8.7 9.6 3.6" /></svg>;

export function cardFacts(n, live, m, tier, t, now, { parentName = null, parentWs = null, cross = false, kids = 0, mergerFor = null } = {}) { // P276: mergerFor = head 위에 얹은 merger 카드의 head 이름
  const kind = (live && (live.flavor || live.kind)) || n.agentKind || 'claude';
  const k = kindOf(kind);
  const shell = k.id === 'shell';
  const state = live ? live.state : n.state;
  const cmd = live && live.shell && live.shell.atPrompt === false ? live.shell.command || (live.shell.procs || []).join(', ') : null;
  const stateText = tier === 'review' ? t('doneMark.tag') : shell && state !== 'exited' && state !== 'sleeping' ? (live && shellProgram(live) ? shellStateText(live) : cmd ? STATE_LABEL.shell_running : STATE_LABEL.shell_idle) : STATE_LABEL[state] || state || '';
  const turnAt = n.turnAt || (live && live.state === 'working' && live.turn && live.turn.startedAt) || null;
  const activeAt = (live && live.lastActivityAt) || n.activeAt || null; // P210: 창이 가진 세션 값이 먼저(그래프는 활동 시각만 바뀌면 다시 읽지 않는다)
  const age = tier === 'work' && turnAt ? ageText(now - turnAt, t) : activeAt ? ageText(now - activeAt, t) : null;
  const model = shell ? null : live && live.model ? modelText(live.model, live.effort) : modelText(n.model, n.effort);
  // P157: 하위를 불렀던 세션(닫힌 하위·최근 지시)·상위가 닫힌 세션은 솔로가 아니다. 역할 자리에 작게 그 까닭
  const called = n.closedKids ? t('mmLine.closedKids', { n: n.closedKids }) : n.assignAt ? t('mmLine.assigned') : n.parentClosed ? t('mmLine.parentClosed') : null;
  const role = mergerFor ? t('merger.mapFor', { name: mergerFor }) : m ? (m.rank === 'solo' ? ((n.peers || []).length ? t('mmLine.peer') : called || t('mmTerr.solo')) : roleText(m, t, { short: true })) : ''; // r11: 정한 동료는 '동료'
  const lp = n.lastPrompt || (live && live.lastPrompt) || null;
  const ask = n.ask || (live && live.ask && (live.ask.summary || live.ask.kind)) || null;
  const err = live && live.error ? (live.error.message || String(live.error)) : n.error || null;
  let taskKind, task;
  if (tier === 'work') { taskKind = 'now'; task = cmd ? `$ ${cmd}` : lp; }
  else if (tier === 'turn') { taskKind = 'ask'; task = ask || lp; }
  else if (tier === 'alert') { taskKind = 'fail'; task = lp || ask; }
  else if (tier === 'review') { taskKind = 'did'; task = lp; }
  else { taskKind = 'last'; task = lp; }
  const rel = parentName ? t(`mmTerr.rel.${['spawn', 'role', 'prompt'].includes(n._rel) ? n._rel : 'spawn'}`, { name: parentName }) : kids ? t('mmTerr.leads', { n: kids }) : t('mmTerr.rel.none');
  const relText = cross && parentWs ? t('mmTerr.rel.inWs', { text: rel, ws: parentWs }) : rel;
  const branch = n.gitBranch || branchOfLive(live);
  // 카드 맨 아래 줄은 다른 워크스페이스에서 온 것(선이 멀리 간다)·브랜치·루프만(풍선 도움말 relAll에는 관계 전부)
  const extra = [branch ? `⎇ ${branch}` : null, n.loops ? `⟳${n.loops}` : null];
  const more = [cross && parentWs ? relText : null, ...extra].filter(Boolean).join(' · ');
  const relAll = [relText, ...extra].filter(Boolean).join(' · ');
  const bg = bgShow(n, live, tier); // P164: 쉬는 세션에 도는 뒤 일(뒤 셸·뒤 하위 에이전트)
  const orch = orchTag({ orch: (live && live.orch) || n.orch || null }, t); // P296: 자체 오케스트레이션 표
  const progress = sessionProgress({ orch: (live && live.orch) || null, subs: (live && live.subs) || null }); // P322: 보통 세션의 서브에이전트 // P300: 안 진행(깨어 있는 세션의 요약에만 있다)
  const prog = progress ? progressChip(progress, t) : null;
  return { orch, progress, prog, kind, k, shell, state, stateText, age, model, role, taskKind, task: task ? clip(task, 200) : null, err: tier === 'alert' && err ? clip(err, 200) : null, more, relAll, harness: k.label, bg, bgText: bg ? bgText(bg, t) : null, bgKinds: bg ? bgKindsText(bg, t) : null };
}

// 카드 하나. 멀리 타일(이름·상태)과 보통 사실을 둘 다 그리고 단계 클래스(.lv-far 등)로 갈아 끼운다
// P157: 카드에는 브라우저 풍선(title)을 달지 않는다. 마우스를 올리면 미리 보기(Peek) 하나만 뜬다(전에는 둘이 함께 떴다). 같은 사실은 aria-label에
// P293: lite = 휴대폰 맵 가볍게 열림(먼 타일·결정 표식을 그리지 않는다. 멀리 단계에서도 보통 사실을 보인다, phone.css)
// P331: todo = PC 세션 맵(할 일 배지, 이름 옆 할 일 표식 대신). 휴대폰 맵은 그대로
// P356: parts = 판 store에 기대는 표식들(없으면 그리지 않는다)
// P333·P335: PC 세션 맵은 할 일 배지와 작업 완료 꼬리표를 오른쪽 위 한 무리(.mt-sm-tags)로 세로로 쌓는다: 작업 완료가 위 테두리 자리, 할 일이 그 바로 위. 하나만 있으면 그것이 테두리 자리
export const Card = memo(function Card({ id, b, f, tier, lead, tagged, onTag, onOpen, onHover, t, unfold = false, onFold = null, lite = false, fit = false, todo = false, parts = NO_PARTS }) {
  if (drawHook) drawHook();
  const { Decision: DecisionMark = NONE, Manager: ManagerChip = NONE, Record: RecordChip = NONE, Guard: GuardBadge = NONE, Todo: TodoBadge = NONE } = parts; // P356
  const rowRef = useRef(null), nameRef = useRef(null);
  useRowFit(rowRef, nameRef, fit && !b.thin); // P307: 휴대폰 맵(fit)에서만
  const n = b.node;
  const st = ST[tier] || 'ready';
  const cls = `mt-ta-slot st-${st}${f.shell ? ' shell' : ''}${IDLE.has(tier) ? ' idle' : ''}${lead ? ' lead' : ''}${tagged ? ' tagged' : ''}${b.thin ? ' thin' : ''}${b.merger ? ' merger' : ''}${b.merger && b.merger.head && b.merger.idle ? ' merger-idle' : ''}`; // P276: merger 카드
  const tip = [`@${n.name}${f.role ? ` · ${f.role}` : ''}`, `${f.stateText}${f.age ? ` · ${f.age}` : ''}`, [f.harness, f.model].filter(Boolean).join(' · '), f.task ? `${t(`mmTerr.kind.${f.taskKind}`)}: ${f.task}` : null, f.bg ? `${f.bgText} (${f.bgKinds})` : null, f.prog ? f.prog.text : null, f.err, f.relAll, t(f.shell ? 'mmTerr.cardTipShell' : 'mmTerr.cardTip'), t('mmLine.cardDragTip')].filter(Boolean).join('\n');
  const done = tier === 'review';
  return (
    <div className={cls} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} data-role="ta-slot" data-id={id} data-tier={tier} data-ws={b.ws} data-thin={b.thin ? '1' : undefined} data-chip={b.chip ? '1' : undefined} data-case={b.caseId || undefined}>
      <div className="mt-ta-card" role="button" tabIndex={0} aria-pressed={tagged ? 'true' : 'false'} data-role="mm-node" data-kind="session" data-id={id} data-name={n.name} data-tier={tier} data-tagged={tagged ? '1' : undefined} aria-label={tip.replace(/\n/g, ', ')}
        onClick={(e) => onTag(id, e)} onDoubleClick={() => onOpen(id, true)} onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(id, e.currentTarget)} onPointerLeave={() => onHover(null)} onFocus={(e) => onHover(id, e.currentTarget)} onBlur={() => onHover(null)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(id); } else if (e.key === ' ') { e.preventDefault(); onTag(id); } }}>
        {/* P163: 얇은 줄(하위 많은 리드 아래 절전 하위) = 상태 점 + 이름 + 지난 시간 한 줄. 조작은 카드와 같다 */}
        {b.thin ? <span className="mt-sm-thin" data-role="ta-thin"><i /><span className="cname" data-role="ta-name">{n.name}</span>{f.age ? <span className="cago">{f.age}</span> : null}</span> : null}
        {tier === 'work' && <MissionLight role="ta-light" />}
        {todo ? (
          <span className="mt-sm-tags" data-role="map-tags"><GuardBadge sessionId={n.sessionId} where="map" /><TodoBadge sessionId={n.sessionId} />{done && <span className="mt-mm-donetag" data-role="mm-done"><DoneMark />{t('doneMark.tag')}</span>}</span>
        ) : done && <span className="mt-mm-donetag" data-role="mm-done"><DoneMark />{t('doneMark.tag')}</span>}
        {!b.thin && !lite && <span className="mt-ta-tile" aria-hidden="true"><span className="tn">{n.name}<DecisionMark sessionId={n.sessionId} className="mt-dc-mark map tile" rideOnly={todo} /></span><span className="ts">{b.merger ? <span className="mt-sm-merger-tile" data-role="ta-merger-tile">{t('merger.tag')}</span> : null}{done ? <span className="dim">{f.age || ''}</span> : <><i />{f.stateText}</>}{f.bg ? <span className="mt-bg-tile" data-role="ta-bg-tile"><BgIcon />{f.bg.n}</span> : null}{f.prog ? <span className={`mt-prog-chip tile${f.prog.finished ? ' finished' : ''}${f.prog.failed ? ' failed' : ''}${f.prog.running ? ' running' : ''}`} data-role="ta-progress-tile">{f.prog.short}</span> : null}</span></span>}
        {!b.thin && <span className="mt-ta-full">
          <span className="c1" ref={rowRef}>{lead ? <span className="mt-sm-lead">{t('mmLine.lead')}</span> : null}{b.merger ? <span className="mt-sm-lead mt-sm-merger" data-role="ta-merger-tag">{t('merger.tag')}</span> : null}<span className="cname" data-role="ta-name" ref={nameRef}>{n.name}</span>{lite ? null : <DecisionMark sessionId={n.sessionId} className="mt-dc-mark map" rideOnly={todo} />}{lite ? null : <ManagerChip sessionId={n.sessionId} map />}<span className="cst" data-role="ta-state">{done ? (f.age ? <span className="cago">{f.age}</span> : null) : <><i />{f.stateText}{f.age ? <span className="cago"> · {f.age}</span> : null}</>}</span><BgBadge f={f} role="ta-bg" /><RecordChip sessionId={n.sessionId} where="map" />{f.orch ? <span className={`mt-orch-tag map${f.orch.busy ? ' busy' : ''}`} data-role="ta-orch" data-busy={f.orch.busy ? '1' : '0'}>{f.orch.text}</span> : null}</span>
          <span className="c2" data-role="ta-meta">{f.role ? <span className="crole">{f.role}</span> : null}{f.role ? <span className="dotsep">/</span> : null}<span className="hb">{f.k.mark}</span><span>{f.harness}</span>{f.model ? <><span className="dotsep">/</span><span className={f.prog ? 'cmodel' : undefined}>{f.model}</span></> : null}{f.prog ? <span className={`mt-prog-chip map${f.prog.finished ? ' finished' : ''}${f.prog.failed ? ' failed' : ''}${f.prog.running ? ' running' : ''}`} data-role="ta-progress" data-done={f.progress.done} data-total={f.progress.total} data-finished={f.prog.finished ? '1' : '0'}>{f.prog.text}</span> : null}</span>
          <span className={`c3${f.err ? ' one' : ''}`} data-role="ta-task">{f.task ? <b>{t(`mmTerr.kind.${f.taskKind}`)}</b> : null}{f.task || t('mmMap3.noTask')}</span>
          {f.err ? <span className="cerr" data-role="ta-err">{f.err}</span> : null}
          {f.more ? <span className="c4" data-role="ta-more">{f.more}</span> : null}
        </span>}
        {/* P153 r11: 깊이 접기 칩. 누르면 이 가지만 펴거나 다시 접는다(카드 태그·판으로 가기와 따로) */}
        {onFold && (b.fold > 0 || unfold) ? (
          <button type="button" className={`mt-sm-fold${unfold ? ' open' : ''}`} data-action="ln-fold" data-id={id} title={t(unfold ? 'mmLine.unfoldTip' : 'mmLine.foldTip')}
            onClick={(e) => { e.stopPropagation(); onFold(id); }} onDoubleClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
            {unfold ? t('mmLine.unfold') : t('mmLine.fold', { n: b.fold })}
          </button>
        ) : null}
      </div>
    </div>
  );
});
