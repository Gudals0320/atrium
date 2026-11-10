// P112: 판 배율을 React 렌더 없이 따라간다. 판을 끌거나 확대·축소하는 동안 노드가 배율을 구독하면 프레임마다 노드 전체(머리줄, 터미널 감싸개 등)가
// 다시 그려져 렌더러 주 스레드가 거의 다 바빴다. 배율에 따라 바뀌는 값 가운데 CSS 변수는 여기서 요소에 바로 쓰고, 얼굴 같은 단계 값만 상태로 구독한다
import { useCallback } from 'react';
import { useStoreApi } from '@xyflow/react';

// 요소의 --inv(1/배율, 화면 기준 크기로 키우는 글·테두리, styles.css)를 화면 변환이 바뀔 때마다 직접 쓴다.
// 예전처럼 React style로 쓴 것과 값·형식이 같다(style.setProperty에 숫자). 돌려주는 것은 ref 콜백(React 19의 정리 함수를 돌려준다)
export function useInvRef(min = 0.02) {
  const flow = useStoreApi();
  return useCallback((el) => {
    if (!el) return undefined;
    let last = NaN;
    const put = (st) => {
      const z = st.transform[2];
      if (z === last) return;
      last = z;
      el.style.setProperty('--inv', 1 / Math.max(z, min));
    };
    put(flow.getState());
    return flow.subscribe(put);
  }, [flow, min]);
}
