// P115: 런처 옮기기(새 키 launchers.v2). 옛 이름과 주소는 이 파일과 그 시험에만 남긴다(이슈 #11 6절).
// - 런처 목록을 새 키(launchers.v2)에 쓴다. 옛 키(launchers)는 지우지 않는다. 옛 코드로 돌아가면 옛 목록을 그대로 쓴다(P33 방식, Launchers.ensure).
// - P255: 모델 연결(P115)을 걷어 냈다. claude 런처 env의 ANTHROPIC_BASE_URL은 env에 그대로 두고(그 주소가 닿는지만 본다), 런처의 checkUrl은 버린다.
//   ATRIUM_OCX_HEALTH·ATRIUM_OCX_BASE_URL은 P33 전 판의 처음 목록(DeepSeek 예시의 env)에만 쓴다.
// - 옛 DeepSeek 런처(P25·P33의 예시)도 같은 규칙의 보통 claude 런처다. 이름과 아이콘은 그대로 두고 특별 취급만 없앴다.
// - P33 전 판(런처 목록이 없음)의 옛 새 세션 기본값(deepseekModel, deepseekCommand 등)은 이 파일만 읽는다.
export const V2_KEY = 'launchers.v2';
export const LEGACY_FLAVOR = 'deepseek'; // P25 세션의 flavor·옛 예시 런처의 ID와 아이콘
const LEGACY_MODEL = 'ocx-claude-deepseek--deepseek-flash[1m]'; // P25 예시 모델(옛 판의 설정에 모델이 없을 때)
const LEGACY_HEALTH_URL = 'http://127.0.0.1:10100/healthz'; // P25 예시의 health 주소(옛 판에 주소를 준 적이 없을 때)
export const LEGACY_KEYS = ['claudeModel', 'claudeEffort', 'claudePermissionMode', 'claudeAllowHerdr', 'codexArgs', 'deepseekModel', 'deepseekCommand'];

const originOf = (u) => { try { return new URL(u).origin; } catch { return null; } };

// P33 전 판: 옛 새 세션 기본값 → 런처 목록(P33의 initialLaunchers 옛 판 길 그대로. DeepSeek 예시는 env의 게이트웨이 주소)
export function legacyInitialLaunchers(o = {}, gw = {}) {
  const healthUrl = gw.healthUrl || LEGACY_HEALTH_URL;
  const base = (id, name, harness, x = {}) => ({ id, name, harness, icon: '', model: '', effort: '', permissionMode: '', args: '', env: {}, command: '', checkUrl: '', ...x });
  const items = [
    base('claude', 'Claude Code', 'claude', { model: o.claudeModel || '', effort: o.claudeEffort || '', permissionMode: o.claudePermissionMode || 'manual' }),
    base('codex', 'Codex', 'codex', { args: o.codexArgs || '' }),
    base('shell', 'Shell', 'shell'),
    o.deepseekCommand
      ? base(LEGACY_FLAVOR, 'DeepSeek', 'command', { icon: LEGACY_FLAVOR, command: o.deepseekCommand })
      : base(LEGACY_FLAVOR, 'DeepSeek', 'claude', { icon: LEGACY_FLAVOR, model: o.deepseekModel || LEGACY_MODEL, permissionMode: o.claudePermissionMode || 'manual', env: { ANTHROPIC_BASE_URL: gw.baseUrl || originOf(healthUrl), CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1' }, checkUrl: healthUrl }),
  ];
  return { v: 1, items, favorites: ['claude', 'codex', LEGACY_FLAVOR, 'shell'] };
}

// 옛 목록(v1) → { list(v2), report }. 여러 번 돌려도 같다. P255: 연결로 옮기지 않는다. claude 런처 env의 ANTHROPIC_BASE_URL은 그대로 env에 둔다
export function migrateLaunchers(v1) {
  const report = { keptBaseUrl: [], droppedCheckUrl: [] };
  const items = (v1 && Array.isArray(v1.items) ? v1.items : []).map((l) => {
    const out = { ...l, env: { ...(l.env || {}) } };
    delete out.checkUrl;
    delete out.connection; // P255: 옛 연결 참조는 읽지 않는다(하네스 기본 로그인)
    if (l.harness === 'claude' && out.env.ANTHROPIC_BASE_URL) report.keptBaseUrl.push(l.name);
    else if (l.checkUrl) report.droppedCheckUrl.push(l.name);
    return out;
  });
  return { list: { v: 2, items, favorites: Array.isArray(v1 && v1.favorites) ? [...v1.favorites] : [] }, report };
}

// 옛 세션(flavor만 있고 env 기록이 없는 P25 세션)의 런처: 그 flavor를 아이콘(또는 ID)으로 쓰는 claude 런처(그 env로 다시 띄운다)
export const legacyFlavorLauncher = (launchers = [], flavor) => (flavor ? launchers.find((l) => l.harness === 'claude' && (l.icon === flavor || l.id === flavor)) || null : null);
