// 견본 done 훅: done 글에 "evidence:"가 없으면 거절한다(rig 시험 자료)
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const input = JSON.parse(raw || '{}');
  const ok = /evidence:/i.test(String(input.doneText || ''));
  process.stdout.write(JSON.stringify(ok ? { action: 'pass' } : { action: 'reject', reason: 'the done text needs a line starting with "evidence:" (what you checked and where)' }));
});
