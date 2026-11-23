// P328 단위 시험: 할 일 카드의 주어는 사람이다. 다른 에이전트(@이름·워커·하위 세션)나 답을 쓴 에이전트 자신의 순서는
// 규칙(findAsks)으로도, 할 일 정리 모델 출력(parseTidy)으로도 카드가 되지 않는다. 사람 몫("해 주실 것" 아래 목록, "확인해 주세요")은 남는다.
// 표본은 모두 지어낸 글이다(실제 대화 글은 넣지 않는다). 모델은 부르지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findAsks, agentSteps, agentCard, isAgentSentence } from '../src/auto-ask.mjs';
import { parseTidy, tidyPrompt } from '../src/todo-tidy.mjs';

// 지휘 세션이 워커에게 넘긴 뒤 그 워커의 순서를 적은 답(사용자 피드백과 뜻이 같은 지어낸 글)
const HANDED = [
  '@lab-runner에게 노트북 실행 결과를 확인하라고 전달했습니다. 워커는 노트북 탭으로 돌아가 다음 순서로 진행합니다.',
  '',
  '1. 저장소 연결이 됐는지 확인합니다. 멈춰 있으면 "전체 실행"을 다시 누릅니다.',
  '2. 학습(7절)과 평가(8절)가 끝날 때까지 기다립니다. 30분쯤 걸릴 수 있습니다.',
  '3. 단계별 점수표, 라이브러리 버전, 걸린 시간을 기록합니다.',
  '',
  '결과가 오면 기대값과 비교해서 알려 드리겠습니다.',
].join('\n');
// 모델이 그 순서를 사람에게 시키는 말로 바꿔 쓴 출력(실제로 있었던 꼴)
const BAD_MODEL = JSON.stringify({ cards: [
  { kind: 'check', question: '저장소 연결이 됐는지 확인하고, 멈춰 있으면 "전체 실행"을 다시 누르세요', options: [], context: '워커는 노트북 탭에서 연결을 확인합니다.', cmds: [], waiting: false, when: '' },
  { kind: 'later', question: '학습과 평가가 끝나면 단계별 점수표, 라이브러리 버전, 걸린 시간을 확인하세요', options: [], context: '', cmds: [], waiting: false, when: '학습·평가가 끝난 뒤' },
] });

test('P328 표본: 다른 에이전트에게 넘긴 순서는 카드 0장(규칙)', () => {
  assert.deepEqual(findAsks(HANDED), []);
  const steps = agentSteps(HANDED);
  assert.ok(steps.some((s) => s.startsWith('저장소 연결이 됐는지 확인합니다')), JSON.stringify(steps));
  assert.ok(steps.some((s) => s.startsWith('단계별 점수표')));
});

test('P328 표본: 모델이 주어를 사람으로 바꿔 쓴 카드는 버린다(parseTidy)', () => {
  const r = parseTidy(BAD_MODEL, HANDED);
  assert.deepEqual(r.cards, []);
  assert.equal(r.dropped, 2);
  // 모델이 actor를 사람 밖으로 적으면 버린다
  const a = parseTidy(JSON.stringify({ cards: [{ kind: 'do', question: '배포 명령을 실행하기', actor: 'agent' }] }), '');
  assert.deepEqual(a.cards, []);
  const h = parseTidy(JSON.stringify({ cards: [{ kind: 'do', question: '배포 명령을 실행하기', actor: 'human' }] }), '');
  assert.equal(h.cards.length, 1);
  assert.equal(h.dropped, undefined);
});

