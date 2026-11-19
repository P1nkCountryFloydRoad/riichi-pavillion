#!/usr/bin/env python3
"""雀庭 ↔ Mortal 桥接程序（只用标准库）。

为每个由 AI 控制的座位启动一个 mjai 机器人进程（默认是 Mortal 的 `mortal.py <seat>`），
通过 HTTP 接收浏览器发来的 mjai 事件，写入机器人的 stdin，再把它的反应返回给浏览器。

用法：
    # 使用 Mortal（需要自行准备 Mortal 仓库、编译好的 libriichi 与模型文件 mortal.pth）
    python3 tools/mortal_bridge.py --mortal-dir /path/to/Mortal/mortal

    # 直接指定权重文件（不需要 config.toml，完整检查点和精简推理权重都支持）
    python3 tools/mortal_bridge.py --mortal-dir ~/Mortal/mortal --model ~/Mortal/weights/s42/weights/s42-inference.pth

    # 使用任意 mjai 机器人：命令中的 {seat} 会被替换为座位号
    python3 tools/mortal_bridge.py --cmd "python3 tools/mjai_dummy_bot.py {seat}"

然后在游戏的「规则设置 → 对手 AI」里选择 Mortal，地址填 http://127.0.0.1:8174 。
"""
import argparse
import collections
import json
import os
import queue
import shlex
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FIRST_TIMEOUT = 120.0  # 进程刚启动时要加载模型，给足时间
TIMEOUT = 20.0


class Bot:
    """一个 mjai 机器人子进程：逐行写入事件，逐行读取反应。"""

    def __init__(self, argv, cwd, seat):
        self.seat = seat
        try:
            self.proc = subprocess.Popen(
                argv,
                cwd=cwd or None,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except OSError as e:
            raise RuntimeError('无法启动机器人 %s：%s' % (' '.join(argv), e))
        self.lines = queue.Queue()
        self.stderr_tail = collections.deque(maxlen=12)
        self.fresh = True
        threading.Thread(target=self._read, daemon=True).start()
        threading.Thread(target=self._read_err, daemon=True).start()

    def _read_err(self):
        # 机器人的日志照常显示在桥接程序的终端里，同时保留最后几行用于报错
        for line in self.proc.stderr:
            sys.stderr.write('[seat %d] %s' % (self.seat, line))
            if line.strip():
                self.stderr_tail.append(line.rstrip())

    def died(self):
        """进程退出时的说明：退出码 + stderr 的最后一行有效信息"""
        try:
            code = self.proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            code = None
        tail = list(self.stderr_tail)
        last = tail[-1] if tail else '没有输出'
        return RuntimeError('机器人进程已退出（退出码 %s）：%s' % (code, last))

    def _read(self):
        for line in self.proc.stdout:
            line = line.strip()
            if line.startswith('{'):
                self.lines.put(line)
        self.lines.put(None)  # 进程退出

    def alive(self):
        return self.proc.poll() is None

    def react(self, events, need):
        # 丢弃之前残留的输出，保证读到的是这一次的回应
        while True:
            try:
                if self.lines.get_nowait() is None:
                    raise self.died()
            except queue.Empty:
                break
        try:
            for ev in events:
                self.proc.stdin.write(json.dumps(ev, ensure_ascii=False, separators=(',', ':')) + '\n')
            self.proc.stdin.flush()
        except (BrokenPipeError, OSError):
            raise self.died()
        if not need:
            return None
        try:
            line = self.lines.get(timeout=FIRST_TIMEOUT if self.fresh else TIMEOUT)
        except queue.Empty:
            raise RuntimeError('机器人在 %d 秒内没有回应（规则可能不一致）' % (FIRST_TIMEOUT if self.fresh else TIMEOUT))
        self.fresh = False
        if line is None:
            raise self.died()
        return json.loads(line)

    def close(self):
        if self.alive():
            try:
                self.proc.stdin.close()
                self.proc.wait(timeout=3)
            except Exception:
                self.proc.kill()


class Pool:
    def __init__(self, make_argv, cwd, engine):
        self.make_argv = make_argv
        self.cwd = cwd
        self.engine = engine
        self.bots = {}
        self.sessions = {}
        self.locks = {s: threading.Lock() for s in range(4)}

    def react(self, session, seat, reset, events, need):
        with self.locks[seat]:
            bot = self.bots.get(seat)
            if reset or bot is None or not bot.alive() or self.sessions.get(seat) != session:
                if bot is not None:
                    bot.close()
                if not events or events[0].get('type') != 'start_game':
                    raise RuntimeError('新的对局必须以 start_game 开始')
                bot = Bot(self.make_argv(seat), self.cwd, seat)
                self.bots[seat] = bot
                self.sessions[seat] = session
            return bot.react(events, need)

    def close(self):
        for bot in self.bots.values():
            bot.close()


def make_handler(pool, verbose):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, code, obj):
            body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self._send(204, {})

        def do_GET(self):
            if self.path.rstrip('/') == '/health':
                self._send(200, {'ok': True, 'engine': pool.engine})
            else:
                self._send(404, {'error': 'not found'})

        def do_POST(self):
            if self.path.rstrip('/') != '/react':
                return self._send(404, {'error': 'not found'})
            try:
                n = int(self.headers.get('Content-Length') or 0)
                req = json.loads(self.rfile.read(n).decode('utf-8'))
                seat = int(req['seat'])
                if seat not in range(4):
                    raise ValueError('seat 必须是 0..3')
                if verbose:
                    for ev in req.get('events', []):
                        print('  -> [%d] %s' % (seat, json.dumps(ev, ensure_ascii=False)), file=sys.stderr)
                reaction = pool.react(str(req.get('session')), seat, bool(req.get('reset')),
                                      req.get('events') or [], bool(req.get('need')))
                if verbose and reaction is not None:
                    print('  <- [%d] %s' % (seat, json.dumps(reaction, ensure_ascii=False)), file=sys.stderr)
                self._send(200, {'reaction': reaction})
            except Exception as e:  # 把错误交给浏览器，由它退回内置 AI
                print('[bridge] seat error: %s' % e, file=sys.stderr)
                self._send(200, {'error': str(e)})

        def log_message(self, fmt, *args):
            if verbose:
                sys.stderr.write('[http] ' + (fmt % args) + '\n')

    return Handler


