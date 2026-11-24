// P356: 휴대폰 페이지 맵 탭의 CSS(dist/mobilemap.css)를 판 화면 CSS(styles.css, phone.css)에서 골라 낸다.
// 맵 탭은 PC 세션 맵과 같은 카드·띠·선(.mt-ta-*, .mt-sm-*, .mt-pmap-*)을 그리므로 그 규칙을 그대로 쓴다(따로 베끼면 PC와 어긋난다).
// 판 화면 CSS 전체(약 380KB, 몸통·단추 같은 전역 규칙 포함)를 읽지 않고, 고른 클래스가 든 선택자만 남긴다.
// - 규칙: 쉼표로 나눈 선택자 가운데 keep에 맞는 것만 남긴다(하나도 없으면 규칙을 뺀다)
// - :root 규칙은 사용자 정의 속성(--…)만 남긴다(색 토큰)
// - @media·@supports는 안을 같은 규칙으로 고르고, 빈 블록은 뺀다. @keyframes는 남은 규칙이 그 이름을 쓸 때만
// 순수 함수(단위 시험 app/test/p356-lib.test.mjs)

// 주석을 지운다(문자열 안은 그대로)
export function stripComments(s) {
  let out = '', i = 0, q = null;
  while (i < s.length) {
    const c = s[i];
    if (q) { out += c; if (c === '\\') { out += s[i + 1] || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'") { q = c; out += c; i++; continue; }
    if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; }
    out += c; i++;
  }
  return out;
}
// 맨 위 블록들 → [{ pre, body }](body는 { } 안)
export function blocks(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf('{', i);
    if (open < 0) break;
    const semi = s.indexOf(';', i);
    if (semi >= 0 && semi < open && /^\s*@/.test(s.slice(i, semi))) { out.push({ pre: s.slice(i, semi).trim(), body: null }); i = semi + 1; continue; } // @import 같은 한 줄
    let d = 0, j = open, q = null;
    for (; j < s.length; j++) {
      const c = s[j];
      if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '{') d++;
      else if (c === '}') { d--; if (d === 0) break; }
    }
    out.push({ pre: s.slice(i, open).trim(), body: s.slice(open + 1, j) });
    i = j + 1;
  }
  return out;
}
// 선택자 목록을 맨 위 쉼표로 나눈다(:not(a, b) 안의 쉼표는 나누지 않는다)
export function splitSelectors(pre) {
  const out = []; let d = 0, cur = '';
  for (const c of pre) { if (c === '(') d++; else if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += c; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const customOnly = (body) => body.split(';').map((x) => x.trim()).filter((x) => x.startsWith('--')).join('; ');

export function pickCss(text, keep) {
  const rules = [], frames = [];
  const walk = (s) => {
    const out = [];
    for (const b of blocks(s)) {
      if (b.body == null) continue;
      if (/^@(media|supports)\b/.test(b.pre)) { const inner = walk(b.body); if (inner.length) out.push(`${b.pre} {\n${inner.join('\n')}\n}`); continue; }
      if (/^@(-webkit-)?keyframes\b/.test(b.pre)) { frames.push({ name: b.pre.split(/\s+/)[1], text: `${b.pre} {${b.body}}` }); continue; }
      if (/^@/.test(b.pre)) continue; // @font-face 같은 것(휴대폰 페이지에 이미 있다)
      const sels = splitSelectors(b.pre);
      if (sels.length === 1 && sels[0] === ':root') { const v = customOnly(b.body); if (v) out.push(`:root { ${v}; }`); continue; }
      const kept = sels.filter((x) => keep.test(x));
      if (kept.length) out.push(`${kept.join(', ')} {${b.body}}`);
    }
    return out;
  };
  rules.push(...walk(stripComments(text)));
  const used = rules.join('\n');
  const anims = frames.filter((f) => new RegExp(`\\b${f.name.replace(/[^\w-]/g, '')}\\b`).test(used)).map((f) => f.text);
  return [...rules, ...anims].join('\n') + '\n';
}

// 휴대폰 맵 탭이 쓰는 판 화면 클래스(PC 세션 맵 카드·띠·선·꼬리표·알약, 빛 층)
export const MAP_KEEP = /\.mt-(ta|sm|pmap|pl-pills?|mm-light|mm-lring|mm-lspin|mm-donetag|prog-chip|orch-tag)(-|\b)|\.mt-bg-|\.mt-pl\b/;
