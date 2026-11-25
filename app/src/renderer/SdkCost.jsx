// P361·P366: SDK 세션 노드와 세션 맵 카드의 금액 칩(추정: 판 중계기 기록 × 가격표). 값은 usage.get·usage.updated의 sdkCosts(store.usage.sdkCosts)
import { useStore } from './store.js';
import { useT } from './lib/i18n.js';
import { usd, sessionCost } from './lib/sdk-cost.js';
import { setCostRender } from './lib/cost-slot.js';

export function SdkCost({ sessionId, className = '' }) {
  const t = useT();
  const v = useStore((st) => sessionCost(st.usage, sessionId));
  const updated = useStore((st) => (st.usage && st.usage.sdkCosts && st.usage.sdkCosts.prices ? st.usage.sdkCosts.prices.updated : '?'));
  if (v == null) return null;
  return <span className={`mt-cr-cost ${className}`} data-role="sdk-cost" data-usd={v} title={t('sdkCost.title', { updated })}>{usd(v, { small: true })}</span>;
}
setCostRender((sid) => <SdkCost sessionId={sid} className="map" />); // 세션 맵 카드 자리(lib/cost-slot.js)
