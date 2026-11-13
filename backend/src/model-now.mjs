// P137: 하네스가 지금 쓰는 모델(과 노력 수준). 판이 띄운 값(s.model·s.effort)은 처음 값이라 /model·모델 바꾸기를 따라가지 않는다.
// 하네스마다 자기 기록 파일에 지금 값을 남긴다. 읽기만 한다.
// - Claude Code: 대화 기록(.jsonl)의 assistant 줄 message.model(<synthetic> 빼고, 하위 에이전트 isSidechain 빼고),
//   /model·/effort의 출력 줄(<local-command-stdout>Set model to `X` …, Set effort level to Y …). 둘 중 나중 줄이 이긴다
// - Codex: rollout의 turn_context(payload.model, payload.effort)와 /model로 바꾼 그때의 event_msg thread_settings_applied(model, reasoning_effort)
// - pi: 세션 파일의 model_change(modelId), thinking_level_change(thinkingLevel, off는 없음으로)
// - opencode: 기록이 SQLite라 읽지 않는다(띄운 값을 보인다)
// 파일은 처음에 끝에서부터 조각으로 거슬러 읽고(값을 찾을 때까지, 64MB까지), 그 뒤에는 늘어난 만큼만 읽는다.
import fs from 'node:fs';
import path from 'node:path';

const CHUNK = 4 * 1024 * 1024;
const BACK_MAX = 64 * 1024 * 1024;
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function textOf(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x) => (isObj(x) && typeof x.text === 'string' ? x.text : typeof x === 'string' ? x : isObj(x) && x.content ? textOf(x.content) : '')).join('\n');
  return '';
}
const clean = (v) => (typeof v === 'string' ? v.replace(ANSI, '').trim() : '');

