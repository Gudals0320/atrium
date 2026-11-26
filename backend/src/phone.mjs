// P353: 휴대폰 전용 간소 페이지의 백엔드(창 쪽 MobileApp.jsx). 처음 그리기에 필요한 것만 작게 준다.
// - 세션 줄(rowOf): 판의 세션 요약(summary)에서 목록·홈·나무에 쓰는 칸만 골라 짧게(한 줄 120자). 세션 60개에 20KB 안팎
// - 판 버전(rev): 줄이 바뀔 때마다 하나씩 오른다. 다시 붙을 때(phone.subscribe {since, boot}) 그 뒤에 바뀐 줄과 지운 세션만 준다.
//   백엔드가 다시 떴으면(boot가 다름) 또는 지운 기록(GONE_MAX)을 넘겼으면 모두 준다
// - 휴대폰 연결(c.phone)은 판 이벤트를 그대로 받지 않는다(api.mjs broadcast → route). 받는 것: 바뀐 줄(phone.row), 지운 세션(phone.gone),
//   할 일 카드(phone.cards), 연 세션의 전달(delivery), 설정 언어(phone.settings), 업데이트·기기(update.*, device.updated)
// - 세션 화면(phone.session): 마지막 답·지시 전체(상한), 터미널 끝 몇십 줄(글), 기다리는 요청, 그 세션의 대기 글. 기록 더 보기는 phone.history
// - 원격 권한은 다른 판 API와 같다(api.mjs가 짝 맺은 기기 연결만 받는다)
import crypto from 'node:crypto';
import { clip, promptTask } from './text.mjs';
import { tailLines } from './screen.mjs';
import { readMessages } from './transcript.mjs';
import { transcriptPathFor } from './launch.mjs';
import { readGroups } from './ws-groups.mjs'; // P356: 맵 탭의 폴더(가상 그룹)

export const LINE_MAX = 120;
export const GONE_MAX = 500;
export const TAIL_DEFAULT = 40, TAIL_MAX = 200;
export const ANSWER_MAX = 16000, PROMPT_MAX = 4000;
export const HISTORY_MAX = 20;

