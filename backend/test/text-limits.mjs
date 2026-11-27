// P387: 스킬·안내문 글 크기 상한의 한 원본. 시험(p8·p41·p46·p143·p181·p204·p334·p375)과 사전 검사(cd backend && npm run check:skill)가 이 값을 같이 읽는다.
// 상한이 시험 파일 셋에 따로 적혀 있어, 스킬 글을 늘린 워커가 전체 시험(약 몇 분)을 다 돌린 뒤에야 셋 중 어디가 떨어졌는지 알았다
// (P303·P304·P320·P334·P337·P380·P382: 같은 함정이 되풀이, P382는 다른 워커와 같은 줄에서 겹침).
// 글을 늘려 상한을 올려야 하면 그 상한의 steps 끝에 [바이트, '단위: 까닭'] 한 줄을 더한다. 값은 이 파일에만 있고 시험은 limitOf(id)로 읽는다.
// 값을 바꾸지 않고 옮겨만 왔다(P387 전 시험의 식 그대로: 더하는 순서와 비교 꼴 <·<=도).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { boardSkill, Branch, childShims } from '../src/branch.mjs';
import { writeBoardPlugin, BOARD_SYSTEM_PROMPT, RECORD_RULE } from '../src/launch.mjs';
import { HARNESS_PROMPT } from '../src/harness.mjs';
import { NEWS_IDS, BRIEF_NEWS, newsLine } from '../src/verbs-notice.mjs';

// 재는 것(what): 글을 만드는 길. unit B는 UTF-8 바이트(Buffer.byteLength), 자는 JS 글자 수(.length)
export const SUBJECTS = {
  'skill-file': { what: 'atrium 스킬 글(플러그인에 쓴 skills/atrium/SKILL.md)', src: 'backend/src/branch.mjs SKILL_BODY', unit: 'B' },
  skill: { what: 'atrium 스킬 글(boardSkill())', src: 'backend/src/branch.mjs SKILL_BODY', unit: 'B' },
  board: { what: '판 안내문(BOARD_SYSTEM_PROMPT)', src: 'backend/src/launch.mjs BOARD_SYSTEM_PROMPT', unit: '자' },
  harness: { what: '하네스 안내문(HARNESS_PROMPT)', src: 'backend/src/harness.mjs HARNESS_PROMPT', unit: '자' },
  record: { what: '일 기록 한 줄(RECORD_RULE)', src: 'backend/src/launch.mjs RECORD_RULE', unit: '자' },
  'news-all': { what: '새 안내 알림 한 줄(newsLine(NEWS_IDS))', src: 'backend/src/verbs-notice.mjs BRIEF_NEWS', unit: '자' },
  'news-line': { what: '새 안내 한 줄마다(BRIEF_NEWS[].line, 가장 긴 것)', src: 'backend/src/verbs-notice.mjs BRIEF_NEWS', unit: '자' },
};

