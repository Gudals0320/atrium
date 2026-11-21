// P304: atrium plan의 인자 풀기와 사람이 읽는 출력(설계 experiments/p301/p301-design.md 3절). 순수 함수라 단위 시험이 쉽다.
// CLI(bin/atrium-child.mjs)는 parsePlanArgs로 /branch/plan 요청 몸을 만들고, 응답을 planLines로 글로 바꾼다.
export const PLAN_HELP = [
  'atrium plan: 이 리포(워크스페이스)의 목표·마일스톤 레인. 한 리포에 레인이 여럿 있을 수 있고, 레인마다 이름·목표·측정값·마일스톤(M1…)·focus·상태와 관리자 세션이 있다. 사람도 판에서 체크한다.',
  '  atrium plan list [--all]                     레인들: 번호·이름·관리자·상태·지금 마일스톤·진행(--all은 보관한 것도)',
  '  atrium plan new "<이름>"                      레인 만들기(만든 세션이 관리자)',
  '  아래는 모두 --plan <이름|번호>로 레인을 고른다. 빼면 네가 관리하는 레인이 하나일 때 그것.',
  '  atrium plan [show] [--all] [--json]          목표·측정값·focus 마일스톤(--all은 모든 마일스톤과 항목)',
  '  atrium plan goal "<문장>" | --rm',
  '  atrium plan metric "<이름>" [--target <값>] [--now <값>] [--unit <단위>] | --rm',
  '  atrium plan ms <코드> ["<이름>"] [--purpose "<글>"] [--done-when "<글>"] [--before <코드>|--after <코드>] [--code <새 코드>]',
  '                                               없으면 만들고 있으면 고친다(첫 마일스톤이 focus가 된다)',
  '  atrium plan ms <코드> --done | --reopen | --rm',
  '  atrium plan focus <코드>',
  '  atrium plan item <코드> "<글>" [--who user|head] [--note "<글>"]     항목 더하기(기본 who=head) → M2.6',
  '  atrium plan item <ID> [--text "<글>"] [--who …] [--note …] [--move <코드>[:<자리>]] | --rm',
  '  atrium plan check <ID>… | --undo <ID>…',
  '  atrium plan owner <레인> <세션 이름|me|none>   관리자 넘기기',
  '  atrium plan status <레인> active|paused|done|archived',
  '  atrium plan import <파일|-> [--replace] [--if-rev <n>] [--dry] [--new "<새 레인 이름>"]   export --json과 같은 꼴의 JSON',
  '  atrium plan export [--json | --md]',
  '  atrium plan log [--lines n]                   바뀜 기록(누가, 어디서, 무엇, 관리자 아님)',
  '- 관리자는 자기 레인을 지금 상태로 유지하고 그에 맞춰 워커에게 일을 시킨다. 고치라는 지시가 없으면 남의 레인은 읽기만 한다(보드는 막지 않고 관리자 아님으로 남긴다). 하위 워커는 끝낸 항목을 done 보고에 적는다(예: "M2.5 끝").',
  '- 항목 ID는 "<마일스톤 코드>.<번호>"(M2.4, 레인마다 따로). 지운 번호는 다시 쓰지 않는다. 코드를 바꾸면(--code) 그 항목 ID도 바뀐다.',
  '- who: user(사람 몫. focus 마일스톤의 것은 사람의 할 일 목록에 뜬다) | head(관리자와 워커의 몫). 일회성으로 사람에게 넘기는 것은 atrium todo. 같은 일을 둘로 만들지 않는다.',
  '- 마일스톤은 항목이 다 체크돼도 저절로 닫히지 않는다. 끝 기준을 확인하고 ms <코드> --done.',
  '- 관리자가 보면 지난번 본 뒤 남(사람·다른 세션)이 바꾼 것을 한 줄로 보인다. 자세히는 atrium plan log.',
  '- 옮겨 오기: 다른 곳의 계획은 위 꼴의 JSON 파일로 쓰고 import --dry로 미리 본 뒤 사람이 맞다고 하면 --dry 없이. 새 레인으로는 --new "<이름>", 있는 레인을 덮어쓰려면 --replace(먼저 export로 받아 둔다).',
].join('\n');

