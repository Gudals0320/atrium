// P364: 작업 지식 찾기(atrium know)의 순수 함수. 원문을 덩어리로 나누고, 검색어를 풀고, 짧은 발췌를 고르고, 사람 대화 인용을 가리고,
// 걷어낸 기능 표시를 판정한다. 파일·DB·git은 만지지 않는다(know-sources.mjs, store-know.mjs).
// 설계 참고: 작업 지식 lab의 know 시제품(Python, 비공개 docs 저장소 lab 브랜치). 판 구조에 맞게 새로 지었다.

export const KNOW_KINDS = Object.freeze(['doc', 'log', 'record', 'review', 'code', 'db']);
export const KNOW_K_DEFAULT = 5;
export const KNOW_K_MAX = 30;
export const EXCERPT_MAX = 160; // 결과 하나의 발췌 글자 수 상한(결과 본문이 길어지지 않게)
export const PER_FILE_MAX = 1; // P371: 한 파일에서 돌려줄 결과 수. 그 파일의 대표 절 하나이고 다른 맞은 절은 "다른 절" 꼬리표로 붙인다
export const SECTION_LINES_MAX = 80; // P371: 이보다 긴 절(빈 줄 빼고 센 줄 수)은 절 대신 덩어리를 순위·포인터의 단위로 쓴다(포인터가 너무 넓지 않게)
export const ALSO_MAX = 2; // P371: 결과 하나에 붙이는 "다른 절" 수
export const OPEN_LINES_MAX = 400; // know open 한 번에 보이는 줄 수
export const NO_CUT = 9e15; // --before 없음(밀리초)
export const CAUTION_MAX = 160; // P388: 결과 하나에 붙이는 제약 줄("제약 L<줄>")의 글자 수 상한(맞은 줄 발췌 EXCERPT_MAX와 따로)
export const CAUTION_NEAR = 12; // P388: 맞은 줄에서 이 줄 수 안에 있는 제약 줄만 붙인다(원문 줄 번호 차이)

// 단위 번호(PNNN, P12a). 앞뒤가 영문·숫자가 아닐 때만
const UNIT_RE = /(?<![A-Za-z0-9])[Pp](\d{1,4})([abcABC]?)(?![A-Za-z0-9])/g;
export const unitName = (n, l = '') => `P${Number(n)}${String(l).toLowerCase()}`;
export function unitsIn(s) {
  const out = new Set();
  for (const m of String(s || '').matchAll(UNIT_RE)) out.add(unitName(m[1], m[2]));
  return out;
}
// "p364"·"P364a" 꼴 단위 이름 → 'P364' | null
export function parseUnit(s) {
  const m = /^[Pp](\d{1,4})([abcABC]?)$/.exec(String(s || '').trim());
  return m ? unitName(m[1], m[2]) : null;
}
// 경로의 첫 단위 조각(experiments/p364/…, docs/log/p364-know.md, .atrium/records/p364-u12/…) → 'P364' | null
export function ownerOfPath(p) {
  for (const part of String(p || '').split('/')) {
    const m = /^[Pp](\d{1,4})([abcABC]?)(?![A-Za-z0-9])/.exec(part);
    if (m) return unitName(m[1], m[2]);
  }
  return null;
}
// 세션 이름(p364, p364-fix) → 'P364' | null
export const ownerOfName = (name) => ownerOfPath(String(name || ''));

