// P286: 판 자동 결정 카드의 질문 찾기(순수 함수). 에이전트가 atrium ask를 쓰지 않고 사람에게 글로 묻고 턴을 끝냈을 때,
// 마지막 답의 끝에서 사람에게 묻는 문장 하나와 그 바로 앞(또는 뒤)의 번호 목록·굵은 보기 이름을 뽑는다(decisions.mjs onSession이 쓴다).
// - 코드 덩어리(```, ~~~) 안 글과 줄 안 코드(`…`)는 보지 않는다.
// - 끝 문단(끝 문단이 목록뿐이면 그 앞 문단까지) 안에서 마지막 질문 문장을 고른다. 질문 뒤에는 목록이나 짧은 맺음 줄(두 줄까지)만 올 수 있다.
// - 질문: 물음표(?, ？)로 끝나는 문장, 한국어 부탁("정해 주세요", "말씀해 주세요", "알려 주세요", "확인해 주세요", "골라 주세요" 등)과
//   물음꼴 끝("…까요", "…할까", "…나요"), 영어 "Let me know …", "Please confirm|choose|pick|decide …".
// - 보기(P312): 고르라는 질문("어느 쪽", "어떤", "A/B 중", "골라 주세요", "…할까요, …할까요?", "which", "A or B")에만 붙인다. 예/아니오 질문
//   ("진행할까요?", "올릴지 정해 주세요")에는 붙이지 않는다(카드의 한 줄 답·무시로 충분하다).
//   질문 바로 앞(같은 문단이나 앞 문단) 또는 바로 뒤의 번호 목록(1. 2. 3.)이나 굵은 이름(**A안**)이 2~4개이고 짧고 같은 꼴이면 그것을. 번호 목록 줄에
//   굵은 이름이 있으면 이름만, 없으면 "번호. 글"을 줄여서. 5개 이상이거나 긴 설명이 붙은 소제목이면 보기로 보지 않는다.
//   목록이 없으면 앞 문단의 "A안/B안", "첫째/둘째", "X 쪽/Y 쪽", "…하거나 …"에서 두세 안의 이름을 짧게 뽑는다(못 뽑으면 보기 없음).
// - 맥락(P312): 질문이 든 문단의 앞 문장, 없으면 질문 바로 앞 글 문단(사이의 목록은 건너뜀)의 끝 한두 문장. 못 찾으면 비운다.

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

// P286: 답 앞쪽의 굵은 머리 줄("**A: check-auto.mjs**", "**A안**: …", "1. **빠르게**")의 짧은 이름이 2~4개이고 모두 질문 글에 나오면 그것을 보기로
function namedHeads(all, question) {
  const heads = [];
  for (const l of all) {
    const m = l.match(/^\s*(?:\d{1,2}[.)]\s+|[-*+]\s+)?\*\*(.+?)\*\*/);
    if (!m) continue;
    const full = plain(m[1]).replace(/`/g, '').replace(/[:：]\s*$/, '').trim();
    if (isQuestion(full)) continue; // 굵게 쓴 질문 줄은 보기가 아니다
    const name = full.split(/[:：(（]/)[0].trim();
    if (!name || name.length > 20) continue;
    heads.push({ name, full });
  }
  if (heads.length < 2 || heads.length > AUTO_OPTIONS_MAX) return [];
  const qq = question.replace(/`/g, '');
  const has = (n) => (/^[A-Za-z0-9]{1,3}$/.test(n) ? new RegExp(`(^|[^A-Za-z0-9])${n}([^A-Za-z0-9]|$)`).test(qq) : qq.includes(n));
  if (!heads.every((h) => has(h.name))) return [];
  const out = [...new Set(heads.map((h) => clipTo(h.full, AUTO_OPTION_MAX)))];
  return out.length === heads.length ? out : [];
}

