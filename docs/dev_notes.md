# 《黄昏之门 · 月壤厢》开发笔记（dev_notes）

> 交付人：member-5（开发工程师）　日期：2026-10-22
> 本文档记录启动方法、文件结构、自测情况、技术债与未覆盖功能。**未测的一律写「未验证」，不含「应该能跑」。**

---

## 1. 启动方法

**直接双击 `src/index.html`**（file:// 协议）即可运行，无需任何构建、服务器或依赖安装。

- 技术栈：纯 HTML/CSS/JS，无框架、无构建、无 npm 依赖。
- 遵守约束：禁用 ES module 与 fetch（file:// 下被 CORS 拦）；OC 数据经 `src/js/data.js` 以全局变量 `const OC_DATA` 注入；所有脚本为普通 `<script>` 顺序加载，共享全局命名空间 `DG`（`window.DG`）。
- 存档：localStorage，key = `duskgate_save_moonseil_v1`（前缀 `duskgate_save_`，版本号 `_v1`，升级时旧档自动忽略重开）。
- 占位图：`art/otakmarkad/otak_placeholder.png`（Ótakmarkað 看板）、`art/eidos/eidos_casino_placeholder.png`（Eidos 庄家），由 `../art/...` 相对路径引用。

### 环境要求
- 任意现代浏览器（Chrome / Edge / Firefox 近两年版本均可）。
- 开发期自测用了 Node（跑逻辑测试）与本机 Chrome 无头模式（渲染验证），均非运行时依赖。

---

## 2. 文件结构

```
src/
├── index.html                入口（标题/导航/HUD/视图容器/脚本加载顺序）
├── css/
│   └── style.css             暗色档案风样式（rarity 配色、网格、弹窗、看板）
├── js/
│   ├── data.js               【生成物】OC_DATA 全局变量，69 个 OC 单位（勿手改）
│   ├── core.js               DG 命名空间、工具函数、localStorage 存档（duskgate_save_ 前缀）
│   ├── state.js              游戏状态：收容/产出/tick/离线补算（纯逻辑，无 DOM）
│   ├── pollution.js          污染度/压制/收容失效事件（纯逻辑，无 DOM）
│   ├── skilltree.js          技能树 8 节点 2 分支（纯逻辑，无 DOM）
│   ├── casino.js             赌场三级赌注与一局结算（纯逻辑，无 DOM）
│   ├── archive.js            OC 名录筛选（纯逻辑，无 DOM）
│   ├── ui.js                 DOM 渲染、事件委托、弹窗、日志、看板台词
│   └── main.js               入口：读档→离线补算→1s tick 循环→自动存档
└── tests/
    ├── run_node_tests.js     纯逻辑测试（vm 沙箱加载 7 个逻辑模块，64 项断言）
    └── run_ui_smoke.js       UI 冒烟测试（最小 fake-DOM 驱动 ui.js+main.js，34 项断言）

docs/
└── dev_notes.md              本文档
```

`data/`、`art/`、`docs/project_input.json` 未做任何改动。

### data.js 再生成命令（数据更新后执行）

```bash
node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('data/oc_dataset.json','utf8'));fs.writeFileSync('src/js/data.js','// 由 data/oc_dataset.json 生成，请勿手改。\nconst OC_DATA = '+JSON.stringify(d,null,1)+';\n')"
```

---

## 3. 玩法实现对照（验收四件事）

| 验收项 | 实现位置 | 状态 |
| --- | --- | --- |
| 放 3 个 guð 产出 | 厢体网格 + 名录收容（69 个，按世界/稀有度筛选）+ 1s tick 产出 desc/mood | 已实现 |
| 技能树点出一条分支 | 8 节点 / 2 分支（A 档案扩编、B 污染处置），点技能扣 desc，效果即时生效 | 已实现 |
| 赌场赌完一局 | 选赌注等级 → 开局 → 900ms 结算 → 记录；三级赌注（存在档仅 UI+文案） | 已实现 |
| 处理一次收容失效 | 污染满 100 触发弹窗事件（冻结/降级/逃逸三态，档案式文案） | 已实现 |

### 关键数值（demo 期设定，等 balance.md 校准）

- 产出：`yieldRate × 稀有度倍率 × 技能倍率` 每秒；倍率 R=1 / SR=1.25 / SSR=1.5 / DISASTER=2；`both` 对半拆分。
- 污染：Σ(单位 pollution × 倍率) × 0.05 每秒；自然衰减 0（b3 技能 +0.2/s）。
- 压制：-20 情绪，瞬间 -25 污染（b2 后 -37.5），30 秒内增速减半。
- 失效事件：34% 冻结 60s / 33% 降级一级（R 级转为逃逸）/ 33% 逃逸；DISASTER 恒逃逸。事件后污染回落 35（b4 后 20），宽限期 30s（b4 后 60s）。
- 技能：a1(10) a2(25) a3(60) a4(150) / b1(10) b2(25) b3(60) b4(150)，线性前置链。
- 赌场：**临时公平模型——胜率 45%、赔率 1:1**（源码 `casino.js` 内 `ODDS` 常量，已标 `TODO(balance.md)`；docs/balance.md 就绪后只改这一处）。
- 离线：localStorage 记 `lastSeen`，离线 50% 效率补算、封顶 2 小时，逐秒模拟（冻结/压制/失效语义与在线一致），离线最多触发一次失效。

