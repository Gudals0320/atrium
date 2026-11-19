// P242: rig 3 2단계 — 항목, 길, 받음·반려(docs research rig3-skeleton.md 3·4·5·8절, rig3-roles.md 12절).
// - 항목: 역할이 자기 섹터에 낸 파일 하나(atrium rig put <종류> <파일> [--from <항목>] [--redo <항목>]. P244: 안내는 이 꼴만, put <파일> --item <종류>도 받기만 한다). 판이 종류·낸 역할·사이클(3단계가 채운다)·
//   어디서 나왔나·해시를 rig3_items(store-rig3.mjs)와 장부(item_put)에 남긴다. id는 <종류>-<n>, --redo는 같은 id의 다음 판(rev).
//   섹터 밖 파일, 길(flows)에 없는 종류(그 역할이 내는 길이 없음)는 거절. 낸 파일은 고치지 않는다: 이미 낸 파일을 새 항목으로 다시 내면 거절(--redo로),
//   낸 뒤 파일이 바뀐 것은 판이 해시로 알아보고(받음·inbox 때) 장부 item_changed로 남긴다.
// - 길: put이 flows대로 받는 역할마다 받음 줄(rig3_receipts, waiting)을 만들고 그 역할 세션에 깨우는 글을 넣는다(queue.enqueue, 잠든 세션은 대기열이 깨운다).
//   아직 넣지 않은 깨우는 글이 그 세션의 대기열에 있으면 새 줄을 그 글에 더한다(한 역할에 몰리면 한 글로 차례로).
//   깨우는 글: 받은 항목(경로, 종류, 낸 역할, 어디서 나왔나)·반려, 그리고 "답하지 않은 받은 것 n, 네가 낸 것 가운데 기다리는 것 n"(12절).
// - 받음·반려: accept <항목> ["<메모>"], return <항목> "<까닭>". 반려는 낸 역할에게 돌아가 깨우고(입력 창구의 항목이면 rig 판에 한 줄), 낸 역할은 put --redo로 고쳐 내거나
//   drop <항목> "<까닭>"으로 버린다. 받음은 그 역할이 그 항목에서 이어진 항목을 내기 전까지 반려로 뒤집을 수 있다. 받는 역할이 아니어도
//   그 항목에서 이어진 항목을 가진(받았거나 낸) 역할은 반려할 수 있다(늦은 반려, late).
// - pass <항목> "<까닭>": 받은 것을 답 항목 없이 닫는다. pass "<까닭>"(항목 없음): 박자에 낼 것이 없다는 답으로 장부에만(item_pass value turn). P244: 받은 것을 한꺼번에 닫지 않는다.
// - 길의 for: { item: result, from: verify, to: ideas, for: hypothesis } = verify가 받은 hypothesis마다 result가 나와야 한다.
//   받았는데(accept) 그 항목에서 이어진 답 항목(for 길의 종류)도 pass도 없으면 "답 없는 받은 항목"으로 센다.
// - 멈춘 역할: 주기(Rig3Roles.keep)마다 쉬는(ready, 대기열 비고 STALL_MS 넘게) 역할 세션에 답하지 않은 받은 것(waiting)이나 답 없는 받은 항목(for)이 있으면
//   한 번 일깨운다(item_nudge). 일깨운 뒤 한 턴이 지나도 그대로면 장부 item_stalled와 rig 판의 한 줄(5단계 빌더 전까지).
// - 입력 창구: from이 human인 길. 사람이 rig 판에서 그 종류의 글을 넣으면 판이 .atrium/intake/<종류>-<n>.md로 쓰고 human이 낸 항목으로 등록해 받는 역할에게 보낸다(판 API rig3.intake).
// - 장부(rig_events, RIG3_EVENT_KINDS): item_put(value new | redo | intake), item_accept, item_return(value receiver | late), item_pass, item_drop, item_nudge, item_stalled, item_changed(value changed | missing).
import fs from 'node:fs';
import path from 'node:path';
import { rigEvent } from './rig-ledger.mjs';
import { hashArtifact } from './rig-diff.mjs';
import { deriveState } from './state.mjs';
import { idleSince } from './sleep.mjs';
import { HUMAN, ITEM_NAME_RE } from './rig3.mjs';

