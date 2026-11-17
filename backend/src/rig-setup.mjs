// P190: rig 7단계 백엔드 — 판 안에서 rig 만들기와 고치기(docs research harness-arch.md 16절).
// - 판 API(이 PC의 창·사람의 atrium call: 판 API 토큰만. 원격 기기는 rig.get·rig.templates만 읽는다):
//   rig.templates, rig.create { workspace, template, launchers }, rig.describe { workspace, text, launcher }, rig.get { workspace },
//   rig.save { workspace, seats, flow, results }, rig.spawnSeat { workspace, seat }.
// - 판이 .atrium/을 쓰는 것은 사람이 고른 rig.create(정의가 없을 때만)와 rig.save(seats·flow·results 세 칸만)뿐이다. 제작 세션은 스스로 쓴다.
//   판이 쓴 rig.json은 켜짐과 상관없이 바로 버전으로 남는다(누가 human, Rig.recordNow).
// - 제작 세션(rig-builder): 사람이 주인인 일(work_units.from_session = 'human', origin rig_builder)을 받는다. 상위 세션이 없다.
//   done 값은 판 이벤트 rig.builder로 창에 가고(만들기 대화상자·rig 판이 미리보기와 켜기로 이어 간다), 멈춤은 판 이벤트 rig_builder_stop으로
//   응답 필요 목록(changes.mjs)에 간다. 그 일이 열려 있던 때 rig.json이 바뀌면 그 버전은 누가 human이다(Rig.byOf → humanAt).
// - 기본 런처: 그 워크스페이스에서 마지막으로 런처로 띄운 세션의 런처(spawn 이벤트), 없으면 판 레일의 첫 에이전트 런처, 없으면 claude.
import fs from 'node:fs';
import path from 'node:path';
import { RIG_FILE, validateRig, protectedHits, SEAT_KINDS } from './rig.mjs';
import { SEAT_SPAWN } from './rig-amp.mjs';
import { harnessOf } from './launchers.mjs';
import { shownName } from './session-label.mjs';
import { clip } from './text.mjs';
import { rigTemplates, templateFiles, isTemplate, TEMPLATE_IDS, HUMAN_FROM, BUILDER_ORIGIN, BUILDER_NAME } from './rig-templates.mjs';

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
export const DESCRIBE_MAX = 20000;
const SAVE_KEYS = ['seats', 'flow', 'results'];
const HUMAN_GRACE_MS = 3000; // 제작 일이 닫힌 바로 뒤에 읽힌 고침도 그 일의 것으로 본다(파일 수정 시각과 닫힌 시각의 틈)
const BUILDER_STOP_WHY = { idle_no_done: '보고(atrium done) 없이 쉰다', turn_error: '오류로 턴이 끝났다', needs_human: '사람의 답을 기다린다', closed: '세션이 닫혔다' };
// 값이 null·undefined인 칸을 뺀 얕은 사본
const compact = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== null && v !== undefined));
const atomicWrite = (file, text) => { const tmp = `${file}.atrium-${process.pid}-${Date.now()}`; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); };

export class RigSetup {
  // b: 백엔드(store, rig, sessions, spawn, queue, api, branch)
  constructor(b) { this.b = b; this.stopSeen = new Map(); }
  store() { return this.b.store; }
  rig() { if (!this.b.rig) throw apiError('rig_off', 'rig가 없다.'); return this.b.rig; }
  rootOf(key) { const r = this.rig().rootOf(key); if (!r) throw apiError('not_found', `워크스페이스를 찾을 수 없다: ${key}`); return r; }
  broadcast(kind, data) { if (this.b.api && this.b.api.broadcast) try { this.b.api.broadcast(kind, data); } catch {} }
  changedWs() { if (this.b.broadcastWorkspaces) try { this.b.broadcastWorkspaces(); } catch {} }