---

## 4. 自测记录（如实）

测试环境：Windows 11 + Node（本机）+ Chrome 无头模式（本机，仅验证用，非运行时依赖）。

### 4.1 `node --check` 语法校验——全部通过

```bash
for f in src/js/*.js src/tests/*.js; do node --check "$f"; done
```
结果：10/10 文件通过（data/core/state/pollution/skilltree/casino/archive/ui/main + 2 个测试文件）。

### 4.2 纯逻辑测试 `node src/tests/run_node_tests.js`——64/64 通过

方法：用 Node `vm` 把 7 个无 DOM 依赖的逻辑模块（data/core/state/pollution/skilltree/casino/archive）打包进同一沙箱执行，rng 与时钟全部可注入（`() => 0.99` 这类桩），逐项断言。

覆盖：数据完整性（69 单位、关键 id、字段校验）；收容规则（重复/越界/填满拒绝）；tick 产出与污染累积（含稀有度倍率）；技能树（前置、成本、格子扩展 6→8→11、倍率修正）；压制（情绪门槛、降污染、速率减半与恢复）；失效事件三态 + DISASTER 恒逃逸 + R 级降级转逃逸 + 越界触发；赌场（扣注/胜净赚/负净亏/1:1/存在档不动单位/连输文案）；离线补算（50% 效率、封顶、离线失效只一次）；名录筛选；JSON 存档往返与 migrate；Node 无 localStorage 时存档函数安全降级。

**测试过程抓到并修复 1 个真 bug**：赌场 1:1 赔率最初被实现成「和局」（开局扣 10、赢了只加回 10，净收益 0），已改为「赢 = 退回赌注 + 净赚 1 倍赌注」。

### 4.3 UI 冒烟测试 `node src/tests/run_ui_smoke.js`——34/34 通过

方法：自研最小 fake-DOM（约 60 行，不解析 innerHTML，动态元素由测试手工构造带 `data-act` 属性的节点）驱动 `ui.js` + `main.js` 完整加载，模拟点击/change/定时器刷新。

覆盖：main.js 自执行（初始渲染 6 空格、HUD 填充、tick 注册）；导航三视图切换；切换界面轮播 Ótakmarkað 台词；买技能（成功/越级拒绝/日志）；赌场一局全流程（选档→扣注→定时器结算→记录→庄家台词）；名录弹窗（69 条、世界/稀有度筛选）；收容入格；压制门槛与效果；调离确认流；tick 越界触发失效弹窗与污染回落；挂机 60s 台词「你还在啊。」。

**已知局限**：fake-DOM 不等于真实浏览器；innerHTML 动态内容不可查询，故动态按钮由测试手工构造点击。

### 4.4 无头 Chrome 真实渲染验证——通过

方法：`chrome --headless --dump-dom`（`--virtual-time-budget=3000`）+ `--screenshot`，直接加载 `file:///.../src/index.html` 与 4 个同构测试页（技能树/赌场/失效弹窗/名录弹窗，测试页事后已删除）。

结果：
- 初始视图：标题、副标题「当前区域：月壤厢」、HUD（描述 10 / 情绪 10 / 污染度 0% +0.0/s）、6 空格 + 5 未解锁格、档案日志面板全部渲染；控制台无 JS 错误。
- 技能树：8 节点两分支、已购态、Ótakmarkað 看板与占位图加载成功、台词气泡。
- 赌场：Eidos 占位图加载成功（红黄黑戏服可见）、三级赌注按钮（存在档带 DEMO 展示标）、赔率 TODO 文案、开局按钮、赌局记录。
- 失效弹窗：「收容失效记录」+「执行灭门。备注：灭门。」+「该单位已不在册。」渲染正常。
- 名录弹窗：67 个可收容按钮 + 2 个在驻标记 = 69 ✓；世界/稀有度下拉各就位。
- 截图人工复核 3 张（厢体/技能树/赌场），布局与占位图正常。

**测试过程抓到并修复 1 个真 bug**：`ui.js` 对象字面量中属性 `log: []` 被同名方法 `log: function` 覆盖，导致档案日志循环 `this.log[i].cruel` 崩溃、厢体视图整体渲染失败（无头 Chrome 控制台报 `Uncaught TypeError` 后抓到的；Node 语法检查发现不了此类错误）。已重命名为 `archiveLog`。

### 4.5 未验证项（明确列出）

- **真实鼠标操作的完整手感**：无头 Chrome 只做了加载渲染，没有模拟真实指针事件流；点击逻辑经 fake-DOM 冒烟测试覆盖，但「真实浏览器里连点、快速切视图、弹窗开合」等时序未验证。
- **多浏览器兼容**：只在 Chrome（无头）验证；Firefox/Safari 未测（预计无碍：未用新奇特性的 API，但未实测）。
- **长时间挂机稳定性**：只验证到逻辑层面的 tick 语义，未做分钟级实跑。
- **localStorage 在 file:// 下的实际读写**：Node 侧验证了「无 localStorage 时安全降级」；真实浏览器 file:// 下的存取未实测（Chrome 通常允许，但未验证）。
- 音效、动画、移动端触屏：不在 demo 范围。

---

## 5. 技术债清单