export const RIG3_ITEM_OPS = ['put', 'accept', 'return', 'pass', 'drop', 'inbox'];
export const INTAKE_DIR = '.atrium/intake';
export const INTAKE_MAX = 20000; // 입력 창구 글의 상한(자)
export const STALL_MS = 30000; // 쉬기 시작한 뒤 이만큼 지나면 멈춘 것으로 본다
export const REASON_MAX = 500;
export const ITEM_ID_RE = /^([a-z][a-z0-9_-]{0,39})-(\d{1,9})$/;
const OPEN = ['waiting', 'accepted', 'passed', 'returned'];

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const slash = (p) => String(p).split(path.sep).join('/').replace(/\\/g, '/');
export const itemIdOf = (kind, n) => `${kind}-${n}`;
export function parseItemId(id) { const m = ITEM_ID_RE.exec(String(id || '').trim()); return m ? { kind: m[1], n: Number(m[2]) } : null; }
// 그 역할(또는 human)이 kind를 내는 길 | null
export const flowOf = (r3, kind, from) => r3.flows.find((f) => f.item === kind && f.from.includes(from)) || null;
// 그 역할이 낼 수 있는 종류
export const putKinds = (r3, from) => [...new Set(r3.flows.filter((f) => f.from.includes(from)).map((f) => f.item))];
// role이 kind를 받았을 때 내야 하는 답 종류(for 길) → [종류]
export const answerKinds = (r3, role, kind) => r3.flows.filter((f) => f.for === kind && f.from.includes(role)).map((f) => f.item);
// 워크스페이스 기준 상대 경로 rel이 든 섹터 | null(대소문자 무시, Windows)
export function sectorOf(owns, rel) { const x = String(rel).toLowerCase(); return owns.find((o) => x.startsWith(o.toLowerCase())) || null; }
const clipReason = (s) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > REASON_MAX ? t.slice(0, REASON_MAX - 1) + '…' : t; };

export class Rig3Items {
  // b: 백엔드(store, rig, queue, sessions, api, log). roles: Rig3Roles(active, sessionsOf)
  constructor(b, roles) { this.b = b; this.roles = roles; this.wakes = new Map(); /* '<키>|<역할>' → { deliveryId, lines } */ this.sent = new Map(); /* 세션 ID → Set(판이 넣은 전달 ID) */ }
  track(d) { if (d && d.deliveryId && d.sessionId) { const set = this.sent.get(d.sessionId) || new Set(); set.add(d.deliveryId); this.sent.set(d.sessionId, set); } return d; }
  // P242: rig를 끌 때 아직 넣지 않은 판 알림(깨우는 글·일깨움)을 거둔다(잠든 세션을 다시 깨우지 않게) → 거둔 수
  cancelQueued(key) {
    const q = this.b.queue; let n = 0;
    const r = this.roles.defOf(key);
    for (const role of Object.keys(r ? r.def.rig3.roles : {})) for (const s of this.roles.sessionsOf(key, role)) {
      for (const id of this.sent.get(s.sessionId) || []) { try { if (q && q.cancel) { q.cancel(id); n++; } } catch {} }
      this.sent.delete(s.sessionId);
    }
    for (const k of [...this.wakes.keys()]) if (k.startsWith(key + '|')) this.wakes.delete(k);
    return n;
  }
  store() { return this.b.store; }
  ms(name, dflt) { const v = this.b.cfg && this.b.cfg[name]; return v != null && Number(v) >= 0 ? Number(v) : dflt; }

  // 켜진 v3 rig → { key, r, r3, root } (꺼졌으면 던진다)
  rigOf(key) {
    const r = this.roles.active(key);
    if (!r) throw apiError('rig3_off', '이 워크스페이스에 켜진 rig 3이 없다(rig는 사람이 보드에서 켠다).');
    return { key, r, r3: r.def.rig3, root: r.root || (this.b.rig && this.b.rig.rootOf ? this.b.rig.rootOf(key) : null) };
  }
  // 역할 세션의 맥락 → { key, r3, root, role }
  ctx(s) {
    if (!s || !s.rigRole) throw apiError('forbidden', 'atrium rig put·accept·return·pass·drop·inbox는 rig 3 역할 세션만 쓴다(보드가 rig 역할로 띄운 세션).');
    const x = this.rigOf(s.workspaceKey);
    const role = x.r3.roles[s.rigRole];
    if (!role) throw apiError('forbidden', `이 세션의 역할 ${s.rigRole}이 지금 rig 정의에 없다.`);
    return { ...x, role };
  }
  // /branch/rig의 항목 명령(rig-admin.mjs verb가 넘긴다)
  async verb(s, o = {}) {
    const op = String(o.op || '');
    const x = this.ctx(s);
    const who = { role: x.role.name, session: s.sessionId };
    if (op === 'put') return this.put(x.key, { ...who, file: o.file, kind: o.kind || o.item, from: o.from, redo: o.redo });
    if (op === 'accept') return this.accept(x.key, { ...who, id: o.id, note: o.note });
    if (op === 'return') return this.giveBack(x.key, { ...who, id: o.id, reason: o.reason });
    if (op === 'pass') return this.pass(x.key, { ...who, id: o.id, reason: o.reason });
    if (op === 'drop') return this.drop(x.key, { ...who, id: o.id, reason: o.reason });
    if (op === 'inbox') return this.inbox(x.key, x.role.name);
    throw apiError('bad_request', `atrium rig: ${RIG3_ITEM_OPS.join(' | ')} 가운데 하나다: ${op}`);
  }

