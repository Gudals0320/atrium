// P69 설정 › 일반 › 업데이트 묶음과 웹 화면의 "PC에서 업데이트 중" 띠.
// 묶음: 새 릴리즈 확인 켜기·끄기(판 설정 updateCheck), 지금 버전, 최신 버전과 릴리즈 노트 링크, 지금 확인, 업데이트(누르면 한 번 더 묻는다), 앞 버전으로 되돌리기, 진행.
// 업데이트는 이 PC의 창에서만 한다(웹 화면은 보기만). 받기와 준비 동안 판은 그대로 돌고, 끝나면 백엔드와 창만 다시 뜬다(herdr의 세션은 그대로).
// P70: 업데이트 채널(판 설정 updateChannel, 정식·dev). 고르면 백엔드가 곧바로 다시 확인한다. dev 빌드를 쓰는 중이면 버전 뒤에 (dev)를 붙인다.
import { useState } from 'react';
import { api } from './api.js';
import { toast } from './store.js';
import { useT, errText, getLanguage } from './lib/i18n.js';
import { useUpdate, checkNow, applyUpdate, rollbackUpdate } from './update.js';
import { isWeb } from './web.js';
import { SetRow, SetNote, SetSub } from './Settings.jsx';
import { channelOf, versionLabel, vTag } from './lib/update-notice.js';

const when = (ms) => { if (!ms) return ''; try { return new Date(ms).toLocaleString(getLanguage(), { dateStyle: 'medium', timeStyle: 'short' }); } catch { return new Date(ms).toLocaleString(); } }; // 화면 언어로