1. ~~**赌场数值是占位**~~ → **已落地**（balance.md 正式值）：胜率 45% / 赔率 1.2:1 已接入 `casino.js` 顶部 `ODDS`；「完成」debuff 已实现为真实机制（连输 5 局触发，全场产出减半 60s，HUD 有提示）。
2. ~~**稀有度倍率为自设**~~ → **已落地**：R/SR/SSR/DISASTER = 1/1.25/1.5/2 经 balance.md 确认为正式表（与数据集 yieldRate 完全相关：R=1/SR=2/SSR=3/DISASTER=4）。
3. ~~**污染数值未经平衡**~~ → **已落地**：缩放系数 0.05 → 0.03（`DG.POLLUTION_SCALE`，state.js/pollution.js/ui.js 三处共用），3×R 参考路径首次失效约 18.5 分钟；失效权重冻结 40%/降级 30%/逃逸 30%（`FAIL_HALT`/`FAIL_DROP` 常量）。
4. **档案日志不存档**：日志仅存内存（封顶 60 条），刷新后清空。`stats` 计数有存档。
5. **槽位结构硬编码上限 11**：`MAX_CELLS=11` 与技能 a1(+2)/a4(+3) 绑定；后续区域/扩建需要重构为配置驱动。
6. **无 i18n**：全部文案硬编码中文。
7. **无单元测试框架**：两个测试脚本是手写断言（零依赖是特性也是限制），后续可迁移到 Vitest/Jest。
8. **失效事件候选排除冻结单位**：若全员被冻结，事件退化为「仅回落污染」，文案已覆盖但属边缘情况。
9. **Ótakmarkað 台词轮播索引不存档**：刷新后从第一句。
10. **CSS 未做响应式深调**：仅保证 ≥760px 桌面宽度舒适；窄屏可玩但未精修。
11. **`data.js` 为生成物但无自动守护**：忘记重新生成会导致数据与 `data/oc_dataset.json` 不一致（再生成命令见上）。
12. **HUD 污染速率显示粒度**：单 R 单位速率 0.03/s，`fmt1` 一位小数显示为「+0.0/s」，观感呆。多单位自然上升；如常驻低值可改两位小数（低优先）。
13. **balance.md 待验证项未收口**：压制性价比（both 单位可近永压）、b3 衰减 0.2 致零失效路径、名录默认排序致失效提前——均为待真人试玩项，knob 已在 balance.md 注明。

---

## 6. 未覆盖功能（demo 期明确不做）

- 黄昏之门（mood 体系）区域及其他世界内容——只做月壤厢。
- 单位立绘（除两张看板占位图外，档案卡仅色块+文字，符合 decisions）。
- 「存在」档赌注的真实扣除（不删单位，仅 UI+文案）。
- 商店、成就、图鉴收集进度、音效、过场剧情。
- Electron 打包（decisions 提到上架前再做；当前 file:// 双击即玩）。

---

## 7. 第二轮改动记录（数值接入 + 测试官 bug 修复，主理人执行）

### 7.1 改动清单（2026-10-22 晚）
| 文件 | 改动 |
|---|---|
| src/js/state.js | `POLLUTION_SCALE` 0.05→0.03 并挂 `DG.POLLUTION_SCALE`（原为死代码）；`createInitial` 增 `completedUntil`；`unitOutput` 增 debuff 半产检查 |
| src/js/pollution.js | 速率改引用 `DG.POLLUTION_SCALE`；失效权重提取 `FAIL_HALT=0.40`/`FAIL_DROP=0.30` 常量（原 0.34/0.67）；CONSTANTS 暴露新常量 |
| src/js/casino.js | `ODDS.payout` 1→1.2（正式赔率，庄家优势 1%）；TIERS note「净赚 10」→「净赚 12」；`resolve` 增 completed/completionText 返回；连输≥5（`COMPLETE_STREAK`）设 `completedUntil=+60s` 并清零连败；删 `completionLine`，增 `isCompleted` 查询 |
| src/js/ui.js | 赔率文案动态读 `ODDS.payout`（删 TODO 字样）；**Bug1**：`casino-result` id 含空格 → id/class 分离；**Bug2**：庄家台词入 `casino.dealerLine` state，renderCasino 消费，重渲染不吞；结算分支接 `res.completed`；HUD 增「已完成」debuff 提示（含剩余秒数） |
| src/index.html | HUD 增 `hud-completed` 提示节点 |
| src/css/style.css | `.hud-completed` / `#hud-completed-val` 样式 |
| src/tests/ | 两套断言的 0.05/0.34/1:1/净赚10 全部同步；新增 debuff 3 条断言；新增 `cdp_retest.js`（CDP 真实浏览器回看复测 19 项） |

### 7.2 自测结果（本轮，如实）
- `node --check`：state/pollution/casino/ui 全部通过
- `node src/tests/run_node_tests.js`：**66/66 通过**（新增 debuff 生效/过期/触发 3 条）
- `node src/tests/run_ui_smoke.js`：**34/34 通过**
- `node src/tests/cdp_retest.js`（无头 Edge CDP，file:// 直开）：**19/19 通过**——含 Bug1/Bug2 修复确认、1.2 赔率结算文案、debuff 生效/恢复/HUD 提示、POLLUTION_SCALE=0.03、失效权重常量、全程 0 JS 错误
- 截图：C:/Users/33633/AppData/Local/Temp/retest_casino.png（赌场视图人工复核）