  // ---------- 런처 ----------
  launchersData() { const L = this.b.features && this.b.features.launchers; return L ? L.data() : { items: [], favorites: [] }; }
  findLauncher(ref) { const L = this.b.features && this.b.features.launchers; return L && ref ? L.find(ref) : null; }
  isAgentLauncher(l) { const h = l && harnessOf(l.harness); return !!h && !['shell', 'command'].includes(h.id); }
  // 런처 id·이름 또는 종류 이름 → { ref(rig.json에 쓸 값), kind, spawn(session.spawn에 넘길 칸) }
  launcherOf(ref) {
    const want = String(ref || '').trim();
    if (!want) throw apiError('bad_request', '런처를 준다(보드의 런처 id나 이름, 또는 claude·codex·opencode·pi)');
    const l = this.findLauncher(want);
    if (l) {
      if (!this.isAgentLauncher(l)) throw apiError('bad_request', `에이전트를 띄우는 런처만 쓴다: ${l.name}`);
      return { ref: l.id || want, kind: harnessOf(l.harness).kind, spawn: { launcher: l.id || l.name } };
    }
    if (SEAT_KINDS.includes(want)) return { ref: want, kind: want, spawn: { kind: want } };
    throw apiError('no_launcher', `런처를 찾을 수 없다: ${want}. 보드의 런처 id나 이름, 또는 ${SEAT_KINDS.join(', ')}`);
  }
  // 그 워크스페이스에서 마지막으로 쓴 런처, 없으면 판의 기본 → 런처 id | 종류 이름
  defaultLauncher(key) {
    for (const d of this.store().recentSpawns(500)) {
      if (d.workspace !== key || !d.launcher) continue;
      const l = this.findLauncher(d.launcher);
      if (l && this.isAgentLauncher(l)) return l.id || l.name;
    }
    const d = this.launchersData();
    for (const id of d.favorites || []) { const l = (d.items || []).find((x) => x.id === id); if (this.isAgentLauncher(l)) return l.id; }
    const first = (d.items || []).find((x) => this.isAgentLauncher(x));
    return first ? first.id : 'claude';
  }

  // ---------- rig.get ----------
  get(key) {
    const rig = this.rig(); const st = this.store();
    const s0 = rig.status(key);
    const root = s0.root;
    let definition = null;
    if (s0.present) { try { definition = JSON.parse(fs.readFileSync(path.join(root, RIG_FILE), 'utf8').replace(/^﻿/, '')); } catch { definition = null; } }
    const last = st.lastRigVersion ? st.lastRigVersion(key) : null;
    const versionN = s0.version ?? (last && s0.hash && last.hash === s0.hash ? last.n : null);
    const seatNames = s0.seats.map((x) => x.name);
    const seated = {};
    for (const n of seatNames) seated[n] = [...this.b.sessions.values()].filter((x) => x.workspaceKey === key && x.rigSeat === n).map((x) => this.sessionView(x));
    return {
      workspace: key, root, file: RIG_FILE, status: s0.state, enabled: s0.enabled, why: s0.invalid || null, usingLastGood: s0.usingLastGood,
      definition, hash: s0.hash, versionN, locked: (s0.protected && s0.protected.pointers) || [], protectedHits: s0.protectedHits, changedFiles: s0.changedFiles,
      openCases: st.liveCasesCount(key), warnings: s0.warnings,
      hooks: s0.hooks.map((h) => ({ at: h.at, run: h.run, ...(h.from ? { from: h.from } : {}), ...(h.tool ? { tool: h.tool } : {}) })),
      tools: s0.tools.map((x) => ({ name: x.name, run: x.run, desc: x.desc })),
      cycles: s0.cycles.map((x) => ({ every: x.every, to: x.to, ...(x.run ? { run: x.run } : {}) })),
      defaultLauncher: this.defaultLauncher(key), seated, builder: this.builderView(key),
    };
  }
  sessionView(s) {
    const sum = this.b.summary ? this.b.summary(s) : null;
    return { sessionId: s.sessionId, name: shownName(s) || s.name, kind: s.kind || 'claude', state: sum ? sum.state : null, seat: s.rigSeat || null };
  }