  // ---------- 낸다 ----------
  // p: { role(역할 | human), session, file(절대 경로 또는 워크스페이스 기준), kind, from, redo, actor }
  async put(key, p) {
    const { r3, root } = this.rigOf(key);
    const st = this.store();
    const human = p.role === HUMAN;
    const role = human ? null : r3.roles[p.role];
    if (!human && !role) throw apiError('forbidden', `없는 역할: ${p.role}`);
    if (!p.file || typeof p.file !== 'string') throw apiError('bad_request', '낼 파일을 준다: atrium rig put <종류> <파일>');
    const abs = path.resolve(root, p.file);
    const rel = slash(path.relative(root, abs));
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw apiError('out_of_sector', `워크스페이스 밖 파일이다: ${p.file}. 네 섹터: ${role ? role.owns.join(', ') : '-'}`);
    if (human ? !rel.toLowerCase().startsWith(INTAKE_DIR + '/') : !sectorOf(role.owns, rel)) throw apiError('out_of_sector', `섹터 밖 파일이다: ${rel}. 항목은 네 섹터(${human ? INTAKE_DIR + '/' : role.owns.join(', ')}) 안의 파일이다`);
    let stat = null; try { stat = fs.statSync(abs); } catch {}
    if (!stat) throw apiError('not_found', `파일이 없다: ${rel}`);
    if (!stat.isFile()) throw apiError('bad_request', `항목은 파일 하나다(폴더가 아니다): ${rel}`);
    // 다시 내기
    let prev = null;
    if (p.redo) {
      prev = st.getItem(key, String(p.redo).trim());
      if (!prev) throw apiError('not_found', `없는 항목: ${p.redo}`);
      if (prev.role !== p.role) throw apiError('forbidden', `${prev.id}는 ${prev.role === HUMAN ? '입력 창구' : prev.role}가 낸 항목이다. 다시 내기(--redo)는 낸 역할만 한다`);
      if (prev.state === 'dropped') throw apiError('bad_request', `${prev.id}는 버린 항목이다(drop). 새 항목으로 낸다`);
    }
    const kind = p.kind ? String(p.kind).trim() : prev ? prev.kind : '';
    if (!kind) throw apiError('bad_request', `항목 종류를 준다: atrium rig put <종류> <파일>. 네가 낼 수 있는 것: ${putKinds(r3, p.role).join(', ') || '(없음)'}`);
    if (prev && kind !== prev.kind) throw apiError('bad_request', `다시 내기는 같은 종류다: ${prev.id}는 ${prev.kind}`);
    if (!ITEM_NAME_RE.test(kind)) throw apiError('bad_request', `항목 종류 이름이 아니다: ${kind}`);
    const flow = flowOf(r3, kind, p.role);
    if (!flow) throw apiError('no_flow', `길에 없는 종류다: ${kind}(${human ? '입력 창구' : p.role}가 ${kind}를 내는 길이 정의에 없다). ${human ? '입력 창구' : '네'}가 낼 수 있는 것: ${putKinds(r3, p.role).join(', ') || '(없음)'}`);
    // 낸 파일은 고치지 않는다: 이미 낸 파일을 새 항목으로 내지 않는다
    const used = st.items(key, { path: rel, states: ['live'] }).filter((it) => !prev || it.id !== prev.id);
    if (used.length) throw apiError('item_file_used', `이 파일은 이미 낸 항목 ${used[0].id}다. 낸 파일은 고치지 않는다: 고쳤으면 atrium rig put ${used[0].kind} ${rel} --redo ${used[0].id}로 다음 판을 내고, 새 항목이면 새 파일로 낸다`);
    let fromId = null;
    if (p.from) {
      const f = st.getItem(key, String(p.from).trim());
      if (!f) throw apiError('not_found', `--from의 항목이 없다: ${p.from}`);
      if (prev && f.id === prev.id) throw apiError('bad_request', '--from에 다시 내는 항목 자신을 주지 않는다');
      fromId = f.id;
    } else if (prev) fromId = prev.fromId;
    const h = hashArtifact(abs, false);
    if (prev && prev.sha256 && h.sha256 === prev.sha256) throw apiError('item_same', `${prev.id} 판 ${prev.rev}와 내용이 같다(해시 같음). 고친 뒤 다시 낸다`);
    const now = Date.now();
    const id = prev ? prev.id : itemIdOf(kind, st.nextItemN(key, kind));
    const rev = prev ? prev.rev + 1 : 1;
    const n = prev ? prev.n : parseItemId(id).n;
    const cycle = this.roles.beat ? this.roles.beat.current(key) : null; // P244: 지금 사이클 번호
    st.insertItem({ ws: key, id, rev, kind, n, role: p.role, sessionId: p.session || null, path: rel, sha256: h.sha256, size: h.size, fromId, cycle, state: 'live', t: now });
    if (prev) {
      st.setItemState(key, prev.id, prev.rev, 'superseded', `판 ${rev}`, now);
      for (const rc of st.receipts(key, { itemId: prev.id, rev: prev.rev, states: ['waiting'] })) st.setReceipt(rc.id, { state: 'superseded', answeredAt: now });
    }
    for (const to of flow.to) st.insertReceipt({ ws: key, itemId: id, rev, role: to, flow: flow.index, state: 'waiting', t: now });
    const value = prev ? 'redo' : human ? 'intake' : 'new';
    rigEvent(this.b, { kind: 'item_put', ws: key, seat: human ? null : p.role, session: p.session || null, fromSeat: p.role, toSeat: flow.to.join(','), line: flow.index, value, actor: human ? 'human' : 'agent', ref: id, text: `${id}${rev > 1 ? ` 판 ${rev}` : ''} ${rel}${fromId ? ` (${fromId}에서)` : ''} → ${flow.to.join(', ')}`, data: { id, rev, kind, path: rel, sha256: h.sha256, size: h.size, from: fromId, flow: flow.index, to: flow.to } });
    const who = human ? '입력 창구' : p.role;
    for (const to of flow.to) this.notify(key, to, `- ${id}${rev > 1 ? ` 판 ${rev}(다시 냄)` : ''} (${kind}, ${who}가 냄${fromId ? `, ${fromId}에서` : ''}): ${rel}`);
    this.changed(key);
    return { item: { id, rev, kind, path: rel, sha256: h.sha256, size: h.size, from: fromId, role: p.role, to: flow.to, cycle }, waitingOwn: human ? 0 : this.waitingOwn(key, p.role) };
  }

