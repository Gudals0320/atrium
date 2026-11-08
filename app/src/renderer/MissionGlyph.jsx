// P100: 미션 맵의 상태 기호(PC·휴대폰 같이). 색만으로 뜻을 싣지 않도록 모양이 다르다:
// 일함 = 꽉 찬 점(셸은 초록), 응답 필요 = 노란 원 안 !, 오류 = 붉은 원 안 ✕, 결과 = 보라 원 안 ✓, 쉼 = 빈 고리, 잠듦 = 달, 끝남 = 빈 네모.
// 색은 토큰만(--st-working, --st-shell_running, --attn, --st-error, --st-review, --st-sleeping, --dim). 장식 기호라 글이 함께 있다(aria-hidden).
export function StateGlyph({ tier, shell = false, className = '' }) {
  const c = `mt-mm-st t-${tier}${className ? ` ${className}` : ''}`;
  switch (tier) {
    case 'work': return <svg className={c} viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" className={shell ? 'f-shell' : 'f-work'} /></svg>;
    case 'turn': return <svg className={c} viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6.5" className="f-turn" /><rect x="6.1" y="3" width="1.8" height="5.2" rx=".9" className="f-ink" /><circle cx="7" cy="10.4" r="1" className="f-ink" /></svg>;
    case 'alert': return <svg className={c} viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6.5" className="f-alert" /><path d="M4.6 4.6l4.8 4.8M9.4 4.6l-4.8 4.8" className="s-ink" /></svg>;
    case 'review': return <svg className={c} viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6.5" className="f-review" /><path d="M4.2 7.2l2 2 3.8-4" className="s-ink" /></svg>;
    case 'sleep': return <svg className={c} viewBox="0 0 14 14" aria-hidden="true"><path d="M9.8 9.6A4.8 4.8 0 0 1 5.4 2.3a5 5 0 1 0 6.3 6.3 4.8 4.8 0 0 1-1.9 1z" className="f-sleep" /></svg>;
    case 'done': return <svg className={c} viewBox="0 0 14 14" aria-hidden="true"><rect x="3.2" y="3.2" width="7.6" height="7.6" rx="1.6" className="s-dim" /></svg>;
    default: return <svg className={c} viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.6" className="s-dim" /></svg>;
  }
}

// 폴더(워크스페이스 판 머리줄)
export const FolderGlyph = () => <svg className="mt-mm-fold" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" /></svg>;