// 상한: 항목마다 steps 끝은 "  ] }," 한 줄(검사가 '여기 앞에 더한다'로 가리킨다). id(시험 쪽 limitOf 인자), 시험 파일과 그 test() 제목 머리(검사가 이 제목만 골라 돌린다), 재는 것, 비교 꼴, 더하는 값들
export const LIMITS = [
  { id: 'p8', test: 'p8.test.mjs', name: 'K2(P36): 플러그인에 atrium 스킬', subject: 'skill-file', op: '<=', steps: [
    [2 * 3107, 'P8: delegate 글(3107바이트)의 두 배'],
    [80, 'P111: 잠든 워커 줄에 혼자 잠들기와 깨우기 범위'],
    [230, 'P143: 결과를 한 길로 받기(당겨 오기·--now 밀어 넣기)'],
    [690, 'P156: 관계 고르기 절(하위·동료, relate)'],
    [700, 'P204: 동료에게 보낼 때(다섯 경우)와 동료 소식(PEER_RULE)'],
    [300, 'P248: 대기열·스티어링 한 줄'],
    [450, 'P267: merger 문구(판 스킬 9절)'],
    [1000, 'P284: 결정 카드 절(사람에게 묻기)'],
    [1000, 'P292: 사용자 몫 절(사람에게 넘기기)'],
    [300, 'P295: 보내는 때(--no-wait·--wait) 두 줄'],
    [700, 'P304: 목표·마일스톤 레인 절'],
    [250, 'P334: 일 기록 한 줄'],
    [450, 'P360: 되살리기·갈라 열기 한 줄'],
    [300, 'P364: 힌트는 atrium know로'],
    [400, 'P380: 슬래시 명령 --raw·OmO 계획 검토자 두 줄'],
    [150, 'P382: --worktree는 하네스와 상관없이, omo는 늘 --worktree'],
    [400, 'P384: 질문 창은 부모가 atrium answer로 답한다'],
  ] },
  { id: 'p41', test: 'p41.test.mjs', name: 'P41 스킬 글과 짧은 안내', subject: 'skill', op: '<', steps: [
    [10700, 'P8~P295 누적(P248 전 8000, P156 관계 고르기, P204 동료, P248 대기열, P267 merger, P284 결정 카드, P292 사용자 몫)'],
    [900, 'P304: 목표·마일스톤 레인 절'],
    [300, 'P334: 일 기록(--record) 한 줄'],
    [450, 'P360: 되살리기·갈라 열기 한 줄'],
    [300, 'P364: 힌트는 atrium know로 찾기 한 마디'],
    [400, 'P380: 슬래시 명령 --raw·OmO 계획 검토자 두 줄'],
    [150, 'P382: --worktree 하네스 무관·omo'],
    [400, 'P384: 질문 창은 부모가 atrium answer로'],
  ] },
  { id: 'p46', test: 'p46.test.mjs', name: 'P46: 스킬 글', subject: 'skill', op: '<', steps: [
    [11000, 'P8~P295 누적(P248 전 8000, P156·P204·P248·P267·P284·P292·P295)'],
    [900, 'P304: 목표·마일스톤 레인 절'],
    [450, 'P360: 되살리기·갈라 열기 한 줄'],
    [300, 'P364: 힌트는 atrium know로 찾기 한 마디'],
    [400, 'P380: 슬래시 명령 --raw·OmO 계획 검토자 두 줄'],
    [150, 'P382: --worktree 하네스 무관·omo'],
    [400, 'P384: 질문 창은 부모가 atrium answer로'],
  ] },
  { id: 'p143-board', test: 'p143.test.mjs', name: 'P143 안내 글', subject: 'board', op: '<', steps: [
    [2088, 'P143 뒤 누적(P334 일 기록, P360 되살리기·갈라 열기, P364 막히면 atrium know, P368 맡기기 전 know 힌트, P384 하위 질문 창은 부모가 atrium answer로)'],
  ] },
  { id: 'p204-board', test: 'p204.test.mjs', name: 'P204 안내 글', subject: 'board', op: '<=', steps: [
    [2070, 'P180 1323자에 P248 1419, P284 1533, P286 1559, P292 1598, P295 1626, P334 1704, P360 1772, P364 1857, P368 1925, P384 2070'],
  ] },
  { id: 'p181-board', test: 'p181.test.mjs', name: 'P181 안내문 길이', subject: 'board', op: '<=', steps: [
    [2070, 'P180 1323자(P169: 판 안내문은 매 요청에 든다)에 P248·P284·P286·P292·P295·P334·P360·P364·P368·P384'],
  ] },
  { id: 'p181-harness', test: 'p181.test.mjs', name: 'P181 안내문 길이', subject: 'harness', op: '<=', steps: [
    [1217, 'P180 뒤 누적(P284 566, P286 674, P292 700, P295 739, P334 767, P360 845, P364 913, P368 1004, P384 1072→1217)'],
  ] },
  { id: 'p334-record', test: 'p334.test.mjs', name: 'P334 안내문 한 줄', subject: 'record', op: '<', steps: [
    [160, 'P334: 일 기록 한 줄은 짧게'],
  ] },
  { id: 'p375-news-all', test: 'p375.test.mjs', name: 'P375 순수 함수', subject: 'news-all', op: '<=', steps: [
    [400, 'P375: 여러 항목 한 줄은 짧게(P384: 네 줄)'],
  ] },
  { id: 'p375-news-line', test: 'p375.test.mjs', name: 'P375 순수 함수', subject: 'news-line', op: '<=', steps: [
    [110, 'P375: 새 안내 한 줄마다'],
  ] },
];

// 상한 값(steps의 합). 시험은 이 값으로 비교한다: op가 '<'면 value < limitOf(id), '<='면 value <= limitOf(id)
export function limitOf(id) {
  const l = LIMITS.find((x) => x.id === id);
  if (!l) throw new Error(`text-limits: 없는 상한 ${id}`);
  return l.steps.reduce((a, [n]) => a + n, 0);
}

// 지금 글을 잰다(시험이 재는 길 그대로). skill-file은 p8처럼 임시 폴더에 플러그인을 써서 SKILL.md를 읽는다
export function measureAll() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p387-'));
  let skillFile;
  try {
    const extra = new Branch({ store: { branchRows: () => [] }, bus: new EventEmitter() }).pluginExtra();
    writeBoardPlugin({ dir: d, skillText: '---\nname: herdr\n---\n', skills: extra.skills, bin: childShims({ node: 'C:\\node\\node.exe', script: 'C:\\m\\bin\\atrium-child.mjs' }) });
    skillFile = fs.readFileSync(path.join(d, 'atrium', 'skills', 'atrium', 'SKILL.md'), 'utf8');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
  const longest = BRIEF_NEWS.reduce((a, n) => (n.line.length > a.length ? n.line : a), '');
  return { 'skill-file': skillFile, skill: boardSkill(), board: BOARD_SYSTEM_PROMPT, harness: HARNESS_PROMPT, record: RECORD_RULE, 'news-all': newsLine(NEWS_IDS) || '', 'news-line': longest };
}

export const sizeOf = (subject, text) => (SUBJECTS[subject].unit === 'B' ? Buffer.byteLength(text) : text.length);
