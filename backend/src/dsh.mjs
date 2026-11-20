// P270: dsh(DeepSeek Harness)를 판에서 띄우는 데 필요한 것을 한곳에 둔다. 공식 dsh에는 터미널 대화 화면이 없어 커뮤니티 dsh-TUI(`dsh-tui`)로 띄운다.
// - 세션 덧씌움(--patch): 판 안내문(시스템 프롬프트 조각을 더하는 작은 플러그인), 세션 기록을 DeepSeek에 올리는 session-log-deepseek 끄기.
//   사용자의 dsh 프로필(~/.dsh/profiles)·설정·자격 증명(~/.dsh/.credentials.yaml)·~/.dsh-tui는 고치지 않는다. 키는 dsh가 자기 저장소에서 읽는다.
// - 상태: dsh-TUI가 스스로 OSC 7501(앱 이름 dsh-tui)로 일함·막힘(승인·질문)·끝남·오류를 알린다(hc 앱 이름 dsh-tui → 판 종류 dsh). 판이 따로 싣는 플러그인은 없다
//   (P270: 판 플러그인을 앱 이름 dsh로 시험했더니 dsh-TUI의 보고와 앱 이름이 달라 hc가 에이전트가 바뀐 것으로 보고 놓았다).
// - 기록(~/.dsh/sessions/--<정규화한 cwd>--/<세션 ID>/session.vN.jsonl.zstd): zstd 프레임 여러 개를 이어 붙인 JSONL(압축을 끈 판은 .jsonl).
//   첫 줄이 머리({ type: 'session', id, cwd, createdAt, delegationDepth }). 판은 세션 ID 알기(이어 가기), 마지막 답, 지금 모델을 읽는다. 읽기만 한다
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

// dsh 홈. 시험은 ATRIUM_DSH_HOME으로 고정 자료를 준다. 사용자가 DSH_HOME을 두었으면 dsh와 같이 그것
export const dshHomeOf = (env = process.env) => path.resolve(env.ATRIUM_DSH_HOME || env.DSH_HOME || path.join(os.homedir(), '.dsh'));
export const DSH_APP = 'dsh-tui'; // dsh-TUI가 7501에 쓰는 앱 이름(hc 앱 이름 → 판 종류 dsh)

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
export const zstdAvailable = () => typeof zlib.zstdDecompressSync === 'function';

// zstd 프레임을 이어 붙인 버퍼 → 글. Node의 zstdDecompressSync는 첫 프레임만 풀므로 프레임 머리(28 B5 2F FD)마다 잘라 푼다.
// 머리 바이트가 압축 자료 안에 우연히 있으면 그 조각은 풀리지 않으니 다음 머리까지 붙여 다시 푼다. 찢긴 끝 프레임(쓰는 중)은 버린다
export function decodeFrames(buf) {
  if (!buf || !buf.length) return '';
  if (!buf.subarray(0, 4).equals(MAGIC)) return buf.toString('utf8'); // 압축을 끈 기록(.jsonl)
  if (!zstdAvailable()) return null;
  const pos = [];
  for (let i = buf.indexOf(MAGIC); i >= 0; i = buf.indexOf(MAGIC, i + 4)) pos.push(i);
  pos.push(buf.length);
  let out = '';
  let start = 0;
  for (let k = 1; k < pos.length; k++) {
    try { out += zlib.zstdDecompressSync(buf.subarray(pos[start], pos[k])).toString('utf8'); start = k; } catch { /* 다음 머리까지 붙여 본다 */ }
  }
  // 찢긴 프레임은 오류 없이 앞부분만 풀릴 수 있다. 줄바꿈으로 끝나지 않은 끝 조각은 버린다
  const nl = out.lastIndexOf('\n');
  return nl < 0 ? '' : out.slice(0, nl + 1);
}
const parseLines = (text) => {
  const out = [];
  for (const line of String(text || '').split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch {} }
  return out;
};
// 세션 폴더 → 지금 기록 파일(가장 높은 세대 session.vN.jsonl[.zstd]). 없으면 null
export function logFileIn(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return null; }
  let best = null, bestN = -1;
  for (const n of names) {
    const m = /^session(?:\.v(\d+))?\.jsonl(?:\.zstd)?$/.exec(n);
    if (!m) continue;
    const v = m[1] ? Number(m[1]) : 0;
    if (v > bestN || (v === bestN && n.endsWith('.zstd'))) { best = n; bestN = v; }
  }
  return best ? path.join(dir, best) : null;
}
// 기록 파일 → 사건 배열. headBytes면 앞부분만 읽는다(머리 줄만 볼 때)
export function readDshEvents(file, { headBytes = 0 } = {}) {
  let buf;
  if (headBytes) {
    const fd = fs.openSync(file, 'r');
    try { const b = Buffer.alloc(headBytes); buf = b.subarray(0, fs.readSync(fd, b, 0, headBytes, 0)); } finally { fs.closeSync(fd); }
  } else buf = fs.readFileSync(file);
  const text = decodeFrames(buf);
  return text == null ? null : parseLines(text);
}
export function readDshHeader(file) {
  const ev = readDshEvents(file, { headBytes: 65536 });
  const h = ev && ev.find((e) => e && e.type === 'session');
  return h || null;
}

