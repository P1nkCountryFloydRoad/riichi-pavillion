// 端到端测试：AI 对局中三家通过 tools/mortal_bridge.py 调用 mjai 机器人。
//
//   node test/bridge.js [局数]                                  # 用示例机器人（摸切，并校验事件格式）
//   node test/bridge.js [局数] --mortal-dir ~/Mortal/mortal     # 用真正的 Mortal（读 config.toml）
//   node test/bridge.js [局数] --mortal-dir ~/Mortal/mortal --model 权重.pth  # 指定权重
//   node test/bridge.js [局数] --cmd "命令 {seat}" [--cwd 目录]  # 任意 mjai 机器人
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');
const MJ = require('../js/core.js');
require('../js/game.js');
require('../js/ai.js');
require('../js/mjai.js');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
let N = 4;
const bridgeArgs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (['--mortal-dir', '--cmd', '--cwd', '--python', '--model', '--name'].includes(a)) bridgeArgs.push(a, args[++i]);
  else if (/^\d+$/.test(a)) N = +a;
  else if (!bridgeArgs.length) bridgeArgs.push('--cmd', a); // 兼容旧用法：第二个参数直接是命令
  else {
    console.error('未知参数：' + a);
    process.exit(2);
  }
}
const dummy = !bridgeArgs.some((x) => x === '--mortal-dir' || x === '--cmd');
if (dummy) bridgeArgs.push('--cmd', `python3 ${path.join(root, 'tools/mjai_dummy_bot.py')} {seat}`);

const port = 18174 + Math.floor(Math.random() * 500);
const url = `http://127.0.0.1:${port}`;

let br = null;
let errLog = '';
function die(msg) {
  console.error('\n✗ ' + msg);
  const tail = errLog.trim().split('\n').slice(-15).join('\n');
  if (tail) console.error('\n桥接程序 / 机器人的输出（最后几行）：\n' + tail);
  if (br) br.kill();
  process.exit(1);
}

(async () => {
  br = spawn('python3', [path.join(root, 'tools/mortal_bridge.py'), ...bridgeArgs, '--port', String(port)], { stdio: ['ignore', 'inherit', 'pipe'] });
  br.stderr.on('data', (b) => { errLog += b; });
  let exited = false;
  br.on('exit', () => { exited = true; });

  let up = { ok: false };
  for (let i = 0; i < 60 && !up.ok && !exited; i++) {
    await new Promise((r) => setTimeout(r, 150));
    up = await MJ.Mjai.ping(url);
  }
  if (!up.ok) die('桥接程序没有启动' + (up.error ? '：' + up.error : ''));
  console.log('bridge up:', up.engine);
  if (!dummy) console.log('（第一次决策需要加载模型，可能要等一会儿）');

  let decisions = 0;
  for (let i = 0; i < N; i++) {
    const agents = [new MJ.AI.AIAgent()];
    const g = new MJ.Game({ agents, length: 'east', rules: { aka: i % 2 ? 4 : 3 } });
    const log = new MJ.Mjai.MjaiLog(g);
    for (let s = 1; s < 4; s++) {
      const a = new MJ.Mjai.MjaiAgent({
        url, log, fallback: new MJ.AI.AIAgent(), session: 'test-' + i,
        // 任何一次退回内置 AI 都算失败，立即停下并给出原因
        onError: (m) => die(`座位 ${s} 的机器人出错：${m}`),
      });
      const t = a.onTurn.bind(a), c = a.onCall.bind(a);
      a.onTurn = (...x) => { decisions++; return t(...x); };
      a.onCall = (...x) => { decisions++; return c(...x); };
      agents.push(a);
    }
    let hands = 0, wins = 0, riichi = 0;
    g.listener = async (type, d) => {
      if (type === 'handStart') hands++;
      if (type === 'win') wins += d.results.filter((r) => r.seat > 0).length;
      if (type === 'riichiAccepted' && d.seat > 0) riichi++;
      if (dummy && type === 'discard' && d.seat > 0) assert.ok(d.tsumogiri, '示例机器人应当总是摸切');
    };
    await g.run();
    console.log(`game ${i + 1}: ${hands} hands, bot wins ${wins}, bot riichi ${riichi}, scores ${g.scores.join(' / ')}`);
  }
  console.log(`decisions sent to bot: ${decisions}, fallbacks: 0`);
  if (/Traceback/.test(errLog)) die('机器人输出了 Python 异常');
  console.log('bridge test passed');
  br.kill();
})().catch((e) => die(e && e.stack || String(e)));
