# 雀庭 · 立直麻将

一个可以离线游玩的四人立直麻将（日本麻将）网页游戏：你对三个 AI，内置点数计算教程。

## 运行

- **最简单**：直接双击 `index.html`，用浏览器打开即可，全程不需要网络。
- **本地服务（可安装为离线应用）**：

  ```bash
  python3 -m http.server 8173
  ```

  然后访问 <http://localhost:8173>。通过 http 访问时会注册 Service Worker，之后断网也能打开。

没有构建步骤，没有第三方依赖；牌面是 SVG 程序绘制的，音效由 WebAudio 实时合成。

## 规则

主菜单的「规则设置」（对局中右上角的「规」）可以调整，设置保存在本机浏览器，下一场对局生效：

| 分类 | 选项 |
| --- | --- |
| 点数与终局 | 起始点数、返点、西入、击飞、顺位马（无 / 5-10 / 雀魂式 15/5 / 10-20 / 10-30） |
| 宝牌与役 | 赤宝牌 0 / 3 / 4 枚、食断、一发、里宝牌、杠宝牌、累计役满、役满复合 |
| 和了与流局 | 一炮多响（双响 / 头跳）、流局满贯 |
| 途中流局 | 九种九牌、四风连打、四家立直、四杠散了、三家和了（各自开关） |
| 对手 | 内置 AI / Mortal、AI 速度 |

## 终局精算与战绩

终局时按雀魂的方式把点数换算成得点：`(终局点数 − 返点) ÷ 1000 + 顺位马`，一位另得返点差 `(返点 − 起始点数) × 4 ÷ 1000`，四家合计为 0。默认 25,000 点起、30,000 返、马 +15/+5/−5/−15，例如 45,000 点一位 = 15 + 15 + 20 = **+50.0**。

打完的每场对局自动保存在本机浏览器（最多 300 场），主菜单「战绩与数据」里可以看到：

- 对局数、平均顺位、累计 / 场均得点、顺位分布、被飞率、累计得点走势
- 和了率、放铳率、自摸率、被自摸率、平均打点、平均铳点、最高打点
- 立直率、立直后和了率、副露率、副露后和了率、流局率、流局听牌率
- 每场的四家点数与得点，以及逐局记录（谁和了谁、番符、役种、自己的点数变化）

可以按东风战 / 半庄战筛选，也可以删除单条或清空全部记录。中途退回菜单的对局不记录。

浏览器里最多保留最近 500 场。想长期保存或换电脑，用战绩页的「导出到文件」存成 `雀庭战绩-日期.json`（包含全部记录和当前规则），之后「导入文件」即可恢复：与现有记录合并，重复的自动跳过。

所有本地数据（规则、音效开关、战绩）都通过 `js/store.js` 的 `MJ.Store` 读写，默认存在浏览器 localStorage。以后打包成桌面应用时，调用 `MJ.Store.use({ getItem, setItem, removeItem })` 换成写文件的实现即可。

始终启用：振听（舍牌 / 同巡 / 立直）、食替禁止、荒牌流局罚符、连庄与本场、尾局和了止め。未实现：包牌。

## 使用 Mortal 作为对手（可选）