export const PLAN_WORDS = ['show', 'list', 'new', 'goal', 'metric', 'ms', 'focus', 'item', 'check', 'owner', 'status', 'import', 'export', 'log'];
const VALUE = new Set(['target', 'now', 'unit', 'purpose', 'done-when', 'before', 'after', 'code', 'who', 'note', 'text', 'move', 'if-rev', 'lines', 'file', 'plan', 'new']);
const BOOLS = new Set(['rm', 'done', 'reopen', 'undo', 'all', 'json', 'replace', 'dry', 'md', 'help', 'long']);
const usage = (m) => Object.assign(new Error(m), { usage: true });

// args: "plan" 뒤 낱말들 → { action, ops?, all, json, file?, replace, ifRev, dry, format, lines, help }
export function parsePlanArgs(args) {
  const f = {}; const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (a.startsWith('--') && a.length > 2) {
      const k = a.slice(2);
      if (BOOLS.has(k)) f[k] = true;
      else if (VALUE.has(k)) { if (i + 1 >= args.length) throw usage('--' + k + '에 값을 준다.'); f[k] = String(args[++i]); }
      else throw usage('atrium plan이 모르는 인자다: ' + a + '. 사용법: atrium help plan');
    } else pos.push(a);
  }
  const base = { json: !!f.json, help: !!(f.help || f.long), ...(f.plan !== undefined ? { plan: f.plan } : {}) };
  const word = pos[0] || 'show';
  if (base.help) return { ...base, action: 'help' };
  if (!PLAN_WORDS.includes(word)) throw usage('atrium plan의 하위 낱말은 ' + PLAN_WORDS.join(', ') + '이다: ' + word + '. 사용법: atrium help plan');
  const has = (k) => f[k] !== undefined;
  const opt = (k) => (has(k) ? f[k] : undefined);
  const op = (o) => ({ ...base, action: 'op', ops: [Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))] });
  switch (word) {
    case 'show': return { ...base, action: 'show', all: !!f.all };
    case 'list': return { ...base, action: 'list', all: !!f.all };
    case 'new':
      if (!pos[1]) throw usage('레인 이름을 준다: atrium plan new "<이름>"');
      return { ...base, action: 'new', name: pos.slice(1).join(' ') };
    case 'owner':
      if (!pos[1] || !pos[2]) throw usage('atrium plan owner <레인> <세션 이름|me|none>');
      return { ...base, action: 'owner', plan: pos[1], owner: pos[2] };
    case 'status':
      if (!pos[1] || !pos[2]) throw usage('atrium plan status <레인> active|paused|done|archived');
      if (!['active', 'paused', 'done', 'archived'].includes(pos[2])) throw usage('레인 상태는 active, paused, done, archived 가운데 하나다: ' + pos[2]);
      return { ...base, action: 'status', plan: pos[1], status: pos[2] };
    case 'goal':
      if (f.rm) return op({ op: 'goal', text: null });
      if (!pos[1]) throw usage('목표 문장을 준다: atrium plan goal "<문장>"');
      return op({ op: 'goal', text: pos.slice(1).join(' ') });
    case 'metric': {
      if (!pos[1]) throw usage('측정값 이름을 준다: atrium plan metric "<이름>" [--target <값>] [--now <값>] [--unit <단위>] | --rm');
      if (f.rm) return op({ op: 'metricRm', metric: pos[1] });
      return op({ op: 'metric', name: pos[1], target: opt('target'), now: opt('now'), unit: opt('unit') });
    }
    case 'ms': {
      const code = pos[1];
      if (!code) throw usage('마일스톤 코드를 준다: atrium plan ms <코드> ["<이름>"] …');
      const acts = ['done', 'reopen', 'rm'].filter((k) => f[k]);
      if (acts.length > 1) throw usage('--done, --reopen, --rm은 하나만 준다.');
      if (acts[0] === 'done') return op({ op: 'msDone', code });
      if (acts[0] === 'reopen') return op({ op: 'msReopen', code });
      if (acts[0] === 'rm') return op({ op: 'msRm', code });
      return op({ op: 'ms', code, title: pos[2] !== undefined ? pos.slice(2).join(' ') : undefined, purpose: opt('purpose'), doneWhen: opt('done-when'), before: opt('before'), after: opt('after'), newCode: opt('code') });
    }
    case 'focus':
      if (!pos[1]) throw usage('마일스톤 코드를 준다: atrium plan focus <코드>');
      return op({ op: 'focus', code: pos[1] });
    case 'item': {
      if (!pos[1]) throw usage('atrium plan item <코드> "<글>" [--who user|head] [--note "<글>"] | item <ID> [--text …] [--who …] [--note …] [--move <코드>[:<자리>]] | --rm');
      if (f.rm) return op({ op: 'itemRm', id: pos[1] });
      if (pos[2] !== undefined) return op({ op: 'itemAdd', ms: pos[1], text: pos.slice(2).join(' '), who: opt('who'), note: opt('note') });
      return op({ op: 'itemEdit', id: pos[1], text: opt('text'), who: opt('who'), note: opt('note'), move: opt('move') });
    }
    case 'check': {
      const ids = pos.slice(1).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean);
      if (!ids.length) throw usage('항목 ID를 준다: atrium plan check M2.4 [M2.5 …] | --undo M2.4');
      return op({ op: f.undo ? 'uncheck' : 'check', ids });
    }
    case 'import':
      if (!pos[1] && !has('file')) throw usage('가져올 JSON 파일을 준다(- 는 표준 입력): atrium plan import <파일|-> [--replace] [--if-rev <n>] [--dry]');
      return { ...base, action: 'import', file: pos[1] || f.file, replace: !!f.replace, ifRev: has('if-rev') ? Number(f['if-rev']) : undefined, dry: !!f.dry, ...(has('new') ? { new: f.new } : {}) };
    case 'export': return { ...base, action: 'export', format: f.md ? 'md' : 'json' };
    case 'log': return { ...base, action: 'log', lines: has('lines') ? Math.max(1, Math.min(500, Number(f.lines) || 20)) : 20 };
  }
  throw usage('사용법: atrium help plan');
}

