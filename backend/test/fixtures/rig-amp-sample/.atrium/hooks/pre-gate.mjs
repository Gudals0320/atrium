// 견본 pre-tool 훅(P189): Bash 명령에 "forbidden"이 있으면 거절한다. 그 밖은 통과
let raw = '';
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const x = JSON.parse(raw || '{}');
  const cmd = x.toolInput && typeof x.toolInput.command === 'string' ? x.toolInput.command : '';
  if (x.toolName === 'Bash' && cmd.includes('forbidden')) process.stdout.write(JSON.stringify({ action: 'reject', reason: 'sample gate: commands with the word forbidden are not allowed' }));
  else process.stdout.write('{}');
});
