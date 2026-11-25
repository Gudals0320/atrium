// P367 시험용 가짜 claude -p(stream-json). 실제 Claude Code 2.1.332 -p의 백그라운드 일 신호를 흉내 낸다(P367 실험의 stream 줄 모양).
// 사용자 글마다:
//   - "BG <ms> <signal>": 서브에이전트를 백그라운드로 띄우고 턴을 끝낸다. ms 뒤 끝남 알림과 함께 스스로 새 턴(init → assistant → result)을 돈다.
//       signal = stream(background_tasks_changed·task_started·task_notification을 낸다) | launch(도구 결과 글 "Async agent launched"만, 안전한 기본) | none(아무 신호 없음)
//   - 그 밖: 도구 하나(Read)를 쓰고 답한다. result에 model_usage_since_last_result(턴 토큰)
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const at = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const sid = at('--session-id') || at('--resume');
const dir = process.env.P363_FAKE_DIR;
if (dir) fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ argv, pid: process.pid }) + '\n');
const say = (o) => process.stdout.write(JSON.stringify({ session_id: sid, ...o }) + '\n');
const usage = { 'claude-haiku-5-5': { inputTokens: 10, outputTokens: 200, cacheReadInputTokens: 30000, cacheCreationInputTokens: 2000, cacheCreationEphemeral1hInputTokens: 2000 } };
const init = () => say({ type: 'system', subtype: 'init', cwd: process.cwd(), model: 'claude-haiku-5-5', apiKeySource: 'none' });
const result = (text) => say({ type: 'result', subtype: 'success', is_error: false, result: text, num_turns: 1, usage: { input_tokens: 10, output_tokens: 200 }, model_usage_since_last_result: usage, permission_denials: [] });
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const text = String(JSON.parse(line).message.content);
    init();
    const m = /^BG (\d+) (\w+)/.exec(text);
    if (m) {
      const ms = Number(m[1]), sig = m[2];
      say({ type: 'assistant', message: { model: 'claude-haiku-5-5', content: [{ type: 'tool_use', id: 'tu_bg1', name: 'Agent', input: { description: 'wait-agent', prompt: 'wait', run_in_background: true } }] } });
      if (sig === 'stream') {
        say({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'ag1', task_type: 'local_agent', description: 'wait-agent' }] });
        say({ type: 'system', subtype: 'task_started', task_id: 'ag1', tool_use_id: 'tu_bg1', description: 'wait-agent', is_backgrounded: true, task_type: 'local_agent' });
      }
      say({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_bg1', content: [{ type: 'text', text: sig === 'none' ? 'ok' : 'Async agent launched successfully.\nagentId: ag1' }] }] } });
      say({ type: 'assistant', message: { model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'STARTED' }] } });
      result('STARTED');
      setTimeout(() => {
        if (sig !== 'none') say({ type: 'system', subtype: 'task_notification', task_id: 'ag1', tool_use_id: 'tu_bg1', status: 'completed' });
        if (sig === 'stream') say({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
        init();
        say({ type: 'assistant', message: { model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'RESULTS AGENT-DONE' }] } });
        result('RESULTS AGENT-DONE');
      }, ms);
      continue;
    }
    say({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 5 });
    say({ type: 'assistant', message: { model: 'claude-haiku-5-5', content: [{ type: 'tool_use', id: 'tu_r1', name: 'Read', input: { file_path: 'C:/x/README.md' } }] } });
    say({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_r1', content: '1\thello' }] } });
    setTimeout(() => { say({ type: 'assistant', message: { model: 'claude-haiku-5-5', content: [{ type: 'text', text: `answer to ${text}` }] } }); result(`answer to ${text}`); }, 30);
  }
});
process.stdin.on('end', () => setTimeout(() => process.exit(0), 20));
