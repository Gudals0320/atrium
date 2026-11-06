// P72: Codex가 아는 모델 목록. Codex CLI는 쓸 수 있는 모델 목록(서버에서 받은 카탈로그)을 `$CODEX_HOME/models_cache.json`(기본 ~/.codex)에 둔다.
// 모양: { fetched_at, client_version, models: [{ slug, display_name, visibility: 'list' | 'hide', priority, ... }] }. `codex -m <slug>`의 이름이 slug다.
// Codex의 모델 고르기는 visibility가 list인 것만 priority 순서로 보인다. hide인 것도 -m으로는 쓸 수 있으므로 "아는 이름"에는 넣는다.
// (같은 목록은 `codex debug models`가 JSON으로 보이고, `--bundled`는 실행 파일에 든 목록이다. 판은 프로세스를 띄우지 않고 캐시 파일만 읽는다.)
// 파일은 크다(모델마다 지시문이 든다). 몇 초마다 한 번만 파일의 크기·시각을 보고, 바뀌었을 때만 다시 읽는다. 읽지 못하면 하네스의 고정 목록을 쓴다.
// 이 파일만 읽는다. 같은 폴더의 인증·설정 파일은 열지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CACHE_FILE = 'models_cache.json';
export const CHECK_MS = 5000;
const SLUG_RE = /^[A-Za-z0-9._:/\[\]-]{1,80}$/; // launchers.mjs MODEL_RE와 같은 글자(그 밖의 이름은 호출자에 넣을 수 없다)

export const codexHomeOf = (env = process.env) => (env.CODEX_HOME ? path.resolve(env.CODEX_HOME) : path.join(os.homedir(), '.codex'));

// 캐시 파일 글 → { ok, models: [보일 slug, priority 순서], hidden: [hide인 slug], labels: { slug: display_name } } | { ok: false, why }
export function parseCodexCache(text) {
  let j;
  try { j = JSON.parse(text); } catch { return { ok: false, why: 'bad_json' }; }
  if (!j || !Array.isArray(j.models)) return { ok: false, why: 'no_models' };
  const rows = j.models.filter((m) => m && typeof m.slug === 'string' && SLUG_RE.test(m.slug));
  if (!rows.length) return { ok: false, why: 'empty' };
  const shown = rows.filter((m) => m.visibility !== 'hide');
  const prio = (m) => (Number.isFinite(m.priority) ? m.priority : Infinity);
  const models = [...new Set(shown.map((m, i) => ({ m, i })).sort((a, b) => prio(a.m) - prio(b.m) || a.i - b.i).map((x) => x.m.slug))];
  const hidden = [...new Set(rows.filter((m) => m.visibility === 'hide').map((m) => m.slug))].filter((s) => !models.includes(s));
  // 보이는 이름은 slug와 대소문자만 다르면 두지 않는다(GPT-6.1-Sol ↔ gpt-6.1-sol)
  const labels = Object.fromEntries(shown.filter((m) => typeof m.display_name === 'string' && m.display_name && m.display_name.toLowerCase() !== m.slug.toLowerCase()).map((m) => [m.slug, m.display_name.slice(0, 80)]));
  return models.length ? { ok: true, models, hidden, labels } : { ok: false, why: 'empty' };
}

// 판이 쥐는 목록. models()는 늘 무언가를 돌려준다: 캐시 파일의 목록, 아니면 fallback(하네스의 고정 목록)
export class CodexModels {
  constructor({ home = codexHomeOf(), fallback = [], checkMs = CHECK_MS, now = () => Date.now(), fsImpl = fs } = {}) {
    this.file = path.join(home, CACHE_FILE);
    this.fallback = [...fallback]; this.checkMs = checkMs; this.now = now; this.fs = fsImpl;
    this.checkedAt = -Infinity; this.stamp = null; this.cur = null;
  }
  read() {
    const t = this.now();
    if (t - this.checkedAt < this.checkMs && this.cur) return this.cur;
    this.checkedAt = t;
    let st = null;
    try { st = this.fs.statSync(this.file); } catch {}
    const stamp = st ? `${st.size}:${st.mtimeMs}` : null;
    if (this.cur && stamp === this.stamp) return this.cur;
    this.stamp = stamp;
    let r = { ok: false, why: 'missing' };
    if (st) { try { r = parseCodexCache(this.fs.readFileSync(this.file, 'utf8')); } catch { r = { ok: false, why: 'unreadable' }; } }
    this.cur = r.ok ? { source: 'codex', models: r.models, hidden: r.hidden, labels: r.labels } : { source: 'default', why: r.why, models: [...this.fallback], hidden: [], labels: {} };
    return this.cur;
  }
  models() { return this.read().models; }
}

// 목록에 없는 이름인가(직접 입력 경고). 빈 이름(하네스 기본)과 목록·숨긴 이름은 아니다. 대소문자도 그대로 본다(Codex가 slug를 그대로 맞춘다)
export function unlistedModel(model, { models = [], hidden = [] } = {}) {
  const m = String(model || '').trim();
  return !!m && !models.includes(m) && !hidden.includes(m);
}
