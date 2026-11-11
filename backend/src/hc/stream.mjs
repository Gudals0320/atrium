// P114: hc 프레임 모드 attach 스트림 하나 = 판의 화면 제어기(herdr `terminal session control`과 같은 바깥 모양, relay.mjs가 쓴다).
// - 이벤트: frame { seq, full, width, height, bytes(base64) }, record { type: 'terminal.closed', reason }, stderr(글), exit(까닭), size { cols, rows, external }
// - 메서드: input(글), resize(cols, rows), focus(on), close(). pid는 프로세스가 없어 'hc:<n>'(창은 controllerPid로 스트림을 가린다)
// - 첫 화면: attach 응답 뒤 처음 오는 DATA가 첫 화면(CAN, 소프트 리셋, ESC[H ESC[2J로 시작)이라 full로 낸다. 같은 크기 resize는 다시 붙어 새 첫 화면을 낸다
//   (herdr에서 같은 크기 resize가 full 프레임을 주던 것과 같은 뜻. relay.mjs의 shareNeedsFull이 부른다)
// - 흐름 제어: 받은 바이트를 넘긴 뒤 곧바로 CREDIT로 알린다(시작 256KiB). 4MiB 넘게 밀리면 hc가 새 첫 화면을 보낸다
// - 끊김: 연결이 끊기거나(코어 재시작·강제 종료) 스트림이 lost로 닫히면 물러나며 다시 붙는다. 터미널이 끝났으면(exited, killed …) exit
// - 크기: 이 스트림이 활성이면 터미널 크기 = 우리가 보낸 크기. 판 밖의 활성 보는 이(hc attach)가 크기를 가져가면 size 이벤트(external)로 알린다
import { EventEmitter } from 'node:events';
import { FramedConn, FRAME, u32, sizePayload } from './rpc.mjs';

const FINAL = new Set(['exited', 'killed', 'server_stop', 'host_shutdown', 'holder_lost', 'stopped_by_restart', 'removed', 'not_found']);
const RETRY_MS = [200, 400, 800, 1600, 3000, 5000];
const MAX_RETRY_MS = 60000; // 이만큼 붙지 못하면 끝(창은 detached를 보이고 다시 붙기를 고를 수 있다)
let nextId = 1;

export class HcController extends EventEmitter {
  constructor({ pipe, terminal, cols, rows, log = () => {}, connect = (p) => new FramedConn(p) }) {
    super();
    this.pipe = pipe; this.terminal = terminal; this.log = log; this.connect = connect;
    this.pid = `hc:${nextId++}`;
    this.paneId = terminal;
    this.want = { cols, rows }; // 우리가 바라는 크기
    this.size = { cols, rows }; // 터미널의 지금 크기(프레임 width·height)
    this.exited = null;
    this.seq = 0;
    this.conn = null; this.ch = null;
    this.firstPending = false;
    this.queue = []; // 붙기 전에 온 입력
    this.retryStart = null; this.retryN = 0;
    this.stats = { attaches: 0, bytes: 0, credits: 0 };
    this._attach(false);
  }

