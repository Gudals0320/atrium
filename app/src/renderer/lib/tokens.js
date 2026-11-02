// P11: JS에서 쓰는 디자인 토큰. 색 값은 tokens.css 한곳에만 두고 여기서는 CSS 변수 이름을 가리키거나 값을 읽는다.
// cssVar는 문서가 있을 때만 값을 읽는다(단위 시험처럼 문서가 없으면 대신 준 값).

export function cssVar(name, fallback = '') {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}

// 세션마다 다른 머리 점 색: 이름에서 고른다(같은 이름이면 늘 같은 색). 값은 CSS 변수 문자열
const DOTS = 8;
export function dotIndex(key) {
  let h = 0;
  for (const ch of String(key || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return (h % DOTS) + 1;
}
export const dotVar = (key) => `var(--dot-${dotIndex(key)})`;

// xterm 테마(xterm은 CSS 변수를 못 읽으니 값을 읽어 넘긴다)
export function termTheme() {
  const v = (n) => cssVar(`--term-${n}`);
  const bg = v('bg');
  return {
    background: bg, foreground: v('text'), cursor: v('cursor'), cursorAccent: bg, selectionBackground: v('select'),
    black: v('black'), red: v('red'), green: v('green'), yellow: v('yellow'), blue: v('blue'), magenta: v('violet'), cyan: v('teal'), white: v('white'),
    brightBlack: v('bright-black'), brightRed: v('bright-red'), brightGreen: v('bright-green'), brightYellow: v('bright-yellow'),
    brightBlue: v('bright-blue'), brightMagenta: v('bright-violet'), brightCyan: v('bright-teal'), brightWhite: v('bright-white'),
    // 터미널 스크롤바(xterm 6은 자기 막대를 그린다): 판의 스크롤바와 같은 색
    scrollbarSliderBackground: cssVar('--scroll-thumb'), scrollbarSliderHoverBackground: cssVar('--scroll-thumb-hover'), scrollbarSliderActiveBackground: cssVar('--scroll-thumb-hover'),
  };
}

// 터미널 글꼴. 목업은 월드 15.2px 글에 줄 19.3px이다. 앱은 노드 크기 = 패널 크기라 글을 키우면 칸 수가 줄어든다.
// 그래서 크기는 14px로 두고 줄 높이만 같은 비율(19.3 / 15.2)로 맞춘다
export const TERM_FONT = '"JetBrains Mono Variable", "Nanum Gothic Coding", monospace';
export const TERM_FONT_SIZE = 14;
export const TERM_LINE_HEIGHT = 19.3 / 15.2;