  // ---------- 답한다 ----------
  // 그 역할이 받은 항목(마지막 판)의 받음 줄 → { it, rc } (없으면 던진다)
  received(key, role, id) {
    const st = this.store();
    const it = st.getItem(key, String(id || '').trim());
    if (!it) throw apiError('not_found', `없는 항목: ${id}. 받은 것: atrium rig inbox`);
    if (it.state === 'dropped') throw apiError('bad_request', `${it.id}는 낸 역할이 버렸다(drop)`);
    const rc = st.receipts(key, { itemId: it.id, rev: it.rev, role }).filter((x) => x.state !== 'superseded' && x.state !== 'dropped').at(-1) || null;
    return { it, rc };
  }
  // role이 it에서 이어진 항목을 냈나 → 항목 | null
  answered(key, role, itemId) { return this.store().items(key, { role, fromId: itemId }).find((x) => x.state !== 'dropped') || null; }
  accept(key, p) {
    const { r3 } = this.rigOf(key);
    const st = this.store();
    const { it, rc } = this.received(key, p.role, p.id);
    if (!rc) throw apiError('forbidden', `${it.id}는 너에게 온 항목이 아니다(받는 역할: ${this.toOf(r3, it).join(', ') || '-'}). 받은 것: atrium rig inbox`);
    if (rc.state === 'accepted') return { item: this.pub(it), already: true, changed: this.checkChanged(key, it) };
    if (rc.state === 'returned') throw apiError('bad_request', `${it.id}는 이미 반려했다. 낸 역할이 다시 내면 새 판이 온다`);
    const now = Date.now();
    st.setReceipt(rc.id, { state: 'accepted', note: p.note ? clipReason(p.note) : null, answeredAt: now, nudgedAt: null });
    const changed = this.checkChanged(key, it);
    rigEvent(this.b, { kind: 'item_accept', ws: key, seat: p.role, session: p.session || null, fromSeat: it.role, toSeat: p.role, line: rc.flow, actor: 'agent', ref: it.id, text: `${it.id}${it.rev > 1 ? ` 판 ${it.rev}` : ''}${p.note ? `: ${clipReason(p.note)}` : ''}`, data: { id: it.id, rev: it.rev, note: p.note ? clipReason(p.note) : null } });
    this.changed(key);
    const need = answerKinds(r3, p.role, it.kind);
    return { item: this.pub(it), changed, answer: need.length ? need : null };
  }
  toOf(r3, it) { const f = flowOf(r3, it.kind, it.role); return f ? f.to : []; }
  // 반려(받는 역할, 또는 이어진 항목을 가진 역할의 늦은 반려). JS 예약어를 피해 giveBack
  giveBack(key, p) {
    const st = this.store();
    const reason = clipReason(p.reason);
    if (!reason) throw apiError('bad_request', '반려는 까닭과 함께 한다: atrium rig return <항목> "<까닭>"');
    const { it, rc } = this.received(key, p.role, p.id);
    if (it.role === p.role) throw apiError('bad_request', `${it.id}는 네가 낸 항목이다. 고치려면 put --redo ${it.id}, 버리려면 drop ${it.id}`);
    if (rc && rc.state === 'returned') return { item: this.pub(it), already: true };
    const ans = this.answered(key, p.role, it.id);
    if (rc && ans) throw apiError('answered', `${it.id}에서 이미 ${ans.id}를 냈다. 이어진 항목이 나온 뒤에는 받음을 뒤집지 못한다(그 흠은 ${ans.id}를 다시 내어 고친다)`);
    let late = false;
    if (!rc) {
      const via = this.heldFrom(key, p.role, it.id);
      if (!via) throw apiError('forbidden', `${it.id}는 너에게 온 항목이 아니고, 네가 가진 항목도 ${it.id}에서 이어지지 않았다. 반려는 받은 역할과 이어진 항목을 가진 역할만 한다`);
      late = via;
    }
    const now = Date.now();
    if (rc) st.setReceipt(rc.id, { state: 'returned', note: reason, answeredAt: now, nudgedAt: null });
    else st.insertReceipt({ ws: key, itemId: it.id, rev: it.rev, role: p.role, flow: null, state: 'returned', late: true, note: reason, t: now, answeredAt: now });
    rigEvent(this.b, { kind: 'item_return', ws: key, seat: p.role, session: p.session || null, fromSeat: p.role, toSeat: it.role, line: rc ? rc.flow : null, value: late ? 'late' : 'receiver', actor: 'agent', ref: it.id, text: `${it.id}${it.rev > 1 ? ` 판 ${it.rev}` : ''}: ${reason}`, data: { id: it.id, rev: it.rev, reason, late: late || null, was: rc ? rc.state : null } });
    if (it.role !== HUMAN) this.notify(key, it.role, `- 반려: ${it.id}${it.rev > 1 ? ` 판 ${it.rev}` : ''} (${p.role}${late ? `, ${late}에서 이어진 것을 보고` : ''}): "${reason}" → 고쳐 다시 내기 atrium rig put ${it.kind} <파일> --redo ${it.id} | 버리기 atrium rig drop ${it.id} "<까닭>"`);
    this.changed(key);
    return { item: this.pub(it), late: late || null, to: it.role };
  }
  // role이 가진(받았거나 낸) 항목 가운데 itemId에서 이어진 것 → 그 항목 id | null
  heldFrom(key, role, itemId) {
    const st = this.store();
    const held = new Set([...st.receipts(key, { role }).map((r) => r.itemId), ...st.items(key, { role }).map((x) => x.id)]);
    for (const h of held) {
      let cur = st.getItem(key, h); let guard = 0;
      while (cur && cur.fromId && guard++ < 64) { if (cur.fromId === itemId) return h; cur = st.getItem(key, cur.fromId); }
    }
    return null;
  }
  pass(key, p) {
    const { r3 } = this.rigOf(key);
    const st = this.store();
    const reason = clipReason(p.reason);
    if (!reason) throw apiError('bad_request', 'pass는 까닭과 함께 한다: atrium rig pass <항목> "<까닭>" | (박자에) atrium rig pass "<까닭>"');
    let targets;
    if (p.id) {
      const { it, rc } = this.received(key, p.role, p.id);
      if (!rc) throw apiError('forbidden', `${it.id}는 너에게 온 항목이 아니다. 받은 것: atrium rig inbox`);
      if (rc.state === 'returned') throw apiError('bad_request', `${it.id}는 이미 반려했다`);
      if (rc.state === 'passed') return { passed: [], already: true };
      targets = [{ it, rc }];
    } else targets = []; // P244: 항목 없는 pass는 박자에만 답한다(받은 것을 한꺼번에 닫지 않는다)
    const now = Date.now();
    for (const { it, rc } of targets) {
      st.setReceipt(rc.id, { state: 'passed', note: reason, answeredAt: now, nudgedAt: null });
      rigEvent(this.b, { kind: 'item_pass', ws: key, seat: p.role, session: p.session || null, fromSeat: it.role, toSeat: p.role, line: rc.flow, value: 'item', actor: 'agent', ref: it.id, text: `${it.id}: ${reason}`, data: { id: it.id, rev: it.rev, reason, was: rc.state } });
    }
    if (!targets.length) rigEvent(this.b, { kind: 'item_pass', ws: key, seat: p.role, session: p.session || null, value: 'turn', actor: 'agent', text: reason, data: { reason } });
    this.changed(key);
    return { passed: targets.map((x) => x.it.id), turn: !targets.length, pending: targets.length ? undefined : this.pendingOf(key, p.role, r3).length };
  }
  drop(key, p) {
    const st = this.store();
    const reason = clipReason(p.reason);
    if (!reason) throw apiError('bad_request', 'drop은 까닭과 함께 한다: atrium rig drop <항목> "<까닭>"');
    const it = st.getItem(key, String(p.id || '').trim());
    if (!it) throw apiError('not_found', `없는 항목: ${p.id}`);
    if (it.role !== p.role) throw apiError('forbidden', `${it.id}는 네가 낸 항목이 아니다(낸 역할: ${it.role}). 받은 것을 받지 않으려면 return`);
    if (it.state === 'dropped') return { item: this.pub(it), already: true };
    const now = Date.now();
    st.setItemState(key, it.id, it.rev, 'dropped', reason, now);
    for (const rc of st.receipts(key, { itemId: it.id, rev: it.rev, states: ['waiting'] })) st.setReceipt(rc.id, { state: 'dropped', answeredAt: now });
    rigEvent(this.b, { kind: 'item_drop', ws: key, seat: p.role, session: p.session || null, actor: 'agent', ref: it.id, text: `${it.id}${it.rev > 1 ? ` 판 ${it.rev}` : ''}: ${reason}`, data: { id: it.id, rev: it.rev, reason } });
    this.changed(key);
    return { item: this.pub({ ...it, state: 'dropped' }) };
  }