const normDir = (p) => path.resolve(String(p || '')).toLowerCase().replace(/[\\/]+$/, '');
// dsh 세션 ID: 그 폴더(cwd)에서 since 뒤에 생긴 맨 위 세션(하위 에이전트 세션 delegationDepth > 0은 뺀다). 터미널이 세션 ID를 모르므로 판이 기록 폴더에서 찾는다.
// 세션 폴더는 첫 글이 들어가야 생긴다(지연 생성). exclude: 판의 다른 dsh 세션이 가진 ID
export function dshSessionOf({ cwd, since = 0, home = dshHomeOf(), exclude = [] } = {}) {
  const root = path.join(home, 'sessions');
  const want = normDir(cwd);
  const ex = new Set(exclude.map((x) => String(x).toLowerCase()));
  const found = [];
  let projects = [];
  try { projects = fs.readdirSync(root); } catch { return null; }
  for (const p of projects) {
    const pdir = path.join(root, p);
    let pst; try { pst = fs.statSync(pdir); } catch { continue; }
    if (!pst.isDirectory() || pst.mtimeMs < since - 5000) continue; // 새 세션 폴더가 생기면 프로젝트 폴더의 수정 시각이 바뀐다
    let names = [];
    try { names = fs.readdirSync(pdir); } catch { continue; }
    for (const n of names) {
      const sdir = path.join(pdir, n);
      let st; try { st = fs.statSync(sdir); } catch { continue; }
      if (!st.isDirectory() || (st.birthtimeMs || st.mtimeMs) < since - 5000) continue;
      const file = logFileIn(sdir);
      if (!file) continue;
      let h = null; try { h = readDshHeader(file); } catch { h = null; }
      if (!h || !h.id || (h.delegationDepth || 0) > 0 || normDir(h.cwd) !== want || ex.has(String(h.id).toLowerCase())) continue;
      found.push({ id: String(h.id), at: h.createdAt || st.birthtimeMs || st.mtimeMs });
    }
  }
  found.sort((x, y) => Math.abs(x.at - since) - Math.abs(y.at - since));
  return found.length ? found[0].id : null;
}
// 세션 ID → 기록 파일. 폴더 이름은 ID를 안전하게 바꾼 것이라 보통 ID 그대로다. 아니면 머리 줄로 찾는다
export function findDshSession(home, id) {
  if (!id) return null;
  const root = path.join(home || dshHomeOf(), 'sessions');
  let projects = [];
  try { projects = fs.readdirSync(root); } catch { return null; }
  for (const p of projects) { const f = logFileIn(path.join(root, p, String(id))); if (f) return f; }
  for (const p of projects) {
    let names = []; try { names = fs.readdirSync(path.join(root, p)); } catch { continue; }
    for (const n of names) {
      const f = logFileIn(path.join(root, p, n));
      if (!f) continue;
      try { const h = readDshHeader(f); if (h && String(h.id) === String(id)) return f; } catch {}
    }
  }
  return null;
}

