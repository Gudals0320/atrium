// P359: 판 중계기(auth relay)의 순수 함수. 자식 프로세스(auth-relay-child.mjs)와 단위 시험이 함께 쓴다.
// 중계기는 구독 로그인 claude가 보내는 요청을 API 키 과금으로 바꿔 api.anthropic.com에 그대로 넘긴다:
// Authorization(구독 OAuth)을 빼고, anthropic-beta의 oauth-* 항목을 지우고, x-api-key를 붙인다. 값은 어디에도 남기지 않는다.
import crypto from 'node:crypto';

// 런처 env 값의 자리표시. 판이 띄울 때 그 세션의 중계기 주소로 바꾼다(포트가 바뀌어도 런처를 고치지 않는다)
export const RELAY_PLACEHOLDER = '{{authRelay}}';
export const SECRET_RE = /^[A-Za-z0-9_-]{16,64}$/;
const SESSION_RE = /^[A-Za-z0-9-]{1,64}$/;

// 판 세션 하나의 base URL. claude는 이 주소 뒤에 /api/hello, /v1/messages?beta=true 를 붙여 보낸다(경로 앞머리를 그대로 둔다)
export const relayUrl = ({ port, secret, sessionId }) => `http://127.0.0.1:${port}/${secret}/${sessionId}`;
export const newSecret = () => crypto.randomBytes(18).toString('base64url');

// 요청 경로 → { ok, session, path } | { ok: false, status, why }. 앞머리 비밀이 맞고 지나갈 수 있는 경로(/api/hello, /v1/*)만
export function matchPath(url, secret) {
  const m = /^\/([^/?#]+)\/([^/?#]+)(\/[^#]*)$/.exec(String(url || ''));
  if (!m) return { ok: false, status: 403, why: 'no_secret' };
  const a = Buffer.from(m[1]); const b = Buffer.from(String(secret || ''));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, status: 403, why: 'bad_secret' };
  if (!SESSION_RE.test(m[2])) return { ok: false, status: 403, why: 'bad_session' };
  const rest = m[3];
  const bare = rest.split('?')[0];
  if (bare !== '/api/hello' && !/^\/v1\/[A-Za-z0-9_./-]+$/.test(bare)) return { ok: false, status: 404, why: 'path' };
  if (bare.includes('..')) return { ok: false, status: 404, why: 'path' };
  return { ok: true, session: m[2], path: rest };
}

const HOP = new Set(['host', 'connection', 'keep-alive', 'proxy-connection', 'proxy-authorization', 'te', 'trailer', 'upgrade', 'accept-encoding', 'authorization', 'x-api-key']);
// 들어온 머리글 → 보낼 머리글. 키는 여기서만 붙는다
export function rewriteHeaders(headers, key) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) if (!HOP.has(k.toLowerCase())) out[k.toLowerCase()] = v;
  const beta = String(out['anthropic-beta'] || '').split(',').map((s) => s.trim()).filter((s) => s && !/^oauth-/i.test(s));
  if (beta.length) out['anthropic-beta'] = beta.join(','); else delete out['anthropic-beta'];
  out['x-api-key'] = key;
  return out;
}

// 응답 글(SSE 또는 JSON)에서 모델과 토큰 수만 읽는다. 줄 단위로 넘기고, 같은 칸은 큰 값을 쓴다(message_delta의 output_tokens는 누적)
export class UsageTap {
  constructor() { this.carry = ''; this.u = { model: null, in: 0, out: 0, cacheW: 0, cacheR: 0 }; this.errType = null; this.seen = 0; }
  push(chunk) {
    const s = this.carry + (typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    const lines = s.split('\n');
    this.carry = lines.pop();
    if (this.carry.length > 4 * 1024 * 1024) this.carry = ''; // 아주 큰 한 줄(JSON)은 버린다
    for (const l of lines) this.line(l);
  }
  end() { if (this.carry) this.line(this.carry); this.carry = ''; return this.result(); }
  line(l) {
    if (!this.u.model) { const m = /"model"\s*:\s*"([A-Za-z0-9._:\-[\]]{1,80})"/.exec(l); if (m) this.u.model = m[1]; }
    if (!this.errType) { const e = /"type"\s*:\s*"error"[\s\S]{0,200}?"type"\s*:\s*"([a-z_]{1,60})"/.exec(l); if (e) this.errType = e[1]; }
    if (!l.includes('_tokens')) return;
    const take = (name, field) => { const m = new RegExp(`"${name}"\\s*:\\s*(\\d+)`).exec(l); if (m) this.u[field] = Math.max(this.u[field], Number(m[1])); };
    take('input_tokens', 'in'); take('output_tokens', 'out'); take('cache_creation_input_tokens', 'cacheW'); take('cache_read_input_tokens', 'cacheR');
    this.seen++;
  }
  result() { return { ...this.u, ...(this.errType ? { errType: this.errType } : {}) }; }
}

// P363: User-Agent의 entrypoint 부분만(예: "claude-cli/2.1.332 (external, sdk-cli)" → sdk-cli, 대화형은 cli). 값·토큰은 남기지 않는다.
//   SDK 세션이 대화형이 아니라 SDK로 잡히는지 요청 기록에서 본다. 모르면 null
export function entrypointOf(ua) {
  const m = /\(([^)]{1,120})\)/.exec(String(ua || ''));
  if (!m) return null;
  const last = m[1].split(',').map((x) => x.trim()).filter(Boolean).pop() || '';
  return /^[a-z][a-z0-9-]{0,23}$/.test(last) ? last : null;
}

// 키 모양 확인(값은 돌려주지 않는다). 보이는 ASCII, 20~400자
export const KEY_RE = /^[\x21-\x7e]{20,400}$/;
export const keyOk = (k) => typeof k === 'string' && KEY_RE.test(k.trim());
