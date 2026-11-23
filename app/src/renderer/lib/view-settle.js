// P324: 판 화면 변환(이동·배율)의 "멈춘 값". 판을 끌거나 휠로 확대·축소하는 동안 노드의 거리 단계(얼굴)·작은 배율 같은 배율 구독과
//   판 테두리 굵기(--inv 띠)는 이 값을 본다. 움직임이 시작되는 첫 변환은 바로 내고(앞), 그 뒤로는 마지막 움직임에서 rest ms가 지나면 한 번 낸다(뒤).
//   그래서 움직이는 동안에는 노드가 다시 그려지지 않고, 멈춘 뒤 한 번만 바뀐다(P319 측정: 움직이는 동안 얼굴 바꾸기가 React 렌더의 절반 넘게).
//   창 크기만 바뀌면(움직이지 않을 때) 바로 낸다. 순수 함수만 둔다(단위 시험 있음, zoom-var.js useBoardMotion이 쓴다)
export const SETTLE_REST_MS = 300;

// publish(view): 멈춘 값을 낸다. view는 { transform: [x, y, zoom], width, height }
export function viewSettler({ publish, rest = SETTLE_REST_MS, now = () => performance.now(), setT = setTimeout, clearT = clearTimeout }) {
  let moving = false;
  let last = 0; // 마지막 움직임 시각
  let timer = 0;
  let pending = null; // 아직 내지 않은 마지막 값
  const flush = () => {
    if (timer) { clearT(timer); timer = 0; }
    moving = false;
    if (pending) { const v = pending; pending = null; publish(v); }
  };
  const tick = () => {
    timer = 0;
    const wait = last + rest - now();
    if (wait > 1) { timer = setT(tick, wait); return; }
    flush();
  };
  return {
    // 화면 변환이 바뀔 때마다 부른다(매 프레임일 수 있다)
    moved(view) {
      last = now();
      if (!moving) { moving = true; pending = null; publish(view); } // 앞: 움직임의 첫 값
      else pending = view;
      if (!timer) timer = setT(tick, rest);
    },
    // 변환은 그대로이고 창(판) 크기만 바뀌었을 때. 움직이는 중이면 멈춘 뒤에 함께 낸다
    resized(view) {
      if (moving) { pending = view; return; }
      publish(view);
    },
    get moving() { return moving; },
    dispose() { if (timer) clearT(timer); timer = 0; pending = null; moving = false; },
  };
}

// 판 테두리·둘레·표지·말풍선(styles.css의 calc(… * var(--inv)))이 쓰는 띠 값. 1/배율을 2의 거듭제곱으로 반올림한다(배율 0.71·0.35·0.18 …에서만 바뀐다).
//   글자 크기는 이 값을 쓰지 않는다(판 단위 고정). 멈춘 값으로만 쓰므로 움직이는 동안에는 바뀌지 않는다
export const INV_MIN = 0.25;
export const INV_MAX = 64;
export function invBand(zoom) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return Math.min(INV_MAX, Math.max(INV_MIN, 2 ** Math.round(Math.log2(1 / z))));
}
