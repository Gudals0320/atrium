// P312 단위 시험: 자동 카드 규칙 다듬기(auto-ask.mjs). 예/아니오 질문에 엉뚱한 보기, 보기가 필요한데 없음, 질문이 아닌 조건 안내,
// 쓸모없는 맥락, 명령 없는 실행 카드 — 다섯 꼴을 지어낸 표본으로 본다(실제 대화 글은 넣지 않는다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { findAsk, findQuestion, findRun, isChoice, isLater, isQuestion, alternatives } from '../src/auto-ask.mjs';

test('P312 예/아니오 질문에는 보기를 붙이지 않는다(앞의 소제목·굵은 머리·번호 목록이 있어도)', () => {
  const yesno = [
    '설계를 정리했습니다.\n\n**결정**\n- **확인 화면**: 저장 전에 고른 값을 한 화면에 모아 보여 주는 단계를 둡니다.\n- **체크리스트**: 처음 쓰는 사람이 따라 할 순서를 다섯 줄로 적어 둡니다.\n\n이대로 진행할까요?',
    '개정안을 적었습니다.\n\n1. **개정 내용**: 문서 셋의 머리말을 바꿉니다\n2. **처리 순서**: 먼저 목록, 그다음 본문\n3. **실제 세션 검증**: 새 세션 하나\n4. **비용**: 한 시간 안\n\n진행할까요?',
    '정리해 둡니다.\n\n**방문 주기**: 한 시간에 한 번으로 줄였습니다.\n\n**알림 시간**: 공지 뒤 오 분.\n\n수집기를 지금 재개할까요?',
    '**원인**: 빌드 스크립트가 경로의 빈칸에서 깨집니다.\n\n**조치**: 따옴표를 붙여 고쳤습니다.\n\n**확인**: 다시 설치해 보니 됩니다.\n\n원저장소에 이슈나 PR을 올릴지 정해 주세요.',
    '- 그냥 목록\n- 둘째\n\n이대로 할까요?',
    'Notes:\n1. **Fast**: patch\n2. **Clean**: rewrite\n\nShould I push the branch?',
  ];
  for (const t of yesno) { const f = findAsk(t); assert.ok(f, t); assert.equal(f.kind, 'decide', t); assert.deepEqual(f.options, [], t); }
  for (const q of ['진행할까요?', '이대로 진행할까요?', '원저장소에 이슈나 PR을 올릴지 정해 주세요.', 'Should I push the branch?', '수집기를 지금 재개할까요?']) assert.equal(isChoice(q), false, q);
  for (const q of ['어느 쪽으로 할까요?', '어떤 방식으로 진행할까요?', 'A/B 중 정해 주세요.', '1~3 중 골라 주세요.', '원하는 이름을 정해 주세요.', '지금 할까요, 나중에 할까요?', 'Which do you want?', 'Option A or B?', '다음 가운데 하나를 골라 주세요.']) assert.equal(isChoice(q), true, q);
});

test('P312 진짜 고르기 질문은 목록 보기를 그대로, 목록이 길거나 꼴이 섞이면 보기가 아니다', () => {
  const q = (t) => findQuestion(t);
  assert.deepEqual(q('두 길이 있습니다.\n\n1. A안: 빠르게 고친다\n2. B안: 다시 만든다\n\n어느 쪽으로 할까요?').options, ['1. A안: 빠르게 고친다', '2. B안: 다시 만든다']);
  assert.deepEqual(q('어느 쪽으로 할까요?\n\n1. 진행\n2. 멈춤\n3. 다시').options, ['1. 진행', '2. 멈춤', '3. 다시']);
  assert.deepEqual(q('- **A**: 하나\n- **B**: 둘\n\n어느 쪽으로 갈지 골라 주세요.').options, ['A', 'B']);
  assert.deepEqual(q('Pick one:\n1. **Fast**: patch it\n2. **Clean**: rewrite\nWhich do you want?').options, ['Fast', 'Clean']);
  const long = '1. 첫 번째 길은 지금 있는 모듈을 그대로 두고 바깥에 얇은 덧층을 씌워 옛 호출을 모두 새 호출로 바꿔 주는 것입니다\n2. 두 번째 길은 모듈을 처음부터 다시 쓰되 옛 이름을 별칭으로 남겨 바깥 코드가 깨지지 않게 하는 것입니다';
  assert.deepEqual(q(long + '\n\n어느 쪽으로 할까요?').options, [], '긴 설명 단락은 보기가 아니다');
  assert.deepEqual(q('1. 진행\n- **멈춤**\n\n어느 쪽으로 할까요?').options, [], '꼴이 섞인 목록은 보기가 아니다');
});

