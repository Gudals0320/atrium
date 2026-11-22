// P7(J5) 사이드바의 순수 함수: 워크스페이스 묶음 안의 줄(판 세션은 이름 차례 P315, 닫힌 세션·판 밖 대화는 기록이라 마지막 활동 순)을 거르기 글로 고른다.
// 창(Sidebar.jsx)과 단위 시험(app/test/p7-lib.test.mjs)이 같이 쓴다
import { askLine } from './labels.js';
import { t, tOr, translate } from './i18n.js';

export const SECTION_STEP = 5; // 칸마다 처음 보이는 수. "더 보기"를 누를 때마다 이만큼 더

const norm = (t) => String(t || '').toLowerCase();
// 거르기: 빈칸으로 나눈 낱말이 모두 들어 있으면 맞는다(대소문자 무시)
export function matches(fields, filter) {
  const words = norm(filter).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm((Array.isArray(fields) ? fields : [fields]).filter(Boolean).join(' \n '));
  return words.every((w) => hay.includes(w));
}
const sessionFields = (s) => [`@${s.name}`, s.name, s.kind, s.lastPrompt, s.lastAnswer, askLine(s)];
const closedFields = (c) => [`@${c.name}`, c.name, c.kind, c.lastPrompt, c.lastAnswer, c.reasonLabel, c.reason && tOr(`closeReason.${c.reason}`, ''), t('sidebar.closedTag')];
const convoFields = (c) => [c.title, c.firstPrompt, c.lastPrompt, c.lastAnswer, c.folder, c.branch, c.convId];

// 묶임 표시(백엔드 convos.mjs bindingOf의 label)를 고른 언어로. 출처를 모르는 경우의 꼬리 글은 한국어 사전 값과 맞춰 고른다
export function bindingText(b) {
  if (!b || !b.bound) return '';
  if (b.where === 'terminal' && b.pid) return t('binding.terminal', { pid: b.pid });
  // P133: Codex 대화(잠금 파일로 본 열림, Codex 앱)
  if (b.harness === 'codex' && b.where === 'codex') return t('codexConvo.open');
  if (b.harness === 'codex' && b.where === 'desktop') return b.open ? t('codexConvo.appOpen') : t('codexConvo.app');
  if (b.where === 'desktop') return b.open ? t('binding.desktopOpen') : b.archived ? t('binding.desktopArchived') : t('binding.desktop');
  const tail = String(b.label || '').split(' · ').slice(1).join(' · ');
  if (tail === translate('ko', 'binding.srcUnknown')) return t('binding.maybe', { why: t('binding.srcUnknown') });
  if (tail === translate('ko', 'binding.justWritten')) return t('binding.maybe', { why: t('binding.justWritten') });
  return tail ? t('binding.maybe', { why: tail }) : b.label || '';
}

// P315: 이름 차례. 사람에게 보이는 이름 기준, 대소문자 무시, 숫자는 자연 차례(p9 < p10), 한글·영문이 섞여도 늘 같은 차례.
// 같으면 원래 글자 그대로, 그래도 같으면 키로 갈라 차례가 흔들리지 않게 한다
const NAME_COLL = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export function byName(nameOf, keyOf = () => '') {
  return (a, b) => {
    const x = String(nameOf(a) ?? ''), y = String(nameOf(b) ?? '');
    return NAME_COLL.compare(x, y) || (x < y ? -1 : x > y ? 1 : 0) || String(keyOf(a)).localeCompare(String(keyOf(b)));
  };
}
const byTime = (f) => (a, b) => (f(b) || 0) - (f(a) || 0);
export function sidebarRows({ sessions = [], closed = [], convos = [], filter = '' }) {
  return {
    sessions: sessions.filter((s) => matches(sessionFields(s), filter)).sort(byName((s) => s.name, (s) => s.sessionId)),
    closed: closed.filter((c) => matches(closedFields(c), filter)).sort(byTime((c) => c.closedAt)),
    convos: convos.filter((c) => matches(convoFields(c), filter)).sort(byTime((c) => c.lastAt)),
  };
}

// P10 보관함: archive.list의 워크스페이스마다 닫힌 세션과 판 밖 대화를 한 줄로 섞어 마지막 활동 순으로, 거르기 글로 고른다. 빈 리포는 뺀다
export function archiveRows({ workspaces = [], filter = '' }) {
  const at = (c) => (c.sessionId ? c.lastActivityAt || c.closedAt : c.lastAt) || 0;
  return workspaces.map((w) => ({
    key: w.key, name: w.name,
    rows: [...(w.closed || []).filter((c) => matches([...closedFields(c), w.name], filter)), ...(w.convos || []).filter((c) => matches([...convoFields(c), w.name], filter))].sort((a, b) => at(b) - at(a)),
  })).filter((g) => g.rows.length);
}
