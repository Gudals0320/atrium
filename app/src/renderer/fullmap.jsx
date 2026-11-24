// P353: 휴대폰 전용 페이지의 "전체 맵". 옛 휴대폰 세션 맵(PhoneMission.jsx → PhoneMap.jsx)을 그대로 띄운다.
// 이 묶음(fullmap.js·fullmap.css)은 단추를 누를 때만 읽는다. 연 동안은 판 이벤트 전부(events.subscribe)를 받아 판 store.js가 세션·판을 채우고,
// 닫으면 휴대폰 구독(phone.subscribe, 차이만)으로 돌아간다
import './styles.css';
import './phone.css';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import { PhoneMission } from './PhoneMission.jsx';
import { t } from './lib/i18n.js';

export function mountFullMap(el, { onOpen, onClose }) {
  const prev = api.subscribe;
  api.subscribe = null;
  api.resubscribe().catch(() => {});
  const root = createRoot(el);
  const head = <button type="button" className="mt-ph-icon" data-action="mp-fullmap-close" aria-label={t('common.close')} title={t('common.close')} onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>;
  root.render(<div className="mt-phone" data-role="phone" data-view="mission"><PhoneMission onOpen={onOpen} head={head} /></div>);
  return () => { root.unmount(); api.subscribe = prev; api.resubscribe().catch(() => {}); };
}
