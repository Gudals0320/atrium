// P338: 설정 창의 왼쪽 목록(주제 묶음 → 쪽), 설정 찾기, 딸린 칸 흐려짐(React 없는 순수 함수, 단위 시험 app/test/p338-lib.test.mjs).
// 쪽 이름(key)은 옛 가로 탭의 data-tab과 같게 두어(general, launchers, sleep, recall, devices, terminal) 옛 창 시험과 "설정 › …" 안내가 그대로 맞는다.
// 새 쪽: alerts(알림·사용량, 옛 일반 탭에서 옮김), bots(봇, 옛 에이전트 탭), dev(개발: 성능 기록).
export const NAV = [
  { group: 'general', pages: ['general'] },
  { group: 'session', pages: ['launchers', 'sleep', 'recall'] },
  { group: 'alerts', pages: ['alerts'] },
  { group: 'bots', pages: ['bots'] },
  { group: 'connect', pages: ['devices', 'terminal'] },
  { group: 'dev', pages: ['dev'] },
];
// 쪽이 보일 때(옛 판이면 그 키가 없어 빠진다). s = 설정 값, l = 런처 자료, bots = 보일 봇이 있나
const PAGE_HAS = {
  general: () => true,
  launchers: (s, l) => !!l,
  sleep: (s) => !!s && s.sleepAfterMin != null,
  recall: (s) => !!s && s.archiveDays != null,
  alerts: (s) => !!s && ('usageAlerts' in s || 'usageProbe' in s || 'planNotify' in s),
  bots: (s, l, bots) => !!bots,
  devices: () => true,
  terminal: (s) => !!s,
  dev: (s) => !!s && 'perfTrace' in s,
};
// 보일 목록: [{ group, pages }]. 빈 묶음은 뺀다
export function navOf(settings, launchers, bots) {
  return NAV.map((g) => ({ group: g.group, pages: g.pages.filter((p) => PAGE_HAS[p](settings, launchers, bots)) })).filter((g) => g.pages.length);
}
export const pagesOf = (nav) => nav.flatMap((g) => g.pages);
// 옛 이름으로 연 곳(P268 merger 탭, P313 에이전트 탭)도 봇 쪽으로
export const pageOf = (tab) => (tab === 'merger' || tab === 'agents' ? 'bots' : tab || null);
// 쪽 이름표·묶음 이름표 사전 열쇠
export const pageLabel = (p) => 'setNav.page.' + p;
export const groupLabel = (g) => 'setNav.group.' + g;

