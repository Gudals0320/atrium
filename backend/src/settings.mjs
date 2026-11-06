// 판 설정(P6b, ARCH 4절 I7): 판 기록(meta 표의 `settings`)에 둔다. P16: 화면 언어(language, 기본 영어). 창과 Electron main이 settings.get으로 읽고 settings.updated 이벤트로 따라간다.
// 트레이 상주(tray, P14부터 기본 켜짐), P10의 보관 기간(archiveDays)과 리포 스스로 찾기(autoOpenRepos). 창 쪽 설정 화면은 P6c가 만들었다.
// P36: P8의 가지 펼치기 상한 셋(branchMaxChildren, branchMaxDepth, branchMaxTotal)을 없앴다. 판 기록에 남은 옛 값은 아래 옛 키처럼 읽지도 보이지도 않는다.
// P33: 옛 새 세션 기본값(claude*, codexArgs, deepseek*)은 호출자(launchers.mjs)로 옮겼다. 옛 키는 판 기록에 남지만(옛 코드로 돌아갈 때) 읽지도 보이지도 않는다.

export const EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max']; // claude --effort. 빈 값이면 넘기지 않는다
export const PERMISSION_MODES = ['manual', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'];

export const LANGUAGES = ['en', 'ko']; // P16: 화면 언어. 새 판은 영어

export const SETTINGS = {
  language: { type: 'choice', default: 'en', options: LANGUAGES, label: '화면 언어 (en: 영어, ko: 한국어). 앱 창과 트레이 메뉴에 적용합니다.' },
  tray: { type: 'boolean', default: true, label: '창을 닫아도 트레이에서 실행하며 알림을 표시합니다. 트레이 메뉴에서 백엔드를 시작하거나 중지할 수 있습니다.' },
  // P10: 보관과 리포 스스로 찾기(archive.mjs, recall.mjs). 0일이면 저절로 보관을 끈다(손 보관은 그대로)
  archiveDays: { type: 'number', default: 14, min: 0, max: 365, label: '마지막 활동 이후 지정한 일수가 지난 보드 외부 대화와 닫힌 세션을 자동 보관합니다 (0: 사용 안 함).' },
  autoOpenRepos: { type: 'boolean', default: true, label: '터미널(Claude Code CLI)에서 작업한 Git 저장소를 프로젝트로 자동으로 엽니다.' },
  // P40: herdr 실행 파일 경로. 비우면 찾는다(ATRIUM_HERDR 다음, 설치기 current 링크·PATH·알려진 폴더보다 먼저). 바꾸면 백엔드가 다시 찾는다
  herdrPath: { type: 'string', default: '', max: 1024, label: 'herdr 실행 파일 경로입니다. 비우면 herdr 설치 폴더와 PATH에서 찾습니다.' },
  // P49(R3): Tailscale로 온 요청의 로그인 사용자 제한. 켜져 있으면 이 PC에 로그인한 Tailscale 사용자와 허용 목록만 짝 맺고 연결한다. 이 PC의 창에서만 바꾼다
  remoteSameUser: { type: 'boolean', default: true, label: 'Tailscale을 통한 요청은 이 PC에 로그인한 사용자와 허용 목록의 사용자만 허용합니다.' },
  // P58(S4): 원격 받기. 끄면 이 PC 밖에서 온 요청(바깥 요청, 짝 맺은 기기 연결)을 모두 거부하고 붙은 원격 연결을 닫는다. 이 PC의 창과 CLI는 그대로. Tailscale serve 설정은 건드리지 않는다
  remoteAccess: { type: 'boolean', default: true, label: '원격 접속 허용: 끄면 등록된 기기와 Tailscale을 통한 요청을 모두 차단하고 현재 원격 연결을 종료합니다.' },
  remoteAllowedLogins: { type: 'string', default: '', max: 1000, pattern: /^[A-Za-z0-9._%+@,\s-]*$/, hint: '로그인 이름을 쉼표로 구분하세요', label: '추가로 허용할 Tailscale 로그인 이름입니다. 쉼표로 구분하세요.' },
  // P56(S3): 웹 화면 로그인 세션의 수명. remote*라서 이 PC의 창·CLI만 바꾼다(backend.mjs settings.set)
  remoteSessionHours: { type: 'number', default: 12, min: 1, max: 168, label: '패스키 로그인 후 다시 인증할 때까지의 시간입니다 (시간 단위).' },
  remoteIdleMinutes: { type: 'number', default: 30, min: 5, max: 1440, label: '브라우저 연결이 모두 종료된 뒤 다시 인증할 때까지의 시간입니다 (분 단위).' },
  // P62: 패스키로 확인. 끄면(기본) 짝 맺기만으로 세션을 받고 세션은 짝을 풀 때까지 이어진다(Tailscale 기기 묶기, 쿠키, Origin 확인은 그대로). 켜면 P56~P60처럼 패스키와 12시간·30분 세션
  remotePasskey: { type: 'boolean', default: false, label: '패스키 인증: 켜면 기기 등록 승인 후 패스키를 만들고 세션 종료 시 다시 인증합니다. 끄면 등록된 Tailscale 기기에서 바로 접속할 수 있습니다.' },
  // P69: 새 릴리즈 확인(GitHub, 몇 시간마다와 창을 켤 때). 알리기만 하고 업데이트는 사람이 누른다
  updateCheck: { type: 'boolean', default: true, label: '새 릴리즈를 몇 시간마다 확인하고 알립니다. 업데이트는 직접 눌러야 합니다.' },
  // P70: 업데이트 채널. stable은 정식 릴리즈만, dev는 dev 브랜치의 사전 릴리즈(v<x.y.z>-dev.<n>)도 알린다. 바꾸면 백엔드가 곧바로 다시 확인한다
  updateChannel: { type: 'choice', default: 'stable', options: ['stable', 'dev'], label: '업데이트 채널 (stable: 정식 릴리즈, dev: dev 브랜치에 합친 기능을 먼저 받는 사전 릴리즈).' },
  sleepAfterMin: { type: 'number', default: 30, min: 0, max: 1440, label: '프로젝트에 지정한 시간(분) 동안 활동이 없으면 보드에서 시작한 Claude Code 세션을 모두 절전 모드로 전환합니다 (0: 자동 절전 사용 안 함).' },
};
export const DEFAULTS = Object.fromEntries(Object.entries(SETTINGS).map(([k, v]) => [k, v.default]));

// P49: 원격 접속 규칙(remote*: 원격 받기, 사용자 규칙, 세션 수명, P62 패스키로 확인)을 바꾸는 요청인가. 이 PC의 창·CLI만 바꾼다(backend.mjs settings.set)
export const touchesRemoteRules = (p) => !!p && typeof p === 'object' && (Object.keys(p).some((k) => k.startsWith('remote')) || String(p.key || '').startsWith('remote'));

const BOOL = { true: true, false: false, on: true, off: false, '1': true, '0': false, yes: true, no: false };
// 바꿀 값 확인: 모르는 키와 맞지 않는 값은 거부한다. 'on'/'off' 같은 글도 받는다(atrium CLI)
export function normalizePatch(patch) {
  if (!patch || typeof patch !== 'object') throw Object.assign(new Error("변경할 설정을 지정하세요."), { code: 'bad_request' });
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    const d = SETTINGS[k];
    if (!d) throw Object.assign(new Error(`알 수 없는 설정입니다: ${k}`), { code: 'bad_request' });
    if (d.type === 'boolean') {
      const b = typeof v === 'boolean' ? v : BOOL[String(v).toLowerCase()];
      if (b === undefined) throw Object.assign(new Error(`${k}에는 true 또는 false를 지정하세요.`), { code: 'bad_request' });
      out[k] = b;
    } else if (d.type === 'number') {
      const n = typeof v === 'number' ? v : Number(String(v).trim());
      if (!Number.isInteger(n) || n < d.min || n > d.max) throw Object.assign(new Error(`${k}: ${d.min}~${d.max} 범위의 정수를 입력하세요.`), { code: 'bad_request' });
      out[k] = n;
    } else if (d.type === 'choice') {
      const c = String(v ?? '').trim();
      if (!d.options.includes(c)) throw Object.assign(new Error(`${k}: ${d.options.map((o) => o || '(빈 값)').join(', ')} 중 하나를 지정하세요.`), { code: 'bad_request' });
      out[k] = c;
    } else if (d.type === 'string') {
      const t = String(v ?? '').trim();
      if (t.length > d.max || (d.pattern && !d.pattern.test(t))) throw Object.assign(new Error(`${k}: 유효하지 않은 값입니다 (${d.max}자까지${d.pattern ? `, ${d.hint || '영문·숫자·._:/[]-만'}` : ''})`), { code: 'bad_request' });
      out[k] = t;
    }
  }
  return out;
}

export class Settings {
  constructor({ store, broadcast }) { this.store = store; this.broadcast = broadcast; }
  // 정의에 있는 키만 보인다(옛 키 claude* 등은 판 기록에만 남는다)
  get() { const raw = this.store.getMeta('settings') || {}; return Object.fromEntries(Object.keys(SETTINGS).map((k) => [k, k in raw ? raw[k] : DEFAULTS[k]])); }
  describe() { return Object.fromEntries(Object.entries(SETTINGS).map(([k, v]) => [k, { type: v.type, default: v.default, label: v.label, ...(v.type === 'number' ? { min: v.min, max: v.max } : {}), ...(v.type === 'choice' ? { options: v.options } : {}), ...(v.type === 'string' ? { max: v.max } : {}) }])); }
  // settings.set { tray: true } 또는 { key: 'tray', value: true }
  set(p) {
    const patch = normalizePatch(p && p.key ? { [p.key]: p.value } : p);
    const next = { ...this.get(), ...patch };
    this.store.setMeta('settings', { ...(this.store.getMeta('settings') || {}), ...next }); // 옛 키는 지우지 않는다
    this.broadcast('settings.updated', next);
    return next;
  }
}