// ---------- 출력 ----------
const VIA = { pc: 'PC', remote: '휴대폰', foryou: '할 일 목록', agent: '에이전트', import: '가져오기' };
export function ago(at, now = Date.now()) {
  if (!at) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  return s < 60 ? s + '초 전' : s < 3600 ? Math.round(s / 60) + '분 전' : s < 86400 ? Math.round(s / 3600) + '시간 전' : Math.round(s / 86400) + '일 전';
}
const pad = (s, n) => { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); };
const cnt = (c) => c.done + '/' + c.total;
function itemLine(it) { return '  [' + (it.done ? 'x' : ' ') + '] ' + pad(it.id, 6) + ' ' + pad(it.who, 5) + ' ' + it.text + (it.note ? '   메모: ' + it.note.replace(/\n/g, ' ') : ''); }
function msBlock(m, c, { focus = false } = {}) {
  const L = [];
  L.push((focus ? '지금  ' : '') + m.code + ' ' + m.title + '  ' + cnt(c) + (c.userLeft ? ' (사용자 ' + c.userLeft + ' 남음)' : '') + (m.state === 'done' ? '  ✓ 끝' : c.allChecked ? '  · 모두 체크됨, 끝내기? atrium plan ms ' + m.code + ' --done' : ''));
  if (m.purpose) L.push('  목적: ' + m.purpose.replace(/\n/g, ' '));
  if (m.doneWhen) L.push('  끝 기준: ' + m.doneWhen.replace(/\n/g, ' '));
  for (const it of m.items) L.push(itemLine(it));
  if (!m.items.length) L.push('  (항목 없음: atrium plan item ' + m.code + ' "<글>" --who user|head)');
  return L;
}
const metricText = (m) => m.name + ' ' + (m.now ?? '-') + ' → ' + (m.target ?? '-') + (m.unit || '');
const STATUS = { active: '진행', paused: '멈춤', done: '끝', archived: '보관' };
const ownerText = (o) => (o && o.name ? '@' + o.name + (o.open === false ? '(닫힘)' : '') : '관리자 없음');
export const laneHead = (x) => '#' + x.no + ' ' + x.name + ' · ' + ownerText(x.owner) + ' · ' + (STATUS[x.status] || x.status);
// 레인 목록 한 줄
export function laneLine(l) {
  const f = l.summary && l.summary.focus;
  return '  ' + laneHead(l) + (l.mine ? ' (너)' : '') + ' · ' + (f ? '지금 ' + f.code + ' ' + f.title + ' ' + f.done + '/' + f.total + (f.userLeft ? ' (사용자 ' + f.userLeft + ')' : '') : l.summary && l.summary.milestones.length ? 'focus 없음' : '마일스톤 없음') + (l.summary && l.summary.goal ? ' · 목표 ' + l.summary.goal : '');
}
export function listLines(x) {
  if (!x.lanes.length) return ['이 리포(' + (x.workspace || '-') + ')에는 아직 레인이 없다. 만들기: atrium plan new "<이름>"(만든 세션이 관리자)'];
  return ['레인 ' + x.lanes.length + '개(' + (x.workspace || '-') + '):', ...x.lanes.map(laneLine), '보기: atrium plan --plan <이름|번호>'];
}
export function otherLine(changes, now) {
  if (!changes || !changes.length) return null;
  const parts = changes.slice(-6).map((l) => l.summary + '(' + (l.by === 'user' ? (VIA[l.via] || l.via || '?') : '@' + l.by + (l.manager === false ? ', 관리자 아님' : '')) + ', ' + ago(l.at, now) + ')');
  return '남이 바꾼 것(지난 확인 뒤): ' + parts.join(', ') + (changes.length > 6 ? ' 외 ' + (changes.length - 6) + '개(atrium plan log)' : '');
}
// atrium plan [show] 응답 → 줄들
export function showLines(x) {
  if (x.pick) return [x.why, ...(x.lanes || []).map(laneLine)];
  const d = x.doc;
  const now = x.at || Date.now();
  const L = ['레인  ' + laneHead(x) + (x.manager ? ' (너)' : '')];
  if (!d.goal && !d.metrics.length && !d.milestones.length) { L.push('아직 비었다: atrium plan goal "<문장>" · atrium plan ms M1 "<이름>" --done-when "<끝 기준>" · atrium plan item M1 "<글>" --who user|head (atrium help plan)'); return L; }
  L.push('목표  ' + (d.goal || '(없음: atrium plan goal "<문장>")'));
  if (d.metrics.length) L.push('측정  ' + d.metrics.map(metricText).join(' · '));
  const sum = x.summary;
  const byCode = new Map(sum.milestones.map((m) => [m.code, m]));
  if (x.all) {
    for (const m of d.milestones) { L.push(''); L.push(...msBlock(m, byCode.get(m.code), { focus: m.code === d.focus }).map((l, i) => (i === 0 && m.code !== d.focus ? '      ' + l : l))); }
    L.push('');
    L.push('rev ' + x.rev + (x.updatedAt ? ' · ' + ago(x.updatedAt, now) + (x.updatedBy ? ' ' + (x.updatedBy === 'user' ? '사람' : '@' + x.updatedBy) : '') : ''));
  } else {
    const f = d.focus ? d.milestones.find((m) => m.code === d.focus) : null;
    if (f) { const b = msBlock(f, byCode.get(f.code), { focus: true }); b[0] += '  rev ' + x.rev; L.push(...b); }
    else L.push('지금  (focus 마일스톤 없음: atrium plan focus <코드>)  rev ' + x.rev);
    const others = d.milestones.filter((m) => m.code !== d.focus);
    if (others.length) L.push('다른 마일스톤  ' + others.map((m) => { const c = byCode.get(m.code); return m.code + (m.state === 'done' ? ' ✓' : ' ' + cnt(c)); }).join(' · ') + '   (atrium plan --all)');
  }
  const h = otherLine(x.otherChanges, now);
  if (h) L.push(h);
  if (!x.manager) L.push('(너는 이 레인의 관리자가 아니다. 고치라는 지시가 없으면 읽기만 한다)');
  return L;
}
const notManager = (x) => (x.manager === false ? ['(관리자 아님: 이 레인의 관리자는 ' + (x.lane && x.lane.owner ? '@' + x.lane.owner : '없음') + '. 바뀜 기록에 관리자 아님으로 남았다)'] : []);
// 쓰기 응답 → 줄들. req: 보낸 요청
export function writeLines(x, req) {
  if (req.action === 'new') return ['레인 #' + x.plan.no + ' ' + x.plan.name + ' 만듦 · 관리자 ' + ownerText(x.plan.owner) + '. 다음: atrium plan goal "<문장>" --plan ' + x.plan.name + ' · atrium plan ms M1 "<이름>" --plan ' + x.plan.name];
  if (req.action === 'owner') return ['#' + x.plan.no + ' ' + x.plan.name + ' ' + x.log[0] + ' · rev ' + x.rev, ...notManager(x)];
  if (req.action === 'status') return ['#' + x.plan.no + ' ' + x.plan.name + ' ' + x.log[0] + ' · rev ' + x.rev, ...notManager(x)];
  const op = (req.ops && req.ops[0]) || {};
  const ch = (x.changed && x.changed[0]) || {};
  const rev = ' · rev ' + x.rev;
  const L = [];
  const msC = (c) => c.code + ' ' + c.done + '/' + c.total;
  if (op.op === 'check' || op.op === 'uncheck') {
    const on = op.op === 'check';
    const did = ch.items.filter((i) => i.changed).map((i) => i.id), same = ch.items.filter((i) => !i.changed).map((i) => i.id);
    L.push((did.length ? did.join(', ') + (on ? ' 체크함' : ' 체크 풂') : '바뀐 것 없음') + ' · ' + ch.milestones.map(msC).join(' · ') + rev);
    if (same.length) L.push(same.join(', ') + (on ? '은 이미 체크돼 있었다' : '은 체크돼 있지 않았다'));
    for (const m of ch.milestones) if (on && m.allChecked) L.push(m.code + ' 항목이 모두 체크됐다. 끝 기준을 확인하고 닫으려면: atrium plan ms ' + m.code + ' --done');
    return [...L, ...notManager(x)];
  }
  if (op.op === 'itemAdd') return [ch.id + ' 더함(' + ch.who + ') · ' + ch.ms + ' ' + ch.done + '/' + ch.total + rev, ...notManager(x)];
  if (op.op === 'msDone' || op.op === 'msReopen') return [ch.code + (op.op === 'msDone' ? ' 끝냄' : ' 다시 엶') + ' · ' + ch.done + '/' + ch.total + rev, ...notManager(x)];
  L.push((x.log && x.log.length ? x.log.join(' · ') : '바뀐 것 없음') + rev);
  if (ch.renamed && Object.keys(ch.renamed).length) L.push('바뀐 항목 ID: ' + Object.entries(ch.renamed).map(([a, b]) => a + ' → ' + b).join(', '));
  if (op.op === 'ms' && ch.created && x.plan && x.plan.doc.focus === ch.code) L.push(ch.code + '가 지금(focus) 마일스톤이다. 항목: atrium plan item ' + ch.code + ' "<글>" --who user|head');
  return [...L, ...notManager(x)];
}
export function importLines(x) {
  const c = x.counts;
  const what = '목표 ' + c.goal + ' · 측정값 ' + c.metrics + ' · 마일스톤 ' + c.milestones + '(항목 ' + c.items + ', 사용자 ' + c.user + ', 체크됨 ' + c.checked + ')' + (c.focus ? ' · focus ' + c.focus : '');
  if (x.dry) return ['가져오기 미리보기(바꾸지 않음): ' + what,
    x.newLane ? '새 레인 "' + x.newLane + '"으로 만든다. 쓰려면 --dry 없이 다시 친다'
      : x.current ? '레인에 이미 계획이 있다(rev ' + x.current.rev + ', 마일스톤 ' + x.current.milestones + ', 항목 ' + x.current.items + '). 덮어쓰려면 --replace로 다시 친다(먼저 atrium plan export로 받아 둔다)' : '레인이 비어 있다. 쓰려면 --dry 없이 다시 친다'];
  return ['가져왔다' + (x.created ? '(새 레인 #' + x.plan.no + ' ' + x.plan.name + ')' : x.replaced ? '(덮어씀)' : '') + ': ' + what + ' · rev ' + x.rev, ...notManager(x)];
}
export function logLines(x, now = Date.now()) {
  if (!x.rows.length) return ['바뀜 기록이 없다.'];
  return [...x.rows].reverse().map((l) => pad(ago(l.at, now), 7) + ' ' + (l.by === 'user' ? '사람' : '@' + l.by) + '(' + (VIA[l.via] || l.via || '?') + (l.manager === false ? ', 관리자 아님' : '') + ') ' + l.summary + '  rev ' + l.rev);
}
// atrium me: 내가 관리하는 레인 줄들
export function meLines(list) {
  if (!list || !list.length) return [];
  return list.map((p) => 'plan: #' + p.no + ' ' + p.name + (p.status !== 'active' ? '(' + (STATUS[p.status] || p.status) + ')' : '') + ' · ' + (p.focus ? p.focus + ' ' + (p.title || '') + ' ' + p.done + '/' + p.total + (p.userLeft ? ' (사용자 ' + p.userLeft + ')' : '') : 'focus 없음') + ' · 너는 관리자 → atrium plan --plan ' + p.name);
}
