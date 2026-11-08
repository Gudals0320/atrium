// P94: 미션 맵의 역할 기호(PC 창·웹과 휴대폰이 같이 쓴다). 12px SVG 한 장, 색은 CSS(currentColor)가 정한다.
// lead: 왕관, review: 눈, test: 시험관, docs: 글줄, worker: 고리
const PATHS = {
  lead: <path d="M2 9.5h8L11 3.5 8 6 6 2.5 4 6 1 3.5z" fill="currentColor" />,
  review: <><path d="M1 6c1.4-2.4 3.2-3.6 5-3.6S9.6 3.6 11 6c-1.4 2.4-3.2 3.6-5 3.6S2.4 8.4 1 6z" fill="none" stroke="currentColor" strokeWidth="1.3" /><circle cx="6" cy="6" r="1.6" fill="currentColor" /></>,
  test: <path d="M4.3 1.5h3.4M5 1.5v3.2L2.2 10.2h7.6L7 4.7V1.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />,
  docs: <path d="M2.5 3h7M2.5 6h7M2.5 9h4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />,
  worker: <circle cx="6" cy="6" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.5" />,
};
export function RoleGlyph({ family = 'worker', className = '' }) {
  return <svg className={`mt-role-glyph ${className}`} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" data-family={family}>{PATHS[family] || PATHS.worker}</svg>;
}