def main():
    ap = argparse.ArgumentParser(description='雀庭 ↔ mjai 机器人（Mortal）桥接程序')
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--mortal-dir', help='Mortal 仓库里的 mortal/ 目录（含 mortal.py 与 config.toml）')
    g.add_argument('--cmd', help='任意 mjai 机器人命令，{seat} 会替换为座位号')
    ap.add_argument('--model', help='配合 --mortal-dir：直接指定权重 .pth（不读 config.toml）')
    ap.add_argument('--name', help='配合 --model：在游戏里显示的模型名称')
    ap.add_argument('--python', help='运行 mortal.py 的 Python（默认：Mortal 仓库下的 .venv，否则当前解释器）')
    ap.add_argument('--cwd', help='配合 --cmd：机器人进程的工作目录')
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=8174)
    ap.add_argument('-v', '--verbose', action='store_true', help='打印收发的每个事件')
    a = ap.parse_args()

    if a.model and not a.mortal_dir:
        ap.error('--model 需要和 --mortal-dir 一起使用')
    if a.mortal_dir:
        mdir = os.path.abspath(os.path.expanduser(a.mortal_dir))
        if not os.path.isfile(os.path.join(mdir, 'mortal.py')):
            ap.error('在 %s 下找不到 mortal.py' % mdir)
        py = a.python
        if not py:  # 优先使用 Mortal 仓库里的虚拟环境
            venv = os.path.join(os.path.dirname(mdir), '.venv', 'bin', 'python')
            py = venv if os.path.isfile(venv) else sys.executable
        if a.model:
            model = os.path.abspath(os.path.expanduser(a.model))
            if not os.path.isfile(model):
                ap.error('找不到权重文件 %s' % model)
            name = a.name or os.path.splitext(os.path.basename(model))[0]
            runner = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mortal_runner.py')
            make_argv = lambda seat: [py, runner, '--mortal-dir', mdir, '--model', model, '--name', name, str(seat)]
            cwd, engine = mdir, 'Mortal · ' + name
        else:
            make_argv = lambda seat: [py, 'mortal.py', str(seat)]
            cwd, engine = mdir, 'Mortal'
    else:
        make_argv = lambda seat: [x.replace('{seat}', str(seat)) for x in shlex.split(a.cmd)]
        cwd, engine = a.cwd, 'mjai: ' + a.cmd

    pool = Pool(make_argv, cwd, engine)
    srv = ThreadingHTTPServer((a.host, a.port), make_handler(pool, a.verbose))
    print('雀庭桥接程序已启动：http://%s:%d  （引擎：%s）  Ctrl+C 退出' % (a.host, a.port, engine), file=sys.stderr)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        pool.close()
        srv.server_close()


if __name__ == '__main__':
    main()
