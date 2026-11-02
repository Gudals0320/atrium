// 마크다운 → 그리기 쉬운 나무(P6c: 출력 보기 I1, 메모 노드 I3). 라이브러리 없이 자주 쓰는 것만 읽는다.
// 블록: 제목(#), 문단, 코드 블록(```), 인용(>), 목록(-, *, +, 1.)과 할 일 상자([ ], [x]), 표(| a | b |), 가로줄(---).
// 줄 안: `코드`, **굵게**, *기울임*, ~~지움~~, [글](주소). HTML은 글자 그대로 둔다(그리는 쪽이 React라 끼워 넣지 않는다).
// 결과: 블록 배열. 줄 안 값은 글(string) 또는 { t: 'code' | 'b' | 'i' | 's' | 'a', c?, text?, href? } 배열이다.

const FENCE = /^\s{0,3}(```+|~~~+)\s*([\w+-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

export function parseMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isBlockStart = (l) => FENCE.test(l) || HEADING.test(l) || HR.test(l) || QUOTE.test(l) || BULLET.test(l) || ORDERED.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(FENCE))) {
      const close = m[1][0] === '`' ? /^\s{0,3}```+\s*$/ : /^\s{0,3}~~~+\s*$/;
      const body = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      i++; // 닫는 줄(없으면 끝까지)
      out.push({ t: 'code', lang: m[2] || '', text: body.join('\n') });
      continue;
    }
    if ((m = line.match(HEADING))) { out.push({ t: 'h', level: m[1].length, c: inline(m[2]) }); i++; continue; }
    if (HR.test(line)) { out.push({ t: 'hr' }); i++; continue; }
    if (QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && lines[i].trim() && (m = lines[i].match(QUOTE))) { body.push(m[1]); i++; }
      out.push({ t: 'quote', c: parseMarkdown(body.join('\n')) });
      continue;
    }
    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = !BULLET.test(line);
      const re = ordered ? ORDERED : BULLET;
      const first = line.match(re);
      const base = first[1].length;
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const im = l.match(re);
        if (im && im[1].length <= base + 1) {
          let text = im[3], checked = null;
          const task = text.match(/^\[([ xX])\]\s+(.*)$/);
          if (task) { checked = task[1] !== ' '; text = task[2]; }
          items.push({ c: inline(text), checked, sub: [] });
          i++;
          continue;
        }
        // 들여 쓴 줄: 앞 항목의 하위 목록이나 이어지는 글
        if (l.trim() && /^\s+/.test(l) && items.length && (l.match(/^\s*/)[0].length > base)) {
          const sub = [];
          while (i < lines.length && lines[i].trim() && lines[i].match(/^\s*/)[0].length > base) sub.push(lines[i++].slice(base + 2));
          items[items.length - 1].sub.push(...parseMarkdown(sub.join('\n')));
          continue;
        }
        break;
      }
      out.push({ t: ordered ? 'ol' : 'ul', start: ordered ? Number(first[2]) : 1, items });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : null));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
      out.push({ t: 'table', head: head.map(inline), align, rows: rows.map((r) => head.map((_, k) => inline(r[k] || ''))) });
      continue;
    }
    // 문단: 빈 줄이나 다른 블록이 나올 때까지
    const para = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]))) para.push(lines[i++].trim());
    out.push({ t: 'p', c: inline(para.join('\n')) });
  }
  return out;
}

// 줄 안 꾸밈. 코드 안은 그대로 둔다
export function inline(text) {
  const s = String(text ?? '');
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length && /[\\`*_~[\]()#|>-]/.test(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
    if (ch === '`') {
      const n = s.slice(i).match(/^`+/)[0].length;
      const end = s.indexOf('`'.repeat(n), i + n);
      if (end > 0) { flush(); out.push({ t: 'code', text: s.slice(i + n, end).replace(/^ (.*) $/, '$1') }); i = end + n; continue; }
    }
    if ((ch === '*' || ch === '_') && s[i + 1] === ch) {
      const end = s.indexOf(ch + ch, i + 2);
      if (end > i + 2) { flush(); out.push({ t: 'b', c: inline(s.slice(i + 2, end)) }); i = end + 2; continue; }
    }
    if (ch === '~' && s[i + 1] === '~') {
      const end = s.indexOf('~~', i + 2);
      if (end > i + 2) { flush(); out.push({ t: 's', c: inline(s.slice(i + 2, end)) }); i = end + 2; continue; }
    }
    if ((ch === '*' || ch === '_') && s[i + 1] && s[i + 1] !== ' ' && !(ch === '_' && /\w/.test(s[i - 1] || ''))) {
      const end = s.indexOf(ch, i + 1);
      if (end > i + 1 && s[end - 1] !== ' ' && !(ch === '_' && /\w/.test(s[end + 1] || ''))) { flush(); out.push({ t: 'i', c: inline(s.slice(i + 1, end)) }); i = end + 1; continue; }
    }
    if (ch === '[') {
      const m = s.slice(i).match(/^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
      if (m) { flush(); out.push({ t: 'a', c: inline(m[1]), href: m[2] }); i += m[0].length; continue; }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

// 할 일 상자 n번째(문서 안 차례, 0부터)의 표시를 바꾼 글. 코드 블록 안은 세지 않는다
export function toggleTask(src, n, checked) {
  const lines = String(src ?? '').split('\n');
  let k = 0, fence = null;
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].match(/^\s{0,3}(```|~~~)/);
    if (f) { fence = fence ? (fence === f[1] ? null : fence) : f[1]; continue; }
    if (fence) continue;
    const m = lines[i].match(/^((?:\s*>)*\s*(?:[-*+]|\d{1,9}[.)])\s+\[)[ xX](\]\s)/);
    if (!m) continue;
    if (k++ === n) { lines[i] = m[1] + (checked ? 'x' : ' ') + lines[i].slice(m[1].length + 1); return lines.join('\n'); }
  }
  return lines.join('\n');
}

// 나무에서 글만(시험, 미리 보기 한 줄)
export function plainText(nodes) {
  const one = (n) => (typeof n === 'string' ? n : n.text != null ? n.text : n.c ? (Array.isArray(n.c) ? n.c.map(one).join('') : '') : n.items ? n.items.map((it) => it.c.map(one).join('')).join('\n') : '');
  return [].concat(nodes).map(one).join('\n');
}