// 찾을 수 있는 칸. name·hint·note는 사전 열쇠(note는 ⓘ 안 긴 글). parent가 있으면 딸린 칸(들여쓰고, 부모가 꺼지면 흐리다)
export const ITEMS = [
  { id: 'language', page: 'general', name: 'settings.language', hint: 'settings.languageHint' },
  { id: 'uiScale', page: 'general', name: 'scale.uiName', hint: 'scale.uiHint' },
  { id: 'termScale', page: 'general', name: 'scale.termName', hint: 'scale.termHint' },
  { id: 'workLight', page: 'general', name: 'workLight.name', hint: 'workLight.hint', note: 'workLight.note' },
  { id: 'tray', page: 'general', name: 'settings.trayName', hint: 'settings.tray', note: 'settings.trayNote' },
  { id: 'updateCheck', page: 'general', name: 'update.checkName', hint: 'update.checkHint', note: 'update.note' },
  { id: 'updateChannel', page: 'general', name: 'update.channelName', hint: 'update.channelDevHint', parent: 'updateCheck' },
  { id: 'launchers', page: 'launchers', name: 'launchers.tab', hint: 'launchers.note' },
  { id: 'sleepAfterMin', page: 'sleep', name: 'sleep.afterLabel', hint: 'sleep.afterHint', note: 'sleep.afterNote' },
  { id: 'sessionSleepAfterMin', page: 'sleep', name: 'sessionSleep.afterLabel', hint: 'sessionSleep.afterHint', note: 'sessionSleep.afterNote' },
  { id: 'archiveDays', page: 'recall', name: 'settings.archiveDays', hint: 'settings.archiveDaysHint', note: 'settings.archiveDaysNote' },
  { id: 'autoOpenRepos', page: 'recall', name: 'settings.autoOpenName', hint: 'settings.autoOpen', note: 'settings.autoOpenNote' },
  { id: 'usageAlerts', page: 'alerts', name: 'usage.alertsName', hint: 'usage.alertsHint' },
  { id: 'usageProbe', page: 'alerts', name: 'usageProbe.name', hint: 'usageProbe.hint' },
  { id: 'usageProbeMin', page: 'alerts', name: 'usageProbe.minName', hint: 'usageProbe.minHint', parent: 'usageProbe' },
  { id: 'usageHermes', page: 'alerts', name: 'usageProbe.hermesName', hint: 'usageProbe.hermesHint', parent: 'usageProbe' },
  { id: 'planNotify', page: 'alerts', name: 'plan.notifyName', hint: 'plan.notifyHint' },
  { id: 'bot-merge', page: 'bots', name: 'bots.name.merge', hint: 'merger.desc', note: 'merger.modeNote' },
  { id: 'bot-merge-repos', page: 'bots', name: 'bots.repos', hint: 'merger.repoNote', parent: 'bot-merge' },
  { id: 'bot-todoTidy', page: 'bots', name: 'bots.name.todoTidy', hint: 'todoTidy.desc', note: 'todoTidy.modeNote' },
  { id: 'autoDecisions', page: 'bots', name: 'bots.autoCards', hint: 'autoDecisions.settingHint' },
  { id: 'todoTidyPerHour', page: 'bots', name: 'todoTidy.perHour', hint: 'todoTidy.perHourHint', parent: 'bot-todoTidy' },
  { id: 'devices', page: 'devices', name: 'webDevices.tab', hint: 'setNav.hint.devices' },
  { id: 'terminal', page: 'terminal', name: 'terminalMove.tab', hint: 'setNav.hint.terminal' },
  { id: 'perfTrace', page: 'dev', name: 'perfTrace.name', hint: 'perfTrace.hint', note: 'perfTrace.note' },
];
export const itemOf = (id) => ITEMS.find((x) => x.id === id) || null;

// 부모 칸이 켜졌나(딸린 칸의 흐려짐). 모르는 부모·설정 없음은 켜진 것으로 본다
const PARENT_ON = {
  usageProbe: (s) => s.usageProbe !== false,
  updateCheck: (s) => s.updateCheck !== false,
  'bot-merge': (s) => s.mergerMode !== 'off',
  'bot-todoTidy': (s) => s.todoTidyMode !== 'off',
};
export function parentOn(parent, settings) {
  if (!parent || !settings || !PARENT_ON[parent]) return true;
  return !!PARENT_ON[parent](settings);
}
// 칸 하나: { child, dim }
export function rowState(id, settings) {
  const it = itemOf(id);
  if (!it || !it.parent) return { child: false, dim: false };
  return { child: true, dim: !parentOn(it.parent, settings) };
}

// 찾기: 낱말마다(공백으로 나눔, 대소문자 무시) 이름·풀이·긴 글·쪽 이름에 모두 들어 있는 칸. 이름에 든 것이 먼저, 그다음 목록 차례.
//   pages: 지금 보이는 쪽(없는 쪽의 칸은 빼다). t: 사전(열쇠 → 글). → [{ id, page, name, hint, at: 'name' | 'text' }]
export function searchItems(query, t, pages = null, items = ITEMS, max = 12) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const tr = (k, v) => { if (!k) return ''; try { const s = t(k, v || {}); return s === k ? '' : String(s); } catch { return ''; } };
  const out = [];
  items.forEach((it, i) => {
    if (pages && !pages.includes(it.page)) return;
    const name = tr(it.name, { n: '', min: '', max: '' });
    const hint = tr(it.hint, { n: '', min: '', max: '' });
    const hay = [name, hint, tr(it.note), tr(pageLabel(it.page))].join('\n').toLowerCase();
    if (!words.every((w) => hay.includes(w))) return;
    const nm = name.toLowerCase();
    out.push({ id: it.id, page: it.page, name, hint, at: words.every((w) => nm.includes(w)) ? 'name' : 'text', i });
  });
  out.sort((a, b) => (a.at === b.at ? a.i - b.i : a.at === 'name' ? -1 : 1));
  return out.slice(0, max).map(({ i, ...x }) => x);
}
