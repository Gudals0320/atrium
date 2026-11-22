#!/usr/bin/env node
// P314: 잔액 읽개. 판이 secret-run <grant> -- node atrium-balance.mjs 로 띄운다. 그 grant가 준 키(자기 프로세스 환경)로
// 프로바이더의 잔액 API를 부르고 한 줄에 JSON 하나로 잔액 숫자만 낸다. 키 값은 출력·기록하지 않는다(오류 글도 HTTP 상태 번호만).
// 키가 없는 프로바이더는 건너뛴다. 출력 꼴: {"provider":"deepseek","balance":"12.34","currency":"USD"} | {"provider":"deepseek","error":"http 401"}
// 시험은 ATRIUM_BALANCE_DEEPSEEK_URL·ATRIUM_BALANCE_OPENROUTER_URL로 주소를 바꾼다
const env = process.env;
const TIMEOUT = 15000;
async function getJson(url, key) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' }, signal: ac.signal });
    if (!r.ok) return { error: 'http ' + r.status };
    return { json: await r.json() };
  } catch (e) { return { error: e && e.name === 'AbortError' ? 'timeout' : 'network' }; } finally { clearTimeout(t); }
}
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// DeepSeek: GET /user/balance → { is_available, balance_infos: [{ currency, total_balance, ... }] }. USD가 있으면 USD, 없으면 첫 통화
async function deepseek() {
  const key = env.DEEPSEEK_API_KEY;
  if (!key) return;
  const r = await getJson(env.ATRIUM_BALANCE_DEEPSEEK_URL || 'https://api.deepseek.com/user/balance', key);
  if (r.error) return out({ provider: 'deepseek', error: r.error });
  const list = Array.isArray(r.json && r.json.balance_infos) ? r.json.balance_infos : [];
  const b = list.find((x) => x && x.currency === 'USD') || list[0];
  const n = b ? num(b.total_balance) : null;
  if (n == null) return out({ provider: 'deepseek', error: 'shape' });
  out({ provider: 'deepseek', balance: String(n), currency: typeof b.currency === 'string' ? b.currency : null });
}
// OpenRouter: GET /api/v1/credits → { data: { total_credits, total_usage } }. 잔액 = 산 크레딧 − 쓴 양(USD)
async function openrouter() {
  const key = env.OPENROUTER_API_KEY;
  if (!key) return;
  const r = await getJson(env.ATRIUM_BALANCE_OPENROUTER_URL || 'https://openrouter.ai/api/v1/credits', key);
  if (r.error) return out({ provider: 'openrouter', error: r.error });
  const d = r.json && r.json.data;
  const total = d ? num(d.total_credits) : null, used = d ? num(d.total_usage) : null;
  if (total == null || used == null) return out({ provider: 'openrouter', error: 'shape' });
  out({ provider: 'openrouter', balance: String(Math.round((total - used) * 100) / 100), currency: 'USD' });
}
await Promise.all([deepseek(), openrouter()]);
