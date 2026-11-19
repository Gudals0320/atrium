// 새 rig의 파일 해시와 줄 diff(P249: 옛 rig-sectors.mjs·rig-proposals.mjs에서 옮겼다).
// - hashArtifact: 낸 항목의 해시(판이 낸 파일이 바뀌었는지 본다, rig-items.mjs)
// - unifiedDiff·applyUnifiedDiff: 요령 칸 조정의 변경 기록과 반영(rig-tune.mjs)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DIR_MAX_ENTRIES = 2000;
const DIR_SKIP = new Set(['.git', 'node_modules']);
const DIFF_CELLS_MAX = 4e6;
const slash = (p) => String(p).split(path.sep).join('/').replace(/\\/g, '/');

// 파일은 내용의 SHA-256, 폴더는 안의 (경로, 크기, 내용 SHA-256) 줄의 SHA-256 → { sha256, size }
export function hashArtifact(abs, dir) {
  const fileSha = (f) => { const h = crypto.createHash('sha256'); const fd = fs.openSync(f, 'r'); try { const buf = Buffer.alloc(1 << 16); let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); } return h.digest('hex'); };
  if (!dir) return { sha256: fileSha(abs), size: fs.statSync(abs).size };
  const lines = []; let size = 0;
  const walk = (d) => {
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of ents) {
      if (lines.length >= DIR_MAX_ENTRIES || DIR_SKIP.has(e.name)) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      try { const s = fs.statSync(f); size += s.size; lines.push(`${slash(path.relative(abs, f))}\t${s.size}\t${fileSha(f)}`); } catch {}
    }
  };
  walk(abs);
  return { sha256: crypto.createHash('sha256').update(lines.join('\n')).digest('hex'), size };
}

// ---------- 줄 diff(순수 함수) ----------
export function splitLines(s) {
  const t = String(s ?? '');
  if (!t) return { lines: [], eol: '\n', endNl: false };
  const eol = /\r\n/.test(t) ? '\r\n' : '\n';
  const endNl = /\n$/.test(t);
  return { lines: (endNl ? t.replace(/\r?\n$/, '') : t).split(/\r?\n/), eol, endNl };
}
// a, b: 줄 배열 → [{ t: ' ' | '-' | '+', s }]
export function diffLines(a, b) {
  let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0; while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  const A = a.slice(p, a.length - q), B = b.slice(p, b.length - q);
  const mid = [];
  if (A.length * B.length > DIFF_CELLS_MAX) { for (const s of A) mid.push({ t: '-', s }); for (const s of B) mid.push({ t: '+', s }); }
  else {
    const n = A.length, m = B.length, W = m + 1;
    const L = new Int32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = A[i] === B[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) { if (A[i] === B[j]) { mid.push({ t: ' ', s: A[i] }); i++; j++; } else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) mid.push({ t: '-', s: A[i++] }); else mid.push({ t: '+', s: B[j++] }); }
    while (i < n) mid.push({ t: '-', s: A[i++] }); while (j < m) mid.push({ t: '+', s: B[j++] });
  }
  return [...a.slice(0, p).map((s) => ({ t: ' ', s })), ...mid, ...a.slice(a.length - q).map((s) => ({ t: ' ', s }))];
}
// 통합 diff 글 → { text, added, removed } (같으면 text '')
export function unifiedDiff(aText, bText, { path: p = 'file', context = 3 } = {}) {
  const ops = diffLines(splitLines(aText).lines, splitLines(bText).lines);
  let added = 0, removed = 0;
  for (const o of ops) { if (o.t === '+') added++; else if (o.t === '-') removed++; }
  if (!added && !removed) return { text: '', added, removed };
  const out = [`--- a/${p}`, `+++ b/${p}`];
  // 바뀐 줄 둘레 context줄씩 묶어 덩어리로
  const idx = ops.map((o, i) => (o.t !== ' ' ? i : -1)).filter((i) => i >= 0);
  let k = 0;
  while (k < idx.length) {
    let s = Math.max(0, idx[k] - context), e = Math.min(ops.length - 1, idx[k] + context);
    while (k + 1 < idx.length && idx[k + 1] - context <= e + 1) { k++; e = Math.min(ops.length - 1, idx[k] + context); }
    let oa = 1, ob = 1; for (let i = 0; i < s; i++) { if (ops[i].t !== '+') oa++; if (ops[i].t !== '-') ob++; }
    let la = 0, lb = 0; const body = [];
    for (let i = s; i <= e; i++) { const o = ops[i]; if (o.t !== '+') la++; if (o.t !== '-') lb++; body.push(`${o.t}${o.s}`); }
    out.push(`@@ -${la ? oa : oa - 1},${la} +${lb ? ob : ob - 1},${lb} @@`, ...body);
    k++;
  }
  return { text: out.join('\n') + '\n', added, removed };
}
export const isUnifiedDiff = (t) => /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(String(t || '')) && /^(?:---|\+\+\+) /m.test(String(t || ''));
// 통합 diff를 base 글에 적용 → { ok, text } | { ok: false, reason }. 줄 머리 ' ' '-' '+'와 덩어리 머리만 읽는다(다른 줄은 무시)
export function applyUnifiedDiff(base, diff) {
  const B = splitLines(base);
  const hunks = []; let cur = null;
  for (const raw of String(diff).replace(/\r?\n$/, '').split(/\r?\n/)) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(raw);
    if (m) { cur = { oldStart: Number(m[1]), lines: [] }; hunks.push(cur); continue; }
    if (!cur || raw.startsWith('---') || raw.startsWith('+++') || raw.startsWith('\\')) continue;
    const c = raw[0];
    if (c === ' ' || c === '-' || c === '+') cur.lines.push({ t: c, s: raw.slice(1) });
    else if (raw === '') cur.lines.push({ t: ' ', s: '' });
  }
  if (!hunks.length) return { ok: false, reason: 'diff에 덩어리(@@ 줄)가 없다' };
  const lines = B.lines.slice(); let offset = 0; let floor = 0;
  for (let h = 0; h < hunks.length; h++) {
    const hk = hunks[h];
    const old = hk.lines.filter((x) => x.t !== '+').map((x) => x.s);
    const neu = hk.lines.filter((x) => x.t !== '-').map((x) => x.s);
    const want = Math.max(0, (old.length ? hk.oldStart - 1 : hk.oldStart) + offset);
    const at = (i) => i >= floor && i + old.length <= lines.length && old.every((s, j) => lines[i + j] === s);
    let pos = at(want) ? want : -1;
    for (let d = 1; pos < 0 && d <= lines.length; d++) { if (at(want - d)) pos = want - d; else if (at(want + d)) pos = want + d; }
    if (pos < 0) return { ok: false, reason: `diff의 ${h + 1}번째 덩어리(@@ -${hk.oldStart})가 지금 내용과 맞지 않는다. 새 내용 전체를 --file로 준다` };
    lines.splice(pos, old.length, ...neu);
    offset += neu.length - old.length; floor = pos + neu.length;
  }
  const endNl = B.lines.length ? B.endNl : true;
  return { ok: true, text: lines.length ? lines.join(B.eol) + (endNl ? B.eol : '') : '' };
}