### 7.3 测试官（member-6）独立验收结论（旧数值基线，报告 docs/test_report.md）
- 裁决：**放行**；验收四件事 4/4；独立核验五点 5/5（含 file:// localStorage 实际读写、离线补算、失效三态、时序压力、0 错误）
- 独立抓到 2 个表现层 bug（即 7.1 的 Bug1/Bug2），已修复并在本轮 CDP 复测确认
- 其数值相关结论（1:1/0.05 基线）已被 balance.md 正式值取代，复测见 7.2

---

## 8. 第三轮改动记录（二十一点上桌 + 测试重构，主理人执行）

### 8.1 改动清单（2026-10-23）
| 文件 | 改动 |
|---|---|
| src/js/blackjack.js | **新增**。二十一点规则内核（纯逻辑）：单副靴 / S17 / blackjack 3:2 / 加倍限首两张 / 爆牌自动 settle / `fixedShoe` 测试注入 / `basicStrategyAction`。`newRound` 内扣开局注并计 `stats.rounds`（与 casino.start 同口径） |
| src/js/casino.js | TIERS note 改 21 点赔率文案（「胜 1:1 / 二十一点 3:2」） |
| src/js/ui.js | 赌场重写为 21 点牌桌：game-tabs（21点/轮盘/老虎机）+ odds-note 规则条 + `renderBjTable`（idle/playing/done 三相）+ `bjHandHtml`（红黑牌面+暗牌斜纹）+ bjDeal/bjHit/bjStand/bjDouble/bjFinish；**开局即调 renderHud**（下注即扣，HUD 立即反映，不等结算）；onClick 换 bj-* cases |
| src/js/state.js | 无改动（沿用 completedUntil debuff） |
| src/index.html | 引入 `js/blackjack.js`（casino.js 之后） |
| src/css/style.css | 追加 `.game-tabs/.bj-table/.bj-card`（红 #b3322c / hole 45° 斜纹暗牌）/`.bj-actions` 等 21 点样式 |
| src/tests/run_blackjack_tests.js | **新增**：27 断言（估值/牌靴/S17/结算数学/加倍）+ 20 万局蒙特卡洛（庄家优势 5.64%，简化策略） |
| src/tests/cdp_blackjack_ui.js | **新增**：CDP 真实 Edge 全点击流测试 38 项（见 8.3） |
| src/tests/run_ui_smoke.js | 赌场段从骰子流程重写为 21 点流程（bundle 增补 blackjack.js，fake-DOM 增 hud-completed 节点），34→49 断言 |
| src/tests/cdp_retest.js | 赌场段同步 21 点流程；赔率断言改新文案；增测试隔离（清档前置空 store.save，防 beforeunload 写回） |

### 8.2 测试期间发现并修复的问题（均为测试自身/隔离问题，非游戏逻辑 bug）
1. **红暗牌断言漏匹配**：♥♦ 的暗牌 class 为 `bj-card red hole`，写死 `bj-card hole` 约 50% 概率误失败 → 改双分支匹配。
2. **极点开局双重计 delta**：开局 blackjack 在 bj-deal 时已结算（delta 已入账），资源公式又加一遍 → 改为「开局后捕获值 + (极点 ? 0 : delta)」。
3. **极点开局庄家补牌**：opening-BJ 分支会调 dealerPlay 摊牌，庄家手牌可变 3+ 张，断言写死 2 张 → 改 `>= 2`。
4. **CDP 存档跨次泄漏**：file:// 域 localStorage 持久化，上一轮 desc=5/含 oc_gott 的档污染下一轮；且**清档后立即跳转会被 beforeunload 写回覆盖** → 先置空 `DG.store.save` 再 clear，再跳转。
5. **tick 产出致 desc 漂移**：页面 1s tick 持续产出，精确记账断言被打歪 → 测试页置空 `DG.state.tick`（仅影响本测试页，刷新即恢复）。
6. **爆牌局庄家不摊牌**：hit 爆牌直接 settle 不走 dealerPlay（真实赌场规则：爆牌无需摊牌）→ 断言改为「暗牌渲染与内核 holeHidden 一致；未摊牌仅见于爆牌负局」。

### 8.3 自测结果（本轮，如实）
- `node src/tests/run_blackjack_tests.js`：**27/27 通过**（含 20 万局蒙特卡洛，庄家优势 5.64%）
- `node src/tests/run_node_tests.js`：**66/66 通过**
- `node src/tests/run_ui_smoke.js`：**49/49 通过**，连跑 **50 轮 0 失败**（覆盖随机发牌/极点开局/爆牌/加倍/debuff HUD 全路径）
- `node src/tests/cdp_blackjack_ui.js`（无头 Edge CDP，file:// 直开，真实 .click() 冒泡委托）：**38/38 通过**，连跑 6 次 0 失败——覆盖 tabs 渲染/规则文案/未选档禁用/选档高亮/开局扣注+HUD 即时同步/暗牌/要牌停牌收敛/摊牌/结果框 class+computed 配色/记录/台词/资源记账/加倍全链路/资源不足拒局/debuff HUD
- `node src/tests/cdp_retest.js`：**20/20 通过**
- 截图：Temp/bj_playing.png（对局中：你·12 = 3♥9♦、庄家洗牌中、HUD 490）、bj_table.png（爆牌结算：你输了。付掉 10。）、bj_done.png

