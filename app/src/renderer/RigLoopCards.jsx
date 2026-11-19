// P230(rig2-design 11.12의 4): rig 판의 고리 카드. 판 API rig.loops(고리 목록과 상태)를 읽고 판 이벤트 rig.loops에 다시 읽는다.
// every 고리 카드에 [지금 돌리기](rig.run: 이 PC의 창과 연결한 기기). 끝나지 않은 회가 있거나 고리가 멈췄으면 판이 건너뛰고 그 까닭을 알림으로 보인다
import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { toast } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { loopCardView, runToast } from './lib/rig-loop-card.js';

export function RigLoopCards({ ws }) {
  const t = useT();
  const [loops, setLoops] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => api.call('rig.loops', { workspace: ws.key }).then((r) => setLoops((r && r.loops) || []), () => setLoops([])), [ws.key]);
  useEffect(() => {
    load();
    const offs = ['rig.loops', 'rig.cases'].map((n) => api.on(n, (ev) => { if (!ev || !ev.workspace || ev.workspace === ws.key) load(); }));
    return () => offs.forEach((f) => f());
  }, [ws.key, load]);
  if (!loops || !loops.length) return null;
  const run = async (name) => {
    setBusy(name);
    try { const r = await api.call('rig.run', { workspace: ws.key, loop: name }); const m = runToast(r); toast(t(m.key, m.vars), m.kind); load(); }
    catch (e) { toast(t('rigP230.runFail', { error: errText(e) }), 'error'); } finally { setBusy(null); }
  };
  return (
    <>
      <div className="mt-rigon-h">{t('rigP230.loopsHead')}</div>
      <div className="mt-rigloops" data-role="rig-loops">
        {loops.map((l) => {
          const v = loopCardView(l);
          return (
            <div key={v.name} className={`mt-rigloop ${v.state}`} data-role="rig-loop" data-loop={v.name} data-state={v.state}>
              <div className="mt-rigloop-head">
                <b>{v.name}</b>
                {v.kind === 'improve' && <span className="mt-rigloop-tag">{t('rigP230.kindImprove')}</span>}
                <span className={`mt-rigloop-state ${v.state}`}>{t(`rigP230.loopState.${v.state}`)}</span>
              </div>
              <div className="mt-rigloop-meta dim">
                {t(v.trigger.key, v.trigger.vars)}
                {v.nextAt != null && <> · {t('rigP230.next', { when: new Date(v.nextAt).toLocaleString() })}</>}
                {' · '}{v.last ? t('rigP230.last', { name: v.last.name, state: t(`rigBand.state.${v.last.state}`) }) : t('rigP230.noRuns')}
              </div>
              {v.canRun && (
                <div className="mt-rigloop-acts">
                  <button type="button" className="mt-btn small" data-action="rig-loop-run" data-loop={v.name} disabled={busy === v.name} title={t('rigP230.runNowTip')} onClick={() => run(v.name)}>{t('rigP230.runNow')}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
