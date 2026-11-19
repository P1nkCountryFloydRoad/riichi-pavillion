# 雀庭 · 立直麻将

**中文** | [English](#riichi-pavilion--riichi-mahjong)

一个可以离线游玩的四人立直麻将（日本麻将）网页游戏：你对三个 AI，内置点数计算教程。

界面支持中文和英文：主菜单右上角或「规则设置」最上面可以切换，默认跟随浏览器语言，选择保存在本机。

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

打完的每场对局自动保存在本机浏览器（最多 500 场），主菜单「战绩与数据」里可以看到：

- 对局数、平均顺位、累计 / 场均得点、顺位分布、被飞率、累计得点走势
- 和了率、放铳率、自摸率、被自摸率、平均打点、平均铳点、最高打点
- 立直率、立直后和了率、副露率、副露后和了率、流局率、流局听牌率
- 每场的四家点数与得点，以及逐局记录（谁和了谁、番符、役种、自己的点数变化）
- 每次和牌的完整牌型：牌面图 + 可复制的记法，如 `1112345678999m 0m`、`234m55p [789s] (7777z) 3p`（`[ ]` 明副露，`( )` 暗杠，最后一张是和了牌，`0` 表示赤五，`1-7z` 为东南西北白发中）

可以按东风战 / 半庄战筛选，也可以删除单条或清空全部记录。中途退回菜单的对局不记录。

### 牌谱

每场对局的完整牌谱（四家配牌、每一次摸打、鸣牌、立直、宝牌、结算）也会一起保存。终局画面的「查看牌谱」或战绩详情里的「回放牌谱」可以逐步回放：

- 四家手牌全部明牌显示，牌河里标出立直宣言牌（横置）、被鸣走的牌（变暗）、摸切（略暗）和最新一张
- ← / → 逐步，↑ / ↓ 换局，空格自动播放，也可以拖动进度条或直接选局
- 每局结束时显示和了者、番符、役种、和了牌型和四家点数变化

「下载牌谱」存成 `雀庭牌谱-日期.mjson`：标准 mjai 事件格式，每行一个 JSON 事件，可以给其他支持 mjai 的工具（例如 Mortal 的复盘工具 mjai-reviewer）读取。

浏览器里最多保留最近 500 场。想长期保存或换电脑，用战绩页的「导出到文件」存成 `雀庭战绩-日期.json`（包含全部记录、牌谱和当前规则），之后「导入文件」即可恢复：与现有记录合并，重复的自动跳过。

规则、音效开关、战绩都通过 `js/store.js` 的 `MJ.Store` 读写，默认存在浏览器 localStorage；牌谱体积较大（半庄约 50–80 KB），由 `js/paifu.js` 的 `MJ.Paifu` 存在 IndexedDB。以后打包成桌面应用时，调用 `MJ.Store.use({ getItem, setItem, removeItem })` 和 `MJ.Paifu.use({ get, put, del, clear, keys })` 换成写文件的实现即可。

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

### 「策」提示

对局中点右上角的「策」，会列出当前所有合法操作的倾向：用 Mortal 时显示前 8 项的概率条（对 Mortal 给出的 Q 值做 softmax）和 Q 值，手牌上方也标出每张牌被打出的概率（0.5% 以下不标）；吃 / 碰 / 杠 / 和 / 立直这类操作也在列表里，最可能的那张牌或按钮会高亮。

「规则设置 → 「策」提示」可选：

- **跟随对手**（默认）：对手是 Mortal 时用 Mortal，否则用内置 AI
- **Mortal**：对手用内置 AI 也可以单独用 Mortal 当提示（同样需要桥接程序在运行）
- **内置 AI**：列出向听数和有效牌数最好的几种打法

Mortal 提示用的是你这一家视角的脱敏事件，和对手一样看不到别家手牌。连不上桥接程序时自动退回内置 AI。

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
| `js/mjai.js` | mjai 协议适配：事件记录与脱敏、调用桥接程序的 agent、「策」提示的 Mortal 顾问 |
| `js/settings.js` | 规则与 AI 设置面板 |
| `js/store.js` | 本地存储层（localStorage / 内存，可替换为文件） |
| `js/i18n.js` | 界面语言（中文 / English）与术语表 |
| `js/records.js` | 对局记录、统计汇总、导入导出与战绩页面 |
| `js/paifu.js` | 牌谱存储（IndexedDB / 内存，可替换为文件） |
| `js/replay.js` | 牌谱重建与回放界面、牌谱下载 |
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

先跑役种 / 符 / 点数与规则选项的单元测试、鸣牌优先级、「策」提示的概率解析和英文术语表，再让四个 AI 在几组不同规则下自对局，检查牌数与点数守恒、关闭的规则不会触发，并从保存的牌谱逐局重建，核对每局点数变化与战绩一致、牌谱随导出导入。

```bash
node test/bridge.js 3
```

端到端测试 mjai 链路：启动桥接程序和示例机器人，让三家通过 HTTP 决策，检查事件格式且没有退回内置 AI。
加上 `--mortal-dir` 可以换成真正的 Mortal：`node test/bridge.js 1 --mortal-dir ~/Mortal/mortal --model 权重.pth`
（此时需要在 Mortal 的目录里运行，或设置好它的配置路径）。

---

# Riichi Pavilion · Riichi Mahjong

[中文](#雀庭--立直麻将) | **English**

A four-player riichi (Japanese) mahjong web game that works offline: you play against three AIs, with a built-in scoring tutorial. (雀庭, “Riichi Pavilion”, is the game's Chinese name.)

The interface is available in Chinese and English. Switch it at the top right of the main menu or at the top of the Rules panel. By default it follows your browser's language, and your choice is saved on the device.

## Running

- **Simplest**: double-click `index.html` to open it in a browser. No network is needed at any point.
- **Local server (installable as an offline app)**:

  ```bash
  python3 -m http.server 8173
  ```

  Then open <http://localhost:8173>. When served over http, a Service Worker is registered, so the game still opens without a network afterwards.

There is no build step and no third-party dependency. The tiles are drawn as SVG in code, and the sound effects are synthesized live with WebAudio.

## Rules

“Rules” on the main menu (or the 规 button at the top right during a game) adjusts the rules. Settings are saved in this browser and apply from the next game:

| Category | Options |
| --- | --- |
| Points and game end | Starting points, return points, West round, bust ends game, uma (none / 5-10 / online-style 15/5 / 10-20 / 10-30) |
| Dora and yaku | Red fives 0 / 3 / 4, open tanyao, ippatsu, ura dora, kan dora, kazoe yakuman, stacked yakuman |
| Wins and draws | Multiple ron (allowed / head bump), nagashi mangan |
| Abortive draws | Nine terminals, four winds, four riichi, four kans, triple ron (each can be turned on or off) |
| Opponents | Built-in AI / Mortal, AI speed |

## Final scoring and records

At the end of a game, scores are converted to final points the way online platforms such as Mahjong Soul do it: `(final score − return points) ÷ 1000 + uma`. First place also gets the oka, `(return points − starting points) × 4 ÷ 1000`, so the four results add up to 0. The default is 25,000 start, 30,000 return and uma +15/+5/−5/−15. For example, first place with 45,000 = 15 + 15 + 20 = **+50.0**.

Every finished game is saved in this browser automatically (up to 500 games). “Records & stats” on the main menu shows:

- Games played, average placement, total and per-game points, placement distribution, bust rate, cumulative point trend
- Win rate, deal-in rate, tsumo rate, tsumo-ed rate, average win, average deal-in, best win
- Riichi rate, win rate after riichi, call rate, win rate after calling, draw rate, tenpai-at-draw rate
- Each game's four scores and final points, plus a hand-by-hand log (who won from whom, han and fu, yaku, your point change)
- The full shape of every winning hand: tile images plus copyable notation such as `1112345678999m 0m` or `234m55p [789s] (7777z) 3p` (`[ ]` is an open meld, `( )` a closed kan, the last tile is the winning tile, `0` is a red five, and `1-7z` are East, South, West, North, White, Green, Red)

You can filter by East game / hanchan, and delete single records or clear them all. Games abandoned back to the menu are not recorded.

### Game logs

The complete log of each game (all four starting hands, every draw and discard, calls, riichi, dora and results) is saved too. “Replay game” on the end screen, or “Replay” in a record's details, plays it back step by step:

- All four hands are shown face up. The discard ponds mark the riichi declaration tile (turned sideways), called tiles (dimmed), tsumogiri discards (slightly dimmed) and the latest discard
- ← / → step, ↑ / ↓ switch hands, Space plays automatically; you can also drag the progress bar or pick a hand directly
- At the end of each hand it shows the winner, han and fu, yaku, the winning hand shape and all four point changes

“Download log” saves a `.mjson` file: the standard mjai event format, one JSON event per line, readable by other mjai tools (for example mjai-reviewer, the Mortal review tool).

The browser keeps up to the latest 500 games. To keep them long-term or move to another computer, use “Export” on the records page to save a `.json` file (all records, game logs and the current rules); “Import” restores it later, merging with existing records and skipping duplicates.

Rules, the sound toggle, the language and records are read and written through `MJ.Store` in `js/store.js`, which uses the browser's localStorage by default. Game logs are larger (about 50–80 KB per hanchan) and are stored in IndexedDB by `MJ.Paifu` in `js/paifu.js`. To package this as a desktop app later, call `MJ.Store.use({ getItem, setItem, removeItem })` and `MJ.Paifu.use({ get, put, del, clear, keys })` with file-based implementations.

Always on: furiten (discard / temporary / riichi), no swap-calling (kuikae), noten penalty at exhaustive draws, dealer repeats and honba, and the dealer may stop as top in the last hand. Not implemented: pao (liability payments).

## Using Mortal as the opponent (optional)

[Mortal](https://github.com/Equim-chan/Mortal) is an open-source deep-learning riichi mahjong AI, far stronger than the built-in one. It needs PyTorch and a compiled libriichi and cannot run in a browser, so it connects through a bridge program on your computer:

1. Build libriichi as Mortal's docs describe (`cargo build -p libriichi --lib --release`; on macOS, copy `target/release/libriichi.dylib` to `mortal/libriichi.so`).
   Mortal does not ship trained weights; you need to get some separately, for example one of these two community weights (both Mortal v4, 192 channels × 40 blocks):

   | Weights | File | Notes |
   | --- | --- | --- |
   | [VoidShine/mortal-298k](https://huggingface.co/VoidShine/mortal-298k) | `mortal_298k.pth`, 131 MB, AGPL-3.0 | 298k steps trained on high-rank Tenhou hanchan logs; full training checkpoint |
   | [banxiaweiliang/Mortal-S42](https://huggingface.co/banxiaweiliang/Mortal-S42) | `weights/s42-inference.pth`, 44 MB, Apache-2.0 | Fine-tuned on about 1.1 million Tenhou Phoenix-table and high-rank Mahjong Soul games; inference tensors only |

2. Start the bridge (Python standard library only), choosing the weights with `--model`; to switch weights, change the path and restart:

   ```bash
   python3 tools/mortal_bridge.py --mortal-dir ~/Mortal/mortal --model ~/Mortal/weights/s42/weights/s42-inference.pth --name S42
   python3 tools/mortal_bridge.py --mortal-dir ~/Mortal/mortal --model ~/Mortal/weights/voidshine-298k/mortal_298k.pth --name 298k
   ```

   With `--model`, `tools/mortal_runner.py` loads the weights through the official Mortal code (`weights_only`, so no code inside the file is executed). Both formats are supported and no `config.toml` is needed. Without `--model`, the bridge runs `mortal.py` as before, which reads `state_file` from `mortal/config.toml`.
   If the Mortal repository has a `.venv`, the bridge uses its Python automatically.

3. In “Rules → Opponent AI”, choose Mortal, click “Test connection”, then start a game.

### Hints (策)

During a game, the 策 button at the top right lists how the AI leans across all legal actions. With Mortal it shows the top 8 actions with probability bars (a softmax over the Q values Mortal returns) and Q values, and marks each tile in your hand with its discard probability (tiles under 0.5% are not marked). Chi / pon / kan / win / riichi actions are listed too, and the most likely tile or button is highlighted.

“Rules → Hint (策)” offers:

- **Same as opponents** (default): Mortal when the opponents are Mortal, otherwise the built-in AI
- **Mortal**: use Mortal for hints even when the opponents are the built-in AI (the bridge must be running)
- **Built-in AI**: lists the discards with the best shanten and tile acceptance

Mortal hints use your own seat's masked view of the game, so like the opponents it cannot see other players' hands. If the bridge cannot be reached, hints fall back to the built-in AI.

The bridge starts one Mortal process per AI seat, writes the per-seat masked mjai events to it line by line, and only reads a reply when a decision is needed (all other events carry `"can_act": false`). If the bridge disconnects or times out during a game, or Mortal returns an illegal action, that seat switches back to the built-in AI and a notice appears on screen.

Any mjai bot that follows the same protocol can be plugged in with `--cmd "your command {seat}"`. `tools/mjai_dummy_bot.py` is a sample bot that only discards what it draws and validates the format of every event it receives.

## Structure

| File | Contents |
| --- | --- |
| `js/core.js` | Tile representation, shanten, hand decomposition, yaku, fu and score calculation (pure logic, works in Node) |
| `js/game.js` | Game engine: draws and discards, calls, riichi, settlement, dealer repeats and game end |
| `js/ai.js` | AI: tile efficiency from shanten + acceptance; defense with safe tiles / suji / honors; call decisions for yakuhai and tanyao |
| `js/mjai.js` | mjai protocol adapter: event log and masking, the agent that calls the bridge, the Mortal advisor for hints |
| `js/settings.js` | Rules and AI settings panel |
| `js/store.js` | Local storage layer (localStorage / memory, replaceable with files) |
| `js/i18n.js` | Interface language (Chinese / English) and the term glossary |
| `js/records.js` | Game records, stats, import/export and the records page |
| `js/paifu.js` | Game log storage (IndexedDB / memory, replaceable with files) |
| `js/replay.js` | Game log reconstruction, the replay viewer and log download |
| `tools/mortal_bridge.py` | Local bridge between the browser and mjai bots (Mortal) |
| `js/render.js` | Tile SVGs, meld rendering, step-by-step score explanations |
| `js/ui.js` | Table UI, animations, player actions |
| `js/tutorial.js` | Scoring tutorial: lessons, score tables, calculator, examples, random practice |
| `js/sound.js` | Synthesized sound effects |
| `sw.js` | Offline cache |

## Tests

```bash
node test/run.js 200
```

Runs unit tests for yaku, fu, points and rule options, call priority, hint probability parsing and the English glossary. Then four AIs play each other under several rule sets, checking that tile counts and points are conserved and that disabled rules never trigger. Finally each game is rebuilt from its saved log, checking that every hand's point changes match the records and that logs survive export and import.

```bash
node test/bridge.js 3
```

End-to-end test of the mjai pipeline: it starts the bridge and the sample bot, lets three seats decide over HTTP, and checks the event format and that no seat fell back to the built-in AI.
Add `--mortal-dir` to use the real Mortal: `node test/bridge.js 1 --mortal-dir ~/Mortal/mortal --model weights.pth`
(in that case run it from Mortal's directory, or set up its config path).
