// P322: Claude Code 세션의 이번 턴 서브에이전트(Task·Agent) 진행(읽기 전용). 판 세션 카드에 P300 칩과 같은 꼴로 보인다.
// 대화 기록 옆 <세션 ID>/subagents/agent-<id>.jsonl(갈래 하나)과 agent-<id>.meta.json(설명, 끝 표시)을 읽기만 한다(convos.mjs subagentDir와 같은 자리).
// - 이름: meta.json description, 없으면 첫 사용자 글 첫 줄. 중첩된 갈래(meta.parentAgentId)는 이름 앞에 ↳
// - 시작: 첫 줄 timestamp(없으면 파일 만든 때). 이번 턴(UserPromptSubmit 이후, TURN_SLACK_MS 앞까지)에 시작한 갈래만 센다
// - 끝: meta.finished, 판이 받은 SubagentStop hook(agent_id), 또는 마지막 assistant 줄이 end_turn이고 QUIET_MS 넘게 그대로. meta.stoppedByUser는 취소
// - 가볍게: 갈래마다 시작·이름은 한 번만 읽어 두고(캐시), 끝난 갈래는 다시 읽지 않는다. 판이 세션이 일하는 동안만 부른다(inner-progress.mjs)
// 다른 하네스(다음 조각 Codex)는 같은 진행 꼴을 돌려주는 읽개를 registerKindProgress(종류, 읽개)로 꽂는다
import fs from 'node:fs';
import path from 'node:path';
import { subagentDir } from './convos.mjs';

export const SUB_QUIET_MS = 10000;
export const TURN_SLACK_MS = 2000;
const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 64 * 1024;

const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
function readSlice(fsx, file, start, len) {
  let fd = null;
  try { fd = fsx.openSync(file, 'r'); const b = Buffer.alloc(len); const n = fsx.readSync(fd, b, 0, len, start); return b.subarray(0, n).toString('utf8'); } catch { return ''; } finally { if (fd != null) try { fsx.closeSync(fd); } catch {} }
}
const parse = (line) => { try { return JSON.parse(line); } catch { return null; } };
const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x && x.type === 'text' ? x.text : '')).join(' ') : '');
// 첫 줄 → { startedAt, prompt }
export function headOf(text) {
  const nl = text.indexOf('\n');
  const o = parse(nl >= 0 ? text.slice(0, nl) : text);
  if (!o) return { startedAt: null, prompt: null };
  const at = Date.parse(o.timestamp || '');
  return { startedAt: Number.isFinite(at) ? at : null, prompt: o.message && o.message.role === 'user' ? textOf(o.message.content) : null };
}
// 끝 조각 → 마지막 assistant 줄이 턴을 마쳤나(end_turn 등, tool_use가 아님), 마지막 줄 시각
export function tailOf(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  let lastAt = null, ended = false, hookStop = false;
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 20; i--) {
    const o = parse(lines[i]);
    if (!o) continue; // 잘린 첫 줄
    if (lastAt == null) { const t = Date.parse(o.timestamp || ''); if (Number.isFinite(t)) lastAt = t; }
    if (o.attachment && o.attachment.hookEvent === 'SubagentStop') { hookStop = true; continue; }
    if (o.type === 'assistant' && o.message) { const r = o.message.stop_reason; ended = !!r && r !== 'tool_use'; break; }
    if (o.type === 'user') break;
  }
  return { ended, hookStop, lastAt };
}

// 갈래 목록 → 진행 | null. o: { transcript, turnStartedAt, now, stops(Set agent id), cache(Map), fsx }
export function claudeSubagentProgress({ transcript, turnStartedAt = 0, now = Date.now(), stops = null, cache = new Map(), fsx = fs, quietMs = SUB_QUIET_MS } = {}) {
  if (!transcript) return null;
  const dir = subagentDir(transcript);
  let names; try { names = fsx.readdirSync(dir).filter((f) => /^agent-.+\.jsonl$/.test(f)); } catch { return null; }
  const from = (turnStartedAt || 0) - TURN_SLACK_MS;
  const items = [];
  for (const f of names) {
    const id = f.slice(6, -6);
    const file = path.join(dir, f);
    let st; try { st = fsx.statSync(file); } catch { continue; }
    let c = cache.get(file);
    if (!c) {
      const h = headOf(readSlice(fsx, file, 0, Math.min(HEAD_BYTES, st.size)));
      c = { id, startedAt: h.startedAt || Math.round(st.birthtimeMs || st.mtimeMs), prompt: h.prompt, state: 'running', endedAt: null, name: null, depth: 1 };
      cache.set(file, c);
    }
    if (c.startedAt < from) continue; // 지난 턴의 갈래
    if (c.state === 'running') {
      let meta = {}; try { meta = JSON.parse(fsx.readFileSync(path.join(dir, `agent-${id}.meta.json`), 'utf8')) || {}; } catch {}
      c.name = clip((typeof meta.description === 'string' && meta.description) || String(c.prompt || '').split('\n')[0] || id, 120);
      c.depth = Number(meta.spawnDepth) > 1 || meta.parentAgentId ? 2 : 1;
      const mt = Math.round(st.mtimeMs);
      if (meta.stoppedByUser) { c.state = 'cancelled'; c.endedAt = mt; }
      else if (meta.finished === true || (stops && stops.has(id))) { c.state = 'done'; c.endedAt = mt; }
      else if (now - mt > quietMs) {
        const t = tailOf(readSlice(fsx, file, Math.max(0, st.size - TAIL_BYTES), Math.min(TAIL_BYTES, st.size)));
        if (t.ended || t.hookStop) { c.state = 'done'; c.endedAt = t.lastAt || mt; }
      }
    }
    items.push({ name: (c.depth > 1 ? '↳ ' : '') + (c.name || id), state: c.state, startedAt: c.startedAt, endedAt: c.endedAt, id });
  }
  if (cache.size > 400) for (const k of [...cache.keys()].slice(0, 200)) cache.delete(k);
  if (!items.length) return null;
  items.sort((a, b) => a.startedAt - b.startedAt);
  const running = items.filter((x) => x.state === 'running').length;
  return { kind: 'subagents', key: `sub:${turnStartedAt || items[0].startedAt}`, label: null, done: items.length - running, total: items.length, running, failed: 0, finished: running === 0,
    items: items.map(({ id, ...x }) => x), updatedAt: now };
}