test('P328 사람 몫은 남는다: 워커가 넘긴 뒤라도 사람에게 청하는 줄, "해 주실 것" 아래의 "~합니다" 목록', () => {
  const mixed = [
    '@builder에게 빌드를 맡겼습니다. 워커는 다음 순서로 진행합니다.',
    '',
    '1. 빌드를 돌립니다.',
    '2. 끝나면 새 창에서 로그인 화면이 뜨는지 확인해 주세요.',
  ].join('\n');
  const steps = agentSteps(mixed);
  assert.ok(steps.includes('빌드를 돌립니다.'));
  assert.ok(!steps.some((s) => /로그인 화면/.test(s)), JSON.stringify(steps));
  const kept = parseTidy(JSON.stringify({ cards: [
    { kind: 'check', question: '새 창에서 로그인 화면이 뜨는지 확인하기', actor: 'human' },
    { kind: 'do', question: '빌드를 돌리세요', actor: 'human' },
  ] }), mixed);
  assert.deepEqual(kept.cards.map((c) => c.question), ['새 창에서 로그인 화면이 뜨는지 확인하기']);
  assert.equal(kept.dropped, 1);

  // 사람이 할 순서를 "~합니다"로 적고 그 안에 "워커가 열어 둔 창"(꾸밈)이 있는 답
  const yours = [
    '시험이 로그인 동의 단계에서 멈췄습니다. 이 단계는 직접 눌러 주셔야 합니다.',
    '',
    '**해 주실 것**',
    '1. 워커가 열어 둔 브라우저 창에서 "로그인" 탭을 엽니다.',
    '2. 계정을 확인하고 "계속"을 누릅니다.',
    '',
    '승인하신 뒤 말씀해 주시면, 워커에게 끝날 때까지 기다렸다가 결과를 기록하게 하겠습니다.',
  ].join('\n');
  assert.deepEqual(agentSteps(yours).filter((s) => /브라우저 창|계속/.test(s)), []);
  const human = parseTidy(JSON.stringify({ cards: [{ kind: 'do', question: '브라우저 창에서 로그인 탭을 열고 계정을 확인한 뒤 "계속"을 누르세요', actor: 'human' }] }), yours);
  assert.equal(human.cards.length, 1);

  // 사람에게 직접 묻는 확인·결정은 그대로
  assert.equal(findAsks('고쳤습니다.\n\n새 빌드에서 버튼이 보이는지 확인해 주세요.')[0].kind, 'check');
  assert.equal(findAsks('두 안이 있습니다.\n\nA안과 B안 중 어느 쪽으로 할까요?')[0].kind, 'decide');
});

test('P328 에이전트 주어 문장 가리기', () => {
  for (const s of ['워커는 노트북 탭으로 돌아갑니다.', '제가 PR을 올리겠습니다.', '@runner가 시험을 돌립니다.', 'The worker will rerun the tests.', "I'll open the PR."]) assert.equal(isAgentSentence(s), true, s);
  for (const s of ['워커가 열어 둔 창에서 탭을 엽니다.', '워커가 고친 것을 확인해 주세요.', '제가 고친 화면을 봐 주세요.', '로그인 화면이 뜨는지 확인합니다.', 'Please check the login screen.', 'I fixed it; can you check?']) assert.equal(isAgentSentence(s), false, s);
  // "제가 할 것" 머리 뒤 목록은 그 에이전트의 순서
  const mine = '정리했습니다.\n\n**제가 할 것**\n- 남은 시험을 돌립니다\n- 결과를 기록에 적습니다';
  assert.deepEqual(agentSteps(mine), ['남은 시험을 돌립니다', '결과를 기록에 적습니다']);
  assert.equal(agentCard({ question: '남은 시험을 돌리세요' }, agentSteps(mine)), true);
  assert.equal(agentCard({ question: '로그인 화면이 뜨는지 확인하세요' }, agentSteps(mine)), false);
});

test('P328 작은 모델 지시문에 주어 규칙', () => {
  const p = tidyPrompt('hello');
  assert.match(p, /subject of every card is the HUMAN/);
  assert.match(p, /Never change who acts/);
  assert.match(p, /actor: "human"/);
  assert.match(p, /@x에게 \.\.\. 전달했습니다/);
});
