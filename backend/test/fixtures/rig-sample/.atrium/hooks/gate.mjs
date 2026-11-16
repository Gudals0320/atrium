// 견본 tool-before 훅: --to N이 없으면 거절하고, --every가 없으면 --every 1000을 붙인다(rig 시험 자료)
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const input = JSON.parse(raw || '{}');
  const args = Array.isArray(input.args) ? input.args : [];
  const i = args.indexOf('--to');
  const n = i >= 0 ? Number(args[i + 1]) : NaN;
  if (!(n >= 1 && n <= 600)) return process.stdout.write(JSON.stringify({ action: 'reject', reason: 'count needs --to N (1 to 600), for example: atrium tool count --to 3' }));
  if (!args.includes('--every')) return process.stdout.write(JSON.stringify({ action: 'rewrite', args: [...args, '--every', '1000'], note: 'added --every 1000' }));
  process.stdout.write(JSON.stringify({ action: 'pass' }));
});