  // ---------- rig.create ----------
  create(key, { template, launchers = {} } = {}) {
    const rig = this.rig();
    const root = this.rootOf(key);
    if (!isTemplate(template)) throw apiError('bad_request', `틀은 ${TEMPLATE_IDS.join(', ')} 가운데 하나다: ${template || '(없음)'}`);
    const file = path.join(root, RIG_FILE);
    if (fs.existsSync(file)) throw apiError('rig_exists', `이미 rig 정의가 있다(${RIG_FILE}). 고치려면 rig 보기·고치기를 쓴다.`);
    const t = rigTemplates().find((x) => x.id === template);
    const dflt = this.defaultLauncher(key);
    const picked = {};
    for (const [seat, x] of Object.entries(t.seats)) {
      const L = this.launcherOf((launchers && launchers[seat]) || dflt);
      if (x.worktree && L.kind !== 'claude') throw apiError('bad_request', `${seat} 자리는 일마다 워크트리에서 돈다. Claude Code 런처만 쓴다(고른 런처: ${L.ref}, 종류 ${L.kind}).`);
      picked[seat] = L.ref;
    }
    const { def, guides } = templateFiles(template, picked);
    const written = []; const kept = [];
    fs.mkdirSync(path.join(root, '.atrium', 'seats'), { recursive: true });
    for (const [rel, text] of Object.entries(guides)) {
      const f = path.join(root, rel);
      if (fs.existsSync(f)) { kept.push(rel); continue; } // 사람이 둔 자리 안내는 덮지 않는다
      fs.writeFileSync(f, text); written.push(rel);
    }
    const v = validateRig(def, { root, cycleMinMs: rig.cycleMin() });
    if (!v.ok) throw apiError('rig_invalid', `틀로 만든 정의가 맞지 않다: ${v.reason}`);
    try { fs.writeFileSync(file, JSON.stringify(def, null, 2) + '\n', { flag: 'wx' }); }
    catch (e) { if (e.code === 'EEXIST') throw apiError('rig_exists', `이미 rig 정의가 있다(${RIG_FILE}).`); throw e; }
    written.push(RIG_FILE);
    const a = rig.recordNow(key, { by: 'human', note: `create ${template}` });
    this.store().addEvent(null, 'rig_create', { workspace: key, template, launchers: picked, version: a.ok ? a.n : null, written, kept });
    this.b.log && this.b.log(`rig create ${key} ${template} → #${a.ok ? a.n : '?'}`);
    this.changedWs();
    return { ok: true, path: RIG_FILE, version: a.ok ? a.n ?? null : null, template, launchers: picked, written, kept };
  }