  async _attach(resumed) {
    if (this.exited != null) return;
    const gen = (this._gen = (this._gen || 0) + 1);
    const conn = this.connect(this.pipe);
    try {
      await conn.open();
      if (this.exited != null || gen !== this._gen) { conn.close(); return; }
      this.conn = conn;
      conn.on('close', () => { if (this.conn === conn) { this.conn = null; this.ch = null; this._retry('connection closed'); } });
      this.firstPending = true;
      const r = await conn.call('terminal.attach', { terminal: this.terminal, cols: this.want.cols, rows: this.want.rows, resumed: !!resumed }, 15000);
      if (this.exited != null || gen !== this._gen) { conn.close(); return; }
      this.ch = r.channel;
      this.stats.attaches++;
      const t = r.terminal || {};
      if (t.cols && t.rows) this.size = { cols: t.cols, rows: t.rows };
      this.retryStart = null; this.retryN = 0;
      conn.claim(this.ch, (f) => this._frame(conn, f));
      for (const s of this.queue.splice(0)) this._write(s);
      this.emit('attached', { channel: this.ch, cols: this.size.cols, rows: this.size.rows });
    } catch (e) {
      try { conn.close(); } catch {}
      if (this.conn === conn) { this.conn = null; this.ch = null; }
      if (e.code === 'agent_not_found' || e.kind === 'not_found') return this._end('not_found');
      this._retry(`attach failed: ${e.code}: ${e.herdrMessage || e.message}`);
    }
  }
  _retry(why) {
    if (this.exited != null) return;
    const now = Date.now();
    this.retryStart ||= now;
    if (now - this.retryStart > MAX_RETRY_MS) return this._end(`gave up: ${why}`);
    const ms = RETRY_MS[Math.min(this.retryN++, RETRY_MS.length - 1)];
    this.emit('stderr', `hc stream ${this.terminal}: ${why}; reattach in ${ms}ms`);
    clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => this._attach(true), ms);
    if (this._retryTimer.unref) this._retryTimer.unref();
  }
  _frame(conn, f) {
    if (conn !== this.conn) return;
    if (f.kind === FRAME.DATA) {
      const full = this.firstPending; this.firstPending = false;
      this.stats.bytes += f.payload.length;
      this.emit('frame', { seq: ++this.seq, full, width: this.size.cols, height: this.size.rows, bytes: f.payload.toString('base64') });
      conn.write(this.ch, FRAME.CREDIT, u32(f.payload.length)); this.stats.credits += f.payload.length;
    } else if (f.kind === FRAME.CLOSE) {
      let why = null; try { why = f.payload.length ? JSON.parse(f.payload.toString('utf8')) : null; } catch {}
      const reason = (why && why.reason) || 'closed';
      conn.release(this.ch); this.ch = null;
      if (FINAL.has(reason)) { this.emit('record', { type: 'terminal.closed', reason, exitCode: why && why.exit_code }); conn.close(); this.conn = null; return this._end(reason); }
      // lost(터미널을 남기는 keep)·그 밖: 새 셸이 뜨면 다시 붙는다
      this.conn = null; conn.close(); this._retry(`stream closed: ${reason}`);
    } else if (f.kind === FRAME.RESIZE && f.payload.length >= 4) {
      this.size = { cols: f.payload.readUInt16LE(0), rows: f.payload.readUInt16LE(2) };
    }
  }
  _write(s) { if (this.conn && this.ch != null) this.conn.write(this.ch, FRAME.DATA, Buffer.from(s, 'utf8')); else if (this.queue.length < 256) this.queue.push(s); }
  // 판 클라이언트가 친 글(붙여넣기 감싸기·휠 변환은 창이 이미 했다)
  input(text) { if (this.exited == null) this._write(String(text)); }
  // 크기 바꾸기. 같은 크기면 다시 붙어 새 첫 화면(full)을 낸다(새로 붙은 클라이언트가 앞 화면 없이 깨지지 않게)
  resize(cols, rows) {
    if (this.exited != null || !cols || !rows) return;
    const same = cols === this.want.cols && rows === this.want.rows && cols === this.size.cols && rows === this.size.rows;
    this.want = { cols, rows };
    if (same && this.conn && this.ch != null) return this.repaint();
    if (this.conn && this.ch != null) { this.conn.write(this.ch, FRAME.RESIZE, sizePayload(cols, rows)); this.size = { cols, rows }; }
  }
  repaint() { if (this.exited != null) return; const old = this.conn; this.conn = null; this.ch = null; if (old) old.close(); this._attach(true); }
  focus(on) { if (this.conn && this.ch != null) this.conn.write(this.ch, FRAME.FOCUS, Buffer.from([on ? 1 : 0])); }
  // 어댑터가 넘기는 터미널 이벤트(size, restarted, finished)
  onTerminalEvent(e) {
    if (this.exited != null) return;
    if (e.type === 'size') {
      const external = e.cols !== this.want.cols || e.rows !== this.want.rows;
      this.size = { cols: e.cols, rows: e.rows };
      this.emit('size', { cols: e.cols, rows: e.rows, external });
    } else if (e.type === 'pane_restarted') { this.retryStart = null; this.retryN = 0; if (!this.conn) this._attach(true); }
    else if (e.type === 'terminal_finished' || e.type === 'pane_closed') { if (!this.conn) this._end(e.reason || 'finished'); }
  }
  _end(reason) {
    if (this.exited != null) return;
    this.exited = reason;
    clearTimeout(this._retryTimer);
    if (this.conn) { try { if (this.ch != null) this.conn.write(this.ch, FRAME.CLOSE); } catch {} this.conn.close(); }
    this.conn = null; this.ch = null;
    setImmediate(() => this.emit('exit', reason));
  }
  close() { this._end('closed'); }
}