### 8.4 已知边界（demo 期明确不做）
- 分牌（split）未实现（blackjack.js 头部 TODO）。
- 轮盘/老虎机仅 tabs 占位（「即将」），内核未写。
- 保险（insurance）边注未做。
- 「存在」档仍为 demo 展示，不实删单位。

---

## 9. 第四轮改动记录（轮盘 + 老虎机上桌，主理人执行）

### 9.1 改动清单（2026-10-23）
| 文件 | 改动 |
|---|---|
| src/js/roulette.js | **新增**。欧式单零轮盘内核（纯逻辑）：0-36、红黑各 18；投注区 straight 35:1 / 红黑奇偶大小 1:1 / dozen 2:1 / col 2:1；0 落袋外围全灭只赢直号 0；`settleBets` 返回明细与净额；理论 RTP 36/37 |
| src/js/slots.js | **新增**。3 卷轴单线老虎机内核（纯逻辑）：6 符号加权（樱桃 28/柠檬 24/铃铛 19/宝石 14/星星 9/幸运七 6）；三连按赔付表；星星/幸运七**散对**（任意两位，不叠加）；`theoreticalRTP()` closed-form + 216 组合枚举互验 |
| src/js/casino.js | 新增 `applyOutcome(s, tier, net, now)`：三游戏通用入账（资源/胜负统计/连输 5 局「完成」debuff），demo 档不动资源 |
| src/js/ui.js | 赌场重构：game-tabs 可点击切换（bj/roulette/slots）；`renderRoulette`（37 号码格+打数/列/外围+筹码 10/50/100+清空+旋转）；`renderSlots`（3 卷轴+赔付表+历史+拉杆）；**结果分槽** `casino.res.{bj,roulette,slots}`（修文案串台）；onClick 增 game-tab/chip-select/rl-bet/rl-clear/rl-spin/sl-spin；资金不足时状态行说明原因 |
| src/index.html | 引入 roulette.js / slots.js（blackjack.js 后） |
| src/css/style.css | 追加轮盘桌/筹码徽标/老虎机卷轴/赔付表样式；**作用域限定** `.rl-side #casino-result` 等（避免覆盖二十一点既有 win 绿色 #4a7a5a——三个游戏胜负配色统一） |
| src/tests/run_casino_games_tests.js | **新增**：72 断言（轮盘规则/结算/216 枚举/RTP/applyOutcome/debuff） |
| src/tests/run_ui_smoke.js | bundle 加两内核；赌场段后新增轮盘/老虎机两大段（49→75 断言） |
| src/tests/cdp_casino_games.js | **新增**：CDP 真实 Edge 全点击流 39 项 |

### 9.2 测试期间发现并修复的问题
1. **老虎机理论 RTP 漏算本金返还（最重要）**：赔付表按「净赔倍数」设计，理论公式却只算 p³×pay3，表面 96.26% **实际 104.1%**（赌场倒贴 4%，资源经济会崩）。由蒙特卡洛实测抓出 → 公式改 p³×(pay3+1)，赔付表下调（樱桃 5→4、星星对 8→5、幸运七 300→400 对 15→14），**实测 RTP 96.43%**。
2. **测试 LCG 精度丢失**：`seed*1103515245` 乘积超 2^53，浮点舍入使随机数有偏（稀有高赔放大偏差，押红 RTP 假性 98.6%）→ 换 mulberry32（Math.imul 32 位安全）。
3. **17 是黑号**：欧洲轮盘红色号码不含 17——内核正确，是我测试预期写错（改押 19 验证红号路径）。
4. **res 分槽键名与页签 id 不一致**：键写 bj/rl/sl，页签 id 是 bj/roulette/slots → `res[this.casino.game]` 取空崩溃（渲染分发用 if 所以没暴露）→ 统一为页签 id。
5. **连败极点写 2 条赌局记录**：负局 +1、「完成」cruel 文案 +1 → 断言改为按 `lossStreak+1>=5` 精确预测 +1/+2。
6. **CSS 覆盖回归**：追加的通用 `#casino-result.win` 把二十一点的 win 绿改成金色 → 作用域限定到 .rl-side/.sl-wrap，三游戏配色统一。
7. **UX 缺陷（真实发现）**：轮盘资金不足时旋转钮直接禁用、无任何解释 → 状态行显示「描述不足：已押 X，持有 Y」。
8. **CDP 计数器用绝对值**：前段轮盘已入账，老虎机段 log/rounds 断言改相对值。

### 9.3 赌场三游戏数值终态
| 游戏 | 理论/实测 RTP | 庄家优势 | 验证方式 |
|---|---|---|---|
| 二十一点 | 94.36% | 5.64% | 20 万局蒙特卡洛（简化基本策略） |
| 轮盘 | 97.30%（36/37） | 2.70% | 20 万局蒙特卡洛押红 + 0 号频率 |
| 老虎机 | 96.43% | 3.57% | closed-form + 216 组合精确枚举 + 100 万局蒙特卡洛 |

