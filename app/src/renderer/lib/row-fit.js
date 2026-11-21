// P307: 휴대폰 세션 맵 카드 첫 줄(이름·할 일 표식·레인 칩·상태)이 좁을 때 이름이 밀려나지 않게 한다.
// 이름이 잘리면 줄에 tight(할 일 표식은 수만, 레인 칩은 "M2 1/5"), 그래도 잘리면 tight2(상태는 점만, 이름에 최소 폭)를 단다(phone.css).
// 표식·칩은 따로 다시 그려지므로 이름 상자의 크기 바뀜(ResizeObserver)으로 다시 잰다. 판 변환(scale)은 재는 값에 닿지 않는다.
import { useLayoutEffect } from 'react';

export const cut = (el) => !!el && el.scrollWidth > el.clientWidth + 1;
// row: 줄 요소, name: 이름 요소 → 단 단계(0 | 1 | 2)
export function fitRow(row, name) {
  if (!row || !name) return 0;
  row.classList.remove('tight', 'tight2');
  if (!cut(name)) return 0;
  row.classList.add('tight');
  if (!cut(name)) return 1;
  row.classList.add('tight2');
  return 2;
}
export function useRowFit(rowRef, nameRef, on) {
  useLayoutEffect(() => {
    if (!on) return undefined;
    const row = rowRef.current, name = nameRef.current;
    if (!row || !name) return undefined;
    fitRow(row, name);
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => fitRow(row, name));
    ro.observe(name); ro.observe(row);
    return () => ro.disconnect();
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
}
