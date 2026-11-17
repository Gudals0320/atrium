// atrium ls·watch의 "응답 필요" 줄(P205: atrium.mjs에서 떼어 시험한다)
// ask: 판의 질문 요약(state.mjs deriveState의 ask). hook이 없는 하네스(AGY 등)는 kind 'screen'(화면에서 읽은 꼬리)이고 도구 이름이 없다
export function fmtAsk(a) {
  if (!a) return '';
  if (a.kind === 'question') return `질문: ${(a.questions || []).map((q) => `${q.question} [${q.options.join(' / ')}]${q.multiSelect ? ' (여러 개)' : ''}`).join(' | ')}`;
  if (a.kind === 'plan') return `계획 승인: ${String(a.plan || '').slice(0, 120)}`;
  if (a.kind === 'unknown_dialog') return '알 수 없는 대화상자(화면 확인 필요)';
  // 화면 꼬리의 어느 줄이 질문인지는 하네스마다 달라 고르지 않는다
  if (a.kind === 'screen') return '화면에서 답을 기다린다(질문 글은 atrium read로 확인)';
  const ch = a.choices ? `  선택지: ${a.choices.map((c) => `${c.n}.${c.label}`).join(' | ')}` : '';
  const what = a.summary || a.tool || '';
  if (!what && !a.question && !ch) return '권한 요청(내용은 화면에서 확인: atrium read)';
  return `권한 요청${what ? ` ${what}` : ''}${a.question ? ` — "${a.question}"` : ''}${ch}`;
}