  // ---------- 받은 것 ----------
  // 답하지 않은 받은 것(waiting)과 답 없는 받은 항목(for) → [{ it, rc, need }]
  pendingOf(key, role, r3 = null) {
    r3 = r3 || this.rigOf(key).r3;
    const st = this.store();
    const out = [];
    for (const rc of st.receipts(key, { role, states: ['waiting', 'accepted'] })) {
      const it = st.getItem(key, rc.itemId);
      if (!it || it.rev !== rc.rev || it.state !== 'live') continue;
      if (rc.state === 'waiting') { out.push({ it, rc, need: 'answer' }); continue; }
      const kinds = answerKinds(r3, role, it.kind);
      if (kinds.length && !st.items(key, { role, fromId: it.id }).some((x) => kinds.includes(x.kind) && x.state !== 'dropped')) out.push({ it, rc, need: kinds });
    }
    return out;
  }
  // 내가 낸 것 가운데 반려된 것(마지막 판이 살아 있고 반려 줄이 있음) → [{ it, by: [{ role, reason, late }] }]
  returnedOf(key, role) {
    const st = this.store();
    const out = [];
    for (const it of st.items(key, { role, states: ['live'] })) {
      const by = st.receipts(key, { itemId: it.id, rev: it.rev, states: ['returned'] }).map((r) => ({ role: r.role, reason: r.note, late: r.late }));
      if (by.length) out.push({ it, by });
    }
    return out;
  }
  // 내가 낸 것 가운데 받는 쪽이 아직 답하지 않은 항목 수
  waitingOwn(key, role) { const st = this.store(); return st.items(key, { role, states: ['live'] }).filter((it) => st.receipts(key, { itemId: it.id, rev: it.rev, states: ['waiting'] }).length).length; }
  inbox(key, role) {
    const { r3 } = this.rigOf(key);
    const pend = this.pendingOf(key, role, r3);
    return {
      role,
      received: pend.filter((x) => x.need === 'answer').map((x) => ({ ...this.pub(x.it), changed: this.checkChanged(key, x.it), at: x.rc.t, nudged: !!x.rc.nudgedAt })),
      unanswered: pend.filter((x) => x.need !== 'answer').map((x) => ({ ...this.pub(x.it), need: x.need, acceptedAt: x.rc.answeredAt })),
      returned: this.returnedOf(key, role).map((x) => ({ ...this.pub(x.it), by: x.by })),
      waitingOwn: this.waitingOwn(key, role),
      puts: putKinds(r3, role),
    };
  }
  pub(it) { return { id: it.id, rev: it.rev, kind: it.kind, role: it.role, path: it.path, from: it.fromId || null, state: it.state, sha256: it.sha256 }; }
  // 낸 파일이 낸 뒤 바뀌었나 → null | 'changed' | 'missing'. 처음 본 때 한 번 장부에 남긴다
  checkChanged(key, it) {
    if (it.changed) return it.changed;
    const root = this.rigOf(key).root;
    let now = null;
    try { const h = hashArtifact(path.resolve(root, it.path), false); if (it.sha256 && h.sha256 !== it.sha256) now = 'changed'; } catch { now = 'missing'; }
    if (!now) return null;
    // 같은 파일을 다시 낸 다음 판(redo)이 있으면 앞 판의 해시가 다른 것은 당연하다(마지막 판만 본다)
    this.store().setItemChanged(key, it.id, it.rev, now);
    it.changed = now;
    rigEvent(this.b, { kind: 'item_changed', ws: key, seat: it.role === HUMAN ? null : it.role, value: now, actor: 'board', ref: it.id, text: `${it.id} ${it.path}: ${now === 'missing' ? '낸 파일이 없어졌다' : '낸 뒤 파일이 바뀌었다(낸 파일은 고치지 않는다. 고치려면 --redo)'}`, data: { id: it.id, rev: it.rev, path: it.path } });
    return now;
  }