// ---------- 비밀 가리기와 사람 대화 인용 가리기 ----------
// 토큰 꼴 문자열(키, 토큰, bearer)과 key=value 꼴 비밀 값
export function redact(s) {
  return String(s || '')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{14,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|[Bb]earer\s+[A-Za-z0-9_.-]{12,})/g, '[redacted]')
    .replace(/((?:api[_-]?key|access[_-]?token|password|passwd|secret[_-]?key|client[_-]?secret)\s*[=:]\s*)["']?[A-Za-z0-9_+./=-]{12,}/gi, '$1[redacted]');
}
// 사람·에이전트의 말을 옮긴 줄(인용 블록, "사용자: …", "사용자의 말" 등)
const SPEECH_START = /^\s*(?:>|(?:[-*]\s*)?(?:사용자(?:의)?\s*(?:말|발언|원문)|user\s*(?:said|:)|assistant\s*:|사람의 말|원문\s*:))/i;
const SPEAKER = /(?:사용자|사람|user|assistant|요청자)\s*(?:\([^)]{0,55}\))?\s*[:：]/i;
export const isSpeech = (line) => SPEECH_START.test(line) || SPEAKER.test(line) || /사용자의 말|직접\s*(?:말|인용)/.test(line);
export const SPEECH_MASK = '[대화 인용 생략]';
// P371: 문서에 바꿀 문장을 옮긴 인용(줄에서 인용 바로 앞이 "ARCH(…):", "testing:", "BRIEF(정한 것):" 꼴)은 사람의 말이 아니라 워커가 쓴 글이라 가리지 않는다
const DOC_LABEL = /(?:^|[\s(\-*·,])(?:ARCH|BRIEF|PLAN|README(?:\.ko)?(?:\.md)?|testing(?:\.md)?|CLAUDE\.md|CHANGELOG(?:\.md)?|help|K\d+|[A-Z]\d{1,2})(?:\s*\([^)]{0,40}\))?[^"“「]{0,12}[:：]\s*$/;
export const docQuote = (line, at) => DOC_LABEL.test(String(line).slice(Math.max(0, at - 80), at));
// 한 줄을 내보낼 꼴로: 말을 옮긴 줄은 통째로 가리고, 긴 따옴표 인용(15낱말 넘음)은 그 인용만 가린다(문서에 바꿀 문장 인용은 빼고). 비밀은 늘 가린다
export function maskLine(line) {
  const s = String(line || '');
  if (isSpeech(s)) return SPEECH_MASK;
  const r = redact(s);
  return r.replace(/“[^”]*”|「[^」]*」|"[^"\n]*"/g, (q, at) => (q.split(/\s+/).length > 15 && !docQuote(r, at) ? '[인용 생략]' : q));
}
export const maskText = (text) => String(text || '').split('\n').map(maskLine).join('\n');

// ---------- 덩어리 나누기 ----------
const CHUNK_CHARS = 1400;
const CHUNK_LINES = 17;
// 마크다운·글 → [{ heading, a, b, sa, sb, body }]. 제목에서 끊고, 길면(글자·줄 수) 끊는다. a·b는 1부터 센 원문 줄이고, body는 a~b 원문 그대로다
// (P371: 가운데 빈 줄도 넣어 body의 i번째 줄이 원문 a+i줄이다. 발췌에 줄 번호를 붙인다).
// sa·sb(P371)는 그 덩어리가 든 절(제목 줄부터 다음 제목 앞의 마지막 글 줄까지, 첫 제목 앞은 머리 절)이다. 제목 없는 글은 통째로 한 절이다.
// 절이 SECTION_LINES_MAX(빈 줄 빼고)보다 길면 sa·sb는 덩어리 자신이다
export function mdChunks(raw) {
  const lines = String(raw || '').split('\n').map((l) => l.replace(/\r$/, ''));
  const out = []; const secs = [];
  let heading = ''; let buf = []; let size = 0;
  const flush = () => { if (buf.length) { const a = buf[0][0]; const b = buf[buf.length - 1][0]; out.push({ heading, a, b, body: lines.slice(a - 1, b).join('\n'), sec: secs[secs.length - 1] }); } buf = []; size = 0; };
  lines.forEach((l, i) => {
    const isHead = /^#{1,6}\s/.test(l);
    if (isHead || size + l.length > CHUNK_CHARS || buf.length >= CHUNK_LINES) flush();
    if (isHead) heading = l.replace(/^#+\s*/, '').trim().slice(0, 160);
    if (isHead || !secs.length) secs.push({ first: 0, last: 0, n: 0 });
    if (l.trim()) { const s = secs[secs.length - 1]; if (!s.first) s.first = i + 1; s.last = i + 1; s.n++; buf.push([i + 1, l]); size += l.length; }
  });
  flush();
  return out.map(({ sec, ...c }) => (sec && sec.n <= SECTION_LINES_MAX ? { ...c, sa: sec.first, sb: sec.last } : { ...c, sa: c.a, sb: c.b }));
}
const HASH_COMMENT = new Set(['.py', '.sh', '.ps1', '.psm1', '.rb', '.yml', '.yaml', '.toml']);
// 코드 → 주석 덩어리 [{ heading: '', a, b, body }]. // 와 /* */(앞이 :이면 주소라 뺀다), 스크립트 언어는 #. 65줄 넘게 떨어지면 끊는다
export function commentChunks(raw, ext) {
  const hash = HASH_COMMENT.has(String(ext || '').toLowerCase());
  const out = [];
  let buf = []; let size = 0; let block = false;
  // P371: body는 a~b 줄 자리를 지킨다(주석이 아닌 줄은 빈 줄). 절은 그 덩어리 자신(코드에는 제목이 없다)
  const flush = () => {
    if (buf.length) {
      const a = buf[0][0]; const b = buf[buf.length - 1][0];
      const rows = new Array(b - a + 1).fill('');
      for (const [n, t] of buf) rows[n - a] = t;
      out.push({ heading: '', a, b, sa: a, sb: b, body: rows.join('\n'), lines: buf.map((x) => x[0]) });
    }
    buf = []; size = 0;
  };
  String(raw || '').split('\n').forEach((line, i) => {
    const l = line.replace(/\r$/, '');
    let c;
    if (block) { c = l.replace(/\*\/.*$/, '').replace(/^[\s*]+/, '').trim(); block = !l.includes('*/'); }
    else {
      const m = hash ? /^\s*#(?!!)/.exec(l) : /(?<!:)\/\/|\/\*/.exec(l);
      if (!m) return;
      c = l.slice(m.index + m[0].length);
      if (m[0] === '/*') { block = !c.includes('*/'); c = c.replace(/\*\/.*$/, ''); }
      c = c.replace(/^[\s*/]+/, '').trim();
    }
    if (!c) return;
    if (buf.length && (i + 1 - buf[buf.length - 1][0] > 65 || size + c.length > CHUNK_CHARS || buf.length >= 16)) flush();
    buf.push([i + 1, c]); size += c.length;
  });
  flush();
  return out;
}

// ---------- 검색어 ----------
const STOP = new Set('the and with from that they does why are for not how this what when into must have should were was same other will over 작업 대한 있는 하는 따른 어떤 무엇 때문에 이를 경우 위해 있는지 있나 있었나 어떻게 왜 언제 했나 했는가 것은 있는가 하지 결과'.split(' '));
// 한국어 낱말 끝의 조사·어미(떼고 남은 것이 두 글자 이상일 때만)
const PARTICLES = ['에서는', '으로는', '에서', '으로', '까지', '부터', '처럼', '에게', '하고', '이다', '한다', '했다', '하는', '했나', '인가', '은', '는', '이', '가', '을', '를', '의', '에', '로', '와', '과', '도', '만'];
function stem(w) {
  if (!/^[가-힣]+$/.test(w)) return w;
  for (const p of PARTICLES) if (w.length - p.length >= 2 && w.endsWith(p)) return w.slice(0, -p.length);
  return w;
}
// 물음 → 검색 낱말(소문자, 겹침 없이). 영문·숫자·경로 꼴과 한글 두 글자 이상
export function lex(q) {
  const words = String(q || '').toLowerCase().match(/[a-z0-9_][a-z0-9_./-]*[a-z0-9_]|[가-힣]{2,}/g) || [];
  const out = [];
  for (const w0 of words) {
    const w = stem(w0.replace(/^[./-]+|[./-]+$/g, ''));
    if (w.length < 2 || STOP.has(w) || out.includes(w)) continue;
    out.push(w);
  }
  return out.slice(0, 40);
}
// 검색 낱말 → FTS5 trigram 식(세 글자 이상만. 네 글자 넘는 한글은 앞 세 글자도, 경로 꼴은 조각도). 없으면 ''
export function ftsExpr(terms) {
  const parts = [];
  for (const t of terms) {
    if (t.length >= 3) parts.push(t);
    if (t.length >= 4 && /^[가-힣]+$/.test(t)) parts.push(t.slice(0, 3));
    if (/[/_.-]/.test(t)) for (const s of t.split(/[/_.-]/)) if (s.length >= 3) parts.push(s);
  }
  return [...new Set(parts)].map((s) => `"${s.replace(/"/g, '""')}"`).join(' OR ');
}
// 두 글자 낱말(trigram으로 못 찾는 것)
export const shortTerms = (terms) => terms.filter((t) => t.length === 2);

// ---------- 발췌 ----------
const strength = (line, terms) => { const l = line.toLowerCase(); let n = 0; for (const t of terms) if (l.includes(t)) n += 1 + Math.min(12, t.length) * 0.15; return n; };
const usable = (line) => { const x = line.trim(); return !!x && !/^(?:```|~~~|---|\|[-:| ]+\|?$)/.test(x) && !isSpeech(x); };
// 발췌 다듬기: 긴 따옴표 인용(4낱말 넘고 22자 넘음)은 "…"로 줄인다. P371: 물음 낱말이 든 인용은 15낱말까지 보이고(명령·오류 글이 인용으로 적힌 기록이 많다. maskLine과 같은 상한),
// 문서에 바꿀 문장 인용(docQuote)은 길어도 보인다(긴 줄은 windowOf가 맞은 낱말 둘레만 자른다)
const tidy = (s, terms = []) => s.replace(/“[^”]*”|「[^」]*」|"[^"\n]*"/g, (q, at) => { const w = q.split(/\s+/).length; if (w < 4 || q.length <= 22 || docQuote(s, at)) return q; const low = q.toLowerCase(); return w <= 15 && terms.some((t) => low.includes(t)) ? q : '"…"'; }).replace(/^[\s|#*>-]+/, '').replace(/\s+/g, ' ').trim();
// 긴 줄에서 맞은 낱말이 가장 많이 든 창(max 자)을 고른다(첫 낱말 자리만 보지 않는다).
// P388: anchors(제약 낱말)를 주면 창은 그 낱말 자리에서만 연다(제약 줄의 창에서 제약 낱말이 잘리지 않게)
function windowOf(line, terms, max, anchors = null) {
  if (line.length <= max) return line;
  const low = line.toLowerCase();
  const hits = [];
  for (const t of terms) { let i = low.indexOf(t); while (i >= 0 && hits.length < 200) { hits.push([i, t]); i = low.indexOf(t, i + 1); } }
  const starts = anchors && anchors.length ? hits.filter(([, t]) => anchors.includes(t)) : hits;
  let at = 0; let bestN = -1;
  for (const [p] of starts) {
    const s0 = Math.max(0, p - Math.floor(max / 4));
    const n = new Set(hits.filter(([q, t]) => q >= s0 && q + t.length <= s0 + max - 2).map(([, t]) => t)).size;
    if (n > bestN) { bestN = n; at = p; }
  }
  const span = max - 2; // 앞뒤 … 자리를 남긴다
  const start = Math.max(0, Math.min(at - Math.floor(max / 4), line.length - span));
  const end = Math.min(line.length, start + span);
  return (start ? '…' : '') + line.slice(start, end) + (end < line.length ? '…' : '');
}
// ---------- 제약 줄(P388) ----------
// 제약을 적은 줄의 낱말(한 곳에 둔다, 한국어·영어). strong은 그것만으로 제약을 적은 줄이고, weak는 흔한 부정·순서 낱말이라 맞은 줄에
// strong이 없을 때만 본다. 영어는 낱말 경계로 맞춘다(limit → limits·limited도)
export const CAUTION_WORDS = Object.freeze({
  strong: Object.freeze(['주의', '함정', '금지', '상한', '하한', '넘으면', '넘지', '조심', '경고', '안 된다', '안된다', '말 것', '깨진다',
    'must', 'never', 'limit', 'do not', "don't", 'avoid', 'caution', 'warning', 'pitfall', 'beware']),
  weak: Object.freeze(['하지 않는다', '않는다', '반드시', '먼저', '넘는', '꼭', 'always', 'only if', 'required']),
});
const cautionRe = (list) => new RegExp(list.map((w) => (/^[a-z' ]+$/i.test(w) ? `\\b${w.replace(/ /g, '\\s+')}\\w*` : w.replace(/ /g, '\\s*'))).join('|'), 'i');
const CAUTION_STRONG = cautionRe(CAUTION_WORDS.strong);
const CAUTION_WEAK = cautionRe(CAUTION_WORDS.weak);
// 한 줄의 제약 세기: 2(strong 낱말), 1(weak 낱말만), 0
export function cautionWeight(line) {
  const s = String(line || '');
  return CAUTION_STRONG.test(s) ? 2 : CAUTION_WEAK.test(s) ? 1 : 0;
}
// 줄에 든 제약 낱말(소문자, windowOf가 그 둘레를 자르게)
const cautionTerms = (line) => [CAUTION_STRONG, CAUTION_WEAK].flatMap((re) => [...String(line || '').matchAll(new RegExp(re.source, 'gi'))].map((m) => m[0].toLowerCase()));

// 절의 줄들 → [{ n, t }](원문 줄 번호 순, 겹침 없이, 제목·울타리·말 인용 빼고 다듬은 글)
function sectionLines(parts, terms) {
  const all = [];
  for (const p of parts || []) String(p.body || '').split('\n').forEach((l, i) => { if (usable(l)) all.push({ n: (p.a || 1) + i, raw: l }); });
  all.sort((x, y) => x.n - y.n);
  const uniq = all.filter((x, i) => !i || x.n !== all[i - 1].n);
  const plain = uniq.filter((x) => !/^\s*#/.test(x.raw)); // 제목 줄은 결과의 § 제목으로 이미 보인다
  return (plain.length ? plain : uniq).map((x) => ({ n: x.n, t: tidy(redact(x.raw), terms) })).filter((x) => x.t.length > 3);
}
// 짧은 줄이면 바로 뒤 글 줄(2줄 안)을 " ⏎ "로 이어 둘레를 보인다
function withNext(text, lines, i, max, skip) {
  const cur = lines[i]; const next = lines[i + 1];
  if (text.length < 70 && next && next.n - cur.n <= 2 && !(skip && skip.has(next.n))) {
    const room = max - text.length - 3;
    if (room > 12) return { text: text + ' ⏎ ' + (next.t.length > room ? next.t.slice(0, room - 1) + '…' : next.t), next: next.n };
  }
  return { text, next: null };
}
// P388: 맞은 줄 가까이(CAUTION_NEAR 줄 안)의 제약 줄 하나 → { text, line } | null. lines: sectionLines, at: 맞은 줄, visible: 맞은 발췌에 보인 글,
// shown: 그 발췌에 든 줄 번호. 보인 글에 strong 제약 낱말이 있으면 붙이지 않고(같은 줄이면 하나만), weak만 있으면 strong 줄만 찾는다.
// 맞은 줄·이어 보인 줄도 긴 줄이라 창 밖으로 제약 낱말이 잘렸으면 후보다(그 낱말 둘레를 보인다).
// weak 낱말만 있는 줄은 물음 낱말이 함께 있을 때만 후보다. 고르기: 물음 낱말이 든 줄 → 제약 세기 → 가까움. 창은 제약 낱말에서 열고, 짧으면 뒤 한 줄을 잇는다(CAUTION_MAX 안)
export function cautionOf(lines, at, terms, visible, shown = new Set(), max = CAUTION_MAX) {
  const shownW = cautionWeight(visible);
  if (shownW >= 2) return null;
  let best = null; let bs = -Infinity;
  lines.forEach((x, i) => {
    if (Math.abs(x.n - at) > CAUTION_NEAR) return;
    const w = cautionWeight(x.t);
    if (!w || w <= shownW) return;
    const st = strength(x.t, terms);
    if (w < 2 && !(st > 0)) return; // weak 낱말(않는다·먼저 …)만 있는 줄은 물음 낱말이 함께 있을 때만(흔한 낱말이라 소음이 된다)
    const s = (st > 0 ? 3 : 0) + Math.min(st, 3) * 0.3 + w - Math.abs(x.n - at) * 0.08;
    if (s > bs) { bs = s; best = i; }
  });
  if (best == null) return null;
  const c = lines[best];
  const anchors = cautionTerms(c.t);
  const text = withNext(windowOf(c.t, [...anchors, ...terms], max, anchors), lines, best, max, shown).text;
  return { text, line: c.n };
}
// P371: 절(덩어리 여럿)에서 물음에 가장 맞는 줄과 그 원문 줄 번호. parts: [{ a, body }](body의 i번째 줄 = 원문 a+i줄).
// 맞은 줄이 짧으면 바로 뒤 글 줄을 " ⏎ "로 이어 둘레를 보인다. → { text, line, caution? } (쓸 줄이 없으면 text '')
// P388: section(그 절의 덩어리 전부, 없으면 parts)에서 맞은 줄 가까이의 제약 줄을 caution { text, line }으로 함께 돌려준다(cautionOf)
export function sectionExcerpt(parts, terms, max = EXCERPT_MAX, section = null) {
  const lines = sectionLines(parts, terms);
  if (!lines.length) return { text: '', line: null };
  let bi = 0; let bs = -1;
  lines.forEach((x, i) => { const s = strength(x.t, terms) + Math.min(x.t.length, 90) * 0.003; if (s > bs) { bs = s; bi = i; } });
  const best = lines[bi];
  const w = withNext(windowOf(best.t, terms, max), lines, bi, max);
  const shown = new Set([best.n, ...(w.next != null ? [w.next] : [])]);
  const caution = cautionOf(section ? sectionLines(section, terms) : lines, best.n, terms, w.text, shown);
  return { text: w.text, line: best.n, ...(caution ? { caution } : {}) };
}
// 덩어리에서 물음에 가장 맞는 줄 하나를 짧게(EXCERPT_MAX 자). 쓸 줄이 없으면(모두 말 인용) ''
export function excerpt(body, terms, max = EXCERPT_MAX) {
  return sectionExcerpt([{ a: 1, body }], terms, max).text;
}

// ---------- 복사본(P371) ----------
// 같은 글이 여러 자리에 있다: 기록 사본(experiments/pNNN/x.md ↔ .atrium/records/<단위>-<일>/x.md), 지시 본문 사본(docs/log/pNNN-*.md ↔ experiments/head-tools/**/pNNN_body.md),
// 통째 같은 파일(내용 해시), 같은 글을 담은 판 행(합치기 일 spec ↔ done 보고). 찾기는 이들을 한 자리로 접고 나머지 자리를 "같은 글" 꼬리표로 붙인다
const RECORD_DIR = /^(?:experiments|\.atrium\/records)\//i;
const BODY_COPY = /^p\d{1,4}[a-c]?[_-]body\.(?:md|txt)$/i;
const baseOf = (p) => String(p || '').split('/').pop().toLowerCase();
// 비교할 줄: 앞뒤 기호·공백을 걷고 8자 이상만
export function normLines(text) {
  const out = new Set();
  for (const l of String(text || '').split('\n')) { const x = l.replace(/^[\s|#*>-]+|[\s|]+$/g, '').replace(/\s+/g, ' '); if (x.length >= 8) out.add(x); }
  return out;
}
// 두 줄 묶음이 거의 같은가: 작은 쪽의 70% 넘게 겹침(작은 쪽이 한 줄이면 둘이 같을 때만)
export function linesOverlap(A, B) {
  if (!A || !B || !A.size || !B.size) return false;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  const min = Math.min(A.size, B.size);
  return min < 2 ? A.size === B.size && n === A.size : n / min >= 0.7;
}
// x·y: { path, origin, hash, unit, lines(normLines) } → 까닭('hash'|'name'|'body'|'text') | null
export function copyReason(x, y) {
  if (!x || !y || x.path === y.path) return null;
  if (x.origin === 'file' && y.origin === 'file' && x.hash && x.hash === y.hash) return 'hash';
  if (x.unit && x.unit === y.unit) {
    const bx = baseOf(x.path); const by = baseOf(y.path);
    if (RECORD_DIR.test(x.path) && RECORD_DIR.test(y.path) && bx === by) return 'name';
    const task = (p) => /^docs\/log\//i.test(p) || BODY_COPY.test(baseOf(p));
    if (task(x.path) && task(y.path) && BODY_COPY.test(bx) !== BODY_COPY.test(by)) return 'body';
  }
  return linesOverlap(x.lines, y.lines) ? 'text' : null;
}
// 부른 세션의 단위(P371): 세션 이름(p371, p371-fix)이 먼저, 없으면 판의 지금 일 글이 가리키는 작업 파일(docs/log/pNNN-…)이나 글 첫 줄 머리의 PNNN.
// 일 글 가운데 지나가는 단위 번호(참고한 앞 단위)는 쓰지 않는다. 없으면 null(지휘 세션·사람)
export function selfUnitOf(name, spec) {
  const byName = ownerOfName(name);
  if (byName) return byName;
  const s = String(spec || '').slice(0, 4000);
  const m = /docs[\\/]log[\\/][Pp](\d{1,4})([abcABC]?)-/.exec(s) || /^\s*\[?[Pp](\d{1,4})([abcABC]?)(?![A-Za-z0-9])/.exec(s.split('\n').find((l) => l.trim()) || '');
  return m ? unitName(m[1], m[2]) : null;
}

// ---------- 지휘 세션의 힌트(P388) ----------
// 사용 기록에 돌려준 위치마다 그것이 부른 세션의 지금 일 지시(판의 일 spec와 그것이 가리키는 작업 파일 docs/log/pNNN-*.md)에
// 이미 적힌 파일인지 남긴다. 지휘 세션이 넘긴 위치와 워커가 새로 찾은 위치를 나중에 가른다(lab 7단계 6절)
// 일 spec에서 작업 파일 경로(절대 경로나 docs/log/pNNN-….md) → 문자열 | null
export function taskFileOf(spec) {
  const m = /(?:[A-Za-z]:)?[^\s`'"()<>]*?docs[\\/]log[\\/][Pp]\d{1,4}[abcABC]?-[^\s`'"()<>]*?\.md/.exec(String(spec || '').slice(0, 4000));
  return m ? m[0] : null;
}
// 지시 글에 적힌 파일 경로 꼴 → { hint: Set, task: Set }. "힌트"·hint가 든 줄의 것은 hint, 그 밖의 줄은 task(소문자, / 구분, 앞 ./ 뗌).
// 확장자가 있는 파일만(폴더·낱말은 뺀다). 짧은 꼴(know-text.mjs, lib/kinds.js)도 그대로 두고 맞출 때 경로 끝으로 맞춘다
const PATH_TOKEN = /[A-Za-z0-9_.\-/\\]*[A-Za-z0-9_-]\.[A-Za-z][A-Za-z0-9]{0,5}(?![A-Za-z0-9])/g;
export function hintPathsOf(text) {
  const hint = new Set(); const task = new Set();
  for (const line of String(text || '').split('\n')) {
    const into = /힌트|\bhints?\b/i.test(line) ? hint : task;
    for (const m of line.matchAll(PATH_TOKEN)) {
      const p = m[0].replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '').toLowerCase();
      if (p.length >= 4 && /[a-z]/.test(p.split('.').pop())) into.add(p);
    }
  }
  for (const p of hint) task.delete(p);
  return { hint, task };
}
// 포인터(경로:줄-줄, db:…)가 지시에 적힌 파일인가 → 'hint'(힌트 줄) | 'task'(지시의 다른 곳) | false. 경로가 같거나, 한쪽이 다른 쪽의 끝 마디들이면 맞음
export function hintOf(pointer, hints) {
  if (!hints) return false;
  const p = parsePointer(pointer);
  if (!p || p.type !== 'file') return false;
  const f = p.path.toLowerCase();
  const fits = (h) => h === f || f.endsWith('/' + h) || h.endsWith('/' + f);
  for (const h of hints.hint) if (fits(h)) return 'hint';
  for (const h of hints.task) if (fits(h)) return 'task';
  return false;
}

// ---------- 포인터 ----------
export const filePointer = (p, a, b) => `${p}:${a}-${b}`;
// 'path:a-b' | 'path:a' | 'db:<표>/<행>' | 'git:<커밋>' → { type, … } | null
export function parsePointer(ptr) {
  const s = String(ptr || '').trim();
  let m = /^db:([a-z_]+)\/(.+)$/.exec(s);
  if (m) return { type: 'db', table: m[1], row: m[2], path: s };
  m = /^git:([0-9a-fA-F]{4,40})$/.exec(s);
  if (m) return { type: 'git', sha: m[1].toLowerCase() };
  m = /^(.+?):(\d+)(?:-(\d+))?$/.exec(s);
  if (m) { const a = Number(m[2]); const b = Number(m[3] || m[2]); return a >= 1 && b >= a ? { type: 'file', path: m[1].replace(/\\/g, '/'), a, b } : null; }
  return s ? { type: 'file', path: s.replace(/\\/g, '/'), a: null, b: null } : null;
}

// ---------- 시각 ----------
// '2026-11-20', '2026-11-20T18:00', ISO(시간대 있음) → 밀리초 | null. 시간대가 없으면 이 PC의 지역 시각
export function parseWhen(s) {
  const v = String(s || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v.replace(' ', 'T'));
  return Number.isFinite(t) ? t : null;
}
const pad = (n) => String(n).padStart(2, '0');
export const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const minuteOf = (ms) => { const d = new Date(ms); return `${dayOf(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// ---------- 걷어낸 기능(.atrium/know.json의 retired) ----------
// 항목: { name, aliases?: [], exclude?: [], date: 'YYYY-MM-DD…', pointer?: '…' } → { name, terms, exclude, at, pointer }
export function normalizeRetired(list) {
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || typeof r.name !== 'string' || !r.name.trim()) continue;
    const at = parseWhen(r.date);
    if (at == null) continue;
    const terms = [r.name, ...(Array.isArray(r.aliases) ? r.aliases : [])].map((x) => String(x).trim()).filter(Boolean);
    out.push({ name: r.name.trim(), terms, exclude: (Array.isArray(r.exclude) ? r.exclude : []).map((x) => String(x).toLowerCase()).filter(Boolean), at, date: String(r.date).slice(0, 10), pointer: typeof r.pointer === 'string' ? r.pointer : null });
  }
  return out;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 글 안에 그 이름이 낱말로 있는가(영문·숫자에 붙지 않음, 대소문자 무시, exclude에 든 꼴은 뺀다. 예: herdr-core)
export function mentions(text, r) {
  const t = String(text || '');
  for (const term of r.terms) {
    const re = new RegExp(`(?<![A-Za-z0-9])${esc(term)}(?![A-Za-z0-9])`, 'gi');
    for (const m of t.matchAll(re)) {
      const around = t.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20).toLowerCase();
      if (!r.exclude.some((x) => around.includes(x))) return true;
    }
  }
  return false;
}
// 이름이 이 결과의 주제인가: 파일 경로의 조각(파일·폴더 이름 = 식별자), 덩어리 제목, 첫 문장 가운데 하나에 있을 때만.
// 코드에 이름이 지나가듯 나오는 것(본문 가운데)은 주제가 아니다
export function isTopic(r, { path: p = '', heading = '', body = '' }) {
  const segs = String(p).split('/').map((x) => x.replace(/\.[a-z0-9]+$/i, '')).join(' ').replace(/[-_.]/g, ' ');
  const first = String(body || '').split('\n').find((l) => l.trim()) || '';
  const sentence = first.split(/(?<=[.!?。])\s|(?<=다\.)\s/)[0];
  return mentions(segs, r) || mentions(heading, r) || mentions(sentence, r);
}
// 결과의 걷어냄 표시들. 원천이 걷은 날보다 앞서고(changed < at), 경계(cut)가 걷은 날 뒤이고, 이름이 주제일 때만
export function retiredFlags(retired, src, chunk, cut = NO_CUT) {
  const out = [];
  for (const r of retired || []) {
    if (!(r.at < cut) || !(src.changed < r.at)) continue;
    if (isTopic(r, { path: src.path, heading: chunk.heading, body: chunk.body })) out.push(`걷어냄(${r.date}${r.pointer ? `, ${r.pointer}` : ''})`);
  }
  return out;
}

// ---------- 대체된 결정(.atrium/know.json의 superseded) ----------
// 쓰는 쪽(지휘 세션)이 선언한다. LLM 판정은 하지 않는다. 항목:
//   { id, old: <포인터 | 단위 번호 | 짧은 옛 주장>(하나 또는 배열, { pointer } | { unit } | { text }로 분명히 써도 된다),
//     now: '<지금 유효한 문장>', nowPointer: 'docs/BRIEF.md:33' 또는 BRIEF 행 제목, since: 'YYYY-MM-DD'(이때부터 대체됨), scope?: '<범위>' }
// 맞추기: 포인터(같은 경로이고 줄 범위가 겹침, db 포인터는 같음)와 단위 번호가 먼저, 옛 주장 글은 덩어리 안에 그 구절이 그대로 있을 때만
function oldItem(x) {
  if (x && typeof x === 'object') {
    if (typeof x.pointer === 'string') return { type: 'pointer', p: parsePointer(x.pointer) };
    if (typeof x.unit === 'string' && parseUnit(x.unit)) return { type: 'unit', unit: parseUnit(x.unit) };
    if (typeof x.text === 'string' && x.text.trim()) return { type: 'text', text: x.text.replace(/\s+/g, ' ').trim() };
    return null;
  }
  const s = String(x || '').trim();
  if (!s) return null;
  if (parseUnit(s)) return { type: 'unit', unit: parseUnit(s) };
  if (/^db:[a-z_]+\/\S+$/.test(s) || /^[^\s:]+\.[A-Za-z0-9]+:\d+(?:-\d+)?$/.test(s)) return { type: 'pointer', p: parsePointer(s) };
  return { type: 'text', text: s.replace(/\s+/g, ' ') };
}
export function normalizeSuperseded(list) {
  const out = [];
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || typeof e.now !== 'string' || !e.now.trim()) continue;
    const old = (Array.isArray(e.old) ? e.old : [e.old]).map(oldItem).filter((o) => o && (o.type !== 'pointer' || o.p));
    if (!old.length) continue;
    const since = e.since ? parseWhen(e.since) : null;
    out.push({ id: e.id != null ? String(e.id) : null, old, now: e.now.trim(), nowPointer: typeof e.nowPointer === 'string' ? e.nowPointer.trim() : null, since, sinceDay: since != null ? String(e.since).slice(0, 10) : null, scope: typeof e.scope === 'string' ? e.scope : null });
  }
  return out;
}
const overlaps = (p, hit) => {
  if (!p) return false;
  if (p.type === 'db') return hit.path === p.path;
  if (p.type !== 'file' || p.path !== hit.path) return false;
  if (p.a == null || hit.a == null) return true;
  return p.a <= hit.b && hit.a <= p.b;
};
// 결과(hit: { path, a, b, unit, heading, body })가 대체된 것인가 → [{ id, now, pointer, since, scope }]. cut 앞에 대체된 것만, 지금 문장의 자리 자체는 빼고
export function supersededOf(entries, hit, cut = NO_CUT) {
  const out = [];
  const text = `${hit.heading || ''}\n${hit.body || ''}`.replace(/\s+/g, ' ');
  for (const e of entries || []) {
    if (e.since != null && !(e.since < cut)) continue;
    if (e.nowPointer && overlaps(parsePointer(e.nowPointer), hit)) continue;
    const hitBy = e.old.some((o) => (o.type === 'pointer' ? overlaps(o.p, hit) : o.type === 'unit' ? !!hit.unit && hit.unit === o.unit : text.includes(o.text)));
    if (hitBy) out.push({ id: e.id, now: e.now, pointer: e.nowPointer, since: e.sinceDay, scope: e.scope });
  }
  return out;
}
export const supersededLine = (s) => `대체됨 → 지금: ${s.now}${s.pointer ? ` (${s.pointer})` : ''}${s.scope ? ` [${s.scope}]` : ''}`;