export function UpdateSettings({ settings }) {
  const t = useT();
  const view = useUpdate((s) => s.view);
  const busy = useUpdate((s) => s.busy);
  const restarting = useUpdate((s) => s.restarting);
  const [asking, setAsking] = useState(null); // 'apply' | 'rollback'
  const [pending, setPending] = useState(null);
  const [chPending, setChPending] = useState(null); // 누른 채널(백엔드가 settings.updated로 확정할 때까지)
  if (!view) return null; // 옛 백엔드
  const job = view.job && view.job.phase !== 'failed' ? view.job : null;
  const failed = view.job && view.job.phase === 'failed' ? view.job : null;
  const winVersion = api.info && api.info.appVersion;
  const toggle = async (value) => {
    setPending(value);
    try { await api.call('settings.set', { key: 'updateCheck', value }); if (value) checkNow(); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); }
    setPending(null);
  };
  const channel = chPending || channelOf(settings.updateChannel || view.channel);
  const pickChannel = async (value) => {
    setChPending(value);
    try { await api.call('settings.set', { key: 'updateChannel', value }); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); }
    setChPending(null);
  };
  const status = view.error ? t(view.error === 'no_release' ? 'update.noRelease' : 'update.checkFailed', { error: view.error })
    : view.available ? t('update.availableLine', { version: view.latest.tag })
    : view.latest ? t('update.upToDate', { version: vTag(view.current.version) }) : t('update.notChecked');
  const go = async () => { const kind = asking; setAsking(null); if (kind === 'apply') await applyUpdate(); else if (kind === 'rollback') await rollbackUpdate(); };
  const local = !isWeb;
  return <>
    <SetSub>{t('update.group')}</SetSub>
    <SetRow name={t('update.checkName')} hint={t('update.checkHint')} role="update-check-setting">
      <span className="mt-set-toggle"><input type="checkbox" checked={pending ?? (settings.updateCheck !== false)} data-field="setting-updateCheck" onChange={(e) => toggle(e.target.checked)} /><span>{(pending ?? (settings.updateCheck !== false)) ? t('settings.on') : t('settings.off')}</span></span>
    </SetRow>
    {'updateChannel' in settings && <div className="mt-set-row" data-role="update-channel-setting">
      <span className="mt-set-name">{t('update.channelName')}</span>
      <span className="mt-set-value mt-seg-lang" data-field="setting-updateChannel" data-value={channel} role="radiogroup">
        {['stable', 'dev'].map((c) => (
          <button key={c} type="button" role="radio" aria-checked={channel === c} className={`mt-btn small${channel === c ? ' primary' : ' ghost'}`} data-channel={c} disabled={!!chPending} onClick={() => channel !== c && pickChannel(c)}>{t(`update.channel.${c}`)}</button>
        ))}
      </span>
      <span className="mt-set-hint">{t(channel === 'dev' ? 'update.channelDevHint' : view.current.prerelease ? 'update.channelStableFromDev' : 'update.channelStableHint')}</span>
    </div>}
    <div className="mt-set-row" data-role="update-version">
      <span className="mt-set-name">{t('update.versionName')}</span>
      <span className="mt-set-value mt-upd-ver" data-field="update-current" data-value={view.current.version || ''}>
        <b>{view.current.version ? versionLabel(view.current.version) : t('common.unknown')}</b>
        {winVersion && winVersion !== view.current.version && <span className="dim"> · {t('update.windowVersion', { version: `v${winVersion}` })}</span>}
      </span>
      <span className="mt-set-hint" data-role="update-status" data-available={view.available ? '1' : '0'}>
        {status}{view.checkedAt ? ` · ${t('update.checkedAt', { when: when(view.checkedAt) })}` : ''}
      </span>
    </div>
    <div className="mt-set-row" data-role="update-actions">
      <span className="mt-set-name" />
      <span className="mt-set-value mt-upd-actions">
        <button type="button" className="mt-btn small ghost" data-action="update-check" disabled={busy || !!job} onClick={() => checkNow()}>{t('update.checkNow')}</button>
        {local && view.available && <button type="button" className="mt-btn small primary" data-action="update-apply" disabled={busy || !!job || !view.allowed} onClick={() => setAsking('apply')}>{t('update.applyTo', { version: view.latest.tag })}</button>}
        {view.latest && view.latest.url && <a className="mt-btn small ghost" href={view.latest.url} target="_blank" rel="noreferrer" data-action="update-notes">{t('update.notes')}</a>}
        {local && view.canRollback && !view.available && <button type="button" className="mt-btn small ghost" data-action="update-rollback" disabled={busy || !!job} onClick={() => setAsking('rollback')}>{t('update.rollbackTo', { version: view.previous })}</button>}
      </span>
      <span className="mt-set-hint">{!local ? t('update.pcOnly') : !view.allowed ? t('update.notAllowed') : !view.current.installed ? t('update.gitHint') : view.available ? t('update.installedHint') : view.canRollback ? t('update.rollbackHint', { version: view.previous }) : ''}</span>
    </div>
    {asking && (
      <div className="mt-set-note mt-upd-ask" data-role="update-confirm">
        <span>{asking === 'apply' ? t('update.confirmTitle', { version: view.latest ? view.latest.tag : '' }) : t('update.rollbackTitle', { version: view.previous })} {t('update.confirmBody')}</span>
        <span className="mt-upd-ask-btns">
          <button type="button" className="mt-btn small primary" data-action="update-confirm" onClick={go}>{asking === 'apply' ? t('update.apply') : t('update.rollback')}</button>
          <button type="button" className="mt-btn small ghost" data-action="update-cancel" onClick={() => setAsking(null)}>{t('common.cancel')}</button>
        </span>
      </div>
    )}
    {(job || restarting) && <div className="mt-set-note mt-upd-progress" data-role="update-progress" data-phase={restarting ? 'restarting' : job.phase} data-step={job ? job.step || '' : ''}>
      <span className="mt-upd-spin" />{restarting || job.phase === 'restarting' ? t('update.phaseRestarting') : t(`update.step.${job.step || 'download'}`)}{job && job.part ? ` (${job.part})` : ''}
    </div>}
    {failed && !job && <div className="mt-set-note mt-upd-error" data-role="update-error">{t('update.failed', { error: failed.error })}</div>}
    {view.latest && view.latest.notes && view.available && <pre className="mt-upd-notes" data-role="update-notes-text">{view.latest.notes}</pre>}
    <SetNote>{t('update.note')}</SetNote>
  </>;
}

// 웹 화면: PC가 업데이트로 백엔드를 다시 띄우는 동안의 띠. 다시 붙으면(update.status) 내린다
export function UpdateBanner() {
  const t = useT();
  const restarting = useUpdate((s) => s.restarting);
  if (!restarting) return null;
  return <div className="mt-reconnect mt-upd-banner" role="status" data-role="update-banner"><span className="mt-reconnect-dot" /><span>{t('update.webBanner', { version: (restarting.to && restarting.to.tag) || '' })}</span></div>;
}
