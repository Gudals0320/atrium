// P192: AGY(Antigravity CLI)가 아는 모델 목록. `agy models`가 서버에서 받은 목록을 한 줄에 하나씩 "<모델 ID>\t<보이는 이름>"으로 찍는다
// (1.5.9: 첫 줄은 "Fetching available models...", 예 "gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)"). `agy --model <ID>`의 이름이 첫 칸이다.
// 목록은 로그인·계정마다 다르고 네트워크를 거쳐 1~3초 걸린다. 판은 처음 물을 때 한 번 띄우고(동시에 하나만) 그 뒤 TTL(30분)이 지나면 다시 받는다.
// 읽기(read)는 기다리지 않고 지금 아는 목록(없으면 고정 목록)을 돌려준다. atrium models(branch.mjs catalog)는 refresh()를 잠깐 기다린다.
// agy가 없거나 실패하면 고정 목록이다. 이 모듈은 AGY 설정·로그인 파일을 열지 않는다
import { execFile } from 'node:child_process';
import { isModelName } from './model-name.mjs';

export const TTL_MS = 30 * 60 * 1000;
export const FAIL_RETRY_MS = 5 * 60 * 1000;
export const RUN_TIMEOUT_MS = 30000;

// `agy models` 출력 → { ok, models: [ID], labels: { ID: 보이는 이름 } } | { ok: false, why }
export function parseAgyModels(text) {
  const models = []; const labels = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\S+)\s*\t\s*(.*)$/.exec(line) || /^(\S+)\s{2,}(.*)$/.exec(line);
    if (!m || !isModelName(m[1]) || models.includes(m[1])) continue;
    models.push(m[1]);
    if (m[2] && m[2].trim().toLowerCase() !== m[1].toLowerCase()) labels[m[1]] = m[2].trim().slice(0, 80);
  }
  return models.length ? { ok: true, models, labels } : { ok: false, why: 'empty' };
}

// agy models를 띄운다(창 없이). → Promise<글>
export function runAgyModels({ command = 'agy', timeout = RUN_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, ['models'], { encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 1024 * 1024 }, (e, out) => (e ? reject(e) : resolve(String(out || ''))));
  });
}

export class AgyModels {
  constructor({ fallback = [], run = runAgyModels, now = () => Date.now(), ttlMs = TTL_MS, failMs = FAIL_RETRY_MS, parse = parseAgyModels, source = 'agy' } = {}) {
    this.fallback = [...fallback]; this.run = run; this.parse = parse; this.source = source; this.now = now; this.ttlMs = ttlMs; this.failMs = failMs; // P201: pi 목록도 같은 틀(parse·source)
    this.cur = null; this.at = -Infinity; this.failedAt = -Infinity; this.pending = null; this.why = null;
  }
  // P201: 다시 받기가 실패한 뒤 failMs 동안은 오래되지 않은 것으로 본다(전에는 목록이 있을 때 실패하면 read()가 refresh()를 끝없이 다시 불렀다)
  stale() { const t = this.now(); if (t - this.failedAt < this.failMs) return false; return this.cur ? t - this.at >= this.ttlMs : true; }
  // 다시 받기(동시에 하나). 실패하면 그때까지 아는 목록을 그대로 둔다
  refresh() {
    if (this.pending) return this.pending;
    if (!this.stale()) return Promise.resolve(this.read());
    this.pending = (async () => {
      try {
        const r = this.parse(await this.run());
        if (r.ok) { this.cur = r; this.at = this.now(); this.why = null; } else { this.failedAt = this.now(); this.why = r.why; }
      } catch (e) { this.failedAt = this.now(); this.why = e && e.code === 'ENOENT' ? 'missing' : 'failed'; }
      finally { this.pending = null; }
      return this.read();
    })();
    return this.pending;
  }
  // 지금 아는 목록. 오래됐으면 뒤에서 다시 받는다(기다리지 않는다)
  read() {
    if (this.stale() && !this.pending) this.refresh().catch(() => {});
    return this.cur ? { source: this.source, models: [...this.cur.models], hidden: [], labels: { ...this.cur.labels } } : { source: 'default', why: this.why || 'pending', models: [...this.fallback], hidden: [], labels: {} };
  }
  models() { return this.read().models; }
}