// 답 글. dsh-TUI의 진행 줄(working-activity가 모델에게 시키는 "⏵ 지금 하는 일" 첫 줄)은 판의 마지막 답에서 뗀다
const textOf = (content) => (Array.isArray(content) ? content.filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n').trim().replace(/^⏵[^\n]*\n+(?=\S)/, '') : '');
// 사건 배열 → 판이 쓰는 것: 마지막 답(글이 있는 마지막 assistant/message), 턴이 열려 있는가, 토큰 합, 지금 모델(마지막 request/header)
export function dshSummary(events = []) {
  let answer = null, open = false, model = null, effort = null, lastEnd = null;
  const usage = { input: 0, output: 0, cacheRead: 0 };
  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    const d = e.data || {};
    if (e.type === 'turn/start') open = true;
    else if (e.type === 'turn/end') { open = false; lastEnd = { at: e.time || null, reason: (d.reason && d.reason.kind) || null }; }
    else if (e.type === 'assistant/message') {
      const m = d.message || {};
      const t = textOf(m.content);
      if (t) answer = { text: t, at: e.time || null, turn: d.turn ?? null };
      const u = d.usage || m.usage || null;
      if (u) { usage.input += u.inputTokens || 0; usage.output += u.outputTokens || 0; usage.cacheRead += u.cacheReadTokens || 0; }
    } else if (e.type === 'request/header') {
      const c = (d.header && d.header.config) || {};
      if (c.model) model = c.provider ? `${c.provider}/${c.model}` : String(c.model);
      if (c.reasoningEffort) effort = String(c.reasoningEffort);
    }
  }
  return { answer, open, model, effort, usage, lastEnd };
}
// P279: 턴이 끝난 때(7501 done) 기록 파일에 그 턴의 마지막 글이 아직 다 쓰이지 않았을 수 있다. 같은 턴의 앞 단계 글(도구를 부르기 전 글)만 보고
//   그것을 마지막 답으로 잡았다(실시험: "3 fruits" 뒤 atrium me 결과를 덧붙인 마지막 글이 빠짐). 기록의 턴이 닫힐(turn/end) 때까지 다시 읽고,
//   끝내 닫히지 않으면 그때까지 본 가장 새 답을 쓴다. read() → readDshLastAnswer 꼴({ text, at, open }) | null, since: 지난번에 쓴 답의 at
export async function waitDshAnswer({ read, since = 0, tries = 10, gapMs = 300, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let best = null;
  for (let i = 0; i < tries; i++) {
    let a = null;
    try { a = read(); } catch { a = null; }
    if (a && (!since || (a.at || 0) > since)) {
      if (!a.open) return a;
      if (!best || (a.at || 0) >= (best.at || 0)) best = a;
    }
    if (i < tries - 1) await sleep(gapMs);
  }
  return best;
}
export function readDshLastAnswer(file) {
  const ev = readDshEvents(file);
  if (!ev) return null;
  const s = dshSummary(ev);
  return s.answer ? { ...s.answer, open: s.open } : null;
}

// 판 안내문 플러그인(cordis 플러그인, ESM). 판 데이터 폴더에 써서 --patch의 insert로 싣는다(파일 URL). 안내문은 행 config.text로 받는다.
// 시스템 프롬프트에 이름이 겹치지 않는 전역 조각(atrium:board)을 더한다. dsh-TUI의 에이전트는 프리셋 페르소나(prefix·suffix)가 같은 이름의 전역 조각
// (system-prompt 행의 personaPrefix·personaSuffix)을 가려서, personaSuffix로 넣은 안내문은 headless에는 닿고 dsh-TUI에는 닿지 않았다(P270 시험)
export const DSH_BOARD_PLUGIN = `// Atrium board: adds the board's guide to the system prompt of this dsh session's agents (written by the board for sessions it starts)
export const name = 'atrium-board';
export const inject = ['systemPrompt'];
export function apply(ctx, config) {
  const text = String((config && config.text) || '').trim();
  if (text) ctx.systemPrompt.section({ name: 'atrium:board', order: 10300, text, interpolate: false });
}
`;
// 세션 덧씌움 글(YAML). 글은 JSON 문자열로 적는다(YAML 큰따옴표 글과 같다).
// uploadLog: 세션 기록을 DeepSeek에 올리기를 그대로 둘지(판은 끈다, 사용자 결정 2026-11-20). pluginFile: 안내문 플러그인 파일(없으면 안내문을 싣지 않는다)
export function dshPatchText({ prompt = '', pluginFile = null, uploadLog = false } = {}) {
  const lines = ['# Atrium board overlay for one dsh session (written by the board on each launch; the user profile is untouched)'];
  if (!uploadLog) lines.push('- id: session-log-deepseek', '  config:', '    enabled: false');
  if (pluginFile && String(prompt || '').trim()) lines.push('- insert:', '    - id: atrium-board', `      name: ${JSON.stringify(pathToFileURL(pluginFile).href)}`, '      config:', `        text: ${JSON.stringify(String(prompt))}`);
  return `${lines.join('\n')}\n`;
}

// 지금 모델(판의 modelNow): 마지막 request/header의 provider/model과 노력 수준. 파일 크기가 그대로면 앞 값을 그대로 쓴다
export function refreshDshModel(file, st = null) {
  let stat; try { stat = fs.statSync(file); } catch { return st && st.file === file ? st : null; }
  if (st && st.file === file && st.size === stat.size) return st;
  let s = null; try { const ev = readDshEvents(file); s = ev ? dshSummary(ev) : null; } catch { s = null; }
  if (!s) return st && st.file === file ? st : null;
  return { file, pos: 0, size: stat.size, model: s.model || null, effort: s.effort || null };
}

// 띄울 때 쓸 파일: 안내문 플러그인(공용 하나)과 세션 덧씌움. dir: 판 데이터 폴더의 harness/dsh
export function dshLaunchFiles({ dir, sessionId, prompt, uploadLog = false }) {
  const d = String(dir).split('\\').join('/');
  const plugin = `${d}/atrium-board.mjs`;
  const patch = `${d}/${String(sessionId).replace(/[^A-Za-z0-9_.-]/g, '_')}.patch.yml`;
  return { patch, files: [{ file: plugin, text: DSH_BOARD_PLUGIN }, { file: patch, text: dshPatchText({ prompt, pluginFile: plugin, uploadLog }) }] };
}
