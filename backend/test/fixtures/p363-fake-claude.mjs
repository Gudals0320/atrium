// P363 시험용 가짜 claude -p(stream-json). 사용자 메시지마다 init(처음 한 번)·assistant·result를 낸다.
// 대화 수는 P363_FAKE_DIR/<세션 ID>.json에 두어 --resume이면 이어 센다. 받은 인자와 env 일부(키 유무, base URL)를 P363_FAKE_DIR/log.jsonl에 남긴다
import fs from 'node:fs';
import path from 'node:path';
const dir = process.env.P363_FAKE_DIR;
const argv = process.argv.slice(2);
const at = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const sid = at('--session-id') || at('--resume');
const resume = argv.includes('--resume');
const stateFile = path.join(dir, `${sid}.json`);
let st = { n: 0, first: null };
if (resume) try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ argv, resume, hasKey: 'ANTHROPIC_API_KEY' in process.env, base: process.env.ANTHROPIC_BASE_URL || null, cwd: process.cwd(), pid: process.pid }) + '\n');
const say = (o) => process.stdout.write(JSON.stringify(o) + '\n');
let inited = false, buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    const text = String(m.message.content);
    if (!inited) { inited = true; say({ type: 'system', subtype: 'init', session_id: sid, cwd: process.cwd(), model: at('--model') || 'x', apiKeySource: 'none' }); }
    st.n++; if (!st.first) st.first = text;
    fs.writeFileSync(stateFile, JSON.stringify(st));
    if (/BILLING/.test(text)) { say({ type: 'assistant', message: { content: [{ type: 'text', text: 'Credit balance is too low' }] }, error: 'billing_error' }); say({ type: 'result', subtype: 'success', is_error: true, result: 'Credit balance is too low', num_turns: 1, session_id: sid }); continue; }
    const out = `n=${st.n} first=${st.first} resume=${resume}`;
    const delay = /SLOW/.test(text) ? 400 : 10;
    setTimeout(() => { say({ type: 'assistant', message: { content: [{ type: 'text', text: out }] } }); say({ type: 'result', subtype: 'success', is_error: false, result: out, num_turns: 1, session_id: sid }); }, delay);
  }
});
process.stdin.on('end', () => setTimeout(() => process.exit(0), 20));
