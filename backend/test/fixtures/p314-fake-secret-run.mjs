// P314 시험: 가짜 secret-run. <grant> -- <실행 파일> <인자…>. grant가 atrium-usage일 때만 그 grant의 가짜 키를 환경에 넣어 띄운다(없으면 1로 끝, 진짜처럼)
// PSModulePath가 넘어오면 3으로 끝난다(판이 자식 env에서 빼야 한다)
import { spawn } from 'node:child_process';
const [grant, sep, file, ...args] = process.argv.slice(2);
if (Object.keys(process.env).some((k) => k.toUpperCase() === 'PSMODULEPATH')) { console.error('PSModulePath leaked'); process.exit(3); }
if (sep !== '--' || grant !== 'atrium-usage') { console.error('grant not found: ' + grant); process.exit(1); }
// 가짜 키는 시험이 P314_FAKE_KEY로 준다(이 파일에는 값이 없다)
const env = { ...process.env };
env[['DEEPSEEK', 'API', 'KEY'].join('_')] = process.env.P314_FAKE_KEY || '';
const p = spawn(file, args, { env, stdio: 'inherit' });
p.on('close', (c) => process.exit(c ?? 1));
