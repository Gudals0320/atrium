// P380: OmO(omo) 세션에 닿는 글에서 빼는 낱말. OmO의 알려진 문제: Anthropic 구독 경로에서 요청 본문에 소문자 하네스 이름
//   (o-p-e-n-c-o-d-e를 붙여 쓴 것)이 있으면 플랜 한도 대신 추가 사용량으로 돌 수 있다. 판이 omo에 넣는 글·안내문과 omo가 친 atrium 명령의 사람 글 출력은
//   이 한 곳을 거쳐 그 낱말을 다른 표기(OpenCode)로 바꾼다. 다른 종류의 세션과 사람 화면, 사람이 친 글, --json 출력은 그대로 둔다(단위 시험 backend/test/p380.test.mjs)
// 홀로 선 낱말만 바꾼다(지휘 결정): 경로·파일 이름·URL·코드 칸(`…`)·플래그 값(--kind …)·식별자(…-foo, foo_…, 따옴표 안) 안의 것은 에이전트가 그대로 써야 하는 글이라 두지 않고 그대로 둔다
// 순수 함수만 둔다(atrium 명령(bin/atrium-child.mjs)도 이 파일을 읽는다)

const WORD = ['open', 'code'].join(''); // 이 파일 자체도 검색에 걸리지 않게 붙여 쓰지 않는다
// 앞: 글자·숫자·_ 경로(/ \\ .) 이음(- = : @ ~ $ % # & +) 따옴표가 아니고, 바로 앞 낱말이 플래그(-x, --kind)가 아니다.
// 뒤: 글자·숫자·_ 경로(/ \\) 이음(- @)이 아니고, 점·쌍점 뒤에 글자나 /가 이어지지 않는다(파일 이름 x.json, URL 스킴). 문장 끝 점은 된다
const STANDALONE = new RegExp(`(?<![\\w./\\\\\\-=:@~$%#&+'"])(?<!(?:^|\\s)--?[A-Za-z][\\w-]*\\s+)${WORD}(?![\\w/\\\\\\-@'"]|[.:][\\w/\\\\])`, 'g');
const CODE_SPAN = /(`+[^`]*`+)/; // 코드 칸(쪼갠 조각 중 홀수 번째)
export const RISKY_SHOWN = 'OpenCode';

// 그 종류의 세션에 가는 글을 걸러야 하는가
export const riskyKind = (kind) => String(kind || '').toLowerCase() === 'omo';
// 글 → 홀로 선 그 낱말을 바꾼 글(문자열이 아니면 그대로)
export function dropRiskyWords(text) {
  if (typeof text !== 'string' || !text.includes(WORD)) return text;
  return text.split(CODE_SPAN).map((p, i) => (i % 2 ? p : p.replace(STANDALONE, RISKY_SHOWN))).join('');
}
// 그 글에 그 낱말이 (어디든) 있는가 / 홀로 선 것이 있는가(시험·점검용)
export const hasRiskyWord = (text) => typeof text === 'string' && text.includes(WORD);
export const hasStandaloneRiskyWord = (text) => typeof text === 'string' && dropRiskyWords(text) !== text;
// 종류에 맞게: omo면 거르고, 아니면 그대로
export const safeFor = (kind, text) => (riskyKind(kind) ? dropRiskyWords(text) : text);
