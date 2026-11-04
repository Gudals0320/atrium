// P8(K3·K4): 가지 펼치기의 화면. 노드 머리줄의 "@lead의 워커 · 2단계" 표시, 거부된 하위 세션 요청 알림.
// 하위 세션은 판이 띄운 세션이 atrium child로 만든다(창에는 만드는 단추가 없다). 선은 역할 선(Links.jsx) 그대로다.
// P36: 상한(branchMax*)과 설정 대화상자의 상한 칸을 없앴다. 거부는 남의 세션 끄기(not_parent)만 남는다.
import { api } from './api.js';
import { toast } from './store.js';
import { branchLabel } from './lib/branch.js';
import { useT, t } from './lib/i18n.js';

export function BranchBadge({ s, short = false }) {
  useT();
  const l = branchLabel(s);
  if (!l) return null;
  return <span className="mt-badge branch" data-role="branch" data-depth={s.branch.depth} title={l.title}>{short ? l.short : l.text}</span>;
}

// 거부된 요청(판 이벤트 branch_refused)을 사람에게도 알린다
const REFUSED = ['not_parent'];
api.on('branch.refused', (d) => toast(t('branch.refused', { name: d.name, code: REFUSED.includes(d.code) ? t(`branch.refusedCode.${d.code}`) : d.code, limit: '', reason: d.reason }), 'warn'));