const firstLine = (x) => String(x || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
const one = (x, n = LINE_MAX) => clip(firstLine(x), n);

// 목록 줄 아래의 한 줄: 묻는 것 → 오류 → 셸 명령 → 일하는 중이면 지시 → 마지막 답 → 마지막 지시(창 lib/phone.js lastLineOf와 같은 차례)
export function lineOf(s) {
  const a = s.ask;
  if (s.state === 'trust_wait') return { kind: 'ask', key: 'trust', text: '' };
  if (s.state === 'waiting' && a) {
    if (a.kind === 'permission') { const sum = firstLine(a.summary); const body = a.tool && sum.startsWith(a.tool + ':') ? sum.slice(a.tool.length + 1).trim() : sum; return { kind: 'ask', key: 'permission', tool: a.tool || '', text: clip(body, LINE_MAX) }; }
    if (a.kind === 'question') return { kind: 'ask', key: 'question', text: one((a.questions || []).map((q) => q.question).join(' / ')) };
    if (a.kind === 'plan') return { kind: 'ask', key: 'plan', text: one(a.plan) };
    return { kind: 'ask', key: 'screen', text: one(a.question || a.tail) };
  }
  if (s.state === 'error' && s.error) return { kind: 'error', text: one(typeof s.error === 'string' ? s.error : s.error.message || '') };
  if (s.kind === 'shell') return { kind: 'shell', text: one(s.shell && s.shell.command) };
  if (s.state === 'working' && s.lastPrompt) return { kind: 'prompt', text: one(s.lastPrompt) };
  if (s.lastAnswer) return { kind: 'answer', text: one(s.lastAnswer) };
  if (s.lastPrompt) return { kind: 'prompt', text: one(s.lastPrompt) };
  return { kind: 'none', text: '' };
}

// 기다리는 요청을 짧게(홈 카드의 번호 단추). 보기 글은 60자
export function askOf(a) {
  if (!a) return null;
  const choices = Array.isArray(a.choices) ? a.choices.slice(0, 9).map((c) => ({ n: c.n, label: clip(String(c.label || ''), 60) })) : [];
  return { kind: a.kind || 'screen', tool: a.tool || null, toolUseId: a.toolUseId || null, since: a.since || null, question: clip(String(a.question || ''), 160) || null, choices };
}

// 판의 세션 요약 → 휴대폰 줄
export function rowOf(s) {
  const r = { sessionId: s.sessionId, name: s.name, workspaceKey: s.workspaceKey || null, kind: s.kind || 'claude', state: s.state, createdAt: s.createdAt || 0, lastActivityAt: s.lastActivityAt || null, line: lineOf(s) };
  if (s.parentSessionId) r.parentSessionId = s.parentSessionId;
  if (s.unseen) r.unseen = true;
  if (s.waking) r.waking = true;
  if (s.hooked === false) r.hooked = false; // 스티어링할 수 없다(lib/steer.js steerBlock)
  if (s.orch && s.orch.on) r.orch = { on: true }; // P379: 자체 오케스트레이션 세션은 스티어링 없이 대기열만(steerBlock 'orchestrates')
  if (s.flavor) r.flavor = s.flavor;
  if (s.billing === 'api' || s.billing === 'sdk') r.billing = s.billing; // P359: API 키 과금 세션. P363: SDK 세션(카드의 SDK 표시)
  if (s.model) r.model = String(s.model).replace(/^claude-/, '').slice(0, 40);
  if (s.effort) r.effort = String(s.effort).slice(0, 12); // P356: 카드의 모델·노력 수준(판 세션 맵과 같은 글)
  if (s.waitingSince) r.waitingSince = s.waitingSince;
  if (s.state === 'waiting' && s.ask) r.ask = askOf(s.ask);
  if (s.kind === 'shell' && s.shell) r.shell = { atPrompt: s.shell.atPrompt, program: !!s.shell.program };
  if (s.lastAnswerAt) r.lastAnswerAt = s.lastAnswerAt;
  if (s.cwdNow && s.git && s.git.isWorktree && s.git.branch) r.branch = String(s.git.branch).slice(0, 60);
  if (s.state === 'working' && s.turn && s.turn.startedAt) r.turnAt = s.turn.startedAt; // P356: 맵 카드의 "일한 시간"
  return r;
}

// P356: 맵 탭(MobileMap.jsx)의 가벼운 구조 답. 판 세션 맵과 같은 그래프(mission.graph)에서 배치·카드에 드는 칸만 남긴다.
// - 자주 바뀌는 값(상태, 분류, 활동·일 시작 시각, 묻는 것, 오류)과 휴대폰 줄에 이미 있는 값(이름, 워크스페이스, 모델·노력 수준, 브랜치)은 빼고 창이 줄에서 덧입힌다. 그래서 구조가 그대로면 답이 같다
// - 세션끼리의 참조(부모, 계보 부모, 동료, 선의 두 끝)는 nodes 차례 번호로 준다(긴 세션 id를 되풀이하지 않게). 창 lib/mobile-map.js graphOf가 판 그래프 모양으로 편다
// - 사람(명령 바)·루프 선과 선의 횟수·시각·지시 글은 맵 탭이 그리지 않으므로 뺀다. 역할 이름(label)은 역할 선에만
// - 열쇠(key): 답 내용의 해시. 창이 같은 열쇠를 주면 { key, same: true }만 준다
export const MAP_TEXT_MAX = 120;
const MAP_EDGE_KINDS = new Set(['role', 'prompt', 'spawn', 'relation']);
const MAP_NODE_KEEP = ['role', 'order', 'closedKids', 'assignAt', 'parentClosed', 'loops', 'orch']; // 모델·노력 수준·브랜치는 휴대폰 줄에 있다(rowOf)
export function mapOf(graph, groups = []) {
  const list = ((graph && graph.nodes) || []).filter((n) => n && n.kind === 'session');
  const at = new Map(list.map((n, i) => [n.id, i]));
  const ref = (id) => (at.has(id) ? at.get(id) : undefined);
  const nodes = list.map((n) => {
    const x = { s: n.sessionId, t: n.createdAt || 0 };
    if (n.agentKind && n.agentKind !== 'claude') x.k = n.agentKind;
    if (ref(n.parentId) !== undefined) x.p = ref(n.parentId);
    if (ref(n.lineageParent) !== undefined) x.lp = ref(n.lineageParent);
    const peers = (n.peers || []).map(ref).filter((v) => v !== undefined);
    if (peers.length) x.peers = peers;
    for (const k of MAP_NODE_KEEP) if (n[k]) x[k] = n[k];
    if (n.lastPrompt) x.lastPrompt = clip(String(n.lastPrompt), MAP_TEXT_MAX);
    if (n.background && n.background.n) x.bg = { n: n.background.n, kinds: n.background.kinds || [] };
    return x;
  });
  const edges = [];
  for (const e of (graph && graph.edges) || []) {
    if (!e || !MAP_EDGE_KINDS.has(e.kind) || ref(e.from) === undefined || ref(e.to) === undefined) continue;
    const y = { f: ref(e.from), t: ref(e.to), k: e.kind };
    if (e.kind === 'role' && e.label) y.label = clip(String(e.label), 40);
    if (e.relation) y.r = e.relation;
    if (e.relationSource) y.rs = e.relationSource;
    if (ref(e.relationUp) !== undefined) y.up = ref(e.relationUp);
    edges.push(y);
  }
  return { nodes, edges, groups: (groups || []).map((g) => ({ id: g.id, name: g.name, members: g.members || [] })) };
}
export const mapKeyOf = (m) => crypto.createHash('sha1').update(JSON.stringify(m)).digest('hex').slice(0, 12);

// 할 일 카드를 짧게
export function cardOf(d) {
  return { id: d.id, kind: d.kind, sessionId: d.sessionId, name: d.name, question: d.question, options: d.options || [], why: d.why ? clip(String(d.why), 300) : null, createdAt: d.createdAt, deferred: !!d.deferred, wakeAt: d.wakeAt || null, ...(d.auto ? { auto: true } : {}), ...(d.cond ? { cond: clip(String(d.cond), 120) } : {}) }; // P357: auto(자동 표시), cond(나중 묶음의 조건)
}
export const cardsOf = (list) => (list || []).map(cardOf);

// 줄 모음과 판 버전. now: 시험용 시계
export class PhoneFeed {
  constructor({ boot = crypto.randomBytes(6).toString('hex') } = {}) {
    this.boot = boot; this.rev = 0; this.rows = new Map(); this.gone = new Map(); this.floor = 0;
  }
  // 세션 요약 하나. 바뀌었으면 { rev, row }, 그대로면 null
  touch(sum) {
    if (!sum || !sum.sessionId) return null;
    const row = rowOf(sum);
    const key = JSON.stringify(row);
    const cur = this.rows.get(sum.sessionId);
    if (cur && cur.key === key) return null;
    const rev = ++this.rev;
    this.rows.set(sum.sessionId, { rev, key, row });
    this.gone.delete(sum.sessionId);
    return { rev, row };
  }
  remove(id) {
    if (!this.rows.has(id)) return null;
    this.rows.delete(id);
    const rev = ++this.rev;
    this.gone.set(id, rev);
    if (this.gone.size > GONE_MAX) { const [first, r] = this.gone.entries().next().value; this.gone.delete(first); this.floor = Math.max(this.floor, r); }
    return { rev, sessionId: id };
  }
  // 지금 세션 요약 모두로 맞춘다(없어진 세션은 지운 기록으로)
  refresh(sums) {
    const live = new Set();
    for (const s of sums) { live.add(s.sessionId); this.touch(s); }
    for (const id of [...this.rows.keys()]) if (!live.has(id)) this.remove(id);
  }
  // 다시 붙기: since 뒤에 바뀐 줄과 지운 세션. 모를 때(다른 boot, 지운 기록을 넘김)는 full
  since(since, boot) {
    const n = Number(since);
    const full = boot !== this.boot || !Number.isFinite(n) || n < 0 || n < this.floor || n > this.rev;
    const rows = [...this.rows.values()].filter((x) => full || x.rev > n).map((x) => x.row);
    const gone = full ? [] : [...this.gone.entries()].filter(([, r]) => r > n).map(([id]) => id);
    return { boot: this.boot, rev: this.rev, full, rows, gone };
  }
}

// 판 이벤트 → 휴대폰 연결이 받을 것. 한 번 셈해 둔 뒤 연결마다 고른다(c.phoneOpen: 연 세션)
export function phoneRoute(feed, b, event, data) {
  switch (event) {
    case 'session.updated': { const x = feed.touch(data); return x ? () => ['phone.row', x] : null; }
    case 'session.created': { const s = data && b.sessions && b.sessions.get(data.sessionId); const x = s ? feed.touch(b.summary(s)) : null; return x ? () => ['phone.row', x] : null; }
    case 'session.removed': { const x = feed.remove(data && data.sessionId); return x ? () => ['phone.gone', x] : null; }
    case 'decision.changed': { const v = { cards: cardsOf(data && data.cards) }; return () => ['phone.cards', v]; }
    case 'delivery': { if (!data) return null; const v = { deliveryId: data.deliveryId, sessionId: data.sessionId, status: data.status, reason: data.reason || null, text: data.text != null ? clip(String(data.text), 120) : undefined, seq: data.seq ?? null, steerWhy: data.steerWhy || null }; return (c) => (c.phoneOpen === data.sessionId ? ['delivery', v] : null); }
    case 'settings.updated': { const v = { language: data && data.language }; return () => ['phone.settings', v]; }
    case 'update.state': case 'update.restart': case 'device.updated': case 'terminal': return () => [event, data];
    default: return null;
  }
}

// 세션 화면의 터미널 끝 줄(글, 색 없음)
async function tailOf(b, s, lines) {
  if (!s.paneId || !b.adapter) return null;
  try { return tailLines(await b.adapter.readScreen(s.paneId, { source: 'recent', format: 'text', lines: Math.min(lines * 3, 600) }), lines).join('\n'); } catch { try { return tailLines(await b.adapter.readScreen(s.paneId, { source: 'visible' }), lines).join('\n'); } catch { return null; } }
}

export function phoneHandlers(b) {
  const feed = b.phoneFeed;
  const view = () => ({ cards: b.decisions ? cardsOf(b.decisions.openAll()) : [], workspaces: b.store.workspaces().map((w) => ({ key: w.key, name: (b.workspaceList().find((x) => x.key === w.key) || {}).name || w.key, root: w.root })) });
  return {
    // 휴대폰 연결: 판 이벤트 대신 휴대폰 이벤트만 받는다. since·boot를 주면 그 뒤의 차이만
    'phone.subscribe': (p, c) => {
      if (c) { c.subscribed = true; c.phone = true; c.phoneRows = true; }
      feed.refresh([...b.sessions.values()].map((s) => b.summary(s)));
      const d = feed.since(p.since, p.boot);
      const st = b.features && b.features.settings ? b.features.settings.get() : {};
      return { phone: true, ...d, ...view(), settings: { language: st.language || null }, me: (c && c.clientId) || null, current: b.currentWorkspace() };
    },
    // P356: 맵 탭의 구조(열 때와 세션 구조가 바뀔 때). key가 같으면 same만
    'phone.map': (p) => {
      const g = b.api && b.api.handlers['mission.graph'] ? b.api.handlers['mission.graph']() : { nodes: [], edges: [] };
      const m = mapOf(g, readGroups(b).groups);
      const key = mapKeyOf(m);
      return p && p.key === key ? { key, same: true } : { key, ...m };
    },
    // 세션 화면. 연 세션의 전달 이벤트만 받는다(c.phoneOpen)
    'phone.session': async (p, c) => {
      const s = b.resolve(p.session);
      if (c) c.phoneOpen = s.sessionId;
      const rt = s.rt || {};
      const sum = b.summary(s);
      const lines = Math.min(Math.max(Number(p.lines) || TAIL_DEFAULT, 1), TAIL_MAX);
      const brief = p.brief === true; // P355: 터미널 보기(xterm이 화면을 보인다)는 기다리는 요청·대기 글만. 마지막 답·지시·터미널 끝 줄은 빼고 화면도 읽지 않는다
      const q = b.queue && b.queue.list ? b.queue.list(s.sessionId) : [];
      const deliveries = q.map((d) => { const full = (b.store.getDelivery && b.store.getDelivery(d.deliveryId)) || {}; return { deliveryId: d.deliveryId, sessionId: s.sessionId, status: d.status, reason: d.reason || null, text: clip(String(full.text || ''), 120), seq: d.seq ?? d.createdAt ?? null, steerWhy: d.steerWhy || null }; });
      const a = sum.ask;
      return {
        sessionId: s.sessionId, row: rowOf(sum), cwd: sum.cwdNow || s.cwd, model: sum.model || null, effort: sum.effort || null,
        lastAnswer: !brief && rt.lastAnswer ? clip(String(rt.lastAnswer), ANSWER_MAX) : null, lastAnswerAt: rt.lastAnswerAt || null,
        lastPrompt: !brief && rt.lastPrompt ? clip(promptTask(rt.lastPrompt), PROMPT_MAX) : null, promptAt: (rt.turn && rt.turn.startedAt) || null,
        ask: a ? { ...askOf(a), summary: a.summary ? clip(String(a.summary), 600) : null, plan: a.plan ? clip(String(a.plan), PROMPT_MAX) : null, questions: Array.isArray(a.questions) ? a.questions.slice(0, 4).map((x) => ({ question: clip(String(x.question || ''), 300), options: (x.options || []).slice(0, 6).map((o) => clip(String(o.label || o), 80)) })) : null } : null,
        tail: brief || s.billing === 'sdk' ? null : await tailOf(b, s, lines), /* P363: SDK 세션은 터미널 화면이 없다 */ deliveries, ...(brief ? { brief: true } : {}),
      };
    },
    // 세션 화면을 떠났다
    'phone.close': (p, c) => { if (c) c.phoneOpen = null; return { ok: true }; },
    // 기록 더 보기: before(seq)보다 앞의 사람·에이전트 글 limit개(최근 것부터 차례로)
    'phone.history': (p) => {
      const s = b.resolve(p.session);
      const file = (s.rt && s.rt.transcriptPath) || transcriptPathFor(b.cfg.claudeProjects, s.cwd, s.sessionId);
      const r = readMessages(file, { afterSeq: -1, limit: 100000 });
      const before = p.before != null ? Number(p.before) : Infinity;
      const all = (r.messages || []).filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text && String(m.text).trim() && m.seq < before);
      const limit = Math.min(Math.max(Number(p.limit) || 6, 1), HISTORY_MAX);
      const items = all.slice(-limit).map((m) => ({ seq: m.seq, at: m.at || null, role: m.role, text: clip(m.role === 'user' ? promptTask(String(m.text)) : String(m.text), 4000) }));
      return { items, more: all.length > items.length, before: items.length ? items[0].seq : null };
    },
    // 셸에 한 줄 치기(휴대폰은 터미널을 붙이지 않는다). 여러 줄은 bracketed paste, 끝에 Enter
    'phone.type': async (p, c) => {
      const s = b.resolve(p.session);
      const text = String(p.text ?? '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
      if (!text) throw Object.assign(new Error('empty text'), { code: 'bad_request' });
      if (!s.paneId) throw Object.assign(new Error('sleeping'), { code: 'sleeping' });
      b.requireTerminal();
      await b.adapter.sendText(s.paneId, text);
      await b.adapter.paneKeys(s.paneId, ['enter']);
      s.lastUserInputAt = Date.now();
      b.touch(s);
      if (c && b.peers) b.peers.touch(c);
      return { ok: true };
    },
    // 새 세션 시트(호출자와 워크스페이스, 연 때만 받는다)
    'phone.spawnInfo': async () => {
      const L = b.features && b.features.launchers ? b.features.launchers.list() : { launchers: [], favorites: [] };
      return { launchers: (L.launchers || []).map((l) => ({ id: l.id, name: l.name, harness: l.harness, favorite: !!l.favorite, icon: l.icon || null, model: l.model || null })), favorites: L.favorites || [], workspaces: view().workspaces, current: b.currentWorkspace() };
    },
  };
}