  // ---------- rig.save: seats·flow·results 세 칸만 ----------
  save(key, p = {}) {
    const rig = this.rig();
    const root = this.rootOf(key);
    const file = path.join(root, RIG_FILE);
    let text; try { text = fs.readFileSync(file, 'utf8'); } catch { throw apiError('not_found', `${RIG_FILE}이 없다. 먼저 rig를 만든다.`); }
    let raw; try { raw = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { throw apiError('rig_invalid', `${RIG_FILE}이 JSON이 아니라 표로 고치지 못한다(${e.message}). 말로 고치기를 쓴다.`); }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw apiError('rig_invalid', '정의가 JSON 객체가 아니다.');
    const want = {};
    if (p.seats !== undefined) {
      if (!p.seats || typeof p.seats !== 'object' || Array.isArray(p.seats)) throw apiError('bad_request', 'seats는 { "<자리>": { … } } 객체다');
      // 자리마다 지금 칸 위에 준 칸을 얹는다(표가 다루지 않는 guide·tools·may 등은 그대로, null이면 그 칸을 뺀다). 주지 않은 자리는 지운다
      const before = raw.seats && typeof raw.seats === 'object' && !Array.isArray(raw.seats) ? raw.seats : {};
      want.seats = Object.fromEntries(Object.entries(p.seats).map(([n, x]) => {
        if (!x || typeof x !== 'object' || Array.isArray(x)) throw apiError('bad_request', `seats.${n}는 객체다`);
        return [n, compact({ ...(before[n] && typeof before[n] === 'object' ? before[n] : {}), ...x })];
      }));
    }
    if (p.flow !== undefined) {
      if (!Array.isArray(p.flow)) throw apiError('bad_request', 'flow는 줄 배열이다');
      want.flow = p.flow.map((l) => (l && typeof l === 'object' && !Array.isArray(l) ? compact(l) : l));
    }
    if (p.results !== undefined) want.results = p.results;
    // 다른 칸은 그대로, 칸 차례도 그대로(없던 칸은 끝에)
    const next = {};
    for (const k of Object.keys(raw)) next[k] = Object.prototype.hasOwnProperty.call(want, k) ? want[k] : raw[k];
    for (const k of SAVE_KEYS) if (Object.prototype.hasOwnProperty.call(want, k) && !Object.prototype.hasOwnProperty.call(next, k)) next[k] = want[k];
    const v = validateRig(next, { root, cycleMinMs: rig.cycleMin() });
    if (!v.ok) throw apiError('rig_invalid', `저장하지 않았다: ${v.reason}`, { reason: v.reason });
    const prot = rig.rigProtected(key);
    const hits = prot ? protectedHits(next, raw, prot.pointers) : [];
    if (hits.length) throw apiError('rig_protected', `사람만 고치는 자리를 바꿔 저장하지 않았다: ${hits.join(', ')}. 바꾸려면 먼저 그 자리를 사람만 고치는 목록에서 뺀다.`, { protectedHits: hits });
    const out = JSON.stringify(next, null, 2) + '\n';
    if (JSON.stringify(next) === JSON.stringify(raw)) {
      const a = rig.recordNow(key, { by: 'human', note: 'save' });
      return { ok: true, versionN: a.ok ? a.n ?? null : null, unchanged: true, warnings: v.def.warnings || [] };
    }
    atomicWrite(file, out);
    try { const t = new Date(); fs.utimesSync(file, t, t); } catch {}
    const a = rig.recordNow(key, { by: 'human', note: 'save' });
    if (!a.ok) throw apiError(a.hits ? 'rig_protected' : 'rig_invalid', `rig.json은 썼지만 버전으로 남지 않았다: ${a.reason}`);
    this.store().addEvent(null, 'rig_save', { workspace: key, n: a.n, keys: Object.keys(want) });
    this.b.log && this.b.log(`rig save ${key} → #${a.n}`);
    this.changedWs();
    return { ok: true, versionN: a.n ?? null, warnings: v.def.warnings || [] };
  }

  // ---------- rig.spawnSeat: keep 자리를 그 자리의 런처로 새로 띄워 앉힌다 ----------
  async spawnSeat(key, seat) {
    const b = this.b; const rig = this.rig();
    const r = rig.active(key);
    if (!r) throw apiError('rig_off', '켜진 rig가 없다. 자리는 rig를 켠 뒤 앉힌다.');
    const name0 = String(seat || '');
    const x = r.def.seats && r.def.seats[name0];
    if (!x) throw apiError('bad_request', `rig에 자리 ${name0 || '(없음)'}가 없다. 자리: ${r.def.seats ? Object.keys(r.def.seats).join(', ') : '(없음)'}`);
    if (x.session !== 'keep') throw apiError('bad_request', `${name0}는 fresh 자리다. fresh 자리 세션은 일마다 보드가 띄운다.`);
    const sat = [...b.sessions.values()].find((s) => s.workspaceKey === key && s.rigSeat === name0);
    if (sat) throw apiError('seat_taken', `keep 자리 ${name0}에는 이미 @${shownName(sat) || sat.name}가 앉아 있다.`);
    const L = this.launcherOf(x.launcher);
    const name = this.freeName(name0, () => `${name0}-${this.store().nextSeatN(key, name0)}`);
    const res = await b.spawn({ cwd: r.root, name, ...L.spawn, [SEAT_SPAWN]: name0 });
    const s = b.sessions.get(res.sessionId);
    if (!s) throw apiError('spawn_failed', `${name0} 자리 세션이 보드에 등록되지 않았다.`);
    b.branch.flow.setSeat(s, name0, { by: 'human', notify: 'spawned' }); // P193: 첫 요청이 없어 자리 머리를 받지 못한다. 판 알림으로 자리를 알린다
    this.store().addEvent(s.sessionId, 'rig_seat_spawn', { seat: name0, by: 'human', launcher: L.ref, session: 'keep' });
    return { session: s.sessionId, name: s.name, seat: name0, launcher: L.ref };
  }
  freeName(want, nextFn) {
    const taken = new Set([...this.b.sessions.values()].flatMap((x) => [x.name, shownName(x)]).filter(Boolean).map((x) => String(x).toLowerCase()));
    for (const n of (this.b.branch && this.b.branch.pendingNames) || []) taken.add(String(n).toLowerCase());
    for (const n of this.b.spawningNames || []) taken.add(String(n).toLowerCase());
    if (!taken.has(want)) return want;
    for (let i = 0; i < 1000; i++) { const n = nextFn(i); if (!taken.has(n.toLowerCase())) return n; }
    throw apiError('name_taken', `이름을 고르지 못했다: ${want}`);
  }

  // ---------- 제작 세션(rig.describe) ----------
  builderUnits(key, limit = 20) { return this.store().builderUnits(key, BUILDER_ORIGIN, limit); }
  // 그 워크스페이스의 열린 제작 세션(가장 최근 제작 일을 받은 세션이 아직 열려 있으면) → 세션 | null
  builderSession(key) {
    for (const u of this.builderUnits(key, 20)) { const s = this.b.sessions.get(u.to); if (s) return s; }
    return null;
  }
  // 이 세션이 사람이 맡긴 열린 제작 일을 쥐었나
  isBuilder(s) {
    if (!s) return false;
    const tr = this.store().openTryOf(s.sessionId); const u = tr ? this.store().getUnit(tr.unitId) : null;
    return !!(u && u.origin === BUILDER_ORIGIN && u.from === HUMAN_FROM);
  }
  // 그 시각에 그 워크스페이스의 제작 일이 열려 있었나(버전의 누가 human)
  humanAt(key, t) {
    for (const u of this.builderUnits(key, 50)) if (u.createdAt <= t + 500 && (u.status === 'open' || (u.closedAt && t <= u.closedAt + HUMAN_GRACE_MS))) return true;
    return false;
  }
  // rig.get·이벤트가 보이는 제작 세션의 지금(가장 최근 제작 일) → { session, name, unit, state, sessionState, result, text, stopReason, closed, at } | null
  //   state: working | stopped(보고 없이 쉼·오류·사람의 답을 기다림·세션이 닫힘) | done(result가 ok·failed)
  builderView(key) {
    const u = this.builderUnits(key, 1)[0];
    if (!u) return null;
    const st = this.store();
    const tr = st.lastTryOfUnit(u.id);
    const s = this.b.sessions.get(u.to) || null;
    const sum = s && this.b.summary ? this.b.summary(s) : null;
    // P191 창과 맞춘 값: done(ok·failed 모두. result가 가른다) | stopped(멈춤, 닫힘이면 stopReason closed) | working
    let state = u.status === 'done' || u.status === 'failed' ? 'done' : 'stopped';
    if (u.status === 'open') state = sum && (sum.state === 'working' || sum.state === 'starting') ? 'working' : tr && tr.stopReason ? 'stopped' : 'working';
    return {
      session: u.to, name: s ? shownName(s) || s.name : this.b.branch && this.b.branch.units ? this.b.branch.units.nameOf(u.to) : null, unit: u.id, state, sessionState: sum ? sum.state : null,
      result: tr ? tr.result : null, text: tr ? tr.doneText : null, stopReason: tr ? tr.stopReason : null, stopWhy: tr && tr.stopReason ? BUILDER_STOP_WHY[tr.stopReason] || tr.stopReason : null,
      closed: !s, at: (tr && tr.endedAt) || u.createdAt, spec: clip(String(u.spec || '').replace(/\s+/g, ' '), 200),
    };
  }
  async describe(key, { text, launcher = null } = {}) {
    const b = this.b; const rig = this.rig(); const U = b.branch.units;
    const root = this.rootOf(key);
    const want = String(text || '').trim();
    if (!want) throw apiError('bad_request', '원하는 rig를 글로 적는다(text)');
    if (want.length > DESCRIBE_MAX) throw apiError('bad_request', `글이 너무 길다(${want.length}자, ${DESCRIBE_MAX}자까지)`);
    const L = this.launcherOf(launcher || this.defaultLauncher(key));
    const present = rig.read(key).present;
    const spec = present
      ? ['이 워크스페이스의 rig(.atrium/rig.json)를 고친다. 고칠 것만 고치고 다른 칸은 그대로 둔다.', `워크스페이스: ${root}`, `사람이 고른 런처: ${L.ref}(새 자리의 launcher에 따로 말이 없으면 이것을 쓴다)`, '', '사람이 적은 고칠 내용:', want].join('\n')
      : ['이 워크스페이스에 rig를 만든다(.atrium/rig.json이 아직 없다).', `워크스페이스: ${root}`, `사람이 고른 런처: ${L.ref}(자리의 launcher에 따로 말이 없으면 이것을 쓴다)`, '', '사람이 적은 설명:', want].join('\n');
    let s = this.builderSession(key);
    // 사람의 글이라 받는 쪽 워크스페이스 rig의 deliver 훅(from human)을 지난다(켜진 rig의 "말로 고치기")
    const h = await rig.deliver({ target: s || { workspaceKey: key, name: BUILDER_NAME, kind: L.kind, cwd: root }, workspaceKey: key, from: { kind: 'human' }, text: spec });
    if (h.action === 'reject') throw apiError('rig_rejected', `rig의 deliver 훅이 거절했다: ${h.reason}`);
    const body = h.text;
    const st = this.store();
    // 열린 제작 일이 있으면 그 일에 붙는 글(이어지는 지시)
    if (s) {
      const tr = st.openTryOf(s.sessionId); const ou = tr ? st.getUnit(tr.unitId) : null;
      if (ou && ou.origin === BUILDER_ORIGIN && ou.from === HUMAN_FROM) {
        const d = b.queue.enqueue(s.sessionId, body, { origin: { kind: 'human' } });
        st.addEvent(s.sessionId, 'unit_followup', { unitId: ou.id, tryId: tr.id, from: 'human', deliveryId: d.deliveryId });
        st.addEvent(s.sessionId, 'rig_describe', { workspace: key, unitId: ou.id, followup: true, chars: want.length });
        this.broadcastBuilder(key);
        return { session: s.sessionId, name: s.name, unit: ou.id, followup: true, spawned: false };
      }
    }
    let spawned = false;
    if (!s) {
      const name = this.freeName(BUILDER_NAME, (i) => `${BUILDER_NAME}-${i + 2}`);
      const res = await b.spawn({ cwd: root, name, ...L.spawn });
      s = b.sessions.get(res.sessionId);
      if (!s) throw apiError('spawn_failed', '제작 세션이 보드에 등록되지 않았다.');
      spawned = true;
    }
    const made = U.create({ sessionId: HUMAN_FROM, name: 'human' }, s, body, BUILDER_ORIGIN, { fromId: HUMAN_FROM });
    st.addEvent(s.sessionId, 'rig_describe', { workspace: key, unitId: made.unit.id, spawned, launcher: L.ref, present, chars: want.length });
    b.log && b.log(`rig describe ${key} → ${s.name} unit ${made.unit.id}${spawned ? ' (spawned)' : ''}`);
    this.broadcastBuilder(key);
    return { session: s.sessionId, name: s.name, unit: made.unit.id, spawned, held: !!made.held };
  }
  broadcastBuilder(key, extra = {}) { this.broadcast('rig.builder', { workspace: key, ...(this.builderView(key) || {}), ...extra }); }
  keyOfUnit(unit) { const s = this.b.sessions.get(unit.to); if (s) return s.workspaceKey; const r = this.store().getSession ? this.store().getSession(unit.to) : null; return r ? r.workspaceKey : null; }
  // WorkUnits.done이 부른다(제작 일이 닫힘). 꺼진 rig면 맞는 정의를 지금 버전으로 남긴다(누가 human. 켜진 rig는 read()가 남기고 humanAt이 human으로 적는다)
  onDone(unit, tr) {
    const key = this.keyOfUnit(unit);
    if (!key) return;
    const rig = this.rig();
    rig.cache.delete(key);
    const r = rig.read(key);
    if (r.present && !rig.enabled(key)) rig.recordNow(key, { by: 'human', note: 'builder' });
    const s0 = rig.status(key);
    const data = { workspace: key, session: unit.to, name: this.b.branch.units.nameOf(unit.to), unit: unit.id, result: tr.result, text: tr.doneText, definitionStatus: s0.state, why: s0.invalid || null, version: s0.version ?? null };
    this.store().addEvent(unit.to, 'rig_builder_done', { workspace: key, unitId: unit.id, result: tr.result, definitionStatus: s0.state });
    this.broadcast('rig.builder', { ...(this.builderView(key) || {}), ...data });
    this.changedWs();
  }
  // UnitStops.add가 부른다(제작 일이 보고 없이 멈춤). 상위 세션 대신 응답 필요 목록(rig_builder_stop 이벤트)과 창(rig.builder)에. 멈출 때마다
  onStop(tr, unit, why, detail = null) {
    // 멈춤마다 알린다(UnitStops는 상태가 바뀔 때만 부른다). 같은 시도·까닭이 2초 안에 다시 오면 한 번으로 본다
    const mark = `${tr.id}:${why}`; const now = Date.now();
    if (now - (this.stopSeen.get(mark) || 0) < 2000) return false;
    this.stopSeen.set(mark, now);
    const key = this.keyOfUnit(unit);
    const name = this.b.branch.units.nameOf(tr.sessionId);
    this.store().updateTry(tr.id, { notifiedAt: Date.now() });
    this.store().addEvent(tr.sessionId, 'rig_builder_stop', { workspace: key, unitId: unit.id, tryId: tr.id, why, detail, name });
    this.b.log && this.b.log(`rig builder ${name} stopped: ${why}`);
    if (key) this.broadcastBuilder(key, { state: 'stopped', stopReason: why, stopWhy: BUILDER_STOP_WHY[why] || why });
    return true;
  }
}

// 판 API 처리기(backend.mjs handlers에 펼친다). rig.templates·rig.get은 보기라 기기 토큰(휴대폰·원격)도 본다.
// 나머지는 판 API 토큰으로 붙은 연결(이 PC의 창·사람의 atrium call, auth.kind local)만. 에이전트의 세션 토큰은 이 API에 붙지 못한다
export function rigSetupHandlers(b) {
  const local = (c, what) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', `${what}는 이 PC의 보드 창에서만 한다(판 API 토큰).`); };
  const keyOf = async (p) => (await b.resolveWorkspace(p && p.workspace)).key;
  const S = () => { if (!b.rigSetup) throw apiError('rig_off', 'rig가 없다.'); return b.rigSetup; };
  return {
    'rig.templates': () => ({ templates: rigTemplates() }),
    'rig.get': async (p) => S().get(await keyOf(p)),
    'rig.create': async (p, c) => { local(c, 'rig 만들기'); return S().create(await keyOf(p), p || {}); },
    'rig.describe': async (p, c) => { local(c, 'rig 말로 만들기·고치기'); return S().describe(await keyOf(p), p || {}); },
    'rig.save': async (p, c) => { local(c, 'rig 저장'); return S().save(await keyOf(p), p || {}); },
    'rig.spawnSeat': async (p, c) => { local(c, '자리 세션 띄우기'); return S().spawnSeat(await keyOf(p), p && p.seat); },
  };
}