// 줄 하나 → { model?, effort? } 또는 null. kind: claude | codex | pi
export function lineModel(kind, line) {
  if (!line) return null;
  if (kind === 'claude') {
    // 빠른 거르기: 모델·노력 수준이 들어갈 수 없는 줄은 파싱하지 않는다
    const asst = line.includes('"assistant"') && line.includes('"model"');
    const cmd = line.includes('Set model to') || line.includes('Set effort level to');
    if (!asst && !cmd) return null;
    let o; try { o = JSON.parse(line); } catch { return null; }
    if (!isObj(o) || o.isSidechain) return null;
    if (o.type === 'assistant' && isObj(o.message)) {
      const m = clean(o.message.model);
      return m && m !== '<synthetic>' ? { model: m } : null;
    }
    if (!cmd) return null;
    const t = clean(textOf(isObj(o.message) ? o.message.content : o.content));
    const out = {};
    // 이름은 백틱 안(`Opus 5.5`, `GPT 6.1 Terra (native)`). 백틱이 없으면 " and saved"·"·"·줄 끝 앞까지
    const mm = /<local-command-stdout>\s*Set model to\s+(?:`([^`\n]+)`|([^\n<·]+?)(?=\s+and saved\b|\s*·|\s*<|\s*$))/m.exec(t);
    if (mm) out.model = (mm[1] || mm[2]).trim();
    const em = /<local-command-stdout>\s*Set effort level to\s+([A-Za-z]+)/.exec(t);
    if (em) out.effort = em[1].toLowerCase();
    return out.model || out.effort ? out : null;
  }
  if (kind === 'codex') {
    // turn_context(턴마다) 또는 thread_settings_applied(/model로 바꾼 바로 그때, event_msg의 payload.thread_settings)
    const tc = line.includes('"turn_context"'), ts = line.includes('"thread_settings_applied"');
    if (!tc && !ts) return null;
    let o; try { o = JSON.parse(line); } catch { return null; }
    if (!isObj(o) || !isObj(o.payload)) return null;
    let p = null;
    if (o.type === 'turn_context') p = o.payload;
    else if (o.type === 'event_msg' && o.payload.type === 'thread_settings_applied' && isObj(o.payload.thread_settings)) { p = { ...o.payload.thread_settings }; p.effort = p.reasoning_effort; }
    if (!p) return null;
    const s = isObj(p.collaboration_mode) && isObj(p.collaboration_mode.settings) ? p.collaboration_mode.settings : {};
    const model = clean(p.model) || clean(s.model);
    const effort = clean(p.effort) || clean(s.reasoning_effort);
    return model || effort ? { ...(model ? { model } : {}), effort: effort || null } : null;
  }
  if (kind === 'pi') {
    if (!line.includes('model_change') && !line.includes('thinking_level_change')) return null;
    let o; try { o = JSON.parse(line); } catch { return null; }
    if (!isObj(o)) return null;
    if (o.type === 'model_change' && clean(o.modelId)) return { model: clean(o.modelId) };
    if (o.type === 'thinking_level_change' && typeof o.thinkingLevel === 'string') return { effort: o.thinkingLevel === 'off' ? null : o.thinkingLevel };
    return null;
  }
  return null;
}

// 여러 줄을 차례로 겹친다. Codex의 turn_context는 노력 수준을 늘 함께 쓰므로(없으면 null) 그 줄의 값으로 바꾼다
export function foldLines(kind, lines, acc = {}) {
  let out = { ...acc };
  for (const l of lines) {
    const r = lineModel(kind, l);
    if (!r) continue;
    if (r.model) out.model = r.model;
    if ('effort' in r) out.effort = r.effort;
  }
  return out;
}

function readRange(file, start, end) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(end - start);
    const n = fs.readSync(fd, buf, 0, buf.length, start);
    return buf.subarray(0, n);
  } finally { fs.closeSync(fd); }
}

// 끝에서부터 거슬러 읽어 마지막 모델 값을 찾는다. 노력 수준이 아직 없으면 더 앞에서 찾는다
// → { model, effort, pos(다 읽은 마지막 줄 끝) }
export function scanBack(kind, file, size) {
  const got = {};
  let end = size, pos = null, read = 0, carry = Buffer.alloc(0);
  while (end > 0 && read < BACK_MAX) {
    const start = Math.max(0, end - CHUNK);
    let buf = Buffer.concat([readRange(file, start, end), carry]);
    read += end - start;
    if (pos === null) { // 맨 끝 조각: 줄바꿈으로 끝나지 않은 마지막 조각(쓰는 중)은 다음 읽기로 미룬다
      const nl = buf.lastIndexOf(10);
      pos = nl < 0 ? start : start + nl + 1;
      buf = buf.subarray(0, nl < 0 ? 0 : nl);
    }
    if (start > 0) { // 첫 줄은 잘렸을 수 있다: 다음(앞) 조각에 붙여 읽는다
      const first = buf.indexOf(10);
      if (first < 0) { carry = buf; end = start; continue; }
      carry = Buffer.from(buf.subarray(0, first)); buf = buf.subarray(first + 1);
    } else carry = Buffer.alloc(0);
    const r = foldLines(kind, buf.toString('utf8').split('\n'));
    // 앞 조각은 뒤 조각보다 옛 값이다: 뒤에서 이미 찾은 값은 두고 빈 것만 채운다
    if (!got.model && r.model) got.model = r.model;
    if (!('effort' in got) && 'effort' in r) got.effort = r.effort;
    if (got.model && ('effort' in got || kind === 'claude')) break; // Claude Code 노력 수준은 /effort를 쓸 때만 남는다
    end = start;
  }
  return { ...got, pos: pos ?? 0 };
}

// 세션 하나의 읽기 상태. st: { file, pos, size, model, effort } (없으면 새로)
export function refreshModel(kind, file, st = null) {
  let stat; try { stat = fs.statSync(file); } catch { return st && st.file === file ? st : null; }
  if (!st || st.file !== file || stat.size < st.pos) {
    const r = scanBack(kind, file, stat.size);
    return { file, pos: r.pos, size: stat.size, model: r.model || null, effort: r.effort ?? null };
  }
  if (stat.size === st.size) return st;
  const buf = readRange(file, st.pos, stat.size);
  const nl = buf.lastIndexOf(10);
  if (nl < 0) return { ...st, size: stat.size };
  const r = foldLines(kind, buf.subarray(0, nl).toString('utf8').split('\n'), { model: st.model, effort: st.effort });
  return { file, pos: st.pos + nl + 1, size: stat.size, model: r.model || null, effort: r.effort ?? null };
}

// Codex rollout 파일: $CODEX_HOME/sessions/YYYY/MM/DD/rollout-…-<id>.jsonl. 새 날짜 폴더부터 본다(이어 가면 옛 파일에 덧붙는다)
export function findCodexRollout(home, id) {
  if (!home || !id) return null;
  const want = String(id).toLowerCase();
  const root = path.join(home, 'sessions');
  const ls = (d) => { try { return fs.readdirSync(d).sort().reverse(); } catch { return []; } };
  for (const y of ls(root)) for (const m of ls(path.join(root, y))) for (const d of ls(path.join(root, y, m))) {
    const dir = path.join(root, y, m, d);
    const hit = ls(dir).find((n) => n.toLowerCase().endsWith(`${want}.jsonl`) && n.startsWith('rollout-'));
    if (hit) return path.join(dir, hit);
  }
  return null;
}

// pi 세션 파일: ~/.pi/agent/sessions/<폴더>/<시각>_<id>.jsonl
export function findPiSession(dir, id) {
  if (!dir || !id) return null;
  const want = `_${String(id).toLowerCase()}.jsonl`;
  let subs = []; try { subs = fs.readdirSync(dir); } catch { return null; }
  for (const s of subs) {
    let names = []; try { names = fs.readdirSync(path.join(dir, s)); } catch { continue; }
    const hit = names.find((n) => n.toLowerCase().endsWith(want));
    if (hit) return path.join(dir, s, hit);
  }
  return null;
}

// 띄운 값과 지금 값 → 보일 값. 모르는 것은 띄운 값
export function shownModel(launched = {}, now = null) {
  return { model: (now && now.model) || launched.model || null, effort: (now && now.effort) || launched.effort || null };
}

// 같은 모델을 다르게 쓴 이름인가(판 이벤트를 남길지): haiku ≈ claude-haiku-5-5 ≈ Haiku 5.5, Sonnet 5.5 ≈ claude-sonnet-5-5.
// 짧은 이름(별명)이 긴 이름의 앞 낱말이면 같다고 본다
const normModel = (m) => String(m || '').trim().toLowerCase().replace(/^claude-/, '').replace(/\[.*\]$/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/-(\d+)$/, ' $1');
export function sameModel(a, b) {
  const x = normModel(a), y = normModel(b);
  if (!x || !y) return !x && !y;
  return x === y || y.startsWith(`${x} `) || x.startsWith(`${y} `);
}