// 한국어 부탁(사람에게 정해·알려 달라는 말)
const KO_ASK = /(정해|말씀해|알려|확인해|골라|선택해|결정해|답해|지정해|승인해|검토해|봐|살펴봐|테스트해|시험해)\s?(주세요|주십시오|주시겠어요|주실래요|줘|줄래)/; // P292: 봐·살펴봐·테스트해·시험해(확인 부탁)
const KO_Q_END = /(까요?|나요|습니까|던가요|실래요|으신가요|인가요|건가요|을지요|할지요)\s*[.!…]*$/;
const EN_ASK = /^(let me know|please (confirm|choose|pick|decide|tell me|advise|select|let me know|check|verify|test|try)|tell me (which|whether|if)|your call|(can|could) you (check|verify|test|try)\b)/i; // P292: check·verify·test·try
// P303: 예의상 덧붙인 맺음 말("필요 없으면 말씀해 주세요", "원하시면 알려 주세요", "Let me know if you need anything", "Feel free to …")은 질문이 아니다.
//   조건 머리(필요하면·원하시면·궁금한 점이 있으면·더 필요하면·편하실 때·언제든 …) + 말해 달라는 부탁이고, 물음표·고르라는 말(어느·어떤 쪽·정해·골라·선택·결정)이 없으면.
const KO_POLITE_IF = /(필요\s?없으시?면|필요\s?없다면|필요하시?면|필요하다면|필요한\s?(것|게|점|부분|일)이\s?(있|생기)으?시?면|더\s?필요하?시?면|추가로\s?필요하?시?면|원하시?면|원하신다면|원하시는\s?(게|것이)\s?있으시?면|궁금한\s?(점|것|게|부분)이?\s?(있|생기)으?시?면|궁금하시?면|질문이\s?(있|생기)으?시?면|문제가?\s?(있|생기)으?시?면|이상한\s?(점|것|게)이?\s?(있|보이)으?시?면|다른\s?(것|요청|질문|의견|일)이?\s?(있|생기)으?시?면|편하실\s?때|편한\s?때|시간\s?되실\s?때|언제든(지|요)?|혹시라도)/;
const KO_POLITE_ASK = /(말씀해|알려|불러|연락해|얘기해|이야기해|요청해)\s?(주세요|주십시오|주시면|줘|주시기)|말씀\s?(주세요|주시면|부탁)|알려\s?주시면/;
const KO_CHOICE = /(어느|어떤\s?(쪽|것|안|방식|걸)|어떻게|정해|골라|선택|결정|무엇을|뭘|어디)/;
const EN_POLITE = /^(feel free to|don't hesitate to|do not hesitate to|happy to help|let me know if (you|there|anything|any)\b|let me know whenever|if you (need|want|'d like|would like|have) (anything|any|more|further|me to|something|other)\b|just let me know)/i;
// P312: 조건·미래 안내("붙일 때가 되면 말씀해 주세요", "뜨면 승인해 주세요", "끝나면 알려 주세요", "Let me know when it's done")도 질문이 아니다.
//   앞으로 일어날 일(…되면·뜨면·끝나면·오면·…할 때) + 말해·알려·승인해·눌러 달라는 부탁이고, 물음표·고르라는 말이 없으면.
const KO_LATER_IF = /([가-힣]*(되|뜨|나오|열리|끝나|생기|오|와|보이|차|돌아오|들어오|바뀌|풀리|떨어지|지나|닫히|멈추)면(?![가-힣])|[가-힣]\s때(가|에|는)?\s)/;
const KO_LATER_ASK = /(말씀해|알려|승인해|허용해|수락해|눌러|불러|연락해|얘기해)\s?(주세요|주십시오|주시면|줘|주시기)|말씀\s?(주세요|주시면)/;
const EN_LATER = /^(when|once|whenever|after)\b.*\b(let me know|approve|tell me|ping me|accept)\b|\blet me know (when|once|as soon as)\b|^(approve|accept) (it|this|that) (when|once)\b/i;
export function isLater(sentence) {
  const s = noCode(plain(String(sentence ?? ''))).replace(/\s+/g, ' ').trim();
  if (!s || /[?？]\s*$/.test(s)) return false;
  if (EN_LATER.test(s)) return true;
  return KO_LATER_IF.test(s) && KO_LATER_ASK.test(s) && !KO_CHOICE.test(s);
}
export function isPolite(sentence) {
  const s = noCode(plain(String(sentence ?? ''))).replace(/\s+/g, ' ').trim();
  if (!s || /[?？]\s*$/.test(s)) return false;
  if (EN_POLITE.test(s)) return true;
  if (isLater(s)) return true; // P312
  return KO_POLITE_IF.test(s) && KO_POLITE_ASK.test(s) && !KO_CHOICE.test(s);
}
// P312: 고르라는 질문인가(아니면 예/아니오). "…할지 정해 주세요"처럼 할지 말지를 묻는 것은 예/아니오다.
const CHOICE_WORD = /(어느|어떤|어떻게|무엇|무얼|뭘|뭐로|뭐가|어디|누구|몇\s?(번|개|가지)|중에서|중에|중\s?(하나|어느|무엇|뭘|골라|고르|택|선택|정해)|가운데|아니면|또는|혹은|편한\s?쪽|원하시는\s?쪽|원하는\s?쪽|좋은\s?쪽|나은\s?쪽)/;
const CHOICE_ASK = /(골라|고르|선택해|선택하|택해|정해|결정해)/;
const YESNO_ASK = /[가-힣]지\s?(정해|결정해|선택해|골라)/;
const EN_CHOICE = /\b(which|what|who|where|how|prefer|either|one of|pick|choose|select)\b|\bor\b/i;
export function isChoice(question) {
  const s = noCode(plain(String(question ?? ''))).replace(/\s+/g, ' ').trim();
  if (!s) return false;
  if (CHOICE_WORD.test(s) || EN_CHOICE.test(s)) return true;
  if ((s.match(/까요/g) || []).length >= 2) return true; // "A로 할까요, B로 할까요?"
  return CHOICE_ASK.test(s) && !YESNO_ASK.test(s);
}
// P312: 목록 없는 "어느 쪽" 질문의 보기 — 글에서 두세 안의 이름을 짧게 뽑는다(못 뽑으면 [])
const ALT_MAX = 20;
const JONG_L = (ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 && c % 28 === 8; };
const dropL = (ch) => String.fromCharCode(ch.charCodeAt(0) - 8);
const PARTICLE_WORD = /^(과|와|이나|나|또는|혹은|아니면|그리고|및|또|그|이|저|두|세|한)$/;
const VAGUE = /(어느|편한|원하는|원하시는|좋은|나은|양|이|그|저|한|다른|두|세)$/;
export function alternatives(text) {
  const t = noCode(plain(String(text ?? ''))).replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const done = (xs) => { const out = [...new Set(xs.map((x) => clipTo(x.trim(), ALT_MAX)).filter(Boolean))]; return out.length >= 2 && out.length <= 3 ? out : null; };
  // 1) A안·B안, 1안·2안, Option A·Plan B
  let r = done([...t.matchAll(/(?<![A-Za-z0-9])([A-Z]|[1-9])\s?안(?![녕내전정])/g)].map((m) => `${m[1]}안`));
  if (r) return r;
  r = done([...t.matchAll(/\b(Option|Plan|Approach)\s([A-Z1-9])\b/g)].map((m) => `${m[1]} ${m[2]}`));
  if (r) return r;
  // 2) 첫째·둘째·셋째(첫 번째·두 번째): 그 뒤 마디를 이름으로
  r = done([...t.matchAll(/(첫째|둘째|셋째|첫\s?번째|두\s?번째|세\s?번째)\s?(?:는|은|로|안은|안|,|:)?\s*([^,.;:!?]+?)(?=이고|이며|입니다|이에요|예요|고\s|[,.;!?]|$)/g)].map((m) => m[2]));
  if (r) return r;
  // 3) "X 쪽 / Y 쪽": 쪽 앞 두 낱말까지
  r = done([...t.matchAll(/((?:[^\s,.:;()·/]+\s)?[^\s,.:;()·/]+)\s?쪽(?=[과와이을은도에으로,.\s/]|$)/g)].map((m) => {
    const ws = m[1].split(' '); while (ws.length > 1 && PARTICLE_WORD.test(ws[0])) ws.shift();
    if (ws.length === 1 && PARTICLE_WORD.test(ws[0])) return '';
    if (VAGUE.test(ws[ws.length - 1])) return '';
    return ws.join(' ') + ' 쪽';
  }).filter(Boolean));
  if (r) return r;
  // 4) "…하거나 …": 앞 마디의 줄기 + 기, 뒤 마디는 '…ㄹ 수'·'…는' 낱말까지를 줄기 + 기로
  for (const sen of sentences(t)) {
    const m = sen.match(/^(.*?)([가-힣]+)거나\s+(.+)$/);
    if (!m) continue;
    const lw = m[1].trim().split(' ').filter(Boolean).slice(-2).filter((w) => !/[은는이가]$/.test(w) || w.length > 2);
    const left = [...lw, m[2] + '기'].join(' ');
    const rw = m[3].split(' '); const out = [];
    let right = null;
    for (let i = 0; i < rw.length && i < 4; i++) {
      const w = rw[i].replace(/[.,!?]+$/, '');
      const last = w.slice(-1);
      if (JONG_L(last) && (rw[i + 1] || '').startsWith('수')) { right = [...out, w.slice(0, -1) + dropL(last) + '기'].join(' '); break; }
      if (/[가-힣]는$/.test(w) && w.length > 1) { right = [...out, w.slice(0, -1) + '기'].join(' '); break; }
      if (/(합니다|됩니다|해요|한다)$/.test(w)) { right = [...out, w.replace(/(합니다|됩니다|해요|한다)$/, '하기')].join(' '); break; }
      out.push(w);
    }
    r = right && done([left, right]);
    if (r) return r;
  }
  return [];
}
// 한 문장이 사람에게 묻는가
export function isQuestion(sentence) {
  const s = noCode(plain(sentence)).replace(/[\s"'”’)\]】」』]+$/u, '').replace(/[\s\p{Extended_Pictographic}\uFE0F]+$/u, '').trim();
  if (!s || s.length < 3) return false;
  if (isPolite(s)) return false; // P303: 예의상 맺음 말
  if (/[?？]$/.test(s)) return true;
  if (KO_ASK.test(s)) return true;
  if (KO_Q_END.test(s)) return true;
  if (EN_ASK.test(s)) return true;
  return false;
}
// 한 줄을 문장으로 나눈다(마침표·물음표·느낌표 뒤 빈칸)
const sentences = (l) => l.split(/(?<=[.!?？。])\s+/).map((x) => x.trim()).filter(Boolean);

// P312: 보기 목록은 짧고 같은 꼴(모두 번호 목록, 모두 굵은 점 목록 …)이어야 한다. 긴 설명이 붙은 소제목은 보기가 아니다
const ITEM_TEXT_MAX = 50; // 보기 하나(40자)보다 조금 긴 것까지
const shapeOf = (l) => (NUM_ITEM.test(l) ? 'num' : BULLET_BOLD.test(l) ? 'bullet-bold' : BOLD_HEAD.test(l) ? 'bold-head' : 'bullet');
function sameShort(items) {
  if (new Set(items.map(shapeOf)).size !== 1) return false;
  return items.every((l) => plain(noCode(l).replace(/^\s*(\d{1,2}[.)]|[-*+])\s+/, '')).length <= ITEM_TEXT_MAX);
}
// P312: 맥락 줄들 → 끝 한두 문장(짧은 맺음·질문과 겹치는 글은 버린다) | null
export const AUTO_CONTEXT_MAX = 160;
function contextOf(lines, q) {
  const all = lines.map((x) => plain(x).replace(/`/g, '')).join(' ').replace(/\s+/g, ' ').trim();
  if (!all) return null;
  const ss = sentences(all).filter((x) => !isQuestion(x));
  let out = ss.slice(-2).join(' ');
  if (out.length > AUTO_CONTEXT_MAX && ss.length > 1) out = ss.at(-1);
  out = clipTo(out.trim(), AUTO_CONTEXT_MAX);
  const qq = plain(q).replace(/`/g, '');
  if (out.length < 8 || qq.includes(out) || out.includes(qq)) return null;
  return out;
}

// 마지막 답 → { question, options, line, context } | null
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
    let q = null; let lead = [];
    const unmask = (x) => x.replace(/\u0000(\d+)\u0000/g, (_, n) => codes[Number(n)]);
    const isQ = (x) => isQuestion(x.replace(/\u0000\d+\u0000/g, ' x '));
    for (let j = ss.length - 1; j >= 0; j--) if (isQ(ss[j])) {
      // 바로 앞의 질문 문장도 묶는다("어느 쪽으로 할까요? A와 B 중에서 골라 주세요.")
      let k = j; while (k > 0 && isQ(ss[k - 1])) k--;
      q = unmask(ss.slice(k, j + 1).join(' ')); lead = ss.slice(0, k).map(unmask); break;
    }
    if (!q) continue;
    // P312: 맥락 — 질문이 든 줄의 앞 문장, 같은 문단의 앞 글 줄, 그다음 앞 문단(사이의 목록 문단은 하나 건너뜀)
    const prose = (ls) => ls.filter((x) => !isItem(x) && !/^\s*#{1,6}\s/.test(x) && !/[:：]\s*$/.test(x) && !/^\s*\*\*[^*]+\*\*\s*$/.test(x));
    let ctxLines = lead.length ? [lead.join(' ')] : prose(tail.slice(0, i));
    if (!ctxLines.length && !lead.length && tail.slice(0, i).every(isItem)) {
      for (let p = k - 1, skipped = 0; p >= 0; p--) {
        const pl = prose(paras[p]);
        if (!pl.length) { if (++skipped > 3) break; continue; } // 목록·소제목만 있는 문단은 셋까지 건너뛴다
        ctxLines = pl; break;
      }
    }
    const context = contextOf(ctxLines, q);
    // 보기: 질문 뒤 목록, 없으면 질문 바로 앞 목록(같은 덩어리 안 바로 위 줄들, 그다음 앞 문단의 끝 목록)
    let items = after.filter(isItem);
    if (!items.length) {
      const up = []; for (let j = i - 1; j >= 0 && isItem(tail[j]); j--) up.unshift(tail[j]);
      if (!up.length && i === 0) { for (let j = before.length - 1; j >= 0 && isItem(before[j]); j--) up.unshift(before[j]); }
      items = up;
    }
    let options = [];
    if (isChoice(q)) { // P312: 고르라는 질문에만 보기
      options = items.map(optionOf).filter(Boolean);
      if (options.length !== items.length || options.length < 2 || options.length > AUTO_OPTIONS_MAX || !sameShort(items)) options = [];
      if (!options.length) options = namedHeads(paras.flat(), plain(q)); // 굵은 보기 머리가 앞쪽에 있고 그 이름이 질문에 나온다
      if (!options.length) options = alternatives([...ctxLines, q].join(' ')); // 앞 문단의 두세 안 이름
      options = [...new Set(options)];
      if (options.length < 2) options = [];
    }
    const question = clipTo(plain(q).replace(/\s+/g, ' '), AUTO_QUESTION_MAX);
    return { question, options, line: plain(l), context };
  }
  return tail.length === 1 ? undefined : null;
}

// ---------- P292: 사용자 몫의 자동 카드 종류 ----------
// findAsk(text) → { kind: 'do'|'check'|'decide', question, options, cmds, line } | null
// - 할 일(do): 끝 쪽 글이 사람에게 명령 실행을 청하고("실행해 주세요", "쳐 주세요", "입력해 주세요", "please run …", "run the following")
//   그 앞뒤 코드 덩어리, `! …` 줄, 청하는 문장 안 줄 안 코드에서 명령을 하나 이상 뽑으면. 명령은 TODO 상한(6개, 각 500자)으로 자른다.
// - 확인(check): findQuestion이 고른 문장이 물음표 없이 확인을 청하면("확인해 주세요", "봐 주세요", "please check|verify|test|try", "let me know if it works").
// - 그 밖의 질문은 결정(decide). 못 가리면 결정이다.
export const AUTO_CMDS_MAX = 6;
export const AUTO_CMD_MAX = 500;
const KO_RUN = /(실행해|실행시켜|입력해|쳐|돌려|붙여\s?넣어|복사해\s?실행해)\s?(주세요|주십시오|주시겠어요|주실래요|줘|줄래|보세요|봐\s?주세요)|실행\s?부탁/;
const EN_RUN = /\b(please|could you|can you|you can|you'?ll need to|you need to)\s+(run|execute|type|paste)\b|^(run|execute)\s+(this|these|the following|the command|the commands|it|`)/i;
const KO_CHECK = /(확인해|봐|살펴봐|테스트해|시험해|써\s?봐)\s?(주세요|주십시오|주시겠어요|주실래요|줘|줄래)|확인\s?부탁/;
const EN_CHECK = /(^|\b)(please\s+)?(check|verify|test|try)\b|let me know (if|whether) (it|that|this|everything) (works|looks|is)|(can|could) you (check|verify|test|try)/i;
// 한 문장이 확인을 청하는가(물음표로 끝나면 결정)
export function isCheck(sentence) {
  const s = noCode(plain(String(sentence ?? ''))).trim();
  if (!s) return false;
  if (/[?？]\s*$/.test(s)) return /^(can|could|would) you (please )?(check|verify|test|try)\b/i.test(s) || /(확인해|봐|테스트해|시험해)\s?(주시겠어요|주실래요|줄래)\s*[?？]$/.test(s); // 물음꼴 확인 부탁("Can you check …?")만 확인, 그 밖의 물음은 결정
  return KO_CHECK.test(s) || EN_CHECK.test(s);
}
export function isRunRequest(sentence) {
  const s = noCode(plain(String(sentence ?? ''))).replace(/\s+/g, ' ').trim();
  return !!s && (KO_RUN.test(s) || EN_RUN.test(s));
}
// 명령 한 줄 다듬기: 셸 머리($, >, PS>, PS C:\…>)를 벗기고 주석·빈 줄은 버린다(`! …`은 Claude Code 입력 칸 꼴이라 그대로 둔다)
export function cleanCmd(l) {
  let s = String(l ?? '').replace(/\s+$/, '');
  s = s.replace(/^\s*(PS [^>]{0,200}>|PS>|\$|>)\s+/, '').trim();
  if (!s || /^(#|\/\/|REM\b|::)/i.test(s)) return null;
  return clipTo(s, AUTO_CMD_MAX);
}
// P312: 실행 부탁이 가리키는 명령의 자리: 'up'(위·앞·above), 'down'(아래·다음·밑·below·following), 'this'(이·그·this), null(가리킴 없음)
const REF_UP = /(위|앞|위쪽|앞서\s?적은|앞에서\s?적은)의?\s?(명령|명령어|커맨드|코드|줄|스크립트)|\b(the\s+)?(above|previous)\s+(command|commands|code|script|line)|\b(command|commands|code|script)\s+above\b/i;
const REF_DOWN = /(아래|다음|밑|아래쪽)의?\s?(명령|명령어|커맨드|코드|줄|스크립트)|\b(the\s+)?(following|below)\b|\b(command|commands|code|script)\s+below\b/i;
const REF_THIS = /(^|\s)(이|그|해당)\s?(명령|명령어|커맨드|스크립트)|\b(this|that|these|those)\s+(command|commands|script)\b/i;
function refOf(sentence) {
  const s = noCode(plain(String(sentence ?? '')));
  return REF_UP.test(s) ? 'up' : REF_DOWN.test(s) ? 'down' : REF_THIS.test(s) ? 'this' : null;
}
export function findRun(text) { const r = runOf(text); return r && r.none ? null : r; }
function runOf(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  // 덩어리: 글 문단(빈 줄로 나뉨)과 코드 덩어리
  const segs = []; let cur = null; let fence = null;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const m = raw.match(FENCE);
    if (fence) { if (m && raw.trim().startsWith(fence)) { segs.push(cur); cur = null; fence = null; } else cur.lines.push(raw); continue; }
    if (m) { if (cur) segs.push(cur); cur = { type: 'code', lines: [] }; fence = m[1].slice(0, 3); continue; }
    if (!raw.trim()) { if (cur) segs.push(cur), cur = null; continue; }
    if (!cur) cur = { type: 'text', lines: [] };
    cur.lines.push(raw.replace(/\s+$/, ''));
  }
  if (cur) segs.push(cur);
  // 끝에서부터 청하는 문장(끝 글 덩어리 셋 안, 그 뒤 글은 짧은 맺음 두 줄까지)
  let after = 0; let textSeen = 0;
  for (let i = segs.length - 1; i >= 0 && textSeen < 3; i--) {
    const g = segs[i];
    if (g.type !== 'text') continue;
    textSeen++;
    for (let j = g.lines.length - 1; j >= 0; j--) {
      const l = g.lines[j];
      const codes = []; const masked = l.replace(/`[^`]*`/g, (x) => { codes.push(x); return `\u0000${codes.length - 1}\u0000`; });
      const ss = sentences(masked);
      const k = ss.findIndex((x) => isRunRequest(x.replace(/\u0000\d+\u0000/g, ' x ')));
      if (k < 0) { if (!/^\s*!\s/.test(l)) after++; if (after > TAIL_AFTER + 1) return null; continue; }
      const sentence = ss.slice(k).join(' ').replace(/\u0000(\d+)\u0000/g, (_, n) => codes[Number(n)]);
      // 명령: 뒤 코드 덩어리들, 없으면 바로 앞 코드 덩어리. 이 문단의 `! …`·`$ …` 줄. 그래도 없으면 청하는 문장 안 줄 안 코드
      let cmds = [];
      // P312: "위 명령"은 앞 코드 덩어리만, "아래·다음 명령"은 뒤 코드 덩어리만, "이·그 명령"은 뒤 그다음 앞. 가리킨 명령을 못 뽑으면 카드를 만들지 않는다(ref)
      const ref = refOf(sentence);
      const later = segs.slice(i + 1).filter((x) => x.type === 'code');
      let near = null; for (let p = i - 1, texts = 0; p >= 0 && texts <= 2; p--) { if (segs[p].type === 'code') { near = segs[p]; break; } texts++; }
      const prev = i > 0 && segs[i - 1].type === 'code' ? [segs[i - 1]] : [];
      const blocks = ref === 'up' ? (near ? [near] : []) : ref === 'down' ? later : ref === 'this' ? (later.length ? later : near ? [near] : []) : (later.length ? later : prev);
      for (const b of blocks) for (const x of b.lines) { const c = cleanCmd(x); if (c) cmds.push(c); }
      for (const x of [...g.lines, ...segs.slice(i + 1).filter((y) => y.type === 'text').flatMap((y) => y.lines)]) { const m = x.match(/^\s*(!\s.+|\$\s.+)$/); if (m) { const c = cleanCmd(m[1]); if (c) cmds.push(c); } }
      if (!cmds.length) for (const x of codes) { const c = cleanCmd(x.slice(1, -1)); if (c && !/^\S+\.(md|txt|json|png|jpg|log)$/i.test(c)) cmds.push(c); }
      cmds = [...new Set(cmds)].slice(0, AUTO_CMDS_MAX);
      if (!cmds.length) return ref ? { none: true } : null;
      const question = clipTo(plain(sentence).replace(/^[-*+]\s+/, '').replace(/\s+/g, ' ').replace(/[:：]\s*$/, ''), AUTO_QUESTION_MAX);
      return { question, options: [], cmds, line: plain(l) };
    }
  }
  return null;
}
export function findAsk(text) {
  const run = runOf(typeof text === 'string' ? text : '');
  if (run && run.none) return null; // P312: "위 명령을 실행해 주세요"인데 명령을 못 뽑았다 → 실행 카드도 결정 카드도 만들지 않는다
  if (run) return { kind: 'do', ...run };
  const q = findQuestion(typeof text === 'string' ? text : '');
  if (!q) {
    // 명령을 못 뽑은 실행 부탁("명령을 실행해 주세요.")은 결정으로(못 가리면 결정)
    const last = String(text ?? '').replace(/\s+$/, '').split('\n').pop() || '';
    const s = sentences(last.replace(/`[^`]*`/g, ' x ')).pop() || '';
    if (!FENCE.test(last) && isRunRequest(s)) { const question = clipTo(plain(last).replace(/\s+/g, ' '), AUTO_QUESTION_MAX); return { kind: 'decide', question: clipTo(plain(sentences(last).pop() || question), AUTO_QUESTION_MAX), options: [], cmds: [], line: plain(last) }; }
    return null;
  }
  return { kind: isCheck(q.question) ? 'check' : 'decide', ...q, options: isCheck(q.question) ? [] : q.options, cmds: [] };
}