test('P312 목록 없는 "어느 쪽" 질문: 앞 문단의 A안/B안, 첫째/둘째, X 쪽/Y 쪽, …하거나 …에서 보기를 뽑는다', () => {
  const o = (t) => findQuestion(t).options;
  assert.deepEqual(o('두 길이 있습니다. A안은 지금 고치는 것이고 B안은 다음 판에서 고치는 것입니다.\n\n어느 쪽으로 할까요?'), ['A안', 'B안']);
  assert.deepEqual(o('방법은 둘입니다. 첫째는 설정을 바꾸는 것이고, 둘째는 스크립트를 고치는 것입니다.\n\n어느 쪽으로 할까요?'), ['설정을 바꾸는 것', '스크립트를 고치는 것']);
  assert.deepEqual(o('캐시만 지우는 쪽과 저장소를 다시 받는 쪽이 있습니다.\n\n어느 쪽으로 할까요?'), ['캐시만 지우는 쪽', '다시 받는 쪽']);
  assert.deepEqual(o('지금 바로 고치거나 다음 판에서 고칠 수 있습니다.\n\n어느 쪽으로 할까요?'), ['지금 바로 고치기', '다음 판에서 고치기']);
  assert.deepEqual(o('We could take Option A or Option B here.\n\nWhich do you prefer?'), ['Option A', 'Option B']);
  assert.deepEqual(o('여러 가지를 살펴봤습니다.\n\n어느 쪽으로 할까요?'), [], '못 뽑으면 보기 없이');
  assert.deepEqual(alternatives('어느 쪽이 편한 쪽인지 모르겠습니다.'), [], '어느 쪽·편한 쪽은 보기 이름이 아니다');
});

test('P312 조건·미래 안내는 질문이 아니다(…되면·뜨면·끝나면 말씀해·승인해·알려 주세요)', () => {
  const later = ['붙일 때가 되면 말씀해 주세요.', '뜨면 승인해 주세요.', '빌드가 끝나면 알려 주세요.', '권한 창이 나오면 허용해 주세요.', '필요할 때 말씀해 주세요.', "Let me know when it's done.", 'Once the dialog appears, approve it and let me know.'];
  for (const s of later) { assert.ok(isLater(s), s); assert.equal(isQuestion(s), false, s); }
  assert.equal(findAsk('연결 코드는 준비해 두었습니다.\n\n붙일 때가 되면 말씀해 주세요.'), null);
  assert.equal(findAsk('설치를 시작했습니다. 곧 권한 창이 뜹니다.\n\n뜨면 승인해 주세요.'), null);
  // 진짜 물음·지금 정할 것은 그대로
  for (const s of ['준비되면 진행할까요?', '끝나면 어느 쪽으로 할지 정해 주세요.', '설정값 하나만 바꾸면 되니 편한 쪽을 말씀해 주세요.', '배포 전에 화면을 확인해 주세요.']) assert.ok(isQuestion(s), s);
});

test('P312 맥락: 답의 첫 줄이 아니라 질문 바로 앞 글(목록·소제목은 건너뜀), 못 찾으면 비움', () => {
  const c = (t) => findQuestion(t).context;
  assert.equal(c('## 큰 개편이 합쳐졌습니다\n\n여러 가지를 고쳤습니다.\n\n수집기는 어제부터 멈춰 있습니다. 주기를 줄이면 다시 돌려도 됩니다.\n\n수집기를 지금 재개할까요?'), '수집기는 어제부터 멈춰 있습니다. 주기를 줄이면 다시 돌려도 됩니다.');
  assert.equal(c('시험이 모두 통과했습니다. 이대로 마무리할까요?'), '시험이 모두 통과했습니다.');
  assert.equal(c('그림 둘을 찍었습니다.\n\n1. A안\n2. B안\n\n어느 쪽으로 할까요?'), '그림 둘을 찍었습니다.');
  assert.equal(c('1. 왼쪽\n2. 오른쪽\n\n어느 쪽으로 할까요?'), null);
  assert.equal(c('Done. Should I push the branch?'), null, '짧은 맺음은 맥락이 아니다');
  assert.equal(c('이대로 마무리할까요?'), null);
  const long = findQuestion('가'.repeat(300) + '.\n\n진행할까요?').context;
  assert.ok(long.length <= 160);
});

test('P312 명령: "위 명령"은 앞 코드 덩어리에서, 못 뽑으면 실행 카드도 결정 카드도 없음', () => {
  assert.equal(findAsk('## 진행\n\n- 1단계: 끝났습니다.\n- 2단계: 위 명령을 실행해 주세요.'), null);
  assert.equal(findAsk('다음 명령을 실행해 주세요.'), null);
  const f = findAsk('빌드를 고쳤습니다.\n\n```\nnpm run build\n```\n\n- 2단계: 위 명령을 실행해 주세요.');
  assert.equal(f.kind, 'do'); assert.deepEqual(f.cmds, ['npm run build']); assert.equal(f.question, '2단계: 위 명령을 실행해 주세요.');
  // 위를 가리키면 뒤 코드 덩어리(출력 예시)는 쓰지 않는다
  const g = findAsk('```\nnpm ci\n```\n\n위 명령을 실행해 주세요. 나오는 글은 이렇습니다:\n\n```\nadded 10 packages\n```');
  assert.deepEqual(g.cmds, ['npm ci']);
  assert.deepEqual(findRun('설치가 끝났습니다.\n\n아래 명령을 실행해 주세요:\n\n```\nnpm ci\n```').cmds, ['npm ci']);
  assert.equal(findAsk('명령을 실행해 주세요.').kind, 'decide', '가리킴 없는 부탁은 그대로 결정(P292)');
});
