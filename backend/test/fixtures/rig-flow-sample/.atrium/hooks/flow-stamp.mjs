// 견본 deliver 훅(from flow): 넘김 글 끝에 보낸 자리와 받는 쪽을 한 줄 덧붙인다(rig 흐름 시험 자료)
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const input = JSON.parse(raw || '{}');
  const from = input.from || {};
  const to = input.session && input.session.name ? input.session.name : '?';
  process.stdout.write(JSON.stringify({ action: 'pass', append: `[rig flow sample] handoff from seat ${from.seat || '?'} to ${to}`, note: `chars ${String(input.text || '').length}` }));
});
