// P364: 작업 지식 찾기(atrium know)의 순수 함수. 원문을 덩어리로 나누고, 검색어를 풀고, 짧은 발췌를 고르고, 사람 대화 인용을 가리고,
// 걷어낸 기능 표시를 판정한다. 파일·DB·git은 만지지 않는다(know-sources.mjs, store-know.mjs).
// 설계 참고: 작업 지식 lab의 know 시제품(Python, 비공개 docs 저장소 lab 브랜치). 판 구조에 맞게 새로 지었다.

export const KNOW_KINDS = Object.freeze(['doc', 'log', 'record', 'review', 'code', 'db']);
export const KNOW_K_DEFAULT = 5;
export const KNOW_K_MAX = 30;
export const EXCERPT_MAX = 160; // 결과 하나의 발췌 글자 수 상한(결과 본문이 길어지지 않게)
export const PER_FILE_MAX = 2; // 한 파일에서 돌려줄 결과 수(한 파일이 상위를 다 차지하지 않게)
export const OPEN_LINES_MAX = 400; // know open 한 번에 보이는 줄 수
export const NO_CUT = 9e15; // --before 없음(밀리초)

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
// 한 줄을 내보낼 꼴로: 말을 옮긴 줄은 통째로 가리고, 긴 따옴표 인용(15낱말 넘음)은 그 인용만 가린다. 비밀은 늘 가린다
export function maskLine(line) {
  const s = String(line || '');
  if (isSpeech(s)) return SPEECH_MASK;
  return redact(s).replace(/“[^”]*”|「[^」]*」|"[^"\n]*"/g, (q) => (q.split(/\s+/).length > 15 ? '[인용 생략]' : q));
}
export const maskText = (text) => String(text || '').split('\n').map(maskLine).join('\n');

// ---------- 덩어리 나누기 ----------
const CHUNK_CHARS = 1400;
const CHUNK_LINES = 17;
// 마크다운·글 → [{ heading, a, b, body }]. 제목에서 끊고, 길면(글자·줄 수) 끊는다. a·b는 1부터 센 원문 줄(빈 줄은 덩어리에 넣지 않는다)
export function mdChunks(raw) {
  const out = [];
  let heading = ''; let buf = []; let size = 0;
  const flush = () => { if (buf.length) out.push({ heading, a: buf[0][0], b: buf[buf.length - 1][0], body: buf.map((x) => x[1]).join('\n') }); buf = []; size = 0; };
  String(raw || '').split('\n').forEach((line, i) => {
    const l = line.replace(/\r$/, '');
    const isHead = /^#{1,6}\s/.test(l);
    if (isHead || size + l.length > CHUNK_CHARS || buf.length >= CHUNK_LINES) flush();
    if (isHead) heading = l.replace(/^#+\s*/, '').trim().slice(0, 160);
    if (l.trim()) { buf.push([i + 1, l]); size += l.length; }
  });
  flush();
  return out;
}
const HASH_COMMENT = new Set(['.py', '.sh', '.ps1', '.psm1', '.rb', '.yml', '.yaml', '.toml']);
// 코드 → 주석 덩어리 [{ heading: '', a, b, body }]. // 와 /* */(앞이 :이면 주소라 뺀다), 스크립트 언어는 #. 65줄 넘게 떨어지면 끊는다
export function commentChunks(raw, ext) {
  const hash = HASH_COMMENT.has(String(ext || '').toLowerCase());
  const out = [];
  let buf = []; let size = 0; let block = false;
  const flush = () => { if (buf.length) out.push({ heading: '', a: buf[0][0], b: buf[buf.length - 1][0], body: buf.map((x) => x[1]).join('\n'), lines: buf.map((x) => x[0]) }); buf = []; size = 0; };
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
const tidy = (s) => s.replace(/“[^”]*”|「[^」]*」|"[^"\n]*"/g, (q) => (q.split(/\s+/).length >= 4 && q.length > 22 ? '"…"' : q)).replace(/^[\s|#*>-]+/, '').replace(/\s+/g, ' ').trim();
// 덩어리에서 물음에 가장 맞는 줄 하나를 짧게(EXCERPT_MAX 자). 쓸 줄이 없으면(모두 말 인용) ''
export function excerpt(body, terms, max = EXCERPT_MAX) {
  const all = String(body || '').split('\n').filter(usable);
  const plain = all.filter((l) => !/^\s*#/.test(l)); // 제목 줄은 결과의 § 제목으로 이미 보인다
  const lines = (plain.length ? plain : all).map((l) => tidy(redact(l))).filter((l) => l.length > 3);
  if (!lines.length) return '';
  let best = lines[0]; let bs = -1;
  for (const l of lines) { const s = strength(l, terms) + Math.min(l.length, 90) * 0.003; if (s > bs) { bs = s; best = l; } }
  if (best.length <= max) return best;
  const low = best.toLowerCase();
  const at = terms.map((t) => low.indexOf(t)).filter((i) => i >= 0).sort((x, y) => x - y)[0] ?? 0;
  const start = Math.max(0, Math.min(at - Math.floor(max / 3), best.length - max + 1));
  const end = Math.min(best.length, start + max - 1);
  return (start ? '…' : '') + best.slice(start, end) + (end < best.length ? '…' : '');
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