### 9.4 自测结果（本轮，如实）
- `node src/tests/run_casino_games_tests.js`：**72/72 通过**，连跑 10 次 0 失败
- `node src/tests/run_blackjack_tests.js`：27/27（庄家优势 5.64%）
- `node src/tests/run_node_tests.js`：66/66
- `node src/tests/run_ui_smoke.js`：**75/75 通过**，连跑 **50 轮 0 失败**
- `node src/tests/cdp_casino_games.js`（无头 Edge CDP，真实 .click()）：**39/39 通过**，连跑 5 次 0 失败——覆盖 tabs 切换/投注桌 37+12 注区/筹码累计徽标/落袋渲染与配色/按内核公式入账/资金不足禁用+状态行说明/demo 档/3 卷轴渲染/赔付表/连拉 5 杆自洽/截图
- `node src/tests/cdp_blackjack_ui.js`：38/38 ×2（CSS 作用域修复后回归无损）
- `node src/tests/cdp_retest.js`：20/20
- 截图：Temp/rl_table.png（轮盘投注桌）、sl_machine.png（老虎机+历史条含三连 win）人工复核通过

### 9.5 已知边界（demo 期明确不做）
- 轮盘：分注（split/street/corner 等邻注）未实现；渐进式（call bets）未做。
- 老虎机：单线赔付（多线/Scatter 免费游戏未做）；卷轴停止动画为结果直出+CSS 弹跳。
- 骰宝/百家乐/Keno/德州仍为规划（docs/casino_design.md）。
- 事件系统（客人闹事/陪玩）未开工。

---

## 10. 第三批：骰宝 + 百家乐 + 事件系统（2026-10-23～24）

用户指令「赌场做完再找我」→ 五游戏 + 事件系统全部落地。原则沿用：内核先行（node 测试）→ UI 上桌（smoke）→ 真实浏览器 CDP 全点击流。

### 10.1 改动清单
| 文件 | 改动 |
|---|---|
| `src/js/sicbo.js` | 新建（约 113 行）：骰宝内核。39 个注区（2 大小+14 点数+6 单骰+6 对子+6 围骰+5 组合）；`rollDice/evalBet/settle/AREAS/areaOf/isTriple/countOf` |
| `src/js/baccarat.js` | 新建：百家乐内核。8 副靴、312 张重洗、标准补牌表、庄赢 5% 抽佣、和局退注、例牌 8/9；`newShoe/draw/dealRound/settleBet/settleBets/BETS` |
| `src/js/events.js` | 新建：事件系统。6 事件池（5 个纯 NPC 闹事 + Eidos 陪玩钩子，用户边界：OC 角色不做闹事背景板）；`maybeTrigger/applyChoice/bondsGet/bondsAdd/debtActive` |
| `src/js/state.js` | 新增 `eventDebuffUntil`（讨债 debuff）、`nextFreeRound`（下局免费 buff）、`bonds:{eidos:0}`、`lastEventRound/lastEventIds`（间隔与防重复） |
| `src/js/ui.js` | +约 400 行：tabs 5 个；`renderSicbo/renderBaccarat`、`sbBet/sbClear/sbRoll`、`bcBet/bcClear/bcDeal`（shoe 跨局连续）、事件弹窗 `afterRound/modalEvent/onEventChoice`；res 分槽加 sicbo/baccarat |
| `src/index.html` | 引入三内核（曾误致 roulette/slots 重复引入，已删） |
| `src/css/style.css` | +约 120 行：`.sb-*`（落袋三骰/点数格/大小宽钮/围骰金边）、`.bc-*`（双方手牌/路单 bead/三注区） |
| `src/tests/run_sicbo_baccarat_tests.js` | 新建 60 断言：骰宝 216 组合精确枚举（EV 断言 9 条）+ MC；百家乐补牌表逐格+固定牌堆+结算数学+5 seed 扫描 |
| `src/tests/run_events_tests.js` | 新建 30 断言：池结构/触发机制/各选项后果/4000 局可达性 MC |
| `src/tests/run_ui_smoke.js` | 扩到 100 断言：骰宝/百家乐/事件三段 |
| `src/tests/cdp_sicbo_baccarat.js` | 新建 31 项：真实 Edge 全点击流+截图 |
| `src/tests/cdp_blackjack_ui.js` | tabs 断言 3→5 |

### 10.2 测试期发现并修复的问题（本次最有价值的沉淀）
1. **百家乐两个真 bug + 一条记反的规则**（全部由 MC vs 教科书数据交叉抓出）：
   - `pt===6` 分支写在 `if(pt<=5)` 内永不可达；庄 0-2 在「闲家已补」时落入函数尾 return false，恒补失效 → 庄胜率掉到 45.3%（教科书 45.87%）；
   - **banker 5 规则记反**：我记成「闲三 4-7 停牌」，标准是「闲三 4-7 **补**」。用无限靴精确枚举（13 rank 等权、分支按补牌张数归一）修正后 45.84/44.61 吻合教科书 45.87/44.63。
