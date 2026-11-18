// 견본 done 훅(rig 2 문서 견본): 닫힌 일의 값과 첫 줄을 장부 파일(ledger/corrections.jsonl)에 한 줄 적는다
import fs from 'node:fs';
import path from 'node:path';
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const input = JSON.parse(raw || '{}');
  const root = (input.workspace && input.workspace.root) || process.cwd();
  const f = path.join(root, 'ledger', 'corrections.jsonl');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, JSON.stringify({ t: Date.now(), result: input.result || null, text: String(input.doneText || '').split('\n')[0].slice(0, 200) }) + '\n');
  process.stdout.write(JSON.stringify({ action: 'pass', note: 'recorded' }));
});
