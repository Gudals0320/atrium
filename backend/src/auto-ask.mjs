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
    const unmask = (x) => x.replace(/\u0000(\d+)\u0000/g, (_, n) => codes[Number(n)]);
    const isQ = (x) => isQuestion(x.replace(/\u0000\d+\u0000/g, ' x '));
    for (let j = ss.length - 1; j >= 0; j--) if (isQ(ss[j])) {
      // 바로 앞의 질문 문장도 묶는다("어느 쪽으로 할까요? A와 B 중에서 골라 주세요.")
      let k = j; while (k > 0 && isQ(ss[k - 1])) k--;
      q = unmask(ss.slice(k, j + 1).join(' ')); break;
    }
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
    if (!options.length) options = namedHeads(paras.flat(), plain(q)); // 굵은 보기 머리가 앞쪽에 있고 그 이름이 질문에 나온다
    options = [...new Set(options)];
    if (options.length < 2) options = [];
    const question = clipTo(plain(q).replace(/\s+/g, ' '), AUTO_QUESTION_MAX);
    return { question, options, line: plain(l) };
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
export function findRun(text) {
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
      const later = segs.slice(i + 1).filter((x) => x.type === 'code');
      const blocks = later.length ? later : (i > 0 && segs[i - 1].type === 'code' ? [segs[i - 1]] : []);
      for (const b of blocks) for (const x of b.lines) { const c = cleanCmd(x); if (c) cmds.push(c); }
      for (const x of [...g.lines, ...segs.slice(i + 1).filter((y) => y.type === 'text').flatMap((y) => y.lines)]) { const m = x.match(/^\s*(!\s.+|\$\s.+)$/); if (m) { const c = cleanCmd(m[1]); if (c) cmds.push(c); } }
      if (!cmds.length) for (const x of codes) { const c = cleanCmd(x.slice(1, -1)); if (c && !/^\S+\.(md|txt|json|png|jpg|log)$/i.test(c)) cmds.push(c); }
      cmds = [...new Set(cmds)].slice(0, AUTO_CMDS_MAX);
      if (!cmds.length) return null;
      const question = clipTo(plain(sentence).replace(/\s+/g, ' ').replace(/[:：]\s*$/, ''), AUTO_QUESTION_MAX);
      return { question, options: [], cmds, line: plain(l) };
    }
  }
  return null;
}
export function findAsk(text) {
  const run = findRun(typeof text === 'string' ? text : '');
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