2. **枚举器权重 bug**：庄补分支超权 13 倍 → 假值 43.87%；每起手组合总权重归一为 1 后与 MC 吻合。
3. **对比基准自身算错（教训）**：误把「单方例牌率 19%」当「双方至少一方」（实际 34.4%）、闲补率拿全局 62% 对比条件概率 76%——两次都差点误判内核有 bug。**先验证基准再怪代码。**
4. **fixedShoe 被自动重洗冲掉**：4 张测试牌堆 <312 触发重洗 → draw 加 `!shoe.fixed` 检查。
5. **骰宝赔率设计错误（老虎机 RTP 教训重演）**：specific 注用传统整数赔率 → MC 实测 EV -33%/-58%/-8%（远超 1%-6% 数值锚）→ 按 216 组合精确枚举反解 `x = 207.36/n − 1`（允许 .5/.75 档，同 21 点 3:2），全部注型抽水收敛到 1.6%-4.2%。
6. **JSON 深拷贝丢函数**：maybeTrigger 用 JSON 序列化浅拷贝事件，`choices.run` 丢失 → applyChoice 崩溃 → 改浅拷贝。
7. **测试 PRNG `freq[total]++` 首轮 undefined++ → NaN** → `(freq[k]\|\|0)+1`。
8. **冒烟 50 轮暴露 2 个随机性 bug**：骰宝结果文案是「落袋 2 1 2（5 点）」格式，断言找「落袋 5」永败；情绪档 bj 断言没考虑「开局极点撞庄家极点 → push 退注 +0」——探针循环 500 次抓到 ob=true/outcome=push/delta=0/mood=90 是正确行为。
9. **CDP 断言口径 3 连修**：disabled 按钮 .click() 不派发事件（浏览器行为）→ 改断言 disabled+历史不变；事件选项后果白名单不全（cheater 围观/midnight 离场/drunk 叫保安扣 mood）→ 改 desc/mood/bonds 任一变化+纯叙事白名单；event_modal 截图时机在点击后（弹窗已关）→ 移到选择前。
10. **方法论沉淀**：① 216/13-rank **精确枚举**是赔率表自洽的硬证明（无随机误差），MC 作辅证；② 206:1 高倍注的 EV 波动被频率放大 207 倍（σ≈3%@216k 局），MC 断言必须验频率而非 EV；③ CDP 测试页置空 `DG.state.tick` 精确记账、file:// 域 localStorage 跨次泄漏须先置空 save 再 clear。
11. **展示赔率与结算常量漂移（完工前人工复核截图抓出）**：赔率表从传统整数档（对子 5:1/围骰 150:1/单骰三次 3:1）重调为公平档（13:1/206:1/12:1）时，`sicbo.js` 的 AREAS 展示标签是硬编码字符串没跟着改——桌面显示 5:1 内核却按 13:1 结算（玩家看得莫名、文案失信）。测试没抓到是因为没有断言比对展示与结算。修复：标签全部从常量派生（`PAIR_PAY + ':1'` 等），并加防复发断言「每个注区扫 216 组合收集实际倍数集合 = note 里 X:1 集合」。教训：**重调数值表时必须同步展示层，且展示层要从同一常量派生**。

### 10.3 赌场五游戏数值终态
| 游戏 | 理论/实测 RTP | 庄家优势 | 验证方式 |
|---|---|---|---|
| 二十一点 | 94.36% | 5.64% | 20 万局蒙特卡洛（简化基本策略） |
| 轮盘 | 97.30%（36/37） | 2.70% | 20 万局 MC 押红 + 0 号频率 |
| 老虎机 | 96.43% | 3.57% | closed-form + 216 组合精确枚举 + 100 万局 MC |
| 骰宝 | 95.8%–98.4%（分注型） | 1.6%–4.2% | 216 组合精确枚举 + MC |
| 百家乐 | 押庄 98.94% | 1.06% | 无限靴精确枚举（庄 45.84/闲 44.61/和 9.54）+ 5 seed MC |

骰宝赔率表（Eidos 公平化，`x = 207.36/n − 1`）：大/小 1:1（-2.78%）、点数 68/34/20/13/9/7.5/6.75:1、单骰 1/2/12:1（-3.70%）、对子 13:1、围骰 206:1（-4.17%）、组合 6:1（-2.78%）。

### 10.4 事件系统终态
- 6 事件池：输光的赌徒 / 出千者 / 醉汉砸场 / 催债人上门 / 午夜不对劲（氛围，无 NPC）/ Eidos 陪玩（cond `bonds.eidos>=2`）
- 触发：每局结算后判定，间隔 ≥4 局，基础 22%，连败≥2 ×1.5，Eidos 关系≥2 ×1.2，讨债 debuff 中防连锁
- 后果类型全实现：资源± / 关系±（bonds.eidos）/ debuff（讨债人常驻 2 分钟，与 completedUntil 同机制产出减半）/ buff（nextFreeRound 下局免费）/ rng 判定 / 纯叙事
- 防重复：`lastEventRound` + `lastEventIds`（RECENT=3）

### 10.5 自测结果（本轮，如实）
- `node src/tests/run_sicbo_baccarat_tests.js`：**62/62**（含 2 条展示=结算防漂移断言）
- `node src/tests/run_events_tests.js`：**30/30**
- `node src/tests/run_casino_games_tests.js`：72/72（回归无损）
- `node src/tests/run_blackjack_tests.js`：27/27（回归无损）
- `node src/tests/run_node_tests.js`：66/66
- `node src/tests/run_ui_smoke.js`：**100/100 通过，连跑 50+10 轮 0 失败**
- `node src/tests/cdp_sicbo_baccarat.js`（无头 Edge CDP，真实 .click()）：**31/31 通过**——覆盖 39 注区渲染/下注徽标/投掷记账/资金不足禁用/demo 档/三注区+4 暗牌/押注+开牌记账/shoe 跨局递减/事件循环弹窗+选项后果
- `node src/tests/cdp_blackjack_ui.js`：38/38（回归无损）
- `node src/tests/cdp_casino_games.js`：39/39（回归无损）
- `node src/tests/cdp_retest.js`：20/20
- 截图人工复核：sb_table.png（点数赔率梯度 68:1→6.75:1、单骰 1/2/12、对子 13:1、围骰 206:1）、bc_table.png（闲/庄抽佣/和三注区+筹码）、event_modal.png（「输光的赌徒」事件+垫付/赶出去/Eidos 处置选项）
- ⚠️ CDP 运行环境注意：项目无本地 node_modules，`ws` 走托管 Node 工作区，须 `NODE_PATH=C:/Users/33633/.workbuddy/binaries/node/workspace/node_modules`；Edge 需以 `--headless=new --remote-debugging-port=9229` 后台常驻（普通 `&` 会随 shell 退出被回收，要用后台任务方式启动）

