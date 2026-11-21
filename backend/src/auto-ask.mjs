// P286: 판 자동 결정 카드의 질문 찾기(순수 함수). 에이전트가 atrium ask를 쓰지 않고 사람에게 글로 묻고 턴을 끝냈을 때,
// 마지막 답의 끝에서 사람에게 묻는 문장 하나와 그 바로 앞(또는 뒤)의 번호 목록·굵은 보기 이름을 뽑는다(decisions.mjs onSession이 쓴다).
// - 코드 덩어리(```, ~~~) 안 글과 줄 안 코드(`…`)는 보지 않는다.
// - 끝 문단(끝 문단이 목록뿐이면 그 앞 문단까지) 안에서 마지막 질문 문장을 고른다. 질문 뒤에는 목록이나 짧은 맺음 줄(두 줄까지)만 올 수 있다.
// - 질문: 물음표(?, ？)로 끝나는 문장, 한국어 부탁("정해 주세요", "말씀해 주세요", "알려 주세요", "확인해 주세요", "골라 주세요" 등)과
//   물음꼴 끝("…까요", "…할까", "…나요"), 영어 "Let me know …", "Please confirm|choose|pick|decide …".
// - 보기: 질문 바로 앞(같은 문단이나 앞 문단) 또는 바로 뒤의 번호 목록(1. 2. 3.)이나 굵은 이름(**A안**)이 2~4개면 그것을. 번호 목록 줄에 굵은 이름이 있으면 이름만,
//   없으면 "번호. 글"을 줄여서. 5개 이상이면 보기로 보지 않는다.

export const AUTO_QUESTION_MAX = 200; // 카드 질문 줄임
export const AUTO_OPTION_MAX = 40; // 보기 하나 줄임
export const AUTO_OPTIONS_MAX = 4;
const TAIL_AFTER = 2; // 질문 뒤에 올 수 있는 짧은 맺음 줄 수

const clipTo = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const FENCE = /^\s*(`{3,}|~{3,})/;
// 꾸밈(굵게·기울임·제목·인용 머리)을 벗긴 한 줄
const plain = (l) => l.replace(/^\s*(#{1,6}\s+|>\s*)+/, '').replace(/\*\*|__/g, '').replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$|[.,!?])/g, '$1$2').trim();
const noCode = (l) => l.replace(/`[^`]*`/g, ' ');
const NUM_ITEM = /^\s*(\d{1,2})[.)]\s+(.+)$/;
const BULLET_BOLD = /^\s*[-*+]\s+\*\*(.+?)\*\*/;
const BOLD_HEAD = /^\s*\*\*(.+?)\*\*\s*[:：\-—–]/;
const isItem = (l) => NUM_ITEM.test(l) || BULLET_BOLD.test(l) || BOLD_HEAD.test(l) || /^\s*[-*+]\s+/.test(l);
// 목록 줄 → 보기 이름(번호 목록이나 굵은 이름이 아니면 null)
export function optionOf(l) {
  let m = l.match(NUM_ITEM);
  if (m) {
    const bold = m[2].match(/^\*\*(.+?)\*\*/);
    if (bold) return clipTo(plain(bold[1]).replace(/[:：]$/, ''), AUTO_OPTION_MAX);
    return clipTo(`${m[1]}. ${plain(m[2]).replace(/\s+/g, ' ')}`, AUTO_OPTION_MAX);
  }
  m = l.match(BULLET_BOLD) || l.match(BOLD_HEAD);
  if (m) return clipTo(plain(m[1]).replace(/[:：]$/, ''), AUTO_OPTION_MAX);
  return null;
}