[Mortal](https://github.com/Equim-chan/Mortal) 是开源的深度学习立直麻将 AI，比内置 AI 强得多。
它需要 PyTorch 和编译好的 libriichi，不能在浏览器里直接运行，所以通过本机的桥接程序接入：

1. 按 Mortal 的文档编译 libriichi（`cargo build -p libriichi --lib --release`，macOS 上把 `target/release/libriichi.dylib` 复制成 `mortal/libriichi.so`）。
   Mortal 官方不附带训练好的权重，需要另行获取，例如这两个社区权重（都是 Mortal v4，192 通道 × 40 层）：

   | 权重 | 文件 | 说明 |
   | --- | --- | --- |
   | [VoidShine/mortal-298k](https://huggingface.co/VoidShine/mortal-298k) | `mortal_298k.pth`，131 MB，AGPL-3.0 | 天凤高段位半庄牌谱训练 29.8 万步，完整训练检查点 |
   | [banxiaweiliang/Mortal-S42](https://huggingface.co/banxiaweiliang/Mortal-S42) | `weights/s42-inference.pth`，44 MB，Apache-2.0 | 约 110 万场天凤凤凰卓 + 雀魂高段位微调，只含推理张量 |

2. 启动桥接程序（只用 Python 标准库），用 `--model` 指定权重；换权重就换路径后重启：

   ```bash
   python3 tools/mortal_bridge.py --mortal-dir ~/Mortal/mortal --model ~/Mortal/weights/s42/weights/s42-inference.pth --name S42
   python3 tools/mortal_bridge.py --mortal-dir ~/Mortal/mortal --model ~/Mortal/weights/voidshine-298k/mortal_298k.pth --name 298k
   ```

   `--model` 由 `tools/mortal_runner.py` 用官方 Mortal 代码加载权重（`weights_only`，不执行文件里的代码），
   两种格式都支持，不需要 `config.toml`。不加 `--model` 时则照旧运行 `mortal.py`，读取 `mortal/config.toml` 的 `state_file`。
   Mortal 仓库下如果有 `.venv`，桥接程序会自动用它的 Python。

3. 在「规则设置 → 对手 AI」选择 Mortal，点「测试连接」，然后开始对局。

桥接程序为每个 AI 座位启动一个 Mortal 进程，把按座位脱敏的 mjai 事件逐行写入，
只在需要决策时读取它的回应（其余事件带 `"can_act": false`）。对局中如果桥接断开、超时，
或 Mortal 给出不合法的操作，该家会自动换回内置 AI，并在屏幕上提示。

任何遵守同一协议的 mjai 机器人都可以接入：`--cmd "你的命令 {seat}"`。
`tools/mjai_dummy_bot.py` 是一个只会摸切的示例机器人，会校验收到的每个事件的格式。

## 结构

| 文件 | 内容 |
| --- | --- |
| `js/core.js` | 牌的表示、向听数、和牌拆解、役种判定、符数与点数计算（纯逻辑，Node 可用） |
| `js/game.js` | 对局引擎：摸打、鸣牌、立直、结算、连庄与终局 |
| `js/ai.js` | AI：向听数 + 有效牌的牌效，现物 / 筋 / 字牌的防守，役牌与断幺的副露判断 |
| `js/mjai.js` | mjai 协议适配：事件记录与脱敏、调用桥接程序的 agent |
| `js/settings.js` | 规则与 AI 设置面板 |
| `js/store.js` | 本地存储层（localStorage / 内存，可替换为文件） |
| `js/records.js` | 对局记录、统计汇总、导入导出与战绩页面 |
| `tools/mortal_bridge.py` | 浏览器 ↔ mjai 机器人（Mortal）的本机桥接程序 |
| `js/render.js` | 牌面 SVG、副露渲染、点数逐步讲解 |
| `js/ui.js` | 牌桌界面、动画、玩家操作 |
| `js/tutorial.js` | 点数教程：讲解、速查表、计算器、例题、随机练习 |
| `js/sound.js` | 合成音效 |
| `sw.js` | 离线缓存 |


## 测试

```bash
node test/run.js 200
```

先跑役种 / 符 / 点数与规则选项的单元测试，再让四个 AI 在几组不同规则下自对局，检查牌数与点数守恒、关闭的规则不会触发。

```bash
node test/bridge.js 3
```

端到端测试 mjai 链路：启动桥接程序和示例机器人，让三家通过 HTTP 决策，检查事件格式且没有退回内置 AI。
传入第二个参数可以换成真正的 Mortal：`node test/bridge.js 2 "python /path/to/Mortal/mortal/mortal.py {seat}"`
（此时需要在 Mortal 的目录里运行，或设置好它的配置路径）。