  // P243: 판이 워크스페이스에 쓴 파일을 지키기(guard)의 기준에 받아들인다(쓰기 직후)
  guardAccept(key, rels) { const g = this.roles.guard; if (!g || !g.accept) return null; try { return g.accept(key, rels); } catch (e) { this.b.log && this.b.log('rig3 guard accept ' + e.message); return null; } }
  // P243: 지키기가 미루어 둔 알림(잠들었거나 세션이 없을 때 쌓인 것)을 깨우는 글에 붙인다
  guardNotices(key, role) {
    const g = this.roles.guard; const t = this.roles.tune; // P245: 사람이 정의서를 되돌린 알림도 붙인다
    let out = []; try { if (g && g.takeNotices) out = g.takeNotices(key, role) || []; } catch {}
    try { if (t && t.takeNotices) out = [...out, ...t.takeNotices(key, role)]; } catch {}
    try { if (this.roles.takeDocNotices) out = [...out, ...this.roles.takeDocNotices(key, role)]; } catch {} // P247: 정의·정의서가 바뀜(빌더 등)
    return out;
  }
  // ---------- 깨우는 글 ----------
  counts(key, role) { const pend = this.pendingOf(key, role); return { pending: pend.filter((x) => x.need === 'answer').length, unanswered: pend.filter((x) => x.need !== 'answer').length, returned: this.returnedOf(key, role).length, waitingOwn: this.waitingOwn(key, role) }; }
  wakeText(key, role, lines, head = '받은 것', notices = []) {
    const c = this.counts(key, role);
    let cy = null; try { cy = this.roles.beat ? this.roles.beat.cycleLine(key, role) : null; } catch { cy = null; } // P244: 사이클 n, 이번 사이클에 돈 네 도구
    return [
      ...notices, // P243: 지키기의 알림(남의 섹터에 쓴 것을 되돌림 등)
      `[Atrium 보드] rig ${head}:`,
      ...lines,
      ...(cy ? [cy] : []),
      `[Atrium 보드] 답하지 않은 받은 것 ${c.pending}${c.unanswered ? `, 받고 답 항목을 내지 않은 것 ${c.unanswered}` : ''}${c.returned ? `, 반려된 네 항목 ${c.returned}` : ''}. 네가 낸 것 가운데 기다리는 것 ${c.waitingOwn}.`,
      '[Atrium 보드] 답: atrium rig accept <항목> | return <항목> "<까닭>" | pass <항목> "<까닭>"(박자에 낼 것이 없으면 pass "<까닭>"). 낼 것: 네 섹터에 파일을 쓰고 atrium rig put <종류> <파일> [--from <받은 항목>]. 목록: atrium rig inbox',
    ].join('\n');
  }
  // 역할 세션에 한 줄을 알린다. 아직 넣지 않은 깨우는 글이 대기열에 있으면 그 글에 더한다
  notify(key, role, line) { return this.notifyLines(key, role, [line]); }
  // P244: 여러 줄과 머리(박자·도구 경보). 아직 넣지 않은 깨우는 글에 더할 때는 그 글의 머리를 둔다
  notifyLines(key, role, add, head = '받은 것') {
    const s = this.roles.sessionsOf(key, role)[0];
    if (!s || !this.b.queue) return null; // 세션이 없으면 받음 줄만 남는다(다시 뜰 때 실을 글에 받은 것이 실린다)
    const k = `${key}|${role}`;
    const w = this.wakes.get(k);
    const q = this.b.queue;
    const fresh = this.guardNotices(key, role);
    if (w && w.sessionId === s.sessionId && q.retext) {
      const lines = [...w.lines, ...add]; const notices = [...(w.notices || []), ...fresh];
      const h = head !== '받은 것' ? head : w.head || head; // P244: 박자·도구 경보 머리는 새 것이 이긴다
      const d = q.retext(w.deliveryId, this.wakeText(key, role, lines, h, notices));
      if (d) { w.lines = lines; w.notices = notices; w.head = h; return d; }
    }
    const d = this.track(q.enqueue(s.sessionId, this.wakeText(key, role, add, head, fresh), { origin: { kind: 'board' } }));
    this.wakes.set(k, { deliveryId: d && d.deliveryId, sessionId: s.sessionId, lines: [...add], notices: fresh, head });
    return d;
  }