// 한국어 부탁(사람에게 정해·알려 달라는 말)
const KO_ASK = /(정해|말씀해|알려|확인해|골라|선택해|결정해|답해|지정해|승인해|검토해)\s?(주세요|주십시오|주시겠어요|주실래요|줘|줄래)/;
const KO_Q_END = /(까요?|나요|습니까|던가요|실래요|으신가요|인가요|건가요|을지요|할지요)\s*[.!…]*$/;
const EN_ASK = /^(let me know|please (confirm|choose|pick|decide|tell me|advise|select|let me know)|tell me (which|whether|if)|your call)/i;
// 한 문장이 사람에게 묻는가
export function isQuestion(sentence) {
  const s = noCode(plain(sentence)).replace(/[\s"'”’)\]】」』]+$/u, '').replace(/[\s\p{Extended_Pictographic}\uFE0F]+$/u, '').trim();
  if (!s || s.length < 3) return false;
  if (/[?？]$/.test(s)) return true;
  if (KO_ASK.test(s)) return true;
  if (KO_Q_END.test(s)) return true;
  if (EN_ASK.test(s)) return true;
  return false;
}
// 한 줄을 문장으로 나눈다(마침표·물음표·느낌표 뒤 빈칸)
const sentences = (l) => l.split(/(?<=[.!?？。])\s+/).map((x) => x.trim()).filter(Boolean);

// 마지막 답 → { question, options, line } | null
// 끝 문단에 질문이 없고 그 문단이 짧은 맺음 한 줄("기다리겠습니다.")이면 앞 문단에서 한 번 더 찾는다
export function findQuestion(text) {
  const r = findIn(text);
  if (r !== undefined) return r;
  const m = String(text).replace(/\s+$/, '').match(/^([\s\S]*\S)\n\s*\n([^\n]{1,80})$/);
  if (!m || isItem(m[2]) || FENCE.test(m[2])) return null;
  return findIn(m[1]) || null;
}
// undefined: 끝 문단에 질문이 없다(앞 문단을 볼 수 있다), null: 묻는 글이 아니다
function findIn(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  text = String(text);
  // 1) 코드 덩어리 밖 줄만
  const lines = []; let inFence = false;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (FENCE.test(raw)) { inFence = !inFence; lines.push(''); continue; }
    lines.push(inFence ? '' : raw.replace(/\s+$/, ''));
  }
  // 2) 문단(빈 줄로 나뉜 덩어리). 표 줄(|)은 빼고 본다
  const paras = []; let cur = [];
  for (const l of lines) { if (!l.trim() || /^\s*\|/.test(l) || /^\s*([-*_]\s*){3,}$/.test(l)) { if (cur.length) paras.push(cur), cur = []; continue; } cur.push(l); }
  if (cur.length) paras.push(cur);
  if (!paras.length) return null;
  // 3) 끝 문단(목록뿐이면 앞 문단까지)
  let k = paras.length - 1;
  const tail = [...paras[k]];
  if (tail.every(isItem) && k > 0) { k--; tail.unshift(...paras[k]); }
  const before = k > 0 ? paras[k - 1] : [];
  // 4) 끝에서부터 질문 문장을 찾는다(목록 줄이 아닌 줄)
  for (let i = tail.length - 1; i >= 0; i--) {
    const after = tail.slice(i + 1);
    const afterPlain = after.filter((l) => !isItem(l));
    if (afterPlain.length > TAIL_AFTER) return null; // 질문 뒤에 글이 너무 길다(끝에서 묻는 글이 아니다)
    const l = tail[i];
    if (isItem(l)) continue;
    // 줄 안 코드(`…`)는 자리표로 가린 채 문장을 나누고 고른 뒤 되돌린다
    const codes = []; const masked = l.replace(/`[^`]*`/g, (m) => { codes.push(m); return `\u0000${codes.length - 1}\u0000`; });
    const ss = sentences(masked);
    let q = null;
    for (let j = ss.length - 1; j >= 0; j--) if (isQuestion(ss[j].replace(/\u0000\d+\u0000/g, ' x '))) { q = ss[j].replace(/\u0000(\d+)\u0000/g, (_, n) => codes[Number(n)]); break; }
    if (!q) continue;
    // 보기: 질문 뒤 목록, 없으면 질문 바로 앞 목록(같은 덩어리 안 바로 위 줄들, 그다음 앞 문단의 끝 목록)
    let items = after.filter(isItem);
    if (!items.length) {
      const up = []; for (let j = i - 1; j >= 0 && isItem(tail[j]); j--) up.unshift(tail[j]);
      if (!up.length && i === 0) { for (let j = before.length - 1; j >= 0 && isItem(before[j]); j--) up.unshift(before[j]); }
      items = up;
    }
    let options = items.map(optionOf).filter(Boolean);
    if (options.length !== items.length || options.length < 2 || options.length > AUTO_OPTIONS_MAX) options = [];
    options = [...new Set(options)];
    if (options.length < 2) options = [];
    const question = clipTo(plain(q).replace(/\s+/g, ' '), AUTO_QUESTION_MAX);
    return { question, options, line: plain(l) };
  }
  return tail.length === 1 ? undefined : null;
}
