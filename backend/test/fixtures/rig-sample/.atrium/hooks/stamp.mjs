// 견본 deliver 훅: 글 끝에 한 줄을 덧붙인다(rig 시험 자료)
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const input = JSON.parse(raw || '{}');
  const who = input.from && input.from.kind ? input.from.kind : '?';
  process.stdout.write(JSON.stringify({ action: 'pass', append: `[rig sample] deliver hook saw this (from ${who})`, note: `chars ${String(input.text || '').length}` }));
});