  // ---------- 멈춘 역할(주기) ----------
  // 쉬는 역할 세션에 답하지 않은 받은 것이 있으면 한 번 일깨우고, 그 뒤에도 그대로면 장부에 남긴다 → 한 일 | null
  watch(key, role, s, now = Date.now()) {
    if (!s || !s.rt || s.rt.sleep || s.rt.exit) return null;
    if (deriveState(s.rt).state !== 'ready') return null;
    const q = this.b.queue;
    if (q && q._ofSession && q._ofSession(s.sessionId).some((d) => d.status === 'queued' || d.status === 'sending')) return null;
    const since = idleSince(s);
    if (now - since < this.ms('rig3StallMs', STALL_MS)) return null;
    let pend; try { pend = this.pendingOf(key, role); } catch { return null; }
    if (!pend.length) return null;
    const st = this.store();
    const fresh = pend.filter((x) => !x.rc.nudgedAt);
    if (fresh.length) {
      for (const x of fresh) st.setReceipt(x.rc.id, { nudgedAt: now });
      const lines = fresh.map((x) => `- ${x.it.id}${x.it.rev > 1 ? ` 판 ${x.it.rev}` : ''} (${x.it.kind}, ${x.it.role === HUMAN ? '입력 창구' : x.it.role}): ${x.need === 'answer' ? '받음·반려·pass가 없다' : `받았는데 ${x.need.join('|')} 항목(--from ${x.it.id})도 pass도 없다`}`);
      if (q) this.track(q.enqueue(s.sessionId, this.wakeText(key, role, lines, '받은 것에 답하지 않고 멈췄다', this.guardNotices(key, role)), { origin: { kind: 'board' } }));
      rigEvent(this.b, { kind: 'item_nudge', ws: key, seat: role, session: s.sessionId, n: fresh.length, actor: 'board', ref: fresh.map((x) => x.it.id).join(','), text: `${role}: 답하지 않은 받은 것 ${fresh.length}(${fresh.map((x) => x.it.id).join(', ')}) — 한 번 일깨움`, data: { items: fresh.map((x) => x.it.id) } });
      this.changed(key);
      return { nudged: fresh.map((x) => x.it.id) };
    }
    const stale = pend.filter((x) => x.rc.nudgedAt && !x.rc.stalledAt && x.rc.nudgedAt < since);
    if (!stale.length) return null;
    for (const x of stale) st.setReceipt(x.rc.id, { stalledAt: now });
    let toBuilder = null; try { toBuilder = this.roles.builder ? this.roles.builder.alert(key, { what: 'stalled', role, items: stale.map((x) => x.it.id) }) : null; } catch {} // P247: 빌더가 있으면 전한다
    rigEvent(this.b, { kind: 'item_stalled', ws: key, seat: role, session: s.sessionId, n: stale.length, actor: 'board', ref: stale.map((x) => x.it.id).join(','), text: `${role}: 일깨운 뒤에도 답하지 않았다 — ${stale.map((x) => x.it.id).join(', ')}${toBuilder ? ' (빌더에게 전함)' : ''}`, data: { items: stale.map((x) => x.it.id), toBuilder: !!toBuilder } });
    this.changed(key);
    return { stalled: stale.map((x) => x.it.id) };
  }