### 10.6 已知边界（demo 期明确不做）
- 轮盘：分注（split/street/corner 等邻注）未实现；渐进式（call bets）未做。
- 老虎机：单线赔付（多线/Scatter 免费游戏未做）。
- 骰宝：组合注仅相邻 5 对；围骰全中即赢不再细分同花/单骰关联。
- 百家乐：无 side bets（对子/龙宝等）；shoe 可视化只有 bead 路单，无大路/珠盘路衍生。
- 事件：特殊规则局（Eidos 看暗牌/赌注翻倍）留 UI 层后续；闹事事件池首期 6 个。
- Keno / 德州扑克仍为 💡 储备（docs/casino_design.md）。

## 11. 二十一点分牌（2026-10-29）

### 11.1 规则
- 首两张同点（点数相同即可，10/J/Q/K 互认）可分成两手，各补一张，各按一份底注结算。
- 只允许分一次（`fromSplit` 锁）；存在档（demo）不可分牌。
- 分牌后先打第一手，爆牌或停牌即切第二手，两手打完才进庄家回合。
- 分牌后的 21 按普通胜 1:1 结算，不再吃自然极点 3:2；加倍后的 21 同样只算 1:1。

### 11.2 实现
- `blackjack.js`：新增 `canSplit` / `split` / `nextHand` / `settleHand`；`hit` / `stand` / `doubleDown` 支持多手推进；`settle` 改为逐手结算后汇总（`st.handResults`、`payoutDesc` 分注到手）。
- 修掉一个旧账：结算里 `d` 是 handValue 对象，比较写成 `p.total < d` 会把对象转成 NaN，一律改为 `d.total`。
- `ui.js`：玩家区标题带「第 N 手」，操作行新增「分牌」按钮（按 `canSplit` 置灰），`bj-split` 分支与 `bjSplit` 处理。
- 测试：`run_blackjack_tests.js` 新增 9 条分牌断言（可分组/不可分组/扣注/切手/合计/文案/1:1 赔付）。

### 11.3 本轮自测
- `node src/tests/run_blackjack_tests.js`：**38/38**（庄家优势 5.64% 不变）
- `node src/tests/run_node_tests.js`：66/66
- `node src/tests/run_casino_games_tests.js`：72/72
- `node src/tests/run_events_tests.js`：30/30
- `node src/tests/run_sicbo_baccarat_tests.js`：62/62
- `node src/tests/run_ui_smoke.js`：100/100
- 未跑：CDP 三套（需要常驻无头 Edge），分牌按钮的 UI 实点验证留到下次真机。

## 12. 营业日一期（店主视角，2026-10-29）

### 12.1 决策
按 owner_design.md 的推荐取了 **一期 A（最小转换）**，并对两处悬而未决自己拍了板：
- **玩家身份取 A**：受 Eidos 托付的代理店主。这样「口碑／客流」有主体，也给整局一个去处（把场子撑到赎回自己），不必另造货币。
- **营收继续走 desc / mood**，不引新货币。

### 12.2 实现
- 新增 `src/js/house.js`：`ensure` / `recordRound` / `closeDay` / `nextDay` / `repAdd`，一日固定 8 局。
- `state.js`：`createInitial` 加 `casino2 { phase, day, rounds, reputation, perTable, ledger }`，旧档由 migrate 的默认补全兜住。
- `ui.js`：赌场顶部「营业日条」（第 N 日 · 营业 x/8 · 口碑），打烊面板（账本表 + 口碑变化 + 开门营业）；五张赌桌结算后调 `houseAfter(table, net)` 记账，满 8 局自动打烊并收起牌桌。
- 口碑规则：打满当日 +1；当日净正再 +1、净负 -1，合计夹在 ±2；0–100 封边。账本留最近 30 日。
- `index.html` 引入 house.js；`style.css` 加营业日条与账本的样式。

### 12.3 自测
- `run_house_tests.js`（新增）：19/19
- `run_node_tests` 66/66、`run_casino_games_tests` 72/72、`run_blackjack_tests` 38/38、`run_events_tests` 30/30、`run_sicbo_baccarat_tests` 62/62、`run_ui_smoke` 100/100
- 冒烟测试的 `click()` 加了「打烊自动替玩家点击开门」的兜底，否则跨日用例会看不到牌桌。

### 12.4 下一步（二期候选）
- 客流参数闭环（口碑 → 客流 → 营收），三数联动的 MC 自洽验证。
- 赔率调配：以 Eidos 公平赔率为基准加 0–8% 抽水，抽水换营收、掉口碑。
- 设施耐久：醉汉砸场打耐久，坏桌当日歇业。