  // ---------- 입력 창구(사람) ----------
  // p: { item(종류), text } → put 결과. 판이 .atrium/intake/<종류>-<n>.md로 쓴다
  async intake(key, p = {}) {
    const { r3, root } = this.rigOf(key);
    const kind = String(p.item || p.kind || '').trim();
    const flow = flowOf(r3, kind, HUMAN);
    if (!flow) throw apiError('no_flow', `입력 창구의 종류가 아니다: ${kind || '(없음)'}. 입력 창구: ${putKinds(r3, HUMAN).join(', ') || '(없음)'}`);
    const text = String(p.text == null ? '' : p.text).replace(/\r\n/g, '\n');
    if (!text.trim()) throw apiError('bad_request', '넣을 글이 비었다');
    if (text.length > INTAKE_MAX) throw apiError('bad_request', `글이 너무 길다(${text.length}자, ${INTAKE_MAX}자까지)`);
    const st = this.store();
    const n = st.nextItemN(key, kind);
    const rel = `${INTAKE_DIR}/${itemIdOf(kind, n)}.md`;
    const abs = path.resolve(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text.endsWith('\n') ? text : text + '\n', { flag: 'wx' });
    this.guardAccept(key, [rel]); // P243: 판 자신의 쓰기 — 남의 쓰기 되돌리기(rig3-guard)가 되돌리지 않게 기준에 받아들인다
    return this.put(key, { role: HUMAN, session: null, file: rel, kind });
  }

  // ---------- 보기(rig.status의 rig3에 더한다) ----------
  // → { flows: [{ put, accepted, returned, waiting, passed }], roles: { <역할>: counts + stalled }, intake: { kinds, returned } }
  view(key, r3) {
    const st = this.store();
    if (!st.allItemRevs) return null;
    const revs = st.allItemRevs(key);
    const recs = st.receipts(key, {});
    const flows = r3.flows.map((f) => {
      const mine = revs.filter((x) => x.kind === f.item && f.from.includes(x.role));
      const keys = new Set(mine.map((x) => `${x.id}#${x.rev}`));
      const rs = recs.filter((r) => keys.has(`${r.itemId}#${r.rev}`) && f.to.includes(r.role));
      const c = (s) => rs.filter((r) => r.state === s).length;
      return { put: mine.length, accepted: c('accepted'), returned: c('returned'), waiting: c('waiting'), passed: c('passed') };
    });
    const roles = {};
    for (const name of Object.keys(r3.roles)) {
      let c = { pending: 0, unanswered: 0, returned: 0, waitingOwn: 0 };
      try { c = this.counts(key, name); } catch {}
      const stalled = recs.filter((r) => r.role === name && r.stalledAt && (r.state === 'waiting' || r.state === 'accepted')).map((r) => r.itemId);
      roles[name] = { ...c, stalled: [...new Set(stalled)] };
    }
    const intake = { kinds: putKinds(r3, HUMAN), returned: [] };
    try { intake.returned = this.returnedOf(key, HUMAN).map((x) => ({ id: x.it.id, path: x.it.path, by: x.by })); } catch {}
    return { flows, roles, intake };
  }
  changed(key) { if (this.b.api && this.b.api.broadcast) try { this.b.api.broadcast('rig.roles', { workspace: key }); } catch {} }
}

// 판 API(사람만, 이 PC의 창·사람의 atrium call): rig3.intake { workspace, item, text }
export function rig3Handlers(b) {
  const local = (c, what) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', `${what}는 이 PC의 보드 창이나 사람의 atrium 명령에서만 한다(판 API 토큰).`); };
  return {
    'rig3.intake': async (p, c) => { local(c, '입력 창구에 넣기'); const key = (await b.resolveWorkspace(p && p.workspace)).key; if (!b.rig3 || !b.rig3.items) throw apiError('rig3_off', 'rig 3이 없다'); return b.rig3.items.intake(key, p || {}); },
  };
}
